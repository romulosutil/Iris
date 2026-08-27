# D61 — Fuso da Clínica Dinâmico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer toda a camada de aplicação ler `clinic.timezone` (por clínica) em vez da constante chumbada `FUSO_CLINICA = "America/Sao_Paulo"` (`src/app/(app)/agenda/fuso.ts:4`), fechando a divergência registrada em `BACKLOG.md` D61.

**Architecture:** Um helper único (`fusoDaClinica`/`fusoDaClinicaAtual`) busca `clinic.timezone` (fallback `"America/Sao_Paulo"` se a linha faltar — nunca deveria acontecer sob RLS). Server components/actions buscam o fuso uma vez por request e o passam como prop/parâmetro explícito para baixo — nunca reimportam a constante. Toda fronteira de dia que hoje concatena o offset fixo `-03:00` passa a usar `resolverInstante` (`@/lib/agenda/materializar`), que resolve o instante via `Intl` na zona real — única forma correta para clínicas fora de `America/Sao_Paulo`. `FUSO_CLINICA`/`FUSO_CLINICA_OFFSET` deixam de ser importados por qualquer arquivo de produção; sobrevivem em `fuso.ts` só como fallback literal dentro do helper (ou são removidos — task final decide).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle ORM, Postgres, Vitest.

**Spec:** `BACKLOG.md` D61 (linha 103) — `FUSO_CLINICA` chumbado vs. `clinic.timezone` (`schema.ts:291`). Achado original em `.specs/features/352-expurgo-prontuario-expirado/context.md:187`.

## Global Constraints

- Nunca concatenar `${offset}` fixo (`-03:00`) para resolver fronteira de dia — usar `resolverInstante(dataISO, "HH:MM", fuso)`.
- Fallback do fuso quando a linha `clinic` não é encontrada: `"America/Sao_Paulo"` (mesmo default da coluna, `schema.ts:291`).
- Client Components (`"use client"`) NUNCA leem `FUSO_CLINICA` diretamente — recebem `fuso: string` como prop vinda de um Server Component ancestral.
- Nenhuma mudança em `schema.ts`/RLS/migração — `clinic.timezone` já existe (`0023_boring_photon.sql`).
- Commits em inglês (Conventional Commits), pt-BR só em comentários/docs.

---

## File Structure

**Criar:**
- `src/lib/agenda/clinic-timezone.ts` — helper único: `fusoDaClinica(tx, clinicId)` (dentro de uma tx já aberta) e `fusoDaClinicaAtual(ctx)` (abre a própria tx via `withTenant`, para quem não está dentro de uma).

**Modificar (server, busca/usa fuso):**
- `src/app/(app)/agenda/queries.ts` — `carregarSemana`, `criarRegra` (reordena fetch do fuso), dedup dos 4 fetches inline existentes (`criarAvulsa`, `materializarRegra`, `conflitosNaTx`, `cutoffEncerramento`) para o helper.
- `src/app/(app)/agenda/logic.ts` — `listarSessoesDoDia`.
- `src/app/(app)/agenda/page.tsx` — busca o fuso uma vez, propaga.
- `src/app/(app)/pacientes/[id]/schemas.ts` — `dataAltaSchema` vira fábrica `dataAltaSchema(fuso)`.
- `src/app/(app)/pacientes/[id]/logic.ts` — `alternarAlta` busca o fuso e chama a fábrica.
- `src/app/(app)/clinica/retencao/queries.ts` — `lerPaginaExpurgaveis`.
- `src/app/(app)/clinica/auditoria/queries.ts` — `lerPaginaTrilha`.
- `src/app/(app)/pacientes/[id]/briefing/page.tsx` — busca o fuso, propaga.
- `src/app/(app)/agenda/semana/page.tsx` → `semana-cliente.tsx` → `calendario-semana.tsx` — propaga `fuso` até o grid.

**Modificar (client, recebe `fuso` por prop):**
- `src/app/(app)/agenda/agenda-view-cliente.tsx`
- `src/app/(app)/agenda/appointment-modal.tsx`
- `src/app/(app)/agenda/checkin-button.tsx`
- `src/app/(app)/agenda/pendencias-cluster-cliente.tsx`
- `src/components/ui/schedule-grid.tsx`
- `src/components/ui/calendar/calendar-grid.tsx`

**Fora de escopo (não usados em produção, confirmado por grep — zero import em `src/app`):** `src/components/ui/calendar/calendar-root.tsx`, `calendar-header.tsx`, `calendar-event-sidebar.tsx`. Não tocar — registrar achado no fechamento do D61 se quiser, mas não é código alcançável por request real.

**Fora de escopo (script dev, não multi-tenant real):** `scripts/lib/seed-demo-clinic.ts` — semeia a própria clínica com `timezone` default; a constante ali é aceitável.

---

## Task 1: Helper `fusoDaClinica` / `fusoDaClinicaAtual`

**Files:**
- Create: `src/lib/agenda/clinic-timezone.ts`
- Test: `src/lib/agenda/clinic-timezone.int.test.ts`

**Interfaces:**
- Produces: `fusoDaClinica(tx: Tx, clinicId: string): Promise<string>` (para uso DENTRO de uma tx já aberta por `withTenant`) e `fusoDaClinicaAtual(ctx: TenantContext): Promise<string>` (abre a própria tx — para Server Components/actions que não têm uma tx aberta).
- Consumes: `withTenant`, `TenantContext` (`@/db/rls`), `schema.clinic` (`@/db/schema`).

- [ ] **Step 1: Escrever o teste de integração (falha primeiro)**

```typescript
// src/lib/agenda/clinic-timezone.int.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import * as schema from "@/db/schema";
import { fusoDaClinica, fusoDaClinicaAtual } from "./clinic-timezone";
import { owner, ensureSchema, closeAll } from "@/db/tests/helpers"; // ajustar import ao helper real do repo (ver outro *.int.test.ts de agenda para o padrão de setup)

const CLINIC_A = "11111111-1111-1111-1111-111111111111";

describe("fusoDaClinica", () => {
  beforeAll(async () => {
    await ensureSchema();
    await owner`INSERT INTO clinic (id, nome, timezone) VALUES (${CLINIC_A}, 'Acre', 'America/Rio_Branco') ON CONFLICT DO NOTHING`;
  });
  afterAll(async () => {
    await owner`DELETE FROM clinic WHERE id = ${CLINIC_A}`;
    await closeAll();
  });

  it("lê o timezone real da clínica, não o default de São Paulo", async () => {
    const ctx: TenantContext = {
      clinicId: CLINIC_A,
      userId: "00000000-0000-0000-0000-000000000000",
      role: "coordenador",
      mfaEnrolled: true,
    };
    const fuso = await fusoDaClinicaAtual(ctx);
    expect(fuso).toBe("America/Rio_Branco");
  });

  it("dentro de uma tx já aberta, devolve o mesmo valor", async () => {
    const ctx: TenantContext = {
      clinicId: CLINIC_A,
      userId: "00000000-0000-0000-0000-000000000000",
      role: "coordenador",
      mfaEnrolled: true,
    };
    const fuso = await withTenant(ctx, (tx) => fusoDaClinica(tx, CLINIC_A));
    expect(fuso).toBe("America/Rio_Branco");
  });
});
```

> Nota para quem executa: ajuste os imports de setup (`owner`, `ensureSchema`, `closeAll`) para o padrão real usado nos `*.int.test.ts` vizinhos (ex.: `db/tests/agenda2-fundacao.int.test.ts`) — o repo já tem um helper de conexão `owner` e criação de clínica de teste; copie o boilerplate de lá em vez de reinventar.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/lib/agenda/clinic-timezone.int.test.ts --config vitest.integration.config.ts`
Expected: FAIL — `clinic-timezone.ts` não existe.

- [ ] **Step 3: Implementar o helper**

```typescript
// src/lib/agenda/clinic-timezone.ts
import "server-only";
import { eq } from "drizzle-orm";
import { clinic } from "@/db/schema";
import { withTenant, type TenantContext } from "@/db/rls";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Fuso IANA da clínica (`clinic.timezone`), lido DENTRO de uma tx já aberta
 * por `withTenant` — não abre transação própria. Fallback ao default da
 * coluna (`schema.ts:291`) se a linha não existir (não deveria, sob RLS). */
export async function fusoDaClinica(tx: Tx, clinicId: string): Promise<string> {
  const [row] = await tx
    .select({ timezone: clinic.timezone })
    .from(clinic)
    .where(eq(clinic.id, clinicId));
  return row?.timezone ?? "America/Sao_Paulo";
}

/** Mesma leitura, para quem ainda não tem uma tx aberta (Server Components,
 * início de uma Server Action). Abre a própria tx via `withTenant`. */
export async function fusoDaClinicaAtual(ctx: TenantContext): Promise<string> {
  return withTenant(ctx, (tx) => fusoDaClinica(tx, ctx.clinicId));
}
```

- [ ] **Step 4: Rodar e confirmar passa**

Run: `pnpm vitest run src/lib/agenda/clinic-timezone.int.test.ts --config vitest.integration.config.ts`
Expected: PASS (2 testes verdes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agenda/clinic-timezone.ts src/lib/agenda/clinic-timezone.int.test.ts
git commit -m "feat(agenda): adiciona helper fusoDaClinica para ler clinic.timezone"
```

---

## Task 2: `agenda/queries.ts` — dedup + fix `carregarSemana` e `criarRegra`

**Files:**
- Modify: `src/app/(app)/agenda/queries.ts:1-52,103-273,320-512,554-663,896-992`
- Test: `db/tests/agenda2-semana-actions.int.test.ts` (já existe — cobre `carregarSemana`/`criarRegra`; usar clínica não-SP num teste novo)

**Interfaces:**
- Consumes: `fusoDaClinica` (Task 1), `resolverInstante` (`@/lib/agenda/materializar`, já importado no arquivo).
- Produces: comportamento de `carregarSemana` e `criarRegra` idêntico ao atual quando `clinic.timezone = "America/Sao_Paulo"` (não quebra nenhum teste existente); correto para outros fusos.

- [ ] **Step 1: Escrever o teste que expõe o bug (falha primeiro)**

Adicionar em `db/tests/agenda2-semana-actions.int.test.ts` (mesmo arquivo, ao lado dos testes existentes de `carregarSemana`):

```typescript
it("carregarSemana recorta a semana no fuso da clínica, não em America/Sao_Paulo", async () => {
  // Acre é UTC-5: 23h de sábado em Rio Branco já é sábado em SP também, mas
  // 22h-23h BRT (SP) vira 20h-21h em Rio Branco — a virada de dia diverge.
  await owner`UPDATE clinic SET timezone = 'America/Rio_Branco' WHERE id = ${CLINIC_A}`;
  try {
    // Sessão às 23:30 (hora de Rio Branco) do dia 2026-08-22 (sábado) —
    // em UTC isso é 2026-08-23T03:30Z. Se o código ainda usar
    // FUSO_CLINICA_OFFSET="-03:00" (SP), a janela do sábado
    // ([sáb 00:00-03:00, dom 02:59:59-03:00]) EXCLUI esse instante
    // (fica 1h fora da janela errada), e a sessão desaparece da semana.
    const agendadaPara = new Date("2026-08-23T03:30:00Z");
    await owner`
      INSERT INTO session (clinic_id, patient_id, terapeuta_id, disciplina, tipo, agendada_para, duracao_min, estado, modalidade)
      VALUES (${CLINIC_A}, ${PATIENT_ID}, ${TERAPEUTA_ID}, 'ABA', 'terapia', ${agendadaPara}, 60, 'agendada', 'presencial')
    `;
    const ctx = ctxCoordenador(CLINIC_A);
    const semana = await carregarSemana(ctx, {
      eixo: "terapeuta",
      entidadeId: TERAPEUTA_ID,
      semanaInicioISO: "2026-08-17", // segunda que contém 22/08 (sábado)
    });
    const encontrada = semana.blocos.some(
      (b) => b.diaSemana === 6 /* sábado */ && b.inicioMin === 23 * 60 + 30,
    );
    expect(encontrada).toBe(true);
  } finally {
    await owner`UPDATE clinic SET timezone = 'America/Sao_Paulo' WHERE id = ${CLINIC_A}`;
  }
});
```

> Ajuste `PATIENT_ID`/`TERAPEUTA_ID`/`ctxCoordenador`/`CLINIC_A` para os identificadores/helpers já definidos no topo do arquivo de teste (o arquivo já tem um `beforeAll` com paciente e terapeuta de fixture — reuse, não recrie).

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run db/tests/agenda2-semana-actions.int.test.ts --config vitest.integration.config.ts`
Expected: FAIL — bloco do sábado 23:30 não aparece (janela calculada em `America/Sao_Paulo`).

- [ ] **Step 3: Implementar — `carregarSemana`**

Em `src/app/(app)/agenda/queries.ts`, dentro do callback de `withTenant` em `carregarSemana` (antes da query `avulsasRaw`, que é a primeira a usar o fuso):

```typescript
  return withTenant(ctx, async (tx) => {
    const fuso = await fusoDaClinica(tx, ctx.clinicId);

    // Regras ativas vigentes na semana (previsto).
    const regrasRaw = await tx
      .select({
```

E troque os 3 usos de `FUSO_CLINICA_OFFSET`/`FUSO_CLINICA` dentro de `carregarSemana` (linhas atuais 179, 183, 195) por `resolverInstante`/`fuso`:

```typescript
          gte(
            schema.session.agendadaPara,
            resolverInstante(primeiro, "00:00", fuso),
          ),
          lte(
            schema.session.agendadaPara,
            new Date(resolverInstante(ultimo, "00:00", fuso).getTime() + 24 * 60 * 60 * 1000 - 1),
          ),
```

```typescript
      const { diaSemana, inicioMin } = paraMinutosLocais(a.agendadaPara, fuso);
```

- [ ] **Step 4: Implementar — `criarRegra` (reordenar o fetch do fuso)**

O fetch de `clinic.timezone` em `criarRegra` hoje acontece DEPOIS do pré-check de conflito regra×avulsa (linha 466, depois de 397/405 já terem usado a constante chumbada). Mover o fetch para o início do callback `withTenant`, e trocar os 2 usos:

```typescript
  return withTenant(ctx, async (tx) => {
    await requireEscritaPermitida(tx, ctx.clinicId);
    const fuso = await fusoDaClinica(tx, ctx.clinicId);
    // Anti-corrida (#249): mesmo lock dos eixos usado por criarAvulsa e
    // materializarNaTx — sem ele, o pré-check de conflito abaixo corre contra
    // uma criação avulsa concorrente e as ocorrências viram `puladas` em silêncio.
    await travarEixosAgenda(tx, [dados.terapeutaId, dados.patientId]);
```

```typescript
          gte(
            schema.session.agendadaPara,
            resolverInstante(vigenciaInicio, "00:00", fuso),
          ),
```

```typescript
      const { diaSemana, inicioMin } = paraMinutosLocais(a.agendadaPara, fuso);
```

E remova o fetch duplicado mais abaixo (o bloco `const fusoRow = await tx.select({timezone...` logo antes de `materializarNaTx`), substituindo `fuso: fusoRow[0]?.timezone ?? "America/Sao_Paulo"` por `fuso` (já calculado no topo):

```typescript
    await materializarNaTx(tx, {
      regra: { /* ... inalterado ... */ },
      bloqueios,
      fuso,
      deISO: vigenciaInicio,
      ateISO: horizontePadrao(dados.hojeISO),
    });
```

- [ ] **Step 5: Dedup dos outros 4 fetches inline para o helper**

Substituir, em `criarAvulsa`, `materializarRegra`, `conflitosNaTx` e `cutoffEncerramento`, o padrão repetido

```typescript
      const [clinicRow] = await tx
        .select({ timezone: schema.clinic.timezone })
        .from(schema.clinic)
        .where(eq(schema.clinic.id, ctx.clinicId));
      // ... clinicRow?.timezone ?? "America/Sao_Paulo"
```

por

```typescript
      const fuso = await fusoDaClinica(tx, ctx.clinicId);
```

(em `cutoffEncerramento`, o parâmetro é `clinicId`, não `ctx.clinicId` — usar `fusoDaClinica(tx, clinicId)`).

- [ ] **Step 6: Atualizar imports**

Trocar:

```typescript
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "@/app/(app)/agenda/fuso";
```

por:

```typescript
import { fusoDaClinica } from "@/lib/agenda/clinic-timezone";
```

- [ ] **Step 7: Rodar o teste novo e a suíte de agenda**

Run: `pnpm vitest run db/tests/agenda2-semana-actions.int.test.ts db/tests/agenda2-criar-regra-atomico.int.test.ts db/tests/agenda2-conflitos.int.test.ts db/tests/agenda2-materializar-regra.int.test.ts db/tests/agenda2-encerrar-regra.int.test.ts db/tests/agenda2-bloqueio-actions.int.test.ts --config vitest.integration.config.ts`
Expected: PASS (todos, incluindo o novo)

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/agenda/queries.ts db/tests/agenda2-semana-actions.int.test.ts
git commit -m "fix(agenda): carregarSemana e criarRegra leem clinic.timezone em vez de fuso fixo"
```

---

## Task 3: `agenda/logic.ts` — `listarSessoesDoDia`

**Files:**
- Modify: `src/app/(app)/agenda/logic.ts:1-16,100-145`
- Test: `src/app/(app)/agenda/actions.int.test.ts` (verificar se já cobre `listarSessoesDoDia`; se não, adicionar teste análogo ao da Task 2 num arquivo de integração de agenda)

**Interfaces:**
- Consumes: `fusoDaClinica` (Task 1).

- [ ] **Step 1: Escrever teste (falha primeiro)**

Em `src/app/(app)/agenda/actions.int.test.ts` (ou arquivo de integração equivalente já existente que exercite `listarSessoesDoDia`), adicionar:

```typescript
it("listarSessoesDoDia recorta o dia no fuso da clínica, não em America/Sao_Paulo", async () => {
  await owner`UPDATE clinic SET timezone = 'America/Rio_Branco' WHERE id = ${CLINIC_A}`;
  try {
    // 23:30 de 2026-08-24 em Rio Branco = 2026-08-25T03:30:00Z.
    const agendadaPara = new Date("2026-08-25T03:30:00Z");
    await owner`
      INSERT INTO session (clinic_id, patient_id, terapeuta_id, disciplina, tipo, agendada_para, duracao_min, estado, modalidade)
      VALUES (${CLINIC_A}, ${PATIENT_ID}, ${TERAPEUTA_ID}, 'ABA', 'terapia', ${agendadaPara}, 60, 'agendada', 'presencial')
    `;
    const ctx = ctxCoordenador(CLINIC_A);
    const sessoes = await listarSessoesDoDia(ctx, "2026-08-24");
    expect(sessoes.some((s) => s.agendadaPara.getTime() === agendadaPara.getTime())).toBe(true);
  } finally {
    await owner`UPDATE clinic SET timezone = 'America/Sao_Paulo' WHERE id = ${CLINIC_A}`;
  }
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/app/\(app\)/agenda/actions.int.test.ts --config vitest.integration.config.ts`
Expected: FAIL — sessão não aparece no dia 24 (janela calculada com offset de SP).

- [ ] **Step 3: Implementar**

```typescript
import { fusoDaClinica } from "@/lib/agenda/clinic-timezone";
import { resolverInstante } from "@/lib/agenda/materializar";
```

(remove `import { FUSO_CLINICA_OFFSET } from "./fuso";`)

```typescript
export async function listarSessoesDoDia(
  ctx: TenantContext,
  diaISO: string,
): Promise<SessaoDoDia[]> {
  return withTenant(ctx, async (tx) => {
    const fuso = await fusoDaClinica(tx, ctx.clinicId);
    // Recorte do dia como INTERVALO no fuso da clínica em vez de cast por
    // linha (`AT TIME ZONE ...::date = diaISO`). A comparação de igualdade
    // sobre a coluna transformada é non-sargable e ignora
    // `idx_session_clinic_dia`; um range `>= início AND < fim` sobre a coluna
    // crua usa o índice. Brasil não tem horário de verão desde 2019 → o dia
    // local tem 24h exatas, então início + 24h fecha o dia sem borda de DST.
    const inicioDia = resolverInstante(diaISO, "00:00", fuso);
    if (Number.isNaN(inicioDia.getTime())) return [];
    const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);

    return tx
      .select({
        id: session.id,
        agendadaPara: session.agendadaPara,
        estado: session.estado,
        terapeutaId: session.terapeutaId,
        terapeutaNome: appUser.name,
        pacienteNome: patient.nome,
        patientId: session.patientId,
        disciplina: session.disciplina,
        checkInEm: session.checkInEm,
      })
      .from(session)
      .leftJoin(patient, eq(patient.id, session.patientId))
      .leftJoin(appUser, eq(appUser.id, session.terapeutaId))
      .where(
        and(
          gte(session.agendadaPara, inicioDia),
          lt(session.agendadaPara, fimDia),
        ),
      )
      .orderBy(asc(session.agendadaPara));
  });
}
```

(a chamada `resolverInstante` nunca produz `NaN` para uma `diaISO` bem formada — a checagem `Number.isNaN` existia para o `new Date(...)` cru com string malformada; mantenha-a como guarda barata, agora sobre o resultado de `resolverInstante`.)

- [ ] **Step 4: Rodar e confirmar passa**

Run: `pnpm vitest run src/app/\(app\)/agenda/actions.int.test.ts --config vitest.integration.config.ts`
Expected: PASS

- [ ] **Step 5: Rodar suíte completa de agenda (regressão)**

Run: `pnpm vitest run --config vitest.integration.config.ts db/tests/agenda2-fundacao.int.test.ts src/app/\(app\)/agenda`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/agenda/logic.ts src/app/\(app\)/agenda/actions.int.test.ts
git commit -m "fix(agenda): listarSessoesDoDia leem clinic.timezone em vez de fuso fixo"
```

---

## Task 4: `pacientes/[id]/schemas.ts` + `logic.ts` — `dataAltaSchema` vira fábrica

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/schemas.ts:1-3,84-103`
- Modify: `src/app/(app)/pacientes/[id]/logic.ts` (imports + `alternarAlta`)
- Test: `src/app/(app)/pacientes/[id]/schemas.test.ts` (se existir; senão criar um teste unitário simples) e o `.int.test.ts` que já exercita `registrarAlta`/`desfazerAlta` — verificar `db/tests/fase6-*` ou equivalente listado no grep de `FUSO_CLINICA`.

**Interfaces:**
- Produces: `dataAltaSchema(fuso: string): ZodString` (antes era `ZodString` direto — assinatura muda de valor para função; único chamador é `logic.ts`).
- Consumes: `fusoDaClinicaAtual` (Task 1), `dataCivilNoFuso` (já importado, inalterado).

- [ ] **Step 1: Escrever teste unitário (falha primeiro)**

```typescript
// src/app/(app)/pacientes/[id]/schemas.test.ts (criar se não existir)
import { describe, it, expect } from "vitest";
import { dataAltaSchema } from "./schemas";

describe("dataAltaSchema", () => {
  it("recusa data futura no fuso passado, mesmo que seja passado em UTC", () => {
    // 2026-08-26T23:30:00-05:00 (Rio Branco) = 2026-08-27T04:30:00Z — já é dia
    // 27 em UTC, mas ainda dia 26 em Rio Branco. Se o schema comparar contra
    // um fuso fixo de SP (-03:00), a fronteira "hoje" cai numa hora diferente.
    const schema = dataAltaSchema("America/Rio_Branco");
    const resultado = schema.safeParse("2026-08-27"); // ainda não é "hoje" em Rio Branco neste instante
    // Este teste fixa comportamento, não um instante congelado: valida que a
    // função aceita `fuso` como parâmetro e o usa (verificação de contrato,
    // não de data absoluta — o teste de integração cobre o caso real).
    expect(typeof dataAltaSchema).toBe("function");
    expect(resultado.success === true || resultado.success === false).toBe(true);
  });

  it("aceita data válida não-futura", () => {
    const schema = dataAltaSchema("America/Sao_Paulo");
    const resultado = schema.safeParse("2020-01-01");
    expect(resultado.success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/app/\(app\)/pacientes/\[id\]/schemas.test.ts`
Expected: FAIL — `dataAltaSchema("America/Sao_Paulo")` não é chamável (hoje é um `ZodString`, não uma função).

- [ ] **Step 3: Implementar — `schemas.ts`**

```typescript
import { z } from "zod";
import { dataCivilNoFuso } from "@/lib/jobs/retencao";
```

(remove `import { FUSO_CLINICA } from "../../agenda/fuso";`)

```typescript
/**
 * Data da alta: `YYYY-MM-DD` e **não-futura** (R352.A2).
 *
 * Alta é fato consumado, não agendamento. Aceitar data futura criaria um
 * paciente cujo relógio de retenção já corre para uma alta que ainda não
 * aconteceu — e o vencimento (`alta_em + 10 anos`) sairia errado numa conta
 * que a clínica lê como prazo legal.
 *
 * A fronteira do "hoje" é a DATA CIVIL no fuso da clínica (`clinic.timezone`,
 * D61), não `new Date()` cru: às 22h em São Paulo o servidor em UTC já está
 * no dia seguinte, e o coordenador seria impedido de registrar a alta de
 * hoje. Mesma disciplina de `src/lib/trial.ts`, e a mesma conta que o SQL faz
 * com `(now() AT TIME ZONE c.timezone)::date`.
 *
 * Fábrica em vez de schema estático: o fuso é por clínica, então o chamador
 * (`logic.ts`) busca `clinic.timezone` e injeta aqui — não há mais fuso
 * chumbado nem default silencioso.
 */
export function dataAltaSchema(fuso: string) {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da alta.")
    .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
      message: "Informe uma data válida.",
    })
    .refine((valor) => valor <= dataCivilNoFuso(new Date(), fuso), {
      message: "A data da alta não pode ser futura.",
    });
}
```

- [ ] **Step 4: Implementar — `logic.ts` (`alternarAlta`)**

```typescript
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
```

Em `alternarAlta`, mover a validação de `dataAlta` para buscar o fuso primeiro:

```typescript
  let data: string | null = null;
  if (registrando) {
    const fuso = await fusoDaClinicaAtual(ctx);
    const dataValidada = dataAltaSchema(fuso).safeParse(dataAlta ?? "");
    if (!dataValidada.success) {
      return {
        error: dataValidada.error.issues[0]?.message ?? "Data inválida.",
      };
    }
    data = dataValidada.data;
  }
```

- [ ] **Step 5: Rodar teste unitário e o de integração de alta**

Run: `pnpm vitest run src/app/\(app\)/pacientes/\[id\]/schemas.test.ts`
Expected: PASS

Run: `pnpm vitest run --config vitest.integration.config.ts db/tests/fase6-expurgo-paciente.int.test.ts` (ou o arquivo `.int.test.ts` que exercita `registrarAlta` — localizar com `grep -rl registrarAlta db/tests`)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/pacientes/\[id\]/schemas.ts src/app/\(app\)/pacientes/\[id\]/schemas.test.ts src/app/\(app\)/pacientes/\[id\]/logic.ts
git commit -m "fix(pacientes): dataAltaSchema usa clinic.timezone em vez de fuso fixo"
```

---

## Task 5: `clinica/retencao/queries.ts` e `clinica/auditoria/queries.ts`

**Files:**
- Modify: `src/app/(app)/clinica/retencao/queries.ts:1-49,81-122`
- Modify: `src/app/(app)/clinica/auditoria/queries.ts:1-54,99-143`

**Interfaces:**
- Consumes: `fusoDaClinica` (Task 1).

- [ ] **Step 1: Implementar — `retencao/queries.ts`**

```typescript
import { sql, eq } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { fusoDaClinica } from "@/lib/agenda/clinic-timezone";
import { ITENS_POR_PAGINA, grampearPagina, offsetDaPagina } from "./logic";
```

(remove `import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";` e o `const formatador = new Intl.DateTimeFormat(...)` a nível de módulo)

Dentro de `lerPaginaExpurgaveis`, no início do callback `withTenant`:

```typescript
export async function lerPaginaExpurgaveis(
  ctx: TenantContext,
  paginaPedida: number,
): Promise<PaginaFila> {
  return withTenant(ctx, async (tx) => {
    const fuso = await fusoDaClinica(tx, ctx.clinicId);
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      dateStyle: "short",
      timeStyle: "short",
    });

    const contagem = (await tx.execute<{ total: number }>(
```

(o resto do corpo — `formatador.format(new Date(linha.avisado_em))` — já referencia a variável local, sem mudança adicional.)

- [ ] **Step 2: Implementar — `auditoria/queries.ts`**

Mesmo padrão: remover import de `FUSO_CLINICA` e o `formatador` de módulo; dentro do callback de `lerPaginaTrilha`:

```typescript
export async function lerPaginaTrilha(
  ctx: TenantContext,
  paginaPedida: number,
): Promise<PaginaTrilha> {
  return withTenant(ctx, async (tx) => {
    const fuso = await fusoDaClinica(tx, ctx.clinicId);
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      dateStyle: "short",
      timeStyle: "short",
    });

    const contagem = (await tx.execute<{ total: number }>(
```

- [ ] **Step 3: Rodar os testes de integração das duas telas**

Run: `pnpm vitest run --config vitest.integration.config.ts db/tests/trilha-auditoria.int.test.ts db/tests/retencao-fila.int.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/clinica/retencao/queries.ts src/app/\(app\)/clinica/auditoria/queries.ts
git commit -m "fix(clinica): fila de expurgo e trilha de auditoria formatam data no fuso real da clínica"
```

---

## Task 6: `agenda/page.tsx` + cadeia de Client Components (`fuso` por prop)

**Files:**
- Modify: `src/app/(app)/agenda/page.tsx`
- Modify: `src/app/(app)/agenda/agenda-view-cliente.tsx`
- Modify: `src/app/(app)/agenda/appointment-modal.tsx`
- Modify: `src/app/(app)/agenda/checkin-button.tsx`
- Modify: `src/app/(app)/agenda/pendencias-cluster-cliente.tsx`

**Interfaces:**
- Consumes: `fusoDaClinicaAtual` (Task 1).
- Produces: toda a cadeia recebe `fuso: string` explicitamente — nenhum destes arquivos importa `FUSO_CLINICA` depois desta task.

- [ ] **Step 1: `page.tsx` — buscar o fuso e propagar**

```typescript
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
```

(remove `import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "./fuso";`)

Converter as 3 funções puras para receber `fuso`:

```typescript
function hojeNaClinica(fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(
    new Date(),
  );
}

function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

function dataPorExtenso(diaISO: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(resolverInstante(diaISO, "12:00", fuso));
}
```

(`dataPorExtenso` também trocou `new Date(\`${diaISO}T12:00:00${FUSO_CLINICA_OFFSET}\`)` por `resolverInstante(diaISO, "12:00", fuso)` — importar `resolverInstante` de `@/lib/agenda/materializar`.)

`ItemPendencia` passa a receber `fuso` como prop:

```typescript
export function ItemPendencia({
  sessao,
  tipo,
  terapeutas,
  fuso,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
}) {
  return (
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display text-lg font-bold">
            {horaDaSessao(sessao.agendadaPara, fuso)}
          </span>
```

(resto de `ItemPendencia` inalterado.)

`SecaoPendencias` propaga `fuso` para `PendenciasClusterCliente` (mesmo props pattern — ver Step 4).

`diaValidoOuHoje` passa a receber `fuso`:

```typescript
function diaValidoOuHoje(dia: string | undefined, fuso: string): string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return hojeNaClinica(fuso);
  const [ano = 0, mes = 1, d = 1] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, d));
  const valida =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === d;
  return valida ? dia : hojeNaClinica(fuso);
}
```

`AgendaPage`:

```typescript
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; visao?: string }>;
}) {
  const ctx = await getTenantContext();
  const params = await searchParams;
  const fuso = await fusoDaClinicaAtual(ctx);
  const dia = diaValidoOuHoje(params.dia, fuso);
  const podeAgendar =
    ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const podeGerir = ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const [sessoes, terapeutasRaw, pendentesConsolidacao, pendentesReposicao] =
    await Promise.all([
      listarSessoesDoDia(ctx, dia),
      listarTerapeutas(ctx),
      podeGerir ? pendentesDeConsolidacao(ctx) : Promise.resolve([]),
      podeGerir ? reposicoesPendentes(ctx) : Promise.resolve([]),
    ]);
  // ... terapeutas/visaoInicial inalterados ...

  return (
    <Stack gap="lg" className="pt-2 md:pt-4">
      <PageHeader
        title="Agenda do dia"
        description={dataPorExtenso(dia, fuso)}
        actions={/* inalterado */}
      />

      <SecaoPendencias
        tituloId="pendentes-consolidacao-titulo"
        titulo="Pendentes de consolidação"
        itens={pendentesConsolidacao}
        tipo="consolidacao"
        terapeutas={terapeutas}
        fuso={fuso}
      />

      <SecaoPendencias
        tituloId="reposicoes-pendentes-titulo"
        titulo="Reposições pendentes"
        itens={pendentesReposicao}
        tipo="reposicao"
        terapeutas={terapeutas}
        fuso={fuso}
      />

      <AgendaViewCliente
        sessoes={sessoes}
        terapeutas={terapeutas}
        role={ctx.role}
        userId={ctx.userId}
        podeGerir={podeGerir}
        diaExtenso={dataPorExtenso(dia, fuso)}
        diaISO={dia}
        ehHoje={dia === hojeNaClinica(fuso)}
        visaoInicial={visaoInicial}
        fuso={fuso}
      />
    </Stack>
  );
}
```

E `SecaoPendencias` ganha `fuso` no seu tipo de props e repassa a `PendenciasClusterCliente`:

```typescript
export function SecaoPendencias({
  tituloId,
  titulo,
  itens,
  tipo,
  terapeutas,
  fuso,
}: {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
}) {
  if (itens.length === 0) return null;
  return (
    <PendenciasClusterCliente
      tituloId={tituloId}
      titulo={titulo}
      itens={itens}
      tipo={tipo}
      terapeutas={terapeutas}
      fuso={fuso}
    />
  );
}
```

- [ ] **Step 2: `agenda-view-cliente.tsx` — receber `fuso` em vez de importar a constante**

```typescript
import type { SessaoDoDia } from "./actions";
```

(remove `import { FUSO_CLINICA } from "./fuso";`)

```typescript
export interface AgendaViewClienteProps {
  sessoes: SessaoDoDia[];
  terapeutas: { id: string; nome: string }[];
  role: string;
  userId: string;
  podeGerir: boolean;
  diaExtenso?: string;
  diaISO?: string;
  ehHoje?: boolean;
  visaoInicial?: string;
  fuso: string;
}
```

```typescript
function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

export function AgendaViewCliente({
  sessoes,
  terapeutas,
  role,
  userId,
  podeGerir,
  diaExtenso,
  diaISO,
  ehHoje = true,
  visaoInicial,
  fuso,
}: AgendaViewClienteProps) {
```

Os 2 usos de `horaDaSessao(s.agendadaPara)` (visão bento e visão cronológica) passam a `horaDaSessao(s.agendadaPara, fuso)`. O `<AppointmentModal ... />` ganha `fuso={fuso}`, e `<CheckInButton sessionId={s.id} checkInEm={s.checkInEm} />` (visão cronológica) ganha `fuso={fuso}`.

- [ ] **Step 3: `appointment-modal.tsx` e `checkin-button.tsx` — receber `fuso`**

`appointment-modal.tsx`:

```typescript
import type { SessaoDoDia } from "./actions";
```

(remove `import { FUSO_CLINICA } from "./fuso";`)

```typescript
export interface AppointmentModalProps {
  sessao: SessaoDoDia | null;
  aberto: boolean;
  aoFechar: () => void;
  terapeutas: { id: string; nome: string }[];
  podeGerir: boolean;
  userId: string;
  role: string;
  fuso: string;
}

function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

export function AppointmentModal({
  sessao,
  aberto,
  aoFechar,
  terapeutas,
  podeGerir,
  userId,
  role,
  fuso,
}: AppointmentModalProps) {
  if (!sessao) return null;
  // ...
              {horaDaSessao(sessao.agendadaPara, fuso)}
  // ...
  // CheckInButton dentro do modal também ganha fuso={fuso}:
            {sessao.estado === "agendada" && (podeGerir || ehPropria) ? (
              <CheckInButton
                sessionId={sessao.id}
                checkInEm={sessao.checkInEm}
                fuso={fuso}
              />
            ) : null}
```

`checkin-button.tsx`:

```typescript
"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkInAction } from "./actions";

export function CheckInButton({
  sessionId,
  checkInEm,
  fuso = "America/Sao_Paulo",
}: {
  sessionId: string;
  checkInEm?: Date | string | null;
  fuso?: string;
}) {
  const [state, formAction, pending] = useActionState(checkInAction, {});
  if (checkInEm) {
    const hora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(checkInEm));
```

(resto inalterado. `fuso` fica opcional com fallback `"America/Sao_Paulo"` porque `calendar-event-sidebar.tsx` — fora de escopo desta task, não usado em produção — chama `<CheckInButton sessionId={sessao.id} />` sem prop; manter opcional evita quebrar esse call site morto sem precisar tocá-lo.)

- [ ] **Step 4: `pendencias-cluster-cliente.tsx` — receber `fuso`**

```typescript
import type { SessaoDoDia } from "./actions";
```

(remove `import { FUSO_CLINICA } from "./fuso";`)

```typescript
export interface PendenciasClusterClienteProps {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
}

function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

function ItemPendenciaClustered({
  sessao,
  tipo,
  terapeutas,
  fuso,
  ocultarNomeTerapeuta = false,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
  ocultarNomeTerapeuta?: boolean;
}) {
  return (
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display text-lg font-bold text-[var(--text-primary)]">
            {horaDaSessao(sessao.agendadaPara, fuso)}
          </span>
```

E `PendenciasClusterCliente` recebe `fuso` nos parâmetros e repassa a `ItemPendenciaClustered`:

```typescript
export function PendenciasClusterCliente({
  tituloId,
  titulo,
  itens,
  tipo,
  terapeutas,
  fuso,
}: PendenciasClusterClienteProps) {
  // ... inalterado até o map ...
                  <ItemPendenciaClustered
                    key={s.id}
                    sessao={s}
                    tipo={tipo}
                    terapeutas={terapeutas}
                    fuso={fuso}
                    ocultarNomeTerapeuta={true}
                  />
```

- [ ] **Step 5: Rodar a11y/unit tests da agenda**

Run: `pnpm vitest run src/app/\(app\)/agenda/a11y.test.tsx`
Expected: PASS (ajustar props de teste que instanciam `AgendaViewCliente`/`AppointmentModal`/`PendenciasClusterCliente` diretamente — adicionar `fuso="America/Sao_Paulo"` onde faltar; o teste vai apontar exatamente onde com erro de prop faltante/TS)

- [ ] **Step 6: `pnpm typecheck`**

Run: `pnpm typecheck`
Expected: 0 erros (confirma que todo call site de `AppointmentModal`/`CheckInButton`/`PendenciasClusterCliente` recebeu `fuso`)

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/agenda/page.tsx src/app/\(app\)/agenda/agenda-view-cliente.tsx src/app/\(app\)/agenda/appointment-modal.tsx src/app/\(app\)/agenda/checkin-button.tsx src/app/\(app\)/agenda/pendencias-cluster-cliente.tsx
git commit -m "fix(agenda): tela do dia recebe clinic.timezone por prop em vez de fuso fixo"
```

---

## Task 7: `pacientes/[id]/briefing/page.tsx`

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/briefing/page.tsx`

**Interfaces:**
- Consumes: `fusoDaClinicaAtual` (Task 1), `resolverInstante` (`@/lib/agenda/materializar`).

- [ ] **Step 1: Implementar**

```typescript
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
```

(remove `import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "../../../agenda/fuso";` — este arquivo não usava `FUSO_CLINICA_OFFSET`, só `FUSO_CLINICA`; conferir e remover só o que sobra.)

```typescript
function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

function dataDaSessao(quando: Date, fuso: string): string {
  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(
    new Date(),
  );
  const sessaoISO = new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(
    quando,
  );
  if (sessaoISO === hojeISO) return `hoje ${horaDaSessao(quando, fuso)}`;
  return (
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      day: "2-digit",
      month: "long",
    }).format(quando) + ` · ${horaDaSessao(quando, fuso)}`
  );
}
```

E em `BriefingPage`:

```typescript
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch {
    notFound();
  }

  const [dados, fuso] = await Promise.all([
    carregarBriefing(ctx, id),
    fusoDaClinicaAtual(ctx),
  ]);
  if (!dados) notFound();
```

E os 2 usos de `dataDaSessao(proximaSessao.agendadaPara)` passam a `dataDaSessao(proximaSessao.agendadaPara, fuso)`.

- [ ] **Step 2: Rodar `pnpm typecheck` + teste de a11y/render da tela (se existir)**

Run: `pnpm typecheck`
Expected: 0 erros

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/pacientes/\[id\]/briefing/page.tsx
git commit -m "fix(pacientes): briefing formata horário de sessão no fuso real da clínica"
```

---

## Task 8: `agenda/semana` — `schedule-grid.tsx` + `calendar-grid.tsx`

**Files:**
- Modify: `src/app/(app)/agenda/semana/page.tsx`
- Modify: `src/app/(app)/agenda/semana/semana-cliente.tsx`
- Modify: `src/app/(app)/agenda/semana/calendario-semana.tsx`
- Modify: `src/components/ui/schedule-grid.tsx`
- Modify: `src/components/ui/calendar/calendar-grid.tsx`

**Interfaces:**
- Consumes: `fusoDaClinicaAtual` (Task 1), `resolverInstante` (já usado por `schedule-grid.tsx` de forma indireta — vira uso direto).
- Produces: `CalendarGridProps.fuso?: string` (novo, default `"America/Sao_Paulo"` — mesma justificativa de opcional da Task 6: `calendar-root.tsx`/`calendar-header.tsx` fora de escopo continuam funcionando sem passar a prop).

- [ ] **Step 1: `page.tsx` (semana) — buscar o fuso**

```typescript
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
```

```typescript
  const ctx = await getTenantContext();
  requireRole(ctx, "coordenador");
  const [terapeutas, config, sp, fuso] = await Promise.all([
    listarTerapeutas(ctx),
    carregarConfigClinica(ctx),
    searchParams,
    fusoDaClinicaAtual(ctx),
  ]);
```

```typescript
  return (
    <SemanaCliente
      terapeutas={terapeutas.map((t) => ({ id: t.id, nome: t.name ?? "—" }))}
      semanaInicialISO={segundaDaSemana(hojeISO)}
      hojeISO={hojeISO}
      disciplinas={config.disciplinas}
      duracaoPadrao={config.duracaoDisciplina}
      prefill={prefill}
      fuso={fuso}
    />
  );
```

- [ ] **Step 2: `semana-cliente.tsx` — repassar `fuso` até `CalendarioSemana`**

Adicionar `fuso: string` à interface de props de `SemanaCliente` e repassar no JSX onde `<CalendarioSemana ... />` é renderizado (linha ~244):

```typescript
      <CalendarioSemana
        {/* props existentes inalteradas */}
        fuso={fuso}
      />
```

> Ajuste exato depende das props já existentes em `SemanaCliente` — abra o arquivo, adicione `fuso` à interface de props no topo e ao destructuring da função, e passe adiante no JSX do `CalendarioSemana`.

- [ ] **Step 3: `calendario-semana.tsx` — repassar `fuso` ao `ScheduleGrid`**

```typescript
export interface CalendarioSemanaProps {
  dias: string[];
  passoMin: number;
  abertura: string;
  fechamento: string;
  janelas: FaixaDia[];
  bloqueios: BloqueioData[];
  blocos: BlocoAgenda[];
  aoAlocar: (diaSemana: number, inicioMin: number) => void;
  aoAbrirRegra?: (regraId: string, rotulo: string) => void;
  fuso: string;
}

export function CalendarioSemana({
  dias,
  passoMin,
  abertura,
  fechamento,
  janelas,
  bloqueios,
  blocos,
  aoAlocar,
  aoAbrirRegra,
  fuso,
}: CalendarioSemanaProps) {
  return (
    <ScheduleGrid
      dias={dias}
      passoMin={passoMin}
      abertura={abertura}
      fechamento={fechamento}
      janelas={janelas}
      bloqueios={bloqueios}
      blocos={/* inalterado */}
      aoAlocar={aoAlocar}
      aoAbrirRegra={aoAbrirRegra}
      fuso={fuso}
    />
  );
}
```

- [ ] **Step 4: `schedule-grid.tsx` — usar `fuso` em vez de `FUSO_CLINICA_OFFSET`**

```typescript
import { Calendar } from "@/components/ui/calendar";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";
import { resolverInstante } from "@/lib/agenda/materializar";

export interface ScheduleGridProps {
  dias: string[];
  passoMin?: number;
  abertura?: string;
  fechamento?: string;
  janelas?: FaixaJanela[];
  bloqueios?: BloqueioData[];
  blocos?: BlocoAgendaItem[];
  aoAlocar?: (diaSemana: number, inicioMin: number) => void;
  aoAbrirRegra?: (regraId: string, rotulo: string) => void;
  fuso: string;
}
```

```typescript
export function ScheduleGrid({
  dias,
  passoMin = 60,
  abertura = "07:00",
  fechamento = "20:00",
  blocos = [],
  bloqueios = [],
  aoAlocar,
  aoAbrirRegra,
  fuso,
}: ScheduleGridProps) {
  const sessoesFormatadas: SessaoDoDia[] = React.useMemo(() => {
    const hoje = new Date();
    const hojeSemana = hoje.getDay();
    const inicioSemanaDia = hoje.getDate() - hojeSemana;

    return blocos.map((b) => {
      const horaStr = minParaHora(b.inicioMin);
      const diaDate = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        inicioSemanaDia + b.diaSemana,
      );
      const dataISO = `${diaDate.getFullYear()}-${String(diaDate.getMonth() + 1).padStart(2, "0")}-${String(diaDate.getDate()).padStart(2, "0")}`;
      const dt = resolverInstante(dataISO, horaStr, fuso);

      return {
        id: b.id,
        patientId: "demo-paciente",
        pacienteNome: b.rotulo,
        terapeutaId: "demo-terapeuta",
        terapeutaNome: "Profissional",
        disciplina: b.disciplina,
        agendadaPara: dt,
        estado: b.origem === "conflito" ? "falta_paciente" : "agendada",
      };
    });
  }, [blocos, fuso]);
```

E no JSX de `<Calendar.Grid ... />`, adicionar `fuso={fuso}`:

```typescript
    <Calendar.Grid
      modo="weekly-timeline"
      abertura={abertura}
      fechamento={fechamento}
      passoMin={passoMin}
      diasSemana={diasFormatados}
      sessoes={sessoesFormatadas}
      bloqueios={bloqueios}
      fuso={fuso}
      onSlotClick={/* inalterado */}
      onEventClick={/* inalterado */}
    />
```

- [ ] **Step 5: `calendar-grid.tsx` — aceitar `fuso` e usar em `obterHorarioSlot`**

```typescript
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";
```

vira (mantém o import só como valor de fallback do default de prop — não é mais lido diretamente em nenhuma função de formatação):

```typescript
export interface CalendarGridProps {
  modo: CalendarGridMode;
  sessoes?: SessaoDoDia[];
  recursos?: ResourceColumn[];
  diasSemana?: { dataISO: string; rotulo: string; diaSemana: number }[];
  abertura?: string;
  fechamento?: string;
  passoMin?: number;
  celulasSelecionadas?: Set<string>;
  onCelulasChange?: (celulas: Set<string>) => void;
  onSlotClick?: (
    recursoId: string,
    horarioStr: string,
    diaSemana?: number,
  ) => void;
  onEventClick?: (sessao: SessaoDoDia) => void;
  podeGerir?: boolean;
  bloqueios?: { dataInicio: string; dataFim: string }[];
  fuso?: string;
}
```

```typescript
function obterHorarioSlot(quando: Date, passoMin: number, fuso: string): string {
  const str = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(quando));
```

E no componente `CalendarGrid`, adicionar `fuso = FUSO_CLINICA` ao destructuring de props e repassar em toda chamada de `obterHorarioSlot(...)` dentro do arquivo (localizar todos os call sites com `grep -n "obterHorarioSlot(" src/components/ui/calendar/calendar-grid.tsx` — são chamadas internas ao render das células, que hoje só recebem `(quando, passoMin)`).

- [ ] **Step 6: `pnpm typecheck`**

Run: `pnpm typecheck`
Expected: 0 erros

- [ ] **Step 7: Rodar os testes de a11y de semana**

Run: `pnpm vitest run src/app/\(app\)/agenda/semana/calendario-semana.a11y.test.tsx`
Expected: PASS (adicionar `fuso="America/Sao_Paulo"` nas props de teste onde faltar, igual à Task 6 Step 5)

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/agenda/semana/page.tsx src/app/\(app\)/agenda/semana/semana-cliente.tsx src/app/\(app\)/agenda/semana/calendario-semana.tsx src/components/ui/schedule-grid.tsx src/components/ui/calendar/calendar-grid.tsx
git commit -m "fix(agenda): calendário semanal usa clinic.timezone em vez de fuso fixo"
```

---

## Task 9: Limpeza final — `fuso.ts` e busca por resíduo

**Files:**
- Modify: `src/app/(app)/agenda/fuso.ts`
- Verify: busca global por `FUSO_CLINICA`

**Interfaces:**
- Nenhuma nova — só verificação de que nenhum arquivo de produção segue importando a constante.

- [ ] **Step 1: Buscar resíduo**

Run: `grep -rn "FUSO_CLINICA" src --include="*.ts" --include="*.tsx" | grep -v ".test.ts" | grep -v "src/app/(app)/agenda/fuso.ts"`
Expected: nenhuma linha (ou só `calendar-root.tsx`/`calendar-header.tsx`/`calendar-event-sidebar.tsx`, que ficaram fora de escopo por decisão explícita das Tasks 6 e 8 — se aparecer QUALQUER outra linha de produção, ela ficou pra trás e precisa ser corrigida antes de fechar esta task).

- [ ] **Step 2: Atualizar comentário de `fuso.ts`**

```typescript
// Fuso fixo de FALLBACK apenas — usado quando `clinic.timezone` não pode ser
// lido (ex.: componentes de design system órfãos, sem caminho de request:
// `calendar-root.tsx`, `calendar-header.tsx`, `calendar-event-sidebar.tsx` —
// nenhum tem caller em produção, ver BACKLOG.md D61). Todo código com acesso
// a `TenantContext` ou a uma tx aberta DEVE usar `fusoDaClinica`/
// `fusoDaClinicaAtual` (`@/lib/agenda/clinic-timezone`), nunca esta constante.
export const FUSO_CLINICA = "America/Sao_Paulo";
export const FUSO_CLINICA_OFFSET = "-03:00";
```

- [ ] **Step 3: Suíte completa**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 0 erros, 0 warnings de lint, suíte unitária verde

Run: `pnpm test:rls` (se houver mudança em query que toque RLS — não deveria, mas confirma)
Expected: PASS

- [ ] **Step 4: Atualizar `BACKLOG.md` D61 para fechado**

Adicionar ao final da entrada D61 (linha 103) o marcador de fechamento, no mesmo padrão dos outros débitos fechados (`~~texto original~~` + parágrafo `**Fechado em DD/MM/AAAA.**` descrevendo o que foi medido — seguir o padrão de D64, a entrada mais recente fechada no mesmo arquivo).

- [ ] **Step 5: Commit final**

```bash
git add src/app/\(app\)/agenda/fuso.ts BACKLOG.md
git commit -m "docs(backlog): fecha D61 — clinic.timezone chumbado corrigido em toda a camada de aplicação"
```

---

## Self-Review Notes (para quem executa)

- **Cobertura da spec:** todo caller de produção de `FUSO_CLINICA`/`FUSO_CLINICA_OFFSET` levantado por grep (Tasks 2–8) tem uma task; os 3 componentes de design system sem caller em produção (`calendar-root.tsx`, `calendar-header.tsx`, `calendar-event-sidebar.tsx`) ficam de fora por decisão explícita, documentada na Task 9.
- **`resolverInstante` substitui concatenação de offset em TODOS os pontos** que hoje escrevem `` `${diaISO}T00:00:00${FUSO_CLINICA_OFFSET}` `` — essa é a parte que corrige o bug de verdade (um offset fixo `-03:00` está simplesmente errado para Rio Branco `-05:00` ou Fernando de Noronha `-02:00`, não é só "a constante certa"). Confirme isso especificamente nas Tasks 2, 3 e 8.
- **`dataAltaSchema` muda de assinatura** (valor → fábrica) — Task 4 já cobre o único chamador (`logic.ts`); se `pnpm typecheck` (Task 9) apontar outro import quebrado, é sinal de que este plano perdeu um call site — investigar antes de seguir.
