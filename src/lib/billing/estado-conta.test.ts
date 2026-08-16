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
}) {
  return {
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
      linha({ status: "free_tier", trialComecoEm: new Date("2026-06-01T12:00:00Z") }),
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

  // ── Assinatura viva ──────────────────────────────────────────────────────

  test("active escreve independentemente do relógio", () => {
    for (const trialComecoEm of [null, new Date("2020-01-01T00:00:00Z")]) {
      const s = derivarSituacao(linha({ status: "active", trialComecoEm }), AGORA);
      expect(s.estado).toBe("ativa");
      expect(s.podeEscrever).toBe(true);
    }
  });

  test("past_due escreve sempre — inadimplência não tranca prontuário", () => {
    const s = derivarSituacao(
      linha({ status: "past_due", trialComecoEm: new Date("2020-01-01T00:00:00Z") }),
      AGORA,
    );
    expect(s.estado).toBe("pagamento_atrasado");
    expect(s.podeEscrever).toBe(true);
  });

  test("último dia do trial ainda escreve (diasRestantes === 0 não é vencido)", () => {
    // Trial de 7 dias iniciado em 28/07 no fuso da clínica → 04/08 é o dia 7,
    // ou seja, `diasRestantes === 0`: último dia, ainda ativo.
    const s = derivarSituacao(
      linha({ status: "free_tier", trialComecoEm: new Date("2026-07-28T12:00:00Z") }),
      AGORA,
    );
    expect(s.estado).toBe("trial_ativo");
    expect(s.diasRestantesTrial).toBe(0);
    expect(s.podeEscrever).toBe(true);
  });
});

describe("mensagemDeEstado", () => {
  test("só os estados de somente-leitura têm copy", () => {
    for (const estado of ["trial_expirado", "pagamento_em_processamento", "cancelada"] as const) {
      expect(mensagemDeEstado(estado).length).toBeGreaterThan(0);
    }
    for (const estado of ["isenta", "trial_aguardando", "trial_ativo", "ativa", "pagamento_atrasado"] as const) {
      expect(mensagemDeEstado(estado)).toBe("");
    }
  });

  test("a copy do trial expirado promete leitura e exportação, não bloqueio total", () => {
    const msg = mensagemDeEstado("trial_expirado");
    expect(msg).toMatch(/exportando/i);
    expect(msg).toMatch(/ficha[s]? ativa/i);
  });
});
