# TWA do Iris — projeto Bubblewrap

Empacota o PWA do Iris como app Android (Trusted Web Activity) para a Google
Play Store. Issue #185, Etapa 3.

## Estado atual (27/08/2026)

**`twa-manifest.json` ainda não existe neste diretório.** Ele só pode ser
gerado rodando `@bubblewrap/cli init` de verdade — o comando é interativo e
provisiona JDK 17 + Android SDK Build Tools na máquina que roda (`~/.bubblewrap`,
alguns GB de download). A sessão que escreveu este runbook não tinha `java` nem
`adb` disponíveis no ambiente, então os Steps 2-10 abaixo (gerar keystore,
inicializar o projeto, compilar o `.aab`, verificar num aparelho) ficaram por
fazer — não por dependerem do Play Console, mas por dependerem de uma máquina
com JDK/Android SDK. Rodar este runbook do início ao fim numa máquina que
tenha (ou aceite instalar) esse ferramental fecha a Etapa 3.

## O que está versionado

Só este README por enquanto. Depois do Step 5 abaixo, `twa-manifest.json`
passa a existir e deve ser commitado junto. Tudo mais — projeto Gradle, `.aab`,
`.apk`, e principalmente a **keystore** — fica fora do Git (ver `.gitignore` na
raiz, já hardened para isso). Quem tiver a keystore e a senha pode publicar uma
atualização do app no lugar da gente.

## Construir do zero

### 1. Pré-requisitos

```bash
java -version
pnpm dlx @bubblewrap/cli doctor
```

Esperado: JDK 17 (o Bubblewrap recusa JDK mais novo em algumas versões — se
recusar, ele diz qual quer). O `doctor` provisiona JDK e Android SDK em
`~/.bubblewrap` quando faltam; aceitar. **Não seguir com `doctor` reprovado** —
o `build` falha minutos depois com erro de Gradle que não aponta para isso.

### 2. Keystore de DESENVOLVIMENTO

A de release é criada pelo Rômulo — ver
`docs/arquitetura/publicacao-play-store.md`.

```bash
cd twa
keytool -genkeypair \
  -alias android \
  -keystore android.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Iris Desenvolvimento, O=R Sutil Correa Ltda, C=BR"
```

O `keytool` pede a senha duas vezes. Confirmar que ficou fora do Git:

```bash
git check-ignore -v twa/android.keystore
```

Esperado: uma linha citando `.gitignore` e a regra `twa/*.keystore`. **Se não
imprimir nada, parar** — a regra não pegou e a chave entraria no próximo
`git add`.

### 3. Extrair o fingerprint

```bash
keytool -list -v -keystore android.keystore -alias android | grep "SHA256:"
```

O valor (hex com dois pontos, 32 grupos) vai para a variável de ambiente
`TWA_SHA256_FINGERPRINTS` do ambiente que se quer verificar. Ele é lido por
`src/app/.well-known/assetlinks.json/route.ts`.

### 4. Inicializar o projeto Bubblewrap

```bash
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

⚠️ O `Application ID` respondido aqui tem de ser **idêntico** ao valor de
`TWA_ANDROID_PACKAGE_NAME` no ambiente de produção. Divergência é o defeito
nº 1 de verificação de TWA, e o sintoma é apenas a barra do Chrome aparecendo.

Depois deste passo, commitar `twa-manifest.json` gerado.

### 5. Compilar o `.aab`

```bash
pnpm dlx @bubblewrap/cli build
```

Esperado: `twa/app-release-bundle.aab` e `twa/app-release-signed.apk`
gerados.

Verificar que só o manifesto entrou no Git:

```bash
git status --porcelain twa/
```

Esperado: **apenas** `?? twa/twa-manifest.json`. Se aparecer `.keystore`,
`.aab`, `app/` ou `gradlew`, o `.gitignore` está incompleto — corrigir antes
de qualquer `git add`.

## Reconstruir depois que `twa-manifest.json` já existir

```bash
cd twa
pnpm dlx @bubblewrap/cli update
pnpm dlx @bubblewrap/cli build
```

## Instalar num aparelho para testar

```bash
adb install -r app-release-signed.apk
```

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
