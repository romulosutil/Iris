# Jornada de cadastro self-service + trial de 7 dias e cobrança

> Spec de design — 30/07/2026
> Issues: **#163** (jornada de cadastro self-service) e **#159** (trial de 7 dias
> + gateway de pagamento), planejadas juntas por decisão do Rômulo.
> Guarda-chuva: **#36** (Fase 7 — Self-Service & Growth).

---

## 1. Por que as duas juntas

Hoje não existe caminho para um profissional virar usuário do Iris: a única
forma de provisionar clínica é `pnpm seed:clinic`, e a tentativa de rodar isso
em produção em 30/07/2026 falhou (o `iris-app` roda build standalone sem `pnpm`
/`tsx`; o `iris-migrate` é job, não container ativo; sobrescrever o `Comando`
dele mexe no gate de schema do deploy). Já há gente pedindo para testar.

A #159 estava gated em "≥3 pilotos validarem o onboarding", mas o gatilho
pressupõe onboarding existente. Construir a #163 sem o relógio de trial cria
contas sem prazo, que depois precisariam ser migradas à força para um trial
começado no passado — por isso as duas entram no mesmo desenho, em duas fatias
de entrega.

## 2. Decisões travadas nesta sessão

| # | Decisão | Racional |
|---|---|---|
| D1 | Cobrança **por paciente ativo/mês**, tier Diário (R$ 39–49), usuários ilimitados | `docs/produto/modelo-de-negocio.md` §3/§4 já decidiu a métrica de valor; Rômulo mandou seguir o documento |
| D2 | **Sem piso** de pacientes no self-service | O piso do §3 protege CAC de venda assistida; no self-service o CAC é ~zero e o piso só afasta o autônomo pequeno, que é justamente quem chega sozinho |
| D3 | Ciclo por **aniversário da conta**; trial começa no signup, 1ª fatura vence no dia 8 e depois no mesmo dia de cada mês | Sem pro rata na primeira fatura, que é onde o cliente mais desconfia; sem pico de processamento |
| D4 | **Não** exigir meio de pagamento no cadastro | Fricção mínima na porta; o que o piloto precisa medir é se a pessoa volta para pagar depois de usar |
| D5 | Pós-trial = **somente-leitura com exportação livre**, não bloqueio total | O profissional é controlador do dado e tem dever de guarda (CFP/CFM); trancar prontuário atrás de fatura é refém de prontuário — risco jurídico desproporcional ao ganho de conversão. Substitui o "acesso bloqueado até pagamento" do texto original da #159 |
| D6 | Cadastro **aberto**, com conselho + número de registro **obrigatórios e auditados** (declaração, não verificação na API do conselho) | Destrava os interessados sem virar cadastro anônimo em cima de dado de saúde de menor; deixa registro de quem é o responsável |
| D7 | Entrega em **2 fatias**: A destrava o cadastro, B cobra | Quem pediu para testar entra antes; a cobrança chega antes do primeiro trial vencer. Evita um deploy único tocando auth, RLS e dinheiro ao mesmo tempo |
| D8 | Gateway atrás de uma porta `BillingProvider` | Escolha do provedor concreto é decisão comercial em curso (§8); o desenho e os testes não dependem dela |

## 3. Arquitetura

### 3.1 Provisionamento (Fatia A)

Server Action `criarConta` orquestra `provisionUser()` (`src/auth/provisioning.ts`),
que já é idempotente por e-mail. Cria `clinic`, vincula o usuário como
`coordenador`, grava o aceite de termos e dispara a verificação de e-mail.

Alternativas descartadas:

- **Hook `after` do Better-Auth no `signUpEmail`** — acoplaria criação de tenant
  a *todo* signup, incluindo o convite de terapeuta, que não deve criar clínica.
- **Clínica só no wizard pós-login** — exigiria um estado novo no `resolveTenant`,
  que hoje é enxuto e correto.

**Atomicidade — limite real:** `provisionUser` chama `auth.api.signUpEmail`, que
roda no adapter do Better-Auth, **fora de qualquer transação nossa**. Não existe
"tudo ou nada" aqui. Consequência tratada por desenho, não por otimismo:

- `criarConta` é **idempotente e retomável**: reentrar com o mesmo e-mail conclui
  o que faltou (usuário existe → cria clínica; clínica existe → cria vínculo).
- `/sem-acesso` passa a distinguir **sem vínculo** de **cadastro incompleto**, e
  no segundo caso oferece concluir o cadastro. Sem esse caminho, uma falha no meio
  do signup queima o e-mail do interessado num beco sem saída.

### 3.2 Rotas da Fatia A

```
/cadastro → /cadastro/verifique-email → /verificar-email?token=…
          → /mfa/setup (enforcement já existe em getTenantContext)
          → app, com faixa "Trial: N dias restantes"
/esqueci-senha  /redefinir-senha?token=…
```

`sendResetPassword` e `sendVerificationEmail` entram na config do Better Auth
(`src/auth/auth.ts`), apoiados num **adapter de e-mail genérico novo** — irmão do
`src/lib/email/resend.ts`, sem tocar no tipo `RtAlertaEmailInput`, que é fechado
de propósito no alerta de risco (§4.2.1).

**`requireEmailVerification` quebra quem já existe.** Ligar a flag passa a exigir
`email_verified` de todas as contas — inclusive as criadas por `seed:clinic`, que
nunca verificaram nada. A migração que liga a flag **faz o backfill
`email_verified = true` das contas pré-existentes no mesmo commit**, nunca como
passo manual pós-deploy.

**Superfície nova exposta à internet** (escopo, não follow-up):

- Rate limiting por IP e por e-mail em `/cadastro`, `/esqueci-senha` e no reenvio
  de verificação.
- **Sem enumeração de e-mail**: resposta uniforme para e-mail existente e novo.
  E-mail já cadastrado recebe aviso "alguém tentou criar conta com seu e-mail",
  com link para recuperação — nunca "e-mail já existe" na tela.
- Trial repetido por e-mail descartável é aceito como risco conhecido no MVP;
  mitigação parcial via unicidade de CPF/CNPJ do responsável (§4.1).

### 3.3 Gate de acesso (Fatia B)

`withTenant` (`src/db/rls.ts:27`) já é o gargalo único de todo acesso a dado de
paciente. O gate vive **lá, no banco** — não espalhado por action:

1. `resolveTenant` já faz join em `clinic`; passa a trazer `trial_comeco_em`,
   `trial_dias` e o estado da assinatura, e devolve `ctx.escritaBloqueada`.
2. Com a conta bloqueada, `withTenant` roda `SET LOCAL TRANSACTION READ ONLY`.
   Uma linha cobre toda tabela, toda policy e toda action — inclusive as que ainda
   não existem. Rota nova nasce protegida; o Postgres recusa a escrita.
3. Exceção **nomeada e curta**: o export de prontuário/dossiê grava `audit_log`.
   `withTenant` ganha `escritaPermitida?: 'auditoria_export'` — allowlist
   explícita, não um booleano genérico.

**O bloqueio é derivado no request, não lido de uma flag setada por job.**
`escritaBloqueada` = (trial vencido no timezone da clínica) **e** (nenhuma fatura
paga vigente). O job diário só emite cobrança e manda e-mail. Motivo: se o
bloqueio dependesse do job, job morto = trial que nunca vence = produto de graça
silenciosamente — falha *aberta*. Este projeto já viveu exatamente isso (motor de
escalonamento caiu em produção com test/lint/build verdes, #156). Assim, job morto
falha **fechado**.

**Isenções do gate — inegociáveis:**

- O **motor de escalonamento de alerta de risco clínico** nunca é bloqueado por
  inadimplência. Cobrança não degrada segurança clínica. Coberto por teste.
- Leitura e **exportação** seguem liberadas em qualquer estado (D5).

UI: faixa persistente + tela `/assinatura` com a fatura em aberto. Escrita
bloqueada aparece como botão desabilitado com o motivo — nunca erro cru do banco.

### 3.4 Relógio, contagem e faturamento (Fatia B)

- `trial_comeco_em` = instante do signup. Dia 8 nasce a 1ª fatura; o dia do
  vencimento vira o aniversário mensal.
- **Aritmética de data:** aniversário no dia 29/30/31 faz *clamp* para o último dia
  do mês curto. Toda fronteira de dia é avaliada no `clinic.timezone` (coluna já
  existe, default `America/Sao_Paulo`) — vencimento calculado em UTC faria o
  cliente ver o bloqueio chegar um dia antes.
- **Job diário** (script do repo agendado — o Easypanel v2.31 não tem cron de app;
  mesmo padrão do motor de escalonamento): fecha ciclos vencidos, conta pacientes
  ativos, emite a cobrança pelo adapter e dispara os avisos de D-3 e D-1.
- **Idempotência no banco, não na disciplina do script:** `unique (clinic_id,
  ciclo_inicio)` em `invoice`. Reexecução de job com retry é o modo de falha
  default; sem a chave, ela emite a segunda cobrança do mesmo ciclo.
- **Contagem com RLS ligada:** o job não tem usuário. Fabricar um `ctx` sintético
  para atravessar o `withTenant` é exatamente o padrão de `ctx` forjável que a #55
  fechou. Em vez disso, uma função `SECURITY DEFINER` do owner devolve **só o
  número** de pacientes com ≥1 sessão na janela, por clínica — nenhum dado de
  paciente sai, e o guard interno espelha o predicado da RLS de leitura.
- **Contagem congelada** em `invoice_item` no fechamento, junto com o preço
  unitário vigente. Nunca recalculada depois: fatura reprocessada tem que dar o
  mesmo número.

### 3.5 Porta de billing

```ts
interface BillingProvider {
  criarCliente(input): Promise<{ providerCustomerId: string }>;
  emitirCobranca(input): Promise<{ providerInvoiceId: string; url: string }>;
  consultarStatus(providerInvoiceId): Promise<StatusCobranca>;
  verificarWebhook(req): Promise<EventoBilling>; // valida assinatura
}
```

`subscription` e `invoice` são **nossas**; o gateway é detalhe atrás da porta e os
testes rodam com adapter fake. Webhook numa rota da própria app (VPS, não
serverless), com verificação de assinatura e **idempotência por `event_id`** —
nunca confiar em ordem de entrega nem em entrega única. Dados de cartão jamais
tocam a aplicação: checkout hospedado pelo provedor.

## 4. Modelo de dados

### 4.1 Fatia A

- `clinic.trial_comeco_em timestamptz not null default now()`
- `clinic.trial_dias integer not null default 7`
- `app_user`: conselho (`crp|crfa|crefito|crm|outro`), número de registro e UF.
  Grants precisam ser dados explicitamente para `app_role` e `iris_auth` — grant de
  coluna faltando aparece como "permission denied for table", diagnóstico caro.
- `professional_consent` (novo): aceite de termos do **profissional adulto**. O
  consentimento modelado hoje cobre **paciente menor** — é o mesmo gap de #98/#99.
  Campos: `user_id`, `clinic_id`, `versao_termo`, `aceito_em`, `ip`, `user_agent`.
  Registro auditável, imutável pela aplicação.

### 4.2 Fatia B

- `subscription`: `clinic_id`, `plano`, `preco_unitario_centavos`, `status`
  (`trial|ativa|inadimplente|cancelada`), `provider`, `provider_customer_id`,
  aniversário do ciclo.
- `invoice`: `clinic_id`, `ciclo_inicio`, `ciclo_fim`, `vencimento_em`,
  `total_centavos`, `status`, `provider_invoice_id`, `pago_em`.
  **`unique (clinic_id, ciclo_inicio)`**.
- `invoice_item`: quantidade de pacientes ativos e preço unitário **congelados**.
- `billing_event`: eventos de webhook recebidos, `unique (provider, event_id)`.

Preço vive em coluna versionada por assinatura, não em constante no código —
mudança de preço não pode reescrever história de fatura.

Toda tabela nova entra com policy RLS **e** teste na suíte `test:rls`. Verde com
muitos "skipped" é vermelho disfarçado.

## 5. Testes

- Unitários: aritmética de ciclo (clamp de 29/30/31, timezone, D-3/D-1), derivação
  de `escritaBloqueada`, cálculo de fatura.
- Integração: `criarConta` idempotente e retomável (inclusive falha entre criar
  usuário e criar clínica); backfill de `email_verified`; reset de senha.
- RLS: tabelas novas; a função de contagem `SECURITY DEFINER` não vaza linha de
  paciente e respeita o predicado de leitura.
- Gate: conta bloqueada recusa escrita **no banco** (não só na UI); leitura e
  export continuam funcionando; **motor de escalonamento de risco não é bloqueado**.
- Billing: webhook duplicado não cobra duas vezes; job reexecutado não emite
  segunda fatura do mesmo ciclo.
- E2E (Playwright): cadastro → verificação → MFA → primeiro paciente.

## 6. Fatias de entrega

**Fatia A — destrava (primeira):** `/cadastro`, verificação de e-mail (com
backfill), criação de clínica, reset de senha, aceite de termos, registro
profissional, MFA no primeiro acesso, relógio de trial correndo e visível.
Sai daqui: `AUTH_DATABASE_URL` e `BETTER_AUTH_SECRET` do serviço `iris-migrate` —
um job de DDL parou de precisar carregar a chave de assinatura de sessão (débito
declarado na #163).

**Fatia B — cobra (dias depois):** gate de somente-leitura, `/assinatura`, adapter
do gateway, job de faturamento, webhooks, avisos de D-3/D-1.

## 7. Fora de escopo

Wizard de onboarding guiado completo, portal de assinatura com upgrade/downgrade
entre tiers, tiers Clínica e Convênio no self-service (seguem com onboarding
assistido, #36), validação do registro na API do conselho, emissão automática de
NFS-e (§8), Pix recorrente se o provedor escolhido não suportar.

## 8. Dependências e questões abertas

1. **Gateway de pagamento** — pesquisa em andamento (agente dedicado), avaliando
   Stripe, Asaas, Mercado Pago, Abacatepay, Pagar.me, Iugu, Vindi e Galax Pay
   contra: valor variável por ciclo, trial de 7 dias, Pix/boleto/cartão na
   recorrência, taxas, NFS-e, portal do cliente, SDK Node e **jurisdição** (provedor
   fora do Brasil cria transferência internacional de dado pessoal do pagante, com
   custo de DPA — a #102 já tem esse item aberto para a Hostinger). A porta do §3.5
   isola a decisão; o adapter concreto entra na Fatia B.
2. **Termo de Uso e Política de Privacidade publicados** — bloqueador jurídico da
   Fatia A: o aceite precisa apontar para um texto versionado, e `docs/legal/` exige
   confirmação do Rômulo antes de qualquer mudança. Vale o mesmo método de
   ratificação já usado no projeto (leitura ao vivo com o advogado, sem
   apontamentos = alinhado, método registrado no próprio documento).
3. **Preço final** — R$ 39–49 é hipótese do §4 do modelo de negócio, a fechar por
   Van Westendorp no Roteiro C. A Fatia B precisa de **um número** para a primeira
   fatura; até lá o valor fica em coluna versionada, não em constante.
4. **#80 (tela de enrollment de MFA)** — todo cadastro novo atravessa essa tela no
   minuto zero. Não é bloqueador técnico, é risco de conversão: vale puxar a
   melhoria para dentro da Fatia A.
5. **Definição de "paciente ativo"** — adotamos ≥1 sessão registrada na janela do
   ciclo (hipótese do §3 do modelo de negócio). A alternativa mais generosa (>3
   sessões/mês, referência Neoaba) fica para o piloto decidir.

## 9. Riscos aceitos

- Trial repetido via e-mail descartável (mitigação parcial por CPF/CNPJ).
- Registro profissional é **declarado**, não verificado — o valor está na trilha
  auditável, não na barreira.
- Conversão no dia 8 sem cartão previamente cadastrado é a aposta central de D4;
  a própria Fatia B é o experimento que a testa.
