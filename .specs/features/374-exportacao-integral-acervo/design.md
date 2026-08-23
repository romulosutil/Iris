# Design — Exportação Integral do Acervo (#374)

## 1. Achados da investigação (medidos, não presumidos)

| Achado                                                                                                                       | Onde                                                                                                     | Consequência de design                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `audit_log.acao` é `text`, não `pgEnum`                                                                                      | `src/db/schema.ts:auditLog`                                                                              | As 5 ações novas **não** exigem migração de enum.                                             |
| `report_pdf.bytes` já é `bytea` no Postgres; não há storage de objeto para o app                                             | `src/db/schema.ts:reportPdf`, `.env.example:48-51` (comentado)                                           | Bundle vai para `bytea` (D6), com teto (D7).                                                  |
| O trigger `app_barreira_somente_leitura` cobre 18 tabelas e **exclui de propósito** `report`, `report_pdf` e `audit_log`     | `db/migrations/0073_conta_somente_leitura.sql:130-152`                                                   | Tabela nova fica fora da lista (D10) e o motivo vai no comentário da migração.                |
| Job = POST magro numa rota interna, autenticado por bearer em tempo constante; imagem do job não herda `node_modules` do app | `src/app/api/internal/billing/fechar-ciclos/route.ts:24-50`, `scripts/fechamento-ciclo-billing.mjs:1-25` | Toda a lógica em TS no app; `scripts/exportacao-acervo.mjs` só faz `fetch`, zero dependência. |
| `patient.arquivado_em` é filtro **de negócio**, nunca de RLS — "arquivado continua legível/exportável"                       | `src/db/schema.ts:394-396` (comentário)                                                                  | Arquivados entram no bundle sem tratamento especial.                                          |
| Soft-delete de erasure é `deletado_em IS NOT NULL` em 3 tabelas                                                              | `src/db/schema.ts:1432,1550,1714`                                                                        | Predicado de exclusão único e testável.                                                       |
| Não há dependência de ZIP no `package.json`                                                                                  | `package.json`                                                                                           | D8 (`fflate`).                                                                                |
| Não há re-autenticação por ação (step-up MFA) no repo                                                                        | `src/auth/require-role.ts`                                                                               | Gate é `responsavel_conta_id` + sessão MFA já vigente; step-up fica fora de escopo.           |

## 2. Modelo de dados (migração `0095`)

```
export_bundle_status  ENUM ('pendente','processando','pronto','falhou','expirado')

export_bundle
  id              uuid  PK
  clinic_id       uuid  NOT NULL  FK clinic
  solicitado_por  uuid  NOT NULL  FK app_user (RESTRICT, igual a report.exportado_por;
                                   a trilha independente vive em audit_log)
  status          export_bundle_status NOT NULL DEFAULT 'pendente'
  solicitado_em   timestamptz NOT NULL DEFAULT now()
  iniciado_em     timestamptz            -- carimbo da reserva; base do resgate de órfão
  concluido_em    timestamptz
  expira_em       timestamptz            -- concluido_em + 72h, gravado na conclusão
  tentativas      integer NOT NULL DEFAULT 0
  erro            text                   -- motivo NOMEADO da falha, nunca stack
  bytes_tamanho   bigint
  sha256          text                   -- do ZIP inteiro
  token_hash      text                   -- sha256 do token de download; o token cru NUNCA é gravado
  manifest        jsonb                  -- cópia do manifest.json (contagens por tabela)

export_bundle_blob
  bundle_id  uuid PK  FK export_bundle ON DELETE CASCADE
  bytes      bytea NOT NULL
```

Constraints e índices:

- `UNIQUE` parcial `uq_export_bundle_ativo ON (clinic_id) WHERE status IN ('pendente','processando')` — uma clínica não empilha pedidos; o 2º pedido é recusado no banco, não só na UI.
- `CHECK export_bundle_pronto_congelado`: `status <> 'pronto' OR (sha256 IS NOT NULL AND bytes_tamanho IS NOT NULL AND expira_em IS NOT NULL AND token_hash IS NOT NULL AND concluido_em IS NOT NULL)` — espelha `report_exportado_congelado`.
- `CHECK export_bundle_falhou_motivado`: `status <> 'falhou' OR erro IS NOT NULL`.
- `index idx_export_bundle_clinic ON (clinic_id, solicitado_em DESC)`.

⚠️ Expressão `NULL` dentro de `CHECK` **satisfaz** a constraint (memória `enum-novo-e-check-numa-migracao`) — os dois CHECKs acima já estão escritos na forma `status <> 'x' OR (...)` justamente por isso; não reescrever como `status = 'x' AND (...)`.

Regras de migração deste repo que se aplicam (CLAUDE.md, seção Migrações):

1. Tabela + enum + índices moram em `schema.ts` → **`pnpm db:generate`**, commitando `.sql` + `meta/NNNN_snapshot.json` juntos.
2. Policies de RLS, `GRANT`s e o comentário do D10 são **editados à mão no `.sql` gerado**, sem tocar o snapshot.
3. Entrada manual no `_journal.json` com `when` = anterior **+ 1000**. `when` menor ou igual ao último aplicado faz o Drizzle **pular o arquivo em silêncio**.
4. Nomes de constraint no padrão Drizzle (`_fk` / `_pk` / `_unique`).
5. `GRANT` explícito **coluna a coluna** para `UPDATE` — coluna nova sem grant gera `permission denied for table X`.
6. Verificar aplicando: `information_schema`, `pg_policies`, `pg_proc` (+ `prosecdef`), `pg_trigger`. `git log` não prova execução.

RLS — toda policy resolve o tenant por **`app_clinic_id_exigido()`**, nunca por `current_setting('app.clinic_id')` cru e nunca por `app_clinic_id_atual()` (que devolve `NULL` e some com a linha em silêncio):

- `export_bundle_select`: `clinic_id = app_clinic_id_exigido()`.
- `export_bundle_insert`: mesmo predicado, **mais** amarração do ator ao usuário do GUC. ⚠️ **Conferir no repo qual é o helper de usuário vigente antes de escrever** (`db/migrations/0085*`, `0087*`); não inventar nome de função.
- `export_bundle_update`: **negado** a `app_role`. Toda transição de estado é do job, via função `SECURITY DEFINER` do owner cujo guard interno **copia o predicado exato** do `select`.
- `export_bundle_blob`: `SELECT` tenant-scoped por junção com `export_bundle`; `INSERT`/`DELETE` só pelo definer.

**D10 escrito na migração:** a tabela nova **não** recebe `app_barreira_somente_leitura`, pela mesma razão que `report`/`report_pdf`/`audit_log` já estão fora — "exportar é leitura, e a promessa é exportação livre justamente no estado de somente-leitura".

## 3. Fluxo

```
[UI /clinica/exportacao]  responsável clica "Exportar acervo"
   -> Server Action  solicitarExportacao()
        requireResponsavelConta(ctx)              -> 403 se não for
        INSERT export_bundle(status='pendente')   -> 409 se UNIQUE parcial bater
        INSERT audit_log 'exportacao_integral_solicitada'

[cron 5 min]  scripts/exportacao-acervo.mjs  (fetch puro, zero deps)
   -> POST /api/internal/exportacao/processar   Bearer EXPORT_JOB_TOKEN
        SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1   -- 1 bundle por execução
          WHERE status='pendente'
             OR (status='processando' AND iniciado_em < now() - 15min)  -- resgate de órfão
        RESERVA PRIMEIRO: status='processando', iniciado_em=now(), tentativas=tentativas+1
        se tentativas > 3 -> status='falhou', erro='tentativas_esgotadas'
        withTenant(clinic_id, solicitado_por)      -- D9: lê sob a RLS do solicitante
          coletor  -> NDJSON por tabela
          PDFs     -> SELECT bytes FROM report_pdf JOIN report
          bundle   -> ZIP (fflate) + manifest.json + README.txt
        se bytes > 250 MiB -> status='falhou', erro='bundle_excede_limite'
        token = randomBytes(32).base64url
        UPDATE status='pronto', sha256, bytes_tamanho,
               expira_em=now()+72h, token_hash=sha256(token), manifest
        INSERT export_bundle_blob
        INSERT audit_log 'exportacao_integral_concluida'
        (o token cru volta uma única vez, para a UI montar o link)

[GET /api/exportacao/:id/download?t=<token>]
        sessão autenticada  E  ctx.userId === clinic.responsavel_conta_id  (ATUAL)
        E status='pronto'  E  now() < expira_em  E  timingSafeEqual(sha256(t), token_hash)
        -> 200 application/zip (Content-Disposition attachment)
           INSERT audit_log 'exportacao_integral_download'
        -> qualquer falha de token/id -> 404 genérico (não vaza existência)
        -> expirado / blob expurgado  -> 410

[cron diário]  expurgo
        status='pronto' AND expira_em < now()  -> DELETE blob, status='expirado'
        INSERT audit_log 'exportacao_integral_expirada'
```

**Por que a reserva vem ANTES do trabalho pesado, e não depois:** a regra oposta
(gravar o estado por último) existe para efeito externo irreversível — não é o caso
aqui. O efeito é interno e refazível, então reservar antes é o que impede duas
execuções concorrentes de montarem o mesmo bundle. Ver `varredura-escreve-o-proprio-predicado`
(#319) e `varredura-filtro-depois-do-limit` (#322): a inversão é deliberada, e o
teto de tentativas é o que impede o loop preso.

## 4. Conteúdo do ZIP

```
manifest.json              versao, clinic{id,nome}, gerado_em, solicitado_por,
                           escopo, contagens_por_tabela, arquivos[{caminho,bytes,sha256}]
README.txt                 o que é cada pasta, o que é NDJSON, como conferir o SHA-256
dados/<tabela>.ndjson      uma linha JSON por registro, ordenado por PK, timestamps ISO-8601
relatorios/<report_id>.pdf bytes congelados de report_pdf, sem re-render
```

**Tabelas dentro** (escopo D4) — clínicas e de contexto do tenant:
`clinic`, `app_user` (projetado: `id, nome, email, criado_em`), `user_role`,
`patient`, `patient_clinical_profile`, `patient_alvo_disciplina`, `consent`,
`professional_consent`, `protocol`, `patient_protocol`, `care_team_membership`,
`janela_trabalho`, `bloqueio`, `agendamento_recorrente`, `session`, `session_note`,
`session_protocol_scope`, `extraction`, `milestone`, `goal`, `goal_milestone_mapping`,
`goal_candidacy`, `milestone_candidacy`, `evidence`, `evidence_revision`,
`evidence_query`, `reinforcer_profile`, `session_snapshot`, `report` (metadados),
`alerta`, `alerta_risco_clinico`, `tcc_rpd_entry`, `instrumento_aplicacao`,
`instrumento_item_texto`, `anamnese`, `anamnese_alvo`, `audit_log`.

**Tabelas fora — lista de negação explícita**, verificada por teste que varre o ZIP:
`auth_account`, `auth_session`, `auth_verification`, `two_factor`, `auth_throttle`
(credenciais); `subscription`, `billing_cycle`, `billing_cycle_patient`,
`asaas_webhook_event` (dado do gateway, não é prontuário); `audio_capture`
(binário fora de escopo hoje); `protocol_familia_catalogo` (catálogo global, não é
acervo da clínica); `export_bundle` / `export_bundle_blob` (auto-referência).

**Colunas fora:** `patient.cpf_hash` (hash cego de reidentificação cruzada) e qualquer
coluna de segredo em `clinic`. `patient.cpf` / `responsavel_cpf` **entram** — são dados
que a própria clínica cadastrou sobre os próprios pacientes.

**Linhas fora:** `deletado_em IS NOT NULL` (erasure aplicado). Linhas pseudonimizadas
em `audit_log` saem **como estão** — pseudonimizado é o estado correto delas.

## 5. UI

Página nova `src/app/(app)/clinica/exportacao/page.tsx`:

- **Server Component** faz a leitura inicial do estado e passa por prop. O client component **não** refaz a busca na primeira renderização (§5.2 ponto 2 do AGENTS.md).
- **Polling:** só enquanto `status ∈ {pendente, processando}`. Intervalo **10 s**, **máximo 60 tentativas (10 min)**; ao esgotar, para e mostra botão "Atualizar" (§5.2 ponto 1). Rota de leitura: `GET /api/exportacao/estado`.
- **O estado de sucesso é PERMANENTE** (§5.2 ponto 3): o card do bundle pronto fica na tela com "expira em Xh" até expirar de fato, e o histórico dos últimos 10 bundles mostra data, tamanho e SHA-256.
- Item de menu e página existem só para o responsável da conta. Para os demais: não aparece no menu **e** a rota devolve 403 — esconder não é autorizar.
- Link "Exportar meu acervo" na tarja / tela de bloqueio de somente-leitura.
  ⚠️ A leitura da tarja **não revalida em navegação client-side** (#285). Por isso o
  elemento é um **link estático**, que não depende de estado revalidado — se fosse um
  botão que reage ao estado da conta, herdaria o bug congelado.
- Componentes vêm do design system (`src/components/ui`). Nada de HTML cru estilizado.
- Estórias de Storybook: no Storybook 10 deste repo `parameters.defaultViewport` é
  ignorado em silêncio — não usar esse caminho para estória de breakpoint.

## 6. Casos de borda — por nome (§5.2 ponto 4)

| Caso                                       | Comportamento fechado                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2º pedido com um ativo                     | `UNIQUE` parcial estoura `23505` → action devolve "já existe uma exportação em andamento", **sem** criar linha nova. O `catch` de `23505` lê o nome da constraint, nunca assume o eixo. |
| Clínica sem paciente nenhum                | Bundle **válido e vazio**: manifest com contagens zeradas + `README.txt`. Não é erro.                                                                                                   |
| Job morre no meio                          | Fica em `processando`; a varredura seguinte resgata por `iniciado_em < now()-15min`, `tentativas+1`.                                                                                    |
| 4ª tentativa                               | `status='falhou'`, `erro='tentativas_esgotadas'`. Terminal — não se auto-cura.                                                                                                          |
| Bundle > 250 MiB                           | `status='falhou'`, `erro='bundle_excede_limite'`. Nunca trunca.                                                                                                                         |
| Token errado / id inexistente              | **404 genérico** nos dois casos. 403 vazaria a existência do bundle.                                                                                                                    |
| Bundle expirado ou blob expurgado          | **410**, com texto mandando solicitar de novo.                                                                                                                                          |
| Download por outro usuário autenticado     | 403 + evento em `audit_log`.                                                                                                                                                            |
| Responsável trocou entre pedido e download | Vale o responsável **atual** da clínica, não quem pediu.                                                                                                                                |
| Conta em somente-leitura / cancelada       | **Funciona.** É o caso de uso principal. Teste explícito.                                                                                                                               |
| Duas execuções do job simultâneas          | `SKIP LOCKED` — a segunda não pega o mesmo bundle.                                                                                                                                      |

## 7. Régua de mutação por comportamento (§5.2 ponto 5)

Cada linha = 1 teste cuja remoção do código correspondente **derruba o teste**:

1. Gate de responsável **nega** para coordenador não-responsável.
2. Gate de responsável **permite** para o responsável.
3. Export **funciona** com conta em somente-leitura.
4. `UNIQUE` parcial **bloqueia** o 2º pedido ativo.
5. A reserva acontece **antes** do trabalho pesado (matar o processo no meio deixa `processando`, não `pendente`).
6. Órfão em `processando` **é resgatado** após 15 min.
7. `tentativas > 3` **para** de tentar.
8. Token inválido **nega**; token válido **libera**.
9. Bundle expirado **nega** (410) mesmo com token certo.
10. Bundle de outra clínica **não aparece** na listagem nem dentro do ZIP (RLS).
11. Tabela da lista de negação **não está** no ZIP — o teste varre o ZIP montado, **nunca** compara com a constante que o próprio código usa.
12. `deletado_em IS NOT NULL` **fica de fora** do NDJSON.
13. SHA-256 do manifest **bate** com os bytes reais de cada arquivo (alterar 1 byte derruba).
14. O polling **para** ao atingir 60 tentativas — "parar" tem teste próprio, além de "começar".
15. Cada uma das 5 ações de `audit_log` é escrita no seu momento.

## 8. Convenções do repo a respeitar

- Comentário neste repo explica **o porquê**, não o quê. Referência de tom e densidade: `src/lib/report/export.ts:6-16` e `db/migrations/0073_conta_somente_leitura.sql:9-22`.
- Documentação e copy em **pt-BR**; mensagens de commit em inglês (Conventional Commits). Para o executor autônomo (Jules), PR / issue / plano em **pt-BR**.
- SQL dentro de template literal JS **não pode conter crase**; regex em template literal precisa de barra dobrada (`\\(`, `\\s`).
- Teste de integração roda com `--config vitest.integration.config.ts` — `vitest run` em `*.int.test.ts` **coleta zero e sai verde**. Conferir a contagem, não o verde.
- `pnpm format` **só nos arquivos tocados** — na raiz ele reformata o repo inteiro. O CI **não** valida Prettier (§5.2 ponto 7).
