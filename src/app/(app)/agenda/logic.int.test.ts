/**
 * #249 T5 — integração da lógica da agenda (check-in, CAS de estado, corrida
 * de criação de avulsa) contra Postgres real, com a role DONA como oráculo.
 *
 * O oráculo é sempre a releitura via `owner` (MIGRATION_DATABASE_URL, bypassa
 * RLS) — asserir só o retorno das funções é o que deixa no-op silencioso
 * passar. Escritas da app entram pelas funções de `logic.ts`/`queries.ts` com
 * `ctx` (o `withTenant` seta os GUCs; nunca setar GUC à mão aqui).
 *
 * Roda com `pnpm test:rls`. Gate de env em `db/tests/integration-env.ts`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { checkInSessao, marcarEstado, listarSessoesDoDia } =
  await import("./logic");
const { criarAvulsa, criarRegra, ConflitoError } = await import("./queries");
const { sql: appSql } = await import("@/db/client");

const CLINIC = "00000000-0000-0000-0000-0000000249aa";
const U_COORD = "00000000-0000-0000-0000-0000000249c1";
const U_TER = "00000000-0000-0000-0000-0000000249e1";
const U_TER2 = "00000000-0000-0000-0000-0000000249e2";
const P1 = "00000000-0000-0000-0000-0000000249f1";
const P2 = "00000000-0000-0000-0000-0000000249f2";
const S_CHECKIN = "00000000-0000-0000-0000-0000000249d1";
const S_REALIZADA = "00000000-0000-0000-0000-0000000249d2";
const S_AGENDADA = "00000000-0000-0000-0000-0000000249d3";

// Instantes fixos no fuso da clínica (America/Sao_Paulo, -03:00 sem DST).
const T_CHECKIN = "2026-08-20T09:00:00-03:00";
const T_REALIZADA = "2026-08-20T10:00:00-03:00";
const T_AGENDADA = "2026-08-20T11:00:00-03:00";

let owner: ReturnType<typeof postgres>;

const ctx = { clinicId: CLINIC, userId: U_COORD, role: "coordenador" } as never;

type AuditRow = {
  clinic_id: string;
  ator_id: string;
  entidade: string;
  entidade_id: string;
  patient_id: string | null;
  detalhe: Record<string, unknown> | null;
};
async function auditoria(acao: string): Promise<AuditRow[]> {
  return owner<AuditRow[]>`
    SELECT clinic_id, ator_id, entidade, entidade_id, patient_id, detalhe
      FROM audit_log WHERE acao = ${acao} ORDER BY criado_em`;
}

async function sessao(id: string) {
  const [row] = await owner<
    { estado: string; check_in_em: Date | null; justificada: boolean | null }[]
  >`SELECT estado, check_in_em, justificada FROM session WHERE id = ${id}`;
  return row!;
}

describe.skipIf(!hasDb)("agenda logic (#249)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE audit_log RESTART IDENTITY CASCADE`;
    await owner`TRUNCATE session, agendamento_recorrente, bloqueio,
      patient, user_role, app_user, clinic RESTART IDENTITY CASCADE`;
    // `isento_trial` garante `podeEscrever` no guard de billing (comEscrita /
    // requireEscritaPermitida) sem depender de subscription/trial.
    await owner`INSERT INTO clinic (id, nome, timezone, isento_trial)
      VALUES (${CLINIC}, 'Clínica #249', 'America/Sao_Paulo', true)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD}, 'Coord 249', 'coord@i249.test'),
      (${U_TER},   'Ter 249',   'ter@i249.test'),
      (${U_TER2},  'Ter2 249',  'ter2@i249.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC}, 'coordenador'),
      (${U_TER},   ${CLINIC}, 'terapeuta'),
      (${U_TER2},  ${CLINIC}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P1}, ${CLINIC}, 'Paciente Um 249'),
      (${P2}, ${CLINIC}, 'Paciente Dois 249')`;
    await owner`INSERT INTO session
      (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina, duracao_min)
      VALUES
      (${S_CHECKIN},   ${CLINIC}, ${P1}, ${U_TER}, ${T_CHECKIN},   'agendada',  'ABA', 60),
      (${S_REALIZADA}, ${CLINIC}, ${P1}, ${U_TER}, ${T_REALIZADA}, 'realizada', 'ABA', 60),
      (${S_AGENDADA},  ${CLINIC}, ${P2}, ${U_TER}, ${T_AGENDADA},  'agendada',  'ABA', 60)`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("check-in feliz: carimba check_in_em e audita na mesma tx", async () => {
    const r = await checkInSessao(ctx, S_CHECKIN);
    expect(r).toEqual({});

    const linha = await sessao(S_CHECKIN);
    expect(linha.check_in_em).toBeInstanceOf(Date);
    expect(linha.estado).toBe("agendada"); // presença ≠ consolidação

    const audit = await auditoria("check_in");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.entidade).toBe("session");
    expect(audit[0]!.entidade_id).toBe(S_CHECKIN);
    expect(audit[0]!.patient_id).toBe(P1);
    // detalhe carrega o instante carimbado, coerente com a linha.
    expect(new Date(audit[0]!.detalhe!.check_in_em as string).getTime()).toBe(
      linha.check_in_em!.getTime(),
    );
  });

  test("check-in idempotente: 2ª chamada não sobrescreve nem duplica audit", async () => {
    const antes = await sessao(S_CHECKIN);
    const r = await checkInSessao(ctx, S_CHECKIN);
    expect(r).toEqual({ error: "Check-in já registrado para esta sessão." });

    const depois = await sessao(S_CHECKIN);
    expect(depois.check_in_em?.getTime()).toBe(antes.check_in_em?.getTime());
    expect(await auditoria("check_in")).toHaveLength(1);
  });

  test("marcarEstado CAS: sessão já realizada não é cancelada nem auditada", async () => {
    const r = await marcarEstado(ctx, {
      sessionId: S_REALIZADA,
      estado: "cancelada",
    });
    expect(r).toEqual({
      error:
        "Esta sessão já foi atualizada por outra pessoa. Recarregue a página.",
    });
    expect((await sessao(S_REALIZADA)).estado).toBe("realizada");
    expect(await auditoria("marcar_estado")).toHaveLength(0);
  });

  test("marcarEstado CAS: agendada → realizada com audit correto", async () => {
    const r = await marcarEstado(ctx, {
      sessionId: S_AGENDADA,
      estado: "realizada",
    });
    expect(r).toEqual({ ok: true });
    expect((await sessao(S_AGENDADA)).estado).toBe("realizada");

    const audit = await auditoria("marcar_estado");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.entidade_id).toBe(S_AGENDADA);
    expect(audit[0]!.patient_id).toBe(P2);
    // detalhe completo do T4: estado + justificada + atendido_por_id + modalidade
    // (null quando ausentes — chave presente, não omitida).
    expect(audit[0]!.detalhe).toEqual({
      estado: "realizada",
      justificada: null,
      atendido_por_id: null,
      modalidade: null,
    });

    // E aparece consolidada na grade do dia (leitura via app/RLS).
    const grade = await listarSessoesDoDia(ctx, "2026-08-20");
    const alvo = grade.find((s) => s.id === S_AGENDADA);
    expect(alvo?.estado).toBe("realizada");
  });

  test("corrida de criação: mesmo terapeuta + horário sobreposto → exatamente 1 sessão", async () => {
    /**
     * `criarAvulsa` abre e fecha a própria transação dentro de `withTenant`,
     * então o handshake fino do padrão do webhook Asaas (segurar a linha sem
     * commitar) não é possível aqui de fora — a alternativa é a invariante
     * FORTE: duas chamadas concorrentes, e ao final (a) exatamente uma resolve,
     * (b) a outra rejeita com ConflitoError, (c) o owner conta UMA sessão no
     * eixo do terapeuta naquele horário. O advisory lock do T4
     * (`travarEixosAgenda`) serializa as duas tx no eixo do terapeuta; o
     * EXCLUDE gist (23P01 → ConflitoError) é o backstop que a perdedora atinge.
     */
    const base = {
      terapeutaId: U_TER,
      disciplina: "ABA",
      tipo: "terapia" as const,
      dataISO: "2026-08-21",
      duracaoMin: 60,
      modalidade: "presencial" as const,
    };
    const resultados = await Promise.allSettled([
      criarAvulsa(ctx, { ...base, patientId: P1, horaInicio: "09:00" }),
      criarAvulsa(ctx, { ...base, patientId: P2, horaInicio: "09:30" }),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]!.reason).toBeInstanceOf(ConflitoError);

    const contagem = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM session
       WHERE terapeuta_id = ${U_TER}
         AND agendada_para >= ${"2026-08-21T09:00:00-03:00"}
         AND agendada_para <  ${"2026-08-21T10:30:00-03:00"}`;
    expect(Number(contagem[0]?.n)).toBe(1);
  });

  test("conflito avulsa×avulsa atribui o EIXO certo: mesmo paciente, terapeutas diferentes → dimensao 'paciente'", async () => {
    /**
     * QA mobile #249: 2 terapeutas livres, mesmo paciente, mesmo horário. O
     * pré-check em JS só olha regras recorrentes; avulsa×avulsa cai no EXCLUDE
     * gist — e são DUAS constraints (`session_no_overbook_paciente` /
     * `_terapeuta`). O catch hardcodava "terapeuta" e mandava o coordenador
     * checar a agenda errada. Aqui o conflito é exclusivamente do paciente
     * (U_TER2 não tem nenhuma sessão), então a dimensao TEM que ser "paciente".
     */
    const base = {
      disciplina: "ABA",
      tipo: "terapia" as const,
      dataISO: "2026-08-25", // terça: fora do alcance da regra de segunda
      horaInicio: "09:00",
      duracaoMin: 60,
      modalidade: "presencial" as const,
    };
    await criarAvulsa(ctx, { ...base, patientId: P1, terapeutaId: U_TER });

    const erro = await criarAvulsa(ctx, {
      ...base,
      patientId: P1,
      terapeutaId: U_TER2,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ConflitoError);
    expect((erro as InstanceType<typeof ConflitoError>).dimensao).toBe(
      "paciente",
    );
    expect((erro as Error).message).toBe("Horário em conflito para paciente.");
  });

  test("conflito avulsa×avulsa no eixo do terapeuta → dimensao 'terapeuta'", async () => {
    // Contraprova do teste acima: mesmo terapeuta, pacientes diferentes.
    const base = {
      disciplina: "ABA",
      tipo: "terapia" as const,
      dataISO: "2026-08-25",
      horaInicio: "16:00",
      duracaoMin: 60,
      modalidade: "presencial" as const,
    };
    await criarAvulsa(ctx, { ...base, patientId: P1, terapeutaId: U_TER2 });

    const erro = await criarAvulsa(ctx, {
      ...base,
      patientId: P2,
      terapeutaId: U_TER2,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ConflitoError);
    expect((erro as InstanceType<typeof ConflitoError>).dimensao).toBe(
      "terapeuta",
    );
  });

  test("corrida regra×avulsa: lock dos eixos fecha o buraco que o EXCLUDE não vê", async () => {
    /**
     * O cenário que SÓ o advisory lock do T4 fecha: a regra não tem linha
     * `session` no momento do pré-check, então o EXCLUDE gist não enxerga o
     * conflito regra×avulsa — sem `travarEixosAgenda` em `criarRegra`, as duas
     * tx passam no pré-check e as ocorrências materializadas viram `puladas`
     * em silêncio (ou sobrepõem a avulsa). Com o lock, a perdedora reexecuta o
     * pré-check depois do commit da vencedora e recebe ConflitoError.
     * Handshake fino é impossível (cada função gerencia a própria tx via
     * withTenant) → Promise.allSettled + invariante forte no owner.
     */
    // Segunda-feira 2026-08-24 (diaSemana=1), slot 14:00-15:00 × 14:30-15:30.
    const [regra, avulsa] = await Promise.allSettled([
      criarRegra(ctx, {
        patientId: P1,
        terapeutaId: U_TER,
        disciplina: "ABA",
        diaSemana: 1,
        horaInicio: "14:30",
        duracaoMin: 60,
        semanaVisivelISO: "2026-08-24",
        hojeISO: "2026-08-24",
      }),
      criarAvulsa(ctx, {
        patientId: P2,
        terapeutaId: U_TER,
        disciplina: "ABA",
        tipo: "terapia",
        dataISO: "2026-08-24",
        horaInicio: "14:00",
        duracaoMin: 60,
        modalidade: "presencial",
      }),
    ]);

    const resultados = [regra!, avulsa!];
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]!.reason).toBeInstanceOf(ConflitoError);

    // Invariante FORTE no owner: nenhum par de sessões do terapeuta se
    // sobrepõe no tempo — nem materializada×avulsa, nem `pulada` silenciosa
    // deixando buraco: quem perdeu não gravou NADA.
    const [sobrepostas] = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n
        FROM session s1
        JOIN session s2
          ON s1.id < s2.id
         AND s1.terapeuta_id = s2.terapeuta_id
         AND tstzrange(s1.agendada_para,
                       s1.agendada_para + s1.duracao_min * interval '1 minute')
          && tstzrange(s2.agendada_para,
                       s2.agendada_para + s2.duracao_min * interval '1 minute')
       WHERE s1.terapeuta_id = ${U_TER}`;
    expect(Number(sobrepostas!.n)).toBe(0);
  });

  test("audit rows carregam clinic_id e ator_id corretos", async () => {
    const linhas = [
      ...(await auditoria("check_in")),
      ...(await auditoria("marcar_estado")),
    ];
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    for (const l of linhas) {
      expect(l.clinic_id).toBe(CLINIC);
      expect(l.ator_id).toBe(U_COORD);
    }
  });
});
