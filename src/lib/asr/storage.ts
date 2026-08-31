import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Storage efêmero dedicado do ditado de voz (ASR, #72/T04).
//
// Bucket SEPARADO dos de backup (`S3_BACKUP_BUCKET`) e off-site
// (`OFFSITE_S3_*`) — credencial própria, sem overlap de escopo. Ciclo:
// escrito por `enviarLoteAsr` (T09), lido pelo worker (T07), apagado no
// `finally` do processamento — nunca fica retido (ver design.md do #72).
//
// Região explícita: memória do repo "Dublê não cobre dialeto do destino" —
// o `mc` (backup) assina `us-east-1` sem `MC_REGION` explícito por padrão
// silencioso da lib. Aqui a região é lida de env, com fallback documentado
// abaixo, nunca herdada implicitamente do SDK.
const ASR_S3_REGION_DEFAULT = "us-east-1";

function resolveConfig() {
  const endpoint = process.env.ASR_S3_ENDPOINT;
  const accessKeyId = process.env.ASR_S3_ACCESS_KEY;
  const secretAccessKey = process.env.ASR_S3_SECRET_KEY;
  const bucket = process.env.ASR_S3_BUCKET ?? "iris-asr-efemero";
  const region = process.env.ASR_S3_REGION ?? ASR_S3_REGION_DEFAULT;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "storage ASR não configurado (ASR_S3_ENDPOINT/ASR_S3_ACCESS_KEY/ASR_S3_SECRET_KEY ausentes)",
    );
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket, region };
}

// Checado em tempo de CHAMADA (não em module-load) — mesma convenção de
// `src/lib/email/resend.ts` / `src/lib/extraction/provider.ts`, pra testes
// poderem flipar o env livremente sem reimportar o módulo.
function buildClient(): { client: S3Client; bucket: string } {
  const { endpoint, accessKeyId, secretAccessKey, bucket, region } =
    resolveConfig();

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true, // obrigatório para MinIO self-hosted
    credentials: { accessKeyId, secretAccessKey },
    // Versões recentes do SDK v3 passaram a anexar checksum (CRC32) por
    // padrão em mais operações — MinIO (medido: RELEASE.2025-09-07) devolve
    // `400 InvalidRequest` para o `ListObjectsV2` resultante (visto em
    // produção ao provisionar #500). `WHEN_REQUIRED` volta ao comportamento
    // anterior: só manda checksum quando a operação exige. Sem isso o
    // sweeper (mesma config em scripts/asr-sweeper-orfaos.mjs) fica cego
    // para tudo que está no bucket e nunca varre nada.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return { client, bucket };
}

/**
 * Apaga da string qualquer ocorrência LITERAL das credenciais em env (#494,
 * T22).
 *
 * POR QUE ISTO É NECESSÁRIO: `mensagemSemSegredo` repassa `err.message`
 * verbatim, e o erro do SDK v3 embute a credencial — uma falha de assinatura
 * no MinIO volta com o cabeçalho `Authorization` inteiro na mensagem
 * (`Credential=<ACCESS_KEY>/2026.../s3/aws4_request`). Sem esta passada, a
 * chave atravessava o envelope e ia para o log do container, lido pelo painel
 * do Easypanel servido em HTTP puro (memória `easypanel-ambiente-expoe-
 * segredos`). Medido em `storage.test.ts`: com o erro realista, os três
 * caminhos (guardar/ler/apagar) vazavam.
 *
 * Piso de 8 caracteres: um valor curto (ou vazio) casaria com pedaço de
 * palavra comum e transformaria a mensagem em ruído — e um segredo de 7
 * caracteres já é um problema maior que este.
 */
function redigirCredenciais(texto: string): string {
  let saida = texto;
  for (const segredo of [
    process.env.ASR_S3_ACCESS_KEY,
    process.env.ASR_S3_SECRET_KEY,
  ]) {
    if (segredo && segredo.length >= 8) {
      saida = saida.split(segredo).join("[credencial redigida]");
    }
  }
  return saida;
}

/** Mensagem de erro sem vazar credenciais, sem afirmar causa que não se
 * conhece — reporta `Error.message` quando houver, senão o valor cru (ver
 * memória do repo "mensagem-de-erro-que-afirma-causa"). */
function mensagemSemSegredo(operacao: string, err: unknown): string {
  const detalhe = err instanceof Error ? err.message : String(err);
  return `storage ASR: falha ao ${operacao} (${redigirCredenciais(detalhe)})`;
}

export async function guardar(
  chave: string,
  dados: Uint8Array | Buffer,
  contentType?: string,
): Promise<void> {
  const { client, bucket } = buildClient();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: chave,
        Body: dados,
        ContentType: contentType,
      }),
    );
  } catch (err) {
    throw new Error(mensagemSemSegredo("guardar", err));
  }
}

export async function ler(chave: string): Promise<Uint8Array> {
  const { client, bucket } = buildClient();
  try {
    const resposta = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: chave }),
    );
    const corpo = resposta.Body;
    if (!corpo) {
      throw new Error("resposta sem corpo");
    }
    // SDK v3 no runtime Node expõe `transformToByteArray` nos tipos de
    // streaming (`Blob`/`ReadableStream`/`Readable` unificados).
    return await (
      corpo as unknown as { transformToByteArray(): Promise<Uint8Array> }
    ).transformToByteArray();
  } catch (err) {
    throw new Error(mensagemSemSegredo("ler", err));
  }
}

export async function apagar(chave: string): Promise<void> {
  const { client, bucket } = buildClient();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
  } catch (err) {
    throw new Error(mensagemSemSegredo("apagar", err));
  }
}
