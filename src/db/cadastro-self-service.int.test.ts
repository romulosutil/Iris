import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("schema do cadastro self-service", () => {
  it("clinic tem trial_comeco_em com default e trial_dias = 7", async () => {
    const r = await db.execute(sql`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_name = 'clinic'
        and column_name in ('trial_comeco_em', 'trial_dias')
      order by column_name`);
    const linhas = r as unknown as { column_name: string; column_default: string | null; is_nullable: string }[];
    expect(linhas.map((l) => l.column_name)).toEqual(["trial_comeco_em", "trial_dias"]);
    expect(linhas.every((l) => l.is_nullable === "NO")).toBe(true);
    expect(linhas[1]!.column_default).toContain("7");
  });

  it("app_user guarda conselho, número e UF do registro", async () => {
    const r = await db.execute(sql`
      select column_name from information_schema.columns
      where table_name = 'app_user'
        and column_name in ('conselho', 'registro_numero', 'registro_uf')`);
    expect((r as unknown as { column_name: string }[]).length).toBe(3);
  });
});
