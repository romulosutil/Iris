# Design Spec — Responsividade Mobile, PWA & Publicação Android (TWA Play Store)

> **Status:** 🟢 Especificação Inicial  
> **Data:** 03/08/2026  
> **Autor:** Rômulo Sutil & Agente Antigravity

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Psicólogos, terapeutas e gestores realizam atendimentos e registros diários via smartphones e tablets durante sessões clínicas ou deslocamentos. A experiência mobile precisa ser impecável e fluida tanto na landing page pública quanto no aplicativo logado (`/pacientes`, `/diario`, `/agenda`, `/relatorios`). Além disso, a presença na Google Play Store via aplicativo Android nativo aumenta o canal de aquisição e usabilidade.

### 1.2 A Solução

1. **Responsividade & Mobile UX:** Ajustar o visual de todas as páginas públicas (Landing Page) e da área autenticada do Iris para telas pequenas ($< 768\text{px}$), incluindo navegação adaptativa (Bottom Bar / Drawer), formulários de toque otimizados e tabelas adaptativas em cards.
2. **PWA (Progressive Web App):** Configuração de `manifest.json`, Service Worker para navegação offline/cache estático e ícones responsivos no Next.js App Router.
3. **TWA (Trusted Web Activity - Android Play Store):** Empacotamento do PWA usando `bubblewrap` da Google para gerar o pacote `.aab` (Android App Bundle), com verificação `/.well-known/assetlinks.json` para rodar full-screen sem barra de navegador.

---

## 2. Escopo Técnico & Etapas

### Etapa 1: Responsividade e Layout Mobile (Landing Page + Área Logada)

- **Landing Page (`/` e `#seguranca`):** Menu hambúrguer animado, grid de 1 coluna em mobile, tipografia fluida com `clamp()`, CTAs responsivos com toque $\ge 48\text{px}$.
- **Área Autenticada (`/app/*`):**
  - **Navegação Mobile:** Substituição da Sidebar desktop por Bottom Navigation Bar em telas de celular.
  - **Tabelas Clínicas & Listas:** Renderização condicional de tabelas densas como cards em telas pequenas.
  - **Editor de Diário e Metas:** Otimização para teclado virtual (evitando sobreposição de botões de salvar/extracção por IA).

### Etapa 2: Configuração PWA Completa

- `src/app/manifest.ts`: Definição de `name`, `short_name`, `start_url: "/app"`, `display: "standalone"`, `theme_color`, `background_color`, ícones (192x192, 512x512, maskable).
- Service Worker com Next-PWA ou `sw.js` nativo para cache de assets e página offline amigável.

### Etapa 3: Empacotamento TWA (Google Play Store)

- Servir `/.well-known/assetlinks.json` com o SHA-256 da chave de assinatura do app Android.
- Geração do projeto Android via `@bubblewrap/cli`.
- Compilação do pacote `.aab` pronto para upload no Google Play Console.

---

## 3. Critérios de Aceite

1. **Responsividade:** 0 estouros de layout horizontal em viewports a partir de $360\text{px}$ (iPhone SE / celulares Android compactos).
2. **Lighthouse Mobile Score:** $\ge 90$ em PWA, Performance e Acessibilidade em simulação mobile (Moto G4 / 4G desacelerado).
3. **TWA Android:** Instalação e execução limpa sem barra de navegação do Chrome no celular Android físico e simulador.

---

## 4. Decisões Ratificadas (27/08/2026)

> Levantamento do estado real do código antes do planejamento mostrou que quatro
> premissas da §2 estavam desatualizadas ou em conflito com o corpo da issue
> #185. As decisões abaixo foram ratificadas com o Rômulo e **prevalecem** sobre
> o texto acima. Os planos de implementação argumentam a partir desta seção.

### D1 — Navegação mobile: Bottom Bar **somando-se** ao Drawer

A §2 fala em "substituição da Sidebar desktop por Bottom Navigation Bar". **O app
logado nunca teve sidebar**: `src/app/(app)/layout.tsx` monta um `Header` com
faixa de navegação horizontal em `≥ 640px` e um `Drawer` lateral abaixo disso
(`src/components/ui/header.tsx:239-329`).

Decisão: **acrescentar** uma Bottom Navigation Bar com 4 destinos + slot de menu
abaixo de `sm` (640px), mantendo o `Drawer`. O hambúrguer do topo é aposentado
nesse breakpoint e o 5º slot da barra passa a ser o gatilho do `Drawer`.

Por quê: o coordenador tem 9 destinos de navegação e o terapeuta 6 — não cabem
numa barra inferior. Substituir o `Drawer` exigiria repensar a arquitetura de
informação inteira, que é outra issue.

Os 4 destinos são **os 4 primeiros de `itemsNav`**, que `AppLayout` já monta em
ordem de prioridade por papel. Não há segunda lista de configuração: ela seria
mais um lugar para esquecer de atualizar quando um papel novo nascer, com modo
de falha silencioso (barra vazia).

### D2 — Piso de viewport: **360px**

O corpo da issue #185 diz 320px; a §3 desta spec diz 360px. Vale **360px**.

Por quê: nenhum aparelho em circulação entrega 320px CSS (o menor Android
relevante é a linha Galaxy A, em 360). Cada pixel a menos no piso cobra ajuste
de layout em tabela clínica densa sem público que o justifique.

### D3 — Service Worker escrito à mão, com allowlist

A §2 admitia "Next-PWA ou `sw.js` nativo". Vale **`sw.js` à mão**, ~90 linhas,
sem dependência nova.

Por quê: `@serwist/next` (sucessor do `next-pwa`) cacheia rota de aplicação por
padrão. Neste produto isso é incidente LGPD, não configuração agressiva — a
resposta de `/pacientes` carrega nome de criança e conteúdo clínico.
Reconfigurar a biblioteca para não fazer o que ela faz por padrão custa mais
atenção permanente do que manter o arquivo próprio, e uma atualização menor pode
reintroduzir o padrão sem que ninguém note.

A política é **allowlist**, nunca denylist: rota nova nasce fora do cache por
construção.

Correção relacionada: a §2 propõe `start_url: "/app"`. **Essa rota não existe**
neste repo. Vale `start_url: "/"` — `src/app/page.tsx:20` já redireciona quem tem
sessão para `/agenda` e serve a landing para quem não tem.

### D4 — Etapa 3 entrega até o `.aab` de desenvolvimento

Publicar exige conta de organização no Google Play Console (US$ 25 + verificação
de alguns dias úteis) e keystore de release — ambos atos exclusivos do Rômulo.

Decisão: a implementação entrega projeto Bubblewrap versionado, `assetlinks.json`
parametrizado por ambiente, `.aab` assinado com keystore **de desenvolvimento** e
um runbook do Play Console. A publicação em si fica registrada como bloqueio no
`BACKLOG.md`.

Por quê: destrava a engenharia agora, sem prender três etapas de trabalho a um
prazo de verificação de conta.

### Planos de implementação

| Etapa              | Plano                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| 1 — Responsividade | `docs/superpowers/plans/2026-08-27-185-etapa1-responsividade-mobile.md`       |
| 2 — PWA            | `docs/superpowers/plans/2026-08-27-185-etapa2-pwa-manifest-service-worker.md` |
| 3 — TWA            | `docs/superpowers/plans/2026-08-27-185-etapa3-twa-android-play-store.md`      |
