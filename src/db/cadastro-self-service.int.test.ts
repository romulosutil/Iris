import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("schema do cadastro self-service", () => {
  it("clinic tem trial_comeco_em nullable sem default, trial_dias = 7 e isento_trial", async () => {
    // #175: `trial_comeco_em` deixou de ser `NOT NULL DEFAULT now()`. NULL é
    // estado legítimo ("sem 1º paciente ainda") e um default reintroduziria o
    // relógio começando no signup. O legado pré-self-service saiu do sentinela
    // '2020-01-01' e virou `isento_trial = true`.
    const r = await db.execute(sql`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_name = 'clinic'
        and column_name in ('trial_comeco_em', 'trial_dias', 'isento_trial')
      order by column_name`);
    const linhas = r as unknown as { column_name: string; column_default: string | null; is_nullable: string }[];
    expect(linhas.map((l) => l.column_name)).toEqual([
      "isento_trial",
      "trial_comeco_em",
      "trial_dias",
    ]);

    const porNome = Object.fromEntries(linhas.map((l) => [l.column_name, l]));
    expect(porNome["trial_comeco_em"]!.is_nullable).toBe("YES");
    expect(porNome["trial_comeco_em"]!.column_default).toBeNull();
    expect(porNome["trial_dias"]!.is_nullable).toBe("NO");
    expect(porNome["trial_dias"]!.column_default).toContain("7");
    expect(porNome["isento_trial"]!.is_nullable).toBe("NO");
    expect(porNome["isento_trial"]!.column_default).toContain("false");
  });

  it("app_user guarda conselho, número e UF do registro", async () => {
    const r = await db.execute(sql`
      select column_name from information_schema.columns
      where table_name = 'app_user'
        and column_name in ('conselho', 'registro_numero', 'registro_uf')`);
    expect((r as unknown as { column_name: string }[]).length).toBe(3);
  });
});
