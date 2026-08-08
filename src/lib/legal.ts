/**
 * Metadados dos documentos legais publicados como rotas públicas.
 *
 * Este módulo é deliberadamente puro (sem `fs`, sem `server-only`): a leitura
 * do markdown mora em `src/components/legal/documento-legal.tsx`. Assim a
 * constante de versão pode ser importada de qualquer lugar — do aceite no
 * cadastro, da página pública e dos testes — sem arrastar Node junto.
 */

/**
 * Versão vigente dos Termos de Uso e da Política de Privacidade.
 *
 * É esta string que é gravada no aceite do profissional no cadastro
 * self-service. **Fonte única**: quem precisar da versão importa daqui, não
 * redeclara. O teste em `legal.test.ts` garante que os dois arquivos markdown
 * em `docs/legal/` declaram exatamente esta versão — se alguém revisar um
 * documento e esquecer de subir a versão (ou vice-versa), o teste quebra.
 */
export const VERSAO_TERMO = "2026-08-07";

export type SlugLegal = "termos" | "privacidade";

export interface DocumentoLegalMeta {
  /** Segmento da rota pública (`/termos`, `/privacidade`). */
  slug: SlugLegal;
  /** Caminho do markdown, relativo à raiz do repositório. */
  arquivo: string;
  /** Título usado em `<title>` e na meta description quando o markdown falha. */
  tituloFallback: string;
  descricao: string;
}

export const DOCUMENTOS_LEGAIS: Record<SlugLegal, DocumentoLegalMeta> = {
  termos: {
    slug: "termos",
    arquivo: "docs/legal/termos-de-uso.md",
    tituloFallback: "Termos de Uso",
    descricao:
      "Termos de Uso do Iris — condições de contratação, período de teste, cobrança por ficha ativa e responsabilidades da clínica.",
  },
  privacidade: {
    slug: "privacidade",
    arquivo: "docs/legal/politica-privacidade.md",
    tituloFallback: "Política de Privacidade",
    descricao:
      "Política de Privacidade do Iris — que dados tratamos, com que base legal, com quem compartilhamos e quais são os direitos do titular.",
  },
};
