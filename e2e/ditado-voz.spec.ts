import { test, expect } from "@playwright/test";
import { dublarMicrofone } from "./helpers/microfone";
import { entrarComMfa } from "./helpers/sessao";

/**
 * E2E do ditado de voz (#72 / #494 T13): gravar clipe → parar → enviar o lote →
 * o worker transcreve → o parágrafo aparece com o selo de IA → "Usar no diário"
 * leva o texto para a aba Texto SEM salvar sozinho.
 *
 * Por que este spec existe: a #72 fechou o backend inteiro com os 6 checks
 * obrigatórios verdes e a feature INUTILIZÁVEL — não havia nenhum spec de áudio
 * em `e2e/`, então nenhum check exercitava o caminho do terapeuta. Um teste
 * unitário com o componente montado em jsdom não fecha esse ponto cego: ele
 * mocka as server actions, e é justamente na fronteira UI ↔ action ↔ fila ↔
 * worker que a #72 estava quebrada.
 *
 * ## Pré-requisitos (além dos de `diario-demo.spec.ts`)
 *
 * Este spec depende de infraestrutura que os outros 9 specs não usam, e por
 * isso é OPT-IN por ambiente (ver "Como é coletado", abaixo) — nunca passa
 * "verde" exercitando meio fluxo. O que precisa estar no `.env.e2e` (ou
 * exportado no shell):
 *
 *   FEATURE_FLAG_ASR_ENABLED=true   # R21; sem isto `enviarLoteAsr` recusa
 *   ASR_S3_ENDPOINT=http://localhost:9000   # MinIO do infra/docker-compose.yml
 *   ASR_S3_ACCESS_KEY=iris
 *   ASR_S3_SECRET_KEY=iris123456
 *   ASR_S3_BUCKET=iris-asr-efemero          # criar o bucket antes
 *   ASR_JOB_TOKEN=<qualquer coisa>          # o spec dispara o worker com ele
 *
 * `ASR_PROVIDER` fica AUSENTE de propósito: `getAsrProvider()` cai no
 * `StubAsrProvider`, que devolve `[transcrição stub — N bytes, audio/webm]`
 * sem rede (R22). O serviço `iris-asr` não existe em CI e mockar a rota HTTP
 * do provider deixaria justamente o pedaço interessante (fila → worker →
 * `app_asr_concluir`) fora do teste.
 *
 * O `webServer` do playwright.config herda o `process.env` do próprio config
 * (que carrega `.env.e2e` antes de `.env`), então não é preciso declarar nada
 * lá — mas com `reuseExistingServer` um servidor já de pé pode ter subido sem a
 * flag. Por isso a primeira asserção dentro do teste é sobre a UI do ditado
 * estar realmente na tela: servidor velho falha aqui, com mensagem, em vez de
 * falhar num clique que não acha botão.
 *
 * ## Como é coletado
 *
 * Este arquivo só é coletado pelo projeto `ditado-voz`, que o
 * `playwright.config.ts` só declara quando as 5 variáveis acima existem — e o
 * chromium padrão o ignora. NÃO existe `test.skip` aqui de propósito: o gate
 * `scripts/ci/verificar-cobertura-e2e.mjs` reprova com qualquer teste pulado.
 * Consequência assumida: enquanto o job `test-e2e` do CI não subir MinIO, este
 * spec não roda em CI — é o débito nomeado no comentário do config, não um
 * verde disfarçado.
 */

const jobToken = process.env.ASR_JOB_TOKEN ?? "";

/**
 * Bytes do clipe falso. Tamanho fixo (e > 0) porque o `StubAsrProvider` põe o
 * `byteLength` no texto que devolve: o parágrafo esperado é derivável, não
 * adivinhado. `ondataavailable` só empurra chunk com `size > 0` — um Blob vazio
 * faria o lote subir 0 byte e o teste passaria pelo caminho errado.
 */
const BYTES_DO_CLIPE = 2048;

test.describe("ditado de voz", () => {
  test("terapeuta grava clipe, envia o lote e leva a transcrição para o diário sem salvar sozinho", async ({
    page,
    request,
  }) => {
    // Redundante com o gate do projeto no config — e mantido assim de
    // propósito: alguém rodando `--project=ditado-voz` à mão numa shell sem as
    // variáveis merece a mensagem exata, não um 401 do worker lá na frente.
    expect(
      jobToken,
      "ASR_JOB_TOKEN ausente — veja o cabeçalho deste arquivo",
    ).not.toBe("");

    await dublarMicrofone(page, BYTES_DO_CLIPE);

    await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
    await expect(page).toHaveURL("/agenda");

    await page.goto("/agenda");
    await page
      .getByRole("button", { name: /^Abrir agendamento de / })
      .locator("visible=true")
      .first()
      .click();
    await expect(page).toHaveURL(/\/diario\/.+/);

    // Aba Áudio. Com a flag ligada o `AudioLocal` delega para o `DitadoVoz`, e
    // o rótulo do botão é "Gravar clipe" (o fluxo de 1 clipe diz "Gravar
    // áudio"). Se o que aparecer for o de 1 clipe, o servidor sob teste subiu
    // SEM a flag — a mensagem abaixo diz isso em vez de deixar um clique
    // procurando botão inexistente por 30s.
    await page.getByRole("tab", { name: "Áudio" }).click();
    await expect(
      page.getByRole("button", { name: "Gravar clipe" }),
      "o servidor sob teste não está com FEATURE_FLAG_ASR_ENABLED=true " +
        "(a aba Áudio mostrou o gravador de 1 clipe, não o ditado)",
    ).toBeVisible();

    // Grava 1 clipe: o dublê entrega o blob no `stop`, e o componente só então
    // monta a lista revisável (R4). Nada sobe ao parar de gravar (R5).
    await page.getByRole("button", { name: "Gravar clipe" }).click();
    await page.getByRole("button", { name: "Parar clipe" }).click();
    await expect(
      page
        .getByRole("list", { name: "Clipes deste ditado" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    // R5 medido, não presumido: enquanto o lote não foi enviado a UI segue em
    // "montando", oferecendo gravar mais um clipe.
    await expect(
      page.getByRole("button", { name: "Gravar mais um clipe" }),
    ).toBeVisible();

    // Envio explícito do lote.
    await page
      .getByRole("button", { name: "Enviar pra Iris analisar" })
      .click();
    await expect(page.getByText(/A Iris está transcrevendo/i)).toBeVisible();

    // Dispara o worker no papel do agendador externo (mesmo contrato de
    // `scripts/disparo-asr-transcrever.mjs`: POST com bearer). Sem isto o lote
    // fica `na_fila` para sempre e o polling só bateria no teto de 10 min — em
    // CI/local não existe cron nenhum rodando.
    const tick = await request.post("/api/internal/jobs/asr-transcrever", {
      headers: { Authorization: `Bearer ${jobToken}` },
    });
    expect(
      tick.ok(),
      `worker asr-transcrever recusou o tick (HTTP ${tick.status()}): ${await tick.text()}`,
    ).toBe(true);
    const corpo = (await tick.json()) as { transcritos?: number };
    expect(
      corpo.transcritos,
      "o tick do worker não transcreveu o clipe recém-enviado",
    ).toBe(1);

    // O polling (3s) leva o lote a "concluido" e o rascunho aparece. O texto é
    // o do `StubAsrProvider`, derivado do tamanho do blob que o dublê gerou.
    const rascunho = page.getByRole("region", {
      name: "Rascunho da transcrição",
    });
    await expect(rascunho).toBeVisible({ timeout: 15_000 });
    const textoEsperado = `[transcrição stub — ${BYTES_DO_CLIPE} bytes, audio/webm]`;
    await expect(rascunho.getByText(textoEsperado)).toBeVisible();
    // R17 — o marcador de IA é visível, não só leitura de tela.
    await expect(rascunho.getByText("Transcrito pela IA")).toBeVisible();
    await expect(rascunho.getByText("Não transcrito")).toHaveCount(0);

    // R18 — "Usar no diário" ENTREGA o texto ao rascunho da anotação; salvar
    // continua sendo gesto do terapeuta.
    await rascunho.getByRole("button", { name: "Usar no diário" }).click();

    const anotacao = page.getByLabel(/Anotação rápida/i);
    await expect(anotacao).toBeVisible();
    await expect(anotacao).toHaveValue(textoEsperado);
    // A régua do "sem salvar sozinho": se o aceite disparasse a action de
    // captura, este alerta apareceria. Ele só existe depois de "Salvar captura".
    await expect(page.getByText("Captura salva.")).toHaveCount(0);
  });
});
