import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { auditLog, patient } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { motivoArquivamentoSchema } from "./schemas";

export type ArquivamentoState = {
  error?: string;
  ok?: boolean;
  bloqueioConta?: BloqueioConta;
};

/**
 * #174 — arquivamento COMERCIAL manual do paciente.
 *
 * `arquivado_em` tira o paciente da contagem de ativos da fatura e NADA MAIS:
 * não é alta clínica (regra 3 — `alta_em` não é tocado aqui, nem por engano),
 * não esconde o prontuário (regra 4 — nenhuma política de RLS olha para esta
 * coluna; arquivado continua legível e exportável). A recíproca existe e mora
 * no banco: dar alta arquiva, via trigger `patient_alta_arquiva_trg` (0065).
 *
 * Papéis: `coordenador` e `admin_recepcao`. Não é escolha desta camada — é o
 * que a política `patient_update` (0001) permite. Um `terapeuta` aqui não
 * receberia erro do banco, só 0 linhas afetadas (RLS filtra, não estoura), e a
 * UI diria "arquivado" sobre um paciente que continua faturando. `requireRole`
 * transforma esse silêncio em recusa explícita.
 */
async function arquivarPacienteCore(
  ctx: TenantContext,
  patientId: string,
  motivo: string,
): Promise<ArquivamentoState> {
  return alternarArquivamento(ctx, patientId, "arquivar", motivo);
}

/**
 * Conta em somente-leitura não arquiva nem desarquiva (#163+#159). Arquivar
 * *reduz* a fatura, então a tentação é isentá-lo — mas a apuração é por
 * snapshot de ciclo, e deixar a única escrita permitida ser a que muda o valor
 * a cobrar abriria uma porta para mexer na base de faturamento de uma conta que
 * está justamente inadimplente ou fora do trial. Reativar a assinatura é o
 * caminho, e é o que a mensagem do bloqueio oferece.
 */
export const arquivarPaciente = comEscrita(arquivarPacienteCore);

/**
 * Desarquiva: o paciente volta a contar na fatura do mês.
 *
 * Continua permitido para quem já teve alta clínica: o trigger do banco só age
 * na transição NULL → NOT NULL de `alta_em`, então desarquivar não é desfeito
 * na sequência. Quem desarquiva está afirmando que houve retorno — e o
 * registro de alta é histórico clínico, que não se reescreve por ato
 * administrativo.
 */
async function desarquivarPacienteCore(
  ctx: TenantContext,
  patientId: string,
  motivo: string,
): Promise<ArquivamentoState> {
  return alternarArquivamento(ctx, patientId, "desarquivar", motivo);
}

export const desarquivarPaciente = comEscrita(desarquivarPacienteCore);

async function alternarArquivamento(
  ctx: TenantContext,
  patientId: string,
  operacao: "arquivar" | "desarquivar",
  motivo: string,
): Promise<ArquivamentoState> {
  requireRole(ctx, "coordenador", "admin_recepcao");
  if (!patientId) return { error: "Paciente não informado." };

  // A validação do motivo é repetida AQUI, e não só na action, porque este core
  // é chamado direto pelos testes de integração e por qualquer caminho futuro
  // que não passe por `FormData`. Gravar trilha com motivo vazio é o mesmo que
  // não ter motivo — e o buraco só apareceria meses depois, na hora de
  // explicar uma linha da fatura.
  const motivoValidado = motivoArquivamentoSchema.safeParse(motivo);
  if (!motivoValidado.success) {
    return {
      error: motivoValidado.error.issues[0]?.message ?? "Motivo inválido.",
    };
  }

  const arquivando = operacao === "arquivar";

  try {
    return await withTenant(ctx, async (tx) => {
      // A guarda no WHERE (`IS NULL` / `IS NOT NULL`) faz a operação
      // idempotente: repetir o clique não regrava `arquivado_em` com um `now()`
      // novo. Isso importa porque a apuração da fatura é por snapshot de
      // ciclo — reescrever a data moveria o paciente de mês.
      const linhas = await tx
        .update(patient)
        .set({ arquivadoEm: arquivando ? new Date() : null })
        .where(
          and(
            eq(patient.id, patientId),
            arquivando
              ? isNull(patient.arquivadoEm)
              : isNotNull(patient.arquivadoEm),
          ),
        )
        .returning({ id: patient.id, arquivadoEm: patient.arquivadoEm });

      if (linhas.length === 0) {
        // Duas causas indistinguíveis daqui, ambas benignas: já estava no
        // estado pedido, ou o RLS não deixa este usuário ver o paciente. Não
        // vale gravar trilha de um não-evento, então saímos ok e sem linha.
        return { ok: true };
      }

      // Trilha append-only (`audit_log` só aceita INSERT para `app_role`): o
      // arquivamento mexe no que a clínica paga, então precisa de ator e
      // carimbo de tempo audíveis.
      await tx.insert(auditLog).values({
        clinicId: ctx.clinicId,
        atorId: ctx.userId,
        acao: arquivando ? "paciente_arquivado" : "paciente_desarquivado",
        entidade: "patient",
        entidadeId: patientId,
        patientId,
        // `motivo` entra no jsonb, não em coluna nova: a trilha é append-only
        // e genérica por ação, e o que muda a fatura precisa carregar o porquê
        // junto do quando. Sem ele, seis meses depois a linha do audit responde
        // "quem" e "quando" e deixa a pergunta cara ("por que este paciente
        // parou de ser cobrado?") sem resposta.
        detalhe: { origem: "manual", motivo: motivoValidado.data },
      });

      return { ok: true };
    });
  } catch (err) {
    console.error(`${operacao}Paciente:`, err);
    return {
      error: arquivando
        ? "Não foi possível arquivar o paciente."
        : "Não foi possível desarquivar o paciente.",
    };
  }
}
