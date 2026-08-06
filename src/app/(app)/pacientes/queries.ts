import "server-only";
import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";

export interface PacienteListItem {
  id: string;
  nome: string;
  nascimento: string | null;
  responsavelContato: string | null;
  escola: string | null;
  convenio: string | null;
  criadoEm: Date;
  /**
   * Tem ao menos uma disciplina prescrita VIGENTE (#203). Derivado na leitura,
   * nunca coluna: uma flag persistida passaria a mentir assim que alguém
   * encerrasse a prescrição por outro caminho.
   *
   * É o que sustenta o selo `Sem prescrição` — sem ele, o paciente cadastrado
   * mas ainda não prescrito some da vista de quem cadastrou e saiu, e só
   * reaparece quando alguém tenta montar a equipe e não consegue.
   */
  temPrescricao: boolean;
}

/**
 * Lista os pacientes sob RLS para a rota `/pacientes`.
 * Coordenadores e Recepção veem os pacientes da clínica;
 * Terapeutas veem os pacientes da sua equipe (via policy RLS `patient_select`).
 */
export async function listarTodosPacientes(
  ctx: TenantContext,
): Promise<PacienteListItem[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: schema.patient.id,
        nome: schema.patient.nome,
        nascimento: schema.patient.nascimento,
        responsavelContato: schema.patient.responsavelContato,
        escola: schema.patient.escola,
        convenio: schema.patient.convenio,
        criadoEm: schema.patient.criadoEm,
        // EXISTS correlacionado em vez de join: um paciente com três
        // disciplinas prescritas não pode virar três linhas na lista.
        // `vigencia_fim IS NULL` é o mesmo filtro de vigência usado em todo o
        // #203 — prescrição encerrada não conta como prescrição.
        temPrescricao: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.patientAlvoDisciplina)
            .where(
              and(
                eq(schema.patientAlvoDisciplina.patientId, schema.patient.id),
                isNull(schema.patientAlvoDisciplina.vigenciaFim),
              ),
            ),
        ).mapWith(Boolean),
      })
      .from(schema.patient)
      .where(eq(schema.patient.clinicId, ctx.clinicId))
      .orderBy(asc(schema.patient.nome)),
  );
}
