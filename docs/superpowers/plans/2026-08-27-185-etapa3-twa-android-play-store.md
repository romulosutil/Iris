# Etapa 3 — Empacotamento TWA para a Google Play Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Iris empacotado como Trusted Web Activity — `assetlinks.json` servido em produção, projeto Bubblewrap versionado, `.aab` compilado e assinado com keystore de desenvolvimento, e um runbook do que só o Rômulo pode fazer no Google Play Console.

**Architecture:** O `assetlinks.json` é uma rota do App Router (`src/app/.well-known/assetlinks.json/route.ts`), seguindo o padrão que o repo já usa para os outros `/.well-known/*`, e **parametrizada por variável de ambiente**: o nome do pacote e a lista de fingerprints SHA-256 nunca são chumbados no código, porque o fingerprint de release só existe depois que o Google Play assina o app. O projeto Bubblewrap vive em `twa/`, com o `twa-manifest.json` versionado e todo artefato de build e chave privada fora do Git. O `.aab` desta etapa é assinado com keystore **de desenvolvimento** — suficiente para instalar e verificar num aparelho por `bundletool`, insuficiente para publicar.

**Tech Stack:** `@bubblewrap/cli` via `pnpm dlx` (sem dependência no `package.json`), JDK 17, Android SDK Build Tools (o próprio Bubblewrap provisiona em `~/.bubblewrap`), Next.js 16 route handler, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-03-mobile-responsividade-pwa-twa-android-design.md` (§2 Etapa 3, §3 critério 3) + decisões ratificadas em 27/08/2026 na §4 da spec.

**Issue:** #185 (Etapa 3 de 3). **Depende da Etapa 2** — o Bubblewrap lê `/manifest.webmanifest` para gerar o projeto.

## Global Constraints

- **Escopo desta etapa termina no `.aab` de desenvolvimento.** Decisão ratificada 27/08/2026: publicar exige conta de desenvolvedor Google Play (US$ 25, ato único) e keystore de release, que só o Rômulo cria. O plano entrega tudo até a borda e um runbook do resto.
- **Nenhuma chave privada no repositório.** `twa/*.keystore`, `twa/*.jks` e `twa/android.keystore.passwords` vão no `.gitignore` antes de qualquer chave existir no disco.
- **Nenhuma dependência nova em `package.json`.** `@bubblewrap/cli` é invocado por `pnpm dlx`.
- **`assetlinks.json` parametrizado por ambiente.** Fingerprint chumbado no código obriga a um deploy só para publicar na loja, e no dia em que o Play App Signing gerar um segundo fingerprint o app quebra em produção com a barra do Chrome reaparecendo.
- **Idioma:** código, comentários e documentação em **pt-BR**. Commits em **pt-BR**, Conventional Commits.
- **Nenhuma mudança de schema, RLS ou migração** nesta etapa.
- **`docs/legal/` não é tocado.** Se a publicação exigir texto de loja com afirmação sobre tratamento de dados, isso é issue separada com aprovação do Rômulo.

## File Structure

| Arquivo                                        | Responsabilidade                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/app/.well-known/assetlinks.json/route.ts` | **Criar.** Serve o Digital Asset Links a partir de env. Único lugar que conhece o formato. |
| `src/app/.well-known/assetlinks.test.ts`       | **Criar.** Trava formato, content-type e o comportamento com env ausente.                  |
| `.env.example`                                 | **Modificar.** Documenta `TWA_ANDROID_PACKAGE_NAME` e `TWA_SHA256_FINGERPRINTS`.           |
| `e2e/mobile-assetlinks.spec.ts`                | **Criar.** Prova que a rota responde no app real com o content-type certo.                 |
| `.gitignore`                                   | **Modificar.** Exclui chave privada e artefato de build do TWA.                            |
| `twa/twa-manifest.json`                        | **Criar (gerado, versionado).** Configuração do projeto Android.                           |
| `twa/README.md`                                | **Criar.** Runbook: gerar keystore, buildar, extrair fingerprint, instalar no aparelho.    |
| `docs/arquitetura/publicacao-play-store.md`    | **Criar.** Runbook do Play Console — a parte que só o Rômulo faz.                          |

---

### Task 1: Rota `/.well-known/assetlinks.json`

Entrega: a rota no ar, parametrizada por ambiente, com teste que cobre o caminho feliz e o caminho de env ausente.

**Files:**

- Create: `src/app/.well-known/assetlinks.json/route.ts`
- Create: `src/app/.well-known/assetlinks.test.ts`
- Create: `e2e/mobile-assetlinks.spec.ts`
- Modify: `.env.example`

**Interfaces:**

- Consumes: nada das etapas anteriores.
- Produces:
  - Rota `GET /.well-known/assetlinks.json`.
  - `export function montarAssetLinks(pacote: string | undefined, fingerprints: string | undefined): AssetLink[]` exportada do mesmo módulo, onde
    ```ts
    interface AssetLink {
      relation: string[];
      target: {
        namespace: "android_app";
        package_name: string;
        sha256_cert_fingerprints: string[];
      };
    }
    ```
    A Task 2 usa o valor de `TWA_ANDROID_PACKAGE_NAME` como `packageId` do Bubblewrap.
  - Duas variáveis de ambiente: `TWA_ANDROID_PACKAGE_NAME`, `TWA_SHA256_FINGERPRINTS`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `src/app/.well-known/assetlinks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { montarAssetLinks } from "./assetlinks.json/route";

const PACOTE = "br.ia.irisclinica.twa";
const FP_A =
  "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const FP_B =
  "A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90";

describe("montarAssetLinks", () => {
  it("monta a declaração no formato do Digital Asset Links", () => {
    const links = montarAssetLinks(PACOTE, FP_A);

    expect(links).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACOTE,
          sha256_cert_fingerprints: [FP_A],
        },
      },
    ]);
  });

  it("aceita múltiplos fingerprints separados por vírgula", () => {
    // Play App Signing troca a chave de upload pela chave do Google: durante a
    // transição as DUAS assinaturas existem em campo. Aceitar só uma faz o app
    // já instalado voltar a mostrar a barra do Chrome, sem erro em lugar nenhum.
    const links = montarAssetLinks(PACOTE, `${FP_A}, ${FP_B}`);
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B]);
  });

  it("ignora entrada vazia e espaço em volta", () => {
    const links = montarAssetLinks(PACOTE, `  ${FP_A} , , ${FP_B}  `);
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B]);
  });

  it("normaliza o fingerprint para maiúsculas", () => {
    // O `keytool` imprime em maiúsculas; um copiar-e-colar de outra ferramenta
    // pode vir em minúsculas. O Android compara byte a byte após normalizar,
    // mas normalizar aqui evita um dia inteiro de "por que não verifica".
    const links = montarAssetLinks(PACOTE, FP_A.toLowerCase());
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual([FP_A]);
  });

  it("devolve lista vazia quando o pacote não está configurado", () => {
    // Ambiente sem TWA (dev local, preview) serve `[]`: JSON válido, semântica
    // explícita de "nenhum app verificado". Inventar um pacote padrão faria a
    // verificação apontar para um app que não é nosso.
    expect(montarAssetLinks(undefined, FP_A)).toEqual([]);
    expect(montarAssetLinks("", FP_A)).toEqual([]);
  });

  it("devolve lista vazia quando não há nenhum fingerprint", () => {
    expect(montarAssetLinks(PACOTE, undefined)).toEqual([]);
    expect(montarAssetLinks(PACOTE, "  ,  ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run "src/app/.well-known/assetlinks.test.ts"
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a rota**

Criar `src/app/.well-known/assetlinks.json/route.ts`:

```ts
import { NextResponse } from "next/server";

/**
 * Digital Asset Links do TWA (#185, Etapa 3).
 *
 * É este arquivo que faz o Android confiar que `irisclinica.ia.br` e o APK
 * assinado com aquele certificado são a mesma entidade. Sem a verificação, a
 * Trusted Web Activity ainda abre — mas com a barra de endereço do Chrome por
 * cima, que é exatamente o que o critério de aceite 3 da spec proíbe.
 *
 * Por que parametrizado por ambiente e não chumbado:
 *
 *  - o fingerprint de release só existe DEPOIS que a conta do Play Console
 *    assina o pacote. Chumbar exigiria um deploy só para publicar na loja;
 *  - com Play App Signing existem DOIS fingerprints válidos ao mesmo tempo (a
 *    chave de upload e a chave do Google). Uma lista fixa de um item derruba a
 *    verificação silenciosamente no dia da troca.
 */
export const dynamic = "force-dynamic";

export interface AssetLink {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * @param pacote `TWA_ANDROID_PACKAGE_NAME` — ex.: `br.ia.irisclinica.twa`.
 * @param fingerprints `TWA_SHA256_FINGERPRINTS` — SHA-256 em hex com dois
 *   pontos, separados por vírgula quando houver mais de um.
 */
export function montarAssetLinks(
  pacote: string | undefined,
  fingerprints: string | undefined,
): AssetLink[] {
  const nome = pacote?.trim();
  if (!nome) return [];

  const lista = (fingerprints ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => f.length > 0);

  if (lista.length === 0) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: nome,
        sha256_cert_fingerprints: lista,
      },
    },
  ];
}

export function GET() {
  const corpo = montarAssetLinks(
    process.env.TWA_ANDROID_PACKAGE_NAME,
    process.env.TWA_SHA256_FINGERPRINTS,
  );

  // O verificador do Android exige `application/json`. Servido como
  // `text/plain` ele falha sem mensagem útil — o sintoma é a barra do Chrome
  // aparecendo, três camadas longe da causa.
  return NextResponse.json(corpo, {
    headers: {
      "Content-Type": "application/json",
      // Curto de propósito: durante a publicação o fingerprint muda e um cache
      // longo prende a verificação quebrada por horas.
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm exec vitest run "src/app/.well-known/assetlinks.test.ts"
pnpm typecheck
```

Esperado: `6 passed`; typecheck limpo.

- [ ] **Step 5: Documentar as variáveis no `.env.example`**

Acrescentar ao fim de `.env.example`:

```dotenv
# --- TWA / Google Play (#185, Etapa 3) -------------------------------------
# Nome do pacote Android do app publicado. Vazio em dev: `/.well-known/
# assetlinks.json` passa a servir `[]`, que é o correto para um ambiente sem
# app na loja.
TWA_ANDROID_PACKAGE_NAME=
# Fingerprints SHA-256 do(s) certificado(s) de assinatura, em hex com dois
# pontos, separados por vírgula. Durante o Play App Signing são DOIS: a chave
# de upload e a chave que o Google usa para reassinar. Extrair com:
#   keytool -list -v -keystore twa/android.keystore -alias android
# e, para a chave do Google, no Play Console em
#   Versão > Configuração > Assinatura de apps.
TWA_SHA256_FINGERPRINTS=
```

- [ ] **Step 6: Escrever o E2E**

Criar `e2e/mobile-assetlinks.spec.ts`:

```ts
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
```

- [ ] **Step 7: Rodar tudo**

```bash
pnpm build
pnpm exec playwright test --project=mobile-360 e2e/mobile-assetlinks.spec.ts
pnpm lint
pnpm test
```

Esperado: `1 passed` no spec novo; lint e suíte unitária verdes.

- [ ] **Step 8: Commit**

```bash
pnpm exec prettier --write "src/app/.well-known/assetlinks.json/route.ts" "src/app/.well-known/assetlinks.test.ts" e2e/mobile-assetlinks.spec.ts .env.example
git add "src/app/.well-known" e2e/mobile-assetlinks.spec.ts .env.example
git commit -m "feat(twa): serve assetlinks.json parametrizado por ambiente, issue #185"
```

---

### Task 2: Projeto Bubblewrap e `.aab` de desenvolvimento

Entrega: `twa/twa-manifest.json` versionado, keystore de desenvolvimento gerada localmente (fora do Git), `.aab` compilado, fingerprint extraído e o app verificando contra produção.

**Files:**

- Modify: `.gitignore`
- Create: `twa/twa-manifest.json` (gerado pelo Bubblewrap, depois versionado)
- Create: `twa/README.md`

**Interfaces:**

- Consumes: `/manifest.webmanifest` da Etapa 2 (`start_url`, `scope`, `theme_color`, ícones); `TWA_ANDROID_PACKAGE_NAME` da Task 1.
- Produces: o valor do fingerprint SHA-256 de desenvolvimento — vai para `TWA_SHA256_FINGERPRINTS` no ambiente onde se quiser testar a verificação.

- [ ] **Step 1: Blindar o `.gitignore` ANTES de gerar chave**

Acrescentar ao `.gitignore`:

```gitignore
# TWA / Bubblewrap (#185, Etapa 3)
# Chave privada de assinatura — NUNCA versionar. Quem tiver este arquivo mais a
# senha pode publicar uma atualização do app no lugar da gente.
twa/*.keystore
twa/*.jks
twa/android.keystore.passwords
# Artefatos de build e projeto Android gerado (reconstruíveis a partir do
# twa-manifest.json).
twa/app/
twa/build/
twa/.gradle/
twa/gradle/
twa/gradlew
twa/gradlew.bat
twa/*.aab
twa/*.apk
twa/*.idsig
twa/store_icon.png
```

Commitar **esta mudança sozinha, primeiro**:

```bash
git add .gitignore
git commit -m "chore(twa): ignora chave de assinatura e artefatos do Bubblewrap, issue #185"
```

- [ ] **Step 2: Conferir os pré-requisitos**

```bash
java -version
pnpm dlx @bubblewrap/cli doctor
```

Esperado: JDK 17 (o Bubblewrap recusa JDK mais novo em algumas versões — se recusar, ele diz qual quer). O `doctor` provisiona JDK e Android SDK em `~/.bubblewrap` quando faltam; aceitar.

Se `java` não existir na máquina: instalar o Temurin 17 e rodar `doctor` de novo. Não seguir com `doctor` reprovado — o `build` falha 10 minutos depois com erro de Gradle que não aponta para isso.

- [ ] **Step 3: Gerar a keystore de desenvolvimento**

```bash
mkdir -p twa
keytool -genkeypair \
  -alias android \
  -keystore twa/android.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Iris Desenvolvimento, O=R Sutil Correa Ltda, C=BR"
```

O `keytool` pede a senha duas vezes. **Esta chave é de desenvolvimento**: serve para instalar e verificar num aparelho, não para publicar. A chave de release é criada pelo Rômulo no fluxo do runbook da Task 3.

Confirmar que ela ficou fora do Git:

```bash
git check-ignore -v twa/android.keystore
```

Esperado: uma linha citando `.gitignore` e a regra `twa/*.keystore`. **Se não imprimir nada, parar** — a regra não pegou (negação em `.gitignore` não vence exclusão de diretório ancestral) e a chave entraria no próximo `git add`.

- [ ] **Step 4: Extrair o fingerprint**

```bash
keytool -list -v -keystore twa/android.keystore -alias android | grep "SHA256:"
```

Copiar o valor (hex com dois pontos, 32 grupos). Anotar — vai para `TWA_SHA256_FINGERPRINTS`.

- [ ] **Step 5: Inicializar o projeto Bubblewrap**

```bash
cd twa
pnpm dlx @bubblewrap/cli init --manifest=https://irisclinica.ia.br/manifest.webmanifest
```

Respostas ao questionário interativo:

| Pergunta                         | Resposta                                                |
| -------------------------------- | ------------------------------------------------------- |
| Domain                           | `irisclinica.ia.br`                                     |
| URL path                         | `/`                                                     |
| Application name                 | `Iris — Governança Clínica`                             |
| Short name                       | `Iris`                                                  |
| Application ID                   | `br.ia.irisclinica.twa`                                 |
| Display mode                     | `standalone`                                            |
| Orientation                      | `portrait`                                              |
| Status bar color                 | `#f2b705`                                               |
| Splash screen color              | `#f8f9fa`                                               |
| Icon URL                         | `https://irisclinica.ia.br/icons/icon-512.png`          |
| Maskable icon URL                | `https://irisclinica.ia.br/icons/icon-maskable-512.png` |
| Include support for Play Billing | `No`                                                    |
| Request geolocation permission   | `No`                                                    |
| Key store location               | `./android.keystore`                                    |
| Key name                         | `android`                                               |

⚠️ O `Application ID` respondido aqui tem de ser **idêntico** ao valor de `TWA_ANDROID_PACKAGE_NAME` no ambiente de produção. Divergência é o defeito nº 1 de verificação de TWA, e o sintoma é apenas a barra do Chrome aparecendo.

- [ ] **Step 6: Compilar o `.aab`**

```bash
pnpm dlx @bubblewrap/cli build
cd ..
```

Esperado: `twa/app-release-bundle.aab` e `twa/app-release-signed.apk` gerados.

- [ ] **Step 7: Verificar que só o manifesto entrou no Git**

```bash
git status --porcelain twa/
```

Esperado: **apenas** `?? twa/twa-manifest.json` (e `twa/README.md` depois do próximo passo). Se aparecer `.keystore`, `.aab`, `app/` ou `gradlew`, o `.gitignore` do Step 1 está incompleto — corrigir antes de qualquer `git add`.

- [ ] **Step 8: Escrever o runbook local**

Criar `twa/README.md`:

````markdown
# TWA do Iris — projeto Bubblewrap

Empacota o PWA do Iris como app Android (Trusted Web Activity) para a Google
Play Store. Issue #185, Etapa 3.

## O que está versionado

Só `twa-manifest.json` e este README. Tudo mais — projeto Gradle, `.aab`,
`.apk`, e principalmente a **keystore** — fica fora do Git (ver `.gitignore` na
raiz). Quem tiver a keystore e a senha pode publicar uma atualização do app no
lugar da gente.

## Reconstruir do zero

Pré-requisitos: JDK 17 e `pnpm dlx @bubblewrap/cli doctor` verde.

​```bash
cd twa

# 1. Keystore de DESENVOLVIMENTO (a de release é criada no Play Console —

# ver docs/arquitetura/publicacao-play-store.md)

keytool -genkeypair -alias android -keystore android.keystore \
-keyalg RSA -keysize 2048 -validity 10000 \
-dname "CN=Iris Desenvolvimento, O=R Sutil Correa Ltda, C=BR"

# 2. Regenerar o projeto Android a partir do twa-manifest.json versionado

pnpm dlx @bubblewrap/cli update

# 3. Compilar

pnpm dlx @bubblewrap/cli build
​```

## Extrair o fingerprint SHA-256

​`bash
keytool -list -v -keystore android.keystore -alias android | grep "SHA256:"
​`

O valor vai para a variável de ambiente `TWA_SHA256_FINGERPRINTS` do ambiente
que se quer verificar. Ele é lido por
`src/app/.well-known/assetlinks.json/route.ts`.

## Instalar num aparelho para testar

​`bash
adb install -r app-release-signed.apk
​`

## Como saber que a verificação funcionou

Abrir o app no aparelho. **Sem barra de endereço do Chrome no topo** = o
Android leu `https://irisclinica.ia.br/.well-known/assetlinks.json`, achou o
`package_name` e o fingerprint deste APK, e confiou.

**Com barra** = a verificação falhou. Diagnóstico, nesta ordem:

1. `curl -s https://irisclinica.ia.br/.well-known/assetlinks.json` — devolveu
   `[]`? As variáveis de ambiente não estão setadas em produção.
2. O `package_name` do JSON bate com o `packageId` do `twa-manifest.json`?
3. O fingerprint do JSON bate com o do `keytool -list` DESTE APK?
4. O `content-type` é `application/json`?

Um `[]` servido com 200 é indistinguível de sucesso para quem só olha o status
HTTP. Sempre ler o corpo.
````

Remover o caractere zero-width dos blocos `​```bash` ao colar.

- [ ] **Step 9: Versionar**

```bash
pnpm exec prettier --write twa/README.md twa/twa-manifest.json
git add twa/twa-manifest.json twa/README.md
git commit -m "feat(twa): projeto Bubblewrap e runbook de build do .aab, issue #185"
```

- [ ] **Step 10: Verificar a cadeia inteira num aparelho**

Pré-requisito: setar, no ambiente de produção (Easypanel → serviço do app → Ambiente), as duas variáveis com o `packageId` e o fingerprint dos Steps 4 e 5, e clicar em **Implantar** (salvar não aplica).

```bash
curl -s https://irisclinica.ia.br/.well-known/assetlinks.json
adb install -r twa/app-release-signed.apk
```

Esperado: o `curl` devolve um array com um objeto contendo o `package_name` e o fingerprint; o app abre em tela cheia, **sem** a barra de endereço do Chrome.

Se abrir com barra, seguir o diagnóstico de 4 passos do `twa/README.md`.

⚠️ O painel do Easypanel roda em HTTP e mostra os segredos em claro — não tirar screenshot da tela de ambiente.

---

### Task 3: Runbook do Google Play Console

Entrega: o documento que o Rômulo executa para publicar, com a fronteira explícita entre o que já está pronto e o que depende dele.

**Files:**

- Create: `docs/arquitetura/publicacao-play-store.md`
- Modify: `README.md` (mapa de docs)
- Modify: `BACKLOG.md` (registro do que ficou fora do escopo)

**Interfaces:**

- Consumes: `twa/README.md` (Task 2); `TWA_SHA256_FINGERPRINTS` (Task 1).
- Produces: nada de código.

- [ ] **Step 1: Escrever o runbook**

Criar `docs/arquitetura/publicacao-play-store.md`:

````markdown
# Publicação do Iris na Google Play Store (TWA)

> Origem: issue #185, Etapa 3. Escopo desta issue termina no `.aab` de
> desenvolvimento; o que está abaixo é o que só o Rômulo pode executar.

## O que já está pronto no repositório

| Peça                                                   | Onde                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| Manifesto PWA (`display: standalone`, ícones maskable) | `src/app/manifest.ts`                          |
| Service Worker e página offline                        | `public/sw.js`, `src/app/offline/page.tsx`     |
| Digital Asset Links parametrizado por ambiente         | `src/app/.well-known/assetlinks.json/route.ts` |
| Projeto Bubblewrap e build do `.aab`                   | `twa/`, runbook em `twa/README.md`             |

## O que depende de você

### 1. Conta de desenvolvedor

1. Acesse `https://play.google.com/console/signup`.
2. Escolha **conta de organização** (não pessoal) e informe
   **R Sutil Correa Ltda — CNPJ 29.811.201/0001-50**. Conta pessoal não pode ser
   convertida em organização depois; refazer significa perder o histórico do app.
3. Pague a taxa única de US$ 25.
4. A verificação de identidade da organização leva alguns dias úteis. Só depois
   dela é possível criar o app.

**Como saber que deu certo:** o Play Console abre com o nome da empresa no
canto superior e o botão **Criar app** está habilitado.

### 2. Criar o app

1. Play Console → **Criar app**.
2. Nome: `Iris — Governança Clínica`. Idioma padrão: **Português (Brasil)**.
3. Tipo: **App**. Gratuito ou pago: **Gratuito** (a cobrança é por assinatura no
   site, fora da loja).
4. Aceite as declarações de diretrizes e de leis de exportação.

**Como saber que deu certo:** o app aparece na lista com o status
"Rascunho" e um `Application ID` sugerido.

### 3. Ativar o Play App Signing e obter o segundo fingerprint

1. No app criado: **Versão → Configuração → Assinatura de apps**.
2. Escolha **deixar o Google gerar e gerenciar a chave** (Play App Signing).
   Isso significa que o `.aab` que você envia é assinado com a sua chave de
   _upload_, e o Google reassina com a chave _dele_ antes de distribuir.
3. Nessa mesma tela, copie o **certificado de assinatura de apps → SHA-256**.

⚠️ **Este é o passo que mais quebra a verificação.** A partir daqui existem
**dois** fingerprints válidos: o da sua chave de upload e o da chave do Google.
Os dois têm de estar no `assetlinks.json`, separados por vírgula.

### 4. Publicar os dois fingerprints em produção

1. Easypanel → serviço do app Iris → **Ambiente**.
2. Setar:
   - `TWA_ANDROID_PACKAGE_NAME` = o Application ID do app (ex.:
     `br.ia.irisclinica.twa`)
   - `TWA_SHA256_FINGERPRINTS` = `<fingerprint da chave de upload>,<fingerprint da chave do Google>`
3. Clique em **Implantar**. Salvar sozinho **não** aplica a variável.

**Como saber que deu certo:**

​`bash
curl -s https://irisclinica.ia.br/.well-known/assetlinks.json
​`

Deve devolver um array com **um** objeto cujo `sha256_cert_fingerprints` tem
**dois** itens. Um `[]` significa que as variáveis não chegaram no container.

⚠️ O painel do Easypanel roda em HTTP e exibe todos os segredos de produção em
claro. Não tire screenshot dessa tela.

### 5. Gerar e enviar o `.aab` de release

A keystore de release é **sua** e não pode ser perdida: sem ela não há como
publicar atualização do app, e a única saída é publicar um app novo com outro
Application ID. Guarde num gerenciador de senhas, não na máquina de trabalho.

​`bash
cd twa
keytool -genkeypair -alias upload -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=R Sutil Correa Ltda, O=R Sutil Correa Ltda, C=BR"
​`

Aponte `twa-manifest.json` (campos `signingKey.path` e `signingKey.alias`) para
essa chave, rode `pnpm dlx @bubblewrap/cli build` e envie
`app-release-bundle.aab` em **Versão → Produção → Criar nova versão**.

### 6. Ficha da loja

Você precisa preparar, como Product Designer:

- Ícone da loja 512×512 (pode reaproveitar `public/icons/icon-512.png`).
- Gráfico de destaque 1024×500.
- No mínimo 2 screenshots de celular (o Play aceita capturas do próprio app
  rodando no aparelho).
- Descrição curta (80 caracteres) e completa (4.000).
- Política de privacidade: apontar para `https://irisclinica.ia.br/privacidade`.

### 7. Questionário de segurança de dados

O Play exige declarar o que o app coleta. O Iris trata **dado pessoal
sensível de saúde**; a ficha tem de refletir a
`docs/legal/politica-privacidade.md`, não uma versão simplificada.

⚠️ Esta seção produz afirmação pública sobre tratamento de dado de saúde.
Trate como material jurídico: leia com o Rômulo antes de enviar, do mesmo modo
que os documentos de `docs/legal/`. **Não** preencher por dedução a partir do
código.

## Definição de pronto da publicação

- [ ] `curl` de `/.well-known/assetlinks.json` devolve os dois fingerprints.
- [ ] App instalado da loja abre **sem** a barra de endereço do Chrome.
- [ ] Keystore de release guardada em gerenciador de senhas, fora da máquina.
- [ ] Ficha de segurança de dados lida e aprovada pelo Rômulo.
````

Remover o caractere zero-width dos blocos `​```bash` ao colar.

- [ ] **Step 2: Registrar no mapa de docs**

Em `README.md`, na tabela do mapa de documentação, acrescentar:

```markdown
| Publicar o app Android na Play Store (TWA) | `docs/arquitetura/publicacao-play-store.md` |
```

- [ ] **Step 3: Registrar o que ficou fora do escopo**

Em `BACKLOG.md`, acrescentar uma entrada na seção de itens em aberto:

```markdown
- **Publicação na Google Play Store (#185, Etapa 3)** — bloqueado em ação do
  Rômulo: criar conta de organização no Play Console (US$ 25, verificação de
  alguns dias úteis) e gerar a keystore de release. Todo o código está pronto e
  medido; o runbook é `docs/arquitetura/publicacao-play-store.md`. O `.aab`
  gerado por esta issue é assinado com keystore de desenvolvimento e serve só
  para instalar via `adb`.
```

- [ ] **Step 4: Rodar a suíte inteira uma última vez**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test
```

Esperado: tudo verde, contagens conferidas.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write docs/arquitetura/publicacao-play-store.md README.md BACKLOG.md
git add docs/arquitetura/publicacao-play-store.md README.md BACKLOG.md
git commit -m "docs(twa): runbook de publicação na Play Store e registro do bloqueio, issue #185"
```

---

## Definição de Pronto — Etapa 3

- [ ] `pnpm exec vitest run "src/app/.well-known/assetlinks.test.ts"` verde com 6 testes contados.
- [ ] `git check-ignore -v twa/android.keystore` imprime a regra que a ignora (medido, não presumido).
- [ ] `git status --porcelain twa/` mostra apenas `twa-manifest.json` e `twa/README.md`.
- [ ] `.aab` e `.apk` gerados por `pnpm dlx @bubblewrap/cli build`.
- [ ] App instalado por `adb install` abre **sem** a barra do Chrome, com `TWA_SHA256_FINGERPRINTS` setado em produção.
- [ ] `curl` de `/.well-known/assetlinks.json` em produção devolve o corpo (lido, não só o status 200).
- [ ] `package.json` sem dependência nova.
- [ ] Bloqueio de publicação registrado em `BACKLOG.md`.
