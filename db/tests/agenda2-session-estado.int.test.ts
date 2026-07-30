import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "./integration-env";

vi.mock("server-only", () => ({}));

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("Agenda 2.0 · enum session_estado (recreate)", () => {
  beforeAll(() => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("enum session_estado tem os 5 valores novos e não os legados", async () => {
    const vals = await owner`
      SELECT e.enumlabel AS v FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'session_estado'
      ORDER BY e.enumsortorder`;
    const labels = vals.map((r) => r.v);
    expect(labels).toEqual([
      "agendada",
      "realizada",
      "falta_paciente",
      "falta_terapeuta",
      "cancelada",
    ]);
  });

  // A migração de dados (presente→realizada, falta→falta_paciente) roda no
  // recreate 0032 contra as linhas legadas de produção. Numa base limpa de dev
  // não há linhas legadas para reintroduzir (o valor 'presente' já não existe no
  // enum após o recreate), então o mapa é exercitado pelo CASE da própria
  // migration; aqui garantimos que nenhuma session carrega um estado legado.
  test("nenhuma session carrega estado legado (presente/falta)", async () => {
    const [r] = await owner`
      SELECT count(*)::int AS n FROM session
      WHERE estado::text IN ('presente', 'falta')`;
    expect(r?.n).toBe(0);
  });
});
