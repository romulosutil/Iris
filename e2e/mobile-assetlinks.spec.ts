import { test, expect } from "@playwright/test";

/**
 * A rota de Digital Asset Links responde de verdade (#185, Etapa 3).
 *
 * O E2E local roda sem `TWA_ANDROID_PACKAGE_NAME`, então o corpo esperado é
 * `[]`. O que este spec garante é o que quebra em silêncio: a rota existir no
 * caminho exato, com o content-type que o verificador do Android exige.
 */
test("serve /.well-known/assetlinks.json como application/json", async ({
  request,
}) => {
  const resposta = await request.get("/.well-known/assetlinks.json");

  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("application/json");

  const corpo = await resposta.json();
  expect(Array.isArray(corpo)).toBe(true);
});
