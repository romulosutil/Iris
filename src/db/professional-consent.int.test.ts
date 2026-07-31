import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("professional_consent", () => {
  it("tem RLS habilitada", async () => {
    const r = await db.execute(sql`
      select relrowsecurity from pg_class where relname = 'professional_consent'`);
    expect((r as unknown as { relrowsecurity: boolean }[])[0]?.relrowsecurity).toBe(true);
  });

  it("app_role não tem UPDATE nem DELETE (aceite é imutável)", async () => {
    const r = await db.execute(sql`
      select privilege_type from information_schema.role_table_grants
      where table_name = 'professional_consent' and grantee = 'app_role'`);
    const privs = (r as unknown as { privilege_type: string }[]).map((p) => p.privilege_type);
    expect(privs).not.toContain("UPDATE");
    expect(privs).not.toContain("DELETE");
  });
});
