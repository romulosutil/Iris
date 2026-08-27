// @ts-check
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Gera os ícones PNG do manifesto PWA (#185, Etapa 2) a partir do glifo
 * `src/app/icon.svg`.
 *
 * Por que Chromium e não `sharp`: o Playwright já é devDependency deste repo e
 * traz o próprio Chromium. `sharp` seria dependência nativa nova só para
 * rasterizar 4 arquivos que mudam quando a marca muda — ou seja, quase nunca.
 *
 * Os PNGs são COMMITADOS. Este script é regenerador, não passo de build: nada
 * em CI depende dele. Se a marca mudar, roda-se de novo e commita-se o
 * resultado.
 *
 * Duas famílias de ícone, e a diferença importa:
 *  - `any`: fundo transparente, glifo ocupando 100%. É o que o navegador usa
 *    em atalho comum e no seletor de abas.
 *  - `maskable`: fundo CHAPADO na cor da marca e glifo em 60% do canvas. O
 *    Android recorta o ícone em qualquer forma (círculo, squircle, gota) e só
 *    garante os 80% centrais. Glifo a 100% num maskable sai com as pontas
 *    cortadas; fundo transparente sai com halo preto.
 */
const raiz = process.cwd();
const origem = path.join(raiz, "src", "app", "icon.svg");
const destino = path.join(raiz, "public", "icons");

const FUNDO_MARCA = "#f2b705";

/** @type {{arquivo: string, tamanho: number, maskable: boolean}[]} */
const ALVOS = [
  { arquivo: "icon-192.png", tamanho: 192, maskable: false },
  { arquivo: "icon-512.png", tamanho: 512, maskable: false },
  { arquivo: "icon-maskable-192.png", tamanho: 192, maskable: true },
  { arquivo: "icon-maskable-512.png", tamanho: 512, maskable: true },
];

async function main() {
  const svg = await readFile(origem, "utf8");
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

  await mkdir(destino, { recursive: true });

  const navegador = await chromium.launch();
  try {
    for (const alvo of ALVOS) {
      const pagina = await navegador.newPage({
        viewport: { width: alvo.tamanho, height: alvo.tamanho },
        deviceScaleFactor: 1,
      });

      const escala = alvo.maskable ? 60 : 100;
      const fundo = alvo.maskable ? FUNDO_MARCA : "transparent";

      await pagina.setContent(
        `<!doctype html><html><body style="margin:0;width:100vw;height:100vh;` +
          `background:${fundo};display:flex;align-items:center;justify-content:center">` +
          `<img src="${dataUri}" style="width:${escala}%;height:${escala}%;object-fit:contain">` +
          `</body></html>`,
      );

      const png = await pagina.screenshot({
        omitBackground: !alvo.maskable,
        type: "png",
      });
      await writeFile(path.join(destino, alvo.arquivo), png);
      await pagina.close();

      console.log(`gerado: public/icons/${alvo.arquivo} (${alvo.tamanho}px)`);
    }
  } finally {
    await navegador.close();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
