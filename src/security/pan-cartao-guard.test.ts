import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Guard anti-PAN da #378 (T9) — dados de cartão nunca entram em corpo de
 * request do Iris.
 *
 * O trilho de cartão foi desenhado (D1) sobre a **fatura hospedada** do Asaas:
 * a clínica digita o cartão no domínio deles, e o token volta pelo webhook. O
 * outro caminho que a API oferece — "checkout transparente", com os objetos
 * `creditCard` + `creditCardHolderInfo` no `POST /payments` — poria PAN e CVV
 * dentro do processo do Iris e jogaria o operador em **PCI-DSS SAQ-D**. Está
 * vetado, e o veto precisa de um guard: ele é fácil de violar por conveniência
 * (a doc do Asaas mostra esse corpo como exemplo principal) e o efeito não
 * aparece em teste nenhum — o código funcionaria.
 *
 * ## Ler resposta é permitido; escrever request não é
 *
 * O adapter **precisa** ler `payment.creditCard.creditCardToken` do corpo que o
 * Asaas devolve — é assim que o token chega (D4). Um guard que só procurasse a
 * palavra `creditCard` proibiria a leitura junto com a escrita e seria removido
 * na primeira vez que atrapalhasse.
 *
 * Por isso a varredura tem dois níveis:
 *
 * 1. **Dentro de corpo de request** (o literal que segue `corpo:` ou `body:`,
 *    com balanceamento de chaves): proíbe a CHAVE `creditCard:`, além de `ccv`
 *    e `creditCardHolderInfo`. É a escrita.
 * 2. **No arquivo inteiro**: proíbe `creditCardHolderInfo` e a chave `ccv`, que
 *    não têm leitura legítima — o Asaas nunca os devolve, então mencioná-los é
 *    sempre estar montando um envio.
 *
 * `payment.creditCard.creditCardToken` passa pelos dois: é acesso a
 * propriedade (`.creditCard`), não chave de objeto (`creditCard:`).
 */

const RAIZ = join(process.cwd(), "src");

/** Caminho relativo ao cwd com barras `/` (estável entre SO). */
function rel(abs: string): string {
  return relative(process.cwd(), abs).replace(/\\/g, "/");
}

function arquivosDeCodigo(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) return arquivosDeCodigo(caminho);
    return /\.(ts|tsx|mts|cts)$/.test(entrada.name) ? [caminho] : [];
  });
}

/**
 * Extrai os literais de objeto que são CORPO DE REQUEST: o que vem depois de
 * `corpo:` (helper `chamar` do adapter Asaas) ou `body:` (fetch cru), com
 * balanceamento de chaves para não parar na primeira `}` aninhada.
 *
 * Balanceamento ingênuo de chaves basta aqui, e o modo de erro é seguro: string
 * ou comentário com `{`/`}` desbalanceada faz o span terminar TARDE (varre mais
 * do que devia), nunca cedo. Um span grande demais só pode gerar falso
 * positivo, que alguém investiga — falso negativo é que passaria PAN em
 * silêncio.
 */
function corposDeRequest(src: string): string[] {
  const spans: string[] = [];
  const abertura = /\b(?:corpo|body)\s*:\s*\{/g;
  for (let m = abertura.exec(src); m !== null; m = abertura.exec(src)) {
    let profundidade = 0;
    const inicio = src.indexOf("{", m.index);
    for (let i = inicio; i < src.length; i++) {
      if (src[i] === "{") profundidade++;
      else if (src[i] === "}") {
        profundidade--;
        if (profundidade === 0) {
          spans.push(src.slice(inicio, i + 1));
          break;
        }
      }
    }
  }
  return spans;
}

/** Chave de objeto (`x:`) ou string literal (`"x"`), nunca `.x` de leitura. */
function chave(nome: string): RegExp {
  return new RegExp(`(?:^|[^.\\w])${nome}\\s*:|["']${nome}["']\\s*:`, "m");
}

const PROIBIDO_EM_CORPO = [
  { nome: "creditCard", padrao: chave("creditCard") },
  { nome: "creditCardHolderInfo", padrao: chave("creditCardHolderInfo") },
  { nome: "ccv", padrao: chave("ccv") },
];

describe("#378 · guarda anti-PAN", () => {
  const arquivos = arquivosDeCodigo(RAIZ).filter(
    (caminho) => !caminho.endsWith("pan-cartao-guard.test.ts"),
  );

  test("a varredura enxerga o código e os corpos de request", () => {
    // Controle positivo. Sem isto, um extrator quebrado (ou uma raiz errada)
    // deixaria o guard verde varrendo o vazio — o modo de falha catalogado em
    // [teste-verde-que-nao-testa-nada].
    expect(arquivos.length).toBeGreaterThan(100);
    const corpos = arquivos.flatMap((caminho) =>
      corposDeRequest(readFileSync(caminho, "utf8")),
    );
    expect(corpos.length).toBeGreaterThan(5);
  });

  test("nenhum corpo de request carrega dados de cartão", () => {
    const achados: string[] = [];
    for (const caminho of arquivos) {
      for (const corpo of corposDeRequest(readFileSync(caminho, "utf8"))) {
        for (const { nome, padrao } of PROIBIDO_EM_CORPO) {
          if (padrao.test(corpo)) achados.push(`${rel(caminho)}: ${nome}`);
        }
      }
    }
    // `toEqual([])` e não `toHaveLength(0)`: a falha imprime QUAL arquivo e qual
    // campo, que é a informação de que quem quebrou o guard precisa.
    expect(achados).toEqual([]);
  });

  test("PAN e CVV não aparecem nem fora de corpo de request", () => {
    // `creditCardHolderInfo` e a chave `ccv` não têm leitura legítima: o Asaas
    // não os devolve em resposta nenhuma. Aparecer em qualquer lugar de `src/`
    // significa que alguém está montando um envio — talvez num helper, longe do
    // `corpo:` que o teste acima varre.
    const achados: string[] = [];
    for (const caminho of arquivos) {
      const src = readFileSync(caminho, "utf8");
      if (/creditCardHolderInfo/.test(src)) {
        achados.push(`${rel(caminho)}: creditCardHolderInfo`);
      }
      if (chave("ccv").test(src)) achados.push(`${rel(caminho)}: ccv`);
    }
    expect(achados).toEqual([]);
  });

  test("ler o token da RESPOSTA continua permitido", () => {
    // O guard tem que deixar D4 possível. Se algum dia esta asserção falhar, o
    // guard virou proibição de ler — e a próxima pessoa vai (com razão) removê-lo
    // inteiro em vez de corrigi-lo.
    const leituraLegitima = `
      const cartao = comoRegistro(pagamento.creditCard);
      const token = comoTexto(cartao.creditCardToken);
    `;
    for (const { padrao } of PROIBIDO_EM_CORPO) {
      expect(padrao.test(leituraLegitima)).toBe(false);
    }
  });
});
