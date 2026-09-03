# Sequela da #557 — as provas que faltaram e os desvios de spec

> **Rascunho do corpo da issue.** Não postado no GitHub: o Rômulo decide quando
> abrir. Escrito em 03/09/2026 contra a `main` (commit `a3142384`).
>
> Spec de origem:
> [`2026-09-01-jornada-admissao-paciente-design.md`](./2026-09-01-jornada-admissao-paciente-design.md)
> Plano executado: [`../plans/2026-09-01-prontidao-do-prontuario.md`](../plans/2026-09-01-prontidao-do-prontuario.md)
> Relacionadas: **#559** (rota importando rota, `A-02`) · **#560** (idioma de
> log de erro).

## Por que esta issue existe

A PR #557 entregou a feature: a escada existe, a régua morde na UI **e** na
action, o definer `app_fatos_prontidao` (`0149`) tem guard e caso negativo
cross-tenant, e o 5º passo do onboarding está no `passos.ts`. A feature
funciona.

O que não veio junto foi metade da §6 da spec — a coluna "Prova". A §6 não é
lista de desejos: cada linha dela nasceu de um defeito já pago neste repo. O
teste de alcance de rota existe porque `/diario/[id]` virou redirect na #512;
a matriz de 4 papéis por página existe porque a #512 passou com 31 testes
verdes na action e zero na rota. Fechar a feature sem essas provas é apostar
que desta vez o mesmo buraco não abre.

Além disso, quatro pontos da implementação divergem da spec sem que a
divergência tenha sido registrada em lugar nenhum. Três são idioma; o quarto
(D) muda o contrato de um módulo e apaga uma distinção que a auditoria de
02/09 criou de propósito.

**Nada aqui é regressão de produção.** É dívida de prova e de idioma.

---

## Parte 1 — Os 7 buracos de prova

### B-1 · Alcance de rota (pré-requisito de tudo) — ✅ FECHADO (PR #571, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                       |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `src/lib/patient/prontidao-rotas.test.ts` — **medido como inexistente** em 03/09/2026                                                                                                                                                                                          |
| O que a spec pede | §6, linha "Alcance de rota (pré-requisito)": para cada `DegrauId`, a `rota(patientId)` da definição do degrau é `null` **ou** um caminho que existe em `src/app/(app)/**/page.tsx` e **não** é um `redirect()`. A spec diz literal: "roda **antes** dos testes de componente". |
| Por que dói       | É o primeiro lugar onde um `href` errado vira botão morto com teste de componente verde. `/diario/[id]` e `/revisao/[id]` viraram redirect na #512 (`Q-04`) — o precedente é do mesmo repo, não hipotético.                                                                    |
| Como se prova     | O teste enumera os `DegrauId` a partir da própria tabela de definições (não de uma lista repetida no teste — lista repetida diverge no primeiro degrau novo). **Mutação:** apontar uma rota de degrau para um caminho que é `redirect()` tem que deixar vermelho.              |

### B-2 · Página por papel no `sessoes/[id]` — ✅ FECHADO (PR #578, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                                         |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `src/app/(app)/sessoes/[id]/page.test.tsx` — **medido como inexistente**. Hoje `src/app/(app)/sessoes/[id]/layout.test.tsx` cobre **2** papéis: `coordenador` e `admin_recepcao`.                                                                                                                |
| O que a spec pede | §6, "Página por papel": **4 papéis × gesto primário** — `coordenador`, `terapeuta` **na** equipe, `terapeuta` **fora** da equipe, `admin_recepcao` — montando a página com o `ctx` de cada papel e afirmando **qual** gesto aparece, ou que nenhum aparece e o texto é "Aguardando coordenação". |
| Por que dói       | Faltam exatamente os dois casos que D-A10 criou: o terapeuta fora da equipe é o cenário que a opção (b) e o definer `0149` existem para atender. Provar a leitura (int-test) e não provar a tela deixa o gesto sem oráculo.                                                                      |
| Como se prova     | Quatro casos, um por papel, na superfície `sessoes/[id]` (passo Documentar). O caso "terapeuta fora da equipe" tem que afirmar o gesto **habilitado** pela via do definer — se afirmar "Aguardando coordenação", a opção (b) não está chegando na tela.                                          |

### B-3 · Caminho feliz e2e — 🚧 EM EXECUÇÃO (branch `test/prontidao-e2e`)

| Campo             | Conteúdo                                                                                                                                                                                                                                                       |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `e2e/prontidao-do-prontuario.spec.ts` — **medido como inexistente** em `e2e/`                                                                                                                                                                                  |
| O que a spec pede | §6, "Caminho feliz": um cenário só — "coordenador prescreve protocolo → ativa meta → cartão some → terapeuta documenta", do ponto de vista do operador.                                                                                                        |
| Por que dói       | É a única prova que costura as **três** superfícies (cartão no prontuário, pill na lista, passo Documentar). Cada uma tem teste próprio; nenhuma tem teste de que o estado muda junto nas três.                                                                |
| Como se prova     | Um cenário, não uma matriz. O ponto que não pode faltar: **o cartão some** quando `proximo === null` (§4, "Nada a fazer não ocupa pixel"). Atenção ao gate de cobertura e2e — flaky não conta como `expected` (`scripts/ci/verificar-cobertura-e2e.mjs`, D80). |

### B-4 · Story dos 7 estados — ✅ FECHADO (PR #572, 03/09/2026), junto do desvio A

| Campo             | Conteúdo                                                                                                                                                                                                                                                               |
| :---------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `src/components/app/cartao-prontidao.stories.tsx` — **medido como inexistente**                                                                                                                                                                                        |
| O que a spec pede | §3.2, literal: "Story **obrigatória** … com os 7 estados da §4 — é o lugar onde a colisão de vocabulário fica visível antes de chegar ao prontuário."                                                                                                                  |
| Por que dói       | A §3.2 nomeia a colisão de semântica do DS (`U-02`, `DS-02`): o violeta de "sugerido pela IA" e o verde de "aprovado" não podem ser reusados por degrau. Sem a story, a colisão só aparece no prontuário de um cliente. É também onde o desvio **A** salta aos olhos.  |
| Como se prova     | Uma story por estado da tabela da §4 (7 no total, incluindo "prontuário pronto → cartão some" e "falha de leitura → cartão não renderiza"). Storybook 10: viewport é global, não `parameters.defaultViewport` (memória `storybook10-viewport-e-global-nao-parametro`). |

### B-5 · Conta em somente-leitura — ✅ FECHADO (PR #577, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                                                         |
| :---------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `src/components/app/cartao-prontidao.tsx` — `CartaoProntidaoProps` hoje é só `{ prontidao, titulo }`; **nenhum teste** prova o gesto desabilitado, e **nenhum int-test** prova a ordem de recusa da action.                                                                                                      |
| O que a spec pede | §4, linha "Conta em somente-leitura": escada visível, gestos desabilitados **pela razão que `layout.tsx` já exibe**. §6: "a action recusa pela conta **antes** de recusar pela escada".                                                                                                                          |
| Por que dói       | O componente não tem por onde receber o estado da conta — não é teste faltando, é **prop faltando**. Sem ela, uma conta em somente-leitura mostra um botão primário que a action vai recusar: botão morto, que é o anti-padrão nomeado na §7.                                                                    |
| Como se prova     | (1) Teste de componente: com a conta em somente-leitura, o gesto primário sai desabilitado e a razão exibida é a mesma do `layout.tsx` (não uma copy nova). (2) Int-test: numa conta somente-leitura **e** com escada bloqueada, a mensagem de recusa é a da conta, não a da escada — a ordem é o que se afirma. |

### B-6 · Modalidade trocada depois de pronta (prova de D-A4) — ✅ FECHADO (PR #575, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                    |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquivo           | `src/app/(app)/sessoes/[id]/bloqueio-documentar.int.test.ts` — existe, mas **`alterarModalidadeClinica` não aparece nele**                                                                                                                  |
| O que a spec pede | §6: paciente `protocol_driven` pronto (`podeDocumentar: true`) → `alterarModalidadeClinica(..., "cognitive_behavioral")` → volta a bloquear por instrumento. É a prova de **D-A4** ("prontidão é derivada, nunca coluna").                  |
| Por que dói       | D-A4 é a decisão que impede a família de defeito inteira ("flag manual só é verdadeira enquanto alguém lembra de escrevê-la"). Hoje ela está implementada e **não provada**: um `cache` mal colocado ou uma coluna futura passariam verdes. |
| Como se prova     | Um caso no arquivo que já existe, na mesma transação/fixture. **Mutação:** memoizar a prontidão por `patientId` tem que deixar vermelho.                                                                                                    |

### B-7 · 5º passo do onboarding: faltava o passo DESFEITO — ✅ FECHADO (PR #576, 03/09/2026)

> **Correção de medição (03/09/2026).** A redação original desta seção dizia
> "sem teste nenhum". Estava errada: a varredura olhou só `src/**` e o teste
> mora em `db/tests/onboarding-progresso-rls.int.test.ts`, que existe desde a
> #489 e recebeu 3 casos do 5º passo na própria #557 (escada por modalidade,
> modalidade não resolvida, isolamento cross-tenant). O buraco real era
> **específico e é justamente o que a §6 nomeia**: o passo **desfeito**. A PR
> #576 estendeu o arquivo existente (7 → 12 casos) em vez de criar um
> duplicado. A mutação prova o tamanho exato do buraco: com `temMetaAtiva`
> chumbado em `true`, os 3 casos que já existiam continuam VERDES e só os
> casos novos caem — nenhum teste anterior distinguia passo derivado de flag
> persistida.

| Campo             | Conteúdo                                                                                                                                                                                                                                                                              |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquivo           | `src/lib/onboarding/passos.ts:56` (o passo existe) — e **nada no repo importa `PASSOS_ONBOARDING` nem `obterProgressoOnboarding` em teste**                                                                                                                                           |
| O que a spec pede | §6: "passo desfeito (meta descontinuada) volta a pendente". O `EXISTS` roda sob a RLS do **coordenador**; se um dia rodar para terapeuta, cai em R-1 (§4a).                                                                                                                           |
| Por que dói       | Não é só o 5º passo: os outros quatro também não têm teste. O passo novo é o único cujo `EXISTS` pode **regredir** (meta descontinuada) — os anteriores são monotônicos. Sem prova, "pronto para atender" pode ficar verde para sempre, que é literalmente o defeito que D-A4 nomeia. |
| Como se prova     | Int-test que leva o paciente a pronto, afirma o passo concluído, **descontinua a meta** e afirma que o passo voltou a pendente. Ir e voltar — só ir não distingue derivado de persistido.                                                                                             |

---

## Parte 2 — Os 4 desvios de spec

### Desvio A · Token de erro onde a spec manda aviso — ✅ FECHADO (PR #572, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                               |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `src/components/app/cartao-prontidao.tsx` — usa `--status-error-fg` no estado `bloqueante`                                                                                                                                                                                             |
| O que a spec pede | §3.2 (R-7), tabela de tokens: `bloqueante` usa `--status-warning-bg` / `-fg` / `-border` — **"não `error`"**, com a razão escrita ao lado: "É ausência de dado, não erro do operador. `error` treinaria a ler a escada como falha."                                                    |
| Por que dói       | Não é preferência estética: é a diferença entre "falta um passo" e "você errou". A escada é a única superfície do produto que fala com o operador **antes** de ele fazer qualquer coisa.                                                                                               |
| Como se prova     | Trocar os três tokens e afirmar no teste de componente que o estado `bloqueante` não usa a família `error`. A story (B-4) é onde isso fica visível. Atenção: axe sob jsdom **não** checa contraste (memória `doc-ds-conflita-com-a11y-menta-terracota`) — conferir o par no navegador. |

### Desvio B · `prontidao-queries.ts` na rota, não em `lib` (= issue #559) — ✅ FECHADO (PR #579, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                            |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquivo           | `src/app/(app)/pacientes/[id]/prontidao-queries.ts` — a spec mandava `src/lib/patient/`. `src/app/(app)/onboarding-queries.ts:5` importa um tipo dessa rota → **rota importando rota**                                                                              |
| O que a spec pede | §3.2 (R-6), literal: "era `pacientes/[id]/`; três consumidores em três rotas = módulo de `lib`, não rota importando rota — `A-02`"                                                                                                                                  |
| Por que dói       | Já está aberto como **#559** (`A-02`). O acoplamento não é teórico: `onboarding-queries.ts` passa a depender do ciclo de vida de uma pasta de rota que pode ser movida por qualquer refactor de UI (precedente: memória `issue-aponta-arquivo-que-virou-redirect`). |
| Como se prova     | Mover o arquivo para `src/lib/patient/prontidao-queries.ts`, atualizar os importadores, e `pnpm typecheck` + `pnpm lint` verdes. **Fecha a #559** — o corpo dela é este item; abrir issue nova seria duplicar.                                                      |

### Desvio C · `console.warn` onde a spec manda `logarErroSemPII` (parente da #560) — ✅ FECHADO (PR #579, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                    |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `src/app/(app)/pacientes/[id]/layout.tsx:78` e `src/app/(app)/pacientes/[id]/page.tsx:108` — dois `catch` com `console.warn` e template próprio. O helper **existe**: `src/lib/observabilidade/logar-erro.ts:167` (`logarErroSemPII`)                                       |
| O que a spec pede | §7, último anti-padrão: logar `name` + `cause.code` (`codigoPg`) + id de correlação **via `logarErroSemPII(rotulo, err, correlacao)`**; a spec nomeia `prontidao-queries.ts`/`layout.tsx` como "o primeiro consumidor do helper se ele ainda não existir".                  |
| Por que dói       | **Medido: não vaza PII hoje** — os dois logam só `name` + SQLSTATE. O problema é idioma: é o template que a próxima query copia, e a próxima terá texto clínico. Em `DrizzleQueryError` a `message` é o SQL inteiro com os `params` (`S-03`). Relacionado à **#560**.       |
| Como se prova     | Trocar as duas chamadas pelo helper, com `patientId` como correlação. **Mutação:** não há oráculo automático para "não vaza PII" — o oráculo é o helper ser o único caminho. Um teste que afirme que o `catch` chama `logarErroSemPII` (e não `console.*`) segura o idioma. |

### Desvio D · `obterFatosProntidao` lança onde a spec define `| null` — ✅ FECHADO (PR #579, 03/09/2026)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                                                                                              |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivo           | `prontidao-queries.ts` (hoje em `src/app/(app)/pacientes/[id]/`, ver desvio B) — `obterFatosProntidao` **lança exceção**; os `catch` de `layout.tsx:78` e `page.tsx:108` seguram                                                                                                                                                                      |
| O que a spec pede | §4a: a função devolve `FatosProntidao \| null`. `null` cobre **três** situações distintas — paciente não visível para o papel, paciente inexistente/de outra clínica, e nada mais; **falha de infra é exceção**, e a §4 dá a ela uma linha própria ("Cartão não renderiza").                                                                          |
| Por que dói       | O fail-closed está preservado (o `catch` do layout some com o cartão), mas "não visível", "não existe" e "falha de infra" **caíram no mesmo ramo** — que é exatamente a distinção que R-1 criou. Enquanto os três forem o mesmo `throw`, ninguém consegue escrever o teste que separa "escada vazia por papel" de "cartão ausente por erro de banco". |
| Decisão           | **A spec vence.** Ratificado pelo Rômulo em 03/09/2026: o contrato correto é `FatosProntidao \| null`; **quem muda é a implementação**. Uma onda posterior faz a mudança.                                                                                                                                                                             |
| Como se prova     | Três casos distinguíveis no int-test: (1) recepção → `null`, cartão ausente **sem** degrau clínico nomeado; (2) paciente de outra clínica → `null`, **não** escada de `false`s; (3) erro de driver → **exceção** propagada, cartão ausente, log pelo helper (desvio C). Se os três produzirem o mesmo resultado observável, o desvio não fechou.      |

---

## Parte 3 — Ordem de execução e o que dá para paralelizar

### Regras de operação (valem para toda onda)

- **Um agente = um worktree próprio.** `git worktree add`, branch própria.
  Duas sessões no mesmo working tree se atropelam — a memória
  `sessao-concorrente-no-mesmo-working-tree` registra um `TRUNCATE` de uma
  sessão apagando a medição da outra.
- **Um agente = um banco próprio** (`iris_w1`, `iris_w2`, …). Int-test com
  fixture compartilhada derruba testes que não têm nada a ver com o diff
  (memórias `int-test-vermelho-por-fixture-compartilhada`,
  `truncate-extra-colide-com-int-test-paralelo`).
- **Nunca `pnpm test:rls` completo em paralelo.** Cada agente roda só os
  `*.int.test.ts` que tocou, com `--config vitest.integration.config.ts`
  (memória `vitest-int-test-coleta-zero`: `vitest run` num `*.int.test.ts`
  coleta zero e passa verde). **Falha disjunta entre execuções paralelas é
  contenção, não regressão** — memória
  `test-rls-completo-inutil-com-agentes-paralelos`. A suíte completa roda
  **uma vez**, sequencial, na onda final.
- **Cada item fecha em PR própria.** A fronteira é onde um revisor rejeitaria
  um e aprovaria o vizinho.

### Onda 0 — sozinha, sequencial (bloqueia todo o resto)

| Item                      | Por que sozinha                                                                                                                                               |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Desvio B** (fecha #559) | Move `prontidao-queries.ts` e mexe em **todos** os importadores. Qualquer outro agente com o arquivo aberto conflita. É também a base de caminho do desvio D. |

### Onda 1 — 3 agentes em paralelo (arquivos disjuntos)

| Agente | Item                         | Arquivos                                                                          |
| :----- | :--------------------------- | :-------------------------------------------------------------------------------- |
| **W1** | **B-1** alcance de rota      | `src/lib/patient/prontidao-rotas.test.ts` (novo)                                  |
| **W2** | **Desvio A** + **B-4** story | `src/components/app/cartao-prontidao.tsx` + `cartao-prontidao.stories.tsx` (novo) |
| **W3** | **Desvio C** log sem PII     | `pacientes/[id]/layout.tsx`, `pacientes/[id]/page.tsx`                            |

B-1 é o primeiro por ordem da própria spec ("roda **antes** dos testes de
componente"), mas não bloqueia W2/W3: são arquivos disjuntos.

### Onda 2 — 4 agentes em paralelo (depende das ondas 0 e 1)

| Agente | Item                               | Depende de                                                                 |
| :----- | :--------------------------------- | :------------------------------------------------------------------------- |
| **W4** | **Desvio D** contrato `null`       | Onda 0 (caminho do arquivo) + onda 1/W3 (os `catch` que ele muda)          |
| **W5** | **B-2** 4 papéis no `sessoes/[id]` | Onda 1/W1 (rota inválida faria o teste de gesto falhar pelo motivo errado) |
| **W6** | **B-5** conta somente-leitura      | Onda 1/W2 (acrescenta prop ao mesmo componente)                            |
| **W7** | **B-6** modalidade trocada         | —                                                                          |
| **W8** | **B-7** onboarding vai-e-volta     | — (arquivo de teste novo, sem colisão)                                     |

W7 e W8 não dependem de nada e podem subir junto com a onda 1 se houver
capacidade — a ordem acima é a conservadora.

### Onda 3 — sequencial, no fim

| Item                                    | Por quê                                                                                                                                                                                                                           |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B-3** e2e caminho feliz               | Costura as três superfícies; escrito antes das ondas 1-2 quebraria a cada PR mergeada.                                                                                                                                            |
| Suíte completa                          | `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`, **uma execução, sem paralelismo**. Conferir a **contagem** do `test:rls` — "skipped" em massa é vermelho disfarçado (memória `suite-rls-rodando-como-superusuario`). |
| `pnpm prettier --write <só os tocados>` | `pnpm format` reformata o repositório inteiro.                                                                                                                                                                                    |

### Definição de pronto desta sequela

1. Os 7 arquivos de prova existem e cada um tem a mutação descrita acima
   deixando-o vermelho.
2. Os 4 desvios estão fechados, ou o desvio tem decisão registrada na spec.
3. #559 fechada pelo desvio B (keyword em inglês na PR — memória
   `pr-em-pt-br-nao-fecha-issue`).
4. Nenhum checkbox do plano marcado sem arquivo que o sustente.

---

## Parte 4 — Lacuna descoberta durante a execução

### B-8 · "Aguardando coordenação" não é produzível hoje — 🚧 EM EXECUÇÃO (branch `feat/prontidao-aguardando-coordenacao`)

| Campo             | Conteúdo                                                                                                                                                                                                                                                                                                        |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Como apareceu     | Medido pelo agente da **B-2** (#578) ao escrever o caso "papel sem leitura clínica" no passo Documentar: a §6 pede afirmar "qual gesto aparece, **ou** que nenhum aparece e o texto é `Aguardando coordenação`" — e o segundo ramo não tem como ser afirmado.                                                   |
| O que a spec pede | §4a promete o selo fixo **"Aguardando coordenação"** no passo Documentar para quem não enxerga o prontuário clínico (R-1: escada vazia por papel ≠ escada bloqueada por dado).                                                                                                                                  |
| O que existe hoje | `CartaoProntidao` devolve `null` quando `proximo === null`. Como `obterFatosProntidao` também devolve `null` para o papel sem leitura clínica (contrato ratificado no desvio D, #579), esse papel vê **nada** — não um selo. A regra §4 "nada a fazer não ocupa pixel" está engolindo o caso da §4a.            |
| Por que dói       | São dois estados com significados opostos colapsados no mesmo pixel vazio: "prontuário pronto, nada a fazer" e "existe coisa a fazer, mas não é sua". O segundo é justamente a distinção que R-1 criou e que o desvio D acabou de reconstruir na camada de dados — e ela se perde na camada de apresentação.    |
| Como se prova     | O caso de componente da B-2 para o papel sem leitura clínica passa a afirmar o texto "Aguardando coordenação" em vez de ausência. **Mutação:** fazer o componente devolver `null` também nesse ramo tem que deixar vermelho — se continuar verde, o oráculo voltou a ser "cartão ausente" e não distingue nada. |
| Escopo            | **Registro, não conserto**, nesta PR. A implementação corre em paralelo na branch `feat/prontidao-aguardando-coordenacao`.                                                                                                                                                                                      |

---

## Estado da execução — 03/09/2026

Ondas disparadas no mesmo dia em que a sequela foi escrita. Cada agente em
worktree próprio, banco `iris_wN` próprio, sem `pnpm test:rls` completo em
paralelo.

| PR       | Escopo                                                                                                                                         | Estado                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **#571** | B-1 — alcance de rota                                                                                                                          | ✅ mergeada (`c526c1b9`); 11 casos, nenhum botão morto, mutação provada                           |
| **#572** | Desvio A + B-4 — token `warning` e story dos 7 estados                                                                                         | ✅ mergeada (`3613cc32`); inclui a correção de contraste AA do estado `pendente`                  |
| **#573** | Ratificação D-A6/A8/A9/A10 + este documento + D83                                                                                              | ✅ mergeada (`73a67e73`)                                                                          |
| **#579** | Desvios B + C + D — ERRCODE dedicado (`IR001`/`IR002`, migração `0152`), contrato `null`, `git mv` para `src/lib/patient/`, `logarAvisoSemPII` | ✅ mergeada (`199f6a7f`); fecha a #559                                                            |
| **#578** | B-2 — 4 papéis × gesto primário                                                                                                                | ✅ mergeada (`b739b965`); cobre as duas superfícies                                               |
| **#577** | B-5 — conta somente-leitura (prop nova no cartão + ordem das recusas)                                                                          | ✅ mergeada (`268001f5`)                                                                          |
| **#575** | B-6 — modalidade trocada depois de pronta                                                                                                      | ✅ mergeada (`82982de2`)                                                                          |
| **#576** | B-7 — 5º passo do onboarding (o passo **desfeito**)                                                                                            | ✅ mergeada (`50222320`); estendeu `db/tests/onboarding-progresso-rls.int.test.ts` (7 → 12 casos) |
| —        | B-3 — e2e do caminho feliz                                                                                                                     | 🚧 em execução, branch `test/prontidao-e2e`                                                       |
| —        | B-8 — "Aguardando coordenação" não é produzível (ver Parte 4)                                                                                  | 🚧 em execução, branch `feat/prontidao-aguardando-coordenacao`                                    |
| —        | Varredura `0144` → `0149` + reconciliação dos documentos                                                                                       | ✅ esta PR                                                                                        |

**Correção de contraste que virou regra** — aplicar a §3.2 ao pé da letra
reprovava AA no estado `pendente` (4.20:1 no claro, piso 4.5 para 12px
semibold). A spec foi corrigida com o número medido, e não o contrário: sem o
número registrado, a próxima pessoa "conserta" de volta e reintroduz a
reprovação, que o `axe` sob jsdom não acusa.
