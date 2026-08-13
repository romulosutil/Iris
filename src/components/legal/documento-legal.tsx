import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ComponentProps } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Container, Stack } from "@/components/ui/layout";
import { Logo } from "@/components/ui/logo";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DOCUMENTOS_LEGAIS, type SlugLegal } from "@/lib/legal";

/**
 * Renderiza um documento de `docs/legal/` como página pública.
 *
 * **Fonte única de verdade:** o texto vem do markdown em disco, nunca de uma
 * cópia dentro do `.tsx`. Texto legal duplicado diverge, e divergência entre o
 * que o profissional aceitou e o que está publicado é exatamente o tipo de
 * problema que só aparece quando já dói.
 *
 * A leitura acontece em **tempo de build**: as rotas são `force-static`, então
 * `readFile` roda durante o `next build`, quando `docs/` ainda existe na imagem
 * (`infra/Dockerfile`, estágio `build`, faz `COPY . .`). O estágio `runner`
 * copia só `.next/standalone` + `.next/static` + `public` — `docs/` **não**
 * chega lá. Por isso `next.config.ts` também declara `outputFileTracingIncludes`
 * para estas duas rotas: cinto e suspensório, para o caso de a rota deixar de
 * ser estática algum dia. Sem isso o `readFile` passaria em todo teste local e
 * daria 500 em produção.
 */
export async function DocumentoLegal({ slug }: { slug: SlugLegal }) {
  const meta = DOCUMENTOS_LEGAIS[slug];
  const bruto = await readFile(path.join(process.cwd(), meta.arquivo), "utf8");
  const { titulo, corpo } = separarTitulo(bruto, meta.tituloFallback);

  return (
    <Stack gap="lg" className="min-h-dvh bg-[var(--bg-app)] pb-16">
      {/* Régua-espectro: assinatura de marca, decorativa. */}
      <div
        aria-hidden
        className="h-1.5 w-full shrink-0"
        style={{
          background:
            "linear-gradient(90deg, var(--color-spectrum-red), var(--color-spectrum-orange), var(--color-spectrum-yellow), var(--color-spectrum-green), var(--color-spectrum-blue), var(--color-spectrum-violet))",
        }}
      />

      <Container como="header" largura="sm">
        <Stack gap="md">
          <Link
            href="/"
            className="w-fit rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            <Logo altura={36} aria-label="Iris — página inicial" />
          </Link>
          <Breadcrumb
            itens={[
              { rotulo: "Início", href: "/" },
              { rotulo: "Criar Conta", href: "/cadastro" },
              { rotulo: titulo, atual: true },
            ]}
          />
          <h1 className="font-display text-3xl font-bold text-balance text-[var(--text-primary)] md:text-4xl">
            {titulo}
          </h1>
          {/* Versão visível na página renderizada, não só no markdown: é a
              versão que os testes acoplam ao documento publicado (e, nos
              Termos, a string gravada no aceite do profissional). A data de
              vigência deriva da própria versão — a literal solta que morava
              aqui ficou obsoleta na revisão de 07/08/2026 sem ninguém notar. */}
          <p className="text-sm text-[var(--text-secondary)]">
            Versão{" "}
            <strong className="font-mono font-semibold text-[var(--text-primary)]">
              {meta.versao}
            </strong>
            {` — vigente desde ${dataBrasileira(meta.versao)}.`}
          </p>
        </Stack>
      </Container>

      <Container como="main" largura="sm" id="conteudo">
        {/* `lang` explícito ajuda leitor de tela a escolher a pronúncia certa. */}
        <article lang="pt-BR" className="text-base text-[var(--text-primary)]">
          <Markdown remarkPlugins={[remarkGfm]} components={componentes}>
            {corpo}
          </Markdown>
        </article>
      </Container>

      <Container como="footer" largura="sm">
        <p className="text-sm text-[var(--text-secondary)]">
          Dúvidas sobre este documento? Veja também{" "}
          <Link
            href={slug === "termos" ? "/privacidade" : "/termos"}
            className={classeLink}
          >
            {slug === "termos"
              ? "a Política de Privacidade"
              : "os Termos de Uso"}
          </Link>
          .
        </p>
      </Container>
    </Stack>
  );
}

/**
 * `2026-08-07` → `07/08/2026`. As versões legais são datas ISO por convenção
 * (asserido em `legal.test.ts`), então a data de vigência é a própria versão.
 */
function dataBrasileira(versaoIso: string): string {
  return versaoIso.split("-").reverse().join("/");
}

/**
 * Separa o `# Título` do markdown do resto do corpo.
 *
 * O `<h1>` da página é renderizado pelo cabeçalho acima, a partir deste mesmo
 * título — então o `#` precisa sair do corpo, senão a página teria dois `h1`
 * com o mesmo texto. Com isso a hierarquia fica exata: `h1` = documento,
 * `##` do markdown = `h2` de seção, `###` = `h3` de subseção.
 */
function separarTitulo(
  bruto: string,
  fallback: string,
): { titulo: string; corpo: string } {
  const linhas = bruto.split("\n");
  const i = linhas.findIndex((l) => l.startsWith("# "));
  const linha = i === -1 ? undefined : linhas[i];
  if (linha === undefined) return { titulo: fallback, corpo: bruto };
  const titulo = linha.slice(2).trim();
  return {
    titulo: titulo.length > 0 ? titulo : fallback,
    corpo: [...linhas.slice(0, i), ...linhas.slice(i + 1)].join("\n"),
  };
}

const classeLink =
  "text-[var(--brand-primary)] underline underline-offset-2 decoration-2 hover:text-[var(--brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] rounded-xs";

/**
 * Mapa de renderização do markdown para o design system.
 *
 * O projeto não usa o plugin de `prose` do Tailwind, então cada elemento é
 * estilizado aqui, com token — nada de valor cru. Isso também garante que
 * documento legal não herde estilo de tela de app por acidente.
 */
const componentes = {
  // Defesa em profundidade: se algum documento ganhar um `#` no meio do texto,
  // ele vira `h2` em vez de criar um segundo `h1` na página.
  h1: (props: ComponentProps<"h2">) => (
    <h2
      {...props}
      className="font-display mt-10 text-2xl font-bold text-[var(--text-primary)]"
    />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2
      {...props}
      className="font-display mt-10 mb-3 border-b-2 border-[var(--border-brutal)] pb-2 text-2xl font-bold text-balance text-[var(--text-primary)]"
    />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3
      {...props}
      className="font-display mt-7 mb-2 text-xl font-semibold text-[var(--text-primary)]"
    />
  ),
  h4: (props: ComponentProps<"h4">) => (
    <h4
      {...props}
      className="font-display mt-5 mb-2 text-lg font-semibold text-[var(--text-primary)]"
    />
  ),
  p: (props: ComponentProps<"p">) => (
    <p {...props} className="my-4 leading-relaxed" />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul {...props} className="my-4 list-disc space-y-2 pl-6 leading-relaxed" />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol
      {...props}
      className="my-4 list-decimal space-y-2 pl-6 leading-relaxed"
    />
  ),
  li: (props: ComponentProps<"li">) => <li {...props} className="pl-1" />,
  a: ({ href, ...props }: ComponentProps<"a">) => {
    const externo = !!href && /^https?:\/\//.test(href);
    return (
      <a
        {...props}
        href={href}
        className={classeLink}
        {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      />
    );
  },
  strong: (props: ComponentProps<"strong">) => (
    <strong {...props} className="font-semibold text-[var(--text-primary)]" />
  ),
  code: (props: ComponentProps<"code">) => (
    <code
      {...props}
      className="rounded-xs bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[0.9em]"
    />
  ),
  // Filete de citação clássico (regra tipográfica fina, neutra) — não um cartão
  // com aba colorida. Nos dois documentos os blockquotes são notas de origem
  // (autoria do advogado) e avisos de pendência: precisam se distinguir do
  // corpo sem virar caixa de destaque.
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      {...props}
      className="my-6 border-l-2 border-[var(--border-neutral-light)] py-1 pl-5 text-[var(--text-secondary)]"
    />
  ),
  hr: (props: ComponentProps<"hr">) => (
    <hr {...props} className="my-10 border-t-2 border-[var(--border-brutal)]" />
  ),
  // Conteúdo largo rola no próprio contêiner — o corpo da página nunca rola na
  // horizontal, inclusive a 200% de zoom. `tabIndex` deixa a área rolável
  // alcançável por teclado (WCAG 2.1.1); com `role`/`aria-label` para o leitor
  // de tela anunciar o que é.
  table: (props: ComponentProps<"table">) => (
    <div
      role="region"
      aria-label="Tabela — role na horizontal para ver todas as colunas"
      tabIndex={0}
      className="my-6 w-full overflow-x-auto rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
    >
      <table {...props} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th
      {...props}
      scope="col"
      className="border-b-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-3 py-2 text-left font-semibold"
    />
  ),
  td: (props: ComponentProps<"td">) => (
    <td
      {...props}
      className="border-b border-[var(--border-neutral-light)] px-3 py-2 align-top"
    />
  ),
};
