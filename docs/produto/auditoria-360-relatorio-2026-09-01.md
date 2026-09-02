# Auditoria 360º do Iris — Relatório (01/09/2026)

> Execução autônoma, read-only, conforme `docs/produto/auditoria-360-prompt.md`.
> Base auditada: branch `fix/513-corrigir-nota-consolidada` (HEAD `dc964b19`, contém
> `main` até `b4361181` — merge da #512 em 01/09/2026). Ferramentas: leitura do
> repositório montado (`grep`/`sed`/`git log`), sem rede (`gh` indisponível —
> issues do GitHub **não verificáveis offline**; onde isso importa o achado diz).
> Nenhum arquivo além deste foi criado ou alterado.
>
> Calibração de "já conhecido" feita contra: tabela `D1..D78` do `BACKLOG.md`
> (abertos em 01/09: D9, D10, D11, D42, D48, D63, D65, D68–D71, D76–D78),
> as 20 sessões mais recentes do `BACKLOG.md` (16/08 → 01/09), `checkpoint.md`
> (datado 23/08), `.specs/features/**` (26 features), `docs/produto/mapa-jornadas-gaps.md`,
> `git log` (últimos 60 commits) e os achados-semente da seção 4 do prompt.

> **Adendo de 02/09/2026** — após a entrega, chegou a spec ratificada
> `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` (jornada de
> admissão / prontidão do prontuário). Nove achados receberam "Nota de reavaliação
> (02/09/2026)" inline; nenhum mudou de status para JÁ CONHECIDO; dois riscos novos
> (repetição do mecanismo do P0 e log inseguro em módulo novo) estão anotados em
> `PR-01`/`PR-08` e `S-03`. Análise cruzada completa e sugestões para a spec em
> `docs/produto/auditoria-360-revisao-admissao-2026-09-02.md`.

## Legenda

- **Status**: NOVO · JÁ CONHECIDO · PARCIALMENTE MAPEADO · NECESSITA INVESTIGAÇÃO
- **Confiança**: Confirmado (lido e cruzado no código/migração) · Forte indício (código lido, efeito deduzido sem execução) · Hipótese · Necessita investigação
- **Prioridade**: P0 crítico · P1 alto · P2 médio · P3 baixo · **Esforço**: S/M/L/XL
- Cada achado tem um id estável (`S-01`, `PR-01`, …) usado nas seções 3, 4, 6–11.

---

## 1. Executive Summary

O Iris tem uma base de engenharia acima da média para o estágio: 142 migrações
disciplinadas (helpers `app_clinic_id_exigido()`/`app_user_id_exigido()` em 48
policies e 21+15+9 funções, com oráculo em `db/tests/clinic-id-helper-rls.int.test.ts`),
quatro camadas de teste com gates de contagem no CI (1300 unit / 800 int / 17 e2e),
jobs de produção com teste ao lado, um design system com tokens que passam
WCAG AA e uma cultura de "verificar medindo" visível no `BACKLOG.md`. A auditoria
**não** encontrou o problema clássico de produto jovem (ausência de testes, RLS
frouxa, segredos no repo). Encontrou outra coisa: **o custo da velocidade recente
está concentrado em cinco padrões sistêmicos**, e cada um deles produz achados
individuais que sozinhos pareceriam pequenos.

**Padrão 1 — A superfície do produto mudou mais rápido que a verificação de alcance.**
A #512 (jornada unificada, mergeada em 01/09) absorveu diário e revisão em `/sessoes`,
removeu a `GovernancaNav` e redirecionou `/validacao` — mas nenhuma task remontou a
fila do coordenador. Resultado medido: **a terceira camada de governança (confirmar /
reclassificar / invalidar evidência, `evidence_revision`) não tem mais UI** (`PR-01`, P0),
`/alertas-risco` só é alcançável pelo banner de estágio 2 e `/supervisao` só por um link
condicional (`PR-02`). As 31 asserções de `validacao/actions.int.test.ts` continuam
verdes porque testam a action, não a rota — e não existe teste de "toda `page.tsx` é
alcançável por nav ou link" (`Q-04`). A revisão de DoD (T15) leu a spec contra os Goals,
não o produto contra si mesmo (`PR-08`).

**Padrão 2 — Terceiros dentro do perímetro clínico sem cobertura documental.**
`Clarity` (gravação de sessão) e `Google Analytics` estão montados no **root layout**,
ou seja, em toda tela autenticada — diário, prontuário, alertas de risco — com
`identify(user.id)` e confirmados vivos em produção desde 30/07 (commit `857590b2`).
A `politica-privacidade.md` §7 não nomeia Microsoft nem Google Analytics como
operadores (`S-01`, P0). O prompt da auditoria assumia "só na landing"; a premissa
estava errada. Na mesma família: `WebMCPProvider` registra em todas as páginas uma
ferramenta `search_clinical_evidence` que devolve evidência **fabricada** (`S-08`).

**Padrão 3 — O guard de tenant é excelente onde o oráculo olha, e só ali.**
O teste de RLS é uma allowlist positiva ("estas 21 funções usam o helper"); ele não
afirma "toda `SECURITY DEFINER` com `GRANT ... TO app_role` e argumento resolve o
tenant ou está numa allowlist explícita de globais" (`Q-05`). O padrão que o review
do PR #422 pegou à mão (definer sem guard) **existe hoje** em `app_alerta_trecho_fonte`
(`0122`): o ramo `session_id IS NULL` devolve `trecho_fonte` para qualquer `app_role`
sem checar clínica — e alertas de RPD/instrumento têm `session_id` nulo por CHECK (`S-02`).

**Padrão 4 — A mesma regra de negócio lida de N formas.** Confirmado além da
exportação: "quem é o terapeuta da sessão" tem três réguas (RLS só `terapeuta_id`;
`app_desarquivar_paciente` aceita `atendido_por_id`; UI/fila só `terapeuta_id`), e a
agenda permite designar substituto — que então não consegue documentar (`PR-05`).
Quatro cópias de `autorizado()` nas rotas internas, uma com fallback de token entre
superfícies (`A-05`). O "exit 0 mentiroso" da #105 recorre na exportação (`Q-07`).

**Padrão 5 — Dado clínico escapa por canais que ninguém trata como canal.**
`console.error("acao:", err)` em ~40 server actions loga `DrizzleQueryError`, cuja
`message` embute `params:` — o texto do diário — no stdout do Easypanel (`S-03`); a
equipe já corrigiu exatamente isso no worker de ASR (T16) mas não no app. O DLQ da
revisão grava `{error: err.message}` em `payload_editado` e, reaprovando, produz
`aprovada` com **zero** evidências (`Q-01`). `app_expurgar_audit_log_expirado()` apaga
**toda** a trilha (reclassificação, reconhecimento de alerta, exportação) após 180
dias, contra a própria política de retenção (`S-05`).

Fora dos padrões, dois achados de produto pesam: a métrica de ativação ("aprovação
sem edição ≥70%") **não tem uma linha de instrumentação** — nenhum evento, nenhuma
query agrega `aprovada` vs `editada` (`DA-01`); e nenhuma extração registra modelo,
versão de prompt ou latência, então a pergunta "que versão da IA sugeriu isto?" não
tem resposta (`DA-02`).

**Contagem**: 54 achados — 46 NOVOS, 2 JÁ CONHECIDOS (aprofundados), 5 PARCIALMENTE
MAPEADOS, 1 NECESSITA INVESTIGAÇÃO (mais um ponto "necessita investigação" dentro de
`S-05`). Prioridade: 2 P0 · 10 P1 · 22 P2 · 20 P3.

---

## 2. Health Check qualitativo

| Área                     | Nota          | Justificativa (1–2 frases)                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**         | Atenção       | Bounded contexts de `src/lib` são limpos (quase zero acoplamento cruzado), mas ~15k linhas de regra de negócio vivem em `src/app/**/logic.ts                                                                                                                                                                        | queries.ts`e rotas importam de rotas;`components/ui/calendar`importa server actions de`app/(app)/agenda` (inversão DS→app). Extração LLM roda inline na Server Action, sem fila/timeout. |
| **Code Quality**         | Bom           | 41 `any` explícitos (concentrados em jsonb da timeline), 0 `@ts-ignore`, comentários com rastreabilidade (`#issue`, `Dnn`). Duplicação real: 4× `autorizado()`, blockquotes ad hoc em vez de `ClinicalQuote`, `timeline-client.tsx` (972 linhas) reimplementando o DS.                                              |
| **Security**             | Problemático  | RLS e helpers exemplares, mas: Clarity/GA no app autenticado sem cobertura na política (P0), definer sem guard de tenant, PHI em log via `DrizzleQueryError`, scripts ad hoc contra produção que concedem papel cross-tenant, sem headers de segurança, sessão com default de 7 dias.                               |
| **Performance**          | Bom           | N+1 de `materializarSnapshot` fechados (D40); resíduo pequeno em `supervisao/queries.ts`. Riscos são de latência de terceiro sem timeout (Gemini) e PDF por Chromium in-process com semáforo por instância.                                                                                                         |
| **Testing**              | Bom / Atenção | 2253 unit + 1279 int (RLS real) + 17 e2e + Storybook a11y; mutação praticada. Lacunas: nenhum e2e do coordenador, nenhum teste de alcance de rota, nenhum teste de OCC/double-approve na revisão, oráculo de definers é allowlist positiva, "perda silenciosa de evidência" codificada como comportamento esperado. |
| **Product**              | Atenção       | Tese clara e anti-referências respeitadas no app clínico; porém a 3ª camada de governança ficou sem UI após #512, a métrica de ativação não é medida, e "sessão substituta" está inconsistente em 3 camadas. `mapa-jornadas-gaps.md` está 2 meses defasado.                                                         |
| **UX**                   | Bom           | Fluxo do terapeuta (captura rápida → consolidar → revisar) coeso e mobile-first; microcopy majoritariamente literal. Resíduos: `CONCURRENCY_ERROR` cru na tela, "Erro interno no servidor.", `err.message` do banco exibido em 3 lugares.                                                                           |
| **UI**                   | Atenção       | Tokens e primitivos sólidos; a tela mais importante (linha do tempo do paciente) é ad hoc: paleta crua, `text-[10px]`, classe inexistente, status por `title`. Card de extração _sugerida_ na revisão usa elevação de "fato".                                                                                       |
| **Accessibility**        | Bom           | Tokens passam AA (medido: 4.58–11.5:1), Radix em dialog/drawer, `prefers-reduced-motion` global, alvos ≥44px, 32 `aria-live`, 36 testes axe. Falhas ficam em componentes ad hoc (contraste 2.31:1, glifos sem nome) e na cobertura (timeline sem teste axe; e2e axe só na landing).                                 |
| **Design System**        | Atenção       | Espectro Brutal bem especificado, mas com 5 componentes órfãos (inclusive `evidence-timeline`), calendário morto de 1337 linhas, painel admin em linguagem visual distinta ("SaaS dashboard"), sem regra de lint para a Regra 0 (87 usos de paleta crua em `app/`+`components/`).                                   |
| **DX**                   | Bom           | Scripts, seeds com guardrail, `migrations.test.ts`, hash de migração, `.env.example` rico. Lacunas: 17 envs lidas no código e ausentes do `.env.example`, `checkpoint.md` 9 dias/20 sessões desatualizado, flags espalhadas, CRLF misto.                                                                            |
| **Observability / Data** | Problemático  | Alarme cobre 3 de 8 jobs; sem logger estruturado/request id; sem métrica de produto; extração sem modelo/prompt/latência; `audit_log` com expurgo destrutivo da trilha clínica. Hoje "o que aconteceu com esta sugestão?" não tem resposta completa.                                                                |

---

## 3. Top 10 da auditoria

| #   | Id      | Achado                                                                                                                                                                                                                                      | Por que entrou                                                                                                                                                                              |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `PR-01` | Pós-#512, a fila de validação do coordenador (confirmar/reclassificar/invalidar) não é montada por nenhuma página; `/validacao` redireciona para `/sessoes` e `/sessoes/[id]` em `revisada` diz "falta só a coordenação encerrar" sem gesto | É a 3ª camada do modelo de governança que o produto vende (`PRODUCT.md`, `/sobre`); regressão em produção desde 01/09, invisível ao CI.                                                     |
| 2   | `S-01`  | Microsoft Clarity (session replay) + GA no root layout → toda tela clínica autenticada; `identify(user.id)`; live em produção; não listados na política de privacidade                                                                      | Transferência internacional de dado de saúde de menor sem base documental, num produto cujo diferencial é LGPD; a revisão jurídica de 21/08 não viu porque olhou `docs/`, não `layout.tsx`. |
| 3   | `S-03`  | `console.error("acao:", err)` em ~40 actions loga `DrizzleQueryError` com `params` (texto do diário) no stdout do Easypanel; Sentry sem `beforeSend`                                                                                        | Mesmo defeito já corrigido no ASR (T16) mas não generalizado; PHI em log de painel sob HTTP puro.                                                                                           |
| 4   | `Q-01`  | DLQ da revisão grava `{error}` em `payload_editado` sem guard de versão; reaprovar de `erro_validacao` produz `aprovada` com zero `evidence`                                                                                                | Perda silenciosa de dado clínico com estado "aprovado" — o oposto da honestidade epistêmica.                                                                                                |
| 5   | `S-02`  | `app_alerta_trecho_fonte(uuid)` devolve `trecho_fonte` sem guard de tenant quando `session_id IS NULL` (alertas de RPD/instrumento)                                                                                                         | Reincidência do padrão do PR #422; prova que o oráculo de RLS (`Q-05`) tem ponto cego.                                                                                                      |
| 6   | `S-05`  | `app_expurgar_audit_log_expirado()` apaga toda a trilha (`reclassificacao`, `reconhecimento_alerta`, `relatorio_exportado`…) após 180 dias                                                                                                  | Contradiz `politica-retencao-dados.md` ("mínimo, não teto"; alerta acompanha o prontuário) e destrói a prova de diligência. Verificar se o job está agendado.                               |
| 7   | `DA-01` | Métrica de ativação "≥70% aprovação sem edição" sem nenhuma instrumentação ou query                                                                                                                                                         | A decisão de "contratar vendas" (`modelo-de-negocio.md:279`) está condicionada a um número que ninguém mede.                                                                                |
| 8   | `PR-05` | Substituto (`atendido_por_id`) pode ser designado na agenda, mas RLS/UI/fila só reconhecem `terapeuta_id`; `app_desarquivar_paciente` reconhece os dois                                                                                     | Jornada real ("terapeuta faltou, outro cobre") quebrada em 3 réguas diferentes — o padrão sistêmico do #422 em outra feature.                                                               |
| 9   | `S-04`  | `scripts/unlock-user.ts` (tracked) contra `MIGRATION_DATABASE_URL`: desliga 2FA, e se sem vínculo concede `coordenador` na **primeira** clínica do banco; `scripts/check-patient.ts` (untracked) faz `SELECT * FROM patient` por nome       | Guardrail D52 cobre só `seed*`; ferramentas de diagnóstico em produção estão fora de qualquer trilha ou tenant.                                                                             |
| 10  | `PR-08` | Revisão de DoD (T15 da #512) valida Goals da spec, não regressões em superfícies declaradas "fica onde está"/"out of scope"                                                                                                                 | É o mecanismo pelo qual 1, e parte de 8, chegaram a `main` com CI verde — corrigir o processo evita a próxima.                                                                              |

## 4. Quick Wins (alto impacto, baixo esforço)

| Id      | Ação (sem implementar aqui)                                                                                                                                                           | Esforço | Impacto                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| `S-01`  | Mover `<Clarity/>`/`<GoogleAnalytics/>` do root layout para o layout da landing/institucional (ou gatear por `pathname` público) **e** nomear os operadores na política ou removê-los | S       | Fecha exposição LGPD imediata                 |
| `S-02`  | Adicionar `AND a.clinic_id = app_clinic_id_exigido()` em `app_alerta_trecho_fonte` e incluir na `FUNCOES_COM_HELPER`                                                                  | S       | Fecha vazamento cross-tenant                  |
| `S-03`  | Um helper `logarErroSemPII(rotulo, err)` que registra `err.name`, `err.cause?.code` e hash, nunca `message` de `DrizzleQueryError`; `beforeSend` no Sentry                            | S–M     | Tira PHI dos logs                             |
| `PR-02` | Reinserir `/alertas-risco` e `/supervisao` no `itemsAdmin` do coordenador (`nav.ts`) até a decisão de produto                                                                         | S       | Devolve alcance a duas telas de governança    |
| `Q-04`  | Teste unitário que varre `src/app/(app)/**/page.tsx` e exige que cada rota apareça em `nav.ts`, em um `<Link href>` ou em `redirect()`                                                | S       | Teria pego `PR-01`/`PR-02`                    |
| `U-01`  | Mapear `CONCURRENCY_ERROR` para copy humana na `RevisaoLista` (como já faz `supervisao-fila.tsx`)                                                                                     | S       | Remove string de máquina da tela do terapeuta |
| `S-06`  | `headers()` em `next.config.ts` com `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS                                                                            | S       | Hardening barato                              |
| `S-07`  | `session: { expiresIn, updateAge }` explícitos no Better-Auth (ex.: 12h/1h)                                                                                                           | S       | Reduz janela em desktop compartilhado         |
| `DA-02` | Colunas `modelo`, `versao_prompt`, `latencia_ms`, `tokens` em `extraction` (Drizzle-gerada) preenchidas pelo `resolveProvider`                                                        | S       | Rastreabilidade da IA e base para `DA-01`     |
| `Q-07`  | `exportacao-integral` responde `ok:false`/500 quando algum bundle sai `falhou`; script sai 1                                                                                          | S       | Fecha "exit 0 mentiroso" recorrente           |
| `A-05`  | Remover fallback `INTERNAL_JOB_TOKEN ?? BILLING_JOB_TOKEN` e extrair `autorizarBearer()` único                                                                                        | S       | Elimina reuso de segredo                      |
| `DX-02` | Regenerar `checkpoint.md` (ou apontar para o `BACKLOG.md` como fonte única)                                                                                                           | S       | Onboarding lê o estado certo                  |

---

## 5. Backlog completo

Formato por achado: **Título** · Status · Disciplina(s) · Tipo · Problema · Evidência · Impacto · Recomendação · Prioridade · Esforço · Confiança.

### 5.1 Security

#### S-01 · Clarity (session replay) e Google Analytics rodam em toda tela clínica autenticada e não constam na política de privacidade

- **Status**: NOVO · **Disciplinas**: Security, Product, Legal/LGPD · **Tipo**: Security Issue / Risk
- **Problema**: `src/app/layout.tsx:66-68` monta `<GoogleAnalytics/>`, `<Clarity/>` e `<WebMCPProvider/>` no root layout — portanto em `/sessoes/[id]`, `/pacientes/[id]/timeline`, `/alertas-risco`, etc. `src/components/clarity.tsx` faz `ClaritySDK.init` + `consentV2({analytics_Storage:"granted"})` + `identify(session.user.id)`. Não há `data-clarity-mask` em nenhum componente (grep vazio); o nível de máscara depende só da configuração no painel da Microsoft (não verificável offline).
- **Evidência**: `src/app/layout.tsx:4-7,66-68`; `src/components/clarity.tsx:16-33`; `infra/Dockerfile:34-37` (build args `NEXT_PUBLIC_CLARITY_PROJECT_ID`/`NEXT_PUBLIC_GA_ID`); commit `857590b2` ("Clarity SDK fully integrated in production: init + consentV2 + identify all live, env set in Easypanel"); `docs/legal/politica-privacidade.md` §7 lista IA, hospedagem, Resend, Asaas e convênios — **não** Microsoft nem Google Analytics; `grep -i clarity docs/legal/*.md` → vazio. O prompt da auditoria afirmava "instalados só na landing" — premissa falsa.
- **Impacto**: gravação de DOM/interação de telas com texto clínico de menores enviada a terceiro nos EUA, com identificador de usuário, sem nomeação como operador nem instrumento de transferência (Art. 33 LGPD) — em produto cuja revisão jurídica (21/08) tratou justamente de nomear o provedor de IA por esse motivo. GA recebe URLs com UUIDs de paciente.
- **Recomendação**: (a) decidir se telemetria comportamental cabe no app clínico; se sim, restringir por rota pública, configurar máscara _Strict_ e nomear os operadores na política + DPA; se não, mover para o layout de `landing/`/`institucional/`/`sobre/` e remover do app. (b) Acrescentar ao checklist de revisão jurídica: "grep de SDKs de terceiros em `src/app/layout.tsx` e `package.json`".
- **Prioridade**: P0 · **Esforço**: S · **Confiança**: Alta (montagem/identify confirmados; nível de máscara = Necessita investigação)

#### S-02 · `app_alerta_trecho_fonte()` devolve o trecho clínico sem guard de tenant quando o alerta não tem sessão

- **Status**: NOVO · **Disciplinas**: Security, Data · **Tipo**: Security Issue
- **Problema**: a função `SECURITY DEFINER` (`GRANT EXECUTE ... TO app_role`) tem `CASE WHEN a.session_id IS NULL OR app_session_conteudo_visivel(a.session_id) THEN a.trecho_fonte`. No ramo `session_id IS NULL` **nenhum** predicado de clínica é avaliado. Alertas de origem `registro_pensamento` e `instrumento_formal` têm `session_id` nulo por construção (CHECK `alerta_risco_vinculo`, `0114`). Qualquer conexão `app_role` de qualquer clínica pode `SELECT app_alerta_trecho_fonte('<uuid>')`.
- **Evidência**: `db/migrations/0122_sigilo_helpers.sql:53-66,83-85`; `0114_alerta_risco_instrumento_aplicacao_anchor.sql:19-24`; `0125_sigilo_alerta_trecho.sql` (revoga SELECT da coluna e delega à função); a função **não** está em `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts:273-310`) e o teste passa por ser allowlist. Chamadores legítimos: `alertas-risco/queries.ts:67`, `export/acervo/coletor.ts:578`.
- **Impacto**: leitura cross-tenant do trecho de maior sensibilidade do produto (ideação suicida, autolesão) por quem conhecer/adivinhar um UUID — via injeção, log vazado (`S-03`) ou bundle exportado de outra clínica. Também ignora o sigilo por disciplina no ramo nulo.
- **Recomendação**: acrescentar `a.clinic_id = app_clinic_id_exigido()` ao `WHERE` (copiar o predicado da policy de SELECT de `alerta_risco_clinico`), incluir na allowlist do teste e cobrir com caso negativo em `sigilo-disciplina-rls.int.test.ts`. Ver `Q-05` para o oráculo sistêmico.
- **Prioridade**: P1 · **Esforço**: S · **Confiança**: Alta

#### S-03 · Erros crus de banco (com `params`) vão para o log em ~40 server actions — o texto do diário vai junto

- **Status**: NOVO · **Disciplinas**: Security, Observability · **Tipo**: Security Issue
- **Problema**: `drizzle-orm@0.45.2` monta `DrizzleQueryError.message = "Failed query: <sql>\nparams: <params>"`. `console.error("capturarDiario:", err)` e equivalentes escrevem isso no stdout — no Easypanel, cuja UI de log a própria equipe registrou como "HTTP puro" (BACKLOG, sessão 31/08 3ª). O `onRequestError` do Sentry (`src/instrumentation.ts`) captura erros não tratados sem `beforeSend`.
- **Evidência**: `node_modules/.pnpm/drizzle-orm@0.45.2*/node_modules/drizzle-orm/errors.js:10-14`; `src/app/(app)/diario/[sessionId]/logic.ts:153,217,274,582,966`; `revisao/[sessionId]/logic.ts:354`; `pacientes/[id]/anamnese/logic.ts:74,287`; `metas/logic.ts:78,116`; total de 41 `console.error(..., err)` fora de testes. Correção pontual já feita no ASR: "`DrizzleQueryError` embutia a transcrição nos params" (BACKLOG 31/08, T16) — não generalizada. `src/lib/asr/storage.ts` tem `redigirCredenciais`; não existe equivalente para PHI.
- **Impacto**: nota clínica de menor em log de infraestrutura; retenção e acesso do log não cobertos pela política de retenção (`S-05` trata do `audit_log`, não do stdout).
- **Recomendação**: helper único de log de erro (`name`, `cause.code`/SQLSTATE via `codigoPg`, id de correlação, nunca `message` de erro de driver); `beforeSend` no Sentry filtrando `params`; lint (`no-restricted-syntax`) contra `console.error(.*, err)` em `src/app`.
- **Prioridade**: P1 · **Esforço**: M · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — o plano `docs/superpowers/plans/2026-09-01-prontidao-do-prontuario.md` (Task 5) introduz, no `layout.tsx` do prontuário, `console.warn("[prontidao] falha ao ler fatos (patientId=…):", erro.message)` — o **mesmo idioma** deste achado, nascendo em módulo novo. Aqui o risco é menor (a query só recebe `patientId`, não texto clínico), mas `message` de `DrizzleQueryError` carrega SQL completo, e o hábito é o que se propaga. **Risco NOVO registrado**: a spec não define regra de log seguro para `prontidao.ts`/`prontidao-queries.ts`; ver memo R-3.

#### S-04 · Scripts operacionais ad hoc contra produção sem guardrail, sem trilha e com concessão de papel cross-tenant

- **Status**: NOVO · **Disciplinas**: Security, DX · **Tipo**: Security Issue / Tech Debt
- **Problema**: `scripts/unlock-user.ts` (versionado) usa `MIGRATION_DATABASE_URL ?? DATABASE_URL`, seta `email_verified=true`, `two_factor_enabled=false`, apaga `two_factor` e `auth_throttle` e, se o usuário não tem vínculo, faz `INSERT INTO user_role (... 'coordenador')` na **primeira clínica que `SELECT id FROM clinic LIMIT 1` devolver**; e-mail default é o do fundador. `scripts/check-patient.ts` (untracked na árvore de trabalho em 01/09) faz `SELECT * FROM patient WHERE ... LOWER(nome) LIKE '%benjamin%'` e despeja sessões/notas/extrações no console. `backfill-evidence.ts` e `smoke-alerta-risco.mjs` também escrevem sem guard. O guardrail D52 (`scripts/lib/guardrail-seed-wiring.test.ts:72-90`) só cobre scripts `seed*` declarados no `package.json`.
- **Evidência**: `scripts/unlock-user.ts:3-4,15,46-100`; `scripts/check-patient.ts:1-13`; `scripts/lib/guardrail-seed-wiring.test.ts:76-79`.
- **Impacto**: um `unlock-user` rodado contra produção para um e-mail sem vínculo vira coordenador de uma clínica arbitrária; nada disso gera `audit_log`; diagnóstico de paciente por nome com role dona ignora RLS e sigilo.
- **Recomendação**: estender `assertSeedAllowed` a **todo** script que abre conexão com role dona (teste de fiação por capacidade — `grep postgres(` em `scripts/`, não por nome); mover diagnóstico de produção para uma rota/CLI que roda sob `withTenant` e escreve `audit_log`; apagar `check-patient.ts` da árvore e listar `scripts/*.ts` ad hoc no `.gitignore` só se houver política escrita.
- **Prioridade**: P1 · **Esforço**: S · **Confiança**: Alta

#### S-05 · Expurgo do `audit_log` apaga a trilha de governança clínica inteira após 180 dias

- **Status**: NOVO · **Disciplinas**: Security, Data, Legal · **Tipo**: Bug / Risk
- **Problema**: `app_expurgar_audit_log_expirado()` faz `DELETE FROM audit_log WHERE criado_em < now() - INTERVAL '180 days'` sem filtrar `acao`. A tabela guarda `reclassificacao`, `invalidacao`, `devolucao`, `reconhecimento_alerta`, `resolucao_alerta`, `descarte_alerta`, `relatorio_exportado`, `evidencia_aprovada_lote`, `arquivar`, `assinatura_cancelada_por_inadimplencia`… — e é a fonte de `/clinica/auditoria` (`audit_log_mascarado`).
- **Evidência**: `db/migrations/0070_expurgo_audit_log_marco_civil.sql:23-31`; `scripts/expurgo-audit-log.mjs:29-40`; ações gravadas: `grep -A3 "INSERT INTO audit_log" src`; `docs/legal/politica-retencao-dados.md:104` ("**Mínimo** de 6 meses — não é teto") e linha de "Alertas de risco clínico — acompanha o prontuário"; `infra/README.md:1381` documenta só o comando manual; não existe `infra/expurgo-audit-log/` (ao contrário de `retencao`, `arquivamento`, `exportacao`).
- **Impacto**: se o job estiver agendado no Easypanel, a clínica perde em 6 meses a prova de quem reclassificou o quê e de que o alerta de risco foi reconhecido — exatamente o que o produto promete ("versionado, com justificativa"). Se não estiver, a obrigação do Marco Civil não é o problema (mínimo), mas a função continua errada para quando for ligada.
- **Recomendação**: separar "log de acesso" (login, IP, sessão — expurgável) de "trilha clínica" (acompanha o prontuário; pseudonimizar ator, nunca apagar) por `acao` ou por tabela; medir em produção se `iris-expurgo-audit-log` existe como serviço.
- **Prioridade**: P1 · **Esforço**: M · **Confiança**: Alta na função; **Necessita investigação** se está agendado

#### S-06 · Nenhum header de segurança HTTP na aplicação

- **Status**: NOVO · **Disciplinas**: Security · **Tipo**: Security Issue
- **Problema**: `next.config.ts` só define header para `/auth.md`; `src/proxy.ts` não injeta CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy; `infra/` (Dockerfile, docker-compose) não configura proxy reverso — o Traefik do Easypanel pode adicionar HSTS, mas isso não é verificável no repo.
- **Evidência**: `grep -rn "Content-Security-Policy\|X-Frame-Options\|Strict-Transport" src next.config.ts infra` → só a CSP do renderizador de PDF (`playwright-renderer.ts:45`).
- **Impacto**: clickjacking de telas clínicas; sem CSP enquanto há scripts de terceiro (`S-01`) e `<Script>` inline de GA; `Referrer-Policy` ausente vaza URLs com UUID de paciente ao clicar em link externo.
- **Recomendação**: `headers()` global em `next.config.ts` (DENY, `strict-origin-when-cross-origin`, Permissions-Policy mínima, HSTS) e CSP em modo report-only primeiro; teste de integração que faz `GET /login` e assere os headers.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta (no repo); Média quanto ao ambiente

#### S-07 · Sessão do Better-Auth com defaults (7 dias, sem idle timeout) em app clínico usado em desktop compartilhado

- **Status**: NOVO · **Disciplinas**: Security · **Tipo**: Risk
- **Problema**: `src/auth/auth.ts` não declara `session.expiresIn`/`updateAge`/`freshAge`; defaults do Better-Auth = 7 dias com renovação diária. O coordenador valida em desktop de clínica; a recepção usa máquina compartilhada.
- **Evidência**: `src/auth/auth.ts:91-144` (sem bloco `session:`); MFA obrigatória para papéis clínicos (`getTenantContext`) mitiga login, não sessão aberta.
- **Impacto**: sessão esquecida em máquina compartilhada expõe prontuário por até 7 dias.
- **Recomendação**: `expiresIn` curto (8–12h), `updateAge` de 1h, e `freshAge` para ações sensíveis (exportação, expurgo); documentar em `docs/legal/politica-seguranca`.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### S-08 · `WebMCPProvider` expõe em todas as páginas uma ferramenta que devolve evidência clínica fabricada

- **Status**: NOVO (resíduo da família corrigida em `0ca28bf6`) · **Disciplinas**: Security, Product · **Tipo**: Risk
- **Problema**: `src/components/webmcp-provider.tsx` registra em `navigator.modelContext` a tool `search_clinical_evidence` cujo `execute` devolve `{results:[{id:"ev-001", topic:"Evidências para <query>", summary:"Indicadores comportamentais compilados de acordo com os critérios clínicos."}]}` — texto inventado — em **todas** as páginas, incluindo as autenticadas; além de `console.log` em produção.
- **Evidência**: `src/components/webmcp-provider.tsx:9-35`; `src/app/layout.tsx:69`; `src/lib/webmcp.ts:33-36` (`console.log`). O `server-card.json` diz "Nenhum servidor MCP publicado" — coerente; o provider client-side, não.
- **Impacto**: um agente de navegador que consulte "autolesão" recebe uma resposta com ar clínico e fabricada, dentro do prontuário — contradiz "IA nunca decide, nada é maquiado como fato" (`PRODUCT.md:40`).
- **Recomendação**: remover o provider do app autenticado (ou do produto inteiro até existir MCP real); se ficar na landing, devolver só `get_iris_overview`.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### S-09 · Visibilidade do repositório e identificadores de produção versionados

- **Status**: NECESSITA INVESTIGAÇÃO · **Disciplinas**: Security · **Tipo**: Risk
- **Problema**: `.github/workflows/pr-review.yml:23` diz "Repositório público"; a linha `:43` do mesmo arquivo diz "Repo privado, um único time". O repositório versiona ids de cliente Asaas de produção (`cus_000193772978`, `cus_000193771154` em `BACKLOG.md:84`; `cus_000008723016` em `infra/README.md:2287`), prefixo do token de webhook (`dQx2A1mhoaidY2…`, `BACKLOG.md:51,1128`), hostnames internos e o e-mail pessoal do fundador como default em `scripts/unlock-user.ts:15` e `seed-demo-account.ts:52`.
- **Evidência**: citada acima; `gh` indisponível para confirmar visibilidade.
- **Impacto**: se público, enumeração de clientes do gateway e engenharia social; se privado, higiene.
- **Recomendação**: confirmar visibilidade; em qualquer caso, passar identificadores de produção do `BACKLOG.md` para um runbook privado e trocar defaults de e-mail por obrigatórios.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Necessita investigação

#### S-10 · Mensagens de erro do banco/terceiro chegam cruas à interface

- **Status**: NOVO · **Disciplinas**: Security, UX · **Tipo**: Bug
- **Problema**: `pacientes/novo/logic.ts:393` devolve `e.message`; `clinica/exportacao/exportacao-view.tsx:134` mostra `err?.message`; `revisao/[sessionId]/logic.ts:378` devolve `` `Erro de validação clínica: ${errorMsg}` `` (a `message` do `DrizzleQueryError`, com `params`).
- **Evidência**: linhas citadas; `grep -rn "e.message\|err?.message" src/app --include=*.ts*`.
- **Impacto**: nomes de constraint/tabela e trechos de payload na tela; copy fora do tom "literal e sem culpa".
- **Recomendação**: mapear `SQLSTATE` → copy conhecida (já existe `codigoPg` no ASR) e cair em mensagem fixa + id de correlação.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

### 5.2 Product

#### PR-01 · A fila de validação do coordenador ficou sem interface após a #512

- **Status**: NOVO · **Disciplinas**: Product, UX, QA · **Tipo**: Bug (regressão de feature) / Risk
- **Problema**: a jornada unificada (`.specs/features/512-jornada-sessao-unificada/`) absorveu `/diario` e `/revisao` em `/sessoes/[id]` (T06), removeu a `GovernancaNav` (T10) e transformou `/validacao`, `/excecoes` e `/pendencias` em `redirect()` (T14). Nenhuma task remontou `ValidacaoFila` (confirmar / reclassificar com justificativa / invalidar / lote de alta confiança). Hoje: `grep -rln "ValidacaoFila\|validacao-fila" src/app` só devolve o próprio arquivo e `actions.ts`; `/sessoes/[id]` para coordenador não-dono renderiza `PassoRevisar → RevisaoLista` com `ehDono=false` (botões só para o dono) e, no estado `revisada`, exibe "Revisada — falta só a coordenação encerrar o item na fila." sem gesto algum. `app-header.tsx:69-73` ainda calcula estado ativo para um item `/validacao` que não existe mais.
- **Evidência**: `src/app/(app)/validacao/page.tsx:10-11` (redirect); `src/app/(app)/sessoes/[id]/page.tsx:139-155,176-185`; `src/app/(app)/sessoes/[id]/passo-revisar.tsx:47-51` (copy cita `/validacao`); `src/app/(app)/revisao/[sessionId]/revisao-lista.tsx:376`; `src/lib/sessao/estado.ts:97-107` (`revisada` = "falta o coordenador"); `tasks.md` T01–T15 (nenhuma cita a fila por evidência); spec §2 "Out of scope"; `docs/ux/jornada-sessao-unificada.md` §3.5 ("sobe para a fila do coordenador: a segunda aprovação é uma segunda pessoa"); merge `b4361181` em `main`.
- **Impacto**: em clínica com coordenador ≠ terapeuta, evidência de fricção alta aprovada pelo terapeuta fica em `revisada` para sempre; `evidence_revision` (`confirmar`/`reclassificar`/`invalidar`) deixa de ser escrita; `/sobre` e `PRODUCT.md` continuam prometendo a camada. Único caminho residual de reclassificação: resposta a dúvida clínica em `/duvidas`.
- **Recomendação**: decisão de produto explícita — (a) remontar `ValidacaoFila` como passo do coordenador em `/sessoes/[id]` (mesmos componentes que o terapeuta vê + gestos de governança), ou (b) restaurar `/validacao` como rota da fila por evidência com item de nav. Em ambos, e2e de coordenador (`Q-04`).
- **Prioridade**: P0 · **Esforço**: M · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` (ratificada em 01/09, ainda não implementada) generaliza o padrão da #512 para o objeto _paciente_ e introduz um **cartão de prontidão com gestos condicionados a papel** (`quemResolve`/`papelQueResolve`, `rota: null` quando o papel não age). O achado **continua aberto e inalterado** (a spec não toca a fila do coordenador). **Risco NOVO registrado**: o mecanismo que produziu este P0 — feature que muda quem vê qual gesto, sem inventário de superfícies por papel e sem teste de alcance — está presente na nova spec; a seção "6. Prova" dela testa `montarProntidao` (puro), fatos sob RLS e o bloqueio no `PassoEmFoco`, mas nenhum caso cobre "papel X abre o prontuário/lista e vê o gesto certo" ponta a ponta, nem `admin_recepcao` e terapeuta fora da equipe de cuidado (ver memo `auditoria-360-revisao-admissao-2026-09-02.md`, R-1/R-2).

#### PR-02 · `/alertas-risco` e `/supervisao` só são alcançáveis por links condicionais

- **Status**: NOVO · **Disciplinas**: Product, UX · **Tipo**: Bug
- **Problema**: após T10, `/alertas-risco` (reconhecer, registrar conduta, descartar) só tem link no banner do layout **quando existe alerta em estágio 2** (`layout.tsx:110-118`); alertas em estágio 0/1 não têm caminho in-app (a notificação por e-mail é de corpo fixo, sem link contextual — `scripts/lib/resend-rt.mjs:7-17`). `/supervisao` (exceções, faltas, estagnação) só tem o `<Link>` de `pacientes/bloco-estagnacao.tsx:30`, renderizado quando há estagnação.
- **Evidência**: `src/app/(app)/nav.ts` (itens: Agenda, Sessões, Pacientes, Relatórios + admin); `grep -rn 'href="/alertas-risco\|href="/supervisao' src/app` → 2 ocorrências condicionais; spec §2 "`/alertas-risco` … Fica onde está" (mas o "onde" era a `GovernancaNav` removida).
- **Impacto**: coordenador não consegue abrir a fila de alertas para reconhecer dentro do prazo (o escalonamento a estágio 2 acontece justamente por falta de reconhecimento).
- **Recomendação**: item permanente no menu admin/rodapé do coordenador ("Alertas de risco", "Supervisão") com badge; até lá, quick win em `nav.ts`.
- **Prioridade**: P1 · **Esforço**: S · **Confiança**: Alta

#### PR-03 · `PRODUCT.md` proíbe aprovação em lote; o código e o doc de UX permitem para fricção baixa

- **Status**: PARCIALMENTE MAPEADO (`docs/ux/jornada-sessao-unificada.md` §3.5 registra a regra condicional) · **Disciplinas**: Product, Design · **Tipo**: Design Debt / documentação
- **Problema**: `PRODUCT.md:74` — "O sistema proíbe aprovações mecânicas ou em lote ('rubber-stamping'). Toda evidência requer revisão individual consciente". `src/app/(app)/validacao/logic.ts:201-300` implementa `aprovarEvidenciasLoteCore` ("Aprovado em lote pelo coordenador.", `evidencia_aprovada_lote`) gateado por `avaliarFriccao().podeLote` (confiança alta e consistente), com `BatchBar` na UI.
- **Evidência**: citadas; `src/lib/extraction/review-policy.ts:5-19`.
- **Impacto**: o documento de princípios (fonte para onboarding e para o próprio Jules) contradiz a implementação decidida; hoje o lote está inalcançável por `PR-01`, o que esconde a divergência.
- **Recomendação**: atualizar `PRODUCT.md` para a regra real ("nunca em lote quando a fricção é alta; lote só para confiança alta e consistente, com trilha própria") ou remover o lote — decisão do Rômulo.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### PR-04 · Cadeia de suporte por percentual — o dado nem entra na camada `evidence`

- **Status**: JÁ CONHECIDO (achado-semente), aprofundado · **Disciplinas**: Product, Data · **Tipo**: Missing Feature
- **Problema**: confirmado em 01/09 que nada mudou: `cadeia` só aparece em `revisao/[sessionId]/resumo.ts:51,106-112` (lista de texto). Aprofundamento: `inserirEvidenciasOnApprove` retorna cedo com `if (row.subtipo !== "evidencia") return;` (`revisao/[sessionId]/logic.ts:194`) — extrações `cadeia`, `registro_abc` etc. aprovadas **nunca geram linha em `evidence`**; vivem só em `extraction.payload`. `materializar.ts`/`espectro.ts` não têm nenhuma referência a `etapas`.
- **Evidência**: `grep -n "cadeia\|etapas" src/lib/evidence/*.ts` → vazio.
- **Impacto**: hexágono e barra de marcos ignoram rotinas ABLLS-R/AFLS; a régua "dado existe, entrega não" da seção 5.3 do prompt.
- **Recomendação**: spec via `/tlc-spec-driven` (toca modelo de dados): persistir `etapas[]` como evidências por etapa ou agregado por rotina, e alimentar `renderGraficoProtocolo`.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

#### PR-05 · "Sessão substituta": três réguas diferentes para "quem é o terapeuta da sessão"

- **Status**: PARCIALMENTE MAPEADO (`mapa-jornadas-gaps.md` marca 🟡 "jornada não desenhada") · **Disciplinas**: Product, Tech, QA · **Tipo**: Bug / Design Debt
- **Problema**: a agenda permite marcar `atendidoPorId` (substituto) ao encerrar a sessão (`agenda/gerir-sessao.tsx:92`, `agenda/logic.ts:175-223`). Mas: RLS `session_note_insert/update` e `audio_update` exigem `app_session_terapeuta_id(session_id) = app.user_id` (só `terapeuta_id`); `ehDono` na UI é `sess.terapeutaId === ctx.userId` (`revisao/[sessionId]/queries.ts:154`, `sessoes/[id]/queries.ts:173`); a fila (`lib/sessao/fila.ts:128-131`) filtra `s.terapeuta_id = ctx.userId`; já `app_desarquivar_paciente` (`0092`, D8) aceita `terapeuta_id OR atendido_por_id`.
- **Evidência**: citadas.
- **Impacto**: quem atendeu não consegue documentar nem vê a sessão na própria fila; a titular ausente é a única que pode escrever a nota de uma sessão que não fez — registro clínico com autoria errada.
- **Recomendação**: uma função única `app_session_profissional_responsavel(session)` (titular ou substituto) consumida pela RLS, pelo `ehDono` e pela fila; spec de produto da jornada de cobertura (briefing, sigilo, autoria).
- **Prioridade**: P1 · **Esforço**: M · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` **agrava** este achado em vez de resolvê-lo: `obterFatosProntidao` lê `goal`, `patient_clinical_profile`, `anamnese`, `instrumento_aplicacao` e `session_snapshot` **sob a RLS do usuário atual**, e todas essas policies exigem `coordenador` OU `app_is_on_team(patient_id)` (`0001_rls.sql:121-126`, `0006_fase2_rls.sql:207-213`, `0113:45-49`, `0115:97-101`, `0016:19-24`). Um terapeuta que é `session.terapeuta_id` mas não está em `care_team_membership` (cenário suportado — `actions.int.test.ts:321` "terapeuta de cobertura (fora da equipe)"; a agenda só valida `user_role`, `agenda/queries.ts:301-320`) verá **todos os fatos `false`** → `podeDocumentar=false` → "Falta meta ativa — aguardando coordenação" para um prontuário pronto. Mesma raiz deste achado ("quem é o terapeuta da sessão" ≠ "quem está na equipe"), agora com um bloqueio funcional. Status permanece **PARCIALMENTE MAPEADO**, prioridade **P1** confirmada; ver memo R-1.

#### PR-06 · `docs/produto/mapa-jornadas-gaps.md` está 2 meses defasado e é citado como fonte de verdade

- **Status**: NOVO · **Disciplinas**: Product, DX · **Tipo**: Tech Debt (documentação)
- **Problema**: o mapa (jul/2026) marca 🔴 admissão/ficha/consentimento, 🔴 ciclo de vida da meta, 🔴 briefing pré-sessão e 🟡 assiduidade — todos implementados (`pacientes/novo`, `pacientes/[id]/metas/logic.ts` com transições e critério de domínio, `pacientes/[id]/briefing`, `supervisao/queries.ts:31-79` com `faltas_limiar`). Continuam de fato ausentes: relatório escolar (`report_tipo` sem `escola`), treino parental, reunião interdisciplinar, resumo para WhatsApp, transição/alta completa (D65).
- **Evidência**: `grep -rli assiduidade src` → 0 mas `faltas_limiar` presente; `CLAUDE.md`/prompt apontam o arquivo como "gaps já mapeados".
- **Impacto**: um PM ou agente novo reabre discovery de coisas prontas e não vê os gaps reais.
- **Recomendação**: nota de revisão datada no topo + tabela "estado em 09/2026"; regra de que `mapa-jornadas-gaps.md` é revisado a cada milestone fechada.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` §1.2 (D1–D3) documenta que a **jornada** de admissão está incompleta (entidade existe, escada não; onboarding termina em `paciente EXISTS`), o que refina a frase "admissão implementada" acima: o cadastro existe, a jornada até o prontuário pronto não. A spec **não** atualiza `mapa-jornadas-gaps.md`; o achado (documento defasado e citado como fonte) permanece **NOVO/P3**, com a recomendação de que a revisão do mapa cite a spec como fechamento de "1. Admissão" e "3. Plano/Metas".

#### PR-07 · `report_tipo.avaliativo_interdisciplinar` existe no schema e em nenhum lugar do código

- **Status**: NOVO · **Disciplinas**: Product, Data · **Tipo**: Tech Debt
- **Problema**: enum com 4 valores; `avaliativo_interdisciplinar` não é referenciado por nenhuma query, action ou UI (`grep -rn avaliativo_interdisciplinar src` → só `schema.ts`). Caso de "schema pronto, necessidade não entregue".
- **Impacto**: baixo; ruído de modelo e falsa sensação de cobertura do relatório interdisciplinar (gap real do mapa).
- **Recomendação**: ou spec do relatório interdisciplinar (o mapa o marca como 70% coberto pelo perfil com equipe) ou remoção do valor.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### PR-08 · A revisão de Definição de Pronto valida Goals da spec, não regressões fora do escopo declarado

- **Status**: NOVO · **Disciplinas**: Product, QA, Processo · **Tipo**: Improvement (processo)
- **Problema**: T15 da #512 ("leitura de diff completa contra a DoD original") foi executada e a spec marcada "Implementado, Goals G1-G6 marcados" (`629a6f55`). A DoD cobria os 6 Goals; `/alertas-risco` estava em "Out of scope — fica onde está" e a fila por evidência não estava em lugar nenhum. Nada no checklist §5.2/§5.6 do `AGENTS.md` pede "inventário de rotas/superfícies antes × depois".
- **Evidência**: `.specs/features/512-jornada-sessao-unificada/spec.md` §2 e §5; `tasks.md` T10, T14, T15; `PR-01`, `PR-02`.
- **Impacto**: é o mecanismo que deixou `PR-01` passar com CI verde e revisão humana — o mesmo padrão "spec incompleta → executor fecha lacuna → revisão pega depois" que o prompt pede para verificar, agora com a revisão **não** pegando.
- **Recomendação**: acrescentar à §5.6 um passo mecânico: `git diff --stat` sobre `src/app/**/page.tsx` + `nav.ts` gera lista "rotas removidas/redirecionadas → onde foi parar cada gesto"; e o teste de alcance (`Q-04`).
- **Prioridade**: P1 · **Esforço**: S · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec de admissão (`docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`) e os planos associados não acrescentam o passo de "inventário de superfícies × papel antes/depois" recomendado aqui; a Task 10 do plano (`docs/superpowers/plans/2026-09-01-prontidao-do-prontuario.md`, "Verificação final") repete o formato da T15 da #512. O risco de recorrência é concreto (ver nota em `PR-01`). Achado permanece **NOVO/P1**; recomendação ganha urgência porque a próxima feature já está ratificada.

### 5.3 Tech / Architecture

#### A-01 · `components/ui/calendar/` é código morto que inverte a camada do design system

- **Status**: PARCIALMENTE MAPEADO (D61 registra "componentes órfãos, sem caller em produção") · **Disciplinas**: Architecture, Design System · **Tipo**: Tech Debt / Refactor
- **Problema**: dos 6 componentes (1337 linhas), só `Calendar.Grid` tem consumidor de produção (`agenda-view-cliente.tsx:442`, `availability-grid.tsx:101`, `schedule-grid.tsx:105`). `CalendarRoot`, `CalendarHeader`, `CalendarEventCard`, `CalendarEventSidebar`, `CalendarSlotDialog` têm zero. Todos entram no bundle via `index.ts`, e importam **do app**: `CheckInButton`, `GerirSessao`, `PopoverAlocar`, `EstadoBadge`, `FUSO_CLINICA`, tipos de `agenda/actions` (`calendar-event-card.tsx:5-6`, `calendar-event-sidebar.tsx:7-11`, `calendar-slot-dialog.tsx:4-5`, `schedule-grid.tsx:5`). `calendar-header.tsx:43` renderiza o literal `FUSO_CLINICA` ("America/Sao_Paulo").
- **Evidência**: `grep -rln "<CalendarRoot\|<CalendarHeader\|<CalendarEventSidebar\|<CalendarSlotDialog" src` → só stories/ui.
- **Impacto**: `ui/` deixa de ser reutilizável/isolável em Storybook sem contexto de app; D61 mantém uma constante de fuso só por causa de código morto; superfície de manutenção falsa.
- **Recomendação**: apagar os 5 órfãos e o `index` composto; mover `calendar-grid` para receber `renderEvent`/`renderSidebar` por prop (inversão de dependência) — depois apagar `FUSO_CLINICA`.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

#### A-02 · Regra de negócio concentrada em `src/app/**/logic.ts|queries.ts`, com rotas importando rotas

- **Status**: NOVO · **Disciplinas**: Architecture · **Tipo**: Tech Debt
- **Problema**: 15.249 linhas em `logic.ts`/`queries.ts`/`actions.ts` sob `src/app` (`agenda/queries.ts` 1185, `diario/[sessionId]/logic.ts` 1114, `pacientes/[id]/equipe/logic.ts` 604) contra `src/lib` como "bounded contexts". Rotas importam de outras rotas: `clinica/feriados`, `equipe/[id]`, `pacientes/[id]/ausencias` ← `agenda/bloqueio-*`/`horas-queries`; `diario` ← `pacientes/[id]/tcc/deteccao-risco`; `consentimento/logic` ← `pacientes/novo/logic`; `lib/billing/rotulos-*` ← `app/(app)/assinatura/queries` (lib dependendo de app). Ciclo `lib/email ⇄ lib/billing` (`templates.ts:5` / `notificacao-cancelamento.ts:6-7`).
- **Evidência**: contagens e imports citados (`grep -rn "from \"@/app/(app)/" src`).
- **Impacto**: ao crescer em modalidades/protocolos, `diario/[sessionId]/logic.ts` (8 ações + ASR + extração + risco) e `agenda/queries.ts` racham primeiro; testes de integração precisam montar rota inteira para cobrir regra.
- **Recomendação**: promover `agenda`, `sessao/diario` e `revisao` a módulos de `src/lib` com actions finas nas rotas; regra de lint `no-restricted-imports` para `@/app/**` a partir de `lib/` e `components/ui`.
- **Prioridade**: P3 (estrutural, não urgente) · **Esforço**: L · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` §3.2 coloca `prontidao-queries.ts` em `src/app/(app)/pacientes/[id]/` e o plano (Task 7) o importa de `src/app/(app)/sessoes/[id]/queries.ts` via `../../pacientes/[id]/prontidao-queries` — mais um import rota→rota do tipo descrito aqui, enquanto `prontidao.ts` (puro) vai corretamente para `src/lib/patient/`. Achado permanece **NOVO/P3**; sugestão no memo (R-6): a query de fatos também pertence a `src/lib/patient/`.

#### A-03 · Extração pela IA roda inline na Server Action, sem timeout, retry ou fila

- **Status**: NOVO · **Disciplinas**: Architecture, Performance, Observability · **Tipo**: Risk
- **Problema**: `consolidarSessaoCore` chama `provider.extrair()` (Gemini) dentro do request (`diario/[sessionId]/logic.ts:773-792`). `createGeminiInvoker` não passa `httpOptions.timeout`, `AbortSignal` nem política de retry (`src/lib/extraction/gemini-invoker.ts:31-63`). Em falha, grava `pendente_reprocessamento` e depende de clique manual ("reprocessar"); nenhum job varre `pendente_reprocessamento` (`grep -rln pendente_reprocessamento scripts src/app/api infra` → só `backfill-evidence.ts`).
- **Evidência**: citadas; incidente de 31/08 (modelo aposentado) exigiu reprocessamento manual sessão a sessão (BACKLOG D75).
- **Impacto**: Gemini lento = terapeuta preso no botão "Consolidar" sem teto; indisponibilidade = fila manual invisível para o coordenador (a exceção "extração travada" só aparece em `/sessoes`).
- **Recomendação**: timeout explícito (ex. 45s) + 1 retry com backoff; job `reprocessar-extracoes-pendentes` com heartbeat no alarme; gravar `latencia_ms` (`DA-02`).
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

#### A-04 · Feature flags sem ponto único

- **Status**: NOVO · **Disciplinas**: DX, Architecture · **Tipo**: Tech Debt
- **Problema**: `src/lib/flags.ts` declara-se "primeiro flag do repo" (`asrHabilitado`), mas `EXTRACTION_LLM_ENABLED`, `FAMILY_REPORT_LLM_ENABLED` e `CONVENIO_REPORT_LLM_ENABLED` são lidas inline em três providers, com convenção de nome diferente (`FEATURE_FLAG_*` vs `*_LLM_ENABLED`).
- **Evidência**: `src/lib/flags.ts:1-24`; `extraction/provider.ts:94-95`; `report/familia/provider.ts:25-26`; `report/convenio-narrativo/provider.ts:78-79`.
- **Impacto**: gates legais (D57/D66) não têm inventário; um novo agente pode nascer sem gate.
- **Recomendação**: centralizar leitura em `flags.ts` com um teste que lista todas as flags e seus defaults fail-closed.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### A-05 · Quatro cópias de `autorizado()` e fallback de token entre superfícies de job

- **Status**: NOVO · **Disciplinas**: Security, DX · **Tipo**: Refactor / Security Issue
- **Problema**: `billing/fechar-ciclos`, `billing/conciliar`, `jobs/asr-transcrever` e `jobs/exportacao-integral` reimplementam a comparação bearer em tempo constante. A última aceita `EXPORT_JOB_TOKEN ?? INTERNAL_JOB_TOKEN ?? BILLING_JOB_TOKEN` — `INTERNAL_JOB_TOKEN` não existe no `.env.example`, e o fallback para o token de billing permite disparar exportação de acervo com o segredo de cobrança.
- **Evidência**: `src/app/api/internal/jobs/exportacao-integral/route.ts:10-24`; `billing/fechar-ciclos/route.ts:41-51`; `billing/conciliar/route.ts:71-79`; `jobs/asr-transcrever/route.ts:119-129`. A revisão pós-merge do ASR (T22) achou justamente um bug numa dessas cópias (comprimento curto-circuitado).
- **Impacto**: cada cópia é um lugar para o mesmo bug; segredo de uma superfície abre outra.
- **Recomendação**: `src/lib/security/autorizar-bearer.ts` único, com teste de mutação; remover fallbacks.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### A-06 · Tipagem `any` sobre jsonb clínico na linha do tempo

- **Status**: NOVO · **Disciplinas**: Tech, Data · **Tipo**: Tech Debt
- **Problema**: `pacientes/[id]/timeline/queries.ts:32-33,179-180,234,273,457` e `supervisao/queries.ts:38,56` tipam `repertorioState`, `segmentacao`, `classificacaoOriginal`, `detalhe` e `tx` como `any`; `timeline-client.tsx:865` mapeia `ev: any`.
- **Impacto**: mudança no formato do snapshot (ex. `PR-04`) quebra em runtime na tela mais importante, sem typecheck.
- **Recomendação**: schemas Zod de `session_snapshot.repertorio_state`/`segmentacao` compartilhados entre `materializar.ts` e as queries.
- **Prioridade**: P3 · **Esforço**: M · **Confiança**: Alta

### 5.4 QA

#### Q-01 · Reaprovar uma extração em `erro_validacao` gera `aprovada` sem nenhuma evidência

- **Status**: NOVO · **Disciplinas**: QA, Tech, Governança · **Tipo**: Bug
- **Problema**: em `transicionar()` (`revisao/[sessionId]/logic.ts:297-380`), se `inserirEvidenciasOnApprove` lançar, a transação reverte e o catch ("DLQ") faz `UPDATE extraction SET estado='erro_validacao', payload_editado={error: errorMsg}` **sem** guard de `versao`. O `WHERE` de `transicionar` aceita `estado IN ('sugerida','erro_validacao')`, então o terapeuta pode aprovar de novo; `inserirEvidenciasOnApprove` lê `row.payloadEditado ?? row.payload` (`:196`) → `{error}` → `alvos = []` → estado `aprovada`, zero linhas em `evidence`, sem aviso. `briefing/logic.ts:75` também usa `payloadEditado ?? payload` e trataria `{error}` como payload ABC.
- **Evidência**: linhas citadas; `evidence-on-approve.int.test.ts` não cobre `erro_validacao`; `Fase C` da reconsolidação não apaga `erro_validacao` (`diario/[sessionId]/logic.ts:800-809`), então a linha persiste.
- **Impacto**: perda silenciosa de evidência com estado "aprovado" e um objeto de erro num campo clínico.
- **Recomendação**: DLQ escreve em coluna própria (`erro_validacao_detalhe`) e nunca em `payload_editado`; reaprovação a partir de `erro_validacao` exige `payload` original; teste de mutação para o caminho de falha.
- **Prioridade**: P1 · **Esforço**: M · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` §4 nomeia o padrão de memória `erro-renderizado-como-empty-state` ("catch que vira estado vazio transforma falha de leitura em afirmação clínica falsa") e o aplica ao cartão de prontidão. Este achado é da **mesma família** (falha de escrita gravada como conteúdo clínico e reaprovada como fato), mas a spec **não o cobre**: nada em `revisao/[sessionId]/logic.ts` é tocado. Status permanece **NOVO/P1**; vale citar este achado ao implementar a spec como o exemplo de "catch que mente" já existente em produção.

#### Q-02 · Reconsolidar a nota após aprovação parcial duplica sugestões e, ao aprovar, evidências

- **Status**: NOVO · **Disciplinas**: QA, Data · **Tipo**: Bug (Forte indício)
- **Problema**: `deveReextrair` retorna `true` quando o texto mudou; a Fase C apaga só `sugerida`/`pendente` e preserva revisadas (correto), mas o provider recebe a nota inteira sem lista do que já foi aprovado (`context-loader.ts:47`: "fonte futura = extrações aprovadas"). A IA sugere de novo os mesmos fatos; aprovar cria `evidence` com `extraction_id` novo (`uq_evidence_alvo` é por extração, `schema.ts:1393`).
- **Evidência**: `diario/[sessionId]/logic.ts:719-830`; `reextraction-policy.ts`; nenhum teste em `actions.int.test.ts` cobre "reconsolidar com aprovadas existentes" (só idempotência de `consolidar`).
- **Impacto**: contagem/percentual inflado no snapshot; terapeuta re-revisa o que já decidiu (custo da métrica de ativação).
- **Recomendação**: passar ao contexto canônico o resumo das extrações já decididas (instrução "não repetir") e/ou dedup por `(session, alvo, trecho_fonte)` na Fase C; teste de integração com stub que devolve duplicata.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Média (efeito deduzido do código; não executado)

#### Q-03 · Revisão do terapeuta sem teste de OCC/double-approve; "aprovação sem evidência" codificada como esperado

- **Status**: NOVO · **Disciplinas**: QA · **Tipo**: Test Gap
- **Problema**: `revisao/[sessionId]/*.int.test.ts` não exercita `versao` obsoleta (→ `CONCURRENCY_ERROR`) nem duas aprovações concorrentes (`Promise.all`); os testes de OCC existem só em `validacao`, `supervisao`, `duvidas`, `tcc/sugestoes`. `evidence-on-approve.int.test.ts:184` fixa "sessão sem `numero_sequencial`: aprovação segue OK, mas evidence NÃO é inserida" — o `TODO(Fase 4)` de `logic.ts:180-186` depende de `scripts/backfill-evidence.ts`, manual e sem agendamento.
- **Evidência**: `grep -n "test(" src/app/(app)/revisao/[sessionId]/*.int.test.ts`.
- **Impacto**: regressão de OCC no fluxo central passaria; perda silenciosa de evidência é "verde".
- **Recomendação**: dois testes (versão obsoleta; concorrência real) e transformar o cenário `:184` em erro explícito ou em job.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### Q-04 · Não existe teste de alcance de rota nem e2e do coordenador

- **Status**: NOVO · **Disciplinas**: QA, Product · **Tipo**: Test Gap
- **Problema**: 17 e2e/10 arquivos, todos no papel de terapeuta demo ou públicos; nenhum abre fila de validação, reclassifica, reconhece alerta de risco. Nenhum teste afirma que cada `src/app/(app)/**/page.tsx` é alcançável por `nav.ts`, `<Link>` ou `redirect()`. `excecoes/a11y.test.tsx` e `pendencias/a11y.test.tsx` testam páginas que hoje são `redirect()`.
- **Evidência**: `ls e2e/`; `grep -n "test(" e2e/*.spec.ts`; `.github/workflows/ci.yml:287` (`--min-tests=17`).
- **Impacto**: `PR-01`/`PR-02` invisíveis ao CI; o gate de contagem protege quantidade, não caminho crítico.
- **Recomendação**: teste unitário de alcance (varre páginas × grafo de links); e2e "coordenador confirma e reclassifica" e "coordenador reconhece alerta"; subir `--min-tests` só depois.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` cria 3 superfícies novas (cartão no layout do prontuário, pill em `/pacientes`, bloqueio em `/sessoes/[id]`) e sua seção "6. Prova" cobre componente/a11y e int-tests, mas **não** e2e por papel nem alcance. Sem o teste de alcance recomendado aqui, a spec entra com o mesmo ponto cego da #512. Achado permanece **NOVO/P2**, com a spec como primeiro caso de uso concreto.

#### Q-05 · Oráculo de RLS é allowlist positiva — não detecta definer novo sem guard

- **Status**: NOVO · **Disciplinas**: QA, Security · **Tipo**: Test Gap
- **Problema**: `clinic-id-helper-rls.int.test.ts` prova "nenhuma função usa `current_setting` cru" e "estas 21/15/9/3 funções usam os helpers". Não prova "toda função `prosecdef` com `EXECUTE` concedido a `app_role` e ao menos um argumento (a) chama um helper de tenant/identidade ou delega a função que chama, ou (b) está numa allowlist explícita de globais com justificativa". Foi assim que `S-02` (e antes o PR #422) passaram.
- **Evidência**: `db/tests/clinic-id-helper-rls.int.test.ts:419-560`; varredura desta auditoria sobre 63 definers.
- **Recomendação**: teste que consulta `pg_proc` × `information_schema.routine_privileges` e exige allowlist nomeada (`app_cpf_hash_usado_em_outro_trial`, `app_asr_objetos_em_uso`, …) com comentário do porquê.
- **Prioridade**: P1 · **Esforço**: S · **Confiança**: Alta

#### Q-06 · Flake conhecido em `e2e/represcricao-mv4.spec.ts:33` continua sem issue

- **Status**: JÁ CONHECIDO (`checkpoint.md` §0.1) · **Disciplinas**: QA, Processo · **Tipo**: Test Gap
- **Problema**: `retries: 2` no CI e o gate só loga `flaky`; não há issue rastreando a causa. Não verificável offline se ainda ocorre.
- **Recomendação**: abrir issue com o run id e a assertiva que oscila; `--max-flaky=0` quando fechar.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta (lacuna de processo)

#### Q-07 · "exit 0 mentiroso" recorre na exportação integral

- **Status**: NOVO · **Disciplinas**: QA, Observability · **Tipo**: Bug
- **Problema**: `jobs/exportacao-integral/route.ts:40-56` responde `200 {ok:true, processados:[{status:'falhou', erro}]}` mesmo quando todo bundle falha; `scripts/exportacao-acervo.mjs:105-121` sai `0` se HTTP ok. Sem cobertura do alarme (`DA-03`).
- **Evidência**: citadas; `scripts/exportacao-acervo.test.mjs` (55 linhas) não testa corpo com `falhou`.
- **Impacto**: acervo pendente "para sempre" sem sinal — o cenário que a #105 ensinou.
- **Recomendação**: `ok:false` + status ≠ 200 quando `processados.some(p => p.status === 'falhou')`; script propaga.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### Q-08 · Guardrail de ambiente cobre só scripts chamados `seed*`

- **Status**: NOVO · **Disciplinas**: QA, Security · **Tipo**: Test Gap
- **Problema**: `guardrail-seed-wiring.test.ts` deriva a lista de `package.json` (`seed`/`seed:*`). `unlock-user.ts`, `backfill-evidence.ts`, `smoke-alerta-risco.mjs`, `check-patient.ts` abrem conexão com role dona sem `assertSeedAllowed`.
- **Recomendação**: fiação por capacidade (`grep "postgres("` em `scripts/**`), não por nome. Ver `S-04`.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

### 5.5 UX / UI

#### U-01 · `CONCURRENCY_ERROR` e "Erro interno no servidor." chegam literais ao terapeuta

- **Status**: NOVO · **Disciplinas**: UX, Microcopy · **Tipo**: Bug
- **Problema**: `revisao-lista.tsx:155-157,229` renderiza `state.error` cru; `transicionar()` devolve `{ok:false, error:"CONCURRENCY_ERROR"}` para versão obsoleta (segunda aba, coordenador mexeu antes). Só `supervisao-fila.tsx:87,177,226` traduz. Cinco `actions.ts` devolvem "Erro interno no servidor." (`alertas-risco`, `clinica/dados`, `clinica/emergencia`, `perfil`, `supervisao`), copy que não diz o que fazer — contra o padrão "o áudio não foi enviado — toque para tentar de novo".
- **Evidência**: citadas.
- **Recomendação**: dicionário único de erro→copy (`src/lib/copy/erros.ts`) com tom literal e ação ("Alguém alterou esta evidência antes de você. Recarregue para ver a versão atual.").
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### U-02 · Card de extração _sugerida_ na revisão usa a elevação de "fato"

- **Status**: NOVO · **Disciplinas**: UX, Design System · **Tipo**: Design Debt
- **Problema**: `revisao-lista.tsx:303` — `<article class="... border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]">` (borda sólida, sombra brutal levantada = `--elevation-2` "fato consolidado", `globals.css:221-231`). A única marca de tentativo é o `StatusBadge estado="sugerida"` (pequeno). A fila do coordenador usa outro componente (`ConfidenceCard` com `pillVariant:"inset"`). A "faixa" de fricção (`h-2` colorida `bg-mint/gold/terracotta`) é cor + texto, ok.
- **Evidência**: citadas; `docs/ux/design-system-espectro-brutal.md` §3.C/§4.1; `DESIGN.md:156`.
- **Impacto**: no fluxo mais frequente do terapeuta (7-8 vezes/dia), o candidato da IA tem a mesma "solidez" que uma evidência aprovada — a regra 4 do DS ("candidato ≠ conquistado") depende de um selo de 14px.
- **Recomendação**: `surface("ia")` (inset + tracejado) no card enquanto `sugerida`; ao aprovar, transição para elevação 2 — o próprio gesto vira semântica.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### U-03 · A linha do tempo do paciente reimplementa o design system ad hoc; `evidence-timeline` do DS está órfão

- **Status**: NOVO · **Disciplinas**: UX, UI, Design System, Accessibility · **Tipo**: Design Debt / Refactor
- **Problema**: `pacientes/[id]/timeline/timeline-client.tsx` (972 linhas) usa `border-gray-400 bg-gray-100 text-gray-400` (`:663`), `border-black` (`:645`), classe inexistente `text-status-success-text` (`:645` — não há token; o `✓` herda cor), `text-[10px]` (`:641,:669`), status transmitido por `title=` e glifos `✓ ★ ○` sem `aria-label` (`:644-668`), barra empilhada conquistado/candidato só por cor + `title` (`:604-618`). Enquanto isso `components/ui/evidence-timeline.tsx`, `metric-card`, `indicator`, `interactive-card`, `card-grid` têm zero consumidores em produção.
- **Evidência**: citadas; contraste medido `#9ca3af` sobre `#f3f4f6` = **2.31:1**.
- **Impacto**: a tela que materializa a tese ("evidência acumulada, rastreável") é a que menos respeita o DS e a a11y; DS que ninguém consome vira Storybook decorativo.
- **Recomendação**: extrair `MarcoStatus` (conquistado/candidato/não atingido) e `BarraProgressoEpistemica` para `ui/patterns` com texto acessível e padrão não-cromático; apagar ou adotar os órfãos.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

> **Nota de reavaliação (02/09/2026)** — a spec `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` §5 ("fecha D2") substitui o estado vazio de Evolução em `pacientes/[id]/page.tsx` ("Agendar Primeira Sessão") pelo `CartaoProntidao`. Isso toca o **estado vazio**, não `timeline-client.tsx`; a reimplementação ad hoc, o `evidence-timeline` órfão e os problemas de contraste/a11y descritos aqui **não são cobertos**. Status permanece **NOVO/P2**. Observação: o novo cartão nasce em `src/components/app/` (não em `ui/`) — a spec deveria dizer por quê (ver memo R-7).

#### U-04 · Tipografia abaixo de 12px em telas mobile-first

- **Status**: NOVO · **Disciplinas**: UX, Accessibility · **Tipo**: Design Debt
- **Problema**: 32 `text-[10px]` e 10 `text-[11px]` em 22 arquivos, incluindo `lista-pacientes.tsx`, `lista-terapeutas.tsx`, `bottom-nav.tsx:100` (badge), `timeline/scrubber.tsx`, `protocol-dashboard-charts.tsx`. `PRODUCT.md` define terapeuta "sob pressão, mobile, luz incontrolável".
- **Recomendação**: piso de `text-xs` (12px) como token e lint contra `text-[1[01]px]`.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

### 5.6 Accessibility

#### AC-01 · Estado epistêmico transmitido só por cor/ícone na linha do tempo

- **Status**: NOVO · **Disciplinas**: Accessibility, Design System · **Tipo**: Accessibility Issue
- **Problema**: ver `U-03` — barra empilhada verde/violeta com `title` (não anunciado por leitor de tela nem visível no toque), glifos sem nome, "Candidato" só em `title`. O DS exige "nunca cor sozinha" (`design-system-espectro-brutal.md:167`).
- **Recomendação**: `<span class="sr-only">Conquistado</span>` + padrão de preenchimento (hachura suave, não listrado de alto contraste) na barra; `aria-label` nos glifos.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### AC-02 · Contraste abaixo de AA em elementos ad hoc

- **Status**: NOVO · **Disciplinas**: Accessibility · **Tipo**: Accessibility Issue
- **Problema**: tokens do DS passam (medido: `text-secondary` 4.83:1 em card, 4.58:1 em `bg-app`; `status-ia-fg` 9.95:1; `success` 5.42:1; `error` 4.66:1). Falha onde a paleta crua entra: "não atingido" 2.31:1 (`timeline-client.tsx:663`); painel admin (`text-slate-400` sobre `bg-slate-900/60`) não medido, provável limítrofe.
- **Recomendação**: proibir paleta crua (`DS-05`) e adicionar teste de contraste sobre tokens (jsdom não calcula — usar tabela estática como a desta auditoria).
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### AC-03 · Cobertura de axe não alcança a tela mais crítica; e2e com axe só na landing

- **Status**: NOVO · **Disciplinas**: Accessibility, QA · **Tipo**: Test Gap
- **Problema**: 24 `a11y.test.tsx` (jsdom) cobrem rotas, mas não `pacientes/[id]/timeline`; `@axe-core/playwright` só em `e2e/landing-a11y.spec.ts` — nenhuma página autenticada passa por axe com cores reais (jsdom não computa contraste).
- **Recomendação**: axe no e2e do diário e da fila; `a11y.test.tsx` para `timeline-client`.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

### 5.7 Design System

#### DS-01 · Painel super-admin em linguagem visual própria ("SaaS dashboard")

- **Status**: NOVO · **Disciplinas**: Design System, UI · **Tipo**: Design Debt
- **Problema**: `src/app/(admin)/benjamin/**` e `components/admin/kpi-card.tsx`/`admin-nav.tsx` usam `bg-slate-900/60 rounded-xl shadow-sm border-teal-500/40`, badges `emerald/amber/indigo/rose` — 87 classes de paleta crua nos 3 arquivos mais afetados; `KpiCard` é o "hero-metric" listado como anti-referência, e duplica `ui/metric-card`/`ui/stat`.
- **Impacto**: baixo para o usuário final (só o dono vê), alto para o sistema: dois vocabulários no mesmo repo, sem Storybook.
- **Recomendação**: admin consome `ui/` com `data-mode="admin"` se precisar de tema escuro; apagar `kpi-card`.
- **Prioridade**: P3 · **Esforço**: M · **Confiança**: Alta

#### DS-02 · "Candidato a domínio" usa o violeta/tracejado de "sugerido pela IA"

- **Status**: NOVO · **Disciplinas**: Design System, Product · **Tipo**: Design Debt
- **Problema**: `timeline-client.tsx:652-658` pinta o marco `isCandidata` (derivado de evidência **aprovada**: nível de ajuda caindo) com `border-dashed border-[var(--status-ia-border)] bg-[var(--status-ia-bg)]`. O DS reserva o violeta para "sugerido pela IA, ainda não é fato" (`DESIGN.md:107`; `design-system-espectro-brutal.md:130`). O candidato a domínio é fato derivado de decisão humana, apenas ainda não consolidado.
- **Impacto**: colisão semântica — o coordenador lê "IA sugeriu" onde a régua diz "3 sessões consecutivas com independência".
- **Recomendação**: par de tokens próprio para "em progresso/candidato a domínio" (ex. `--status-progresso-*`, âmbar-neutro, borda sólida fina) documentado na §3.C.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### DS-03 · Resíduo do acento lateral banido (D54) e `ClinicalQuote` subutilizado

- **Status**: PARCIALMENTE MAPEADO (D54 fechou só o `Alert`) · **Disciplinas**: Design System · **Tipo**: Design Debt
- **Problema**: 16 usos de `border-l-2/-4` em `app/` e `ui/` fora do `Alert`; `confidence-card.tsx:130` e `revisao-lista.tsx:321` fazem `<blockquote class="border-l-2 …">` ad hoc, enquanto `ui/clinical-quote.tsx` (com teste e story) só é consumido por `alerta-risco-card`.
- **Recomendação**: `ClinicalQuote` em toda citação de trecho-fonte; lint contra `border-l-[`/`border-l-2`.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### DS-04 · `StatusBadge` com variantes duplicadas por caixa e docblock divergente

- **Status**: NOVO · **Disciplinas**: Design System · **Tipo**: Tech Debt
- **Problema**: `BadgesVariantes` aceita `"success"|"Success"|"ai"|"AI"|"info"|"Info"|"warning"|"Warning"` (`patterns/status-badge.tsx:33-45`), com mapas duplicados; docblock diz "contorno tracejado **sem fill**" mas a variante `ai` tem `bg-[var(--status-ia-bg)]`. Dois caminhos de import (`ui/status-badge` re-exporta `patterns/`).
- **Recomendação**: API única minúscula; alinhar doc ou estilo.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### DS-05 · A "Regra 0" (nunca estilizar ad hoc) não tem enforcement

- **Status**: NOVO · **Disciplinas**: Design System, DX · **Tipo**: Improvement
- **Problema**: `AGENTS.md` Regra 0 é convenção; `eslint.config.mjs` não tem regra contra paleta crua (`bg-slate-*`, `text-gray-*`), `text-[Npx]`, `border-black`. Medido: 87 usos de paleta crua em `src/app` + `src/components` (fora landing), 42 tamanhos <12px, 4 `eslint-disable`.
- **Recomendação**: `eslint-plugin-tailwindcss`/regra custom com allowlist de tokens; rodar no `lint` do CI com baseline.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

### 5.8 Performance

#### PF-01 · N+1 residual em `supervisao/queries.ts` (nomes por alerta reconhecido)

- **Status**: NOVO (D40 fechou `materializarSnapshot`, não este) · **Disciplinas**: Performance · **Tipo**: Performance Issue
- **Problema**: `supervisao/queries.ts:236-262` faz até 3 `SELECT` por alerta `reconhecido` sem sinal vivo (`patient`, `goal`, `protocol`), dentro de `for (const alert of alertaRows)`.
- **Impacto**: proporcional ao número de alertas históricos; tela do coordenador.
- **Recomendação**: `inArray` em lote como no PR #417; oráculo de contagem de query no teste.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### PF-02 · PDF por Chromium in-process com semáforo por instância e espera ilimitada

- **Status**: NOVO · **Disciplinas**: Performance, Architecture · **Tipo**: Risk
- **Problema**: `report/playwright-renderer.ts` lança Chromium dentro do container do app; `render-lock.ts` serializa (`RENDER_MAX_CONCURRENCY`, default 1, não documentada no `.env.example`) com fila em memória sem timeout de aquisição; `timeout: 30_000` só no `page`.
- **Impacto**: N exportações simultâneas = N×30s enfileirados no request HTTP; réplica horizontal do app quebra o semáforo.
- **Recomendação**: timeout de espera + resposta 503 amigável; a médio prazo, render em job (`infra/exportacao` já existe como padrão).
- **Prioridade**: P3 · **Esforço**: S (timeout) / M (job) · **Confiança**: Alta

(`A-03` — Gemini sem timeout — também é Performance.)

### 5.9 DX

#### DX-01 · 17 variáveis de ambiente lidas no código não existem no `.env.example`

- **Status**: NOVO · **Disciplinas**: DX · **Tipo**: Tech Debt
- **Problema**: `INTERNAL_JOB_TOKEN`, `RESEND_API_KEY` (fallback em `email/transacional.ts:22`), `EMAIL_REMETENTE`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `RENDER_MAX_CONCURRENCY`, `GEMINI_TEST_MODEL`, `ALARME_*`, `ESCALONAMENTO_*`, `ARQUIVAMENTO_*`, `RETENCAO_*` (`_DATABASE_URL`/`_HEARTBEAT_DIR`), `SMOKE_*`, `ALLOW_SEED_REMOTE`, `CI_BASE_REF`. `CLAUDE.md` declara `.env.example` como o mapa obrigatório do Jules.
- **Evidência**: diff entre `process.env.X` em `src|scripts|infra` e chaves de `.env.example` (CRLF normalizado).
- **Recomendação**: teste unitário que compara os dois conjuntos (allowlist para `NODE_ENV`, `CI_*`).
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### DX-02 · `checkpoint.md` congelado em 23/08 enquanto o `BACKLOG.md` avançou 20 sessões

- **Status**: NOVO · **Disciplinas**: DX, Processo · **Tipo**: Tech Debt
- **Problema**: a ordem de onboarding (`CLAUDE.md`, prompt §2.4) manda ler `checkpoint.md` como "estado da última sessão"; ele descreve PR #422 aberta, D36/D39/D57 pendentes — tudo fechado desde então. `docs/checkpoints/` (citado nos daily summaries) não existe.
- **Recomendação**: ou regenerar por sessão (o daily summary já faz isso) ou remover do fluxo de onboarding.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### DX-03 · Manifestos `.well-known` decorativos que sobreviveram ao `0ca28bf6`

- **Status**: NOVO (validação do achado-semente: `read:patients`/`get_patient_dossier_summary` eliminados; domínio consistente `irisclinica.ia.br` em 5 arquivos) · **Disciplinas**: DX, Security · **Tipo**: Improvement
- **Problema**: `openid-configuration` e `oauth-authorization-server` publicam documentos não conformes (sem `authorization_endpoint`, `jwks_uri`, `response_types_supported`) "só para não devolver 404" (`openid-configuration/route.ts:3-6`). Um cliente OIDC que faça discovery quebra de forma confusa em vez de 404 limpo.
- **Recomendação**: remover as duas rotas (404 é a resposta honesta) ou publicar só `api-catalog`/`ai-catalog`.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

#### DX-04 · `minio/minio:latest` sem pin e `.env.example`/`BACKLOG.md` com CRLF

- **Status**: NOVO · **Disciplinas**: DX · **Tipo**: Tech Debt
- **Problema**: `infra/docker-compose.yml:30` usa `latest` (Postgres é `17-alpine`); `.env.example` e `BACKLOG.md` têm terminador CRLF (o `S3Client` já quebrou por mudança de comportamento do MinIO em 31/08, #504).
- **Recomendação**: pin por tag/digest; `.gitattributes` com `* text=auto eol=lf`.
- **Prioridade**: P3 · **Esforço**: S · **Confiança**: Alta

### 5.10 Data / Analytics / Observability

#### DA-01 · A métrica de ativação não é medida em lugar nenhum

- **Status**: NOVO · **Disciplinas**: Product, Data-Analytics · **Tipo**: Missing Feature
- **Problema**: "≥70% aprovação sem edição" (`PRODUCT.md:34`, `modelo-de-negocio.md:279,294`). `grep` por evento de produto (`ClaritySDK.event`, `gtag('event'`) → 0; nenhuma query agrega `extraction.estado ∈ {aprovada, editada}` por clínica/período (`briefing/logic.ts:72` filtra, não conta); painel admin conta fichas, webhooks e alertas. Commit `857590b2`: "Custom tags/events deferred until concrete product use cases identified".
- **Impacto**: a decisão de negócio mais importante do doc de modelo de negócio ("sem isso, não contratar vendas") não tem número; a IA pode piorar (troca de modelo, prompt) sem ninguém ver.
- **Recomendação**: view SQL `metricas_extracao_por_clinica_semana` (aprovadas / editadas / descartadas / tempo até revisão), exposta no painel admin e no `/supervisao` do coordenador ("métricas transparentes" do mapa) — sem terceiro, sem PII.
- **Prioridade**: P1 · **Esforço**: M · **Confiança**: Alta

#### DA-02 · Extrações não registram modelo, versão de prompt, latência nem tokens

- **Status**: NOVO · **Disciplinas**: Data, Observability, Governança de IA · **Tipo**: Missing Feature
- **Problema**: colunas de `extraction` (`schema.ts`): id, sessão, clínica, estado, subtipo, trecho, confiança, justificativa, inconsistente, par, payload, criado, editado, revisado_por/em, versão. Nada identifica **qual** Gemini (`GOOGLE_EXTRACTION_MODEL` muda sem deploy) nem qual `prompt.ts` (R1-R19 evoluem) produziu a sugestão; `gemini-invoker.ts` descarta `usageMetadata`.
- **Impacto**: impossível correlacionar taxa de edição com versão de prompt/modelo (`DA-01`), estimar custo por clínica (modelo de preço por ficha ativa) ou responder a um titular "que sistema gerou esta sugestão".
- **Recomendação**: `modelo`, `prompt_versao` (hash do `prompt.ts`), `latencia_ms`, `tokens_entrada/saida` — migração Drizzle-gerada + GRANT.
- **Prioridade**: P2 · **Esforço**: S · **Confiança**: Alta

#### DA-03 · O alarme de jobs cobre 3 de 8 serviços de produção

- **Status**: PARCIALMENTE MAPEADO (incidente 26/08 registrado; sem D aberto) · **Disciplinas**: Observability · **Tipo**: Risk
- **Problema**: `scripts/alarme-jobs.mjs` verifica `billing`, `escalonamento`, `backup-offsite` (`:124,153,205`). Sem detector: `retencao` (aviso prévio LGPD — ficou mudo 1 dia em 25/08 e só foi visto em auditoria manual de logs), `arquivamento`, `exportacao`, `asr` (worker + sweeper), `expurgo-audit-log`, `conciliacao`.
- **Evidência**: BACKLOG sessão 26/08 (2ª): "nenhum dos dois caminhos tinha alarme sobre si mesmo".
- **Recomendação**: heartbeat por serviço em tabela (`job_heartbeat`) escrito pelo próprio job e lido pelo alarme; um caso por job em `alarme-jobs.test.mjs`.
- **Prioridade**: P2 · **Esforço**: M · **Confiança**: Alta

#### DA-04 · Sem logger estruturado, id de correlação ou métricas

- **Status**: NOVO · **Disciplinas**: Observability · **Tipo**: Improvement
- **Problema**: 144 `console.*` fora de testes, sem prefixo consistente nem JSON; sem `requestId`; sem `pino`/OTel/`prom-client`; GlitchTip só para exceções (`tracesSampleRate: 0`). Dado o `S-03`, o log é ao mesmo tempo pobre e perigoso.
- **Recomendação**: `pino` com redaction por chave (`texto`, `trecho_fonte`, `nome`, `cpf*`), id por request no `proxy.ts`, e contadores simples (extrações/min, latência Gemini, falhas por provider).
- **Prioridade**: P3 · **Esforço**: M · **Confiança**: Alta

---

## 6. Riscos futuros

1. **Escala de clínicas × jobs sem heartbeat** (`DA-03`, `Q-07`): hoje um job mudo é achado por leitura manual de 18 serviços no Easypanel. Com 30 clínicas, o aviso prévio de expurgo ou a exportação de acervo param sem ninguém saber até a reclamação — e o prazo legal (Art. 18 LGPD, 15 dias) corre.
2. **Troca de modelo/prompt sem rastro** (`DA-02`, `DA-01`): a próxima aposentadoria de id do Google (já aconteceu em 31/08) ou um ajuste em R1-R19 muda a taxa de edição e ninguém consegue provar quando nem por quê.
3. **Crescimento de modalidades sobre `diario/[sessionId]/logic.ts`** (`A-02`, `A-03`): TCC, convencional e ASR já convivem ali; a próxima modalidade (fono com instrumentos próprios?) entra na mesma Server Action que chama o LLM inline.
4. **Multi-coordenador (D76/#520)** cruza com `PR-01`/`PR-05`: a fila por evidência que hoje nem existe na UI terá de ser redesenhada para "coordenador da disciplina", e a régua de "quem é o terapeuta" precisa estar unificada antes.
5. **Definers novos sem oráculo** (`Q-05`): cada feature nova (ASR trouxe 6, anamnese 3, sigilo 4) adiciona `SECURITY DEFINER`; o teste positivo cresce à mão e o ponto cego permanece.
6. **Retenção de log de stdout** (`S-03`): com PHI no log do Easypanel, a política de retenção de dados passa a depender de um painel que não é do Iris.
7. **Publicação na Play Store (D70)** com `Clarity` no app: a revisão de dados da loja exige declarar SDKs de terceiros que coletam dados de saúde — `S-01` vira bloqueio de publicação.
8. **Repositório público (se for)** com `BACKLOG.md` como diário operacional (`S-09`).

## 7. Oportunidades de produto que merecem discovery

1. **Painel de "saúde da IA" para o coordenador** (deriva de `DA-01`/`DA-02`): % aprovado sem edição, por terapeuta e por modalidade, com o texto do "por quê" das edições — é a "métrica transparente" prometida no mapa e o argumento de venda para a clínica seguinte.
2. **Jornada de cobertura (sessão substituta)** (`PR-05`): briefing para quem cobre, autoria correta, sigilo por disciplina — demanda real toda semana em clínica multidisciplinar.
3. **Cadeia de suporte por etapa no hexágono** (`PR-04`): o dado já é capturado; a entrega visual é o que o supervisor de ABA olha.
4. **Reprocessamento em lote pelo coordenador** (`A-03`): "10 sessões travadas por falha do provedor → reprocessar todas" em vez de clique por sessão.
5. **Relatório escolar e resumo para WhatsApp** (mapa, ainda 🔴): `report_tipo` já é extensível; o resumo de 2 frases sem dado sensível é subproduto barato do diário aprovado.
6. **Copy de erro como produto** (`U-01`, `S-10`): um dicionário único de mensagens literais com ação é diferencial percebido pelo terapeuta sob pressão.

## 8. Débito técnico e arquitetural principal

- **Fronteira `ui/` → `app/`** (`A-01`) e **regra de negócio em rota** (`A-02`): o DS não é isolável e a lógica não é reutilizável fora do App Router.
- **Extração síncrona sem fila/timeout** (`A-03`).
- **Guard de tenant por allowlist** (`Q-05`) + definer sem guard (`S-02`).
- **Erro cru como canal de PHI** (`S-03`, `S-10`, `Q-01`).
- **Réguas duplicadas**: terapeuta da sessão (`PR-05`), bearer (`A-05`), flags (`A-04`).
- **Scripts com role dona fora de guardrail** (`S-04`, `Q-08`).
- **Expurgo de `audit_log` sem distinção de finalidade** (`S-05`).

Achados-semente da seção 4 do prompt — estado em 01/09: cadeia por percentual **JÁ CONHECIDO, ainda aberto** (`PR-04`); D57 **fechado** (25/08, medido; `EXTRACTION_LLM_ENABLED` gateia de fato em `provider.ts:94-95`; `.env.example` mantém `false` com comentário pré-fechamento — pequena defasagem de doc); `.well-known` **resolvido** (`read:patients`/`get_patient_dossier_summary` ausentes, domínio único), com o resíduo em `DX-03` e o parente `S-08`; endereço da sede — pendência legal, **não reportada** aqui; flake `represcricao-mv4` (`Q-06`); "gate checado 3 vezes" — **padrão confirmado em outras features** (`PR-05`, `A-05`).

## 9. Dívida de UX/Design sistêmica

- A **tela do paciente** (linha do tempo) e o **card de revisão** — as duas superfícies em que a honestidade epistêmica é testada — são as que mais divergem do DS (`U-02`, `U-03`, `AC-01`, `DS-02`).
- O DS tem **componentes canônicos sem consumidor** e telas com **reimplementação ad hoc**; sem enforcement (`DS-05`) a Regra 0 é aspiracional.
- **Dois vocabulários visuais** no mesmo produto (admin vs clínico) (`DS-01`).
- **Erros com voz de máquina** no fluxo mais frequente (`U-01`).
- **Navegação pós-#512** deixou gestos de governança sem porta (`PR-01`, `PR-02`) — a IA da informação foi simplificada para 4 itens sem inventário do que cada item precisava absorver.

## 10. Lacunas de QA por fluxo

| Fluxo                                                     | Coberto por                                                  | Não coberto / quebraria sem teste pegar                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Captura → consolidação → extração                         | unit + int (`actions.int.test.ts`), e2e demo                 | reconsolidação após aprovação parcial (`Q-02`); timeout do provider; reprocessamento em massa                                       |
| Revisão do terapeuta (aprovar/editar/descartar)           | int (RLS, colapso, on-approve), e2e "abrir antes de aprovar" | OCC/double-approve (`Q-03`); caminho DLQ → reaprovação (`Q-01`); copy de erro                                                       |
| Validação do coordenador (confirmar/reclassificar/lote)   | 31 int em `validacao/actions.int.test.ts`                    | **a rota** (`PR-01`, `Q-04`); e2e zero; reclassificação enquanto terapeuta edita (moot hoje)                                        |
| Alerta de risco (criar, notificar, escalonar, reconhecer) | int + `scripts/escalonamento-risco.test.mjs` + RLS           | alcance da fila (`PR-02`); e2e zero; `app_alerta_trecho_fonte` cross-tenant (`S-02`)                                                |
| Sessão substituta                                         | `agenda2-*` (designação)                                     | documentar como substituto (`PR-05`) — não há teste porque não há caminho                                                           |
| Jobs (`scripts/*.mjs`)                                    | teste ao lado de cada um; `alarme-jobs.test.mjs` 38 casos    | corpo `ok:true` com `falhou` (`Q-07`); heartbeat dos 5 jobs sem alarme (`DA-03`); `expurgo-audit-log` (39 linhas, só a função pura) |
| RLS / definers                                            | 74 arquivos int, oráculo de helpers                          | definer novo sem guard (`Q-05`)                                                                                                     |
| Scripts operacionais                                      | `guardrail-seed*.test.ts`                                    | scripts não-seed (`Q-08`)                                                                                                           |
| A11y                                                      | 36 axe jsdom + Storybook + 1 e2e                             | contraste real em página autenticada; `timeline-client` (`AC-03`)                                                                   |
| Segurança HTTP                                            | `proxy.test.ts` (cookie, matcher)                            | headers (`S-06`); duração de sessão (`S-07`)                                                                                        |

## 11. Lacunas de observabilidade — onde não conseguiríamos responder "o que aconteceu"

1. **"Por que esta sugestão ficou assim?"** — sem modelo/prompt/latência na extração (`DA-02`); o log só tem `console.error` com o erro inteiro (`S-03`).
2. **"O job X rodou ontem?"** — só para billing/escalonamento/backup (`DA-03`); exportação responde "ok" com falha (`Q-07`).
3. **"Quem reclassificou isto há 8 meses?"** — apagado pelo expurgo de 180 dias, se o job estiver ligado (`S-05`).
4. **"A IA está piorando?"** — nenhuma série temporal de aprovação/edição (`DA-01`).
5. **"Qual request gerou este erro?"** — sem id de correlação (`DA-04`); GlitchTip só exceções.
6. **"Quantas sessões estão presas em `revisada`?"** — o estado existe (`estado.ts`) mas não há contagem exposta para o coordenador nem alarme (`PR-01`).
7. **"Este usuário foi destravado por script?"** — `unlock-user.ts` não escreve `audit_log` (`S-04`).

---

## Apêndice A — Método e limites

- Passagens executadas: calibração (BACKLOG/specs/checkpoint/git), Tech, Product Design, Product, QA, UX/UI/A11y, cross-functional, edge cases, releitura ("o que esquecemos": levou a `DA-02`, `S-07`, `PR-08`, `Q-04`), consolidação (duplicatas fundidas: `S-10`/`U-01`, `PF-03`→`A-03`, `DA-05`→`S-05`).
- Não executado: `pnpm test*`, `pnpm build`, acesso a Postgres/produção/Easypanel/GitHub; nível de máscara do Clarity; se `expurgo-audit-log` está agendado; visibilidade do repositório; se o flake persiste. Onde isso muda a conclusão, o achado diz "Necessita investigação".
- Contraste calculado pela fórmula WCAG 2.1 sobre os hex dos tokens de `src/styles/globals.css` (modo `clinico`) e das classes cruas encontradas.
- Contagens (linhas, ocorrências) são de `grep`/`wc` em 01/09/2026 sobre a árvore de trabalho; podem variar com o branch.
