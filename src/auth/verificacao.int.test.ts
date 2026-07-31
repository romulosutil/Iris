import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { authDb } from "@/db/client";

describe("backfill de verificação de e-mail", () => {
  it("nenhuma conta pré-existente ficou com email_verified = false", async () => {
    const r = await authDb.execute(sql`
      select count(*)::int as total from app_user where email_verified = false`);
    expect((r as unknown as { total: number }[])[0]!.total).toBe(0);
  });
});
