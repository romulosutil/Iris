import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import { patientAlvoDisciplina } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { ehCargaValida, formatarHoras, HORAS_MAX_SEMANA } from "@/lib/horas";

/**
 * Prescrição de disciplina + carga horária semanal (#203, fatia 2).
 *
 * A dupla Disciplina + Horas é o PILAR MESTRE do prontuário: define o teto que
 * a equipe consome (fatia 4) e é o que o convênio audita. Duas consequências
 * que mandam no desenho deste arquivo:
 *
 *   SCD2, nunca UPDATE no lugar. Represcrever é fechar a vigência anterior e
 *   abrir linha nova — "o convênio audita o alvo DA ÉPOCA". A 0077 tornou isso
 *   inviolável no nível do privilégio (`app_role` só pode escrever
 *   `vigencia_fim`), então um UPDATE de horas aqui falharia com permission
 *   denied em vez de apagar histórico em silêncio.
 *
 *   Vigência fechada NÃO é vigente. Toda leitura de saldo filtra
 *   `vigencia_fim IS NULL`, sem exceção (plano §4.5) — é o mesmo critério do
 *   `app_is_on_team` na RLS. Por isso fechar e abrir no mesmo dia é seguro: a
 *   linha antiga sai da conta no instante em que é fechada.
 */

export type PrescricaoState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
};

export type PrescricaoVigente = {
  id: string;
  disciplina: string;
  horasAlvoSemana: string;
  vigenciaInicio: string;
};

/** Data de hoje no fuso da clínica, resolvida pelo Postgres. */
const HOJE_BR = sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

/**
 * Prescrições vigentes do paciente, em ordem alfabética de disciplina.
 *
 * Fuso resolvido no Postgres, não em JS: uma prescrição feita às 22h no Brasil
 * já é o dia seguinte em UTC, e a lista mostraria a data errada. É o mesmo
 * cuidado que `encerrarVinculoEquipe` já tomava do lado da equipe.
 */
export async function listarPrescricoesVigentes(
  ctx: TenantContext,
  patientId: string,
): Promise<PrescricaoVigente[]> {
  requireRole(ctx, "coordenador", "admin_recepcao", "terapeuta");
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: patientAlvoDisciplina.id,
        disciplina: patientAlvoDisciplina.disciplina,
        horasAlvoSemana: patientAlvoDisciplina.horasAlvoSemana,
        vigenciaInicio: patientAlvoDisciplina.vigenciaInicio,
      })
      .from(patientAlvoDisciplina)
      .where(
        and(
          eq(patientAlvoDisciplina.patientId, patientId),
          isNull(patientAlvoDisciplina.vigenciaFim),
        ),
      )
      .orderBy(asc(patientAlvoDisciplina.disciplina)),
  );
}

/**
 * Serializa prescrições concorrentes da MESMA disciplina do MESMO paciente.
 *
 * O índice único parcial `patient_alvo_unico_vigente` (0077) já impede o estado
 * errado — duas linhas vigentes —, mas sozinho ele transformaria a corrida em
 * erro 23505 para o perdedor, depois de a transação inteira ter rodado. Com o
 * lock, o perdedor espera, relê e faz a coisa certa (fechar a linha que o
 * vencedor abriu, e abrir a sua).
 *
 * Lock ADVISORY, não `SELECT … FOR UPDATE`: a 0077 revogou `UPDATE` de tabela e
 * concede só `vigencia_fim` por coluna, e o row lock do Postgres exige
 * privilégio de UPDATE em NÍVEL DE TABELA — com grant por coluna, o `FOR
 * UPDATE` falharia com "permission denied for table patient_alvo_disciplina".
 * O advisory lock não toca em privilégio de tabela nenhum e morre junto com a
 * transação (`_xact_`), então não há lock vazado se algo estourar no meio.
 */
async function travarDisciplina(
  tx: Tx,
  patientId: string,
  disciplina: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${patientId} || ':' || ${disciplina}, 203))`,
  );
}

async function prescreverDisciplinaCore(
  ctx: TenantContext,
  patientId: string,
  formData: FormData,
): Promise<PrescricaoState> {
  // Prescrição é ato clínico. `admin_recepcao` lê (para conferir a ficha), mas
  // não prescreve — a policy de INSERT da 0025 é mais frouxa que isto por ser
  // anterior à decisão; aqui a regra da aplicação é a mais restritiva das duas.
  requireRole(ctx, "coordenador");

  const disciplina = String(formData.get("disciplina") ?? "").trim();
  if (!disciplina) return { error: "Selecione a disciplina." };

  const horasBruto = String(formData.get("horasAlvoSemana") ?? "").trim();
  if (!horasBruto) {
    return {
      error: `Informe a carga horária semanal de ${disciplina}.`,
    };
  }
  const horas = Number(horasBruto.replace(",", "."));
  if (!ehCargaValida(horas)) {
    // Mensagem única para as três regras do CHECK: dizer só "inválido" obriga o
    // coordenador a descobrir qual delas quebrou por tentativa e erro.
    return {
      error: `Carga horária inválida para ${disciplina}: informe um valor maior que zero, de 30 em 30 minutos, até ${formatarHoras(HORAS_MAX_SEMANA)} por semana.`,
    };
  }
  const horasTexto = horas.toFixed(1);

  return withTenant(ctx, async (tx) => {
    await travarDisciplina(tx, patientId, disciplina);

    const [vigente] = await tx
      .select({
        id: patientAlvoDisciplina.id,
        horasAlvoSemana: patientAlvoDisciplina.horasAlvoSemana,
      })
      .from(patientAlvoDisciplina)
      .where(
        and(
          eq(patientAlvoDisciplina.patientId, patientId),
          eq(patientAlvoDisciplina.disciplina, disciplina),
          isNull(patientAlvoDisciplina.vigenciaFim),
        ),
      );

    // Represcrever o mesmo número não é mudança clínica. Gravar assim mesmo
    // encheria a trilha de auditoria de linhas idênticas e faria o convênio
    // enxergar troca de prescrição onde não houve nenhuma.
    if (vigente && Number(vigente.horasAlvoSemana) === horas) {
      return { ok: true };
    }

    if (vigente) {
      // Fecha HOJE (fuso BR) e abre HOJE: como toda leitura filtra
      // `vigencia_fim IS NULL`, a linha antiga sai da conta no mesmo ato — não
      // existe janela em que as duas contem juntas.
      await tx
        .update(patientAlvoDisciplina)
        .set({ vigenciaFim: HOJE_BR })
        .where(eq(patientAlvoDisciplina.id, vigente.id));
    }

    await tx.insert(patientAlvoDisciplina).values({
      clinicId: ctx.clinicId,
      patientId,
      disciplina,
      horasAlvoSemana: horasTexto,
      vigenciaInicio: HOJE_BR,
    });

    return { ok: true };
  });
}

/**
 * Conta em somente-leitura não prescreve (#163+#159): a prescrição é o teto que
 * autoriza montar equipe, e montar equipe é o que concede acesso ao prontuário.
 */
export const prescreverDisciplina = comEscrita(prescreverDisciplinaCore);

async function encerrarPrescricaoCore(
  ctx: TenantContext,
  patientId: string,
  disciplina: string,
): Promise<PrescricaoState> {
  requireRole(ctx, "coordenador");
  if (!disciplina.trim()) return { error: "Disciplina não informada." };

  return withTenant(ctx, async (tx) => {
    await travarDisciplina(tx, patientId, disciplina);
    // Append-only: marca a vigência, nunca deleta. A 0077 revogou o DELETE de
    // `app_role` justamente para que este seja o único caminho — apagar
    // prescrição derrubaria a trilha que o convênio audita.
    const linhas = await tx
      .update(patientAlvoDisciplina)
      .set({ vigenciaFim: HOJE_BR })
      .where(
        and(
          eq(patientAlvoDisciplina.patientId, patientId),
          eq(patientAlvoDisciplina.disciplina, disciplina),
          isNull(patientAlvoDisciplina.vigenciaFim),
        ),
      )
      .returning({ id: patientAlvoDisciplina.id });

    // Zero linhas aqui não é sucesso silencioso: ou a prescrição já tinha sido
    // encerrada em outra aba, ou a RLS barrou a escrita (um UPDATE barrado por
    // policy afeta 0 linhas SEM estourar). Nos dois casos o coordenador precisa
    // saber que a tela está desatualizada.
    if (linhas.length === 0) {
      return {
        error: `Nenhuma prescrição vigente de ${disciplina} para encerrar — recarregue a página.`,
      };
    }
    return { ok: true };
  });
}

export const encerrarPrescricao = comEscrita(encerrarPrescricaoCore);
