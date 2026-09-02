import "server-only";
import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import type { LinhaFatosProntidaoCrua } from "@/app/(app)/pacientes/[id]/prontidao-queries";
import { montarProntidao, type FatosProntidao } from "@/lib/patient/prontidao";

/**
 * Papéis cuja RLS enxerga o prontuário clínico — mesmo conjunto de
 * `PAPEIS_COM_LEITURA_CLINICA` (`src/lib/patient/prontidao.ts`). Fora dele,
 * `montarProntidao` descarta `fatos` sem olhar (retorna a escada vazia antes
 * de ler o objeto), então nem vale chamar `app_fatos_prontidao` — e para
 * `admin_recepcao` especificamente é preciso NÃO chamar: `patient_select`
 * deixa a recepção enxergar todo paciente da clínica na lista, mas o guard do
 * definer (D-A11) não a autoriza, e o guard reprovado RAISE (D-A13). Chamar
 * mesmo assim derrubaria `/pacientes` inteira para a recepção a cada
 * paciente fora da própria sessão.
 */
const FATOS_VAZIOS: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};

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
  const podeLerProntidao =
    ctx.role === "coordenador" || ctx.role === "terapeuta";

  return withTenant(ctx, async (tx) => {
    // Uma query só. Os seis fatos da escada de prontidão NÃO entram mais
    // aqui: saíram para uma segunda chamada, em lote, a `app_fatos_prontidao`
    // (abaixo) — D-A12. `temPrescricao` fica: não é um dos seis fatos do
    // definer, e o `EXISTS` correlacionado aqui é o idioma certo pra ele.
    const linhas = await tx
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
      })
      .from(schema.patient)
      .where(eq(schema.patient.clinicId, ctx.clinicId))
      .orderBy(asc(schema.patient.nome));

    // `admin_recepcao` (e qualquer papel fora de {coordenador, terapeuta})
    // NÃO entra na chamada ao definer — ver `FATOS_VAZIOS` acima. Só chama a
    // função quando há alguém a perguntar E algum papel que ela responde.
    const fatosPorPaciente = new Map<string, FatosProntidao>();
    if (podeLerProntidao && linhas.length > 0) {
      const ids = linhas.map((linha) => linha.id);
      // Uma chamada só, com o array de ids da página — não uma por paciente.
      // `app_fatos_prontidao` (migração `0142`, D-A12) lê pelo MESMO
      // predicado que `obterFatosProntidaoNaTx` (`prontidao-queries.ts`): as
      // duas portas passam a divergir zero, inclusive no recorte de
      // cobertura que faltava aqui antes da Task 7c.
      // `sql.param(ids)`, NÃO `ARRAY[${ids}]` interpolado: bind direto de
      // array achata os elementos em parâmetros escalares e vira row
      // constructor (`ANY(($2, $3)::uuid[])`), que o Postgres rejeita com
      // n>=2. Mesmo padrão de `assertDestinatariosNoTenant`
      // (`src/lib/risco/notificacao.ts`) e `tiposEstruturaDosMarcos`
      // (`src/lib/evidence/materializar.ts`).
      const cruas = (await tx.execute<LinhaFatosProntidaoCrua>(
        sql`SELECT * FROM app_fatos_prontidao(${sql.param(ids)}::uuid[])`,
      )) as unknown as LinhaFatosProntidaoCrua[];

      // `crua.modalidade` (8ª coluna, Task 7c) é IGNORADA de propósito aqui: a
      // lista usa `clinicalModality` da própria linha de `patient`, que a RLS
      // já filtrou para os pacientes visíveis a este chamador. A coluna do
      // definer existe para os call sites de SESSÃO, onde o chamador pode ser
      // um terapeuta de cobertura que não lê a linha `patient` — caso que não
      // alcança esta lista. Não é esquecimento.
      for (const crua of cruas) {
        fatosPorPaciente.set(crua.patient_id, {
          temFichaClinica: crua.tem_ficha_clinica,
          temAnamnese: crua.tem_anamnese,
          temProtocoloAtivo: crua.tem_protocolo_ativo,
          temMetaAtiva: crua.tem_meta_ativa,
          temInstrumentoAplicado: crua.tem_instrumento_aplicado,
          temSessaoConsolidada: crua.tem_sessao_consolidada,
        });
      }
    }

    // `montarProntidao` é pura — roda sobre os fatos já lidos. Aqui é onde
    // `clinicalModality` é descartado: `PacienteListItem` expõe só
    // `proximoPasso`.
    return linhas.map((linha) => {
      const { clinicalModality, ...paciente } = linha;

      const prontidao = montarProntidao({
        modalidade: clinicalModality,
        fatos: fatosPorPaciente.get(linha.id) ?? FATOS_VAZIOS,
        role: ctx.role,
        patientId: linha.id,
      });

      return {
        ...paciente,
        proximoPasso: prontidao.proximo?.rotulo ?? null,
      };
    });
  });
}
