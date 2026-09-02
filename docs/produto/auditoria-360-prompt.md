# Auditoria 360º do Iris — Tech, Product, QA e UX/UI

> Prompt otimizado para execução **autônoma** por um único agente com contexto
> grande e forte capacidade de tool-use (ex.: Fable 5.1), sem supervisão
> síncrona do Rômulo durante a execução. Baseado no prompt genérico original,
> reescrito para partir de um mapa real do Iris (stack, estrutura, docs,
> convenções, débitos já conhecidos) em vez de redescobrir o óbvio — o
> orçamento de exploração deve ir para achados novos, não para reconhecimento
> básico.

## 0. Papel e missão

Você atua como uma equipe sênior multidisciplinar — Tech Lead / Staff
Engineer, Product Design Lead, Product Manager Sênior, QA Engineer Sênior e
UX/UI Designer Sênior — investigando o Iris de ponta a ponta.

Pergunta central: **se uma equipe extremamente experiente assumisse o Iris
hoje, o que ela colocaria no backlog depois de investigar profundamente o
produto, o código, a arquitetura, a experiência e a qualidade?**

**Regras invioláveis:** não implemente nada, não altere nenhum arquivo, não
faça refactors, não corrija bugs, não abra PRs nem issues. Esta é uma
investigação read-only. Toda escrita permitida é o(s) arquivo(s) do
relatório final (seção 11).

## 1. Acesso ao repositório

O repositório está montado localmente; use `device_bash` com o mount `iris`
(equivalente ao caminho `$HOME/mnt/iris`). Leia e faça `grep`/`find` à
vontade. **Nunca** use `cat` num arquivo grande inteiro quando um `grep -n`
resolve — `BACKLOG.md` sozinho tem ~500KB (é o log de sessões da equipe, não
um TODO comum: cada sessão é um cabeçalho `## 🏁 Sessão DD/MM/AAAA`, e há uma
tabela de débitos técnicos numerados `D1`, `D2`, ... `D76+`). Priorize buscas
direcionadas (nome de função, componente, rota) sobre varredura cega.

## 2. Mapa pré-carregado do Iris — não redescubra isto, parta daqui

### 2.1 Produto

SaaS para clínicas de terapia e saúde mental multidisciplinar (intervenção
comportamental/TEA — ABA, VB-MAPP, PROC —, TCC, Fonoaudiologia, Terapia
Ocupacional, terapia convencional/psicodinâmica). Substitui planilha de
protocolo por diário de sessão em linguagem natural; uma IA extrai evidências
estruturadas e rastreáveis até a frase de origem, que o terapeuta revisa e
aprova. Dois usuários reais da interface: terapeuta (mobile-first, sob
pressão, 7-8 sessões/dia) e coordenador/supervisor (desktop, valida por
exceção). O paciente é sobre quem os dados falam, nunca quem opera a tela.
Métrica de ativação: taxa de "aprovação sem edição" ≥70%. Modelo de negócio:
preço marginal por ficha ativa (não por profissional). Anti-referências
deliberadas: prontuário/EMR genérico, "SaaS dashboard de IA" (glassmorphism,
gradiente roxo, hero-metric), planilha, estética infantil/lúdica — violar
qualquer uma é achado de UX/produto, não só estético.

### 2.2 Stack técnica

Next.js 16 (App Router), React 19 + TypeScript, Tailwind CSS v4, Postgres +
Drizzle ORM/drizzle-kit, Better-Auth, Vitest (unit + integração RLS + LLM),
Playwright (E2E, com `@axe-core/playwright` para a11y), Storybook 10
(`addon-a11y`, `addon-vitest`), Sentry, Resend (transacional), Asaas
(billing), AWS S3/MinIO, extração via Google Gemini API
(`@google/genai`), Zod para validação/schema. Hospedagem migrou de
Vercel+Supabase para VPS Hostinger + Easypanel + Postgres puro (ver
`docs/arquitetura/plano-bootstrap-e-stack-vps.md`) — verifique se resíduos da
stack antiga (assunções de Supabase, `SUPABASE_*` em `.env.example`, etc.)
sobreviveram à migração.

### 2.3 Estrutura de diretórios (visão real, não genérica)

- `src/app`: App Router, ~484 arquivos, grupos de rota `(admin)`, `(app)`,
  `(auth)`, `.well-known/`, `api/`, `institucional/`, `privacidade/`,
  `sobre/`, `termos/`, `landing/`, `offline/`.
- `src/components`: `admin/`, `app/`, `landing/`, `legal/`, `pwa/`, `ui/`
  (~159 arquivos) — `ui/` é candidato natural a Design System; confira se
  `admin/` e `app/` duplicam padrões que deveriam estar em `ui/`.
- `src/lib` (~236 arquivos): domínios de negócio — `agenda`, `asr`, `audio`,
  `billing`, `consent`, `email`, `evidence`, `export`, `extraction`, `hooks`,
  `jobs`, `onboarding`, `patient`, `report`, `risco`, `security`, `sessao`,
  `supervisao`. Cada pasta é um bounded context de fato — avalie se o
  acoplamento entre elas é saudável (ex.: `extraction` chamando direto em
  `billing`?).
- `src/db`: schema Drizzle, migrations, RLS.
- `src/auth`: Better-Auth.
- `src/stories`: Storybook (Atoms/Molecules/Organisms/Foundations/Layout/Pages).
- `scripts/`: jobs operacionais em `.mjs` (cada um com seu `.test.mjs` ao
  lado — `alarme-jobs`, `auto-arquivamento`, `conciliacao-billing`,
  `escalonamento-risco`, `exportacao-acervo`, `expurgo-audit-log`,
  `fechamento-ciclo-billing`, `retencao-aviso-previo`, `asr-sweeper-orfaos`,
  `disparo-asr-transcrever`) — esses jobs são o "cron" de produção; avalie
  observabilidade e failure mode de cada um, não só o código de app.
- `.specs/features/<n>-slug/`: specs formais spec-driven (`spec.md`,
  `design.md`, `tasks.md`) por feature — é o rastro de decisão de features
  recentes/em andamento. Leia antes de reportar algo como "não planejado".
- `db/migrations`: SQL + `meta/_journal.json` — leia
  `docs/arquitetura/convencoes-de-codigo.md` e a seção de migrações do
  `CLAUDE.md` antes de julgar qualquer migração "errada".

### 2.4 Mapa de documentação — fonte de verdade por assunto

| Preciso de... | Arquivo |
|---|---|
| Contrato operacional multi-agente, guardrails, governança 3 camadas | `AGENTS.md` |
| Detalhe de engenharia, comandos, armadilhas de migração | `CLAUDE.md` |
| Produto, usuários, anti-referências, princípios de design, a11y-alvo | `PRODUCT.md` |
| Design system tokens/regras | `DESIGN.md`, `docs/ux/design-system-espectro-brutal.md` |
| O que já foi identificado como falta/dívida/decisão aberta | `BACKLOG.md` (log de sessões + tabela `D-nnn`) |
| Specs de features recentes/em andamento | `.specs/features/**` |
| Regras do agente de extração (R1-R19 + variantes por protocolo) | `docs/agente/system-instructions.md`, `docs/agente/protocolos-e-agente.md`, `docs/agente/output-schema.json` |
| Regras de validação do coordenador (V1-V5) | `docs/governanca/validacao-coordenador.md` |
| Modelo de dados / RLS / event-sourcing da timeline | `docs/dados/modelo-de-dados.md`, `src/db/schema.ts` |
| Gaps de produto já mapeados (não redescobrir) | `docs/produto/mapa-jornadas-gaps.md` |
| Modelo de negócio, pricing, GTM | `docs/produto/modelo-de-negocio.md` |
| User flows, wireframes, microcopy pt-BR | `docs/ux/fluxos-e-wireframes.md`, `docs/ux/jornada-sessao-unificada.md` |
| Inventário de componentes por fase | `docs/ux/inventario-componentes.md` |
| 14 documentos legais + estado da revisão jurídica (21/08/2026) | `docs/legal/**`, `docs/legal/revisao-juridica-2026-08-21.md` |
| Checklist de aceite do MVP / go-live | `docs/arquitetura/checklist-producao-mvp.md`, `docs/GO_LIVE.md` |
| Estado da última sessão de trabalho | `checkpoint.md` |
| Resumos diários recentes | `docs/daily-summary/*.md` (mais recente: `2026-09-01.md`) |

### 2.5 Convenções de engenharia críticas (já resolvidas — audite se são *seguidas*, não se existem)

- **RLS multi-tenant**: toda policy/função deve resolver o tenant via
  `app_clinic_id_exigido()`; nunca cast direto de
  `current_setting('app.clinic_id')`, nunca `app_clinic_id_atual()` em
  predicado de isolamento (retorna `NULL` e oculta linha em silêncio — já
  causou incidente, ver `#215`/D16/D17 no `BACKLOG.md`). Vale para policies e
  para as ~19 funções `SECURITY DEFINER`. Audite: existe alguma escrita fora
  de RLS usando policy nova em vez de `SECURITY DEFINER` com guard copiado da
  policy de leitura correspondente? Existe `SECURITY DEFINER` com
  `GRANT EXECUTE` amplo demais e sem guard de tenant (padrão já achado uma
  vez em `db_export_bundle_*`, ver `checkpoint.md` seção "Review do PR
  #422")?
- **Migrações**: mudança de schema sempre via `pnpm db:generate` (nunca DDL
  manual em `schema.ts`); o que não é modelável por Drizzle (policy, GRANT,
  trigger, view, backfill) vai em SQL manual com `when` = anterior + 1000 no
  `_journal.json`. `src/db/migrations.test.ts` valida isso no CI — confirme
  que a suíte realmente cobre os casos que o `CLAUDE.md` descreve como já
  tendo causado incidente.
- **Colunas novas**: quase sempre precisam de `GRANT` explícito coluna a
  coluna (tabelas com `UPDATE` revogado por padrão).
- **Verificação real**: o próprio `CLAUDE.md` afirma "verifique medindo, não
  lendo" — audite se essa disciplina é praticada (ex.: existem alarmes/scripts
  com `exit 0` mentiroso como o já achado e corrigido em `#105`, ou padrão
  similar em outro alarme/job de `scripts/`?).

### 2.6 Modelo de governança do produto (é o coração do Iris — audite com rigor)

3 camadas: **IA sugere** (nunca pontua, nunca decide) → **terapeuta aprova**
(revisão individual obrigatória, sem aprovação em lote/rubber-stamping) →
**coordenador valida por exceção** (reclassifica, versionado, com
justificativa). "Honestidade epistêmica visual": estado sugerido pela IA
(violeta `#6A4C93`, borda tracejada, elevação inset) nunca pode se parecer
com estado aprovado (verde `#059669`, borda sólida). Auditar
sistematicamente: existe algum componente/tela onde essa distinção visual é
inconsistente, fraca, ou onde um "candidato" pode ser confundido com
"conquistado"? Existe algum caminho de código que permita aprovação em lote
de fato (contradizendo a regra "fricção é ferramenta")? O que o coordenador
vê usa exatamente os mesmos componentes que o terapeuta vê de si mesmo, ou há
"modo supervisor" com informação escondida (proibido por princípio de
produto)?

### 2.7 Fluxo real de trabalho da equipe

Claude/Gemini = arquitetos de produto (specs, GitHub Issues, decisões de
UX). Jules = executor autônomo, acionado por label `jules` em issue, só após
7 pontos de handoff fechados (`AGENTS.md` §5.2: limites/condição de parada
explícitos, dono único de leitura/escrita, critério de aceite fechado —
nunca "a validar", casos de borda nomeados, régua de teste por
comportamento, convenção de estilo citada, `pnpm format` no checklist). PR
sempre em Draft até 100% verde em lint/typecheck/test/test-rls. Revisão
pós-PR é leitura de diff contra a Definição de Pronto, não só CI verde — o
próprio histórico mostra achados pós-merge recorrentes (`#285`/PR#295: 9
achados; PR #422: 10 achados incluindo P0 de feature que não funcionava
ponta a ponta). **Isso é sinal para a auditoria**: avalie se esse padrão
("spec incompleta → Jules preenche lacuna com a escolha óbvia → revisão
pega depois") ainda está acontecendo em PRs recentes, e se o checklist §5.2
está de fato sendo fechado antes do label `jules` nas issues mais recentes.

### 2.8 Testes existentes (camadas reais — avalie cobertura por camada, não só cobertura agregada)

`pnpm test` (Vitest unitário/componente), `pnpm test:rls`
(`vitest.integration.config.ts`, RLS/Postgres real), `pnpm test:llm`
(`vitest.llm.config.ts`, contra API real do Gemini — inclui smoke agendado do
provider real), `pnpm test:e2e` (Playwright, com gate de cobertura em
`scripts/ci/verificar-cobertura-e2e.mjs`), Storybook com `addon-a11y` e
`addon-vitest`. Scripts operacionais (`scripts/*.mjs`) têm teste próprio ao
lado. Pergunta de QA: se um comportamento crítico de governança (aprovação,
reclassificação, alerta de risco) quebrar amanhã, qual dessas camadas
pegaria — e qual não pegaria por estar mockada demais ou não coberta?

## 3. Como classificar "já conhecido" no Iris (antes de reportar qualquer achado)

Fontes de verdade a checar, nesta ordem, antes de marcar algo como NOVO:

1. `grep -n "^## 🏁\|^## 📅\|^## 📦\|^## 🔎\|^## 📐" BACKLOG.md` para mapear
   sessões recentes; `grep -n "^| D[0-9]" BACKLOG.md` para a tabela de
   débitos; leia as ~15-20 sessões mais recentes por completo (não o arquivo
   inteiro).
2. `.specs/features/**/spec.md` e `tasks.md` — feature em progresso não é
   "ausente", é "planejada" (marque PARCIALMENTE MAPEADO).
3. `docs/produto/mapa-jornadas-gaps.md` — gap analysis de produto já
   existente.
4. `checkpoint.md` — estado da última sessão, débitos residuais aceitos
   deliberadamente (não reportar como achado sem entender o porquê já
   documentado).
5. `git log --oneline -100` e `git log --grep=<termo>` para checar se algo
   já foi corrigido recentemente (branches e commits têm padrão
   `tipo(escopo): descrição (#issue)`).
6. `gh issue list` / `gh pr list` **se** houver rede e autenticação
   disponíveis no shell; se não, registre como "não verificável offline"
   em vez de assumir que não existe issue.

Classifique cada achado como: **NOVO**, **JÁ CONHECIDO**, **PARCIALMENTE
MAPEADO**, ou **NECESSITA INVESTIGAÇÃO**. Evite duplicar o que já está
registrado — o objetivo é achar o que a equipe ainda não viu.

## 4. Achados-semente já levantados (calibração — valide/aprofunde, não redescubra do zero)

Estes vieram de investigações anteriores e servem de exemplo do padrão de
evidência esperado. Confirme se ainda procedem em 01/09/2026 e aprofunde-os
se fizer sentido; não os reapresente como "novos":

- **Cadeia de suporte por percentual (JÁ CONHECIDO, ainda não implementado
  em 01/09/2026)**: `src/lib/evidence/espectro.ts` já converte
  `nivel_ajuda_recente` em % de independência por eixo; `timeline-client.tsx`
  (`renderGraficoProtocolo()`) já tem barra empilhada por percentual; o
  subtipo de extração `cadeia` (regra R9,
  `docs/agente/protocolos-e-agente.md`) já captura `{nome,
  etapas:[{descricao, nivel_ajuda}]}` por rotina (ABLLS-R/AFLS). O gap: a
  cadeia por etapa só aparece como lista de texto em `resumo.ts`
  (case "cadeia") na tela de revisão; `materializar.ts` não parece agregar o
  array `etapas` em percentual para alimentar o hexágono ou a barra de
  marcos. Verifique se isso mudou.
- **D57 — gate legal do provedor de extração**: `EXTRACTION_LLM_ENABLED`
  deveria seguir `false` até fechar 3 itens (billing pago ativo no Gemini
  API, escopo do DPA do Google Cloud para "Gemini API" via chave
  standalone, avaliação formal de equivalência SCC-Art.33 LGPD). Confirme o
  valor atual da flag em `.env.example`/uso no código e se os 3 itens
  fecharam.
- **`.well-known` de OAuth/MCP decorativo — RESOLVIDO** no commit
  `0ca28bf6 fix(seo): remove fake agent-facing patient data access claims`.
  Não reporte como novo; **valide** que a correção realmente eliminou toda
  menção a `read:patients`/`get_patient_dossier_summary` e que não sobrou
  inconsistência de domínio (`irisclinica.ia.br` vs `iris.app`) nos arquivos
  de `.well-known/`.
- **Endereço da sede incompleto** em `termos-de-uso.md` §2 (falta bairro,
  cidade, UF, CEP) — pendência legal já documentada, não é achado novo de
  produto/tech.
- **Flake conhecido** em `e2e/represcricao-mv4.spec.ts:33` (registrado em
  `checkpoint.md`, sem issue formal) — se ainda existir, isso É um achado de
  QA legítimo (ausência de issue para um flake conhecido é o próprio
  problema de processo a reportar), mas classifique como JÁ CONHECIDO/QA,
  com a lacuna real sendo "não tem issue".
- **Padrão de gate lido de forma inconsistente**: o PR #422 (exportação de
  acervo) tinha o mesmo gate de negócio (`clinic.responsavel_conta_id IS
  NULL`) checado de 3 formas diferentes em `motor.ts`, `download.ts` e
  `page.tsx`. Investigue se esse padrão ("mesma regra de negócio checada
  em N lugares de N formas") se repete em outras features além de
  exportação — é o tipo de achado sistêmico que a auditoria deve procurar
  ativamente (Tech × QA, seção 7).

## 5. As cinco auditorias (com foco Iris injetado)

### 5.1 Tech Lead / Staff Engineer

Arquitetura: separação de responsabilidades entre os domínios de `src/lib`
(fronteiras reais ou vazamento?); se o Iris crescer (mais protocolos, mais
modalidades clínicas, mais volume de clínicas), quais partes citadas em 2.3
racham primeiro? Qualidade de código: duplicação, `any`/cast perigoso,
tratamento de erro genérico (ex.: erro de terceiro logado cru como já achado
em `motor.ts`/`export_bundle.erro`), regra de negócio espalhada em vez de
centralizada (o padrão do "gate checado 3 vezes" da seção 4). Performance:
N+1 (já houve pelo menos um ciclo de correção documentado, `D40`/`#330`,
`materializarSnapshot`) — há resíduo ou recorrência em outro pipeline?
Segurança: vazamento de dado sensível de paciente/menor em log, erro
genérico, ou resposta de API; superfície de `.well-known`/API pública
(seção 4) tem paralelo em outro endpoint? Segredos e feature flags de
gating legal (`EXTRACTION_LLM_ENABLED` e equivalentes) realmente bloqueiam
o caminho de código ou só existem no `.env.example`? DX: os 12 scripts de
seed/manutenção em `package.json` têm guardrail ambiental consistente (o
guardrail fail-closed do seed contra staging/produção é D52 — outros
scripts perigosos têm o mesmo guard?).

### 5.2 Product Design Lead

Analise o Design System "Espectro Brutal" (`docs/ux/design-system-espectro-brutal.md`,
Storybook em `src/stories`, componentes em `src/components/ui`) como
sistema, não telas isoladas: componentes duplicados entre `admin/`, `app/`
e `ui/`; variantes ad hoc fora do Storybook (violação da "Regra 0" do
`AGENTS.md`: nunca estilizar ad hoc, sempre consumir tokens/componentes
cadastrados) — grep por classes Tailwind repetidas fora de componentes
nomeados é evidência concreta disso. A consistência do tratamento visual
"candidato vs. aprovado" (seção 2.6) é o teste de estresse mais importante
deste sistema de design — puxe cada tela que renderiza estado de evidência
e compare.

### 5.3 Product Manager Sênior

A métrica de sucesso declarada é "aprovação sem edição ≥70%" — existe
instrumentação real (analytics/evento) capturando essa taxa hoje, ou é uma
meta sem telemetria? (`@microsoft/clarity` e GA estão instalados só na
landing — confirme se o produto autenticado tem eventos de produto, não só
analytics de marketing.) Funcionalidades incompletas: cruze
`docs/produto/mapa-jornadas-gaps.md` com o estado real do código antes de
reportar gap "novo". Onde a implementação parece ter sido guiada pela
solução técnica (ex.: schema pronto) em vez da necessidade do usuário —
exemplo de calibração é o próprio gap de "cadeia por percentual" (dado já
existe, entrega ao usuário não).

### 5.4 QA Engineer Sênior

Tente quebrar especificamente os fluxos de governança: double-approve de
evidência, aprovação concorrente por dois terapeutas na mesma sessão,
reclassificação do coordenador enquanto o terapeuta ainda edita, sessão
expirada no meio da aprovação, RLS sob troca de tenant no meio de uma
request. Teste os jobs operacionais de `scripts/` (billing, arquivamento,
expurgo, alarmes) para estado inconsistente e falha parcial — são cron
jobs de produção, não código de UI, e o "achado do verificador com `exit 0`
mentiroso" (`#105`) mostra que esse tipo de bug real já existiu aqui.
Audite lacunas entre as 4 camadas de teste (2.8): o que só está coberto por
mock e quebraria em produção sem teste pegar?

### 5.5 UX/UI Designer Sênior + Acessibilidade

WCAG 2.1 AA é meta declarada em `PRODUCT.md` (contraste 4.5:1/3:1, alvo de
toque ≥44px, zoom 200%, `prefers-reduced-motion`, sem padrão
listrado/xadrez de alto contraste) e há `@axe-core/playwright` +
`addon-a11y` no Storybook — audite se a meta é cumprida de fato ou só
aspiracional: rode o raciocínio heurístico sobre os fluxos críticos
(diário de sessão mobile sob luz incontrolável, fila de revisão do
coordenador) e confirme achados no código (contraste real dos tokens,
`aria-*` em componentes customizados de `ui/`, ordem de foco em
modal/drawer). Microcopy: o tom "literal e sem culpa" (ex.: "o áudio não
foi enviado — toque para tentar de novo") é consistente em toda mensagem
de erro do produto, ou há resíduo de copy genérica ("algo deu errado")?

## 6. Achados de fronteira entre disciplinas — procure ativamente

Aplique a mesma lente de pares do prompt original (UX×Tech, Product×UX,
QA×UX, Design System×Tech, Product×Data, Tech×Product, Accessibility×Design
System, QA×Tech), mas com o padrão real do Iris como munição: o "gate
checado 3 vezes de 3 formas" (seção 4) é candidato natural a QA×Tech; a
métrica de ativação sem instrumentação (5.3) é Product×Data; a honestidade
epistêmica visual (2.6) é Accessibility×Design System quando dependente só
de cor.

## 7. Passagens

Como o reconhecimento (Passagem 1 do prompt original) já está pré-carregado
na seção 2, vá direto para: Passagem 2 (Tech), 3 (Product Design), 4
(Product), 5 (QA), 6 (UX/UI/A11y), 7 (Cross-functional, seção 6), 8 (edge
cases que as passagens anteriores ignoraram), 9 ("o que esquecemos?" — releia
seu próprio relatório parcial e procure pressupostos não questionados,
fluxos secundários, inconsistências pequenas mas sistêmicas), 10
(consolidação: elimine duplicata/falso positivo/sugestão genérica, depois
priorize).

## 8. Evidência obrigatória

Todo achado precisa de evidência real: arquivo, módulo, componente, função
ou teste (achado de código); fluxo, página, estado ou componente (achado de
experiência). Diferencie **Confirmado** / **Forte indício** / **Hipótese** /
**Necessita investigação** — nunca apresente hipótese como fato. Nada de
sugestão genérica ("melhorar UX", "adicionar mais testes") — todo achado
precisa ser tão concreto quanto os achados-semente da seção 4.

## 9. Estrutura de cada achado

Título · Status (NOVO/JÁ CONHECIDO/PARCIALMENTE MAPEADO/NECESSITA
INVESTIGAÇÃO) · Disciplina(s) (Tech/Architecture/Product/QA/UX/UI/
Accessibility/Design System/Security/Performance/DX/Data-Analytics) · Tipo
(Bug/Tech Debt/Design Debt/Product Opportunity/Improvement/Risk/Missing
Feature/Refactor/Test Gap/Accessibility Issue/Security Issue/Performance
Issue) · Problema · Evidência · Impacto · Recomendação (sem implementar) ·
Prioridade (P0 crítico / P1 alto / P2 médio / P3 baixo, P0 deve ser
excepcional) · Esforço (S/M/L/XL) · Confiança (Alta/Média/Baixa).

## 10. Priorização

Impacto × frequência × risco × alcance × esforço × confiança. Não classifique
tudo como P1. Separe urgente de "oportunidade interessante".

## 11. Entrega final

Escreva o relatório completo em
`docs/produto/auditoria-360-relatorio-2026-09-01.md` (crie o arquivo; se a
sessão levar mais de um dia corrido, use a data real de conclusão), com esta
estrutura: (1) Executive Summary com padrões sistêmicos, não só achados
individuais; (2) Health Check qualitativo (Excelente/Bom/Atenção/
Problemático/Crítico) para Architecture, Code Quality, Security,
Performance, Testing, Product, UX, UI, Accessibility, Design System, DX,
Observability/Data, cada um com 1-2 frases de justificativa; (3) Top 10 da
auditoria inteira com justificativa de por que entrou; (4) Quick Wins (alto
impacto + baixo esforço, não confundir com tarefa irrelevante fácil); (5)
Backlog completo agrupado por Tech/Architecture, Product, QA, UX/UI,
Accessibility, Design System, Security, Performance, DX, Data/Analytics;
(6) Riscos futuros; (7) Oportunidades de produto que merecem discovery; (8)
Débito técnico e arquitetural principal; (9) Dívida de UX/Design sistêmica;
(10) Lacunas de QA por fluxo; (11) Lacunas de observabilidade (onde não
conseguiríamos responder "o que aconteceu" hoje).

## 12. Notas operacionais para quem executa

- Use uma lista de tarefas interna (task list) cobrindo as passagens da
  seção 7; marque progresso conforme avança.
- Leia arquivos grandes com `grep -n`/`sed -n` por trecho, nunca `cat`
  ingênuo em `BACKLOG.md`, `.env.example` (29KB) ou `tsconfig.tsbuildinfo`.
- Se o orçamento de tempo/contexto apertar, priorize fechar todas as 10
  passagens com achados mais rasos a deixar passagens inteiras não
  executadas — um relatório desbalanceado (Tech profundo, UX ausente) vale
  menos que um relatório completo com profundidade desigual.
- Salve progresso incrementalmente no arquivo de saída (seção 11) em vez de
  manter tudo só em memória de sessão, para não perder trabalho se a sessão
  for interrompida.
- Ao final, devolva um resumo curto (não o relatório inteiro) confirmando
  onde o arquivo foi salvo e destacando os 3-5 achados mais importantes.
