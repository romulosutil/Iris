---
target: /pacientes → prontuário aba Evolução
total_score: 12
p0_count: 1
p1_count: 1
timestamp: 2026-08-20T15-28-14Z
slug: src-app-app-pacientes-id-aba-evolu-o
---
⚠️ DEGRADED: single-context (instrução da sessão proíbe AgentTool sem pedido explícito — Avaliação A e B rodaram inline)

Alvo: `/pacientes` → `/pacientes/[id]` (aba **Evolução**) — `page.tsx`, `layout.tsx`, `lista-pacientes.tsx`, `timeline/timeline-client.tsx` (1032 linhas), `timeline/scrubber.tsx`, `timeline/delta-sessao.tsx`.

Verificação em runtime: **não feita**. Dev server no ar (localhost:3000), mas `/pacientes` redireciona para login e não é permitido digitar senha. Auditoria é estática + leitura de tokens resolvidos.

Detector determinístico (`detect.mjs`): **0 achados** — ele lê HTML/CSS, não `.tsx`; para esta superfície é sinal vazio, não aprovação.

---

## Design Health Score

| #   | Heurística                      | Nota      | Achado                                                                       |
| --- | ------------------------------- | --------- | ---------------------------------------------------------------------------- |
| 1   | Visibility of System Status     | 1         | Falha de rede vira negativa clínica; delta congela sem aviso com comparador on |
| 2   | Match System / Real World       | 1         | "Guard G7 Ativado", "snapshots materializados", eixos VB-MAPP em paciente TCC |
| 3   | User Control and Freedom        | 2         | Estado (sessão, alvo, comparação) não vai para a URL — nada é compartilhável  |
| 4   | Consistency and Standards       | 1         | 4 painéis com fundo de página, 2 com fundo de card; azul-info usado como "IA" |
| 5   | Error Prevention                | 2         | Guard G7 (suspender delta em troca de protocolo) é excelente — isolado        |
| 6   | Recognition Rather Than Recall  | 1         | ✓ / ★ / ○ sem legenda; "Nível 2" sem escala; domínios em `UPPERCASE` cru      |
| 7   | Flexibility and Efficiency      | 2         | Drilldown e comparador são bons; zero atalho, zero deep-link                  |
| 8   | Aesthetic and Minimalist Design | 1         | 6 regiões interativas simultâneas, hero-metric, emoji, rótulos de 9px         |
| 9   | Error Recovery                  | 0         | Não existe. Três `console.error` e nada na tela. Sem retry.                   |
| 10  | Help and Documentation          | 1         | Uma frase em "Trajetória"; nada explica Espectro, Candidato ou Nível          |
| **Total** |                           | **12/40** | **Retrabalho estrutural**                                                     |

---

## Veredito anti-padrão

Não parece "feito por IA" no sentido genérico — não há gradiente roxo, glassmorphism nem grade de cards iguais. O Espectro Brutal está lá. O problema é o oposto: a tela é **um dashboard analítico de fornecedor de software clínico**, exatamente a anti-referência "Prontuário / EMR genérico" do PRODUCT.md — parede de painéis de peso visual idêntico, sem âncora.

Violações nomeadas do próprio DS:

- **The Epistemic Honesty Rule quebrada.** `grep` por `status-ia` / violeta em toda a aba Evolução: **0 ocorrências**. "Candidato" (a saída da IA) é renderizado em `--status-info-*` (azul, papel = notificação). O violeta `#6A4C93`, que o DS reserva para sugestão de IA, nunca aparece. Pior: `delta-sessao.tsx` usa o mesmo azul para "Introduzidos na Sessão", então azul significa duas coisas diferentes na mesma tela.
- **Side-stripe banida.** `timeline-client.tsx:975` — `border-l-4` nos cards de evidência do drilldown. É o mesmo acento lateral que já foi removido dos cards de paciente.
- **Emoji como ícone:** `📭` (empty state, 4xl), `⚠️` (banner do scrubber + alerta G7), `🚀 📈 📉` (delta), `🔒` (pílula do layout).
- **Hero-metric:** delta lateral = número 2xl + rótulo mono uppercase, ×2. Literalmente o padrão listado como anti-referência.

---

## Impressão geral

A engenharia por trás é séria — Guard G7, tabela `sr-only` espelhando o radar, chunking de trajetória, rastreabilidade até o aprovador da evidência. Nada disso é fachada.

Mas a tela **falha na promessa central do produto em dois pontos**: (1) quando algo dá errado, ela afirma um fato clínico falso em vez de dizer que falhou; (2) para 2 das 3 modalidades clínicas, ela é a aba padrão do prontuário e não tem nada a dizer.

A jornada **não é linear** — e não deveria fingir que é. O problema não é a ausência de linearidade, é a ausência de **entrada**: seis regiões independentes, três modelos de tempo concorrentes, nenhuma âncora.

---

## O que funciona

1. **Guard G7.** Suspender o delta de nível de ajuda quando o protocolo muda entre as duas sessões comparadas é honestidade epistêmica de verdade, implementada onde importa. A copy do aviso é que está errada, não a regra.
2. **Radar acessível de fato.** `aria-hidden` no SVG + `<table class="sr-only">` + botão visível "Visualizar Dados em Formato Tabela" — o dado existe em três formas. Raro.
3. **Drilldown com procedência.** Cada evidência mostra sessão, data, quem aprovou e, se houve, quem revisou e por quê. É o "rastreável até a frase de origem" do positioning entregue na tela.

---

## Priority Issues

### [P0] Erro de rede é apresentado como fato clínico negativo

**Onde:** `timeline-client.tsx:260` (delta), `:144` (drilldown), `:295` (comparação).

Os três `catch` fazem `console.error` + `setState(null/[])`. O que a pessoa lê na tela:

- delta falhou → **"Nenhuma alteração clínica registrada nesta sessão"**
- drilldown falhou → **"Nenhuma evidência registrada para este trecho nas sessões selecionadas"**

**Por que importa:** o produto inteiro se vende em "nada é maquiado como certeza". Aqui uma falha de rede vira uma afirmação clínica de que o paciente não evoluiu. Um coordenador validando por exceção pode passar direto de um trecho que na verdade nunca carregou. É o pior tipo de mentira que este produto pode contar.

**Fix:** estado de erro próprio, literal, com retry — "não foi possível carregar o resumo desta sessão — toque para tentar de novo". Nunca reusar o empty state para falha. Vale para os três pontos.

**Comando:** `/impeccable harden src/app/(app)/pacientes/[id]/timeline`

---

### [P1] A aba padrão do prontuário é vazia (ou mente) para TCC e Terapia Convencional

`layout.tsx` troca a aba central por modalidade (`PEI & Metas` / `TCC` / `Temas`) — correto. Mas **"Evolução" é a rota base, é a aba default e é idêntica para as três**. E o conteúdo dela é 100% ABA/protocolo:

- `mapearEixo()` (`src/lib/evidence/espectro.ts:35`) deriva os 6 eixos de `milestone.dominioId` (mando, tato, ecoico, ouvinte, pareamento…) ou da disciplina da meta (Fono/TO). Paciente TCC não tem milestone; qualquer meta cai no fallback `cognicao_aprendizado`.
- `materializarSnapshot` não tem gate de modalidade (`grep clinicalModality src/lib/evidence/materializar.ts` → 0).

**Resultado:** paciente de TCC com evidências aprovadas entra no prontuário e vê um hexágono "Comunicação Expressiva 0% / Social e Brincar 0% / …" com um pico solitário em Cognição, mais "Acompanhamento de Marcos e Protocolos" em empty state, mais um `<select>` de trajetória com dois `optgroup` vazios. Não é um bug de dado — é a tela errada, servida como porta de entrada.

Isso repete o padrão de `feature-sem-caminho-de-escrita-do-campo`: a modalidade foi entregue nas abas e não chegou na aba que todo mundo vê primeiro.

**Fix (decisão do Rômulo, não minha):** ou (a) Evolução vira modality-aware — radar de espectro só em `protocol_driven`, e TCC/convencional ganham a própria leitura de evolução; ou (b) a rota base redireciona para a aba da modalidade e "Evolução" só existe em `protocol_driven`.

**Comando:** `/impeccable shape "aba Evolução por modalidade clínica"`

---

### [P2] Seis regiões, três relógios, nenhuma âncora

Carga cognitiva na entrada, tudo visível ao mesmo tempo, tudo com o mesmo `border-2 p-6`:

| Região                    | Controles                     | Reage ao scrubber? |
| ------------------------- | ----------------------------- | ------------------ |
| Scrubber                  | ← → + slider                  | é o controle       |
| Gráfico de Espectro       | botão tabela                  | sim                |
| Trajetória de Metas       | `<select>` (metas + marcos)   | não                |
| Marcos e Protocolos       | N tiles (VB-MAPP → 100+)      | sim                |
| Resumo da Sessão (delta)  | scroll interno                | sim                |
| Comparar Pontos Temporais | checkbox + `<select>`         | sim                |

Três seletores de tempo coexistem: sessão ativa (scrubber), sessão B (comparador), trecho (chunk do drilldown). Nenhum deles é hierarquicamente superior na tela — o scrubber, que reframe 4 das 6 regiões, tem exatamente o mesmo peso visual de um card qualquer.

**Agrava no mobile:** o grid é `md:grid-cols-3` com o delta na coluna 2. Em telas < 768px ele cai **abaixo** de radar + trajetória + grade de marcos. O terapeuta mobile-first — que só quer saber "o que mudou nesta sessão" — rola três painéis analíticos para chegar lá. A informação mais acionável é a última.

**Fix:** delta primeiro no DOM (`order` no desktop, não no mobile). Scrubber promovido a chrome fixo, não card. Trajetória e Marcos colapsados atrás de `DetalhesExpansiveis` — mesmo padrão já usado em `lista-pacientes.tsx`.

**Comando:** `/impeccable layout src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx`

---

### [P2] Falhas concretas de acessibilidade e DS, verificadas no código

| # | Achado | Onde | Regra |
| - | ------ | ---- | ----- |
| a | `focus:outline-none` sem substituto em 4 controles. `grep focus-visible` na aba → **0** | `:553`, `:615`, `:871`, `page.tsx:125` | WCAG 2.4.7 / "The Orthogonal Focus Rule" |
| b | Barra de progresso: `#b2dfdb` sobre `#e5e7eb` = **1,17:1**; faixa de candidatos `#eff6ff` sobre `#e5e7eb` = **1,19:1**. As duas faixas são invisíveis e indistinguíveis entre si | `:712-726` | WCAG 1.4.11 (3:1) |
| c | Alvos abaixo de 44px: `<select>` trajetória ≈38px, `<select>` comparar ≈32px, checkbox `size-4` = 16px | `:553`, `:871`, `:846` | DS `--control-sm` |
| d | Radar fixo em 300×300 com labels a `1.2 × raio` e `overflow-visible`: extremos em x = −20 e 320. Em viewport de 360px o painel tem ~276px úteis → **estoura na horizontal** | `:353`, `:409-427` | "Text that overflows its container" |
| e | Rótulos dos eixos em `fontSize: 9px` | `:425` | Legibilidade sob luz incontrolável (PRODUCT) |
| f | Cores cruas no SVG fora do DS: `#c0c0c0`, `#d0d0d0`, `rgba(218,165,32,.25)`, `#DAA520` — goldenrod, não o ouro `#F2B705` | `:366-403` | DS |
| g | `text-xxs` (3×) e `text-muted` (6×) **não existem**: nem `--text-xxs` nem `--color-muted` estão em `@theme`. Classes mortas — o texto herda tamanho e cor do pai | `timeline-client.tsx` | — |
| h | 4 painéis usam `bg-canvas` (= `--bg-app` `#f8f9fa`, cor da **página**), enquanto scrubber e delta usam `--surface-card` `#ffffff`. Emenda visível, e os painéis não descolam do fundo | `:353`, `:533`, `:653`, `:830` | Consistência |
| i | Banner "Visualizando histórico passado" usa `--color-gold` — a cor de ação primária como fundo de aviso | `scrubber.tsx:72` | Reserva do ouro |

**Comando:** `/impeccable audit src/app/(app)/pacientes/[id]/timeline`

---

### [P2] Copy vaza vocabulário interno de engenharia para a tela clínica

- **"Guard G7 Ativado:"** — G7 é nome de guardrail interno. Nenhum terapeuta sabe o que é. A explicação que vem depois é boa; o rótulo a torna assustadora.
- **"snapshots de repertório materializados"** no empty state (`page.tsx:119`).
- **"Nível 2"** sem escala em lugar nenhum (2 de quanto? menor é melhor?).
- **`{dom.toUpperCase()}`** — `dominioId` cru na tela: `MANDO`, `INTRAVERBAL`, `ECOICO`.
- **`Meta/Marco (a1b2c3d4)`** — fallback de `delta-sessao.tsx:52` expõe UUID truncado quando o nome não resolve.

**Fix:** "Comparação suspensa: os protocolos ativos mudaram entre a Sessão X e a Sessão Y, e as escalas de ajuda não são equivalentes." De-para de `dominioId` para nome clínico. Legenda de nível de ajuda ao lado da primeira ocorrência.

**Comando:** `/impeccable clarify src/app/(app)/pacientes/[id]/timeline`

---

## Persona Red Flags

**Terapeuta (mobile, corredor, uma mão, atenção interrompida a cada poucos minutos)**
Entra pelo prontuário para ver o que mudou. Recebe primeiro um radar de 300px que estoura a lateral do celular com rótulos de 9px. Rola três painéis até o "Resumo da Sessão". O `<select>` de trajetória tem 38px — erra com o polegar. Se a rede oscilar no corredor, lê "Nenhuma alteração clínica registrada nesta sessão" e acredita. Se o paciente for de TCC, tudo isso está zerado.

**Coordenador (desktop, validação por exceção, risco = rubber-stamping por cansaço)**
Melhor servido: densidade é o registro dele. Mas: não consegue mandar link de um trecho para o supervisor (zero estado na URL) — nada aqui é compartilhável. A barra de progresso, que seria a varredura rápida por domínio, é invisível (1,17:1), então ele tem que contar as pílulas ✓/★/○ uma a uma. E "Candidatos" em azul-informativo, com o mesmo azul de "Introduzidos", achata justamente a distinção candidato × conquistado que existe para impedir aprovação mecânica.

**Responsável / família** — não acessa esta tela. Sem achados.

---

## Observações menores

- `carregando={isPending && !compararAtivo}` (`:825`): com o comparador ligado, trocar de sessão **não** mostra loading no delta — os números antigos ficam na tela até chegarem os novos. Estado obsoleto sem sinal, contra "A informação nunca se perde implicitamente".
- `isPending` é um `useTransition` único para delta **e** comparação — os dois estados de carga se contaminam.
- `useState<any[]>` para evidências e `ev: any` no map (`:71`, `:982`) — sem tipo no único ponto da tela que exibe texto clínico literal.
- Ações do `PageHeader` ("Ficha Clínica", "PEI & Metas") **duplicam abas que estão logo abaixo**. Dois caminhos para o mesmo destino, um deles inconsistente por modalidade (o botão "PEI & Metas" aparece mesmo para paciente TCC, cuja aba é "TCC").
- Empty state manda "Agendar Primeira Sessão" → `/agenda`. Para paciente recém-criado o próximo passo real é prescrição → equipe (a própria lista marca "Sem prescrição"). O CTA pula duas etapas.
- **Zero cobertura de UI** em toda a superfície: nenhum `.test.tsx` e nenhuma `.stories.tsx` para `TimelineClient`, `Scrubber` ou `DeltaSessaoLateral` (1352 linhas). O `a11y.test.tsx` de `/pacientes` testa o layout e a lista, não a Evolução — e, sob jsdom, axe não avalia contraste.
- Pílula "🔒 Dados Criptografados (RLS Ativo)" (`layout.tsx`): expõe implementação, e "RLS" não significa nada para o usuário.

---

## Perguntas

1. Se a Evolução respondesse **uma** pergunta, qual seria? "O que mudou nesta sessão?" e "Como este alvo evoluiu ao longo do tempo?" são duas telas, não seis painéis.
2. O radar de espectro é decisão clínica ou é conforto visual? Ele agrega seis eixos em uma média normalizada — a mesma síntese que o produto se recusa a fazer em todo o resto. Um coordenador já mudou de conduta por causa dele?
3. Se "Evolução" fosse a aba **do protocolo** e cada modalidade tivesse a sua própria leitura de evolução, o que sobraria de comum entre as três?
4. Por que o estado desta tela não está na URL? É a única tela do produto que produz uma afirmação que alguém gostaria de citar.
