# Briefing de Design System — Codinome "Espectro Brutal" (v2)

**Produto:** Iris — SaaS para clínicas de terapia infantil (TEA), Brasil.
**Superfícies:** terapeuta (mobile, corredor, 7-8 sessões/dia), coordenador
(desktop, revisão/validação), responsável pelo paciente (futuro — fast-follow
"portal da família", ainda não iniciado). Nenhum desses três públicos é,
em regra, uma pessoa autista — o paciente é. Este documento corrige a v1, que
tratava acessibilidade sensorial TEA como requisito literal da interface. Não
é: é o paciente quem está no espectro, não quem opera o software.

## 0. O que mudou da v1 e por quê

A v1 pedia um neobrutalismo "mitigado" para sobrecarga sensorial de usuário
autista. Dois problemas: (1) ninguém que toca a UI do Iris hoje é o paciente
— terapeuta e coordenador são profissionais adultos sob pressão de tempo,
não pessoas com hipersensibilidade sensorial a acomodar; (2) mesmo se um dia
o portal da família existir, "responsável de paciente autista" não implica
que o responsável também seja autista. Misturar as duas coisas levava a
decisões erradas — por exemplo, seções inteiras de "redução de estímulo"
que fariam sentido para o paciente mas atrapalham exatamente o profissional
que precisa de alto contraste sob luz de corredor.

A correção não é abandonar o "espectro" como referência — é trocar o motivo.
"TEA" aqui vira **lente conceitual**, não requisito de acessibilidade
sensorial. E o encaixe conceitual certo não é sensorial, é epistêmico: o
diferencial competitivo do Iris (confirmado em `modelo-de-negocio.md` seção
2 — nenhum dos 4 concorrentes pesquisados oferece isso) é rastreabilidade
frase-a-frase e a separação estrita entre evidência e pontuação: a IA nunca
decide sozinha, um "candidato" nunca é tratado como "conquistado", tudo é
auditável até a frase de origem. Neobrutalismo — a estética que expõe a
estrutura em vez de escondê-la atrás de gradiente e sombra suave — é a
metáfora visual certa para ISSO: um produto que se recusa a maquiar
incerteza como certeza. O "brutal" não é sobre o paciente; é sobre o
produto nunca mentir visualmente sobre o que é fato e o que é sugestão.

## 1. Conceito e princípios core

**Princípio-mãe: honestidade visual = honestidade epistêmica do produto.**
Os 5 princípios de UX que já existem em `docs/ux/fluxos-e-wireframes.md`
seção 0 (escritos antes deste briefing, para o produto como um todo) viram
aqui regras de token, não apenas de fluxo:

1. **A IA nunca decide sozinha** → todo estado "sugerida" tem tratamento
   visual estruturalmente diferente de "aprovada" (não é só cor: borda
   tracejada vs. sólida, peso de sombra menor, selo de estado sempre visível
   — nunca a mesma "moldura brutal" para os dois).
2. **Fricção é ferramenta, não bug** → a "sombra dura + deslocamento no
   clique", a assinatura visual do neobrutalismo, é literalmente o
   mecanismo de fricção do produto: aprovação em lote (alta confiança) usa
   deslocamento curto/leve; revisão unitária (baixa confiança/inconsistente)
   usa deslocamento maior e uma etapa de confirmação — a "dureza" do clique
   escala com o risco da decisão, não é decorativa.
3. **O diário nunca se perde** → indicador de estado "salvo localmente"
   é um componente persistente (chip fixo com borda e ícone), nunca um
   toast que desaparece — a interface nunca deixa implícito algo que pode
   sumir.
4. **"Candidato" ≠ "conquistado"** → par de tokens dedicado (ver seção 3.C):
   preenchimento sólido só para o que é fato consolidado; hachura/contorno
   para o que é candidato. Nenhum componente usa a mesma aparência para os
   dois estados.
5. **Transparência sem vigilância** → o que o coordenador vê do terapeuta
   usa exatamente os mesmos componentes que o terapeuta vê de si mesmo —
   nunca uma variante "modo supervisor" com informação escondida.

**Princípios ergonômicos por público (a parte que a v1 errou em atribuir a
sensibilidade sensorial):**

- **Terapeuta** — mobile-first, uma mão, corredor, luz variável, atenção
  interrompida a cada poucos minutos. Isso pede alvo de toque grande (mínimo
  44×44px), alto contraste funcional (não para reduzir estímulo — para
  garantir legibilidade em luz de ambiente incontrolável) e fila de estados
  sem ambiguidade nenhuma, porque não há tempo de reler.
- **Coordenador** — desktop, sessão de revisão mais pausada, tolera mais
  densidade de informação (fila de validação com volume), mas ainda precisa
  de hierarquia visual forte porque o volume é o próprio risco (rubber
  stamping por cansaço de fila longa).
- **Responsável (futuro)** — lê sobre o progresso do próprio filho, em
  contexto emocionalmente carregado. A mesma estrutura "brutal e honesta"
  do produto não deveria chegar até ele com a aspereza clínica do
  componente de terapeuta/coordenador — ver modo "Família" na seção 2.

## 2. Modos dentro de um único sistema de tokens

Não são dois design systems — é o mesmo conjunto de tokens com dois perfis
de "temperatura":

|                             | Modo Clínico (terapeuta/coordenador) | Modo Família (responsável, futuro)             |
| --------------------------- | ------------------------------------ | ---------------------------------------------- |
| Densidade                   | Alta, otimizada para velocidade      | Baixa, otimizada para leitura calma            |
| Peso de sombra/deslocamento | Cheio (4px, conforme seção 3.C)      | Reduzido (2px) — menos "impacto" visual        |
| Acento dominante            | Funcional (estado do dado)           | Emocional/positivo (conquista em destaque)     |
| Tom de copy                 | Direto, técnico, sem eufemismo       | Direto, mas nunca clínico-frio (ver seção 4.C) |

O objetivo do Modo Família não é "acessibilidade TEA" — é calibrar aspereza
para o público certo. Quando o portal da família sair do backlog (seção F),
este modo já existe como variante de tema, não como retrabalho.

## 3. Design Tokens

### A. Paleta de cores

> **Atualização 10/07/2026 — raiz cromática neurodiversidade-afirmativa.**
> A cor primária/de marca passa a ser inspirada nos símbolos da comunidade:
> **infinito dourado** (autismo, Au = ouro) como acento primário e **infinito
> arco-íris** (neurodivergência) como _assinatura de marca_ (brand mark / régua
> fina), **nunca** como chrome de UI. Evitados de propósito: a peça de
> quebra-cabeça (rejeitada pela comunidade) e o vermelho-alarme dela.
>
> **Ressalva (ver §6):** o símbolo é declaração de **valores** (produto alinhado
> ao movimento neurodiversidade-afirmativa), **não** alegação de que o software
> é sensorialmente acessível para autistas — quem opera é profissional
> neurotípico. Marketing não pode fundir as duas coisas.

- **Primária / marca / ação:** **Ouro** `#F2B705` ≈ `oklch(0.80 0.14 85)` —
  preenchimento sólido com **texto e borda pretos** (padrão neobrutalista:
  garante 4.5:1). Substitui a menta como acento de ação.
- **Espectro (assinatura de marca):** 6 stops arco-íris (vermelho→violeta),
  usados só no brand mark / régua fina de identidade — jamais em componentes
  funcionais (mataria a hierarquia e viraria "rainbow slop").
- **Canvas:** `#F8F9FA` (off-white, evita branco puro — reduz glare em tela
  de celular ao ar livre/corredor, relevante para o terapeuta, não é
  "acomodação sensorial").
- **Bordas/texto — hierarquia, não uniformidade:** preto puro `#000000`
  reservado a no máximo 1-2 elementos-âncora por tela (ação primária,
  título); demais bordas em grafite `#1A1A1A`/`#2B2B2B`. Bordas pretas em
  _todo_ elemento criam ruído visual e competem com o próprio objetivo de
  hierarquia que o neobrutalismo deveria estar servindo.
- **Acentos funcionais de estado do dado** (secundários à marca, sempre com
  ícone+texto redundante): **Sucesso/"conquistado":** Menta `#B2DFDB`.
  **Informação:** Azul `#90CAF9`. **Alerta:** Terracota `#EF9A9A` (soft red
  deliberado, não o vermelho-puzzle).
- **Obrigatório:** validar contraste (WCAG AA — 4.5:1 texto, 3:1 UI/bordas)
  de cada par cor-de-fundo + texto/ícone antes de aprovar o token, e checar
  simulação de daltonismo entre os três acentos (protanopia/deuteranopia) —
  "acessível" é um número, não uma alegação de paleta pastel.

### B. Tipografia

- **Display/Títulos:** fonte geométrica pesada (Archivo Black/Space
  Grotesk) — proibida abaixo de ~20px e proibida em corpo de texto corrido;
  função é hierarquia de leitura rápida (terapeuta escaneando em pé), não
  decoração.
- **Body:** Plus Jakarta Sans/Inter, `letter-spacing` levemente aumentado
  (ajuda legibilidade sob leitura apressada), largura de linha entre 45-75
  caracteres, frases curtas e literais em toda a copy de produto (sem
  metáfora/idiomatismo) — isso vale para todos os públicos, é boa prática
  de UX writing sob pressão de tempo ou estresse emocional, não exigência
  ligada a TEA.
- Suporte obrigatório a zoom do navegador até 200% sem quebra de layout
  (WCAG 1.4.4).

### C. Estrutura e elevação (hard shadows)

- Borda fixa 2-3px conforme hierarquia da seção A.
- Sombra brutalista sem blur: `box-shadow: 4px 4px 0px #000000` (Modo
  Clínico) / `2px 2px 0px #000000` (Modo Família).
- **Estados — binário de verdade, corrigindo a ambiguidade da v1:**
  - **Default → Pressed:** o par que usa a metáfora "brutal" (deslocamento
    - redução de sombra ao clique). Peso do deslocamento escala com risco
      da ação (princípio 2 da seção 1).
  - **Focus:** anel de foco ortogonal, cor constante, **nunca** fundido com
    hover ou active — é o único jeito de navegação por teclado ter um
    indicador confiável. Fundir focus com o clique "brutal" (como a v1
    pedia implicitamente ao listar 4 estados soltos) quebra a
    hiperprevisibilidade que o próprio sistema promete.
- Par de tokens dedicado para "candidato" vs. "conquistado" (princípio 4):
  preenchimento sólido + borda cheia (conquistado) vs. contorno + hachura
  leve, nunca cor sozinha (candidato).
- `prefers-reduced-motion` respeitado explicitamente: o deslocamento no
  clique vira troca instantânea de sombra sem transição quando o SO pede
  menos movimento.

## 4. Guia de componentes

### A. Botão Primário

Sombra rígida com deslocamento no clique (estado Pressed), anel de foco
ortogonal independente. Peso do deslocamento (curto/longo) reflete o risco
da ação que ele dispara, conforme princípio 2.

### B. Content Card

Bordas grossas, fundo sólido, sem gradiente/opacidade. Cards que exibem
"candidato" usam o par de tokens da seção 3.C — nunca o mesmo visual de um
card de fato consolidado.

### C. Alerta de Erro Redundante

Ícone + texto sempre obrigatórios (não depende só de cor). **Correção
importante da v1:** descartar o padrão de listras pretas na borda como
"marca de segurança" — padrões repetitivos de alto contraste são gatilho
conhecido de estresse visual/efeito moiré e, para uma fração pequena mas
real de qualquer população, risco fotossensível; é o oposto do que um
componente de erro (que já aparece em momento de estresse do usuário)
deveria fazer, independente de quem está olhando. Usar barra sólida de cor

- ícone único estático. Copy do erro segue tom literal e sem culpa ("o
  áudio não foi enviado — toque para tentar de novo", nunca "algo deu
  errado!" com exclamação) — vale tanto para o terapeuta apressado quanto
  para o responsável lendo um relatório, é prática de UX writing sob estresse,
  não requisito TEA.

## 5. Critérios de aceite (antes de aprovar tokens/código)

> **Acessibilidade é compromisso de 1ª classe do Iris** (decisão 10/07/2026),
> não caixinha de conformidade — coerente com a marca neurodiversidade-
> afirmativa. Alvo **WCAG 2.2 AA mínimo, AAA onde viável**. Isso não é
> alegação de acessibilidade sensorial clínica (§6): é a11y universal de
> qualidade para quem opera (profissional) e, no futuro, para a família.

- Contraste **AAA atingido** nos pares principais (texto/borda preta sobre
  ouro/menta/azul/terracota = 8–11:1; ink sobre canvas = 16:1). AA é o piso.
- Simulação de daltonismo sem colisão entre os 3 acentos + redundância
  ícone+texto obrigatória (o significado nunca depende só de cor).
- Alvo de toque ≥44×44px em todo componente interativo do Modo Clínico.
- Zoom 200% sem quebra de layout.
- `prefers-reduced-motion` implementado e testado (deslocamento e animação
  do logo viram troca instantânea).
- **`prefers-contrast: more`**: bordas grafite sobem para preto puro, anel de
  foco engrossa.
- **`forced-colors: active`** (Windows High Contrast): significado preservado
  via ícone+texto; foco usa `outline` real (sobrevive ao modo).
- Estado Focus (anel ortogonal, largura por token `--ring-width`) visualmente
  distinto de Hover (aproxima 1px) e Pressed (desloca + remove sombra).
- Nenhum padrão repetitivo de alto contraste (listras, xadrez) em nenhum
  componente.
- **Gate a11y automatizado**: `pnpm test` roda axe (WCAG 2.x A/AA) sobre todos
  os componentes; zero violação é condição de merge. Complementa o painel
  `addon-a11y` manual do Storybook (contraste, que o jsdom não computa).
- Métrica de validação de produto definida antes de gerar código final:
  recomenda-se medir tempo até "aprovação sem edição" na tela de revisão
  do terapeuta antes/depois do novo sistema visual — é o número que já
  está no radar do produto (meta de ativação ≥70%, `BACKLOG.md` seção D).

## 5.1 Implementação e entrega

Tokens e componentes desta seção são implementados como **fonte única em CSS**
(`src/styles/globals.css`, bloco `@theme` do Tailwind v4 — a decisão original
citava `tailwind.config.ts`, mas o Tailwind v4 é config CSS-first; o princípio
"fonte única, sem duplicar valores" se mantém) e entregues como catálogo
Storybook publicado — decisão de ferramenta, ordem de execução e escopo
exato da Fase 0.5 estão em `docs/arquitetura/stack-e-plano-de-construcao.md`
(não duplicado aqui para não divergir).

## 6. Nomenclatura — nota de risco

"Espectro Brutal" é codinome interno de design system, não nome de
feature nem de produto (o produto é Iris). Como este documento agora deixa
explícito que o sistema **não** é uma feature de acessibilidade sensorial
para autismo — é uma metáfora visual de honestidade de dados —, usar esse
nome ou a palavra "espectro" em qualquer material voltado a cliente,
imprensa ou clínica corre o risco de sugerir uma alegação de acessibilidade
que o produto não faz. Manter o codinome estritamente interno.
