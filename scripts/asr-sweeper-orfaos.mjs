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
 */
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";

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

function resolveConfig() {
  const endpoint = process.env.ASR_S3_ENDPOINT;
  const accessKeyId = process.env.ASR_S3_ACCESS_KEY;
  const secretAccessKey = process.env.ASR_S3_SECRET_KEY;
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
  { agora = new Date(), limiteHoras, dryRun = false } = {},
) {
  let continuationToken;
  let inspecionados = 0;
  let apagados = 0;

  do {
    const pagina = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    for (const objeto of pagina.Contents ?? []) {
      inspecionados += 1;
      if (!objeto.Key || !objeto.LastModified) continue;
      if (!objetoExpirado(objeto.LastModified, agora, limiteHoras)) continue;

      if (dryRun) {
        log(
          `[dry-run] expirado (NÃO apagado): ${objeto.Key} ` +
            `(mtime=${objeto.LastModified.toISOString()})`,
        );
        apagados += 1;
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
    `varredura concluída: ${inspecionados} objeto(s) inspecionado(s), ` +
      `${apagados} apagado(s) (limite=${limiteHoras}h${dryRun ? ", dry-run" : ""}).`,
  );

  return { inspecionados, apagados };
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
  try {
    await varrer(client, config.bucket, {
      limiteHoras: config.limiteHoras,
      dryRun,
    });
  } finally {
    client.destroy();
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
