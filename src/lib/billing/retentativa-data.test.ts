import { describe, expect, it } from "vitest";
import { calcularDueDateDeRetentativa } from "./retentativa-data";

/**
 * #322 (D-3) — a `dueDate` da retentativa extradia é CALCULADA contra quatro
 * restrições, nunca assumida.
 *
 * Este arquivo cobre a única parte pura da varredura, e é aqui que cada
 * restrição ganha um caso próprio. O oráculo é sempre a STRING devolvida (ou
 * `null`): é ela que vai no wire do Asaas, e um erro de um dia aqui vira 400
 * com uma das 3 tentativas já reservada.
 *
 * ## Datas escritas à mão, e o teto NÃO importado
 *
 * `JANELA_RETENTATIVA_DIAS_CORRIDOS` fica de fora de propósito: importar a
 * constante faria os casos concordarem com qualquer valor que ela tivesse — o
 * mesmo motivo pelo qual `backstop-prazo.int.test.ts` escreve o D+7 à mão. O 7
 * daqui é o limite publicado pelo Asaas ("7 dias corridos permitidos após o
 * vencimento original"), não uma escolha nossa.
 *
 * ## O fuso é parte do contrato
 *
 * "Hoje" é dia civil de **São Paulo**, não UTC. Um `agora` às 02:00 UTC ainda é
 * o dia anterior no Brasil, e uma retentativa comandada com a data de UTC
 * pularia um dia inteiro da janela.
 */

/** 12:00 de São Paulo em 16/08/2026 (domingo). */
const AGORA = new Date("2026-08-16T15:00:00.000Z");

describe("#322 · cálculo da dueDate da retentativa extradia", () => {
  it("candidata mínima é HOJE + 1 dia (validação 3: comando até 23h59 da véspera)", () => {
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  it("o dia civil é o de São Paulo, não o de UTC", () => {
    // 23:00 do dia 16 em São Paulo — já é dia 17 em UTC. Se o cálculo lesse
    // UTC, a candidata sairia 18/08 e a janela perderia um dia inteiro.
    expect(
      calcularDueDateDeRetentativa({
        agora: new Date("2026-08-17T02:00:00.000Z"),
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  it("nunca repete a data já comandada (validação 1): anda +1 dia", () => {
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: "2026-08-17",
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-18");
  });

  it("última comandada POSTERIOR à candidata: salta para o dia seguinte a ELA", () => {
    // A terceira passada do mesmo dia civil é o caso que "diferente basta" não
    // cobre: a candidata natural (17/08) NÃO colide com a última comandada
    // (18/08), e mesmo assim devolvê-la repetiria a data da primeira passada —
    // 400 do Asaas (validação 1) com uma das 3 tentativas já reservada. Só a
    // comparação ESTRITAMENTE MAIOR chega em 19/08.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        // Teto A em 21/08 (14/08 + 7): folgado de propósito, para que o
        // oráculo seja o salto e não a janela.
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: "2026-08-18",
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-19");
  });

  it("o salto atravessa a virada de mês", () => {
    // 31/08 + 1 dia é 01/09, e não "32/08": o salto anda em data civil, não em
    // texto. Escrito à mão porque é justamente o dia em que uma aritmética de
    // string passaria despercebida.
    expect(
      calcularDueDateDeRetentativa({
        // 30/08/2026, 12:00 em São Paulo.
        agora: new Date("2026-08-30T15:00:00.000Z"),
        // Teto A em 04/09 (28/08 + 7): a data saltada ainda cabe.
        vencimentoCobranca: new Date("2026-08-28T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: "2026-08-31",
        cortePorCarencia: null,
      }),
    ).toBe("2026-09-01");
  });

  it("data já comandada DIFERENTE da candidata não desloca nada", () => {
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        // A da passada anterior, já no passado — não colide com a candidata.
        ultimaRetentativaVencimento: "2026-08-15",
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  // ── Teto A: 7 dias corridos após o vencimento original ────────────────────

  it("teto A: exatamente 7 dias corridos após o vencimento ainda vale", () => {
    // 10/08 + 7 = 17/08, que é a candidata. O limite é inclusivo.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-10T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  it("teto A: o 8º dia corrido não tem data possível", () => {
    // 09/08 + 7 = 16/08, e a candidata mínima é 17/08 — já não cabe.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-09T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBeNull();
  });

  it("teto A: o passo que evita repetir data pode ser o que estoura a janela", () => {
    // Sem a repetição, 17/08 caberia (10/08 + 7). Com ela, a candidata vira
    // 18/08 e passa do limite. É a interação entre duas restrições — o caso que
    // testar cada uma sozinha não alcança.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-10T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: "2026-08-17",
        cortePorCarencia: null,
      }),
    ).toBeNull();
  });

  it("teto A: retentativa AINDA dentro do prazo original passa", () => {
    // Vencimento no futuro (a recusa chegou antes do vencimento): a distância
    // em dias corridos é 0, e nada barra.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-20T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  // ── Teto B: estritamente antes do início do próximo ciclo ─────────────────

  /*
   * ⚠️ O limite do ciclo é um INSTANTE, e ele é convertido para dia civil de
   * São Paulo antes da comparação. Meia-noite UTC é 21h do dia ANTERIOR no
   * Brasil, então um `ciclo_atual_fim` em `2026-08-18T00:00:00Z` já é o dia
   * 17/08 aqui. É a leitura honesta da regra do Asaas, que fala em "dia de
   * início do próximo ciclo", e as duas datas dos casos abaixo são escolhidas
   * para deixar esse deslocamento explícito em vez de escondido.
   */

  it("teto B: coincidir com o dia de início do próximo ciclo já é fora", () => {
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        // Civil de São Paulo: 17/08 — o mesmo dia da candidata.
        proximoCicloInicio: new Date("2026-08-18T00:00:00.000Z"),
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBeNull();
  });

  it("teto B: a véspera do início do próximo ciclo vale", () => {
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        // Civil de São Paulo: 18/08 — a candidata de 17/08 fica estritamente
        // antes.
        proximoCicloInicio: new Date("2026-08-19T00:00:00.000Z"),
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  it("teto B não se aplica quando a assinatura não tem ciclo em curso", () => {
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-17");
  });

  // ── Teto C: estritamente antes do corte por carência ──────────────────────

  /*
   * ⚠️ Este teto é NOSSO, não do Asaas: comandar débito para o dia em que a
   * assinatura é cortada faz a clínica pagar e ficar `canceled` no mesmo dia.
   * Como o teto B, ele compara DIA CIVIL de São Paulo — o corte é um instante
   * que cai a qualquer hora, e uma `dueDate` é um dia inteiro.
   */

  it("teto C: sendo o mais restritivo dos três, é ele que decide — e a data cai ANTES do corte", () => {
    const data = calcularDueDateDeRetentativa({
      agora: AGORA,
      // Teto A permitiria até 21/08 (14/08 + 7)...
      vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
      // ...e o teto B, até 31/08 (01/09 03:00Z é 01/09 00:00 em São Paulo, e o
      // dia de início do próximo ciclo já está fora).
      proximoCicloInicio: new Date("2026-09-01T03:00:00.000Z"),
      ultimaRetentativaVencimento: null,
      // O corte é 18/08, então o último dia comandável é 17/08 — o mais
      // apertado dos três limites, e o único que a candidata encosta.
      cortePorCarencia: new Date("2026-08-18T12:00:00.000Z"),
    });

    expect(data).toBe("2026-08-17");
    // O dia do corte é escrito à mão, e a comparação lexicográfica vale porque
    // os dois lados são `YYYY-MM-DD`: a data comandada é ESTRITAMENTE anterior.
    expect(data! < "2026-08-18").toBe(true);
  });

  it("teto C: candidata no DIA do corte não tem data possível", () => {
    // Coincidir com o corte é o caso que o teto existe para barrar: o débito
    // liquidaria com a autorização de Pix Automático já revogada — ou, pior,
    // liquidaria e a clínica ficaria paga e `canceled` no mesmo dia.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: new Date("2026-08-17T12:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("teto C: o corte é lido em dia civil de São Paulo, não como instante cru", () => {
    // 18/08 00:00Z é 17/08 21:00 no Brasil: o corte acontece no dia 17, que é
    // a candidata. Comparar instantes crus (17/08 12:00Z < 18/08 00:00Z)
    // deixaria passar um débito comandado para o próprio dia do corte.
    expect(
      calcularDueDateDeRetentativa({
        agora: AGORA,
        vencimentoCobranca: new Date("2026-08-14T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: new Date("2026-08-18T00:00:00.000Z"),
      }),
    ).toBeNull();
  });

  // ── O que NÃO se faz: empurrar para dia útil bancário ─────────────────────

  it("sábado é comandado como sábado — a data NÃO é empurrada para dia útil", () => {
    // 21/08/2026 é sexta; a candidata mínima cai em 22/08, sábado. Empurrar
    // para segunda consumiria dois dias de uma janela de sete.
    expect(
      calcularDueDateDeRetentativa({
        agora: new Date("2026-08-21T15:00:00.000Z"),
        vencimentoCobranca: new Date("2026-08-20T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-08-22");
  });

  it("feriado bancário também é comandado como está", () => {
    // 07/09/2026 (Independência) é segunda-feira e feriado nacional.
    expect(
      calcularDueDateDeRetentativa({
        agora: new Date("2026-09-06T15:00:00.000Z"),
        vencimentoCobranca: new Date("2026-09-05T12:00:00.000Z"),
        proximoCicloInicio: null,
        ultimaRetentativaVencimento: null,
        cortePorCarencia: null,
      }),
    ).toBe("2026-09-07");
  });
});
