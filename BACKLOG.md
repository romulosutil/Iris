# Backlog — Iris

> 🗺️ **Roadmap & Controle de Fases:** O detalhamento granular das tarefas e o acompanhamento de progresso ativo do projeto foram migrados para o **GitHub Issues & Milestones** para máxima economia de tokens de contexto das IAs.
>
> 📂 **Histórico Completo:** O histórico estático detalhado de especificações e reuniões concluídas foi arquivado e preservado em [`docs/archive/historico-backlog.md`](docs/archive/historico-backlog.md) (ignorado para os agentes de IA, mas disponível no Git).

---

## 🚀 Painel de Fases (Roadmap MVP)

| Fase | Tópico Principal | Status | GitHub Milestone / Issue |
| :--- | :--- | :---: | :--- |
| **0.5** | Design System (Espectro Brutal) | 🔄 Em Revisão | PR #1 |
| **1** | Fundação de Dados & Auth (Fase 1a) | 🔄 Em Revisão | PR #3 |
| **1b** | Fundação Auth + Multi-tenancy | 🔄 Em Revisão | PR #10 |
| **1c** | Cadastro Clínico (ficha + protocolos + equipe) | 📅 Pendente | Issue #4 |
| **1d** | Agenda Mínima + Check-in | 📅 Pendente | Issue #11 |
| **2** | Metas & Diário por Texto | 📅 Pendente | Issue #5 |
| **3** | Extração de Evidências (IA) | 📅 Pendente | Issue #6 |
| **4** | Evidências Acumuladas & Gráficos | 📅 Pendente | Issue #7 |
| **5** | Relatórios de Convênio & Supervisão | 📅 Pendente | Issue #8 |
| **6** | Ditado de Voz & Hardening LGPD | 📅 Pendente | Issue #9 |

---

## 🎯 Entregas Ativas (Fase 1 — sub-blocos)

### [Fase 1b] Fundação Auth + Multi-tenancy — ✅ entregue (PR #10)
Base de acesso e isolamento multi-tenant concluída (13 tasks, branch `fase-1b-fundacao-auth-tenant`):
* **Duas conexões / roles**: `iris_app` (app, sujeita a RLS) + `iris_auth` (bootstrap de sessão, `NOBYPASSRLS` — vê `user_role`/`clinic` pré-GUC mas **não** bypassa policies clínicas). Resolve o item aberto de RLS global das 4 rodadas do Jules (agora **FECHADO**).
* **RLS das tabelas globais**: `auth_*` com `REVOKE`; `app_user`/`clinic`/`user_role` com policies escopadas `TO iris_auth`; teste de não-recursão incluído.
* **Sessão → TenantContext (A1)**: `resolveTenant`/`getTenantContext`. **O cookie de clínica/papel é apenas SELEÇÃO** — pertencimento e papel são re-derivados de `user_role` a cada request; o cookie nunca autoriza (não assinado).
* **Papel ativo determinístico (A2)**: `papelAtivo` (coordenador vence; papel único usa; combo disjunto → seleção).
* **Provisionamento (A6)**: `provisionUser` upsert por email; seed de clínica + 1º coordenador.
* **UI**: componentes DS `Input`/`Field`/`Form`; login (Better-Auth); seleção de clínica/papel; shell protegido `(app)` + switcher. Home institucional da Fase 0.5 movida para `/sobre`.
* **Testes**: RLS globais, `resolveTenant` (A1), `provisionUser` (A6), `papelAtivo` (unit), gate a11y (axe), E2E de login (Playwright — requer DB+seed para rodar).

**Fica para depois (não regressão, escopo deliberado):**
* **Convite de usuário (UI) + cadastro de paciente → Fase 1c (Issue #4).**
* **Agenda + check-in (tabela `session`) → Fase 1d (Issue #11).**

---

## 📋 Backlog de Fases Futuras (Foco das Issues GitHub)

### [Fase 2] Metas e Diário Clínico (Issue #5)
* Ciclo de vida de metas e critérios de domínio ( Denver, VB-MAPP, PROC etc. combinados).
* Tela de diário em texto livre (terapeuta) e fila de pendências de diários não estruturados.

### [Fase 3] Agente de Extração IA (Issue #6)
* Pipeline de extração (regras R1-R19, schema de saída).
* Tela de revisão e validação pelo terapeuta (aprovar, editar, rejeitar extrações).

### [Fase 4] Acúmulo de Evidências e Linha do Tempo (Issue #7)
* Linha do tempo estruturada do paciente com scrubber temporal.
* Gráfico de progresso de marcos do protocolo com comparador de 2 pontos.

### [Fase 5] Coordenador e Relatórios (Issue #8)
* Fila de reclassificação/validação com justificativa para o coordenador.
* Exportação de Relatório de Família (pt-BR calibrado) e Dossiê de Auditoria de Convênio factual.
* Relatório narrativo de convênio gerado por IA com revisão humana.

### [Fase 6] Hardening e Ditado de Voz (Issue #9)
* Integração de ASR (ditado por voz) com preservação do áudio original local.
* Hardening final de segurança LGPD (MFA, testes RLS exaustivos, auditoria de exports).

---

## ⚙️ Ações Pendentes (DevOps / Negócio)

* **DevOps (LGPD/Infra)**:
  - [ ] Configurar cron de backup automático (`pg_dump`) no Easypanel para armazenamento nacional e testar restore.
  - [ ] Assinar os DPAs (Data Processing Agreement) da Hostinger e Anthropic/Google.
  - [ ] Configurar os apontamentos DNS (Registro A) do domínio principal (`irisclinica.ia.br`) no Registro.br.
* **Negócio / Produto**:
  - [ ] Confirmar com a contadora a inserção do CNAE secundário de desenvolvimento/licenciamento de SaaS na ME.
  - [ ] Testar trial/demo dos concorrentes direto (logado).
  - [ ] Fechar precificação final do "paciente ativo" após rodadas do piloto.
