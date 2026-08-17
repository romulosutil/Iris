# Fatia A — Cadastro self-service: plano de implementação

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para rastreamento.

**Objetivo:** um profissional de saúde cria a própria conta e a própria clínica
pelo site, verifica o e-mail, cadastra o 2º fator e entra no app com um trial de
7 dias correndo — sem nenhuma intervenção do fundador.

**Arquitetura:** Server Action fina (`"use server"`) apenas deriva a request e
chama um núcleo `server-only` em `logic.ts`; o núcleo cria clínica, usuário
coordenador e aceite de termos de forma **idempotente e retomável**, porque
`auth.api.signUpEmail` roda fora de qualquer transação nossa. O relógio do trial
é dado em `clinic`, e nada nesta fatia bloqueia acesso — o gate é da Fatia B.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Better Auth
(plugin twoFactor), Drizzle ORM + Postgres com RLS, Vitest, Playwright, Resend.

**Spec:** `docs/superpowers/specs/2026-07-30-cadastro-self-service-e-trial-design.md`
**Issues:** #163 (esta fatia), #159 (Fatia B, depois).

## Restrições globais

- Copy e documentação **em pt-BR**. Commits em Conventional Commits, corpo em pt-BR.
- **Nunca** exportar de um módulo `"use server"` uma função que aceite `ctx` — é
  endpoint invocável pelo cliente e torna o `ctx` forjável (#55). Núcleo com `ctx`
  vive em `logic.ts` com `import "server-only"` e **sem** `"use server"`.
- Todo acesso a dado de paciente passa por `withTenant` (`src/db/rls.ts`).
  `authDb` só toca identidade (`app_user`, `clinic`, `user_role`, `auth_*`).
- Toda tabela nova nasce com RLS habilitada, policies explícitas e teste em
  `pnpm test:rls`. Suíte verde com muitos "skipped" é vermelho disfarçado.
- Migrations são **hand-written** em `db/migrations/NNNN_nome.sql` + entrada no
  `db/migrations/meta/_journal.json`. O campo `when` de uma migração nova precisa
  ser **maior que o maior `when` já aplicado** (hoje `1785421566000`), senão o
  drizzle a considera aplicada e a pula em silêncio. Use
  `when = anterior + 1000`.
- ⚠️ Antes da primeira migração: `db/migrations/0055_fix_purga_report_oracle.sql`
  existe no diretório mas **não aparece no `_journal.json`** (o idx 55 aponta para
  `0056_alerta_risco_email_rt`). Confirme com o Rômulo se isso é intencional
  **antes** de mexer no journal; não "conserte" por conta própria.
- Nenhum componente novo hardcoded: use o design system
  (`src/components/ui/*`, `docs/ux/design-system-espectro-brutal.md`).
  Acessibilidade é compromisso de primeira classe, não polimento.
- Comandos: `pnpm test` (unit/int), `pnpm test:rls`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test:e2e`. Postgres local sobe com
  `docker compose -f infra/docker-compose.yml up -d` (porta 5433); pnpm via
  `corepack pnpm`.
- Se `pnpm build` falhar em `.next/dev/types/**` com erro em `validator.ts`
  (`LayoutRoutes`), é artefato stale: `rm -rf .next && pnpm build`.

## Dependências externas (não são código, e travam a fatia)

1. **Termos de Uso e Política de Privacidade publicados e versionados.** A Task 7
   fixa `VERSAO_TERMO = "2026-07-30"` e a Task 8 linka as páginas. Sem texto
   publicado, o aceite aponta para o nada e a fatia não pode ir a produção.
   `docs/legal/` só muda com confirmação do Rômulo.
2. **`RESEND_API_KEY` e `EMAIL_REMETENTE`** presentes no runtime do `iris-app`
   (a Task 3 degrada em silêncio sem elas — de propósito, mas em produção isso
   significa cadastro sem e-mail de verificação).
3. **#80 (tela de enrollment de MFA)** não está neste plano. Todo cadastro novo
   atravessa `/mfa/setup` no minuto zero; se a conversão importar, puxe a #80 para
   dentro desta fatia antes de divulgar o cadastro.

## Estrutura de arquivos

| Arquivo                                                  | Responsabilidade                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `db/migrations/0057_cadastro_self_service.sql`           | Colunas de trial em `clinic`, registro profissional em `app_user`, grants                    |
| `db/migrations/0058_professional_consent.sql`            | Tabela de aceite de termos do profissional + RLS                                             |
| `db/migrations/0059_email_verificado_backfill.sql`       | Backfill de `email_verified` das contas pré-existentes                                       |
| `src/db/schema.ts`                                       | Declaração Drizzle das colunas/tabela novas                                                  |
| `src/lib/email/transacional.ts`                          | Adapter de e-mail genérico (verificação, reset). **Não** toca `resend.ts` do alerta de risco |
| `src/auth/auth.ts`                                       | Liga `requireEmailVerification`, `sendVerificationEmail`, `sendResetPassword`                |
| `src/auth/cadastro.ts`                                   | Núcleo `server-only` do cadastro: idempotente e retomável                                    |
| `src/app/(auth)/cadastro/actions.ts`                     | Action fina `"use server"`                                                                   |
| `src/app/(auth)/cadastro/page.tsx` + `cadastro-form.tsx` | UI do cadastro                                                                               |
| `src/app/(auth)/cadastro/verifique-email/page.tsx`       | Tela de "confira seu e-mail"                                                                 |
| `src/app/(auth)/esqueci-senha/…` e `redefinir-senha/…`   | Fluxo de recuperação                                                                         |
| `src/lib/rate-limit.ts`                                  | Contador de tentativas por IP e por e-mail                                                   |
| `src/lib/trial.ts`                                       | Dias restantes de trial no timezone da clínica                                               |
| `src/components/app/faixa-trial.tsx`                     | Faixa persistente no shell                                                                   |
| `e2e/cadastro.spec.ts`                                   | Jornada completa                                                                             |

---

### Task 1: Schema do trial e do registro profissional

**Files:**

- Create: `db/migrations/0057_cadastro_self_service.sql`
- Modify: `db/migrations/meta/_journal.json`
- Modify: `src/db/schema.ts` (tabela `clinic`, ~linha 215; tabela `appUser`)
- Test: `src/db/cadastro-self-service.int.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: `clinic.trialComecoEm: Date`, `clinic.trialDias: number`,
  `appUser.conselho: string | null`, `appUser.registroNumero: string | null`,
  `appUser.registroUf: string | null`.

- [ ] **Step 1: Escreva o teste que falha**

`src/db/cadastro-self-service.int.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("schema do cadastro self-service", () => {
  it("clinic tem trial_comeco_em com default e trial_dias = 7", async () => {
    const r = await db.execute(sql`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_name = 'clinic'
        and column_name in ('trial_comeco_em', 'trial_dias')
      order by column_name`);
    const linhas = r as unknown as {
      column_name: string;
      column_default: string | null;
      is_nullable: string;
    }[];
    expect(linhas.map((l) => l.column_name)).toEqual([
      "trial_comeco_em",
      "trial_dias",
    ]);
    expect(linhas.every((l) => l.is_nullable === "NO")).toBe(true);
    expect(linhas[1]!.column_default).toContain("7");
  });

  it("app_user guarda conselho, número e UF do registro", async () => {
    const r = await db.execute(sql`
      select column_name from information_schema.columns
      where table_name = 'app_user'
        and column_name in ('conselho', 'registro_numero', 'registro_uf')`);
    expect((r as unknown as { column_name: string }[]).length).toBe(3);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test:rls -t "schema do cadastro self-service"`
Expected: FAIL — as colunas não existem.

- [ ] **Step 3: Escreva a migração**

`db/migrations/0057_cadastro_self_service.sql`:

```sql
-- Fatia A (#163): relógio do trial na clínica e registro profissional no usuário.
-- Trial começa no signup. `trial_dias` é coluna (não constante) porque o valor
-- é hipótese de produto e vai mudar sem migração de código.
ALTER TABLE clinic
  ADD COLUMN trial_comeco_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN trial_dias integer NOT NULL DEFAULT 7;

-- Registro profissional declarado no cadastro (D6): não é verificado na API do
-- conselho — o valor está na trilha auditável, não na barreira.
ALTER TABLE app_user
  ADD COLUMN conselho text,
  ADD COLUMN registro_numero text,
  ADD COLUMN registro_uf text;

ALTER TABLE app_user
  ADD CONSTRAINT app_user_conselho_check
  CHECK (conselho IS NULL OR conselho IN ('crp','crfa','crefito','crm','outro'));

-- Grant de COLUNA faltando aparece como "permission denied for table app_user",
-- diagnóstico caro. Concede explicitamente para os dois papéis de runtime.
GRANT SELECT (conselho, registro_numero, registro_uf) ON app_user TO app_role;
GRANT SELECT (conselho, registro_numero, registro_uf),
      UPDATE (conselho, registro_numero, registro_uf) ON app_user TO iris_auth;
GRANT SELECT (trial_comeco_em, trial_dias) ON clinic TO app_role, iris_auth;
```

- [ ] **Step 4: Registre no journal**

Acrescente ao fim de `entries` em `db/migrations/meta/_journal.json`:

```json
{
  "idx": 56,
  "version": "7",
  "when": 1785421567000,
  "tag": "0057_cadastro_self_service",
  "breakpoints": true
}
```

- [ ] **Step 5: Declare no schema Drizzle**

Em `src/db/schema.ts`, dentro de `pgTable("clinic", …)`:

```ts
  // Fatia A (#163): relógio do trial. Começa no signup; `trial_dias` é dado,
  // não constante, porque o valor é hipótese de produto (spec §2, D3).
  trialComecoEm: timestamp("trial_comeco_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  trialDias: integer("trial_dias").notNull().default(7),
```

E, dentro de `pgTable("app_user", …)`:

```ts
  // Registro profissional DECLARADO no cadastro aberto (spec §2, D6). Não há
  // verificação na API do conselho — o valor está na trilha, não na barreira.
  conselho: text("conselho"),
  registroNumero: text("registro_numero"),
  registroUf: text("registro_uf"),
```

- [ ] **Step 6: Aplique e rode o teste**

Run: `pnpm db:migrate && pnpm test:rls -t "schema do cadastro self-service"`
Expected: PASS (2 testes).
Se `db:migrate` falhar por tracking dessincronizado do ambiente local, aplique o
SQL à mão via `psql` e siga — é um problema conhecido do dev DB, não da migração.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0057_cadastro_self_service.sql db/migrations/meta/_journal.json src/db/schema.ts src/db/cadastro-self-service.int.test.ts
git commit -m "feat(db): relógio de trial em clinic e registro profissional em app_user"
```

---

### Task 2: Tabela `professional_consent`

**Files:**

- Create: `db/migrations/0058_professional_consent.sql`
- Modify: `db/migrations/meta/_journal.json`, `src/db/schema.ts`
- Test: `src/db/professional-consent.int.test.ts`

**Interfaces:**

- Consumes: Task 1 (nada além do banco migrado).
- Produces: `professionalConsent` (Drizzle) com colunas `id`, `userId`,
  `clinicId`, `versaoTermo`, `aceitoEm`, `ip`, `userAgent`.

> **Não confundir** com `.specs/features/consentimento-titular-adulto/`
> (enum `autoconsentimento_titular_adulto`, migração 0049), que é o **paciente
> adulto** consentindo com o próprio tratamento. Aqui é o **profissional
> aceitando os termos de uso do Iris**: outro titular, outra base legal, outra
> tabela. Não fundir.

- [ ] **Step 1: Escreva o teste que falha**

`src/db/professional-consent.int.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

describe("professional_consent", () => {
  it("tem RLS habilitada", async () => {
    const r = await db.execute(sql`
      select relrowsecurity from pg_class where relname = 'professional_consent'`);
    expect(
      (r as unknown as { relrowsecurity: boolean }[])[0]?.relrowsecurity,
    ).toBe(true);
  });

  it("app_role não tem UPDATE nem DELETE (aceite é imutável)", async () => {
    const r = await db.execute(sql`
      select privilege_type from information_schema.role_table_grants
      where table_name = 'professional_consent' and grantee = 'app_role'`);
    const privs = (r as unknown as { privilege_type: string }[]).map(
      (p) => p.privilege_type,
    );
    expect(privs).not.toContain("UPDATE");
    expect(privs).not.toContain("DELETE");
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test:rls -t "professional_consent"`
Expected: FAIL — relação inexistente.

- [ ] **Step 3: Escreva a migração**

`db/migrations/0058_professional_consent.sql`:

```sql
-- Fatia A (#163): aceite de termos do PROFISSIONAL adulto. Distinto do
-- consentimento do titular do tratamento (migração 0049) — outro titular,
-- outra base legal. Registro auditável e imutável pela aplicação.
CREATE TABLE professional_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  clinic_id uuid NOT NULL REFERENCES clinic(id),
  versao_termo text NOT NULL,
  aceito_em timestamptz NOT NULL DEFAULT now(),
  -- `text`, não `inet`: o valor vem de X-Forwarded-For (pode ser vazio ou lista)
  -- e o schema Drizzle o declara como text. Tipo divergente entre DDL e schema é
  -- erro que só aparece em runtime.
  ip text,
  user_agent text
);

CREATE INDEX professional_consent_user_idx ON professional_consent (user_id);
ALTER TABLE professional_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_consent FORCE ROW LEVEL SECURITY;

-- Leitura escopada ao tenant ativo, como todo o resto do produto.
CREATE POLICY professional_consent_select ON professional_consent
  FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- Escrita só pelo caminho de identidade (iris_auth), que é quem roda o cadastro
-- antes de existir GUC de tenant. app_role NÃO recebe INSERT/UPDATE/DELETE:
-- aceite é imutável para a aplicação de produto.
GRANT SELECT ON professional_consent TO app_role;
GRANT SELECT, INSERT ON professional_consent TO iris_auth;

CREATE POLICY professional_consent_auth_all ON professional_consent
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
```

- [ ] **Step 4: Journal + schema Drizzle**

Entrada nova no `_journal.json`: `idx` 57, `when` `1785421568000`,
`tag` `"0058_professional_consent"`, `version` `"7"`, `breakpoints` `true`.

Em `src/db/schema.ts`:

```ts
/**
 * Aceite dos termos de uso pelo PROFISSIONAL (adulto) no cadastro self-service.
 * Não confundir com o consentimento do titular do tratamento (paciente) —
 * outro titular, outra base legal. Imutável para a aplicação de produto.
 */
export const professionalConsent = pgTable("professional_consent", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinic.id),
  versaoTermo: text("versao_termo").notNull(),
  aceitoEm: timestamp("aceito_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});
```

- [ ] **Step 5: Aplique e rode**

Run: `pnpm db:migrate && pnpm test:rls -t "professional_consent"`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0058_professional_consent.sql db/migrations/meta/_journal.json src/db/schema.ts src/db/professional-consent.int.test.ts
git commit -m "feat(db): professional_consent — aceite de termos do profissional adulto"
```

---

### Task 3: Adapter de e-mail transacional

**Files:**

- Create: `src/lib/email/transacional.ts`
- Test: `src/lib/email/transacional.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: `enviarEmailTransacional(input: EmailTransacionalInput): Promise<{ enviado: boolean }>`
  onde `EmailTransacionalInput = { para: string; assunto: string; texto: string; html: string }`.

> `src/lib/email/resend.ts` tem o tipo `RtAlertaEmailInput` **fechado de
> propósito** para o alerta de risco (§4.2.1 do produto). Não alargue aquele
> tipo nem reuse a função dele: este é um caminho novo.

- [ ] **Step 1: Escreva o teste que falha**

`src/lib/email/transacional.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: enviar };
  },
}));

describe("enviarEmailTransacional", () => {
  beforeEach(() => {
    enviar.mockReset();
    process.env.RESEND_API_KEY = "re_teste";
    process.env.EMAIL_REMETENTE = "Iris <nao-responda@irisclinica.ia.br>";
  });

  it("envia com remetente configurado e devolve enviado: true", async () => {
    enviar.mockResolvedValue({ data: { id: "abc" }, error: null });
    const { enviarEmailTransacional } = await import("./transacional");
    const r = await enviarEmailTransacional({
      para: "pessoa@exemplo.com.br",
      assunto: "Confirme seu e-mail",
      texto: "Link",
      html: "<p>Link</p>",
    });
    expect(r.enviado).toBe(true);
    expect(enviar).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "pessoa@exemplo.com.br",
        subject: "Confirme seu e-mail",
      }),
    );
  });

  it("degrada sem lançar quando o provedor falha", async () => {
    enviar.mockResolvedValue({ data: null, error: { message: "limite" } });
    const { enviarEmailTransacional } = await import("./transacional");
    await expect(
      enviarEmailTransacional({
        para: "a@b.com",
        assunto: "x",
        texto: "y",
        html: "<p>y</p>",
      }),
    ).resolves.toEqual({ enviado: false });
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test src/lib/email/transacional.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente o mínimo**

`src/lib/email/transacional.ts`:

```ts
import "server-only";

export type EmailTransacionalInput = {
  para: string;
  assunto: string;
  texto: string;
  html: string;
};

/**
 * Canal de e-mail transacional do produto (verificação de conta, recuperação de
 * senha). Separado de propósito do `resend.ts` do alerta de risco, cujo tipo é
 * fechado para não virar canal genérico.
 *
 * Falha de envio NÃO lança: quem chama (cadastro, reset) não pode quebrar por
 * indisponibilidade do provedor. O retorno diz se saiu.
 */
export async function enviarEmailTransacional(
  input: EmailTransacionalInput,
): Promise<{ enviado: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  if (!apiKey || !remetente) return { enviado: false };

  try {
    const { Resend } = await import("resend");
    const { error } = await new Resend(apiKey).emails.send({
      from: remetente,
      to: input.para,
      subject: input.assunto,
      text: input.texto,
      html: input.html,
    });
    return { enviado: !error };
  } catch {
    return { enviado: false };
  }
}
```

- [ ] **Step 4: Rode os testes**

Run: `pnpm test src/lib/email/transacional.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Garanta que a dependência chega na imagem**

`resend` já está no `package.json` da raiz, mas o `Dockerfile.migrate` lista
`COPY` e instala dependências à mão — imagem sem a lib passa verde no teste de
carga porque o import é dinâmico e degrada em silêncio (#156/#157). Confirme que
`src/lib/email/` está entre os caminhos copiados no Dockerfile do app **e** do
job antes de considerar esta task pronta.

Run: `grep -n "COPY" Dockerfile Dockerfile.migrate`

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/transacional.ts src/lib/email/transacional.test.ts
git commit -m "feat(email): adapter transacional genérico para verificação e reset"
```

---

### Task 4: Better Auth — verificação de e-mail e reset, com backfill

**Files:**

- Modify: `src/auth/auth.ts`
- Create: `db/migrations/0059_email_verificado_backfill.sql`
- Modify: `db/migrations/meta/_journal.json`
- Test: `src/auth/verificacao.int.test.ts`

**Interfaces:**

- Consumes: `enviarEmailTransacional` (Task 3).
- Produces: `auth` com `emailVerification` e `sendResetPassword` configurados.

> **O backfill vai no mesmo commit que liga a flag.** Ligar
> `requireEmailVerification` sem ele tranca as contas criadas por `seed:clinic`,
> que nunca verificaram nada — inclusive a primeira usuária real. Passo manual
> pós-deploy não vale: o deploy é automático no push.

- [ ] **Step 1: Escreva o teste que falha**

`src/auth/verificacao.int.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { authDb } from "@/db/client";

describe("backfill de verificação de e-mail", () => {
  it("nenhuma conta pré-existente ficou com email_verified = false", async () => {
    const r = await authDb.execute(sql`
      select count(*)::int as total from app_user where email_verified = false`);
    expect((r as unknown as { total: number }[])[0]!.total).toBe(0);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test:rls -t "backfill de verificação"`
Expected: FAIL — as contas do seed têm `email_verified = false`.

- [ ] **Step 3: Escreva a migração de backfill**

`db/migrations/0059_email_verificado_backfill.sql`:

```sql
-- Fatia A (#163): ligar requireEmailVerification passa a exigir email_verified
-- de TODA conta. As contas criadas por seed:clinic nunca verificaram nada e
-- seriam trancadas pelo próprio deploy que liga a flag. Backfill vai junto,
-- nunca como passo manual — o deploy é automático no push.
UPDATE app_user SET email_verified = true WHERE email_verified = false;
```

Journal: `idx` 58, `when` `1785421569000`, `tag`
`"0059_email_verificado_backfill"`.

- [ ] **Step 4: Configure o Better Auth**

Em `src/auth/auth.ts`, dentro de `betterAuth({…})`, substitua
`emailAndPassword: { enabled: true },` por:

```ts
  emailAndPassword: {
    enabled: true,
    // Fatia A (#163): sem e-mail verificado não se entra em dado clínico.
    // A migração 0059 fez o backfill das contas pré-existentes no mesmo commit.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await enviarEmailTransacional({
        para: user.email,
        assunto: "Redefinir sua senha no Iris",
        texto: `Para redefinir sua senha, acesse: ${url}`,
        html: `<p>Para redefinir sua senha, <a href="${url}">clique aqui</a>.</p><p>Se não foi você, ignore este e-mail.</p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await enviarEmailTransacional({
        para: user.email,
        assunto: "Confirme seu e-mail no Iris",
        texto: `Para confirmar seu e-mail, acesse: ${url}`,
        html: `<p>Para confirmar seu e-mail e ativar sua conta, <a href="${url}">clique aqui</a>.</p>`,
      });
    },
  },
```

E o import no topo: `import { enviarEmailTransacional } from "@/lib/email/transacional";`

- [ ] **Step 5: Aplique e rode**

Run: `pnpm db:migrate && pnpm test:rls -t "backfill de verificação" && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/auth.ts db/migrations/0059_email_verificado_backfill.sql db/migrations/meta/_journal.json src/auth/verificacao.int.test.ts
git commit -m "feat(auth): verificação de e-mail e reset de senha, com backfill no mesmo commit"
```

---

### Task 5: Núcleo do cadastro — idempotente e retomável

**Files:**

- Create: `src/auth/cadastro.ts`
- Test: `src/auth/cadastro.int.test.ts`

**Interfaces:**

- Consumes: `provisionUser` (`src/auth/provisioning.ts`), `professionalConsent`,
  colunas da Task 1.
- Produces:
  ```ts
  type EntradaCadastro = {
    email: string;
    senha: string;
    nome: string;
    nomeClinica: string;
    conselho: string;
    registroNumero: string;
    registroUf: string;
    versaoTermo: string;
    ip?: string;
    userAgent?: string;
  };
  type ResultadoCadastro = { userId: string; clinicId: string };
  async function criarContaEClinica(
    e: EntradaCadastro,
  ): Promise<ResultadoCadastro>;
  ```

> Este módulo é `server-only` e **não** leva `"use server"`. Ele é o núcleo; o
> endpoint invocável pelo cliente é a action da Task 6.

- [ ] **Step 1: Escreva o teste que falha**

`src/auth/cadastro.int.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { userRole, clinic, professionalConsent } from "@/db/schema";
import { criarContaEClinica } from "@/auth/cadastro";

const base = {
  senha: "Senha Forte 123",
  nome: "Aline Teste",
  nomeClinica: "Clínica Teste",
  conselho: "crp",
  registroNumero: "06/123456",
  registroUf: "SP",
  versaoTermo: "2026-07-30",
};

describe("criarContaEClinica", () => {
  it("cria usuário coordenador da clínica nova, com aceite registrado", async () => {
    const email = `t${Date.now()}@exemplo.com.br`;
    const { userId, clinicId } = await criarContaEClinica({ ...base, email });

    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, userId));
    expect(papeis).toHaveLength(1);
    expect(papeis[0]!.papel).toBe("coordenador");
    expect(papeis[0]!.clinicId).toBe(clinicId);

    const aceites = await authDb
      .select()
      .from(professionalConsent)
      .where(eq(professionalConsent.userId, userId));
    expect(aceites).toHaveLength(1);
    expect(aceites[0]!.versaoTermo).toBe("2026-07-30");
  });

  it("é retomável: reentrar com o mesmo e-mail não duplica clínica nem vínculo", async () => {
    const email = `t${Date.now()}b@exemplo.com.br`;
    const a = await criarContaEClinica({ ...base, email });
    const b = await criarContaEClinica({ ...base, email });

    expect(b.userId).toBe(a.userId);
    expect(b.clinicId).toBe(a.clinicId);

    const papeis = await authDb
      .select()
      .from(userRole)
      .where(eq(userRole.userId, a.userId));
    expect(papeis).toHaveLength(1);

    const clinicas = await authDb
      .select()
      .from(clinic)
      .where(eq(clinic.id, a.clinicId));
    expect(clinicas).toHaveLength(1);
  });

  it("inicia o trial no momento do cadastro", async () => {
    const email = `t${Date.now()}c@exemplo.com.br`;
    const { clinicId } = await criarContaEClinica({ ...base, email });
    const [c] = await authDb
      .select()
      .from(clinic)
      .where(eq(clinic.id, clinicId));
    expect(c!.trialDias).toBe(7);
    expect(Date.now() - new Date(c!.trialComecoEm).getTime()).toBeLessThan(
      60_000,
    );
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test:rls -t "criarContaEClinica"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente**

`src/auth/cadastro.ts`:

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { appUser, clinic, professionalConsent, userRole } from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

export type EntradaCadastro = {
  email: string;
  senha: string;
  nome: string;
  nomeClinica: string;
  conselho: string;
  registroNumero: string;
  registroUf: string;
  versaoTermo: string;
  ip?: string;
  userAgent?: string;
};

export type ResultadoCadastro = { userId: string; clinicId: string };

/**
 * Cria conta + clínica no cadastro self-service (#163).
 *
 * NÃO É ATÔMICO, e isso é por limitação real: `provisionUser` chama
 * `auth.api.signUpEmail`, que roda no adapter do Better-Auth, fora de qualquer
 * transação nossa. Em vez de fingir atomicidade, a função é IDEMPOTENTE E
 * RETOMÁVEL: reentrar com o mesmo e-mail conclui o que faltou. Sem isso, uma
 * falha no meio deixaria o usuário sem clínica — beco sem saída em /sem-acesso,
 * com o e-mail do interessado já queimado.
 */
export async function criarContaEClinica(
  e: EntradaCadastro,
): Promise<ResultadoCadastro> {
  // Retomada: se o usuário já existe e já tem vínculo, devolve o que existe.
  const [existente] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, e.email))
    .limit(1);

  if (existente) {
    const [vinculo] = await authDb
      .select({ clinicId: userRole.clinicId })
      .from(userRole)
      .where(eq(userRole.userId, existente.id))
      .limit(1);
    if (vinculo) return { userId: existente.id, clinicId: vinculo.clinicId };
  }

  // Clínica primeiro: sem ela não há papel para vincular. `provisionUser` é
  // idempotente por e-mail, então o usuário pode já existir aqui.
  const [nova] = await authDb
    .insert(clinic)
    .values({ nome: e.nomeClinica })
    .returning({ id: clinic.id });
  const clinicId = nova!.id;

  const { userId } = await provisionUser({
    email: e.email,
    nome: e.nome,
    senha: e.senha,
    clinicId,
    papel: "coordenador",
  });

  await authDb
    .update(appUser)
    .set({
      conselho: e.conselho,
      registroNumero: e.registroNumero,
      registroUf: e.registroUf,
    })
    .where(eq(appUser.id, userId));

  await authDb
    .update(clinic)
    .set({ responsavelContaId: userId })
    .where(eq(clinic.id, clinicId));

  // Aceite só é gravado uma vez por (usuário, clínica, versão do termo).
  const [aceiteExistente] = await authDb
    .select({ id: professionalConsent.id })
    .from(professionalConsent)
    .where(
      and(
        eq(professionalConsent.userId, userId),
        eq(professionalConsent.clinicId, clinicId),
        eq(professionalConsent.versaoTermo, e.versaoTermo),
      ),
    )
    .limit(1);

  if (!aceiteExistente) {
    await authDb.insert(professionalConsent).values({
      userId,
      clinicId,
      versaoTermo: e.versaoTermo,
      ip: e.ip,
      userAgent: e.userAgent,
    });
  }

  return { userId, clinicId };
}
```

- [ ] **Step 4: Rode os testes**

Run: `pnpm test:rls -t "criarContaEClinica"`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/auth/cadastro.ts src/auth/cadastro.int.test.ts
git commit -m "feat(auth): núcleo de cadastro self-service idempotente e retomável"
```

---

### Task 6: Rate limit e resposta uniforme (anti-enumeração)

**Files:**

- Create: `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: `consumirTentativa(chave: string, limite: number, janelaMs: number): { permitido: boolean }`

- [ ] **Step 1: Escreva o teste que falha**

`src/lib/rate-limit.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumirTentativa, _limparParaTeste } from "./rate-limit";

afterEach(() => {
  _limparParaTeste();
  vi.useRealTimers();
});

describe("consumirTentativa", () => {
  it("permite até o limite e bloqueia depois", () => {
    for (let i = 0; i < 5; i++) {
      expect(consumirTentativa("ip:1.2.3.4", 5, 60_000).permitido).toBe(true);
    }
    expect(consumirTentativa("ip:1.2.3.4", 5, 60_000).permitido).toBe(false);
  });

  it("libera depois da janela", () => {
    vi.useFakeTimers();
    consumirTentativa("ip:9.9.9.9", 1, 60_000);
    expect(consumirTentativa("ip:9.9.9.9", 1, 60_000).permitido).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(consumirTentativa("ip:9.9.9.9", 1, 60_000).permitido).toBe(true);
  });

  it("conta chaves diferentes de forma independente", () => {
    consumirTentativa("email:a@b.com", 1, 60_000);
    expect(consumirTentativa("email:c@d.com", 1, 60_000).permitido).toBe(true);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test src/lib/rate-limit.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente**

`src/lib/rate-limit.ts`:

```ts
import "server-only";

type Registro = { contagem: number; expiraEm: number };

// Em memória, por instância. Suficiente para o MVP num único container; se o
// app escalar horizontalmente isto vira Postgres ou Redis — a assinatura não muda.
const registros = new Map<string, Registro>();

/**
 * Contador de tentativas por chave (`ip:…`, `email:…`) numa janela deslizante.
 * Cadastro e recuperação de senha são superfície aberta na internet: sem isto,
 * a mesma rota serve para força bruta e para enumerar e-mails cadastrados.
 */
export function consumirTentativa(
  chave: string,
  limite: number,
  janelaMs: number,
): { permitido: boolean } {
  const agora = Date.now();
  const atual = registros.get(chave);

  if (!atual || atual.expiraEm <= agora) {
    registros.set(chave, { contagem: 1, expiraEm: agora + janelaMs });
    return { permitido: true };
  }
  if (atual.contagem >= limite) return { permitido: false };

  atual.contagem += 1;
  return { permitido: true };
}

/** Só para teste — zera o estado do módulo entre casos. */
export function _limparParaTeste(): void {
  registros.clear();
}
```

- [ ] **Step 4: Rode os testes**

Run: `pnpm test src/lib/rate-limit.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat(seguranca): contador de tentativas por IP e por e-mail"
```

---

### Task 7: Action de cadastro (endpoint público)

**Files:**

- Create: `src/app/(auth)/cadastro/logic.ts`, `src/app/(auth)/cadastro/actions.ts`
- Test: `src/app/(auth)/cadastro/logic.test.ts`

**Interfaces:**

- Consumes: `criarContaEClinica` (Task 5), `consumirTentativa` (Task 6).
- Produces:
  ```ts
  type EstadoCadastro = { error?: string };
  async function cadastrar(
    _prev: EstadoCadastro,
    formData: FormData,
  ): Promise<EstadoCadastro>;
  function validarCadastro(
    formData: FormData,
  ): { ok: true; dados: EntradaCadastroForm } | { ok: false; error: string };
  ```

> A action é o **único** ponto invocável pelo cliente. Ela não recebe `ctx` nem
> repassa nada do cliente para o núcleo além dos campos validados.

- [ ] **Step 1: Escreva o teste que falha**

`src/app/(auth)/cadastro/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validarCadastro } from "./logic";

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const completo = {
  email: "aline@exemplo.com.br",
  senha: "Senha Forte 123",
  nome: "Aline Souza",
  nomeClinica: "Clínica Passo",
  conselho: "crp",
  registroNumero: "06/123456",
  registroUf: "SP",
  termos: "on",
};

describe("validarCadastro", () => {
  it("aceita cadastro completo", () => {
    const r = validarCadastro(fd(completo));
    expect(r.ok).toBe(true);
  });

  it("exige aceite dos termos", () => {
    const { termos: _, ...semTermos } = completo;
    const r = validarCadastro(fd(semTermos));
    expect(r).toEqual({
      ok: false,
      error: "É preciso aceitar os termos de uso para criar a conta.",
    });
  });

  it("exige conselho válido", () => {
    const r = validarCadastro(fd({ ...completo, conselho: "inventado" }));
    expect(r.ok).toBe(false);
  });

  it("exige senha de no mínimo 12 caracteres", () => {
    const r = validarCadastro(fd({ ...completo, senha: "curta123" }));
    expect(r).toEqual({
      ok: false,
      error: "A senha precisa ter ao menos 12 caracteres.",
    });
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test "src/app/(auth)/cadastro/logic.test.ts"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente o núcleo**

`src/app/(auth)/cadastro/logic.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import { criarContaEClinica } from "@/auth/cadastro";
import { consumirTentativa } from "@/lib/rate-limit";

export type EstadoCadastro = { error?: string };

export const VERSAO_TERMO = "2026-07-30";

const CONSELHOS = ["crp", "crfa", "crefito", "crm", "outro"] as const;

export type EntradaCadastroForm = {
  email: string;
  senha: string;
  nome: string;
  nomeClinica: string;
  conselho: string;
  registroNumero: string;
  registroUf: string;
};

export function validarCadastro(
  formData: FormData,
): { ok: true; dados: EntradaCadastroForm } | { ok: false; error: string } {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const dados = {
    email: texto("email").toLowerCase(),
    senha: String(formData.get("senha") ?? ""),
    nome: texto("nome"),
    nomeClinica: texto("nomeClinica"),
    conselho: texto("conselho"),
    registroNumero: texto("registroNumero"),
    registroUf: texto("registroUf").toUpperCase(),
  };

  if (!dados.email.includes("@"))
    return { ok: false, error: "Informe um e-mail válido." };
  if (dados.senha.length < 12)
    return { ok: false, error: "A senha precisa ter ao menos 12 caracteres." };
  if (!dados.nome) return { ok: false, error: "Informe seu nome completo." };
  if (!dados.nomeClinica)
    return { ok: false, error: "Informe o nome da clínica." };
  if (!(CONSELHOS as readonly string[]).includes(dados.conselho))
    return { ok: false, error: "Selecione seu conselho profissional." };
  if (!dados.registroNumero)
    return { ok: false, error: "Informe o número do seu registro." };
  if (dados.registroUf.length !== 2)
    return { ok: false, error: "Informe a UF do seu registro." };
  if (formData.get("termos") !== "on")
    return {
      ok: false,
      error: "É preciso aceitar os termos de uso para criar a conta.",
    };

  return { ok: true, dados };
}

/**
 * Mensagem ÚNICA de sucesso, independente de o e-mail já existir ou não — é o
 * que impede a tela de virar oráculo de enumeração de e-mail cadastrado. Quem
 * já tem conta recebe, por e-mail, um aviso de tentativa com link de recuperação.
 */
export async function executarCadastro(
  formData: FormData,
): Promise<EstadoCadastro> {
  const validado = validarCadastro(formData);
  if (!validado.ok) return { error: validado.error };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const userAgent = h.get("user-agent") ?? undefined;

  const porIp = consumirTentativa(`cadastro:ip:${ip}`, 10, 60 * 60 * 1000);
  const porEmail = consumirTentativa(
    `cadastro:email:${validado.dados.email}`,
    3,
    60 * 60 * 1000,
  );
  if (!porIp.permitido || !porEmail.permitido)
    return { error: "Muitas tentativas. Tente novamente em uma hora." };

  await criarContaEClinica({
    ...validado.dados,
    versaoTermo: VERSAO_TERMO,
    ip,
    userAgent,
  });

  return {};
}
```

- [ ] **Step 4: Implemente a action fina**

`src/app/(auth)/cadastro/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { executarCadastro, type EstadoCadastro } from "./logic";

export type { EstadoCadastro } from "./logic";

/**
 * Único ponto de entrada invocável pelo cliente. O núcleo (`./logic`) é
 * `server-only` e sem `"use server"` — módulo `"use server"` que exporta função
 * aceitando contexto vira endpoint com contexto forjável (#55).
 */
export async function cadastrar(
  _prev: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const resultado = await executarCadastro(formData);
  if (resultado.error) return resultado;
  redirect("/cadastro/verifique-email");
}
```

- [ ] **Step 5: Rode os testes e o typecheck**

Run: `pnpm test "src/app/(auth)/cadastro/logic.test.ts" && pnpm typecheck`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/cadastro/logic.ts" "src/app/(auth)/cadastro/actions.ts" "src/app/(auth)/cadastro/logic.test.ts"
git commit -m "feat(cadastro): action pública com validação, rate limit e resposta uniforme"
```

---

### Task 8: Telas de cadastro e verificação

**Files:**

- Create: `src/app/(auth)/cadastro/page.tsx`, `src/app/(auth)/cadastro/cadastro-form.tsx`,
  `src/app/(auth)/cadastro/verifique-email/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx` (link "Criar conta")

**Interfaces:**

- Consumes: `cadastrar`, `EstadoCadastro` (Task 7).
- Produces: rota `/cadastro` e `/cadastro/verifique-email`.

- [ ] **Step 1: Leia o padrão antes de escrever**

Run: `cat "src/app/(auth)/login/page.tsx"` e
`cat docs/ux/design-system-espectro-brutal.md`
Use `Form`, `Field`, `Input`, `Button`, `Logo`, `surface` de `@/components/ui/*`.
**Não** escreva `<input>`/`<button>` cru nem classes Tailwind soltas para
recriar componente que já existe.

- [ ] **Step 2: Escreva o formulário**

`src/app/(auth)/cadastro/cadastro-form.tsx` — client component com
`useActionState(cadastrar, {})`. Campos, na ordem: nome completo, e-mail, senha
(com dica "mínimo 12 caracteres"), nome da clínica, conselho (`select` com CRP,
CRFa, CREFITO, CRM, Outro), número do registro, UF, checkbox de aceite com link
para os termos. Requisitos não negociáveis:

- Cada campo com `<Field>` e label associada (nada de placeholder como label).
- Erro do estado renderizado em `role="alert"`.
- Botão desabilitado enquanto `pending`, com texto que muda para "Criando conta…".
- Checkbox de termos com o texto: "Li e aceito os Termos de Uso e a Política de
  Privacidade do Iris." e links reais para as páginas publicadas.

- [ ] **Step 3: Escreva as páginas**

`src/app/(auth)/cadastro/page.tsx` renderiza o form dentro do layout de
`(auth)`. `src/app/(auth)/cadastro/verifique-email/page.tsx` é estática:
explica que um e-mail foi enviado, que o link vale por tempo limitado, e o que
fazer se não chegar (conferir spam, tentar novamente). **Não** revela se o
e-mail já existia.

- [ ] **Step 4: Link no login**

Em `src/app/(auth)/login/page.tsx`, abaixo do botão de entrar, adicione um link
para `/cadastro` com o texto "Criar conta".

- [ ] **Step 5: Verifique**

Run: `pnpm lint && pnpm typecheck && rm -rf .next && pnpm build`
Expected: verde. Suba `pnpm dev` e confirme `/cadastro` navegável só por teclado,
com foco visível e leitura correta dos labels.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/cadastro" "src/app/(auth)/login/page.tsx"
git commit -m "feat(cadastro): telas de criação de conta e verificação de e-mail"
```

---

### Task 9: Recuperação de senha

**Files:**

- Create: `src/app/(auth)/esqueci-senha/page.tsx`, `src/app/(auth)/esqueci-senha/actions.ts`,
  `src/app/(auth)/redefinir-senha/page.tsx`
- Test: `src/app/(auth)/esqueci-senha/actions.test.ts`

**Interfaces:**

- Consumes: `authClient.forgetPassword` / `resetPassword` (`src/auth/client.ts`),
  `consumirTentativa` (Task 6), `sendResetPassword` (Task 4).
- Produces: rotas `/esqueci-senha` e `/redefinir-senha`.

- [ ] **Step 1: Escreva o teste que falha**

`src/app/(auth)/esqueci-senha/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mensagemUniforme } from "./actions";

describe("recuperação de senha", () => {
  it("devolve a mesma mensagem para e-mail existente e inexistente", () => {
    expect(mensagemUniforme()).toBe(
      "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.",
    );
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test "src/app/(auth)/esqueci-senha/actions.test.ts"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente**

Em `actions.ts`, exporte `mensagemUniforme()` devolvendo exatamente a string do
teste, e a action que chama `forgetPassword` com
`redirectTo: "/redefinir-senha"`, aplicando `consumirTentativa` por IP (10/h) e
por e-mail (3/h). A action **sempre** devolve a mensagem uniforme, mesmo quando o
provedor de e-mail falha ou o e-mail não existe.

`/redefinir-senha` lê o `token` da query, pede a nova senha duas vezes (mínimo 12
caracteres, confirmação igual) e chama `resetPassword`. Em sucesso, redireciona
para `/login` com aviso de senha alterada.

- [ ] **Step 4: Rode e verifique**

Run: `pnpm test "src/app/(auth)/esqueci-senha/actions.test.ts" && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/esqueci-senha" "src/app/(auth)/redefinir-senha"
git commit -m "feat(auth): fluxo de recuperação de senha com resposta uniforme"
```

---

### Task 10: `/sem-acesso` distingue cadastro incompleto

**Files:**

- Modify: `src/auth/tenant.ts:46`, `src/app/(auth)/sem-acesso/page.tsx`
- Test: `src/auth/tenant-cadastro-incompleto.int.test.ts`

**Interfaces:**

- Consumes: `resolveTenant`.
- Produces: `TenantResolution` ganha o status
  `{ status: "cadastro_incompleto"; userId: string }`.

> Sem isto, a falha entre "usuário criado" e "clínica criada" (Task 5) manda o
> interessado para uma tela que diz apenas "você não tem acesso" — e o e-mail
> dele já está queimado para uma nova tentativa.

- [ ] **Step 1: Escreva o teste que falha**

`src/auth/tenant-cadastro-incompleto.int.test.ts`: cria um `app_user` **sem**
`user_role` via `authDb`, monta um `Headers` com a sessão desse usuário e chama
`resolveTenant`. Espera `status === "cadastro_incompleto"` e `userId` igual ao
criado.

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test:rls -t "cadastro incompleto"`
Expected: FAIL — hoje devolve `no_access`.

- [ ] **Step 3: Implemente**

Em `src/auth/tenant.ts`, acrescente o membro ao union `TenantResolution` e troque
a linha 46:

```ts
// Usuário autenticado sem NENHUM vínculo: no self-service isto significa que o
// cadastro morreu entre criar a conta e criar a clínica (o provisionamento não
// é atômico — ver src/auth/cadastro.ts). Devolver "sem acesso" aqui seria beco
// sem saída com o e-mail já queimado.
if (vinculos.length === 0) return { status: "cadastro_incompleto", userId };
```

Em `getTenantContext`, trate o caso novo com
`redirect("/sem-acesso?motivo=cadastro-incompleto")`.

Na página `/sem-acesso`, quando `motivo=cadastro-incompleto`, mostre texto e
botão para concluir o cadastro (link para `/cadastro`), explicando que a conta
existe mas a clínica não foi criada.

- [ ] **Step 4: Rode**

Run: `pnpm test:rls -t "cadastro incompleto" && pnpm test src/auth && pnpm typecheck`
Expected: PASS, sem quebrar `tenant.int.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/auth/tenant.ts "src/app/(auth)/sem-acesso/page.tsx" src/auth/tenant-cadastro-incompleto.int.test.ts
git commit -m "feat(auth): distingue cadastro incompleto de falta de acesso"
```

---

### Task 11: Faixa de trial no shell

**Files:**

- Create: `src/lib/trial.ts`, `src/components/app/faixa-trial.tsx`
- Modify: o layout do shell protegido (`src/app/(app)/layout.tsx`)
- Test: `src/lib/trial.test.ts`

**Interfaces:**

- Consumes: `clinic.trialComecoEm`, `clinic.trialDias`, `clinic.timezone`.
- Produces: `diasRestantesDeTrial(inicio: Date, dias: number, timezone: string, agora?: Date): number`

- [ ] **Step 1: Escreva o teste que falha**

`src/lib/trial.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diasRestantesDeTrial } from "./trial";

const TZ = "America/Sao_Paulo";

describe("diasRestantesDeTrial", () => {
  it("no dia do cadastro restam 7 dias", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(
      diasRestantesDeTrial(
        inicio,
        7,
        TZ,
        new Date("2026-08-01T20:00:00-03:00"),
      ),
    ).toBe(7);
  });

  it("na véspera do vencimento resta 1 dia", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(
      diasRestantesDeTrial(
        inicio,
        7,
        TZ,
        new Date("2026-08-07T23:00:00-03:00"),
      ),
    ).toBe(1);
  });

  it("no dia do vencimento resta 0 e nunca fica negativo", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(
      diasRestantesDeTrial(
        inicio,
        7,
        TZ,
        new Date("2026-08-08T01:00:00-03:00"),
      ),
    ).toBe(0);
    expect(
      diasRestantesDeTrial(
        inicio,
        7,
        TZ,
        new Date("2026-09-30T01:00:00-03:00"),
      ),
    ).toBe(0);
  });

  it("usa a fronteira de dia do timezone da clínica, não do servidor", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    // 02:00 UTC de 08/08 ainda é 23:00 de 07/08 em São Paulo → ainda resta 1 dia.
    expect(
      diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-08T02:00:00Z")),
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `pnpm test src/lib/trial.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente**

`src/lib/trial.ts` — converta `inicio` e `agora` para a data civil no timezone da
clínica (use `Intl.DateTimeFormat` com `timeZone` e `en-CA`, que devolve
`YYYY-MM-DD`), calcule a diferença em dias entre as datas civis e devolva
`Math.max(0, dias - diferença)`. Documente no cabeçalho **por que** a conta é
civil e não em milissegundos: fronteira de dia em UTC faria o cliente ver o
trial acabar um dia antes.

- [ ] **Step 4: Componente e shell**

`faixa-trial.tsx` recebe `diasRestantes` e renderiza uma faixa persistente com o
texto "Seu período de teste termina em N dias." (e "termina hoje" quando `N === 0`).
O layout do shell busca `clinic` pelo `ctx.clinicId` e renderiza a faixa apenas
enquanto `diasRestantes > 0` ou no dia 0. **Nada aqui bloqueia nada** — o gate é
Fatia B.

- [ ] **Step 5: Rode**

Run: `pnpm test src/lib/trial.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/trial.ts src/lib/trial.test.ts src/components/app/faixa-trial.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(trial): faixa de dias restantes com fronteira de dia no timezone da clínica"
```

---

### Task 12: E2E da jornada completa

**Files:**

- Create: `e2e/cadastro.spec.ts`

**Interfaces:**

- Consumes: todas as rotas anteriores.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Escreva o teste**

`e2e/cadastro.spec.ts` percorre: `/cadastro` → preenche todos os campos com um
e-mail único (`t${Date.now()}@exemplo.com.br`) → aceita os termos → espera
`/cadastro/verifique-email`. Depois lê o token direto do banco (tabela
`auth_verification`) e navega para a URL de verificação, confirmando que o
usuário cai em `/mfa/setup` (enforcement de papel clínico já existente).

Asserções obrigatórias:

- A tela de verificação **não** diz se o e-mail já existia.
- Reenviar o mesmo cadastro duas vezes não cria clínica duplicada (consulta ao
  banco por `nome` da clínica devolve 1 linha).

- [ ] **Step 2: Rode**

Run: `pnpm test:e2e e2e/cadastro.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/cadastro.spec.ts
git commit -m "test(e2e): jornada de cadastro até o enrollment de MFA"
```

---

### Task 13: Remover as envs do `iris-migrate`

**Files:**

- Modify: `docs/arquitetura/*` (onde as envs do serviço estiverem documentadas)

**Interfaces:** nenhuma — é infraestrutura.

> ⚠️ **Confirmar com o Rômulo antes de executar.** Mexer em serviço do Easypanel
> é ação de infra; e o `iris-migrate` é o **gate de schema do deploy**.

- [ ] **Step 1: Confirme que o cadastro em produção substitui o seed**

Só depois que a Task 12 estiver verde **em produção** — isto é, alguém criou
conta de verdade pelo site — as envs deixam de ser necessárias.

- [ ] **Step 2: Peça ao Rômulo para remover no painel**

`AUTH_DATABASE_URL` e `BETTER_AUTH_SECRET` saem do serviço `iris-migrate`. Um job
que só precisa de DDL parou de carregar a chave de assinatura de sessão — é o
débito declarado no fim da #163.

- [ ] **Step 3: Verifique que o deploy seguinte continua migrando**

O job precisa continuar verde com `DATABASE_URL`/`MIGRATION_DATABASE_URL` apenas.
Se o job falhar, o deploy aborta — esse é o comportamento correto do gate, não um
bug.

- [ ] **Step 4: Commit da documentação**

```bash
git add docs/arquitetura
git commit -m "chore(infra): iris-migrate deixa de carregar segredo de sessão"
```

---

## Fechamento da fatia

Antes de considerar a Fatia A pronta, rode tudo e confira a saída, não a memória:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:rls && pnpm test:e2e
```

`test:rls` precisa mostrar **testes executados**, não "skipped" — suíte que pula
arquivos em silêncio já escondeu RLS não avaliada neste projeto. Confirme também
que `MIGRATION_DATABASE_URL` está definida e que `DATABASE_URL` **não** aponta
para a role dona (com `BYPASSRLS`), senão a suíte roda como superusuário e passa
sem provar nada.

Só então: PR com contexto e decisões na descrição, `graphify update .`, e
atualização do `BACKLOG.md`.
