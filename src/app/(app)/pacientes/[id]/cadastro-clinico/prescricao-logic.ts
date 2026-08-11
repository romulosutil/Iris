import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import { careTeamMembership, patientAlvoDisciplina } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import {
  ehCargaValida,
  formatarHoras,
  HORAS_MAX_SEMANA,
  PAPEIS_QUE_CONSOMEM_SALDO,
  parseHoras,
} from "@/lib/horas";
import {
  calcularCobertura,
  chaveDisciplina,
  textoCobertura,
  textoVinculosSemHoras,
} from "../equipe/cobertura";

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

/**
 * Represcrição que deixa a disciplina sobrealocada (#203, fatia 6 · §MV4).
 *
 * Reduzir o teto abaixo do que a equipe já entrega é LEGÍTIMO — travar
 * obrigaria o coordenador a desmontar a equipe para depois corrigir a
 * prescrição, ordem que a clínica não segue. O refino é de interação:
 * confirmação ANTES, não aviso depois. Este objeto é o que a ação devolve no
 * lugar de salvar, para a tela poder perguntar.
 */
export type ConfirmacaoSobrealocacao = {
  disciplina: string;
  /**
   * Teto vigente hoje, antes da redução. `undefined` quando a disciplina NÃO
   * está prescrita e a equipe já tem vínculos nela (legado de §3.1): não houve
   * teto anterior, e dizer "passa de 0h" afirmaria uma prescrição que nunca
   * existiu — o mesmo número inventado que o encerramento se recusa a citar.
   */
  horasAtuais?: number;
  /** Teto que o coordenador está pedindo. */
  horasNovas: number;
  /** Soma vigente de quem CONSOME saldo (D-B/D-C). */
  horasAlocadas: number;
  /**
   * A frase do estado `sobrealocada` de MV3, palavra por palavra. Vem de
   * `textoCobertura` — a MESMA função que a barra usa. Parafrasear aqui faria o
   * coordenador ler uma consequência ao confirmar e encontrar outra na tela de
   * destino, que é o jeito mais barato de destruir a confiança na barra.
   */
  texto: string;
  /**
   * A segunda frase da barra (`textoVinculosSemHoras`), quando a disciplina tem
   * vínculo vigente sem horas registradas. Sem ela o diálogo mostraria UMA frase
   * e a tela de destino DUAS — divergência pela omissão, que é a mesma falha que
   * parafrasear a primeira.
   */
  avisoSemHoras?: string;
};

export type PrescricaoState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
  /** Presente = nada foi salvo ainda; a tela precisa confirmar (§MV4). */
  confirmacao?: ConfirmacaoSobrealocacao;
  /**
   * Preenchido junto com `ok` quando o que foi salvo deixou a disciplina
   * sobrealocada: o trabalho não termina no salvar, termina no ajuste das
   * horas dos membros — a tela usa isto para levar o coordenador até lá.
   */
  disciplinaSobrealocada?: string;
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

/**
 * Soma das horas vigentes que CONSOMEM saldo nesta disciplina.
 *
 * Mesma conta de `validarSaldoDisciplina` (equipe/logic.ts), do outro lado da
 * mesma moeda: lá é "cabe mais um?", aqui é "o novo teto ainda cobre o que já
 * está alocado?". Roda dentro da transação e DEPOIS do advisory lock — que é o
 * mesmo lock (`patientId:disciplina`, namespace 203) que a alocação pega. Sem
 * isso, represcrever para baixo e alocar ao mesmo tempo produziriam
 * sobrealocação sem que nenhum dos dois coordenadores tivesse errado.
 *
 * Filtros que não são opcionais: `vigencia_fim IS NULL` (histórico encerrado
 * não é entrega) e o papel que consome saldo (D-C: gestão não consome).
 * Esquecer qualquer um deles faria a confirmação de MV4 aparecer em redução que
 * não sobrealoca nada.
 *
 * O papel é filtrado por LISTA DE QUEM CONSOME (`PAPEIS_QUE_CONSOMEM_SALDO`), a
 * mesma constante que `papelConsomeSaldo` usa na barra — nunca por exclusão de
 * `coordenador_referencia`. Hoje as duas formas dão no mesmo porque o CHECK
 * `ctm_papel` só admite três papéis; no dia em que entrar um quarto, a exclusão
 * o contaria aqui e a barra não o contaria, e a divergência apareceria como
 * confirmação fantasma sem nenhum teste ficar vermelho.
 *
 * Vínculo vigente SEM horas não entra na soma (o `SUM` ignora NULL) mas é
 * contado à parte: é o que permite ao diálogo repetir a segunda frase da barra
 * em vez de mostrar um número que se apresenta como completo.
 */
async function somarAlocadoVigente(
  tx: Tx,
  patientId: string,
  disciplina: string,
): Promise<{ horasAlocadas: number; vinculosSemHoras: number }> {
  const [linha] = await tx
    .select({
      alocado: sql<string>`COALESCE(SUM(${careTeamMembership.horasSemana}), 0)`,
      semHoras: sql<string>`COUNT(*) FILTER (WHERE ${careTeamMembership.horasSemana} IS NULL)`,
    })
    .from(careTeamMembership)
    .where(
      and(
        eq(careTeamMembership.patientId, patientId),
        sql`lower(btrim(${careTeamMembership.disciplina})) = ${chaveDisciplina(disciplina)}`,
        isNull(careTeamMembership.vigenciaFim),
        inArray(careTeamMembership.papelNaEquipe, PAPEIS_QUE_CONSOMEM_SALDO),
      ),
    );
  return {
    horasAlocadas: parseHoras(linha?.alocado) ?? 0,
    vinculosSemHoras: Number(linha?.semHoras ?? 0),
  };
}

/**
 * As frases de MV3 para o estado em que a disciplina FICARIA com o novo teto.
 *
 * Passa pelo `calcularCobertura` real, com uma prescrição e vínculos sintéticos
 * que reproduzem exatamente o apurado — um vínculo com o total das horas e um
 * por vínculo sem horas —, em vez de montar o `CoberturaDisciplina` na mão: a
 * classificação dos quatro estados, o cálculo do excedente e o aviso de conta
 * incompleta ficam num lugar só. Se a regra mudar, estas frases mudam junto —
 * que é o ponto.
 */
function frasesDoEstadoResultante(
  disciplina: string,
  horasNovas: number,
  {
    horasAlocadas,
    vinculosSemHoras,
  }: Awaited<ReturnType<typeof somarAlocadoVigente>>,
): { texto: string; avisoSemHoras?: string } {
  const [cobertura] = calcularCobertura(
    [{ disciplina, horasAlvoSemana: horasNovas }],
    [
      {
        disciplina,
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: horasAlocadas,
      },
      ...Array.from({ length: vinculosSemHoras }, () => ({
        disciplina,
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: null,
      })),
    ],
  );
  return {
    texto: textoCobertura(cobertura!),
    avisoSemHoras: textoVinculosSemHoras(cobertura!) ?? undefined,
  };
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
  // O cliente só manda isto depois de ler o diálogo de MV4. Sem a flag, uma
  // redução que sobrealoca PARA no passo de confirmação em vez de salvar.
  const confirmado =
    String(formData.get("confirmarSobrealocacao") ?? "") === "1";

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

    const horasAtuais = parseHoras(vigente?.horasAlvoSemana) ?? undefined;

    // O advisory lock SERIALIZA a corrida, não a detecta: ele garante que as
    // duas represcrições não rodem ao mesmo tempo, e nada mais. Entre ler o
    // diálogo e clicar "Salvar mesmo assim" o outro coordenador pode ter
    // represcrito — o teto que o coordenador leu na frase já não é o vigente, e
    // gravar por cima apagaria a decisão do outro sem ninguém ver. Por isso o
    // confirm carrega o teto que ele viu, e divergência recusa em vez de
    // sobrescrever.
    if (confirmado) {
      // Campo AUSENTE ≠ campo vazio. Vazio é uma resposta legítima ("não havia
      // prescrição vigente quando eu li o diálogo"); ausente é chamador que não
      // cumpriu o contrato do confirm. Tratar os dois como a mesma coisa faria
      // um bug de programação chegar ao coordenador como "a prescrição mudou
      // enquanto você confirmava" — mensagem que manda recarregar a página para
      // um problema que recarregar não resolve.
      if (!formData.has("horasAtuaisEsperadas")) {
        return {
          error:
            "Confirmação incompleta: recarregue a página e refaça a alteração.",
        };
      }
      const esperadoBruto = String(
        formData.get("horasAtuaisEsperadas") ?? "",
      ).trim();
      const esperado = esperadoBruto ? Number(esperadoBruto) : undefined;
      if (esperado !== horasAtuais) {
        return {
          error: `A prescrição de ${disciplina} mudou enquanto você confirmava (${
            horasAtuais === undefined
              ? "ela deixou de estar vigente"
              : `agora vale ${formatarHoras(horasAtuais)}`
          }). Recarregue a página e refaça a alteração.`,
        };
      }
    }

    // §MV4 — o caso mais caro de errar. Só há o que confirmar quando a equipe
    // já entrega mais do que o novo teto; prescrição nova (sem equipe) e
    // aumento de carga seguem salvando direto, sem diálogo no caminho.
    const alocacao = await somarAlocadoVigente(tx, patientId, disciplina);
    const ficaSobrealocada = alocacao.horasAlocadas > horas;
    if (ficaSobrealocada && !confirmado) {
      return {
        confirmacao: {
          disciplina,
          // Ausente de propósito quando não há prescrição vigente: a disciplina
          // tem equipe mas nunca teve teto (§3.1), e "passa de 0h" inventaria
          // uma prescrição anterior.
          horasAtuais,
          horasNovas: horas,
          horasAlocadas: alocacao.horasAlocadas,
          ...frasesDoEstadoResultante(disciplina, horas, alocacao),
        },
      };
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

    await desarquivarPacienteSeArquivado(
      tx,
      ctx,
      patientId,
      "prescricao_disciplina",
    );

    // O trabalho não termina aqui: quem confirmou a redução precisa ir ajustar
    // as horas dos membros, e a tela usa este campo para levá-lo até a barra da
    // disciplina afetada.
    return ficaSobrealocada
      ? { ok: true, disciplinaSobrealocada: disciplina }
      : { ok: true };
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
