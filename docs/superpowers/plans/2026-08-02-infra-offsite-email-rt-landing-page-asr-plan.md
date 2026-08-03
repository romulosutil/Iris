# Resiliência de E-mail RT & ASR Plan (#154, #72)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o canal de e-mail do RT resiliente a erros transitórios com retentativa limitada, e estruturar o ditado de voz sob feature flag travada em `false`.

**Architecture:** Retentativa transitório-vs-permanente com teto de 3 tentativas em `scripts/escalonamento-risco.mjs` + `scripts/lib/resend-rt.mjs`, gravada via nova migração sobre `alerta_risco_clinico`; `AudioCapture` desacoplado por `AsrProvider` com `StubAsrProvider` interino, gating por feature flag, seleção de codec e IndexedDB com purga no logout.

> **Nota (02/08/2026):** Task "Central de Segurança `/seguranca`" (Issue #114) removida — rota não existe, landing pronta fora deste escopo. Task "Prova de Decifração de Backup Off-Site" (Issue #105) **removida** — servidor considerado seguro dentro do aceitável por ora, backup offsite não é prioridade agora; retomar como plano separado quando virar prioridade. Endereço de e-mail do RT vem de redirecionamento configurado no Cloudflare sobre domínio próprio (fora do código deste repo) — nenhuma task de código muda por causa disso, `rtEmail` já é parâmetro configurável.

**Tech Stack:** Next.js 16, Tailwind CSS v4, Docker Compose, PostgreSQL, Drizzle ORM, Resend API, Web MediaRecorder, IndexedDB, Playwright + `@axe-core/playwright`, Vitest.

## Global Constraints

- Motor de escalonamento (`scripts/escalonamento-risco.mjs`) é rede-restrito: nenhuma saída além do Postgres. Retentativa de e-mail RT continua indo só via Resend, sem novo canal (§4.2.1 / parecer #110).
- `alerta_risco_clinico.canais_notificados` (jsonb, append-only por marcador) é o padrão já estabelecido para trilha de notificação — qualquer novo estado usa o mesmo padrão, não uma coluna paralela solta.
- Nenhum e-mail/log de escalonamento carrega paciente, categoria ou trecho clínico (regra de ouro §4.2.1) — vale para qualquer novo marcador ou detalhe de retry.
- `FEATURE_FLAG_ASR_ENABLED` fica travada em `false` neste plano — nenhum step deste plano a liga em produção.
- Toda alteração de schema/função SQL entra como migração nova (`pnpm db:generate` + revisão manual do SQL gerado); nunca editar migração já commitada (`db/migrations/0056_alerta_risco_email_rt.sql` fica intocado).
- Acessibilidade é compromisso de 1ª classe do produto (não é só AA de legibilidade) — vale pra qualquer UI nova deste plano (componentes de `AudioCapture`), mesmo sem task dedicada de axe.

---

## Mapeamento de Arquivos

- **Resiliência RT:** `scripts/escalonamento-risco.mjs`, `scripts/lib/resend-rt.mjs`, `scripts/escalonamento-risco.test.mjs`, `scripts/lib/resend-rt.test.mjs`, `db/migrations/0064_alerta_risco_email_rt_retry.sql`
- **Voz & ASR:** `src/components/audio/AudioCapture.tsx`, `src/components/audio/AudioCapture.test.tsx`, `src/lib/asr/provider.ts`, `src/lib/asr/audio-drafts.ts`, `src/lib/asr/audio-drafts.test.ts`, `src/app/(app)/layout.tsx` (hook de purga no logout)

---

## Tarefas de Implementação

### Task 1: Robustez no Canal de E-mail do RT (Issue #154)

**Files:**
- Modify: `scripts/escalonamento-risco.mjs` (loop de disparo em `varrer()`)
- Modify: `scripts/lib/resend-rt.mjs` (classificação transitório vs permanente)
- Modify: `scripts/escalonamento-risco.test.mjs` (retentativa/teto)
- Create: `scripts/lib/resend-rt.test.mjs`
- Create: `db/migrations/0064_alerta_risco_email_rt_retry.sql`

**Interfaces:**
- Consumes: `app_registrar_email_rt(uuid, boolean, text)` existente (migração 0056), `enviarEmailRt({apiKey, fromEmail, appUrl, rtEmail})` existente
- Produces: `app_registrar_email_rt(uuid, boolean, boolean, text)` (novo parâmetro `p_transitorio`), `enviarEmailRt(...)` retorna `{ok, transitorio, providerMessageId?, erro?}`, coluna `email_rt_tentativas` em `alerta_risco_clinico`

**Regras Levantadas:**
1. Tratar HTTP 429/5xx do provedor como transitório: grava marcador `email_responsavel_tecnico_adiado`, teto de 3 retentativas antes de desistir e marcar falha permanente.
2. Cada alerta do laço de varredura é isolado com `try/catch` individual — um alerta com erro não pode derrubar a varredura inteira nem impedir os demais de serem processados.
3. Filtro `AND deletado_em IS NULL` — **já implementado** em `app_rt_do_alerta` e `app_alertas_estagio2_sem_email` (migração 0056); nenhum trabalho pendente aqui, só confirmar no Step 5.

**Estado atual (verificado no código real, não no plano anterior):** `varrer()` em `scripts/escalonamento-risco.mjs` chama `processarEmailRt` dentro de dois laços `for` **sem** `try/catch` por item — uma falha lançada por qualquer chamada interrompe a varredura inteira, silenciando os alertas restantes. `enviarEmailRt` trata qualquer erro do Resend como falha permanente — não existe retentativa nem distinção 429/5xx.

- [ ] **Step 1: Escrever teste falho de classificação transitório vs permanente**

File: `scripts/lib/resend-rt.test.mjs`
```javascript
import { afterEach, describe, expect, test, vi } from "vitest";
import { enviarEmailRt } from "./resend-rt.mjs";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn() },
  })),
}));

describe("enviarEmailRt — classificação transitório vs permanente (#154)", () => {
  afterEach(() => vi.clearAllMocks());

  test("rate_limit_exceeded é transitório", async () => {
    const { Resend } = await import("resend");
    Resend.mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "rate_limit_exceeded", message: "too many requests" },
        }),
      },
    }));
    const resultado = await enviarEmailRt({
      apiKey: "re_teste",
      fromEmail: "a@b.com",
      appUrl: "https://app.example.com",
      rtEmail: "rt@clinica.example",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(true);
  });

  test("validation_error é permanente", async () => {
    const { Resend } = await import("resend");
    Resend.mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "validation_error", message: "invalid `to` field" },
        }),
      },
    }));
    const resultado = await enviarEmailRt({
      apiKey: "re_teste",
      fromEmail: "a@b.com",
      appUrl: "https://app.example.com",
      rtEmail: "rt-invalido",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(false);
  });

  test("exceção de rede (fetch falhou) é transitório", async () => {
    const { Resend } = await import("resend");
    Resend.mockImplementation(() => ({
      emails: { send: vi.fn().mockRejectedValue(new Error("fetch failed")) },
    }));
    const resultado = await enviarEmailRt({
      apiKey: "re_teste",
      fromEmail: "a@b.com",
      appUrl: "https://app.example.com",
      rtEmail: "rt@clinica.example",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.transitorio).toBe(true);
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `pnpm test scripts/lib/resend-rt.test.mjs`
Expected: FAIL — `resultado.transitorio` é `undefined` (propriedade não existe ainda).

- [ ] **Step 3: Implementar classificação em `resend-rt.mjs`**

File: `scripts/lib/resend-rt.mjs` (adicionar antes de `enviarEmailRt`, exportar, e usar no corpo)
```javascript
// Nomes de erro documentados pela Resend (https://resend.com/docs/api-reference/errors).
// Transitório = vale a pena tentar de novo sem intervenção humana. Qualquer
// exceção de rede/timeout (catch do try abaixo) também conta como transitório
// — o provedor pode ter processado ou não, e assumir "permanente" descartaria
// e-mails que só precisavam de retry.
const ERROS_TRANSITORIOS = new Set([
  "rate_limit_exceeded",
  "internal_server_error",
  "application_error",
  "concurrent_idempotency_conflict",
]);

export function classificarErroResend(nomeErro) {
  return ERROS_TRANSITORIOS.has(nomeErro);
}
```

Alterar `enviarEmailRt` para retornar `transitorio`:
```javascript
    if (error) {
      return {
        ok: false,
        transitorio: classificarErroResend(error.name),
        erro: error.message ?? "erro desconhecido do provedor",
      };
    }
    return { ok: true, providerMessageId: data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      transitorio: true,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
```

Os dois `return { ok: false, ... }` de guarda no topo da função (sem `apiKey` / sem `appUrl`) continuam sem `transitorio` — são configuração ausente, não erro de rede; ficam `transitorio: false` (adicionar o campo explicitamente nesses dois retornos também, para o shape ser consistente em toda função).

- [ ] **Step 4: Executar teste de classificação**

Run: `pnpm test scripts/lib/resend-rt.test.mjs`
Expected: PASS.

- [ ] **Step 5: Escrever migração 0064 — coluna de tentativas + função com retentativa**

File: `db/migrations/0064_alerta_risco_email_rt_retry.sql`

Rodar `pnpm db:generate` primeiro para obter o esqueleto (Drizzle detecta a nova coluna se ela for adicionada ao schema no Step 6); revisar o SQL gerado e completar a função manualmente, seguindo o padrão de `0056_alerta_risco_email_rt.sql`:

```sql
-- #154 — retentativa limitada do e-mail ao RT: distingue falha transitória
-- (429/5xx do provedor) de falha permanente, com teto de 3 tentativas antes
-- de desistir. `deletado_em IS NULL` já está em app_rt_do_alerta e
-- app_alertas_estagio2_sem_email desde a 0056 — não repetido aqui.
--> statement-breakpoint

ALTER TABLE alerta_risco_clinico
  ADD COLUMN email_rt_tentativas integer NOT NULL DEFAULT 0;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_registrar_email_rt(
  p_alerta      uuid,
  p_sucesso     boolean,
  p_transitorio boolean,
  p_detalhe     text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic     uuid;
  v_tentativas int;
  v_marcador   text;
BEGIN
  SELECT clinic_id, email_rt_tentativas INTO v_clinic, v_tentativas
    FROM alerta_risco_clinico WHERE id = p_alerta;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'app_registrar_email_rt: alerta inexistente';
  END IF;

  IF p_sucesso THEN
    v_marcador := 'email_responsavel_tecnico_enviado';
  ELSIF p_transitorio AND v_tentativas < 2 THEN
    -- 3ª tentativa (v_tentativas chega a 2 = já tentou 3x) ainda não
    -- estourou o teto: adia, incrementa contador, tenta de novo na próxima
    -- varredura (reconciliação já cobre isso via app_alertas_estagio2_sem_email).
    v_marcador := 'email_responsavel_tecnico_adiado';
  ELSE
    -- Permanente, ou transitório que já estourou o teto de 3 tentativas.
    v_marcador := 'email_responsavel_tecnico_falhou';
  END IF;

  UPDATE alerta_risco_clinico
     SET canais_notificados = canais_notificados || to_jsonb(v_marcador::text),
         email_rt_tentativas = CASE WHEN p_sucesso THEN email_rt_tentativas
                                     ELSE email_rt_tentativas + 1 END,
         atualizado_em = now()
   WHERE id = p_alerta;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, NULL, 'alerta_risco_email_rt', 'alerta_risco_clinico', p_alerta, NULL,
          jsonb_build_object('sucesso', p_sucesso, 'transitorio', p_transitorio, 'detalhe', p_detalhe));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_registrar_email_rt(uuid, boolean, boolean, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_registrar_email_rt(uuid, boolean, boolean, text) TO iris_escalonamento;
--> statement-breakpoint

-- Assinatura antiga (3 args) fica órfã — remover explicitamente pra não
-- conviver com a nova e confundir chamador.
DROP FUNCTION IF EXISTS app_registrar_email_rt(uuid, boolean, text);
```

- [ ] **Step 6: Atualizar `src/db/schema.ts` com a nova coluna**

File: `src/db/schema.ts` (dentro de `alertaRiscoClinico`, junto de `canaisNotificados`)
```typescript
emailRtTentativas: integer("email_rt_tentativas").notNull().default(0),
```

- [ ] **Step 7: Aplicar migração local e conferir**

Run: `pnpm db:migrate`
Expected: `0064_alerta_risco_email_rt_retry` aplicada sem erro; `\df app_registrar_email_rt` no psql mostra só a assinatura de 4 argumentos.

- [ ] **Step 8: Envolver o disparo de e-mail com `try/catch` por alerta em `varrer()`**

File: `scripts/escalonamento-risco.mjs`
```javascript
  const recemEstagio2 = linhas.filter((l) => Number(l.out_estagio) === 2);
  for (const l of recemEstagio2) {
    try {
      await processarEmailRt(sql, l.out_alerta_id);
    } catch (err) {
      log(`e-mail RT: erro não tratado no alerta_id=${l.out_alerta_id} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const pendentes = await sql`SELECT * FROM app_alertas_estagio2_sem_email()`;
  for (const p of pendentes) {
    try {
      await processarEmailRt(sql, p.alerta_id);
    } catch (err) {
      log(`e-mail RT: erro não tratado no alerta_id=${p.alerta_id} (reconciliação) — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
```

- [ ] **Step 9: Atualizar `processarEmailRt` para repassar `transitorio` à função de banco**

File: `scripts/escalonamento-risco.mjs`
```javascript
  const resultado = await enviarEmailRt({ apiKey, fromEmail, appUrl, rtEmail });

  if (resultado.ok) {
    await sql`SELECT app_registrar_email_rt(${alertaId}, true, false, ${resultado.providerMessageId})`;
    log(`e-mail RT enviado: alerta_id=${alertaId} providerMessageId=${resultado.providerMessageId}`);
  } else {
    await sql`SELECT app_registrar_email_rt(${alertaId}, false, ${resultado.transitorio}, ${resultado.erro})`;
    log(`e-mail RT FALHOU (transitorio=${resultado.transitorio}): alerta_id=${alertaId} erro=${resultado.erro}`);
  }
```

- [ ] **Step 10: Escrever teste falho de teto de 3 tentativas**

File: `scripts/escalonamento-risco.test.mjs` (adicionar ao describe existente, ajustando `makeFakeSql` para aceitar o novo parâmetro posicional)
```javascript
  test("erro transitório: registra p_transitorio=true, não estoura em exceção", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "re_chave_de_teste";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    // makeFakeSql precisa ser estendido pra capturar o 3º valor (p_transitorio)
    // de `sql.registros` — ver Step 11 pra o fake atualizado.
  });
```

- [ ] **Step 11: Estender o fake `sql` do teste para o novo parâmetro e implementar o teste**

File: `scripts/escalonamento-risco.test.mjs`
```javascript
function makeFakeSql({ rtRows = [] } = {}) {
  const chamadas = [];
  const registros = [];
  function sql(strings, ...valores) {
    const texto = strings.join("?");
    chamadas.push(texto);
    if (texto.includes("app_rt_do_alerta")) return Promise.resolve(rtRows);
    if (texto.includes("app_registrar_email_rt")) {
      // (p_alerta, p_sucesso, p_transitorio, p_detalhe). p_sucesso é literal
      // no template quando vem de `true`/`false` hardcoded (caso de sucesso);
      // quando vem de variável (`resultado.transitorio`), entra em `valores`.
      const sucessoLiteral = /app_registrar_email_rt\(\?,\s*true,/.test(texto);
      registros.push({
        alerta: valores[0],
        sucesso: sucessoLiteral,
        transitorio: sucessoLiteral ? false : valores[1],
        detalhe: sucessoLiteral ? valores[1] : valores[2],
      });
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }
  sql.chamadas = chamadas;
  sql.registros = registros;
  return sql;
}
```

Implementar o teste do Step 10 mockando `resend-rt.mjs` para devolver `{ ok: false, transitorio: true, erro: "rate limited" }` (via `vi.mock`) e asserir `sql.registros[0].transitorio === true`.

- [ ] **Step 12: Executar suíte completa do escalonamento**

Run: `pnpm test scripts/escalonamento-risco.test.mjs scripts/lib/resend-rt.test.mjs`
Expected: PASS (todos os testes, novos e existentes).

- [ ] **Step 13: Commit**

```bash
git add scripts/escalonamento-risco.mjs scripts/lib/resend-rt.mjs scripts/escalonamento-risco.test.mjs scripts/lib/resend-rt.test.mjs src/db/schema.ts db/migrations/0064_alerta_risco_email_rt_retry.sql db/migrations/meta
git commit -m "fix(risco): isolar laço de e-mail RT por alerta e adicionar retentativa transitório vs permanente com teto de 3 (#154)"
```

---

### Task 2: Ditado de Voz & ASR Gated por DPA (Issue #72)

> `StubAsrProvider` é o estado interino intencional deste plano — ASR real é fast-follow, não gate de MVP (ver `docs/legal/dpa-asr-audio.md`). O que este task garante é que o esqueleto (flag, codec, rascunho local) é real, não só a interface do provider.

**Files:**
- Create: `src/lib/asr/provider.ts`
- Create: `src/lib/asr/audio-drafts.ts`
- Create: `src/lib/asr/audio-drafts.test.ts`
- Create: `src/components/audio/AudioCapture.tsx`
- Create: `src/components/audio/AudioCapture.test.tsx`
- Modify: `src/app/(app)/sign-out-button.tsx` (hook de purga)

**Interfaces:**
- Consumes: `signOut` de `@/auth/client` (já existe, usado em `SignOutButton`)
- Produces: `AsrProvider` interface, `StubAsrProvider`, `escolherCodecSuportado(): string`, `purgarRascunhosAudio(): Promise<void>`

**Regras Levantadas:**
1. Feature flag `FEATURE_FLAG_ASR_ENABLED` travada em `false` — `AudioCapture` não renderiza se a flag estiver desligada.
2. Dual-codec `webm;opus` / `mp4;aac` em `AudioCapture`, escolhido via `MediaRecorder.isTypeSupported`.
3. Rascunhos gravados em IndexedDB `audio_drafts` com purga no logout.

- [ ] **Step 1: Implementar `StubAsrProvider`**

File: `src/lib/asr/provider.ts`
```typescript
export interface AsrProvider {
  transcrever(audioBlob: Blob): Promise<string>;
}

export class StubAsrProvider implements AsrProvider {
  async transcrever(_audioBlob: Blob): Promise<string> {
    return "[Stub ASR] Transcrição simulada para ambiente de CI/Dev";
  }
}
```

- [ ] **Step 2: Escrever teste falho de escolha de codec**

File: `src/components/audio/AudioCapture.test.tsx`
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { escolherCodecSuportado } from "./AudioCapture";

describe("escolherCodecSuportado", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefere webm;opus quando suportado", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (mime: string) => mime === "audio/webm;codecs=opus",
    });
    expect(escolherCodecSuportado()).toBe("audio/webm;codecs=opus");
  });

  it("cai para mp4;aac quando webm não é suportado (Safari)", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (mime: string) => mime === "audio/mp4;codecs=mp4a.40.2",
    });
    expect(escolherCodecSuportado()).toBe("audio/mp4;codecs=mp4a.40.2");
  });

  it("lança se nenhum dos dois for suportado", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(() => escolherCodecSuportado()).toThrow();
  });
});
```

- [ ] **Step 3: Executar teste para verificar falha**

Run: `pnpm test src/components/audio/AudioCapture.test.tsx`
Expected: FAIL com "escolherCodecSuportado não definido" ou erro de módulo.

- [ ] **Step 4: Implementar `AudioCapture` com gating de flag e seleção de codec**

File: `src/components/audio/AudioCapture.tsx`
```typescript
"use client";

import { useState } from "react";
import { StubAsrProvider } from "@/lib/asr/provider";
import { salvarRascunhoAudio } from "@/lib/asr/audio-drafts";

const CODECS_PREFERIDOS = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2"] as const;

export function escolherCodecSuportado(): string {
  const codec = CODECS_PREFERIDOS.find((c) => MediaRecorder.isTypeSupported(c));
  if (!codec) {
    throw new Error("Nenhum codec de áudio suportado (webm/opus nem mp4/aac).");
  }
  return codec;
}

const asrProvider = new StubAsrProvider();

export function AudioCapture() {
  const [gravando, setGravando] = useState(false);

  if (process.env.NEXT_PUBLIC_FEATURE_FLAG_ASR_ENABLED !== "true") {
    return null;
  }

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const codec = escolherCodecSuportado();
    const recorder = new MediaRecorder(stream, { mimeType: codec });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: codec });
      await salvarRascunhoAudio(blob);
      await asrProvider.transcrever(blob);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setGravando(true);
  }

  return (
    <button type="button" onClick={iniciarGravacao} disabled={gravando}>
      {gravando ? "Gravando..." : "Ditar em voz"}
    </button>
  );
}
```

- [ ] **Step 5: Executar teste de codec**

Run: `pnpm test src/components/audio/AudioCapture.test.tsx`
Expected: PASS.

- [ ] **Step 6: Escrever teste falho de rascunho em IndexedDB**

File: `src/lib/asr/audio-drafts.test.ts`
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { salvarRascunhoAudio, purgarRascunhosAudio, listarRascunhosAudio } from "./audio-drafts";

describe("audio-drafts (IndexedDB audio_drafts)", () => {
  beforeEach(async () => {
    await purgarRascunhosAudio();
  });

  it("salva e lista um rascunho", async () => {
    const blob = new Blob(["fake-audio"], { type: "audio/webm" });
    await salvarRascunhoAudio(blob);
    const rascunhos = await listarRascunhosAudio();
    expect(rascunhos).toHaveLength(1);
  });

  it("purga todos os rascunhos", async () => {
    await salvarRascunhoAudio(new Blob(["a"], { type: "audio/webm" }));
    await salvarRascunhoAudio(new Blob(["b"], { type: "audio/webm" }));
    await purgarRascunhosAudio();
    expect(await listarRascunhosAudio()).toHaveLength(0);
  });
});
```

Verificar se `fake-indexeddb` já é dependência (`pnpm list fake-indexeddb`); se não for, adicionar como devDependency antes de rodar o teste: `pnpm add -D fake-indexeddb`.

- [ ] **Step 7: Executar teste para verificar falha**

Run: `pnpm test src/lib/asr/audio-drafts.test.ts`
Expected: FAIL — módulo `./audio-drafts` não existe.

- [ ] **Step 8: Implementar `audio-drafts.ts`**

File: `src/lib/asr/audio-drafts.ts`
```typescript
const DB_NAME = "audio_drafts";
const STORE_NAME = "rascunhos";

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function salvarRascunhoAudio(blob: Blob): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ blob, criadoEm: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listarRascunhosAudio(): Promise<unknown[]> {
  const db = await abrirDb();
  const resultado = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return resultado;
}

export async function purgarRascunhosAudio(): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
```

- [ ] **Step 9: Executar testes de rascunho**

Run: `pnpm test src/lib/asr/audio-drafts.test.ts`
Expected: PASS.

- [ ] **Step 10: Ligar a purga ao logout**

File: `src/app/(app)/sign-out-button.tsx`
```typescript
"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { purgarRascunhosAudio } from "@/lib/asr/audio-drafts";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variante="neutra"
      className="text-sm"
      onClick={async () => {
        await purgarRascunhosAudio();
        await signOut();
        router.push("/login");
      }}
    >
      Sair
    </Button>
  );
}
```

- [ ] **Step 11: Executar suíte completa de ASR**

Run: `pnpm test src/components/audio/AudioCapture.test.tsx src/lib/asr/audio-drafts.test.ts`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/asr/provider.ts src/lib/asr/audio-drafts.ts src/lib/asr/audio-drafts.test.ts src/components/audio/AudioCapture.tsx src/components/audio/AudioCapture.test.tsx "src/app/(app)/sign-out-button.tsx"
git commit -m "feat(asr): implementar gating por flag, seleção de codec e rascunho IndexedDB com purga no logout (#72)"
```
