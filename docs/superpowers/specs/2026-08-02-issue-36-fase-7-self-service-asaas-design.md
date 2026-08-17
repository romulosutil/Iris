# Design Spec — Issue #36: Fase 7 - Integração de Billing com Asaas (Pix Automático & Ficha Ativa)

> **Status:** 🟢 **CONCLUÍDO EM PRODUÇÃO (11/08/2026, PR #244 / D24 / D43 / D44)**
>
> 1. **Conta Asaas de produção ativa:** O faturamento opera exclusivamente via **Asaas com Pix Automático** (`immediateQrCode` com autorização de R$ 0,01 + apuração mensal pós-paga por ficha ativa).
> 2. **Mercado Pago Descontinuado (D24):** O suporte a Mercado Pago foi formalmente removido e a tabela `mercadopago_webhook_event` foi dropada via migração `0091_drop_webhook_mercado_pago.sql`.
> 3. **Trilho de cobrança:** Cobrança pós-paga mensal baseada no volume de fichas ativas apuradas no ciclo (`billing_apurar_ciclo`, `0075`).
>
> Contexto completo em `BACKLOG.md` e `docs/GO_LIVE.md`.

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Na Fase 7, o Iris necessita de um sistema de cobrança recorrente automatizado para faturamento mensal por ficha ativa.

### 1.2 A Solução

Integração com o gateway **Asaas** via **Pix Automático** (`immediateQrCode` com autorização de R$ 0,01) como trilho homologado em produção, com cobrança variável mensal pós-paga calculada por ficha ativa.

---

## 2. Especificação Técnica & Arquitetura de Pagamentos

### 2.1 Fluxo Pix Automático

1. **Autorização de R$ 0,01:** Solicitação de autorização via Pix Automático com QR Code imediato de ativação de R$ 0,01.
2. **Janela de Apuração:** Apuração realizada no encerramento do ciclo de 30 dias (`billing_apurar_ciclo`).
3. **Webhooks (`/api/hooks/asaas`):** Recepção dos eventos `PIX_AUTOMATIC_RECURRING_*` protegidos por token de cabeçalho (`ASAAS_WEBHOOK_TOKEN`).

### 2.2 Apuração de Fichas Ativas

> ⚠️ **Critério Vigente:** A apuração (`0075`) conta a **ficha ativa** — paciente criado no ciclo **ou** com interação no ciclo (`session`, `session_note`, `evidence`), dentro da janela semiaberta `[início, fim)`. Consequência aceita: clínica em recesso paga R$ 0. Ver `BACKLOG.md`, Decisões 8 e 9.

---

## 3. Estado Atual de Implementação (11/08/2026)

- [x] **Recepção de Webhook & Banco (`0066`):** Endpoint `POST /api/hooks/asaas` com verificação `timingSafeEqual` de token e dedup atômica via `UNIQUE` em `asaas_webhook_event(asaas_event_id)` (PR #177).
- [x] **Validação no Sandbox Real Asaas:** Teste ponta a ponta exercitado contra o ambiente de Sandbox com evento real de autorização (`PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED`).
- [x] **Tabela `subscription` & Gate de Pagamento:** `subscription` ativa sob Asaas, com enum atualizado (migração `0090`/`0091`).
- [x] **Motor de Apuração:** `billing_apurar_ciclo` (`SECURITY DEFINER`, `0075`) conta fichas ativas; o preço sai de `src/lib/billing/calculator.ts`, em centavos inteiros. SQL nunca calcula preço.
- [x] **`AsaasProvider`:** `src/lib/billing/provider/asaas.ts` implementa a porta `BillingProvider`.
- [x] **Webhook com Reconciliação Atômica:** concilia o ciclo (`conciliarPagamentoDeCiclo`) e o vínculo (`aplicarStatusProvider`), com `aplicado_em`/`erro_aplicacao` (migração `0086`) e recuperação por `reprocessarEventosPendentes`.
- [x] **Provisionamento de Produção (11/08/2026):** Webhook cadastrado e token ativo em produção.
- [x] **Virada de Chave (11/08/2026, PR #244):** Asaas ativado como provedor exclusivo em produção.

---

## 4. O que o Pix Automático impõe e o desenho não pode esconder

1. **A ativação cobra de verdade.** A autorização só vai a `ACTIVE` depois que o
   QR Code imediato é liquidado — não existe autorização de graça. O adapter usa
   o menor débito possível (R$ 0,01) como padrão e aceita
   `NovoVinculo.tetoCentavos` como valor de ativação. **Decisão de produto em
   aberto:** cobrar algo simbólico e explicado, ou absorver.
2. **`CONFIRMED` não é liquidação final.** Em Pix de pessoa física o Asaas pode
   segurar até 72h e depois virar `RECEIVED` **ou `REFUNDED`**. O adapter trata
   `CONFIRMED` como paga (o estorno tem caminho próprio) — o erro escolhido é o
   reversível.
3. **Não há idempotência na criação de cobrança.** O Asaas não tem
   `Idempotency-Key` e a doc avisa que a API aceita duplicatas. A barreira é
   procurar por `externalReference` (`cycle:<id>`) antes de emitir; falha na
   busca **aborta** a emissão, porque "não consegui verificar" não pode virar
   "não existe".
4. **O corpo do webhook não é autenticado.** A entrega usa token fixo no header,
   não HMAC — por isso o efeito vem sempre de uma consulta ao gateway pelo id,
   nunca do estado que veio no evento.
5. **A fila para depois de 15 falhas consecutivas** e evento não entregue some
   em 14 dias. É o que torna proibido devolver 5xx por falha de aplicação.
