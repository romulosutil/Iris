import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import { viewport } from "./layout";

const m = manifest();

describe("manifesto PWA", () => {
  it("declara display standalone (pré-requisito do TWA)", () => {
    // Sem `standalone` o TWA da Etapa 3 sobe com a barra de endereço do
    // Chrome por cima do app — e a reprovação só aparece no aparelho.
    expect(m.display).toBe("standalone");
  });

  it("usa a raiz como start_url e escopo", () => {
    // `/` resolve os dois estados: `src/app/page.tsx` redireciona quem tem
    // sessão para /agenda e serve a landing para quem não tem. A spec original
    // dizia `/app`, rota que não existe neste repo — apontar para ela daria
    // 404 no primeiro toque do app instalado.
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("usa o mesmo theme_color do viewport do documento", () => {
    // Divergir faz a barra de status trocar de cor na primeira navegação.
    expect(m.theme_color).toBe(viewport.themeColor);
    expect(m.theme_color).toBe("#f2b705");
  });

  it("declara os 4 ícones, e os arquivos existem em disco", () => {
    const caminhos = (m.icons ?? []).map((i) => i.src);
    expect(caminhos).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
    ]);

    // Manifesto apontando para arquivo inexistente é o modo de falha mais
    // comum aqui: o Next serve o JSON com 200, o navegador baixa 404 e a
    // instalação simplesmente não é oferecida — sem erro em lugar nenhum.
    for (const src of caminhos) {
      const disco = path.join(process.cwd(), "public", src);
      expect(existsSync(disco), `arquivo ausente: public${src}`).toBe(true);
    }
  });

  it("marca os dois ícones maskable com purpose maskable", () => {
    const maskables = (m.icons ?? []).filter((i) => i.purpose === "maskable");
    expect(maskables.map((i) => i.src)).toEqual([
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
    ]);
  });

  it("declara orientação e idioma pt-BR", () => {
    expect(m.lang).toBe("pt-BR");
    expect(m.orientation).toBe("portrait");
  });
});
