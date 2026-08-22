import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectarScriptsPreview,
  verificarArquivoContraScriptsPreview,
  verificarDiretorioContraScriptsPreview,
} from "./guardrail-preview-layout";

describe("Guardrail contra injeção de script de preview em layout e páginas (D53)", () => {
  describe("Motor de detecção de padrões estáticos", () => {
    it("detecta tag script com URL de preview em localhost:8400", () => {
      const codigoSujo = `
        export default function Layout({ children }) {
          return (
            <html>
              <body>
                {children}
                <script src="http://localhost:8400/live.js" />
              </body>
            </html>
          );
        }
      `;

      const violacoes = detectarScriptsPreview(codigoSujo, "layout.tsx");
      expect(violacoes.length).toBeGreaterThan(0);

      const padroes = violacoes.map((v) => v.padraoCorrespondente);
      expect(padroes).toContain("url-porta-preview-8400");
      expect(padroes).toContain("script-localhost");
      expect(padroes).toContain("script-live-reload");
    });

    it("detecta script de preview mesmo envolvido em condicional de NODE_ENV e eslint-disable", () => {
      const codigoComBypass = `
        <body>
          <GoogleAnalytics />
          <ToastProvider>{children}</ToastProvider>
          {process.env.NODE_ENV === "development" && (
            /* eslint-disable-next-line @next/next/no-sync-scripts */
            <script src="http://localhost:8400/live.js" />
          )}
        </body>
      `;

      const violacoes = detectarScriptsPreview(codigoComBypass, "layout.tsx");
      expect(violacoes.length).toBeGreaterThan(0);
      expect(
        violacoes.some((v) =>
          v.conteudoLinha.includes("localhost:8400/live.js"),
        ),
      ).toBe(true);
    });

    it("detecta marcadores de comentário HTML do Impeccable Live", () => {
      const codigoComComentarioHtml = `
        <!-- impeccable-live-start -->
        <script src="http://localhost:8400/live.js"></script>
        <!-- impeccable-live-end -->
      `;

      const violacoes = detectarScriptsPreview(
        codigoComComentarioHtml,
        "index.html",
      );
      const padroes = violacoes.map((v) => v.padraoCorrespondente);
      expect(padroes).toContain("marcador-impeccable-live");
    });

    it("detecta marcadores de comentário JSX do Impeccable Live", () => {
      const codigoComComentarioJsx = `
        <div>
          {/* impeccable-live-start */}
          <section className="preview" />
          {/* impeccable-live-end */}
        </div>
      `;

      const violacoes = detectarScriptsPreview(
        codigoComComentarioJsx,
        "componente.tsx",
      );
      const padroes = violacoes.map((v) => v.padraoCorrespondente);
      expect(padroes).toContain("marcador-impeccable-live");
      expect(violacoes.length).toBe(2); // start e end
    });

    it("detecta atributos data-impeccable-live", () => {
      const codigoComAtributo = `
        <div data-impeccable-live="true">
          <main>Conteudo</main>
        </div>
      `;

      const violacoes = detectarScriptsPreview(
        codigoComAtributo,
        "componente.tsx",
      );
      const padroes = violacoes.map((v) => v.padraoCorrespondente);
      expect(padroes).toContain("marcador-impeccable-live");
    });

    it("detecta tags script apontando para 127.0.0.1", () => {
      const codigoIpLocal = `
        <script src="http://127.0.0.1:8400/live.js"></script>
      `;

      const violacoes = detectarScriptsPreview(codigoIpLocal, "layout.tsx");
      const padroes = violacoes.map((v) => v.padraoCorrespondente);
      expect(padroes).toContain("script-localhost");
      expect(padroes).toContain("url-porta-preview-8400");
    });

    it("não produz falso positivo para código limpo de produção", () => {
      const codigoLimpo = `
        import type { Metadata } from "next";
        import "@/styles/globals.css";
        import { fontVariables } from "@/app/fonts";
        import { WebMCPProvider } from "@/components/webmcp-provider";
        import { Clarity } from "@/components/clarity";
        import { GoogleAnalytics } from "@/components/google-analytics";
        import { ToastProvider } from "@/components/ui/toast";

        export const metadata: Metadata = {
          title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
          description: "Evidências clínicas rastreáveis, decisão humana.",
        };

        export default function RootLayout({
          children,
        }: Readonly<{ children: React.ReactNode }>) {
          return (
            <html lang="pt-BR" data-mode="clinico" className={fontVariables}>
              <body>
                <GoogleAnalytics />
                <Clarity />
                <WebMCPProvider />
                <ToastProvider>{children}</ToastProvider>
              </body>
            </html>
          );
        }
      `;

      const violacoes = detectarScriptsPreview(codigoLimpo, "layout.tsx");
      expect(violacoes).toEqual([]);
    });
  });

  describe("Verificação estática da árvore de código do repositório", () => {
    it("src/app/layout.tsx não contém nenhum script de preview ou marcador localhost:8400 / live.js (D53)", () => {
      const caminhoLayout = path.resolve(process.cwd(), "src/app/layout.tsx");
      const violacoes = verificarArquivoContraScriptsPreview(caminhoLayout);

      const mensagemErro =
        violacoes.length > 0
          ? `Violação D53 detectada em src/app/layout.tsx:\n` +
            violacoes
              .map(
                (v) =>
                  `  - Linha ${v.linha}: [${v.padraoCorrespondente}] "${v.conteudoLinha}" (${v.motivo})`,
              )
              .join("\n") +
            `\nRemova tags <script src="http://localhost:8400/live.js"> e marcadores de preview antes de commitar.`
          : "";

      expect(violacoes, mensagemErro).toEqual([]);
    });

    it("nenhum arquivo sob src/app/ contém scripts de preview indevidos", () => {
      const diretorioApp = path.resolve(process.cwd(), "src/app");
      const violacoes = verificarDiretorioContraScriptsPreview(diretorioApp);

      const mensagemErro =
        violacoes.length > 0
          ? `Violações D53 detectadas sob src/app/:\n` +
            violacoes
              .map(
                (v) =>
                  `  - ${v.arquivo}:${v.linha} [${v.padraoCorrespondente}] "${v.conteudoLinha}" (${v.motivo})`,
              )
              .join("\n")
          : "";

      expect(violacoes, mensagemErro).toEqual([]);
    });

    it("nenhum arquivo de código de produção sob src/ contém scripts de preview", () => {
      const diretorioSrc = path.resolve(process.cwd(), "src");
      const violacoes = verificarDiretorioContraScriptsPreview(diretorioSrc);

      const mensagemErro =
        violacoes.length > 0
          ? `Violações D53 detectadas sob src/:\n` +
            violacoes
              .map(
                (v) =>
                  `  - ${v.arquivo}:${v.linha} [${v.padraoCorrespondente}] "${v.conteudoLinha}" (${v.motivo})`,
              )
              .join("\n")
          : "";

      expect(violacoes, mensagemErro).toEqual([]);
    });
  });
});
