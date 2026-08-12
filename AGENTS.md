# AGENTS.md — Iris

Este arquivo é a **porta de entrada universal e contrato operacional** para qualquer agente de IA (Claude Code, Antigravity, Gemini, Jules, etc.) atuando no repositório **Iris**.

As instruções específicas de engenharia, comandos, migrações e runtime para sessões de desenvolvimento encontram-se em **[`CLAUDE.md`](CLAUDE.md)**, que atua como o **Master Instruction Ledger**. O Jules e todos os outros agentes devem obrigatoriamente seguir as diretrizes mestres nele contidas.

---

## 1. O Produto & Governança em 3 Camadas

O Iris é um SaaS para clínicas de terapia infantil (intervenção para TEA) baseado no modelo de **governança em 3 camadas**:
1. **IA sugere** evidências clínicas derivadas do diário em linguagem natural (nunca pontua nem decide).
2. **Terapeuta aprova** ou edita na tela de revisão (humano no circuito).
3. **Coordenador valida por exceção** e reclassifica (versionado, com justificativa).

---

## 2. Guardrails Inegociáveis de Engenharia

- **Regra 0 (UI):** Nunca estilizar elementos ad hoc na tela. Toda interface deve consumir tokens e componentes do Design System (*Espectro Brutal*) cadastrados no Storybook.
- **Honestidade Epistêmica:** Sugestão da IA (violeta `#6A4C93`, borda tracejada, elevação inset) jamais pode se parecer com dado Aprovado (verde `#059669`, borda sólida, elevado).
- **Rastreabilidade Frase-a-Frase:** Todo dado estruturado é derivado do texto livre do diário de sessão e auditável.
- **Isolamento Multi-tenant (RLS):** Toda query/policy de isolamento deve utilizar `app_clinic_id_exigido()`. Nunca utilizar cast direto de `current_setting('app.clinic_id')` em predicados de isolamento.
- **LGPD para Menores:** Consentimento explícito na admissão, auditoria imutável via `audit_log`, sem dados sensíveis em logs ou clientes terceiros sem DPA.

---

## 3. Checklist LGPD & Segurança Mínima

- [ ] Toda ação com impacto clínico ou cadastral emite registro atômico em `audit_log`.
- [ ] Conexões com o banco utilizam papéis restritos (`iris_app` sob RLS) para operações de rotina.
- [ ] Nenhuma chamada a APIs externas de ASR/IA processa voz ou texto sensível sem DPA assinado e feature flag ativa.

---

## 4. Matriz de Responsabilidade & Colaboração (Humano <-> Agente)

Para evitar sobreposição de contextos e otimizar o fluxo de trabalho:

- **Estratégia & Design (Claude Code / Gemini):**
  - Atuam como **arquitetos de produto**.
  - Responsáveis por definir especificações técnicas, criar visões de UX/UI, desenhar fluxos e jornadas de usuário (utilizando diagramas Mermaid) e detalhar as tasks técnicas em GitHub Issues.
- **Execução & Qualidade (Jules):**
  - Atua como o **braço executor autônomo**.
  - Responsável por implementar correções, refatorações e novas funcionalidades a partir das GitHub Issues especificadas, além de realizar análises automáticas de desempenho e segurança em cada Pull Request aberto.

---

## 5. Protocolo de Operação do Agente Jules

### 5.1 Idioma OBRIGATÓRIO (PT-BR)
- O agente Jules deve operar **estritamente em Português (PT-BR)** para todas as interações destinadas a humanos.
- **Abrangência:** Descrições de Pull Requests (PRs), comentários em GitHub Issues, mensagens de commit e planos de ação detalhados.
- **Regra de Tradução:** Mesmo que o contexto técnico, o código ou a issue original esteja em inglês, a resposta e todos os artefatos de texto do Jules devem ser em PT-BR.

### 5.2 Fluxo de Invocação & Resolução de Issues
- **Gestão de Backlog:** Toda dívida técnica, bug ou melhoria identificada deve obrigatoriamente ser transformada em uma **GitHub Issue**.
- **Gatilho de Invocação:** O Jules é acionado exclusivamente através da label `jules` adicionada a uma GitHub Issue aberta.
- **Comportamento Autônomo:** Uma vez marcado com a label `jules`, o agente assume a tarefa, lê as instruções do `AGENTS.md` e do `CLAUDE.md`, elabora o plano de ação, executa as alterações e abre o Pull Request sem necessidade de supervisão síncrona.

### 5.3 Pull Requests & Estado de Rascunho (Draft)
- **Estado Inicial:** Ao resolver uma issue, o Jules deve obrigatoriamente criar o Pull Request no estado **"Draft" (Rascunho)**.
- **Gatilho de Revisão:** O PR não deve ser marcado como pronto para revisão (*Ready for Review*) até que **todos os testes automatizados** (lint, typecheck, unitários, RLS, etc.) passem com 100% de sucesso.

### 5.4 Contexto de Negócio, Testes e Configurações (.env.example)
- **Leitura Obrigatória:** O Jules deve consultar o arquivo [`.env.example`](.env.example) e os documentos da pasta `docs/` para compreender o contexto do negócio, as integrações (ex: Asaas, Better-Auth, LLMs) e as flags de funcionalidade.
- **Coerência nos Testes:** Utilizar `.env.example` para mapear os papéis do banco de dados (roles com e sem RLS: `DATABASE_URL`, `AUTH_DATABASE_URL`, `MIGRATION_DATABASE_URL`), flags de teste (ex: `ALLOW_SKIP_INTEGRATION`) e criar mocks fiéis à arquitetura real da aplicação.

---

## 6. Estrutura de Documentação de Referência

- **Master Instruction Ledger:** [`CLAUDE.md`](CLAUDE.md)
- **Variáveis & Configurações de Teste:** [`.env.example`](.env.example)
- **Visão de Produto:** [`PRODUCT.md`](PRODUCT.md)
- **Design System & Tokens:** [`DESIGN.md`](DESIGN.md)
- **Roadmap & Débitos Técnicos:** [`BACKLOG.md`](BACKLOG.md)
- **Handoffs & Histórico:** [`docs/archive/handoff-fase1.md`](docs/archive/handoff-fase1.md)

---

## §7. Definição de Pronto (Definition of Done por Fase / Task)

Uma tarefa ou fase só é considerada **Pronta** quando:
1. **Código & Tipagem:** `pnpm typecheck` e `pnpm lint` executam com 0 erros.
2. **Testes:** `pnpm test` (unitários) e `pnpm test:rls` (integração/RLS) passam 100%.
3. **Migrações (se aplicável):** `src/db/migrations.test.ts` valida o journal e o snapshot do Drizzle.
4. **Design System (se houver UI):** Componentes registrados ou reutilizados do Storybook (`pnpm storybook`).
5. **Sem Regressões:** Nenhuma funcionalidade existente quebrada.

---

## §8. Protocolo de Fim de Sessão & Atualização do BACKLOG.md

Ao concluir uma sessão com alterações relevantes, decisões arquiteturais ou fechamento de débitos:
1. **Atualizar [`BACKLOG.md`](BACKLOG.md):** Marcar débitos/issues concluídos e registrar verificações por medição real (não por suposição).
2. **Resumo Claro:** Apresentar um resumo sucinto dos pontos alterados e dos comandos de verificação executados.
3. **Salvar Checkpoint:** Se o contexto estiver elevado (~50 mensagens), registrar o status em `checkpoint.md`.


