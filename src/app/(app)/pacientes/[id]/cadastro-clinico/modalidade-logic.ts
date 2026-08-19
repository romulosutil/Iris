import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { auditLog, clinicalModalityEnum, patient } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";

export type ModalidadeClinicaState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
};

/**
 * #387 — trocar a modalidade clínica de um paciente já cadastrado.
 *
 * Precedente é `alternarArquivamento` (`../logic.ts`), NÃO `SECURITY DEFINER`:
 * a policy `patient_update` (0001) já libera `UPDATE` direto via `app_role`
 * para `coordenador`/`admin_recepcao`, sem exigir `app_is_on_team`. Mesmo
 * formato aqui — `UPDATE` direto via `withTenant` + `INSERT` em `audit_log` na
 * MESMA transação (INSERT é aberto a `app_role`; só UPDATE/DELETE em
 * `audit_log` exigiriam DEFINER, e nada aqui faz isso).
 *
 * Trocar modalidade NÃO apaga RPD, metas ou qualquer dado do modelo anterior
 * — essa limpeza está fora do escopo desta issue (arch doc, fora de escopo).
 */
const modalidadeSchema = z.enum(clinicalModalityEnum.enumValues, {
  message: "Modalidade clínica inválida.",
});

async function alterarModalidadeClinicaCore(
  ctx: TenantContext,
  patientId: string,
  novaModalidade: string,
): Promise<ModalidadeClinicaState> {
  // Mesmos papéis do predicado de `patient_update`: coordenação e recepção
  // administram o cadastro do paciente; terapeuta não muda o modelo de
  // tratamento por conta própria.
  requireRole(ctx, "coordenador", "admin_recepcao");
  if (!patientId) return { error: "Paciente não informado." };

  const parsed = modalidadeSchema.safeParse(novaModalidade);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Modalidade inválida." };
  }
  const modalidade = parsed.data;

  try {
    return await withTenant(ctx, async (tx) => {
      // Lê a modalidade atual PRIMEiro, dentro da mesma transação: é o que
      // torna a troca idempotente (reenvio do mesmo valor não duplica trilha)
      // e o que dá ao audit_log o "de/para", não só o valor final. Ausência de
      // linha aqui é indistinguível entre "id inexistente" e "RLS não deixa
      // este tenant ver o paciente" — as duas viram a mesma recusa educada,
      // igual ao 0 linhas do `alternarArquivamento`.
      const [atual] = await tx
        .select({ clinicalModality: patient.clinicalModality })
        .from(patient)
        .where(eq(patient.id, patientId));

      if (!atual) {
        return { error: "Paciente não encontrado." };
      }

      if (atual.clinicalModality === modalidade) {
        return { ok: true };
      }

      await tx
        .update(patient)
        .set({ clinicalModality: modalidade })
        .where(eq(patient.id, patientId));

      // Trilha append-only (`audit_log` só aceita INSERT para `app_role`): a
      // troca de modalidade muda qual aba/instrumento clínico o paciente usa,
      // então precisa de ator, carimbo de tempo e "de/para" audíveis.
      await tx.insert(auditLog).values({
        clinicId: ctx.clinicId,
        atorId: ctx.userId,
        acao: "paciente_modalidade_clinica_alterada",
        entidade: "patient",
        entidadeId: patientId,
        patientId,
        detalhe: { de: atual.clinicalModality, para: modalidade },
      });

      return { ok: true };
    });
  } catch (err) {
    console.error("alterarModalidadeClinica:", err);
    return { error: "Não foi possível alterar a modalidade clínica." };
  }
}

/**
 * Conta em somente-leitura não altera modalidade clínica (mesmo guard de
 * `alternarArquivamento` e `salvarFichaClinica` nesta pasta).
 */
export const alterarModalidadeClinica = comEscrita(
  alterarModalidadeClinicaCore,
);
