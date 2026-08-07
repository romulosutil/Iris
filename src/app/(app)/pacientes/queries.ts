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
   * Arquivamento COMERCIAL (#174): fora da contagem de pacientes ativos da
   * fatura, e nada mais. Não é alta, não é exclusão, e NÃO filtra a lista —
   * paciente arquivado continua aqui, sinalizado. Esconder empurraria a
   * clínica a apagar prontuário para não pagar, que é o incentivo que a régua
   * de arquivamento existe justamente para não criar.
   */
  arquivadoEm: Date | null;
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
        arquivadoEm: schema.patient.arquivadoEm,
        // EXISTS correlacionado em vez de join: um paciente com três
        // disciplinas prescritas não pode virar três linhas na lista.
        // `vigencia_fim IS NULL` é o mesmo filtro de vigência usado em todo o
        // #203 — prescrição encerrada não conta como prescrição.
        //
        // Paciente sem nenhuma linha em `patient_alvo_disciplina` (legado
        // anterior ao #203, ou cadastrado e ainda não prescrito) cai no ramo
        // vazio do EXISTS: `temPrescricao = false`, selo `Sem prescrição`. É o
        // resultado desejado — não há retrocompatibilidade a preservar aqui,
        // porque antes do #203 o alvo não tinha histórico e o cadastro nunca
        // gravava vigência.
        //
        // Se um dia a exclusão de prescrição virar lógica (coluna tipo
        // `excluido_em`) em vez do encerramento SCD2 atual, este predicado
        // precisa ganhar o filtro novo junto — `vigencia_fim IS NULL` sozinho
        // passaria a contar linha excluída como prescrição vigente.
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
