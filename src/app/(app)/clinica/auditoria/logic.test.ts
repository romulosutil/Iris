import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ITENS_POR_PAGINA,
  ROTULOS_ACAO,
  ROTULOS_ENTIDADE,
  grampearPagina,
  humanizarSlug,
  normalizarPagina,
  offsetDaPagina,
  rotularAcao,
  rotularEntidade,
  totalDePaginas,
} from "./logic";

const RAIZ = process.cwd();

/**
 * Varre os pontos de ESCRITA da trilha e devolve os pares `acao`/`entidade` que
 * o produto de fato grava.
 *
 * Esta varredura é o coração do teste de cobertura: sem ela, o dicionário só
 * afirma o que alguém lembrou de escrever nele, e um `acao` novo — gravado numa
 * migração seis meses depois — passa a renderizar pelo fallback sem que nenhum
 * teste caia. O guard fica vermelho no PR que introduz o slug, que é onde a
 * tradução é barata.
 */
function acoesGravadasNasMigracoes(): { acao: string; entidade: string }[] {
  const dir = join(RAIZ, "db", "migrations");
  const achados: { acao: string; entidade: string }[] = [];

  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const conteudo = readFileSync(join(dir, arquivo), "utf8");
    for (const pedaco of conteudo.split("INSERT INTO audit_log").slice(1)) {
      // Corta no primeiro `jsonb_build_object`: dali em diante os literais são
      // chaves do `detalhe` (`'origem', 'job'`), não acao/entidade.
      const janela = pedaco.split("jsonb_build_object")[0] ?? "";
      const par = /'([a-z_]+)',\s*'([a-z_]+)'/.exec(janela);
      if (par?.[1] && par[2])
        achados.push({ acao: par[1], entidade: par[2] });
    }
  }
  return achados;
}

function arquivosTs(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivosTs(caminho));
    else if (
      /\.tsx?$/.test(entrada.name) &&
      !/\.test\.tsx?$/.test(entrada.name)
    )
      saida.push(caminho);
  }
  return saida;
}

function acoesGravadasNoApp(): { acao: string; entidade: string }[] {
  const fontes = arquivosTs(join(RAIZ, "src")).map((c) =>
    readFileSync(c, "utf8"),
  );

  // `acao:` às vezes recebe uma constante exportada (ACAO_DESARQUIVADO_...).
  // Resolve o valor pelo declarador para não perder o slug.
  const constantes = new Map<string, string>();
  for (const fonte of fontes) {
    for (const m of fonte.matchAll(
      /export const (ACAO_[A-Z0-9_]+)\s*=\s*\n?\s*"([a-z_]+)"/g,
    )) {
      if (m[1] && m[2]) constantes.set(m[1], m[2]);
    }
  }

  const achados: { acao: string; entidade: string }[] = [];
  for (const fonte of fontes) {
    for (const pedaco of fonte.split("insert(auditLog)").slice(1)) {
      const janela = pedaco.slice(0, 600);
      const entidade = /entidade:\s*"([a-z_]+)"/.exec(janela)?.[1];
      if (!entidade) continue;
      for (const m of janela.matchAll(
        /acao:\s*(?:"([a-z_]+)"|([A-Z0-9_]+)|\w+\s*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)")/g,
      )) {
        for (const cru of [m[1], m[3], m[4]])
          if (cru) achados.push({ acao: cru, entidade });
        if (m[2]) {
          const resolvido = constantes.get(m[2]);
          if (resolvido) achados.push({ acao: resolvido, entidade });
        }
      }
    }
  }
  return achados;
}

describe("varredura dos pontos de escrita", () => {
  // Guard do próprio guard: se a varredura parar de achar qualquer coisa (regex
  // desatualizada, pasta movida), os testes de cobertura abaixo passariam
  // vacuamente com zero itens.
  it("acha os pontos de escrita nas migrações e no app", () => {
    expect(acoesGravadasNasMigracoes().length).toBeGreaterThanOrEqual(5);
    expect(acoesGravadasNoApp().length).toBeGreaterThanOrEqual(3);
  });
});

describe("cobertura do dicionário", () => {
  it("toda `acao` gravada pelo produto tem rótulo em pt-BR", () => {
    const gravadas = [
      ...acoesGravadasNasMigracoes(),
      ...acoesGravadasNoApp(),
    ].map((p) => p.acao);
    const semRotulo = [...new Set(gravadas)].filter(
      (acao) => !(acao in ROTULOS_ACAO),
    );
    expect(semRotulo).toEqual([]);
  });

  it("toda `entidade` gravada pelo produto tem rótulo em pt-BR", () => {
    const gravadas = [
      ...acoesGravadasNasMigracoes(),
      ...acoesGravadasNoApp(),
    ].map((p) => p.entidade);
    const semRotulo = [...new Set(gravadas)].filter(
      (e) => !(e in ROTULOS_ENTIDADE),
    );
    expect(semRotulo).toEqual([]);
  });

  it("nenhum rótulo devolve o slug cru", () => {
    for (const [slug, rotulo] of Object.entries(ROTULOS_ACAO)) {
      expect(rotulo).not.toBe(slug);
      expect(rotulo).not.toMatch(/_/);
    }
    for (const [slug, rotulo] of Object.entries(ROTULOS_ENTIDADE)) {
      expect(rotulo).not.toBe(slug);
      expect(rotulo).not.toMatch(/_/);
    }
  });
});

describe("rotular", () => {
  it("traduz slug conhecido", () => {
    expect(rotularAcao("paciente_arquivado_automaticamente")).toBe(
      "Paciente arquivado pelo sistema",
    );
    expect(rotularEntidade("alerta_risco_clinico")).toBe("Alerta de risco");
  });

  it("humaniza slug desconhecido em vez de devolvê-lo cru", () => {
    expect(rotularAcao("acao_que_ainda_nao_existe")).toBe(
      "Acao que ainda nao existe",
    );
    expect(rotularEntidade("tabela_nova")).toBe("Tabela nova");
  });

  it("humanizarSlug degrada sem quebrar", () => {
    expect(humanizarSlug("")).toBe("—");
    expect(humanizarSlug("   ")).toBe("—");
    expect(humanizarSlug("a__b")).toBe("A b");
  });
});

describe("paginação", () => {
  it("normaliza `?pagina=` hostil para 1", () => {
    for (const bruto of ["0", "-3", "abc", "1.5", "", undefined, []]) {
      expect(normalizarPagina(bruto as string | undefined)).toBe(1);
    }
    expect(normalizarPagina("7")).toBe(7);
    expect(normalizarPagina(["3", "9"])).toBe(3);
  });

  it("trilha vazia tem 1 página, não 0", () => {
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(-5)).toBe(1);
  });

  it("conta páginas pela fatia, não por limite fixo", () => {
    expect(totalDePaginas(ITENS_POR_PAGINA)).toBe(1);
    expect(totalDePaginas(ITENS_POR_PAGINA + 1)).toBe(2);
    expect(totalDePaginas(ITENS_POR_PAGINA * 4)).toBe(4);
  });

  it("grampeia página além do fim — o expurgo de 180 dias encolhe o total", () => {
    expect(grampearPagina(99, ITENS_POR_PAGINA * 2)).toBe(2);
    expect(grampearPagina(1, 0)).toBe(1);
  });

  it("offset acompanha a página", () => {
    expect(offsetDaPagina(1)).toBe(0);
    expect(offsetDaPagina(3)).toBe(ITENS_POR_PAGINA * 2);
  });
});
