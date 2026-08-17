import { describe, expect, test } from "vitest";
import { withRenderLock } from "./render-lock";

test("serializa: nunca mais de 1 execução concorrente", async () => {
  let ativos = 0;
  let maxAtivos = 0;
  const tarefa = () =>
    withRenderLock(async () => {
      ativos++;
      maxAtivos = Math.max(maxAtivos, ativos);
      await new Promise((r) => setTimeout(r, 20));
      ativos--;
      return "ok";
    });
  const res = await Promise.all([tarefa(), tarefa(), tarefa()]);
  expect(res).toEqual(["ok", "ok", "ok"]);
  expect(maxAtivos).toBe(1);
});

test("libera o lock mesmo se fn lançar", async () => {
  await expect(
    withRenderLock(async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  await expect(withRenderLock(async () => "recuperou")).resolves.toBe(
    "recuperou",
  );
});
