/**
 * #203 · Fatia 2 — prescrição pela ficha clínica (SCD2 + handoff 1).
 *
 * O que estes casos protegem, em ordem de custo se quebrar:
 *
 *   Represcrever NÃO reescreve. Fecha a vigência anterior e abre linha nova —
 *   o convênio audita o alvo DA ÉPOCA. Um UPDATE no lugar apagaria o histórico
 *   sem erro nenhum, e ninguém perceberia até a auditoria.
 *
 *   Fechada não conta. Toda leitura de saldo filtra `vigencia_fim IS NULL`. Se
 *   um dos lados esquecer o filtro, a soma inclui histórico encerrado e produz
 *   sobrealocação fantasma — só aparece em paciente com histórico, nunca em
 *   dado de teste novo (plano §4.5).
 *
 *   O selo `Sem prescrição` é derivado. Paciente cadastrado e não prescrito não
 *   pode sumir da vista de quem cadastrou e saiu.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { prescreverDisciplina, encerrarPrescricao, listarPrescricoesVigentes } =
  await import("./prescricao-logic");
const { listarTodosPacientes } = await import("../../queries");
const { sql: appSql } = await import("@/db/client");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002";
const PATIENT = "b0000000-0000-0000-0000-000000000030";
const PATIENT_SEM = "b0000000-0000-0000-0000-000000000031";
let owner: ReturnType<typeof postgres>;

const ctx = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** Todas as linhas da disciplina, vigentes ou não, da mais nova para a mais velha. */
function historico(disciplina: string) {
  return owner<
    {
      horas_alvo_semana: string;
      vigencia_inicio: string;
      vigencia_fim: string | null;
    }[]
  >`
    SELECT horas_alvo_semana, vigencia_inicio, vigencia_fim
      FROM patient_alvo_disciplina
     WHERE patient_id = ${PATIENT} AND disciplina = ${disciplina}
     ORDER BY criado_em DESC`;
}

describe.skipIf(!hasDb)("prescrição de disciplinas (fatia 2)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, patient_alvo_disciplina RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test'), (${U_TERA}, 'Tera', 'tera@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_TERA}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC_A}, 'Com Prescricao'), (${PATIENT_SEM}, ${CLINIC_A}, 'Sem Prescricao')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("prescreve disciplina nova e ela fica vigente", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Fonoaudiologia", horasAlvoSemana: "20" }),
    );
    expect(r.error).toBeUndefined();
    const vigentes = await listarPrescricoesVigentes(ctx, PATIENT);
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]!.disciplina).toBe("Fonoaudiologia");
    expect(Number(vigentes[0]!.horasAlvoSemana)).toBe(20);
  });

  test("represcrever fecha a linha anterior e abre outra (SCD2, não UPDATE)", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Fonoaudiologia", horasAlvoSemana: "10" }),
    );
    expect(r.error).toBeUndefined();

    const linhas = await historico("Fonoaudiologia");
    // DUAS linhas: a de 20h continua existindo, fechada. Um UPDATE no lugar
    // deixaria uma linha só e o alvo de 20h teria desaparecido do histórico.
    expect(linhas).toHaveLength(2);
    expect(Number(linhas[0]!.horas_alvo_semana)).toBe(10);
    expect(linhas[0]!.vigencia_fim).toBeNull();
    expect(Number(linhas[1]!.horas_alvo_semana)).toBe(20);
    expect(linhas[1]!.vigencia_fim).not.toBeNull();

    // E só uma conta: fechada não é vigente.
    const vigentes = await listarPrescricoesVigentes(ctx, PATIENT);
    expect(
      vigentes.filter((p) => p.disciplina === "Fonoaudiologia"),
    ).toHaveLength(1);
  });

  test("represcrever o MESMO valor não gera linha nova", async () => {
    const antes = await historico("Fonoaudiologia");
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Fonoaudiologia", horasAlvoSemana: "10" }),
    );
    expect(r.error).toBeUndefined();
    // Gravar assim mesmo encheria a trilha de linhas idênticas e faria o
    // convênio enxergar troca de prescrição onde não houve mudança clínica.
    expect(await historico("Fonoaudiologia")).toHaveLength(antes.length);
  });

  test("fecha e abre no MESMO dia sem deixar duas vigentes (fuso BR)", async () => {
    // Represcrição às 22h com fuso errado geraria duas linhas vigentes no mesmo
    // dia, e o teto da disciplina viraria sorteio. Como as duas datas saem do
    // mesmo `now() AT TIME ZONE 'America/Sao_Paulo'`, isso não acontece.
    const linhas = await historico("Fonoaudiologia");
    const vigentes = linhas.filter((l) => l.vigencia_fim === null);
    expect(vigentes).toHaveLength(1);
    const fechada = linhas.find((l) => l.vigencia_fim !== null)!;
    // `String(...)`: o driver devolve `date` como objeto Date, e duas Dates do
    // mesmo dia não são a mesma referência — `toBe` compararia identidade.
    expect(String(fechada.vigencia_fim)).toBe(
      String(vigentes[0]!.vigencia_inicio),
    );
  });

  test("carga fora do passo de 30 min é recusada com mensagem útil", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "0.3" }),
    );
    expect(r.error).toMatch(/30 em 30 minutos/);
    expect(await listarPrescricoesVigentes(ctx, PATIENT)).toHaveLength(1);
  });

  test("carga acima do teto de 60h é recusada (erro de digitação)", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "200" }),
    );
    expect(r.error).toMatch(/60h/);
  });

  test("carga vazia é recusada — nunca vira zero silencioso", async () => {
    // `Number("")` é 0, não NaN: sem guard, campo vazio viraria prescrição de
    // zero hora, que é um teto válido para o banco e mentira para a clínica.
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "" }),
    );
    expect(r.error).toMatch(/Informe a carga horária/);
  });

  test("aceita vírgula decimal como o coordenador digita (1,5 = 1h30)", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "1,5" }),
    );
    expect(r.error).toBeUndefined();
    const psi = (await listarPrescricoesVigentes(ctx, PATIENT)).find(
      (p) => p.disciplina === "Psicologia",
    );
    expect(Number(psi!.horasAlvoSemana)).toBe(1.5);
  });

  test("encerrar prescrição fecha a vigência sem apagar histórico", async () => {
    const r = await encerrarPrescricao(ctx, PATIENT, "Psicologia");
    expect(r.error).toBeUndefined();
    const vigentes = await listarPrescricoesVigentes(ctx, PATIENT);
    expect(vigentes.map((p) => p.disciplina)).not.toContain("Psicologia");
    const restou = await owner`
      SELECT 1 FROM patient_alvo_disciplina
       WHERE patient_id = ${PATIENT} AND disciplina = 'Psicologia'`;
    expect(restou.length).toBeGreaterThan(0);
  });

  test("encerrar de novo avisa em vez de dizer que deu certo", async () => {
    // Zero linhas afetadas não é sucesso: ou outra aba já encerrou, ou a RLS
    // barrou a escrita (UPDATE barrado por policy afeta 0 linhas SEM estourar).
    const r = await encerrarPrescricao(ctx, PATIENT, "Psicologia");
    expect(r.error).toMatch(/Nenhuma prescrição vigente/);
  });

  test("terapeuta não prescreve (ato clínico do coordenador)", async () => {
    await expect(
      prescreverDisciplina(
        { clinicId: CLINIC_A, userId: U_TERA, role: "terapeuta" },
        PATIENT,
        form({ disciplina: "Fisioterapia", horasAlvoSemana: "2" }),
      ),
    ).rejects.toThrow(/Acesso negado/);
  });

  test("lista de pacientes marca quem ainda não tem prescrição (handoff 1)", async () => {
    const lista = await listarTodosPacientes(ctx);
    const comPrescricao = lista.find((p) => p.id === PATIENT);
    const semPrescricao = lista.find((p) => p.id === PATIENT_SEM);
    expect(comPrescricao?.temPrescricao).toBe(true);
    expect(semPrescricao?.temPrescricao).toBe(false);
  });

  test("prescrição encerrada NÃO conta para o selo (vigência, não existência)", async () => {
    await encerrarPrescricao(ctx, PATIENT, "Fonoaudiologia");
    const lista = await listarTodosPacientes(ctx);
    expect(lista.find((p) => p.id === PATIENT)?.temPrescricao).toBe(false);
  });
});
