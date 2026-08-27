# Publicação do Iris na Google Play Store (TWA)

> Origem: issue #185, Etapa 3. Escopo desta issue termina no código pronto e
> medido; o que está abaixo é o que depende de execução fora deste
> repositório — parte em máquina com JDK/Android SDK, parte só do Rômulo.

## O que já está pronto no repositório

| Peça                                                   | Onde                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| Manifesto PWA (`display: standalone`, ícones maskable) | `src/app/manifest.ts`                          |
| Service Worker e página offline                        | `public/sw.js`, `src/app/offline/page.tsx`     |
| Digital Asset Links parametrizado por ambiente         | `src/app/.well-known/assetlinks.json/route.ts` |
| `.gitignore` blindado contra keystore/artefato do TWA  | raiz, seção "TWA / Bubblewrap"                 |
| Runbook do projeto Bubblewrap                          | `twa/README.md`                                |

## O que falta ANTES do Play Console — projeto Bubblewrap

`twa/twa-manifest.json` ainda não existe: ele só nasce rodando
`@bubblewrap/cli init` de verdade, num ambiente com JDK 17 e Android SDK. A
sessão que preparou este runbook não tinha esse ferramental disponível.
Seguir `twa/README.md` do zero, numa máquina que tenha (ou aceite instalar)
JDK/Android SDK, produz:

- `twa/twa-manifest.json` (a commitar);
- `twa/android.keystore` de desenvolvimento (fica fora do Git, é só para
  testar via `adb`, não é a chave de release);
- `twa/app-release-bundle.aab` e `twa/app-release-signed.apk`.

Isso pode ser feito **antes** de abrir conta no Play Console — o `.aab` de
desenvolvimento só precisa do PWA em produção (Etapa 2) para o Bubblewrap ler
`/manifest.webmanifest`.

## O que depende de você (Rômulo)

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

```bash
curl -s https://irisclinica.ia.br/.well-known/assetlinks.json
```

Deve devolver um array com **um** objeto cujo `sha256_cert_fingerprints` tem
**dois** itens. Um `[]` significa que as variáveis não chegaram no container.

⚠️ O painel do Easypanel roda em HTTP e exibe todos os segredos de produção em
claro. Não tire screenshot dessa tela.

### 5. Gerar e enviar o `.aab` de release

A keystore de release é **sua** e não pode ser perdida: sem ela não há como
publicar atualização do app, e a única saída é publicar um app novo com outro
Application ID. Guarde num gerenciador de senhas, não na máquina de trabalho.

```bash
cd twa
keytool -genkeypair -alias upload -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=R Sutil Correa Ltda, O=R Sutil Correa Ltda, C=BR"
```

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

- [ ] `twa/twa-manifest.json` existe e está commitado (pré-requisito de tudo
      abaixo — gerar seguindo `twa/README.md` numa máquina com JDK/Android SDK).
- [ ] `curl` de `/.well-known/assetlinks.json` devolve os dois fingerprints.
- [ ] App instalado da loja abre **sem** a barra de endereço do Chrome.
- [ ] Keystore de release guardada em gerenciador de senhas, fora da máquina.
- [ ] Ficha de segurança de dados lida e aprovada pelo Rômulo.
