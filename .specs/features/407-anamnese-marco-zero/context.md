# Anamnese como marco 0 — decisões de contexto

> Issue [#407](https://github.com/romulosutil/Iris/issues/407). Origem: Task 6 do plano `docs/superpowers/plans/2026-08-20-evolucao-por-modalidade-e-cobertura-de-evidencia.md`.
>
> Este arquivo existe para fechar o checklist de handoff (`AGENTS.md` §5.2) **antes** da label `jules`. Regra pós-mortem #285/PR #295: RCA impecável com Design incompleto gerou 9 achados na revisão pós-PR, porque o executor autônomo escolheu no lugar do Design. Nada aqui pode ficar "a validar".

Todas as medições citadas são de código lido em 20/08/2026, com `arquivo:linha`. O que não foi medido está marcado como tal e é gate explícito.

---

## D-A — Onde vive a linha de base

**Decidido (Rômulo, 20/08/2026): tabela `anamnese` nova, que escreve `session_snapshot` nº 0 através de uma função `SECURITY DEFINER`.**

**Por que não a alternativa "`session` real com `numero_sequencial_paciente = 0`", que era a mais barata em schema:** ela cobraria o cliente. `billing_apurar_ciclo` (`db/migrations/0075_billing_pos_pago.sql:99-133`) marca o paciente como ativo no ciclo por

```sql
EXISTS (SELECT 1 FROM session s WHERE s.patient_id = p.id
        AND (s.agendada_para … OR s.check_in_em … OR s.criado_em …) dentro do ciclo)
```

(`0075:111-118`) — **sem filtrar `tipo`, `estado` nem `numero_sequencial_paciente`**. E como `session.criado_em` é `defaultNow()`, nem empurrar `agendada_para` para fora do ciclo escaparia: o ramo `criado_em` pega. `agendada_para` é NOT NULL, então não existe sessão sem data. Consumido em `src/lib/billing/subscription.ts:530,696` e precificado em `src/lib/billing/calculator.ts:128,167`. Uma anamnese registrada passaria a faturar o paciente naquele ciclo, e a sessão fantasma ainda apareceria na agenda.

**Por que não "tabela nova sem snapshot, hexágono lê direto":** `obterSnapshotAsOf(tx, patientId, 0)` devolveria `null` e `carregarDeltaSessaoAction` quebra; scrubber e trajetória passariam a ter duas fontes de verdade.

**Consequência aceita:** o `repertorio_state` do snapshot 0 passa a ter **dois produtores** — a action de anamnese e `src/lib/evidence/materializar.ts`. Mitigação obrigatória, medida: `materializar.ts:493-498` monta `numerosAMaterializar` **só a partir de números presentes em `evidence`**, e nenhum caller passa `desdeNumero = 0` (`revisao/[sessionId]/logic.ts:196-200` passa `sess.numero`; `validacao/logic.ts:310-314` passa `s.sessionNumero`). O snapshot 0 portanto **sobrevive** a qualquer rematerialização. Isso não é sorte — é invariante, e vira teste (`ANAM-13`).

**Numeração de sessão não é afetada, por razão mais forte que a registrada na issue:** `app_proximo_numero_sequencial` (`db/migrations/0007_session_numero_seq.sql`) lê `FROM session`, não `session_snapshot`. Um snapshot 0 é invisível para ela em qualquer cenário.

## D-B — Quem valida, e o que "validado" significa mecanicamente

**Decidido: coluna de estado na `anamnese` + Server Action separada, exclusiva de coordenador, que é o único caminho que dispara o definer do snapshot 0.**

Não existe primitivo de validação reusável para isto. Medido: `instrumento_aplicacao` **não tem estado de validação nenhum** (`src/db/schema.ts:2223-2270`) — grava direto. A fila `/validacao` (`src/app/(app)/validacao/logic.ts`) é acoplada a `evidence`, e a linha de base não é `evidence` (D-A). E hoje **terapeuta também cria meta** (`src/app/(app)/pacientes/[id]/metas/logic.ts:41`: `requireRole(ctx, "coordenador", "terapeuta")`) — a exclusividade do coordenador aqui é decisão nova, não herança.

Mecânica: `anamnese.estado` enum `('rascunho','validada')`. Terapeuta e coordenador preenchem o rascunho; só coordenador executa `validarAnamneseAction`. A validação é o **único** ato que (a) cria as `goal`, (b) grava o snapshot 0. Antes dela, nada existe na linha do tempo.

Isto torna escrevível a régua de mutação por comportamento (§5.2.5): **dois comportamentos, dois testes** — validar faz o snapshot 0 passar a existir; salvar rascunho **não** faz. `ANAM-09` e `ANAM-10`.

## D-C — A anamnese gera alvos

**Decidido: gera `goal` em estado `ativa`.**

A medição força a mão, e é o motivo de "só sugerir" ter sido descartado: `computarDadosEspectro` (`src/lib/evidence/espectro.ts:220-277`) não plota nada sem `goal` em `ativa`/`dominada` (`espectro.ts:207-209`, `:232`). `contaComoAlvo` **exclui `rascunho`** (`espectro.ts:208`), então gerar em rascunho também deixa o hexágono 100% `null`. Qualquer opção que não crie meta ativa não entrega a DoD da issue ("hexágono com os seis eixos populados") — entregaria um marco 0 invisível.

**Efeito colateral medido, que o executor precisa tratar:** `criarMeta` chama `desarquivarPacienteSeArquivado(tx, ctx, patientId, "criacao_meta")` (`metas/logic.ts:69-74`). A união `OrigemDesarquivamento` (`src/lib/patient/desarquivamento.ts:6-15`) precisa de um membro novo — `"validacao_anamnese"` — senão a trilha de auditoria registra o motivo errado. Ver `ANAM-11`.

**Limite (§5.2.1):** no máximo **24 alvos** por anamnese (4 por eixo × 6 eixos). Acima disso a action rejeita com erro nomeado. O número é arbitrário e está aqui de propósito: sem teto declarado o executor escolhe um, ou nenhum, e `criarMeta` hoje não tem limite algum.

## D-D — Procedência do nível de partida

**Decidido: enum de procedência POR ALVO, copiando o shape de `instrumento_aplicacao.fonte_do_escore`, e a procedência entra DENTRO do `repertorio_state` do snapshot 0.**

Precedente medido: `fonte_do_escore` é enum NOT NULL `('paciente_informou','terapeuta_calculou_na_sessao','nao_informado')` (`db/migrations/0113_instrumento_aplicacao.sql:1`). O repo já resolveu "quem afirmou o número" com uma coluna de enum por linha, não com uma tabela à parte.

Valores para a anamnese: `('relatado_responsavel','observado_avaliador','registro_anterior')`.

**Por que "dentro do `repertorio_state`" não é detalhe de implementação:** `computarDadosEspectro` consome apenas `nivel_ajuda_recente`, `contagem` e `is_candidata` do jsonb (`espectro.ts:96-100`) e **descarta o resto**. Se a procedência ficar só na tabela `anamnese`, a tela do hexágono não tem como cumprir o item 6 da issue ("procedência visível") sem uma segunda consulta que hoje não existe. `repertorio_state` é jsonb **sem schema declarado** (`schema.ts:1372`) — a chave tem que ser nomeada aqui, ou o executor inventa uma.

Chave acordada, acrescentada por alvo no snapshot 0: `"origem": "anamnese"` e `"procedencia": "<enum acima>"`.

## D-E — Eixo não coberto pela anamnese

**Decidido: `null` imutável. Não existe "completar depois" dentro da mesma anamnese.**

Dois precedentes medidos apontam para o mesmo lugar: `instrumento_aplicacao.item_risco_positivo` é `boolean` **sem `.default(false)`**, com comentário explícito em `schema.ts:2248-2251` ("`null` ≠ `false`: item de risco não respondido é distinto de 'respondeu 0/negou'"); e `espectro.ts:264` já devolve `null`, não `0`, para eixo sem medida.

Descartado o UPDATE in-place no jsonb do snapshot 0: reescreveria o passado sem trilha, exatamente o que `espectro.ts:186-190` documenta como proibido ("usá-lo como atalho para 100 reescreveria as sessões passadas"). Cobertura posterior de um eixo = anamnese complementar, que é uma linha nova (D-F).

## D-F — Versionamento

**Decidido (Rômulo): append-only, no padrão `consent`.**

`REVOKE UPDATE, DELETE ON anamnese FROM app_role` depois de validada. Precedente: `consent` (`schema.ts:456-470`), onde revogação é linha nova, não UPDATE. Precedente oposto que existe no repo e foi descartado: `instrumento_aplicacao` concede UPDATE com policy (`0113:35,57-65`).

**O risco concreto que isso fecha, medido:** `app_aplicar_snapshot` faz `ON CONFLICT (patient_id, session_numero) DO UPDATE` (`db/migrations/0094_fechar_guard_papel_identidade.sql:66-71`). Reescrever o snapshot 0 é hoje trivial e **silencioso** — todo gráfico histórico se deslocaria sem rastro e nenhum teste atual pegaria. Por isso o definer novo (D-A) **não** pode reusar o `ON CONFLICT DO UPDATE` cegamente: ver `ANAM-12`.

Desempate determinístico entre versões: a anamnese validada mais recente por `validada_em`, com `id` como desempate secundário. Nunca `criado_em`.

## D-G — Modalidade

**Decidido (Rômulo): só `protocol_driven`.**

`conventional` já decidiu não ter aba Evolução — `src/app/(app)/pacientes/[id]/modalidade.ts:43`, com a razão registrada em `:9-11` ("acompanhamento é narrativo, em `Temas`. Métrica derivada de registro empírico seria certeza fabricada"). Dar marco 0 a ele contradiz uma decisão de 20/08/2026 tomada quatro horas antes desta.

`cognitive_behavioral` renderiza `evolucao-tcc.tsx`, não o hexágono (`modalidade.ts:37`), e já tem entrada de linha de base viável por `instrumento_aplicacao` — onde `session_id` é **nullable** (`0113:22`). Fica **fora de escopo aqui**, registrado como dívida: o enum `instrumento_tipo` só tem `('phq9','gad7')` (`0113:2`), então uma anamnese ampla de TCC não cabe sem enum novo.

**Atenção ao default, medido:** `patient.clinical_modality` é NOT NULL com default `'protocol_driven'` (`schema.ts:408-410`), e `modalidade.ts:58-63` trata modalidade desconhecida como `protocolo`. O gate de modalidade da anamnese tem que ser **explicitamente** `=== 'protocol_driven'`, nunca "não é conventional".

## D-H — Consentimento

**Decidido: a anamnese respeita revogação — gate por `app_prontuario_somente_leitura(patient_id)`.**

Isto é uma escolha, não herança, e o repo é ambíguo: `app_aplicar_snapshot` **tem** o guard (`0094:60-62`), mas `0103_tcc_rpd_entry.sql` e `0113_instrumento_aplicacao.sql` **não têm** (medido: `grep -c app_prontuario_somente_leitura` = 0 nos dois). Como a anamnese escreve em `session_snapshot`, seguir o padrão do snapshot é o coerente.

> ⚠️ **Gate aberto, NÃO MEDIDO — resolver com o Rômulo antes da label `jules`.** O enum `consent_tipo` (`schema.ts:53-61`) tem `tratamento_dados_menor`, que cobre o responsável legal assinando pelo menor. Não foi verificado se o **texto do termo vigente em `docs/legal/`** cobre o responsável **relatando dado sobre si próprio ou sobre terceiros da família** durante a entrevista de anamnese — que é dado pessoal de quem não assinou nada. `docs/legal/` está na lista de "confirmar com o Rômulo antes" do `CLAUDE.md`; não abri o arquivo. Se o termo não cobrir, a anamnese precisa de tipo de consentimento novo (mesma classe do gap já registrado nas issues #98/#99) **antes** de coletar dado real.

## D-I — Bordas nomeadas (§5.2.4)

Cada uma é verificável hoje e vira teste. Nenhuma é hipotética.

| Borda                                                  | Medição                                                                                                                                                         | Comportamento exigido                                                                                                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paciente **sem protocolo ativo**                       | `queries.ts:172` faz `Math.max(0, taxonomia.length - 1)` → `0`; `espectro.ts:203-204` exige `> 0`                                                               | Hexágono fica `null` **mesmo com anamnese perfeita**. A validação da anamnese SHALL falhar com erro nomeado se não houver `patient_protocol` ativo com `taxonomia_ajuda` não vazia. Não gravar snapshot 0 inútil. |
| Paciente que **já tem sessões** recebe anamnese depois | `queries.ts:313`: `sessionNumero > 1 ? obterSnapshotAsOf(…, n-1) : null`                                                                                        | Permitido. Mas o delta da Sessão 1 só passa a comparar contra o marco 0 depois de `queries.ts:313` mudar — parte do escopo.                                                                                       |
| **Anamnese validada duas vezes**                       | `ON CONFLICT DO UPDATE` (`0094:66-71`) sobrescreve em silêncio                                                                                                  | Rejeitar. Append-only (D-F): segunda validação da mesma anamnese é erro; correção é anamnese complementar nova.                                                                                                   |
| Meta gerada pela anamnese e depois **excluída**        | `goal_milestone_mapping` é `ON DELETE cascade` no `goal_id` (`schema.ts:1173`)                                                                                  | Snapshot 0 fica com chave órfã no jsonb. `computarDadosEspectro` já tolera (o alvo some de `alvos`, a chave do `repertorio_state` é ignorada). Vira teste, não vira código novo.                                  |
| Paciente **arquivado** recebe anamnese                 | `desarquivamento.ts`                                                                                                                                            | Desarquiva, com origem `"validacao_anamnese"` (D-C).                                                                                                                                                              |
| `session_numero = 0` na UI                             | `timeline-client.tsx:323` (`if (!sessaoAtiva) return;` — falsy-zero) e `:91-92` (`?? 1`)                                                                        | **Bug ativo**: com `sessaoAtiva === 0` o painel de delta nunca carrega. Paciente novo só com marco 0 cai nisso imediatamente. Escopo obrigatório.                                                                 |
| Rótulo "Sessão 0"                                      | 13 ocorrências hardcoded: `scrubber.tsx:110,130,173,174`; `timeline-client.tsx:505,507,543,717,734,769,771,783,853`; `grafico-espectro.tsx:152,277,284,299,355` | Ponto 0 SHALL ser rotulado "Anamnese", nunca "Sessão 0".                                                                                                                                                          |

## D-J — Convenção de estilo do arquivo-alvo (§5.2.6)

- Docblocks explicam **por quê**, não o quê, e nomeiam a decisão anterior que substituem. Modelos: `src/lib/evidence/espectro.ts:1-42` e `src/app/(app)/pacientes/[id]/modalidade.ts:1-12`.
- Migração escrita à mão comenta a escolha de GRANT-vs-definer e **cita a migração-fonte do predicado copiado**. Modelos: `0113:27-35`, `0103:38-42`.
- Copy e documentação em pt-BR; mensagens de commit em inglês. Para o Jules, PR/issue/plano em pt-BR.
- `role="alert"` é reservado a risco clínico. Aviso de validação, de modalidade ou de carregamento usa `role="status"`.

## D-K — Higiene de execução (§5.2.7 e §7)

- `pnpm format` reformata o repositório inteiro, incluindo worktrees aninhados. Formatar **só os arquivos tocados**: `npx prettier --write <arquivo>`.
- DoD: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls`, `src/db/migrations.test.ts`, Storybook para componente novo de UI.
- ⚠️ Testes de integração são `*.int.test.ts` e **exigem** `--config vitest.integration.config.ts`. `vitest run` **coleta zero e sai verde**. Conferir a contagem, nunca o verde.
- Testes existentes que o marco 0 pode quebrar, e que o executor tem que rodar: `db/tests/fase4-snapshot-rls.int.test.ts`, `db/tests/fase4-materializar.int.test.ts`, `src/app/(app)/pacientes/[id]/timeline/queries.int.test.ts`, `src/lib/evidence/espectro.test.ts`.
- Migração: próximo arquivo é **`0115_<nome>.sql`**. Última entrada do journal é `idx: 114`, tag `0114_alerta_risco_instrumento_aplicacao_anchor`, `when: 1787099343349`. Tabela nova → `pnpm db:generate` primeiro (gera `.sql` + `meta/0115_snapshot.json` + journal automático), **depois** editar o `.sql` gerado acrescentando GRANT/RLS/policies **sem tocar no snapshot**. Se por algum motivo a entrada for manual, `when` = `1787100343349` (anterior + 1000) — abaixo disso o Drizzle pula o arquivo em silêncio.
- RLS: helper de tenant é **`app_clinic_id_exigido()`** (`0085_policies_tenant_helper.sql:78-88`). Nunca `current_setting('app.clinic_id')::uuid` cru — o guard `db/tests/clinic-id-helper-rls.int.test.ts` varre `pg_policies` + `pg_proc` + `pg_views` e quebra o CI. Nunca `app_clinic_id_atual()` em predicado de isolamento.
- Padrão canônico de policy a copiar: `0113_instrumento_aplicacao.sql:27-69` (que copia literal de `0103_tcc_rpd_entry.sql:33-67`).
- **`patient_id` da tabela nova SHALL ser `ON DELETE cascade`.** Medido: `app_purgar_paciente` (`0094:138-206`) termina em `DELETE FROM patient` (`:203`) e por isso não precisa citar `instrumento_aplicacao` nem `tcc_rpd_entry`. Com `cascade`, o expurgo LGPD cobre a anamnese **sem editar a função**. Com `restrict`, seria obrigatório entrar na lista de DELETEs em `0094:177-201` — uma migração a mais, mexendo em função de expurgo em produção.

---

## Achado colateral, fora de escopo — registrar como issue própria

`app_proximo_numero_sequencial` (`0007_session_numero_seq.sql`) usa `current_setting('app.clinic_id')::uuid` **cru**, sem `app_clinic_id_exigido()`. Nenhuma migração posterior a redefine em `db/migrations/` (`0085`, `0087` e `0094` não a tocam) — o que a torna candidata a resíduo do débito D16.

**NÃO MEDIDO em banco vivo.** Antes de abrir como bug, medir em `pg_proc`: `CREATE OR REPLACE` torna o diff enganoso, e já houve um débito improcedente (#216) por citar `NNNN:linha` de corpo morto.
