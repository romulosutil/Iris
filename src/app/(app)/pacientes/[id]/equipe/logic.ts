import "server-only";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import { careTeamMembership, patientAlvoDisciplina } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import {
  ehCargaValida,
  formatarHoras,
  HORAS_MAX_SEMANA,
  papelConsomeSaldo,
  parseHoras,
} from "@/lib/horas";
import { chaveDisciplina } from "./cobertura";

/**
 * Alocação da equipe — o CONSUMO da carga prescrita (#203, fatia 4).
 *
 * Até a fatia 3 este arquivo aceitava qualquer disciplina em texto livre e
 * nenhuma hora: dava para alocar 40h de Fono num paciente com 8h prescritas e
 * nada avisava. Agora a prescrição é o TETO, e três coisas mudam de natureza:
 *
 *   A disciplina deixa de ser texto livre. Só se aloca no que está prescrito
 *   vigente. A saída "Outra" some — quem precisa de disciplina nova prescreve
 *   primeiro, na ficha clínica. A prescrição vira o único ponto de entrada de
 *   disciplina, que é o que "pilar mestre" significa.
 *
 *   As horas passam a ser obrigatórias em papel que consome (D-D) e PROIBIDAS
 *   em `coordenador_referencia` (D-C, gestão não é carga clínica). A coluna
 *   segue nullable no banco pelos vínculos legado — a obrigatoriedade é de
 *   aplicação, não `NOT NULL`.
 *
 *   Inserção e edição compartilham UMA validação (`validarSaldoDisciplina`).
 *   Editar muda o saldo de DUAS disciplinas (sai de uma, entra na outra); com a
 *   regra escrita duas vezes, as duas versões divergem (plano §4.6).
 */

type EquipeState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
};

// Espelha o CHECK ctm_papel do banco. Validação de app dá erro amigável antes
// de o CHECK do Postgres estourar.
const PAPEIS_EQUIPE = [
  "terapeuta_referencia",
  "coordenador_referencia",
  "substituto",
] as const;

/** Data de hoje no fuso da clínica, resolvida pelo Postgres. */
const HOJE_BR = sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

/**
 * Código do Postgres para violação de unique — aqui, sempre o índice parcial
 * `ctm_unico_vigente` da 0076 (duplo-clique no submit).
 */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * O Drizzle EMBRULHA o erro do driver num `DrizzleQueryError` ("Failed query:
 * insert into …") e pendura o `PostgresError` original em `cause`. Checar só o
 * `code` do topo devolve `false` sempre — e o duplo-clique, que é justamente o
 * caso comum, chegaria ao usuário como stack trace de 500 em vez da frase que
 * diz o que aconteceu. Por isso a cadeia de `cause` é percorrida.
 */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  let atual: unknown = erro;
  for (let i = 0; i < 5 && atual; i++) {
    if (
      typeof atual === "object" &&
      "code" in atual &&
      (atual as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }
    atual =
      typeof atual === "object" && "cause" in atual
        ? (atual as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

/**
 * Serializa as alocações da MESMA disciplina do MESMO paciente.
 *
 * Sem isto, validar saldo lendo e depois inserindo é TOCTOU clássico: duas
 * alocações simultâneas de 6h contra 8h restantes passam AS DUAS, e a barra
 * estoura sem que nenhum dos dois coordenadores tenha feito nada errado.
 *
 * Lock ADVISORY, não `SELECT … FOR UPDATE`: o row lock do Postgres exige
 * privilégio de UPDATE em NÍVEL DE TABELA, e tanto a 0044 (equipe) quanto a
 * 0077 (prescrição) revogaram UPDATE de tabela e concedem coluna a coluna — o
 * `FOR UPDATE` falharia com "permission denied for table …". O advisory lock
 * não toca em privilégio nenhum e morre com a transação (`_xact_`).
 *
 * A CHAVE É A MESMA de `travarDisciplina` em `prescricao-logic.ts`
 * (`patientId:disciplina`, namespace 203) — de propósito: represcrever e alocar
 * a mesma disciplina ao mesmo tempo também é corrida, e é justamente a que
 * produz sobrealocação sem culpado.
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
 * Trava várias disciplinas em ordem determinística.
 *
 * Edição que troca de disciplina precisa das duas travadas (sai de uma, entra
 * na outra). Travar em ordem alfabética faz duas transações concorrentes
 * pedirem os locks na MESMA ordem — sem isso, uma pegando Fono→TO e a outra
 * TO→Fono se travam mutuamente e o Postgres mata uma por deadlock.
 */
async function travarDisciplinas(
  tx: Tx,
  patientId: string,
  disciplinas: readonly string[],
): Promise<void> {
  const unicas = [...new Set(disciplinas.map((d) => d.trim()))].sort();
  for (const d of unicas) await travarDisciplina(tx, patientId, d);
}

type ResultadoSaldo = { error?: string; disciplinaPrescrita?: string };

/**
 * A regra de saldo, num lugar só — usada por inserção E edição (plano §4.6).
 *
 * Roda SEMPRE dentro da transação que vai gravar, e sempre depois do lock:
 * é a leitura que a gravação usa como base, então lê-la fora da transação
 * reintroduziria o TOCTOU que o lock existe para fechar.
 *
 * `ignorarMembershipId` existe para a edição: ao recalcular o saldo da
 * disciplina de um membro que já está lá, a linha dele mesma não pode entrar na
 * soma — senão editar 8h para 10h contaria as 8h antigas junto e recusaria uma
 * alteração perfeitamente cabível.
 */
async function validarSaldoDisciplina(
  tx: Tx,
  params: {
    patientId: string;
    disciplina: string;
    horas: number | null;
    papel: string;
    ignorarMembershipId?: string;
  },
): Promise<ResultadoSaldo> {
  const { patientId, disciplina, horas, papel, ignorarMembershipId } = params;

  // Prescrição vigente da disciplina. Comparação case-insensitive porque
  // `disciplina` é `text` livre nas duas tabelas: "fonoaudiologia" alocado
  // contra "Fonoaudiologia" prescrito é a MESMA disciplina clínica, e tratá-las
  // como distintas partiria o saldo em dois em silêncio.
  const [alvo] = await tx
    .select({
      disciplina: patientAlvoDisciplina.disciplina,
      horasAlvoSemana: patientAlvoDisciplina.horasAlvoSemana,
    })
    .from(patientAlvoDisciplina)
    .where(
      and(
        eq(patientAlvoDisciplina.patientId, patientId),
        sql`lower(btrim(${patientAlvoDisciplina.disciplina})) = ${chaveDisciplina(disciplina)}`,
        isNull(patientAlvoDisciplina.vigenciaFim),
      ),
    );

  if (!alvo) {
    return {
      error: `${disciplina} não está prescrita para este paciente. Prescreva a disciplina na ficha clínica antes de alocar alguém nela.`,
    };
  }

  // Gestão não consome (D-C): o CHECK `ctm_gestao_sem_horas` já proíbe horas
  // nesse papel, e sem horas não há o que validar contra o teto.
  if (!papelConsomeSaldo(papel)) {
    return { disciplinaPrescrita: alvo.disciplina };
  }

  // D-D: horas obrigatórias em vínculo novo de papel que consome. Sem isto a
  // barra nasce mentindo (mostra 8h/20h com cinco terapeutas atendendo) e nunca
  // se recupera, porque ninguém volta para preencher.
  if (horas === null) {
    return { error: `Informe as horas semanais de ${alvo.disciplina}.` };
  }
  if (!ehCargaValida(horas)) {
    return {
      error: `Carga horária inválida: informe um valor maior que zero, de 30 em 30 minutos, até ${formatarHoras(HORAS_MAX_SEMANA)} por semana.`,
    };
  }

  // Soma dos vínculos VIGENTES que consomem, na mesma transação e sob o mesmo
  // lock. `COALESCE(…, 0)` porque vínculo legado sem horas soma zero — ele
  // aparece na tela com o chip `Horas não definidas`, não some da conta em
  // silêncio (plano §4.2).
  const [linha] = await tx
    .select({
      alocado: sql<string>`COALESCE(SUM(${careTeamMembership.horasSemana}), 0)`,
    })
    .from(careTeamMembership)
    .where(
      and(
        eq(careTeamMembership.patientId, patientId),
        sql`lower(btrim(${careTeamMembership.disciplina})) = ${chaveDisciplina(disciplina)}`,
        // §4.5: filtro de vigência SEM EXCEÇÃO. Esquecer aqui soma vínculo
        // encerrado e recusa alocação legítima citando horas que ninguém entrega.
        isNull(careTeamMembership.vigenciaFim),
        sql`${careTeamMembership.papelNaEquipe} <> 'coordenador_referencia'`,
        ignorarMembershipId
          ? ne(careTeamMembership.id, ignorarMembershipId)
          : undefined,
      ),
    );

  const alvoHoras = parseHoras(alvo.horasAlvoSemana) ?? 0;
  const jaAlocado = parseHoras(linha?.alocado) ?? 0;
  const restante = alvoHoras - jaAlocado;

  if (horas > restante) {
    // Mensagem com o saldo REAL, nunca "erro ao salvar": quando o perdedor de
    // uma corrida recebe este texto, o número já é o pós-transação vencedora, e
    // é isso que diz a ele o que fazer em seguida.
    return {
      error:
        restante <= 0
          ? `Não foi possível alocar ${formatarHoras(horas)}: ${alvo.disciplina} já está com as ${formatarHoras(alvoHoras)} prescritas alocadas. Reduza as horas de um membro ou aumente a prescrição.`
          : `Não foi possível alocar ${formatarHoras(horas)}: restam ${formatarHoras(restante)} em ${alvo.disciplina}.`,
    };
  }

  return { disciplinaPrescrita: alvo.disciplina };
}

/**
 * Lê e valida os campos de horas do formulário.
 *
 * Devolve `null` para "não informado" — distinto de zero. `Number("")` é 0, e
 * sem esta separação um campo vazio viraria carga zero: o vínculo entraria
 * consumindo nada e a barra afirmaria uma cobertura que não existe.
 */
function lerHoras(formData: FormData): {
  horas: number | null;
  error?: string;
} {
  const bruto = String(formData.get("horasSemana") ?? "").trim();
  if (!bruto) return { horas: null };
  const n = Number(bruto.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { horas: null, error: "Horas semanais inválidas." };
  }
  return { horas: n };
}

/** Núcleo testável — recebe ctx (nunca do request). */
async function adicionarMembroEquipeCore(
  ctx: TenantContext,
  patientId: string,
  formData: FormData,
): Promise<EquipeState> {
  requireRole(ctx, "coordenador");
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Selecione um terapeuta." };

  // A disciplina vem do dropdown restrito às prescritas — não há mais campo
  // livre "Outra". `validarSaldoDisciplina` confirma contra o banco: o valor do
  // form é sugestão do cliente, não autoridade.
  const disciplina = String(formData.get("disciplina") ?? "").trim();
  if (!disciplina) return { error: "Informe a disciplina." };

  const papelNaEquipe = String(formData.get("papelNaEquipe") ?? "").trim();
  if (
    !PAPEIS_EQUIPE.includes(papelNaEquipe as (typeof PAPEIS_EQUIPE)[number])
  ) {
    return { error: "Papel na equipe inválido." };
  }

  const { horas, error: erroHoras } = lerHoras(formData);
  if (erroHoras) return { error: erroHoras };
  // D-C: gestão não tem carga. O CHECK `ctm_gestao_sem_horas` recusaria, mas o
  // erro nu do Postgres cita o nome da constraint e não diz o que fazer.
  if (horas !== null && !papelConsomeSaldo(papelNaEquipe)) {
    return {
      error:
        "Coordenador de referência é gestão do caso e não recebe carga horária. Para registrar atendimento, adicione um segundo vínculo como terapeuta de referência.",
    };
  }

  const responsavelTecnicoId =
    String(formData.get("responsavelTecnicoId") ?? "").trim() || undefined;
  // Espelha o CHECK ctm_nao_auto_supervisao.
  if (responsavelTecnicoId && responsavelTecnicoId === userId) {
    return {
      error: "Um terapeuta não pode ser responsável técnico de si mesmo.",
    };
  }

  try {
    return await withTenant(ctx, async (tx) => {
      await travarDisciplina(tx, patientId, disciplina);

      const saldo = await validarSaldoDisciplina(tx, {
        patientId,
        disciplina,
        horas,
        papel: papelNaEquipe,
      });
      if (saldo.error) return { error: saldo.error };

      await tx.insert(careTeamMembership).values({
        patientId,
        userId,
        // Grava o rótulo COMO ESTÁ PRESCRITO, não como veio do form: assim a
        // grafia da equipe nunca diverge da grafia da prescrição, e a barra não
        // depende de normalização para fechar a conta.
        disciplina: saldo.disciplinaPrescrita ?? disciplina,
        papelNaEquipe,
        horasSemana: horas === null ? null : horas.toFixed(1),
        responsavelTecnicoId,
      });

      return { ok: true };
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      // Índice parcial `ctm_unico_vigente` (0076). O caso comum é duplo-clique
      // no submit — que sem o índice viraria DUPLA CONTAGEM de carga, com a
      // barra estourando sem causa visível na tela.
      return {
        error:
          "Este profissional já está na equipe nesta disciplina e neste papel.",
      };
    }
    throw erro;
  }
}

/**
 * Conta em somente-leitura não monta nem desmonta equipe (#163+#159): montar
 * equipe é o que dá acesso ao prontuário pela RLS, então seria concessão de
 * acesso novo numa conta sem relação comercial vigente.
 */
export const adicionarMembroEquipe = comEscrita(adicionarMembroEquipeCore);

/**
 * Edita disciplina, papel e horas de um vínculo vigente.
 *
 * Existe porque sem edição a única forma de corrigir 8h digitadas como 18h é
 * encerrar o vínculo e criar outro — e encerrar CORTA O ACESSO ao prontuário
 * (D-A) além de sujar o histórico com uma saída que nunca aconteceu.
 *
 * Passa pela MESMA `validarSaldoDisciplina` da inserção. Como a alteração pode
 * mover carga entre duas disciplinas, ambas são travadas antes de qualquer
 * leitura.
 */
async function editarMembroEquipeCore(
  ctx: TenantContext,
  patientId: string,
  membershipId: string,
  formData: FormData,
): Promise<EquipeState> {
  requireRole(ctx, "coordenador");
  if (!membershipId.trim()) return { error: "Vínculo não informado." };

  const disciplina = String(formData.get("disciplina") ?? "").trim();
  if (!disciplina) return { error: "Informe a disciplina." };

  const papelNaEquipe = String(formData.get("papelNaEquipe") ?? "").trim();
  if (
    !PAPEIS_EQUIPE.includes(papelNaEquipe as (typeof PAPEIS_EQUIPE)[number])
  ) {
    return { error: "Papel na equipe inválido." };
  }

  const { horas, error: erroHoras } = lerHoras(formData);
  if (erroHoras) return { error: erroHoras };
  if (horas !== null && !papelConsomeSaldo(papelNaEquipe)) {
    return {
      error:
        "Coordenador de referência é gestão do caso e não recebe carga horária. Para registrar atendimento, adicione um segundo vínculo como terapeuta de referência.",
    };
  }

  try {
    return await withTenant(ctx, async (tx) => {
      const [atual] = await tx
        .select({
          id: careTeamMembership.id,
          disciplina: careTeamMembership.disciplina,
          vigenciaFim: careTeamMembership.vigenciaFim,
        })
        .from(careTeamMembership)
        .where(
          and(
            eq(careTeamMembership.id, membershipId),
            eq(careTeamMembership.patientId, patientId),
          ),
        );

      // Leitura vazia aqui é RLS barrando OU vínculo de outro paciente — nos
      // dois casos a tela do coordenador está desatualizada e ele precisa saber.
      if (!atual) {
        return { error: "Vínculo não encontrado — recarregue a página." };
      }
      // Vínculo encerrado é histórico. Editá-lo reescreveria o que já foi
      // entregue e faria a carga de uma semana passada mudar retroativamente.
      if (atual.vigenciaFim) {
        return {
          error: "Este vínculo já foi encerrado e não pode ser editado.",
        };
      }

      await travarDisciplinas(tx, patientId, [atual.disciplina, disciplina]);

      const saldo = await validarSaldoDisciplina(tx, {
        patientId,
        disciplina,
        horas,
        papel: papelNaEquipe,
        // Sem isto, editar as horas do próprio membro contaria as antigas junto
        // com as novas e recusaria uma alteração perfeitamente cabível.
        ignorarMembershipId: membershipId,
      });
      if (saldo.error) return { error: saldo.error };

      const linhas = await tx
        .update(careTeamMembership)
        .set({
          disciplina: saldo.disciplinaPrescrita ?? disciplina,
          papelNaEquipe,
          horasSemana: horas === null ? null : horas.toFixed(1),
        })
        .where(
          and(
            eq(careTeamMembership.id, membershipId),
            isNull(careTeamMembership.vigenciaFim),
          ),
        )
        .returning({ id: careTeamMembership.id });

      // UPDATE barrado por RLS afeta 0 LINHAS EM SILÊNCIO — não estoura. Sem
      // este guard a tela diria "salvo" com o banco intacto.
      if (linhas.length === 0) {
        return {
          error: "Não foi possível salvar a alteração — recarregue a página.",
        };
      }

      return { ok: true };
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      return {
        error:
          "Este profissional já está na equipe nesta disciplina e neste papel.",
      };
    }
    throw erro;
  }
}

export const editarMembroEquipe = comEscrita(editarMembroEquipeCore);

/**
 * Encerra o vínculo append-only: marca `vigenciaFim`, nunca deleta (histórico).
 *
 * Duas coisas acontecem no mesmo ato, e a UI precisa dizer as duas (plano §3.3):
 * as horas VOLTAM para o saldo da disciplina (a soma de cobertura filtra
 * vigentes) e o profissional PERDE O ACESSO ao prontuário na consulta seguinte
 * — `app_is_on_team` filtra `vigencia_fim IS NULL` e governa a leitura de todas
 * as tabelas clínicas (D-A, corte imediato, sem carência).
 *
 * Devolve disciplina e horas devolvidas para o toast da fatia 6 poder nomear o
 * número que mudou na tela.
 */
async function encerrarVinculoEquipeCore(
  ctx: TenantContext,
  membershipId: string,
): Promise<EquipeState & { disciplina?: string; horasDevolvidas?: number }> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const linhas = await tx
      .update(careTeamMembership)
      // Data no fuso do Brasil, resolvida pelo Postgres — evita off-by-one por
      // UTC em encerramentos feitos à noite (UTC-3) (Jules WARN).
      .set({ vigenciaFim: HOJE_BR })
      .where(
        and(
          eq(careTeamMembership.id, membershipId),
          // Reencerrar um vínculo já encerrado moveria a data de saída para
          // hoje e reescreveria histórico — o `vigencia_fim` de quem saiu em
          // março não pode virar agosto por um duplo-clique.
          isNull(careTeamMembership.vigenciaFim),
        ),
      )
      .returning({
        disciplina: careTeamMembership.disciplina,
        horasSemana: careTeamMembership.horasSemana,
        papelNaEquipe: careTeamMembership.papelNaEquipe,
      });

    const encerrado = linhas[0];
    if (!encerrado) {
      return {
        error: "Nenhum vínculo vigente para encerrar — recarregue a página.",
      };
    }

    return {
      ok: true,
      disciplina: encerrado.disciplina,
      horasDevolvidas: papelConsomeSaldo(encerrado.papelNaEquipe)
        ? (parseHoras(encerrado.horasSemana) ?? 0)
        : 0,
    };
  });
}

export const encerrarVinculoEquipe = comEscrita(encerrarVinculoEquipeCore);
