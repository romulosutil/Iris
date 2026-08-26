# Alarme automático de parada dos jobs de infra — Plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio. As Tasks 5 e 6 são independentes entre si e podem ser paralelizadas.

**Goal:** Criar um detector automático que observa o **efeito** (não o processo) de `iris-billing` e `iris-escalonamento` parados, mais a ausência de dump recente no off-site do `iris-backup`, e mande um e-mail ao Rômulo quando qualquer um deles falhar — hoje isso só é detectado por uma consulta SQL rodada à mão, mensalmente.

**Architecture:** Um quinto serviço de infra, `iris-alarme`, seguindo exatamente o desenho já usado por `escalonamento`/`arquivamento`/`retencao`: um script `.mjs` de Node puro que faz UMA varredura e sai (`scripts/alarme-jobs.mjs`), um `agendador.sh` que faz o laço (Easypanel não tem cron), rodando de hora em hora. A varredura tem três checagens independentes — billing (efeito no banco), escalonamento (efeito no banco) e backup (idade do objeto mais recente no bucket off-site via `mc`) — e manda um e-mail por checagem que falhar, com um marcador em disco para não reenviar o mesmo alerta a cada tick enquanto o problema persiste.

**Tech Stack:** Node 22 (`.mjs`, sem TypeScript), `postgres` 3.4.9, `resend` 6.18.1, MinIO Client (`mc`), bash, Docker, Postgres 16.

**Spec:** GitHub issue [#294](https://github.com/romulosutil/Iris/issues/294) — "Nenhum job de infra tem alarme automático de parada — a detecção é 100% humana". Nasceu do plano da #288 (`docs/superpowers/plans/2026-08-13-issue-288-provisionar-job-fechamento-ciclo.md`, Task 4 passo 6), que documentou o mesmo buraco em `billing`, `escalonamento` e `backup`.

## Global Constraints

- **Efeito, não processo.** Um serviço que nunca foi criado não tem heartbeat pra parar de avançar. As três checagens leem o resultado no banco/bucket, nunca um arquivo de heartbeat de outro container — os volumes `/heartbeat` são privados por serviço e este detector não tem acesso a eles.
- **⚠️ O detector NUNCA lê tabela crua.** `billing_cycle` (`0071:187-189`) e `alerta_risco_clinico` (`0049:204-206`) têm `FORCE ROW LEVEL SECURITY`, e as policies de leitura são `TO app_role`/`TO iris_auth`. Um `GRANT SELECT` direto para uma role nova **não gera erro: gera zero linhas**. O detector reportaria `ok` para sempre — verde e morto, exatamente o defeito que a issue existe para matar. Por isso as duas checagens de banco passam por função `SECURITY DEFINER`, e `iris_alarme` só recebe `GRANT EXECUTE` — mesmo padrão de `iris_escalonamento` (`0049`), `iris_arquivamento` (`0080`) e `iris_retencao`. **Nenhum `GRANT ... ON <tabela> TO iris_alarme` deve existir neste plano.**
- **A verificação tem que distinguir "sem problema" de "sem permissão".** Os dois produzem a mesma saída silenciosa. Toda checagem de banco só é dada por pronta depois de ver `ok:false` com uma linha vencida plantada, **conectado como a role de login de `iris_alarme`** — nunca como dono do banco (memória `fixture-com-authdb-esconde-defeito-real`).
- **Sem dado clínico no corpo do e-mail** (§4.2.1, regra de ouro já aplicada em `montarCorpoAlertaRt`) — o alerta do detector também não pode. As funções `SECURITY DEFINER` devolvem contagem + `clinic_id` + timestamp, nada mais.
- **Três estados, não dois.** Uma checagem pode terminar `ok` (nada errado), `problema` (achou o efeito de um job parado) ou `indeterminado` (não conseguiu nem checar — env ausente, bucket fora do ar). Só `problema` manda e-mail. Config ausente em dev/CI não pode virar alarme diário; e `indeterminado` que persiste vira linha de log, não silêncio.
- **Dedup obrigatório.** Sem marcador, um problema persistente dispara um e-mail por hora para sempre — ruído que ensina o Rômulo a ignorar a caixa de entrada, o oposto do objetivo da issue.
- **Falhar aberto.** Uma checagem que dá erro deve virar `indeterminado`, logar e seguir para a checagem seguinte — nunca derrubar o laço inteiro por causa de uma fonte fora do ar.
- **Idade de backup se mede por `mtime`, não por nome.** O nome do objeto carrega um carimbo, mas um dump antigo re-subido hoje tem nome velho e é backup válido; e se o padrão de nome mudar, um filtro por regex vira "bucket vazio" eterno (memória `auditar-por-nome-apagar-por-mtime`). Usar `mc ls --json` e ler `lastModified` — o formato de data do `mc ls` humano muda entre versões, como o próprio `infra/backup/verify-offsite.sh` documenta.
- **Idioma:** documentação e copy em pt-BR; mensagens de commit em inglês (`docs/arquitetura/convencoes-de-codigo.md`).
- **Formatação:** nunca `pnpm format` no repo inteiro. Só `pnpm exec prettier --write <arquivo>` nos arquivos tocados.
- **Migração à mão:** este plano cria role + função + grants (privilégio), não muda `schema.ts` — vai em `db/migrations/0129_...sql` escrito à mão, com entrada em `meta/_journal.json` usando `when` = anterior + 1000 (regra de `CLAUDE.md`).
- **Edição aditiva em arquivo existente.** `scripts/ci/carga-imagens-infra.sh` já tem quatro alvos (`escalonamento`, `backup`, `billing`, `retencao`). Os blocos deste plano **acrescentam** o quinto; colar um `case` completo por cima apagaria `retencao` sem conflito nenhum (memória `merge-sem-conflito-apaga-feature`).

## Mapa de arquivos

| Arquivo                                            | Responsabilidade                                                                  | Tarefa |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| `db/migrations/0129_alarme_jobs_infra.sql` (novo)  | Role `iris_alarme`, duas funções `SECURITY DEFINER` de checagem, `GRANT EXECUTE`. | 1      |
| `db/migrations/meta/_journal.json`                 | Entrada manual da 0129.                                                           | 1      |
| `db/tests/alarme-jobs-rls.int.test.ts` (novo)      | Prova que `iris_alarme` ENXERGA linha vencida e NÃO enxerga tabela crua.          | 2      |
| `scripts/lib/resend-alarme.mjs` (novo)             | Envio do e-mail de alarme (mesmo padrão de `scripts/lib/resend-rt.mjs`).          | 3      |
| `scripts/lib/resend-alarme.test.mjs` (novo)        | Cobertura do assunto/corpo e dos caminhos de configuração ausente.                | 3      |
| `scripts/alarme-jobs.mjs` (novo, incremental)      | Dedup (T4), checagens de banco (T5), checagem de backup (T6), `main()` (T7).      | 4–7    |
| `scripts/alarme-jobs.test.mjs` (novo, incremental) | Cobertura de cada bloco, na mesma tarefa que o cria.                              | 4–7    |
| `infra/alarme/Dockerfile` (novo)                   | Imagem sem `node_modules` do app, com `mc` instalado.                             | 8      |
| `infra/alarme/agendador.sh` (novo)                 | Laço horário.                                                                     | 8      |
| `scripts/ci/carga-imagens-infra.sh`                | Novo alvo `alarme` (aditivo).                                                     | 8      |
| `infra/README.md`                                  | Runbook de provisionamento + "como saber que deu certo" + detector documentado.   | 9      |
| Easypanel (fora do repo)                           | Serviço `alarme` no ar, exercitado de verdade.                                    | 10     |

**Fronteira de atomização:** cada tarefa é um commit que um revisor pode rejeitar sozinho sem derrubar a vizinha. A regex do backup (T6) sendo rejeitada não leva junto o dedup (T4) nem as checagens de banco (T5). Teste sempre na mesma tarefa que o código que ele cobre (`superpowers:test-driven-development`).

---

### Task 1: Role, funções `SECURITY DEFINER` e grants

**Files:**

- Create: `db/migrations/0129_alarme_jobs_infra.sql`
- Modify: `db/migrations/meta/_journal.json` (acrescentar entrada `idx: 129`)

**Interfaces:**

- Consumes: `billing_cycle` (colunas `clinic_id`, `status`, `fim` — `0071:99-106`) e `alerta_risco_clinico` (`clinic_id`, `status`, `prazo_reconhecimento` — `0049`).
- Produces: role `iris_alarme` e as funções `app_alarme_billing_atrasado(interval)` e `app_alarme_escalonamento_atrasado(interval)`, consumidas pela Task 5.

- [ ] **Passo 1: escrever a migração**

```sql
-- 0129_alarme_jobs_infra.sql
-- Role e funções de leitura do detector de alarme automático (#294).
--
-- POR QUE FUNÇÃO SECURITY DEFINER, E NÃO `GRANT SELECT` NA TABELA:
-- billing_cycle (0071) e alerta_risco_clinico (0049) estão sob FORCE ROW LEVEL
-- SECURITY, e as policies de leitura são TO app_role / TO iris_auth. Um GRANT
-- de tabela para uma role nova não bate em policy nenhuma e devolve ZERO
-- LINHAS SEM ERRO — o detector reportaria "tudo ok" para sempre. Um alarme
-- que nunca dispara é pior que não ter alarme, porque cria a crença de que
-- alguém está olhando. Mesmo padrão já usado por iris_escalonamento (0049),
-- iris_arquivamento (0080) e iris_retencao: a role só ganha EXECUTE.
--
-- POR QUE O RETORNO É AGREGADO, E NÃO A LINHA INTEIRA: o corpo do e-mail de
-- alarme não pode carregar dado clínico (§4.2.1). Contagem + clinic_id +
-- timestamp é o suficiente para o Rômulo saber onde olhar, e é o teto do que
-- uma credencial vazada deste serviço conseguiria extrair.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_alarme') THEN
    CREATE ROLE iris_alarme NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

-- NOLOGIN: a role de login é criada fora das migrações, IN ROLE iris_alarme
-- (mesmo padrão de iris_retencao na 0121 e iris_arquivamento na 0080).
GRANT USAGE ON SCHEMA public TO iris_alarme;
--> statement-breakpoint

-- Ciclo de faturamento que passou do `fim` e continua `aberto`: o job de
-- fechamento (iris-billing) não rodou. O parâmetro é a folga tolerada — o
-- script passa 2h, mas quem chama decide, para o runbook poder investigar com
-- outra régua sem migração nova.
CREATE OR REPLACE FUNCTION public.app_alarme_billing_atrasado(p_folga interval)
RETURNS TABLE (
  total               integer,
  primeira_clinic_id  uuid,
  primeiro_vencimento timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer,
         min(bc.clinic_id) FILTER (WHERE bc.fim = (SELECT min(fim)
                                                     FROM billing_cycle
                                                    WHERE status = 'aberto'
                                                      AND fim <= now() - p_folga)),
         min(bc.fim)
    FROM billing_cycle bc
   WHERE bc.status = 'aberto'
     AND bc.fim <= now() - p_folga;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_alarme_billing_atrasado(interval) TO iris_alarme;
--> statement-breakpoint

-- Alerta de risco clínico cujo prazo de reconhecimento venceu e que continua
-- `aberto`: o motor de escalonamento (iris-escalonamento) não rodou. O nome do
-- paciente e o trecho de risco NÃO saem daqui — só contagem, clínica e prazo.
CREATE OR REPLACE FUNCTION public.app_alarme_escalonamento_atrasado(p_folga interval)
RETURNS TABLE (
  total               integer,
  primeira_clinic_id  uuid,
  primeiro_vencimento timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer,
         min(a.clinic_id) FILTER (WHERE a.prazo_reconhecimento = (
           SELECT min(prazo_reconhecimento)
             FROM alerta_risco_clinico
            WHERE status = 'aberto'
              AND prazo_reconhecimento <= now() - p_folga)),
         min(a.prazo_reconhecimento)
    FROM alerta_risco_clinico a
   WHERE a.status = 'aberto'
     AND a.prazo_reconhecimento <= now() - p_folga;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_alarme_escalonamento_atrasado(interval) TO iris_alarme;
```

> **Nota para o executor:** as duas funções são cross-tenant por desenho — o detector é um observador de infra, não uma tela do produto. Isso é aceitável **porque o retorno é agregado e não-clínico** (memória `definer-cross-tenant-so-devolve-boolean`). Se alguém futuramente quiser devolver a linha inteira, isso deixa de valer e a função tem que mudar de forma.

- [ ] **Passo 2: entrada manual no `_journal.json`**

Última entrada é `0128_retencao_expurgo_wiring`, `when: 1787655236724`. Somar 1000:

```json
{
  "idx": 129,
  "version": "7",
  "when": 1787655237724,
  "tag": "0129_alarme_jobs_infra",
  "breakpoints": true
}
```

Acrescentar como último elemento do array `entries`, antes do `]` de fechamento.

- [ ] **Passo 3: aplicar e verificar em `pg_proc`, não em `git log`**

```bash
pnpm db:migrate
psql "$DATABASE_URL" -c "\du iris_alarme"
psql "$DATABASE_URL" -c "SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'app_alarme_%';"
psql "$DATABASE_URL" -c "SELECT grantee, table_name, privilege_type FROM information_schema.table_privileges WHERE grantee = 'iris_alarme';"
```

Esperado: `iris_alarme` existe (`NOLOGIN`/`NOSUPERUSER`); as duas funções aparecem com `prosecdef = t`; e a **terceira consulta devolve ZERO linhas** — se aparecer qualquer privilégio de tabela, o desenho regrediu para o modelo que não funciona sob RLS.

- [ ] **Passo 4: rodar o guard de migrações**

```bash
pnpm test src/db/migrations.test.ts
```

Esperado: PASS. Se falhar por `when` não-crescente ou tag fora do padrão, revisar o Passo 2.

- [ ] **Passo 5: commit**

```bash
git add db/migrations/0129_alarme_jobs_infra.sql db/migrations/meta/_journal.json
git commit -m "$(cat <<'EOF'
feat(infra): add read role and definer checks for the job alarm detector

New iris_alarme role with EXECUTE on two SECURITY DEFINER functions that
return only aggregates (count, clinic id, timestamp) for overdue billing
cycles and overdue risk escalations.

Deliberately no table-level GRANT: both tables are under FORCE ROW LEVEL
SECURITY with app_role-scoped policies, so a direct grant would return
zero rows with no error and the detector would report "all clear"
forever — the exact silent failure this issue exists to remove.

Refs #294
EOF
)"
```

---

### Task 2: Prova de que a role enxerga (teste de integração)

Task separada da 1 de propósito: é aqui que o defeito silencioso morre. Sem este teste, a Task 1 sai verde tanto certa quanto errada.

**Files:**

- Create: `db/tests/alarme-jobs-rls.int.test.ts`

**Interfaces:**

- Consumes: as funções da Task 1; `MIGRATION_DATABASE_URL` para o arranjo (criar a role de login e plantar as linhas), conexão como `iris_alarme_login` para a asserção.
- Produces: o oráculo de que o detector não é cego.

- [ ] **Passo 1: escrever o teste**

Estrutura (seguir as convenções do arquivo vizinho `db/tests/clinic-id-helper-rls.int.test.ts`):

1. **Arranjo** (conexão de migração/dono): criar `iris_alarme_login LOGIN PASSWORD ... IN ROLE iris_alarme` se não existir; inserir uma clínica de teste, um `billing_cycle` com `status='aberto'` e `fim = now() - 5 hours`, e um `alerta_risco_clinico` com `status='aberto'` e `prazo_reconhecimento = now() - 1 hour`.
2. **Asserção positiva** (conexão **como `iris_alarme_login`**): `SELECT * FROM app_alarme_billing_atrasado('2 hours')` devolve `total >= 1` e `primeira_clinic_id` não-nulo. Idem para escalonamento com `'10 minutes'`.
3. **Asserção negativa** (mesma conexão): `SELECT 1 FROM billing_cycle LIMIT 1` **estoura** `permission denied`. Se passar, alguém acrescentou um `GRANT` de tabela e a fronteira de privilégio caiu.
4. **Limpeza:** `DELETE` escopado pelos ids inseridos — **nunca `TRUNCATE`**, que colide com os outros int-tests rodando em paralelo (memória `truncate-extra-colide-com-int-test-paralelo`). E-mails/identificadores de fixture com sufixo único do arquivo (memória `email-de-fixture-colide-entre-int-tests`).

- [ ] **Passo 2: rodar com a config certa**

```bash
pnpm vitest run db/tests/alarme-jobs-rls.int.test.ts --config vitest.integration.config.ts
```

Esperado: PASS, com **contagem de testes > 0**. `vitest run` sem `--config` coleta zero em `*.int.test.ts` e sai verde sem rodar nada (memória `vitest-int-test-coleta-zero`). Conferir o número, não a cor.

- [ ] **Passo 3: mutação — provar que o teste morde**

Trocar temporariamente `app_alarme_billing_atrasado` por uma versão **sem** `SECURITY DEFINER` (aplicar via `psql`, não editando a migração já aplicada) e rodar de novo: a asserção positiva deve **FALHAR** com `total = 0`. Reaplicar a versão correta.

```sql
-- reverter depois do experimento
\i db/migrations/0129_alarme_jobs_infra.sql
```

- [ ] **Passo 4: commit**

```bash
git add db/tests/alarme-jobs-rls.int.test.ts
git commit -m "$(cat <<'EOF'
test(infra): prove the alarm role can read through the definer functions

Positive assertion (the role sees a planted overdue row) plus a negative
one (raw table SELECT is denied), both connected AS the alarm login role
rather than the owner — a fixture on the owning role would pass either
way and hide the RLS blindness this guards against.

Refs #294
EOF
)"
```

---

### Task 3: Envio do e-mail de alarme

**Files:**

- Create: `scripts/lib/resend-alarme.mjs`
- Create: `scripts/lib/resend-alarme.test.mjs`

**Interfaces:**

- Consumes: env `EMAIL_PROVIDER_API_KEY`, `RESEND_FROM_EMAIL`, `ALARME_EMAIL_DESTINO`.
- Produces: `montarAssuntoAlarme(motivo)`, `montarCorpoAlarme(motivo, detalhe)`, `enviarEmailAlarme({...}) -> { ok, providerMessageId } | { ok:false, erro }`.

- [ ] **Passo 1: `scripts/lib/resend-alarme.mjs`**

```js
/**
 * #294 — envio do e-mail de alarme automático de parada de job de infra.
 * Espelho de scripts/lib/resend-rt.mjs (mesma razão: `.mjs` puro, sem tsx,
 * roda no detector sem depender do app Next).
 *
 * Corpo do e-mail é operacional, nunca clínico — nenhum paciente, categoria
 * ou trecho de risco entra aqui (§4.2.1, regra de ouro). As funções
 * SECURITY DEFINER da 0129 já garantem isso na origem: elas só devolvem
 * contagem, clinic_id e timestamp.
 */

export function montarAssuntoAlarme(motivo) {
  return `Iris — alarme: ${motivo} parece parado`;
}

export function montarCorpoAlarme(motivo, detalhe) {
  return `<p>O detector automático de jobs de infra encontrou um problema em <b>${motivo}</b>.</p>
        <p>${detalhe}</p>
        <p>Consulte a seção "Alarme automático de jobs de infra" em infra/README.md para o runbook de diagnóstico.</p>`;
}

export async function enviarEmailAlarme({
  apiKey,
  fromEmail,
  destino,
  motivo,
  detalhe,
}) {
  if (!apiKey) {
    return {
      ok: false,
      erro: "email nao configurado (EMAIL_PROVIDER_API_KEY ausente)",
    };
  }
  if (!destino) {
    return {
      ok: false,
      erro: "email nao enviado (ALARME_EMAIL_DESTINO ausente)",
    };
  }

  try {
    // `await import()` dinâmico: mesma forma do resend-rt.mjs. ATENÇÃO — o
    // catch abaixo transforma um `resend` ausente na imagem em "falha de
    // envio" silenciosa, e a carga de imagem (Task 8) é o único lugar que
    // pega isso (memória: carga-nao-cobre-import-dinamico).
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: destino,
      subject: montarAssuntoAlarme(motivo),
      html: montarCorpoAlarme(motivo, detalhe),
    });

    if (error) {
      return {
        ok: false,
        erro: error.message ?? "erro desconhecido do provedor",
      };
    }
    return { ok: true, providerMessageId: data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Passo 2: `scripts/lib/resend-alarme.test.mjs`**

Cobrir, no mínimo:

- `enviarEmailAlarme` sem `apiKey` → `{ ok: false }` com `erro` citando `EMAIL_PROVIDER_API_KEY`, **sem** tentar importar `resend`.
- Sem `destino` → `{ ok: false }` citando `ALARME_EMAIL_DESTINO`.
- `montarCorpoAlarme` inclui `motivo` e `detalhe` e **não** inclui nenhuma marca de dado clínico (asserir a ausência de um campo que nunca deveria chegar aqui, ex.: nenhum `nome`/`paciente` na string, dado um `detalhe` que não os contenha).

```bash
pnpm test scripts/lib/resend-alarme.test.mjs
```

- [ ] **Passo 3: commit**

```bash
git add scripts/lib/resend-alarme.mjs scripts/lib/resend-alarme.test.mjs
git commit -m "$(cat <<'EOF'
feat(infra): add alarm email sender for the infra job detector

Refs #294
EOF
)"
```

---

### Task 4: Dedup por motivo e por dia

**Files:**

- Create: `scripts/alarme-jobs.mjs` (só o bloco de dedup nesta tarefa)
- Create: `scripts/alarme-jobs.test.mjs`

**Interfaces:**

- Consumes: env `ALARME_HEARTBEAT_DIR` (default `/heartbeat`).
- Produces: `hojeUTC()`, `deveAlertar(dir, motivo, hoje)`, `marcarAlertado(dir, motivo, hoje)`.

- [ ] **Passo 1: escrever o bloco**

```js
#!/usr/bin/env node
/**
 * Detector de alarme automático de parada de job de infra (#294).
 *
 * UMA varredura e SAI — o laço é responsabilidade de infra/alarme/agendador.sh
 * (mesmo desenho de escalonamento/arquivamento/retencao).
 *
 * Dedup: cada checagem que falha só dispara e-mail UMA VEZ POR DIA UTC —
 * marcador `.alertado-<motivo>-YYYY-MM-DD` em ALARME_HEARTBEAT_DIR, mesmo
 * padrão do `.ultimo-backup-YYYY-MM-DD` do serviço de backup. Sem isso, um
 * problema persistente vira um e-mail por hora para sempre.
 *
 * LIMITE CONHECIDO E ACEITO: a janela é o dia UTC, não 24h corridas. Um
 * problema que alerta às 23h50 alerta de novo às 00h10. Preferido a uma
 * janela deslizante porque o marcador é legível a olho no Console do
 * Easypanel e some sozinho com o dia — e um e-mail a mais na virada é falha
 * na direção certa para um alarme.
 *
 * O marcador só é gravado depois de um envio BEM-SUCEDIDO: falha de envio
 * tem que reentrar no tick seguinte, senão o dedup silencia o alarme que
 * nunca chegou.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";

export function hojeUTC() {
  return new Date().toISOString().slice(0, 10);
}

export async function deveAlertar(heartbeatDir, motivo, hoje) {
  const arquivos = await readdir(heartbeatDir).catch(() => []);
  return !arquivos.includes(`.alertado-${motivo}-${hoje}`);
}

export async function marcarAlertado(heartbeatDir, motivo, hoje) {
  await mkdir(heartbeatDir, { recursive: true });
  await writeFile(
    `${heartbeatDir}/.alertado-${motivo}-${hoje}`,
    new Date().toISOString(),
  );
}
```

- [ ] **Passo 2: testes na mesma tarefa**

```js
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { deveAlertar, marcarAlertado } from "./alarme-jobs.mjs";

let heartbeatDir;

beforeEach(async () => {
  heartbeatDir = await mkdtemp(path.join(tmpdir(), "iris-alarme-"));
});

afterEach(async () => {
  await rm(heartbeatDir, { recursive: true, force: true });
});

describe("alarme-jobs.mjs — dedup (#294)", () => {
  test("primeira checagem do dia deve alertar", async () => {
    expect(await deveAlertar(heartbeatDir, "billing", "2026-08-25")).toBe(true);
  });

  test("depois de marcado, não alerta de novo no MESMO dia", async () => {
    await marcarAlertado(heartbeatDir, "billing", "2026-08-25");
    expect(await deveAlertar(heartbeatDir, "billing", "2026-08-25")).toBe(
      false,
    );
  });

  test("dia seguinte alerta de novo mesmo com marcador de ontem", async () => {
    await marcarAlertado(heartbeatDir, "billing", "2026-08-25");
    expect(await deveAlertar(heartbeatDir, "billing", "2026-08-26")).toBe(true);
  });

  test("motivos diferentes não compartilham marcador", async () => {
    await marcarAlertado(heartbeatDir, "billing", "2026-08-25");
    expect(await deveAlertar(heartbeatDir, "escalonamento", "2026-08-25")).toBe(
      true,
    );
  });

  test("diretório inexistente não estoura — trata como 'nunca alertou'", async () => {
    expect(
      await deveAlertar(`${heartbeatDir}/nao-existe`, "billing", "2026-08-25"),
    ).toBe(true);
  });
});
```

```bash
pnpm test scripts/alarme-jobs.test.mjs
```

- [ ] **Passo 3: mutação — provar que os testes testam**

Aplicar um patch inverso temporário fazendo `deveAlertar` retornar sempre `true` (**não** `git checkout`, que apagaria o arquivo novo — memória `mutacao-reverter-sem-git-checkout`). O teste "depois de marcado, não alerta de novo" deve **FALHAR**. Reverter com o patch inverso e confirmar `git diff` limpo.

- [ ] **Passo 4: commit**

```bash
git add scripts/alarme-jobs.mjs scripts/alarme-jobs.test.mjs
git commit -m "$(cat <<'EOF'
feat(infra): add per-reason daily dedup for the alarm detector

Refs #294
EOF
)"
```

---

### Task 5: Checagens de banco (billing e escalonamento)

Independente da Task 6 — podem ser feitas em paralelo.

**Files:**

- Modify: `scripts/alarme-jobs.mjs`
- Modify: `scripts/alarme-jobs.test.mjs`

**Interfaces:**

- Consumes: as funções `SECURITY DEFINER` da Task 1, via `postgres` 3.4.9; env `ALARME_DATABASE_URL`.
- Produces: `verificarBilling(sql)` e `verificarEscalonamento(sql)`, ambas devolvendo `{ estado, motivo, detalhe }` com `estado ∈ {"ok","problema","indeterminado"}`.

- [ ] **Passo 1: escrever as checagens**

```js
import postgres from "postgres";

const LIMITE_BILLING = "2 hours";
const LIMITE_ESCALONAMENTO = "10 minutes";

/**
 * Ciclo de faturamento vencido e ainda `aberto` = iris-billing parado.
 * A folga de 2h é a mesma da consulta manual documentada em infra/README.md
 * (#288) — tempo de sobra para um restart normal do serviço.
 *
 * ATENÇÃO ao ler o resultado: `fecharCiclosVencendo` abre o ciclo N+1 na mesma
 * passada em que fecha o N, então um `billing_cycle` com status `aberto` e
 * `fim` NO FUTURO é o estado normal. Só o `fim` VENCIDO acusa parada — é por
 * isso que o predicado vive na função da 0129 e não é reinventado aqui.
 */
export async function verificarBilling(sql) {
  try {
    const [linha] =
      await sql`SELECT * FROM app_alarme_billing_atrasado(${LIMITE_BILLING}::interval)`;
    if (!linha || linha.total === 0) {
      return { estado: "ok", motivo: "billing", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "billing",
      detalhe: `${linha.total} ciclo(s) de faturamento vencido(s) há mais de ${LIMITE_BILLING} sem fechar. Mais antigo: clínica ${linha.primeira_clinic_id}, venceu em ${new Date(linha.primeiro_vencimento).toISOString()}.`,
    };
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "billing",
      detalhe: `não foi possível checar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Alerta de risco com prazo de reconhecimento vencido e ainda `aberto` =
 * iris-escalonamento parado. 10min = 10x o tick de 60s do motor: folga para
 * restart normal, curto o bastante para o prazo clínico não passar batido.
 *
 * O `detalhe` NUNCA carrega paciente, categoria ou trecho — a função da 0129
 * não devolve isso, por desenho.
 */
export async function verificarEscalonamento(sql) {
  try {
    const [linha] =
      await sql`SELECT * FROM app_alarme_escalonamento_atrasado(${LIMITE_ESCALONAMENTO}::interval)`;
    if (!linha || linha.total === 0) {
      return { estado: "ok", motivo: "escalonamento", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "escalonamento",
      detalhe: `${linha.total} alerta(s) de risco com prazo de reconhecimento vencido há mais de ${LIMITE_ESCALONAMENTO} sem escalar. Mais antigo: clínica ${linha.primeira_clinic_id}, venceu em ${new Date(linha.primeiro_vencimento).toISOString()}.`,
    };
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "escalonamento",
      detalhe: `não foi possível checar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function abrirConexao(databaseUrl) {
  return postgres(databaseUrl, { max: 1 });
}
```

- [ ] **Passo 2: testes com dublê**

O dublê é uma função `sql` que devolve o array de linhas. Cobrir, para **cada** checagem:

- `total: 0` → `estado: "ok"`, `detalhe: ""`.
- `total: 3` com `primeira_clinic_id`/`primeiro_vencimento` → `estado: "problema"`, `detalhe` contendo a contagem e a clínica.
- Array vazio (função não devolveu linha) → `estado: "ok"` (não estoura em `linha.total`).
- Dublê que **lança** → `estado: "indeterminado"`, nunca `"ok"`. Este é o teste que impede um erro de permissão de ser lido como "tudo certo".

O dublê tem que ser uma **função**, não uma arrow usada com `new` em lugar nenhum, e o `detalhe` asserido por conteúdo — não reimplementar o template no teste (memória `teste-verde-que-nao-testa-nada`).

```bash
pnpm test scripts/alarme-jobs.test.mjs
```

- [ ] **Passo 3: rodar contra o banco de verdade**

```bash
ALARME_DATABASE_URL="postgres://iris_alarme_login:...@localhost:5433/iris" \
  node -e "import('./scripts/alarme-jobs.mjs').then(async m => { const sql = m.abrirConexao(process.env.ALARME_DATABASE_URL); console.log(await m.verificarBilling(sql), await m.verificarEscalonamento(sql)); await sql.end(); })"
```

Esperado com a linha vencida da Task 2 ainda plantada: `estado: "problema"`. **Com o banco limpo, `ok` e `problema` são indistinguíveis de um erro de permissão silencioso** — por isso a asserção real é a da Task 2 e este passo só confirma a fiação, conectado como a role de login do alarme.

- [ ] **Passo 4: commit**

```bash
git add scripts/alarme-jobs.mjs scripts/alarme-jobs.test.mjs
git commit -m "$(cat <<'EOF'
feat(infra): add billing and escalation checks to the alarm detector

Both go through the 0129 definer functions and report a third state,
"indeterminado", when the check itself fails — a connection or permission
error must never be reported as "all clear".

Refs #294
EOF
)"
```

---

### Task 6: Checagem do backup off-site (idade real do objeto)

Independente da Task 5.

**Files:**

- Modify: `scripts/alarme-jobs.mjs`
- Modify: `scripts/alarme-jobs.test.mjs`

**Interfaces:**

- Consumes: `mc` no PATH; env `OFFSITE_S3_ENDPOINT`/`OFFSITE_S3_ACCESS_KEY`/`OFFSITE_S3_SECRET_KEY`/`OFFSITE_S3_BUCKET`/`OFFSITE_S3_REGION` — as mesmas de `infra/backup/verify-offsite.sh`, mas com credencial de **leitura**.
- Produces: `idadeMaisRecenteH(saidaJson, agora)` (pura, testável) e `verificarBackupOffsite(env)`.

- [ ] **Passo 1: separar a lógica pura do `mc`**

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const LIMITE_BACKUP_H = 36;

/**
 * Idade, em horas, do objeto mais recente da listagem.
 *
 * POR QUE `lastModified` E NÃO O CARIMBO DO NOME: um dump legítimo re-subido
 * hoje tem nome antigo, e um dump velho renomeado tem nome novo — nenhum dos
 * dois é o que queremos medir. Pior: um filtro por regex de nome vira "bucket
 * vazio" permanente no dia em que o backup.sh mudar o padrão, e "vazio" aqui
 * dispara alarme. `mc ls --json` dá `lastModified` em ISO e não muda de
 * formato entre versões, ao contrário da saída humana do `mc ls` (o próprio
 * infra/backup/verify-offsite.sh comenta essa armadilha).
 *
 * `saidaJson` é NDJSON: uma linha JSON por objeto.
 */
export function idadeMaisRecenteH(saidaJson, agora) {
  const objetos = saidaJson
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((o) => o.type !== "folder" && o.lastModified);
  if (objetos.length === 0) return null;
  const maisRecente = objetos
    .map((o) => Date.parse(o.lastModified))
    .reduce((a, b) => (b > a ? b : a));
  return (agora - maisRecente) / 3_600_000;
}

export async function verificarBackupOffsite(env, agora = Date.now()) {
  const obrigatorias = [
    "OFFSITE_S3_ENDPOINT",
    "OFFSITE_S3_ACCESS_KEY",
    "OFFSITE_S3_SECRET_KEY",
  ];
  const faltando = obrigatorias.filter((v) => !env[v]);
  if (faltando.length > 0) {
    // NÃO é "backup parado" e NÃO manda e-mail: é o detector que não pode
    // checar. Em dev e em CI isso é o normal; um `problema` aqui viraria um
    // e-mail por dia para sempre e ensinaria a ignorar a caixa de entrada.
    return {
      estado: "indeterminado",
      motivo: "backup-offsite",
      detalhe: `não foi possível checar: variável(is) ausente(s) ${faltando.join(", ")}.`,
    };
  }

  const bucket = env.OFFSITE_S3_BUCKET || "iris-backups-offsite";
  const alias = "alarme-offsite";
  try {
    await execFileP("mc", [
      "alias",
      "set",
      alias,
      env.OFFSITE_S3_ENDPOINT,
      env.OFFSITE_S3_ACCESS_KEY,
      env.OFFSITE_S3_SECRET_KEY,
      "--api",
      "S3v4",
    ]);
    // MC_REGION obrigatório: sem ele o mc assina como us-east-1 e o destino
    // recusa (memória: teste-com-duble-nao-cobre-dialeto-do-destino).
    const { stdout } = await execFileP(
      "mc",
      ["ls", "--json", `${alias}/${bucket}/`],
      { env: { ...process.env, MC_REGION: env.OFFSITE_S3_REGION || "" } },
    );

    const idadeH = idadeMaisRecenteH(stdout, agora);
    if (idadeH === null) {
      // Bucket respondeu e está vazio: isso É problema, não indeterminado.
      return {
        estado: "problema",
        motivo: "backup-offsite",
        detalhe: `Bucket ${bucket} responde, mas está vazio — nenhuma réplica off-site encontrada.`,
      };
    }
    if (idadeH <= LIMITE_BACKUP_H) {
      return { estado: "ok", motivo: "backup-offsite", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "backup-offsite",
      detalhe: `Réplica off-site mais recente tem ${idadeH.toFixed(1)}h — acima do limite de ${LIMITE_BACKUP_H}h (o backup roda 1x/dia).`,
    };
  } catch (err) {
    // Nunca vaza a secret na mensagem — o mc ecoa a chave inválida no erro,
    // como infra/backup/verify-offsite.sh já trata.
    const msg = err instanceof Error ? err.message : String(err);
    return {
      estado: "indeterminado",
      motivo: "backup-offsite",
      detalhe: `não foi possível checar: ${msg.split(env.OFFSITE_S3_SECRET_KEY).join("***")}`,
    };
  }
}
```

- [ ] **Passo 2: testes**

`idadeMaisRecenteH` é pura — testar direto, sem tocar em `mc`:

- NDJSON com três objetos → devolve a idade do **mais recente**, não do último da lista nem do de nome maior. Incluir deliberadamente um objeto com nome "mais novo" e `lastModified` mais **antigo**: é este caso que mata a implementação por regex de nome.
- Listagem só com `type: "folder"` → `null`.
- String vazia → `null`.
- Linha em branco no meio do NDJSON não estoura.

`verificarBackupOffsite`: env vazio → `estado: "indeterminado"` (**não** `"problema"`). Este teste é o que impede o alarme diário em dev/CI.

O `mc` de verdade não entra em teste unitário — a prova de que ele existe e responde é a carga de imagem (Task 8) e o ensaio da Task 10.

- [ ] **Passo 3: commit**

```bash
git add scripts/alarme-jobs.mjs scripts/alarme-jobs.test.mjs
git commit -m "$(cat <<'EOF'
build(infra): check offsite backup freshness by object mtime

Reads lastModified from `mc ls --json` instead of parsing the timestamp
embedded in object names: a valid dump re-uploaded today carries an old
name, and a name-pattern change would silently turn the check into a
permanent "empty bucket" alarm.

Missing S3 config resolves to "indeterminado", not "problema", so dev and
CI do not page every day.

Refs #294
EOF
)"
```

---

### Task 7: `main()` — orquestração, dedup aplicado e código de saída

**Files:**

- Modify: `scripts/alarme-jobs.mjs`
- Modify: `scripts/alarme-jobs.test.mjs`

**Interfaces:**

- Consumes: tudo das Tasks 3–6.
- Produces: `decidirEnvios(resultados)` (pura) e `main()`; contrato de saída: `0` = varredura completa (com ou sem problema **já** notificado), `1` = alguma coisa impediu o alarme de cumprir seu papel (env obrigatória ausente, falha de envio).

- [ ] **Passo 1: escrever a orquestração**

```js
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { enviarEmailAlarme } from "./lib/resend-alarme.mjs";

/**
 * Separa o que MERECE e-mail do que só merece log. Pura, para o desfecho ser
 * testável sem tocar em rede nem em disco (mesmo motivo do `decidirDesfecho`
 * do trigger de conciliação, #375).
 */
export function decidirEnvios(resultados) {
  return {
    aEnviar: resultados.filter((r) => r.estado === "problema"),
    aLogar: resultados.filter((r) => r.estado === "indeterminado"),
  };
}

export async function main() {
  const heartbeatDir = process.env.ALARME_HEARTBEAT_DIR || "/heartbeat";
  await mkdir(heartbeatDir, { recursive: true });

  const databaseUrl = process.env.ALARME_DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "alarme-jobs: ERRO: variável de ambiente ausente: ALARME_DATABASE_URL",
    );
    return 1;
  }

  const sql = abrirConexao(databaseUrl);
  const hoje = hojeUTC();
  const resultados = [];

  try {
    resultados.push(await verificarBilling(sql));
    resultados.push(await verificarEscalonamento(sql));
  } finally {
    await sql.end({ timeout: 5 });
  }
  resultados.push(await verificarBackupOffsite(process.env));

  const { aEnviar, aLogar } = decidirEnvios(resultados);

  for (const r of aLogar) {
    console.warn(`[alarme-jobs] INDETERMINADO: ${r.motivo} — ${r.detalhe}`);
  }

  let algumEnvioFalhou = false;
  for (const r of aEnviar) {
    console.warn(`[alarme-jobs] ATENÇÃO: ${r.motivo} — ${r.detalhe}`);

    if (!(await deveAlertar(heartbeatDir, r.motivo, hoje))) {
      console.log(`[alarme-jobs] ${r.motivo}: já alertado hoje, sem reenvio.`);
      continue;
    }

    const envio = await enviarEmailAlarme({
      apiKey: process.env.EMAIL_PROVIDER_API_KEY,
      fromEmail:
        process.env.RESEND_FROM_EMAIL || "notificacoes@irisclinica.ia.br",
      destino: process.env.ALARME_EMAIL_DESTINO,
      motivo: r.motivo,
      detalhe: r.detalhe,
    });
    if (envio.ok) {
      // Só marca depois de enviado: um envio que falhou tem que reentrar no
      // tick seguinte, senão o dedup silencia um alarme que nunca chegou.
      await marcarAlertado(heartbeatDir, r.motivo, hoje);
      console.log(`[alarme-jobs] ${r.motivo}: e-mail de alarme enviado.`);
    } else {
      algumEnvioFalhou = true;
      console.error(
        `[alarme-jobs] ${r.motivo}: FALHA ao enviar e-mail: ${envio.erro}`,
      );
    }
  }

  // Carimbo de "eu rodei", gravado SEMPRE — inclusive quando achou problema.
  // É o que prova que o próprio detector está vivo; sem ele, um detector
  // morto e um mundo saudável têm a mesma aparência.
  await writeFile(
    `${heartbeatDir}/.ultima-verificacao`,
    new Date().toISOString(),
  );
  return algumEnvioFalhou ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((codigo) => process.exit(codigo));
}
```

- [ ] **Passo 2: testes de `decidirEnvios`**

- Três `ok` → `aEnviar` e `aLogar` vazios.
- Um `problema` + um `indeterminado` + um `ok` → cada um na cesta certa; **`indeterminado` não entra em `aEnviar`**.
- A ordem de `aEnviar` preserva a de entrada (o log fica legível).

- [ ] **Passo 3: rodar a varredura inteira contra dev local**

```bash
ALARME_DATABASE_URL="postgres://iris_alarme_login:...@localhost:5433/iris" \
ALARME_HEARTBEAT_DIR=/tmp/hb-alarme \
  node scripts/alarme-jobs.mjs
```

Esperado com o banco limpo e sem `OFFSITE_S3_*`: exit 0, uma linha `INDETERMINADO: backup-offsite` (variáveis ausentes — esperado em dev, não é bug), nenhuma linha `ATENÇÃO`, nenhum e-mail, e `/tmp/hb-alarme/.ultima-verificacao` criado.

Depois, plantar um ciclo vencido (mesmo arranjo da Task 2) e rodar de novo **sem** `EMAIL_PROVIDER_API_KEY`: esperado exit **1**, com `ATENÇÃO: billing` e `FALHA ao enviar e-mail`. Confirmar que **nenhum** `.alertado-billing-*` foi criado — envio falho não pode marcar.

- [ ] **Passo 4: rodar a suíte inteira e commitar**

```bash
pnpm test scripts/
pnpm lint
git add scripts/alarme-jobs.mjs scripts/alarme-jobs.test.mjs
git commit -m "$(cat <<'EOF'
feat(infra): wire the alarm detector scan and exit contract

Only "problema" results send email; "indeterminado" is logged. The dedup
marker is written after a successful send, so a failed delivery retries
on the next tick instead of being silenced for the day.

Refs #294
EOF
)"
```

---

### Task 8: Imagem, agendador e teste de carga

**Files:**

- Create: `infra/alarme/Dockerfile`
- Create: `infra/alarme/agendador.sh`
- Modify: `scripts/ci/carga-imagens-infra.sh` (**aditivo**)

**Interfaces:**

- Consumes: `scripts/alarme-jobs.mjs`, `scripts/lib/resend-alarme.mjs`; helpers `esperar_falha_com`/`esperar_sucesso`/`log_info` já existentes no script de carga.
- Produces: `/app/agendador.sh` na imagem; alvo `alarme` no CLI de carga.

- [ ] **Passo 1: `infra/alarme/agendador.sh`**

```bash
#!/usr/bin/env bash
# agendador.sh — laço do detector de alarme automático de jobs de infra (#294).
#
# Mesmo desenho de infra/escalonamento/agendador.sh: o Easypanel (v2.31.0) não
# tem cron para serviço de app, então o laço vive aqui, versionado.
#
# Env:
#   INTERVALO_S            segundos entre varreduras. Default 3600 (as três
#                          checagens são de efeito, não de prazo clínico —
#                          uma hora de atraso não muda o diagnóstico).
#   ALARME_DATABASE_URL    role de login que herda iris_alarme.
#   ALARME_HEARTBEAT_DIR   default /heartbeat.

set -Eeuo pipefail
IFS=$'\n\t'

log() { printf '[agendador-alarme] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

readonly INTERVALO_S="${INTERVALO_S:-3600}"
readonly HEARTBEAT_DIR="${ALARME_HEARTBEAT_DIR:-/heartbeat}"
readonly SCRIPT="/app/scripts/alarme-jobs.mjs"

if ! [[ "${INTERVALO_S}" =~ ^[1-9][0-9]*$ ]]; then
	log "ERRO: INTERVALO_S precisa ser inteiro positivo de segundos, recebido: ${INTERVALO_S}"
	exit 1
fi

if [[ ! -f "${SCRIPT}" ]]; then
	log "ERRO: ${SCRIPT} não encontrado na imagem — build quebrado, não subir assim."
	exit 1
fi

if [[ -z "${ALARME_DATABASE_URL:-}" ]]; then
	log "ERRO: variável de ambiente ausente: ALARME_DATABASE_URL"
	exit 1
fi

mkdir -p -- "${HEARTBEAT_DIR}"

log "ativo. intervalo=${INTERVALO_S}s · heartbeat=${HEARTBEAT_DIR}/.ultima-verificacao"

falhas_seguidas=0

while :; do
	saida=0
	node "${SCRIPT}" || saida=$?

	if [[ "${saida}" -eq 0 ]]; then
		if [[ "${falhas_seguidas}" -gt 0 ]]; then
			log "recuperado após ${falhas_seguidas} falha(s) seguida(s)."
		fi
		falhas_seguidas=0
	else
		falhas_seguidas=$((falhas_seguidas + 1))
		log "ATENÇÃO: o detector não conseguiu cumprir o papel dele (exit ${saida}) — ${falhas_seguidas} vez(es) seguida(s)."
		log "ATENÇÃO: exit 1 aqui NÃO significa 'job de infra parado' — significa que o alarme não conseguiu avisar. O detalhe está nas linhas acima desta."
	fi

	sleep "${INTERVALO_S}"
done
```

```bash
chmod +x infra/alarme/agendador.sh
```

- [ ] **Passo 2: `infra/alarme/Dockerfile`**

```dockerfile
# Imagem do detector de alarme automático de jobs de infra (Iris, #294).
#
# syntax=docker/dockerfile:1
FROM node:22-alpine

# bash: o agendador usa `set -Eeuo pipefail` e `[[ ]]`, que não são POSIX sh.
# mc: MinIO Client, para ler a data do dump off-site mais recente (mesma
# ferramenta de infra/backup/verify-offsite.sh).
RUN apk add --no-cache bash curl && \
    curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && \
    chmod +x /usr/local/bin/mc && \
    apk del curl

WORKDIR /app

# ARMADILHA COM INCIDENTE NO HISTÓRICO (#156/#157/#126): esta imagem NÃO enxerga
# o node_modules do app. Toda dependência importada por scripts/alarme-jobs.mjs
# e por scripts/lib/resend-alarme.mjs precisa estar NESTA linha — inclusive
# `resend`, que entra por `await import()` dentro de um try/catch e degradaria
# em silêncio como "falha de envio" se faltasse. Versões pinadas iguais às do
# pnpm-lock.yaml. `npm install` e não `pnpm install` pelo mesmo motivo do
# infra/retencao/Dockerfile: o lockfile do repo puxaria Next/React/Playwright.
RUN npm install --no-package-lock --no-audit --no-fund postgres@3.4.9 resend@6.18.1

# Caminhos relativos à RAIZ DO REPO: o Easypanel builda com o contexto na raiz.
# COPY do arquivo específico, não de `scripts/lib/` inteiro — o diretório tem
# `.ts` de seed que não têm nada que fazer nesta imagem.
COPY scripts/alarme-jobs.mjs ./scripts/alarme-jobs.mjs
COPY scripts/lib/resend-alarme.mjs ./scripts/lib/resend-alarme.mjs
COPY infra/alarme/agendador.sh ./agendador.sh
RUN chmod +x agendador.sh

# CMD, não ENTRYPOINT: com ENTRYPOINT em exec-form, um `docker run ... node
# scripts/alarme-jobs.mjs` viraria argumento do agendador, que entraria no laço
# normal — e o operador leria o resultado de uma coisa achando que leu o de
# outra. Com CMD, o argumento SUBSTITUI o comando.
CMD ["/app/agendador.sh"]
```

- [ ] **Passo 3: alvo `alarme` em `scripts/ci/carga-imagens-infra.sh` — edição ADITIVA**

> ⚠️ O script já tem `escalonamento`, `backup`, `billing` e **`retencao`**. Não substituir o bloco `case` (linhas ~554-569) nem a lista de tags: **acrescentar**. Conferir com `git diff` que nenhuma linha de `retencao` sumiu antes de commitar.

Junto das outras tags:

```bash
readonly TAG_ALARME="iris-alarme-ci:local"
```

Depois de `carga_retencao()`:

```bash
carga_alarme() {
	log_info "buildando ${TAG_ALARME}..."
	docker build -f infra/alarme/Dockerfile -t "${TAG_ALARME}" .

	esperar_falha_com \
		"alarme: carga por caminho ABSOLUTO" \
		"variável de ambiente ausente: ALARME_DATABASE_URL" \
		-- docker run --rm "${TAG_ALARME}" \
		node /app/scripts/alarme-jobs.mjs

	esperar_sucesso \
		"alarme: todo import resolve na imagem (inclusive os dinâmicos)" \
		-- bash -c "docker run --rm -i -w /app -e ALVO=/app/scripts '${TAG_ALARME}' node --input-type=module < scripts/ci/verificar-deps-imagem.mjs"

	esperar_sucesso \
		"alarme: resend presente (import dinâmico do envio de alarme)" \
		-- docker run --rm "${TAG_ALARME}" node -e "import('resend').then(() => process.exit(0)).catch(() => process.exit(1))"

	esperar_sucesso \
		"alarme: sintaxe do agendador.sh (bash presente)" \
		-- docker run --rm "${TAG_ALARME}" bash -n /app/agendador.sh

	esperar_sucesso \
		"alarme: /app/agendador.sh executável (caminho fixo do CMD)" \
		-- docker run --rm "${TAG_ALARME}" test -x /app/agendador.sh

	esperar_sucesso \
		"alarme: mc instalado e executável" \
		-- docker run --rm "${TAG_ALARME}" mc --version

	esperar_falha_com \
		"alarme: agendador para na guarda de env (não entra em laço)" \
		"ALARME_DATABASE_URL" \
		-- docker run --rm "${TAG_ALARME}" /app/agendador.sh
}
```

No `case` do `main`, acrescentar **uma linha** e **uma chamada** em `todos`, e o novo alvo na mensagem de erro:

```bash
retencao) carga_retencao ;;
alarme) carga_alarme ;;          # <- linha nova
todos)
	carga_escalonamento
	carga_backup
	carga_billing
	carga_retencao
	carga_alarme                 # <- linha nova
	;;
*)
	log_error "alvo desconhecido: ${alvo} — use 'escalonamento', 'backup', 'billing', 'retencao', 'alarme' ou nenhum (todos)."
```

- [ ] **Passo 4: rodar e ver passar**

```bash
bash scripts/ci/carga-imagens-infra.sh alarme
git diff scripts/ci/carga-imagens-infra.sh   # confirmar que a mudança é SÓ aditiva
```

Esperado: exit 0, sete linhas `[carga-imagens] OK: alarme: ...`, e o diff sem nenhuma linha removida.

- [ ] **Passo 5: commit**

```bash
git add infra/alarme/Dockerfile infra/alarme/agendador.sh scripts/ci/carga-imagens-infra.sh
git commit -m "$(cat <<'EOF'
build(infra): add image, scheduler loop and load test for the alarm job

Mirrors the escalation/retention job images: no shared node_modules with
the app, mc installed for the offsite freshness check, and an explicit
load assertion that `resend` resolves — it is imported dynamically inside
a try/catch and its absence would degrade silently into "send failed".

Refs #294
EOF
)"
```

---

### Task 9: Runbook de provisionamento em `infra/README.md`

**Files:**

- Modify: `infra/README.md` — nova seção `## Alarme automático de jobs de infra (#294)` no fim do arquivo, e uma linha nova na seção "Teste de carga das imagens de infra (#157)".

**Interfaces:**

- Consumes: fatos das Tasks 1–8 (nomes de env, caminhos, limites, contrato de exit).
- Produces: o texto que a Task 10 executa passo a passo.

- [ ] **Passo 1: acrescentar o alvo na seção de teste de carga**

```bash
scripts/ci/carga-imagens-infra.sh alarme           # só a imagem do detector de alarme
```

- [ ] **Passo 2: escrever a seção nova**

````markdown
## Alarme automático de jobs de infra (#294)

Detector que fecha o buraco documentado na #288: `billing`, `escalonamento` e
`backup` têm heartbeat, mas **nenhum tem observador** — o sinal existe, o
alarme não. Este serviço, `iris-alarme`, roda de hora em hora e manda e-mail
quando o **efeito** de um desses jobs parado aparece no banco ou no bucket.

**Por que efeito, e não heartbeat de outro container:** um serviço que nunca
foi provisionado não tem heartbeat para congelar — foi assim que a pendência
de billing atravessou de 04/08 a 13/08 sem ninguém notar (#288). Os volumes
`/heartbeat` também são privados por serviço; este detector não tem acesso a
eles nem precisa.

**Por que o detector não faz `SELECT` nas tabelas:** `billing_cycle` e
`alerta_risco_clinico` estão sob `FORCE ROW LEVEL SECURITY` com policies
`TO app_role`. Uma role de infra com `GRANT SELECT` na tabela leria **zero
linhas, sem erro** — o alarme ficaria verde para sempre. As duas checagens de
banco passam por `app_alarme_billing_atrasado()` e
`app_alarme_escalonamento_atrasado()`, `SECURITY DEFINER` (migração `0129`),
que devolvem só contagem, `clinic_id` e timestamp. Se um dia alguém precisar
de mais dado no alerta, **muda a função**, não o grant.

### As três checagens

| Checagem         | O que olha                                                                      | Limite |
| ---------------- | ------------------------------------------------------------------------------- | ------ |
| `billing`        | `billing_cycle` com `status = 'aberto'` e `fim` vencido                         | 2h     |
| `escalonamento`  | `alerta_risco_clinico` com `status = 'aberto'` e `prazo_reconhecimento` vencido | 10min  |
| `backup-offsite` | `lastModified` do objeto mais recente no bucket off-site (`mc ls --json`)       | 36h    |

Cada checagem termina em um de **três** estados:

- `ok` — nada errado.
- `problema` — achou o efeito de um job parado. **Manda e-mail.**
- `indeterminado` — não conseguiu nem checar (env ausente, banco/bucket fora
  do ar). **Loga e não manda e-mail** — em dev e CI as `OFFSITE_S3_*` não
  existem, e um e-mail diário por isso ensinaria a ignorar a caixa de entrada.

Cada `problema` manda **um e-mail por dia UTC** (não por hora) — marcador
`.alertado-<checagem>-YYYY-MM-DD` em `/heartbeat`, mesmo padrão do
`.ultimo-backup-YYYY-MM-DD` do serviço de backup. O marcador só é gravado
**depois** de o e-mail sair: entrega que falhou tenta de novo no tick seguinte.

**Código de saída do script:** `0` = a varredura rodou até o fim (com ou sem
problema encontrado). `1` = o **detector** não conseguiu cumprir o papel dele
(env obrigatória ausente, falha ao enviar e-mail). `1` aqui nunca significa
"job de infra parado" — isso vai nas linhas `ATENÇÃO` do log.

### Passo 1 — role de banco (uma vez por ambiente)

A migração `0129_alarme_jobs_infra.sql` cria a role de privilégio
`iris_alarme` (NOLOGIN). Criar o usuário de login, como superuser:

```sql
CREATE ROLE iris_alarme_login LOGIN PASSWORD '<senha forte>' IN ROLE iris_alarme;
```

`ALARME_DATABASE_URL=postgres://iris_alarme_login:<senha>@<host>:5432/iris`.

Conferir que a role enxerga (e só isso):

```sql
-- como iris_alarme_login:
SELECT * FROM app_alarme_billing_atrasado('2 hours');  -- responde
SELECT 1 FROM billing_cycle LIMIT 1;                   -- permission denied (esperado)
```

### Passo 2 — criar o serviço no Easypanel

Mesmo desenho dos outros serviços de job (ver §Motor de escalonamento acima
para a explicação de por que o Easypanel não tem cron).

1. **Novo serviço** → tipo **Aplicativo** → nome `alarme` → Code Source
   `romulosutil/Iris` → Builder **Dockerfile**, path `infra/alarme/Dockerfile`,
   build context na **raiz**, branch `main`.
2. **Volume persistente** em **`/heartbeat`** — sem ele os marcadores de dedup
   somem a cada restart e um problema persistente volta a mandar e-mail a cada
   redeploy.
3. **Env vars** (aba `Ambiente`):

   ```
   ALARME_DATABASE_URL=postgres://iris_alarme_login:<senha>@espectro-mvp_iris-postgres:5432/iris
   ALARME_HEARTBEAT_DIR=/heartbeat
   INTERVALO_S=3600
   EMAIL_PROVIDER_API_KEY=<a mesma chave Resend do resto do projeto>
   RESEND_FROM_EMAIL=notificacoes@irisclinica.ia.br
   ALARME_EMAIL_DESTINO=<e-mail do Rômulo>
   OFFSITE_S3_ENDPOINT=<o mesmo do serviço backup>
   OFFSITE_S3_ACCESS_KEY=<credencial de LEITURA — não a write-only do backup>
   OFFSITE_S3_SECRET_KEY=<idem>
   OFFSITE_S3_BUCKET=iris-backups-offsite
   ```

   > A credencial S3 deste serviço só precisa de `ListBucket`. Gerar uma de
   > leitura em vez de reusar a write-only do `backup` evita que um vazamento
   > deste serviço comprometa a credencial de escrita do backup.
   >
   > O painel do Easypanel expõe env em claro: um screenshot desta tela vaza
   > todos esses segredos. E **salvar não aplica** — é preciso clicar
   > "Implantar".

4. **Comando** (aba `Avançado`): `/app/agendador.sh`.
5. **Réplicas: 1.**

### Como saber que deu certo

Logo depois do deploy, **Logs** do serviço:

```
[agendador-alarme] 2026-08-25T20:00:00Z ativo. intervalo=3600s · heartbeat=/heartbeat/.ultima-verificacao
```

Console do serviço:

```bash
cat /heartbeat/.ultima-verificacao
```

Timestamp ISO de menos de uma hora atrás.

### Ensaio manual — **alarme não testado é alarme que não existe**

Não espere um problema real acontecer. No Console do serviço `alarme`:

```bash
node /app/scripts/alarme-jobs.mjs
```

Esperado: linha `[alarme-jobs] ATENÇÃO: <checagem> — ...` no stdout **e** um
e-mail em `ALARME_EMAIL_DESTINO` dentro de minutos. Rodar de novo no mesmo dia
UTC: a linha `ATENÇÃO` reaparece, mas **sem** e-mail novo (dedup). Depois:

```bash
ls -a /heartbeat/     # .alertado-<checagem>-YYYY-MM-DD presente
```

Reiniciar o serviço no painel e conferir que o marcador continua lá — se
sumiu, o volume persistente do passo 2 não foi criado.

### O que fazer se der errado

1. **Nenhum e-mail chega, mas a linha `ATENÇÃO` aparece no log.** Ver o texto
   depois de `[alarme-jobs] <checagem>: FALHA ao enviar e-mail:` — geralmente
   `EMAIL_PROVIDER_API_KEY` ou `ALARME_EMAIL_DESTINO` ausente.
2. **Todas as checagens dizem `ok` e você sabe que não está tudo ok.** Testar
   `SELECT * FROM app_alarme_billing_atrasado('2 hours')` como
   `iris_alarme_login`. Se devolver `total = 0` com um ciclo vencido no banco,
   alguém tirou o `SECURITY DEFINER` da função da `0129` e o detector ficou
   cego — este é o modo de falha mais perigoso do serviço inteiro.
3. **`backup-offsite` sempre `INDETERMINADO` com "variável(is) ausente(s)".**
   As `OFFSITE_S3_*` não foram copiadas para este serviço — cada serviço no
   Easypanel tem seu próprio conjunto.
4. **`mc: command not found`.** A imagem não instalou o MinIO Client; o
   `Dockerfile` regrediu.
````

- [ ] **Passo 3: conferir os fatos citados contra os arquivos (não de memória)**

```bash
grep -n "ALARME_DATABASE_URL\|ALARME_HEARTBEAT_DIR\|ALARME_EMAIL_DESTINO" scripts/alarme-jobs.mjs infra/alarme/agendador.sh
grep -n "LIMITE_BILLING\|LIMITE_ESCALONAMENTO\|LIMITE_BACKUP_H" scripts/alarme-jobs.mjs
grep -n "app_alarme_" db/migrations/0129_alarme_jobs_infra.sql scripts/alarme-jobs.mjs
```

Cada limite e cada nome de env citado no runbook tem que aparecer no código. Divergência aqui vira diagnóstico falso às 3h da manhã.

- [ ] **Passo 4: formatar e commitar**

```bash
pnpm exec prettier --write infra/README.md
git add infra/README.md
git commit -m "$(cat <<'EOF'
docs(infra): add provisioning runbook for the automated job alarm

Refs #294
EOF
)"
```

---

### Task 10: Provisionar e exercitar — **o Rômulo executa**

Esta tarefa não tem código. Exige o painel do Easypanel (via única do Rômulo) e
o segredo Resend/S3 de produção.

**Files:** nenhum no repo. O artefato é o serviço `alarme` no ar e um e-mail de
alarme recebido de verdade.

**Interfaces:**

- Consumes: o runbook da Task 9, já em `main`.
- Produces: as três evidências que fecham a Definição de Pronto da #294.

- [ ] **Passo 1: garantir que Tasks 1–9 estão em `main`**

```bash
git log --oneline -10 origin/main -- infra/alarme/ db/migrations/0129_alarme_jobs_infra.sql scripts/alarme-jobs.mjs
```

- [ ] **Passo 2: seguir `infra/README.md` §"Alarme automático de jobs de infra (#294)"**

Passo 1 (role de banco, **incluindo as duas consultas de conferência**) e
Passo 2 (serviço no Easypanel).

- [ ] **Passo 3: medir que o serviço está vivo**

Quatro evidências, na ordem — a primeira que falhar interrompe:

1. Log com `[agendador-alarme] ... ativo. intervalo=3600s`.
2. `cat /heartbeat/.ultima-verificacao` devolve timestamp recente.
3. `node /app/scripts/alarme-jobs.mjs` à mão: as três checagens aparecem no
   log, `backup-offsite` **não** `INDETERMINADO` (se estiver, faltou env).
4. Como `iris_alarme_login`: `SELECT * FROM app_alarme_billing_atrasado('2 hours')`
   responde sem `permission denied`. Sem isso, os `ok` do passo 3 não valem nada.

- [ ] **Passo 4: exercitar de propósito — as duas pontas**

A issue pede "derrubar um serviço de propósito e **medir** que o alerta chegou".
Duas provas, não uma:

1. **`backup-offsite` (barata, sem tocar em produção):** apontar
   `OFFSITE_S3_BUCKET` para um bucket vazio temporariamente, rodar à mão,
   confirmar e-mail. Reverter a env e implantar.
2. **`billing` (a que originou a #288 — não pular):** na **clínica de teste**,
   plantar um `billing_cycle` com `status='aberto'` e `fim = now() - 5 hours`,
   rodar à mão, confirmar e-mail, e depois **remover a linha de teste**. Esta é
   a única prova de que a checagem que motivou a issue realmente enxerga —
   `backup-offsite` sozinha não exercita nem a role, nem a RLS, nem as funções
   da `0129`.

Em ambos: rodar uma segunda vez no mesmo dia e confirmar **nenhum** e-mail novo.

- [ ] **Passo 5: fechar a issue com evidência**

Colar na #294: as quatro evidências do Passo 3, a saída dos dois ensaios do
Passo 4 e os e-mails recebidos (sem segredo nenhum neles — nem no print).
Marcar os três checkboxes da Definição de Pronto.

> Fechar com `Closes #294` no PR final **em inglês** — PR em pt-BR não fecha
> issue. Conferir com `gh issue view 294` depois do merge.

---

## Autorrevisão

**Cobertura da spec (#294).** Os três checkboxes da Definição de Pronto:

| Checkbox da #294                           | Tarefa                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Um detector por serviço, rodando sozinho   | Tasks 5 e 6 (as três checagens) + Task 7 (varredura) + Tasks 8/10 (serviço no ar) |
| O alerta chega fora do painel              | Task 3 (e-mail via Resend) + Task 9 (destino configurável)                        |
| Exercitado — derrubar de propósito e medir | Task 10, passos 4-5 — **duas** checagens exercitadas, incluindo billing           |

**O defeito que este plano existe para não cometer.** A versão anterior deste
plano concedia `GRANT SELECT` de coluna direto nas duas tabelas. Sob
`FORCE ROW LEVEL SECURITY` com policies `TO app_role`, isso devolve zero linhas
sem erro: o detector reportaria "tudo ok" para sempre, e nenhum dos passos de
verificação do plano pegaria — porque "sem problema" e "sem permissão" produzem
a mesma saída. As Tasks 1 e 2 existem nessa ordem, e a Task 2 é uma tarefa
separada, exatamente para que essa distinção seja **medida** e não presumida.

**Placeholders.** Nenhum "TBD"/"implementar depois". A Task 10 é
deliberadamente do Rômulo (painel + segredo de produção), com passo a passo
completo e critério de sucesso explícito.

**Atomização.** Dez tarefas, nove commits. Cada uma é rejeitável isoladamente:
a regex do backup (T6) cair não derruba o dedup (T4) nem as checagens de banco
(T5); o runbook (T9) é revisável sem o Dockerfile (T8). Testes vivem na mesma
tarefa que o código que cobrem. Tasks 5 e 6 não dependem uma da outra.

**Edição aditiva.** Task 8 toca `scripts/ci/carga-imagens-infra.sh`, que já tem
quatro alvos — o alvo `retencao` some sem conflito se o `case` for substituído
em vez de acrescentado. O passo tem um `git diff` explícito para provar que o
diff é só aditivo.

**Fora de escopo, dito na cara.** `arquivamento` (#293) não tem checagem aqui.
O código existe (`infra/arquivamento/`), mas o serviço no painel é a incógnita
da própria #293; acrescentar `verificarArquivamento` é o mesmo molde de
`verificarBilling` e entra numa issue de seguimento quando a #293 fechar.

**Consistência de nomes.** `ALARME_DATABASE_URL` / `ALARME_HEARTBEAT_DIR` /
`ALARME_EMAIL_DESTINO` idênticos entre `scripts/alarme-jobs.mjs` (T4-T7),
`infra/alarme/agendador.sh` (T8) e o runbook (T9). Nomes de coluna
(`prazo_reconhecimento`, `billing_cycle.fim`, `billing_cycle.status`) e os
valores de enum `'aberto'` conferidos contra `db/migrations/0049` e `0071:99-106`.
`when` do `_journal.json` conferido contra a entrada `0128` (`1787655236724`).
