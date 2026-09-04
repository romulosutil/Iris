/**
 * Captura dos registros de `scripts/lib/log-estruturado.mjs`, para teste
 * (#560, F3b).
 *
 * ## Por que fica FORA de `scripts/lib/`
 *
 * `infra/escalonamento/Dockerfile` copia `scripts/lib/` INTEIRO (`COPY
 * scripts/lib/ ./scripts/lib/`), não arquivo a arquivo. Um helper de teste ali
 * viraria peso e superfície numa imagem de produção, e ainda seria varrido pelo
 * `scripts/ci/verificar-deps-imagem.mjs` como se fosse código de job. Aqui não
 * é copiado por Dockerfile nenhum.
 *
 * ## O que ele mede
 *
 * O emissor escreve JSON em `process.stdout`/`process.stderr` — não há sink
 * plugável, porque dentro da imagem não existe teste para instalar um. Então a
 * captura é do lado de fora: espiona os dois descritores e devolve os registros
 * já parseados, que é o que a asserção quer ler. Ler a string crua espalharia
 * `JSON.parse` por cada arquivo de teste, e o primeiro que esquecesse o parse
 * passaria verde comparando `undefined` com `undefined`.
 */
import { vi } from "vitest";

/**
 * Roda `fn` (pode ser assíncrona) capturando o que o emissor escreveu.
 *
 * Devolve `{ registros, evento, houve, bruto }` — a mesma superfície do
 * `capturarLog()` da app (`src/lib/observabilidade/captura-de-log.ts`), para
 * que uma asserção escrita de um lado se leia igual do outro.
 */
export async function capturarLogDeJob(fn) {
  const linhas = [];
  const escrever = (texto) => {
    for (const linha of String(texto).split("\n")) {
      if (linha.trim()) linhas.push(linha);
    }
    return true;
  };
  const espioes = [
    vi.spyOn(process.stdout, "write").mockImplementation(escrever),
    vi.spyOn(process.stderr, "write").mockImplementation(escrever),
  ];
  try {
    await fn();
  } finally {
    for (const espiao of espioes) espiao.mockRestore();
  }

  const registros = linhas.map((linha) => JSON.parse(linha));
  return {
    registros,
    evento: (nome) => registros.find((r) => r.evento === nome),
    houve: (nome) => registros.some((r) => r.evento === nome),
    bruto: () => JSON.stringify(registros),
  };
}
