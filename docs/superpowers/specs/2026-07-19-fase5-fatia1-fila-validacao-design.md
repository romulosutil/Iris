# Fase 5 — Fatia 1: Fila de Validação do Coordenador (V1-V5)

> Status: **rascunho para aprovação** (endurecido por passada adversarial pre-mortem, 19/07/2026 —
> 5 modos de falha; #1 recompute mid-history verificado seguro, #2 par devolver+responder trazido ao
> escopo, #3/#4/#5 mitigados ou registrados). Camada 3 do modelo de governança (IA sugere →
> terapeuta aprova → **coordenador valida por exceção e reclassifica**). Regras-fonte:
> `docs/governanca/validacao-coordenador.md` (V1-V5), wireframe §4.5 de
> `docs/ux/fluxos-e-wireframes.md`. Consome a camada de dados da Fase 4 (`evidence`,
> `evidence_revision`, `evidence_query`, view `evidence_current`, `materializarSnapshot`)
> e o `audit_log` da F0. Segue os padrões reais do repo (`revisao/[sessionId]/actions.ts`).

---

## 1. Escopo (decidido com o Rômulo, 19/07/2026)

**Dentro:**
- Sinais de entrada **V1a** (baixa confiança aprovada) + **V1b** (inconsistente com histórico) — os dois com dado pronto hoje.
- As 4 ações **V2**: Confirmar · Reclassificar · Devolver com dúvida · Invalidar.
- **O par completo de "devolver"** — abrir a query (coordenador) **e responder** (terapeuta),
  porque `evidence_query` está hoje 100% dormente (nenhum código abre nem fecha). Construir só a
  abertura deixaria a evidência em **limbo permanente** (excluída do cômputo, sem quem feche).
  Decisão do Rômulo (19/07): construir o par (Approach A do pre-mortem #2).
- **V3** (versionado, nunca sobrescrito) — já garantido pela camada de dados append-only + recompute.
- Wiring do **`audit_log`** (reclassificação/invalidação/devolução).
- Recompute retroativo reusando `materializarSnapshot` (verificado seguro para meio-de-história — ver §4.4).
- UI (rota dedicada `validacao/`) + superfície **passiva** de V4 + superfície do terapeuta p/ responder queries.

**Fora (adiado → BACKLOG):**
- Sinais **V1c** (amostra aleatória), **V1d** (calibração de terapeuta novo), **V1e** (dossiê
  pré-avaliação), **V1f** (encaminhada com dúvida pelo terapeuta) — exigem campos/config/infra novos.
- **V4 ativa** (sino/push/tom de formação calibrado) — não há subsistema de notificação hoje.
- **Checklist contextual por protocolo** na UI de reclassificar (conteúdo só no .md, precisa curadoria).
- **V5** (métricas de divergência / dataset de fine-tuning) — explicitamente adiável na regra.

---

## 2. Sem schema novo — a fatia é aplicação

Toda a camada de dados existe (Fase 4 + F0). **Nenhuma migração.** A fila é derivada por leitura,
como o padrão de `excecoes/queries.ts`. Confirmar no build (não bloqueia o design): `evidence`
tem `extraction_id`; `extraction` tem `confianca` (`alta|media|baixa`) e `inconsistente_com_historico`.

Posicionamento (Approach A aprovado): **rota dedicada** `src/app/(app)/validacao/`, coordenador-only,
reusando os *padrões* de `revisao/[sessionId]/actions.ts` (não o lugar). `excecoes/` ganha só um link.

---

## 3. Query da fila — `validacao/queries.ts`

`listarFilaValidacao(ctx)` → lista de itens **por evidência** (grão de alvo, card "item N de M"):

Predicado (derivado por leitura, sem coluna de estado nova):
- `evidence.extraction_id` → `extraction` **E** (`extraction.confianca = 'baixa'` **OU**
  `extraction.inconsistente_com_historico = true`)  — sinais V1a/V1b;
- **E** `NOT EXISTS` linha em `evidence_revision` para essa `evidence` (ainda não tratada);
- **E** `NOT EXISTS` `evidence_query` com `respondido_em IS NULL` (não devolvida/aguardando);
- **E** a evidência não está invalidada (via `evidence_current`).

Escopo: RLS + `requireRole('coordenador')` — grafo M:N da clínica do coordenador. Evidência só
existe para extração já aprovada/editada pelo terapeuta → a camada 3 fica naturalmente após a 2.

Cada item retorna: `evidenceId`, trecho literal do diário (fonte da sessão), classificação atual
(via `evidence_current`), `sessionNumero`, paciente, `protocolId` (para escopar o picker de
reclassificar), e **motivo de entrada** (`baixa_confianca` | `inconsistente_historico`, ou ambos)
para transparência na UI. Ordenação estável (ex.: `sessionNumero`, `alvoOrdinal`).

---

## 4. Server actions — `validacao/actions.ts`

Espelha `revisao/[sessionId]/actions.ts`: cada ação = função core testável `(ctx, args)` +
wrapper `useActionState` via `comCtx`. Toda ação roda em **uma transação** (`withTenant`),
sob `pg_advisory_xact_lock(hashtext(patientId))`, com `requireRole('coordenador')` e
`revalidatePath('/validacao')`.

### 4.1 Guarda de concorrência (equivalente ao OCC de `revisao`)

`evidence` não tem `versao`. Dois coordenadores no mesmo item: sob o advisory lock (serializa por
paciente), a action **re-verifica dentro da tx** que a evidência ainda está na fila (sem
`evidence_revision`, sem `evidence_query` aberta) **antes** de inserir. Se já foi tratada →
lança `CONCURRENCY_ERROR` (mesmo padrão de erro amigável de `revisao`). Evita dupla-validação.

### 4.2 As 4 ações

| Ação | Grava | Recompute | audit_log |
|------|-------|-----------|-----------|
| **`confirmarEvidencia(ctx,{evidenceId})`** | `evidence_revision(acao=confirmar, classificacaoAnterior=atual, classificacaoNova=NULL, justificativa="Confirmado.")` | Não (classificação inalterada) | Não (a revisão é o registro) |
| **`reclassificarEvidencia(ctx,{evidenceId, novaClassificacao, justificativa})`** | `evidence_revision(acao=reclassificar, classificacaoAnterior=atual, classificacaoNova=**estruturada**, justificativa)` | **Sim** | `acao='reclassificacao'`, `entidade='evidence'`, `detalhe={de,para,justificativa}` |
| **`devolverComDuvida(ctx,{evidenceId, pergunta})`** | `evidence_query(coordenadorId=app.user_id, pergunta)` | **Sim** (query aberta exclui do cômputo) | `acao='devolucao'`, `detalhe={pergunta}` |
| **`invalidarEvidencia(ctx,{evidenceId, motivo})`** | `evidence_revision(acao=invalidar, classificacaoAnterior=atual, classificacaoNova=NULL, justificativa=motivo)` | **Sim** (`evidence_current` marca invalidada) | `acao='invalidacao'`, `detalhe={motivo}` |

Regras:
- **`classificacaoAnterior`** = classificação corrente lida da view `evidence_current` no momento da
  ação (não a `classificacaoOriginal` crua, para encadear reclassificações corretamente).
- **`reclassificar` exige `novaClassificacao` ESTRUTURADA** — um alvo válido dos protocolos ativos do
  paciente (mesma forma jsonb de `classificacaoOriginal`). Sem isso o recompute via `evidence_current`
  → `materializarSnapshot` não consegue usar. **Rejeitar** `novaClassificacao` que não resolva para
  um alvo válido do paciente.
- **`justificativa`/`motivo` vazio em reclassificar/invalidar → rejeita** (`VALIDACAO_JUSTIFICATIVA_OBRIGATORIA`).
  Regra de ouro V2: ambiguidade **devolve**, não adivinha.
- **Recompute** = `materializarSnapshot(drizzleMaterializarQueries(tx), patientId, sessionNumeroDaEvidencia)`
  na mesma tx, após inserir a revisão/query. Reusa 100% da lógica existente (on-approve já faz isso).
- **audit_log** com `ator_id = app.user_id` (a policy `audit_insert` exige; a action passa o ator).
- **RLS já cobre o insert:** `evidence_revision_insert` (0014) permite coordenador; `evidence_query_insert`
  exige `app.user_role='coordenador'` + `coordenador_id=app.user_id`. A action só reforça o gate.

### 4.3 Responder à query — lado do terapeuta (fecha o loop de "devolver")

`evidence_query` está hoje **dormente** (nenhum código abre nem fecha — confirmado). Construir só a
abertura deixaria a evidência excluída do cômputo **para sempre**. Então a Fatia 1 entrega também:

`responderQuery(ctx, {evidenceQueryId, respostaTexto, novaClassificacao?})` — ação do **terapeuta
da equipe** (a policy `evidence_query_update` só permite enquanto `respondido_em IS NULL`; a policy
`evidence_revision_insert` já abre a exceção do terapeuta inserir a revisão resultante **quando há
query aberta** apontando pra evidência). Em 1 tx sob advisory lock:
1. `UPDATE evidence_query SET resposta_texto=…, respondido_em=now()` (e `resultante_evidence_revision_id` se houver).
2. Se o terapeuta corrige a classificação ao responder → `INSERT evidence_revision(acao=reclassificar, …, justificativa=resposta)` e liga em `resultante_evidence_revision_id`.
3. **Recompute:** `materializarSnapshot(tx, patientId, sessionNumeroDaEvidencia)` — a query deixa de estar aberta → a evidência **volta** ao cômputo (ou entra com a nova classificação). Sem este passo a evidência ficaria excluída para sempre (pre-mortem #2).
- Superfície mínima do terapeuta: lista "dúvidas do coordenador" (queries abertas das suas evidências) com o campo de resposta. Reusa design system.

### 4.4 Recompute de meio-de-história é seguro (verificado)

`materializarSnapshot(queries, patientId, desdeNumero)` **lê a história inteira**, faz o fold do zero,
e só **escreve** snapshots `>= desdeNumero` — recompute a partir de uma sessão antiga é correto por
construção, sem depender de `snapshot(desdeNumero-1)` no banco. Provado por teste existente
(`db/tests/fase4-materializar.int.test.ts:287` — "reclassificar sessão 2, recomputar DESDE 2, sessão 1
intacta, sessão 3 reflete"). Portanto reclassificar/invalidar/responder passam o `session_numero` da
evidência afetada (mesmo do meio) com segurança. Nenhuma correção em `materializar` é pré-requisito.

### 4.5 V3 — garantido de graça

`materializarSnapshot` só escreve `session_snapshot` e `goal_candidacy`; nunca toca avaliação de marco
fechada. Reclassificação retroativa recompõe timeline/snapshots **sem** alterar assessment já realizada
(a regra V3). Nada a construir aqui — é propriedade do recompute existente.

---

## 5. UI — `validacao/page.tsx` + client

- `page.tsx`: server component, **coordenador-only** (`ctx.role !== 'coordenador' → notFound()`),
  chama `listarFilaValidacao(ctx)`, passa ao client. `excecoes/` recebe um link de entrada para a fila.
- **Client (card "item N de M"), reusando o design system (nunca hardcodar componente):**
  - Cabeçalho: paciente · sessão · motivo de entrada (chip "baixa confiança" / "inconsistente c/ histórico").
  - Corpo: **trecho literal do diário** + "Classificado como: `<classificação atual>`".
  - Barra de ações: `[Confirmar] [Reclassificar ▾] [Devolver com dúvida] [Invalidar]`.
    - **Reclassificar** → form: **picker de alvo escopado aos protocolos ATIVOS do paciente**
      (query auxiliar `patient_protocol → protocol → goals/milestones`) — permite corrigir confusão
      **cross-protocolo** (pre-mortem #5), não só dentro do protocolo original. **Valida
      `tipo_estrutura` compatível** antes de gravar (a segmentação despacha por tipo; um alvo
      incompatível quebraria o recompute). + **justificativa obrigatória**. Como a fila é **tiro-único**
      no MVP (uma vez tratada, a evidência sai), a ação **pede confirmação** (é irreversível pela fila).
    - **Devolver** → campo `pergunta`. **Invalidar** → campo `motivo`.
  - **Sem ação em lote** — abrir o card é o lastro contra carimbo automático (regra de `revisao`, L290).
- **Superfície do terapeuta (§4.3):** lista "dúvidas do coordenador" com queries abertas das suas
  evidências + campo de resposta. Fecha o loop de "devolver". Reusa design system.
- **Checklist contextual por protocolo: ADIADO** (dívida UX no BACKLOG). MVP reclassifica só com picker + justificativa.

---

## 6. V4 — superfície passiva (push adiado)

A `timeline` do paciente já lê `evidence_revision`. Fatia 1 garante que a superfície do terapeuta
(timeline da sessão / revisão) exiba a revisão do coordenador **com justificativa + autor** — o tom de
formação vem por escrito. Se a view já mostra, é quase de graça; se falta o campo, é adição pequena a
uma view existente. **Não** se constrói sino/push/contador.

> ⚠️ **Dívida de _compliance_, não só UX (pre-mortem #4).** V4 exige "notificação **nunca
> silenciosa**". A superfície passiva é, na prática, silenciosa para o terapeuta que não abre a
> timeline. Adiar o sinal ativo é aceitável para o MVP, mas fica registrado como dívida de
> **governança/compliance** (não polimento) — a fatia de notificação deve fechá-la, e uma auditoria
> "como o terapeuta é avisado?" hoje responde "ele teria que olhar". Registrar no BACKLOG nesse tom.

---

## 7. Testes (`.int.test.ts`, Postgres real, espelham `revisao`)

- **Fila:** devolve só evidências V1a/V1b não-tratadas; exclui já-revisada, com `evidence_query` aberta,
  e invalidada; cross-tenant → 0 linhas; ordenação estável.
- **Rota coordenador-only:** terapeuta/admin_recepcao → `notFound`.
- **Cada ação:** grava a linha certa (`evidence_revision`/`evidence_query`) + `audit_log` com
  `ator_id` do coordenador; `classificacaoAnterior` = corrente da view.
- **Reclassificar/invalidar sem justificativa → rejeita.**
- **Reclassificar** com alvo estruturado → `evidence_current` reflete a nova classificação **e** o
  `session_snapshot` recomputa (snapshot muda). **Invalidar** → evidência sai do cômputo. **Devolver** →
  `evidence_query` aberta + recompute exclui do cômputo.
- **`novaClassificacao` inválida** (alvo fora dos protocolos ativos **ou** `tipo_estrutura` incompatível) → rejeita.
- **Reclassificação cross-protocolo:** alvo de outro protocolo ativo do paciente é aceito e recomputa.
- **`responderQuery`:** terapeuta fecha a query aberta → `respondido_em` setado, evidência **volta** ao
  cômputo (snapshot recomputado a re-inclui, ou entra com a nova classificação se corrigida). Sem limbo.
- **Guarda de concorrência:** 2ª ação sobre item já tratado (mesmo paciente) → `CONCURRENCY_ERROR`,
  sem dupla-inserção.
- **a11y** da UI da fila e da superfície de responder-query.

---

## 8. Decisões abertas / adiado (BACKLOG)

1. Sinais **V1c/V1d/V1e/V1f** — precisam campos/config (amostra %, contagem de sessões + N de
   calibração, detecção de candidatura viva, botão "encaminhar" no fluxo do terapeuta).
2. **V4 ativa** — subsistema de notificação (sino/push/tom). **Dívida de compliance** (§6): V4
   "nunca silenciosa" fica parcial até lá.
3. **Checklist por protocolo** como dado estruturado na UI de reclassificar.
4. **V5** — taxa de reclassificação como proxy de IOA + dataset (texto, classe-errada, classe-certa).
5. **Caminho de correção de reclassificação (pre-mortem #3).** MVP é **tiro-único**: tratada, a
   evidência sai da fila (`NOT EXISTS revisão`); um erro de reclassificação não é corrigível pela UI.
   Aceito para o MVP (com confirmação na ação). Futuro: fila inclui evidência cuja **última** revisão
   foi `reclassificar`, ou tela "minhas revisões recentes" com desfazer — alinha com V3.

---

## 9. Definição de Pronto (Fatia 1) — checklist

- [ ] `validacao/queries.ts`: fila V1a/V1b correta; exclui tratada/devolvida/invalidada; cross-tenant → 0.
- [ ] `validacao/actions.ts`: 4 ações do coordenador, cada uma em 1 tx sob advisory lock, `requireRole('coordenador')`.
- [ ] Reclassificar grava `classificacaoNova` estruturada + `audit_log('reclassificacao')` + recompute.
- [ ] Invalidar/devolver gravam + `audit_log` + recompute (evidência sai do cômputo).
- [ ] Confirmar grava revisão sem recompute; justificativa default.
- [ ] Justificativa/motivo vazio em reclassificar/invalidar → rejeita.
- [ ] `novaClassificacao` inválida (alvo fora dos protocolos ativos OU `tipo_estrutura` incompatível) → rejeita.
- [ ] Picker permite alvo **cross-protocolo** dos protocolos ativos do paciente.
- [ ] **`responderQuery` (terapeuta):** fecha a query (`respondido_em`), cria revisão resultante se
      corrige, e **recompute re-inclui** a evidência no cômputo. Sem limbo (pre-mortem #2).
- [ ] Recompute de meio-de-história correto (reusa `materializarSnapshot`; teste `fase4-materializar:287` já cobre a função).
- [ ] Guarda de concorrência: dupla-validação → `CONCURRENCY_ERROR`.
- [ ] UI card "item N de M" com trecho literal, classificação atual, 4 ações; confirmação em reclassificar; sem lote; design system reusado.
- [ ] V4 passiva: revisão do coordenador (justificativa+autor) visível na superfície do terapeuta.
- [ ] Rota coordenador-only; superfície de responder-query só p/ terapeuta da equipe.
- [ ] `pnpm typecheck`/`lint`/`test`/`test:rls` verdes.
- [ ] BACKLOG atualizado com o escopo adiado (V1c-f, V4 ativa, checklist, V5).
