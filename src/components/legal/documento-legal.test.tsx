import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import PrivacidadePage from "@/app/(publico)/privacidade/page";
import TermosPage from "@/app/(publico)/termos/page";
import { DOCUMENTOS_LEGAIS, type SlugLegal } from "@/lib/legal";
import { DocumentoLegal } from "./documento-legal";

/**
 * Renderiza a rota pública de ponta a ponta, do `page.tsx` até o markdown lido
 * de `docs/legal/`.
 *
 * **Isto é o teste de "acessível sem sessão".** Nada de `@/auth/tenant` é
 * mockado aqui: se alguém mover estas rotas para dentro do grupo `(app)` ou
 * introduzir um guard de sessão no caminho, o render passa a exigir contexto de
 * tenant e o teste quebra. O guard do produto vive em `src/app/(app)/layout.tsx`
 * — estas páginas moram no grupo `(publico)` de `src/app`, como `sobre`,
 * justamente para ficarem fora dele.
 *
 * Nenhum teste aqui toca banco de dados.
 */
async function renderizarRota(Page: () => ReactElement, slug: SlugLegal) {
  const elemento = Page();
  // O `page.tsx` precisa mesmo delegar para o componente que lê o markdown —
  // se alguém colar o texto legal dentro do `.tsx`, esta asserção cai.
  expect(elemento.type).toBe(DocumentoLegal);
  expect(elemento.props).toMatchObject({ slug });
  return render(await DocumentoLegal({ slug }));
}

const rotas: Array<{
  nome: string;
  Page: () => ReactElement;
  slug: SlugLegal;
  titulo: RegExp;
}> = [
  {
    nome: "/termos",
    Page: TermosPage,
    slug: "termos",
    titulo: /^Termos de Uso/,
  },
  {
    nome: "/privacidade",
    Page: PrivacidadePage,
    slug: "privacidade",
    titulo: /^Política de Privacidade/,
  },
];

describe.each(rotas)("rota pública $nome", ({ Page, slug, titulo }) => {
  it("renderiza sem sessão", async () => {
    await renderizarRota(Page, slug);
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("expõe a versão do documento no texto da página", async () => {
    const { container } = await renderizarRota(Page, slug);
    // Requisito da fatia: a versão precisa estar visível na página renderizada,
    // não só no markdown. Cada rota é comparada com a constante do SEU
    // documento (VERSAO_TERMO nos Termos, VERSAO_POLITICA na Política) — se a
    // página renderizar a constante errada após uma divergência de versões,
    // este teste cai.
    const versao = DOCUMENTOS_LEGAIS[slug].versao;
    expect(container.textContent).toContain(versao);
    expect(screen.getAllByText(versao).length).toBeGreaterThan(0);
  });

  it("tem exatamente um h1, e é o título do documento", async () => {
    await renderizarRota(Page, slug);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent ?? "").toMatch(titulo);
  });

  it("não pula nível de heading (h1 → h2 → h3)", async () => {
    const { container } = await renderizarRota(Page, slug);
    const niveis = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
      (h) => Number(h.tagName[1]),
    );
    expect(niveis.length).toBeGreaterThan(5);
    expect(niveis[0]).toBe(1);
    niveis.forEach((nivel, i) => {
      if (i === 0) return;
      const anterior = niveis[i - 1] ?? 1;
      // Descer só um nível por vez; subir vários é legítimo (fim de subseção).
      expect(nivel - anterior, `heading #${i} pulou nível`).toBeLessThanOrEqual(
        1,
      );
    });
  });

  it("usa landmarks reais e um único main", async () => {
    const { container } = await renderizarRota(Page, slug);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("header")).toBeTruthy();
    expect(container.querySelector("footer")).toBeTruthy();
    // O conteúdo legal é um `article` com idioma explícito — leitor de tela
    // precisa escolher a pronúncia certa num documento inteiro em pt-BR.
    const artigo = container.querySelector("article");
    expect(artigo?.getAttribute("lang")).toBe("pt-BR");
  });

  it("renderiza o markdown como HTML, não como texto cru", async () => {
    const { container } = await renderizarRota(Page, slug);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(5);
    expect(container.querySelectorAll("li").length).toBeGreaterThan(3);
    // Se o markdown vazasse cru, apareceriam os marcadores de sintaxe.
    expect(screen.queryByText(/^## /)).toBeNull();
  });

  it("mantém os marcadores de pendência visíveis para o leitor", async () => {
    const { container } = await renderizarRota(Page, slug);
    // Placeholder honesto vence dado verossímil: o que o advogado precisa ver
    // tem que chegar à página, não ficar só no arquivo.
    expect(container.textContent).toContain("⟨PENDENTE:");
    expect(
      screen.getByRole("heading", { name: /Itens em aberto/i }),
    ).toBeTruthy();
  });

  it("linka o outro documento legal", async () => {
    await renderizarRota(Page, slug);
    const destino = slug === "termos" ? "/privacidade" : "/termos";
    const links = screen.getAllByRole("link");
    expect(links.some((a) => a.getAttribute("href") === destino)).toBe(true);
  });
});

describe("conteúdo dos Termos de Uso publicados", () => {
  it("mostra o compromisso de somente-leitura com exportação livre", async () => {
    const { container } = await renderizarRota(TermosPage, "termos");
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("A clínica NÃO perde o acesso aos dados.");
    expect(t).toMatch(/exportá-lo integralmente, sem custo/);
  });

  it("mostra que o Iris nunca notifica terceiros externos", async () => {
    const { container } = await renderizarRota(TermosPage, "termos");
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toMatch(/o Iris nunca notifica terceiros externos à clínica/i);
    expect(t).toMatch(/não aciona SAMU, não comunica Conselho Tutelar/i);
  });

  it("mostra o trial de 7 dias sem exigência de cartão", async () => {
    const { container } = await renderizarRota(TermosPage, "termos");
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toMatch(/7 \(sete\) dias corridos/);
    expect(t).toMatch(/Não exigimos cartão de crédito/i);
  });
});

describe("conteúdo da Política de Privacidade publicada", () => {
  it("renderiza a tabela de dados do profissional dentro de área rolável", async () => {
    const { container } = await renderizarRota(PrivacidadePage, "privacidade");
    const tabela = container.querySelector("table");
    expect(tabela).toBeTruthy();
    // Conteúdo largo rola no próprio contêiner, e a área rolável é alcançável
    // por teclado (WCAG 2.1.1) — o corpo da página nunca rola na horizontal.
    const regiao = container.querySelector('[role="region"]');
    expect(regiao?.getAttribute("tabindex")).toBe("0");
    expect(regiao?.getAttribute("aria-label")).toBeTruthy();
    expect(regiao?.contains(tabela!)).toBe(true);
    // Cabeçalhos de coluna com escopo explícito.
    const ths = [...(tabela?.querySelectorAll("th") ?? [])];
    expect(ths.length).toBeGreaterThan(0);
    expect(ths.every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(
      within(tabela!).getByText(/número de registro profissional/i),
    ).toBeTruthy();
  });

  it("documenta o provedor de IA (Google Gemini) e as pendências para ativação (D57)", async () => {
    const { container } = await renderizarRota(PrivacidadePage, "privacidade");
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toMatch(/Google \(Gemini API\)/i);
    expect(t).toMatch(/EXTRACTION_LLM_ENABLED/i);
  });

  it("nomeia Resend e Asaas no compartilhamento com terceiros", async () => {
    const { container } = await renderizarRota(PrivacidadePage, "privacidade");
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("Resend");
    expect(t).toContain("Asaas");
  });
});
