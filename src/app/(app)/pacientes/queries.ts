import "server-only";
import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import { montarProntidao } from "@/lib/patient/prontidao";

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
  /**
   * Rótulo do próximo degrau da escada de prontidão, ou `null` quando o
   * prontuário já está pronto. Derivado na leitura, como `temPrescricao` —
   * pelo mesmo motivo: flag persistida passa a mentir assim que alguém
   * descontinua a última meta por outro caminho.
   */
  proximoPasso: string | null;
}

/**
 * Lista os pacientes sob RLS para a rota `/pacientes`.
 * Coordenadores e Recepção veem os pacientes da clínica;
 * Terapeutas veem os pacientes da sua equipe (via policy RLS `patient_select`).
 */
export async function listarTodosPacientes(
  ctx: TenantContext,
): Promise<PacienteListItem[]> {
  // Uma query só, seis `EXISTS` correlacionados a mais — mesmo idioma de
  // `temPrescricao` abaixo. A alternativa óbvia (chamar `obterFatosProntidao`
  // por linha) abriria uma transação por paciente: numa clínica com 80
  // pacientes, 80 idas ao banco só para pintar uma pílula na lista.
  const linhas = await withTenant(ctx, (tx) =>
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
        clinicalModality: schema.patient.clinicalModality,
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
        // Os seis fatos da escada de prontidão (`src/lib/patient/prontidao.ts`),
        // mesmos predicados de `obterFatosProntidaoNaTx`
        // (`prontidao-queries.ts`) — copiados, não importados: aquela função
        // abre a própria transação e lê UM paciente; esta lê a clínica
        // inteira numa passada só.
        temFichaClinica: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.patientClinicalProfile)
            .where(
              eq(schema.patientClinicalProfile.patientId, schema.patient.id),
            ),
        ).mapWith(Boolean),
        temAnamnese: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.anamnese)
            .where(eq(schema.anamnese.patientId, schema.patient.id)),
        ).mapWith(Boolean),
        // Vigência aberta: protocolo desativado não tem marcos a pontuar.
        temProtocoloAtivo: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.patientProtocol)
            .where(
              and(
                eq(schema.patientProtocol.patientId, schema.patient.id),
                isNull(schema.patientProtocol.desativadoEm),
              ),
            ),
        ).mapWith(Boolean),
        // Só 'ativa'. Rascunho não é alvo de resolução em `materializar.ts`.
        temMetaAtiva: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.goal)
            .where(
              and(
                eq(schema.goal.patientId, schema.patient.id),
                eq(schema.goal.estado, "ativa"),
              ),
            ),
        ).mapWith(Boolean),
        temInstrumentoAplicado: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.instrumentoAplicacao)
            .where(
              eq(schema.instrumentoAplicacao.patientId, schema.patient.id),
            ),
        ).mapWith(Boolean),
        // Snapshot, não sessão: é ele que prova que a documentação virou dado
        // legível na evolução.
        temSessaoConsolidada: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.sessionSnapshot)
            .where(eq(schema.sessionSnapshot.patientId, schema.patient.id)),
        ).mapWith(Boolean),
      })
      .from(schema.patient)
      .where(eq(schema.patient.clinicId, ctx.clinicId))
      .orderBy(asc(schema.patient.nome)),
  );

  // `montarProntidao` é pura — roda fora da transação, sobre os fatos já
  // lidos. Aqui é onde os seis fatos intermediários e `clinicalModality`
  // são descartados: `PacienteListItem` expõe só `proximoPasso`.
  return linhas.map((linha) => {
    const {
      clinicalModality,
      temFichaClinica,
      temAnamnese,
      temProtocoloAtivo,
      temMetaAtiva,
      temInstrumentoAplicado,
      temSessaoConsolidada,
      ...paciente
    } = linha;

    const prontidao = montarProntidao({
      modalidade: clinicalModality,
      fatos: {
        temFichaClinica,
        temAnamnese,
        temProtocoloAtivo,
        temMetaAtiva,
        temInstrumentoAplicado,
        temSessaoConsolidada,
      },
      role: ctx.role,
      patientId: linha.id,
    });

    return {
      ...paciente,
      proximoPasso: prontidao.proximo?.rotulo ?? null,
    };
  });
}
