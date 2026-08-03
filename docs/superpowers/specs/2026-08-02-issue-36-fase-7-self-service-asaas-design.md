# Design Spec — Issue #36: Fase 7 - Integração de Billing com Asaas (Pix Automático & Paciente Ativo)

> **Status:** 🔴 **PREMISSA CENTRAL SUPERADA EM 03/08/2026 — não implementar o §2.1 a partir daqui**
>
> Duas premissas caíram no mesmo dia:
>
> 1. **Pix Automático indisponível por até 6 meses.** Todo o §2.1 (jornada 3,
>    autorização sem `value`, janela de 2–10 dias úteis) fica suspenso. Note que
>    a janela de apuração era exigência *do Pix Automático* — sem ele, a amarra
>    some e o desenho fica mais simples, não mais complexo.
> 2. **Conta Asaas de produção bloqueada, ainda não aprovada.** Pré-requisito de
>    tudo o mais.
>
> **Trilho novo travado em 03/08: cobrança avulsa mensal.** A apuração cria uma
> cobrança por mês via `POST /v3/payments` já com o valor apurado (medido no
> sandbox: valor variável é nativo, nada a corrigir depois). Escolhido por modo
> de falha — job morto = ninguém cobrado (aberta), em vez de cliente cobrado com
> o valor do mês anterior (fechada).
>
> **O que continua valendo:** §2.2 (definição de paciente ativo) e o webhook — o
> endpoint grava qualquer evento, então a virada de `PIX_AUTOMATIC_*` para
> `PAYMENT_*` é de configuração, não de código.
>
> Medições e contexto completo em `BACKLOG.md`, sessão 03/08/2026 (2ª).

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
Count de pacientes vinculados à clínica onde `arquivado_em IS NULL AND deletado_em IS NULL` (desenvolvido na Issue #174).

---

## 3. Estado Atual de Implementação (03/08/2026)

- [x] **Recepção de Webhook & Banco (`0066`):** Endpoint `POST /api/hooks/asaas` com verificação `timingSafeEqual` de token e dedup atômica via `UNIQUE` em `asaas_webhook_event(asaas_event_id)` (PR #177).
- [x] **Validação no Sandbox Real Asaas:** Teste ponta a ponta exercitado contra o ambiente de Sandbox com evento real de autorização (`PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED`), comprovando que a API Asaas aceita a criação de autorizações sem `value` na raiz (`value: null`). Payload salvo em `docs/evidencias/2026-08-03-asaas-sandbox-evento-real.json`.
- [ ] **Tabela `subscription` & Gate de Pagamento:** Modelagem do estado de assinatura da clínica para diferenciar "vencido" de "assinante".
- [ ] **Motor de Apuração:** Cálculo do valor por paciente ativo (`arquivado_em IS NULL`) na janela de faturamento.
- [ ] **Provisionamento de Produção:** Cadastro do webhook e token `ASAAS_WEBHOOK_TOKEN` de produção no Easypanel.
