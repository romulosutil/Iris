import { expect, test } from "vitest";
import { RenderOcupadoError, withRenderLock } from "./render-lock";

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

test("PF-02: espera na fila acima do teto rejeita com RenderOcupadoError (503) e sai da fila", async () => {
  const segura = withRenderLock(
    () => new Promise<string>((r) => setTimeout(() => r("primeira"), 120)),
  );
  const impaciente = withRenderLock(async () => "nunca", { timeoutMs: 30 });

  await expect(impaciente).rejects.toBeInstanceOf(RenderOcupadoError);
  await expect(impaciente).rejects.toMatchObject({
    code: "RENDER_OCUPADO",
    status: 503,
    name: "RenderOcupadoError",
  });
  await expect(impaciente).rejects.toThrow(/tente de novo/);

  // A que segurava termina normalmente…
  await expect(segura).resolves.toBe("primeira");
  // …e o slot NÃO ficou preso pela desistente: a próxima entra na hora.
  const inicio = Date.now();
  await expect(
    withRenderLock(async () => "depois", { timeoutMs: 30 }),
  ).resolves.toBe("depois");
  expect(Date.now() - inicio).toBeLessThan(30);
});

test("PF-02: timeoutMs = 0 mantém a espera ilimitada", async () => {
  const segura = withRenderLock(
    () => new Promise<string>((r) => setTimeout(() => r("primeira"), 60)),
  );
  const paciente = withRenderLock(async () => "esperou", { timeoutMs: 0 });
  await expect(segura).resolves.toBe("primeira");
  await expect(paciente).resolves.toBe("esperou");
});
