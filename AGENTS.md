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

- **Regra 0 (UI):** Nunca estilizar elementos ad hoc na tela. Toda interface deve consumir tokens e componentes do Design System (_Espectro Brutal_) cadastrados no Storybook.
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

### 5.2 Pré-requisito de Handoff: Design tem que fechar TODA decisão antes da label `jules`

Evidência: issue #285 / PR #295 (13-14/08/2026). RCA (causa raiz) estava impecável, mas a fase Design foi pulada — a issue foi direto de "Specify" para a label `jules`. Resultado: implementação 80% correta, mas a revisão (Claude/Opus) encontrou 9 achados, todos rastreáveis a decisões que a spec deixou implícitas ou "a validar" em vez de fechadas. Jules (e qualquer executor autônomo) preenche lacuna de decisão com a escolha mais óbvia, não necessariamente a que o Rômulo queria — o mesmo vale hoje para Gemini via [[delegacao-gemini-spec-pattern]].

Antes de aplicar a label `jules`, a issue (ou a spec/plano anexado via `/tlc-spec-driven` ou `/superpowers:writing-plans`) precisa fechar, por escrito, cada um destes pontos — nenhum pode ficar como "a validar" no momento do handoff:

1. **Limites e condição de parada explícitos.** Todo polling, retry, backoff, timeout ou loop tem número e critério de parada escritos (não "enquanto necessário"). Se o Jules tiver que inferir um número, a spec está incompleta.
2. **Dono único de cada leitura/escrita.** Quando mais de um componente precisa do mesmo dado, a spec diz quem busca e quem recebe via prop — nunca "cada um busca o seu" (evita leitura duplicada e paga 2x por request).
3. **Toda decisão de produto/UX como critério de aceite fechado**, nunca como "a validar" ou implícita. Ex.: um estado de sucesso na UI é transiente ou permanente? Decidir antes, não deixar o executor escolher.
4. **Casos de borda listados por nome** — erro, cancelamento, timeout, reentrância, abandono — além do caminho feliz.
5. **Régua de mutação por comportamento, não só por linha.** Cada comportamento crítico (iniciar X, **parar X**, mostrar Y, esconder Z) tem 1 teste cuja remoção do código correspondente derruba o teste. "Remover o fix derruba 1 teste" não é suficiente se o fix tem 2 comportamentos (início e parada).
6. **Convenção de estilo do arquivo-alvo citada quando não-óbvia** — ex.: se os comentários do arquivo explicam o _porquê_ (não o _o quê_), dizer isso explicitamente e apontar um exemplo do próprio arquivo.
7. **Comando de formatação no checklist de saída da task.** CI deste repo não valida Prettier — o task brief tem que instruir explicitamente `pnpm format` antes do push, ou o PR passa 100% verde no CI com arquivo mal formatado.

Se qualquer um destes 7 pontos não estiver fechado no momento de aplicar a label, feche primeiro (você ou a sessão Claude/Gemini que fez o Design) — não delegue a decisão ao Jules torcendo para acertar.

### 5.3 Fluxo de Invocação & Resolução de Issues

- **Gestão de Backlog:** Toda dívida técnica, bug ou melhoria identificada deve obrigatoriamente ser transformada em uma **GitHub Issue**.
- **Gatilho de Invocação:** O Jules é acionado exclusivamente através da label `jules` adicionada a uma GitHub Issue aberta — e só depois do checklist da §5.2 fechado.
- **Comportamento Autônomo:** Uma vez marcado com a label `jules`, o agente assume a tarefa, lê as instruções do `AGENTS.md` e do `CLAUDE.md`, elabora o plano de ação, executa as alterações e abre o Pull Request sem necessidade de supervisão síncrona.

### 5.4 Pull Requests & Estado de Rascunho (Draft)

- **Estado Inicial:** Ao resolver uma issue, o Jules deve obrigatoriamente criar o Pull Request no estado **"Draft" (Rascunho)**.
- **Gatilho de Revisão:** O PR não deve ser marcado como pronto para revisão (_Ready for Review_) até que **todos os testes automatizados** (lint, typecheck, unitários, RLS, etc.) passem com 100% de sucesso.

### 5.5 Contexto de Negócio, Testes e Configurações (.env.example)

- **Leitura Obrigatória:** O Jules deve consultar o arquivo [`.env.example`](.env.example) e os documentos da pasta `docs/` para compreender o contexto do negócio, as integrações (ex: Asaas, Better-Auth, LLMs) e as flags de funcionalidade.
- **Coerência nos Testes:** Utilizar `.env.example` para mapear os papéis do banco de dados (roles com e sem RLS: `DATABASE_URL`, `AUTH_DATABASE_URL`, `MIGRATION_DATABASE_URL`), flags de teste (ex: `ALLOW_SKIP_INTEGRATION`) e criar mocks fiéis à arquitetura real da aplicação.

### 5.6 Revisão Pós-PR: validação substantiva, não CI verde

CI verde não é evidência suficiente de PR pronto — no PR #295, CI passou 5/5 e ainda assim Prettier falhava, um teste vazava estado global sem cleanup, e um comentário satisfazia a letra do DoD sem explicar a causa raiz. Quem revisa PR do Jules (Claude ou Opus) faz **leitura de diff completa contra a Definição de Pronto da issue original**, não só confere status de check.

- **Ajuste cirúrgico, não reescrita.** Se a base do Jules estiver majoritariamente correta (é o caso comum quando §5.2 foi seguido), o revisor corrige os achados pontualmente em cima do que existe — reescrever do zero custa mais caro em token do que a exploração e o esqueleto que o Jules já pagou (externamente) para produzir.
- **Achado recorrente vira regra, não patch isolado.** Se o mesmo tipo de gap aparecer em mais de um PR do Jules, atualizar o checklist da §5.2 para fechar a lacuna na origem — corrigir só o sintoma repete o custo de revisão a cada PR novo.
- **Inventário de superfícies antes × depois (passo mecânico, obrigatório quando o diff toca rota ou navegação).** A DoD de uma spec lista os Goals dela; não lista o que a feature tirou do caminho de outro papel — foi assim que a #512 removeu a fila de validação do coordenador com CI verde e revisão humana (auditoria 360, `PR-01`/`PR-08`). Antes de aprovar, o revisor roda `git diff --stat origin/main -- 'src/app/**/page.tsx' src/app/\(app\)/nav.ts` e, para **cada** `page.tsx` removido, virado `redirect()` ou tirado de `nav.ts`, escreve na revisão a linha "rota → onde foi parar cada gesto que ela oferecia, por papel (`coordenador`, `terapeuta`, `admin_recepcao`)". Gesto sem destino = achado bloqueante, mesmo que a spec o tenha declarado "out of scope". O teste de alcance por papel (W5 da auditoria — issue #533, `Q-04`) é a versão executável desta lista; enquanto ele não cobrir a rota em questão, a lista manual é o gate.

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
4. **Atualizar o Grafo de Conhecimento:** Toda tarefa concluída que alterou código ou documentação exige `git commit` + `git push` + `graphify update .`, para que `graphify-out/` reflita a realidade do repositório em sessões futuras (AST-only, sem custo de API).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
