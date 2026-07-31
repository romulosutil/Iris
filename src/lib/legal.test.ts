import { readFileSync } from "node:fs";
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
    expect(VERSAO_TERMO).toBe("2026-07-30");
  });

  it("tem formato de data ISO", () => {
    expect(VERSAO_TERMO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

describe("contexto de build do Docker", () => {
  // Por que este teste existe:
  //
  // As rotas /termos e /privacidade são `force-static` e leem o markdown
  // durante o `pnpm build`. No Dockerfile, `RUN pnpm build` vem logo depois de
  // `COPY . .` — e `COPY . .` respeita o .dockerignore, que exclui `docs`.
  // Resultado: ENOENT e build da imagem abortado, verde na máquina de dev e
  // quebrado só dentro do contêiner (assinatura de #156/#157).
  //
  // `outputFileTracingIncludes` NÃO cobre isso: ele traça um arquivo que nunca
  // entrou no contexto de build. A única correção é a reinclusão explícita.
  const dockerignore = readFileSync(
    path.join(process.cwd(), ".dockerignore"),
    "utf8",
  );
  const linhas = dockerignore
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  it.each(slugs)(
    "o markdown de %s está reincluído no contexto de build",
    (slug) => {
      expect(linhas).toContain(`!${DOCUMENTOS_LEGAIS[slug].arquivo}`);
    },
  );

  it("as reinclusões são as últimas regras que casam com docs/legal", () => {
    // No .dockerignore vale a ÚLTIMA regra que casa com o caminho. Se alguém
    // acrescentar uma exclusão depois delas, a reinclusão morre em silêncio.
    const ultimaRelevante = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.includes("docs") || l === "*.md")
      .at(-1);
    expect(ultimaRelevante?.l.startsWith("!docs/legal/")).toBe(true);
  });

  it("reinclui só os documentos publicados, não docs/ inteiro", () => {
    // Manter a exclusão o mais estreita possível: consentimentos, pareceres e
    // briefings de advogado não têm por que viajar para a imagem.
    const reinclusoes = linhas.filter((l) => l.startsWith("!docs"));
    expect(reinclusoes).toHaveLength(slugs.length);
    expect(linhas).not.toContain("!docs");
    expect(linhas).not.toContain("!docs/");
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

  it("os termos descrevem trial de 7 dias sem exigir cartão", () => {
    const doc = texto("termos");
    expect(doc).toMatch(/7 \(sete\) dias/);
    expect(doc).toMatch(/Não exigimos cartão de crédito/i);
    expect(doc).toMatch(/8º dia/);
    expect(doc).toMatch(/aniversário da conta/i);
  });

  it("os termos limitam os meios de pagamento a Pix e boleto", () => {
    const doc = texto("termos");
    expect(doc).toMatch(/Pix e boleto/i);
    expect(doc).toMatch(/[Cc]artão de crédito não é aceito/);
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
