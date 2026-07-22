# Relatório de Convênio Narrativo (Fase 5 · Fatia 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `report.tipo=convenio_narrativo` — relatório de convênio narrativo gerado por IA (stub determinístico agora, Claude pós-DPA) como projeção sobre o dossiê factual, com curadoria humana coordenador-only, fechando a Issue #8.

**Architecture:** Clona o trilho de relatório-IA da Fatia 4 (`familia`). `build-input` reusa `buildConvenioBrutoPayload` (dossiê factual = fonte dos números). Provider atrás de interface + stub. Máquina de curadoria (rascunho durável → revisado → exportado) reusa `exportReport`/`playwrightRenderer`. Sem migração de schema/RLS além de um CHECK simétrico. HTML reusa um helper de tabelas do dossiê extraído do `convenio-bruto`.

**Tech Stack:** Next.js 16 (App Router, Server Components + `"use server"`), Drizzle + Postgres (RLS via `withTenant`), zod, Vitest (unit + int/RLS), axe (a11y), Playwright (render PDF real).

**Spec:** `docs/superpowers/specs/2026-07-22-fase5-fatia5-convenio-narrativo-design.md` (fonte de verdade).

## Global Constraints

- **pt-BR** em toda copy de produto e nomes de domínio. Commits em inglês (Conventional Commits, memória `commit-e-branch-conventions`).
- **Anti-`ctx`-forjável (issue #55):** nenhum helper que aceita `ctx` é exportado de dentro de um módulo `"use server"`. Lógica ctx-accepting vive em `*-logic.ts` com `import "server-only"`; só `actions.ts` é `"use server"` e deriva o ctx via `getTenantContext()`.
- **IA nunca gera número (C2):** todo dado quantitativo vem do `dossie` factual. Stub garante por construção; provider real passa por `validarDraftContraDossie`.
- **Coordenador-only** nas 3 ações (gerar/curar/exportar). `terapeuta` e `admin_recepcao` fora.
- **Sem asset remoto / `<script>` no HTML** de relatório; `escapeHtml` em todo texto livre (sandbox SSRF já bloqueia rede).
- **TDD:** teste falhando antes da implementação, commits frequentes.
- Rodar via `corepack pnpm` (memória `dev-env-corepack-docker-db`); Postgres local docker `infra/docker-compose.yml` :5433. Se `db:migrate` desincronizar, aplicar SQL à mão via psql (memória `dev-db-migrate-desync`).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `docs/agente/agente-3-convenio-narrativo.md` | Contrato C1–C8 do agente narrador (novo) |
| `db/migrations/0043_report_narrativo_com_ia.sql` | CHECK simétrico `report_narrativo_com_ia` (novo) |
| `src/lib/report/convenio-bruto/render-dossie.ts` | `renderDossieTablesHtml` — extraído de build-html; compartilhado bruto↔narrativo (novo) |
| `src/lib/report/convenio-bruto/build-html.ts` | Refatorado p/ chamar `renderDossieTablesHtml` (modificado) |
| `src/lib/report/convenio-narrativo/types.ts` | `ConvenioNarrativoInput/Draft`, `PayloadConvenioNarrativo` (novo) |
| `src/lib/report/convenio-narrativo/build-input.ts` | Monta input reusando `buildConvenioBrutoPayload` (novo) |
| `src/lib/report/convenio-narrativo/provider.ts` | Interface + `resolve…` + `validarDraftContraDossie` (novo) |
| `src/lib/report/convenio-narrativo/stub-provider.ts` | Stub determinístico (novo) |
| `src/lib/report/convenio-narrativo/claude-provider.ts` | Esqueleto gated (novo) |
| `src/lib/report/convenio-narrativo/build-html.ts` | HTML: dossiê (via helper) + narrativa (novo) |
| `src/app/(app)/relatorios/convenio-narrativo-logic.ts` | Máquina de estado gerar/curar/exportar (novo) |
| `src/app/(app)/relatorios/actions.ts` | `"use server"` wrappers (modificado) |
| `src/app/(app)/relatorios/queries.ts` | Preview + leitura do rascunho (modificado) |
| `src/app/(app)/relatorios/convenio-narrativo-report.tsx` | UI cliente: cabeçalho + curadoria (novo) |
| `src/app/(app)/relatorios/page.tsx` | Nova tile (modificado) |

Tipo existente reusado: `PayloadConvenioBruto` (`src/lib/report/convenio-bruto/types.ts`):
```ts
type PayloadConvenioBruto = {
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  geradoEm: string;
  sessoes: Array<{ numeroSequencial: number|null; data: string; disciplina: string; modalidade: string; estado: string; justificada: boolean|null; terapeuta: string }>;
  evidencias: Array<{ data: string; metaOuDominio: string; classificacao: string; autor: string }>;
  presenca: { sessoesRealizadas: number; faltasJustificadas: number; faltasNaoJustificadas: number };
};
```

---

### Task 1: Contrato do agente (C1–C8)

**Files:**
- Create: `docs/agente/agente-3-convenio-narrativo.md`

Sem teste (documento). Conteúdo = regras C1–C8 do §4 do spec, em pt-BR, no estilo de `docs/agente/agente-2-relatorio-familia.md` (ler esse arquivo como molde de formato).

- [ ] **Step 1:** Ler `docs/agente/agente-2-relatorio-familia.md` p/ o formato (cabeçalho, numeração de regras, tom).
- [ ] **Step 2:** Escrever `agente-3-convenio-narrativo.md` com: propósito (projeção narrativa sobre dossiê factual p/ auditor de operadora), as 8 regras C1–C8 (copiar do §4 do spec, expandindo cada uma com 1–2 frases), e uma seção "Fronteira de garantia" explicando que números vêm do dossiê e o numeric-guard valida o caminho de IA real.
- [ ] **Step 3: Commit**
```bash
git add docs/agente/agente-3-convenio-narrativo.md
git commit -m "docs(agente): contrato C1-C8 do agente narrador de convênio"
```

---

### Task 2: Migração CHECK `report_narrativo_com_ia`

**Files:**
- Create: `db/migrations/0043_report_narrativo_com_ia.sql`
- Modify: `db/migrations/meta/_journal.json` (novo entry idx 43)
- Test: `db/tests/fase5-report-schema.int.test.ts` (novo caso)

**Interfaces:**
- Produces: constraint `report_narrativo_com_ia` na tabela `report`.

- [ ] **Step 1: Escrever o teste falhando** em `db/tests/fase5-report-schema.int.test.ts` (adicionar ao describe existente; seguir o padrão dos casos de constraint já lá):
```ts
it("rejeita convenio_narrativo com gerado_por_ia=false (report_narrativo_com_ia)", async () => {
  await expect(
    db.execute(sql`
      INSERT INTO report (clinic_id, patient_id, tipo, periodo_inicio, periodo_fim, status, payload, gerado_por_ia)
      VALUES (${CLINIC_ID}::uuid, ${PATIENT_ID}::uuid, 'convenio_narrativo', '2026-01-01', '2026-03-31', 'rascunho', '{}'::jsonb, false)
    `),
  ).rejects.toThrow(/report_narrativo_com_ia/);
});
```
(Usar as constantes de clinic/patient já definidas no arquivo; se não houver, espelhar o setup do caso `report_bruto_sem_ia`.)
- [ ] **Step 2: Rodar e ver falhar**
Run: `corepack pnpm test db/tests/fase5-report-schema.int.test.ts`
Expected: FAIL (INSERT passa — constraint ainda não existe).
- [ ] **Step 3: Escrever a migração** `db/migrations/0043_report_narrativo_com_ia.sql`:
```sql
ALTER TABLE report ADD CONSTRAINT report_narrativo_com_ia
  CHECK (tipo <> 'convenio_narrativo' OR gerado_por_ia = true) NOT VALID;
ALTER TABLE report VALIDATE CONSTRAINT report_narrativo_com_ia;
```
- [ ] **Step 4: Registrar no journal** — adicionar a `db/migrations/meta/_journal.json` (dentro de `entries`, após idx 42):
```json
{ "idx": 43, "version": "7", "when": 1784521554778, "tag": "0043_report_narrativo_com_ia", "breakpoints": true }
```
(`when` = 1784521553778 + 1000; memória `drizzle-hand-migration-when-ordering`.)
- [ ] **Step 5: Aplicar** `corepack pnpm db:migrate` (se desincronizar, aplicar o SQL à mão via psql :5433 — memória `dev-db-migrate-desync`).
- [ ] **Step 6: Rodar e ver passar**
Run: `corepack pnpm test db/tests/fase5-report-schema.int.test.ts`
Expected: PASS.
- [ ] **Step 7: Commit**
```bash
git add db/migrations/0043_report_narrativo_com_ia.sql db/migrations/meta/_journal.json db/tests/fase5-report-schema.int.test.ts
git commit -m "feat(fase5): CHECK report_narrativo_com_ia (gerado_por_ia obrigatório)"
```

---

### Task 3: Extrair `renderDossieTablesHtml` (refatoração anti-duplicação) — [Gemini-delegável]

**Files:**
- Create: `src/lib/report/convenio-bruto/render-dossie.ts`
- Modify: `src/lib/report/convenio-bruto/build-html.ts`
- Test: `src/lib/report/convenio-bruto/render-dossie.test.ts` (novo) + a suíte existente de `build-html` (não pode regredir)

**Interfaces:**
- Produces: `renderDossieTablesHtml(dossie: PayloadConvenioBruto): string` — HTML puro das tabelas factuais (sessões, presença, evidências aprovadas), `escapeHtml` em todo texto livre, sem `<script>`/asset remoto.
- Consumes: `escapeHtml` de `src/lib/report/sanitize.ts`.

- [ ] **Step 1:** Ler `src/lib/report/convenio-bruto/build-html.ts` e identificar a porção que renderiza as tabelas do dossiê (sessões/presença/evidências).
- [ ] **Step 2: Escrever o teste falhando** `render-dossie.test.ts`: dado um `PayloadConvenioBruto` de exemplo, `renderDossieTablesHtml` (a) contém as linhas de sessões/presença/evidências; (b) escapa `<script>` e `"` num campo de texto livre (ex.: `terapeuta`/`metaOuDominio`); (c) não contém `<script>` nem `http://`/`https://`.
- [ ] **Step 3: Rodar e ver falhar** (`renderDossieTablesHtml` não existe).
Run: `corepack pnpm test src/lib/report/convenio-bruto/render-dossie.test.ts`
Expected: FAIL.
- [ ] **Step 4: Extrair** — mover a lógica de tabelas p/ `render-dossie.ts` exportando `renderDossieTablesHtml(dossie)`; reescrever `build-html.ts` p/ montar o documento chamando `renderDossieTablesHtml(payload)` (mesmo HTML final que antes).
- [ ] **Step 5: Rodar e ver passar** — o novo teste **e** a suíte existente de `build-html` verdes (sem regressão de snapshot).
Run: `corepack pnpm test src/lib/report/convenio-bruto`
Expected: PASS (todos).
- [ ] **Step 6: Commit**
```bash
git add src/lib/report/convenio-bruto/render-dossie.ts src/lib/report/convenio-bruto/build-html.ts src/lib/report/convenio-bruto/render-dossie.test.ts
git commit -m "refactor(report): extrai renderDossieTablesHtml p/ reuso bruto↔narrativo"
```

---

### Task 4: Tipos `convenio-narrativo/types.ts`

**Files:**
- Create: `src/lib/report/convenio-narrativo/types.ts`

**Interfaces:**
- Produces: `ConvenioNarrativoInput`, `ConvenioNarrativoDraft`, `PayloadConvenioNarrativo`.
- Consumes: `PayloadConvenioBruto` de `../convenio-bruto/types`.

Tipos-only, sem teste dedicado (validado pelo typecheck e pelos consumidores).

- [ ] **Step 1: Escrever** `types.ts`:
```ts
import type { PayloadConvenioBruto } from "../convenio-bruto/types";

export type CabecalhoConvenio = {
  operadora: string;
  cid: string | null;      // conforme prescrição médica assistente (C5)
  finalidade: string;
};

export type ConvenioNarrativoInput = {
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  cabecalho: CabecalhoConvenio;
  dossie: PayloadConvenioBruto;   // factual verbatim (C2)
};

export type ConvenioNarrativoDraft = {
  resumoClinico: string;
  evolucaoPorDominio: Array<{ dominio: string; narrativa: string }>;
  justificativaContinuidade: string;
  objetivosProximoPeriodo: string[];      // max 5
  periodoSemAvancoVisivel: boolean;       // C4
  notaHonestidade: string | null;         // C4, só quando true
  status: "rascunho_para_revisao";        // C7
};

export type PayloadConvenioNarrativo = {
  versao: 1;
  paciente: { nome: string };
  periodo: { inicio: string; fim: string };
  cabecalho: CabecalhoConvenio;
  geradoEm: string;                        // ISO — data de extração do snapshot (D10)
  provider: "stub" | "claude";
  dossie: PayloadConvenioBruto;            // snapshot congelado (D10) — não re-buscado no export
  iaOriginal: ConvenioNarrativoDraft;      // imutável (auditoria)
  curado: ConvenioNarrativoDraft | null;   // null até curar
};
```
- [ ] **Step 2: Typecheck** `corepack pnpm typecheck` → 0 erros.
- [ ] **Step 3: Commit**
```bash
git add src/lib/report/convenio-narrativo/types.ts
git commit -m "feat(fase5): tipos do relatório de convênio narrativo"
```

---

### Task 5: `build-input.ts`

**Files:**
- Create: `src/lib/report/convenio-narrativo/build-input.ts`
- Test: `src/lib/report/convenio-narrativo/build-input.int.test.ts`

**Interfaces:**
- Produces: `buildConvenioNarrativoInput(tx: Tx, args: { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string; cabecalho: CabecalhoConvenio }): Promise<ConvenioNarrativoInput>`.
- Consumes: `buildConvenioBrutoPayload` (`../convenio-bruto/build-payload`), `Tx` (`@/db/rls`).

- [ ] **Step 1:** Ler `src/lib/report/convenio-bruto/build-payload.ts` p/ a assinatura exata de `buildConvenioBrutoPayload` (args e retorno).
- [ ] **Step 2: Escrever o teste falhando** `build-input.int.test.ts` (padrão de `convenio-bruto/build-payload.int.test.ts`: seed via `withTenant`, RLS ativa): gera dossiê de um paciente com N sessões/evidências no período; `buildConvenioNarrativoInput` retorna `{ paciente.nome, periodo, cabecalho (intacto), dossie }` onde `dossie` == o payload do bruto; evidência fora do período não aparece.
- [ ] **Step 3: Rodar e ver falhar.**
Run: `corepack pnpm test src/lib/report/convenio-narrativo/build-input.int.test.ts`
Expected: FAIL.
- [ ] **Step 4: Implementar** `build-input.ts`:
```ts
import "server-only";
import type { Tx } from "@/db/rls";
import { buildConvenioBrutoPayload } from "../convenio-bruto/build-payload";
import type { CabecalhoConvenio, ConvenioNarrativoInput } from "./types";

export async function buildConvenioNarrativoInput(
  tx: Tx,
  args: { patientId: string; nomePaciente: string; periodoInicio: string; periodoFim: string; cabecalho: CabecalhoConvenio },
): Promise<ConvenioNarrativoInput> {
  const dossie = await buildConvenioBrutoPayload(tx, {
    patientId: args.patientId,
    nomePaciente: args.nomePaciente,
    periodoInicio: args.periodoInicio,
    periodoFim: args.periodoFim,
  });
  return {
    paciente: { nome: args.nomePaciente },
    periodo: { inicio: args.periodoInicio, fim: args.periodoFim },
    cabecalho: args.cabecalho,
    dossie,
  };
}
```
(Ajustar os nomes dos args ao que `buildConvenioBrutoPayload` realmente espera, conforme Step 1.)
- [ ] **Step 5: Rodar e ver passar.**
- [ ] **Step 6: Commit**
```bash
git add src/lib/report/convenio-narrativo/build-input.ts src/lib/report/convenio-narrativo/build-input.int.test.ts
git commit -m "feat(fase5): build-input do convênio narrativo (reusa dossiê bruto)"
```

---

### Task 6: Provider + stub + numeric-guard + esqueleto Claude

**Files:**
- Create: `src/lib/report/convenio-narrativo/provider.ts`, `stub-provider.ts`, `claude-provider.ts`
- Test: `src/lib/report/convenio-narrativo/stub-provider.test.ts`, `provider.test.ts`

**Interfaces:**
- Produces:
  - `interface ConvenioNarrativoProvider { gerar(input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft> }`
  - `resolveConvenioNarrativoProvider(clinic: { isDemo: boolean }): ConvenioNarrativoProvider`
  - `validarDraftContraDossie(draft: ConvenioNarrativoDraft, dossie: PayloadConvenioBruto): { ok: true } | { ok: false; numeroOrfao: string }`
  - `class StubConvenioNarrativoProvider implements ConvenioNarrativoProvider`
- Consumes: tipos da Task 4.

- [ ] **Step 1: Escrever os testes falhando** `stub-provider.test.ts`:
  - **C2 (números do dossiê):** monta `dossie` com `presenca.sessoesRealizadas=8` e 3 evidências em "Comunicação"; o draft do stub só contém números que estão no dossiê (roda `validarDraftContraDossie` no próprio draft do stub → `ok:true`).
  - **C4 platô:** `dossie.evidencias=[]` → `periodoSemAvancoVisivel===true` e `notaHonestidade` não-vazia, sem texto de progresso (assert que `resumoClinico`/`justificativa` não afirmam avanço — ex.: não contêm "evolução" isolada de contexto; asserção pragmática: `periodoSemAvancoVisivel` true e nota presente).
  - **evolucaoPorDominio:** um item por `metaOuDominio` distinto do dossiê; a narrativa cita a contagem daquele domínio.
  - **C1 tom técnico:** o draft não contém termos infantilizados (assert contra lista: "conquista", "está trabalhando", "apoiar em casa").
  E `provider.test.ts`:
  - `validarDraftContraDossie` rejeita um draft cujo `resumoClinico` contém "42" ausente do dossiê (`ok:false`, `numeroOrfao:"42"`); aceita draft só com números do dossiê.
  - `resolveConvenioNarrativoProvider({isDemo:true})` → instância do stub.
- [ ] **Step 2: Rodar e ver falhar.**
Run: `corepack pnpm test src/lib/report/convenio-narrativo/stub-provider.test.ts src/lib/report/convenio-narrativo/provider.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implementar `provider.ts`** (interface + resolve + guard):
```ts
import "server-only";
import type { PayloadConvenioBruto } from "../convenio-bruto/types";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";
import { StubConvenioNarrativoProvider } from "./stub-provider";
import { ClaudeConvenioNarrativoProvider } from "./claude-provider";

export interface ConvenioNarrativoProvider {
  gerar(input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft>;
}

const CAMPOS_LIVRES = (d: ConvenioNarrativoDraft): string[] => [
  d.resumoClinico,
  d.justificativaContinuidade,
  d.notaHonestidade ?? "",
  ...d.evolucaoPorDominio.map((e) => e.narrativa),
  ...d.objetivosProximoPeriodo,
];

// numeric-guard (C2/D11): nenhum número na narrativa pode faltar no dossiê.
export function validarDraftContraDossie(
  draft: ConvenioNarrativoDraft,
  dossie: PayloadConvenioBruto,
): { ok: true } | { ok: false; numeroOrfao: string } {
  const permitidos = new Set((JSON.stringify(dossie).match(/\d+/g) ?? []));
  for (const campo of CAMPOS_LIVRES(draft)) {
    for (const num of campo.match(/\d+/g) ?? []) {
      if (!permitidos.has(num)) return { ok: false, numeroOrfao: num };
    }
  }
  return { ok: true };
}

export function resolveConvenioNarrativoProvider(clinic: { isDemo: boolean }): ConvenioNarrativoProvider {
  if (clinic.isDemo) return new StubConvenioNarrativoProvider();
  if (process.env.CONVENIO_REPORT_LLM_ENABLED === "true" && process.env.ANTHROPIC_API_KEY) {
    return new ClaudeConvenioNarrativoProvider();
  }
  return new StubConvenioNarrativoProvider();
}
```
- [ ] **Step 4: Implementar `stub-provider.ts`** — determinístico, deriva do dossiê:
```ts
import "server-only";
import type { ConvenioNarrativoProvider } from "./provider";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";

const POSITIVA = new Set(["independente", "positiva", "aquisicao", "aquisição"]);

export class StubConvenioNarrativoProvider implements ConvenioNarrativoProvider {
  async gerar(input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft> {
    const { dossie } = input;
    // agrupa evidências por domínio (contagem factual — C2)
    const porDominio = new Map<string, number>();
    for (const e of dossie.evidencias) {
      porDominio.set(e.metaOuDominio, (porDominio.get(e.metaOuDominio) ?? 0) + 1);
    }
    const evolucaoPorDominio = [...porDominio.entries()].map(([dominio, n]) => ({
      dominio,
      narrativa: `No período, foram registradas ${n} evidência(s) clínica(s) aprovada(s) no domínio ${dominio}, extraídas do prontuário.`,
    }));

    const temAvanco = dossie.evidencias.some((e) => POSITIVA.has(e.classificacao.toLowerCase()));
    const periodoSemAvancoVisivel = evolucaoPorDominio.length === 0 || !temAvanco;

    const p = dossie.presenca;
    const resumoClinico =
      `Paciente em acompanhamento terapêutico no período de ${input.periodo.inicio} a ${input.periodo.fim}. ` +
      `Foram realizadas ${p.sessoesRealizadas} sessão(ões), com ${p.faltasJustificadas} falta(s) justificada(s) ` +
      `e ${p.faltasNaoJustificadas} não justificada(s). Os dados quantitativos constam do dossiê factual anexo.`;

    const justificativaContinuidade = periodoSemAvancoVisivel
      ? `A ausência de avanço mensurável no período justifica a manutenção do acompanhamento com revisão de conduta, conforme dados do dossiê.`
      : `A evolução registrada no dossiê fundamenta a continuidade do acompanhamento para consolidação dos ganhos.`;

    return {
      resumoClinico,
      evolucaoPorDominio,
      justificativaContinuidade,
      objetivosProximoPeriodo: input.dossie.evidencias.length
        ? ["Consolidar os ganhos registrados no período.", "Reavaliar metas ativas na próxima janela."]
        : ["Reavaliar plano terapêutico e conduta na próxima janela."],
      periodoSemAvancoVisivel,
      notaHonestidade: periodoSemAvancoVisivel
        ? "Não houve avanço clinicamente mensurável no período; o acompanhamento é mantido para revisão de conduta."
        : null,
      status: "rascunho_para_revisao",
    };
  }
}
```
(Ajustar `POSITIVA` aos valores reais de `evidence.classificacao` — conferir no enum/uso do `convenio-bruto`; se a classificação usar outros rótulos, mapear pelos reais.)
- [ ] **Step 5: Implementar `claude-provider.ts`** (esqueleto gated, pós-DPA):
```ts
import "server-only";
import type { ConvenioNarrativoProvider } from "./provider";
import type { ConvenioNarrativoDraft, ConvenioNarrativoInput } from "./types";

export class ClaudeConvenioNarrativoProvider implements ConvenioNarrativoProvider {
  async gerar(_input: ConvenioNarrativoInput): Promise<ConvenioNarrativoDraft> {
    // Habilitação real = infra pós-DPA (mesmo guardrail P0 LGPD da extração).
    // Ao ligar: montar prompt com o dossiê como contexto factual + C1–C8,
    // parsear a saída, e rodar validarDraftContraDossie ANTES de retornar.
    throw new Error("ClaudeConvenioNarrativoProvider não habilitado (pendente DPA/CONVENIO_REPORT_LLM_ENABLED).");
  }
}
```
- [ ] **Step 6: Rodar e ver passar.**
- [ ] **Step 7: Commit**
```bash
git add src/lib/report/convenio-narrativo/provider.ts src/lib/report/convenio-narrativo/stub-provider.ts src/lib/report/convenio-narrativo/claude-provider.ts src/lib/report/convenio-narrativo/provider.test.ts src/lib/report/convenio-narrativo/stub-provider.test.ts
git commit -m "feat(fase5): provider + stub + numeric-guard do convênio narrativo"
```

---

### Task 7: `build-html.ts` (dossiê factual + narrativa) — [Gemini-delegável]

**Files:**
- Create: `src/lib/report/convenio-narrativo/build-html.ts`
- Test: `src/lib/report/convenio-narrativo/build-html.test.ts`

**Interfaces:**
- Produces: `buildConvenioNarrativoHtml(payload: PayloadConvenioNarrativo): string`.
- Consumes: `renderDossieTablesHtml` (Task 3), `escapeHtml` (`../sanitize`).

- [ ] **Step 1: Escrever os testes falhando** `build-html.test.ts`:
  - escapa `<script>` e `"` em cabeçalho (operadora/finalidade), `resumoClinico`, `evolucaoPorDominio[].narrativa` e `notaHonestidade`;
  - renderiza `curado` quando presente; renderiza `iaOriginal` quando `curado===null`;
  - contém o bloco factual do dossiê (via `renderDossieTablesHtml`) **e** o bloco narrativo, separados;
  - contém "Dados extraídos em" + `geradoEm` e "conforme prescrição médica assistente";
  - não contém `<script>` nem `http://`/`https://`;
  - snapshot estrutural.
- [ ] **Step 2: Rodar e ver falhar.**
Run: `corepack pnpm test src/lib/report/convenio-narrativo/build-html.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implementar** `build-html.ts` — função pura que:
  1. abre documento HTML (mirror da estrutura de `convenio-bruto/build-html.ts`: mesmas fontes locais embutidas, sem `<script>`/asset remoto);
  2. cabeçalho: nome, período, operadora, "CID (conforme prescrição médica assistente): {cid ?? '—'}", finalidade, "Dados extraídos em {geradoEm}";
  3. `renderDossieTablesHtml(payload.dossie)` (bloco factual);
  4. bloco narrativo de `const d = payload.curado ?? payload.iaOriginal`: `resumoClinico`, `evolucaoPorDominio` (dominio + narrativa), `justificativaContinuidade`, `objetivosProximoPeriodo`; se `d.periodoSemAvancoVisivel`, renderiza `d.notaHonestidade`;
  5. rodapé: "Documento de suporte à solicitação de cobertura, revisado por [coordenador]. Diagnóstico e prescrição são do médico assistente externo; a clínica não diagnostica.";
  6. **`escapeHtml` em todo texto livre.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit**
```bash
git add src/lib/report/convenio-narrativo/build-html.ts src/lib/report/convenio-narrativo/build-html.test.ts
git commit -m "feat(fase5): build-html do convênio narrativo (dossiê + narrativa)"
```

---

### Task 8: Máquina de estado `convenio-narrativo-logic.ts`

**Files:**
- Create: `src/app/(app)/relatorios/convenio-narrativo-logic.ts`
- Test: `src/app/(app)/relatorios/convenio-narrativo-logic.int.test.ts`

**Interfaces:**
- Produces:
  - `gerarRascunhoConvenioNarrativo(ctx, input) -> { reportId; versao; draft } | { error }`
  - `curarConvenioNarrativo(ctx, input) -> { ok:true } | { error }`
  - `exportarConvenioNarrativo(ctx, input, renderer?) -> { reportId; hash } | { error }`
  - schemas zod exportados (`gerar…Schema`, `curar…Schema`, `exportar…Schema`).
- Consumes: `requireRole`, `withTenant`, `exportReport`, `buildConvenioNarrativoInput`, `buildConvenioNarrativoHtml`, `resolveConvenioNarrativoProvider`, `playwrightRenderer`.

Espelha `familia-logic.ts` (ler como molde). **Diferenças-chave:** `requireRole(ctx,"coordenador")` nas **3** ações (não terapeuta); `curar` faz `jsonb_set` em `{curado}` **e** `{cabecalho}`; INSERT com `tipo='convenio_narrativo'` e payload embutindo `dossie`.

- [ ] **Step 1:** Ler `src/app/(app)/relatorios/familia-logic.ts` inteiro (molde da máquina de estado + trava otimista + gate de export).
- [ ] **Step 2: Escrever os testes falhando** `convenio-narrativo-logic.int.test.ts` (padrão de `familia-logic.int.test.ts`, RLS ativa via `withTenant`):
  1. `gerarRascunhoConvenioNarrativo` (coordenador) → `status='rascunho'`, `gerado_por_ia=true`, `curado=null`, `dossie` embutido no payload, `cabecalho` persistido, audit `relatorio_rascunho_gerado`.
  2. `curarConvenioNarrativo` → `status='revisado'`, `payload_versao` incrementado, `revisado_por` setado, `cabecalho` **editado** persistido, audit `relatorio_revisado`.
  3. `exportarConvenioNarrativo` antes de curar (rascunho) → erro "precisa ser revisado"; depois de curar → PDF gravado, `status='exportado'`, audit.
  4. trava otimista: `curar` com `versaoEsperada` obsoleto → erro limpo.
  5. **export duplo:** segunda chamada após a primeira exportar → erro (`status exportado não exportável`).
- [ ] **Step 3: Rodar e ver falhar.**
Run: `corepack pnpm test src/app/(app)/relatorios/convenio-narrativo-logic.int.test.ts`
Expected: FAIL.
- [ ] **Step 4: Implementar** `convenio-narrativo-logic.ts`. Estrutura (mirror de `familia-logic.ts`):
```ts
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import type { PdfRenderer } from "@/lib/report/renderer";
import { exportReport } from "@/lib/report/export";
import { playwrightRenderer } from "@/lib/report/playwright-renderer";
import { buildConvenioNarrativoInput } from "@/lib/report/convenio-narrativo/build-input";
import { buildConvenioNarrativoHtml } from "@/lib/report/convenio-narrativo/build-html";
import { resolveConvenioNarrativoProvider } from "@/lib/report/convenio-narrativo/provider";
import type { ConvenioNarrativoDraft, PayloadConvenioNarrativo, CabecalhoConvenio } from "@/lib/report/convenio-narrativo/types";

const cabecalhoSchema = z.object({
  operadora: z.string().min(1),
  cid: z.string().nullable(),
  finalidade: z.string().min(1),
});
const draftSchema: z.ZodType<ConvenioNarrativoDraft> = z.object({
  resumoClinico: z.string().min(1),
  evolucaoPorDominio: z.array(z.object({ dominio: z.string(), narrativa: z.string() })),
  justificativaContinuidade: z.string().min(1),
  objetivosProximoPeriodo: z.array(z.string()).max(5),
  periodoSemAvancoVisivel: z.boolean(),
  notaHonestidade: z.string().nullable(),
  status: z.literal("rascunho_para_revisao"),
});

export const gerarConvenioNarrativoSchema = z.object({
  patientId: z.string().uuid(),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cabecalho: cabecalhoSchema,
}).refine((d) => d.periodoInicio <= d.periodoFim, { message: "Início deve ser ≤ fim.", path: ["periodoInicio"] });
export const curarConvenioNarrativoSchema = z.object({
  reportId: z.string().uuid(),
  versaoEsperada: z.number().int().positive(),
  cabecalhoEditado: cabecalhoSchema,
  draftEditado: draftSchema,
});
export const exportarConvenioNarrativoSchema = z.object({ reportId: z.string().uuid() });
```
  - `gerarRascunhoConvenioNarrativo(ctx, input)`: `requireRole(ctx,"coordenador")`; `withTenant`: resolve `nome` do paciente (RLS escopa) + `isDemo`; `buildConvenioNarrativoInput` → `resolveConvenioNarrativoProvider(...).gerar(input)` → `iaOriginal`; montar `PayloadConvenioNarrativo` (`versao:1`, `provider:"stub"`, `dossie:input.dossie`, `iaOriginal`, `curado:null`, `cabecalho`); INSERT `report(tipo='convenio_narrativo', status='rascunho', gerado_por_ia=true, payload)` RETURNING id; audit `relatorio_rascunho_gerado` (detalhe `tipo:'convenio_narrativo'`); retorna `{reportId, versao:1, draft:iaOriginal}`.
  - `curarConvenioNarrativo(ctx, input)`: `requireRole(ctx,"coordenador")`; UPDATE com **dois jsonb_set encadeados**:
```sql
SET payload = jsonb_set(jsonb_set(payload,'{curado}', ${draft}::jsonb, true), '{cabecalho}', ${cab}::jsonb, true),
    payload_versao = payload_versao + 1, status = 'revisado', revisado_por = ${ctx.userId}::uuid
WHERE id = ${reportId}::uuid AND tipo='convenio_narrativo'
  AND status IN ('rascunho','revisado') AND payload_versao = ${versaoEsperada}
RETURNING id, patient_id
```
    0 linhas → erro limpo; audit `relatorio_revisado`.
  - `exportarConvenioNarrativo(ctx, input, renderer=playwrightRenderer)`: `requireRole(ctx,"coordenador")`; `withTenant`: pre-gate `status==='revisado'` (senão erro); `exportReport(tx,{reportId, atorId:ctx.userId, buildHtml:(pl)=>buildConvenioNarrativoHtml(pl as PayloadConvenioNarrativo), renderer})`; retorna `{reportId, hash}`. (A trava de concorrência vive dentro de `exportReport` — não duplicar.)
- [ ] **Step 5: Rodar e ver passar.**
- [ ] **Step 6: Commit**
```bash
git add src/app/(app)/relatorios/convenio-narrativo-logic.ts src/app/(app)/relatorios/convenio-narrativo-logic.int.test.ts
git commit -m "feat(fase5): máquina de estado do convênio narrativo (gerar/curar/exportar)"
```

---

### Task 9: Actions + queries + UI + tile + a11y

**Files:**
- Modify: `src/app/(app)/relatorios/actions.ts`, `queries.ts`, `page.tsx`
- Create: `src/app/(app)/relatorios/convenio-narrativo-report.tsx`
- Test: `src/app/(app)/relatorios/a11y.test.tsx` (novo caso)

**Interfaces:**
- Consumes: as 3 funções de logic (Task 8) + `getTenantContext`.
- Produces: server actions `gerar…Action`/`curar…Action`/`exportar…Action`; componente cliente `ConvenioNarrativoReport`.

- [ ] **Step 1:** Ler `actions.ts` (wrappers da família), `familia-report.tsx` e `page.tsx` (tile + `podeCurar`).
- [ ] **Step 2: Actions** — em `actions.ts` (`"use server"`), 3 wrappers espelhando os da família: derivam `ctx = await getTenantContext()`, delegam à logic, `revalidatePath("/relatorios")`. Nada de `ctx` vindo do cliente.
- [ ] **Step 3: Queries** — em `queries.ts`, adicionar `previewConvenioNarrativo` (lê o rascunho p/ a tela de curadoria: payload `iaOriginal`/`curado`/`cabecalho`/`geradoEm`/`versao`/`status`) e, se necessário, reusar `listarPacientesParaRelatorio` existente.
- [ ] **Step 4: UI** — `convenio-narrativo-report.tsx` (`"use client"`), clone de `familia-report.tsx`: fluxo (1) seleção paciente+período + **form de cabeçalho** (operadora/CID/finalidade); (2) gerar → preview (dossiê + narrativa); (3) editor de curadoria dos campos do draft **e do cabeçalho**, `useTransition`, rastreia `versao` p/ trava otimista, exibe "Dados extraídos em {geradoEm}" + botão **regenerar**; (4) exportar (habilitado só em `revisado`) → link de download. Reusar componentes do design system (memória `workflow-subagents-skills-design-system`) — nada hardcodado; o `<textarea>` de curadoria segue o padrão já usado na família (dívida DS registrada).
- [ ] **Step 5: Tile** — em `page.tsx`, adicionar a tile do convênio narrativo **só p/ coordenador** (`ctx.role==='coordenador'`; terapeuta não vê/gera — D6).
- [ ] **Step 6: a11y** — adicionar caso em `a11y.test.tsx`: preview + form de cabeçalho + form de curadoria → 0 violações axe.
- [ ] **Step 7: Rodar** `corepack pnpm test src/app/(app)/relatorios/a11y.test.tsx` → PASS; `corepack pnpm lint` → 0.
- [ ] **Step 8: Commit**
```bash
git add src/app/(app)/relatorios/
git commit -m "feat(fase5): UI de curadoria + actions do convênio narrativo (coordenador-only)"
```

---

### Task 10: RLS + suíte completa + fechamento

**Files:**
- Modify: `src/db/rls.int.test.ts` (novos casos), `BACKLOG.md`

- [ ] **Step 1: Escrever os testes RLS** em `rls.int.test.ts` (padrão dos casos de `report` da família/bruto), para `convenio_narrativo`:
  - coordenador de outra clínica **não** vê/edita o report (isolamento multi-tenant);
  - **terapeuta on-team é bloqueado nas 3 ações** (gerar/curar/exportar → `RoleError`) — difere da família;
  - `admin_recepcao` bloqueado nas 3;
  - coordenador da clínica dona executa as 3.
- [ ] **Step 2: Rodar RLS** `corepack pnpm test:rls` → PASS.
- [ ] **Step 3: Suíte completa** — rodar e confirmar verde (evidência antes de qualquer claim de pronto):
```
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:rls
```
  (Se `db/tests/agenda2-encerrar-regra.int.test.ts` falhar por data do sistema, é o flaky pré-existente registrado — não relacionado; anotar, não corrigir aqui.)
- [ ] **Step 4: BACKLOG** — atualizar `BACKLOG.md`: marcar Fase 5 concluída no painel (Issue #8 fechável), adicionar seção da Fatia 5 (o que entregou + dívidas: ClaudeProvider real esqueleto, templating por-operadora, entidade de prescrição/anexo, dup de rascunhos, detecção ativa de staleness).
- [ ] **Step 5: Commit + push + PR**
```bash
git add BACKLOG.md src/db/rls.int.test.ts
git commit -m "test(fase5): RLS coordenador-only do convênio narrativo + backlog"
git push -u origin feat/fase5-fatia5-convenio-narrativo
gh pr create --title "feat(fase5): Fatia 5 — Relatório de Convênio Narrativo (IA + curadoria)" --body "<contexto + decisões D1-D12 + revisão adversarial + DoD; fecha #8>"
```
  (PR com contexto p/ Jules — memória `pr-descricao-contexto-jules`.)
- [ ] **Step 6:** Após merge: `graphify update .`, deletar branch, sincronizar main (memória `fluxo-git-sem-dev-env`), fechar Issue #8.

---

## Self-Review

**Spec coverage:** C1–C8 → Task 1 + Task 6 (stub/guard). Migração D9 → Task 2. renderDossie D12 → Task 3. Tipos → Task 4. build-input D2 → Task 5. Provider/stub/numeric-guard D11 → Task 6. build-html D3/D8-label/D10-label → Task 7. Máquina de estado D5/D6/D7/D8/trava → Task 8. UI D8/D10/regenerar → Task 9. RLS coordenador-only + suíte + fechamento → Task 10. Brecha 1 (concorrência) → coberta por Task 8 Step 2.5 (export duplo) sem código novo. Todos os itens do DoD (§12 do spec) têm task.

**Placeholder scan:** sem TBD/TODO; código concreto em cada step; `<contexto...>` do corpo do PR é conteúdo a redigir na hora, não placeholder de código.

**Type consistency:** `ConvenioNarrativoDraft`/`PayloadConvenioNarrativo`/`CabecalhoConvenio`/`ConvenioNarrativoInput` consistentes entre Tasks 4–9; `validarDraftContraDossie`, `resolveConvenioNarrativoProvider`, `buildConvenioNarrativoInput`, `buildConvenioNarrativoHtml`, `renderDossieTablesHtml` com a mesma assinatura em produtor e consumidor.
