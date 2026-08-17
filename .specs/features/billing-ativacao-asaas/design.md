# Ativação de assinatura via Asaas — design

> Complementa `spec.md`. Resolve os três pontos abertos da spec com a doc do
> Asaas (consultada 10/08/2026) e fixa a arquitetura de cada requisito ATIV-*.

## 0. Pesquisa — pontos abertos da spec, resolvidos

### 0.1 `name` × CPF de pessoa física — **não bloqueia**

`POST /customers` (docs.asaas.com/reference/create-new-customer): campos
obrigatórios são **só `name` e `cpfCnpj`**. Não existe validação documentada de
que o `name` precise bater com o titular do documento (nenhuma menção a
Receita Federal ou reconciliação nome×documento). Logo `name: nomeClinica` com
CPF de profissional autônomo **passa** — o adapter não muda nesse ponto.

### 0.2 Troca de documento — **permitida no gateway; nossa regra é local**

`PUT /customers/{id}`: `cpfCnpj` é atualizável — "change of registered CPF or
CNPJ" é citado na doc como caso de uso comum do endpoint, sem restrição
documentada por existirem cobranças/assinaturas.

**Decisão de design:** `clinic.cpf_cnpj` é **livremente editável** na tela.
O cliente já criado no gateway **não** é retro-atualizado nesta fase:

- Cobrança de ciclo debita contra a **autorização** de Pix Automático
  (`pixAutomaticAuthorizationId`), não contra o documento do cliente — trocar o
  documento local não afeta débito de vínculo já autorizado.
- O documento novo passa a valer na **próxima criação de vínculo** (que cria
  cliente novo com o documento novo).
- Retro-atualizar via `PUT /customers/{id}` fica registrado como melhoria
  possível (depende do D32 — sem `provider_customer_id` persistido não há quem
  atualizar).

### 0.3 `providerCustomerId` — **passa a ser persistido**

`VinculoCriado` ganha `providerCustomerId?: string` (vocabulário neutro: "id do
cliente no gateway" não é jargão de provedor — respeita a regra de ouro de
`types.ts`). O adapter Asaas preenche com o `customerId` que hoje descarta
(`asaas.ts:502`); `iniciarAtivacao` persiste na coluna `provider_customer_id`
que existe desde a `0071` e nunca foi escrita (D32). **Reuso** do cliente em
reativação (buscar por `externalReference` em vez de criar duplicata) fica fora
desta fase — persistir primeiro, reusar depois; a doc do Asaas tolera clientes
duplicados.

---

## 1. Modelo de dados

### 1.1 `clinic.cpf_cnpj` (ATIV-01)

```ts
// schema.ts — dentro de clinic
// Documento fiscal do titular da conta (CPF de autônomo ou CNPJ de clínica).
// Só dígitos. Nullable: clínicas legadas existem sem documento e o valor só
// se torna necessário na ativação da assinatura — a exigência é do fluxo,
// não da linha.
cpfCnpj: text("cpf_cnpj"),
```

- Gerada com `pnpm db:generate` (mudança de `schema.ts` → nunca à mão).
- **Escrita**: `app_role` **não tem policy de UPDATE em `clinic`** (verificado:
  é a razão de existir de `app_salvar_config_emergencia`, 0081, e do
  `app_iniciar_trial`). Portanto a gravação vai de função `SECURITY DEFINER`,
  **não** de policy nova — regra 5 do CLAUDE.md:

```sql
-- DDL à mão no MESMO .sql gerado (não toca snapshot):
-- app_salvar_cpf_cnpj_clinica(p_cpf_cnpj text)
--  SECURITY DEFINER, precedente 0081:
--  * tenant: WHERE id = app_clinic_id_exigido()      -- helper do D16, NUNCA cast cru
--  * papel:  current_setting('app.user_role') = 'coordenador'
--            (forma crua consciente — D23 está aberto e o fix de papel é
--             decisão separada; seguir o padrão vigente da 0081)
--  * formato: guard leniente no banco (comprimento 11 ou 14), a validação
--             de verdade (dígitos verificadores) é do TypeScript
--  * GRANT EXECUTE ... TO app_role
```

- **Leitura**: `SELECT` de `clinic` já funciona via `withTenant`
  (`logic.ts:70-81` lê `clinic.nome`); coluna nova herda o privilégio se o
  `SELECT` for de tabela. **Verificar medindo** após `db:migrate`:
  `SELECT has_column_privilege('app_role', 'clinic', 'cpf_cnpj', 'SELECT')` —
  se der `false`, `GRANT SELECT (cpf_cnpj)` explícito (armadilha das 0044/0057).
- Journal: como o `.sql` sai do `db:generate`, a entrada nasce certa; se
  qualquer parte virar migração separada à mão, `when` = anterior + 1000
  (`migrations.test.ts` cobra).

### 1.2 `subscription.provider` sem default (ATIV-05)

**Decisão: nullable, sem default, com CHECK.**

```ts
// schema.ts — provider deixa de ter default E deixa de ser notNull:
provider: text("provider"),
```

```sql
-- CHECK nomeado no padrão Drizzle (regra da reconciliação 0078):
ALTER TABLE subscription
  ADD CONSTRAINT subscription_provider_quando_vinculado_check
  CHECK (status = 'free_tier' OR provider IS NOT NULL);
```

Racional, na ordem que importa:

1. **`NOT NULL` + sem default é insustentável**: o backfill da `0071:396` e
   todo INSERT de linha `free_tier` (que nunca tocou gateway nenhum) não têm
   valor **verdadeiro** para escrever. Foi exatamente esse INSERT que o default
   carimbou com `mercado_pago` em produção.
2. **NULL é o único valor honesto** para "sem vínculo de gateway ainda".
3. **O CHECK fecha a porta na direção perigosa**: linha que saiu de
   `free_tier` (setup_pending/active/past_due/canceled) **tem** de declarar
   provedor — é ela que um dia chega em `getProviderPorId`. Lembrete do repo:
   expressão NULL em CHECK **satisfaz** a constraint; aqui o predicado trata o
   NULL explicitamente, sem depender desse comportamento.
4. `iniciarAtivacao` já escreve `provider` + `providerSubscriptionId` juntos no
   `onConflictDoUpdate` — o caminho de escrita real não muda.

**Backfill na mesma migração** (produção tem 2 linhas, medidas):

```sql
-- Linha free_tier: provider carimbado pelo default, nunca tocou gateway.
UPDATE subscription SET provider = NULL
  WHERE status = 'free_tier' AND provider_subscription_id IS NULL;
--> statement-breakpoint
-- Linha setup_pending/mercado_pago: preapproval que nunca será autorizado
-- (MP desabilitado como gateway ativo; rota de webhook sai no ATIV-07 — o
-- evento de autorização não teria nem porta de entrada). Deixá-la seria
-- armadilha: com o trial vencido, derivarSituacao a leria como
-- "pagamento_em_processamento" (somente-leitura SEM link de saída na UI) —
-- deadlock de conta. Volta a free_tier/NULL; a clínica reativa pelo Asaas.
UPDATE subscription
  SET status = 'free_tier', provider = NULL, provider_subscription_id = NULL,
      checkout_url = NULL, pix_copia_e_cola = NULL,
      valor_ativacao_centavos = NULL, metodo_pagamento = NULL
  WHERE provider = 'mercado_pago' AND status = 'setup_pending';
```

> ⚠️ Gate de permissão do repo: é DDL/DML em tabela com dado de produção —
> **confirmar com o Rômulo antes de aplicar** (regra do CLAUDE.md §Permissões).

**Efeito colateral em testes** (mapeado, não surpresa): todo INSERT de teste
`(clinic_id, status)` com status ≠ `free_tier` passa a violar o CHECK e precisa
declarar `provider` — `actions.int.test.ts:78,738`, `billing-apuracao:386`,
`protocolo.int.test.ts:195`, `benjamin/queries.int.test.ts:33`,
`conta-somente-leitura:124`, `clinic-id-helper-rls:531,588` (estes dois são
`free_tier`? conferir na implementação). É o teste de CI do ATIV-06 nascendo de
graça: o CHECK **é** o guard no banco; o teste de schema em TS
(`src/db/migrations.test.ts`-style) só precisa afirmar que `schema.ts` não
reganha `.default(`.

### 1.3 Tipos da porta (ATIV-04/D32)

```ts
// types.ts
export interface VinculoCriado {
  providerVinculoId: string;
  /** Id do cliente criado/reusado no gateway. Opcional: nem todo trilho
   *  tem entidade "cliente" separada do vínculo. */
  providerCustomerId?: string;
  autorizacao: AutorizacaoPendente;
  status: StatusAssinaturaProvider;
}
```

`iniciarAtivacao` grava `providerCustomerId: criado.providerCustomerId` no
INSERT e no `onConflictDoUpdate` (sempre as duas colunas juntas com o
provider — mesma disciplina do D21/`colunasDaAutorizacao`).

---

## 2. Validador (ATIV-02)

Novo `src/lib/cnpj.ts` + composição em `src/lib/documento.ts`:

```
validarEMaterializarCpfCnpj(raw) →
  | { valido: true; documento: string }   // só dígitos, 11 ou 14
  | { valido: false; erro: string }       // pt-BR, nomeando a interpretação
```

- Remove máscara; decide a interpretação **pelo comprimento**: 11 dígitos →
  valida como CPF (reusa `validarEMaterializarCPF` de `src/lib/cpf.ts`); 14 →
  valida como CNPJ (dígitos verificadores mod-11, pesos 5..2/6..2); outro
  comprimento → erro que cita os dois formatos aceitos.
- Erro nomeia o que falhou: "CPF inválido (dígito verificador não confere)" ≠
  "documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos".

> ⚠️ **Incerteza declarada (não verificada):** a Receita Federal previu CNPJ
> **alfanumérico** a partir de julho/2026. Não encontrei na doc consultada do
> Asaas se `cpfCnpj` aceita a forma alfanumérica. O validador desta fase aceita
> **só dígitos** (universo real dos CNPJs existentes); se uma clínica chegar
> com CNPJ alfanumérico, o erro é claro e o suporte é ampliação pontual do
> validador. Registrar no PR como limitação consciente.

---

## 3. Fluxo da ativação (ATIV-03/04)

```
/assinatura (page.tsx, server)
  └─ withTenant: lê clinic.nome, clinic.cpf_cnpj
  └─ <FormularioAtivacao documentoInicial={cpfCnpj ?? ""} />

FormularioAtivacao (client)
  └─ Field "CPF ou CNPJ do titular da conta" (required, defaultValue)
       copy: "CPF se você atende como pessoa física, CNPJ se a clínica tem
       empresa. Exigido pelo banco para registrar o Pix Automático."

ativarAssinatura (action) → iniciarAtivacaoAssinatura(ctx, formData)
  1. requireRole coordenador                 (inalterado)
  2. validarEMaterializarCpfCnpj(formData)   → erro pt-BR se inválido; NÃO chama gateway
  3. withTenant: SELECT nome/email  +  SELECT app_salvar_cpf_cnpj_clinica($doc)
     — persistir ANTES do gateway (spec AC3). Falha do gateway depois não
     perde o documento: próxima tentativa vem pré-preenchida.
  4. iniciarAtivacao({ ..., cpfCnpj: documento })  — campo deixa de ficar vazio
```

`PedidoAtivacao.cpfCnpj` **continua opcional na porta** (outro trilho futuro
pode não exigir), mas `iniciarAtivacaoAssinatura` sempre envia — o "opcional
que escondia o buraco" morre no call site, não no contrato.

---

## 4. Jornada sem beco (ATIV-08/09)

### 4.1 Pós-QR (`formulario-ativacao.tsx`)

No ramo `pix_copia_e_cola`, depois do parágrafo "a confirmação chega sozinha",
entra CTA explícito:

```
[Cadastrar paciente]  → /pacientes/novo   (Button primaria, asChild Link)
```

Sem polling de status nesta fase: a página `/pacientes/novo` já reavalia a
situação no request e o submit já trata bloqueio — o CTA se apoia em
comportamento que existe.

### 4.2 Aviso antecipado em `/pacientes/novo/page.tsx` (ATIV-09)

A página já busca `obterSituacaoConta(ctx)`. Ganha o ramo que falta:

```tsx
{!situacao.podeCadastrarPaciente ? (
  <Alert severidade="erro" destacado titulo="Conta em somente-leitura">
    {mensagemDeEstado(situacao.estado)}
    {/* mesmo critério do form (novo-paciente-form.tsx:92): link SÓ quando
        ativar é a saída — nunca em pagamento_em_processamento (cobrança em
        voo; mandar ao checkout gera segunda cobrança) */}
    {estado é trial_expirado || cancelada → <Link href="/assinatura">}
  </Alert>
) : ...banner trial_aguardando existente...}
```

O formulário continua renderizado (leitura dos campos não é proibida) e a
defesa no submit permanece — o banner é aviso antecipado, não gate novo.

### 4.3 Código morto do redirect

- **`/assinatura/retorno/page.tsx` é removida** — só o ramo
  `forma: "redirect"` chegava nela, e ele era exclusivo do MP (sai no ATIV-07).
- **`urlRetorno` fica na porta** (`NovoVinculo.urlRetorno`): é contrato para
  provedor de checkout futuro, vocabulário neutro, e o adapter Asaas já o
  ignora. `logic.ts` passa a apontar para `/assinatura` (destino que existe).
- O `useEffect` de navegação e o ramo `redirect` da UI **ficam**: são o render
  do tipo `AutorizacaoPendente`, que continua tendo a forma `redirect` no
  contrato. UI de união discriminada renderiza a união inteira.

---

## 5. Remoção do Mercado Pago (ATIV-07)

Sai, nesta ordem (cada passo compila e testa verde):

| Passo | O quê                                                                                                                           | Nota                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `ProviderId` → `"asaas"` só                                                                                                     | typecheck aponta todo call site restante                                                                                                                                                                                                   |
| 2     | `getProviderPorId`/`getBillingProvider`: ramo MP fora                                                                           | mensagem "Provedor de pagamento desconhecido" continua — agora dispara para `mercado_pago`                                                                                                                                                 |
| 3     | `provider/mercado-pago.ts` + `mercado-pago.test.ts` deletados                                                                   |                                                                                                                                                                                                                                            |
| 4     | `src/app/api/hooks/mercadopago/` (rota + int.test) deletados                                                                    | webhook do painel MP: desativar manualmente no painel (gate manual, fora do código)                                                                                                                                                        |
| 5     | Tabela de evento de webhook do MP: **migração de DROP só depois de `SELECT count(*)` na produção e confirmação do Rômulo**      | regra "DDL em tabela com dado"; alternativa barata: manter a tabela como histórico e só remover o código                                                                                                                                   |
| 6     | Envs: `MERCADOPAGO_ACCESS_TOKEN/PUBLIC_KEY/WEBHOOK_SECRET` fora do `.env.example` e do Easypanel                                | Easypanel: salvar ≠ aplicar — exige "Implantar"                                                                                                                                                                                            |
| 7     | Testes de integração que encenam MP (`ativacao-troca-de-provedor`, `reprocessamento-provedor`, `fechamento-provedor-por-linha`) | **não deletar a cobertura**: eles provam invariantes multi-provedor (D25/D26). Reescrever com provedor fake registrado no teste, ou dublê local — decidir na implementação; o invariante "linha decide o adapter" tem de continuar coberto |

**Pré-requisito duro:** ATIV-05 aplicado antes (D29) — senão linha nova nasce
apontando para adapter removido.

---

## 6. Sequência de implementação (semente do tasks.md)

```
Fase A — desbloqueia produção (P1)
  A1. schema.ts: clinic.cpfCnpj + subscription.provider nullable sem default
      → pnpm db:generate → editar o .sql: definer + GRANT + CHECK + backfill
      → [GATE Rômulo: backfill toca dado de produção]
  A2. src/lib/cnpj.ts + documento.ts + testes unit (mutação: DV errado falha)
  A3. types.ts: VinculoCriado.providerCustomerId; asaas.ts preenche;
      subscription.ts persiste (insert + onConflictDoUpdate)
  A4. assinatura/logic.ts: valida → grava via definer → envia cpfCnpj
      + formulario-ativacao.tsx: campo documento
  A5. testes: int da ativação com documento (caminho feliz + inválido +
      pré-preenchimento); ajustar INSERTs de teste que o CHECK quebrou
  A6. verificação medida: has_column_privilege, pg_proc (prosecdef do definer),
      BEGIN…ROLLBACK exercitando o CHECK; ativação real no sandbox → linha
      setup_pending com pix_copia_e_cola + valor + provider_customer_id

Fase B — jornada (P2)
  B1. CTA pós-QR + aviso antecipado em /pacientes/novo + testes de componente
  B2. /assinatura/retorno removida; urlRetorno → /assinatura

Fase C — remoção MP (P2, depende de A1 aplicada)
  C1. passos 1–4 e 7 da tabela §5
  C2. [GATE Rômulo] DROP da tabela de webhook + limpeza de envs no Easypanel

Prova final (Definição de pronto da spec):
  ativação real completa → webhook ASAAS aplica → subscription.status='active'
  → asaas_webhook_event.aplicado_em preenchido (1ª vez na história do sistema)
```

## 7. Riscos e o que NÃO muda

- **Não muda**: trial irrestrito (#163/#175), `estado-conta.ts`, adapter Asaas
  (a validação de `cpfCnpj` dele já está certa), valor de ativação R$ 0,01
  (D22), rota/verificação do webhook Asaas.
- **Risco QR expirado**: `iniciarAtivacao` reaproveita vínculo `setup_pending`
  do mesmo provedor e devolve o BR Code persistido — se o QR expirou
  (`EXPIRACAO_QR_ATIVACAO_SEGUNDOS`), a clínica recebe um código morto sem
  saber. Pré-existente, fora do escopo; candidato a D33 se aparecer na
  prática.
- **Risco de coluna sem GRANT**: mitigado com verificação medida (A6) — o modo
  de falha conhecido é `permission denied for table clinic` sem nomear coluna.
