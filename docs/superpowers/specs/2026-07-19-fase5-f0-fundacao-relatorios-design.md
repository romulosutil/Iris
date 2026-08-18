# Fase 5 — F0: Fundação de Relatórios (Report + audit_log + lib PDF + RLS)

> Status: **rascunho para aprovação** (gate de modelo de dados + RLS). Nenhuma migração roda
> antes deste aval. F0 é a fundação compartilhada que destrava as fatias 1–4 da Fase 5
> (validação, família, convênio bruto, convênio narrativo, supervisão).
>
> Design aprovado pelo Rômulo (19/07/2026) e endurecido por pre-mortem adversarial (mesma data):
> tabela `report` + tabela-filha `report_pdf` (snapshot de bytes imutável, isolado da listagem),
> `audit_log` append-only com ator amarrado à sessão, gravado na **mesma transação** do export
> ANTES de liberar o download; export com trava de race (`FOR UPDATE` + `payload_versao`) e
> soft-delete para retenção/erasure LGPD. Segue os padrões reais do repo
> (`db/migrations/0000..0037`, `src/db/rls.ts`, Drizzle em `src/db/schema.ts`). A DDL canônica
> de `report`/`audit_log` está em `docs/dados/modelo-de-dados.md` §1.6 e §4.4 — esta spec
> **reconcilia** essa DDL com o snapshot de PDF (que o canônico ainda não tinha).

---

## Escopo da F0 (e o que fica de fora)

**Dentro:** enums + tabela `report`; tabela `audit_log`; RLS/REVOKE/grants das duas; a biblioteca
de render de PDF (Chromium headless via Playwright, já dependência do repo) com snapshot de bytes
imutável; a transação de export (congela `pdf_bytes`+`pdf_hash` e grava `audit_log` atomicamente).

**Fora (cada fatia traz o seu):** o conteúdo/template de cada `tipo` de relatório; a UI de
geração/edição; o agente de narrativo (Agente 2, fatia 3/4b); a fila de validação (fatia 1); os
alertas de supervisão (fatia 2). F0 entrega o **cofre e a caneta**, não os documentos.

---

## Ordem de migração

Numeração seguinte a `0037`:

- `0038_fase5_report_audit.sql` — Drizzle-gerada: enums `report_tipo`/`report_status`, tabelas
  `report` e `audit_log`, índices.
- `0039_fase5_report_audit_rls.sql` — SQL à mão (padrão dos `*_rls.sql`): ENABLE/FORCE RLS,
  policies, `REVOKE UPDATE, DELETE` em `audit_log`, grants a `app_role`, trigger de rede de
  segurança em `report.exportado_em`.

---

## 1. Enums + tabela `report` (Drizzle → `0038`)

Reconciliação com `modelo-de-dados.md` §1.6 — **mantém** o canônico, **adiciona** o snapshot:

```
report_tipo   = familia | convenio_bruto | convenio_narrativo | avaliativo_interdisciplinar
report_status = rascunho | revisado | exportado          -- (canônico; NÃO 'finalizado')
```

Colunas (canônico + novas marcadas `[+]`). **Os bytes do PDF NÃO ficam aqui** — vão para a
tabela-filha `report_pdf` (§1.1, pre-mortem #2). `report` guarda só o `pdf_hash` (pequeno) para
manter o invariante "exportado ⇒ congelado" sem inchar a tabela de listagem:

```
id            uuid pk
clinic_id     uuid not null → clinic(id)
patient_id    uuid not null → patient(id)
tipo          report_tipo not null
periodo_inicio date not null
periodo_fim    date not null
status         report_status not null default 'rascunho'
payload        jsonb not null            -- rascunho editável; bruto = listagem estruturada
payload_versao int  not null default 1   [+] -- incrementa a cada UPDATE de payload; trava a race de export (§5)
gerado_por_ia  bool not null default false
pdf_hash       text             [+]      -- null até export; sha256 hex dos bytes (bytes ficam em report_pdf)
deletado_em    timestamptz      [+]      -- null = vigente; soft-delete p/ retenção/erasure LGPD (§3.1, #4)
revisado_por   uuid → app_user(id)
exportado_por  uuid → app_user(id)
exportado_em   timestamptz
criado_em      timestamptz not null default now()
```

Constraints:

- `CHECK (periodo_fim >= periodo_inicio)` (canônico).
- `CHECK (status != 'exportado' OR (exportado_por IS NOT NULL AND exportado_em IS NOT NULL AND
pdf_hash IS NOT NULL))` — **exportado ⇒ tem hash congelado**. Presença dos bytes garantida pela
  FK obrigatória de `report_pdf` no momento do export (§5), na mesma transação.
- `CHECK (tipo != 'convenio_bruto' OR gerado_por_ia = false)` (canônico — bruto nunca é síntese
  de IA; ver [[convenio-report-requirements]]: IA nunca gera o número).
- `pdf_hash` é **write-once**: aplicação só grava na transição para `exportado`; nunca sobrescreve.

Índices (canônico): `(patient_id, criado_em DESC)`, `(clinic_id, tipo)`. Parcial recomendado:
`(patient_id, criado_em DESC) WHERE deletado_em IS NULL` (listagem só de vigentes).

### 1.1 Tabela-filha `report_pdf` (1:1) — o blob isolado

```
report_pdf:
  report_id  uuid PRIMARY KEY → report(id)   -- 1:1; blob NUNCA na tabela quente de listagem
  bytes      bytea not null                  -- snapshot imutável
  hash       text  not null                  -- sha256(bytes); redundante com report.pdf_hash p/ conferência
  criado_em  timestamptz not null default now()
```

- Só existe linha aqui quando o `report` foi exportado → a FK obrigatória É a garantia de "exportado
  tem bytes". `REVOKE UPDATE, DELETE` (write-once, imutável).
- Nenhuma query de lista toca `report_pdf`; só o endpoint de download faz o JOIN explícito.
- Elimina o footgun do ORM: `select().from(report)` nunca puxa MB de PDF (pre-mortem #2).
- **RLS própria e obrigatória (§3.3):** não basta a tabela-pai ter RLS. `report_pdf` guarda o dado
  mais sensível do sistema (PDF de menor); sem RLS própria, qualquer `app_role` lê `bytes` por
  `report_id` cross-tenant (red-team #1). SELECT gated na visibilidade do `report` pai.

> **`bytea` no Postgres, decisão aprovada.** PDF de convênio/família é o artefato legal que sai
> do sistema com dado de menor — precisa ser byte-idêntico ao que foi baixado, para sempre.
> Guardar no banco (não em storage externo) mantém o snapshot dentro da mesma fronteira
> transacional e de RLS do resto do prontuário, sem uma segunda superfície (MinIO/S3) para
> vazar ou dessincronizar. Custo: o blob vive em `report_pdf` (§1.1), fora da tabela de listagem,
> então nenhuma query quente o carrega. Reavaliar `bytea` vs. storage dedicado se o volume de PDFs
> crescer muito e o `pg_dump`/replicação incharem (dívida registrada no BACKLOG).

---

## 2. Tabela `audit_log` (Drizzle → `0038`)

Conforme `modelo-de-dados.md` §4.4:

```
id          uuid pk
clinic_id   uuid not null → clinic(id)
ator_id     uuid not null → app_user(id)
acao        text not null      -- 'relatorio_exportado' | 'reclassificacao' | 'vinculo_encerrado' | ...
entidade    text not null      -- 'report' | 'evidence' | 'care_team_membership' | ...
entidade_id uuid not null
patient_id  uuid → patient(id) -- obrigatório quando ação envolve dado de menor saindo do sistema
detalhe     jsonb
criado_em   timestamptz not null default now()
```

Índice: `(patient_id, criado_em DESC)`.

> **Efeito colateral:** a Fase 4 já _previa_ gravar `audit_log` em reclassificação/invalidação
> (DoD da spec `2026-07-13-fase-4-ddl-4a-4b.md`), mas a tabela nunca foi criada — a escrita
> ficou pendente. F0 cria a tabela e **destrava retroativamente** essa gravação. F0 não
> retrofita o código de reclassificação (fica para a fatia 1, que já mexe em governança); só
> garante que o destino existe.

---

## 3. RLS (SQL à mão → `0039`)

Modelado nos padrões de `rls.ts` / `*_rls.sql`.

> **Base de confiança (red-team #3):** toda a RLS abaixo depende de `app.clinic_id`/`app.user_id`/
> `app.user_role` serem setados **server-side a partir da sessão autenticada** (`SET LOCAL` no início
> da transação), **nunca** a partir de input de request. F0 herda esse contrato de `rls.ts` — não o
> reinventa. Se qualquer endpoint novo aceitar `clinic_id`/`user_id` do cliente e passar pro `SET`,
> toda a RLS cai. Guardrail: F0 não adiciona nenhum caminho que sete session var fora do middleware
> de sessão existente.

### 3.1 `report` — escopo tenant + clínico, soft-delete

```
ALTER TABLE report ENABLE ROW LEVEL SECURITY;
ALTER TABLE report FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON report TO app_role;   -- sem DELETE p/ app_role (só soft-delete via deletado_em)
-- SELECT/escrita: paciente na clínica + acesso clínico (coordenador toda a clínica; terapeuta
-- da equipe) E linha vigente (deletado_em IS NULL). Espelha evidence_select / candidacy.
CREATE POLICY report_scope ON report FOR ALL TO app_role USING (
  deletado_em IS NULL
  AND app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
) WITH CHECK (
  app_patient_in_clinic(patient_id)
  AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
);
```

- **Sem `DELETE` para `app_role`, mas eliminável:** hard-delete físico só via `SECURITY DEFINER` de
  purga (abaixo). O fluxo normal usa **soft-delete** (`deletado_em`), que a policy esconde. Isso
  reconcilia as duas exigências que colidiam (pre-mortem #4): **imutável enquanto vive** (auditoria)
  **e eliminável ao fim da retenção** (LGPD, direito do titular — dado de menor).
- **`UPDATE` permitido** só enquanto `status='rascunho'` — reforço na aplicação; o CHECK de
  `exportado ⇒ pdf_hash NOT NULL` já impede um exportado voltar a rascunho sem quebrar invariante.
- **Purga (retenção/erasure):** `app_purgar_report(p_report uuid, p_motivo text)` `SECURITY DEFINER`
  — recebe **um único** report id (nunca lote), grava `audit_log(acao='relatorio_purgado',
detalhe={motivo, hash})` **primeiro** e **só então** `DELETE` físico de `report` + `report_pdf`
  (cascata), tudo na mesma tx (red-team #4: ordem log-antes-de-delete é invariante, não convenção;
  `audit_log.entidade_id` não tem FK a `report`, então o log sobrevive ao delete). Definer filtra
  explicitamente pelo `p_report` passado; `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE` só ao role de
  coordenador/DPO. Eliminação rastreada, não cirurgia de superuser.

> **Default = manter.** Nada apaga sozinho; o histórico do Rômulo está preservado. `deletado_em`/
> purga só existem para quando a lei exigir eliminação — reversível-seguro desde já, sem migração
> futura. **Uso secundário do acervo ("Iris empresa de dados") NÃO passa por aqui** — ver §6.4.

### 3.2 `audit_log` — append-only, ator amarrado à sessão, leitura restrita

```
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON audit_log FROM app_role;     -- imutável (LGPD)
GRANT SELECT, INSERT ON audit_log TO app_role;
-- INSERT: ator amarrado à sessão + tenant. NÃO basta clinic_id — a trilha SÓ vale se o ator_id
-- for comprovadamente quem está na sessão (pre-mortem #3). App não pode forjar/errar o ator.
CREATE POLICY audit_insert ON audit_log FOR INSERT TO app_role WITH CHECK (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND ator_id  = current_setting('app.user_id')::uuid
);
-- SELECT: só coordenador/admin da própria clínica (trilha de auditoria não é leitura de terapeuta).
CREATE POLICY audit_select ON audit_log FOR SELECT TO app_role USING (
  clinic_id = current_setting('app.clinic_id')::uuid
  AND current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
);
```

> ⚠️ **Papel de leitura da trilha a confirmar:** `admin_recepcao` vê a trilha? Auditoria LGPD é
> tipicamente do responsável/DPO. Deixei `coordenador` + `admin_recepcao`; se o DPO for um papel
> à parte, ajustar na fatia 1. Decisão aberta (ver §6).

### 3.3 `report_pdf` — RLS gated no pai (correção red-team #1)

```
ALTER TABLE report_pdf ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_pdf FORCE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON report_pdf FROM app_role;   -- write-once
GRANT SELECT, INSERT ON report_pdf TO app_role;
-- SELECT/INSERT só se o report PAI for visível ao usuário (mesmo escopo tenant+clínico+vigente).
-- Sem isto, SELECT ... FROM report_pdf WHERE report_id=? vaza PDF de menor cross-tenant.
CREATE POLICY report_pdf_scope ON report_pdf FOR ALL TO app_role USING (
  EXISTS (SELECT 1 FROM report r WHERE r.id = report_pdf.report_id
          AND r.deletado_em IS NULL
          AND app_patient_in_clinic(r.patient_id)
          AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(r.patient_id)))
) WITH CHECK (
  EXISTS (SELECT 1 FROM report r WHERE r.id = report_pdf.report_id
          AND app_patient_in_clinic(r.patient_id)
          AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(r.patient_id)))
);
```

- **Soft-delete propaga:** o `deletado_em IS NULL` no USING garante que um relatório soft-deletado
  também esconde o PDF — download não serve bytes de relatório "eliminado" (red-team #6).
- A subquery a `report` roda sob a RLS do próprio `report`; usar `security_barrier` na view de
  download se houver, para não vazar por predicado empurrado.

---

## 4. Integridade do export — sem trigger placebo (correção pre-mortem #5)

O `modelo-de-dados.md` §4.4 sugeria um trigger de `RAISE WARNING` em `report.exportado_em` para
detectar export sem log. **Descartado:** como a app grava export + log na mesma transação (§5),
esse trigger nunca dispara no caminho normal, e `RAISE WARNING` é engolido em prod — controle de
detecção sem canal de alerta é placebo, dá falsa cobertura. No lugar, dois controles reais:

1. **Invariante de aplicação:** export é uma transação única (§5); se o `INSERT audit_log` falha,
   a transação inteira faz rollback e o `report` **não** vira `exportado`. Atomicidade > trigger.
2. **Reconciliação observável (fora de F0, mas registrar):** query de monitoração periódica
   `report exportado sem audit_log correspondente` → alerta real na observabilidade. Pega export
   out-of-band (SQL manual, bug de migração) — o único caso que o trigger tentava cobrir.

Write-once de `pdf_hash`/`report_pdf.bytes`: garantido por `REVOKE UPDATE` em `report_pdf` + a app
nunca reescrever `pdf_hash`. Sem trigger necessário.

---

## 5. Biblioteca de PDF + transação de export

`src/lib/report/` (novo), reutilizando o padrão de provider já usado em `src/lib/extraction/`:

- **Render:** HTML (template por `tipo`, vem nas fatias) → PDF via Chromium headless (Playwright,
  já no repo para E2E). Determinístico: sem `Date.now()` embutido no corpo renderizado além do
  período; fontes locais (a11y — [[acessibilidade-core]]).
- **Sandbox de render — não-negociável (red-team #2, SSRF/LFI).** O corpo carrega texto livre de
  terapeuta ([[prompt-injection-fase3]]); render de HTML de conteúdo de usuário é vetor de
  exfiltração. Obrigatório: (a) **JavaScript desabilitado** no contexto de render; (b) **rede
  bloqueada** — interceptar e negar TODA requisição do Chromium (`route.abort()` para
  `http/https/file/data` externos), permitindo só assets locais empacotados; (c) `file://`
  proibido; (d) **escapar/sanitizar** todo conteúdo interpolado (nada de HTML cru do usuário no
  template — texto vira texto, não markup); (e) processo isolado sem acesso a rede de metadata.
  Teste de segurança no DoD: payload com `<img src=file:///…>` e `<iframe src=http://169.254…>`
  não dispara nenhuma requisição de saída.
- **Export (ordem inegociável, com trava de race — pre-mortem #1):**
  1. Lê `report` (incl. `payload` e `payload_versao = V`). Aborta se `status != 'rascunho'/'revisado'`.
  2. Renderiza o PDF a partir do `payload` lido (Chromium, ~segundos — **fora** de qualquer tx aberta).
  3. `sha256(bytes)` → `hash`.
  4. **Abre a transação:** `SELECT ... FROM report WHERE id=? FOR UPDATE`; **re-confere
     `payload_versao = V`**. Se mudou (alguém editou durante o render) → **rollback e reinicia** do
     passo 1. Isso impede congelar um PDF de payload obsoleto.
  5. Ainda na tx: `INSERT report_pdf(report_id, bytes, hash)` **+** `UPDATE report SET
status='exportado', pdf_hash=hash, exportado_por=…, exportado_em=now()` **+** `INSERT
audit_log(acao='relatorio_exportado', entidade='report', entidade_id, patient_id, ator_id,
detalhe={tipo, periodo, hash})`.
  6. **Só após COMMIT** os bytes são liberados para download.
- **Concorrência:** um único relatório por paciente, agregando todas as disciplinas, é editado por
  coordenador + terapeutas → várias mãos na **mesma linha**. Por isso o `FOR UPDATE` + `payload_versao`
  não é opcional: sem ele, save-durante-export congela texto errado com hash "íntegro".
- **Re-download** de um exportado devolve `report_pdf.bytes` do banco (o snapshot), **nunca**
  re-renderiza — garante identidade byte-a-byte ao longo do tempo mesmo que o template mude depois.
- Toda geração/export por IA carrega `gerado_por_ia=true` e curadoria humana obrigatória antes do
  export (fatias 3/4b); F0 só provê o trilho.

---

## 6. Decisões abertas (não travam F0, mas registrar)

1. **Gating por tier de plano (família=Clínica, narrativo=Convênio, bruto=Diário) — DIFERIDO.**
   `clinic` **não tem** campo de plano/tier hoje; não existe modelo de billing no schema. F0
   **não** inventa cobrança: RLS fica tenant+clínico. Quando o modelo de planos existir, o gating
   por `tipo` de relatório entra como policy adicional (ou guard de aplicação) sem alterar a
   fundação. → decisão para o Rômulo: onde mora o tier (coluna em `clinic`? tabela `subscription`?)
   e em que fase. Registrar no BACKLOG.
2. **Leitor da trilha de auditoria** (§3.2): `admin_recepcao` inclui-se? DPO é papel à parte?
3. **Política de retenção concreta** (§3.1): F0 entrega a _capacidade_ (soft-delete + purga com
   trilha), mas o _prazo_ (quantos anos até poder purgar, por `tipo`) vem de `docs/legal/` — CFM/
   prontuário. Aberto; não trava F0 (default = manter).
4. **Uso secundário do acervo — "Iris empresa de dados" — DECISÃO JURÍDICA, MAIOR QUE F0.** O
   Rômulo quer usar dados para melhorar o produto. **Não pode** rodar sobre o PDF/prontuário bruto
   identificável de menor (nome + CID F84 + evolução): dado pessoal sensível de criança para uso
   secundário exige base legal própria (consentimento específico separado do cuidado) **e/ou**
   anonimização/pseudonimização irreversível antes do uso. O ativo de dados tem que ser uma
   **derivação anonimizada/agregada**, nunca o acervo cru. F0 **não cria nenhum caminho** de
   analytics/export para treino sobre `report`/`report_pdf` — esse pipeline é outra fase, com base
   legal validada por advogado. **Ação:** 1 página em `docs/legal/` respondendo "base legal + forma
   (anonimizada?) do uso secundário de dado clínico de menor" antes de qualquer pipeline. Registrar
   no BACKLOG como bloqueador de qualquer feature de "dados".

---

## Definição de Pronto (F0) — checklist

- [ ] Migrações `0038`+`0039` aplicam local e são reversíveis (inclui `report_pdf`).
- [ ] RLS de `report` testado: SELECT cross-tenant → 0 linhas; terapeuta fora da equipe → 0;
      linha com `deletado_em` preenchido → invisível (soft-delete).
- [ ] `audit_log`: `UPDATE`/`DELETE` por `app_role` falha; SELECT por terapeuta (não coordenador)
      → 0 linhas; INSERT cross-tenant → rejeitado; **INSERT com `ator_id ≠ app.user_id` → rejeitado**
      (ator amarrado à sessão, pre-mortem #3).
- [ ] `report_pdf`: `UPDATE`/`DELETE` por `app_role` falha (write-once).
- [ ] **`report_pdf` RLS (red-team #1):** `SELECT … FROM report_pdf WHERE report_id=?` de outra
      clínica → 0 linhas; terapeuta fora da equipe → 0; report soft-deletado → PDF invisível.
- [ ] **Sandbox de render (red-team #2):** payload com `<img src=file:///…>` / `<iframe
src=http://169.254.169.254/…>` → nenhuma requisição de saída do Chromium; conteúdo interpolado
      escapado (markup do usuário não vira HTML).
- [ ] CHECK `exportado ⇒ pdf_hash NOT NULL` impede export sem snapshot; FK de `report_pdf` garante
      bytes presentes.
- [ ] **Race de export (pre-mortem #1):** teste — editar `payload` (↑`payload_versao`) entre render
      e commit → export aborta/reinicia, nunca congela payload obsoleto.
- [ ] Export grava `report_pdf` + `report` + `audit_log` na **mesma transação**; falha no INSERT do
      log faz rollback (teste: forçar erro no log → status não vira 'exportado', sem `report_pdf`).
- [ ] Re-download devolve `report_pdf.bytes` (hash idêntico), não re-renderiza.
- [ ] `report_pdf.hash` = `sha256(bytes)` conferido em teste.
- [ ] Lista de relatórios **não** faz JOIN em `report_pdf` (blob nunca em query quente).
- [ ] Purga `app_purgar_report`: grava `audit_log(relatorio_purgado)` **antes** do DELETE físico;
      cascata remove `report_pdf`; só coordenador/DPO executa.
- [ ] `pnpm typecheck`/`lint`/`test`/`test:rls` verdes.
- [ ] `modelo-de-dados.md` §1.6/§4.4 atualizado: `report_pdf`, `payload_versao`, `deletado_em`,
      `pdf_hash`, ator amarrado no INSERT do log (reconciliação).
- [ ] BACKLOG atualizado: tier-gating diferido; retenção concreta (docs/legal); **uso secundário de
      dado de menor como bloqueador jurídico**; dívida de volume de `bytea`.
