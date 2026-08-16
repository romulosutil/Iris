# Diagnóstico — deriva de hash em migrações aplicadas (15/08/2026)

> Investigação disparada por uma medição do guard `scripts/verificar-hash-migracoes.mjs`
> contra o Postgres local (`localhost:5433`): **37 das 98 migrações aplicadas divergem**
> do sha256 do `.sql` em disco. A hipótese de partida era que só 3 seriam CRLF e que as
> outras 34 seriam deriva de conteúdo. **A medição inverteu a hipótese**: 35 são CRLF,
> 2 são deriva de conteúdo — e as 2 já estão inventariadas.
>
> Nada foi escrito no banco durante esta investigação. Nenhum arquivo de
> `db/migrations/**` foi tocado.

---

## 1. Por que isto importa

O guard existe por causa do débito **D17** (#215, fechado em 11/08/2026). O Drizzle aplica
migração **por `tag` do journal** e nunca reexecuta um tag já registrado em
`drizzle.__drizzle_migrations`. Editar um `.sql` já aplicado não dá erro, não dá aviso e
não roda: base criada do zero (dev, CI) recebe o código novo, base que veio migrando
(produção) fica com o antigo, e o `git diff` mostra o código certo nas duas. Verde local
não é evidência.

Se 34 divergências virassem "ruído tolerado", o guard pararia de proteger exatamente
contra o defeito que ele existe para pegar. Daí a exigência de classificar **uma a uma**.

---

## 2. Método

Medição própria, independente do número relatado. Para cada linha de
`drizzle.__drizzle_migrations` (somente leitura, via `MIGRATION_DATABASE_URL`):

1. Resolve o `tag` pelo `created_at` — que **não é o horário de aplicação**: o Drizzle
   grava `created_at = journalEntry.when` (o `folderMillis`). A ordem real de aplicação é
   a coluna `id` (serial). Qualquer leitura de "data de aplicação" a partir de `created_at`
   é falsa.
2. Calcula três hashes do arquivo em disco: bytes como estão, normalizado para LF, e
   normalizado para CRLF.
3. Classifica: **(a)** o hash do banco bate com uma das duas normalizações → divergência
   só de fim de linha, conteúdo idêntico; **(b)** não bate com nenhuma → deriva de
   conteúdo; **(c)** hash sem arquivo correspondente em disco.

### 2.1 O algoritmo do guard confere com o do Drizzle

Verificado em `node_modules/drizzle-orm/migrator.js` (drizzle-orm **0.45.2**):

```js
hash: crypto.createHash("sha256").update(query).digest("hex")
```

onde `query = fs.readFileSync(<tag>.sql).toString()` — arquivo bruto, sem normalizar
quebra de linha e sem remover `--> statement-breakpoint`. É byte a byte o que
`calcularHashMigracao` faz. **A hipótese "o hash foi gravado por uma versão do
drizzle-orm com normalização diferente" está descartada**: uma mudança de normalização
produziria divergência sistemática *fora* do eixo EOL, e 35 das 37 caem exatamente
sobre o eixo EOL.

---

## 3. O resultado medido

| | |
| --- | --- |
| Linhas em `drizzle.__drizzle_migrations` | **98** |
| Entradas no `_journal.json` | **99** |
| Divergentes | **37** |
| (a) só fim de linha — conteúdo idêntico | **35** |
| (b) deriva de conteúdo | **2** (`0072`, `0073`) |
| (c) hash sem arquivo em disco | **0** |
| Sem entrada no journal | **0** |

### 3.1 Classe (a) — 35 tags, divergência só de fim de linha

Divergem nas **duas direções**, e a direção é informativa:

**Banco gravou CRLF, disco hoje está LF (3):**
`0000_fase1_tabelas`, `0001_rls`, `0002_rls_globais`

**Banco gravou LF, disco hoje está CRLF (32):**
`0057_cadastro_self_service`, `0058_professional_consent`, `0059_email_verificado_backfill`,
`0060_professional_consent_unique`, `0061_auth_throttle`, `0062_auth_throttle_janela_inicio`,
`0063_reaplica_purga_report_oracle`, `0064_trial_primeiro_paciente`, `0065_patient_arquivado_em`,
`0066_asaas_webhook_event`, `0067_desarquivar_paciente_por_atendimento`,
`0068_alerta_risco_email_rt_retry`, `0069_email_rt_pontas_soltas`,
`0071_billing_assinatura_e_ciclo`, `0074_habilitar_barreira_somente_leitura`,
`0075_billing_pos_pago`, `0076_care_team_horas_semana`, `0077_prescricao_pilar_mestre`,
`0079_clinic_grant_coluna_a_coluna`, `0080_auto_arquivamento_varredura`,
`0081_config_emergencia_definer`, `0082_conta_somente_leitura_guc_invalido`,
`0083_patient_cpf_antifraude`, `0084_cpf_hash_antifraude_definer`,
`0085_policies_tenant_helper`, `0086_asaas_webhook_aplicacao`, `0088_pix_copia_e_cola`,
`0089_valor_ativacao_pix`, `0090_documento_clinica_e_provedor`,
`0091_drop_webhook_mercado_pago`, `0095_dados_cadastrais_clinica`, `0096_billing_cycle_devido`

Para as 35, `sha256(disco normalizado para o EOL do banco) == hash gravado`. **O conteúdo
SQL é byte a byte o mesmo**; muda só o fim de linha.

### 3.2 Classe (b) — 2 tags, deriva de conteúdo

`0072_super_admin_role` e `0073_conta_somente_leitura` — as **duas já constam de
`DERIVAS_CONHECIDAS`** como edição in-place pós-aplicação. Detalhe na seção 5.

---

## 4. A causa das 35 — medida, não inferida

Não é edição de arquivo, não é Prettier, não é versão de drizzle. É a interação entre
duas configurações, e dá para medir com o mesmo motor que o Git usa:

```
$ git config --show-origin --get core.autocrlf
file:C:/Program Files/Git/etc/gitconfig    true
```

`core.autocrlf=true` vem do **gitconfig de sistema** — é o default do instalador do Git
for Windows, não uma escolha do repo. Combinado com `* text=auto` do `.gitattributes`:

```
$ git ls-files --eol db/migrations/ | awk '{print $1}' | sort | uniq -c
    131 i/lf        <- índice: 100% LF
      3 i/none
$ git ls-files --eol db/migrations/ | awk '{print $2}' | sort | uniq -c
    117 w/crlf      <- working tree: misto
     14 w/lf
```

**O índice é uniformemente LF. O working tree é misto** — e o que decide, por arquivo, é
se o Git chegou a rematerializar aquele arquivo em algum checkout:

- Arquivo escrito localmente (`drizzle-kit generate`, editor) nasce **LF** e assim
  permanece enquanto o Git não precisar reescrevê-lo — o Git pula arquivos cujo `stat`
  bate com o índice.
- Arquivo que passou por um checkout/troca de branch é reescrito pelo Git e sai **CRLF**.

Os `.sql` que estão LF no working tree hoje são exatamente os nunca rematerializados:

```
0000_fase1_tabelas   0001_rls   0002_rls_globais   0087_tenant_helper_em_funcoes_e_view
0092_desarquivar_paciente_cobertura   0093_user_role_id_helpers
0097_billing_cycle_debito_agrupado    0098_subscription_carencia_dez_dias
0099_billing_cycle_recusa_codigo
```

Todos os demais estão CRLF. Como o EOL de cada arquivo no working tree oscila com o
histórico de checkouts da máquina, e o `__drizzle_migrations` congela o EOL vigente **no
momento em que aquela migração rodou**, a tabela local acumulou registros de mais de um
contexto de EOL. Isso é visível na ordem de aplicação (coluna `id`): dentro do bloco
`0057`–`0096`, as tags `0070`, `0078` e `0094` batem com o disco CRLF enquanto as vizinhas
batem com LF — ou seja, houve execuções de `db:migrate` a partir de contextos de EOL
diferentes, intercaladas.

**O evento exato de reescrita de cada arquivo não é recuperável** (o Git não guarda isso)
e é **imaterial**: o conteúdo hasheado é idêntico ao do disco a menos de `\r`.

Hipóteses da investigação, com o veredito medido:

| Hipótese | Veredito |
| --- | --- |
| `.sql` editado in-place depois de aplicado (D17 de novo) | **Confirmada só para `0072`/`0073`** — já inventariadas. Nenhuma das 35 tem alteração de conteúdo. |
| Hash gravado por versão de drizzle-orm com normalização diferente | **Descartada** — algoritmo idêntico em 0.45.2; divergência cai toda sobre o eixo EOL. |
| Prettier reformatou `db/migrations/**` | **Descartada** — o conteúdo é byte a byte igual; reformatação mudaria mais que `\r`. |
| Normalização de EOL por `.gitattributes` / `core.autocrlf` | **CONFIRMADA** — é a causa das 35. Evidência acima. |
| Banco local restaurado de dump / criado fora do `migrate` | **Descartada como causa** — todas as 98 linhas correspondem a `.sql` do journal; nenhuma órfã, nenhuma sem arquivo. O que há é aplicação a partir de working copies com EOL diferente, não restauração. |

---

## 5. As 2 de conteúdo, individualmente

### 5.1 `0073_conta_somente_leitura` — explicada, e igual à produção

Arqueologia sobre todos os blobs do arquivo (`git rev-list --all --reflog`):

| commit | data | sha256 (LF) | |
| --- | --- | --- | --- |
| `a5a44946` | 04/08 | `5f52882de586…` | **== hash no banco local** |
| `b53b294c` | 04/08 | `1c261ad1e19f…` | edição in-place; nunca rodou |

O hash local é **idêntico ao `hashAplicado` já pinado em `DERIVAS_CONHECIDAS`** para
produção. Ou seja: local e produção rodaram a mesma versão (a original), a edição
`b53b294` nunca executou em lugar nenhum, e a remediação é a `0082`, que está aplicada
localmente (`id` 83). **Nada aberto aqui.**

### 5.2 `0072_super_admin_role` — o achado real

O hash gravado no banco local é `0a5352863cb1f9bc…`. Varredura **exaustiva** do banco de
objetos do repositório (`git cat-file --batch-all-objects`, 919 blobs candidatos na faixa
de tamanho, testando cada um em LF e em CRLF): **nenhum blob do repositório produz esse
hash.** Só existiram duas versões do arquivo:

| commit | data | sha256 (LF) | |
| --- | --- | --- | --- |
| `a00008e7` | 04/08 | `9b353c4445c4…` | versão original — é a que **produção** rodou (pinada) |
| `f6e08846` | 05/08 | `ab71715ce601…` | conteúdo em disco hoje |

Conclusão: **o conteúdo aplicado localmente nunca foi commitado** — rodou de um estado de
working tree intermediário. Isso torna o hash irrecuperável, mas **não** o efeito: o
efeito se mede no Postgres.

A única diferença entre as duas versões é a policy de RLS acrescentada por `f6e08846`
(os `GRANT` de coluna já estavam na original):

```sql
CREATE POLICY alerta_risco_auth_select ON alerta_risco_clinico
  FOR SELECT TO iris_auth USING (true);
```

Medido no banco local:

```
pg_class.relrowsecurity(alerta_risco_clinico)                     = true (e force = true)
pg_policies  → apenas  alerta_risco_scope  (roles = {app_role})
policy alerta_risco_auth_select                                   = AUSENTE
has_column_privilege('iris_auth','alerta_risco_clinico','severidade','SELECT') = true
has_column_privilege('iris_auth','patient','arquivado_em','SELECT')            = true
policy patient_auth_select                                        = PRESENTE
```

Ou seja: o banco local tem **todos os `GRANT`** da `0072` e a policy de `patient`, e **não
tem** a policy de `alerta_risco_clinico`. É funcionalmente a versão `a00008e7`.

**Consequência funcional, não cosmética.** `src/app/(admin)/benjamin/queries.ts` conta e
lista `alertaRiscoClinico` via `authDb` (role `iris_auth`). Com `GRANT` de coluna presente
mas policy ausente, a query **não dá erro de permissão**: a RLS filtra tudo e devolve
**zero linhas em silêncio**. O painel de Super Admin exibe `totalAlertas: 0` e lista vazia,
sempre — o modo de falha mais difícil de notar.

> Isto **não** foi verificável por contagem: a tabela `alerta_risco_clinico` está vazia
> (0 linhas) neste banco, então `select count(*)` como `iris_auth` devolve `0` tanto com
> policy quanto sem. A prova é `pg_policies` + `has_column_privilege`, não o `count`.

---

## 6. Veredito sobre o schema local

**Sim, o banco local tem o schema que o repositório descreve — com uma exceção medida.**

Como foi medido (não por leitura de diff): para as 37 tags divergentes, extração dos
objetos que cada `.sql` declara (`CREATE TABLE`, `ADD COLUMN`, `CREATE POLICY`,
`CREATE FUNCTION`, `CREATE INDEX`, `CREATE TYPE`) e conferência da existência real em
`information_schema.tables`/`.columns`, `pg_policies`, `pg_proc`, `pg_indexes` e `pg_type`.

**170 objetos conferidos, 1 ausente de verdade:**

| Reportado ausente | Veredito |
| --- | --- |
| `alerta_risco_clinico.alerta_risco_auth_select` (`0072`) | **AUSENTE DE VERDADE** — seção 5.2 |
| `mercadopago_webhook_event` + 1 policy + 2 índices (`0071`) | Esperado: removidos pela `0091_drop_webhook_mercado_pago`, que está aplicada |
| índice "falharia" (`0077`) | Falso positivo do extrator — a palavra aparece num comentário |
| `subscription.cpf_cnpj` (`0090`) | Falso positivo do extrator — o `ADD COLUMN cpf_cnpj` é em `clinic`, e `clinic.cpf_cnpj` **existe** |

Conferência de amostra em billing (o pedido explícito): `subscription` e `billing_cycle`
têm todas as colunas que `0071`/`0075`/`0088`/`0089`/`0090`/`0096`/`0097`/`0098`
declaram — incluindo `carencia_dias`, `past_due_desde`, `checkout_url`,
`pix_copia_e_cola`, `valor_ativacao_centavos`, `debito_agrupado_em` e `recusa_codigo` —
com as policies `*_select` e `*_auth_all` presentes e `billing_apurar_ciclo` como
`SECURITY DEFINER`.

### 6.1 Achado colateral: `0055` está no journal e nunca foi aplicada aqui

`0055_fix_purga_report_oracle` consta do `_journal.json` mas **não** tem linha em
`__drizzle_migrations` — o mesmo sintoma da #165 (`when` menor ou igual ao máximo já
aplicado faz o Drizzle pular o arquivo em silêncio, para sempre, naquela base). A
remediação `0063_reaplica_purga_report_oracle` **está** aplicada, e
`app_purgar_report`/`app_paciente_expurgavel` existem em `pg_proc` como `SECURITY DEFINER`.
Registrado aqui porque o guard de hash **não vê este caso** — ele só percorre linhas já
aplicadas. Quem cobre é `src/db/migrations.test.ts` (D2), do outro lado.

---

## 7. E produção?

### 7.1 O que dá para responder daqui

**A classe (a) — 35 tags — é estritamente artefato desta máquina.** O índice do Git é
100% LF (`i/lf`), e a imagem de deploy faz checkout num container Linux, onde
`core.autocrlf` não converte nada. O `.sql` que o `migrate` lê em produção é o mesmo LF do
índice, tanto na aplicação quanto na conferência posterior. Nenhuma das 35 pode aparecer
lá por esta causa.

Isso é coerente com o inventário de produção já registrado no guard (12/08/2026): 93
linhas, 85 batendo, 8 divergindo — e as 8 são as pinadas, entre elas `0003`/`0007`/`0009`
como CRLF (aplicadas no começo do projeto, quando o `migrate` ainda rodava de um checkout
Windows) e `0004`/`0005`/`0006`/`0072`/`0073` como edição in-place.

**A classe (b) — `0072` — produção corre o mesmo risco, e por evidência forte.** O
`hashAplicado` pinado para produção (`9b353c4445c4…`) é exatamente o sha256 LF do blob
`a00008e7`, a versão **anterior** ao fix `f6e08846`. E `alerta_risco_auth_select` é criada
**por um único lugar em todo o repositório** — a própria `0072` (confirmado por varredura
em `db/migrations/`, `src/` e `scripts/`). Nenhuma migração posterior a recria. Logo,
salvo intervenção manual no banco de produção, **a policy não existe lá**, e o painel de
Super Admin em produção reporta `totalAlertas: 0` em silêncio.

`0073` **não** é risco: local e produção rodaram a mesma versão original, e a `0082`
remediou.

### 7.2 O que fica NÃO MEDIDO

Não há acesso a produção nesta sessão. Fica em aberto, e só fecha rodando lá:

1. **A policy existe ou não em produção?** — a pergunta central.
2. **O inventário de produção mudou desde 12/08/2026?** (as `0094`–`0098` entraram depois)

Comandos exatos para fechar — via console Bash do serviço `iris-postgres` no Easypanel,
`psql -U iris -d iris`, **somente leitura**:

```sql
-- (1) a policy existe?  Esperado pelo diagnóstico: 0 linhas.
SELECT policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = 'alerta_risco_clinico';

-- (2) o GRANT de coluna existe (prova de que a 0072 rodou, só que a versão antiga)?
--     Esperado: t, t, t.
SELECT has_column_privilege('iris_auth','alerta_risco_clinico','id','SELECT'),
       has_column_privilege('iris_auth','alerta_risco_clinico','severidade','SELECT'),
       has_column_privilege('iris_auth','alerta_risco_clinico','criado_em','SELECT');

-- (3) contraprova de que a 0072 rodou na versão nova em algum lugar:
--     patient_auth_select DEVE existir (estava nas duas versões).
SELECT policyname FROM pg_policies
 WHERE schemaname='public' AND tablename='patient' AND policyname='patient_auth_select';

-- (4) inventário atualizado do guard (para reconciliar as pinagens):
SELECT id, created_at, hash FROM drizzle.__drizzle_migrations ORDER BY id;
```

O `count(*)` em `alerta_risco_clinico` **não serve de teste** — se a tabela estiver vazia
em produção, `0` é o resultado com e sem policy. A prova é a `(1)`.

---

## 8. Proposta de próximo passo

1. **Rodar as 4 queries da §7.2 em produção** (somente leitura) e anexar a saída aqui.
2. Se `(1)` voltar vazia e `(2)` voltar `t,t,t` — diagnóstico confirmado —, abrir issue e
   corrigir por **migração nova** (`01xx_alerta_risco_auth_select`), com o mesmo
   `DO $$ … IF NOT EXISTS … $$`, **nunca** editando a `0072`. Débito proposto: **D37**.
3. **Não** pinar as 35 de EOL em `DERIVAS_CONHECIDAS`. Pinar em bloco é apagar o guard, e
   estas 35 nem chegam à imagem de deploy. Se o falso-positivo local incomodar, o caminho
   é uma flag explícita de tolerância a EOL — que só se justifica se alguém for rodar
   `db:migrate:deploy` no Windows, o que hoje não acontece.

**A decisão que sobra para o Rômulo, em uma frase:** dado que o banco será zerado antes do
go-live, corrigir a policy `alerta_risco_auth_select` agora por migração nova, ou aceitar
que o painel de Super Admin reporte zero alertas até o reset e tratar como item de
pós-reset?

---

## 9. Nota de método

Três armadilhas conhecidas do repo se materializaram aqui e valem para a próxima medição:

- **`created_at` de `__drizzle_migrations` não é hora de aplicação** — é o `when` do
  journal. A ordem real é o `id`.
- **`has_table_privilege` mente quando o `GRANT` é por coluna.** `iris_auth` devolve
  `false` em `has_table_privilege(...,'alerta_risco_clinico','SELECT')` e `true` em
  `has_column_privilege(..., 'severidade', 'SELECT')`. (Já registrado como
  "Grant de coluna nega no nível de tabela".)
- **Contar linhas numa tabela vazia é um teste vácuo.** Prova de RLS é `pg_policies` e
  as funções de privilégio, não `count(*)`.
