# Revogação de consentimento, representação (curatela/emancipado) e indicador de maioridade

> Origem: issues **#133** (revogação — hoje não-registrável), **#134**
> (curatela/emancipado — fora do MVP na #100), **#135** (indicador de
> maioridade — "sistema não implementa detecção automática"). As três
> travam no mesmo ponto: `consent` (`src/db/schema.ts:312-353`) só sabe
> **conceder**, nunca **revogar** nem **representar**. Este spec segue o
> formato de `.specs/features/consentimento-titular-adulto/spec.md`:
> decisão travada, não lista de opções. Nenhuma migração é executada por
> este spec — só planejada (regra do projeto, `CLAUDE.md`).

---

## 1. Problema

Quatro travas, uma causa raiz comum.

- **#133 — Revogação não é registrável.** O termo `adulto-v1`, já
  ratificado, promete ao titular "posso... revogar os consentimentos das
  seções 8, 9 e 10" (`docs/legal/termo-consentimento-titular-adulto.md:307`).
  O próprio termo confessa, em nota de implementação ratificada junto:
  "**Não há hoje como registrar uma revogação.** A tabela `consent` é
  append-only por privilégio de banco e o enum `consent_tipo` não tem
  nenhum valor de evento de revogação — a promessa... não é apenas
  não-implementada, é não-registrável" (linhas 325-329). `REVOKE UPDATE,
  DELETE ON consent FROM app_role` (`db/migrations/0001_rls.sql:23`) —
  correto por design (append-only, LGPD) — é exatamente o que impede
  qualquer solução por `UPDATE`.
- **#134 — Curatela e emancipado não têm caminho.** `consentTipo`
  (`src/db/schema.ts:42-47`) tem 4 valores; nenhum cobre representação por
  curador nem autoconsentimento de emancipado. O próprio termo
  `adulto-v1` exclui os dois explicitamente do seu escopo
  (`docs/legal/termo-consentimento-titular-adulto.md:53-72`, "A quem este
  termo NÃO se aplica"), remetendo para "termo próprio... fora do MVP" —
  ratificado, mas nunca modelado.
- **#135 — Maioridade não tem indicador.** §4 do termo ratifica que "o
  sistema **não** implementa detecção automática de maioridade no MVP...
  apenas mantém na clínica a responsabilidade de identificar o
  aniversário e colher a renovação" (linhas 130-134) e define prazo
  administrativo de 90 dias (linha 117-120). Hoje não existe nem consulta
  passiva: nenhuma query lista pacientes que cruzaram os 18 anos com
  consentimento de responsável ainda vigente.
- **Gap central comum:** o único `INSERT` em `consent` no sistema é
  `criarPacienteEConsent`
  (`src/app/(app)/pacientes/novo/logic.ts:37-150`), executado **na mesma
  transação da criação do paciente**. Não existe nenhum caminho de
  código, server action, ou rota para inserir uma linha de `consent` em
  paciente **já existente**. Revogação, renovação por maioridade, e
  consentimento de curatela/emancipado são todos, estruturalmente, "grave
  uma linha de `consent` num paciente que já existe" — e essa capacidade
  simplesmente não existe no código hoje.

Fora do escopo deste spec (mas dependente dele): o parecer de
`aditivo-especificacoes-legais.md` §1.2 (linhas 22-30) especifica
Read-Only Locked para **menor**; ele é a base de D3/D4 abaixo, mas seu
rastreamento próprio é a issue **#117**, e o termo `adulto-v1` já
registra (linha 330-336) que esse comportamento **não transporta
automaticamente para o adulto** — é exatamente a distinção que D3
resolve aqui.

---

## 2. O que já está ratificado juridicamente (29/07/2026)

Fonte: `docs/legal/termo-consentimento-titular-adulto.md`, versão
`adulto-v1`, ratificado pelo protocolo descrito no topo do documento
(advogado lê ao vivo; sem apontamentos = alinhado).

- **§7, tabela de bases legais (linhas 182-189):** prontuário/evolução
  clínica, organização de agenda, e guarda pós-atendimento têm base legal
  própria — **tutela da saúde** (Art. 11, II, "f"), **execução de
  contrato** (Art. 7º, V), **obrigação legal** (Art. 16, I) — e a coluna
  "Depende do meu consentimento?" é **"Não"** para as três. Só IA (§8),
  transferência internacional (§9) e exportação (§10) têm coluna **"Sim"**.
- **§7, nota de produto (linhas 191-199):** "Empilhar bases legais...
  tornaria o consentimento não-livre e a revogação ilusória... cada
  finalidade consentida corresponde a um registro próprio de `Consent`
  (`uso_ia_processamento`, `exportacao_relatorios`), nunca a um bloco
  único de 'aceito tudo'." — é o fundamento direto de D1 (uma linha de
  revogação por consentimento vigente, não um campo de "escopo").
- **§13 (linhas 301-321):** "posso... revogar os consentimentos das
  seções 8, 9 e 10"; "A revogação vale **para o futuro**: ficam
  ratificados os tratamentos já realizados"; "Revogado o consentimento,
  **cessam as finalidades das seções 8, 9 e 10**... O **registro clínico
  do meu atendimento em curso continua**, porque não depende do meu
  consentimento".
- **§13, pendências de implementação ratificadas (linhas 323-336):** (a)
  revogação hoje não-registrável (a causa raiz deste spec); (b)
  Read-Only Locked é da issue **#117**, especificado para **menor**, e
  "não transporta automaticamente para o adulto".
- **§4 (linhas 105-134):** (a) sem janela de descoberto — consentimento
  do responsável sustenta o tratamento entre o aniversário de 18 anos e a
  nova assinatura; (b) prazo = primeira sessão após a maioridade, limite
  90 dias corridos, vencido = pendência administrativa que **não** trava
  atendimento; (c) curatela terá **termo próprio**, fora do MVP, rastreado
  na **#134**.
- **§2 (linhas 53-79):** o termo `adulto-v1` **não se aplica** a (1)
  menor de 18 anos, (2) adulto sob curatela — "o termo correspondente
  ainda não existe" (linha 62) —, (3) adolescente emancipado. "o tipo de
  consentimento é escolha explícita do operador, nunca derivada da data
  de nascimento" (linhas 74-79) — a mesma decisão D1 da issue #100,
  preservada aqui como D6/D7.
- **`docs/legal/aditivo-especificacoes-legais.md` §1.2 (linhas 22-30):**
  parecer do advogado (Thiago Lyra Galvão), escrito para o regime de
  **menor**: "Quando o consentimento for revogado via entidade
  `Consent`: 1. O estado da conta da criança... transiciona
  imediatamente para Read-Only Locked... 2. Bloqueia-se qualquer novo
  processamento de dados (novas entradas no diário, extrações por IA e
  chamadas de modelos LLM). 3. Os dados históricos permanecem acessíveis
  apenas em modo leitura restrito para fiscalização... até o término do
  prazo de retenção."

---

## 3. Decisões

### D1 — Revogação é uma linha nova que aponta para a linha revogada

**Decisão travada:** novo valor de enum `revogacao_consentimento`; nova
coluna `consent.consentRevogadoId uuid NULL REFERENCES consent(id) ON
DELETE RESTRICT`. Arm de CHECK: revogação exige o ponteiro preenchido;
todo outro tipo exige o ponteiro `NULL`.

**Justificativa:** §7 (linhas 191-199) trava que "cada finalidade
consentida corresponde a um registro próprio de `Consent`". Uma coluna de
"escopo da revogação" (ex.: enum `{ia, transferencia, exportacao, tudo}`)
reintroduziria exatamente o "bloco único de aceito tudo" que o termo
rejeita — e duplicaria, num campo novo, uma informação que já existe:
**qual linha** está sendo revogada. Apontar para a linha concedida é a
representação mínima e correta: o escopo da revogação é, por definição,
o escopo do que foi concedido naquela linha. Revogar tudo o que um
titular consentiu é uma linha de revogação por consentimento vigente —
não uma linha "revoga tudo".

Quem assina a revogação é **derivável** da linha apontada (menor →
responsável constava na linha original; adulto → o próprio titular). Por
isso o arm de revogação não exige nada de `responsavelSignatario`: ele
pode ficar `NULL` (titular revoga por si) ou preenchido (responsável
revoga em nome de menor/curatelado), sem que o CHECK precise decidir
qual — essa decisão já foi tomada na linha original.

`versaoTermo` na linha de revogação registra a versão do
**procedimento** de revogação (`revogacao-v1`), não de um termo de
consentimento — não existe "termo de revogação" assinado pelo titular no
sentido do `adulto-v1`; existe um procedimento administrativo (canal da
seção 5, "por procedimento gratuito e facilitado") que este código
executa.

Append-only preservado: `REVOKE UPDATE, DELETE` (`0001_rls.sql:23`)
continua sem alteração — a revogação **nunca edita** a linha concedida,
só adiciona uma linha nova que a referencia. É o mesmo padrão que já
rege renovação de consentimento (comentário em `schema.ts:308-311`:
"Renovação de consentimento é LINHA NOVA — não há UNIQUE em patient_id
nem coluna de vigência").

**Alternativa rejeitada — coluna `revogaTipo consentTipo` (revoga por
tipo, não por linha):** rejeitada. Não sobrevive a renovação: se um
titular tem duas linhas de `uso_ia_processamento` (concessão original +
renovação), "revogar por tipo" é ambíguo sobre qual das duas — e nada
impede reconceder e re-revogar, produzindo histórico ilegível. Apontar
para o `id` da linha elimina a ambiguidade por construção.

**Alternativa rejeitada — campo de escopo múltiplo (array de
finalidades revogadas numa única linha):** rejeitada pela mesma razão de
§7: contradiz "um registro próprio de `Consent`" por finalidade. Também
quebraria D1 da #100 (tipo como discriminador único do domínio) ao
introduzir uma segunda dimensão de granularidade dentro do mesmo tipo.

---

### D2 — Consentimento vigente é derivado, nunca armazenado

**Decisão travada:** não existe coluna `revogadoEm`, `status`, ou
`vigente`. Vigência é computada: para um `patientId` e `tipo`, a linha
de concessão mais recente (maior `assinadoEm`) é vigente **se e somente
se** não existe linha `revogacao_consentimento` com
`consentRevogadoId` apontando para ela.

**Justificativa:** uma coluna derivada numa tabela append-only exigiria
`UPDATE` no momento da revogação — exatamente o privilégio que
`0001_rls.sql:23` revoga de `app_role` por design de compliance
(trilha imutável). Computar em vez de armazenar elimina a tensão: nunca
existe um momento em que o dado em repouso e o dado derivado possam
divergir, porque só existe um.

**Alternativa rejeitada — permitir `UPDATE` restrito a uma única coluna
`revogadoEm` via `GRANT UPDATE (revogado_em) ON consent TO app_role`:**
rejeitada. Mesmo limitado a uma coluna, é `UPDATE` numa tabela cujo
desenho inteiro (comentário `schema.ts:308-311`, RLS §206) é "append-only
por design (LGPD)". Reintroduzir `UPDATE` — mesmo parcial — quebra a
garantia auditável "nenhuma linha de `consent` muda depois de escrita",
que é o que torna a trilha confiável para fiscalização (aditivo §1.2,
"transferência de prontuário" depende de histórico que não pode ter sido
adulterado).

---

### D3 — O efeito da revogação é por finalidade, e difere menor × adulto

**Decisão travada:** duas classes de efeito, nunca um bit binário
"conta bloqueada":

- Finalidades que **não dependem** de consentimento (§7: prontuário,
  sessão, diário, agenda, guarda pós-atendimento) — continuam para o
  **adulto** titular que revogou. Fundamento: §13 (linha 318-321),
  "O registro clínico do meu atendimento em curso continua, porque não
  depende do meu consentimento".
- Finalidades que **dependem** (IA/extração — `uso_ia_processamento`;
  transferência internacional — implícita em §9, mesma base de
  consentimento; exportação — `exportacao_relatorios`) — cessam para
  **todos**, adulto ou menor, no momento em que a linha correspondente é
  revogada.
- Para o **menor**, o parecer §1.2 do aditivo manda mais: revogado o
  `tratamento_dados_menor`, **o prontuário inteiro** entra em Read-Only
  Locked — "bloqueia-se qualquer novo processamento de dados (novas
  entradas no diário, extrações por IA e chamadas de modelos LLM)"
  (linha 29). Isso é estritamente mais amplo do que revogar só IA/
  exportação: para o menor, a base legal do prontuário em si (tutela da
  saúde) continua existindo, mas o parecer exige o bloqueio de escrita
  clínica nova mesmo assim, porque o consentimento do responsável era
  historicamente tratado como parte do sustentáculo do registro do
  menor.

Estado do prontuário ("somente leitura" ou não) é **derivado** —
consultado via a função `app_prontuario_somente_leitura` de D4, nunca
gravado em `patient`.

**Justificativa da assimetria menor/adulto:** é a distinção que o
próprio termo `adulto-v1` exige explicitamente — "não transporta
automaticamente [Read-Only Locked] para o adulto, cujo registro clínico
se apoia em tutela da saúde" (§13, linha 335). Tratar os dois regimes
igual seria implementar uma promessa jurídica que o documento ratificado
nega ter feito para o adulto.

**Alternativa rejeitada — bloqueio binário único (revogou = conta
travada, para qualquer titular):** rejeitada. Aplicaria ao adulto o
parecer §1.2 que foi escrito e ratificado só para o menor — contradiz
§13 linha 335 diretamente, e romperia a promessa central do §7 ("o
registro clínico continua" para o adulto).

**Alternativa rejeitada — nenhum bloqueio para ninguém (só marcar a
revogação, sem efeito de escrita):** rejeitada. O parecer §1.2 é
explícito sobre bloquear escrita nova para o menor; ignorá-lo deixaria a
spec incompleta em relação a um documento jurídico já ratificado, e sem
enforcement o "posso revogar" da seção 8/9/10 do termo adulto também
ficaria sem efeito prático algum sobre extração/exportação.

---

### D4 — Enforcement no banco, não só em TypeScript

**Decisão travada:** duas funções `SECURITY DEFINER STABLE, SET
search_path = public`, no mesmo padrão de
`app_patient_in_clinic`/`app_is_on_team` (`0001_rls.sql:27-40`):

- `app_prontuario_somente_leitura(p_patient uuid) RETURNS boolean` —
  `true` quando existe, para `p_patient`, uma linha
  `tipo = 'tratamento_dados_menor'` ou `tipo = 'representacao_curador'`
  (D6 — curatelado segue o regime de menor) vigente **e** uma linha
  `revogacao_consentimento` apontando para ela.
- `app_finalidade_consentida(p_patient uuid, p_finalidade text) RETURNS
  boolean` — para `p_finalidade IN ('uso_ia_processamento',
  'exportacao_relatorios')`: `true` se existe linha `tipo = p_finalidade`
  vigente (concedida e não revogada) para o paciente.

Policies de `WITH CHECK` em `session`, `sessionNote`, `extraction`,
`milestone`, `milestoneCandidacy`, `evidence`, `evidenceRevision`,
`evidenceQuery` ganham `AND NOT app_prontuario_somente_leitura(patient_id)`
(ou o caminho de FK equivalente onde a tabela não tem `patient_id`
direto — ver §6 para o mapeamento exato tabela → coluna de paciente).

**Leitura (`SELECT`) não muda.** Nenhuma policy de leitura ganha
condição nova. O parecer §1.2 (linha 30) é explícito: "Os dados
históricos permanecem acessíveis apenas em modo leitura restrito para
fiscalização dos conselhos ou transferência de prontuário" — bloquear
leitura contradiria o próprio requisito que justifica o Read-Only Locked.
Isto é a diferença entre "Locked" (sem escrita nova) e "inacessível"
(sem leitura) — o parecer pede o primeiro, nunca o segundo.

**Justificativa de ser enforcement de banco:**
`docs/legal/` (memória `ctx-forjavel-use-server`) — `ctx` vindo do
cliente é forjável; qualquer verificação só em TypeScript pode ser
contornada por um caminho de escrita que esqueça de chamá-la (novo form,
script admin, bug de refatoração). A fronteira de autorização real é o
banco, com policy que nenhum código de aplicação pode ignorar.

A camada TS (`src/lib/consent/`, ver §6) espelha o mesmo predicado só
para dar erro amigável **antes** do round-trip ao banco — não é a
fronteira, é UX.

**Alternativa rejeitada — checar só em TypeScript, em cada logic.ts que
grava dado clínico:** rejeitada pelo mesmo raciocínio que já vale para
`requireRole`/RLS no resto do projeto: um guard de aplicação que falta
num caminho novo é invisível até virar incidente. `session`,
`sessionNote`, `extraction`, `milestone`, `milestoneCandidacy`,
`evidence`, `evidenceRevision`, `evidenceQuery` já não têm gate de
consentimento algum hoje (ver §1, linha "SEM gate de consentimento") —
adicionar só em TS repetiria o mesmo padrão de lacuna que causou o gap
atual.

---

### D5 — Caminho de consentimento para paciente existente

**Decisão travada:** nova server action
`registrarEventoConsentimento(ctx, input)`, módulo próprio
`src/app/(app)/pacientes/[id]/consentimento/logic.ts` +
`actions.ts` (padrão logic.ts/actions.ts do projeto: core recebe `ctx`
como parâmetro, nunca o lê do request; wrapper `"use server"` deriva
`ctx` do servidor e chama o core — **nunca exportar o core de um módulo
`"use server"`**, mesma regra que fechou a #55, memória
`ctx-forjavel-use-server`).

Cobre três eventos, unificados numa action porque os três são, no fim,
"grave uma linha nova em `consent` para um paciente existente":

- **Revogação (#133):** `evento: "revogacao"`, `consentIdAlvo`.
- **Renovação por maioridade (#135):** `evento: "renovacao_maioridade"`,
  grava `tipo = 'autoconsentimento_titular_adulto'` sem responsável.
- **Consentimento de curatela/emancipado (#134):** `evento:
  "representacao"`, grava `representacao_curador` ou
  `autoconsentimento_titular_emancipado` (D6).

`requireRole(ctx, "admin_recepcao", "coordenador")` — mesmo par de
papéis de `consent_insert` (`0001_rls.sql:215-219`), porque toda escrita
em `consent` é ato administrativo, não clínico (comentário
`0001_rls.sql:206`).

**Alternativa rejeitada — três server actions separadas
(`revogarConsentimento`, `renovarConsentimentoMaioridade`,
`registrarRepresentacao`):** rejeitada por não ganhar nada em troca de
triplicar a validação de `requireRole` + `withTenant` + tratamento de
erro que os três compartilham. Ver §6 para a assinatura exata — o core
único faz `switch` sobre `evento` e delega para três funções privadas de
validação, o que já dá a mesma clareza sem triplicar o wrapper
`"use server"`.

---

### D6 — Curatela e emancipado (#134)

**Decisão travada:** dois valores de enum novos —
`representacao_curador`, `autoconsentimento_titular_emancipado` — e nova
coluna `consent.instrumentoRepresentacao text NULL`.

Arms do CHECK:

- `representacao_curador` → `responsavelSignatario` NOT NULL e não-vazio
  (mesmo padrão `btrim(...) <> ''` de `tratamento_dados_menor`, 0051) **E**
  `instrumentoRepresentacao` NOT NULL e não-vazio.
- `autoconsentimento_titular_emancipado` → `responsavelSignatario` IS
  NULL **E** `instrumentoRepresentacao` NOT NULL e não-vazio.

`instrumentoRepresentacao` registra a identificação do documento que
comprova a representação/capacidade — processo/termo de curatela para o
primeiro caso, certidão de emancipação para o segundo. Sem essa coluna,
a linha de `consent` afirmaria uma representação sem prova rastreável no
próprio registro append-only — o parecer §2 do termo (linha 63) já
observa que "idade maior que 18 não é prova de capacidade civil"; o
instrumento é o que preenche essa prova.

Mantém D1 da #100 (`schema.ts:38-41`, `docs/legal/termo-...:74-79`): o
tipo continua escolha explícita do operador, nunca derivado de idade —
os dois valores novos são só mais dois pontos no mesmo discriminador.

**Regime de Read-Only Locked (D3/D4):** curatelado segue o regime de
**menor** — está representado, não autoconsente, e a mesma lógica que
protege o menor (o representante decide, o titular não tem capacidade
plena de gerir seu próprio dado) se aplica. `representacao_curador`
entra no predicado de `app_prontuario_somente_leitura` junto de
`tratamento_dados_menor`. Emancipado segue o regime de **adulto** — é
juridicamente capaz (Art. 5º, parágrafo único, CC, citado em §2 linha
67); revogar seu consentimento tem o mesmo efeito de D3 para adulto:
cessam IA/exportação, prontuário continua.

**Alternativa rejeitada — tratar curatelado como "menor" reaproveitando
o valor de enum `tratamento_dados_menor`:** rejeitada. É exatamente o
que §2 do termo proíbe (linha 61-66, "o termo correspondente ainda não
existe... já está decidido que curatela terá termo próprio") —
registrar um adulto sob curatela como `tratamento_dados_menor` numa
trilha append-only afirmaria um fato falso e permanente sobre a pessoa
(que ela é menor de idade, quando não é). O valor de enum próprio é o
que torna o registro juridicamente honesto; o *regime de bloqueio*
(D4) pode ser compartilhado com o do menor sem que o *tipo* seja
compartilhado.

---

### D7 — Maioridade (#135) é indicador passivo

**Decisão travada:** nenhum gate, nenhum bloqueio, nenhuma mudança de
comportamento automática por causa de idade. Apenas:

- Query derivada (`listarPendenciasMaioridade`, ver §6) que lista
  pacientes com consentimento de **regime de menor vigente**
  (`tratamento_dados_menor` ou `representacao_curador` não revogado) **e**
  idade calculada `>= 18` via `ehMenorDeIdade` (`src/lib/risco/copy.ts:65-84`)
  invertida.
- Classificação visual (não bloqueio) usando os 90 dias de §4(b): dentro
  do prazo (≤ 90 dias corridos do aniversário) vs. vencido (pendência
  administrativa, sem qualquer efeito sobre atendimento — §4 linha
  119-120: "não é impedimento de atendimento").
- `patient.nascimento` nulo (`schema.ts:273`, nullable) é **terceiro
  estado explícito** na listagem: "desconhecido" — nunca renderizado
  como "ainda é menor" nem como "já é maior". `ehMenorDeIdade` já modela
  isso corretamente devolvendo `null` (não `false`) quando não há
  nascimento (`copy.ts:61-63`, "desconhecido NÃO é o mesmo que maior de
  idade"); a query de pendências reusa esse contrato e omite (ou marca
  "verificar nascimento") pacientes sem data, em vez de assumir qualquer
  lado.

**Gate de `cadastro-clinico` muda de shape** — de "existe linha de
`consent`" (`EXISTS` puro, `src/app/(app)/pacientes/[id]/cadastro-clinico/logic.ts:24-33`)
para "existe consentimento **vigente** (não revogado)" — usa
`app_finalidade_consentida`-equivalente para o tipo de admissão, não
mais um `EXISTS` sem predicado de tipo/revogação. Isto não é detecção de
maioridade (não decide nada por idade); é o gate de admissão passando a
respeitar D2 (vigência é derivada) em vez de ignorar revogação
completamente, o que já era uma lacuna independente de #135.

**Justificativa de manter passivo:** §4 ratifica isso duas vezes — (a)
sem janela de descoberto, o consentimento antigo continua sustentando o
tratamento até a renovação; e a "consequência de implementação, mantida"
(linha 130-134) trava explicitamente que o MVP **não** implementa
detecção automática. Construir qualquer gate ativo aqui romperia decisão
já ratificada com o advogado.

**Alternativa rejeitada — bloquear atendimento automaticamente ao
vencer os 90 dias:** rejeitada. Contradiz §4(b) verbatim ("não é
impedimento de atendimento, e não autoriza apagar nada").

---

## 4. DDL completo

### `0052_consent_enums_revogacao_e_representacao.sql`

`ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação em que
o valor é criado (mesma restrição documentada em 0050/0051 — o migrator
do projeto roda migrações pendentes numa única transação). Os 3 valores
novos vão sozinhos neste arquivo; uso em CHECK/código fica para o
arquivo seguinte (0053), replicando exatamente o par 0050/0051.

```sql
-- #133/#134 — Revogação de consentimento + representação (curatela/
-- emancipado). Três valores novos de enum, isolados numa migração própria
-- porque `ALTER TYPE ... ADD VALUE` não pode ser referenciado (INSERT,
-- comparação) na mesma transação em que é criado — mesma restrição
-- documentada em 0050/0051. Uso real (CHECK, coluna nova) fica em 0053.
--
-- `revogacao_consentimento` (#133): evento, não finalidade — a linha
-- aponta para a linha concedida via `consent_revogado_id` (0053).
-- `representacao_curador` / `autoconsentimento_titular_emancipado` (#134):
-- dois dos três casos que o termo `adulto-v1` exclui explicitamente
-- (seção 2) ganham modelagem própria; adulto sob curatela permanece
-- distinto de `tratamento_dados_menor` (fato juridicamente diferente),
-- ainda que compartilhe o regime de Read-Only Locked em revogação
-- (ver .specs/features/consentimento-revogacao-e-representacao/spec.md, D6).
ALTER TYPE "consent_tipo" ADD VALUE 'revogacao_consentimento';
--> statement-breakpoint
ALTER TYPE "consent_tipo" ADD VALUE 'representacao_curador';
--> statement-breakpoint
ALTER TYPE "consent_tipo" ADD VALUE 'autoconsentimento_titular_emancipado';
```

### `0053_consent_revogacao_e_representacao.sql`

```sql
-- #133/#134 — parte 2: colunas novas, CHECK reescrito (todos os arms,
-- antigos e novos), funções SECURITY DEFINER de enforcement, e policies
-- de escrita clínica com o predicado de Read-Only Locked.
--
-- `consent_revogado_id`: ponteiro da linha de revogação para a linha
-- concedida. `ON DELETE RESTRICT` — mesma política de integridade de
-- `patient_id` (schema.ts:318): uma linha de consent nunca pode ficar
-- órfã por causa de um DELETE em cascata alhures (aliás `consent` não
-- tem DELETE possível por app_role — 0001_rls.sql:23 — então isto só
-- importa para operação manual/expurgo, e RESTRICT é a postura segura).
--
-- `instrumento_representacao`: identificação do documento que comprova
-- curatela/emancipação (D6). Sem isto a linha afirmaria representação
-- sem prova rastreável.
ALTER TABLE "consent" ADD COLUMN "consent_revogado_id" uuid
  REFERENCES "consent"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "instrumento_representacao" text;
--> statement-breakpoint

-- CHECK reescrito por inteiro (não incremental) — Postgres não tem
-- ALTER CONSTRAINT para CHECK; precisa DROP + ADD.
ALTER TABLE "consent" DROP CONSTRAINT "consent_responsavel_por_tipo";
--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_responsavel_por_tipo" CHECK (
  -- arm 1 (0051, inalterado): menor — responsável obrigatório, sem instrumento.
  ("tipo"::text = 'tratamento_dados_menor'
    AND "responsavel_signatario" IS NOT NULL
    AND btrim("responsavel_signatario") <> ''
    AND "instrumento_representacao" IS NULL
    AND "consent_revogado_id" IS NULL)
  OR
  -- arm 2 (0050/0051, inalterado): titular adulto — sem responsável, sem instrumento.
  ("tipo"::text = 'autoconsentimento_titular_adulto'
    AND "responsavel_signatario" IS NULL
    AND "instrumento_representacao" IS NULL
    AND "consent_revogado_id" IS NULL)
  OR
  -- arm 3 (0051, inalterado): finalidades sem uso em código hoje — sem
  -- restrição própria, mas ganham a guarda dos dois campos novos.
  ("tipo"::text IN ('uso_ia_processamento', 'exportacao_relatorios')
    AND "instrumento_representacao" IS NULL
    AND "consent_revogado_id" IS NULL)
  OR
  -- arm 4 (novo, D1/#133): revogação — exige o ponteiro, dispensa
  -- responsável (derivável da linha apontada) e instrumento.
  ("tipo"::text = 'revogacao_consentimento'
    AND "consent_revogado_id" IS NOT NULL
    AND "instrumento_representacao" IS NULL)
  OR
  -- arm 5 (novo, D6/#134): curatela — responsável (o curador) E
  -- instrumento obrigatórios, sem ponteiro de revogação.
  ("tipo"::text = 'representacao_curador'
    AND "responsavel_signatario" IS NOT NULL
    AND btrim("responsavel_signatario") <> ''
    AND "instrumento_representacao" IS NOT NULL
    AND btrim("instrumento_representacao") <> ''
    AND "consent_revogado_id" IS NULL)
  OR
  -- arm 6 (novo, D6/#134): emancipado — autoconsente, mas precisa do
  -- instrumento (certidão de emancipação), sem ponteiro de revogação.
  ("tipo"::text = 'autoconsentimento_titular_emancipado'
    AND "responsavel_signatario" IS NULL
    AND "instrumento_representacao" IS NOT NULL
    AND btrim("instrumento_representacao") <> ''
    AND "consent_revogado_id" IS NULL)
);
--> statement-breakpoint

-- ─── Funções SECURITY DEFINER de enforcement (D4) ────────────────────────
-- Mesmo padrão de app_patient_in_clinic/app_is_on_team (0001_rls.sql:27-40):
-- SECURITY DEFINER STABLE, SET search_path fixo, evita recursão de policy.
CREATE OR REPLACE FUNCTION app_prontuario_somente_leitura(p_patient uuid)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public AS $$
  -- Regime de menor OU curatelado (D6): existe concessão vigente
  -- (não revogada) desses tipos, e existe uma revogação apontando
  -- justamente para ela.
  SELECT EXISTS (
    SELECT 1 FROM consent c
    WHERE c.patient_id = p_patient
      AND c.tipo::text IN ('tratamento_dados_menor', 'representacao_curador')
      AND EXISTS (
        SELECT 1 FROM consent r
        WHERE r.tipo::text = 'revogacao_consentimento'
          AND r.consent_revogado_id = c.id
      )
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_finalidade_consentida(p_patient uuid, p_finalidade text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public AS $$
  -- Vigente = existe concessão da finalidade E não existe revogação
  -- apontando para a linha de MAIOR assinado_em (renovação é linha nova,
  -- comentário schema.ts:308-311 — só a mais recente conta).
  SELECT EXISTS (
    SELECT 1 FROM consent c
    WHERE c.patient_id = p_patient
      AND c.tipo::text = p_finalidade
      AND c.assinado_em = (
        SELECT MAX(c2.assinado_em) FROM consent c2
        WHERE c2.patient_id = p_patient AND c2.tipo::text = p_finalidade
      )
      AND NOT EXISTS (
        SELECT 1 FROM consent r
        WHERE r.tipo::text = 'revogacao_consentimento'
          AND r.consent_revogado_id = c.id
      )
  );
$$;
--> statement-breakpoint

-- ─── Policies de escrita clínica: Read-Only Locked (D3/D4) ───────────────
-- Leitura (SELECT) INTOCADA em todas — aditivo §1.2 linha 30 exige acesso
-- de leitura preservado para fiscalização/transferência de prontuário.
-- Só WITH CHECK (INSERT/UPDATE) ganha a condição nova.
ALTER POLICY session_insert ON session
  WITH CHECK (
    app_patient_in_clinic(patient_id)
    AND NOT app_prontuario_somente_leitura(patient_id)
  );
--> statement-breakpoint
ALTER POLICY session_update ON session
  WITH CHECK (
    app_patient_in_clinic(patient_id)
    AND NOT app_prontuario_somente_leitura(patient_id)
  );
--> statement-breakpoint
-- (repetir o mesmo padrão — AND NOT app_prontuario_somente_leitura(...) no
-- WITH CHECK, USING de leitura intocado — para sessionNote, extraction,
-- milestone, milestoneCandidacy, evidence, evidenceRevision, evidenceQuery;
-- ⚠️ EM ABERTO: nome exato de cada policy de INSERT/UPDATE dessas 7 tabelas
-- não foi confirmado neste spec — ver §10, risco 1.)
```

⚠️ **EM ABERTO:** o bloco de `ALTER POLICY` acima está completo só para
`session`; as 7 tabelas restantes (`sessionNote`, `extraction`,
`milestone`, `milestoneCandidacy`, `evidence`, `evidenceRevision`,
`evidenceQuery`) precisam do mesmo tratamento, mas os nomes exatos das
policies de INSERT/UPDATE de cada uma não foram lidos neste spec — grep
de `CREATE POLICY.*ON (sessionNote|extraction|milestone...)` antes de
escrever a migração real. Ver §10.

---

## 5. Mudanças no `src/db/schema.ts`

- `consentTipo` (linhas 42-47): adicionar
  `"revogacao_consentimento"`, `"representacao_curador"`,
  `"autoconsentimento_titular_emancipado"` ao array do `pgEnum`.
- `consent` (linhas 312-353):
  - novo campo `consentRevogadoId: uuid("consent_revogado_id").references(() => consent.id, { onDelete: "restrict" })`
    — auto-referência; Drizzle exige `AnyPgColumn` ou callback para
    referência à própria tabela (verificar sintaxe exata no momento de
    implementar — auto-FK é um padrão menos comum no schema atual, sem
    precedente direto em `schema.ts` para copiar).
  - novo campo `instrumentoRepresentacao: text("instrumento_representacao")`.
  - `check("consent_responsavel_por_tipo", sql\`...\`)` (linhas 344-351):
    substituir pelo SQL completo de 6 arms de `0053` acima (espelho
    exato, mesmo `::text` — ver nota de custo já documentada em
    `schema.ts:334-337`, que continua valendo).
- Comentário da tabela (linhas 308-311): atualizar para mencionar que
  revogação também é linha nova, referenciando este spec.

---

## 6. Camada de aplicação

### Novo módulo `src/app/(app)/pacientes/[id]/consentimento/logic.ts`

```ts
export type EventoConsentimento =
  | { evento: "revogacao"; consentIdAlvo: string }
  | { evento: "renovacao_maioridade" }
  | {
      evento: "representacao";
      tipo: "curatela" | "emancipado";
      instrumentoRepresentacao: string;
      responsavelSignatario?: string; // obrigatório se tipo === "curatela"
    };

export type EventoConsentimentoState = { error?: string; id?: string };

/**
 * Núcleo testável: grava evento de consentimento (revogação, renovação
 * por maioridade, ou representação) para paciente JÁ EXISTENTE. Só
 * admin_recepcao/coordenador (mesmo par de consent_insert,
 * 0001_rls.sql:215-219) — coleta de consentimento é ato administrativo.
 * Recebe ctx como parâmetro; NÃO exportado por actions.ts.
 */
export async function registrarEventoConsentimento(
  ctx: TenantContext,
  patientId: string,
  input: EventoConsentimento,
): Promise<EventoConsentimentoState>;
```

### `src/app/(app)/pacientes/[id]/consentimento/actions.ts`

Wrapper `"use server"` que deriva `ctx` do servidor (padrão idêntico ao
resto do projeto) e delega ao core acima.

### `src/lib/consent/vigencia.ts` (novo — espelho TS de D4, não fronteira)

```ts
/** Espelha app_prontuario_somente_leitura — só para erro amigável. */
export async function prontuarioSomenteLeitura(
  ctx: TenantContext,
  patientId: string,
): Promise<boolean>;

/** Espelha app_finalidade_consentida. */
export async function finalidadeConsentida(
  ctx: TenantContext,
  patientId: string,
  finalidade: "uso_ia_processamento" | "exportacao_relatorios",
): Promise<boolean>;
```

### Arquivos tocados (chamadores que ganham o gate de D4 em TS)

- `src/app/(app)/diario/[sessionId]/logic.ts:45,87,128,169` —
  `capturarDiario`, `corrigirEscopoProtocolo`, `registrarAudioLocal`,
  `consolidarSessao`: cada um ganha `if (await
  prontuarioSomenteLeitura(ctx, patientId)) return { error: "..." }`
  antes de escrever.
- `src/app/(app)/relatorios/familia-logic.ts:80,138,179` —
  `gerarRascunhoFamilia`, `curarFamilia`: gate de
  `prontuarioSomenteLeitura` (é escrita clínica); `exportarFamilia`
  (linha 179): gate de `finalidadeConsentida(ctx, patientId,
  "exportacao_relatorios")`.
- `src/app/(app)/relatorios/convenio-narrativo-logic.ts:96,158,202` —
  mesmo padrão: `gerarRascunhoConvenioNarrativo`,
  `curarConvenioNarrativo` → `prontuarioSomenteLeitura`;
  `exportarConvenioNarrativo` (linha 202) →
  `finalidadeConsentida(..., "exportacao_relatorios")`.
- `src/lib/extraction/*` — zero referência a consent hoje; o ponto de
  entrada da extração (chamada ao provedor de IA) ganha
  `finalidadeConsentida(ctx, patientId, "uso_ia_processamento")` antes
  de qualquer chamada ao modelo. ⚠️ **EM ABERTO:** arquivo/função exatos
  do ponto de entrada não foram lidos neste spec (fora do escopo de
  pesquisa fornecido) — localizar antes de codar.
- `src/app/(app)/pacientes/[id]/cadastro-clinico/logic.ts:24-33` —
  `salvarFichaClinica`: `EXISTS` puro vira consulta de vigência (usa o
  mesmo predicado de `app_finalidade_consentida`, mas para o tipo de
  admissão relevante — `tratamento_dados_menor` /
  `autoconsentimento_titular_adulto` / `representacao_curador` /
  `autoconsentimento_titular_emancipado`, conforme D7).

### Nova query de indicador (`src/app/(app)/pacientes/pendencias-maioridade/logic.ts`, novo)

```ts
export type PendenciaMaioridade = {
  patientId: string;
  nome: string;
  idade: number;
  diasDesdeAniversario: number;
  classificacao: "dentro_do_prazo" | "vencido";
};

/** Lista pacientes com regime de menor vigente e idade >= 18. Passivo:
 *  não altera nenhum comportamento, só lista para a recepção agir (D7). */
export async function listarPendenciasMaioridade(
  ctx: TenantContext,
): Promise<PendenciaMaioridade[]>;
```

---

## 7. Matriz de comportamento após revogação

| Regime do titular | Prontuário / diário (escrita) | Extração IA | Exportação | Leitura |
| :--- | :--- | :--- | :--- | :--- |
| **Menor** (revogou `tratamento_dados_menor`) | **Bloqueado** (Read-Only Locked, §1.2) | Bloqueado (dependia de consentimento; e prontuário já travado) | Bloqueado | **Permitida** (§1.2 linha 30) |
| **Adulto** (revogou `autoconsentimento_titular_adulto`) | Continua (§13 linha 318-321 — não depende de consentimento) | Bloqueado só se revogou `uso_ia_processamento` especificamente | Bloqueado só se revogou `exportacao_relatorios` especificamente | Permitida (nunca foi restrita) |
| **Curatelado** (revogou `representacao_curador`) | **Bloqueado** (mesmo regime do menor — D6, representado) | Bloqueado | Bloqueado | Permitida |
| **Emancipado** (revogou `autoconsentimento_titular_emancipado`) | Continua (mesmo regime do adulto — D6, capaz) | Bloqueado só se revogou `uso_ia_processamento` | Bloqueado só se revogou `exportacao_relatorios` | Permitida |

Nota: para adulto/emancipado, "revogar `uso_ia_processamento`" e
"revogar `exportacao_relatorios`" são eventos **independentes** — cada
um é uma linha de revogação apontando para sua própria linha de
concessão (D1). Um titular adulto pode revogar só IA e manter
exportação vigente, ou vice-versa. Para menor/curatelado, o bloqueio de
prontuário inteiro dispara já na revogação do consentimento de
**regime** (`tratamento_dados_menor`/`representacao_curador`), não das
finalidades de IA/exportação — essas seguem o mesmo comportamento
independente do adulto, mas ficam irrelevantes na prática porque o
diário/extração já param por causa do Read-Only Locked.

---

## 8. Plano de testes

1. **Revogação registrável** — `db/tests/*consent*` (ou equivalente
   `pnpm test:rls`): `INSERT` de `revogacao_consentimento` com
   `consent_revogado_id` apontando para uma linha `autoconsentimento_titular_adulto`
   existente sucede. Prova D1/#133.
2. **UPDATE/DELETE ainda negados** — teste RLS: tentar `UPDATE`/`DELETE`
   em qualquer linha de `consent` (concessão ou revogação) como
   `app_role` falha com erro de privilégio. Prova que 0053 não
   reintroduziu escrita em linha existente (D2).
3. **CHECK rejeita revogação sem ponteiro** — `INSERT tipo =
   'revogacao_consentimento'` com `consent_revogado_id IS NULL` viola a
   constraint `consent_responsavel_por_tipo`. Prova arm 4 de D1.
4. **CHECK rejeita concessão COM ponteiro** — `INSERT tipo =
   'tratamento_dados_menor'` (ou qualquer tipo de concessão) com
   `consent_revogado_id` preenchido viola a constraint. Prova a guarda
   simétrica dos arms 1-3/5-6.
5. **CHECK rejeita curatela sem instrumento / com responsável vazio** —
   `INSERT tipo = 'representacao_curador'` faltando
   `instrumento_representacao`, ou com `responsavel_signatario = '   '`
   (só espaço), viola a constraint. Prova arm 5 de D6, mesmo padrão
   `btrim` de 0051.
6. **CHECK rejeita emancipado com responsável preenchido** — `INSERT
   tipo = 'autoconsentimento_titular_emancipado'` com
   `responsavel_signatario` não-nulo viola a constraint. Prova arm 6.
7. **Escrita clínica bloqueada em prontuário de menor revogado** —
   fixture: paciente menor com `tratamento_dados_menor` vigente,
   revogado; tentar `INSERT` em `session` (ou `sessionNote`) como
   `app_role` autorizado (mesma clínica, papel certo) falha por RLS.
   Prova D3/D4 para o regime de menor. Arquivo alvo:
   `db/tests/rls.test.ts` (ou equivalente já usado por
   `pnpm test:rls`).
8. **Leitura ainda permitida no mesmo caso** — mesma fixture do teste 7:
   `SELECT` em `session`/`sessionNote` do mesmo paciente sucede
   normalmente. Prova que D4 não tocou policies de `SELECT` — este é o
   teste mais importante do plano, porque é o ponto onde uma
   implementação apressada mais provavelmente erraria (aplicar o
   `AND NOT app_prontuario_somente_leitura` também no `USING` de
   leitura por engano).
9. **Adulto revogado ainda pode ter sessão/diário mas NÃO
   extração/exportação** — fixture: paciente adulto com
   `autoconsentimento_titular_adulto` vigente (nunca revogado),
   `uso_ia_processamento` revogado. `INSERT` em `session` sucede;
   chamada ao ponto de entrada da extração (ou
   `finalidadeConsentida(ctx, patientId, "uso_ia_processamento")`)
   retorna `false`. Prova D3 para adulto — a distinção-chave do spec.
10. **Nascimento nulo não classifica como menor** — teste unitário de
    `listarPendenciasMaioridade` (ou de `ehMenorDeIdade` diretamente,
    já coberto por teste existente se houver): paciente com
    `nascimento = null` e `tratamento_dados_menor` vigente não aparece
    como "vencido" nem "dentro do prazo" — aparece na categoria
    "desconhecido" ou é omitido, nunca tratado como se já fosse maior
    OU ainda menor. Prova D7.
11. **Cross-tenant continua bloqueado** — fixture: dois pacientes em
    clínicas diferentes; tentar `INSERT` de revogação com
    `consent_revogado_id` apontando para linha de `consent` de
    paciente de **outra** clínica. `app_patient_in_clinic(patient_id)`
    na policy `consent_insert` já barra pelo `patient_id` da própria
    linha de revogação (que tem que ser da clínica do operador); o
    teste confirma que o FK `consent_revogado_id` **não** cria um
    caminho de leitura/gravação cruzando clínica — a policy de INSERT
    não valida a clínica da linha *apontada*, só a da linha sendo
    inserida, e isso é suficiente porque ambas as linhas pertencem ao
    mesmo `patientId` por construção de app (a UI só oferece revogar
    consentimentos do próprio paciente sendo editado). ⚠️ **EM
    ABERTO:** este teste deve confirmar que a policy de INSERT também
    valida, via subquery, que a linha apontada por
    `consent_revogado_id` pertence ao MESMO `patient_id` da linha
    sendo inserida — o CHECK/policy atual de 0053 não impõe isso
    explicitamente (só exige que o ponteiro exista em `consent`,
    não que seja do mesmo paciente). Ver risco 2 em §10.
12. **Curatelado segue regime de menor, emancipado segue regime de
    adulto** — duas fixtures espelhando os testes 7-9, mas com
    `representacao_curador` e `autoconsentimento_titular_emancipado`
    no lugar dos tipos de menor/adulto. Prova D6.

---

## 9. Impacto em documentação

- **`docs/legal/termo-consentimento-titular-adulto.md` §13, pendência
  (a) (linhas 323-329):** emenda removendo "Não há hoje como registrar
  uma revogação" — passa a existir o caminho (D1/D5). Marcar a mudança
  como implementação, não reabertura jurídica (o texto já ratificado do
  §13 continua valendo; só a nota de pendência de implementação muda).
- **`docs/legal/termo-consentimento-titular-adulto.md` §2 (linhas
  61-66) e §4(c) (linhas 122-128):** ambas dizem "fora do MVP" para
  curatela — precisam de emenda que reverta esse "fora do MVP" na
  medida em que D6 implementa a modelagem. **Não implica que o termo de
  curatela em si já existe** — D6 só cria o valor de enum e a coluna;
  o **termo próprio** que §4(c) promete ("Curatela terá termo próprio")
  continua como documento a escrever, fora do escopo deste spec.
- **`docs/legal/termo-consentimento-titular-adulto.md` §4, "Consequência
  de implementação" (linhas 130-134):** emenda revertendo "o sistema
  não implementa detecção automática de maioridade" para refletir que
  agora existe indicador **passivo** (D7) — sem virar detecção ativa;
  o texto ratificado ("não é impedimento de atendimento") continua
  valendo integralmente.
- **Novo documento `docs/legal/procedimento-revogacao-consentimento.md`**
  (nome sugerido, versão `revogacao-v1`): especifica o procedimento
  administrativo referenciado pela seção 5 do termo adulto ("canal para
  exercício de direitos") — como o titular solicita revogação, quem no
  operador executa, e o que a linha `revogacao_consentimento` grava.
  Precisa de validação com o advogado antes de virar `versaoTermo` de
  produção (mesmo protocolo de ratificação usado em `adulto-v1`).
- **Novo termo de curatela** — `docs/legal/termo-consentimento-curatela.md`
  (nome sugerido): o documento que §4(c) promete. Fora do escopo deste
  spec (que só modela o dado); precisa ser escrito e ratificado com o
  advogado antes que `representacao_curador` seja usado com titular
  real.
- **`docs/dados/modelo-de-dados.md:54-57`:** ainda lista `Consent` com
  "tipo (`tratamento_dados_menor` | `uso_ia_processamento` |
  `exportacao_relatorios`)" — 3 valores, já desatualizado mesmo antes
  deste spec (falta `autoconsentimento_titular_adulto` da #100).
  Precisa de atualização para os 7 valores finais.
- **`CLAUDE.md` (raiz do projeto):** referencia "`AGENTS.md` §6" e
  "`AGENTS.md` §10" como checklist LGPD e regra de atualização de
  `BACKLOG.md`. Não verificado neste spec se essas seções existem no
  `AGENTS.md` atual — ⚠️ **EM ABERTO**, fora do escopo de pesquisa
  fornecido para esta tarefa; sinalizado porque a introdução deste
  spec cita esse contrato.

---

## 10. Riscos e o que pode dar errado

1. **Lista incompleta de policies em 0053.** O DDL de `ALTER POLICY`
   (§4) está escrito por completo só para `session`; as outras 7
   tabelas (`sessionNote`, `extraction`, `milestone`,
   `milestoneCandidacy`, `evidence`, `evidenceRevision`,
   `evidenceQuery`) precisam do mesmo tratamento, mas seus nomes de
   policy de INSERT/UPDATE não foram lidos neste spec. Se a migração
   real for escrita copiando só o padrão sem confirmar os 7 nomes
   restantes contra `db/migrations/*.sql`, alguma tabela pode ficar sem
   o gate — silenciosamente reabrindo a lacuna que D4 existe para
   fechar. Mitigação: grep obrigatório antes de escrever `0053` de
   verdade.
2. **`consent_revogado_id` não valida mesmo paciente.** O CHECK de 0053
   garante que o ponteiro aponta para *alguma* linha de `consent`, mas
   não que essa linha pertence ao mesmo `patient_id` da linha de
   revogação. Hoje isso é garantido só pela UI (a tela só lista
   consentimentos do paciente que está sendo editado) — não pelo banco.
   Um bug de UI ou um caminho futuro poderia gravar revogação
   cross-patient dentro da mesma clínica sem que RLS ou CHECK
   impeçam. Mitigação recomendada, fora do escopo travado deste spec:
   avaliar CHECK adicional ou trigger que valide
   `(SELECT patient_id FROM consent WHERE id = consent_revogado_id) =
   patient_id` na própria linha.
3. **`app_prontuario_somente_leitura` incluindo `representacao_curador`
   depende de D6 ser implementado junto.** Se `0052`/`0053` forem
   aplicados em etapas separadas (ex.: só revogação primeiro, curatela
   depois), a função de D4 referencia um valor de enum
   (`representacao_curador`) que pode não existir ainda — quebra em
   tempo de execução, não em tempo de migração (comparação com string
   via `::text` não falha por enum ausente, mas o predicado nunca vai
   casar até o valor existir, o que é inofensivo — só um risco de
   *sequenciamento*, não de erro).
4. **Read-Only Locked para menor bloqueia diário mas o comentário do
   parecer (§1.2, linha 29) também cita "chamadas de modelos LLM"** —
   D4 cobre isso via `uso_ia_processamento` já cessar (finalidade
   dependente de consentimento) mais o bloqueio de escrita em
   `extraction`; mas se o ponto de entrada real da extração (não
   localizado neste spec, ver §6) não estiver na lista de tabelas com
   `WITH CHECK` atualizado, uma chamada de extração poderia gravar
   direto sem passar pela policy de `extraction` — depende de onde
   exatamente a chamada ao provedor de IA persiste seu resultado.
5. **`versaoTermo = 'revogacao-v1'` na linha de revogação é uma decisão
   de nomenclatura, não uma versão de termo assinado** — se um relatório
   ou export futuro tratar `versaoTermo` como "sempre é a versão de um
   termo LGPD assinado pelo titular", vai exibir "revogacao-v1" como se
   fosse um termo, o que é semanticamente diferente (é versão de
   procedimento administrativo). Qualquer UI que renderize `versaoTermo`
   precisa diferenciar por `tipo` antes de rotular a string.
6. **Read-Only Locked calculado via subquery correlacionada em duas
   funções `SECURITY DEFINER`** — chamadas em `WITH CHECK` de 8 tabelas
   diferentes, em toda escrita clínica. Sem índice em
   `consent(patient_id, tipo)` e `consent(consent_revogado_id)`, o custo
   por escrita cresce com o número de linhas de `consent` do paciente.
   Volume atual (dezenas a centenas de linhas por paciente, mesma ordem
   de grandeza citada em 0051) não deve doer, mas não foi medido neste
   spec.
