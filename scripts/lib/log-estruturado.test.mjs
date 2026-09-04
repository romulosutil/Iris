// @vitest-environment node
/**
 * #560 / F3b — o emissor de log dos jobs de infra.
 *
 * Três coisas são medidas aqui, e só a primeira é "formatação":
 *
 * 1. **a forma** — JSON numa linha, `evento`/`nivel`/`execucaoId`/`hora`;
 * 2. **a redaction** — chave proibida sai `[redigido]`, inclusive aninhada, e
 *    um `Error` no contexto NÃO é percorrido (senão `message`/`stack` voltam
 *    por uma chave que não está na lista);
 * 3. **o resumo de erro** — `logarErro` é o substituto de `console.error(err)`,
 *    que era o formato de 5 dos sítios desta fatia e imprimia a `message` do
 *    driver (SQL + params, e um desses params é a nota clínica) no painel do
 *    Easypanel, servido em HTTP puro.
 *
 * A paridade com a lista da app vive em `log-estruturado.paridade.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  chaveEhPII,
  hashCurto,
  log,
  logarErro,
  redigirContexto,
  resumirErro,
  VALOR_REDIGIDO,
} from "./log-estruturado.mjs";

/** Linhas escritas em stdout+stderr durante `fn`, já como objeto. */
function capturar(fn) {
  const linhas = [];
  const escrever = (texto) => {
    linhas.push(...String(texto).trim().split("\n").filter(Boolean));
    return true;
  };
  const espioes = [
    vi.spyOn(process.stdout, "write").mockImplementation(escrever),
    vi.spyOn(process.stderr, "write").mockImplementation(escrever),
  ];
  try {
    fn();
  } finally {
    for (const espiao of espioes) espiao.mockRestore();
  }
  return linhas.map((l) => JSON.parse(l));
}

describe("#560/F3b — forma do registro", () => {
  const nivelOriginal = process.env.LOG_NIVEL;

  afterEach(() => {
    if (nivelOriginal === undefined) delete process.env.LOG_NIVEL;
    else process.env.LOG_NIVEL = nivelOriginal;
  });

  it("emite UMA linha de JSON com evento, nível, execucaoId e hora", () => {
    const [registro] = capturar(() =>
      log.info("expurgo.lote-concluido", { linhas: 42 }),
    );

    expect(registro.evento).toBe("expurgo.lote-concluido");
    expect(registro.nivel).toBe("info");
    expect(registro.linhas).toBe(42);
    expect(registro.execucaoId).toEqual(expect.any(String));
    // ISO, como o logger da app — não `Date.toString()`, que é local e muda
    // com o fuso do container.
    expect(registro.hora).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("todas as linhas da MESMA passada carregam o mesmo execucaoId", () => {
    // É o que substitui o `requestId` num job: sem ele, duas linhas de uma
    // rodada não têm como ser ligadas uma à outra no stdout do container.
    const [a, b] = capturar(() => {
      log.info("expurgo.iniciou");
      log.info("expurgo.concluiu");
    });
    expect(a.execucaoId).toBe(b.execucaoId);
  });

  it("error e warn vão para stderr; info e debug, para stdout", () => {
    // O agendador redireciona os dois canais, mas quem lê o painel filtra por
    // eles — misturar torna "houve erro nesta passada?" ilegível.
    const destinos = [];
    const espiaoOut = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => (destinos.push("stdout"), true));
    const espiaoErr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => (destinos.push("stderr"), true));
    try {
      process.env.LOG_NIVEL = "debug";
      log.error("x.a");
      log.warn("x.b");
      log.info("x.c");
      log.debug("x.d");
    } finally {
      espiaoOut.mockRestore();
      espiaoErr.mockRestore();
    }
    expect(destinos).toEqual(["stderr", "stderr", "stdout", "stdout"]);
  });

  it("respeita LOG_NIVEL — debug não sai no default", () => {
    expect(capturar(() => log.debug("x.silencioso"))).toEqual([]);
    process.env.LOG_NIVEL = "debug";
    expect(capturar(() => log.debug("x.audivel"))).toHaveLength(1);
  });

  it("LOG_NIVEL inválido cai em info em vez de silenciar tudo", () => {
    // Fail-open no NÍVEL é o certo aqui: um valor digitado errado no painel
    // não pode apagar o log inteiro de um job — é o modo de falha em que
    // ninguém descobre que ficou cego.
    process.env.LOG_NIVEL = "verboso";
    expect(capturar(() => log.info("x.ainda-sai"))).toHaveLength(1);
    expect(capturar(() => log.debug("x.nao-sai"))).toEqual([]);
  });

  it("bigint no contexto não derruba o job", () => {
    // O driver devolve `bytes_tamanho` como bigint; `JSON.stringify` nativo
    // lança nele. Um log que ESTOURA ao registrar é pior que log ausente.
    const [registro] = capturar(() =>
      log.info("exportacao.pacote-gravado", { bytes: 10n }),
    );
    expect(registro.bytes).toBe("10");
  });
});

describe("#560/F3b — redaction por chave", () => {
  it("redige chave proibida, inclusive aninhada", () => {
    const saida = redigirContexto({
      clinicId: "c-1",
      paciente: { nome: "Fulano", idade: 7 },
    });
    expect(saida.clinicId).toBe("c-1");
    expect(saida.paciente.nome).toBe(VALOR_REDIGIDO);
    expect(saida.paciente.idade).toBe(7);
  });

  it("NÃO percorre instância de classe — senão message/stack voltam", () => {
    // O caminho pelo qual a PII voltaria sem barulho: `Error` não tem chave
    // `message` na lista percorrida se o objeto for percorrido como simples.
    const saida = redigirContexto({ err: new Error("nota ditada da sessão") });
    expect(saida.err).toBe("Error");
    expect(JSON.stringify(saida)).not.toContain("nota ditada");
  });

  it("a família de padrões pega o que a lista fechada não enumera", () => {
    for (const chave of [
      "responsavelCpf",
      "apiKey",
      "accessToken",
      "transcricaoTexto",
      "enderecoCep",
    ]) {
      expect(chaveEhPII(chave), chave).toBe(true);
    }
    // Métrica de token NÃO é credencial: `tokensEntrada` precisa passar, senão
    // a instrumentação de custo do #555 vira `[redigido]`.
    expect(chaveEhPII("tokensEntrada")).toBe(false);
  });

  it("a redaction roda no caminho real de emissão, não só no helper", () => {
    // Sem este caso, mover a chamada de `redigirContexto` para fora de
    // `registrar` passaria verde nos testes acima.
    const [registro] = capturar(() =>
      log.warn("retencao.aviso", { motivo: "queixa relatada pela mãe" }),
    );
    expect(registro.motivo).toBe(VALOR_REDIGIDO);
  });
});

describe("#560/F3b — resumo de erro", () => {
  it("logarErro registra classe e code, nunca a message do driver", () => {
    const erro = Object.assign(
      new Error("UPDATE session SET nota=$1 -- params: nota ditada da sessão"),
      { name: "PostgresError", code: "22001" },
    );

    const [registro] = capturar(() => logarErro("expurgo.lote-falhou", erro));

    expect(registro.erroNome).toBe("PostgresError");
    expect(registro.codigo).toBe("22001");
    expect(registro.hashMensagem).toBe(hashCurto(erro.message));
    expect(JSON.stringify(registro)).not.toContain("nota ditada");
  });

  it("lê o code da CAUSE — os jobs embrulham o erro do driver", () => {
    // `new Error("falha no lote 3", { cause })` é o formato real destes
    // scripts; ler só o embrulho perderia o SQLSTATE, que é o dado que
    // localiza o defeito.
    const causa = Object.assign(new Error("interno"), {
      name: "PostgresError",
      code: "23505",
      constraint_name: "uq_audit_log_tombstone",
    });
    const resumo = resumirErro(new Error("falha no lote 3", { cause: causa }));

    expect(resumo.codigo).toBe("23505");
    expect(resumo.constraint).toBe("uq_audit_log_tombstone");
    expect(resumo.causaNome).toBe("PostgresError");
    expect(resumo.erroNome).toBe("Error");
  });

  it("valor lançado que não é Error não quebra o resumo", () => {
    // `throw "string"` e `throw undefined` existem em código de terceiro; o
    // log não pode ser o lugar onde o job morre por causa disso.
    expect(resumirErro("caiu").erroNome).toBe("string");
    expect(resumirErro(undefined).erroNome).toBe("undefined");
  });

  it("extra do chamador passa pela redaction como qualquer contexto", () => {
    // O `extra` é o caminho pelo qual um chamador distraído reintroduziria
    // PII depois de todo o cuidado no resumo.
    const [registro] = capturar(() =>
      logarErro("x.falhou", new Error("y"), {
        clinicId: "c-1",
        nome: "Fulano",
      }),
    );
    expect(registro.clinicId).toBe("c-1");
    expect(registro.nome).toBe(VALOR_REDIGIDO);
  });
});
