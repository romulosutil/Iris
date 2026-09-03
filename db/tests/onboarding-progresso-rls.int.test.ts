import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-00000036d101";
const CLINIC_B = "00000000-0000-0000-0000-00000036d102";
const U_COORD_A = "00000000-0000-0000-0000-00000036d103";
const U_TERA_A = "00000000-0000-0000-0000-00000036d104";
const U_COORD_B = "00000000-0000-0000-0000-00000036d105";
const PAC_B = "00000000-0000-0000-0000-00000036d106";
const PAC_A1 = "00000000-0000-0000-0000-00000036d107";
const PAC_A2 = "00000000-0000-0000-0000-00000036d108";
// Paciente `protocol_driven` usado nos casos do 5º passo COMPLETO e DESFEITO.
const PAC_A3 = "00000000-0000-0000-0000-00000036d109";

/** Família do catálogo de referência (`protocol_familia_catalogo`), a mesma
 * usada por `anamnese-validar-definer.int.test.ts` e `fase4-materializar`. */
const PROTOCOL_FAMILIA = "aba_marcos_desenvolvimento";
const CRITERIO = { tipo: "n_acertos_m_sessoes", n: 3, m: 3 };

/**
 * O 5º passo afirmado pelo IDENTIFICADOR, nunca pela posição no array.
 * `PASSOS_ONBOARDING[4]` passaria verde se alguém trocasse o CONTEÚDO do
 * quinto item por outro passo, e quebraria por reordenação sem que nada de
 * comportamento tivesse mudado. O `find` falha alto no caso que importa:
 * o passo deixou de existir com este id.
 */
const ID_PASSO_PRONTO = "primeiroPacientePronto" as const;

const ctxA = {
  clinicId: CLINIC_A,
  userId: U_COORD_A,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let obterProgressoOnboarding: typeof import("@/app/(app)/onboarding-queries").obterProgressoOnboarding;
let appSql: typeof import("@/db/client").sql;
let PASSOS_ONBOARDING: typeof import("@/lib/onboarding/passos").PASSOS_ONBOARDING;
let PROTOCOL_ID: string;

async function limpar() {
  await owner`DELETE FROM janela_trabalho WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  // Ordem importa: `goal` referencia `patient` com ON DELETE RESTRICT, então
  // a meta tem de sair ANTES do paciente. `patient_protocol` cascateia por
  // paciente, mas referencia `protocol` com RESTRICT — daí o `protocol`
  // fechar a fila. DELETE escopado por clínica, nunca TRUNCATE: TRUNCATE
  // novo colide com int-test vizinho (deadlock e FK de outra suíte).
  await owner`DELETE FROM goal WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM patient_protocol WHERE patient_id IN
    (SELECT id FROM patient WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B}))`;
  await owner`DELETE FROM patient WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM protocol WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_TERA_A}, ${U_COORD_B})`;
  await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
}

describe.skipIf(!hasDb)("obterProgressoOnboarding", () => {
  // Conexão e imports dinâmicos no `beforeAll`, não no `beforeEach`: o
  // primeiro `beforeEach` levava >10s (import da cadeia + handshake) e
  // estourava o `hookTimeout` padrão do vitest, derrubando SÓ o primeiro
  // teste do arquivo com um erro de hook que não fala do comportamento
  // testado. Custo pago uma vez.
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    ({ obterProgressoOnboarding } =
      await import("@/app/(app)/onboarding-queries"));
    ({ sql: appSql } = await import("@/db/client"));
    ({ PASSOS_ONBOARDING } = await import("@/lib/onboarding/passos"));
  }, 60_000);

  beforeEach(async () => {
    await limpar();
    // Estado zero: clínica recém-criada, só o coordenador.
    await owner`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINIC_A}, 'Clinica A (onboarding)', false),
      (${CLINIC_B}, 'Clinica B (onboarding)', false)`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord.a.onboarding36@t.com'),
      (${U_TERA_A}, 'Tera A', 'tera.a.onboarding36@t.com'),
      (${U_COORD_B}, 'Coord B', 'coord.b.onboarding36@t.com')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
    const [protocolo] = await owner`
      INSERT INTO protocol (clinic_id, nome, disciplina, familia, taxonomia_ajuda)
      VALUES (${CLINIC_A}, 'VB-MAPP (onboarding 5º passo)', 'ABA', ${PROTOCOL_FAMILIA},
        ${owner.json(["independente", "dica_verbal"])})
      RETURNING id`;
    PROTOCOL_ID = protocolo!.id;
  });

  afterAll(async () => {
    await limpar();
    await owner?.end();
    await appSql?.end();
  });

  test("clínica recém-criada tem os cinco passos pendentes", async () => {
    expect(await obterProgressoOnboarding(ctxA)).toEqual({
      clinica: false,
      equipe: false,
      agenda: false,
      paciente: false,
      primeiroPacientePronto: false,
    });
  });

  test("dados da clínica só contam com razão social E cep", async () => {
    await owner`UPDATE clinic SET razao_social = 'Clinica A LTDA'
      WHERE id = ${CLINIC_A}`;
    expect((await obterProgressoOnboarding(ctxA)).clinica).toBe(false);
    await owner`UPDATE clinic SET endereco_cep = '01310100'
      WHERE id = ${CLINIC_A}`;
    expect((await obterProgressoOnboarding(ctxA)).clinica).toBe(true);
  });

  test("equipe conta um SEGUNDO usuário, não o próprio coordenador", async () => {
    expect((await obterProgressoOnboarding(ctxA)).equipe).toBe(false);
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    expect((await obterProgressoOnboarding(ctxA)).equipe).toBe(true);
  });

  test("agenda conta janela de trabalho da clínica", async () => {
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO janela_trabalho
      (clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim)
      VALUES (${CLINIC_A}, ${U_TERA_A}, 1, '09:00', '17:00')`;
    expect((await obterProgressoOnboarding(ctxA)).agenda).toBe(true);
  });

  // O 5º passo sai de `montarProntidao().podeDocumentar` — a escada POR
  // MODALIDADE de `capacidadesDaModalidade` (D-A5) — e NÃO de um `EXISTS` de
  // "protocolo vigente E meta ativa". É este teste que separa as duas
  // leituras: com os mesmos zero registros clínicos, o paciente
  // `conventional` está pronto (não tem degrau bloqueante, D-A7) e o
  // `protocol_driven` não (bloqueia em protocolo e meta).
  test("o quinto passo sai da escada da modalidade, não de protocolo+meta", async () => {
    await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Convencional A', 'conventional')`;
    expect((await obterProgressoOnboarding(ctxA)).primeiroPacientePronto).toBe(
      true,
    );

    await owner`DELETE FROM patient WHERE id = ${PAC_A1}`;
    await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality)
      VALUES (${PAC_A2}, ${CLINIC_A}, 'ABA A', 'protocol_driven')`;
    expect((await obterProgressoOnboarding(ctxA)).primeiroPacientePronto).toBe(
      false,
    );
  });

  test("paciente sem modalidade resolvida não conta como pronto", async () => {
    await owner`INSERT INTO patient (id, clinic_id, nome)
      VALUES (${PAC_A1}, ${CLINIC_A}, 'Sem modalidade')`;
    const p = await obterProgressoOnboarding(ctxA);
    expect(p.paciente).toBe(true);
    expect(p.primeiroPacientePronto).toBe(false);
  });

  test("não enxerga o progresso da outra clínica", async () => {
    // B tem paciente; A não. Se o isolamento vazar, A marcaria concluído.
    await owner`INSERT INTO patient (id, clinic_id, nome)
      VALUES (${PAC_B}, ${CLINIC_B}, 'Paciente da B')`;
    const p = await obterProgressoOnboarding(ctxA);
    expect(p.paciente).toBe(false);
    // O `json_agg` do 5º passo lê `patient` sob a MESMA RLS: paciente da B
    // não entra no array, então nem chega ao guard do definer.
    expect(p.primeiroPacientePronto).toBe(false);
  });
  // ─────────────────────────────────────────────────────────────────────────
  // 5º passo — "Deixe o primeiro paciente pronto para atender" (#557, D3).
  //
  // Estes quatro casos cobrem o eixo que a spec §6
  // (`docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`)
  // nomeia explicitamente: "passo desfeito (meta descontinuada) volta a
  // pendente". É o caso que separa passo DERIVADO de flag persistida (D-A4):
  // uma coluna `onboarding_passo5_ok` continuaria verde para sempre depois da
  // primeira meta ativa, e o checklist afirmaria "pronto para atender" sobre
  // um prontuário que voltou a bloquear a documentação.
  //
  // A modalidade é `protocol_driven` de propósito: é a única cujos degraus
  // bloqueantes são {protocolo, meta} (`capacidadesDaModalidade`), então o
  // estado da meta é observável no veredito. Em `conventional` não há degrau
  // bloqueante nenhum (D-A7) e o passo nasceria concluído.
  // ─────────────────────────────────────────────────────────────────────────

  /** O passo pelo ID, nunca por `PASSOS_ONBOARDING[4]`. */
  function definicaoDoPassoPronto() {
    const def = PASSOS_ONBOARDING.find((p) => p.id === ID_PASSO_PRONTO);
    expect(
      def,
      `PASSOS_ONBOARDING não tem mais um passo com id "${ID_PASSO_PRONTO}"`,
    ).toBeDefined();
    return def!;
  }

  async function criarPacienteAba() {
    await owner`INSERT INTO patient (id, clinic_id, nome, clinical_modality)
      VALUES (${PAC_A3}, ${CLINIC_A}, 'ABA pronto', 'protocol_driven')`;
  }
  async function prescreverProtocolo() {
    await owner`INSERT INTO patient_protocol (patient_id, protocol_id, ativado_por)
      VALUES (${PAC_A3}, ${PROTOCOL_ID}, ${U_COORD_A})`;
  }
  async function ativarMeta() {
    await owner`INSERT INTO goal
      (patient_id, clinic_id, descricao, estado, criterio_dominio, criado_por)
      VALUES (${PAC_A3}, ${CLINIC_A}, 'Pedir água com apoio', 'ativa',
        ${owner.json(CRITERIO)}, ${U_COORD_A})`;
  }

  test("o passo existe pelo id, e é ele que a query devolve", () => {
    const def = definicaoDoPassoPronto();
    expect(def.titulo).toBe("Deixe o primeiro paciente pronto para atender");
  });

  test("prontuário incompleto (protocolo vigente, meta nenhuma): passo PENDENTE", async () => {
    await criarPacienteAba();
    await prescreverProtocolo();
    const p = await obterProgressoOnboarding(ctxA);
    expect(p[definicaoDoPassoPronto().id]).toBe(false);
    // O 4º passo, esse sim, está concluído: o paciente EXISTE. É a diferença
    // entre "cadastrei" e "posso atender" que o 5º passo inteiro existe para
    // marcar.
    expect(p.paciente).toBe(true);
  });

  test("prontuário completo (protocolo vigente + meta ativa): passo CONCLUÍDO", async () => {
    await criarPacienteAba();
    await prescreverProtocolo();
    await ativarMeta();
    const p = await obterProgressoOnboarding(ctxA);
    expect(p[definicaoDoPassoPronto().id]).toBe(true);
  });

  // ESTE é o caso da spec. Sem ele, todo o resto passaria contra uma flag
  // persistida — o defeito que D-A4 proíbe.
  test("passo DESFEITO: meta descontinuada devolve o passo a pendente", async () => {
    await criarPacienteAba();
    await prescreverProtocolo();
    await ativarMeta();

    const antes = await obterProgressoOnboarding(ctxA);
    expect(antes[definicaoDoPassoPronto().id]).toBe(true);

    // Descontinuar, não deletar: a linha continua lá, só deixa de ser 'ativa'.
    // Deletar provaria menos — um `EXISTS` que ignorasse `estado` continuaria
    // respondendo `false` sobre zero linhas e o teste passaria contra o bug.
    await owner`UPDATE goal SET estado = 'descontinuada'
      WHERE patient_id = ${PAC_A3}`;

    const depois = await obterProgressoOnboarding(ctxA);
    expect(depois[definicaoDoPassoPronto().id]).toBe(false);
  });

  // Os cinco passos dividem UM `select` (uma imagem do banco). Se o
  // `json_agg` do 5º passo — que roda o definer `app_fatos_prontidao` na
  // MESMA transação — derrubasse ou contaminasse a transação, os quatro
  // anteriores mudariam de resposta junto. Aqui eles são medidos concluídos
  // ANTES e DEPOIS do 5º ir e voltar.
  test("o 5º passo não altera o resultado dos quatro anteriores", async () => {
    await owner`UPDATE clinic SET razao_social = 'Clinica A LTDA',
      endereco_cep = '01310100' WHERE id = ${CLINIC_A}`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel)
      VALUES (${U_TERA_A}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO janela_trabalho
      (clinic_id, terapeuta_id, dia_semana, hora_inicio, hora_fim)
      VALUES (${CLINIC_A}, ${U_TERA_A}, 1, '09:00', '17:00')`;
    await criarPacienteAba();
    await prescreverProtocolo();
    await ativarMeta();

    const quatroPrimeiros = {
      clinica: true,
      equipe: true,
      agenda: true,
      paciente: true,
    };

    expect(await obterProgressoOnboarding(ctxA)).toEqual({
      ...quatroPrimeiros,
      [ID_PASSO_PRONTO]: true,
    });

    await owner`UPDATE goal SET estado = 'descontinuada'
      WHERE patient_id = ${PAC_A3}`;

    expect(await obterProgressoOnboarding(ctxA)).toEqual({
      ...quatroPrimeiros,
      [ID_PASSO_PRONTO]: false,
    });
  });
});
