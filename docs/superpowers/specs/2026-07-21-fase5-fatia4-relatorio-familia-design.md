# Fase 5 · Fatia 4 — Relatório de Família (IA narrativo + curadoria humana)

> Design validado por brainstorming. Fonte de verdade do escopo desta fatia.
> Escopo confirmado com o Rômulo (21/07/2026): **`familia` primeiro**, construindo
> o trilho reusável de relatório IA. `convenio_narrativo` e
> `avaliativo_interdisciplinar` ficam para fatias seguintes, encaixando no trilho.

## 1. Contexto e fronteira

A Fatia 3 entregou o `convenio_bruto` (factual, sem IA) e o trilho real de PDF
(`PlaywrightPdfRenderer`, `exportReport`, rota `/relatorios`). Esta fatia entrega
o **primeiro relatório gerado por IA** — o Relatório de Família (Agente 2,
`docs/agente/agente-2-relatorio-familia.md`, regras F1–F9) — e com ele a
**máquina de curadoria** (rascunho durável → revisado → exportado) que os demais
relatórios IA vão reusar.

### Dentro do escopo
- `report.tipo = familia`, `gerado_por_ia = true`.
- Provider do Agente 2 atrás de interface, com **stub determinístico** (demo/testes
  sem LLM) e `ClaudeProvider` real atrás de flag + gate LGPD (§6).
- Máquina de estado de curadoria: gerar rascunho → coordenador edita/revisa →
  exporta PDF. Reusa `exportReport` (F0 intocado).
- `build-html` do relatório de família (puro, `escapeHtml`, tom leigo F1).
- Extensão da rota/actions `src/app/(app)/relatorios/`.

### Fora do escopo
- `convenio_narrativo`, `avaliativo_interdisciplinar` (contratos de agente ainda
  não escritos; fatias seguintes).
- `MilestoneAssessment` formal (deferido desde a Fase 4). O relatório consome
  assessments **se existirem**; hoje o array vem vazio e o stub não fabrica.
- Worker de render / offload de bytes p/ MinIO (dívidas já registradas na Fatia 3).

## 2. Decisões travadas

| # | Decisão | Motivo |
|---|---------|--------|
| D1 | Só `familia` nesta PR; 1 branch = 1 PR | Padrão Fatias 1–3; único agente com contrato F1–F9 + golden cases prontos |
| D2 | **Sem migração** | `report` já tem `familia`, `gerado_por_ia`, status `rascunho/revisado/exportado`, `revisado_por`, `payload_versao`. Schema F0 já previu curadoria IA |
| D3 | IA-original **e** curado no mesmo `payload` jsonb | Evita DDL; preserva rascunho da IA imutável p/ auditoria (F2/governança). `build-html` renderiza `curado ?? iaOriginal` |
| D4 | Rascunho **durável** (difere do bruto transiente) | F9: relatório de família exige revisão humana entre geração e export |
| D5 | **Gerar rascunho:** coordenador **ou** terapeuta (on-team via RLS). **Curar + exportar:** só coordenador | F9: o rascunho pode ser redigido pela equipe; a **revisão/aprovação** que libera à família é do coordenador. `admin_recepcao` fora de tudo |
| D6 | Export só aceita `revisado` (gate na action) | `exportReport` aceita `rascunho`/`revisado`; a action **exige `revisado`** p/ impor a curadoria (F9). Bruto continua usando tx-única |
| D7 | Provider stub determinístico honra F1/F3/F6 | Demo e testes rodam sem LLM e sem fabricar dado; IA nunca gera número (F2) |

## 3. Arquitetura por camada

Espelha `src/lib/report/convenio-bruto/` e o padrão de provider de
`src/lib/extraction/provider.ts`. Padrão anti-`ctx`-forjável (Fatia 2 / issue #55):
nenhum helper que aceita `ctx` é exportado de dentro de um módulo `"use server"`.

```
src/lib/report/familia/
  types.ts            # FamilyReportInput, FamilyReportDraft (F1–F9), PayloadFamilia
  build-input.ts      # (ctx, tx, patientId, periodo) -> FamilyReportInput  [lê DB sob withTenant]
  provider.ts         # FamilyReportProvider (interface) + resolveFamilyReportProvider(clinic)
  stub-provider.ts    # StubFamilyReportProvider — draft determinístico
  claude-provider.ts  # ClaudeProvider real (gated) — pode ficar como esqueleto nesta fatia
  build-html.ts       # (PayloadFamilia) -> string HTML  [puro, escapeHtml em todo texto livre]
src/app/(app)/relatorios/
  actions.ts (estende) # gerarRascunhoFamilia / curarFamilia / exportarFamilia ("use server")
  queries.ts (estende) # preview do recorte + leitura do rascunho p/ a tela de curadoria
  page.tsx / componentes de curadoria (Server Components + form de edição)
```

## 4. Contratos de tipo

```ts
// Entrada factual que o provider recebe (nada de PII além do nome).
type FamilyReportInput = {
  crianca: { nome: string };
  periodo: { inicio: string; fim: string };          // ISO date
  evidenciasAprovadas: Array<{
    data: string;                                     // aprovadoEm ISO
    metaOuDominio: string;                            // nome curto, SEM jargão de protocolo
    nivelAjuda: string | null;                        // p/ detectar salto de independência (F3)
    polaridade: "positiva" | "negativa" | null;
  }>;
  metasAtivas: string[];                              // nomes curtos (F4)
  reforcadoresAtuais: string[];                       // p/ derivar apoio em casa (F5)
  avaliacoesFormais: string[];                        // MilestoneAssessment concluídas (hoje: [])
};

// Saída do agente = schema F1–F9 de agente-2-relatorio-familia.md.
type FamilyReportDraft = {
  conquistaDestaque: string;                          // F3
  trabalhandoAgora: string[];                         // F4, max 4
  comoApoiarEmCasa: string[];                         // F5, max 3
  periodoSemAvancoVisivel: boolean;                   // F6
  notaHonestidade: string | null;                     // F6, só quando true
  anexoDados: {
    evidenciasPorMeta: Array<{ meta: string; contagemPeriodo: number }>;
    avaliacoesFormaisPeriodo: string[];
  };
  status: "rascunho_para_revisao";                    // F9
};

// Forma persistida em report.payload (jsonb). SEM DDL.
type PayloadFamilia = {
  versao: 1;
  crianca: { nome: string };
  periodo: { inicio: string; fim: string };
  geradoEm: string;                                   // ISO
  provider: "stub" | "claude";
  iaOriginal: FamilyReportDraft;                       // imutável (auditoria)
  curado: FamilyReportDraft | null;                    // null até o coordenador revisar
};
```

`build-html` sempre renderiza `payload.curado ?? payload.iaOriginal`.

## 5. Provider (Agente 2)

Interface + roteamento espelhando `resolveProvider` da extração:

```ts
interface FamilyReportProvider {
  gerar(input: FamilyReportInput): Promise<FamilyReportDraft>;
}
function resolveFamilyReportProvider(clinic: { isDemo: boolean }): FamilyReportProvider;
```

- **Demo → StubFamilyReportProvider.** Determinístico, sem LLM. Deriva o draft
  do `FamilyReportInput`:
  - **F3 conquista-destaque:** escolhe a evidência de maior salto de independência
    (ex.: dica física → independente), desempate comunicação > motor; texto leigo.
  - **F4:** metas ativas → `trabalhandoAgora` (max 4), sem jargão.
  - **F5:** deriva sugestões dos `reforcadoresAtuais`/contexto — nunca banco genérico.
  - **F6 platô:** se não há evidência positiva nova (`evidenciasAprovadas` vazio ou
    só negativa/estagnação), `periodoSemAvancoVisivel = true` + `notaHonestidade`
    acolhedora; **não força narrativa de progresso**.
  - **F8:** `anexoDados` = contagem bruta por meta; sem interpretação.
  - **F2/número:** contagens vêm da entrada factual; o stub **nunca inventa**.
- **Produção → ClaudeProvider** só com `FAMILY_REPORT_LLM_ENABLED === "true"` E
  `ANTHROPIC_API_KEY`. Mesmo guardrail P0 LGPD/DPA da extração: nenhum dado de
  paciente real vai à Anthropic antes do DPA + zero-data-retention. Sem a
  flag/chave → cai no stub (nunca quebra o fluxo). Nesta fatia o ClaudeProvider
  pode ficar como esqueleto testável (a habilitação real é infra pós-DPA).

## 6. Máquina de estado (curadoria)

1. **`gerarRascunhoFamilia({ patientId, periodo })`** (`"use server"`):
   - `ctx = getTenantContext()`; `requireRole(ctx, "coordenador", "terapeuta")`
     (terapeuta escopado por RLS `app_is_on_team`).
   - `withTenant(ctx, tx)`: `build-input` agrega o recorte → `FamilyReportInput`;
     `resolveFamilyReportProvider(...).gerar(input)` → draft;
     `INSERT report(tipo='familia', gerado_por_ia=true, status='rascunho',
     payload={versao:1, iaOriginal:draft, curado:null, ...})` → `reportId`.
   - `audit_log(acao='relatorio_rascunho_gerado')`.
2. **`curarFamilia({ reportId, draftEditado, versaoEsperada })`** (`"use server"`):
   - `requireRole(coordenador)`; `withTenant`:
     `UPDATE report SET payload = jsonb_set(payload,'{curado}', ...),
     payload_versao = payload_versao + 1, status = 'revisado', revisado_por = ctx.userId
     WHERE id = :reportId AND payload_versao = :versaoEsperada` (trava otimista).
   - Falha se `payload_versao` divergir (edição concorrente) → erro limpo.
   - `audit_log(acao='relatorio_revisado')`.
3. **`exportarFamilia({ reportId })`** (`"use server"`):
   - `requireRole(coordenador)`; `withTenant` (tx única):
     **recheck `status = 'revisado'`** (D6 — nega export de rascunho não curado);
     `exportReport(tx, { reportId, atorId: ctx.userId, buildHtml: buildFamiliaHtml, renderer })`.
   - `exportReport` congela bytes, flip `status='exportado'`, `audit_log` (já faz).

## 7. `build-html` (delegável ao Gemini)

Função **pura** `buildFamiliaHtml(payload: PayloadFamilia): string`. Mirror de
`convenio-bruto/build-html.ts`:
- Renderiza `payload.curado ?? payload.iaOriginal`.
- **Todo texto livre passa por `escapeHtml`** (`src/lib/report/sanitize.ts`).
- Fontes locais embutidas, **sem `<script>`, sem asset remoto** (o sandbox SSRF da
  Fatia 3 já bloqueia rede; o HTML não deve nem tentar).
- Layout leigo, tom caloroso (F1/F7): cabeçalho (nome da criança, período), bloco
  "Conquista do período", "O que estamos trabalhando agora", "Como apoiar em casa";
  se `periodoSemAvancoVisivel`, renderiza `notaHonestidade` com acolhimento (F6);
  bloco `anexo_dados` **separado e opcional** (F8 — números nunca misturados ao
  resumo humano). Rodapé: "Rascunho revisado por [coordenador] — documento de
  comunicação, não substitui orientação clínica presencial."

## 8. Autorização e RLS

- **Gerar:** `requireRole(ctx, "coordenador", "terapeuta")` (terapeuta on-team via
  RLS). **Curar + exportar:** `requireRole(ctx, "coordenador")` (D5).
  `admin_recepcao` **fora** de tudo.
- RLS `report_scope` (`0039_fase5_report_audit_rls.sql`) já cobre INSERT/SELECT/UPDATE
  de `report` por `app_patient_in_clinic` + papel. `familia` já é valor do enum.
  Check `report_bruto_sem_ia` não afeta (só restringe `convenio_bruto`).
  **Sem migração de schema nem de RLS.**
- `audit_log` exige `ator_id = app.user_id` — garantido (actions passam `ctx.userId`).

## 9. Testes (Definição de pronto)

- **Unit `build-html`** (Gemini): escapa `<script>`/`"` em todo campo; renderiza
  `curado` quando presente e `iaOriginal` quando `curado=null`; bloco `anexo_dados`
  aparece só quando há dados e fica separado do resumo; snapshot estrutural.
- **Unit `stub-provider`** (Claude): F6 (entrada sem avanço → `periodoSemAvancoVisivel`
  + `notaHonestidade` não-vazia, sem narrativa de progresso); F3 (escolhe o maior
  salto de independência); F1 (nenhum termo de jargão — assert contra lista
  proibida: nome de protocolo/operante/"nível de ajuda"/"evidência"); F2/F8
  (contagens = entrada, nada inventado).
- **Unit `build-input`** (contract): agrega evidências aprovadas/metas/reforçadores
  do período; não vaza fora do período.
- **Int** geração→curadoria→export: gera rascunho (`status=rascunho`, `gerado_por_ia=true`,
  `curado=null`, audit); cura (`status=revisado`, `payload_versao++`, `revisado_por`);
  export só após revisado (rascunho não curado → erro); PDF real gravado, `status=exportado`,
  audit; re-download lê bytes sem re-render; trava otimista (`versaoEsperada` obsoleto → erro).
- **RLS** (`rls.int.test`): coordenador de outra clínica não vê/edita; terapeuta
  on-team **gera** mas **não cura/exporta** (curar/exportar → erro de papel);
  terapeuta fora da equipe não gera; `admin_recepcao` bloqueado nas 3 actions;
  isolamento multi-tenant.
- **a11y**: preview + form de curadoria (0 violações axe).

### DoD da fatia (AGENTS.md §6)
- [ ] `familia` gera rascunho IA, é curado por humano e exporta PDF real, respeitando
      `gerado_por_ia=true` e o gate `revisado` antes do export (F9).
- [ ] Stub honra F1/F2/F3/F6 provado por teste; IA nunca fabrica número.
- [ ] Autz coordenador-only + RLS coberta por `rls.int.test`.
- [ ] Trava otimista de curadoria (`payload_versao`) coberta.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls` verdes.
- [ ] BACKLOG.md atualizado (fatia concluída + dívidas).

## 10. Delegação Gemini (padrão spec-contrato)

Claude fica com: `provider`/`stub-provider` (julgamento clínico F1–F9),
`build-input` (RLS/agregação), `actions` (segurança `"use server"` + máquina de
estado + trava). **Gemini** recebe spec fechada de `build-html.ts` + `types.ts`
(shape `PayloadFamilia`/`FamilyReportDraft`) + testes unit de `build-html` —
determinístico, verificável, sem tocar RLS/schema/julgamento clínico. Claude valida
o diff (escape em todos os campos, sem asset remoto, snapshot).

## 11. Dívidas / riscos

| Risco | Mitigação |
|-------|-----------|
| Stub não é narrativa "real" | Aceito: é trilho; qualidade vem do ClaudeProvider pós-DPA. Stub é honesto (F2/F6) |
| Coordenador edita p/ texto que viola F1 | Fora do escopo automatizar; curadoria humana é responsável. Rodapé deixa a autoria clara |
| `MilestoneAssessment` ausente | Array vazio; stub não fabrica; encaixa quando a Fase 5 formalizar a série |
| Export de rascunho não curado | Gate `revisado` na action (D6) além do check de `exportReport` |
