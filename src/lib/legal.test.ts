import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { DOCUMENTOS_LEGAIS, VERSAO_TERMO, type SlugLegal } from "./legal";

const slugs = Object.keys(DOCUMENTOS_LEGAIS) as SlugLegal[];

function lerDoc(slug: SlugLegal): string {
  return readFileSync(
    path.join(process.cwd(), DOCUMENTOS_LEGAIS[slug].arquivo),
    "utf8",
  );
}

/**
 * Texto do documento normalizado para asserção de conteúdo: quebras de linha
 * viram espaço e a ênfase markdown (`**`) some.
 *
 * Sem isso o teste vira refém da largura de coluna do arquivo — "Não exigimos
 * cartão de crédito" quebrado em duas linhas deixaria de casar, e alguém
 * "consertaria" o teste afrouxando a asserção. O que precisa ser verificado é
 * o compromisso escrito, não onde o parágrafo dobra.
 */
function texto(slug: SlugLegal): string {
  return lerDoc(slug).replace(/\*\*/g, "").replace(/\s+/g, " ");
}

describe("VERSAO_TERMO", () => {
  // Contrato com o aceite do cadastro self-service: é esta string que é
  // gravada junto do aceite do profissional. Mudá-la sem revisar os documentos
  // (ou revisar os documentos sem mudá-la) quebra a rastreabilidade de "qual
  // texto exatamente esta pessoa aceitou".
  it("é exatamente a versão desta fatia", () => {
    // 07/08/2026 (#191): subiu junto da revisão que descreveu a coleta de CPF,
    // a prevenção a fraude no teste (Política, seção 2.1) e a condição nova do
    // trial (Termos, 7.2). Literal de propósito — é o ponto em que alguém tem
    // de parar e conferir se documento e string do aceite andaram juntos.
    expect(VERSAO_TERMO).toBe("2026-08-07");
  });

  it("tem formato de data ISO", () => {
    expect(VERSAO_TERMO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

});

describe("Integridade de Fonte Única de Versões Legais", () => {
  it("garante que VERSAO_TERMO e VERSAO_POLITICA são declaradas exclusivamente em src/lib/legal.ts", () => {
    const raiz = path.join(process.cwd(), "src");
    const violacoes: string[] = [];
    const regexDeclaracao = /\b(const|let|var)\s+(VERSAO_TERMO|VERSAO_POLITICA)\b\s*=/;

    const visitar = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const caminho = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name === "node_modules") continue;
          visitar(caminho);
        } else if (
          /\.tsx?$/.test(entrada.name) &&
          !/\.test\.tsx?$/.test(entrada.name)
        ) {
          const caminhoRelativo = path.relative(process.cwd(), caminho);
          const caminhoNormalizado = caminhoRelativo.replace(/\\/g, "/");
          if (caminhoNormalizado === "src/lib/legal.ts") {
            continue;
          }

          const conteudo = readFileSync(caminho, "utf8");
          if (regexDeclaracao.test(conteudo)) {
            const linhas = conteudo.split(/\r?\n/);
            for (let i = 0; i < linhas.length; i++) {
              if (regexDeclaracao.test(linhas[i])) {
                violacoes.push(`${caminhoNormalizado}:${i + 1} -> ${linhas[i].trim()}`);
              }
            }
          }
        }
      }
    };

    visitar(raiz);

    expect(
      violacoes,
      `[DIAGNOSTICO] Duplicidade de constantes de versão jurídica encontrada!
As constantes VERSAO_TERMO e VERSAO_POLITICA devem ser declaradas estritamente apenas em src/lib/legal.ts para manter a fonte única da verdade.
Locais infratores:
${violacoes.map((v) => `  - ${v}`).join("\n")}
`,
    ).toEqual([]);
  });
});

describe.each(slugs)("documento legal %s", (slug) => {
  const meta = DOCUMENTOS_LEGAIS[slug];

  it("existe em disco e não está vazio", () => {
    expect(lerDoc(slug).length).toBeGreaterThan(1000);
  });

  it("declara a mesma versão da constante VERSAO_TERMO", () => {
    // O acoplamento que importa: o texto publicado e a string gravada no
    // aceite têm que ser o mesmo documento.
    expect(lerDoc(slug)).toContain(VERSAO_TERMO);
  });

  it("não está mais marcado como rascunho pendente de advogado", () => {
    expect(lerDoc(slug)).not.toContain("Status: RASCUNHO");
  });

  it("tem um único título H1", () => {
    const h1 = lerDoc(slug)
      .split("\n")
      .filter((l) => l.startsWith("# "));
    expect(h1).toHaveLength(1);
  });

  it("aponta para um arquivo dentro de docs/legal/", () => {
    expect(meta.arquivo.startsWith("docs/legal/")).toBe(true);
  });
});

describe("marcadores de pendência", () => {
  // Regra da task: nunca inventar fato jurídico. Onde falta dado, o documento
  // carrega um marcador visível. Este teste garante que os marcadores não
  // sumam por acidente numa edição futura — e que, quando sumirem de verdade,
  // seja uma decisão consciente de quem preencheu o dado.
  it.each(slugs)("%s lista no fim os itens ainda em aberto", (slug) => {
    expect(lerDoc(slug)).toContain("## Itens em aberto");
  });

  it("a política mantém em aberto o provedor de IA e o país de processamento", () => {
    // Pendência que NÃO pode ser resolvida por conta própria: nomear um
    // provedor não contratado seria informação falsa ao titular.
    const doc = texto("privacidade");
    expect(doc).toMatch(/⟨PENDENTE:[^⟩]*provedor de IA/);
  });

  it("todo marcador ⟨…⟩ está balanceado e nenhum ficou sem conteúdo", () => {
    for (const slug of slugs) {
      const doc = lerDoc(slug);
      const abre = (doc.match(/⟨/g) ?? []).length;
      const fecha = (doc.match(/⟩/g) ?? []).length;
      const pendencias = (doc.match(/⟨PENDENTE:/g) ?? []).length;
      expect(abre, `${slug}: abre/fecha desbalanceado`).toBe(fecha);
      expect(pendencias, `${slug}: nenhuma pendência marcada`).toBeGreaterThan(
        0,
      );
      // Marcador vazio (`⟨PENDENTE:⟩`) seria pior que nenhum: some na leitura.
      expect(doc, `${slug}: marcador sem descrição`).not.toMatch(
        /⟨PENDENTE:\s*⟩/,
      );
    }
  });
});

/**
 * Avalia o `.dockerignore` do repositório **pelo comportamento**, não pelo
 * texto.
 *
 * `.dockerignore` e `.gitignore` compartilham o mesmo motor de casamento, e a
 * regra que interessa aqui é comum aos dois: **um diretório excluído nunca é
 * percorrido**, então negar um arquivo lá dentro é inerte. `git check-ignore`
 * executa esse motor diretamente, o que dá medição em vez de argumento.
 *
 * Monta um repositório descartável, instala o `.dockerignore` real como
 * `.gitignore`, cria os caminhos e pergunta ao git quais ficariam de fora.
 * `core.excludesFile` é neutralizado para o gitignore global da máquina não
 * contaminar o resultado.
 *
 * Limite conhecido: git e Docker não são idênticos em todo detalhe (p.ex. o
 * `*.md` sem barra casa em qualquer nível no git e só na raiz no Docker). A
 * cadeia usada no `.dockerignore` é correta sob as duas semânticas, e a regra
 * de ancestral — a que quebrou aqui — é a mesma nos dois. Isto **não**
 * substitui `docker build -f infra/Dockerfile .`, que segue sendo o portão
 * real.
 */
function forasDoContextoDeBuild(caminhos: string[]): Set<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "iris-dockerignore-"));
  try {
    const git = (args: string[]) =>
      execFileSync(
        "git",
        ["-c", `core.excludesFile=${path.join(dir, ".sem-global")}`, ...args],
        { cwd: dir, stdio: "pipe" },
      );

    git(["init", "-q"]);
    writeFileSync(
      path.join(dir, ".gitignore"),
      readFileSync(path.join(process.cwd(), ".dockerignore"), "utf8"),
    );
    for (const c of caminhos) {
      const destino = path.join(dir, c);
      mkdirSync(path.dirname(destino), { recursive: true });
      writeFileSync(destino, "");
    }

    const ignorados = new Set<string>();
    for (const c of caminhos) {
      try {
        git(["check-ignore", "-q", "--", c]);
        ignorados.add(c); // saída 0 = casa uma exclusão
      } catch (erro) {
        const status = (erro as { status?: number }).status;
        // 1 = não ignorado (chega no contexto). Qualquer outro código é falha
        // real do git e não pode virar "não ignorado" por omissão.
        if (status !== 1) throw erro;
      }
    }
    return ignorados;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("contexto de build do Docker", () => {
  // Por que este teste existe:
  //
  // As rotas /termos e /privacidade são `force-static` e leem o markdown
  // durante o `pnpm build`. No Dockerfile, `RUN pnpm build` vem logo depois de
  // `COPY . .` — e `COPY . .` respeita o .dockerignore. Se os documentos não
  // estiverem no contexto, o readFile lança ENOENT e o build da IMAGEM aborta:
  // verde na máquina de dev, quebrado só dentro do contêiner (#156/#157).
  //
  // `outputFileTracingIncludes` NÃO cobre isso — traça um arquivo que nunca
  // entrou no contexto de build.
  //
  // A 1ª tentativa de correção só acrescentou `!docs/legal/<arquivo>` mantendo
  // `docs` excluído, e os testes de então (que liam o TEXTO do .dockerignore)
  // ficaram verdes enquanto o build seguia quebrado — um teste verde afirmando
  // o contrário do que acontece é pior que teste nenhum. Por isso agora o
  // teste executa o motor de casamento em vez de ler linhas.
  const publicados = slugs.map((s) => DOCUMENTOS_LEGAIS[s].arquivo);
  const controles = [
    // Continuam fora da imagem: a reinclusão precisa ser estreita.
    "docs/legal/parecer-juridico-duty-to-warn.md",
    "docs/ux/fluxos-e-wireframes.md",
    "docs/dados/modelo-de-dados.md",
  ];
  const ignorados = forasDoContextoDeBuild([...publicados, ...controles]);

  it.each(slugs)("o markdown de %s chega ao contexto de build", (slug) => {
    const arquivo = DOCUMENTOS_LEGAIS[slug].arquivo;
    expect(
      ignorados.has(arquivo),
      `${arquivo} está sendo excluído do contexto de build — o \`pnpm build\` dentro da imagem vai falhar com ENOENT`,
    ).toBe(false);
  });

  it.each(controles)("%s continua fora da imagem", (arquivo) => {
    // Estreiteza: pareceres, consentimentos e o resto de docs/ não têm por que
    // viajar para a imagem de produção.
    expect(ignorados.has(arquivo)).toBe(true);
  });
});

describe("proteção contra reformatação automática", () => {
  it("docs/legal/ está fora do Prettier", () => {
    // Sem isto, `pnpm format` reescreve a cláusula 10 do advogado (já
    // reescreveu uma vez, em 30/07/2026) e derruba o guard byte a byte.
    const prettierignore = readFileSync(
      path.join(process.cwd(), ".prettierignore"),
      "utf8",
    );
    const linhas = prettierignore
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(linhas).toContain("docs/legal/");
  });
});

describe("compromissos de produto que não podem ser enfraquecidos", () => {
  it("os termos mantêm que o Iris nunca notifica terceiros externos", () => {
    const doc = texto("termos");
    expect(doc).toContain("Conselho Tutelar");
    expect(doc).toMatch(/não avisa a família/i);
    expect(doc).toMatch(/nunca notifica terceiros externos/i);
  });

  it("os termos preservam literalmente a cláusula 10 de autoria do advogado", () => {
    // Guarda byte a byte, não por palavras-chave.
    //
    // A versão anterior deste teste checava só o nome do advogado, a frase
    // "Não editar sem novo parecer" e a existência de "10.3." — e passou verde
    // enquanto o Prettier trocava `*ex post*` por `_ex post_` dentro do texto
    // que nos comprometemos a reproduzir literalmente. Inofensivo naquele caso,
    // mas provava que o guard não guardava nada: `texto()` remove `**` e
    // colapsa espaço, então nem em princípio detectaria deriva no corpo.
    //
    // Agora o corpo inteiro — da nota de origem até o fim de 10.3 — é comparado
    // com um fixture gerado do texto original do advogado. Qualquer edição ali
    // falha, alto e claro. O `.prettierignore` cobre `docs/legal/` para que a
    // ferramenta não reintroduza a deriva.
    const fixture = readFileSync(
      path.join(process.cwd(), "src/lib/__fixtures__/clausula-10-advogado.txt"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const doc = lerDoc("termos").replace(/\r\n/g, "\n");
    expect(
      doc.includes(fixture.trimEnd()),
      "cláusula 10.1–10.3 divergiu do texto do advogado (ver src/lib/__fixtures__/clausula-10-advogado.txt)",
    ).toBe(true);
  });

  it("a cláusula 10 do advogado não foi enfraquecida por reformatação", () => {
    const doc = lerDoc("termos");
    // A ênfase original é `*ex post*`. O Prettier normaliza para `_ex post_`;
    // semanticamente igual, mas "reproduzida literalmente" tem que ser literal.
    expect(doc).toContain("análise *ex post* do texto digitado");
    expect(doc).toContain("Thiago Lyra Galvão");
    expect(doc).toContain("Não editar sem novo parecer");
  });

  it("os termos garantem somente-leitura com exportação livre após o trial", () => {
    const doc = texto("termos");
    expect(doc).toMatch(/somente-leitura/i);
    expect(doc).toMatch(/NÃO perde o acesso aos dados/);
    expect(doc).toMatch(
      /Nenhum dado é apagado pelo simples fim do período de teste/i,
    );
  });

  // Estas duas asserções mudaram de sentido em 04/08/2026 (#163). Não é
  // "ajustar o teste ao código": o texto anterior descrevia um produto que
  // nunca existiu — trial contado do cadastro da clínica, 1ª fatura no 8º dia
  // e cartão recusado, sendo que o formulário de ativação sempre aceitou
  // cartão. Publicidade e contrato divergindo da entrega é exposição de CDC,
  // e é justamente isso que este arquivo existe para pegar.
  it("os termos descrevem trial de 7 dias iniciado no 1º paciente, sem cartão", () => {
    const doc = texto("termos");
    expect(doc).toMatch(/7 \(sete\) dias/);
    expect(doc).toMatch(/Não exigimos cartão de crédito/i);
    // O relógio começa no 1º paciente, com teto automático de 14 dias.
    expect(doc).toMatch(/cadastra o primeiro paciente/i);
    expect(doc).toMatch(/14 \(quatorze\) dias/);
    // E não há cobrança automática ao final — o fim do teste leva a
    // somente-leitura, não a um débito surpresa.
    expect(doc).toMatch(/não há cobrança\s*\n?\s*automática ao final/i);
  });

  it("os termos aceitam cartão e Pix, com cobrança pós-paga no fim do ciclo", () => {
    const doc = texto("termos");
    expect(doc).toMatch(/cartão de crédito e Pix/i);
    expect(doc).toMatch(/pós-paga/i);
    expect(doc).toMatch(/ao final de cada ciclo de 30/i);
    expect(doc).toMatch(/sem valor mínimo/i);
    // Nomear o provedor criaria obrigação de aditivo a cada troca de trilho.
    expect(doc).not.toMatch(/Mercado Pago|Asaas/);
  });

  it("os termos cobrem a declaração de conselho de classe e a auditoria", () => {
    const doc = texto("termos");
    expect(doc).toMatch(/conselho de classe/i);
    expect(doc).toMatch(/audita/i);
    expect(doc).toMatch(/suspender ou encerrar a conta/i);
  });

  it("os documentos separam o aceite do profissional do consentimento do titular", () => {
    expect(texto("termos")).toMatch(
      /não substitui.*não dispensa.*não antecipa aquele consentimento/is,
    );
    expect(texto("privacidade")).toMatch(
      /Aceitar esta Política não é o consentimento do paciente/i,
    );
  });

  it("a política descreve o profissional como titular e mantém Iris como operador", () => {
    const doc = texto("privacidade");
    expect(doc).toMatch(/Dados do profissional que se cadastra/i);
    expect(doc).toMatch(/número de registro profissional/i);
    expect(doc).toMatch(/continua sendo apenas operador/i);
  });

  it("a política nomeia Resend (e-mail transacional) e Asaas (pagamento)", () => {
    const doc = texto("privacidade");
    expect(doc).toContain("Resend");
    expect(doc).toContain("Asaas");
    expect(doc).toMatch(/Nenhum dado de paciente é enviado ao operador/i);
  });

  it("os documentos identificam o operador com CNPJ correto", () => {
    for (const slug of slugs) {
      expect(texto(slug)).toContain("29.811.201/0001-50");
      expect(texto(slug)).toContain("R Sutil Correa Ltda");
    }
  });
});
