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
import {
  DOCUMENTOS_LEGAIS,
  VERSAO_POLITICA,
  VERSAO_TERMO,
  type SlugLegal,
} from "./legal";

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

describe("VERSAO_POLITICA", () => {
  // Mesmo contrato de VERSAO_TERMO, para a Política de Privacidade. Hoje as
  // duas versões coincidem; o dia em que divergirem, este literal é o ponto de
  // parada consciente — e o aceite continua gravando só `versao_termo` (coluna
  // única, ver nota em legal.ts).
  it("é exatamente a versão desta fatia", () => {
    expect(VERSAO_POLITICA).toBe("2026-08-07");
  });

  it("tem formato de data ISO", () => {
    expect(VERSAO_POLITICA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * Definição ÚNICA da regex do guard de declaração. Não copiar.
 *
 * Içada para o escopo do módulo de propósito. Até a revisão do PR #337 o teste
 * que exercita o padrão mantinha uma segunda cópia colada dele: afrouxar a
 * regex da varredura não derrubava teste nenhum, porque a cópia seguia verde
 * exercitando um padrão morto — o anti-padrão "reimplementar em vez de
 * extrair". Com uma definição só, a varredura e o teste de comportamento
 * falham juntos.
 *
 * Compartilhar um objeto `RegExp` com flag `g` entre os dois testes é seguro
 * porque o único uso é `String.prototype.matchAll`, que opera sobre um clone
 * interno e não avança o `lastIndex` do original.
 *
 * Só declaração (`const VERSAO_TERMO =`), não uso nem import. O sufixo `\b`
 * evita casar `VERSAO_TERMO_MENOR_ATUAL` e os outros termos de consentimento
 * de paciente, que são versões próprias e legitimamente separadas destas. O
 * grupo opcional aceita anotação de tipo TypeScript (`: string =`), e a
 * classe negada é `[^=;\n]` — não `[^=]`. Com `[^=]` a anotação atravessa `;`
 * e quebra de linha e engole a declaração seguinte; ver o teste "a anotação de
 * tipo não engole a declaração seguinte".
 */
const regexDeclaracao =
  /\b(?:const|let|var)\s+(VERSAO_TERMO|VERSAO_POLITICA)\b(?:\s*:\s*[^=;\n]+)?\s*=/g;

/**
 * Raízes varridas pelo guard: todo diretório do repositório que carrega código
 * executável, não só `src/`.
 *
 * Opção (a) da revisão do PR #337 — estender a varredura em vez de encolher a
 * promessa da mensagem. Motivo: `src/**` sozinho reproduz o buraco do #329 —
 * o job de billing roda de `scripts/*.mjs`, que o TypeScript nem enxerga, e
 * uma terceira cópia da versão legal ali passaria batida enquanto a mensagem
 * de falha afirma "e em nenhum outro lugar". Medido em 16/08/2026 antes de
 * decidir: a varredura estendida acusa exatamente as duas declarações de
 * `src/lib/legal.ts` (502 arquivos, ~0,4s) — estender não custa falso
 * positivo nenhum.
 */
const RAIZES_VARRIDAS = ["src", "scripts", "db", "e2e", "ops", "infra"];

describe("integridade de fonte única das versões legais", () => {
  /**
   * Fonte única, verificada — não só prometida no comentário de `legal.ts`.
   *
   * Até 07/08/2026 `src/app/(auth)/cadastro/logic.ts` redeclarava a string,
   * e nada apontava isso: os testes acima comparam a constante DAQUI com os
   * markdown e nunca olhavam a segunda cópia. Subir a versão num lado só faria
   * o aceite do profissional gravar uma versão que nenhum documento publicado
   * tem — em `professional_consent`, que é append-only (0058: ninguém tem
   * DELETE). Evidência jurídica errada e irremovível.
   *
   * A asserção é positiva de propósito: cada constante tem que aparecer em
   * `src/lib/legal.ts` E em nenhum outro lugar. Um `toEqual([])` sobre
   * "violações fora de legal.ts" passaria com a constante deletada — guard
   * verde afirmando o contrário do que acontece, o pior tipo de teste.
   *
   * Limite conhecido, e agora escrito com o alcance real: o guard casa
   * declarações `const|let|var NOME =` em arquivos .ts/.tsx/.mjs/.cjs de
   * produção sob as raízes de `RAIZES_VARRIDAS`. Não pega o VALOR duplicado
   * como literal solta (`versaoTermo: "2026-08-07"` num insert), nem dentro de
   * .sql, .json ou markdown.
   */
  it("VERSAO_TERMO e VERSAO_POLITICA são declaradas em src/lib/legal.ts e em nenhum outro lugar", () => {
    const declaracoes = new Map<string, string[]>([
      ["VERSAO_TERMO", []],
      ["VERSAO_POLITICA", []],
    ]);

    const visitar = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const caminho = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          // Dependências e bundles não são código nosso; varrê-los só gera
          // ruído e custo. (Nenhuma raiz tem hoje, mas `e2e/` e `ops/` podem
          // ganhar um `node_modules` próprio a qualquer momento.)
          if (entrada.name === "node_modules" || entrada.name === ".next") {
            continue;
          }
          visitar(caminho);
        } else if (
          /\.(tsx?|mjs|cjs)$/.test(entrada.name) &&
          // Testes ficam de fora: o que importa é o código que roda em
          // produção. (E este próprio arquivo carrega o padrão como literal,
          // então se incluísse testes ele casaria consigo mesmo.)
          !/\.test\.(tsx?|mjs|cjs)$/.test(entrada.name)
        ) {
          const conteudo = readFileSync(caminho, "utf8");
          // `matchAll` no conteúdo inteiro (não linha a linha) pega inclusive
          // declaração quebrada em múltiplas linhas.
          for (const m of conteudo.matchAll(regexDeclaracao)) {
            const nome = m[1];
            if (nome === undefined) continue;
            const linha = conteudo.slice(0, m.index).split("\n").length;
            const relativo = path
              .relative(process.cwd(), caminho)
              .replace(/\\/g, "/");
            declaracoes.get(nome)?.push(`${relativo}:${linha}`);
          }
        }
      }
    };

    for (const raiz of RAIZES_VARRIDAS) {
      visitar(path.join(process.cwd(), raiz));
    }

    for (const [nome, locais] of declaracoes) {
      expect(
        locais.map((l) => l.replace(/:\d+$/, "")),
        `${nome} deve ser declarada em src/lib/legal.ts, e só lá — quem precisar importa de lá. Varridos os arquivos .ts/.tsx/.mjs/.cjs (exceto testes) sob ${RAIZES_VARRIDAS.map((r) => `${r}/`).join(", ")}. Encontrada em: ${locais.join(", ") || "lugar nenhum"}`,
      ).toEqual(["src/lib/legal.ts"]);
    }
  });

  it("regex de guarda estática detecta declarações tipadas, exportações e ignora imports e termos de pacientes", () => {
    // Mesmo identificador que a varredura acima usa — de propósito. Se alguém
    // afrouxar `regexDeclaracao`, é aqui que estoura.
    const testar = (codigo: string) =>
      Array.from(codigo.matchAll(regexDeclaracao)).map((m) => m[1]);

    // Casos de erro (devem ser detectados)
    expect(testar('const VERSAO_TERMO = "2026-08-07";')).toEqual([
      "VERSAO_TERMO",
    ]);
    expect(testar('export const VERSAO_TERMO: string = "2026-08-07";')).toEqual(
      ["VERSAO_TERMO"],
    );
    expect(
      testar('let VERSAO_POLITICA: Readonly<string> = "2026-08-07";'),
    ).toEqual(["VERSAO_POLITICA"]);
    expect(testar('var VERSAO_TERMO: string | undefined = "foo";')).toEqual([
      "VERSAO_TERMO",
    ]);

    // Casos legítimos (não devem ser detectados como nova declaração)
    expect(testar('import { VERSAO_TERMO } from "@/lib/legal";')).toEqual([]);
    expect(testar("export { VERSAO_TERMO };")).toEqual([]);
    expect(
      testar('const VERSAO_TERMO_TITULAR_ADULTO_ATUAL = "adulto-v1";'),
    ).toEqual([]);
    expect(testar('const VERSAO_TERMO_MENOR_ATUAL = "v1";')).toEqual([]);
  });

  it("a anotação de tipo não engole a declaração seguinte", () => {
    // Falso negativo real, medido na revisão do PR #337: com `[^=]+` na
    // anotação de tipo, o casamento atravessa `;` e quebra de linha e engole a
    // declaração de baixo. Neste fixture o guard devolvia `["VERSAO_TERMO"]` —
    // ele casava o `let` sem valor com o `=` da linha SEGUINTE, e
    // VERSAO_POLITICA, que é a declaração de verdade, SUMIA do conjunto
    // varrido. Nada ficava vermelho. Um guard que perde constante em silêncio
    // é pior que guard nenhum: a segunda cópia poderia nascer justamente ali.
    //
    // Com `[^=;\n]+` a anotação para no `;`: `let VERSAO_TERMO: string;` deixa
    // de casar (não tem inicializador, não é cópia de versão nenhuma) e
    // VERSAO_POLITICA volta a ser vista. Os dois resultados são diferentes
    // entre si, então esta asserção discrimina o antes do depois.
    const duasDeclaracoes = [
      "let VERSAO_TERMO: string;",
      'export const VERSAO_POLITICA = "b";',
    ].join("\n");

    expect(
      Array.from(duasDeclaracoes.matchAll(regexDeclaracao)).map((m) => m[1]),
    ).toEqual(["VERSAO_POLITICA"]);
  });
});

describe.each(slugs)("documento legal %s", (slug) => {
  const meta = DOCUMENTOS_LEGAIS[slug];

  it("existe em disco e não está vazio", () => {
    expect(lerDoc(slug).length).toBeGreaterThan(1000);
  });

  it("declara a mesma versão da sua constante em legal.ts", () => {
    // O acoplamento que importa: o texto publicado e a versão que o código
    // carrega (e, nos Termos, grava no aceite) têm que ser o mesmo documento.
    // Cada slug é comparado com a SUA constante (`meta.versao`), não com
    // VERSAO_TERMO para ambos — senão VERSAO_POLITICA poderia derivar sem
    // nenhum teste ficar vermelho.
    expect(lerDoc(slug)).toContain(meta.versao);
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
