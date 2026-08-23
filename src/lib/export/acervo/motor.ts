/**
 * Motor de Estado da Exportação Integral do Acervo (#374 ∪ #353, Task T4).
 *
 * Estados do ciclo de vida (D6):
 *   pendente -> processando -> pronto (72h) -> expirado
 *                           -> falhou (motivo nomeado)
 */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { authDb } from "@/db/client";
import { withTenant, type Tx } from "@/db/rls";
import { sha256Hex } from "@/lib/report/hash";
import { coletarAcervo } from "./coletor";
import { carregarGateResponsavel } from "./gate";
import { montarBundleZip } from "./bundle";

/**
 * Motivos de falha que podem ser persistidos. Qualquer outra coisa vira
 * `erro_interno` — ver o `catch` de `processarProximo`.
 */
export const MOTIVOS_FALHA = new Set([
  "bundle_excede_limite",
  "tentativas_esgotadas",
  "erro_interno",
]);

export class ExportacaoEmAndamentoError extends Error {
  constructor(
    message = "Já existe uma exportação em andamento para esta clínica.",
  ) {
    super(message);
    this.name = "ExportacaoEmAndamentoError";
  }
}

export class NaoAutorizadoExportacaoError extends Error {
  constructor(
    message = "Apenas o responsável pela conta pode solicitar a exportação integral.",
  ) {
    super(message);
    this.name = "NaoAutorizadoExportacaoError";
  }
}

export type ItemHistoricoExportacao = {
  id: string;
  status: "pendente" | "processando" | "pronto" | "falhou" | "expirado";
  solicitadoEm: Date;
  iniciadoEm: Date | null;
  concluidoEm: Date | null;
  expiraEm: Date | null;
  bytesTamanho: string | null;
  sha256: string | null;
  erro: string | null;
  podeBaixar: boolean;
};

/**
 * Solicita uma nova exportação do acervo da clínica.
 *
 * Valida o guard de responsável da conta (D1) e insere pendente sob RLS.
 */
export async function solicitarExportacao(
  clinicId: string,
  solicitanteId: string,
  solicitanteRole: string,
): Promise<{ bundleId: string; status: "pendente" }> {
  return withTenant(
    { clinicId, userId: solicitanteId, role: solicitanteRole as any },
    async (tx: Tx) => {
      // 1. Gate D1: Responsável da Conta (regra única — ./gate.ts)
      const gate = await carregarGateResponsavel(
        tx,
        clinicId,
        solicitanteId,
        solicitanteRole,
      );
      if (!gate.autorizado) {
        throw new NaoAutorizadoExportacaoError();
      }

      // 2. Insere bundle em status 'pendente'
      const bundleId = crypto.randomUUID();
      try {
        await tx.execute(sql`
          INSERT INTO export_bundle (id, clinic_id, solicitado_por, status)
          VALUES (${bundleId}, ${clinicId}, ${solicitanteId}, 'pendente')
        `);
      } catch (err: any) {
        // Trata erro de unique_violation (uq_export_bundle_ativo)
        if (
          err?.code === "23505" ||
          err?.message?.includes("uq_export_bundle_ativo")
        ) {
          throw new ExportacaoEmAndamentoError();
        }
        throw err;
      }

      // 3. Emite audit_log (ação 1)
      await tx.execute(sql`
        INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
        VALUES (
          ${clinicId},
          ${solicitanteId},
          'exportacao_integral_solicitada',
          'export_bundle',
          ${bundleId},
          ${JSON.stringify({ solicitado_por: solicitanteId })}::jsonb
        )
      `);

      return { bundleId, status: "pendente" };
    },
  );
}

/**
 * Processa o próximo bundle na fila (executado pelo job de background).
 */
export async function processarProximo(): Promise<{
  processado: boolean;
  bundleId?: string;
  status?: string;
  erro?: string;
  token?: string;
}> {
  // 1. Busca candidato elegível com lock
  const rows = (await authDb.execute(sql`
    SELECT id, clinic_id, solicitado_por, status, tentativas
      FROM export_bundle
     WHERE status = 'pendente'
        OR (status = 'processando' AND iniciado_em < now() - interval '15 minutes')
     ORDER BY solicitado_em ASC
     LIMIT 1
       FOR UPDATE SKIP LOCKED
  `)) as unknown as {
    id: string;
    clinic_id: string;
    solicitado_por: string;
    status: string;
    tentativas: number;
  }[];

  if (!rows || rows.length === 0) {
    return { processado: false };
  }

  const bundle = rows[0]!;

  // 2. Reserva atômica via SECURITY DEFINER (com incremento de tentativas)
  const reservadoRows = (await authDb.execute(sql`
    SELECT id, status, erro, tentativas
      FROM app_export_bundle_reservar(${bundle.id}::uuid)
  `)) as unknown as {
    id: string;
    status: string;
    erro: string | null;
    tentativas: number;
  }[];

  const reservado = reservadoRows[0]!;
  if (reservado.status === "falhou") {
    // Tentativas esgotadas
    await authDb.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
      VALUES (
        ${bundle.clinic_id},
        NULL,
        'exportacao_integral_falhou',
        'export_bundle',
        ${bundle.id},
        '{"erro":"tentativas_esgotadas"}'::jsonb
      )
    `);
    return {
      processado: true,
      bundleId: bundle.id,
      status: "falhou",
      erro: "tentativas_esgotadas",
    };
  }

  // 3. Executa a extração e empacotamento
  try {
    // Busca nome da clínica
    const rowsClinica = (await authDb.execute(sql`
      SELECT nome FROM clinic WHERE id = ${bundle.clinic_id}
    `)) as unknown as { nome: string }[];
    const clinicNome = rowsClinica[0]?.nome ?? "Clínica";

    // Coleta o acervo sob withTenant do solicitante (D9)
    const coleta = await withTenant(
      {
        clinicId: bundle.clinic_id,
        userId: bundle.solicitado_por,
        role: "coordenador",
      },
      async (tx) => {
        return coletarAcervo(tx);
      },
    );

    // Monta o ZIP e manifesto
    const montado = montarBundleZip({
      clinicId: bundle.clinic_id,
      clinicNome,
      solicitadoPorId: bundle.solicitado_por,
      coleta,
    });

    // Gera token opaco para download de uso único
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256Hex(Buffer.from(token));

    // Conclui transacionalmente via DEFINER
    await authDb.execute(sql`
      SELECT app_export_bundle_concluir(
        ${bundle.id}::uuid,
        ${montado.sha256},
        ${montado.bytesTamanho}::bigint,
        ${tokenHash},
        ${JSON.stringify(montado.manifest)}::jsonb,
        ${montado.zipBuffer}::bytea
      )
    `);

    // Registra audit_log (ação 2)
    await authDb.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
      VALUES (
        ${bundle.clinic_id},
        ${bundle.solicitado_por},
        'exportacao_integral_concluida',
        'export_bundle',
        ${bundle.id},
        ${JSON.stringify({ bytes: montado.bytesTamanho, sha256: montado.sha256 })}::jsonb
      )
    `);

    return {
      processado: true,
      bundleId: bundle.id,
      status: "pronto",
      token,
    };
  } catch (err: any) {
    // Categoria FECHADA. `err.message` aqui é texto de terceiro (driver do
    // Postgres): uma violação de constraint carrega os valores da linha, e
    // `export_bundle.erro` é lido pela UI e copiado para `audit_log.detalhe`.
    // O texto cru fica no log do processo, nunca no banco.
    const motivo = MOTIVOS_FALHA.has(err?.message)
      ? (err.message as string)
      : "erro_interno";
    if (motivo === "erro_interno") {
      console.error(
        "[exportacao-integral] falha não categorizada no bundle",
        bundle.id,
        err,
      );
    }

    await authDb.execute(sql`
      SELECT app_export_bundle_falhar(${bundle.id}::uuid, ${motivo})
    `);

    await authDb.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
      VALUES (
        ${bundle.clinic_id},
        ${bundle.solicitado_por},
        'exportacao_integral_falhou',
        'export_bundle',
        ${bundle.id},
        ${JSON.stringify({ erro: motivo })}::jsonb
      )
    `);

    return {
      processado: true,
      bundleId: bundle.id,
      status: "falhou",
      erro: motivo,
    };
  }
}

/**
 * Expira bundles vencidos (> 72h) e descarta os bytes binários mantendo a linha.
 */
export async function expirarVencidos(): Promise<{ expirados: number }> {
  const vencidos = (await authDb.execute(sql`
    SELECT id, clinic_id
      FROM export_bundle
     WHERE status = 'pronto'
       AND expira_em < now()
  `)) as unknown as { id: string; clinic_id: string }[];

  let expirados = 0;
  for (const item of vencidos) {
    // A função devolve `false` quando outra execução já expirou a linha entre
    // o SELECT e aqui. Auditar mesmo assim gravaria um evento de expiração que
    // não aconteceu nesta execução.
    const rowsExp = (await authDb.execute(sql`
      SELECT app_export_bundle_expirar(${item.id}::uuid) AS expirou
    `)) as unknown as { expirou: boolean }[];

    if (rowsExp[0]?.expirou !== true) continue;
    expirados += 1;

    await authDb.execute(sql`
      INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, detalhe)
      VALUES (
        ${item.clinic_id},
        NULL,
        'exportacao_integral_expirada',
        'export_bundle',
        ${item.id},
        '{}'::jsonb
      )
    `);
  }

  return { expirados };
}

/**
 * Consulta o histórico de exportações da clínica sob RLS.
 */
export async function obterHistoricoExportacoes(
  clinicId: string,
  userId: string,
  userRole: string,
): Promise<{
  ativo: ItemHistoricoExportacao | null;
  historico: ItemHistoricoExportacao[];
}> {
  return withTenant(
    { clinicId, userId, role: userRole as any },
    async (tx: Tx) => {
      const rows = (await tx.execute(sql`
        SELECT id, status, solicitado_em, iniciado_em, concluido_em, expira_em,
               bytes_tamanho, sha256, erro, token_hash
          FROM export_bundle
         ORDER BY solicitado_em DESC
         LIMIT 10
      `)) as unknown as {
        id: string;
        status: "pendente" | "processando" | "pronto" | "falhou" | "expirado";
        solicitado_em: Date;
        iniciado_em: Date | null;
        concluido_em: Date | null;
        expira_em: Date | null;
        bytes_tamanho: string | null;
        sha256: string | null;
        erro: string | null;
        token_hash: string | null;
      }[];

      const historico: ItemHistoricoExportacao[] = rows.map((r) => {
        const expirado = r.expira_em
          ? new Date(r.expira_em) < new Date()
          : false;
        const podeBaixar = r.status === "pronto" && !expirado;
        return {
          id: r.id,
          status: r.status,
          solicitadoEm: new Date(r.solicitado_em),
          iniciadoEm: r.iniciado_em ? new Date(r.iniciado_em) : null,
          concluidoEm: r.concluido_em ? new Date(r.concluido_em) : null,
          expiraEm: r.expira_em ? new Date(r.expira_em) : null,
          bytesTamanho: r.bytes_tamanho,
          sha256: r.sha256,
          erro: r.erro,
          podeBaixar,
        };
      });

      const ativo =
        historico.find(
          (h) => h.status === "pendente" || h.status === "processando",
        ) ?? null;

      return { ativo, historico };
    },
  );
}

/**
 * Cunha um link de download novo para um bundle pronto.
 *
 * O token em texto claro existe uma vez só, na resposta desta função: o banco
 * guarda apenas o SHA-256 (`app_export_bundle_token_definir`). É por isso que
 * o responsável precisa de um caminho para gerar o link — o token nasce dentro
 * do job, e de lá não há como devolvê-lo ao navegador. Gerar um link novo
 * revoga o anterior, porque sobrescreve o hash.
 */
export async function gerarLinkDownload(
  clinicId: string,
  userId: string,
  role: string,
  bundleId: string,
): Promise<{ url: string }> {
  return withTenant({ clinicId, userId, role: role as any }, async (tx: Tx) => {
    const gate = await carregarGateResponsavel(tx, clinicId, userId, role);
    if (!gate.autorizado) {
      throw new NaoAutorizadoExportacaoError();
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256Hex(Buffer.from(token));

    const rows = (await tx.execute(sql`
        SELECT app_export_bundle_token_definir(${bundleId}::uuid, ${tokenHash}) AS ok
      `)) as unknown as { ok: boolean }[];

    if (rows[0]?.ok !== true) {
      throw new Error(
        "Esta exportação não está mais disponível para download. Solicite uma nova.",
      );
    }

    return {
      url: `/api/export/acervo/${bundleId}?token=${encodeURIComponent(token)}`,
    };
  });
}
