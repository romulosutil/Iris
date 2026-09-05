import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard ESTÁTICO da fiação do D69 — não constrói imagem nenhuma.
 *
 * O portão real é `bash scripts/ci/carga-imagem-app.sh`, que builda e BOOTA as
 * duas imagens do deploy do app. O que este arquivo protege é diferente e mais
 * barato: que essa carga continue LIGADA no CI, e ligada da forma que não trava
 * o PR. As duas falhas que ele pega são de deleção, não de lógica — alguém
 * enxuga o `ci.yml`, o job some, e o sintoma volta a ser um deploy quebrado em
 * produção com CI verde (é o D58/#423 e o próprio D69 no mesmo movimento).
 *
 * Ler os arquivos com normalização de CRLF de propósito: o repo é editado no
 * Windows e uma asserção de substring falharia por fim de linha, não por
 * conteúdo.
 */
const raiz = process.cwd();

function ler(relativo) {
  return readFileSync(path.join(raiz, relativo), "utf8").replace(/\r\n/g, "\n");
}

const ci = ler(".github/workflows/ci.yml");
const script = ler("scripts/ci/carga-imagem-app.sh");

describe("carga das imagens do app (D69) — fiação do CI", () => {
  it("o ci.yml invoca o script de carga", () => {
    expect(ci).toContain("bash scripts/ci/carga-imagem-app.sh");
  });

  it("o gate é `if:` de JOB, e o workflow não ganhou `paths:` no gatilho", () => {
    // `paths:` no `on:` faz o check NUNCA reportar e o PR fica `BLOCKED` para
    // sempre quando o job está no ruleset — é exatamente o D58/#423. Job
    // `skipped`, ao contrário, reporta sucesso. Por isso a decisão mora num job
    // barato à parte e é consumida por `if:`.
    expect(ci).toContain(
      "if: needs.imagens-do-app-alteradas.outputs.alterado == 'true'",
    );

    const gatilho = ci.slice(ci.indexOf("\non:"), ci.indexOf("\nconcurrency:"));
    expect(gatilho).not.toContain("paths:");
  });

  it("`docs/legal/**` conta como alteração relevante", () => {
    // `/termos` e `/privacidade` são `force-static` e leem esse markdown do
    // disco durante o `pnpm build` DENTRO da imagem. Um filtro ingênuo de
    // "docs-only ⇒ pula" cegaria justamente a rota que o probe de boot usa
    // como prova de vida.
    const decisao = ci.slice(
      ci.indexOf("decidir se a carga das imagens do app roda"),
      ci.indexOf("carga-imagem-app:"),
    );
    expect(decisao).toContain("docs/legal/*) relevante=true");
  });

  it("o script cobre os DOIS Dockerfiles do deploy do app", () => {
    expect(script).toContain('buildar infra/Dockerfile "${TAG_APP}"');
    expect(script).toContain(
      'buildar infra/Dockerfile.migrate "${TAG_MIGRATE}"',
    );
  });

  it("o probe de boot tem teto de 15s e mata o container ao final", () => {
    expect(script).toContain('TIMEOUT_BOOT_S="${TIMEOUT_BOOT_S:-15}"');
    expect(script).toContain("trap derrubar_container_app RETURN");
  });

  it("o script reprova a imagem por módulo ausente, e não só por exit code", () => {
    // Foi o modo de falha do `@swc/helpers`: build verde, `node server.js`
    // morto no boot. Sem esses padrões, um servidor que responde 200 numa rota
    // estática esconderia o require quebrado.
    for (const padrao of ["ERR_MODULE_NOT_FOUND", "Cannot find module"]) {
      expect(script).toContain(padrao);
    }
  });
});
