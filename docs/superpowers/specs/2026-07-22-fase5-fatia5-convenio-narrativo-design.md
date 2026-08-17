# Fase 5 · Fatia 5 — Relatório de Convênio Narrativo (IA + curadoria humana)

> Design validado por brainstorming (22/07/2026). Fonte de verdade do escopo
> desta fatia. **Fecha a Issue #8** (4º bullet: "relatório de convênio NARRATIVO
> gerado por IA com curadoria humana"). Encaixa no trilho reusável de relatório
> IA construído pela Fatia 4 (`familia`).

## 1. Contexto e fronteira

A Fatia 3 entregou `convenio_bruto` (dossiê factual, sem IA) e o trilho real de
PDF (`PlaywrightPdfRenderer`, `exportReport`, rota `/relatorios`). A Fatia 4
entregou o **primeiro relatório IA** (`familia`) e a **máquina de curadoria**
(rascunho durável → revisado → exportado). Esta fatia entrega o
`convenio_narrativo`: o relatório de convênio NARRATIVO, **projeção de IA sobre o
dossiê factual**, com curadoria humana obrigatória.

**Insight central (projeção, não reconstrução):** o dossiê factual do
`convenio_bruto` é a fonte-de-verdade dos números. A IA recebe esse dossiê + um
cabeçalho fornecido pelo humano e escreve **apenas a justificativa clínica
anti-glosa** em volta dos dados medidos. A IA **nunca gera número**
(memória `convenio-report-requirements`: auditoria de operadora rejeita narrativo
puro, aprova dado mensurável; motivo nº1 de glosa = relatório genérico sem
métrica). O PDF renderiza **dossiê factual (tabelas medidas) + narrativa** juntos.

### Dentro do escopo

- `report.tipo = convenio_narrativo`, `gerado_por_ia = true`.
- Contrato do agente narrador de convênio (doc novo `docs/agente/agente-3-convenio-narrativo.md`, regras C1–C8).
- Provider atrás de interface, com **stub determinístico** (demo/testes sem LLM) e
  `ClaudeProvider` real atrás de flag + gate LGPD (§6). Real fica esqueleto pós-DPA.
- Máquina de curadoria reusando o padrão da Fatia 4: gerar rascunho → coordenador
  cura → exporta PDF. Reusa `exportReport` (F0 intocado).
- `build-input` que **reusa `buildConvenioBrutoPayload`** para o dossiê factual +
  cabeçalho digitado na geração.
- `build-html` do relatório de convênio (dossiê factual + narrativa, `escapeHtml`,
  tom técnico C1).
- Extensão da rota/actions `src/app/(app)/relatorios/`.
- **Migração curta:** CHECK `report_narrativo_com_ia` simétrico ao
  `report_bruto_sem_ia` (§7). Confirmado com o Rômulo (22/07) — DDL em tabela com
  dado de teste, aprovado.

### Fora do escopo

- `avaliativo_interdisciplinar` (contrato de agente não escrito; fatia futura,
  fora da Issue #8).
- Templating por-operadora. **Um template genérico anti-glosa**; `operadora` é
  campo livre no cabeçalho. Per-operadora fica como dívida (YAGNI até operadora
  piloto real).
- Modelo de prescrição externa / entidade de convênio do paciente. Cabeçalho
  (operadora/CID/finalidade) é digitado no form de geração, persistido no payload.
- `MilestoneAssessment` formal (deferido desde a Fase 4). O relatório consome só o
  que o dossiê factual já expõe.
- Worker de render / offload de bytes p/ MinIO (dívidas já registradas na Fatia 3).

## 2. Decisões travadas

| #   | Decisão                                                                                   | Motivo                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Só `convenio_narrativo` nesta PR; 1 branch = 1 PR                                         | Padrão Fatias 1–4; fecha a Issue #8                                                                                                                                              |
| D2  | **Projeção sobre o dossiê** — input reusa `buildConvenioBrutoPayload`                     | Números vêm do factual verbatim; IA nunca fabrica (memória convenio; C2)                                                                                                         |
| D3  | Dossiê factual **embutido no payload** + renderizado junto da narrativa                   | Auditor de operadora exige dado mensurável ao lado da justificativa (anti-glosa)                                                                                                 |
| D4  | IA-original **e** curado no mesmo `payload` jsonb; dossiê imutável                        | Evita DDL; preserva rascunho da IA p/ auditoria. `build-html` renderiza `curado ?? iaOriginal`                                                                                   |
| D5  | Rascunho **durável**                                                                      | Convênio exige revisão humana entre geração e export (peça legal externa)                                                                                                        |
| D6  | **Coordenador-only nas 3 ações** (gerar/curar/exportar)                                   | Convênio é documento legal/externo à operadora — mais restrito que família (que deixa terapeuta gerar). `admin_recepcao` e terapeuta fora                                        |
| D7  | Export só aceita `revisado` (gate na action)                                              | Impõe curadoria (C7) antes de virar peça de cobertura                                                                                                                            |
| D8  | Cabeçalho (operadora/CID/finalidade) digitado na geração, **editável na curadoria**       | Sem modelo de prescrição externa; humano no controle do dado legal (C5). Curadoria é onde o coordenador finaliza a peça legal → cabeçalho deve ser corrigível ali (Brecha 2)     |
| D9  | Migration CHECK `report_narrativo_com_ia` (`NOT VALID` + `VALIDATE`) + garantia app-layer | Defesa em profundidade simétrica ao `report_bruto_sem_ia`. `NOT VALID`+`VALIDATE` evita lock longo no deploy (Brecha 9)                                                          |
| D10 | **Dossiê é snapshot intencional** congelado em `geradoEm`; NÃO re-buscado no export       | Doc legal "com data de extração". Re-buscar no export desincronizaria número↔narrativa (quebraria C2/C3). Label `geradoEm` visível + botão regenerar cobrem staleness (Brecha 3) |
| D11 | **C2 é garantia só no stub**; provider real = instrução + validador numeric-guard         | LLM pode alucinar número apesar do prompt. Números autoritativos vivem só no bloco factual do dossiê; narrativa é qualitativa; parse valida (Brecha 4)                           |
| D12 | `renderDossieTablesHtml` extraído p/ helper compartilhado                                 | Evita duplicar a tabela factual entre `convenio-bruto` e `convenio-narrativo` build-html (Brecha 5)                                                                              |

## 3. Arquitetura por camada

Espelha `src/lib/report/familia/` e `convenio-bruto/`. Padrão anti-`ctx`-forjável
(issue #55): nenhum helper que aceita `ctx` é exportado de dentro de um módulo
`"use server"`.

```
src/lib/report/convenio-bruto/
  render-dossie.ts    # (REFATORAÇÃO) renderDossieTablesHtml(dossie) -> string  [helper puro extraído de build-html; usado por bruto E narrativo] (Brecha 5)
  build-html.ts       # (REFATORADO) passa a chamar renderDossieTablesHtml
src/lib/report/convenio-narrativo/
  types.ts            # ConvenioNarrativoInput, ConvenioNarrativoDraft (C1–C8), PayloadConvenioNarrativo
  build-input.ts      # (tx, args) -> ConvenioNarrativoInput  [reusa buildConvenioBrutoPayload sob withTenant]
  provider.ts         # ConvenioNarrativoProvider (interface) + resolveConvenioNarrativoProvider(clinic) + validarDraftContraDossie (numeric-guard, D11)
  stub-provider.ts    # StubConvenioNarrativoProvider — draft determinístico das contagens do dossiê
  claude-provider.ts  # ClaudeProvider real (gated) — esqueleto testável; parse + numeric-guard antes de retornar (D11)
  build-html.ts       # (PayloadConvenioNarrativo) -> string HTML  [puro; reusa renderDossieTablesHtml; escapeHtml em todo texto livre]
src/app/(app)/relatorios/
  convenio-narrativo-logic.ts  # server-only, ctx-accepting: gerarRascunho / curar / exportar (NÃO "use server")
  actions.ts (estende)         # gerar/curar/exportar Action ("use server", só derivam ctx e delegam)
  queries.ts (estende)         # preview do recorte + leitura do rascunho p/ a tela de curadoria
  convenio-narrativo-report.tsx # ("use client") clona familia-report.tsx: form de cabeçalho + editor de curadoria
  page.tsx (estende)           # nova tile (podeCurar = role === coordenador)
db/migrations/
  00XX_report_narrativo_com_ia.sql  # CHECK constraint simétrico
docs/agente/
  agente-3-convenio-narrativo.md    # contrato C1–C8
```

## 4. Contrato do agente (C1–C8) — `docs/agente/agente-3-convenio-narrativo.md`

Contrato de **projeção**: a IA redige a justificativa clínica em volta de um
dossiê factual imutável, para o público auditor médico de operadora.

- **C1 — Tom técnico/clínico.** Audiência = auditor médico da operadora, não a
  família. Linguagem profissional, sem infantilização; ≠ tom leigo do Agente 2.
- **C2 — IA nunca gera número.** Todo dado quantitativo (contagens, presença,
  datas) vem do dossiê factual embutido. A IA cita, não calcula nem inventa.
  **Fronteira de garantia (D11):** no **stub** isto é garantido por construção
  (determinístico, extrai do `dossie`). No **provider real** é (a) instrução de
  prompt + (b) `validarDraftContraDossie` — um numeric-guard que roda no parse:
  extrai tokens numéricos dos campos livres da narrativa e rejeita/sinaliza o
  draft se contiver número que não aparece no `dossie`. Além disso, os números
  autoritativos vivem só no **bloco factual** (renderizado por nós a partir do
  `dossie`); a narrativa deve referenciar domínios qualitativamente.
- **C3 — Fundamentar continuidade em evidência medida.** A justificativa de
  manutenção/reavaliação referencia as contagens e evidências do dossiê
  (anti-glosa: relatório sem métrica = glosa).
- **C4 — Platô honesto.** Se o dossiê não mostra avanço no período,
  `periodoSemAvancoVisivel = true` + `notaHonestidade` que declara o platô e
  justifica manutenção/ajuste de conduta. **Nunca fabricar narrativa de progresso.**
- **C5 — Diagnóstico e cobertura são dados humanos.** CID, operadora e finalidade
  vêm do cabeçalho fornecido pelo coordenador (prescrição médica externa). A IA
  não infere nem inventa diagnóstico. **O CID é transcrito, não emitido pela
  clínica** (Brecha 8): o campo é rotulado "CID (conforme prescrição médica
  assistente)" na UI e no PDF, e o rodapé reforça que o diagnóstico é do médico
  assistente externo — a clínica não diagnostica.
- **C6 — PII mínima.** Apenas nome do paciente + dados clínicos do período. Sem
  dado sensível além do necessário para justificar a cobertura.
- **C7 — Curadoria humana obrigatória.** O coordenador revisa e assume a
  responsabilidade antes do export. `status = rascunho_para_revisao` na saída da IA.
- **C8 — Linguagem defensável.** Sem promessa de cura, sem superlativo não
  sustentado por dado, sem afirmação que a evidência do dossiê não suporta.

## 5. Contratos de tipo

```ts
// Entrada que o provider recebe. Números vêm do dossiê factual (C2).
type ConvenioNarrativoInput = {
  paciente: { nome: string };
  periodo: { inicio: string; fim: string }; // ISO date
  cabecalho: {
    operadora: string; // C5 — humano
    cid: string | null; // C5 — F84.x da prescrição externa
    finalidade: string; // ex.: "solicitação de manutenção de cobertura"
  };
  dossie: PayloadConvenioBruto; // factual verbatim (Fatia 3)
};

// Saída do agente = C1–C8.
type ConvenioNarrativoDraft = {
  resumoClinico: string; // quadro + justificativa do acompanhamento (C1/C3)
  evolucaoPorDominio: Array<{ dominio: string; narrativa: string }>; // C3, cita contagens do dossiê
  justificativaContinuidade: string; // C3 anti-glosa
  objetivosProximoPeriodo: string[]; // max 5
  periodoSemAvancoVisivel: boolean; // C4
  notaHonestidade: string | null; // C4, só quando true
  status: "rascunho_para_revisao"; // C7
};

// Forma persistida em report.payload (jsonb). SEM DDL de schema (só o CHECK).
type PayloadConvenioNarrativo = {
  versao: 1;
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  cabecalho: { operadora: string; cid: string | null; finalidade: string };
  geradoEm: string; // ISO — data de extração do snapshot (D10, rótulo no PDF)
  provider: "stub" | "claude";
  dossie: PayloadConvenioBruto; // snapshot factual congelado em geradoEm (D3/D10) — NÃO re-buscado no export
  iaOriginal: ConvenioNarrativoDraft; // imutável (auditoria)
  curado: ConvenioNarrativoDraft | null; // null até o coordenador revisar
};
```

`build-html` sempre renderiza o `dossie` (factual) + `payload.curado ?? payload.iaOriginal`.

**Curadoria edita narrativa E cabeçalho (D8/Brecha 2).** O schema da ação `curar`:

```ts
const curarConvenioNarrativoSchema = z.object({
  reportId: z.string().uuid(),
  versaoEsperada: z.number().int().positive(),
  cabecalhoEditado: z.object({                               // corrige operadora/CID/finalidade
    operadora: z.string().min(1),
    cid: z.string().nullable(),
    finalidade: z.string().min(1),
  }),
  draftEditado: /* zod de ConvenioNarrativoDraft */,
});
```

`curar` faz `jsonb_set` em `{curado}` **e** `{cabecalho}` na mesma UPDATE (a
narrativa curada e o cabeçalho legal finalizam juntos).

## 6. Provider (Agente 3)

Interface + roteamento espelhando `resolveFamilyReportProvider` e `resolveProvider`
da extração:

```ts
interface ConvenioNarrativoProvider {
  gerar(input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft>;
}
function resolveConvenioNarrativoProvider(clinic: {
  isDemo: boolean;
}): ConvenioNarrativoProvider;
```

- **Demo → StubConvenioNarrativoProvider.** Determinístico, sem LLM. Deriva o
  draft do `dossie`:
  - **evolucaoPorDominio:** um item por domínio/meta presente no dossiê; narrativa
    templada citando a contagem factual daquele domínio (nunca inventa número).
  - **C4 platô:** se o dossiê não tem evidência positiva nova no período
    (contagens zeradas ou só negativas), `periodoSemAvancoVisivel = true` +
    `notaHonestidade` que justifica manutenção; **não força progresso**.
  - **resumoClinico / justificativaContinuidade:** texto templado ancorado nos
    totais do dossiê (nº de sessões, presença); sem fabricar.
  - **C2/número:** todo número vem do `dossie`; o stub **nunca inventa**.
- **Produção → ClaudeProvider** só com `CONVENIO_REPORT_LLM_ENABLED === "true"` E
  `ANTHROPIC_API_KEY`. Mesmo guardrail P0 LGPD/DPA da extração e da família:
  nenhum dado de paciente real vai à Anthropic antes do DPA + zero-data-retention.
  Sem a flag/chave → cai no stub (nunca quebra o fluxo). Nesta fatia o
  ClaudeProvider pode ficar como esqueleto testável (habilitação real = infra
  pós-DPA). O assembler do prompt injeta o dossiê como contexto factual e instrui
  C1–C8; o parsing valida o shape do draft **e roda `validarDraftContraDossie`**.

**`validarDraftContraDossie(draft, dossie)` (numeric-guard, D11/Brecha 4).** Função
pura, testável, usada pelo provider real antes de retornar (e barata o bastante p/
rodar sempre): extrai tokens numéricos (`\d+`, ignorando datas/percentuais já
presentes no dossiê) dos campos livres do draft (`resumoClinico`,
`evolucaoPorDominio[].narrativa`, `justificativaContinuidade`, `notaHonestidade`)
e **rejeita** o draft se algum número não constar do `dossie`. Garante a fronteira
de C2 no caminho de IA real, não só no stub. O stub, por construção, sempre passa.

## 7. Migração (CHECK simétrico)

Nova migração `db/migrations/00XX_report_narrativo_com_ia.sql`:

```sql
ALTER TABLE report ADD CONSTRAINT report_narrativo_com_ia
  CHECK (tipo <> 'convenio_narrativo' OR gerado_por_ia = true) NOT VALID;
ALTER TABLE report VALIDATE CONSTRAINT report_narrativo_com_ia;
```

`NOT VALID` + `VALIDATE` evita o `ACCESS EXCLUSIVE` longo no deploy (D9/Brecha 9;
tabela hoje quase vazia, mas é o hábito prod-safe — memória `deploy-schema-gate`).
Simétrico ao `report_bruto_sem_ia` existente. Journal `when` = preceding+1000
(memória `drizzle-hand-migration-when-ordering`). App-layer também garante
`gerado_por_ia=true` no INSERT (defesa em profundidade). Aplicar local via
`db:migrate`; se o tracking desincronizar, aplicar SQL à mão via psql (memória
`dev-db-migrate-desync`).

## 8. Máquina de estado (curadoria) — `convenio-narrativo-logic.ts`

Server-only, ctx-accepting (NÃO `"use server"`; anti-forja issue #55). Todas as 3
ações exigem coordenador (D6).

1. **`gerarRascunhoConvenioNarrativo(ctx, input)`**:
   - `requireRole(ctx, "coordenador")`.
   - `withTenant(ctx, tx)`: `buildConvenioNarrativoInput` (reusa
     `buildConvenioBrutoPayload` + cabeçalho) → `ConvenioNarrativoInput`;
     `resolveConvenioNarrativoProvider(clinic).gerar(input)` → draft;
     `INSERT report(tipo='convenio_narrativo', gerado_por_ia=true, status='rascunho',
payload={versao:1, dossie, iaOriginal:draft, curado:null, cabecalho, ...})`
     → `reportId`.
   - `audit_log(acao='relatorio_rascunho_gerado')`. Retorna `{reportId, versao, draft}`.
2. **`curarConvenioNarrativo(ctx, { reportId, cabecalhoEditado, draftEditado, versaoEsperada })`**:
   - `requireRole(ctx, "coordenador")`; `withTenant`: UPDATE com **dois `jsonb_set`
     encadeados** (`{curado}` ← draftEditado, `{cabecalho}` ← cabecalhoEditado; D8),
     `payload_versao = payload_versao + 1, status = 'revisado', revisado_por = ctx.userId
WHERE id = :reportId AND tipo='convenio_narrativo'
AND status IN ('rascunho','revisado') AND payload_versao = :versaoEsperada`
     (trava otimista).
   - 0 linhas → rascunho obsoleto/exportado → erro limpo.
   - `audit_log(acao='relatorio_revisado', detalhe.tipo='convenio_narrativo')`.
3. **`exportarConvenioNarrativo(ctx, { reportId }, renderer)`**:
   - `requireRole(ctx, "coordenador")`; `withTenant` (tx única):
     **recheck `status = 'revisado'`** (D7 — nega export de rascunho não curado);
     `exportReport(tx, { reportId, atorId: ctx.userId, buildHtml: buildConvenioNarrativoHtml, renderer })`.
   - `exportReport` congela bytes, flip `status='exportado'`, `audit_log` (já faz).
   - **Concorrência (Brecha 1 — resolvida no trilho existente):** o pre-gate de
     `status='revisado'` aqui é só UX; a trava real é dentro de `exportReport`
     (`export.ts:61-74`): `SELECT … FOR UPDATE` + recheck de `payload_versao` **e**
     de `status IN (rascunho,revisado)`. Dois exports concorrentes → o 2º adquire
     o lock após o commit do 1º, lê `status='exportado'` e é rejeitado limpo.
     Export↔curar concorrente → `payload_versao` diverge e aborta. **Herdado
     intacto, sem mudança.**

Actions `"use server"` (`actions.ts`): `gerar…Action`/`curar…Action`/`exportar…Action`
derivam ctx via `getTenantContext()`, delegam, `revalidatePath("/relatorios")`.

## 9. `build-html` (delegável ao Gemini)

Função **pura** `buildConvenioNarrativoHtml(payload: PayloadConvenioNarrativo): string`.
Combina o factual do dossiê (mirror de `convenio-bruto/build-html.ts`) com a
narrativa curada:

- **Cabeçalho:** paciente, período, operadora, "CID (conforme prescrição médica
  assistente)", finalidade, e **"Dados extraídos em [geradoEm]"** (D10 — deixa o
  snapshot explícito).
- **Bloco factual (dossiê):** tabelas de sessões/presença/evidências aprovadas —
  **chama o helper compartilhado `renderDossieTablesHtml(payload.dossie)`**
  (D12/Brecha 5), o mesmo que o `convenio-bruto/build-html` passa a usar. **Fonte
  dos números.**
- **Bloco narrativo:** renderiza `payload.curado ?? payload.iaOriginal` —
  resumo clínico, evolução por domínio, justificativa de continuidade, objetivos;
  se `periodoSemAvancoVisivel`, renderiza `notaHonestidade` (C4).
- **Todo texto livre passa por `escapeHtml`** (`src/lib/report/sanitize.ts`).
- Fontes locais embutidas, **sem `<script>`, sem asset remoto** (o sandbox SSRF já
  bloqueia rede; o HTML não deve nem tentar).
- Rodapé: "Documento de suporte à solicitação de cobertura, revisado por
  [coordenador]. Dados factuais extraídos do prontuário; não substitui a
  prescrição médica assistente."

## 10. Autorização e RLS

- **Gerar + curar + exportar:** `requireRole(ctx, "coordenador")` (D6).
  `admin_recepcao` e `terapeuta` **fora** de tudo.
- RLS `report_scope` (`0039_fase5_report_audit_rls.sql`) já cobre
  INSERT/SELECT/UPDATE de `report` por `app_patient_in_clinic` + papel, e é
  **tipo-agnóstica** → `convenio_narrativo` herda automático. Check
  `report_bruto_sem_ia` não afeta. **Sem migração de RLS** (só o CHECK de §7).
- `audit_log` exige `ator_id = app.user_id` — garantido (actions passam `ctx.userId`).

## 11. UI

Nova tile em `/relatorios` + fluxo clonado de `familia-report.tsx`
(`convenio-narrativo-report.tsx`, `"use client"`):

1. Seleção paciente + período + **form de cabeçalho** (operadora/CID/finalidade).
2. Gerar rascunho → preview (dossiê factual + narrativa IA).
3. Editor de curadoria (coordenador edita os campos do draft **e do cabeçalho** —
   operadora/CID/finalidade corrigíveis, D8/Brecha 2; `useTransition`, rastreia
   `versao` p/ trava otimista; campos desabilitados se `!podeCurar`). Exibe
   "Dados extraídos em [geradoEm]" + botão **regenerar** (novo rascunho com dossiê
   atual) se o coordenador achar o snapshot velho (D10).
4. Exportar (habilitado só em `revisado`) → download do PDF congelado
   (`[reportId]/download/route.ts` já existe).

`podeCurar = ctx.role === "coordenador"` (mas D6: só coordenador vê a tile inteira;
terapeuta não gera).

## 12. Testes (Definição de pronto)

- **Unit `build-html`** (Gemini): escapa `<script>`/`"` em todo campo (cabeçalho,
  narrativa, dossiê); renderiza `curado` quando presente e `iaOriginal` quando
  `curado=null`; bloco factual do dossiê presente e separado da narrativa;
  snapshot estrutural.
- **Unit `stub-provider`** (Claude): C2 (todo número = dossiê, nada inventado);
  C4 (dossiê sem avanço → `periodoSemAvancoVisivel` + `notaHonestidade` não-vazia,
  sem narrativa de progresso); C1 (tom técnico — sem termos infantilizados do
  Agente família).
- **Unit `validarDraftContraDossie`** (Claude, D11): draft com número ausente do
  dossiê → rejeitado; draft cujos números todos constam do dossiê → passa; saída
  do stub sempre passa.
- **Unit `renderDossieTablesHtml`** (Gemini, D12): refatoração não muda o HTML do
  `convenio-bruto` (snapshot idêntico ao anterior); escapa texto livre.
- **Unit `build-input`** (contract): reusa `buildConvenioBrutoPayload`; cabeçalho
  entra intacto; não vaza fora do período.
- **Int** geração→curadoria→export: gera rascunho (`status=rascunho`,
  `gerado_por_ia=true`, `curado=null`, dossiê embutido, audit); cura
  (`status=revisado`, `payload_versao++`, `revisado_por`, **`cabecalho` editado
  persistido**); export só após revisado (rascunho não curado → erro); PDF real
  gravado, `status=exportado`, audit; re-download lê bytes sem re-render; trava
  otimista (`versaoEsperada` obsoleto → erro). **Export duplo → 2º rejeitado limpo
  (Brecha 1)**; export concorrente com curar → aborta por versão.
- **CHECK**: INSERT de `convenio_narrativo` com `gerado_por_ia=false` → violação
  (`report_narrativo_com_ia`).
- **RLS** (`rls.int.test.ts`): coordenador de outra clínica não vê/edita;
  **terapeuta on-team bloqueado nas 3 ações** (difere da família); `admin_recepcao`
  bloqueado; isolamento multi-tenant.
- **a11y**: preview + form de cabeçalho + form de curadoria (0 violações axe).

### DoD da fatia (AGENTS.md §6)

- [ ] `convenio_narrativo` gera rascunho IA (projeção sobre dossiê factual), é
      curado por humano e exporta PDF real, respeitando `gerado_por_ia=true` e o
      gate `revisado` antes do export (C7).
- [ ] Stub honra C1/C2/C4 provado por teste; `validarDraftContraDossie` (numeric-guard) cobre a fronteira de C2 no caminho de IA real (D11).
- [ ] Curadoria edita narrativa **e** cabeçalho; `renderDossieTablesHtml` compartilhado sem regressão no `convenio-bruto`.
- [ ] Autz **coordenador-only** nas 3 ações + RLS coberta por `rls.int.test`.
- [ ] Trava otimista de curadoria (`payload_versao`) coberta.
- [ ] Migração CHECK `report_narrativo_com_ia` aplicada e coberta por teste.
- [ ] Contrato `docs/agente/agente-3-convenio-narrativo.md` (C1–C8) escrito.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls` verdes.
- [ ] BACKLOG.md atualizado (fatia concluída + dívidas) + Issue #8 fechada.

## 13. Delegação Gemini (padrão spec-contrato)

Claude fica com: `provider`/`stub-provider` (julgamento clínico C1–C8),
`build-input` (RLS/agregação), `convenio-narrativo-logic`/`actions` (segurança
`"use server"` + máquina de estado + trava), a migração CHECK. **Gemini** recebe
spec fechada de `build-html.ts` + `types.ts` (shape `PayloadConvenioNarrativo`/
`ConvenioNarrativoDraft`) + testes unit de `build-html` — determinístico,
verificável, sem tocar RLS/schema/julgamento clínico. Claude valida o diff (escape
em todos os campos, dossiê renderizado e separado, sem asset remoto, snapshot).

## 14. Dívidas / riscos

| Risco                                                                                        | Mitigação                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stub não é narrativa "real"                                                                  | Aceito: é trilho; qualidade vem do ClaudeProvider pós-DPA. Stub é honesto (C2/C4)                                                                                                                         |
| Coordenador edita p/ texto que viola C8                                                      | Fora do escopo automatizar; curadoria humana é responsável. Rodapé deixa a autoria clara                                                                                                                  |
| Templating por-operadora ausente                                                             | Dívida registrada; operadora é campo livre; encaixa quando houver operadora piloto real                                                                                                                   |
| CID/prescrição sem modelo                                                                    | Cabeçalho digitado + editável na curadoria; rotulado "conforme prescrição médica assistente" (Brecha 8). Entidade de prescrição externa + anexo da prescrição = fatia futura                              |
| Rascunhos duplicados p/ mesmo paciente+período (Brecha 6)                                    | Aceito nesta fatia (mesmo comportamento da família); curadoria humana escolhe o certo. Dívida: índice de unicidade `(patient_id, tipo, periodo) WHERE status<>'exportado'` se virar problema de auditoria |
| Dossiê snapshot fica obsoleto se evidência do período for aprovada após a geração (Brecha 3) | Intencional (doc com data de extração); label `geradoEm` + regenerar. Detecção ativa de staleness = dívida futura                                                                                         |
| Uso secundário de dado de menor (blocker legal registrado)                                   | Real LLM OFF atrás de flag; stub não envia PII; export é humano-curado. Mesma postura da Fatia 4. 1-pág `docs/legal/` continua pendência DevOps/negócio, não bloqueia o código                            |
