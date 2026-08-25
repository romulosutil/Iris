# Expurgo de prontuário expirado — Tasks

**Spec**: [`spec.md`](./spec.md) · **Arquitetura**: [`design.md`](./design.md) · **Contexto e decisões**: [`context.md`](./context.md)
**Issue**: [#352](https://github.com/romulosutil/Iris/issues/352) · **Status**: Draft · **Branch sugerida**: `feat/352-expurgo-prontuario-expirado`

---

## Convenções de Gate (valem para TODAS as tasks)

| Gate       | Comandos                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `quick`    | `pnpm typecheck` && `pnpm lint` && `npx vitest run <arquivo>`                                                                          |
| `unit`     | `pnpm typecheck` && `pnpm lint` && `pnpm test`                                                                                         |
| `int`      | `npx vitest run --config vitest.integration.config.ts <arquivo>` — **conferir a CONTAGEM de arquivos e testes coletados, nunca a cor** |
| `rls`      | `pnpm test:rls` — conferir a contagem de arquivos **executados**; verde com "skipped" é vermelho disfarçado                            |
| `migracao` | `pnpm db:migrate` && `npx vitest run src/db/migrations.test.ts` && medição em `pg_proc`/`pg_roles`/`information_schema`                |
| `full`     | `pnpm typecheck` && `pnpm lint` && `pnpm test` && `pnpm test:rls` && `npx vitest run src/db/migrations.test.ts`                        |
| `format`   | `npx prettier --write <arquivos tocados>` — **nunca** `pnpm format` (reformata o repo inteiro)                                         |

> ⚠️ **A armadilha que mais custa neste repo:** `*.int.test.ts` está no `exclude` do `vitest.config.ts`. `npx vitest run db/tests/x.int.test.ts` **coleta zero e sai verde**. Sem `--config vitest.integration.config.ts` a task está mentindo. Toda task de int-test abaixo repete isso no Gate de propósito.

> ⚠️ **Toda task fecha com `format`.** O CI **não** valida Prettier — um PR passa 100% verde com arquivo mal formatado (`AGENTS.md` §5.2, ponto 7).

> ⚠️ **Fixtures de int-test:** usar sufixo único por arquivo nos e-mails (`coord+352fila@a.test`). `coord@a.test` aparece em 13+ arquivos e `UNIQUE(email)` derruba o `setup` — a cascata se lê como defeito de RLS.

---

## Ordem e dependências

```
T0 ─── T1 ─┬─ T2 ── T3 ── T4 ── T5 ─┬─ T6 ── T7          (SQL: gate, vias, fila, aviso)
           │                        └─ T8                (replay pós-restore)
           └─ T9 ── T10 ── T11                           (registrar alta: destrava a fila)
                              │
     T7 ──┬─ T12 ── T13 ── T14                           (tela + ação de expurgo)
          └─ T15 ── T16 ── T17                           (job + infra)
                              │
                          T18 ── T19 ── T20              (docs, backlog, fechamento)
```

`T9`–`T11` (alta) são independentes de `T2`–`T8` (SQL de expurgo) e podem correr em paralelo por outro agente. Tudo o mais é sequencial.

---

## T0 — Reescrever o corpo truncado da issue #352

**O quê:** O corpo da issue no GitHub é, literalmente, `## Contexto\nNa migração \` — o `\` engoliu o resto na criação. Não há requisito escrito nela hoje.
**Onde:** GitHub, issue #352.
**Depende de:** nada.
**Reusa:** esta spec.
**Como:** escrever o corpo num arquivo e usar `gh issue edit 352 --body-file <arquivo>`. **Não** passar o corpo inline no PowerShell — foi assim que truncou da primeira vez.
**Pronto quando:** `gh issue view 352 --json body --jq '.body' | wc -c` devolve > 1000, o corpo aponta para `.specs/features/352-expurgo-prontuario-expirado/spec.md`, resume os três defeitos (`context.md` §2) e lista as 4 decisões do Rômulo (`context.md` §4).
**Testes:** n/a.
**Gate:** verificação manual do output do `gh issue view`.

---

## T1 — Índice parcial via `db:generate`

**O quê:** índice `idx_patient_retencao` em `patient (clinic_id, alta_em)` com `WHERE alta_em IS NOT NULL AND nascimento IS NOT NULL`.
**Onde:** `src/db/schema.ts` (bloco de índices de `patient`) → gera `db/migrations/0127_*.sql` + `meta/0127_snapshot.json`.
**Depende de:** T0.
**Reusa:** índices parciais já existentes em `schema.ts` como referência de sintaxe Drizzle.
**Como:** editar `schema.ts`, rodar `pnpm db:generate`. **Nunca** escrever este DDL à mão — índice é modelado pelo Drizzle e escrever à mão dessincroniza o snapshot (defeito reconciliado na `0078`).
**Pronto quando:** `.sql` e `meta/0127_snapshot.json` commitados **juntos**; `_journal.json` atualizado pelo próprio `db:generate`; `pnpm db:generate` rodado de novo responde `No schema changes, nothing to migrate`.
**Testes:** `src/db/migrations.test.ts` (já existe) valida journal.
**Gate:** `migracao` + `format`.

---

## T2 — `app_retencao_vence_em`: fonte única do predicado

**O quê:** helper `IMMUTABLE` puro dos argumentos devolvendo a data civil de vencimento da guarda, ou `NULL` quando `alta` ou `nascimento` é `NULL`.
**Onde:** `db/migrations/0128_retencao_expurgo_wiring.sql` (arquivo novo, escrito à mão) + entrada manual em `db/migrations/meta/_journal.json`.
**Depende de:** T1.
**Reusa:** a fórmula **já mergeada** em `db/migrations/0087_tenant_helper_em_funcoes_e_view.sql:182-189`. Extrair, **não** reescrever — ela passou por revisão de PR.
**Assinatura:** ver `design.md` §2.2(a).
**Pronto quando:** `when` no journal = `when` da `0127` **+ 1000** (menor ou igual ao máximo aplicado faz o Drizzle pular o arquivo **em silêncio**); `SELECT prosrc, provolatile FROM pg_proc WHERE proname='app_retencao_vence_em'` devolve `provolatile='i'`.
**Testes:** dentro de T7.
**Gate:** `migracao` + `format`.

---

## T3 — `app_paciente_expurgavel` delega ao helper, com fuso da clínica

**O quê:** `CREATE OR REPLACE` do predicado por UUID: passa a chamar `app_retencao_vence_em` e a comparar **data civil no fuso da clínica**, não `now()` cru.
**Onde:** mesma migração `0128`.
**Depende de:** T2.
**Reusa:** corpo vigente em `0087:176-194` (guard de tenant `app_clinic_id_exigido()` — preservar exatamente).
**Cuidado:** `CREATE OR REPLACE` torna o diff enganoso — ler o `.sql` **não** prova o corpo vigente.
**Pronto quando:** `SELECT prosrc FROM pg_proc WHERE proname='app_paciente_expurgavel'` mostra a chamada ao helper e **não** contém mais a fórmula literal; comportamento preservado para `alta_em`/`nascimento` NULL (`false`) e para linha ausente (`NULL`).
**Testes:** dentro de T7.
**Gate:** `migracao` + `format`.

---

## T4 — Extrair o corpo de erasure para `app_purgar_paciente_interno`

**O quê:** mover — **sem reescrever** — os 5 passos de erasure do corpo vigente de `app_purgar_paciente` para uma função interna que recebe o paciente já autorizado e o `detalhe` pronto.
**Onde:** mesma migração `0128`.
**Depende de:** T3.
**Reusa:** corpo vigente em `db/migrations/0094_fechar_guard_papel_identidade.sql:150-207` — audit-antes, pseudonimização de `audit_log`, pseudonimização de `alerta_risco_clinico` (passo 2b), DELETEs leaf-first das ~24 tabelas, `DELETE FROM patient`.
**Cuidado — a lista de DELETE é copiada literalmente, na mesma ordem.** Reescrever de memória ou "melhorar" a ordem apaga metade do prontuário e passa verde: as FKs são `restrict`/`no action`, então uma ordem errada estoura, mas uma lista **incompleta** só deixa órfão.
**Cuidado 2:** a sobrescrita integral de `detalhe` é decisão travada na revisão do PR #68 (erasure é whitelist, não blacklist). **Não** "consertar" para preservar chaves.
**Pronto quando:** `REVOKE ALL ON FUNCTION app_purgar_paciente_interno(uuid,jsonb) FROM PUBLIC` e **nenhum** grant; `pg_proc` mostra a função com `prosecdef = true`; contagem de `DELETE FROM` no novo corpo é **idêntica** à do corpo antigo (`grep -c` nos dois).
**Testes:** dentro de T7.
**Gate:** `migracao` + `format`.

---

## T5 — Gate de elegibilidade + via excepcional

**O quê:** (a) `app_purgar_paciente` ganha o gate como **terceiro** guard; (b) nasce `app_purgar_paciente_excepcional(uuid, text, text)` sem gate, exigindo `base_legal` não-vazia. Ambas delegam a T4.
**Onde:** mesma migração `0128`.
**Depende de:** T4.
**Reusa:** guards 1 e 2 do corpo vigente (`0094:142-148`), preservados **literalmente** — inclusive a mensagem opaca `'paciente inexistente ou sem permissão'`, travada na revisão do PR #68.
**Cuidado — ordem dos guards:** papel → tenant → **elegibilidade**. Subir a elegibilidade acima do guard de tenant transforma a função em oráculo de existência entre clínicas.
**Cuidado — `COALESCE`:** `IF NOT COALESCE(app_paciente_expurgavel(p), false)`. Sem o `COALESCE`, `IF NOT NULL` não dispara e o gate **passa direto**.
**Cuidado — `acao`:** as duas vias gravam `'paciente_purgado'`, e isso vem do interno (T4), então não há como divergir por descuido. Se alguém "melhorar" para `paciente_purgado_excepcional`, o `backup.sh:470` deixa de capturar o tombstone e o expurgo excepcional é **desfeito no primeiro restore**.
**Pronto quando:** `pg_proc` mostra as duas funções; `GRANT EXECUTE … TO app_role` nas duas; `SELECT app_purgar_paciente_excepcional(x, 'm', '   ')` levanta exceção.
**Testes:** dentro de T7.
**Gate:** `migracao` + `format`.

---

## T6 — Fila tenant-scoped e varredura de aviso

**O quê:** `app_pacientes_expurgaveis(int, int)` (fila da clínica, paginada) e `app_retencao_avisar(timestamptz, int, int)` (varredura cross-tenant que emite o aviso), + role `iris_retencao` com grants.
**Onde:** mesma migração `0128`.
**Depende de:** T5.
**Reusa:** `app_clinic_id_exigido()` para isolamento; padrão de CTE + dedup + janela de `app_auto_arquivar_pacientes` (`db/migrations/0080_auto_arquivamento_varredura.sql:100-160`); padrão de `CREATE ROLE` idempotente de `0080:36-37`.
**Assinaturas e corpo:** `design.md` §2.2(e), (f), (g).
**Cuidado — isolamento:** `app_clinic_id_exigido()`, **nunca** `app_clinic_id_atual()` em predicado de isolamento (devolve `NULL` e some com a linha em silêncio), **nunca** `current_setting` cru.
**Cuidado — ordem das operações na fila:** filtrar → `count(*) OVER ()` → `LIMIT/OFFSET`. Contar depois do `LIMIT` devolve total errado; filtrar depois do `LIMIT` trava a fila.
**Cuidado — a varredura é UMA instrução.** `INSERT … SELECT`: o próprio `audit_log` é o dedup. Separar em "seleciona, depois insere" abre janela entre efeito e estado.
**Cuidado — role é objeto de cluster:** `CREATE ROLE` dentro de `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_roles …) $$`, para a migração ser reexecutável.
**Pronto quando:** `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname='iris_retencao'` devolve `f,f,f`; `has_function_privilege('iris_retencao','app_purgar_paciente(uuid,text)','EXECUTE')` = **`false`**; `has_table_privilege('iris_retencao','patient','SELECT')` = **`false`**.
**Testes:** T7.
**Gate:** `migracao` + `format`.

---

## T7 — Testes de integração do SQL

**O quê:** a suíte que prova o gate, as duas vias, a fila e o aviso.
**Onde:** `db/tests/retencao-expurgo.int.test.ts` (gate + vias), `db/tests/retencao-fila.int.test.ts` (fila + isolamento), `db/tests/retencao-aviso.int.test.ts` (janela + dedup + role do job).
**Depende de:** T6.
**Reusa:** arranjo de `db/tests/fase6-expurgo-paciente.int.test.ts` (mesma família; `describe.skipIf(!hasDb)`, role dona como oráculo).
**Casos obrigatórios** — todos vêm da tabela de bordas da `spec.md`:

_Gate e vias:_

1. paciente **não** elegível → `app_purgar_paciente` **recusa**; paciente continua existindo;
2. paciente elegível → purga; `audit_log` tem linha `acao='paciente_purgado'` com `patient_id NULL`;
3. via excepcional em paciente **não** elegível → **permite**;
4. via excepcional grava `acao='paciente_purgado'` (**não** outra string) e `detalhe->>'base_legal'` preenchido;
5. `base_legal` vazia ou só espaços → recusa;
6. `alta_em` NULL → não elegível (`false`, não erro); `nascimento` NULL → idem;
7. `politica_retencao_meses` = 6 (menor que 120) → **não** encurta o prazo;
8. `politica_retencao_meses` = 240 → **estende**;
9. cross-tenant → mensagem opaca, e a mensagem é **a mesma** de paciente inexistente;
10. as ~24 tabelas descendentes ficam vazias após a purga — **não** só `consent`/`report`/`report_pdf` como hoje;
11. `alerta_risco_clinico` do sujeito fica pseudonimizado (`patient_id NULL`, textos `[expurgado]`, `pseudonimizado_em` carimbado) — **hoje sem cobertura nenhuma**.

_Fila:_

12. fila só devolve pacientes da clínica do contexto;
13. sem tenant no GUC → `P0001` (não `42704`, não `22P02`);
14. `total` reflete o conjunto filtrado inteiro, **não** a página;
15. `avisado_em` vem preenchido quando há aviso e `NULL` quando não há.

_Aviso:_

16. vence em exatamente 90 dias → **avisa**;
17. vence em 91 dias → **não** avisa;
18. já vencido → **não** avisa (janela fechada em cima);
19. segunda varredura no mesmo dia → avisa **zero**;
20. alta desfeita e refeita com data nova → aviso **reabre**;
21. linha de aviso tem `ator_id IS NULL`;
22. `iris_retencao` tentando `app_purgar_paciente` → **`42501`**;
23. `iris_retencao` tentando `SELECT` em `patient` → **`42501`**.

**Cuidado:** e-mails de fixture com sufixo único por arquivo.
**Pronto quando:** as três suítes verdes **e a contagem coletada confere** com o número de casos escritos.
**Gate:** `int` (com `--config vitest.integration.config.ts`, conferindo contagem) + `rls` + `format`.

---

## T8 — Replay pós-restore passa pela via excepcional

**O quê:** `reaplicar-tombstones.sql` deixa de chamar `app_purgar_paciente` e passa a chamar `app_purgar_paciente_excepcional` com base legal `'reaplicacao pos-restore'`.
**Onde:** `infra/backup/reaplicar-tombstones.sql:92-95` (arquivo de infra, **não** migração).
**Depende de:** T5.
**Por quê — leia antes de achar que é detalhe:** um titular expurgado por ordem judicial é, por definição, **inelegível**. Com o gate no caminho do replay, o `PERFORM` levanta exceção; `restore.sh:299` roda com `-v ON_ERROR_STOP=1`; `restore.sh:302-304` é fail-closed e aborta a restauração inteira mandando **não liberar o banco para uso**. Ver `context.md` §3.
**Pronto quando:** o `DO $reaplicar$` chama a via excepcional; nenhuma outra linha do arquivo muda.
**Testes:** `db/tests/fase6-tombstone-restauracao.int.test.ts` ganha **um caso novo**: titular **não elegível** (expurgado pela via excepcional) é re-eliminado no replay sem abortar. Os 5 casos existentes continuam verdes.
**Gate:** `int` (`db/tests/fase6-tombstone-restauracao.int.test.ts`, conferindo contagem = 6) + `format`.

---

## T9 — Schemas e core de registrar/desfazer alta

**O quê:** `registrarAltaCore` e `desfazerAltaCore`, com Zod validando data não-futura e motivo.
**Onde:** `src/app/(app)/pacientes/[id]/schemas.ts` (acrescentar) e `src/app/(app)/pacientes/[id]/logic.ts` (acrescentar).
**Depende de:** T1 (independente de T2–T8 — pode correr em paralelo).
**Reusa:** `alternarArquivamento` (`logic.ts:69-146`) como molde literal: `comEscrita(...)`, `requireRole`, Zod **dentro** do core, `withTenant`, `audit_log` na mesma transação, retorno `{ok}|{error}` sem throw, `console.error` no catch.
**Cuidado — grant já existe:** `GRANT UPDATE (alta_em, arquivado_em) ON patient TO app_role` foi concedido na `0065:23`, **posterior** ao `REVOKE` da `0044:64`. **Não** escrever migração de grant.
**Cuidado — o app não arquiva:** o trigger `patient_alta_arquiva_trg` (`0065`) já faz, e só na transição `NULL → NOT NULL`. Duplicar no app cria duas fontes de verdade.
**Cuidado — idempotência no `WHERE`:** `isNull(patient.altaEm)` para registrar, `isNotNull` para desfazer — repetir o clique não regrava a data.
**Cuidado — Zod não sai de módulo `"use server"`:** por isso mora em `schemas.ts` irmão.
**Pronto quando:** `acao='alta_registrada'` / `'alta_desfeita'` com `detalhe={origem:'manual', motivo}`; data futura recusada com mensagem do Zod; conta em somente-leitura bloqueada por `comEscrita`.
**Testes:** `src/app/(app)/pacientes/[id]/alta.int.test.ts` — registrar, desfazer, ida-volta-ida com data nova (medindo `alta_em` **e** `arquivado_em`: desfazer **não** desarquiva), papel errado, data futura, conta somente-leitura.
**Gate:** `int` + `format`.

---

## T10 — Action e diálogo de alta

**O quê:** wrappers `"use server"` + diálogo de UI.
**Onde:** `src/app/(app)/pacientes/[id]/actions.ts` (acrescentar), `src/app/(app)/pacientes/[id]/alta-dialog.tsx` (novo), e o ponto de montagem no bloco de status do prontuário.
**Depende de:** T9.
**Reusa:** `arquivamento-dialog.tsx` como molde literal — Radix `Dialog`, `Field` + `Input`, `useActionState`, fechamento **durante o render** comparando o estado anterior (**não** `useEffect`), erro de validação mantém o diálogo aberto, `Alert` para `bloqueioConta`.
**Cuidado — guard de CI:** o core que aceita `ctx` **nunca** é exportado de módulo `"use server"`. `src/security/ctx-forjavel-guard.test.ts` quebra.
**Cuidado:** `revalidatePath` do paciente **e** da lista, só quando `!resultado.error`.
**Cuidado:** **não existe** variante destrutiva de botão no design system (`arquivamento-dialog.tsx:49`). Usar `primaria`/`neutra`.
**Pronto quando:** fluxo completo funciona na UI; `axe` limpo.
**Testes:** `alta-dialog.test.tsx` + caso em `src/app/(app)/pacientes/a11y.test.tsx`.
**Gate:** `quick` + `format`.

---

## T11 — Régua canônica de retenção

**O quê:** `REGUA_RETENCAO = { diasAvisoPrevio: 90 }` como módulo puro (sem banco, sem rede).
**Onde:** `src/lib/jobs/retencao.ts` (novo).
**Depende de:** T9.
**Reusa:** `src/lib/jobs/auto-arquivamento.ts` como molde — inclusive o comentário explicando **por que** o módulo é puro.
**Cuidado — fuso:** aqui a conta é em **data civil no fuso da clínica**, ao contrário do auto-arquivamento (UTC). O comentário daquele arquivo diz explicitamente _"aqui não existe data prometida a ninguém"_ — no expurgo **existe**: a clínica lê o vencimento na tela e recebe aviso de 90 dias. Seguir a disciplina de `src/lib/trial.ts`.
**Pronto quando:** módulo exportando a régua e o cálculo de dias civis, sem import de `@/db`.
**Testes:** `src/lib/jobs/retencao.test.ts` — bordas de fuso (vencimento à meia-noite), 90/91 dias.
**Gate:** `quick` + `format`.

---

## T12 — Query e core da fila de elegíveis

**O quê:** `lerPaginaExpurgaveis(ctx, pagina)` e `purgarPacienteCore(ctx, input)`.
**Onde:** `src/app/(app)/clinica/retencao/queries.ts` e `.../logic.ts` (ambos novos).
**Depende de:** T7, T11.
**Reusa:** `src/app/(app)/clinica/auditoria/queries.ts` e `logic.ts` como molde (paginação, `grampearPagina`, `offsetDaPagina`, `ITENS_POR_PAGINA`).
**Cuidado — `ITENS_POR_PAGINA = 25`.**
**Cuidado — payload RSC:** o tipo devolvido só tem campo que a tela desenha. Nada de `detalhe`, nada de id que a tabela não usa. Foi o achado do PR #448, e aqui o dado é mais sensível.
**Cuidado — `purgarPacienteCore` NÃO usa `comEscrita()`**, e isso vai **com comentário na linha** explicando: eliminar dado cujo prazo venceu é obrigação legal da clínica **como controladora** (LGPD Art. 16), e ela continua controladora quando inadimplente. Bloquear por dívida converteria cobrança em retenção ilegal de dado pessoal. É a **única** exceção do repo — sem o comentário e sem o teste (T14), alguém adiciona o wrapper achando que corrige esquecimento.
**Cuidado:** validar no core `pacienteId` (uuid), `motivo` (mín. 10) e `confirmacao` (deve bater com o nome do paciente lido **do banco**, nunca com um nome vindo do `FormData`).
**Pronto quando:** `requireRole(ctx,'coordenador')`; retorno `{ok}|{error}` sem throw; erro opaco ao usuário e detalhado só em `console.error`.
**Testes:** T14.
**Gate:** `quick` + `format`.

---

## T13 — Tela, aba e diálogo de confirmação

**O quê:** página da fila, aba em `/clinica`, tabela paginada, empty-state e diálogo com confirmação por digitação.
**Onde:** `src/app/(app)/clinica/retencao/{page.tsx,actions.ts,fila-tabela.tsx,dialogo-expurgo.tsx}` (novos) + `src/app/(app)/clinica/layout.tsx:8-14` (acrescentar aba).
**Depende de:** T12.
**Reusa:** `clinica/auditoria/{trilha-tabela.tsx,paginacao-trilha.tsx}`; `Table zebrada`, `StatusBadge`, `EmptyState`, `Dialog`, `Field` do design system. **Nunca hardcodar componente.**
**Cuidado — defesa em profundidade:** a página reafirma `requireRole(ctx,'coordenador')` mesmo sob o layout guardado, como as 29 telas irmãs.
**Cuidado — confirmação por digitação:** match **exato** do nome exibido, sem normalizar caixa nem acento. Normalizar reduz atrito exatamente onde o atrito é o produto. Botão desabilitado até o match. O confirmador é o **nome do paciente**, não uma palavra fixa: palavra fixa protege contra clique acidental, não contra purgar o **paciente errado** — que é o modo de falha provável numa fila de vários.
**Cuidado:** construir o confirmador **dentro** de `dialogo-expurgo.tsx`, não como primitivo do design system. Generalizar a partir de um caso é como se inventa API errada.
**Cuidado:** empty-state é resposta legítima, não falha — a fila vazia é o estado normal de uma clínica nova.
**Pronto quando:** aba aparece; fluxo completo funciona; `axe` limpo.
**Testes:** `fila-tabela.test.tsx`, `dialogo-expurgo.test.tsx`, `a11y.test.tsx`.
**Gate:** `quick` + `format`.

---

## T14 — Testes da camada de aplicação do expurgo

**O quê:** cobertura de comportamento da action.
**Onde:** `src/app/(app)/clinica/retencao/logic.int.test.ts`.
**Depende de:** T13.
**Casos obrigatórios:**

1. `terapeuta` e `admin_recepcao` recusados;
2. motivo com menos de 10 caracteres recusado;
3. confirmação diferente do nome recusada — **inclusive** com caixa/acento diferentes;
4. paciente não elegível recusado (o gate do banco chega até a UI como erro opaco);
5. paciente elegível purgado; a fila revalidada não o contém mais;
6. **conta em somente-leitura PURGA** — comportamento surpreendente, por isso é teste explícito;
7. purga do mesmo paciente duas vezes → segunda recusa com mensagem opaca.

**Régua de mutação (obrigatória, `AGENTS.md` §5.2 ponto 5):** cada comportamento crítico tem 1 teste cuja remoção do código derruba o teste. Verificar **por patch inverso**, nunca `git checkout` (o HEAD apaga o código novo):

- remover o `COALESCE` do gate (T5) → derruba o caso 1 de T7;
- remover o `criado_em > alta_em` do dedup (T6) → derruba o caso 19 de T7;
- remover a checagem de `confirmacao` (T12) → derruba o caso 3 desta task.

**Pronto quando:** suíte verde **e** as três mutações verificadas uma a uma, com o resultado anotado no PR.
**Gate:** `int` + `format`.

---

## T15 — Script do job

**O quê:** `scripts/retencao-aviso-previo.mjs` — uma varredura e sai.
**Onde:** `scripts/retencao-aviso-previo.mjs` + `scripts/retencao-aviso-previo.test.mjs`.
**Depende de:** T7, T11.
**Reusa:** `scripts/auto-arquivamento.mjs` como molde literal — incluindo o cabeçalho que explica **por que** o script não faz saída de rede além do Postgres.
**Contrato (números explícitos, sem "conforme necessário"):**

- lote **200**, teto de **10 lotes** (2.000) por execução;
- para quando um lote devolve `0` **ou** ao atingir o teto;
- cada lote é **uma** transação; falha aborta o lote, mantém os anteriores, loga o índice e a mensagem do Postgres, **não** escreve heartbeat, sai `1`;
- `--dry-run` roda de verdade e faz `ROLLBACK`, **sem** heartbeat;
- heartbeat `.ultima-retencao` só em varredura completa e sem erro;
- valida `RETENCAO_DATABASE_URL` **antes** do laço, **nomeando a variável ausente**, e sai `1`;
- `90` fixo, lido de constante no arquivo — **não** de env (teto de política não é configurável por deploy).

**Cuidado:** node puro, sem TypeScript, sem build. Única dependência: `postgres`.
**Cuidado:** `main()` guardado por `fileURLToPath(import.meta.url) === process.argv[1]` para o módulo ser importável pelo teste.
**Pronto quando:** roda contra o Postgres local e avisa; `--dry-run` não deixa linha em `audit_log`.
**Testes:** `scripts/retencao-aviso-previo.test.mjs` — **teste de paridade** importando `REGUA_RETENCAO` de `src/lib/jobs/retencao.ts` e a constante do `.mjs`, falhando se uma mudar sozinha; env ausente sai `1` nomeando a variável; `--dry-run` não escreve heartbeat.
**Gate:** `unit` + `format`.

---

## T16 — Imagem e agendador

**O quê:** `infra/retencao/Dockerfile` e `infra/retencao/agendador.sh`.
**Onde:** `infra/retencao/` (novo).
**Depende de:** T15.
**Reusa:** `infra/arquivamento/{Dockerfile,agendador.sh}` como molde literal.
**Cuidado — a imagem do job NÃO herda `node_modules` do app.** Deps listadas à mão. Um import que nunca chegou na imagem já derrubou o motor de escalonamento em produção com CI 100% verde.
**Cuidado — `apk add --no-cache bash`:** o agendador usa `set -Eeuo pipefail` e `[[ ]]`; alpine só traz `ash`.
**Cuidado — COPY com caminho relativo à raiz do repo.** Easypanel builda com contexto raiz; um `COPY agendador.sh` funciona no compose e quebra em produção.
**Cuidado — `CMD`, não `ENTRYPOINT`**, para permitir `docker compose run … --dry-run`.
**Cuidado — a imagem NÃO instala cliente HTTP.** É proibição estrutural: o aviso é in-app, e um `fetch()` aqui é a resposta errada por definição.
**Pronto quando:** imagem builda; `docker run` com env ausente sai `1` nomeando a variável.
**Testes:** acrescentar a imagem a `scripts/ci/carga-imagens-infra.sh` — sem isso, uma dep faltando passa verde no CI.
**Gate:** `unit` + build local da imagem + `format`.

---

## T17 — `.env.example` e provisionamento

**O quê:** documentar as variáveis; provisionar o serviço.
**Onde:** `.env.example` (seção nova, no molde da de arquivamento) e Easypanel.
**Depende de:** T16.
**Conteúdo obrigatório do `.env.example`:** `RETENCAO_DATABASE_URL` e `RETENCAO_HEARTBEAT_DIR`, **com o racional escrito** — por que role dedicada, por que **não** `DATABASE_URL` (daria ao job leitura clínica de todas as clínicas para uma tarefa que só precisa de datas), e que a role tem `EXECUTE` numa função e `SELECT` em nenhuma tabela.
**Cuidado — provisionamento é passo manual e verificado no painel.** Issue fechada **não** prova serviço de pé. Réplicas = **1**.
**Cuidado — Easypanel não tem cron para serviço de app** (v2.31.0): o agendamento é o laço do `agendador.sh`, com o painel só apontando o Comando.
**Cuidado — salvar env no Easypanel não aplica:** exige "Implantar".
**Pronto quando:** serviço de pé no painel; `.ultima-retencao` criado após o primeiro tick; log mostra a contagem.
**Testes:** n/a (verificação no painel, anotada no PR).
**Gate:** `format` + evidência do painel no PR.

---

## T18 — Corrigir a política de retenção

**O quê:** `acao='dado_eliminado'` → `'paciente_purgado'`; atualizar a tabela de lacunas e o banner.
**Onde:** `docs/legal/politica-retencao-dados.md:145-149`, `:198`, `:15-22`.
**Depende de:** T14.
**Por quê o documento e não o código:** `backup.sh:470` filtra pela string literal `'paciente_purgado'` e `restore.sh` reaplica a partir dela. Trocar no código quebraria a reaplicação **em silêncio**, exigiria migração de dado histórico em `audit_log` e revalidação ponta a ponta do restore — e um titular já expurgado voltaria a existir após um restore. Ver `context.md` D4.
**✅ CONFIRMADO por Rômulo em 25/08/2026** (junto com a fórmula de retenção — §4 P6 e §7 de `context.md`). Executado fora da ordem normal de dependência (antes de T14), a pedido do Rômulo, direto na branch `docs/352-spec-expurgo-prontuario`.
**Cuidado:** não commitar `docs/legal/` de carona em outra task — já houve teste afirmando doc não commitado neste repo.
**Pronto quando:** a referência de `acao` corrigida (linha 146); pendência do §11 sobre a fórmula marcada como resolvida com data. Feito.
**Gate:** `format` + confirmação registrada.

---

## T19 — Registrar as dívidas abertas

**O quê:** quatro dívidas descobertas nesta análise, cada uma com o desenho mínimo **já escrito** — não como "avaliar depois".
**Onde:** `BACKLOG.md`.
**Depende de:** T14.
**Conteúdo:**

1. **Extensão de retenção por paciente** (P4, fora de escopo por decisão): `patient.retencao_estendida_ate` + `retencao_estendida_motivo`, predicado passa a exigir `(retencao_estendida_ate IS NULL OR <referência> >= retencao_estendida_ate)`. Motivo de existir: sem coluna, um auditor não distingue _"a clínica ainda não decidiu"_ de _"decidiu estender por processo judicial"_ — fraco para o Art. 37.
2. **`FUSO_CLINICA` chumbado** (`src/app/(app)/agenda/fuso.ts:4`) enquanto `clinic.timezone` (`schema.ts:291`) é por clínica. Divergência real, encontrada de raspão.
3. **Job de exportação integral (#374) nunca provisionado:** tem script (`scripts/exportacao-acervo.mjs`) e rota (`src/app/api/internal/jobs/exportacao-integral/route.ts`), e **não** tem `infra/exportacao/`, Dockerfile, agendador nem serviço no compose. As variáveis em `.env.example:257,266` estão comentadas. Toda solicitação de exportação fica parada em `pendente`.
4. **Governança da via excepcional** (P5, decisão de 25/08/2026, `context.md` §4 e §7): quem além do coordenador autoriza expurgo pela via excepcional (DPO? dono da conta?) fica indefinido de propósito até o primeiro pedido real. Reabrir quando surgir demanda — não desenhar processo especulativo agora.

**Pronto quando:** as quatro entradas no `BACKLOG.md`, com arquivo:linha.
**Gate:** `format`.

---

## T20 — Fechamento

**O quê:** fechar a fatia e abrir o PR.
**Onde:** `.specs/features/fase6/EXECUTION.md` (registrar que o wiring diferido da 6.3 foi fechado) + PR.
**Depende de:** T17, T18, T19.
**Cuidado — PR em pt-BR não fecha issue:** só keyword em inglês (`Closes #352`) fecha. Conferir com `gh issue view 352` **depois** do merge.
**Cuidado — descrição do PR com contexto e decisões**, não só o diff: quem revisa (e o Jules) só vê o diff.
**Cuidado — PR abre em Draft** e só vira _Ready for Review_ com 100% dos testes verdes (`AGENTS.md` §5.4).
**Pronto quando:** `full` verde; migrações medidas em `pg_proc`/`pg_roles`/`information_schema` **depois** de `pnpm db:migrate`; as três mutações de T14 verificadas; `graphify update .` rodado.
**Gate:** `full` + `format`.

---

## Checklist de handoff (`AGENTS.md` §5.2) — fechado

Verificar antes de aplicar a label `jules`. Nenhum ponto pode estar "a validar".

| #   | Ponto                                   | Onde está fechado                                                                                                                                         |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Limites e condição de parada explícitos | T15: lote 200, teto 10 lotes, para em lote vazio. T12/T13: 25 por página. T6: `LIMIT` depois dos predicados.                                              |
| 2   | Dono único de cada leitura/escrita      | Fila lida **só** por `queries.ts` e passada por prop à tabela. Aviso escrito **só** pela varredura SQL. Erasure **só** por `app_purgar_paciente_interno`. |
| 3   | Decisão de produto como aceite fechado  | `context.md` §4 (P1–P4, decididas pelo Rômulo) e §5 (D1–D9).                                                                                              |
| 4   | Casos de borda por nome                 | `spec.md` § _Casos de borda_ — 24 linhas nomeadas.                                                                                                        |
| 5   | Régua de mutação por comportamento      | T14: três mutações nomeadas, por patch inverso.                                                                                                           |
| 6   | Convenção de estilo do arquivo-alvo     | `context.md` §8. Os comentários deste repo explicam o **porquê**, não o **o quê** — ver `logic.ts:15-28` como exemplo.                                    |
| 7   | Comando de formatação no checklist      | `format` em **toda** task; `pnpm format` proibido.                                                                                                        |
