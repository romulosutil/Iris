/**
 * #174 (débito D4) — varredura `app_auto_arquivar_pacientes` (migração 0080).
 *
 * O que este arquivo protege:
 *   * a régua 83/90 do banco bate com a regra pura de
 *     `src/lib/jobs/auto-arquivamento.ts` — bordas 82/83/89/90/91 exercitadas;
 *   * "última atividade" usa os MESMOS sinais de `billing_apurar_ciclo` (0071):
 *     atividade nova reinicia o relógio;
 *   * o aviso prévio NÃO duplica (`audit_log` é append-only e imutável para
 *     app_role — duplicata é lixo que ninguém consegue apagar depois);
 *   * regra 3 da issue: arquivar NUNCA dá alta (`alta_em` intocado);
 *   * a varredura é cross-tenant mas cada linha de trilha leva o `clinic_id`
 *     certo — job sem tenant não é job sem isolamento.
 *
 * TODA data entra por `p_agora`. Nunca `now()` real: um teste que depende do
 * relógio de quem roda passa hoje e falha na virada do dia/fuso.
 *
 * Roda com `pnpm test:rls`. Gate de env em `integration-env.ts` (as três URLs).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";
import {
  ACAO_ARQUIVADO_AUTOMATICAMENTE,
  ACAO_AVISO_PREVIO,
  REGUA_ARQUIVAMENTO,
} from "../../src/lib/jobs/auto-arquivamento";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000001740aa";
const CLINIC_B = "00000000-0000-0000-0000-0000001740bb";
const U_TER_A = "00000000-0000-0000-0000-0000001740e1";
const U_TER_B = "00000000-0000-0000-0000-0000001740e2";

/** Âncora fixa do "agora" injetado — nada aqui olha para o relógio real. */
const AGORA = new Date("2026-08-06T09:00:00.000Z");

/** `AGORA` menos N dias civis (UTC), para posicionar a última atividade. */
function haDias(n: number): Date {
  return new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);
}

/** Chama a varredura pela role dona, com os parâmetros que o teste decidir. */
async function varrer(
  opts: { agora?: Date; diasAviso?: number; diasArquivamento?: number } = {},
) {
  const [row] = await owner!<{ avisados: number; arquivados: number }[]>`
    SELECT * FROM app_auto_arquivar_pacientes(
      ${opts.agora ?? AGORA},
      ${opts.diasAviso ?? REGUA_ARQUIVAMENTO.diasAvisoPrevio},
      ${opts.diasArquivamento ?? REGUA_ARQUIVAMENTO.diasArquivamento})`;
  return row!;
}

/** Cria um paciente cuja ÚNICA atividade é o próprio `criado_em`. */
async function paciente(
  id: string,
  diasAtras: number,
  opts: { clinic?: string; arquivadoEm?: Date; altaEm?: string } = {},
) {
  await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em, arquivado_em, alta_em)
    VALUES (${id}, ${opts.clinic ?? CLINIC_A}, ${"P " + id.slice(-4)},
            ${haDias(diasAtras)}, ${opts.arquivadoEm ?? null},
            ${opts.altaEm ?? null}::date)`;
}

/** Sessão do paciente — `agendada_para` pode ser FUTURA de propósito. */
async function sessao(
  patientId: string,
  agendadaPara: Date,
  opts: { clinic?: string; terapeuta?: string; criadoEm?: Date } = {},
) {
  const [row] = await owner!<{ id: string }[]>`
    INSERT INTO session (clinic_id, patient_id, terapeuta_id, agendada_para,
                         disciplina, criado_em)
    VALUES (${opts.clinic ?? CLINIC_A}, ${patientId},
            ${opts.terapeuta ?? U_TER_A}, ${agendadaPara}, 'ABA',
            ${opts.criadoEm ?? agendadaPara})
    RETURNING id`;
  return row!.id;
}

/** Lê (alta_em, arquivado_em) pela role DONA — o oráculo do teste. */
async function estado(patientId: string) {
  const [row] = await owner!<
    { alta_em: string | null; arquivado_em: Date | null }[]
  >`SELECT alta_em, arquivado_em FROM patient WHERE id = ${patientId}`;
  return row!;
}

/** Linhas de trilha de um paciente para uma `acao`. */
async function trilha(patientId: string, acao: string) {
  return await owner!<
    { clinic_id: string; detalhe: Record<string, unknown> }[]
  >`
    SELECT clinic_id, detalhe FROM audit_log
     WHERE patient_id = ${patientId} AND acao = ${acao}
     ORDER BY criado_em`;
}

describe.skipIf(!hasDb)(
  "#174 · app_auto_arquivar_pacientes (varredura)",
  () => {
    beforeAll(async () => {
      await owner!`TRUNCATE audit_log, session_note, session, patient RESTART IDENTITY CASCADE`;
      await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
      await owner!`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A #174job'), (${CLINIC_B}, 'Clínica B #174job')`;
      await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${U_TER_A}, 'Ter A', 'ter-a@i174job.test'),
      (${U_TER_B}, 'Ter B', 'ter-b@i174job.test')`;
      await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_TER_A}, ${CLINIC_A}, 'terapeuta'),
      (${U_TER_B}, ${CLINIC_B}, 'terapeuta')`;
    });

    // Cada caso monta o seu próprio universo: a varredura é CROSS-TENANT e roda
    // sobre a tabela inteira, então estado residual de um teste vira alvo do
    // seguinte e produz verde/vermelho por acidente.
    beforeEach(async () => {
      await owner!`TRUNCATE audit_log, session_note, session, patient RESTART IDENTITY CASCADE`;
    });

    afterAll(async () => {
      await owner?.end();
    });

    // ─── bordas da régua ──────────────────────────────────────────────────────
    test("82 dias · não avisa e não arquiva", async () => {
      const P = "00000000-0000-0000-0000-000000174001";
      await paciente(P, 82);

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
      expect((await estado(P)).arquivado_em).toBeNull();
      expect(await trilha(P, ACAO_AVISO_PREVIO)).toHaveLength(0);
    });

    test("83 dias · avisa e NÃO arquiva", async () => {
      const P = "00000000-0000-0000-0000-000000174002";
      await paciente(P, 83);

      expect(await varrer()).toEqual({ avisados: 1, arquivados: 0 });
      expect((await estado(P)).arquivado_em).toBeNull();

      const linhas = await trilha(P, ACAO_AVISO_PREVIO);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.detalhe).toMatchObject({
        origem: "job",
        dias_sem_atividade: 83,
        arquiva_em_dias: 7,
      });
    });

    test("89 dias · ainda avisa, ainda não arquiva (última borda antes do corte)", async () => {
      const P = "00000000-0000-0000-0000-000000174003";
      await paciente(P, 89);

      expect(await varrer()).toEqual({ avisados: 1, arquivados: 0 });
      expect((await estado(P)).arquivado_em).toBeNull();
      expect((await trilha(P, ACAO_AVISO_PREVIO))[0]!.detalhe).toMatchObject({
        dias_sem_atividade: 89,
        arquiva_em_dias: 1,
      });
    });

    test("90 dias · arquiva e NÃO gera linha de aviso", async () => {
      const P = "00000000-0000-0000-0000-000000174004";
      await paciente(P, 90);
      expect((await estado(P)).arquivado_em).toBeNull(); // pré-condição

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 1 });

      const e = await estado(P);
      expect(e.arquivado_em).toEqual(AGORA); // carimba `p_agora`, não `now()`
      // A janela do aviso é FECHADA em cima: passado o corte quem age é o
      // arquivamento. Um aviso aqui seria duplicata insuprimível na trilha.
      expect(await trilha(P, ACAO_AVISO_PREVIO)).toHaveLength(0);

      const linhas = await trilha(P, ACAO_ARQUIVADO_AUTOMATICAMENTE);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.detalhe).toMatchObject({
        origem: "job",
        dias_sem_atividade: 90,
      });
    });

    test("91+ dias · arquiva", async () => {
      const P91 = "00000000-0000-0000-0000-000000174005";
      const P400 = "00000000-0000-0000-0000-000000174006";
      await paciente(P91, 91);
      await paciente(P400, 400);

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 2 });
      expect((await estado(P91)).arquivado_em).not.toBeNull();
      expect((await estado(P400)).arquivado_em).not.toBeNull();
      // Parado há mais de um ano NÃO ganha aviso — só arquivamento.
      expect(await trilha(P400, ACAO_AVISO_PREVIO)).toHaveLength(0);
    });

    test("hora do dia não move a fronteira (dias CIVIS, não 24h corridas)", async () => {
      // O paciente entrou às 23:00 do 83º dia anterior; a varredura roda às
      // 09:00. Em aritmética crua de milissegundos isso dá 82 dias e "quase 11
      // horas" → truncado para 82, e o aviso do dia seria PULADO.
      const P = "00000000-0000-0000-0000-000000174007";
      await owner!`INSERT INTO patient (id, clinic_id, nome, criado_em)
      VALUES (${P}, ${CLINIC_A}, 'Tarde da noite',
              TIMESTAMPTZ '2026-05-15 23:00:00+00')`;
      // 2026-05-15 → 2026-08-06 são 83 dias civis.
      expect(await varrer()).toEqual({ avisados: 1, arquivados: 0 });
    });

    // ─── mutação da janela: o PARÂMETRO é quem decide ─────────────────────────
    test("mutação · 89 dias com p_dias_arquivamento=89 ARQUIVA (o parâmetro manda)", async () => {
      // Mata a implementação que hardcoda 90 e ignora o argumento: sob a régua
      // default este mesmo paciente só recebe aviso (teste dos 89 dias acima).
      const P = "00000000-0000-0000-0000-000000174008";
      await paciente(P, 89);

      expect(await varrer({ diasArquivamento: 89 })).toEqual({
        avisados: 0,
        arquivados: 1,
      });
      expect((await estado(P)).arquivado_em).toEqual(AGORA);
    });

    test("mutação · 91 dias com p_dias_arquivamento=92 só AVISA", async () => {
      // O espelho do caso acima: a janela deslocada para cima transforma um
      // arquivamento em aviso. Hardcode de 90 falharia aqui arquivando.
      const P = "00000000-0000-0000-0000-000000174009";
      await paciente(P, 91);

      expect(await varrer({ diasAviso: 85, diasArquivamento: 92 })).toEqual({
        avisados: 1,
        arquivados: 0,
      });
      expect((await estado(P)).arquivado_em).toBeNull();
    });

    // ─── idempotência / dedup ─────────────────────────────────────────────────
    test("aviso NÃO duplica: duas varreduras seguidas = UMA linha de trilha", async () => {
      const P = "00000000-0000-0000-0000-00000017400a";
      await paciente(P, 83);

      expect(await varrer()).toEqual({ avisados: 1, arquivados: 0 });
      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
      expect(await trilha(P, ACAO_AVISO_PREVIO)).toHaveLength(1);
    });

    test("paciente JÁ arquivado não é reprocessado", async () => {
      const P = "00000000-0000-0000-0000-00000017400b";
      const ONTEM = haDias(1);
      await paciente(P, 200, { arquivadoEm: ONTEM });

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
      // A data de arquivamento não pode pular: mudá-la moveria o paciente de
      // ciclo de fatura.
      expect((await estado(P)).arquivado_em).toEqual(ONTEM);
      expect(await trilha(P, ACAO_ARQUIVADO_AUTOMATICAMENTE)).toHaveLength(0);
    });

    test("arquivamento é idempotente no mesmo dia (2ª varredura não repete)", async () => {
      const P = "00000000-0000-0000-0000-00000017400c";
      await paciente(P, 120);

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 1 });
      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
      expect(await trilha(P, ACAO_ARQUIVADO_AUTOMATICAMENTE)).toHaveLength(1);
    });

    test("atividade NOVA depois do aviso legitima um aviso novo", async () => {
      // A âncora do dedup é a última atividade, não "existe algum aviso": quem
      // volta a atender e para de novo tem direito ao aviso da segunda parada.
      const P = "00000000-0000-0000-0000-00000017400d";
      await paciente(P, 200);

      // 1ª parada: no dia D-100 (contado de AGORA) o paciente estava com 100
      // dias sem atividade → arquivaria. Use uma data em que ele tinha 83.
      const D1 = new Date(AGORA.getTime() - 117 * 24 * 60 * 60 * 1000); // 83 dias após criado_em
      expect(await varrer({ agora: D1 })).toEqual({
        avisados: 1,
        arquivados: 0,
      });
      expect(await trilha(P, ACAO_AVISO_PREVIO)).toHaveLength(1);

      // Atividade nova: sessão com check-in 83 dias antes de AGORA.
      await sessao(P, haDias(83));
      expect(await varrer()).toEqual({ avisados: 1, arquivados: 0 });
      expect(await trilha(P, ACAO_AVISO_PREVIO)).toHaveLength(2);
    });

    // ─── "última atividade" = os sinais do billing (0071) ─────────────────────
    test("session_note recente reinicia o relógio (criado_em antigo não basta)", async () => {
      const P = "00000000-0000-0000-0000-00000017400e";
      await paciente(P, 300);
      const s = await sessao(P, haDias(280)); // a sessão também é antiga
      await owner!`INSERT INTO session_note (session_id, clinic_id, tipo, texto, autor_id, criado_em)
      VALUES (${s}, ${CLINIC_A}, 'captura_rapida', 'evolução', ${U_TER_A},
              ${haDias(3)})`;

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
      expect((await estado(P)).arquivado_em).toBeNull();
    });

    test("check-in recente reinicia o relógio", async () => {
      const P = "00000000-0000-0000-0000-00000017400f";
      await paciente(P, 300);
      const s = await sessao(P, haDias(290), { criadoEm: haDias(290) });
      await owner!`UPDATE session SET check_in_em = ${haDias(10)} WHERE id = ${s}`;

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
    });

    test("sessão AGENDADA PARA O FUTURO não arquiva (dias fica negativo — e está certo)", async () => {
      const P = "00000000-0000-0000-0000-000000174010";
      await paciente(P, 500);
      // `criado_em` da sessão também é antigo: quem segura o paciente aqui é
      // exclusivamente `agendada_para` no futuro.
      await sessao(P, new Date(AGORA.getTime() + 14 * 24 * 60 * 60 * 1000), {
        criadoEm: haDias(400),
      });

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 0 });
      expect((await estado(P)).arquivado_em).toBeNull();
      expect(await trilha(P, ACAO_AVISO_PREVIO)).toHaveLength(0);
    });

    // ─── regra 3 da issue: arquivar nunca dá alta ─────────────────────────────
    test("regra 3 · arquivamento automático deixa alta_em intocado", async () => {
      const P = "00000000-0000-0000-0000-000000174011";
      await paciente(P, 120);
      expect((await estado(P)).alta_em).toBeNull(); // pré-condição

      expect(await varrer()).toEqual({ avisados: 0, arquivados: 1 });

      const e = await estado(P);
      expect(e.arquivado_em).not.toBeNull();
      // Um ato COMERCIAL não pode disparar o relógio de retenção LGPD/CFP, que
      // é o efeito de `alta_em`.
      expect(e.alta_em).toBeNull();
    });

    // ─── multi-tenant: job sem tenant não é job sem isolamento ────────────────
    test("duas clínicas na mesma varredura: cada trilha com o clinic_id certo", async () => {
      const PA_ARQ = "00000000-0000-0000-0000-000000174012";
      const PB_ARQ = "00000000-0000-0000-0000-000000174013";
      const PA_AVI = "00000000-0000-0000-0000-000000174014";
      const PB_AVI = "00000000-0000-0000-0000-000000174015";
      await paciente(PA_ARQ, 95);
      await paciente(PA_AVI, 84);
      await paciente(PB_ARQ, 95, { clinic: CLINIC_B });
      await paciente(PB_AVI, 84, { clinic: CLINIC_B });

      expect(await varrer()).toEqual({ avisados: 2, arquivados: 2 });

      expect(
        (await trilha(PA_ARQ, ACAO_ARQUIVADO_AUTOMATICAMENTE))[0]!.clinic_id,
      ).toBe(CLINIC_A);
      expect(
        (await trilha(PB_ARQ, ACAO_ARQUIVADO_AUTOMATICAMENTE))[0]!.clinic_id,
      ).toBe(CLINIC_B);
      expect((await trilha(PA_AVI, ACAO_AVISO_PREVIO))[0]!.clinic_id).toBe(
        CLINIC_A,
      );
      expect((await trilha(PB_AVI, ACAO_AVISO_PREVIO))[0]!.clinic_id).toBe(
        CLINIC_B,
      );

      // Nenhuma linha da trilha aponta para a clínica errada.
      const [cruzado] = await owner!<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_log a
        JOIN patient p ON p.id = a.patient_id
       WHERE a.clinic_id <> p.clinic_id`;
      expect(cruzado!.n).toBe(0);
    });

    // ─── contrato da função ───────────────────────────────────────────────────
    test("a função é SECURITY DEFINER (job cross-tenant não tem GUC de clínica)", async () => {
      const [row] = await owner!<{ prosecdef: boolean }[]>`
      SELECT prosecdef FROM pg_proc WHERE proname = 'app_auto_arquivar_pacientes'`;
      expect(row!.prosecdef).toBe(true);
    });

    test("a role do job existe, não faz login e não bypassa RLS", async () => {
      const [row] = await owner!<
        { rolcanlogin: boolean; rolbypassrls: boolean; rolsuper: boolean }[]
      >`SELECT rolcanlogin, rolbypassrls, rolsuper FROM pg_roles
       WHERE rolname = 'iris_arquivamento'`;
      expect(row).toBeDefined();
      expect(row!.rolcanlogin).toBe(false);
      expect(row!.rolbypassrls).toBe(false);
      expect(row!.rolsuper).toBe(false);
      // Só EXECUTE na função — e PUBLIC não pode chamá-la.
      const [priv] = await owner!<{ job: boolean; publico: boolean }[]>`
      SELECT has_function_privilege('iris_arquivamento',
               'app_auto_arquivar_pacientes(timestamptz,integer,integer)', 'EXECUTE') AS job,
             has_function_privilege('public',
               'app_auto_arquivar_pacientes(timestamptz,integer,integer)', 'EXECUTE') AS publico`;
      expect(priv!.job).toBe(true);
      expect(priv!.publico).toBe(false);
    });

    test("os defaults da função são a régua 83/90 do módulo TypeScript", async () => {
      // Chamada SEM parâmetros de janela: se o banco divergir do TS, um dos dois
      // casos abaixo cai. É o teste que impede a régua de andar sozinha.
      const P83 = "00000000-0000-0000-0000-000000174016";
      const P90 = "00000000-0000-0000-0000-000000174017";
      await paciente(P83, REGUA_ARQUIVAMENTO.diasAvisoPrevio);
      await paciente(P90, REGUA_ARQUIVAMENTO.diasArquivamento);

      const [row] = await owner!<{ avisados: number; arquivados: number }[]>`
      SELECT * FROM app_auto_arquivar_pacientes(${AGORA})`;
      expect(row).toEqual({ avisados: 1, arquivados: 1 });
      expect((await estado(P90)).arquivado_em).toEqual(AGORA);
      expect((await estado(P83)).arquivado_em).toBeNull();
    });
  },
);
