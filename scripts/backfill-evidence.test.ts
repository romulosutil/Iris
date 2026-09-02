/**
 * Regressão da deriva de forma do payload no backfill (#553, sequela de
 * #532/#533).
 *
 * Desde a D57 (`7886e8f4`) o `LlmExtractionProvider` grava o objeto do subtipo
 * FLAT na raiz do payload (`{alvos: [...]}`), enquanto os leitores nasceram
 * lendo a forma ANINHADA dos seeds (`{evidencia: {alvos: [...]}}`). O leitor
 * on-approve foi corrigido nas PRs #548/#550 (helper `conteudoDoSubtipo`);
 * `backfill-evidence.ts` ficou lendo só a forma aninhada — ou seja, o backfill
 * das aprovações já feitas em produção não encontraria NADA.
 *
 * O teste exercita o núcleo real do script (`executarBackfill`) contra um `sql`
 * dublê e afirma sobre os INSERTs que ele emite. As fixtures são JSON LITERAL,
 * nunca montadas pelo helper que o código usa — fixture construída pela mesma
 * função que o código lê não prova nada.
 *
 * Falha se o script voltar a ler UMA só das formas (em qualquer direção).
 */
import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { executarBackfill } from "./backfill-evidence";

const CLINICA = "00000000-0000-0000-0000-0000000000c1";
const PACIENTE = "00000000-0000-0000-0000-0000000000a1";
const SESSAO = "00000000-0000-0000-0000-0000000000s1";
const REVISOR = "00000000-0000-0000-0000-0000000000u1";

const EXT_FLAT = "ext-flat";
const EXT_ANINHADA = "ext-aninhada";
const EXT_SUBTIPO_NULO = "ext-subtipo-nulo";

type LinhaExtracao = Record<string, unknown>;

/**
 * Dublê mínimo de `postgres.Sql`: despacha por texto da query e grava os
 * valores de cada INSERT. Os lookups do resolvedor devolvem `[]` (nada
 * resolve → FKs nulos), que é exatamente o caso real de slug não resolvido.
 */
function sqlDuble(extracoes: LinhaExtracao[]) {
  const inserts: unknown[][] = [];

  const fn = ((strings: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = strings.join(" ? ");
    if (/FROM extraction/.test(texto)) return Promise.resolve(extracoes);
    if (/FROM session/.test(texto)) {
      return Promise.resolve(
        valores[0] === SESSAO
          ? [
              {
                id: SESSAO,
                patient_id: PACIENTE,
                numero_sequencial_paciente: 7,
              },
            ]
          : [],
      );
    }
    if (/INSERT INTO evidence/.test(texto)) {
      inserts.push(valores);
      return Promise.resolve([{ id: `ev-${inserts.length}` }]);
    }
    return Promise.resolve([]);
  }) as unknown as { json: (v: unknown) => unknown };

  // `sql.json(x)` no dublê é identidade: o objeto chega intacto na lista de
  // valores do INSERT e o teste pode afirmar sobre ele.
  fn.json = (v: unknown) => v;

  return { sql: fn as unknown as postgres.Sql, inserts };
}

function extracao(id: string, payload: unknown): LinhaExtracao {
  return {
    id,
    session_id: SESSAO,
    clinic_id: CLINICA,
    estado: "aprovada",
    subtipo: "evidencia",
    payload,
    payload_editado: null,
    revisado_por: REVISOR,
  };
}

/** INSERTs cujos valores posicionais contêm o id da extração. */
function insertsDe(inserts: unknown[][], extractionId: string) {
  return inserts.filter((v) => v.includes(extractionId));
}

/** União achatada dos valores de um conjunto de INSERTs (assertiva robusta a
 * reordenação de colunas — o que importa é QUAL alvo foi lido, não em que
 * posição ele entrou no VALUES). */
function valoresDe(linhas: unknown[][]): unknown[] {
  return linhas.flat();
}

describe("backfill-evidence · forma do payload (#553)", () => {
  it("lê alvos na forma FLAT (o que o provider grava em produção desde a D57)", async () => {
    const { sql, inserts } = sqlDuble([
      extracao(EXT_FLAT, {
        descricao: "pediu água apontando",
        alvos: [{ dominio_id: "mando" }, { dominio_id: "tato" }],
      }),
    ]);

    const resumo = await executarBackfill(sql);

    const linhas = insertsDe(inserts, EXT_FLAT);
    expect(
      linhas.length,
      "payload FLAT ({alvos}) não gerou evidence — o backfill voltou a ler só a forma aninhada",
    ).toBe(2);
    expect(valoresDe(linhas)).toContain("mando");
    expect(valoresDe(linhas)).toContain("tato");
    expect(resumo.inseridas).toBe(2);
    expect(resumo.puladas).toBe(0);
  });

  it("lê alvos na forma ANINHADA (seeds e dados anteriores à D57)", async () => {
    const { sql, inserts } = sqlDuble([
      extracao(EXT_ANINHADA, {
        evidencia: {
          descricao: "repetiu o som",
          alvos: [{ dominio_id: "ecoico" }],
        },
      }),
    ]);

    const resumo = await executarBackfill(sql);

    const linhas = insertsDe(inserts, EXT_ANINHADA);
    expect(
      linhas.length,
      "payload ANINHADO ({evidencia:{alvos}}) não gerou evidence — o backfill passou a ler só a forma flat",
    ).toBe(1);
    expect(valoresDe(linhas)).toContain("ecoico");
    expect(resumo.inseridas).toBe(1);
  });

  it("lê as DUAS formas na MESMA passada (é a mistura que existe em produção)", async () => {
    const { sql, inserts } = sqlDuble([
      extracao(EXT_FLAT, { alvos: [{ dominio_id: "mando" }] }),
      extracao(EXT_ANINHADA, {
        evidencia: { alvos: [{ dominio_id: "ecoico" }] },
      }),
    ]);

    await executarBackfill(sql);

    expect(insertsDe(inserts, EXT_FLAT).length).toBe(1);
    expect(insertsDe(inserts, EXT_ANINHADA).length).toBe(1);
  });

  it("chave do subtipo presente e NULA é ausência de conteúdo, não fallback para a raiz", async () => {
    // Discrimina o helper correto de um `payload.evidencia ?? payload` ingênuo,
    // que leria `alvos` da raiz e inventaria evidência onde o conteúdo do
    // subtipo foi explicitamente anulado.
    const { sql, inserts } = sqlDuble([
      extracao(EXT_SUBTIPO_NULO, {
        evidencia: null,
        alvos: [{ dominio_id: "intraverbal" }],
      }),
    ]);

    const resumo = await executarBackfill(sql);

    expect(insertsDe(inserts, EXT_SUBTIPO_NULO).length).toBe(0);
    expect(resumo.puladas).toBe(1);
  });

  it("preserva o conteúdo clínico do subtipo em classificacao_original (sem o array alvos)", async () => {
    const { sql, inserts } = sqlDuble([
      extracao(EXT_FLAT, {
        descricao: "pediu água apontando",
        nivel_ajuda: "independente",
        alvos: [{ dominio_id: "mando" }],
      }),
    ]);

    await executarBackfill(sql);

    const classificacao = valoresDe(insertsDe(inserts, EXT_FLAT)).find(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && "alvo" in v,
    );
    expect(classificacao).toBeDefined();
    expect(classificacao!.descricao).toBe("pediu água apontando");
    expect(classificacao!.nivel_ajuda).toBe("independente");
    expect(classificacao!.alvos).toBeUndefined();
  });

  it("não toca subtipos que não são evidencia", async () => {
    const { sql, inserts } = sqlDuble([
      {
        ...extracao("ext-outro", { item_atividade: "bolha", valencia: "alta" }),
        subtipo: "preferencia_reforcador",
      },
    ]);

    await executarBackfill(sql);
    expect(inserts.length).toBe(0);
  });
});
