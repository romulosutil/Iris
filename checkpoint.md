# Checkpoint — Iris

> **Data:** 11/08/2026  
> **Branch:** `feat/d7-desarquivamento-clinico` (PR #247 aberta)  
> **Status:** 🟢 Todas as tarefas e débitos da sessão concluídos e testados.

---

## 1. Resumo da Sessão (11/08/2026)

### Débitos Fechados

- **D5 (Webhook Asaas em Produção):** Webhook de produção cadastrado na conta Asaas de produção. Token `ASAAS_WEBHOOK_TOKEN` (`dQx2A1mhoaidY2…`) verificado ativo pelo Rômulo em 11/08.
- **D7 (#174 — Desarquivamento Clinico Unificado):** Helper central `desarquivarPacienteSeArquivado` implementado em `src/lib/patient/desarquivamento.ts` cobrindo todos os atos clínicos (diário de sessão, áudio local, consolidação, escopo, aprovação de evidências, confirmação/reclassificação de fila, dúvidas clínicas, ativação de protocolos, metas e ficha clínica).
- **D8 (#174 — Terapeuta de Cobertura Desarquiva):** Procedure `app_desarquivar_paciente` (`SECURITY DEFINER`, migração `0092`) atualizada para autorizar terapeutas condutores e substitutos (`session.terapeuta_id` ou `session.atendido_por_id` na mesma clínica) a reativar pacientes de forma atômica no ato clínico.
- **D23 (Helpers GUC `app.user_role` e `app.user_id`):** Migração `0093_user_role_id_helpers.sql` criou 6 helpers com código de erro diagnóstico `P0001` e regex guard. Reescritas 6 funções DEFINER (`app_alerta_risco_visivel`, `app_session_clinica_visivel`, `app_salvar_config_emergencia`, `app_salvar_cpf_cnpj_clinica`, `app_desarquivar_paciente`, `app_criar_alerta_risco`). Guards de CI expandidos em `db/tests/clinic-id-helper-rls.int.test.ts`.

---

## 2. Estado do Repositório & Branch

- **PR:** [#247](https://github.com/romulosutil/Iris/pull/247) aberta na branch `feat/d7-desarquivamento-clinico`.
- **Commits na Branch:**
  - `ae8a947` — `docs(backlog): fecha debito D8 com desarquivamento por terapeuta de cobertura (#174)`
  - `274fbdc` — `feat(db): D23 — helpers app_user_role_exigido() e app_user_id_exigido() + reescrita de 6 funções DEFINER`
  - `fa0b09f` — `test(rls): D23 — guards de CI para helpers de user_role e user_id`
  - `5541b05` — `docs: D23 fechado — helpers de GUC de papel e identidade (0093)`

---

## 3. Próximos Passos Sugeridos

1. Review e Merge da PR [#247](https://github.com/romulosutil/Iris/pull/247).
2. Próximos débitos do Backlog conforme prioridade de produto (ex: D31 — Dados da clínica, ou D11 — Estratégia RAG/Vetorização).
