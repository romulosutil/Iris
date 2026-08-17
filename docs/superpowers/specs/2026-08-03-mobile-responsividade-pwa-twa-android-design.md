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
