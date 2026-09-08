/**
 * #258 (D9) — a marca institucional persiste DE FATO e o guard do definer
 * segura os papéis.
 *
 * Por que existe: `clinic` não aceita UPDATE de `app_role`. Um caminho de
 * escrita mal ligado devolve `{ ok: true }` e não muda nada — foi exatamente
 * o defeito do #212 na tela vizinha. O oráculo aqui é obrigatoriamente a role
 * DONA relendo `clinic` depois da chamada; asserir o retorno da função é o
 * que deixaria o bug passar.
 *
 * Limpeza por DELETE ESCOPADO nos ids desta suíte, nunca `TRUNCATE`: outros
 * arquivos de integração rodam em paralelo contra o mesmo banco e um TRUNCATE
 * de `clinic`/`app_user` derruba a fixture alheia (memória do repo
 * `truncate-extra-colide-com-int-test-paralelo`).
 *
 * Roda com `pnpm test:rls`. Gate de env em `db/tests/integration-env.ts`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { salvarMarca, lerMarcaDaTela } = await import("./logic");

const CLINIC_A = "00000000-0000-0000-0000-0000000258aa";
const CLINIC_B = "00000000-0000-0000-0000-0000000258bb";
const U_COORD_A = "00000000-0000-0000-0000-0000000258c1";
const U_TER_A = "00000000-0000-0000-0000-0000000258e1";
const U_COORD_B = "00000000-0000-0000-0000-0000000258c2";

/** PNG 1×1 transparente válido. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let owner: ReturnType<typeof postgres>;

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as never;

/** Estado real da linha, lido pela role DONA (bypassa RLS) — o oráculo. */
async function estado(clinicId: string) {
  const [row] = await owner<
    {
      brand_primary_color: string | null;
      brand_logo_mime: string | null;
      bytes: number | null;
    }[]
  >`SELECT brand_primary_color, brand_logo_mime, octet_length(brand_logo) AS bytes
      FROM clinic WHERE id = ${clinicId}`;
  return row!;
}

async function limpar() {
  await owner`DELETE FROM audit_log WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM user_role WHERE clinic_id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM clinic WHERE id IN (${CLINIC_A}, ${CLINIC_B})`;
  await owner`DELETE FROM app_user WHERE id IN (${U_COORD_A}, ${U_TER_A}, ${U_COORD_B})`;
}

describe.skipIf(!hasDb)("#258 · marca white-label persiste de fato", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await limpar();
    await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A #258'), (${CLINIC_B}, 'Clínica B #258')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A}, 'Coord A', 'coord-a@i258.test'),
      (${U_TER_A},   'Tera A',  'tera-a@i258.test'),
      (${U_COORD_B}, 'Coord B', 'coord-b@i258.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A},   ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B}, ${CLINIC_B}, 'coordenador')`;
  });

  afterAll(async () => {
    if (owner) {
      await limpar();
      await owner.end();
    }
  });

  test("coordenador grava cor e logotipo — e a linha muda no banco", async () => {
    const r = await salvarMarca(ctx("coordenador", U_COORD_A), {
      corPrimaria: "#1F4E79",
      logo: PNG_1X1,
      removerLogo: false,
    });
    expect(r).toEqual({ ok: true });

    expect(await estado(CLINIC_A)).toEqual({
      brand_primary_color: "#1f4e79",
      brand_logo_mime: "image/png",
      bytes: PNG_1X1.length,
    });
  });

  test("a leitura da tela devolve o data URI do logotipo gravado", async () => {
    const view = await lerMarcaDaTela(ctx("coordenador", U_COORD_A));
    expect(view.corPrimaria).toBe("#1f4e79");
    expect(view.logoDataUri).toBe(
      `data:image/png;base64,${PNG_1X1.toString("base64")}`,
    );
    expect(view.nomeClinica).toBe("Clínica A #258");
  });

  test("reeditar só a cor NÃO apaga o logotipo", async () => {
    const r = await salvarMarca(ctx("coordenador", U_COORD_A), {
      corPrimaria: "#333333",
      logo: null,
      removerLogo: false,
    });
    expect(r).toEqual({ ok: true });

    expect(await estado(CLINIC_A)).toEqual({
      brand_primary_color: "#333333",
      brand_logo_mime: "image/png",
      bytes: PNG_1X1.length,
    });
  });

  test("remoção explícita apaga o logotipo e mantém a cor", async () => {
    const r = await salvarMarca(ctx("coordenador", U_COORD_A), {
      corPrimaria: "#333333",
      logo: null,
      removerLogo: true,
    });
    expect(r).toEqual({ ok: true });

    expect(await estado(CLINIC_A)).toEqual({
      brand_primary_color: "#333333",
      brand_logo_mime: null,
      bytes: null,
    });
  });

  test("cor com contraste abaixo de 4.5:1 é recusada e NÃO toca o banco", async () => {
    const antes = await estado(CLINIC_A);
    const r = await salvarMarca(ctx("coordenador", U_COORD_A), {
      corPrimaria: "#f2b705",
      logo: null,
      removerLogo: false,
    });
    expect("error" in r && r.error).toMatch(/4\.5:1/);
    expect(await estado(CLINIC_A)).toEqual(antes);
  });

  test("arquivo que não é PNG é recusado e NÃO toca o banco", async () => {
    const antes = await estado(CLINIC_A);
    const r = await salvarMarca(ctx("coordenador", U_COORD_A), {
      corPrimaria: "#333333",
      logo: Buffer.from('<svg><script>fetch("//x")</script></svg>'),
      removerLogo: false,
    });
    expect("error" in r && r.error).toMatch(/PNG/);
    expect(await estado(CLINIC_A)).toEqual(antes);
  });

  test("terapeuta é barrado NO BANCO, não só pelo requireRole do wrapper", async () => {
    // O `requireRole` vive em actions.ts e não passa por aqui; quem recusa é o
    // guard interno do definer. É essa barreira que este teste mede.
    await expect(
      salvarMarca(ctx("terapeuta", U_TER_A), {
        corPrimaria: "#333333",
        logo: null,
        removerLogo: false,
      }),
    ).rejects.toThrow();
  });

  test("coordenador de outra clínica não alcança a marca do vizinho", async () => {
    const antesA = await estado(CLINIC_A);
    await salvarMarca(ctx("coordenador", U_COORD_B, CLINIC_B), {
      corPrimaria: "#004d40",
      logo: null,
      removerLogo: false,
    });

    // A clínica NUNCA entra por parâmetro na função: o tenant vem do GUC da
    // transação. A linha do vizinho fica intacta.
    expect(await estado(CLINIC_A)).toEqual(antesA);
    expect((await estado(CLINIC_B)).brand_primary_color).toBe("#004d40");
  });
});
