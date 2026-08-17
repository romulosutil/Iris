# LGPD, PDF/A, Marco Civil & Hostinger DPA Plan (#120, #116, #102, #89)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a exportação auditável de prontuários em PDF/A com hash SHA-256, garantir a retenção de logs por 6 meses conforme o Marco Civil da Internet desatrelada do expurgo de contas, formalizar o DPA da Hostinger e harmonizar a política de retenção de backups com a LGPD.

**Architecture:** Gerador PDF/A com marca d'água dinâmica e hash SHA-256 no rodapé, `audit_log` desatrelado via `ON DELETE SET NULL` com pseudonimização por função `SECURITY DEFINER` (mesmo padrão de `app_purgar_paciente`, migração 0045) e expurgo diário de 180 dias via script agendado, e documentação jurídica atualizada.

**Tech Stack:** Next.js 16, Node.js `crypto`, PDFKit, Postgres, Drizzle ORM, Vitest, `postgres` (node) para scripts de job.

> **Nota (03/08/2026):** Prioridade ajustada com o Rômulo — Task 1 (#120, export PDF/A) e Task 2 (#116, retenção Marco Civil) permanecem **P1 · antes de dado real**: obrigação legal (art. 15) e feature de confiança para prontuário auditável. Task 3 (#102, #89) teve a auditoria do DPA Hostinger e harmonização de backup **postergadas até atingir o marco de 40 pacientes no total** em produção.

## Global Constraints

- `audit_log` é imutável para `app_role` (REVOKE UPDATE aplicado em 0039) — qualquer mutação de linha de `audit_log` (incl. pseudonimização) só pode passar por função `SECURITY DEFINER` do owner do banco. Nunca `UPDATE audit_log` direto de código de app.
- Toda função `SECURITY DEFINER` que lê/filtra por paciente ou clínica precisa de guard de tenant explícito (`clinic_id = current_setting('app.clinic_id')::uuid` ou equivalente) — o DEFINER ignora RLS, então o guard é o único isolamento restante.
- Este projeto não tem cron nativo no host (Easypanel v2.31). Todo job periódico é um script Node standalone em `scripts/`, agendado via campo "Comando" do Easypanel — não usar `setInterval`/loop interno.
- Toda migração SQL nova segue o padrão de comentário-motivo das migrações existentes (ex.: 0045, 0049) — explicar o _porquê_, não só o _o quê_.
- Documento jurídico novo em `docs/legal/` é sempre rascunho até leitura ao vivo do advogado sem apontamento — nunca comitar como "final" sem essa etapa registrada no próprio doc.
- `pnpm db:generate` + `pnpm db:migrate` são etapas obrigatórias após qualquer edição em `src/db/schema.ts` — nenhuma migração fica só commitada sem aplicar localmente e sem entrar no `_journal.json` (issue #165 — migração commitada não aplicada).

---

## Mapeamento de Arquivos

- **PDF/A Auditável:** `src/lib/export/pdf-generator.ts`, `src/lib/export/pdf-generator.test.ts`, `docs/legal/termos-de-uso.md`
- **Marco Civil:** `src/db/schema.ts`, `db/migrations/00XX_audit_log_set_null.sql`, `db/migrations/00XY_pseudonimiza_audit_log_expirado.sql`, `scripts/expurgo-audit-log.mjs`, `scripts/expurgo-audit-log.test.mjs`, `infra/README.md`
- **Hostinger & Retenção:** `docs/legal/dpa-hostinger.md`, `docs/legal/validacao-legal-prontuario.md`, `docs/legal/politica-retencao-dados.md`, `src/lib/lgpd/erasure-response.ts`, `src/lib/lgpd/erasure-response.test.ts`

---

## Tarefas de Implementação

### Task 1: Exportação Auditável em PDF/A (Issue #120)

**Files:**

- Create: `src/lib/export/pdf-generator.ts`
- Test: `src/lib/export/pdf-generator.test.ts`
- Modify: `package.json` (adiciona `pdfkit` — não há dependência de PDF no projeto hoje)

**Interfaces:**

- Produces: `gerarHashPdf(pdfBuffer: Buffer): string`, `gerarPdfProntuario(dados: DadosProntuarioExport): Promise<{ buffer: Buffer; hash: string }>` — consumido pela rota de export do prontuário (fora de escopo desta task).

**Regras Levantadas:**

1. Exportação do prontuário integral em formato PDF/A-2b.
2. Marca d'água semitransparente em todas as páginas: `"EMITIDO PARA: [NOME] - CPF: [CPF] EM [TIMESTAMP]"`
3. Hash SHA-256 impresso no rodapé de cada página e retornado na resposta da API.

- [ ] **Step 1: Instalar PDFKit**

Run: `pnpm add pdfkit && pnpm add -D @types/pdfkit`

- [ ] **Step 2: Escrever teste falho de `gerarHashPdf`**

File: `src/lib/export/pdf-generator.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { gerarHashPdf, gerarPdfProntuario } from "./pdf-generator";

describe("gerarHashPdf", () => {
  it("calcula o hash SHA-256 exato de um buffer de PDF", () => {
    const bufferFalso = Buffer.from("conteudo-pdf-teste");
    const hash = gerarHashPdf(bufferFalso);
    expect(hash).toHaveLength(64); // SHA-256 hex string
  });
});
```

- [ ] **Step 3: Rodar teste, confirmar falha**

Run: `pnpm test src/lib/export/pdf-generator.test.ts`
Expected: FAIL com "gerarHashPdf não definido" ou erro de import.

- [ ] **Step 4: Implementar `gerarHashPdf`**

File: `src/lib/export/pdf-generator.ts`

```typescript
import crypto from "node:crypto";

export function gerarHashPdf(pdfBuffer: Buffer): string {
  return crypto.createHash("sha256").update(pdfBuffer).digest("hex");
}
```

- [ ] **Step 5: Rodar teste, confirmar passagem**

Run: `pnpm test src/lib/export/pdf-generator.test.ts`
Expected: PASS.

- [ ] **Step 6: Escrever teste falho de `gerarPdfProntuario` (marca d'água + rodapé + hash)**

File: `src/lib/export/pdf-generator.test.ts` (adicionar ao describe existente)

```typescript
describe("gerarPdfProntuario", () => {
  const dados = {
    nomeTitular: "Maria Souza",
    cpfTitular: "123.456.789-00",
    timestampEmissao: new Date("2026-08-02T14:30:00Z"),
    secoes: [
      { titulo: "Resumo Clínico", conteudo: "Paciente evoluiu bem." },
      { titulo: "Sessões", conteudo: "12 sessões registradas." },
    ],
  };

  it("gera PDF com marca d'água contendo nome, CPF e timestamp em texto extraível", async () => {
    const { buffer } = await gerarPdfProntuario(dados);
    const texto = buffer.toString("latin1");
    expect(texto).toContain("EMITIDO PARA: Maria Souza");
    expect(texto).toContain("123.456.789-00");
  });

  it("retorna hash SHA-256 que bate com gerarHashPdf(buffer)", async () => {
    const { buffer, hash } = await gerarPdfProntuario(dados);
    expect(hash).toBe(gerarHashPdf(buffer));
    expect(hash).toHaveLength(64);
  });

  it("gera uma página por seção mais a página de rosto (marcador /Type /Page)", async () => {
    const { buffer } = await gerarPdfProntuario(dados);
    const contagemPaginas = (
      buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []
    ).length;
    expect(contagemPaginas).toBe(dados.secoes.length + 1);
  });
});
```

- [ ] **Step 7: Rodar teste, confirmar falha**

Run: `pnpm test src/lib/export/pdf-generator.test.ts`
Expected: FAIL com "gerarPdfProntuario não definido".

- [ ] **Step 8: Implementar `gerarPdfProntuario`**

File: `src/lib/export/pdf-generator.ts` (adicionar ao arquivo existente)

```typescript
import PDFDocument from "pdfkit";

export interface SecaoProntuario {
  titulo: string;
  conteudo: string;
}

export interface DadosProntuarioExport {
  nomeTitular: string;
  cpfTitular: string;
  timestampEmissao: Date;
  secoes: SecaoProntuario[];
}

function desenharMarcaDagua(doc: PDFKit.PDFDocument, texto: string) {
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc
    .fillColor("black")
    .opacity(0.12)
    .fontSize(12)
    .text(texto, 0, doc.page.height / 2 - 10, {
      width: doc.page.width,
      align: "center",
    });
  doc.opacity(1).restore();
}

function desenharRodapeComHash(
  doc: PDFKit.PDFDocument,
  hashParcial: string,
  pagina: number,
  totalPaginas: number,
) {
  doc
    .fontSize(7)
    .fillColor("black")
    .text(
      `Hash SHA-256 (documento completo, calculado após geração): ${hashParcial} — página ${pagina}/${totalPaginas}`,
      50,
      doc.page.height - 40,
      { width: doc.page.width - 100, align: "center" },
    );
}

export async function gerarPdfProntuario(
  dados: DadosProntuarioExport,
): Promise<{ buffer: Buffer; hash: string }> {
  const marcaDagua = `EMITIDO PARA: ${dados.nomeTitular} - CPF: ${dados.cpfTitular} EM ${dados.timestampEmissao.toISOString()}`;
  const totalPaginas = dados.secoes.length + 1;

  const doc = new PDFDocument({
    size: "A4",
    pdfVersion: "1.4",
    tagged: true,
    info: {
      Title: `Prontuário — ${dados.nomeTitular}`,
      CreationDate: dados.timestampEmissao,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const fim = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  // Página de rosto
  doc
    .fontSize(18)
    .text(`Prontuário Clínico — ${dados.nomeTitular}`, { align: "center" });
  doc.moveDown();
  doc
    .fontSize(10)
    .text(`Emitido em ${dados.timestampEmissao.toISOString()}`, {
      align: "center",
    });
  desenharMarcaDagua(doc, marcaDagua);
  desenharRodapeComHash(doc, "pendente-ver-resposta-da-api", 1, totalPaginas);

  dados.secoes.forEach((secao, i) => {
    doc.addPage();
    doc.fontSize(14).text(secao.titulo);
    doc.moveDown(0.5);
    doc.fontSize(11).text(secao.conteudo);
    desenharMarcaDagua(doc, marcaDagua);
    desenharRodapeComHash(
      doc,
      "pendente-ver-resposta-da-api",
      i + 2,
      totalPaginas,
    );
  });

  doc.end();
  await fim;

  const buffer = Buffer.concat(chunks);
  const hash = gerarHashPdf(buffer);

  return { buffer, hash };
}
```

**Nota de implementação:** o hash SHA-256 real só existe depois do buffer completo estar gerado — por isso o rodapé impresso no PDF traz um placeholder textual (`pendente-ver-resposta-da-api`) e o hash **verdadeiro** vai na resposta da API (regra 3, "retornado na resposta da API"). Se o hash tiver que aparecer literalmente no rodapé impresso, a geração precisa rodar em duas passadas (calcular hash do conteúdo sem rodapé, depois reabrir/reescrever o rodapé com o hash final) — decisão de produto a confirmar com Rômulo antes de fechar Step 8; documentar a escolha final no PR.

- [ ] **Step 9: Rodar testes, confirmar passagem**

Run: `pnpm test src/lib/export/pdf-generator.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/export/pdf-generator.ts src/lib/export/pdf-generator.test.ts package.json pnpm-lock.yaml
git commit -m "feat(export): implementar gerador PDF/A auditável com marca d'água e hash SHA-256 (#120)"
```

---

### Task 2: Retenção Marco Civil (6 Meses) Desatrelada de Expurgo (Issue #116)

**Files:**

- Modify: `src/db/schema.ts` (FK `audit_log.user_id` → `onDelete: "set null"`)
- Create: `db/migrations/00XX_audit_log_user_set_null.sql`
- Create: `db/migrations/00XY_pseudonimiza_audit_log_expirado.sql`
- Create: `scripts/expurgo-audit-log.mjs`, `scripts/expurgo-audit-log.test.mjs`
- Modify: `infra/README.md` (documentar agendamento no Easypanel)

**Interfaces:**

- Produces: `verificarElegibilidadeExpurgoAuditLog(criadoEm: Date, agora?: Date): boolean` (lógica pura, testável sem banco), função SQL `app_pseudonimiza_expurgar_audit_log_expirado()` `SECURITY DEFINER`.
- Consumes (padrão a seguir): `app_purgar_paciente` (migração `db/migrations/0045_expurgo_retencao.sql`) — mesmo padrão de trilha-antes-de-mutar e pseudonimização via `jsonb_build_object`.

**Regras Levantadas:**

1. `audit_log.user_id` vira `ON DELETE SET NULL` para impedir exclusão em cascata.
2. Deletar a conta do usuário pseudonimiza os logs de acesso, mantendo-os por 180 dias.
3. Job diário deleta apenas logs com `criado_em < NOW() - INTERVAL '6 MONTHS'` — e antes disso, pseudonimiza (regra 2) os logs cujo usuário já foi deletado.

- [ ] **Step 1: Alterar FK no schema Drizzle**

File: `src/db/schema.ts`

```typescript
// Localizar a definição atual da coluna user_id em auditLog e trocar a FK:
export const auditLog = pgTable("audit_log", {
  // ...colunas existentes...
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  // ...
});
```

- [ ] **Step 2: Gerar e aplicar migração da FK**

Run: `pnpm db:generate`
Run: `pnpm db:migrate`
Expected: nova migração criada refletindo `ON DELETE SET NULL` em `audit_log.user_id`, aplicada sem erro no Postgres local.

- [ ] **Step 3: Escrever teste falho de `verificarElegibilidadeExpurgoAuditLog`**

File: `scripts/expurgo-audit-log.test.mjs`

```javascript
import { describe, it, expect } from "vitest";
import { verificarElegibilidadeExpurgoAuditLog } from "./expurgo-audit-log.mjs";

describe("verificarElegibilidadeExpurgoAuditLog", () => {
  const agora = new Date("2026-08-01T12:00:00Z");

  it("preserva logs com 179 dias de idade", () => {
    const logData = new Date("2026-02-03T12:00:00Z"); // 179 dias
    expect(verificarElegibilidadeExpurgoAuditLog(logData, agora)).toBe(false);
  });

  it("permite expurgo de logs com 183 dias de idade", () => {
    const logData = new Date("2026-01-30T12:00:00Z"); // 183 dias
    expect(verificarElegibilidadeExpurgoAuditLog(logData, agora)).toBe(true);
  });
});
```

- [ ] **Step 4: Rodar teste, confirmar falha**

Run: `pnpm test scripts/expurgo-audit-log.test.mjs`
Expected: FAIL com "verificarElegibilidadeExpurgoAuditLog não definido".

- [ ] **Step 5: Implementar função pura de elegibilidade**

File: `scripts/expurgo-audit-log.mjs` (parte 1 do arquivo)

```javascript
export function verificarElegibilidadeExpurgoAuditLog(
  criadoEm,
  agora = new Date(),
) {
  const seisMesesMs = 180 * 24 * 60 * 60 * 1000;
  return agora.getTime() - criadoEm.getTime() >= seisMesesMs;
}
```

- [ ] **Step 6: Rodar teste, confirmar passagem**

Run: `pnpm test scripts/expurgo-audit-log.test.mjs`
Expected: PASS.

- [ ] **Step 7: Migração — função `SECURITY DEFINER` de pseudonimização + expurgo**

Segue exatamente o padrão de `db/migrations/0045_expurgo_retencao.sql` (trilha primeiro, pseudonimização via `jsonb_build_object`, DEFINER porque `audit_log` é imutável para `app_role`).

File: `db/migrations/00XY_pseudonimiza_audit_log_expirado.sql`

```sql
-- Fase LGPD — pseudonimização + expurgo de audit_log (Marco Civil, #116).
-- audit_log é imutável para app_role (REVOKE UPDATE em 0039) — esta função
-- roda como o dono (SECURITY DEFINER/BYPASSRLS), único caminho autorizado a
-- mutar a trilha. Espelha o padrão de app_purgar_paciente (0045).
--> statement-breakpoint
-- Pseudonimiza logs cujo user_id já foi zerado por ON DELETE SET NULL
-- (conta do titular já deletada) e ainda não foi marcado como pseudônimo.
-- Mantém colunas estruturais (acao/entidade/entidade_id/clinic/timestamp);
-- sobrescreve `detalhe` por inteiro (PII pode estar em qualquer chave livre).
CREATE OR REPLACE FUNCTION app_pseudonimizar_audit_log_orfao() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH atualizados AS (
    UPDATE audit_log
       SET detalhe = jsonb_build_object('pseudonimizado', true)
     WHERE user_id IS NULL
       AND COALESCE((detalhe->>'pseudonimizado')::boolean, false) = false
    RETURNING id
  )
  SELECT count(*)::int FROM atualizados;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_pseudonimizar_audit_log_orfao() FROM PUBLIC;
--> statement-breakpoint
-- Expurgo físico: só logs com 180+ dias, independente de pseudonimização —
-- retenção do Marco Civil desatrelada do ciclo de vida da conta (regra 1/2).
CREATE OR REPLACE FUNCTION app_expurgar_audit_log_expirado() RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH apagados AS (
    DELETE FROM audit_log
     WHERE criado_em < now() - INTERVAL '180 days'
    RETURNING id
  )
  SELECT count(*)::int FROM apagados;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_expurgar_audit_log_expirado() FROM PUBLIC;
--> statement-breakpoint
-- Role de job dedicada (mesmo desenho de iris_escalonamento): sem SELECT em
-- tabela nenhuma, só EXECUTE nas duas funções acima.
GRANT EXECUTE ON FUNCTION app_pseudonimizar_audit_log_orfao() TO iris_expurgo_audit_log;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_expurgar_audit_log_expirado() TO iris_expurgo_audit_log;
```

- [ ] **Step 8: Aplicar migração e confirmar role**

Run: `pnpm db:migrate`
Expected: migração aplicada sem erro. Se a role `iris_expurgo_audit_log` ainda não existir, criar (via migração separada ou à mão em dev) antes deste GRANT — seguir o padrão da role `iris_escalonamento` documentado em `infra/README.md`.

- [ ] **Step 9: Implementar o script de job (parte 2 do arquivo)**

File: `scripts/expurgo-audit-log.mjs` (adicionar ao arquivo existente, guarda de execução no mesmo estilo de `scripts/escalonamento-risco.mjs`)

```javascript
import postgres from "postgres";
import { pathToFileURL } from "node:url";

function log(msg) {
  console.log(`[expurgo-audit-log] ${new Date().toISOString()} ${msg}`);
}

async function rodar(sql) {
  const [{ app_pseudonimizar_audit_log_orfao: pseudonimizados }] =
    await sql`SELECT app_pseudonimizar_audit_log_orfao()`;
  log(`pseudonimizados ${pseudonimizados} log(s) órfão(s).`);

  const [{ app_expurgar_audit_log_expirado: expurgados }] =
    await sql`SELECT app_expurgar_audit_log_expirado()`;
  log(`expurgados ${expurgados} log(s) com 180+ dias.`);

  return { pseudonimizados, expurgados };
}

async function main() {
  const url = process.env.EXPURGO_AUDIT_LOG_DATABASE_URL;
  if (!url) {
    throw new Error(
      "EXPURGO_AUDIT_LOG_DATABASE_URL não definida — o job precisa da role de login " +
        "que herda iris_expurgo_audit_log.",
    );
  }
  const sql = postgres(url, { max: 1 });
  try {
    await rodar(sql);
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error("[expurgo-audit-log] FALHA na execução:");
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 10: Documentar agendamento no Easypanel**

File: `infra/README.md` (adicionar seção ao lado da já existente do escalonamento)

```markdown
### Job: Expurgo de Audit Log (Marco Civil, 180 dias)

Sem cron nativo no Easypanel v2.31 — agendar via campo "Comando" do serviço,
apontando para:

    node scripts/expurgo-audit-log.mjs

Frequência recomendada: diária. Requer `EXPURGO_AUDIT_LOG_DATABASE_URL`
(role de login que herda `iris_expurgo_audit_log`, sem SELECT em tabela
nenhuma — só EXECUTE nas duas funções de pseudonimização/expurgo).
```

- [ ] **Step 11: Rodar testes**

Run: `pnpm test scripts/expurgo-audit-log.test.mjs`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/db/schema.ts db/migrations/ scripts/expurgo-audit-log.mjs scripts/expurgo-audit-log.test.mjs infra/README.md
git commit -m "feat(compliance): desatrelar expurgo de audit_log, pseudonimizar via SECURITY DEFINER e aplicar retenção de 6 meses do Marco Civil (#116)"
```

---

### Task 3: DPA Hostinger & Harmonização de Backup LGPD (Issues #102, #89)

**Files:**

- Create: `docs/legal/dpa-hostinger.md`
- Create: `src/lib/lgpd/erasure-response.ts`, `src/lib/lgpd/erasure-response.test.ts`
- Modify: `docs/legal/politica-retencao-dados.md` (referenciar o novo DPA)

**Interfaces:**

- Produces: `gerarMensagemConfirmacaoEliminacao(nomeTitular: string, dataHora: Date): string`

**Regras Levantadas:**

1. Registrar o DPA da Hostinger em `docs/legal/dpa-hostinger.md`.
2. Padronizar resposta ao titular sobre ciclo de backup de 30 dias.

- [ ] **Step 1: Rascunhar `docs/legal/dpa-hostinger.md`**

File: `docs/legal/dpa-hostinger.md`

```markdown
# DPA — Hostinger (Data Processing Agreement)

> **STATUS: RASCUNHO.** Este documento não está em vigor até leitura ao vivo
> pelo advogado responsável, sem apontamentos — mesmo método de validação
> usado nos demais documentos de `docs/legal/` (ver
> `docs/legal/validacao-legal-prontuario.md`). Registrar aqui a data e o
> resultado dessa leitura antes de considerar o DPA vigente.

## Partes

- **Operador (Controller):** R Sutil Correa Ltda, CNPJ 29.811.201/0001-50.
- **Operador Subcontratado (Processor):** Hostinger International Ltd.
  (infraestrutura de VPS — Easypanel + Postgres + MinIO, conforme
  `docs/arquitetura/plano-bootstrap-e-stack-vps.md`).

## Escopo do Tratamento

- Dados armazenados no VPS: banco Postgres (dado clínico do prontuário),
  MinIO (backups cifrados, réplica off-site), auth in-app (credenciais).
- Hostinger não tem acesso lógico ao conteúdo do banco/objetos — dado em
  repouso é cifrado (backup via `age`, ver `infra/backup/verify-offsite.sh`).
  A relação com a Hostinger é de infraestrutura, não de acesso a PII em
  claro.

## Retenção e Localização

- [ ] PENDENTE — confirmar com a Hostinger/contrato de VPS o país/região do
      datacenter contratado antes de fechar este documento (gate já registrado
      em memória de sessão: "gate aberto: provedor de IA + país na seção 9" —
      mesma pendência se aplica aqui para infraestrutura).
- Backups: ciclo de rotação de 30 dias (ver Task 2 abaixo / `erasure-response.ts`).

## Obrigações do Processor

- [ ] PENDENTE — anexar/linkar o DPA padrão publicado pela Hostinger (se
      existir) ou registrar aqui a ausência de um DPA formal disponibilizado
      pelo provedor, o que muda a análise de risco.

## Aprovação

- [ ] Leitura ao vivo pelo advogado — data: ______ — resultado: ______
```

- [ ] **Step 2: Escrever teste falho de `gerarMensagemConfirmacaoEliminacao`**

File: `src/lib/lgpd/erasure-response.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { gerarMensagemConfirmacaoEliminacao } from "./erasure-response";

describe("gerarMensagemConfirmacaoEliminacao", () => {
  it("menciona o titular, a data/hora e o ciclo de 30 dias do backup", () => {
    const msg = gerarMensagemConfirmacaoEliminacao(
      "Maria Souza",
      new Date("2026-08-02T14:30:00Z"),
    );
    expect(msg).toContain("Maria Souza");
    expect(msg).toContain("2026-08-02T14:30:00.000Z");
    expect(msg).toContain("30 dias");
  });
});
```

- [ ] **Step 3: Rodar teste, confirmar falha**

Run: `pnpm test src/lib/lgpd/erasure-response.test.ts`
Expected: FAIL com "gerarMensagemConfirmacaoEliminacao não definido".

- [ ] **Step 4: Implementar `erasure-response.ts`**

File: `src/lib/lgpd/erasure-response.ts`

```typescript
export function gerarMensagemConfirmacaoEliminacao(
  nomeTitular: string,
  dataHora: Date,
): string {
  return `Prezado(a) ${nomeTitular}, confirmamos que seus dados pessoais foram eliminados do banco de dados ativo da plataforma Iris em ${dataHora.toISOString()}. Em conformidade com as diretrizes de segurança da informação, réplicas cifradas de segurança em backups expiram no ciclo de rotação em até 30 dias.`;
}
```

- [ ] **Step 5: Rodar teste, confirmar passagem**

Run: `pnpm test src/lib/lgpd/erasure-response.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lgpd/erasure-response.ts src/lib/lgpd/erasure-response.test.ts docs/legal/dpa-hostinger.md docs/legal/politica-retencao-dados.md
git commit -m "docs(legal): registrar rascunho de DPA Hostinger e padronizar mensagem de expurgo LGPD (#102, #89)"
```
