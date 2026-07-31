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

describe("compromissos de produto que não podem ser enfraquecidos", () => {
  it("os termos mantêm que o Iris nunca notifica terceiros externos", () => {
    const doc = texto("termos");
    expect(doc).toContain("Conselho Tutelar");
    expect(doc).toMatch(/não avisa a família/i);
    expect(doc).toMatch(/nunca notifica terceiros externos/i);
  });

  it("os termos preservam literalmente a cláusula 10 de autoria do advogado", () => {
    const doc = texto("termos");
    expect(doc).toContain("Thiago Lyra Galvão");
    expect(doc).toContain("Não editar sem novo parecer");
    expect(doc).toMatch(/10\.3\./);
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
