# Anamnese estruturada como marco 0 da linha do tempo — Especificação

> Issue [#407](https://github.com/romulosutil/Iris/issues/407) · Prioridade `P1 · antes de dado real` · Modalidade: `protocol_driven` apenas.
>
> Decisões de contexto (as 11 áreas cinzentas fechadas, com medição): [`context.md`](./context.md). **Ler antes de projetar ou implementar.**

## Problem Statement

Todo gráfico da aba Evolução nasce na primeira sessão realizada. Não existe estado inicial contra o qual comparar: o ganho da Sessão 1 é literalmente incomparável, e o hexágono de um paciente novo é honestamente vazio nos seis eixos até a primeira evidência aprovada — correto e inútil.

As Tasks 1 a 5 do plano de Evolução fizeram o gráfico **parar de mentir**. Elas não fizeram o gráfico ter **origem**. Cada paciente onboardado antes desta feature é um paciente cujo gráfico nunca terá marco 0 sem retroagir data à mão.

## Goals

- [ ] Um paciente `protocol_driven` com anamnese validada tem hexágono populado **antes** da primeira sessão realizada.
- [ ] O delta da Sessão 1 compara contra o marco 0, não contra `null`.
- [ ] Todo nível de partida exibido carrega procedência visível (quem afirmou aquilo).
- [ ] Eixo não coberto pela anamnese permanece `null` na tela — nunca `0`, nunca preenchido por dedução.
- [ ] A anamnese não altera o faturamento do paciente.

## Out of Scope

| Item                                                   | Razão                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anamnese para `cognitive_behavioral`                   | D-G. TCC tem entrada viável por `instrumento_aplicacao` (`session_id` já nullable, `0113:22`), mas o enum `instrumento_tipo` só tem `phq9`/`gad7`. Dívida separada. |
| Anamnese para `conventional`                           | D-G. A modalidade decidiu em 20/08/2026 não ter leitura de evolução (`modalidade.ts:9-11,43`): métrica derivada seria certeza fabricada.                            |
| Extração da anamnese por IA                            | A anamnese é preenchida e validada por humano. Ligar o agente aqui é feature própria, e reabre R1-R19.                                                              |
| Tabela `milestone_assessment`                          | Não existe no schema (medido: 0 ocorrências em `schema.ts` e `db/migrations/`), só em docs e em 3 stubs que devolvem array vazio. Criá-la é escopo próprio.         |
| Edição de anamnese validada                            | D-F: append-only. Correção é anamnese complementar (linha nova), não UPDATE.                                                                                        |
| Corrigir `app_proximo_numero_sequencial` (resíduo D16) | Achado colateral, `NÃO MEDIDO` em `pg_proc`. Issue própria — ver fim de `context.md`.                                                                               |

---

## User Stories

### P1: Coordenador registra e valida a anamnese ⭐ MVP

**User Story**: Como coordenador, quero registrar a anamnese estruturada de um paciente novo e validá-la, para que a linha do tempo dele comece na avaliação inicial e não na primeira sessão.

**Why P1**: sem isto a feature não existe. É o único ato que cria o marco 0.

**Acceptance Criteria**:

1. WHEN um usuário com papel `terapeuta` ou `coordenador` preenche a anamnese THEN o sistema SHALL persistir a linha em `estado = 'rascunho'` sem criar nenhuma `goal` e sem criar nenhum `session_snapshot`.
2. WHEN um usuário com papel `coordenador` valida a anamnese THEN o sistema SHALL, na mesma transação, criar as `goal` em `estado = 'ativa'`, gravar `session_snapshot` com `session_numero = 0`, e mover a anamnese para `estado = 'validada'`.
3. WHEN um usuário com papel `terapeuta` tenta validar THEN o sistema SHALL recusar e nada SHALL ser criado.
4. WHEN o paciente não tem `patient_protocol` ativo com `taxonomia_ajuda` não vazia THEN a validação SHALL falhar com erro nomeado e NENHUM snapshot 0 SHALL ser gravado.
5. WHEN o paciente não é `protocol_driven` THEN a anamnese SHALL ser inacessível — gate por igualdade explícita, nunca por negação de `conventional`.
6. WHEN a anamnese gera mais de 24 alvos THEN o sistema SHALL recusar com erro nomeado.
7. WHEN o consentimento do paciente está revogado THEN a validação SHALL falhar (`app_prontuario_somente_leitura`).

**Independent Test**: criar paciente `protocol_driven` com protocolo ativo, preencher anamnese como terapeuta, tentar validar como terapeuta (recusa), validar como coordenador, e ver `session_snapshot` com `session_numero = 0` existir onde antes não existia.

---

### P1: O marco 0 aparece na linha do tempo como "Anamnese" ⭐ MVP

**User Story**: Como terapeuta, quero ver o ponto de partida na aba Evolução rotulado como anamnese, para saber contra o que a Sessão 1 está sendo comparada.

**Why P1**: um snapshot 0 que a UI não sabe renderizar é trabalho invisível. E há dois bugs ativos que o impedem de aparecer.

**Acceptance Criteria**:

1. WHEN a linha do tempo contém o ponto 0 THEN a UI SHALL rotulá-lo **"Anamnese"** em todas as 13 ocorrências hoje hardcoded como `Sessão {n}`, e NUNCA "Sessão 0".
2. WHEN `sessaoAtiva === 0` THEN o painel de delta SHALL carregar normalmente — hoje `timeline-client.tsx:323` faz `if (!sessaoAtiva) return;` e o zero é falsy, então o painel nunca carrega.
3. WHEN o paciente tem apenas o marco 0 e nenhuma sessão THEN o scrubber SHALL abrir nele — hoje `timeline-client.tsx:91-92` cai em `?? 1`.
4. WHEN o usuário abre o delta da Sessão 1 THEN o sistema SHALL comparar contra o marco 0 — hoje `queries.ts:313` faz `sessionNumero > 1 ? … : null` e devolveria `null` mesmo com o marco 0 existindo.
5. WHEN um eixo não foi coberto pela anamnese THEN o vértice SHALL permanecer `null` e a tela SHALL dizer que não há medida, nunca renderizar `0`.
6. WHEN o usuário inspeciona um nível de partida THEN a procedência SHALL estar visível (relatado pelo responsável / observado pelo avaliador / registro anterior).

**Independent Test**: paciente com anamnese validada e zero sessões abre a aba Evolução, vê o hexágono populado e o ponto rotulado "Anamnese"; nenhum "Sessão 0" na tela.

---

### P2: Anamnese complementar cobre eixo que ficou de fora

**User Story**: Como coordenador, quero registrar uma anamnese complementar quando um eixo não pôde ser avaliado na primeira entrevista, sem reescrever o marco 0 original.

**Why P2**: o caminho feliz não depende disto, mas sem ele a única saída é editar o passado — que é o que D-E e D-F proíbem.

**Acceptance Criteria**:

1. WHEN uma anamnese já validada recebe complemento THEN o sistema SHALL criar uma linha nova, e a original SHALL permanecer legível e inalterada.
2. WHEN existem várias anamneses validadas THEN a vigente SHALL ser a de maior `validada_em`, com `id` como desempate secundário, nunca `criado_em`.
3. WHEN a mesma anamnese é validada duas vezes THEN o sistema SHALL recusar a segunda.

**Independent Test**: validar, complementar, e conferir que o `repertorio_state` do snapshot 0 ganhou o eixo novo enquanto a linha original continua consultável.

---

### P3: Sugestão de protocolo e nível de entrada

**User Story**: Como coordenador, quero que a anamnese sugira o protocolo e o nível de entrada (ex.: VB-MAPP Nível 1), para não escolher do zero.

**Why P3**: economiza trabalho, não desbloqueia nada. O marco 0 funciona com o coordenador escolhendo à mão.

**Acceptance Criteria**:

1. WHEN a anamnese é preenchida THEN o sistema SHALL sugerir protocolo e nível, e a sugestão SHALL ser sempre editável antes da validação.
2. WHEN o coordenador aceita a sugestão THEN o sistema SHALL registrar que o valor veio de sugestão, não de escolha direta.

---

## Edge Cases

Todos medidos e detalhados em `context.md` §D-I.

- WHEN o paciente não tem protocolo ativo THEN validação falha com erro nomeado (o hexágono seria `null` de qualquer forma: `queries.ts:172` → `Math.max(0, -1) = 0`, e `espectro.ts:203-204` exige `> 0`).
- WHEN o paciente já tem sessões e recebe anamnese depois THEN permitido; o marco 0 entra atrás dos snapshots existentes.
- WHEN uma `goal` gerada pela anamnese é excluída THEN a chave órfã no `repertorio_state` SHALL ser ignorada sem erro (`goal_milestone_mapping` é `ON DELETE cascade`, `schema.ts:1173`).
- WHEN o paciente está arquivado THEN a validação desarquiva com origem `"validacao_anamnese"` — membro novo em `OrigemDesarquivamento` (`src/lib/patient/desarquivamento.ts:6-15`), senão a trilha registra motivo errado.
- WHEN `materializarSnapshot` roda depois da anamnese THEN o snapshot 0 SHALL sobreviver (`materializar.ts:493-498` só materializa números vindos de `evidence`; nenhum caller passa `desdeNumero = 0`).
- WHEN o paciente é expurgado (LGPD) THEN a anamnese SHALL ser removida junto pelo `ON DELETE cascade`, sem editar `app_purgar_paciente`.

---

## Requirement Traceability

| ID      | Story                                                                                 | Fase   | Status  |
| ------- | ------------------------------------------------------------------------------------- | ------ | ------- |
| ANAM-01 | P1 registro · tabela `anamnese` + RLS padrão `0113`, `patient_id` `ON DELETE cascade` | Design | Pending |
| ANAM-02 | P1 registro · `estado` enum `('rascunho','validada')`; rascunho não cria nada         | Design | Pending |
| ANAM-03 | P1 registro · `validarAnamneseAction` exclusiva de coordenador                        | Design | Pending |
| ANAM-04 | P1 registro · definer que grava `session_snapshot` nº 0                               | Design | Pending |
| ANAM-05 | P1 registro · gate `protocol_driven` por igualdade explícita                          | Design | Pending |
| ANAM-06 | P1 registro · gate de protocolo ativo com `taxonomia_ajuda` não vazia                 | Design | Pending |
| ANAM-07 | P1 registro · gate de consentimento (`app_prontuario_somente_leitura`)                | Design | Pending |
| ANAM-08 | P1 registro · teto de 24 alvos                                                        | Design | Pending |
| ANAM-09 | P1 registro · **mutação**: validar FAZ o snapshot 0 existir                           | Design | Pending |
| ANAM-10 | P1 registro · **mutação**: salvar rascunho NÃO faz                                    | Design | Pending |
| ANAM-11 | P1 registro · `OrigemDesarquivamento` ganha `"validacao_anamnese"`                    | Design | Pending |
| ANAM-12 | P2 · append-only; segunda validação recusada; sem `ON CONFLICT DO UPDATE` cego        | Design | Pending |
| ANAM-13 | P1 registro · snapshot 0 sobrevive à rematerialização                                 | Design | Pending |
| ANAM-14 | P1 UI · rótulo "Anamnese" nas 13 ocorrências de `Sessão {n}`                          | Design | Pending |
| ANAM-15 | P1 UI · `sessaoAtiva === 0` carrega o delta (falsy-zero, `timeline-client.tsx:323`)   | Design | Pending |
| ANAM-16 | P1 UI · scrubber abre no marco 0 (`timeline-client.tsx:91-92`)                        | Design | Pending |
| ANAM-17 | P1 UI · delta da Sessão 1 compara com o 0 (`queries.ts:313`)                          | Design | Pending |
| ANAM-18 | P1 UI · eixo não coberto fica `null`, nunca `0`                                       | Design | Pending |
| ANAM-19 | P1 UI · procedência visível, dentro do `repertorio_state`                             | Design | Pending |
| ANAM-20 | P2 · anamnese complementar; vigente por `validada_em` + `id`                          | Design | Pending |
| ANAM-21 | P3 · sugestão de protocolo e nível, sempre editável                                   | -      | Pending |

**Cobertura:** 21 requisitos, 0 mapeados para tasks. Design ainda não feito.

---

## Success Criteria

- [ ] Paciente `protocol_driven` novo, com anamnese validada e **zero sessões**, abre a aba Evolução e vê o hexágono populado com os eixos que a anamnese cobriu.
- [ ] Nenhuma tela mostra "Sessão 0".
- [ ] Eixo não coberto aparece como sem medida — `grep` por conversão de `null` para `0` no caminho do marco 0 devolve zero.
- [ ] Validar a anamnese **não** altera o resultado de `billing_apurar_ciclo` para o paciente no ciclo corrente. Teste de integração explícito, porque foi o motivo de descartar o desenho alternativo em D-A.
- [ ] `pnpm test:rls` cobre a tabela nova com role não-superusuária, e a contagem de arquivos executados é conferida (verde com "skipped" não conta).
- [ ] Delta da Sessão 1 deixa de ser `null` para paciente com marco 0.

---

## Gates antes da label `jules`

1. ⚠️ **Consentimento (D-H) — bloqueante.** Verificar com o Rômulo se o termo vigente em `docs/legal/` cobre o responsável relatando dado sobre si e sobre terceiros da família. `docs/legal/` exige confirmação do Rômulo antes de qualquer leitura ou mudança. Se não cobrir, é tipo novo de consentimento antes de coletar dado real — mesma classe do gap das issues #98/#99.
2. Fase **Design** e **Tasks** do `/tlc-spec-driven` ainda não executadas. A issue #407 não pode receber a label enquanto os 21 requisitos não estiverem mapeados para tasks atômicas com verificação.
