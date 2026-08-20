---
name: Iris
description: SaaS para clínicas de terapia infantil (TEA) — Design System Espectro Brutal
colors:
  primary: "#F2B705"
  primary-hover: "#D29E04"
  primary-tint: "#FFF6DB"
  canvas: "#F8F9FA"
  surface: "#FFFFFF"
  border-brutal: "#000000"
  text-primary: "#09090B"
  text-secondary: "#71717A"
  status-success: "#059669"
  status-success-bg: "#ECFDF5"
  status-ia: "#6A4C93"
  status-ia-bg: "#F1E9F6"
  status-info: "#2563EB"
  status-info-bg: "#EFF6FF"
  status-error: "#DC2626"
  status-error-bg: "#FEF2F2"
  focus-ring: "#2274A5"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontWeight: 700
    lineHeight: "1.1"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0.01em"
  mono:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontWeight: 400
rounded:
  xs: "3px"
  sm: "4px"
  control: "5px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  2xl: "12px"
  pill: "999px"
spacing:
  control-sm: "44px"
  control-md: "48px"
  control-lg: "56px"
  card-sm: "12px"
  card-md: "16px"
  card-lg: "20px"
  card-xl: "24px"
  container: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.border-brutal}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.border-brutal}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
---

# Design System: Iris (Espectro Brutal)

## Overview

**Creative North Star: "Espectro Brutal (Honestidade Epistêmica)"**

O Iris é um SaaS para clínicas de terapia infantil (foco em intervenção para TEA) operado por dois públicos profissionais sob pressão: o terapeuta (mobile-first, uma mão, corredor de clínica, atenção interrompida) e o coordenador (desktop, validação de evidências por exceção).

O conceito "Espectro Brutal" adota o neobrutalismo não como tendência decorativa, mas como metáfora de integridade de dados: uma interface transparente que expõe a estrutura, diferencia o fato da hipótese e se recusa a maquiar incerteza como certeza. O ouro (símbolo do infinito autista, Au) atua como acento primário de ação, enquanto a régua espectro arco-íris é reservada exclusivamente para a assinatura da marca.

**Key Characteristics:**

- **Honestidade Epistêmica:** Tratamento visual estruturalmente diferente entre "sugestão da IA" (inset/violeta/tracejado) e "fato aprovado" (elevado/menta/sólido).
- **Fricção Tátil Útil:** A profundidade (sombras 2px/4px e deslocamento no clique) funciona como indicador de peso e confirmação da decisão clínica.
- **Ergonomia sob Pressão:** Alvo de toque de no mínimo 44px (`--control-sm`), fundo `#F8F9FA` anti-glare e tipografia de alto contraste para leitura veloz.
- **Dois Modos de Temperatura:** Modo Clínico (densidade e impacto cheio de 4px) vs. Modo Família (densidade reduzida e deslocamento suave de 2px).

## Colors

A paleta é estruturada em papéis semânticos estritos, garantindo conformidade WCAG 2.1 AA (com foco em AAA nos pares principais).

### Primary

- **Ouro Brutal (`#F2B705`)**: Cor primária da marca e de ações principais (borda preta, texto preto `#000000`, contraste 8:1).
- **Ouro Hover (`#D29E04`)**: Estado de interatividade / foco ativo.
- **Ouro Tint (`#FFF6DB`)**: Fundo sutil de destaque e contêineres de marca.

### Neutral

- **Canvas App (`#F8F9FA`)**: Fundo off-white que reduz o glare em telas sob luz solar/corredor.
- **Superfície Card (`#FFFFFF`)**: Fundo dos cards e contêineres de informação.
- **Tinta Primária (`#09090B`)**: Texto de corpo e títulos de alto contraste.
- **Tinta Secundária (`#71717A`)**: Legendas e textos auxiliares.
- **Borda Brutal (`#000000`)**: Preto puro em 1-2 elementos âncora; grafite `#1A1A1A` nos contornos secundários.

### Status & Evidências

- **Menta / Sucesso (`#059669` / bg `#ECFDF5`)**: Fato aprovado / conquista consolidada.
- **Violeta / Sugestão IA (`#6A4C93` / bg `#F1E9F6`)**: Candidato extraído por IA (minΔE=39 vs outros acentos para daltonismo).
- **Azul / Informação (`#2563EB` / bg `#EFF6FF`)**: Notificações e atalhos contextuais.
- **Terracota / Alerta (`#DC2626` / bg `#FEF2F2`)**: Erros e bloqueios que exigem atenção imediata.

### Named Rules

**The Epistemic Honesty Rule.** Nenhum componente pode exibir o estado "Sugerido pela IA" com a mesma geometria, sombra ou preenchimento de um dado "Aprovado pelo Humano".
**The Spectrum Reserve Rule.** A régua de cores arco-íris é exclusiva do logotipo/brand mark. É proibido usar o espectro arco-íris em componentes cromáticos da UI (botões, cards, badges).

## Typography

A tipografia combina uma fonte display geométrica expressiva para títulos âncora com uma fonte sans-serif limpa para leitura contínua sob estresse.

**Display Font:** Space Grotesk (fallback: system-ui, sans-serif)
**Body Font:** Plus Jakarta Sans (fallback: system-ui, sans-serif)
**Mono Font:** Space Mono (fallback: ui-monospace, monospace)

**Character:** Hierarquia assertiva e direta, otimizada para varredura visual em pé (mobile) ou em listas densas de validação (desktop).

### Hierarchy

- **Display** (Bold 700, `clamp(2rem, 5vw, 3rem)`, line-height 1.1): Títulos de topo e métricas de destaque.
- **Headline** (Bold 700, 1.5rem, line-height 1.2): Cabeçalhos de seção e títulos de cards principais.
- **Title** (SemiBold 600, 1.125rem, line-height 1.3): Subseções e rótulos de tabelas/cards.
- **Body** (Regular 400, 1rem, line-height 1.5, letter-spacing 0.01em): Texto de leitura principal.
- **Label** (Medium 500, 0.875rem, uppercase/tracking 0.05em): Rótulos de formulário, chips e indicadores de estado.

### Named Rules

**The Display Limit Rule.** A fonte Space Grotesk é estritamente proibida em corpos de texto abaixo de 20px ou em parágrafos corridos.

## Layout

O layout segue um modelo adaptativo que prioriza acessibilidade com uma mão no mobile e densidade auditável no desktop.

- **Grid & Containers:** Breakpoints padrão `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`.
- **Rhythm & Density:** Espaçamentos em escala de 4px/8px/16px/24px/32px.
- **Mobile First (Terapeuta):** Controles alinhados à zona do polegar, navegação inferior com altura útil e botões com piso de 44px (`--control-sm`).
- **Desktop (Coordenador):** Tabela de validação por exceção e painéis laterais fixos.

## Elevation & Depth

Profundidade no Espectro Brutal é bidirecional e tátil: superfícies aprovadas LEVANTA-SE com sombras duras sólidas; sugestões da IA AFUNDAM com sombras inset.

### Shadow Vocabulary

- **Elevation 1 (Raise Sutil):** `2px 2px 0 0 #000000` — Botões secundários e cards em repouso.
- **Elevation 2 (Base Brutalista):** `2px 2px 0 0 #000000` — Componentes padrão do Modo Clínico.
- **Elevation 3 (Hover / Destaque):** `4px 4px 0 0 #000000` — Estado de hover em botões primários e cards interativos.
- **Elevation Inset (IA / Candidato):** `inset 0 2px 8px rgba(106, 76, 147, 0.1)` — Superfícies de sugestão da IA.
- **Overlay (Modais):** `0 20px 44px -24px rgba(20, 20, 20, 0.4)` — Modais e diálogos.

### Named Rules

**The Tactile Friction Rule.** Botões e cards primários devem deslocar fisicamente (`translate(2px, 2px)`) e achatar a sombra ao clique para feedback tátil inequívoco.
**The Orthogonal Focus Rule.** O anel de foco (`#2274A5`, 3px, offset 2px) é ortogonal e nunca funde com os estados de hover ou clique.

## Shapes

A linguagem de formas equilibra bordas duras brutalistas (1.5px / 2px) com cantos levemente amaciados (3px a 6px) para evitar frieza mecânica.

- **Border Width:** `--border-brutal-width: 2px` (borda preta sólida ou grafite).
- **Radius Control:** `--radius-control: 5px` (entradas, botões, abas).
- **Radius Surface:** `--radius-md: 6px` (cards e contêineres).
- **Radius Pill:** `--radius-pill: 999px` (chips e badges de estado).

## Components

### Buttons

- **Shape:** Raio de canto 5px (`--radius-control`), borda preta 2px.
- **Primary:** Fundo Ouro (`#F2B705`), texto preto, sombra dura 2px. Hover desloca -1px e expande sombra para 4px. Active desloca +2px e zera sombra.
- **Secondary:** Fundo Branco (`#FFFFFF`), texto preto, borda preta 2px, mesma mecânica de sombra.
- **Tertiary:** Fundo transparente, sem sombra, hover com fundo elevado (`#F1F3F5`).

### Cards / Containers

- **Corner Style:** 6px (`--radius-md`).
- **Background:** `#FFFFFF` sobre canvas `#F8F9FA`.
- **Aprovado:** Borda sólida 2px, elevação 2px.
- **Sugerido IA:** Borda tracejada violeta `#6A4C93`, fundo `#F1E9F6`, sombra inset.

### Inputs / Fields

- **Style:** Fundo `#FFFFFF`, borda 2px grafite/preta, altura 40px/48px.
- **Focus:** Anel de foco azul `#2274A5` de 3px com offset 2px.
- **Error:** Borda terracota `#DC2626`, mensagem com ícone estático + texto literal.

### Status Badges & Chips

- **Style:** Formato pílula (`--radius-pill`), borda 1.5px.
- **Variantes:** Aprovado (Menta), Sugerido (Violeta com ícone Sparkles), Alerta (Terracota), Info (Azul).

### Navigation & Tabs (Header, TabsNav, GovernancaNav)

- **Header Principal:** Item de menu ativo utiliza pill neutra elevada (`--surface-elevated`) com texto em alto contraste, reservando o ouro brutal (`#F2B705`) exclusivamente para botões de ação e alertas de prioridade.
- **Abas de Rota & Governança:** Padrão _underline tabs_ com linha de base sólida (`border-b-2 border-[var(--border-brutal)]`), piso de 44px e badges numéricos discretos (`--radius-pill`) por aba para reduzir cliques exploratórios.

### PageHeader & EmptyState

- **PageHeader:** Hierarquia tipográfica com espaçamento vertical natural; proibido o uso de divisores tracejados decorativos no chrome de layout.
- **EmptyState:** Superfície arejada com borda sutil (`--border-neutral-light`), ilustrações empáticas, ações de próximo passo (botões direcionais) e timestamp informativo para evitar becos sem saída na experiência clínica.

## Do's and Don'ts

### Do:

- **Do** manter a altura dos elementos interativos em no mínimo 44px no mobile.
- **Do** acompanhar toda cor de estado por um ícone e texto explicativo redundante.
- **Do** utilizar `prefers-reduced-motion` para trocar o deslocamento do clique por uma transição instantânea de sombra.
- **Do** testar o contraste de todos os textos para atingir no mínimo 4.5:1 (WCAG AA).

### Don't:

- **Don't** utilizar a régua espectro arco-íris como plano de fundo, borda ou preenchimento de componentes de interface.
- **Don't** usar gradientes roxos, efeitos glassmorphism ou sombras difusas em elementos de tomada de decisão da IA.
- **Don't** ocultar avisos de erro em toasts temporários que somem automaticamente.
- **Don't** utilizar a fonte Space Grotesk em corpos de texto ou legendas secundárias.
