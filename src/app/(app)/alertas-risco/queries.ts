import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import type {
  CategoriaRisco,
  CertezaRisco,
  SeveridadeRisco,
  StatusRisco,
} from "@/lib/risco/prazos";

/**
 * #122 — leitura da fila dedicada de alerta de risco clínico.
 *
 * Fila SEPARADA de `/supervisao` de propósito (§3.2): um coordenador não deve
 * varrer "estagnação de meta pedagógica" na mesma ordenação em que varre risco
 * de vida. O que a RLS deixa passar é decidido pela policy `alerta_risco_scope`
 * (migração 0049), não por filtro aqui.
 */

export type ItemRisco = {
  id: string;
  pacienteNome: string | null;
  /** null quando o paciente não tem data de nascimento cadastrada. */
  pacienteNascimento: string | null;
  sessionId: string | null;
  sessaoEm: string | null;
  categoria: CategoriaRisco;
  severidade: SeveridadeRisco;
  certeza: CertezaRisco;
  trechoFonte: string;
  detalhe: string;
  status: StatusRisco;
  prazoMinutos: number;
  prazoReconhecimento: string;
  reconhecidoEm: string | null;
  reconhecidoPorNome: string | null;
  escaladoEm: string | null;
  escaladoEstagio2Em: string | null;
  condutaRegistrada: string | null;
  motivoDescarte: string | null;
  criadoEm: string;
};

const ABERTOS: StatusRisco[] = [
  "aberto",
  "reconhecido",
  "escalado_estagio_1",
  "escalado_estagio_2",
];

export async function listarAlertasRisco(
  ctx: TenantContext,
  opts: { incluirTerminais?: boolean } = {},
): Promise<ItemRisco[]> {
  const statuses = opts.incluirTerminais
    ? [...ABERTOS, "resolvido", "descartado"]
    : ABERTOS;

  return withTenant(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      SELECT a.id,
             p.nome              AS paciente_nome,
             p.nascimento::text  AS paciente_nascimento,
             a.session_id,
             s.agendada_para::text AS sessao_em,
             a.categoria, a.severidade, a.certeza,
             a.trecho_fonte, a.detalhe, a.status,
             a.prazo_minutos,
             a.prazo_reconhecimento::text,
             a.reconhecido_em::text,
             u.name              AS reconhecido_por_nome,
             a.escalado_em::text,
             a.escalado_estagio_2_em::text,
             a.conduta_registrada, a.motivo_descarte,
             a.criado_em::text
        FROM alerta_risco_clinico a
        LEFT JOIN patient  p ON p.id = a.patient_id
        LEFT JOIN session  s ON s.id = a.session_id
        LEFT JOIN app_user u ON u.id = a.reconhecido_por
       WHERE a.deletado_em IS NULL
         AND a.status = ANY(${sql.raw(`ARRAY[${statuses.map((s) => `'${s}'`).join(",")}]::alerta_risco_status[]`)})
       -- ordenação por URGÊNCIA, não por recência: o prazo mais curto primeiro,
       -- e o que já venceu antes do que ainda tem folga.
       ORDER BY a.prazo_reconhecimento ASC, a.criado_em ASC
    `)) as unknown as Array<Record<string, unknown>>;

    return linhas.map((l) => ({
      id: l.id as string,
      pacienteNome: (l.paciente_nome as string | null) ?? null,
      pacienteNascimento: (l.paciente_nascimento as string | null) ?? null,
      sessionId: (l.session_id as string | null) ?? null,
      sessaoEm: (l.sessao_em as string | null) ?? null,
      categoria: l.categoria as CategoriaRisco,
      severidade: l.severidade as SeveridadeRisco,
      certeza: l.certeza as CertezaRisco,
      trechoFonte: l.trecho_fonte as string,
      detalhe: l.detalhe as string,
      status: l.status as StatusRisco,
      prazoMinutos: Number(l.prazo_minutos),
      prazoReconhecimento: l.prazo_reconhecimento as string,
      reconhecidoEm: (l.reconhecido_em as string | null) ?? null,
      reconhecidoPorNome: (l.reconhecido_por_nome as string | null) ?? null,
      escaladoEm: (l.escalado_em as string | null) ?? null,
      escaladoEstagio2Em: (l.escalado_estagio_2_em as string | null) ?? null,
      condutaRegistrada: (l.conduta_registrada as string | null) ?? null,
      motivoDescarte: (l.motivo_descarte as string | null) ?? null,
      criadoEm: l.criado_em as string,
    }));
  });
}

/**
 * Estado do estágio 2 na clínica, para o banner global (§4.2.1, ação 1).
 *
 * Devolve só a CONTAGEM e o protocolo da clínica — sem nome de paciente e sem
 * categoria. O banner aparece para TODOS os usuários logados da clínica, e nem
 * todos têm acesso clínico ao caso: H3 aplicado à tela, não só ao push.
 */
export async function estadoEstagio2(
  ctx: TenantContext,
): Promise<{ quantidade: number; protocoloInterno: string | null }> {
  return withTenant(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      SELECT app_risco_estagio2_ativo() AS quantidade,
             (SELECT c.protocolo_emergencia_interno FROM clinic c WHERE c.id = ${ctx.clinicId}) AS protocolo
    `)) as unknown as Array<{ quantidade: number; protocolo: string | null }>;
    const r = linhas[0];
    return {
      quantidade: Number(r?.quantidade ?? 0),
      protocoloInterno: r?.protocolo ?? null,
    };
  });
}
