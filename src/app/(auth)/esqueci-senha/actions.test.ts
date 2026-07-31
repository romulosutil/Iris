import { describe, expect, it } from "vitest";
import { mensagemUniforme } from "./mensagem";

// mensagemUniforme não vive em `./actions` (resolução de controlador da
// Task 9): `actions.ts` é `"use server"`, e o Next.js 16 exige que TODO
// export de um módulo `"use server"` seja uma função async — além disso a
// issue #55 trata todo export desses módulos como endpoint invocável pelo
// cliente. `mensagemUniforme` é síncrona e comum a `./logic.ts` e
// `./actions.ts`, então vive em `./mensagem.ts`, sem diretiva.
describe("recuperação de senha", () => {
  it("devolve a mesma mensagem para e-mail existente e inexistente", () => {
    expect(mensagemUniforme()).toBe(
      "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.",
    );
  });
});
