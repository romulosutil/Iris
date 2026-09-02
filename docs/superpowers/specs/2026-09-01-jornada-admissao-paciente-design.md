# Jornada de admissão do paciente — prontidão do prontuário

> Spec de design. Ratificada por Rômulo em 01/09/2026.
> Escala para o objeto **paciente** o padrão que a #512 estabeleceu para o objeto
> **sessão**: o objeto sabe o próprio estado e nomeia o gesto seguinte.
>
> **Revisão 02/09/2026** — memo da auditoria 360 aplicado (R-1..R-8; fonte:
> `docs/produto/auditoria-360-revisao-admissao-2026-09-02.md`, issue #540).
> Cada edição está marcada `(auditoria 02/09, R-n)`. **D-A8, D-A9 e D-A10
> entraram depois da ratificação e estão pendentes de validação com o Rômulo.**

## 1. O problema

Hoje é possível cadastrar um paciente, agendar, atender, documentar e consolidar
uma sessão inteira — e o gráfico de evolução continuar vazio. Sem erro, sem
aviso, sem nada na tela que explique por quê.

### 1.1 A cadeia real até o gráfico

| #   | Artefato                                                | Onde se cadastra                     | Obrigatório hoje        |
| --- | ------------------------------------------------------- | ------------------------------------ | ----------------------- |
| 1   | `patient` (nome, nascimento, consentimento, modalidade) | `/pacientes/novo`                    | ✅ sim                  |
| 2   | `patient_clinical_profile` (Ficha Clínica)              | `[id]/cadastro-clinico`              | ❌ não                  |
| 3   | `patient_protocol` (prescrição vigente)                 | `[id]/cadastro-clinico` → Protocolos | ❌ **não**              |
| 4   | `goal` com `criterio_dominio`                           | `[id]/metas`                         | ❌ **não**              |
| 5   | Sessão agendada → diário → consolidada                  | Agenda / Sessões                     | ✅ (só exige o passo 1) |
| 6   | `evidence` → `session_snapshot` → timeline              | automático                           | —                       |

### 1.2 Os três defeitos estruturais

**D1 — a porta está aberta no lugar errado.** Criar sessão exige apenas o
passo 1. Os passos 3 e 4 são os causais: `src/lib/evidence/materializar.ts`
(julgamento 3 do cabeçalho) **descarta toda evidência sem `goal_id` resolvido**.
Sem meta ativa, sessão consolidada produz zero snapshot. A perda é silenciosa.

**D2 — o estado vazio mente.** `pacientes/[id]/page.tsx` renderiza "Sem sessões
registradas → **Agendar Primeira Sessão**". Aponta para a ação que o operador já
podia fazer, não para a que falta. É o mesmo defeito que a #512 fechou na
sessão: o sistema sabe o que falta e não diz.

**D3 — o onboarding abandona no meio.** `PASSOS_ONBOARDING` termina em
`paciente EXISTS`. Celebra o passo 1 e some exatamente onde a jornada endurece.

## 2. Decisões travadas

| #         | Decisão                                                                                                                                                                                                                                                                                                                                      | Racional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-A1**  | A régua morde no **documentar**, não no agendar nem no consolidar.                                                                                                                                                                                                                                                                           | Agendar é ato da recepção, que não tem papel para resolver o bloqueio — travar ali produz beco sem saída. Consolidar é tarde: a sessão já foi gasta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **D-A2**  | Forma = **escada no próprio prontuário**, não wizard.                                                                                                                                                                                                                                                                                        | Wizard de admissão exigiria coordenador do começo ao fim; a recepção não conseguiria terminar. A escada atravessa papéis: quem não pode dar o passo vê "aguardando coordenação".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **D-A3**  | Bloqueia **só o mínimo causal**. Ficha Clínica e Anamnese aparecem como recomendados, sem travar.                                                                                                                                                                                                                                            | Régua que mede o não-causal treina o operador a preencher lixo para destravar. Dado ruim é pior que dado nenhum.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **D-A4**  | Prontidão é **derivada**, nunca coluna.                                                                                                                                                                                                                                                                                                      | Mesmo racional já documentado em `onboarding-queries.ts`: flag manual só é verdadeira enquanto alguém lembra de escrevê-la, e um degrau desfeito (última meta descontinuada) ficaria verde para sempre.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **D-A5**  | A escada sai de `capacidadesDaModalidade`.                                                                                                                                                                                                                                                                                                   | `modalidade.ts` já é fonte única do que cada modalidade tem. Uma segunda tabela de degraus divergiria no primeiro modo novo — foi exatamente o bug que `modalidade.ts` nasceu para fechar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **D-A6**  | Para `cognitive_behavioral`, o degrau bloqueante é **≥1 aplicação de instrumento padronizado** (marco zero). Quem resolve: o **próprio terapeuta**, ao aplicar o instrumento — **a validar** _(auditoria 02/09, R-8; ver §3.1)_.                                                                                                             | Análogo clínico da meta no ABA. `EvolucaoTcc` lê `obterInstrumentoAplicacoes`; sem baseline o gráfico nasce com um ponto só.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **D-A7**  | `conventional` **não tem degrau bloqueante**.                                                                                                                                                                                                                                                                                                | Acompanhamento narrativo, sem gráfico, por decisão de produto de 20/08/2026 (`modalidade.ts`). Inventar régua onde não há métrica seria certeza fabricada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **D-A8**  | A régua morde na **action**, não só na página. A UI apenas antecipa o que a action vai recusar. **⚠️ Pendente de validação com o Rômulo** _(auditoria 02/09, R-2)_. Alternativa consciente: manter UI-only por fricção — se for essa a escolha, dizer em voz alta na spec, porque então a régua tem uma leitura e zero imposições.           | Gate que só existe no render não é gate: `capturarDiario` e `consolidarSessao` são server actions alcançáveis sem passar pela tela (link salvo, aba antiga, chamada direta), e `materializar.ts` continua descartando a evidência em silêncio. Ver `ctx-forjavel-use-server`. Forma: **uma** função `assertPodeDocumentar(ctx, tx, patientId)` em `src/lib/patient/`, chamada por `capturarDiarioCore` e `consolidarSessaoCore` **dentro do `withTenant` já aberto** (mesma imagem do banco da escrita). Copy de recusa literal: "Esta sessão não pode ser documentada: falta meta ativa. Quem resolve: coordenação." — nunca "Erro interno". O teste de mutação reverte a guarda **na action**, não no render.                                                                                                                  |
| **D-A9**  | Os fatos só são lidos para `coordenador` e `terapeuta`. `admin_recepcao` nunca recebe escada nem selo. **⚠️ Pendente de validação com o Rômulo** _(auditoria 02/09, R-1)_.                                                                                                                                                                   | `goal_select` (`0006_fase2_rls.sql:207`) exige `coordenador` OR `app_is_on_team`. Sob a RLS da recepção, `EXISTS` devolve `false` para linhas que existem — a escada afirmaria "falta meta" sobre um prontuário que ela nem pode ler. Ver §4a.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **D-A10** | **Proposta** _(auditoria 02/09, R-1)_ — régua de visibilidade do terapeuta: **"é o profissional responsável pela sessão"**, não "está na equipe de cuidado". **⚠️ Pendente de validação com o Rômulo.** Enquanto não validada, vale o interino fail-closed da §4a: fato não visível → `null` → "Aguardando coordenação", nunca "Falta meta". | Terapeuta de cobertura fora da equipe é cenário suportado e testado (`diario/[sessionId]/actions.int.test.ts:321`); a agenda só valida `user_role` (`agenda/queries.ts:301-320`). Sob a régua "está na equipe", ele veria o passo Documentar **bloqueado** num prontuário que o coordenador vê pronto — bloqueio funcional novo, gerado por regra que não é sobre esse papel (mecanismo do `PR-01`; ver também `PR-05`, "quem é o terapeuta"). As duas saídas possíveis: (a) a agenda passa a **exigir equipe** ao agendar — e a régua "está na equipe" fica verdadeira por construção; (b) `obterFatosProntidao` ganha visibilidade para o terapeuta **da sessão** (`session.therapist_id = app_user_id()`), o que a RLS atual não dá e exigiria policy nova ou definer guardado (§7). A proposta é (b); a escolha é do Rômulo. |

## 3. A jornada nova

### 3.1 A escada, por modalidade

| Modalidade             | Degraus                                                                                               | Bloqueia documentar |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| `protocol_driven`      | Admissão · Ficha Clínica · Anamnese · **Protocolo** · **Meta ativa** · 1ª sessão com dado na evolução | Protocolo, Meta     |
| `cognitive_behavioral` | Admissão · Ficha Clínica · **Instrumento (marco zero)** · 1ª sessão com dado na evolução              | Instrumento         |
| `conventional`         | Admissão · Ficha Clínica · 1ª sessão com dado na evolução                                             | —                   |
| não resolvida          | **Definir modalidade**                                                                                | Modalidade          |

`Admissão` nasce sempre concluído: é o próprio `patient` existir.

**"1ª sessão com dado na evolução", não "1ª sessão"** _(auditoria 02/09, R-8)_
— `temSessaoConsolidada` é `EXISTS session_snapshot`, não `EXISTS session`. Há
sessões consolidadas e aprovadas **sem** snapshot (`Q-01`/`Q-03`: evidência
descartada, número sequencial nulo, DLQ). Para elas a escada diz "pendente", e
está certa — sessão sem snapshot é o que esta feature existe para tornar
impossível — mas o rótulo tem de dizer o que mede, senão parece que a sessão
sumiu.

**Quem desbloqueia `cognitive_behavioral`** _(auditoria 02/09, R-8 — a
validar com o Rômulo)_ — o degrau bloqueante é "instrumento aplicado", que é
ato do **terapeuta** (`papelQueResolve: "terapeuta"`, rota `/pacientes/[id]/tcc`).
É o único degrau bloqueante que o papel bloqueado resolve sozinho: o terapeuta
aplica o PHQ-9/GAD-7 e o passo Documentar destrava, sem coordenação no meio.
A spec assume que é isso mesmo (e não "coordenação define o instrumento"); se a
resposta for outra, D-A6 muda de `papelQueResolve` e a rota do degrau muda com
ele.

### 3.2 Módulos

| Módulo                                                                                                                                                                       | Responsabilidade                                                                                                                                                                                                                                                                          | Depende de             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `src/lib/patient/prontidao.ts`                                                                                                                                               | **Puro.** `montarProntidao({ modalidade, fatos, role })` → `{ degraus[], proximo, podeDocumentar, quemResolve }`. Zero I/O. `fatos: null` (não visível) cai no ramo de `admin_recepcao` _(auditoria 02/09, R-1)_.                                                                         | `modalidade.ts`        |
| `src/lib/patient/prontidao-queries.ts` _(auditoria 02/09, R-6: era `pacientes/[id]/`; três consumidores em três rotas = módulo de `lib`, não rota importando rota — `A-02`)_ | Lê os fatos numa transação `withTenant` só, em bloco de `EXISTS`. Devolve `FatosProntidao \| null` — `null` quando o paciente não existe/não é do tenant ou quando o papel não enxerga o prontuário clínico (§4a) _(auditoria 02/09, R-1)_.                                               | `db/rls`               |
| `src/app/(app)/pacientes/[id]/modalidade.ts`                                                                                                                                 | Ganha `degrausProntidao` e `degrausBloqueantes` em `CapacidadesDaModalidade`.                                                                                                                                                                                                             | —                      |
| `src/components/app/cartao-prontidao.tsx`                                                                                                                                    | Um componente, três pontos de uso (§3.3). Mora em `components/app/` (não `ui/`) porque conhece o domínio — importa `Prontidao` e sabe o que é um degrau; `ui/` só tem primitivos sem vocabulário de negócio (precedente: `faixa-trial.tsx`, `faixa-recusa.tsx`) _(auditoria 02/09, R-7)_. | `prontidao.ts` (tipos) |

**Vocabulário visual do cartão** _(auditoria 02/09, R-7)_ — o DS já tem
colisão de semântica para "pendente / candidato / bloqueado" (`U-02`, `DS-02`):
o violeta de "sugerido pela IA" e o verde de "aprovado" **não** podem ser
reutilizados por um degrau. Cada `EstadoDegrau` usa um par de tokens fixo, e o
rótulo textual é obrigatório — cor nunca é o único portador do estado:

| `EstadoDegrau` | Tokens (`src/styles/globals.css`)                                  | Rótulo textual | Por quê                                                                                |
| -------------- | ------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------- |
| `concluido`    | `--status-success-bg` / `-fg` / `-border`                          | "Concluído"    | É o único estado que afirma algo feito.                                                |
| `pendente`     | neutro: `--surface-muted` / `--text-secondary` / `--border-brutal` | "Recomendado"  | Ausência de dado não-causal; não pede atenção.                                         |
| `bloqueante`   | `--status-warning-bg` / `-fg` / `-border` — **não** `error`        | "Obrigatório"  | É ausência de dado, não erro do operador. `error` treinaria a ler a escada como falha. |

Story obrigatória em `src/components/app/cartao-prontidao.stories.tsx` com os
7 estados da §4 — é o lugar onde a colisão de vocabulário fica visível antes de
chegar ao prontuário.

**Contrato de `montarProntidao`** — função pura, sem acesso a banco, rede ou
relógio. Recebe fatos já lidos; nunca decide o que ler. É esse limite que a
torna testável na matriz completa modalidade × fatos × papel sem I/O.

```ts
export interface FatosProntidao {
  temFichaClinica: boolean;
  temAnamnese: boolean;
  temProtocoloAtivo: boolean; // patient_protocol com desativado_em IS NULL
  temMetaAtiva: boolean; // goal.estado = 'ativa'
  temInstrumentoAplicado: boolean;
  temSessaoConsolidada: boolean;
}

export type EstadoDegrau = "concluido" | "pendente" | "bloqueante";

export interface Degrau {
  id: DegrauId;
  rotulo: string;
  estado: EstadoDegrau;
  rota: string | null; // null quando o papel atual não pode agir
  papelQueResolve: "coordenador" | "terapeuta" | "admin_recepcao";
}

export interface Prontidao {
  degraus: Degrau[];
  proximo: Degrau | null; // null = prontuário pronto; o cartão some
  podeDocumentar: boolean;
  quemResolve: string | null; // rótulo legível quando o papel atual não pode
}
```

### 3.3 Três superfícies, não onze

1. **Cartão de Prontidão no topo do prontuário** — montado em
   `pacientes/[id]/layout.tsx`, junto do selo de RLS. É o lugar que já roda uma
   vez por entrada no prontuário e não remonta a cada troca de aba.
2. **Lista `/pacientes`** — pill de estado por linha (`Pronto`, `Falta meta`,
   `Aguardando coordenação`). O coordenador enxerga a fila de admissão sem abrir
   vinte prontuários.
3. **Documentar (diário da sessão)** — onde a régua morde. Sem formulário: o
   mesmo cartão, em modo bloqueio, nomeando o que falta e quem resolve.

### 3.4 Um gesto primário por vez

O cartão mostra a escada inteira, mas **um** botão primário: o `proximo`. Os
demais degraus pendentes são texto com link secundário. Duas chamadas para ação
com o mesmo peso é a carga cognitiva que este redesenho existe para remover.

## 4. Estados de tela que precisam existir

| Estado                                                                             | O que a tela mostra                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prontuário pronto (`proximo === null`)                                             | Cartão **some**. Nada a fazer não ocupa pixel.                                                                                                         |
| Bloqueado, papel atual resolve                                                     | Botão primário: `Prescrever protocolo →`                                                                                                               |
| Bloqueado, papel atual **não** resolve                                             | `Aguardando coordenação` — sem botão morto                                                                                                             |
| Modalidade não resolvida                                                           | Primeiro degrau é `Definir modalidade`                                                                                                                 |
| Conta em somente-leitura                                                           | Escada visível, gestos desabilitados pela razão que `layout.tsx` já exibe                                                                              |
| Evolução sem snapshot                                                              | Renderiza a **escada**, não mais `Agendar Primeira Sessão`                                                                                             |
| Falha de leitura dos fatos                                                         | Cartão não renderiza; nunca derruba o prontuário — mas **não** finge "pronto" **nem finge "bloqueado"** _(auditoria 02/09, R-1)_                       |
| Fatos **não visíveis** para o papel (recepção; terapeuta fora da equipe até D-A10) | `obterFatosProntidao` devolve `null` → escada vazia, sem degrau clínico nomeado; no Documentar, "Aguardando coordenação" fixo _(auditoria 02/09, R-1)_ |
| Paciente inexistente ou de outra clínica                                           | `obterFatosProntidao` devolve `null`, **não** uma escada de `false`s _(auditoria 02/09, R-1)_                                                          |

O último caso é a memória `erro-renderizado-como-empty-state`: `catch` que vira
estado vazio transforma falha de leitura em afirmação clínica falsa. Aqui o
fallback é ausência do cartão, nunca `podeDocumentar: true`.

### 4a. O cartão também não pode fingir BLOQUEADO (D-A9)

A §4 dizia que o cartão nunca finge "pronto". Falta a simétrica, e ela é a que
morde: as cinco tabelas lidas têm policy de **papel e equipe**, não só de
clínica. `goal_select` exige `coordenador` OR `app_is_on_team(patient_id)`.

Sob a RLS de `admin_recepcao`, portanto, todo `EXISTS` clínico devolve `false`
para linhas que existem. A escada diria "Falta meta" sobre um prontuário
completo — e diria isso ao papel que a política proíbe de ler dado clínico.
Uma afirmação falsa e um vazamento de estado clínico no mesmo selo.

A direção do erro é fail-closed (bloqueia, não vaza linha), que é o lado certo
de errar. Mas a resposta **não** é um `SECURITY DEFINER` que enxergue tudo:
seria reintroduzir a família de defeito de um definer que abre demais.

Regra: `obterFatosProntidao` só é chamada para `coordenador` e `terapeuta`.
Para `admin_recepcao`, `montarProntidao` devolve escada vazia,
`podeDocumentar: false` e `quemResolve: "Coordenação"` — sem nenhum degrau
clínico nomeado. Na lista `/pacientes`, ela não vê selo de prontidão.

**Regra simétrica _(auditoria 02/09, R-1)_: "não visível" ≠ "não existe".**
`obterFatosProntidao` devolve `FatosProntidao | null`. Na mesma transação dos
seis `EXISTS`, ela lê dois fatos de **visibilidade**, não de prontidão:

- `existe` — `EXISTS (SELECT 1 FROM patient WHERE id = $patientId)` sob a RLS
  do tenant. `false` cobre paciente inexistente **e** paciente de outra
  clínica: os dois devolvem `null`, nunca uma escada de `false`s.
- `visivel` — `user_role = 'coordenador' OR app_is_on_team($patientId)`, o
  predicado literal de `goal_select`. `false` devolve `null`.

`montarProntidao({ fatos: null })` cai no mesmo ramo de `admin_recepcao`:
escada vazia, `podeDocumentar: false`, `quemResolve: "Coordenação"`. O cartão
do prontuário some; o passo Documentar mostra "Aguardando coordenação" fixo,
sem nomear degrau clínico. É fail-closed **sem afirmação falsa** — e é o que
torna a regra "nunca finge bloqueado" verificável independentemente do
desfecho de D-A10.

Prova obrigatória, quatro contextos: `ctxCoordenador`, `ctxTerapeutaNaEquipe`,
`ctxTerapeutaForaDaEquipe`, `ctxRecepcao`, mais o caso "paciente inexistente
devolve `null`". O terceiro é o que revela se a régua da equipe é a certa —
hoje a agenda não exige equipe para agendar (D-A10).

## 5. O que muda fora da escada

- **`pacientes/[id]/page.tsx`** — estado vazio de Evolução passa a renderizar o
  `CartaoProntidao`. Fecha D2.
- **`src/lib/onboarding/passos.ts`** — 5º passo: _"Deixe o primeiro paciente
  pronto para atender"_. Fecha D3. O `EXISTS` correspondente entra em
  `obterProgressoOnboarding` na mesma transação dos outros quatro.

## 6. Prova

| Alvo                                | Tipo                        | Critério                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prontidao.ts`                      | unit puro                   | matriz modalidade × fatos × papel; inclui modalidade `null`                                                                                                                                                                                                                                                                                                                                                                       |
| `prontidao-queries.ts`              | int-test (RLS)              | fatos corretos + **cross-tenant devolve `null`**, não escada de `false`s (o "tudo false" fixaria "invisível = inexistente") _(auditoria 02/09, R-4)_                                                                                                                                                                                                                                                                              |
| `prontidao-queries.ts`              | int-test (RLS)              | quatro contextos — `ctxCoordenador`, `ctxTerapeutaNaEquipe`, `ctxTerapeutaForaDaEquipe`, `ctxRecepcao` — a mesma meta; os dois últimos recebem `null`; **paciente inexistente devolve `null`**, não escada _(auditoria 02/09, R-4)_                                                                                                                                                                                               |
| Bloqueio do documentar              | int-test                    | **mutação**: reverter a guarda **na action** (`assertPodeDocumentar`, Task 7b) tem que deixar vermelho; a mutação do render prova só a UI _(auditoria 02/09, R-2)_                                                                                                                                                                                                                                                                |
| Conta em somente-leitura            | componente + int-test       | prontuário **bloqueado** numa conta somente-leitura: escada visível, gesto primário desabilitado pela razão que `layout.tsx` já exibe, e a action recusa pela conta antes de recusar pela escada _(auditoria 02/09, R-4)_                                                                                                                                                                                                         |
| Modalidade trocada depois de pronta | int-test                    | `protocol_driven` pronto → `alterarModalidadeClinica` para `cognitive_behavioral` → volta a bloquear por instrumento. É a prova de D-A4 ("derivada, nunca coluna") _(auditoria 02/09, R-4)_                                                                                                                                                                                                                                       |
| Qualquer `SECURITY DEFINER` novo    | int-test (oráculo RLS)      | entra em `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts`) **e** tem caso negativo cross-tenant próprio — a allowlist positiva sozinha não acusa falta de guard (`Q-05`). Vale em especial para a pill da lista (Task 8: 4 `EXISTS` + `app_is_on_team` por linha é custo que convida a um definer) _(auditoria 02/09, R-4)_                                                                                      |
| `CartaoProntidao`                   | componente + a11y           | os 7 estados da §4; sem botão morto no estado "não resolvo"                                                                                                                                                                                                                                                                                                                                                                       |
| Página por papel                    | componente (página montada) | **4 papéis × gesto primário**: `coordenador`, `terapeuta` na equipe, `terapeuta` fora da equipe, `admin_recepcao` — cada um monta `pacientes/[id]/layout` e `sessoes/[id]` (passo Documentar) com o `ctx` do papel e afirma **qual** gesto aparece (ou que nenhum aparece). A matriz na função pura não substitui isto: foi por esse buraco que a #512 passou (31 testes verdes na action, zero na rota) _(auditoria 02/09, R-5)_ |
| Alcance de rota (pré-requisito)     | unit (rotas)                | toda `rota(patientId)` das definições de degrau resolve para uma página que existe e não redireciona — `/diario/[id]` e `/revisao/[id]` viraram redirect na #512 (`Q-04`). É o primeiro lugar onde um `href` errado vira botão morto; roda **antes** dos testes de componente _(auditoria 02/09, R-5)_                                                                                                                            |
| Caminho feliz                       | e2e (Playwright)            | "coordenador prescreve protocolo → ativa meta → cartão some → terapeuta documenta". Um cenário só, do ponto de vista do operador _(auditoria 02/09, R-5)_                                                                                                                                                                                                                                                                         |
| 5º passo do onboarding              | int-test                    | passo desfeito (meta descontinuada) volta a pendente. O `EXISTS` roda sob a RLS do **coordenador** — ok hoje; se um dia rodar para terapeuta, cai em R-1 _(auditoria 02/09, R-4)_                                                                                                                                                                                                                                                 |

O item de mutação não é formalidade: a memória `teste-verde-que-nao-testa-nada`
lista seis formas de um teste passar contra o código pré-fix.

## 7. Anti-padrões nomeados

- ❌ Coluna `prontidao_status` ou qualquer flag persistida (D-A4).
- ❌ Segunda tabela de degraus fora de `modalidade.ts` (D-A5).
- ❌ Botão primário para um passo que o papel atual não pode dar.
- ❌ `catch` que devolve prontidão vazia e destrava o documentar.
- ❌ Bloquear Ficha Clínica ou Anamnese (D-A3).
- ❌ Gate só no render, com a server action aceitando a escrita (D-A8).
- ❌ Nomear degrau clínico para `admin_recepcao` (D-A9).
- ❌ `SECURITY DEFINER` para ler fatos acima da RLS. Se algum dia for
  inevitável (ex.: D-A10 opção b), o guard interno copia o predicado EXATO da
  policy de leitura correspondente, exige `clinic_id = app_clinic_id_exigido()`
  **e** `app_patient_in_clinic(p_patient)`, entra na varredura de
  `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts`) e tem
  **caso negativo cross-tenant** próprio — a allowlist positiva não acusa a
  falta de guard sozinha (`Q-05`). Lembrete anti-`S-02`: o defeito daquele
  definer era abrir demais com parâmetro nulo; aqui o risco é o inverso
  (fechar demais), e a tentação de "resolver" com um definer que enxerga tudo
  recriaria o primeiro _(auditoria 02/09, R-1)_.
- ❌ Logar `err.message` ou `err` inteiro de erro de driver: em
  `DrizzleQueryError` a `message` é o SQL inteiro com os `params` (`S-03`).
  Logar `name` + `cause.code` (`codigoPg`, `src/db/pg-error.ts`) + **id de
  correlação** (`patientId`/`sessionId`, nunca texto clínico), via helper
  `logarErroSemPII(rotulo, err, correlacao)`. Aqui o único parâmetro é
  `patientId` (baixo risco), mas o idioma é o que se copia para a próxima
  query, que terá texto clínico — e `carregarSessao` propaga sem `catch`
  (correto, fail-closed), então quem loga é `error.tsx`/Sentry, com a mesma
  regra. `prontidao-queries.ts`/`layout.tsx` são o primeiro consumidor do
  helper se ele ainda não existir _(auditoria 02/09, R-3)_.

## 8. Fora de escopo

Sub-projetos irmãos, cada um com spec própria:

- **B — Shell:** remover a faixa de nav horizontal do `Header`, migrar troca de
  clínica, troca de papel e `Sair` para o rodapé do rail; substituir os
  monogramas de duas letras do rail por ícones. Achado que muda o plano:
  `Header` também monta a `BottomNav` do mobile — remover o menu ≠ deletar o
  componente.
- **C — Design system:** 57 componentes em `components/ui/` e 15 ícones em
  `icon.tsx`. Reduzir carga cognitiva do próprio sistema.
