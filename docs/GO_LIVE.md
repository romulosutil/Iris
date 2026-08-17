# 🚀 IRIS — Manual Canônico de Go-Live & Prontidão Operacional

> **Documento Mestre de Lançamento (Go-Live Playbook)**  
> **Papel:** Product Manager & Technical Lead  
> **Status:** Ativo / Em Execução  
> **Última Atualização:** 17/08/2026

---

## 🎯 1. Visão Geral do Produto & Estratégia de Go-Live

O **Iris** é um SaaS especializado para clínicas de terapia infantil (intervenção comportamental para TEA / ABA) estruturado sobre a **Governança Clínica em 3 Camadas**:

1. **IA Sugere:** Derivação estruturada a partir do diário de sessão em linguagem natural (rastreabilidade frase-a-frase).
2. **Terapeuta Aprova:** Revisão humana obrigatória na interface (_Human-in-the-Loop_).
3. **Coordenadora Valida por Exceção:** Reclassificação auditada e versionada.

O objetivo do Go-Live é realizar a transição do ambiente de homologação/piloto para a operação de produção de forma segura, auditável e resiliente, garantindo zero vazamento de dados (LGPD para Menores), isolamento multi-tenant estrito (RLS) e faturamento automatizado via Pix Automático (Bacen Jornada 3).

---

## 🛠️ 2. Antes do Go-Live (Pré-Requisitos, Hardening & Checklist)

### 2.1 Limpeza de Banco & Sanitização de Dados Piloto

- [ ] Executar script de limpeza/truncamento de dados de teste (preservando tabelas de catálogo, CID-11, marcos e estruturas).
- [ ] Resetar sequências de IDs e verificar integridade de foreign keys.
- [ ] Confirmar que nenhum dado sensível de pacientes de teste permanece em logs ou banco.

### 2.2 Auditoria de Segurança, RLS e Permissões de Banco

- [ ] **Auditoria de Permissões RLS:**
  - Confirmar no `psql` de produção os grants de `app_role` na tabela `tcc_rpd_entry` (Issue [#343](https://github.com/romulosutil/Iris/issues/343)).
  - Validar que 100% das policies de tenant utilizam `app_clinic_id_exigido()`. Nunca utilizar cast direto de `current_setting('app.clinic_id')`.
- [ ] **Variáveis de Ambiente Críticas em Produção:**
  - `DATABASE_URL` (Role `iris_app` sob RLS)
  - `AUTH_DATABASE_URL` (Role `iris_auth`)
  - `MIGRATION_DATABASE_URL` (Role `iris_admin`)
  - `ASAAS_BASE_URL` & `BILLING_PROVIDER_API_KEY` (Chave real de produção Asaas)
  - `ASAAS_WEBHOOK_TOKEN` (Validação de assinatura de webhooks)
  - `LLM_API_KEY` (Chave corporativa com DPA assinado para conformidade médica)
  - `BETTER_AUTH_SECRET` & `BETTER_AUTH_URL`

### 2.3 Provisionamento & Observabilidade de Jobs de Infraestrutura

- [ ] **Job de Fechamento de Ciclo / Billing (`iris-billing`):** Serviço provisionado no Easypanel com cron noturno às 03h UTC.
- [ ] **Job de Auto-Arquivamento (`iris-arquivamento`):** Provisionar serviço no Easypanel (Issue [#293](https://github.com/romulosutil/Iris/issues/293)).
- [ ] **Job de Escalonamento (`iris-escalonamento`):** Confirmar execução e healthcheck.
- [ ] **Alarmes de Infraestrutura:** Configurar notificação para falhas de jobs (Issue [#294](https://github.com/romulosutil/Iris/issues/294)).

### 2.4 Ensaio com Clínica de Teste em Produção

- [ ] Criar 1 clínica de teste em produção com valor real mínimo.
- [ ] Validar o vínculo de Pix Automático (`immediateQrCode`).
- [ ] Observar o payload real do webhook (`purpose`, `retryAttempt`, `refusalReason`).
- [ ] Exercitar o script de backfill da migração `0098` (`carencia_dias = 10`) em base com dados reais de `subscription`.

---

## ⚡ 3. Durante o Go-Live (Cutover & Smoke Test)

### 3.1 Roteiro de Virada (Cutover)

1. **Freeze de Código:** Tag de release na branch `main` (ex.: `v1.0.0-gold`).
2. **Executar Migrações Pendentes:** Rodar `pnpm db:migrate` via container `iris-migrate`.
3. **Deploy dos Serviços:** Re-deploy dos containers no Easypanel (`iris-app`, `api`, `clinic`, etc.).

### 3.2 Smoke Test Guiado (15 Minutos)

1. **Super Admin (/benjamin):**
   - Login com credencial mestre $\rightarrow$ Acessar `/benjamin` $\rightarrow$ Verificar carregamento correto sem erros 500.
2. **Primeira Clínica Real (Fluxo Completo de Onboarding & Billing):**
   - Cadastro inicial em `/cadastro` $\rightarrow$ Validação de e-mail e criação de clínica.
   - Configuração de 2FA para terapeuta.
   - Vinculação do Pix Automático na `/assinatura` (autorização inicial).
   - Cadastro de 1 paciente piloto $\rightarrow$ Registro de 1 sessão $\rightarrow$ Sugestão de evidência clínica pela IA $\rightarrow$ Aprovação humana pela terapeuta.

---

## 📈 4. Depois do Go-Live (Pós-Lançamento, Operação & Métricas)

### 4.1 Monitoramento de Primeiras 72 Horas

- **Erros de Aplicação:** Acompanhamento em tempo real no GlitchTip.
- **Saúde dos Jobs Noturnos:** Inspecionar os logs de `fechamento-ciclo-billing.mjs` toda manhã às 07h para garantir `exit code 0` e ausência de `carenciaAbortada`.
- **Conciliação de Webhooks:** Verificar se há eventos com `processado = false` ou recusas desconhecidas em `asaas_webhook_event`.

### 4.2 Indicadores Chave de Sucesso (KPIs de Produto)

| Indicador                         | Meta Ideal (30 dias)                                  | Monitoramento         |
| :-------------------------------- | :---------------------------------------------------- | :-------------------- |
| **Conversão de Ativação**         | > 85% das clínicas cadastradas concluem o vínculo Pix | Dashboard `/benjamin` |
| **Acurácia da IA Clínica**        | > 75% das sugestões aprovadas sem edição manual       | Métricas de Sessão    |
| **Inadimplência Real**            | < 5% das faturas entrando em carência                 | Job de Billing        |
| **Tempo de Fechamento de Diário** | < 3 minutos por sessão de terapia                     | Telemetria UI         |

---

## 📋 5. Lista de Issues Abertas no GitHub

| Issue                                                  | Título                                                        | Categoria               | Ação Recomendada                                              |
| :----------------------------------------------------- | :------------------------------------------------------------ | :---------------------- | :------------------------------------------------------------ |
| [#287](https://github.com/romulosutil/Iris/issues/287) | Cancelamento pelo app do banco: ciclo aberto órfão            | Billing / Cancelamento  | **Fechar imediatamente** (superada por #290, #310, #312).     |
| [#290](https://github.com/romulosutil/Iris/issues/290) | Cliente que cancela vira devedor: débito pro-rata             | Billing / Pro-rata      | **Fechar imediatamente** (entregue nos PRs #339, #340, #334). |
| [#343](https://github.com/romulosutil/Iris/issues/343) | Verificar em produção grants UPDATE/DELETE em `tcc_rpd_entry` | Banco / RLS             | Rodar query de checagem no `psql` de produção no Go-Live.     |
| [#293](https://github.com/romulosutil/Iris/issues/293) | Job de auto-arquivamento não provisionado no Easypanel        | Infra / Jobs            | Provisionar container no Easypanel antes do Go-Live.          |
| [#294](https://github.com/romulosutil/Iris/issues/294) | Nenhum job de infra tem alarme automático de parada           | Infra / Observabilidade | Implementar webhook de alerta para falhas de cron.            |
| [#330](https://github.com/romulosutil/Iris/issues/330) | Três N+1 restantes em `materializar.ts` (D40)                 | Performance / Snapshot  | Executar em lote com `= ANY($ids)`.                           |
| [#327](https://github.com/romulosutil/Iris/issues/327) | Chave e limites do throttle em redefinir-senha                | Testes / Segurança      | Delegar para o Jules (cobertura de rate-limit).               |
| [#328](https://github.com/romulosutil/Iris/issues/328) | Config.matcher tem cobertura comportamental zero              | Testes / Proxy          | Delegar para o Jules (teste de regex matcher).                |
| [#331](https://github.com/romulosutil/Iris/issues/331) | Contrato do modo Terapia Convencional diverge da spec         | IA / Agente             | Alinhar schema de entrada com a spec clínica.                 |
| [#332](https://github.com/romulosutil/Iris/issues/332) | Suíte de acessibilidade flaky sob carga paralela              | Testes / A11y           | Ajustar timeout / isolamento do teste.                        |
| [#341](https://github.com/romulosutil/Iris/issues/341) | Runner do Storybook em instalação limpa (Windows)             | Tooling / Front         | Ajustar script de coleta de stories no Windows.               |
| [#258](https://github.com/romulosutil/Iris/issues/258) | [D9] Customização White-Label nos PDFs exportados             | Produto / Pós-MVP       | Aguardando spec detalhada de produto.                         |
| [#259](https://github.com/romulosutil/Iris/issues/259) | [D10] Assinatura Digital ICP-Brasil A1/A3 nos laudos          | Produto / Pós-MVP       | Aguardando spec de certificados digitais.                     |
| [#260](https://github.com/romulosutil/Iris/issues/260) | [D11] Estratégia de Ativo de Dados & Indexação RAG            | Produto / Pós-MVP       | Aguardando spec de pipeline de embeddings.                    |
| [#36](https://github.com/romulosutil/Iris/issues/36)   | Fase 7 — Self-Service & Growth (Épico Mestre)                 | Roadmap / Billing       | Fechar após conclusão dos testes de UI (D36).                 |
| [#72](https://github.com/romulosutil/Iris/issues/72)   | Fase 6b — Ditado de Voz (Áudio + ASR)                         | Roadmap / IA            | Gated por DPA assinado de fornecedor ASR.                     |
| [#89](https://github.com/romulosutil/Iris/issues/89)   | Retenção de backup (30d) vs. expurgo LGPD                     | Compliance / LGPD       | Alinhar política de expurgo físico de backups.                |
| [#119](https://github.com/romulosutil/Iris/issues/119) | Sigilo da Psicologia no prontuário multidisciplinar           | Compliance / Clínica    | Refinar níveis de permissão por especialidade.                |
| [#185](https://github.com/romulosutil/Iris/issues/185) | Polimento Mobile, PWA e empacotamento TWA                     | Mobile / UX             | Otimização para tablets e smartphones de terapeutas.          |
| [#277](https://github.com/romulosutil/Iris/issues/277) | Painel de governança e segurança da clínica                   | Produto / Admin         | Central de logs e gestão de consentimentos LGPD.              |
| [#283](https://github.com/romulosutil/Iris/issues/283) | Layout mobile da visão Matriz na agenda                       | Front / Agenda          | Ajustar grid responsivo para telas < 375px.                   |

---

## 🤖 6. Sugestões de Execução pelo Agente Jules

> ⚠️ **Atenção Mandatória (§5.2 do AGENTS.md):**  
> Antes de acionar o Jules para qualquer uma das tarefas abaixo, é **obrigatório fornecer as informações detalhadas, limites de parada e regras de negócio fechadas** na issue/prompt correspondente. Nunca disparar o Jules sem critérios de aceite 100% explícitos.

### A. Performance & Otimização de Queries (Eliminação de N+1)

1. `N+1 query querying extraction context domains` — Carregamento em lote de domínios de extração.
2. `N+1 query retrieving protocol milestones` — Busca em lote de marcos de protocolos clínicos.
3. `N+1 query fetching milestone structure types` — Resolução de tipos estruturais de marcos via `ANY($ids)`.
4. `N+1 query fetching milestone taxonomy` — Consulta em lote de taxonomia de marcos.
5. `N+1 query mapping goal milestone references` — Mapeamento de referências de metas e marcos em uma só query.
6. `N+1 query fetching domain criteria for goals` — Carregamento consolidado de critérios de domínio para metas.
7. `N+1 query fetching patient valid targets` — Busca em lote de alvos terapêuticos válidos por paciente.
8. `N+1 query fetching patient valid targets (duvidas page)` — Otimização de consulta de alvos na tela de dúvidas clínicas.
9. `N+1 query sequentially applying advisory locks` — Aquisição combinada de locks de banco.
10. `N+1 sequential lock acquisitions for disciplines` — Lote de aquisição de locks por disciplina terapêutica.

### B. Segurança & Compliance

11. `Potential SQL Injection in Notificacao` — Validação estrita de parâmetros tipados em queries de notificação.
12. `Potential SQL Injection in Alertas Risco Queries` — Uso exclusivo de `sql.param` e tags template Drizzle/Postgres.js.
13. `Hardening contra prompt injection em conteúdo gerado pelo usuário` — Sanitização de entradas livres antes do prompt da LLM.
14. `TODO: Hardening against prompt injection` — Implementação de delimitadores de contexto para diários clínicos.
15. `Missing edge case tests for gerarCpfHash` — Testes de não-colisão e hashing seguro de CPF (LGPD).

### C. Testes Unitários e Cobertura de Código

16. `Untested formatarBRL function` — Testes de formatação monetária (casos de borda: zero, negativos, centavos).
17. `Uncovered error paths in try/catch block for provisioning` — Simulação de falhas no provisionamento de clínicas.
18. `Uncovered error path in checkInAction` — Teste de falha de rede/banco no check-in de sessão.
19. `Uncovered error path in marcarEstadoAction` — Testes de transição de estado clínico com erro.
20. `Missing test file for cn utility function` — Testes de mesclagem de classes Tailwind/clsx.
21. `Missing test file for disciplinas utility function` — Testes da lista canônica de disciplinas terapêuticas.
22. `Untested constraintPg function` — Teste de mapeamento de violação de constraints do Postgres.
23. `Untested buildJulesFixPrompt function` — Teste unitário para construção de prompts do Jules.
24. `Missing test file for app-url utility` — Validação de parsing e resolução de URLs canônicas da aplicação.
25. `Untested getProviderPorId function` — Cobertura de fallback para provedor desconhecido.
26. `Untested rotuloAlvo function` — Teste de renderização de rótulos de alvos terapêuticos.
27. `Untested resolverIp function` — Teste de resolução de IP a partir de headers de proxy (`x-forwarded-for`).
28. `Missing test coverage for surface function` — Testes unitários para utilitário de tokens de superfície.
29. `Missing test coverage for control function` — Testes unitários para utilitário de controles de formulário.
30. `Untested registerWebMCPTools function` — Teste de registro de ferramentas MCP para web.
31. `Missing edge case tests for apurarDebitoProRata` — Testes com fração de dias, arredondamento e ciclo de 1 dia.
32. `Missing test file for validacao alvos logic` — Testes da lógica de validação de metas e alvos.
33. `Missing test file for app_user provisioning logic` — Testes de criação e associação de usuários sob RLS.
34. `Explicit TODO in forjavel guard context test` — Fechamento de TODO no guard de contexto forjável.

### D. Qualidade de Código & Tipagem TypeScript

35. `Extraneous console.warn calls in Button component` — Remoção de logs desnecessários em componentes de UI.
36. `Use of 'any' in error parsing in logic.ts` — Substituição de `any` por tipos discriminados `unknown`/`Error`.
37. `Use of 'any' in catch block` — Tipagem segura em blocos de captura de exceção.
38. `Unsafe 'any' casting in array filter` — Tipagem estrita em predicados de filtro de array.
39. `Unnecessary eslint-disable comment for next/script` — Limpeza de comentários de supressão de linter.
40. `Any type usage for transaction context` — Tipagem explícita do contexto de transação do Drizzle (`PgTransaction`).

### E. Regras Clínicas e Negócio (Exigem Spec Fechada)

41. `4B milestone candidacy: Definir critério por Milestone/família` — Definição do algoritmo de candidatura de marcos.
42. `Fase 4: Consolidar sessão antes da aprovação` — Regra de consolidação de dados de sessão antes do aceite.
43. `TODO: Session consolidation mismatch handling` — Tratamento de divergências na consolidação da sessão.
44. `Unimplemented explicit TODO for milestone_candidacy` — Fechamento do pipeline de candidatura de marcos clínicos.

---

## 🎯 7. Problemas e Frentes Prontas para Resolver

1. **Frente 1 — Interface de Recusa de Faturamento (D36):**
   - _Objetivo:_ Evitar cancelamento surpresa de clínicas.
   - _Ação:_ Atualizar [`faixa-trial.tsx`](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/components/app/faixa-trial.tsx) para ler `recusa_codigo` e exibir alerta claro de carência e orientações de ajuste de limite no banco.
2. **Frente 2 — Auditoria e Resiliência do Corte (D34 + D39):**
   - _Objetivo:_ Garantir observabilidade total nas revogações e impedir corte indevido por erro interno.
   - _Ação:_ Gravar evento no `audit_log` ao cancelar assinatura por inadimplência, fazer o script noturno falhar com `exit 1` em caso de erro em lote, e persistir o código do G6 para o backstop de D+7 ignorar falhas internas nossas.
3. **Frente 3 — Ensaio de Validação em Produção (Sandbox Limitado):**
   - _Objetivo:_ Medir os retornos reais do gateway Asaas no trilho de Pix Automático.
   - _Ação:_ Executar ciclo de teste com clínica real em produção e validar payloads reais de webhook.

---

## 🧭 8. Quadro Geral de Decisões do Projeto

| #     | Item / Tema                                           | Decisão Fechada pelo Rômulo                   | Impacto Arquitetural                                                                                                                                   |
| :---- | :---------------------------------------------------- | :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Cobrança Deletada no Painel Asaas (D41)**           | **Manter Bloqueio Seguro**                    | Se uma cobrança for apagada no painel do gateway, o app bloqueia com _"fale com o suporte"_ para evitar ressuscitar cobranças mortas.                  |
| **2** | **Reativação de Conta (#310)**                        | **Pagamento Único (Ativação = Débito Total)** | Ao reativar (inclusive pós-corte por carência), a ativação do Pix Automático assume o valor do débito total consolidado em um único pagamento.         |
| **3** | **Auditoria de Corte por Inadimplência (D34)**        | **Aprovado (`audit_log` + `exit 1`)**         | Cancelamento por carência emite evento formal em `audit_log` e job noturno falha com `exit 1` sob falhas de corte.                                     |
| **4** | **Tratamento de Erros Internos no Backstop (D39)**    | **Persistir Código G6**                       | Gravar o código cru de recusas G6 para que o backstop de D+7 reconheça defeito interno do sistema e não penalize a clínica.                            |
| **5** | **Escopo da UI de Faturamento (D36)**                 | **Opção B (Separar)**                         | D36 focará na faixa de alerta urgente de recusa na UI; tela detalhada de histórico de retentativas vira issue separada.                                |
| **6** | **Discriminador de Notificações (#289)**              | **Aprovado (Por Presença de Instrução)**      | Discriminar mensalidade vs. ativação inicial de R$ 0,01 pela presença do objeto `paymentInstruction`.                                                  |
| **7** | **Erros Transitórios na Retentativa Extradia (#322)** | **Mantenha (Excluir G7)**                     | Erros operacionais/transitórios (G7) continuam tratados apenas na retentativa intradia, reservando as 3 tentativas extradias para falta de saldo (G2). |

---

## 🧾 9. Censo de Débitos Técnicos Abertos (14 Débitos)

```
D9  ── White-Label em PDFs exportados (#120) [Sem spec / Backlog]
D10 ── Assinatura Digital ICP-Brasil A1/A3 (#120) [Sem spec / Backlog]
D11 ── RAG Clínico & Indexação de Prontuários (#120) [Sem spec / Backlog]
D31 ── Ausência de tela dedicada "Dados da Clínica" (#36) [Backlog]
D34 ── Corte por inadimplência sem audit_log e job exit 0 [Decisão Fechada: Implementar]
D36 ── Clínica não vê recusa de cobrança na UI [Decisão Fechada: Implementar Faixa]
D39 ── Resíduo do G6 no backstop D+7 [Decisão Fechada: Persistir Código G6]
D40 ── 3 queries N+1 em materializarSnapshot (#316 / #330) [Aberto / Otimização]
D41 ── Cobrança apagada no painel Asaas tranca reativação [Decisão Fechada: Manter]
D42 ── Piso de R$ 5,00 bloqueia consulta de cobrança viva pequena [Aberto / Monitoramento]
D43 ── Cobrança de ativação do Pix Automático não medida em produção [Gated por Ensaio]
D44 ── Alinhamento de ciclo Iris vs. recorrência Asaas não medido [Gated por Ensaio]
D45 ── Contador de 3 retentativas Asaas (por instrução vs. cobrança) [Gated por Ensaio]
D46 ── Campos purpose e retryAttempt não observados em payload real [Gated por Ensaio]
```
