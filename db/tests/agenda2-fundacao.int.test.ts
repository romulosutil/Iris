import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hasDb = !!process.env.DATABASE_URL && !!process.env.MIGRATION_DATABASE_URL;

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("Agenda 2.0 · Etapa A · fundação de dados", () => {
  beforeAll(() => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("extensão btree_gist está habilitada", async () => {
    const [row] = await owner`
      SELECT 1 AS ok FROM pg_extension WHERE extname = 'btree_gist'`;
    expect(row?.ok).toBe(1);
  });
});
