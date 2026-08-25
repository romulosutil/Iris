# Expurgo de prontuário expirado — Arquitetura

> Issue [#352](https://github.com/romulosutil/Iris/issues/352) · Spec: [`spec.md`](./spec.md) · Contexto e decisões: [`context.md`](./context.md) · Tasks: [`tasks.md`](./tasks.md)
>
> **Este documento assume `context.md` lido.** Ele não repete os porquês já travados lá; descreve o desenho que decorre deles.

---

## 1. Visão em uma tela

```
┌─ ATO CLÍNICO ──────────────────────────────────────────────────────────┐
│  /pacientes/[id]  ──"Registrar alta"──▶  patient.alta_em               │
│                                          (trigger 0065 arquiva)        │
└────────────────────────────────────────────────┬───────────────────────┘
                                                 │ relógio de retenção parte
                                                 ▼
                        app_retencao_vence_em(alta, nascimento, meses)
                              FONTE ÚNICA DO PREDICADO (IMMUTABLE)
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
       app_paciente_expurgavel  app_pacientes_    app_retencao_avisar
            (por UUID)           expurgaveis        (cross-tenant)
                 │               (fila, tenant)          │
                 │                     │                 │
    ┌────────────┘                     │                 │  iris_retencao
    │  GATE                            │                 │  EXECUTE em 1 função
    ▼                                  ▼                 ▼  SELECT em nenhuma
app_purgar_paciente          /clinica/retencao     audit_log
   (coordenador)              (tela + ação)        acao='expurgo_aviso_previo'
    │                                                ator_id=NULL
    │  compartilha corpo                                  │
    ▼                                                     ▼
app_purgar_paciente_excepcional  ◀── reaplicar-tombstones.sql   faixa in-app
   (sem gate, exige base_legal)      (pós-restore, sem gate)
    │
    └──▶ audit_log acao='paciente_purgado'  ──▶  backup.sh  ──▶  tombstones CSV
                (MESMA string nas duas vias)
```

**A leitura essencial:** o job só escreve `audit_log`. A seta que apaga prontuário sai exclusivamente de uma sessão autenticada de coordenador. Não existe caminho de automação para `DELETE`.

---

## 2. Camada SQL

Duas migrações. A ordem importa e o motivo está em `CLAUDE.md` § _Migrações_.

### 2.1 `0127_*` — gerada por `pnpm db:generate`

Único conteúdo: o índice parcial que sustenta a varredura e a fila. Índice é modelado pelo Drizzle, logo **tem** que passar por `db:generate` — escrever à mão dessincroniza o snapshot, que foi exatamente o defeito reconciliado na `0078`.

```ts
// src/db/schema.ts — dentro do bloco de índices de `patient`
idxPatientRetencao: index("idx_patient_retencao")
  .on(table.clinicId, table.altaEm)
  .where(sql`alta_em IS NOT NULL AND nascimento IS NOT NULL`),
```

Parcial de propósito: a esmagadora maioria dos pacientes tem `alta_em NULL` (em acompanhamento) e nunca entra em nenhuma das duas consultas. O índice fica pequeno e a varredura cross-tenant não faz seq scan em `patient`.

> Commitar `.sql` **e** `meta/0127_snapshot.json` juntos. O `_journal.json` é atualizado pelo próprio `db:generate`.

### 2.2 `0128_retencao_expurgo_wiring.sql` — escrita à mão

Nada aqui é modelado pelo Drizzle (funções, role, grants), logo **não** passa por `db:generate` e **não** toca o snapshot. Exige entrada manual no `_journal.json` com `when` = `when` da `0127` **+ 1000**.

#### (a) Fonte única do predicado

```sql
CREATE FUNCTION app_retencao_vence_em(
  p_alta        date,
  p_nascimento  date,
  p_politica_meses integer
) RETURNS date
LANGUAGE sql IMMUTABLE
```

Retorna a **data civil** em que a guarda expira, ou `NULL` se `p_alta` ou `p_nascimento` for `NULL` (nunca vence).

```
GREATEST(
  p_nascimento + INTERVAL '18 years',
  p_alta + GREATEST(INTERVAL '10 years',
                    make_interval(months => COALESCE(p_politica_meses, 0)))
)::date
```

`IMMUTABLE` porque é função pura dos argumentos — é isso que permite usá-la em índice futuro e garante que os três chamadores computem **o mesmo número**. A fórmula é a já mergeada e revisada na `0045`/`0087`; este passo a extrai, não a reescreve.

**Por que função e não coluna materializada:** o prazo depende de `clinic.politica_retencao_meses`, que a clínica altera. Coluna por trigger envelheceria em silêncio na mudança de política, e um paciente apareceria elegível cedo demais. Numa operação irreversível, "cedo demais" é prontuário perdido. Ver `context.md` D7.

#### (b) Predicado por UUID, reescrito para delegar

```sql
CREATE OR REPLACE FUNCTION app_paciente_expurgavel(p_patient uuid) RETURNS boolean
```

Corpo passa a ser:

```
SELECT (now() AT TIME ZONE c.timezone)::date
         >= app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
  FROM patient p JOIN clinic c ON c.id = p.clinic_id
 WHERE p.id = p_patient
   AND p.clinic_id = app_clinic_id_exigido();
```

Duas mudanças de comportamento, ambas desejadas e ambas com teste:

1. **Fuso.** Antes: `now() >= (date + interval)`, misturando `timestamptz` do fuso do servidor com aritmética de `date`. Agora: data civil no fuso da clínica dos dois lados. Ver `context.md` D8.
2. **Fonte única.** A fórmula deixa de estar escrita aqui.

Semântica preservada: `alta_em` ou `nascimento` NULL → helper devolve `NULL` → `data >= NULL` → `NULL` → o gate lê `false` pelo `COALESCE`. Linha ausente (inexistente ou cross-tenant) → sem linha → `NULL`. Mesmo resultado de hoje.

> ⚠️ `CREATE OR REPLACE` torna o diff enganoso. O teste **mede `pg_proc.prosrc`**, não lê o `.sql` — [[create-or-replace-torna-diff-enganoso]].

#### (c) Corpo de erasure compartilhado

```sql
CREATE FUNCTION app_purgar_paciente_interno(p_patient uuid, p_detalhe jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

Recebe o paciente **já autorizado** e o `detalhe` pronto. Faz, exatamente na ordem de hoje:

1. `INSERT audit_log` com `acao='paciente_purgado'`, `patient_id=NULL`, `detalhe=p_detalhe`.
2. `UPDATE audit_log` do sujeito → `patient_id=NULL`, `detalhe` sobrescrito por inteiro.
3. `UPDATE alerta_risco_clinico` → pseudonimiza, `[expurgado]` nos textos livres.
4. DELETEs leaf-first (as ~24 tabelas, lista **movida** do corpo atual, não reescrita).
5. `DELETE FROM patient`.

**Sem grant para ninguém** (`REVOKE ALL FROM PUBLIC` e nada mais): só as duas vias públicas a chamam, e ambas são DEFINER do mesmo owner.

Por que extrair: sem isso existem duas listas de DELETE. Uma que diverge da outra apaga metade do prontuário e passa verde — R352.B4.

> A sobrescrita integral de `detalhe` no passo 2 é **decisão travada na revisão do PR #68**: erasure é whitelist, não blacklist. PII numa chave imprevista sobreviveria. Over-remoção não gera vazamento; under-remoção sim. Não "consertar".

#### (d) As duas vias públicas

```sql
CREATE OR REPLACE FUNCTION app_purgar_paciente(p_patient uuid, p_motivo text) RETURNS void
```

Guards, **nesta ordem** (a ordem é o que preserva a mensagem opaca travada na revisão do PR #68):

1. papel `coordenador` via `app_user_role_exigido()` — inalterado;
2. paciente existe **e** é da clínica → senão `'paciente inexistente ou sem permissão'` — inalterado;
3. **novo:** `IF NOT COALESCE(app_paciente_expurgavel(p_patient), false) THEN RAISE EXCEPTION 'app_purgar_paciente: prazo de guarda ainda não venceu'`.

O gate é o **terceiro**, nunca o primeiro: subir a checagem de elegibilidade acima do guard de tenant transformaria a função em oráculo de existência entre clínicas.

Depois: `PERFORM app_purgar_paciente_interno(p_patient, jsonb_build_object('motivo', p_motivo, 'pseudonimizado', true))`.

```sql
CREATE FUNCTION app_purgar_paciente_excepcional(
  p_patient uuid, p_motivo text, p_base_legal text
) RETURNS void
```

Guards 1 e 2 idênticos. **Sem** guard 3. Acrescenta: `IF coalesce(btrim(p_base_legal),'') = '' THEN RAISE`.

Chama o mesmo interno com `jsonb_build_object('motivo', p_motivo, 'base_legal', p_base_legal, 'excepcional', true, 'pseudonimizado', true)`.

**`acao` continua `'paciente_purgado'`** — vem do interno, e por isso não há como divergir por descuido. É requisito de interface: `backup.sh:470` filtra por essa string literal (R352.B3).

Grants: `EXECUTE` para `app_role` nas duas. A excepcional recebe grant porque `reaplicar-tombstones.sql` roda como owner e a UI não a chama — mas manter simétrico evita que alguém "descubra" que precisa de grant durante um incidente de restauração.

#### (e) Fila tenant-scoped

```sql
CREATE FUNCTION app_pacientes_expurgaveis(p_limite integer, p_offset integer)
RETURNS TABLE (
  paciente_id uuid, nome text, alta_em date,
  vence_em date, avisado_em timestamptz, total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
```

Isolamento por `app_clinic_id_exigido()` — levanta `P0001` diagnosticável sem tenant. **Nunca** `app_clinic_id_atual()` em predicado de isolamento (devolve `NULL` e some com a linha em silêncio), **nunca** `current_setting` cru (`42704`/`22P02`).

Precisa ser `SECURITY DEFINER` pelo mesmo motivo que `app_paciente_expurgavel` já é. Sendo DEFINER, **o guard interno é a única fronteira** e copia o predicado exato da policy de leitura de `patient`, não só a igualdade de clínica — [[definer-espelha-predicado-leitura]].

`total` = `count(*) OVER ()` sobre a CTE **já filtrada** e **antes** do `LIMIT/OFFSET`. Contar antes, filtrar antes, limitar por último — [[varredura-filtro-depois-do-limit]].

`avisado_em` = `max(criado_em)` do `audit_log` com `acao='expurgo_aviso_previo'` para aquele paciente. É o que a tela precisa para responder "a clínica foi avisada?".

**Rejeitado:** view `security_barrier`. A barreira impede o `LIMIT` de descer até o índice — já custou 688ms contra 10ms noutra fila deste repo ([[security-barrier-view-bloqueia-limit]]) — e view não aceita parâmetro de paginação sem virar função de qualquer forma.

#### (f) Varredura de aviso

```sql
CREATE FUNCTION app_retencao_avisar(
  p_referencia timestamptz, p_aviso_dias integer, p_lote integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

**Uma instrução**, `INSERT … SELECT` sobre CTE:

```
elegiveis AS (
  SELECT p.id, p.clinic_id, p.alta_em,
         app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses) AS vence_em
    FROM patient p JOIN clinic c ON c.id = p.clinic_id
   WHERE p.alta_em IS NOT NULL AND p.nascimento IS NOT NULL
),
alvo AS (
  SELECT e.* FROM elegiveis e
   WHERE e.vence_em >  (p_referencia AT TIME ZONE <tz da clínica>)::date
     AND e.vence_em <= (p_referencia AT TIME ZONE <tz>)::date + p_aviso_dias
     AND NOT EXISTS (
       SELECT 1 FROM audit_log al
        WHERE al.entidade = 'patient' AND al.entidade_id = e.id
          AND al.acao = 'expurgo_aviso_previo'
          AND al.criado_em > e.alta_em
     )
   ORDER BY e.vence_em ASC
   LIMIT p_lote
   FOR UPDATE OF p SKIP LOCKED
)
INSERT INTO audit_log (…) SELECT … FROM alvo
```

Quatro propriedades que são requisito, não estilo:

- **Janela fechada em cima** (`vence_em > hoje`): passado o vencimento quem age é a fila. Sem esse limite o job reavisa a cada varredura — R352.D2.
- **Dedup ancorado na alta** (`criado_em > alta_em`): alta corrigida reabre o aviso; a mesma alta nunca avisa duas vezes — R352.D3.
- **Efeito e estado na mesma instrução**: o `INSERT` **é** o dedup. Não existe janela entre "avisei" e "gravei que avisei" — [[varredura-escreve-o-proprio-predicado]].
- **`LIMIT` depois dos predicados**: linha inelegível não consome cota do lote e não trava a fila — [[varredura-filtro-depois-do-limit]].

#### (g) Role do job

```sql
CREATE ROLE iris_retencao NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO iris_retencao;
GRANT EXECUTE ON FUNCTION app_retencao_avisar(timestamptz, integer, integer) TO iris_retencao;
```

E **nada mais**. Sem `SELECT` em tabela nenhuma. Credencial vazada não lê paciente nem diário — é o argumento literal de `iris_arquivamento` no `.env.example`.

O `CREATE ROLE` vai dentro de `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_roles …) $$` — role é objeto de **cluster**, não de banco, e a migração precisa ser reexecutável ([[pg-dump-perde-roles-e-rls]]).

### 2.3 Fora da migração: `infra/backup/reaplicar-tombstones.sql`

Uma linha, e é a que impede a restauração de travar:

```diff
-    PERFORM app_purgar_paciente(
-      r.patient_id,
-      'reaplicacao de expurgo apos restauracao de backup (LGPD Art. 18)'
-    );
+    PERFORM app_purgar_paciente_excepcional(
+      r.patient_id,
+      'reaplicacao de expurgo apos restauracao de backup (LGPD Art. 18)',
+      'reaplicacao pos-restore'
+    );
```

Sem isso: titular expurgado por ordem judicial é, por definição, inelegível; o gate recusa; `restore.sh` roda com `ON_ERROR_STOP=1` e aborta a restauração inteira, mandando **não liberar o banco para uso**. Ver `context.md` §3.

---

## 3. Camada de aplicação

### 3.1 Registrar alta — `src/app/(app)/pacientes/[id]/`

Espelha `alternarArquivamento` linha a linha; a única diferença de substância é a coluna escrita.

| Arquivo           | Papel                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `schemas.ts`      | `altaSchema` (data não-futura) + `motivoAltaSchema`, com limites como constantes nomeadas exportadas. |
| `logic.ts`        | `registrarAltaCore` / `desfazerAltaCore`, ambos `comEscrita(...)`. Validação Zod **dentro** do core.  |
| `actions.ts`      | Wrappers `"use server"`, `getTenantContext()` dentro, `revalidatePath` do paciente e da lista.        |
| `alta-dialog.tsx` | Radix `Dialog`, `Field` + `Input` data, textarea de motivo, `useActionState`, fecha só no sucesso.    |

`requireRole(ctx, "coordenador")`. Idempotência no `WHERE` (`isNull(patient.altaEm)` para registrar, `isNotNull` para desfazer), como o arquivamento faz — repetir o clique não regrava a data.

**O app não arquiva.** O trigger `patient_alta_arquiva_trg` (`0065`) já faz, e só na transição `NULL → NOT NULL`. Duplicar no app cria duas fontes de verdade para o mesmo efeito — R352.A6.

**Desfazer não desarquiva** (R352.A7): desarquivar é ato próprio, e o comentário existente em `logic.ts:50-56` já registra o racional.

### 3.2 Fila e expurgo — `src/app/(app)/clinica/retencao/`

Molde direto de `src/app/(app)/clinica/auditoria/`, que é a irmã mais próxima: tabela paginada, coordenador-only, dados sensíveis.

| Arquivo               | Papel                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `queries.ts`          | `lerPaginaExpurgaveis(ctx, pagina)` → `withTenant` + `select * from app_pacientes_expurgaveis($1,$2)`. |
| `logic.ts`            | `ITENS_POR_PAGINA = 25`, `grampearPagina`, `offsetDaPagina`, `purgarPacienteCore`.                     |
| `actions.ts`          | Wrapper `"use server"` + `revalidatePath('/clinica/retencao')` e `revalidatePath('/pacientes')`.       |
| `page.tsx`            | `getTenantContext` + `requireRole(ctx,'coordenador')` reafirmado + `EmptyState` quando vazio.          |
| `fila-tabela.tsx`     | `Table zebrada` + `StatusBadge` (avisado / não avisado) + `Paginacao`.                                 |
| `dialogo-expurgo.tsx` | Confirmação por digitação do nome + motivo.                                                            |
| `a11y.test.tsx`       | `axe-core`, como as telas irmãs.                                                                       |

`layout.tsx` de `/clinica` ganha a aba `{ href: "/clinica/retencao", rotulo: "Retenção & Expurgo" }`.

**Regra de payload (R352.C8):** o tipo devolvido por `queries.ts` só tem campo que a tela desenha. Nada de `detalhe`, nada de id que a tabela não usa. Foi o achado do PR #448, e aqui o dado é mais sensível que lá.

**Sem `comEscrita` em `purgarPacienteCore`**, com comentário na linha explicando (`context.md` D6). É a única exceção do repo — sem o comentário e sem o teste, alguém adiciona o wrapper em três meses achando que corrige um esquecimento.

### 3.3 Confirmação por digitação

Não existe componente. Construir **dentro** de `dialogo-expurgo.tsx`, não como primitivo do design system — um confirmador é útil generalizado, mas generalizar a partir de um caso é como se inventa API errada.

```
[input controlado] === nomeDoPaciente   →  botão habilitado
```

Match exato, sem normalizar caixa nem acento (R352.C6). Normalizar reduz atrito exatamente onde o atrito é o produto.

A11y: `Field` + `useId()`, `aria-describedby` na instrução, e o `Dialog` da casa já traz focus trap, Esc e restauração de foco do Radix. Botão de confirmar continua `variante="primaria"` — **não existe** variante destrutiva no design system, e inventar uma aqui é escopo de design system, não de #352.

---

## 4. Job

```
infra/retencao/agendador.sh   (laço; molde de infra/arquivamento/agendador.sh)
        │  node scripts/retencao-aviso-previo.mjs --once
        ▼
scripts/retencao-aviso-previo.mjs   (UMA varredura e sai)
        │  RETENCAO_DATABASE_URL  → role iris_retencao
        ▼
   SELECT app_retencao_avisar(now(), 90, 200)   × até 10 lotes
        │
        ▼
   audit_log  acao='expurgo_aviso_previo'
```

- **Lote 200, teto de 10 lotes (2.000) por execução.** Para quando um lote devolve `0` ou ao atingir o teto. O resto vai para o tick seguinte sem perda — a elegibilidade é derivada de estado no banco, não de cursor. Cursor persistido reintroduziria o modo de falha em que a linha inelegível que não muda de estado trava a fila.
- **Cada lote é uma transação.** Falha aborta o lote inteiro, mantém os anteriores, loga o índice e a mensagem do Postgres, **não** escreve heartbeat, sai `1`. Transação única para a varredura toda desfaria milhares de avisos válidos por causa de uma linha.
- **Régua espelhada.** `src/lib/jobs/retencao.ts` exporta `REGUA_RETENCAO = { diasAvisoPrevio: 90 }`; o `.mjs` tem a sua cópia; `scripts/retencao-aviso-previo.test.mjs` importa as duas e falha se divergirem. É o mesmo mecanismo que segura `83/90` no auto-arquivamento — quem impede a divergência é o teste, não a boa intenção.
- **`--dry-run` faz `ROLLBACK` e não escreve heartbeat.**
- **Nenhuma saída de rede além do Postgres.** A imagem não instala cliente HTTP — proibição estrutural (`context.md` D9).

`infra/retencao/Dockerfile` no molde de `infra/arquivamento/Dockerfile`: `node:22-alpine`, `apk add bash` (o agendador usa `set -Eeuo pipefail` e `[[ ]]`, e alpine só traz `ash`), COPY com caminho **relativo à raiz do repo** (Easypanel builda com contexto raiz), deps listadas à mão, `CMD` (não `ENTRYPOINT`).

**Provisionamento no Easypanel é passo manual e verificado no painel** — issue fechada não prova serviço de pé ([[job-provisionado-nao-e-job-que-fecha-ciclo]]). Réplicas = 1.

---

## 5. Matriz de autorização

| Ator                     | Registrar alta    | Ver fila | Purgar (normal)  | Purgar (excepcional) | Avisar |
| ------------------------ | ----------------- | -------- | ---------------- | -------------------- | ------ |
| `coordenador`            | ✅                | ✅       | ✅ se elegível   | ✅ (sem UI no V1)    | —      |
| `terapeuta`              | ❌                | ❌       | ❌               | ❌                   | —      |
| `admin_recepcao`         | ❌                | ❌       | ❌               | ❌                   | —      |
| `iris_retencao` (job)    | ❌                | ❌       | ❌ **`42501`**   | ❌ **`42501`**       | ✅     |
| owner (restore, `psql`)  | —                 | —        | —                | ✅                   | —      |
| Conta em somente-leitura | ❌ (`comEscrita`) | ✅       | ✅ **(exceção)** | ✅                   | —      |

As duas células que mais surpreendem — job recebendo `42501` e conta inadimplente **podendo** purgar — são as que exigem teste explícito. Comportamento surpreendente sem teste vira "bug" para o próximo leitor.

---

## 6. O que este desenho deliberadamente NÃO faz

| Não faz                                    | Por quê                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Materializar data de vencimento em coluna  | Envelhece quando a clínica muda a política (`context.md` D7).                                               |
| Expor expurgo no prontuário do paciente    | Ato irreversível a um clique do fluxo diário. A tela dedicada exige navegação deliberada e mostra contexto. |
| Rota interna com Bearer para expurgo       | Token vazado apagaria prontuário de qualquer clínica sem undo (`context.md` D3).                            |
| Purgar em lote                             | Confirmação por nome é por paciente, de propósito. Lote reintroduz o clique fácil.                          |
| Notificar por e-mail                       | Arrasta `resend` para a imagem do job e reabre um modo de falha já pago duas vezes.                         |
| Criar variante destrutiva no design system | Escopo de design system. Uma feature não define token global.                                               |
| Deletar `audit_log` do sujeito             | Pseudonimiza. Decisão travada na 6.3 (A3), não reabrir.                                                     |
| Mudar a `acao` para `dado_eliminado`       | Quebra o ledger de tombstones em silêncio (`context.md` D4). Corrige-se o documento.                        |
