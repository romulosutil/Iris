import { and, asc, count, eq, gt, gte, ilike, inArray, isNull, lt, lte, max, min, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAgendar, requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import type { SessaoDoDia } from "./actions";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "@/app/(app)/agenda/fuso";
import { diasDaSemana, vigenciaInicioC7 } from "@/lib/agenda/semana";
import { paraDataLocal, paraMinutosLocais } from "@/lib/agenda/fuso-min";
import {
  projetarSemana,
  type AvulsaProjecao,
  type BlocoAgenda,
  type RegraProjecao,
} from "@/lib/agenda/projecao";
import { horaParaMin, type FaixaDia } from "@/lib/agenda/janela";
import { conflita, type Slot } from "@/lib/agenda/conflito";
import {
  datasDaRegra,
  horizontePadrao,
  proximoDia,
  resolverInstante,
  type BloqueioPeriodo,
} from "@/lib/agenda/materializar";

export async function listarPacientes(
  ctx: TenantContext,
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  requireAgendar(ctx);
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: schema.patient.id, nome: schema.patient.nome })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.clinicId, ctx.clinicId),
          ilike(schema.patient.nome, `%${termo}%`),
        ),
      )
      .orderBy(asc(schema.patient.nome))
      .limit(20),
  );
}

/** Task 8: nome do paciente p/ o prefill de reposição em `/agenda/semana`
 * (a query string só carrega `patientId` — o rótulo é resolvido aqui). */
export async function pacientePorId(
  ctx: TenantContext,
  patientId: string,
): Promise<{ id: string; nome: string } | null> {
  requireAgendar(ctx);
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: schema.patient.id, nome: schema.patient.nome })
      .from(schema.patient)
      .where(and(eq(schema.patient.id, patientId), eq(schema.patient.clinicId, ctx.clinicId)))
      .limit(1),
  );
  return row ?? null;
}

export interface CarregarSemanaParams {
  eixo: "terapeuta" | "paciente";
  entidadeId: string;
  semanaInicioISO: string;
}
export interface SemanaCarregada {
  blocos: BlocoAgenda[];
  janelas: FaixaDia[]; // só preenchido quando eixo="terapeuta"
  bloqueios: { dataInicio: string; dataFim: string }[];
}

export async function carregarSemana(
  ctx: TenantContext,
  { eixo, entidadeId, semanaInicioISO }: CarregarSemanaParams,
): Promise<SemanaCarregada> {
  requireAgendar(ctx);
  const dias = diasDaSemana(semanaInicioISO);
  const primeiro = dias[0]!;
  const ultimo = dias[6]!;
  const colEntidade =
    eixo === "terapeuta"
      ? schema.agendamentoRecorrente.terapeutaId
      : schema.agendamentoRecorrente.patientId;
  const colRotulo =
    eixo === "terapeuta" ? schema.patient.nome : schema.appUser.name;

  return withTenant(ctx, async (tx) => {
    // Regras ativas vigentes na semana (previsto).
    const regrasRaw = await tx
      .select({
        id: schema.agendamentoRecorrente.id,
        diaSemana: schema.agendamentoRecorrente.diaSemana,
        horaInicio: schema.agendamentoRecorrente.horaInicio,
        duracaoMin: schema.agendamentoRecorrente.duracaoMin,
        disciplina: schema.agendamentoRecorrente.disciplina,
        rotulo: colRotulo,
      })
      .from(schema.agendamentoRecorrente)
      .innerJoin(
        schema.patient,
        eq(schema.agendamentoRecorrente.patientId, schema.patient.id),
      )
      .innerJoin(
        schema.appUser,
        eq(schema.agendamentoRecorrente.terapeutaId, schema.appUser.id),
      )
      .where(
        and(
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
          eq(colEntidade, entidadeId),
          eq(schema.agendamentoRecorrente.status, "ativo"),
          lte(schema.agendamentoRecorrente.vigenciaInicio, ultimo),
        ),
      );
    // Sessões concretas (avulsas + materializadas, estado="agendada") na
    // janela de datas. Etapa D (F2): não filtra mais isNull(recorrenteId) —
    // materializadas também aparecem como bloco "concreto". O de-dup contra
    // "previsto" é feito via recorrentesConcretos abaixo.
    const colSessEntidade =
      eixo === "terapeuta" ? schema.session.terapeutaId : schema.session.patientId;
    const avulsasRaw = await tx
      .select({
        id: schema.session.id,
        agendadaPara: schema.session.agendadaPara,
        duracaoMin: schema.session.duracaoMin,
        disciplina: schema.session.disciplina,
        rotulo: colRotulo,
        recorrenteId: schema.session.recorrenteId,
      })
      .from(schema.session)
      .innerJoin(schema.patient, eq(schema.session.patientId, schema.patient.id))
      .innerJoin(schema.appUser, eq(schema.session.terapeutaId, schema.appUser.id))
      .where(
        and(
          eq(schema.session.clinicId, ctx.clinicId),
          eq(colSessEntidade, entidadeId),
          eq(schema.session.estado, "agendada"),
          gte(
            schema.session.agendadaPara,
            new Date(`${primeiro}T00:00:00${FUSO_CLINICA_OFFSET}`),
          ),
          lte(
            schema.session.agendadaPara,
            new Date(`${ultimo}T23:59:59${FUSO_CLINICA_OFFSET}`),
          ),
        ),
      );
    const recorrentesConcretos = new Set(
      avulsasRaw.filter((a) => a.recorrenteId).map((a) => a.recorrenteId as string),
    );
    const avulsas: AvulsaProjecao[] = avulsasRaw.map((a) => {
      const { diaSemana, inicioMin } = paraMinutosLocais(a.agendadaPara, FUSO_CLINICA);
      return {
        id: a.id,
        diaSemana,
        inicioMin,
        duracaoMin: a.duracaoMin,
        disciplina: a.disciplina ?? "—",
        rotulo: a.rotulo ?? "—",
        recorrenteId: a.recorrenteId ?? undefined,
      };
    });

    // Regra só é projetada como "previsto" se não houver sessão concreta dela
    // nesta semana (de-dup por recorrenteId) — evita bloco duplicado quando a
    // regra já foi materializada (F2).
    const regras: RegraProjecao[] = regrasRaw
      .filter((r) => !recorrentesConcretos.has(r.id))
      .map((r) => ({
        id: r.id,
        diaSemana: r.diaSemana,
        horaInicio: r.horaInicio,
        duracaoMin: r.duracaoMin,
        disciplina: r.disciplina,
        rotulo: r.rotulo ?? "—",
      }));

    // Janelas de trabalho (só no eixo terapeuta).
    let janelas: FaixaDia[] = [];
    if (eixo === "terapeuta") {
      const jr = await tx
        .select({
          diaSemana: schema.janelaTrabalho.diaSemana,
          horaInicio: schema.janelaTrabalho.horaInicio,
          horaFim: schema.janelaTrabalho.horaFim,
        })
        .from(schema.janelaTrabalho)
        .where(eq(schema.janelaTrabalho.terapeutaId, entidadeId));
      janelas = jr.map((j) => ({
        diaSemana: j.diaSemana,
        horaInicio: j.horaInicio,
        horaFim: j.horaFim,
      }));
    }

    // Bloqueios que tocam a semana (do escopo aplicável).
    const bloq = await tx
      .select({
        dataInicio: schema.bloqueio.dataInicio,
        dataFim: schema.bloqueio.dataFim,
      })
      .from(schema.bloqueio)
      .where(
        and(
          eq(schema.bloqueio.clinicId, ctx.clinicId),
          lte(schema.bloqueio.dataInicio, ultimo),
          gte(schema.bloqueio.dataFim, primeiro),
        ),
      );

    const blocos = projetarSemana(regras, avulsas);
    // F2: previsto dentro do horizonte, sem sessão e não bloqueado = conflito.
    const conflitoKeys = new Set<string>();
    for (const r of regras) {
      for (const d of await conflitosNaTx(tx, ctx, r.id)) {
        if (d >= primeiro && d <= ultimo) conflitoKeys.add(`${r.id}|${d}`);
      }
    }
    const idxDia = (ds: number) => (ds === 0 ? 6 : ds - 1); // diaSemana→índice em dias (seg..dom)
    const blocosMarcados = blocos.map((b) =>
      b.origem === "previsto" &&
      b.recorrenteId &&
      conflitoKeys.has(`${b.recorrenteId}|${dias[idxDia(b.diaSemana)]}`)
        ? { ...b, origem: "conflito" as const }
        : b,
    );
    return { blocos: blocosMarcados, janelas, bloqueios: bloq };
  });
}

export class ConflitoError extends Error {
  constructor(public dimensao: "terapeuta" | "paciente" | "disciplina", mensagem?: string) {
    super(mensagem ?? `Horário em conflito para ${dimensao}.`);
    this.name = "ConflitoError";
  }
}

export interface NovaRegra {
  patientId: string;
  terapeutaId: string;
  disciplina: string;
  diaSemana: number;
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  semanaVisivelISO: string;
  hojeISO: string;
}

/** C1: cria só a regra recorrente (nenhuma linha `session`). C2/C5: pré-check
 * de conflito nas 2 dimensões (terapeuta e paciente) antes de gravar. */
export async function criarRegra(
  ctx: TenantContext,
  dados: NovaRegra,
): Promise<{ id: string }> {
  requireAgendar(ctx);
  const { disciplinas } = await carregarConfigClinica(ctx);
  if (!disciplinas.includes(dados.disciplina)) {
    throw new ConflitoError("disciplina", "Disciplina não configurada nesta clínica.");
  }
  const inicioMin = horaParaMin(dados.horaInicio);
  const novo: Slot = {
    diaSemana: dados.diaSemana,
    inicioMin,
    fimMin: inicioMin + dados.duracaoMin,
  };
  const vigenciaInicio = vigenciaInicioC7(dados.semanaVisivelISO, dados.hojeISO);

  return withTenant(ctx, async (tx) => {
    const ativas = await tx
      .select({
        terapeutaId: schema.agendamentoRecorrente.terapeutaId,
        patientId: schema.agendamentoRecorrente.patientId,
        diaSemana: schema.agendamentoRecorrente.diaSemana,
        horaInicio: schema.agendamentoRecorrente.horaInicio,
        duracaoMin: schema.agendamentoRecorrente.duracaoMin,
      })
      .from(schema.agendamentoRecorrente)
      .where(
        and(
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
          eq(schema.agendamentoRecorrente.status, "ativo"),
          eq(schema.agendamentoRecorrente.diaSemana, dados.diaSemana),
        ),
      );
    const paraSlots = (rows: typeof ativas): Slot[] =>
      rows.map((r) => {
        const ini = horaParaMin(r.horaInicio);
        return { diaSemana: r.diaSemana, inicioMin: ini, fimMin: ini + r.duracaoMin };
      });

    // Avulsas (session recorrenteId null) no mesmo dia-da-semana, agendadas a
    // partir da vigência da nova regra — a regra não tem linha `session`,
    // então o EXCLUDE gist não enxerga esse lado do conflito (buraco
    // regra×avulsa fechado aqui em app-level, nas 2 dimensões).
    const avulsasRaw = await tx
      .select({
        terapeutaId: schema.session.terapeutaId,
        patientId: schema.session.patientId,
        agendadaPara: schema.session.agendadaPara,
        duracaoMin: schema.session.duracaoMin,
      })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.clinicId, ctx.clinicId),
          eq(schema.session.estado, "agendada"),
          isNull(schema.session.recorrenteId),
          gte(schema.session.agendadaPara, new Date(`${vigenciaInicio}T00:00:00${FUSO_CLINICA_OFFSET}`)),
        ),
      );
    const avulsasDoDia = avulsasRaw
      .map((a) => {
        const { diaSemana, inicioMin } = paraMinutosLocais(a.agendadaPara, FUSO_CLINICA);
        return { terapeutaId: a.terapeutaId, patientId: a.patientId, diaSemana, inicioMin, duracaoMin: a.duracaoMin };
      })
      .filter((a) => a.diaSemana === dados.diaSemana);
    const paraSlotsAvulsas = (
      rows: typeof avulsasDoDia,
    ): Slot[] =>
      rows.map((r) => ({ diaSemana: r.diaSemana, inicioMin: r.inicioMin, fimMin: r.inicioMin + r.duracaoMin }));

    if (
      conflita(novo, paraSlots(ativas.filter((r) => r.terapeutaId === dados.terapeutaId))) ||
      conflita(
        novo,
        paraSlotsAvulsas(avulsasDoDia.filter((a) => a.terapeutaId === dados.terapeutaId)),
      )
    ) {
      throw new ConflitoError("terapeuta");
    }
    if (
      conflita(novo, paraSlots(ativas.filter((r) => r.patientId === dados.patientId))) ||
      conflita(
        novo,
        paraSlotsAvulsas(avulsasDoDia.filter((a) => a.patientId === dados.patientId)),
      )
    ) {
      throw new ConflitoError("paciente");
    }
    const [row] = await tx
      .insert(schema.agendamentoRecorrente)
      .values({
        clinicId: ctx.clinicId,
        patientId: dados.patientId,
        terapeutaId: dados.terapeutaId,
        disciplina: dados.disciplina,
        diaSemana: dados.diaSemana,
        horaInicio: dados.horaInicio,
        duracaoMin: dados.duracaoMin,
        vigenciaInicio,
        status: "ativo",
      })
      .returning({ id: schema.agendamentoRecorrente.id });

    const fusoRow = await tx
      .select({ timezone: schema.clinic.timezone })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    const bloqueios = await tx
      .select({ dataInicio: schema.bloqueio.dataInicio, dataFim: schema.bloqueio.dataFim })
      .from(schema.bloqueio)
      .where(
        and(
          eq(schema.bloqueio.clinicId, ctx.clinicId),
          or(
            eq(schema.bloqueio.escopo, "clinica"),
            and(eq(schema.bloqueio.escopo, "terapeuta"), eq(schema.bloqueio.terapeutaId, dados.terapeutaId)),
            and(eq(schema.bloqueio.escopo, "paciente"), eq(schema.bloqueio.patientId, dados.patientId)),
          ),
        ),
      );
    await materializarNaTx(tx, {
      regra: {
        id: row!.id, clinicId: ctx.clinicId, patientId: dados.patientId,
        terapeutaId: dados.terapeutaId, disciplina: dados.disciplina,
        diaSemana: dados.diaSemana, horaInicio: dados.horaInicio, duracaoMin: dados.duracaoMin,
        vigenciaInicio, vigenciaFim: null,
      },
      bloqueios,
      fuso: fusoRow[0]?.timezone ?? "America/Sao_Paulo",
      deISO: vigenciaInicio,
      ateISO: horizontePadrao(dados.hojeISO),
    });
    return row!;
  });
}

export interface NovaAvulsa {
  patientId: string;
  terapeutaId: string;
  disciplina: string;
  // "terapia": reposição (Task 8) — a avulsa repõe uma sessão de terapia
  // comum, não é um dos tipos especiais abaixo.
  tipo: "terapia" | "avaliacao" | "devolutiva" | "reuniao_pais" | "outro";
  dataISO: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  modalidade: "presencial" | "online";
  /** Reposição: quando presente, aponta para a sessão `falta_*` original que
   * esta avulsa está repondo (self-FK, `ON DELETE SET NULL`). */
  repostaDe?: string;
}

/** Cria uma sessão avulsa (`recorrenteId=null`, `estado="agendada"`), ancorada
 * no fuso da clínica (C10). Pré-check app-level contra REGRAS ativas no mesmo
 * dia-da-semana fecha o buraco regra×avulsa (a regra não tem linha `session`,
 * então o EXCLUDE gist do banco não a vê). O EXCLUDE gist
 * (`session_no_overbook_*`) segue como backstop TOCTOU contra overbook
 * avulsa×avulsa concorrente — a violação (23P01) é capturada aqui e
 * relançada como `ConflitoError`. */
export async function criarAvulsa(
  ctx: TenantContext,
  dados: NovaAvulsa,
): Promise<{ id: string }> {
  requireAgendar(ctx);
  const { disciplinas } = await carregarConfigClinica(ctx);
  if (!disciplinas.includes(dados.disciplina)) {
    throw new ConflitoError("disciplina", "Disciplina não configurada nesta clínica.");
  }
  const diaSemana = new Date(`${dados.dataISO}T00:00:00Z`).getUTCDay();
  const inicioMin = horaParaMin(dados.horaInicio);
  const novo: Slot = { diaSemana, inicioMin, fimMin: inicioMin + dados.duracaoMin };
  try {
    return await withTenant(ctx, async (tx) => {
      const [clinicRow] = await tx
        .select({ timezone: schema.clinic.timezone })
        .from(schema.clinic)
        .where(eq(schema.clinic.id, ctx.clinicId));
      const agendadaPara = resolverInstante(
        dados.dataISO,
        dados.horaInicio,
        clinicRow?.timezone ?? "America/Sao_Paulo",
      );
      const regrasAtivas = await tx
        .select({
          terapeutaId: schema.agendamentoRecorrente.terapeutaId,
          patientId: schema.agendamentoRecorrente.patientId,
          horaInicio: schema.agendamentoRecorrente.horaInicio,
          duracaoMin: schema.agendamentoRecorrente.duracaoMin,
        })
        .from(schema.agendamentoRecorrente)
        .where(
          and(
            eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
            eq(schema.agendamentoRecorrente.status, "ativo"),
            eq(schema.agendamentoRecorrente.diaSemana, diaSemana),
            lte(schema.agendamentoRecorrente.vigenciaInicio, dados.dataISO),
          ),
        );
      const paraSlots = (rows: typeof regrasAtivas): Slot[] =>
        rows.map((r) => {
          const ini = horaParaMin(r.horaInicio);
          return { diaSemana, inicioMin: ini, fimMin: ini + r.duracaoMin };
        });
      if (
        conflita(novo, paraSlots(regrasAtivas.filter((r) => r.terapeutaId === dados.terapeutaId)))
      ) {
        throw new ConflitoError("terapeuta");
      }
      if (
        conflita(novo, paraSlots(regrasAtivas.filter((r) => r.patientId === dados.patientId)))
      ) {
        throw new ConflitoError("paciente");
      }
      const [row] = await tx
        .insert(schema.session)
        .values({
          clinicId: ctx.clinicId,
          patientId: dados.patientId,
          terapeutaId: dados.terapeutaId,
          recorrenteId: null,
          disciplina: dados.disciplina,
          tipo: dados.tipo,
          agendadaPara,
          duracaoMin: dados.duracaoMin,
          estado: "agendada",
          modalidade: dados.modalidade,
          repostaDe: dados.repostaDe ?? null,
        })
        .returning({ id: schema.session.id });
      return row!;
    });
  } catch (e) {
    // EXCLUDE gist (btree_gist) → SQLSTATE 23P01 exclusion_violation.
    if (codigoPg(e) === "23P01") {
      throw new ConflitoError("terapeuta");
    }
    throw e;
  }
}

export interface ConfigClinica {
  disciplinas: string[];
  duracaoDisciplina: Record<string, number>;
}

/** Config da clínica p/ pré-preencher o popover de alocação (D2): disciplinas
 * conhecidas e duração padrão por disciplina (`clinic.duracaoDisciplina`). */
export async function carregarConfigClinica(ctx: TenantContext): Promise<ConfigClinica> {
  requireAgendar(ctx);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ duracaoDisciplina: schema.clinic.duracaoDisciplina })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    const duracaoDisciplina = (row?.duracaoDisciplina as Record<string, number> | undefined) ?? {};
    return { disciplinas: Object.keys(duracaoDisciplina), duracaoDisciplina };
  });
}

export interface ResultadoMaterializacao {
  geradas: number;
  puladas: string[]; // datas ISO puladas por overbook (23P01)
}

/** SQLSTATE do erro do postgres-js (drizzle embrulha em DrizzleQueryError → .cause). */
export function codigoPg(e: unknown): string | undefined {
  return (
    (e as { code?: string } | undefined)?.code ??
    (e as { cause?: { code?: string } } | undefined)?.cause?.code
  );
}

// `Tx` = o tipo do 1º arg do callback de withTenant. Reusa a inferência local.
type TxMat = Parameters<Parameters<typeof withTenant<unknown>>[1]>[0];

interface MaterializarParams {
  regra: {
    id: string;
    clinicId: string;
    patientId: string;
    terapeutaId: string;
    disciplina: string;
    diaSemana: number;
    horaInicio: string;
    duracaoMin: number;
    vigenciaInicio: string;
    vigenciaFim: string | null;
  };
  bloqueios: BloqueioPeriodo[];
  fuso: string;
  deISO: string;
  ateISO: string;
}

/**
 * Materializa as ocorrências da regra DENTRO de uma tx já aberta. Insert por
 * savepoint (tx.transaction): 23505 (retry) → skip silencioso; 23P01 (overbook)
 * → puladas[]; outro código → rethrow (aborta a tx). Reusada por criarRegra (mesma
 * tx, atômico D-7) e materializarRegra (tx própria).
 */
export async function materializarNaTx(
  tx: TxMat,
  { regra, bloqueios, fuso, deISO, ateISO }: MaterializarParams,
): Promise<ResultadoMaterializacao> {
  const datas = datasDaRegra(
    { diaSemana: regra.diaSemana, vigenciaInicio: regra.vigenciaInicio, vigenciaFim: regra.vigenciaFim },
    deISO,
    ateISO,
    bloqueios,
  );
  let geradas = 0;
  const puladas: string[] = [];
  for (const data of datas) {
    const agendadaPara = resolverInstante(data, regra.horaInicio, fuso);
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(schema.session).values({
          clinicId: regra.clinicId,
          patientId: regra.patientId,
          terapeutaId: regra.terapeutaId,
          recorrenteId: regra.id,
          disciplina: regra.disciplina,
          agendadaPara,
          duracaoMin: regra.duracaoMin,
          estado: "agendada",
          tipo: "terapia",
        });
      });
      geradas++;
    } catch (e) {
      const code = codigoPg(e);
      if (code === "23505") continue; // idempotente (uq_session_recorrente_agendada)
      if (code === "23P01") { puladas.push(data); continue; } // overbook (EXCLUDE gist)
      throw e; // erro real → propaga, aborta a tx
    }
  }
  return { geradas, puladas };
}

/**
 * F2: re-deriva as datas "esperadas" da regra que caem DENTRO do horizonte já
 * materializado (`<= max(agendada_para)`), não estão bloqueadas, e NÃO têm
 * sessão concreta (de qualquer estado) — i.e. foram puladas por overbook
 * (23P01) na materialização. Persistente: recalculada a cada load, sem
 * coluna nova. Datas além do max = "ainda não materializado" (estender
 * resolve), NÃO são conflito.
 */
export async function conflitosNaTx(
  tx: TxMat,
  ctx: TenantContext,
  regraId: string,
): Promise<string[]> {
  const [regra] = await tx
    .select()
    .from(schema.agendamentoRecorrente)
    .where(
      and(
        eq(schema.agendamentoRecorrente.id, regraId),
        eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
      ),
    );
  if (!regra) return [];
  const [clinicRow] = await tx
    .select({ timezone: schema.clinic.timezone })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, ctx.clinicId));
  const fuso = clinicRow?.timezone ?? "America/Sao_Paulo";
  const [maxRow] = await tx
    .select({ ultimo: max(schema.session.agendadaPara) })
    .from(schema.session)
    .where(eq(schema.session.recorrenteId, regraId));
  if (!maxRow?.ultimo) return []; // nada materializado → sem conflito
  const maxISO = paraDataLocal(new Date(maxRow.ultimo), fuso);
  const bloqueios = await tx
    .select({ dataInicio: schema.bloqueio.dataInicio, dataFim: schema.bloqueio.dataFim })
    .from(schema.bloqueio)
    .where(
      and(
        eq(schema.bloqueio.clinicId, ctx.clinicId),
        or(
          eq(schema.bloqueio.escopo, "clinica"),
          and(eq(schema.bloqueio.escopo, "terapeuta"), eq(schema.bloqueio.terapeutaId, regra.terapeutaId)),
          and(eq(schema.bloqueio.escopo, "paciente"), eq(schema.bloqueio.patientId, regra.patientId)),
        ),
      ),
    );
  const esperadas = datasDaRegra(
    { diaSemana: regra.diaSemana, vigenciaInicio: regra.vigenciaInicio, vigenciaFim: regra.vigenciaFim },
    regra.vigenciaInicio,
    maxISO,
    bloqueios,
  );
  const concretasRows = await tx
    .select({ ap: schema.session.agendadaPara })
    .from(schema.session)
    .where(eq(schema.session.recorrenteId, regraId)); // QUALQUER estado (slot materializado existe)
  const concretas = new Set(concretasRows.map((r) => paraDataLocal(new Date(r.ap), fuso)));
  return esperadas.filter((d) => !concretas.has(d));
}

/** F2: expõe `conflitosNaTx` p/ a action (`requireRole`+`withTenant`). */
export async function conflitosDaRegra(ctx: TenantContext, regraId: string): Promise<string[]> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, (tx) => conflitosNaTx(tx, ctx, regraId));
}

/** Materializa a regra até `ateISO`, retomando de max(agendada_para)+1dia. */
export async function materializarRegra(
  ctx: TenantContext,
  regraId: string,
  ateISO: string,
): Promise<ResultadoMaterializacao> {
  requireAgendar(ctx);
  return withTenant(ctx, async (tx) => {
    const [regra] = await tx
      .select()
      .from(schema.agendamentoRecorrente)
      .where(
        and(
          eq(schema.agendamentoRecorrente.id, regraId),
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
        ),
      );
    if (!regra) return { geradas: 0, puladas: [] };

    const [clinicRow] = await tx
      .select({ timezone: schema.clinic.timezone })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    const fuso = clinicRow?.timezone ?? "America/Sao_Paulo";

    const [ultimoRow] = await tx
      .select({ ultimo: max(schema.session.agendadaPara) })
      .from(schema.session)
      .where(eq(schema.session.recorrenteId, regraId));
    const ultimo = ultimoRow?.ultimo ?? null;
    // deISO = max(materializado + 1 dia, vigenciaInicio)
    const deISO = ultimo
      ? proximoDia(new Date(ultimo).toISOString().slice(0, 10))
      : regra.vigenciaInicio;

    const bloqueios = await tx
      .select({ dataInicio: schema.bloqueio.dataInicio, dataFim: schema.bloqueio.dataFim })
      .from(schema.bloqueio)
      .where(
        and(
          eq(schema.bloqueio.clinicId, ctx.clinicId),
          or(
            eq(schema.bloqueio.escopo, "clinica"),
            and(eq(schema.bloqueio.escopo, "terapeuta"), eq(schema.bloqueio.terapeutaId, regra.terapeutaId)),
            and(eq(schema.bloqueio.escopo, "paciente"), eq(schema.bloqueio.patientId, regra.patientId)),
          ),
          lte(schema.bloqueio.dataInicio, ateISO),
          gte(schema.bloqueio.dataFim, deISO),
        ),
      );

    return materializarNaTx(tx, {
      regra: {
        id: regra.id, clinicId: regra.clinicId, patientId: regra.patientId,
        terapeutaId: regra.terapeutaId, disciplina: regra.disciplina,
        diaSemana: regra.diaSemana, horaInicio: regra.horaInicio, duracaoMin: regra.duracaoMin,
        vigenciaInicio: regra.vigenciaInicio, vigenciaFim: regra.vigenciaFim,
      },
      bloqueios, fuso, deISO, ateISO,
    });
  });
}

async function cutoffEncerramento(
  tx: TxMat,
  clinicId: string,
  ateFimISO: string,
): Promise<Date> {
  const [clinicRow] = await tx
    .select({ timezone: schema.clinic.timezone })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  return resolverInstante(
    proximoDia(ateFimISO),
    "00:00",
    clinicRow?.timezone ?? "America/Sao_Paulo",
  );
}

/** Etapa D (contagem): quantas sessões `agendada` futuras (a partir do dia
 * seguinte a `ateFimISO`, F5a "hoje fica, amanhã+ sai") a regra ainda tem. */
export async function contarFuturasDaRegra(
  ctx: TenantContext,
  regraId: string,
  ateFimISO: string,
): Promise<number> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const cutoff = await cutoffEncerramento(tx, ctx.clinicId, ateFimISO);
    const [row] = await tx
      .select({ n: count() })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.recorrenteId, regraId),
          eq(schema.session.estado, "agendada"),
          gte(schema.session.agendadaPara, cutoff),
        ),
      );
    return row?.n ?? 0;
  });
}

/** Etapa D (encerrar "esta e futuras"): marca a regra como `encerrado` com
 * `vigencia_fim=ateFimISO` e remove só as sessões `agendada` futuras (D-5:
 * preserva `realizada`/`falta`/`cancelada`, inclusive as futuras já lançadas). */
export async function encerrarRegra(
  ctx: TenantContext,
  regraId: string,
  ateFimISO: string,
): Promise<{ removidas: number }> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const cutoff = await cutoffEncerramento(tx, ctx.clinicId, ateFimISO);
    await tx
      .update(schema.agendamentoRecorrente)
      .set({ status: "encerrado", vigenciaFim: ateFimISO })
      .where(
        and(
          eq(schema.agendamentoRecorrente.id, regraId),
          eq(schema.agendamentoRecorrente.clinicId, ctx.clinicId),
        ),
      );
    const removidas = await tx
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.recorrenteId, regraId),
          eq(schema.session.estado, "agendada"),
          gte(schema.session.agendadaPara, cutoff),
        ),
      )
      .returning({ id: schema.session.id });
    return { removidas: removidas.length };
  });
}

/** Etapa D: próxima sessão `agendada` futura da regra (`YYYY-MM-DD` ou null). */
export async function proximaSessaoDaRegra(
  ctx: TenantContext,
  regraId: string,
): Promise<string | null> {
  requireRole(ctx, "coordenador");
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ prox: min(schema.session.agendadaPara) })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.recorrenteId, regraId),
          eq(schema.session.estado, "agendada"),
          gt(schema.session.agendadaPara, sql`now()`),
        ),
      );
    return row?.prox ? new Date(row.prox).toISOString().slice(0, 10) : null;
  });
}

/** Aviso suave por-paciente (C8): as faixas de trabalho do terapeuta no dia. */
export async function disponibilidadeTerapeutaNoDia(
  ctx: TenantContext,
  terapeutaId: string,
  diaISO: string,
): Promise<FaixaDia[]> {
  requireRole(ctx, "coordenador");
  const diaSemana = new Date(`${diaISO}T00:00:00Z`).getUTCDay();
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        diaSemana: schema.janelaTrabalho.diaSemana,
        horaInicio: schema.janelaTrabalho.horaInicio,
        horaFim: schema.janelaTrabalho.horaFim,
      })
      .from(schema.janelaTrabalho)
      .where(
        and(
          eq(schema.janelaTrabalho.terapeutaId, terapeutaId),
          eq(schema.janelaTrabalho.diaSemana, diaSemana),
        ),
      );
    return rows.map((j) => ({
      diaSemana: j.diaSemana,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
    }));
  });
}

// ─── Etapa E: listas derivadas de pendência na grade do dia ───────────────

const SELECT_SESSAO_DO_DIA = {
  id: schema.session.id,
  agendadaPara: schema.session.agendadaPara,
  estado: schema.session.estado,
  terapeutaId: schema.session.terapeutaId,
  terapeutaNome: schema.appUser.name,
  pacienteNome: schema.patient.nome,
  patientId: schema.session.patientId,
  disciplina: schema.session.disciplina,
} as const;

/**
 * Sessões travadas em `agendada` no passado — ninguém consolidou o
 * atendimento (realizada/falta/cancelada). Gate igual ao `podeGerir` da
 * página: só coordenação/recepção resolvem essa fila. RLS (`withTenant`)
 * escopa por clínica/papel por baixo.
 */
export async function pendentesDeConsolidacao(
  ctx: TenantContext,
): Promise<SessaoDoDia[]> {
  requireAgendar(ctx);
  return withTenant(ctx, (tx) =>
    tx
      .select(SELECT_SESSAO_DO_DIA)
      .from(schema.session)
      .leftJoin(schema.patient, eq(schema.patient.id, schema.session.patientId))
      .leftJoin(schema.appUser, eq(schema.appUser.id, schema.session.terapeutaId))
      .where(
        and(
          eq(schema.session.estado, "agendada"),
          lt(schema.session.agendadaPara, sql`now()`),
        ),
      )
      .orderBy(asc(schema.session.agendadaPara)),
  );
}

/**
 * Faltas (paciente ou terapeuta) sem reposição ainda: nenhuma outra sessão
 * aponta pra ela via `reposta_de`. Alias necessário — `session` aparece duas
 * vezes na query (a falta candidata e a checagem de existência da filha).
 */
export async function reposicoesPendentes(
  ctx: TenantContext,
): Promise<SessaoDoDia[]> {
  requireAgendar(ctx);
  const reposicao = alias(schema.session, "reposicao");
  return withTenant(ctx, (tx) =>
    tx
      .select(SELECT_SESSAO_DO_DIA)
      .from(schema.session)
      .leftJoin(schema.patient, eq(schema.patient.id, schema.session.patientId))
      .leftJoin(schema.appUser, eq(schema.appUser.id, schema.session.terapeutaId))
      .where(
        and(
          inArray(schema.session.estado, ["falta_paciente", "falta_terapeuta"]),
          notExists(
            tx
              .select({ id: reposicao.id })
              .from(reposicao)
              .where(eq(reposicao.repostaDe, schema.session.id)),
          ),
        ),
      )
      .orderBy(asc(schema.session.agendadaPara)),
  );
}
