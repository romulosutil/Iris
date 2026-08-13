/**
 * Metadados dos documentos legais publicados como rotas públicas.
 *
 * Este módulo é deliberadamente puro (sem `fs`, sem `server-only`): a leitura
 * do markdown mora em `src/components/legal/documento-legal.tsx`. Assim a
 * constante de versão pode ser importada de qualquer lugar — do aceite no
 * cadastro, da página pública e dos testes — sem arrastar Node junto.
 */

/**
 * Versão vigente dos Termos de Uso.
 *
 * É esta string que é gravada no aceite do profissional no cadastro
 * self-service (`professional_consent.versao_termo`). **Fonte única**: quem
 * precisar da versão importa daqui, não redeclara. O teste em `legal.test.ts`
 * garante que o markdown dos Termos declara exatamente esta versão e que a
 * constante é declarada só neste arquivo — se alguém revisar um documento e
 * esquecer de subir a versão (ou vice-versa), o teste quebra.
 */
export const VERSAO_TERMO = "2026-08-07";

/**
 * Versão vigente da Política de Privacidade.
 *
 * Mesmo regime de fonte única de `VERSAO_TERMO`: `legal.test.ts` acopla esta
 * string ao markdown da Política e proíbe redeclaração fora deste arquivo.
 *
 * Atenção ao gravar aceite: o checkbox do cadastro cobre os dois documentos,
 * mas `professional_consent` tem uma única coluna (`versao_termo`), que recebe
 * `VERSAO_TERMO`. Enquanto as duas versões andarem juntas isso é inócuo; se um
 * dia divergirem, registrar a versão da Política no aceite é mudança de schema
 * (tabela append-only, migração 0058 — ninguém tem DELETE), não um import a
 * mais aqui.
 */
export const VERSAO_POLITICA = "2026-08-07";

export type SlugLegal = "termos" | "privacidade";

export interface DocumentoLegalMeta {
  /** Segmento da rota pública (`/termos`, `/privacidade`). */
  slug: SlugLegal;
  /** Caminho do markdown, relativo à raiz do repositório. */
  arquivo: string;
  /** Título usado em `<title>` e na meta description quando o markdown falha. */
  tituloFallback: string;
  descricao: string;
  /**
   * Versão vigente do documento — referência à constante de fonte única
   * (`VERSAO_TERMO`/`VERSAO_POLITICA`), nunca uma literal nova. É o que a
   * página pública renderiza e o que o `<title>` interpola.
   */
  versao: string;
}

export const DOCUMENTOS_LEGAIS: Record<SlugLegal, DocumentoLegalMeta> = {
  termos: {
    slug: "termos",
    arquivo: "docs/legal/termos-de-uso.md",
    tituloFallback: "Termos de Uso",
    descricao:
      "Termos de Uso do Iris — condições de contratação, período de teste, cobrança por ficha ativa e responsabilidades da clínica.",
    versao: VERSAO_TERMO,
  },
  privacidade: {
    slug: "privacidade",
    arquivo: "docs/legal/politica-privacidade.md",
    tituloFallback: "Política de Privacidade",
    descricao:
      "Política de Privacidade do Iris — que dados tratamos, com que base legal, com quem compartilhamos e quais são os direitos do titular.",
    versao: VERSAO_POLITICA,
  },
};
