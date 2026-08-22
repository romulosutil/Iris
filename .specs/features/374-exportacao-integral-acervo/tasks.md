# Tasks — Exportação Integral do Acervo (#374)

Ordem de dependência:

```
T1 (migração)
  ├─> T2 (coletor) ─┐
  ├─> T3 (ZIP)     ─┴─> T4 (motor) ─┬─> T5 (job + rota interna)
  │                                 └─> T6 (download)
  └─────────────────────────────────────> T7 (UI, depende de T4+T6)
                                          T8 (expurgo, depende de T4)
```

T2 e T3 são paralelizáveis entre si. T5 e T6 também.

Checklist de saída **de toda task**: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:rls` (quando tocar banco) · `pnpm format` **apenas nos arquivos tocados** · commit em inglês (Conventional Commits).

---

## T1 — Migração `0095`: tabelas, enum, RLS e grants

**Arquivos:** `src/db/schema.ts`, `db/migrations/0095_export_bundle.sql`, `db/migrations/meta/*`, `db/migrations/meta/_journal.json`

1. Adicionar em `schema.ts`: enum `exportBundleStatus`, tabelas `exportBundle` e `exportBundleBlob` conforme `design.md` §2 (colunas, CHECKs, UNIQUE parcial, índice).
2. Rodar **`pnpm db:generate`**. Commitar `.sql` gerado **junto** com `meta/0095_snapshot.json`.
3. **Editar à mão o `.sql` gerado** (sem tocar o snapshot), acrescentando:
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`;
   - policies `export_bundle_select` / `_insert` / `export_bundle_blob_select`, todas resolvendo o tenant por **`app_clinic_id_exigido()`**;
   - **nenhuma** policy de `UPDATE`/`DELETE` para `app_role`;
   - função `SECURITY DEFINER` do owner para as transições de estado (`app_export_bundle_reservar`, `_concluir`, `_falhar`, `_expirar`), cada uma com guard interno que **copia o predicado exato** da policy de `SELECT`;
   - `GRANT`s **coluna a coluna** e `GRANT EXECUTE` nas funções para `app_role`;
   - comentário explicando **por que a tabela não recebe `app_barreira_somente_leitura`** (D10).
4. Entrada manual no `_journal.json` com `when` = anterior **+ 1000**.
5. Aplicar (`pnpm db:migrate`) e **verificar medindo**: `information_schema.column_privileges`, `pg_policies`, `pg_proc` (+ `prosecdef`), ausência do trigger em `pg_trigger`.

**Antes de escrever a policy de `INSERT`:** conferir no repo (`db/migrations/0085*`, `0087*`) qual é o helper vigente para o **usuário** do GUC. Não inventar nome de função.

**DoD:** `src/db/migrations.test.ts` verde · `pnpm test:rls` verde · consulta em `pg_policies` mostra as 3 policies · consulta em `pg_trigger` mostra **zero** trigger de somente-leitura nas tabelas novas.

---

## T2 — Coletor do acervo (NDJSON)

**Arquivos:** `src/lib/export/acervo/coletor.ts` + `coletor.int.test.ts`

- Lista de tabelas **dentro** e lista de **negação** (design.md §4) como constantes exportadas e comentadas.
- Projeção de `app_user` (`id, nome, email, criado_em`); exclusão de `patient.cpf_hash`.
- Exclusão de linhas com `deletado_em IS NOT NULL`.
- Ordenação determinística por PK; timestamps ISO-8601 com timezone.
- Saída em **stream** de NDJSON por tabela (memória constante), + contagem por tabela para o manifest.
- Roda **sob `withTenant`** — nunca com a role dona.

**DoD:** teste de integração com 2 clínicas provando que o coletor da clínica A não traz uma linha sequer da B · teste que garante ausência das tabelas de credencial · teste que garante linha com `deletado_em` fora.

---

## T3 — Empacotador ZIP + manifesto

**Arquivos:** `src/lib/export/acervo/bundle.ts` + `bundle.test.ts`, `package.json` (dependência `fflate`)

- Monta `manifest.json`, `README.txt` (pt-BR), `dados/*.ndjson`, `relatorios/*.pdf`.
- SHA-256 por arquivo e SHA-256 do ZIP inteiro.
- Teto de **250 MiB**: acima disso, lança erro **nomeado** `bundle_excede_limite` (não trunca).
- Reusar `sha256Hex` de `src/lib/report/hash.ts` — não reimplementar.

**DoD:** teste que **abre o ZIP produzido** e confere cada SHA-256 do manifest contra os bytes reais · teste que alterar 1 byte derruba a conferência · teste do teto.

---

## T4 — Motor de estado

**Arquivos:** `src/lib/export/acervo/motor.ts` + `motor.int.test.ts`

- `solicitarExportacao(ctx)`: gate de `responsavel_conta_id`, INSERT `pendente`, `audit_log` `exportacao_integral_solicitada`, tratamento de `23505` lendo o **nome da constraint**.
- `processarProximo()`: `FOR UPDATE SKIP LOCKED LIMIT 1`, predicado de pendente **ou** órfão (`processando` + `iniciado_em < now()-15min`); **reserva antes** do trabalho; teto de 3 tentativas; `withTenant(clinicId, solicitadoPor)`; conclusão gravando `sha256`, `bytes_tamanho`, `expira_em`, `token_hash`; devolve o token cru **uma única vez**.
- `expirarVencidos()`: apaga blob, marca `expirado`, audita.
- Todas as transições passam pelas funções `SECURITY DEFINER` da T1.

**DoD:** os itens 3-7 e 15 da régua de mutação (design.md §7), cada um com seu teste.

---

## T5 — Rota interna + job agendado

**Arquivos:** `src/app/api/internal/exportacao/processar/route.ts` (+ `route.test.ts`), `scripts/exportacao-acervo.mjs` (+ `.test.mjs`), `.env.example`

- Rota: bearer `EXPORT_JOB_TOKEN` comparado em **tempo constante**; env ausente → recusa tudo. Copiar o idioma de `src/app/api/internal/billing/fechar-ciclos/route.ts`.
- Script: **zero dependência npm**, só `fetch` nativo; `--once`; **exit code ≠ 0** em falha.
- `.env.example`: `EXPORT_JOB_URL`, `EXPORT_JOB_TOKEN`.

**DoD:** teste de token errado / ausente / sem prefixo `Bearer ` · teste do exit code · teste de duas execuções concorrentes não pegarem o mesmo bundle.

---

## T6 — Rota de download

**Arquivos:** `src/app/api/exportacao/[bundleId]/download/route.ts` + `route.int.test.ts`

- Exige sessão autenticada **e** ser o responsável **atual** **e** `status='pronto'` **e** `now() < expira_em` **e** `timingSafeEqual(sha256(token), token_hash)`.
- 404 genérico para token inválido **e** para id inexistente · 410 para expirado ou blob ausente · 403 + auditoria para outro usuário autenticado.
- `audit_log` `exportacao_integral_download` no sucesso.

**DoD:** itens 8, 9 e 10 da régua de mutação · teste provando que id inexistente e token errado devolvem a **mesma** resposta.

---

## T7 — UI

**Arquivos:** `src/app/(app)/clinica/exportacao/page.tsx`, `*-cliente.tsx`, `actions.ts`, `src/app/api/exportacao/estado/route.ts`, estórias + `a11y.test.tsx`, link na tarja de somente-leitura

- Server Component busca o estado inicial e passa por prop; o client **não** refaz a busca na 1ª renderização.
- Polling de **10 s**, teto de **60 tentativas**, depois botão "Atualizar".
- Card de sucesso **permanente** até expirar; histórico dos últimos 10 com data, tamanho e SHA-256.
- Menu e rota só para o responsável; para os demais, **403 na rota** além de esconder.
- Link estático "Exportar meu acervo" na tarja de somente-leitura.
- Componentes do design system. Copy em pt-BR.

**DoD:** item 14 da régua (o polling **para**) · teste de a11y · teste de que coordenador não-responsável recebe 403 na rota, não só menu escondido.

---

## T8 — Expurgo dos bundles vencidos

**Arquivos:** rota interna de expurgo (ou extensão da T5), `scripts/` correspondente, `docs/` de provisionamento

- Varredura diária: `pronto` + `expira_em < now()` → apaga blob, marca `expirado`, audita.
- A **linha** de `export_bundle` permanece (trilha); só o blob some.
- Documento de provisionamento no Easypanel seguindo o padrão dos serviços `iris-billing` / `iris-arquivamento` — clique a clique, com "como saber que deu certo".

**DoD:** teste de que o blob some e a linha fica · teste de que bundle não vencido **não** é tocado.

---

## Fechamento do handoff (AGENTS.md §5.2) — status

| # | Ponto | Onde está fechado |
| --- | --- | --- |
| 1 | Limites e parada explícitos | polling 10 s × 60 · 3 tentativas · 15 min de órfão · 72 h de expiração · 250 MiB · 1 bundle/execução |
| 2 | Dono único de cada leitura | Server Component lê e passa por prop (design §5) |
| 3 | Decisão de UX como critério fechado | sucesso **permanente** (design §5) |
| 4 | Bordas por nome | design §6 |
| 5 | Régua de mutação por comportamento | design §7, 15 itens |
| 6 | Convenção de estilo citada | design §8 (comentário explica o **porquê**; exemplos apontados) |
| 7 | Comando de formatação no brief | checklist de saída de cada task |
