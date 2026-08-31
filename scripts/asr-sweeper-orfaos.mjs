/**
 * Sweeper de objetos ÓRFÃOS do bucket efêmero de ASR (#72/T15).
 *
 * POR QUE ISTO EXISTE: `src/lib/asr/storage.ts` (T04) grava o áudio recebido
 * no bucket efêmero e o worker de transcrição (T07) apaga o objeto no
 * `finally` do processamento, em condições normais. Este script é o BACKSTOP
 * para quando o container do worker morre ANTES do `finally` rodar (OOM,
 * kill -9, crash do provider de ASR) — o objeto fica órfão no bucket para
 * sempre, sem ninguém para apagá-lo. Isto NÃO é retenção/LGPD (ver
 * infra/retencao/agendador.sh) — é limpeza de vazamento de um bucket de
 * TRABALHO efêmero, não de arquivo/prontuário.
 *
 * IDADE NÃO BASTA (revisão final de integração #72): um objeto velho pode ser
 * de um clipe legitimamente `na_fila`, esperando um worker que não rodou (fila
 * represada, agendador parado). Apagá-lo queimaria as 3 tentativas do clipe
 * por motivo puramente operacional. Por isso, ANTES de apagar um candidato já
 * vencido, o script pergunta ao banco (`app_asr_objetos_em_uso`, migração
 * 0138) quais chaves ainda estão reivindicadas por uma linha
 * `na_fila`/`transcrevendo` — essas são puladas. Só apaga o que ninguém
 * reivindica (órfão de verdade) ou cuja linha já está em estado terminal
 * (`transcrito`/`falhou`: vazamento que T07 deveria ter limpado).
 *
 * COMO A IDADE É MEDIDA: pelo `LastModified` que o S3/MinIO devolve no
 * `ListObjectsV2` — o mtime real de quando o objeto foi ESCRITO no bucket.
 * NUNCA pelo nome/chave do objeto: um objeto com nome antigo re-subido agora
 * tem `LastModified` de agora e não deve vencer (memória do repo
 * "auditar-por-nome-apagar-por-mtime", que já pegou esse erro em
 * infra/backup/expurgo-offsite.sh).
 *
 * BUCKET VAZIO NÃO É ERRO aqui — ao contrário da auditoria off-site
 * (infra/backup/expurgo-offsite.sh), onde um bucket vazio é suspeito porque
 * aquele bucket É a prova de recuperação de desastre. Este é só uma fila de
 * trabalho: vazio é o estado normal e esperado na maior parte do tempo, já
 * que T07 limpa no caminho feliz.
 *
 * `.mjs` de node puro, sem build — mesmo motivo do
 * `scripts/retencao-aviso-previo.mjs`: roda num contexto de deploy enxuto.
 * Não importa `src/lib/asr/storage.ts` (que tem `import "server-only"` e é
 * pensado para o runtime do Next) — a config de S3 é resolvida aqui, das
 * MESMAS variáveis de ambiente, para este script rodar isolado do app.
 *
 *   node scripts/asr-sweeper-orfaos.mjs             # uma varredura (default)
 *   node scripts/asr-sweeper-orfaos.mjs --once      # idem, explícito
 *   node scripts/asr-sweeper-orfaos.mjs --dry-run   # lista os expirados, não apaga
 *
 * Env (mesmas de src/lib/asr/storage.ts, T04):
 *   ASR_S3_ENDPOINT, ASR_S3_ACCESS_KEY, ASR_S3_SECRET_KEY   obrigatórias.
 *   ASR_S3_BUCKET               default iris-asr-efemero.
 *   ASR_S3_REGION               default us-east-1.
 *   ASR_SWEEPER_LIMITE_HORAS    default 6 (a janela do backstop, brief T15).
 *   ASR_SWEEPER_DATABASE_URL    OBRIGATÓRIA. Role de login membro de
 *                               `app_role` (é a quem a 0138 concede EXECUTE).
 *                               Ausente → o script recusa rodar, em vez de
 *                               apagar por idade sem saber o que está em uso.
 */
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const LIMITE_HORAS_DEFAULT = 6;

function log(msg) {
  console.log(`[asr-sweeper] ${new Date().toISOString()} ${msg}`);
}

/**
 * O PREDICADO — isolado e puro, exatamente o que o teste unitário cobre sem
 * precisar de bucket real (ver scripts/asr-sweeper-orfaos.test.mjs). Objeto
 * "expirado" quando sua idade (mtime até `agora`) excede a janela.
 * Estritamente maior — não maior-ou-igual — para não apagar um objeto
 * exatamente na borda enquanto um worker ainda pode estar processando.
 */
export function objetoExpirado(lastModified, agora, limiteHoras) {
  const idadeMs = agora.getTime() - lastModified.getTime();
  const limiteMs = limiteHoras * 60 * 60 * 1000;
  return idadeMs > limiteMs;
}

/**
 * Fábrica da consulta "quais destas chaves ainda estão em uso" — a checagem de
 * ESTADO que separa órfão de trabalho em andamento (revisão final de
 * integração #72). Devolve uma função injetável em `varrer`, para o teste
 * unitário poder responder sem Postgres real.
 *
 * A pergunta vai para `app_asr_objetos_em_uso` (SECURITY DEFINER, migração
 * 0138) e não para um `SELECT` direto em `audio_capture`: a tabela tem FORCE
 * RLS com policies `TO app_role` resolvidas por `app_clinic_id_exigido()`, e
 * este script não tem usuário logado nem `app.clinic_id`. Consultar a tabela
 * crua devolveria ZERO LINHAS SEM ERRO — e zero linhas aqui significa "nada
 * em uso, pode apagar tudo" (memória `grant-sem-policy-nega-tudo-em-silencio`,
 * na direção mais perigosa possível).
 */
export function criarConsultaEmUso(sql) {
  return async (chaves) => {
    if (chaves.length === 0) return new Set();
    // `${chaves}` cru, sem `sql.array(...)` e sem `::text[]`: MEDIDO contra o
    // Postgres local, essa combinação estoura `22P02 malformed array literal`
    // (o cast explícito faz o driver mandar o array já achatado em texto). O
    // array JS puro o postgres.js serializa como `text[]` de verdade.
    const linhas = await sql`
      SELECT ref FROM app_asr_objetos_em_uso(${chaves})`;
    return new Set(linhas.map((l) => l.ref));
  };
}

function resolveConfig() {
  const endpoint = process.env.ASR_S3_ENDPOINT;
  const accessKeyId = process.env.ASR_S3_ACCESS_KEY;
  const secretAccessKey = process.env.ASR_S3_SECRET_KEY;
  const databaseUrl = process.env.ASR_SWEEPER_DATABASE_URL;
  const bucket = process.env.ASR_S3_BUCKET ?? "iris-asr-efemero";
  const region = process.env.ASR_S3_REGION ?? "us-east-1";
  const limiteHoras = Number(
    process.env.ASR_SWEEPER_LIMITE_HORAS ?? LIMITE_HORAS_DEFAULT,
  );

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "sweeper ASR não configurado (ASR_S3_ENDPOINT/ASR_S3_ACCESS_KEY/ASR_S3_SECRET_KEY ausentes)",
    );
  }
  // Sem banco o sweeper não roda: ele não teria como distinguir órfão de clipe
  // ainda `na_fila` e apagaria áudio em uso. Recusar é a única falha segura.
  if (!databaseUrl) {
    throw new Error(
      "ASR_SWEEPER_DATABASE_URL ausente — sem ela o sweeper não consegue checar quais objetos ainda estão em uso e apagaria áudio de clipes na fila.",
    );
  }
  if (!Number.isFinite(limiteHoras) || limiteHoras <= 0) {
    throw new Error(
      `ASR_SWEEPER_LIMITE_HORAS precisa ser número positivo, recebido: '${process.env.ASR_SWEEPER_LIMITE_HORAS}'.`,
    );
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
    limiteHoras,
    databaseUrl,
  };
}

function buildClient({ endpoint, accessKeyId, secretAccessKey, region }) {
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true, // obrigatório para MinIO self-hosted — mesma nota de storage.ts
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Uma varredura completa, paginada (`ListObjectsV2` devolve no máximo 1000
 * itens por página). `client` recebe qualquer objeto com `.send()` compatível
 * — o teste unitário injeta um fake, sem MinIO real.
 */
export async function varrer(
  client,
  bucket,
  { agora = new Date(), limiteHoras, dryRun = false, refsEmUso } = {},
) {
  // Fail-closed: sem a checagem de estado o sweeper decidiria só por idade e
  // apagaria o áudio de um clipe legitimamente `na_fila` sempre que a fila
  // represasse (ou o agendador ficasse parado) por mais que a janela.
  if (typeof refsEmUso !== "function") {
    throw new Error(
      "varrer exige `refsEmUso` — a idade sozinha não distingue órfão de clipe ainda na fila.",
    );
  }

  let continuationToken;
  let inspecionados = 0;
  let apagados = 0;
  // Separado de `apagados`: dry-run nunca chama DeleteObject, então contar
  // como "apagado" mentiria no resumo (:L~250) sobre uma varredura que não
  // tocou o bucket. Memória do repo `dry-run-por-lote-quebra-o-dedup` —
  // mesma família de defeito, contador que representa uma ação que não
  // aconteceu.
  let seriamApagados = 0;
  let emUso = 0;

  do {
    const pagina = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    const conteudo = pagina.Contents ?? [];
    inspecionados += conteudo.length;

    // Candidatos: só os que já passaram da janela. O predicado de idade
    // continua sendo o mtime (`LastModified`) e nada mais — a checagem de
    // estado ENTRA depois dele, não no lugar dele.
    const candidatos = conteudo.filter(
      (o) =>
        o.Key &&
        o.LastModified &&
        objetoExpirado(o.LastModified, agora, limiteHoras),
    );

    // Uma consulta por página, não uma por objeto.
    const reivindicados = await refsEmUso(candidatos.map((o) => o.Key));

    for (const objeto of candidatos) {
      // Linha ainda `na_fila`/`transcrevendo`: NÃO é órfão, é trabalho
      // pendente que a próxima reserva vai ler. Não apaga e não conta como
      // apagado — só objeto que ninguém reivindica (órfão de verdade) ou cuja
      // linha já está em estado terminal (vazamento que T07 deixou para trás)
      // é lixo.
      if (reivindicados.has(objeto.Key)) {
        emUso += 1;
        log(
          `preservado (ainda em uso: na_fila/transcrevendo): ${objeto.Key} ` +
            `(mtime=${objeto.LastModified.toISOString()})`,
        );
        continue;
      }

      if (dryRun) {
        log(
          `[dry-run] expirado (NÃO apagado): ${objeto.Key} ` +
            `(mtime=${objeto.LastModified.toISOString()})`,
        );
        seriamApagados += 1;
        continue;
      }

      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objeto.Key }),
      );
      apagados += 1;
      log(`apagado (órfão, idade > ${limiteHoras}h): ${objeto.Key}`);
    }

    continuationToken = pagina.IsTruncated
      ? pagina.NextContinuationToken
      : undefined;
  } while (continuationToken);

  log(
    dryRun
      ? `varredura concluída: ${inspecionados} objeto(s) inspecionado(s), ` +
          `${seriamApagados} seria(m) apagado(s), ${emUso} preservado(s) por ` +
          `ainda estar(em) em uso (limite=${limiteHoras}h, dry-run — nada foi apagado).`
      : `varredura concluída: ${inspecionados} objeto(s) inspecionado(s), ` +
          `${apagados} apagado(s), ${emUso} preservado(s) por ainda estar(em) em uso ` +
          `(limite=${limiteHoras}h).`,
  );

  return {
    inspecionados,
    apagados: dryRun ? 0 : apagados,
    seriamApagados,
    emUso,
  };
}

export async function main(args = process.argv.slice(2)) {
  const dryRun = args.includes("--dry-run");
  const desconhecidos = args.filter((a) => a !== "--once" && a !== "--dry-run");
  if (desconhecidos.length > 0) {
    throw new Error(
      `argumento não reconhecido: ${desconhecidos.join(" ")} — use --once e/ou --dry-run.`,
    );
  }

  const config = resolveConfig();
  const client = buildClient(config);
  const sql = postgres(config.databaseUrl, { max: 1 });
  try {
    await varrer(client, config.bucket, {
      limiteHoras: config.limiteHoras,
      dryRun,
      refsEmUso: criarConsultaEmUso(sql),
    });
  } finally {
    client.destroy();
    await sql.end();
  }
}

// Guarda de execução: só roda `main()` quando o arquivo é invocado
// diretamente, não quando importado pelo teste. `pathToFileURL` (não
// `file://${argv[1]}` cru) — mesma nota de retencao-aviso-previo.mjs: o Node
// não absolutiza argv[1] e a comparação crua falha com caminho relativo ou no
// Windows (barra invertida).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error("[asr-sweeper] FALHA na varredura de órfãos:");
    console.error(err);
    process.exit(1);
  });
}
