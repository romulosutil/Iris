# Design Spec — Issue #36: Fase 7 - Integração de Billing com Asaas (Pix Automático & Paciente Ativo)

> **Status:** 🟢 **PREMISSAS RESOLVIDAS EM 08/08/2026 — Conta Asaas Aprovada/Liberada**
>
> As restrições que bloquearam a premissa central foram superadas:
>
> 1. **Conta Asaas de produção liberada:** A conta foi aprovada e está ativa em produção.
> 2. **Opções Variadas de Pagamento:** O sistema utilizará tanto o Asaas quanto o Mercado Pago como gateways ativos, permitindo opções de cobrança variadas para as clínicas.
> 3. **Trilho de cobrança:** Mantido o desenho de cobrança avulsa mensal pós-paga por ciclo de apuração (cobrança baseada no volume de pacientes ativos calculados no fechamento).
>
> Contexto completo em `BACKLOG.md`, sessões de 03/08/2026 e 08/08/2026.

> **Status anterior:** 🚧 Em Construção (Fatia 1 Webhook ✅ · Sandbox Real ✅ · Subscription/Apuração Pendentes)  
> **Data:** 02/08/2026 (Atualizado em 03/08/2026)  
> **Autor:** Tech Lead & Rômulo Sutil  
> **Issue GitHub:** [#36](https://github.com/romulosutil/Iris/issues/36)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Na Fase 7, o Iris necessita de um sistema de cobrança recorrente automatizado para faturamento mensal por paciente ativo.

### 1.2 A Solução

Integração com o gateway **Asaas** via **Pix Automático (Jornada 3)** como trilho primário (sem limitação de valor fixo, aceitando cobrança variável apurada por paciente) e cartão de crédito como fallback.

---

## 2. Especificação Técnica & Arquitetura de Pagamentos

### 2.1 Fluxo Pix Automático Jornada 3

1. **Autorização sem Valor Fixo:** Solicitação de autorização sem o campo `value` preenchido no Asaas, permitindo cobrança variável mensal com base na quantidade de pacientes ativos apurados no ciclo.
2. **Janela de Apuração:** Apuração realizada entre 2 e 10 dias úteis antes do vencimento da fatura.
3. **Webhooks (`/api/hooks/asaas`):** Recepção dos eventos `PIX_AUTOMATIC_RECURRING_*` protegidos por token de cabeçalho (`ASAAS_WEBHOOK_TOKEN`).

### 2.2 Apuração de Pacientes Ativos

> ⚠️ **Superado.** Esta seção descrevia o critério "não arquivado", que a
> DECISÃO 8 (04/08/2026) **removeu de propósito**. O critério vivo é o de
> `billing_apurar_ciclo` (`0075`): conta a **ficha ativa** — paciente criado no
> ciclo **ou** com interação no ciclo (`session`, `session_note`, `evidence`),
> dentro da janela semiaberta `[início, fim)`. Consequência aceita: clínica em
> recesso paga R$ 0. Ver `BACKLOG.md`, D15.

---

## 3. Estado Atual de Implementação (atualizado em 08/08/2026)

- [x] **Recepção de Webhook & Banco (`0066`):** Endpoint `POST /api/hooks/asaas` com verificação `timingSafeEqual` de token e dedup atômica via `UNIQUE` em `asaas_webhook_event(asaas_event_id)` (PR #177).
- [x] **Validação no Sandbox Real Asaas:** Teste ponta a ponta exercitado contra o ambiente de Sandbox com evento real de autorização (`PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED`), comprovando que a API Asaas aceita a criação de autorizações sem `value` na raiz (`value: null`). Payload salvo em `docs/evidencias/2026-08-03-asaas-sandbox-evento-real.json`.
- [x] **Tabela `subscription` & Gate de Pagamento:** entregue no trilho Mercado Pago (`0071`/`0075`), agnóstica de gateway — `subscription.provider` é persistido por linha.
- [x] **Motor de Apuração:** `billing_apurar_ciclo` (`SECURITY DEFINER`, `0075`) conta fichas ativas; o preço sai de `src/lib/billing/calculator.ts`, em centavos inteiros. SQL nunca calcula preço.
- [x] **`AsaasProvider` (08/08/2026):** `src/lib/billing/provider/asaas.ts` implementa os sete métodos da porta. Vínculo = `POST /pix/automatic/authorizations` **sem `value`** (Jornada 3, `paymentCreationMode: MANUAL`); cobrança do ciclo = `POST /payments` com `pixAutomaticAuthorizationId`. `BILLING_PROVIDER=asaas` deixou de lançar.
- [x] **Webhook aplica efeito (08/08/2026):** a rota deixou de ser só registro — concilia o ciclo (`conciliarPagamentoDeCiclo`) e o vínculo (`aplicarStatusProvider`), com `aplicado_em`/`erro_aplicacao` (migração `0086`) e recuperação por `reprocessarEventosPendentes`.
- [ ] **Provisionamento de Produção:** cadastro do webhook de produção no painel do Asaas e das envs (`BILLING_PROVIDER_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`) no Easypanel.
- [ ] **Virada de chave:** `BILLING_PROVIDER` continua `mercado_pago`. Trocar é decisão de produto, não consequência deste PR.

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
