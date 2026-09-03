import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarNav } from "./nav";

/**
 * Auditoria 360 · `Q-04` (#533) — teste de ALCANCE de rota.
 *
 * Por que existe: a #512 redirecionou `/validacao` para `/sessoes` e tirou da
 * nav as superfícies de governança do coordenador; a fila de validação
 * (`ValidacaoFila`) ficou sem página que a montasse e o CI continuou verde
 * (`PR-01`, P0). Nenhum teste dizia "toda rota tem porta". Este diz.
 *
 * Varre `src/app/(app)/** /page.tsx`, deriva a rota (grupos `(x)` somem,
 * segmentos dinâmicos viram `[param]`) e exige que cada rota seja alcançável
 * por UM destes caminhos:
 *  (a) aparece em `nav.ts` (qualquer papel);
 *  (b) aparece como `href` literal em algum `.ts`/`.tsx` de `src/` (template
 *      literal com `${…}` normalizado para `[param]`);
 *  (c) o próprio `page.tsx` é um `redirect()` (rota legada que só encaminha).
 * Rota dinâmica só conta se, além do `href` com o padrão, o prefixo estático
 * (quando ele mesmo é uma página) também for alcançável.
 *
 * Só `(a)`–`(c)` não bastam para governança: um `href` condicional (banner de
 * estágio 2, bloco de estagnação) satisfaz `(b)` e ainda assim deixa a tela
 * sem porta no dia a dia (`PR-02`). Por isso o segundo `describe` exige, para
 * as superfícies do coordenador, página REAL (não redirect) E item na nav.
 */

const RAIZ_APP = path.resolve(import.meta.dirname);
const RAIZ_SRC = path.resolve(import.meta.dirname, "../..");

function listarArquivos(dir: string, aceita: (nome: string) => boolean) {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules") continue;
      saida.push(...listarArquivos(caminho, aceita));
    } else if (aceita(entrada.name)) {
      saida.push(caminho);
    }
  }
  return saida;
}

/** `/pacientes/[id]/anamnese` → `/pacientes/[param]/anamnese`; tira query/hash. */
function normalizar(rota: string): string {
  const semQuery = rota.split(/[?#]/)[0] ?? rota;
  const normalizada = semQuery.replace(/\[[^\]]+\]/g, "[param]");
  return normalizada === "" ? "/" : normalizada;
}

function rotaDaPagina(pagePath: string): string {
  const segmentos = path
    .relative(RAIZ_APP, path.dirname(pagePath))
    .split(path.sep)
    .filter((s) => s !== "" && !/^\(.*\)$/.test(s));
  return normalizar("/" + segmentos.join("/"));
}

/**
 * "Página-redirect" = só encaminha: chama `redirect()` e não devolve JSX.
 * Uma página real que usa `redirect()` como guard de papel (`/validacao`
 * manda terapeuta para `/sessoes`) continua sendo página — tem `return (<…>)`.
 */
function ehRedirect(pagePath: string): boolean {
  const fonte = readFileSync(pagePath, "utf8");
  return /\bredirect\(/.test(fonte) && !/return\s*\(?\s*</.test(fonte);
}

/**
 * Todos os `href` literais de `src/` (fora de testes e stories), normalizados.
 * Cobre `href="…"`, `href={"…"}`, `` href={`…`} `` e a chave de objeto
 * `href: "…"` (abas de `/clinica`, breadcrumbs). Um template que COMEÇA com
 * `${…}` (`` `${base}/briefing` `` nas abas do paciente) não tem prefixo
 * estático conhecido: vira SUFIXO — casa com qualquer rota cujos últimos
 * segmentos sejam `[param]/briefing`.
 */
function hrefsLiterais(): { exatos: Set<string>; sufixos: string[][] } {
  const arquivos = listarArquivos(
    RAIZ_SRC,
    (nome) =>
      /\.(ts|tsx)$/.test(nome) &&
      !/\.test\.(ts|tsx)$/.test(nome) &&
      !/\.stories\.tsx$/.test(nome),
  );
  const exatos = new Set<string>();
  const sufixos: string[][] = [];
  const re =
    /\bhref\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`]*)`\s*\}|`([^`]*)`)/g;
  for (const arquivo of arquivos) {
    const fonte = readFileSync(arquivo, "utf8");
    for (const m of fonte.matchAll(re)) {
      const bruto = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? "";
      const comParam = bruto.replace(/\$\{[^}]*\}/g, "[param]");
      if (comParam.startsWith("/")) {
        exatos.add(normalizar(comParam));
      } else if (comParam.startsWith("[param]/")) {
        sufixos.push(normalizar(comParam).split("/"));
      }
    }
  }
  return { exatos, sufixos };
}

function casaSufixo(rota: string, sufixos: string[][]): boolean {
  const segs = rota.split("/");
  return sufixos.some(
    (suf) =>
      suf.length <= segs.length &&
      suf.every((s, i) => segs[segs.length - suf.length + i] === s),
  );
}

function hrefsDaNav(): Set<string> {
  const hrefs = new Set<string>();
  for (const role of ["coordenador", "terapeuta", "admin_recepcao"]) {
    const nav = montarNav({
      role,
      totalTravadas: 0,
      totalValidacao: 0,
      totalAlertasAbertos: 0,
    });
    for (const item of [...nav.itemsNav, ...nav.itemsAdmin]) {
      hrefs.add(normalizar(item.href));
    }
  }
  return hrefs;
}

/**
 * Rotas que hoje não têm porta por nav/href/redirect e cuja ausência é
 * CONHECIDA e aceita — cada entrada precisa dizer por quê. Vazio de propósito:
 * quem precisar de exceção acrescenta aqui com justificativa, nunca afrouxa
 * as regras `(a)`–`(c)`.
 */
const ALLOWLIST: Record<string, string> = {
  // Aba clínica central do prontuário: `pacientes/[id]/layout.tsx` monta o
  // href como `${base}/${capacidades.abaCentral.slug}` — o último segmento é
  // decidido em `pacientes/[id]/modalidade.ts` por modalidade de tratamento
  // (`tcc` para TCC, `temas` para convencional). Duas variáveis no template
  // não deixam prefixo estático para o casamento por sufixo. Porta real: a
  // `TabsNav` do prontuário, para todo paciente da modalidade.
  "/pacientes/[param]/tcc":
    "aba central por modalidade (`${base}/${abaCentral.slug}`), slug `tcc` em modalidade.ts",
  "/pacientes/[param]/temas":
    "aba central por modalidade (`${base}/${abaCentral.slug}`), slug `temas` em modalidade.ts",
};

const paginas = listarArquivos(RAIZ_APP, (n) => n === "page.tsx").map((p) => ({
  arquivo: p,
  rota: rotaDaPagina(p),
  redirect: ehRedirect(p),
}));

describe("alcance de rotas — toda page.tsx de (app) tem porta (Q-04)", () => {
  it("varre pelo menos as rotas conhecidas (o glob não pode estar quebrado)", () => {
    const rotas = paginas.map((p) => p.rota);
    expect(rotas).toEqual(
      expect.arrayContaining(["/agenda", "/sessoes", "/sessoes/[param]"]),
    );
  });

  it("cada rota aparece em nav.ts, num href literal de src/ ou é um redirect()", () => {
    const nav = hrefsDaNav();
    const { exatos, sufixos } = hrefsLiterais();
    const rotasComPagina = new Set(paginas.map((p) => p.rota));

    const alcancavelDireto = (rota: string) =>
      nav.has(rota) ||
      exatos.has(rota) ||
      casaSufixo(rota, sufixos) ||
      paginas.some((p) => p.rota === rota && p.redirect);

    const orfas: string[] = [];
    for (const { rota, redirect } of paginas) {
      if (redirect) continue;
      if (rota in ALLOWLIST) continue;
      if (!alcancavelDireto(rota)) {
        orfas.push(rota);
        continue;
      }
      // Rota dinâmica: o prefixo estático, quando ele mesmo é página, também
      // precisa ter porta — um `href` para `/x/[param]` sem `/x` alcançável é
      // um corredor sem entrada.
      const primeiroDinamico = rota.split("/").indexOf("[param]");
      if (primeiroDinamico > 0) {
        const prefixo = rota.split("/").slice(0, primeiroDinamico).join("/");
        if (rotasComPagina.has(prefixo) && !alcancavelDireto(prefixo)) {
          orfas.push(`${rota} (prefixo ${prefixo} sem porta)`);
        }
      }
    }

    expect(orfas, `rotas sem porta: ${orfas.join(", ")}`).toEqual([]);
  });

  it("a ALLOWLIST só contém rotas que existem (entrada morta esconde regressão)", () => {
    const rotas = new Set(paginas.map((p) => p.rota));
    for (const rota of Object.keys(ALLOWLIST)) {
      expect(rotas.has(rota), `ALLOWLIST cita rota inexistente: ${rota}`).toBe(
        true,
      );
    }
  });
});

/**
 * `PR-01`/`PR-02` — as três superfícies de governança do coordenador. Um
 * `href` condicional não é porta: `/alertas-risco` só tinha link no banner de
 * estágio 2 e `/supervisao` só no bloco de estagnação; `/validacao` virou
 * redirect. Aqui a régua é mais dura que a genérica: página REAL e item de
 * nav do coordenador (diário ou administração).
 */
describe("superfícies de governança do coordenador têm página real e porta na nav (PR-01, PR-02)", () => {
  const SUPERFICIES = ["/validacao", "/alertas-risco", "/supervisao"] as const;

  it.each(SUPERFICIES)("%s é uma página, não um redirect()", (rota) => {
    const pagina = paginas.find((p) => p.rota === rota);
    expect(pagina, `${rota} não tem page.tsx`).toBeDefined();
    expect(pagina?.redirect, `${rota}/page.tsx é um redirect()`).toBe(false);
  });

  it.each(SUPERFICIES)("%s está na nav do coordenador", (rota) => {
    const nav = montarNav({
      role: "coordenador",
      totalTravadas: 0,
      totalValidacao: 0,
      totalAlertasAbertos: 0,
    });
    const hrefs = [...nav.itemsNav, ...nav.itemsAdmin].map((i) => i.href);
    expect(
      hrefs,
      `${rota} fora de itemsNav/itemsAdmin do coordenador`,
    ).toContain(rota);
  });
});
