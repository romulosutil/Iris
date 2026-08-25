# Expurgo de prontuário expirado — Especificação

> Issue [#352](https://github.com/romulosutil/Iris/issues/352) · Fatia 6.3 (wiring) · Prioridade `P1 · antes de dado real`
>
> **Decisões fechadas e armadilhas medidas: [`context.md`](./context.md). Ler antes de projetar ou implementar.**
> Arquitetura: [`design.md`](./design.md) · Tasks: [`tasks.md`](./tasks.md)

## Problem Statement

O banco sabe expurgar prontuário vencido desde a migração `0045`. O produto não sabe.

`app_purgar_paciente` e `app_paciente_expurgavel` existem, foram revisadas em PR e estão cobertas por teste — e **nenhuma linha de TypeScript as chama**. Hoje o expurgo de um prontuário cujo prazo legal de guarda venceu só sai por `psql` manual em produção, escrito à mão, por uma pessoa, sem fila, sem conferência e sem aviso à clínica.

E o mecanismo tem três defeitos que só aparecem quando alguém tenta usá-lo de verdade:

1. **A regra de retenção não é gate.** `app_purgar_paciente` não consulta `app_paciente_expurgavel`. Um coordenador apaga fisicamente, e sem volta, o prontuário de um paciente em atendimento dentro do prazo legal.
2. **Nada no app registra alta clínica.** `patient.alta_em` não tem caminho de escrita. Como a elegibilidade exige `alta_em IS NOT NULL`, a fila de elegíveis é vazia por construção em produção.
3. **O aviso prévio de 90 dias não existe.** A política pública promete que nenhuma eliminação é silenciosa; o produto não tem como avisar.

Enquanto isso, a política de retenção que a clínica assina descreve um fluxo — aviso, decisão da clínica, eliminação registrada — que o produto não executa. `docs/legal/politica-retencao-dados.md:198` admite a lacuna por escrito.

## Goals

- [ ] Um coordenador vê, numa tela, quais prontuários da sua clínica venceram o prazo legal de guarda, desde quando, e quando a clínica foi avisada.
- [ ] O expurgo é um ato deliberado de coordenador, com motivo e confirmação por digitação do nome do paciente — nunca um clique a partir do fluxo diário.
- [ ] `app_purgar_paciente` recusa paciente não elegível. A regra de retenção deixa de ser consultiva e passa a ser barreira.
- [ ] Existe uma via excepcional nomeada, exigindo base legal escrita, para ordem judicial e para a reaplicação pós-restore.
- [ ] A clínica é avisada in-app 90 dias antes do vencimento, uma vez por alta, sem e-mail e sem SMS.
- [ ] Um terapeuta consegue registrar alta clínica de um paciente, e desfazê-la, com trilha.
- [ ] Nenhuma automação do sistema é capaz de apagar prontuário.
- [ ] A restauração de backup continua reaplicando expurgos — inclusive os excepcionais — sem abortar.

## Out of Scope

| Item                                                         | Razão                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extensão de retenção por paciente (`retencao_estendida_ate`) | **P4**, decisão do Rômulo. Como o expurgo nunca é automático, "estender" já existe de fato: a clínica não confirma. O que fica aberto é prestação de contas (Art. 37) — desenho mínimo já escrito em `context.md` §4. Vira dívida no `BACKLOG.md`. |
| UI da via excepcional de expurgo                             | **P2**. A função entra; a tela não. Governança (quem autoriza além do coordenador) é política interna ainda não definida — construir UI antes da governança convida ao uso indevido.                                                               |
| Anonimização para dataset como alternativa ao expurgo        | `politica-retencao-dados.md:150-157` a oferece como opção 2, mas ela exige **consentimento específico e separado** que não existe no modelo de consentimento hoje. Feature própria.                                                                |
| Editar `clinic.politica_retencao_meses` pela UI              | Coluna existe, nullable, sem default, e nenhuma UI a lê ou escreve. `COALESCE(…, 0)` = "sem extensão" é o default conservador correto. Expor é escopo próprio, com sua própria conversa sobre quem pode estender prazo legal.                      |
| Aviso prévio por e-mail                                      | **D9**. In-app é decisão travada, não limitação. E-mail arrasta `resend` para a imagem do job e reabre um modo de falha já pago duas vezes.                                                                                                        |
| Corrigir `FUSO_CLINICA` chumbado vs. `clinic.timezone`       | Divergência real encontrada de raspão (`context.md` D8). Fora do escopo — registrar no `BACKLOG.md`, não corrigir de carona.                                                                                                                       |
| Unificar o erro opaco de `app_purgar_report`                 | Débito irmão já registrado na revisão do PR #68. Não é desta issue.                                                                                                                                                                                |
| Provisionar o job de exportação integral (#374)              | Achado colateral: tem script e rota, nunca teve `infra/`, Dockerfile nem serviço. Issue própria.                                                                                                                                                   |

---

## Requisitos (IDs rastreáveis)

### Fatia A — Registrar alta clínica (destrava a fila)

- **R352.A1** Existe ação de coordenador "Registrar alta clínica" no prontuário do paciente, gravando `patient.alta_em` com data escolhida.
- **R352.A2** A data de alta é rejeitada se for **futura**. Alta é fato consumado, não agendamento.
- **R352.A3** A alta grava trilha `audit_log` com `acao='alta_registrada'`, `detalhe={origem:'manual', motivo}`, na **mesma transação** da escrita da coluna.
- **R352.A4** Existe ação de desfazer alta, zerando `alta_em`, com trilha `acao='alta_desfeita'` e motivo obrigatório.
- **R352.A5** A ação de alta usa `comEscrita()` — é escrita clínica ordinária, e conta em somente-leitura não registra alta.
- **R352.A6** Registrar alta **não** arquiva por ato do app: o trigger `patient_alta_arquiva_trg` (`0065`) já faz isso no banco, e só na transição `NULL → NOT NULL`. O app não duplica o efeito.
- **R352.A7** Ida-volta-ida (alta → desfaz → alta com outra data) deixa `alta_em` com a segunda data e **não** reverte `arquivado_em` — desarquivar é ato próprio, e o histórico clínico não se reescreve por ato administrativo.

### Fatia B — Gate de elegibilidade e via excepcional

- **R352.B1** `app_purgar_paciente(uuid, text)` passa a exigir `COALESCE(app_paciente_expurgavel(p_patient), false)`, recusando com erro nomeado quando falso. Guard entra **depois** dos guards de papel e tenant existentes, para não alterar a mensagem opaca já travada na revisão do PR #68.
- **R352.B2** Existe `app_purgar_paciente_excepcional(p_patient uuid, p_motivo text, p_base_legal text)`, com os mesmos guards de papel e tenant, **sem** o gate de elegibilidade, recusando `p_base_legal` vazio ou só espaços.
- **R352.B3** A via excepcional grava `audit_log` com **`acao = 'paciente_purgado'`** — a mesma string da via normal — e `detalhe={motivo, base_legal, excepcional:true, pseudonimizado:true}`. **Requisito de interface, não de rótulo:** `infra/backup/backup.sh:470` filtra por essa string literal para montar o ledger de tombstones.
- **R352.B4** As duas vias compartilham o corpo de erasure (pseudonimização + DELETEs leaf-first). Não existem duas listas de DELETE — uma lista que diverge da outra apaga metade do prontuário e passa verde.
- **R352.B5** `infra/backup/reaplicar-tombstones.sql` passa a chamar a **via excepcional**, com base legal `'reaplicacao pos-restore'`. Sem isso, um titular expurgado por ordem judicial (não elegível) faz o replay recusar, e `restore.sh` (`ON_ERROR_STOP=1`, fail-closed) aborta a restauração inteira.
- **R352.B6** A elegibilidade tem **fonte única**: helper `IMMUTABLE` puro dos argumentos, consumido pelo predicado por UUID, pela fila da UI e pela varredura do job. Não existe segunda cópia da fórmula.
- **R352.B7** A comparação de vencimento é feita em **data civil no fuso da clínica** (`clinic.timezone`), não em `now()` cru contra aritmética de `timestamptz`.
- **R352.B8** A fórmula em si é preservada: `MAX(nascimento + 18 anos, alta_em + GREATEST(10 anos, politica_retencao_meses))`, com `alta_em` e `nascimento` obrigatórios. A clínica só **estende**, nunca encurta.

### Fatia C — Fila de elegíveis e ação de expurgo

- **R352.C1** Existe `app_pacientes_expurgaveis(p_limite integer, p_offset integer)` retornando a fila **da clínica do contexto**, isolada por `app_clinic_id_exigido()`.
- **R352.C2** A fila devolve, por linha: id, nome, `alta_em`, data de vencimento, e quando o aviso prévio foi emitido (ou `NULL`).
- **R352.C3** O total para paginação é `count(*) OVER ()` calculado sobre o conjunto **já filtrado** e **antes** do `LIMIT/OFFSET`.
- **R352.C4** Nova aba "Retenção & Expurgo" em `/clinica`, coordenador-only, herdando o guard do layout e **reafirmando** `requireRole` na página (defesa em profundidade, como as 29 telas irmãs).
- **R352.C5** A tela lista 25 por página, com paginação, e mostra empty-state quando não há elegíveis — empty-state é resposta legítima, não falha.
- **R352.C6** O expurgo é disparado por server action `coordenador`-only, com motivo (mín. 10 caracteres) e **confirmação por digitação do nome exato do paciente**. Botão desabilitado até o match exato.
- **R352.C7** A ação de expurgo **não** usa `comEscrita()`, com comentário justificando na linha. Conta em somente-leitura **purga**.
- **R352.C8** Nenhum campo trafega no payload RSC que a tela não desenhe — em particular `detalhe` de `audit_log` e ids que a tela não usa.
- **R352.C9** Erro da ação é opaco para o usuário e detalhado só em `console.error`, seguindo o padrão de `alternarArquivamento`. A ação **nunca** lança para o chamador: devolve `{ok}` ou `{error}`.

### Fatia D — Aviso prévio de 90 dias

- **R352.D1** Existe `app_retencao_avisar(p_referencia timestamptz, p_aviso_dias integer, p_lote integer) RETURNS integer`, cross-tenant, que emite o aviso prévio e devolve quantos avisou.
- **R352.D2** A janela é **fechada em cima**: avisa quem vence em até `p_aviso_dias` e **ainda não venceu**. Passado o vencimento quem age é a fila, não o aviso — sem esse limite superior o job reavisa a cada varredura.
- **R352.D3** Dedup ancorado na alta: `NOT EXISTS (audit_log com acao='expurgo_aviso_previo' para o paciente e criado_em > patient.alta_em)`. Alta corrigida ou refeita **reabre** o aviso; a mesma alta nunca avisa duas vezes.
- **R352.D4** Efeito e estado são a **mesma instrução** (`INSERT … SELECT`): o próprio `audit_log` é o dedup. Não existe "gravar estado por último" — falha parcial não tira ninguém do conjunto elegível.
- **R352.D5** A linha de aviso tem `ator_id = NULL` (ato do sistema) e `detalhe={origem:'job', vence_em, aviso_dias}`.
- **R352.D6** O `LIMIT` do lote vem **depois** de todos os predicados, com `ORDER BY` determinístico e `FOR UPDATE SKIP LOCKED`.
- **R352.D7** `p_aviso_dias` é parâmetro **só para o teste comprimir a janela**. O job passa **90** fixo, lido de constante no código — teto de política não é configurável por variável de deploy.

### Fatia E — Job e infraestrutura

- **R352.E1** Existe role `iris_retencao` (`NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`) com `EXECUTE` em **exatamente uma** função (`app_retencao_avisar`) e `SELECT` em **nenhuma** tabela.
- **R352.E2** `iris_retencao` **não** recebe `EXECUTE` em `app_purgar_paciente` nem na via excepcional, e isso é afirmado por teste negativo explícito (`42501`), nunca presumido.
- **R352.E3** `scripts/retencao-aviso-previo.mjs` faz **uma varredura e sai**. O laço é do agendador. Node puro, sem TypeScript, sem build, sem dependência além de `postgres`.
- **R352.E4** O script valida `RETENCAO_DATABASE_URL` **antes** do laço, **nomeando a variável ausente**, e sai `1` — nunca fica de pé falhando em silêncio a cada tick.
- **R352.E5** `--dry-run` roda de verdade e faz `ROLLBACK`; **não** escreve heartbeat.
- **R352.E6** Heartbeat (`.ultima-retencao`) é escrito **só** em varredura completa e sem erro. Heartbeat velho é o alarme; log não é observado.
- **R352.E7** Nenhuma saída de rede além do Postgres. A imagem não instala cliente HTTP — a proibição é estrutural, não convencional.
- **R352.E8** A régua (90 dias) vive em `src/lib/jobs/retencao.ts` e é espelhada no `.mjs`, com **teste de paridade** que importa as duas constantes e falha se uma mudar sozinha.
- **R352.E9** `infra/retencao/` com `Dockerfile` e `agendador.sh` versionados, no molde de `infra/arquivamento/`. Deps listadas à mão — imagem de job não herda `node_modules` do app.
- **R352.E10** `.env.example` documenta `RETENCAO_DATABASE_URL` e `RETENCAO_HEARTBEAT_DIR` **com o racional escrito** (por que role dedicada, por que não `DATABASE_URL`).

### Fatia F — Documentação e fechamento

- **R352.F1** O corpo truncado da issue #352 é reescrito, apontando para esta spec.
- **R352.F2** `docs/legal/politica-retencao-dados.md` corrige `acao='dado_eliminado'` → `'paciente_purgado'` e atualiza a tabela de lacunas (`:198`) e o banner (`:15-22`). **Requer confirmação do Rômulo** (`CLAUDE.md` § Permissões).
- **R352.F3** `BACKLOG.md` registra as dívidas abertas: extensão de retenção por paciente (com o desenho mínimo já escrito), `FUSO_CLINICA` chumbado vs. `clinic.timezone`, e job de exportação integral não provisionado.
- **R352.F4** `.specs/features/fase6/EXECUTION.md` registra que o wiring diferido da 6.3 foi fechado.

---

## Casos de borda — listados por nome

Exigência do `AGENTS.md` §5.2, ponto 4. Cada um vira teste.

| Caso                                                | Comportamento travado                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Paciente sem `alta_em`                              | Nunca elegível, nunca avisado. `false`, não erro.                                                                |
| Paciente sem `nascimento`                           | Nunca elegível. "Desconhecido" nunca vira "já pode apagar".                                                      |
| `politica_retencao_meses` NULL                      | `COALESCE(…, 0)` → sem extensão. Piso de 10 anos continua valendo.                                               |
| `politica_retencao_meses` menor que 120             | `GREATEST` ignora. Clínica **não** encurta prazo legal.                                                          |
| Paciente de outra clínica                           | `app_paciente_expurgavel` devolve `NULL`; gate lê `false`; guard de tenant já recusou antes, com mensagem opaca. |
| Paciente inexistente                                | Mesma mensagem opaca. Não vira oráculo de existência.                                                            |
| Purga de paciente elegível, repetida                | Segunda chamada recusa com a mensagem opaca — a linha não existe mais.                                           |
| Purga via excepcional de paciente **elegível**      | Permitida. A via excepcional não exige inelegibilidade, só base legal.                                           |
| `base_legal` só com espaços                         | Recusa. `trim()` vazio é vazio.                                                                                  |
| Replay de tombstone de paciente **não** elegível    | **Deve passar.** É o caso que quebra a restauração se o gate for aplicado no caminho do replay.                  |
| Replay de tombstone de paciente ausente do dump     | `CONTINUE`, não aborta o lote (comportamento já existente, não regredir).                                        |
| Aviso: paciente vence exatamente em 90 dias         | **Avisa.** Borda inclusiva embaixo.                                                                              |
| Aviso: paciente vence em 91 dias                    | **Não avisa.**                                                                                                   |
| Aviso: paciente já vencido                          | **Não avisa** (janela fechada em cima). Ele está na fila, não no aviso.                                          |
| Segunda varredura no mesmo dia                      | Avisa **zero**. O `INSERT … SELECT` é o dedup.                                                                   |
| Alta desfeita e refeita com data nova               | Aviso **reabre** — `criado_em > alta_em` deixa de casar.                                                         |
| Lote maior que o teto                               | Resto fica para o tick seguinte. Nada sai da fila por não ter sido processado.                                   |
| Falha no meio da varredura                          | Lote aborta inteiro; lotes já commitados permanecem; **sem** heartbeat; `exitCode=1`.                            |
| Job tenta purgar                                    | `42501`. Afirmado por teste, não presumido.                                                                      |
| Conta em somente-leitura tenta purgar               | **Permitido** (R352.C7).                                                                                         |
| Conta em somente-leitura tenta registrar alta       | **Bloqueado** (R352.A5).                                                                                         |
| Terapeuta abre `/clinica/retencao`                  | `notFound()` pelo layout.                                                                                        |
| Confirmação digitada com caixa/acento diferentes    | **Não** libera. Match exato do nome exibido.                                                                     |
| Fila com um elegível, outro coordenador purga antes | Ação recusa com mensagem opaca; a fila revalida e a linha some.                                                  |
| Fuso: vencimento à meia-noite                       | Data civil no fuso da clínica decide, não o relógio do servidor.                                                 |

---

## Definição de Pronto

- [ ] `pnpm typecheck` && `pnpm lint` limpos.
- [ ] `pnpm test` verde.
- [ ] `pnpm test:rls` verde, **conferindo a contagem de arquivos executados** — verde com "skipped" é vermelho disfarçado ([[suite-rls-rodando-como-superusuario]]).
- [ ] `npx vitest run src/db/migrations.test.ts` verde (journal íntegro, `when` crescente, hashes).
- [ ] Toda migração medida em `pg_proc` / `information_schema` / `pg_roles` **depois** de `pnpm db:migrate` — `git log` não prova execução.
- [ ] Teste de mutação: reverter o gate por patch inverso derruba pelo menos um teste; reverter o `criado_em > alta_em` derruba outro. Reverter **sem** `git checkout` ([[mutacao-reverter-sem-git-checkout]]).
- [ ] `npx prettier --write` nos arquivos tocados — **nunca** `pnpm format`.
- [ ] Nenhum `TODO` ou "a validar" no diff.
