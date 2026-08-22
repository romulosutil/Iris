/**
 * Lógica de Download Seguro do Acervo (#374 ∪ #353, Task T6).
 *
 * Princípios de segurança (D8):
 * 1. Exige sessão autenticada do responsável pela conta.
 * 2. Compara token fornecido via sha256 + timingSafeEqual contra token_hash.
 * 3. 404 genérico para token errado ou id inexistente (não vaza existência).
 * 4. 410 para bundle expirado (> 72h) ou blob expurgado.
 * 5. Emite audit_log 'exportacao_integral_download'.
 */
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import { sha256Hex } from "@/lib/report/hash";

export type ResultadoDownload =
  | {
      sucesso: true;
      bytes: Buffer;
      filename: string;
    }
  | {
      sucesso: false;
      statusHttp: 403 | 404 | 410;
      erro: string;
    };

/**
 * Executa o download de um bundle dentro do contexto de tenant do usuário.
 */
export async function baixarBundleAcervo(
  tx: Tx,
  params: {
    bundleId: string;
    token: string;
    userId: string;
    userRole: string;
  },
): Promise<ResultadoDownload> {
  const { bundleId, token, userId } = params;

  if (!token) {
    return {
      sucesso: false,
      statusHttp: 404,
      erro: "Exportação não encontrada.",
    };
  }

  // 1. Busca dados da clínica para checar responsabilidade (D1)
  const rowsClinic = (await tx.execute(sql`
    SELECT id, nome, responsavel_conta_id FROM clinic
  `)) as unknown as {
    id: string;
    nome: string;
    responsavel_conta_id: string | null;
  }[];

  if (!rowsClinic || rowsClinic.length === 0) {
    return {
      sucesso: false,
      statusHttp: 404,
      erro: "Clínica não encontrada.",
    };
  }

  const clinica = rowsClinic[0]!;
  if (
    clinica.responsavel_conta_id !== null &&
    clinica.responsavel_conta_id !== userId
  ) {
    return {
      sucesso: false,
      statusHttp: 403,
      erro: "Apenas o responsável pela conta pode efetuar o download do acervo.",
    };
  }

  // 2. Busca bundle sob RLS
  const rowsBundle = (await tx.execute(sql`
    SELECT id, clinic_id, status, expira_em, token_hash, bytes_tamanho, sha256, criado_em
      FROM export_bundle
     WHERE id = ${bundleId}
  `)) as unknown as {
    id: string;
    clinic_id: string;
    status: string;
    expira_em: Date | null;
    token_hash: string | null;
    bytes_tamanho: string | null;
    sha256: string | null;
    criado_em: Date;
  }[];

  if (!rowsBundle || rowsBundle.length === 0) {
    return {
      sucesso: false,
      statusHttp: 404,
      erro: "Exportação não encontrada.",
    };
  }

  const bundle = rowsBundle[0]!;

  // 3. Verifica se expirou (> 72h)
  const agora = new Date();
  if (
    bundle.status === "expirado" ||
    (bundle.expira_em && agora > new Date(bundle.expira_em))
  ) {
    return {
      sucesso: false,
      statusHttp: 410,
      erro: "Esta exportação expirou (limite de 72 horas). Por favor, solicite uma nova exportação.",
    };
  }

  if (bundle.status !== "pronto" || !bundle.token_hash) {
    return {
      sucesso: false,
      statusHttp: 404,
      erro: "Exportação não encontrada.",
    };
  }

  // 4. Validação segura do token (SHA-256 + timingSafeEqual)
  const hashCalculado = sha256Hex(Buffer.from(token));
  const a = Buffer.from(hashCalculado, "utf8");
  const b = Buffer.from(bundle.token_hash, "utf8");

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      sucesso: false,
      statusHttp: 404,
      erro: "Exportação não encontrada.",
    };
  }

  // 5. Busca blob binário
  const rowsBlob = (await tx.execute(sql`
    SELECT bytes FROM export_bundle_blob WHERE bundle_id = ${bundleId}
  `)) as unknown as { bytes: Buffer }[];

  if (!rowsBlob || rowsBlob.length === 0 || !rowsBlob[0]?.bytes) {
    return {
      sucesso: false,
      statusHttp: 410,
      erro: "O arquivo deste acervo já foi expurgado.",
    };
  }

  const bytes = Buffer.isBuffer(rowsBlob[0].bytes)
    ? rowsBlob[0].bytes
    : Buffer.from(rowsBlob[0].bytes);

  // 6. Grava evento de download no audit_log (ação 4)
  await tx.execute(sql`
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
    VALUES (
      ${bundle.clinic_id},
      ${userId},
      'exportacao_integral_download',
      'export_bundle',
      ${bundleId},
      ${JSON.stringify({ bytes: bundle.bytes_tamanho, sha256: bundle.sha256 })}::jsonb
    )
  `);

  const slug = clinica.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const dataStr = new Date().toISOString().slice(0, 10);
  const filename = `acervo-${slug || "clinica"}-${dataStr}.zip`;

  return {
    sucesso: true,
    bytes,
    filename,
  };
}
