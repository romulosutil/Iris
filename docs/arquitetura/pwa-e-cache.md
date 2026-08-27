# PWA do Iris — política de cache e medição

> Origem: issue #185, Etapa 2. Decisões ratificadas em 27/08/2026.

## Por que o Service Worker é escrito à mão

`@serwist/next` (sucessor do `next-pwa`) cacheia rota de aplicação por padrão.
Neste produto isso é incidente LGPD, não configuração agressiva: a resposta de
`/pacientes` carrega nome de criança e conteúdo clínico. Reconfigurar a
biblioteca para não fazer o que ela faz por padrão custa mais atenção
permanente do que manter 90 linhas próprias — e uma atualização menor da
biblioteca pode reintroduzir o padrão sem que ninguém note.

`public/sw.js` tem ~90 linhas e nenhuma dependência.

## A política, em uma frase

Só asset estático entra em cache. Tudo mais vai direto à rede e o Service
Worker nem intercepta.

### Allowlist (o que É cacheável)

| Padrão                                | Por quê                                             |
| ------------------------------------- | --------------------------------------------------- |
| `/_next/static/**`                    | Bundle e CSS com hash no nome — imutável, sem dado. |
| `/fonts/**`, `/icons/**`, `/brand/**` | Asset de marca, sem dado.                           |
| `/manifest.webmanifest`, `/icon.svg`  | Metadados de instalação.                            |

Só método `GET`, só mesma origem, só resposta `200` completa.

### O que NUNCA entra

Tudo o mais, por construção — é allowlist, não denylist. Em particular:
`/api/**`, `/_next/data/**` (payload de rota, carrega dado de paciente), e toda
navegação (`request.mode === "navigate"`).

Navegação usa rede-primeiro com fallback para `/offline`; a resposta de rede
não é gravada em momento nenhum.

### `/offline`

Página `force-static`, sem nenhuma leitura de banco. Ela vive no cache do
aparelho, fora de sessão e de RLS: qualquer conteúdo dinâmico ali seria dado
clínico persistido em claro no dispositivo.

## Como isso é vigiado

- `src/app/sw.test.ts` executa o `public/sw.js` **real** num sandbox `node:vm`
  e afirma a allowlist. Um guard escrito contra uma cópia em TS passaria verde
  enquanto o arquivo servido divergisse. (O `vm.createContext` precisa incluir
  `URL` explicitamente — sem herdar os globais do Node, `new URL(...)` dentro
  do SW estoura e `podeCachear` cai no `catch`, devolvendo `false` para tudo;
  os testes de allowlist NEGATIVA passariam por vacuidade nesse cenário.)
- `e2e/mobile-pwa.spec.ts` inspeciona o `CacheStorage` do navegador depois de
  uma sessão autenticada em `/pacientes`. Ele faz as duas provas: que o cache
  recebeu asset estático (senão o teste passaria por vacuidade) e que nenhuma
  rota de app entrou.

## Medição de Lighthouse (mobile)

Medido em `http://localhost:3000/` (porta 3988 nesta execução) com
`next start`, form factor mobile, Chrome headless local.

| Data       | Performance | Acessibilidade | Boas práticas | SEO |
| ---------- | ----------- | -------------- | ------------- | --- |
| 27/08/2026 | 52          | 96             | 77            | 100 |

**Performance (52) abaixo do critério de aceite (≥90).** Maior oportunidade:
LCP em 7,6s. Medição feita em máquina de desenvolvimento local (Windows,
`next start` sem CDN, sem cache de borda, com throttling do Lighthouse) — não
é o ambiente de produção (VPS + Easypanel), mas o número real e a causa
principal ficam registrados em vez de silenciados:

- LCP (0.04): 7,6s — maior oportunidade isolada.
- FCP (0.43): 3,2s.
- TBT (0.5): 590ms.
- Speed Index (0.67): 4,8s.
- CLS (1.0): 0 — sem layout shift, ponto positivo.

Hipótese não verificada (não investigada nesta etapa): landing page carrega
seções pesadas (`LandingBentoGrid`, `LandingComparativeMatrix`,
`LandingRoiCalculator`) acima da dobra sem paralelismo de streaming; medir de
novo depois de deploy em produção antes de otimizar às cegas.

**Boas práticas (77) abaixo do critério.** Dois achados:

- `third-party-cookies` (score 0): 8 cookies de terceiro encontrados —
  Google Analytics e Clarity, ambos já esperados neste produto (consentimento
  tratado em `docs/legal/`); não é um defeito novo, é o audit acusando
  telemetria de terceiro por padrão.
- `inspector-issues` (score 0): há entradas no painel Issues do Chrome
  DevTools na carga da landing — não investigado nesta etapa; próxima pessoa
  a mexer aqui deve abrir `--view` do relatório HTML e ler a aba Issues antes
  de assumir a causa.

Não há gate de Lighthouse em CI: a métrica varia com a máquina do runner e
viraria vermelho crônico sem defeito. A medição é feita à mão e registrada
nesta tabela a cada mudança relevante de bundle. Os artefatos
(`lighthouse-mobile.report.json`/`.html`) não vão para o repositório —
regenerar com o comando abaixo quando precisar re-auditar.

Comando:

```bash
pnpm build && BYPASS_MFA_FOR_DEV=false node ./node_modules/next/dist/bin/next start --port 3988
pnpm dlx lighthouse http://localhost:3988/ --form-factor=mobile \
  --screenEmulation.mobile --only-categories=performance,accessibility,best-practices,seo \
  --output=html --output-path=./lighthouse-mobile --chrome-flags="--headless=new"
```

`BYPASS_MFA_FOR_DEV=false` é necessário só se o `.env` local tiver a flag
ligada — `next start` roda com `NODE_ENV=production` e `assertMfaBypassSafe`
derruba o boot se a flag estiver ativa (guardrail de segurança, não bug desta
medição).
