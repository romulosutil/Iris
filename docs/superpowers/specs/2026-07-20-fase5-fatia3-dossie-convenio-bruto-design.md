# Fase 5 · Fatia 3 — Dossiê de Auditoria de Convênio (`convenio_bruto`) + render real de PDF

> Design validado por brainstorming + red-team (the-fool). Fonte de verdade do
> escopo desta fatia. Precede o plano de implementação (writing-plans).

## 1. Contexto e fronteira

A Fase 5 (Issue #8) entrega o coordenador e os relatórios. A fundação F0 já
construiu o "cofre e caneta": tabelas `report` / `report_pdf` / `audit_log`,
RLS, purga LGPD e a transação de export (`src/lib/report/export.ts`) com
`StubPdfRenderer`. As Fatias 1 (fila de validação) e 2 (supervisão) já foram
mergeadas.

**Descoberta que redesenhou o fatiamento:** o schema (`report_bruto_sem_ia`
check, `src/db/schema.ts:987-990`) e `docs/agente/agente-2-relatorio-familia.md`
provam que o *Relatório de Família* é **gerado por IA** (Agente 2,
`gerado_por_ia=true`), **não factual**. Apenas `convenio_bruto` é
factual-sem-IA. Por isso a fronteira 3/4 foi redesenhada **pela linha da IA**,
não pelo agrupamento do BACKLOG:791.

### Escopo desta fatia (dentro)

- `report_tipo = convenio_bruto` apenas: dossiê factual de auditoria
  (listagem bruta de sessões, evidências aprovadas e presença do período,
  sem qualquer síntese de IA).
- `PlaywrightPdfRenderer` real (HTML→PDF via Chromium headless), substituindo
  `StubPdfRenderer` no caminho de produção via a interface `PdfRenderer`.
- Rota + server action `src/app/(app)/relatorios/` (não existe hoje): seleção
  paciente + período → preview factual → exportar → download.
- Ajuste de infra do runner Docker para embarcar Chromium (item infra-gate,
  ver §9).

### Fora de escopo (Fatia 4 e além)

- `familia`, `convenio_narrativo`, `avaliativo_interdisciplinar` — todos IA
  (Agente 2 narrativo). Ficam na Fatia 4 (provider stubado atrás da interface,
  curadoria humana, gate `gerado_por_ia`).
- Worker/serviço separado de render (ver dívida registrada §11).
- Offload de bytes de PDF para object storage/MinIO (dívida §11).

## 2. Decisões travadas

| # | Decisão | Motivo |
|---|---------|--------|
| D1 | Fatias 3 e 4 separadas, **3 primeiro**, 1 branch = 1 PR | Padrão Fatia 1/2; Fatia 4 depende do trilho de PDF pronto |
| D2 | Render real via **Chromium/Playwright** agora | Fidelidade HTML/CSS/a11y; F0 já previa |
| D3 | Fronteira 3/4 **pela linha da IA** | `convenio_bruto` é o único factual-sem-IA (check `report_bruto_sem_ia`) |
| D4 | **Não tocar `exportReport`** (trilho F0 auditado) | Colisão de status resolvida por tx única (§4) |
| D5 | Render **in-process** com semáforo, isolado atrás de `PdfRenderer` | YAGNI worker; extrair depois = swap de 1 arquivo |
| D6 | Autz por **papel + RLS**, sem introduzir capability | Não há conceito de capability no código; RLS já escopa linha |
| D7 | Runner Docker → base **Debian slim** + Chromium | Playwright não suporta Alpine oficialmente (frágil) — **item infra-gate, sign-off no PR** |

## 3. Arquitetura por camada

Segue o trilho F0 + o padrão endurecido da Fatia 2 (nada de helper
ctx-accepting exportado de dentro de `"use server"`).

```
src/app/(app)/relatorios/
  page.tsx          # seleção paciente+período, preview, botão exportar, download
  actions.ts        # "use server" — deriva ctx internamente, requireRole, orquestra
  queries.ts        # helpers ctx-accepting (FORA de "use server") — leitura de preview
src/lib/report/convenio-bruto/
  build-payload.ts  # (ctx, tx, patientId, periodo) -> PayloadConvenioBruto  [lê DB sob withTenant]
  build-html.ts     # (payload) -> string HTML  [puro, usa escapeHtml em todo texto livre]
  types.ts          # PayloadConvenioBruto (shape jsonb) — fora de "use server"
src/lib/report/
  playwright-renderer.ts   # PlaywrightPdfRenderer implements PdfRenderer + semáforo
  render-lock.ts           # semáforo de concorrência (máx N=1) para render
```

### Fluxo de dados (exportar dossiê)

1. `page.tsx` chama `queries.ts` (preview) para mostrar contagens factuais do
   recorte sem gravar nada.
2. Usuário confirma → `actions.ts` (`"use server"`):
   - `const ctx = await getTenantContext()` (nunca ctx de input do cliente).
   - `requireRole(ctx, "coordenador", "terapeuta")`.
   - `await withTenant(ctx, async (tx) => { ... })` numa **única transação**:
     - `build-payload.ts` agrega os dados factuais → `PayloadConvenioBruto`.
     - `INSERT INTO report (tipo='convenio_bruto', status='rascunho',
       gerado_por_ia=false, payload, periodo_*, patient_id, clinic_id)`
       retornando `reportId`.
     - `exportReport(tx, { reportId, atorId: ctx.userId,
       buildHtml: buildConvenioBrutoHtml, renderer })` → grava `report_pdf`,
       flip `status='exportado'`, `audit_log(acao='relatorio_exportado')`.
3. `page.tsx` baixa via `getReportPdf` (lê bytes gravados, **nunca re-renderiza**).

## 4. Contrato de status — por que a tx única (resolve C2)

`exportReport` (`export.ts:51-53`) só exporta se `status ∈ (rascunho, revisado)`.
O modelo de dados (`modelo-de-dados.md:841-843`) diz que o backend **nunca grava
rascunho durável** para `convenio_bruto`. Resolução **sem tocar o trilho F0**:

- O `INSERT ... status='rascunho'` e o `exportReport` (que flipa para
  `exportado`) rodam na **mesma transação `withTenant`**. O estado `rascunho` é
  **transiente e nunca committado isoladamente** — nenhum observador externo vê
  um `convenio_bruto` em rascunho. Isso satisfaz literalmente a intenção do
  modelo ("nunca um rascunho durável") e mantém `exportReport` intocado.
- O check `report_bruto_sem_ia` (`gerado_por_ia=false`) e o
  `report_exportado_congelado` são respeitados pela ordem das operações.

## 5. Contrato do payload (`PayloadConvenioBruto`)

`report.payload` jsonb, versão `payload_versao=1`. Listagens factuais congeladas
(nada derivado em tempo de render). Estrutura:

```ts
type PayloadConvenioBruto = {
  paciente: { nome: string };                    // dado mínimo; sem PII extra
  periodo: { inicio: string; fim: string };      // ISO date
  geradoEm: string;                              // ISO timestamp da geração
  sessoes: Array<{
    numeroSequencial: number;                    // session.numeroSequencialPaciente
    data: string;                                // session.agendadaPara / checkInEm
    disciplina: string;
    modalidade: string;
    estado: string;                              // realizada | falta | ...
    justificada: boolean | null;
    terapeuta: string;                           // nome
  }>;
  evidencias: Array<{
    data: string;                                // aprovadoEm
    metaOuDominio: string;                        // goal/milestone/protocol
    classificacao: string;                        // classificacaoOriginal (congelada)
    autor: string;                                // aprovadoPor (nome)
  }>;
  presenca: {
    sessoesRealizadas: number;
    faltasJustificadas: number;
    faltasNaoJustificadas: number;
  };
};
```

> **Gap registrado:** o wireframe §4.6 mostra "episódios de incidente grave" no
> preview, mas **não há coluna de incidente/gravidade no schema** (grep zero em
> `session` e no schema inteiro). Omitido do payload da Fatia 3; modelar como
> item futuro (nova coluna/tabela ou derivação de `session_note`). Registrado no
> BACKLOG.

Fontes (RLS já escopa por ctx): `evidence` (aprovadas), `session`, `goal` /
`milestone` / `protocol` (nome curto do domínio), nomes via `app_user`.

## 6. Template HTML — `buildConvenioBrutoHtml(payload)`

- Função **pura**, recebe payload estruturado, devolve string HTML. Não toca DB.
- **Todo texto livre passa por `escapeHtml`** (`src/lib/report/sanitize.ts:6-8`;
  hoje órfã — esta fatia é o primeiro consumidor).
- Fontes **locais embutidas** (a11y, offline, sem asset remoto). Sem `<script>`.
- Layout: cabeçalho (paciente, período, gerado em), tabela de sessões, tabela de
  evidências (autor + data por linha), bloco de presença. Rodapé com aviso
  factual ("cada linha remete à sessão/evidência de origem, auditável ponto a
  ponto"). Espelha o preview de `fluxos-e-wireframes.md §4.6`.

## 7. Sandbox de segurança do renderer (DoD inegociável — resolve C4)

`PlaywrightPdfRenderer.render(html): Promise<Buffer>` — assinatura idêntica ao
stub, drop-in em `export.ts:57`.

Controles obrigatórios (design F0 §5:265-273), que **devem ser provados a
compor**, não assumidos:

1. `browser.newContext({ javaScriptEnabled: false })` — JS desabilitado no
   contexto.
2. `page.route('**/*', route => route.abort())` — aborta **toda** requisição de
   sub-recurso antes de qualquer navegação de conteúdo.
3. `page.setContent(html, { waitUntil: 'load' })` — conteúdo inline; sem
   `page.goto` para URL externa.
4. `file://` proibido; nenhum caminho de disco interpolado no HTML.
5. Contexto/página isolados e **fechados após cada render** (sem reuso de estado).

**Teste-SSRF positivo é DoD** (não confiar na lista). O teste renderiza payloads
adversariais e assere **zero requisição de saída** para cada vetor torto:

- `<img src="file:///etc/passwd">` e `<img src="http://169.254.169.254/…">`
- `@font-face { src: url(http://attacker/…) }`
- `<style>@import url(http://attacker/…)</style>`
- `<meta http-equiv="refresh" content="0;url=http://attacker/…">`
- `<svg><image href="http://attacker/…"/></svg>`
- `<iframe src="http://attacker/…">` e `<link rel="prefetch" href="…">`

Mecânica do teste: contar chamadas ao handler de `route` / interceptar tentativas
de rede; qualquer request não-abortada = falha.

## 8. Autorização e RLS (resolve C5)

- **Não há capability no código** — autz é 100% papel (`requireRole`) + RLS.
- Gate na action: `requireRole(ctx, "coordenador", "terapeuta")`.
  - `coordenador` (tier Clínica): qualquer paciente da clínica.
  - `terapeuta` (tier Diário / dono da equipe): **só pacientes próprios**,
    garantido por RLS `app_is_on_team(patient_id)` (vínculo
    `care_team_membership` vigente, `vigencia_fim IS NULL`).
  - `admin_recepcao` **bloqueado** (nunca acessa dado clínico).
- Escopo de linha vem do RLS já existente em `evidence` / `session` (as leituras
  do payload retornam apenas linhas no escopo do ator).
- **RESOLVIDO (sem migration):** a policy `report_scope FOR ALL` de
  `db/migrations/0039_fase5_report_audit_rls.sql:21-34` já tem `WITH CHECK
  (app_patient_in_clinic(patient_id) AND (user_role='coordenador' OR
  app_is_on_team(patient_id)))` — cobre o INSERT do `convenio_bruto` para
  coordenador (clínica) e terapeuta on-team. `convenio_bruto` já é valor do enum
  `reportTipo` (`schema.ts:941`). **A Fatia 3 não precisa de migration de
  schema nem de RLS.** `audit_log` exige `ator_id = app.user_id` (garantido, o
  `exportReport` passa `atorId = ctx.userId`).

## 9. Concorrência de render (resolve C1)

Chromium headless consome ~250–500 MB por instância. Sem limite, dois exports
simultâneos no VPS podem causar **OOM que derruba o Next.js inteiro**.

- Semáforo in-process (`render-lock.ts`), **máx 1 render concorrente** (config
  por env, default 1). Requests de export além do limite **enfileiram** (aguardam
  o lock), não disparam Chromium em paralelo.
- Timeout de render (ex.: 30 s) para não travar o lock indefinidamente; falha
  limpa → a tx do export aborta (nada é gravado).

## 10. Infra / Docker (item infra-gate — D7)

`playwright` hoje é só `@playwright/test` em `devDependencies` (E2E). Para render
real em produção:

- Mover `playwright-core` (ou `playwright`) para `dependencies`.
- Runner Docker: trocar base do stage runner de `node:22-alpine` para
  `node:22-slim` (Debian) e instalar Chromium via `playwright install --with-deps
  chromium` no build, copiando o cache; ou instalar o Chromium do sistema e
  apontar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- **Preservar o stage `migrate`** e o gate de deploy (memória
  `deploy-schema-gate`).
- Garantir que `playwright-core` entre no bundle standalone do Next
  (`.next/standalone`) ou seja instalado no runner.

> ⚠️ Este é o único item marcado **"confirmar antes / via única"** do CLAUDE.md
> nesta fatia. A mudança de base de imagem tem raio de explosão para o app
> inteiro (musl→glibc, +~300 MB). **Sign-off explícito do Rômulo no PR** antes do
> merge.

## 11. Dívidas registradas (BACKLOG)

- **Bytes de PDF em `report_pdf.bytes` (bytea) no Postgres.** Com PDF real
  (50 KB–500 KB+ vs marcador do stub), escala mal (bloat de DB, backup). MVP
  aceita; revisitar offload para MinIO/object storage quando o volume crescer.
- **Render in-process acoplado ao runtime.** Extrair para worker/serviço se o
  volume de export justificar (a interface `PdfRenderer` já isola).

## 12. Testes (Definição de pronto)

- **Unit** `build-html`: escapa texto livre (payload com `<script>`/`"` etc.);
  snapshot estrutural do HTML.
- **Unit/contract** `build-payload`: agrega sessões/evidências/presença corretos
  a partir de fixtures; não vaza dado fora do período.
- **Int** export end-to-end com `PlaywrightPdfRenderer`: gera PDF real, grava
  `report_pdf`, flip `status='exportado'`, `audit_log` presente, re-download lê
  bytes sem re-render.
- **Int SSRF** (§7): todos os vetores tortos → zero request de saída.
- **RLS** (`rls.int.test`): terapeuta não exporta paciente fora da equipe;
  `admin_recepcao` bloqueado; coordenador exporta na clínica; isolamento
  multi-tenant.
- **Concorrência**: semáforo serializa 2 exports simultâneos (não estoura o
  limite de Chromium).

### DoD da fatia (AGENTS.md §6)

- [ ] `convenio_bruto` exporta com PDF real, factual, rastreável (autor/timestamp
      por item), respeitando `gerado_por_ia=false` e os checks do schema.
- [ ] Sandbox SSRF provado por teste positivo.
- [ ] Autz papel + RLS coberta por `rls.int.test`.
- [ ] Semáforo de concorrência ativo.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls` verdes.
- [ ] Dockerfile Chromium com sign-off do Rômulo; stage `migrate` intacto.
- [ ] BACKLOG.md atualizado (fatia concluída + dívidas registradas).

## 13. Riscos residuais

| Risco | Mitigação | Confiança |
|-------|-----------|-----------|
| OOM por Chromium concorrente (C1) | Semáforo máx 1 + timeout | HIGH |
| Colisão de status do bruto (C2) | Tx única, F0 intocado | HIGH |
| SSRF via vetor torto (C4) | Teste positivo como DoD | HIGH |
| Autz Diário fura/bloqueia (C5) | requireRole + RLS `app_is_on_team` | HIGH |
| Base Debian quebra o app (C3/D7) | Item infra-gate, sign-off no PR, `migrate` preservado | MEDIUM |
| Bloat de DB por bytea | Dívida registrada, MVP aceita | MEDIUM |
