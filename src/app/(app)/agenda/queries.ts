import { and, asc, eq, gte, ilike, isNull, lte, max, or } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "@/app/(app)/agenda/fuso";
import { diasDaSemana, vigenciaInicioC7 } from "@/lib/agenda/semana";
import { paraMinutosLocais } from "@/lib/agenda/fuso-min";
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
  requireRole(ctx, "coordenador");
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
  requireRole(ctx, "coordenador");
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
    const regras: RegraProjecao[] = regrasRaw.map((r) => ({
      id: r.id,
      diaSemana: r.diaSemana,
      horaInicio: r.horaInicio,
      duracaoMin: r.duracaoMin,
      disciplina: r.disciplina,
      rotulo: r.rotulo ?? "—",
    }));

    // Avulsas (session recorrenteId null) na janela de datas (concreto).
    const colSessEntidade =
      eixo === "terapeuta" ? schema.session.terapeutaId : schema.session.patientId;
    const avulsasRaw = await tx
      .select({
        id: schema.session.id,
        agendadaPara: schema.session.agendadaPara,
        duracaoMin: schema.session.duracaoMin,
        disciplina: schema.session.disciplina,
        rotulo: colRotulo,
      })
      .from(schema.session)
      .innerJoin(schema.patient, eq(schema.session.patientId, schema.patient.id))
      .innerJoin(schema.appUser, eq(schema.session.terapeutaId, schema.appUser.id))
      .where(
        and(
          eq(schema.session.clinicId, ctx.clinicId),
          eq(colSessEntidade, entidadeId),
          isNull(schema.session.recorrenteId),
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
    const avulsas: AvulsaProjecao[] = avulsasRaw.map((a) => {
      const { diaSemana, inicioMin } = paraMinutosLocais(a.agendadaPara, FUSO_CLINICA);
      return {
        id: a.id,
        diaSemana,
        inicioMin,
        duracaoMin: a.duracaoMin,
        disciplina: a.disciplina ?? "—",
        rotulo: a.rotulo ?? "—",
      };
    });

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

    return { blocos: projetarSemana(regras, avulsas), janelas, bloqueios: bloq };
  });
}

export class ConflitoError extends Error {
  constructor(public dimensao: "terapeuta" | "paciente") {
    super(`Horário em conflito para ${dimensao}.`);
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
  requireRole(ctx, "coordenador");
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
  tipo: "avaliacao" | "devolutiva" | "reuniao_pais" | "outro";
  dataISO: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  modalidade: "presencial" | "online";
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
  requireRole(ctx, "coordenador");
  const agendadaPara = new Date(
    `${dados.dataISO}T${dados.horaInicio}:00${FUSO_CLINICA_OFFSET}`,
  );
  const diaSemana = new Date(`${dados.dataISO}T00:00:00Z`).getUTCDay();
  const inicioMin = horaParaMin(dados.horaInicio);
  const novo: Slot = { diaSemana, inicioMin, fimMin: inicioMin + dados.duracaoMin };
  try {
    return await withTenant(ctx, async (tx) => {
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
        })
        .returning({ id: schema.session.id });
      return row!;
    });
  } catch (e) {
    // EXCLUDE gist (btree_gist) → SQLSTATE 23P01 exclusion_violation. O driver
    // postgres-js lança o erro cru; o drizzle-orm o envolve em
    // DrizzleQueryError com o original em `.cause` — checar os dois.
    const code =
      (e as { code?: string } | undefined)?.code ??
      (e as { cause?: { code?: string } } | undefined)?.cause?.code;
    if (code === "23P01") {
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
  requireRole(ctx, "coordenador");
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

/** Materializa a regra até `ateISO`, retomando de max(agendada_para)+1dia. */
export async function materializarRegra(
  ctx: TenantContext,
  regraId: string,
  ateISO: string,
): Promise<ResultadoMaterializacao> {
  requireRole(ctx, "coordenador");
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
