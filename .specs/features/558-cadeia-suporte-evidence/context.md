# Cadeia de suporte por etapa — áreas cinzentas (ABERTAS)

> Companheiro de [`spec.md`](./spec.md). Issue [#558](https://github.com/romulosutil/Iris/issues/558).
>
> **Cinco das 6 decisões abaixo seguem abertas** (G-2 foi resolvida por medição em 03/09 — ver a seção). Enquanto estiverem abertas, a spec não gera `tasks.md` e a issue não recebe a label `jules` — o executor escolheria por você, que é exatamente o pós-mortem do #285/PR #295 (`AGENTS.md` §5.2).
>
> Cada área traz o que foi **medido**, as opções e a recomendação técnica. A escolha é do Rômulo.

---

## G-1 · Onde a cadeia declara seu alvo: na cadeia inteira ou por etapa?

**Medido**: o payload de `cadeia` não tem nenhum campo de alvo (`output-schema.json:97-112`). Os subtipos que chegam em `evidence` carregam `alvos[]`, e cada alvo tem `dominio_id`, `goal_ref`, `protocol_slug` (`resolver.ts`, `logic.ts:238-292`). A regra R9 do agente instrui a extrair a rotina inteira como uma cadeia, sem falar de meta (`system-instructions.md:61-62`). A regra R8 diz que "todo item de `alvos` dentro de uma extração compartilha o mesmo `dominio_id`" (`system-instructions.md:58-60`).

| Opção                                                                      | Consequência                                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** Âncora única na cadeia — `cadeia.dominio_id` / `goal_ref`          | Simples, coerente com R8, uma rotina = uma meta. Perde o caso "lanche" cujas etapas tocam metas diferentes (motor fino × comunicação).                      |
| **(b)** Âncora por etapa — cada item de `etapas[]` ganha os campos de alvo | Fiel ao caso clínico real (uma rotina cruza domínios). Mais superfície de erro do agente; contraria a simetria de R8; cada etapa vira um alvo independente. |
| **(c)** Âncora na cadeia **e** override opcional por etapa                 | Cobre os dois. Contrato maior, mais caminhos de teste, mais chance de o agente errar a combinação.                                                          |

**Recomendação técnica**: (a). É a menor mudança de contrato que destrava a feature, e o caso multi-domínio pode ser expresso hoje como duas cadeias. (b) só se você souber que a rotina cruzando domínios é frequente na prática clínica — isso é conhecimento seu, não do código.

**Pergunta direta**: uma rotina de vida diária (lavar mãos, lanche, vestir) costuma pertencer a **uma** meta do PEI, ou as etapas se espalham por metas diferentes?

---

## G-2 · Ordem das etapas: campo explícito ou índice do array?

**Medido**: a ordem é hoje puramente posicional. `resumo.ts:105-113` rotula `Etapa ${i+1}` pelo índice; o schema não tem campo de ordem. `evidence` tem `alvo_ordinal integer NOT NULL` com "base 0, posição em `alvos[]`" (`schema.ts:1383`) e a constraint `uq_evidence_alvo (extraction_id, alvo_ordinal)` como discriminador de idempotência.

| Opção                                         | Consequência                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** Índice do array é a fonte da verdade  | Zero mudança de contrato. Mas se a extração for **editada** (`payload_editado`) e uma etapa for removida, os índices deslizam e a reaprovação casa etapa nova com linha antiga. |
| **(b)** Campo `ordem` explícito em cada etapa | Estável sob edição. Exige o agente preencher certo, e um guard para ordem duplicada/faltante.                                                                                   |

### Resolvida por medição em 03/09/2026 → **(a)**

A pergunta que faltava era "o coordenador pode remover uma etapa ao editar?". **Não pode.** Medido:

- O diálogo "Editar sugestão" (`revisao-lista.tsx:195-244`) tem exatamente **três campos de texto livre** — `funcao`, `nivel_ajuda`, `resultado` (`:212-236`) — e um hidden com o payload original (`:203-207`).
- `editarExtracaoAction` (`actions.ts:97-125`) faz `{ ...base }` e sobrepõe **só** esses três campos, na **raiz** do payload (`:113-117`). `etapas[]` nunca é tocada: não há como remover, reordenar nem acrescentar etapa.

Logo os índices não deslizam, e o índice do array é fonte estável. **(a)** é seguro e não exige mudança de contrato. Se algum dia a edição de etapa existir, esta decisão precisa ser revisitada — anotar em `spec.md` R1.4.

### Achado colateral (não é desta feature — abrir issue própria)

O mesmo diálogo é usado para **todos** os subtipos, e escreve os três campos na raiz do payload. Para uma extração `cadeia`, o campo "Nível de ajuda" do formulário grava `payload_editado.nivel_ajuda` na raiz — mas a cadeia guarda nível **por etapa**, dentro de `etapas[]`, e ninguém lê a chave da raiz (`resumo.ts:103-114` itera `p.etapas`).

Ou seja: o coordenador corrige o nível de ajuda de uma cadeia, o sistema responde "Salvar correção" com sucesso, grava `payload_editado`, incrementa `versao` — e a correção **não aparece em lugar nenhum**. Mesma família de `#553`/`#567`: escrita e leitura discordando sobre a forma do jsonb, sem erro visível. Vale medir se o mesmo vale para `registro_abc` e os subtipos de TCC.

---

## G-3 · Onde a etapa é persistida: linha em `evidence` ou tabela própria?

**Medido**: `evidence` exige `session_numero`, `alvo_ordinal`, `classificacao_original` jsonb, e é **append-only** (UPDATE/DELETE revogados de `app_role`, `schema.ts:1362-1363`). A view `evidence_current` (`0014_fase4_evidence_rls.sql:139-153`) calcula `classificacao_atual` e `invalidada` a partir de `evidence_revision`. `materializar.ts:601` descarta qualquer evidência sem `goal_id`.

| Opção                                                                         | Consequência                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a)** Cada etapa = uma linha em `evidence`                                  | Herda de graça: RLS, `evidence_current`, revisão/invalidação, materialização, hexágono. Sem migração de tabela. Mistura "etapa de rotina" com "alvo de evidência" na mesma tabela — a semântica de `alvo_ordinal` passa a ser dupla. |
| **(b)** Tabela nova `chain_step` (ou similar) + FK a `evidence`               | Semântica limpa. Custo: migração com RLS, `FORCE RLS`, policy `TO app_role`, grants por coluna, e **toda** a pipeline de materialização/hexágono a reconstruir para a tabela nova. Esforço sobe de M para L.                         |
| **(c)** Linha em `evidence` só para etapas ancoradas; o resto fica no payload | Menor volume. Cria dois lugares onde a mesma coisa vive — o padrão que gerou #553/#567.                                                                                                                                              |

**Recomendação técnica**: (a). É a única opção em que a feature muda a tela sem reescrever a materialização. A duplicidade semântica de `alvo_ordinal` se resolve com comentário no schema e com o subtipo na `classificacao_original`.

**Pergunta direta**: aceita que uma etapa de cadeia seja, no banco, uma linha de `evidence` como qualquer outro alvo?

---

## G-4 · O que a cadeia muda na tela?

**Medido**: o hexágono lê `session_snapshot.repertorio_state` (`timeline/queries.ts:244-249` → `computarDadosEspectro`). A barra de marcos **não** lê snapshot: conta metas por `goal.estado` + `goal_candidacy` (`timeline-client.tsx:643-649`). `renderGraficoProtocolo` é uma closure interna, não exportada (`timeline-client.tsx:578`).

| Opção                                                       | Consequência                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** Só hexágono/repertório (via `goal_id` da âncora)    | Caminho já existente; nenhuma superfície nova. A cadeia "some" dentro da média do eixo — o coordenador não vê que houve rotina.         |
| **(b)** Hexágono + bloco próprio de rotinas na aba Evolução | O ganho por etapa fica visível ao longo das sessões. Superfície nova → precisa de DS, a11y, teste por papel e teste de alcance de rota. |
| **(c)** Só bloco de rotinas, sem tocar o hexágono           | Isola o risco. Mas então `PR-04` não é fechado como escrito ("alimentar `renderGraficoProtocolo`").                                     |

**Recomendação técnica**: (b), com o bloco de rotinas como entrega separável — a persistência (R2) e o hexágono (R3) podem mergear antes.

**Pergunta direta**: o coordenador precisa **ver a rotina como rotina** (etapa a etapa, ao longo das sessões), ou basta ela empurrar o eixo do hexágono?

---

## G-5 · Cadeias já aprovadas: backfill ou linha de corte?

**Medido**: as cadeias aprovadas até hoje vivem em `extraction.payload` com estado `aprovada`, e **nenhuma** tem âncora — o campo não existia. Não dá para inferir a meta a partir do texto sem chamar o agente de novo.

| Opção                                                                 | Consequência                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **(a)** Linha de corte: só cadeias novas participam                   | Zero risco. Paciente antigo tem buraco permanente na leitura de rotina.               |
| **(b)** Reprocessar extrações antigas pelo agente para obter a âncora | Custo de API, e reprocessamento reabre R1-R19 e a revisão humana de dado já aprovado. |
| **(c)** Âncora manual pelo coordenador, sob demanda                   | Sem custo de IA, mas é trabalho humano por linha e superfície nova.                   |

**Recomendação técnica**: (a). Coerente com o precedente da anamnese marco-zero, que também não retroagiu.

**Pergunta direta**: aceita que pacientes já em atendimento não tenham histórico de rotina, só do ponto de corte em diante?

---

## G-6 · Nível de ajuda fora da taxonomia do protocolo

**Medido**: `cadeia.etapas[].nivel_ajuda` é **string livre** do agente (`output-schema.json:104-110`). A pipeline converte por `taxonomia.indexOf(nivelAjuda)` (`materializar.ts:576-584`) — string desconhecida devolve `-1`. `progressoDoAlvo` (`espectro.ts:185-206`) devolve `null` sem ordinal, e `computarDadosEspectro` já tem a contagem `naoClassificados`.

| Opção                                                                      | Consequência                                                                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **(a)** Etapa fora da taxonomia entra como não classificada, e é reportada | Fail-closed e honesto. Precisa de uma superfície que mostre a contagem — senão o silêncio volta por outra porta.           |
| **(b)** Recusar a aprovação da extração inteira                            | Força o dado limpo. Mas transforma em bloqueio um fluxo que hoje funciona, e o coordenador não tem como corrigir o agente. |
| **(c)** Restringir `nivel_ajuda` a enum no contrato do agente              | Elimina a classe de erro na origem. A taxonomia varia **por protocolo** — um enum global não representa isso.              |

**Recomendação técnica**: (a). (c) é atraente e falso: a taxonomia é por protocolo, então o enum teria de ser dinâmico.

**Pergunta direta**: onde o coordenador deve ver "3 etapas não classificadas" — no resumo da revisão, na aba Evolução, ou em nenhum dos dois?

---

## Decisões já implícitas nesta rodada (não precisam de resposta, mas registre discordância)

| Id      | Decisão                                                                                                 | Base                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D-558-1 | A feature é "cadeia **por etapa / nível de ajuda**", não "por percentual" — título da issue está errado | `output-schema.json:97-112` não tem percentual; R9 fala em nível de ajuda por etapa                   |
| D-558-2 | Escopo é `protocol_driven` apenas                                                                       | `conventional` tem `temEvolucao: false`; `cognitive_behavioral` lê por `tcc` (`modalidade.ts:54-116`) |
| D-558-3 | Os outros subtipos barrados pelo mesmo early-return ficam fora                                          | Cada um tem semântica própria; ver "Out of Scope" da spec                                             |
| D-558-4 | Cadeia sem âncora continua aprovável                                                                    | Não transformar em erro um fluxo que hoje funciona                                                    |
