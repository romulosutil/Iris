import { describe, expect, test } from "vitest";
import { derivarSituacao, mensagemDeEstado } from "./estado-conta";

/**
 * Matriz completa da decisão unificada (#163).
 *
 * `derivarSituacao` é a regra isolada do I/O justamente para poder ser
 * exercitada assim: sem banco, com o instante injetado, cobrindo cada célula da
 * tabela status × relógio. O deadlock que este trabalho conserta era invisível
 * porque a regra estava espalhada entre dois módulos e só aparecia integrada.
 */

const TZ = "America/Sao_Paulo";
const AGORA = new Date("2026-08-04T15:00:00Z");

/** Clínica criada há muito tempo, com o relógio iniciado em `inicioTrial`. */
function linha(opcoes: {
  status?: string | null;
  isento?: boolean;
  trialComecoEm?: Date | null;
  trialDias?: number | null;
  criadoEm?: Date;
  debitoCentavos?: number | string | null;
}) {
  return {
    ...(opcoes.debitoCentavos === undefined
      ? {}
      : { debito_centavos: opcoes.debitoCentavos }),
    status: opcoes.status ?? null,
    isento_trial: opcoes.isento ?? false,
    trial_comeco_em:
      opcoes.trialComecoEm === undefined
        ? new Date("2026-08-01T12:00:00Z")
        : opcoes.trialComecoEm,
    trial_dias: opcoes.trialDias === undefined ? 7 : opcoes.trialDias,
    criado_em: opcoes.criadoEm ?? new Date("2026-01-01T12:00:00Z"),
    timezone: TZ,
  };
}

describe("derivarSituacao", () => {
  test("clínica inexistente para o tenant cai em somente-leitura", () => {
    const s = derivarSituacao(undefined, AGORA);
    expect(s.podeEscrever).toBe(false);
    expect(s.statusAssinatura).toBe("desconhecido");
  });

  test("isento_trial curto-circuita tudo, inclusive trial vencido", () => {
    const s = derivarSituacao(
      linha({ isento: true, trialComecoEm: new Date("2020-01-01T00:00:00Z") }),
      AGORA,
    );
    expect(s.estado).toBe("isenta");
    expect(s.podeEscrever).toBe(true);
  });

  test("sem trial_dias configurado a clínica fica fora do modelo comercial", () => {
    const s = derivarSituacao(linha({ trialDias: null }), AGORA);
    expect(s.estado).toBe("isenta");
    expect(s.podeEscrever).toBe(true);
  });

  // ── O fix ────────────────────────────────────────────────────────────────
  // Estes dois casos são o desfazimento do deadlock. Antes, `free_tier` e
  // `setup_pending` recusavam a escrita, o gate rodava ANTES de
  // `app_iniciar_trial()`, e o trial de 7 dias nunca começava para ninguém.

  test("free_tier com trial ativo ESCREVE — é o fix do deadlock", () => {
    const s = derivarSituacao(linha({ status: null }), AGORA);
    expect(s.estado).toBe("trial_ativo");
    expect(s.podeEscrever).toBe(true);
    expect(s.podeCadastrarPaciente).toBe(true);
  });

  test("free_tier sem 1º paciente, dentro do teto de 14 dias, ESCREVE", () => {
    const s = derivarSituacao(
      linha({
        status: "free_tier",
        trialComecoEm: null,
        criadoEm: new Date("2026-08-01T12:00:00Z"),
      }),
      AGORA,
    );
    expect(s.estado).toBe("trial_aguardando");
    expect(s.podeEscrever).toBe(true);
  });

  test("setup_pending durante o trial ESCREVE — ativar não pode piorar a situação", () => {
    const s = derivarSituacao(linha({ status: "setup_pending" }), AGORA);
    expect(s.estado).toBe("trial_ativo");
    expect(s.podeEscrever).toBe(true);
  });

  // ── Somente-leitura ──────────────────────────────────────────────────────

  test("free_tier com trial vencido vira somente-leitura, não bloqueio de cadastro", () => {
    const s = derivarSituacao(
      linha({
        status: "free_tier",
        trialComecoEm: new Date("2026-06-01T12:00:00Z"),
      }),
      AGORA,
    );
    expect(s.estado).toBe("trial_expirado");
    expect(s.podeEscrever).toBe(false);
    expect(s.diasRestantesTrial).toBeLessThan(0);
  });

  test("setup_pending com trial vencido vira pagamento_em_processamento", () => {
    const s = derivarSituacao(
      linha({
        status: "setup_pending",
        trialComecoEm: new Date("2026-06-01T12:00:00Z"),
      }),
      AGORA,
    );
    expect(s.estado).toBe("pagamento_em_processamento");
    expect(s.podeEscrever).toBe(false);
  });

  test("canceled bloqueia MESMO com trial nominalmente ativo", () => {
    const s = derivarSituacao(linha({ status: "canceled" }), AGORA);
    expect(s.estado).toBe("cancelada");
    expect(s.podeEscrever).toBe(false);
  });

  // ── #287 Problema 2 — o corte sem carência é decisão, não descuido ────────
  // O Problema 2 pedia uma janela de escrita depois do cancelamento, espelhando
  // `carencia_dias` do `past_due`. Foi SUPERADO na #290: com o ciclo cobrado em
  // pro-rata só na reativação, essa janela é o dia grátis que o loop
  // cancela-usa-cancela procura. Estes casos existem para que reintroduzir a
  // carência tenha de derrubar um teste que diz o porquê, em vez de passar como
  // "melhoria de UX".

  test("cancelamento não ganha carência nenhuma — nem no instante seguinte ao corte", () => {
    // `derivarSituacao` decide por status, sem consultar `cancelada_em`: não há
    // relógio de carência para consultar, e é essa ausência que é o contrato.
    // Qualquer instante do calendário devolve o mesmo somente-leitura.
    for (const agora of [
      new Date("2026-08-04T15:00:01Z"),
      new Date("2026-08-05T15:00:00Z"),
      new Date("2026-08-11T15:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    ]) {
      const s = derivarSituacao(linha({ status: "canceled" }), agora);
      expect(s.estado).toBe("cancelada");
      expect(s.podeEscrever).toBe(false);
      expect(s.podeCadastrarPaciente).toBe(false);
    }
  });

  test("canceled e past_due são assimétricos de propósito: só o inadimplente escreve", () => {
    // Mesma clínica, mesmo relógio, só o status muda. `past_due` mantém a
    // escrita (a assinatura está viva e o ciclo continua sendo faturado);
    // `canceled` não (o ciclo já foi congelado como débito, ver #290).
    const relogio = { trialComecoEm: new Date("2020-01-01T00:00:00Z") };
    expect(
      derivarSituacao(linha({ status: "past_due", ...relogio }), AGORA)
        .podeEscrever,
    ).toBe(true);
    expect(
      derivarSituacao(linha({ status: "canceled", ...relogio }), AGORA)
        .podeEscrever,
    ).toBe(false);
  });

  // ── Assinatura viva ──────────────────────────────────────────────────────

  test("active escreve independentemente do relógio", () => {
    for (const trialComecoEm of [null, new Date("2020-01-01T00:00:00Z")]) {
      const s = derivarSituacao(
        linha({ status: "active", trialComecoEm }),
        AGORA,
      );
      expect(s.estado).toBe("ativa");
      expect(s.podeEscrever).toBe(true);
    }
  });

  test("past_due escreve sempre — inadimplência não tranca prontuário", () => {
    const s = derivarSituacao(
      linha({
        status: "past_due",
        trialComecoEm: new Date("2020-01-01T00:00:00Z"),
      }),
      AGORA,
    );
    expect(s.estado).toBe("pagamento_atrasado");
    expect(s.podeEscrever).toBe(true);
  });

  test("último dia do trial ainda escreve (diasRestantes === 0 não é vencido)", () => {
    // Trial de 7 dias iniciado em 28/07 no fuso da clínica → 04/08 é o dia 7,
    // ou seja, `diasRestantes === 0`: último dia, ainda ativo.
    const s = derivarSituacao(
      linha({
        status: "free_tier",
        trialComecoEm: new Date("2026-07-28T12:00:00Z"),
      }),
      AGORA,
    );
    expect(s.estado).toBe("trial_ativo");
    expect(s.diasRestantesTrial).toBe(0);
    expect(s.podeEscrever).toBe(true);
  });
});

describe("mensagemDeEstado", () => {
  test("só os estados de somente-leitura têm copy", () => {
    for (const estado of [
      "trial_expirado",
      "pagamento_em_processamento",
      "cancelada",
    ] as const) {
      expect(mensagemDeEstado(estado).length).toBeGreaterThan(0);
    }
    for (const estado of [
      "isenta",
      "trial_aguardando",
      "trial_ativo",
      "ativa",
      "pagamento_atrasado",
    ] as const) {
      expect(mensagemDeEstado(estado)).toBe("");
    }
  });

  test("a copy do trial expirado promete leitura e exportação, não bloqueio total", () => {
    const msg = mensagemDeEstado("trial_expirado");
    expect(msg).toMatch(/exportando/i);
    expect(msg).toMatch(/ficha[s]? ativa/i);
  });
});

/**
 * Conta devedora (#290).
 *
 * O débito é dado de faturamento, não estado: `cancelada` continua sendo
 * `cancelada`, e `ativa` com dívida é situação NORMAL — reativar com débito
 * abaixo do piso de cobrança do gateway deixa a dívida viva. Um estado novo
 * ("cancelada_devedora") teria multiplicado a matriz sem acrescentar decisão
 * nenhuma: ninguém escreve mais nem menos por dever.
 */
describe("débito na situação da conta", () => {
  test("cancelada com débito continua somente-leitura e carrega o valor", () => {
    const s = derivarSituacao(
      linha({ status: "canceled", debitoCentavos: 1300 }),
      AGORA,
    );
    expect(s.estado).toBe("cancelada");
    expect(s.podeEscrever).toBe(false);
    expect(s.debitoCentavos).toBe(1300);
  });

  test("dever não tira a escrita de quem está com a conta ativa", () => {
    // É o caminho de quem reativou com débito abaixo do piso. Bloquear aqui
    // seria cobrar duas vezes pelo mesmo atraso: o valor já vai ser cobrado na
    // próxima reativação.
    const s = derivarSituacao(
      linha({ status: "active", debitoCentavos: 260 }),
      AGORA,
    );
    expect(s.estado).toBe("ativa");
    expect(s.podeEscrever).toBe(true);
    expect(s.debitoCentavos).toBe(260);
  });

  test("SUM do Postgres chega como string e vira número, não concatenação", () => {
    // O driver devolve `numeric` como string. Sem a normalização, `"1300"`
    // vazaria para a UI e `formatarBRL` receberia texto.
    const s = derivarSituacao(
      linha({ status: "canceled", debitoCentavos: "1300" }),
      AGORA,
    );
    expect(s.debitoCentavos).toBe(1300);
  });

  test("ausência da coluna vira zero, não NaN", () => {
    const s = derivarSituacao(linha({ status: "canceled" }), AGORA);
    expect(s.debitoCentavos).toBe(0);
  });

  test("clínica inexistente para o tenant não inventa dívida", () => {
    expect(derivarSituacao(undefined, AGORA).debitoCentavos).toBe(0);
  });

  test("a copy de cancelada só menciona valor quando há valor", () => {
    const semDebito = mensagemDeEstado("cancelada");
    expect(semDebito).not.toMatch(/R\$/);

    const comDebito = mensagemDeEstado("cancelada", 1300);
    expect(comDebito).toMatch(/13,00/);
    // Continua prometendo o que a conta cancelada de fato permite.
    expect(comDebito).toMatch(/exportando/i);
  });

  test("débito zero não altera a copy de nenhum estado", () => {
    expect(mensagemDeEstado("cancelada", 0)).toBe(
      mensagemDeEstado("cancelada"),
    );
    expect(mensagemDeEstado("ativa", 1300)).toBe("");
  });
});
