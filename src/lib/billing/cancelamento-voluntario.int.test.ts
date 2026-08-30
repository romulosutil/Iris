import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
import {
  BASE_URL_FAKE,
  ID_PROVEDOR_FAKE,
  ProvedorFake,
} from "@tests/provedor-fake";

vi.mock("server-only", () => ({}));

vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const { aplicarStatusProvider, cancelarAssinaturaDaClinica } =
  await import("./subscription");
const { levantarDebito } = await import("./debito");

const CLINICA = "00000000-0000-0000-0000-00000036c201";
const USUARIO = "00000000-0000-0000-0000-00000036c202";
const SUB = "00000000-0000-0000-0000-00000036c203";
const CICLO = "00000000-0000-0000-0000-00000036c204";
const VINCULO = "vinc_fake_cancel_voluntario";
const TERAPEUTA = "00000000-0000-0000-0000-00000036c206";
/**
 * O pro-rata é `fichas ativas × preço × dias usados`. Sem paciente nenhum o
 * `billing_apurar_ciclo` conta ZERO e todo débito sai `0` — um caso que
 * afirmaria "o valor caiu" comparando dois zeros. As fichas abaixo são o que
 * torna o VALOR um oráculo de verdade.
 */
const PACIENTES = [
  "00000000-0000-0000-0000-00000036c301",
  "00000000-0000-0000-0000-00000036c302",
  "00000000-0000-0000-0000-00000036c303",
];

let owner: ReturnType<typeof postgres>;

/**
 * O `ProvedorFake` fala HTTP de verdade contra um host próprio — é assim que
 * "o gateway foi chamado" e "o gateway NÃO foi chamado" viram observação, e
 * não inferência sobre o valor de retorno.
 */
let chamadasGateway: string[] = [];

function instalarGateway(): void {
  chamadasGateway = [];
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    chamadasGateway.push(url);
    if (url.endsWith("/cancelamento")) {
      return Response.json({ estado: "CANCELADO" });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

async function limpar() {
  // A trilha do corte referencia `clinic`; sem apagá-la primeiro o DELETE da
  // clínica viola `audit_log_clinic_id_clinic_id_fk`.
  await owner`DELETE FROM audit_log WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM billing_cycle_patient WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM billing_cycle WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM session WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM patient WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM subscription WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM user_role WHERE clinic_id = ${CLINICA}`;
  await owner`DELETE FROM user_role WHERE user_id = ${TERAPEUTA}`;
  await owner`DELETE FROM app_user WHERE id IN (${USUARIO}, ${TERAPEUTA})`;
  await owner`DELETE FROM clinic WHERE id = ${CLINICA}`;
}

async function semear(status: "active" | "past_due" | "canceled") {
  await owner`INSERT INTO clinic (id, nome, is_demo)
    VALUES (${CLINICA}, 'Clínica cancelamento voluntário', false)`;
  await owner`INSERT INTO app_user (id, name, email)
    VALUES (${USUARIO}, 'Coord', 'coord.cancelvoluntario@t.com')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel)
    VALUES (${USUARIO}, ${CLINICA}, 'coordenador')`;
  await owner`INSERT INTO subscription
    (id, clinic_id, status, provider, provider_subscription_id,
     ciclo_atual_inicio, ciclo_atual_fim, ativada_em)
    VALUES (${SUB}, ${CLINICA}, ${status}, ${ID_PROVEDOR_FAKE}, ${VINCULO},
     '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', '2026-08-01T00:00:00Z')`;
  await owner`INSERT INTO app_user (id, name, email)
    VALUES (${TERAPEUTA}, 'Terapeuta', 'terapeuta.cancelvoluntario@t.com')`;
  await owner`INSERT INTO user_role (user_id, clinic_id, papel)
    VALUES (${TERAPEUTA}, ${CLINICA}, 'terapeuta')`;
  // Fichas criadas DENTRO do primeiro ciclo — `criado_no_ciclo`.
  for (const [i, pid] of PACIENTES.entries()) {
    await owner`INSERT INTO patient (id, clinic_id, nome, criado_em)
      VALUES (${pid}, ${CLINICA}, ${`Paciente ${i + 1}`},
        '2026-08-02T00:00:00Z')`;
    // Sessão em setembro, em horários distintos: o mesmo terapeuta na mesma
    // hora esbarraria em `session_no_overbook_terapeuta`. É o que faz a mesma
    // ficha contar como
    // `interacao_no_ciclo` no ciclo seguinte, sem o qual o segundo pro-rata
    // sairia zero por ausência de fichas, e não por ter durado 3 dias.
    await owner`INSERT INTO session
      (clinic_id, patient_id, terapeuta_id, agendada_para, disciplina)
      VALUES (${CLINICA}, ${pid}, ${TERAPEUTA},
        ${`2026-09-02T${String(8 + i * 2).padStart(2, "0")}:00:00Z`}, 'fono')`;
  }
  await owner`INSERT INTO billing_cycle
    (id, clinic_id, subscription_id, inicio, fim, status,
     pacientes_contados, valor_centavos)
    VALUES (${CICLO}, ${CLINICA}, ${SUB},
     '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z', 'aberto', 0, 0)`;
}

describe.skipIf(!hasDb)("cancelarAssinaturaDaClinica", () => {
  beforeEach(async () => {
    owner ??= postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    instalarGateway();
    await limpar();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await limpar();
    await owner?.end();
  });

  it("corta assinatura ativa: status canceled, cancelada_em gravada", async () => {
    await semear("active");
    const r = await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    expect(r).toEqual({ cancelada: true });

    // Oráculo é o banco RELIDO pela conexão dona — o retorno diria `true`
    // mesmo que o UPDATE tivesse sido um no-op.
    const [linha] = await owner`
      SELECT status, cancelada_em FROM subscription WHERE id = ${SUB}`;
    expect(linha?.status).toBe("canceled");
    expect(linha?.cancelada_em).toBeInstanceOf(Date);
    expect(chamadasGateway).toContain(
      `${BASE_URL_FAKE}/vinculos/${VINCULO}/cancelamento`,
    );
  });

  it("congela o ciclo aberto como débito pro-rata", async () => {
    await semear("active");
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    const [ciclo] = await owner`
      SELECT status, valor_centavos FROM billing_cycle WHERE id = ${CICLO}`;
    expect(ciclo?.status).toBe("devido");
  });

  it("recusa cancelar quem já está cancelada, sem tocar o gateway", async () => {
    await semear("canceled");
    const r = await cancelarAssinaturaDaClinica(CLINICA);
    expect(r).toEqual({
      cancelada: false,
      motivo: "estado_nao_cancelavel",
      statusAtual: "canceled",
    });
    // Recusa antes do gateway: nenhuma revogação disparada.
    expect(chamadasGateway).toEqual([]);
  });

  it("recusa clínica sem assinatura", async () => {
    await owner`INSERT INTO clinic (id, nome, is_demo)
      VALUES (${CLINICA}, 'Clínica sem assinatura', false)`;
    const r = await cancelarAssinaturaDaClinica(CLINICA);
    expect(r).toEqual({
      cancelada: false,
      motivo: "sem_assinatura",
      statusAtual: null,
    });
  });
  it("ida-volta-ida: o segundo pro-rata mede do ciclo NOVO, não do carimbo antigo", async () => {
    await semear("active");

    // IDA — cancela no dia 15 de um ciclo de 01 a 31.
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    const [depoisDaIda] = await owner`
      SELECT valor_centavos FROM billing_cycle WHERE id = ${CICLO}`;
    const valorPrimeiroCorte = Number(depoisDaIda?.valor_centavos ?? 0);

    // VOLTA — reativação: o gateway confirma a nova autorização.
    await aplicarStatusProvider(VINCULO, "autorizada");
    const [reativada] = await owner`
      SELECT status, cancelada_em FROM subscription WHERE id = ${SUB}`;
    expect(reativada?.status).toBe("active");
    // O carimbo TEM de sair. Deixado para trás, ele é a data de onde o segundo
    // pro-rata mediria — e o cálculo satura no piso.
    expect(reativada?.cancelada_em).toBeNull();

    // Ciclo novo, curto: 01/09 a 30/09, cancelado no dia 03.
    const CICLO_2 = "00000000-0000-0000-0000-00000036c205";
    await owner`UPDATE subscription
      SET ciclo_atual_inicio = '2026-09-01T00:00:00Z',
          ciclo_atual_fim = '2026-09-30T00:00:00Z'
      WHERE id = ${SUB}`;
    await owner`INSERT INTO billing_cycle
      (id, clinic_id, subscription_id, inicio, fim, status,
       pacientes_contados, valor_centavos)
      VALUES (${CICLO_2}, ${CLINICA}, ${SUB},
       '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z', 'aberto', 5, 0)`;

    // IDA de novo — 3 dias usados de 29.
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-09-03T12:00:00Z"),
    });
    const [depoisDaSegundaIda] = await owner`
      SELECT status, valor_centavos FROM billing_cycle WHERE id = ${CICLO_2}`;
    expect(depoisDaSegundaIda?.status).toBe("devido");

    // O ORÁCULO É O VALOR. 3 dias custam menos que 15 — se o carimbo antigo
    // tivesse sobrevivido, este valor bateria no ciclo inteiro e ficaria >=.
    const valorSegundoCorte = Number(depoisDaSegundaIda?.valor_centavos ?? 0);
    expect(valorSegundoCorte).toBeLessThan(valorPrimeiroCorte);
  });

  it("o débito do ciclo interrompido aparece para a tela", async () => {
    await semear("active");
    await cancelarAssinaturaDaClinica(CLINICA, {
      agora: new Date("2026-08-15T12:00:00Z"),
    });
    const debito = await levantarDebito(SUB);
    expect(debito.totalCentavos).toBeGreaterThan(0);
  });
});
