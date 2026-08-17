# Consentimento de titular adulto autoconsentindo (spec endurecido)

> Origem: Issue #100 ("Bloqueador: consentimento hoje só cobre paciente
> menor"), levantada durante a expansão de nicho (Terapia Convencional,
> TCC — ver `docs/agente/protocolo-terapia-convencional.md` e
> `docs/agente/protocolo-tcc.md`). Este spec segue o formato/rigor de
> `.specs/features/fase6/spec.md`: decisão travada, não lista de opções.
> Nenhuma migração é executada por este spec — só planejada (regra do
> projeto, `CLAUDE.md`).

## Estado de partida verificado (não do plano — do repo)

- `src/db/schema.ts:37-41` — `consentTipo` é um `pgEnum` com 3 valores:
  `"tratamento_dados_menor"`, `"uso_ia_processamento"`,
  `"exportacao_relatorios"`. Nenhum valor cobre autoconsentimento adulto.
- `src/db/schema.ts:313-324` — tabela `consent`: `patientId` (FK
  `patient.id`, `onDelete: "restrict"`), `tipo` (`notNull`),
  `responsavelSignatario: text(...).notNull()` (constraint de banco, sem
  `check` condicional), `versaoTermo` (`notNull`), `assinadoEm`
  (`notNull`, `defaultNow()`).
- `src/app/(app)/pacientes/novo/logic.ts:34-41` — `criarPacienteEConsent`
  exige `responsavelSignatario` não-vazio incondicionalmente (`if
(!responsavelSignatario) return { error: ... }`) e insere `consent` com
  `tipo: "tratamento_dados_menor"` **hardcoded** (linha 68) — não lê tipo
  do form, não há branch.
- `src/app/(app)/pacientes/novo/novo-paciente-form.tsx:57-65` — único
  campo de UI para o consentimento é `responsavelSignatario`
  (`required`), rotulado "Responsável que assina o Consentimento LGPD".
  Não existe campo de tipo de paciente/consentimento no form atual.
- RLS de `consent` (`db/migrations/0001_rls.sql:206-218`): `consent_read`
  usa só `app_patient_in_clinic(patient_id)`; `consent_insert` usa
  `app_patient_in_clinic(patient_id)` + `current_setting('app.user_role')
IN ('admin_recepcao', 'coordenador')`. **Nenhuma policy referencia
  `tipo` ou `responsavelSignatario`.** `REVOKE UPDATE, DELETE ON consent
FROM app_role` (linha 23, comentário "append-only (LGPD)") — consent é
  append-only por design, sem UPDATE possível pela role de app.
- Expurgo (`db/migrations/0045_expurgo_retencao.sql:97`):
  `app_purgar_paciente` faz `DELETE FROM consent WHERE patient_id =
p_patient` — **delete físico completo**, não pseudonimização. Diferente
  de `audit_log`, que é pseudonimizado (Fase 6, A3) porque tem retenção
  própria pós-expurgo; `consent` não tem essa exigência — morre junto com
  o paciente.
- Próxima migração livre: journal (`db/migrations/meta/_journal.json`)
  termina em `idx: 48`, `tag: "0048_snapshot_candidatura_team_guard"`,
  `when: 1784521559778`. A #122 tomou o `0049`
  (`0049_alerta_risco_clinico`, `when: 1784521560778`), então **o próximo
  número livre é `0050`** — `when: 1784521561778`.
- Padrão de `check()` condicional já existe no schema (ex.:
  `patient_protocol_vigencia` em `schema.ts:371-374`,
  `ctm_nao_auto_supervisao` em `schema.ts:404-407`) — usa
  `sql\`${t.col} IS NULL OR <condição>\``dentro do array`(t) => [...]`de`pgTable`.

---

## Decisão de modelagem

### D1 — Novo valor de enum + `responsavelSignatario` nullable + CHECK condicional

**Decisão travada:** adicionar `"autoconsentimento_titular_adulto"` ao
enum `consentTipo`; tornar `consent.responsavelSignatario` nullable;
adicionar `CHECK` garantindo XOR entre "tem responsável e é tipo menor"
e "não tem responsável e é tipo adulto":

```sql
CHECK (
  (tipo = 'tratamento_dados_menor' AND responsavel_signatario IS NOT NULL)
  OR
  (tipo = 'autoconsentimento_titular_adulto' AND responsavel_signatario IS NULL)
  OR
  (tipo IN ('uso_ia_processamento', 'exportacao_relatorios'))
)
```

Os dois valores de enum pré-existentes fora do par menor/adulto
(`uso_ia_processamento`, `exportacao_relatorios`) já convivem hoje sem
regra própria sobre `responsavelSignatario` (nenhum código atual os usa —
grep confirma zero ocorrências fora de `schema.ts`); a constraint os
deixa passar sem restringir, preservando compatibilidade retroativa.

**Trade-offs — por que não as alternativas:**

- **Tabela separada `consent_adulto` / `consent_menor`**: rejeitada.
  Duplicaria `patientId`, `versaoTermo`, `assinadoEm`, a policy RLS
  inteira (`consent_read`/`consent_insert`), e o `DELETE` no expurgo
  (`0045`) precisaria de uma segunda linha. Sem ganho de integridade que
  o CHECK não dê, com custo de manutenção dobrado numa tabela que já é
  append-only e simples.
- **Coluna nova `pessoaAdulta: boolean` em vez de enum novo**: rejeitada.
  O enum `tipo` já é o discriminador correto do domínio ("que tipo de
  consentimento é este"); adicionar um booleano paralelo cria duas
  fontes de verdade que podem divergir (`tipo=menor` +
  `pessoaAdulta=true` seria um estado inválido não coberto por CHECK sem
  repetir a mesma lógica). O enum sozinho já modela "tipo de titular" —
  não precisa de dimensão extra.
- **Manter `responsavelSignatario` `NOT NULL` e usar sentinela (ex.: nome
  do próprio paciente, ou string `"AUTOCONSENTIMENTO"`)**: rejeitada.
  Viola o princípio de dado de menor do projeto (`AGENTS.md` §6): um
  campo rotulado "responsável" preenchido com o nome do próprio paciente
  adulto é semanticamente falso e contamina relatórios/exports que leem
  esse campo literalmente. `NULL` é a representação correta de "não
  existe responsável para este consentimento".
- **CHECK só a nível de aplicação (sem constraint de banco)**: rejeitada.
  Mesmo raciocínio de `NOT NULL` original: o projeto já trata isso como
  "constraint de banco, não só validação de app" (enunciado da própria
  tarefa) — um bug futuro em qualquer novo caminho de escrita (migração
  de dados, script admin, novo formulário) não pode inserir um estado
  inconsistente silenciosamente. O CHECK é a última linha de defesa.

---

## Plano de migração Drizzle (planejado — NÃO executar)

- **Próximo número:** `0050` (o `0049` foi tomado pela #122).
- **Nome de arquivo:** `db/migrations/0050_consentimento_titular_adulto.sql`.
- **`when` no journal:** `1784521559778 + 1000 = 1784521560778` (regra
  `drizzle-hand-migration-when-ordering` — nunca placeholder).
- **DDL exato:**

```sql
-- statement-breakpoint
ALTER TYPE consent_tipo ADD VALUE 'autoconsentimento_titular_adulto';
-- statement-breakpoint
ALTER TABLE consent ALTER COLUMN responsavel_signatario DROP NOT NULL;
-- statement-breakpoint
ALTER TABLE consent ADD CONSTRAINT consent_responsavel_por_tipo CHECK (
  (tipo = 'tratamento_dados_menor' AND responsavel_signatario IS NOT NULL)
  OR
  (tipo = 'autoconsentimento_titular_adulto' AND responsavel_signatario IS NULL)
  OR
  (tipo IN ('uso_ia_processamento', 'exportacao_relatorios'))
);
```

- **Restrição do Postgres sobre `ALTER TYPE ... ADD VALUE`:** em versões
  ≥ 12, um valor de enum recém-adicionado **não pode ser usado na mesma
  transação** em que foi criado (ele pode ser referenciado por DDL
  subsequente, mas não em `INSERT`/comparação dentro da mesma
  transação-commit). `drizzle-kit` gera migrações hand-rolled com
  `--> statement-breakpoint` entre statements — **cada statement roda
  isolado** via `db/migrate.ts` do projeto (confirmar em execução real,
  mas o padrão já usado nas demais 48 migrações do projeto separa DDL
  incompatível em statements distintos com breakpoint, o que é
  suficiente: o `ALTER TYPE` some seu próprio statement/commit antes do
  `ALTER TABLE` seguinte). Não é necessário rodar `ALTER TYPE` "fora de
  transação" manualmente — o padrão de statement-breakpoint do projeto já
  resolve isso, desde que o runner de migração não agrupe os 3
  statements numa única transação (verificar `db/migrate.ts` antes de
  aplicar; se agrupar, split em duas migrações: `0050a` só o `ALTER TYPE`,
  `0050b` o `DROP NOT NULL` + `CHECK`).
- **Correspondência de schema Drizzle** (`src/db/schema.ts`):
  - `consentTipo`: adicionar `"autoconsentimento_titular_adulto"` ao
    array do `pgEnum` (linha 37-41).
  - `consent.responsavelSignatario`: remover `.notNull()` (linha 319).
  - Adicionar ao array `(t) => [...]` da `pgTable("consent", ...)` —
    hoje a tabela é definida sem terceiro argumento de callback
    (`schema.ts:313-324` é um objeto de colunas puro); precisa virar
    `pgTable("consent", { ...colunas... }, (t) => [check("consent_responsavel_por_tipo", sql\`...\`)])`no mesmo padrão de`patient_protocol` (`schema.ts:371-374`).

---

## Mudança em `criarPacienteEConsent` (`src/app/(app)/pacientes/novo/logic.ts`)

**Decisão travada:** adicionar parâmetro de tipo de consentimento lido do
form (`formData.get("tipoConsentimento")`, valores `"menor" |
"adulto"`, default `"menor"` para compatibilidade retroativa com o form
atual que não terá esse campo até a UI ser atualizada) e branch de
validação condicional:

```ts
const tipoConsentimento =
  String(formData.get("tipoConsentimento") ?? "menor").trim() === "adulto"
    ? "adulto"
    : "menor";

const responsavelSignatario = String(
  formData.get("responsavelSignatario") ?? "",
).trim();

if (tipoConsentimento === "menor" && !responsavelSignatario) {
  return {
    error: "Nome do responsável que assina o consentimento é obrigatório.",
  };
}
if (tipoConsentimento === "adulto" && responsavelSignatario) {
  return {
    error: "Consentimento de titular adulto não deve informar responsável.",
  };
}
```

E no `insert`:

```ts
await tx.insert(consent).values({
  patientId: novo!.id,
  tipo:
    tipoConsentimento === "adulto"
      ? "autoconsentimento_titular_adulto"
      : "tratamento_dados_menor",
  responsavelSignatario:
    tipoConsentimento === "adulto" ? undefined : responsavelSignatario,
  versaoTermo: VERSAO_TERMO_CONSENTIMENTO_ATUAL,
});
```

Rejeição explícita do responsável preenchido no ramo adulto (segundo
`if`) em vez de simplesmente ignorá-lo: evita que um form mal configurado
grave um responsável "fantasma" que a constraint de banco rejeitaria de
qualquer forma com erro 500 opaco — o erro amigável acontece antes,
no server action.

**Fora de escopo deste spec** (fica para a fatia de UI, não decidida
aqui): o campo `tipoConsentimento` em
`novo-paciente-form.tsx` e a decisão de produto de como esse seletor
aparece (radio "Paciente menor / Paciente adulto autoconsentindo",
provavelmente ligado ao nicho — TEA sempre menor, Convencional/TCC
majoritariamente adulto, mas não exclusivamente — não travar isso aqui).

---

## Impacto em RLS / multi-tenant

Confirmado por grep em `db/migrations/*.sql`: nenhuma policy de `consent`
referencia `tipo` ou `responsavel_signatario` — `consent_read` e
`consent_insert` (`0001_rls.sql:211-218`) usam só
`app_patient_in_clinic(patient_id)` e `current_setting('app.user_role')`.
**A mudança de modelagem não quebra RLS.** `REVOKE UPDATE, DELETE ON
consent FROM app_role` (append-only) também não é afetado — a nova linha
de CHECK constraint é avaliada no `INSERT`, que continua permitido pela
mesma policy `consent_insert` existente, sem necessidade de nova policy.

---

## Impacto no fluxo de expurgo/LGPD

`.specs/features/fase6/spec.md` A3 trava que `audit_log` é
**pseudonimizado** (não deletado) no expurgo, porque a trilha de
auditoria tem retenção própria que sobrevive ao paciente. `consent` **não
está nesse regime**: `0045_expurgo_retencao.sql:97` faz `DELETE FROM
consent WHERE patient_id = p_patient` — delete físico, sem pseudonimização,
porque o consentimento não tem valor de compliance após o titular deixar
de existir na base (diferente da trilha "isto foi purgado por quem/quando",
que precisa sobreviver).

**Decisão travada:** o novo tipo `autoconsentimento_titular_adulto` **não
muda essa lógica**. `app_purgar_paciente` continua deletando todas as
linhas de `consent` do paciente por `patient_id`, independente do `tipo`
armazenado — a query já é agnóstica ao valor de `tipo`. Nenhuma alteração
necessária em `0045`/`app_purgar_paciente`.

---

## Decisões que precisam confirmação do Rômulo antes de codar

Já decidido por este spec (desenho travado, não fica em aberto):

- Modelagem D1 (enum novo + nullable + CHECK condicional) e a rejeição
  justificada das 4 alternativas.
- Nome/número da migração (`0050_consentimento_titular_adulto.sql`) e
  DDL exato.
- Contrato de `criarPacienteEConsent` (parâmetro, branches de validação,
  valores de insert).
- Que RLS não precisa mudar.
- Que o expurgo (`0045`) não precisa mudar.

**Precisa confirmação humana antes de codar (regra do projeto,
`CLAUDE.md`: "qualquer DDL que altere tabela que já tenha dado" +
"qualquer mudança em schema de auth/LGPD"):**

1. **Executar a migração `0050`** — `consent` já tem dado real em
   produção (clínica(s) TEA ativa(s)); `ALTER TYPE`, `DROP NOT NULL` e
   `ADD CONSTRAINT` em tabela com dado é exatamente o caso que
   `CLAUDE.md` marca como "confirmar antes".
2. **Confirmar se o runner de migração do projeto (`db/migrate.ts`)
   agrupa os 3 statements numa única transação** — determina se a
   migração pode ser um arquivo só (`0050`) ou precisa virar dois
   (`0050a`/`0050b`) por causa da restrição do Postgres sobre uso de
   valor de enum recém-criado na mesma transação. Verificação técnica
   simples, mas decide a estrutura do arquivo de migração.
3. **Nome/valores exatos de UI** (`tipoConsentimento`, rótulos do
   seletor, se o nicho pré-seleciona o tipo) — fora do escopo de
   modelagem deste spec, é decisão de produto/UX pendente de validação
   com o Rômulo antes de tocar `novo-paciente-form.tsx`.
4. **Se `uso_ia_processamento` e `exportacao_relatorios` (hoje não
   usados em código, só no enum) devem ganhar sua própria regra de
   `responsavelSignatario` quando forem implementados** — este spec só
   garante que a constraint não quebra o que já existe; não decide o
   comportamento futuro desses dois tipos.
