/**
 * #560 / F3b — a lista de PII do emissor dos jobs É a da app.
 *
 * `scripts/lib/log-estruturado.mjs` repete `CHAVES_PII`/`PADROES_PII` de
 * `src/lib/observabilidade/redacao.ts` porque não há como importar TypeScript
 * de dentro de uma imagem de infra (elas copiam `.mjs` à mão e não instalam
 * nada — `infra/billing/Dockerfile`).
 *
 * Duas listas que podem divergir seriam o defeito, não a solução: a chave nova
 * entraria de um lado, e o campo continuaria saindo em claro no log do outro —
 * em SILÊNCIO, que é o modo de falha que a #546 comprou o direito de não ter.
 * Este arquivo é o que torna a divergência vermelha no CI.
 *
 * Ele NÃO é copiado para imagem nenhuma: roda no `pnpm test`, do lado do repo,
 * onde os dois módulos existem.
 */
import { describe, expect, it } from "vitest";

import {
  CHAVES_PII as CHAVES_MJS,
  chaveEhPII as chaveEhPiiMjs,
  normalizarChave as normalizarMjs,
  VALOR_REDIGIDO as REDIGIDO_MJS,
} from "./log-estruturado.mjs";
import {
  CHAVES_PII,
  chaveEhPII,
  normalizarChave,
  VALOR_REDIGIDO,
} from "@/lib/observabilidade/redacao";

describe("#560/F3b — paridade da redaction entre a app e os jobs", () => {
  it("a lista fechada é a MESMA, item a item", () => {
    // Conjunto exato nos dois sentidos: uma chave a mais no `.mjs` também é
    // divergência (significa que a app deixou de proteger algo que os jobs
    // ainda protegem, e ninguém decidiu isso).
    expect([...CHAVES_MJS].sort()).toEqual([...CHAVES_PII].sort());
  });

  it("as FAMÍLIAS de padrão decidem igual", () => {
    // A lista fechada acima não cobre os padrões (`cpf*`, `*token`, `endereco*`
    // …), que são justamente onde uma cópia envelhece sem ninguém notar. Aqui
    // as duas implementações são interrogadas com os mesmos casos.
    const casos = [
      "nome",
      "clinicId",
      "responsavelCpf",
      "cpfHash",
      "senhaAtual",
      "password",
      "clientSecret",
      "apiKey",
      "accessToken",
      "tokenHash",
      "tokensEntrada",
      "tokensSaida",
      "transcricaoTexto",
      "respostaTexto",
      "enderecoCep",
      "enderecoLogradouro",
      "trecho_fonte",
      "trechoFonte",
      "trecho-fonte",
      "linhas",
      "expirados",
      "bytes",
      "job",
    ];
    for (const chave of casos) {
      expect(chaveEhPiiMjs(chave), chave).toBe(chaveEhPII(chave));
    }
  });

  it("normaliza a chave do mesmo jeito e censura com o mesmo valor", () => {
    // Se a normalização divergir, a lista idêntica não significa nada:
    // `trecho_fonte` casaria de um lado e passaria do outro.
    for (const chave of ["trecho_fonte", "trechoFonte", "TRECHO-FONTE"]) {
      expect(normalizarMjs(chave), chave).toBe(normalizarChave(chave));
    }
    expect(REDIGIDO_MJS).toBe(VALOR_REDIGIDO);
  });
});
