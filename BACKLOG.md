# Backlog — Iris

> 🗺️ **Roadmap & Controle de Fases:** O detalhamento granular das tarefas e o acompanhamento de progresso ativo do projeto foram migrados para o **GitHub Issues & Milestones** para máxima economia de tokens de contexto das IAs.
>
> 📂 **Histórico Completo:** O histórico estático detalhado de especificações e reuniões concluídas foi arquivado e preservado em [`docs/archive/historico-backlog.md`](docs/archive/historico-backlog.md) (ignorado para os agentes de IA, mas disponível no Git).

---

## 🧭 Ordem de leitura (linha de billing — Pix Automático)

> **Você está no passo 4 de 4.** Se chegou aqui direto, volte ao passo 1: os três anteriores dizem o que fazer, e este diz **por que** as decisões antigas são o que são.

| #     | Documento                                                                                                 | O que só existe aqui                                                                                                                                                                                           |
| :---- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | [**Ordem de conclusão**](https://claude.ai/code/artifact/59b6c2d8-ea6c-401a-b62f-9572ed26d243) (artifact) | A sequência dos 9 passos e **por que essa ordem** — irreversibilidade, não gravidade. Traz o grafo de dependência, o modelo indicado e o prompt pronto de cada passo.                                          |
| **2** | **A issue do passo corrente** (GitHub)                                                                    | Escopo exato, Definição de Pronto e os comentários com as medições já feitas. ⚠️ `gh issue view --comments` **retorna vazio neste ambiente** — usar `gh api repos/romulosutil/iris/issues/N` e `.../comments`. |
| **3** | [`checkpoint.md`](checkpoint.md)                                                                          | Estado da última sessão: o que foi medido, o que ficou aberto **e por qual motivo**, e o próximo passo concreto.                                                                                               |
| **4** | `BACKLOG.md` (este arquivo)                                                                               | Débitos vivos (D1–D59) e log de sessões. Consulta, não leitura linear — venha buscar o histórico de uma decisão específica.                                                                                    |

**Regra da cadeia:** cada documento aponta para o seguinte. Quem fechar um passo atualiza o `checkpoint.md` **e** acrescenta a sessão aqui — nessa ordem. O artifact só muda quando a ordem dos passos mudar.

---

## 🚀 Painel de Fases (Roadmap MVP)

| Fase    | Tópico Principal                                         |                                                                                                                                                                         Status                                                                                                                                                                          | GitHub Milestone / Issue |
| :------ | :------------------------------------------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------- |
| **0.5** | Design System (Espectro Brutal)                          |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | PR #1                    |
| **1**   | Fundação de Dados & Auth (Fase 1a)                       |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | PR #3                    |
| **1b**  | Fundação Auth + Multi-tenancy                            |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | PR #10                   |
| **1c**  | Cadastro Clínico (ficha + protocolos + equipe)           |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | Issue #4                 |
| **1d**  | Agenda Mínima + Check-in                                 |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | Issue #11                |
| **2**   | Metas & Diário por Texto                                 |                                                                                                                                                                ✅ Concluído (Planos 1-4)                                                                                                                                                                | Issue #5                 |
| **3**   | Extração de Evidências (IA)                              |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | Issue #6 (fechada 13/07) |
| **4**   | Evidências Acumuladas & Gráficos                         |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | Issue #7                 |
| **5**   | Relatórios de Convênio & Supervisão                      |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | Issue #8                 |
| **6**   | Hardening LGPD (fechamento MVP)                          |                                                                                                                                                            ✅ MVP fecha (6.1/6.2/6.3/6.6 ✅)                                                                                                                                                            | Issue #9                 |
| **6b**  | Iris Audio Companion (Modo Ambiente + Ditado de Voz ASR) |                                                                                                                                                    📅 Fast-follow · spec atualizada · gated por DPA                                                                                                                                                     | Issue #72                |
| **7**   | Self-Service & Growth (onboarding + pagamento autônomo)  | 🚧 Em construção (trial #175 ✅ · arquivamento #174 ✅ (D6/D7/D8 fechados) · billing Asaas: Fases A+B+C fechadas, PR #244 mergeada em `main` e deployada em produção (11/08) — `0090` (backfill) e `0091` (drop da tabela do MP) **verificadas por medição em produção**: `subscription.provider` sem default, `mercadopago_webhook_event` inexistente) | Issue #36                |
| **—**   | E-mail transacional (Resend) — canal do RT no estágio 2  |                                                                                                                                                                      ✅ Concluído                                                                                                                                                                       | Issue #126               |

## 🧾 Débitos técnicos abertos

> Lista viva, não log de sessão. Item só sai daqui quando estiver **resolvido e verificado** — não quando a issue relacionada fechar. Cada linha diz o que dói, não só o que falta.

| #       | Débito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Por que dói                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Onde                                                                                                                                                                                        |
| :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D9**  | **Customização White-Label nos PDFs exportados (#120)** — funcionalidade de personalização com logotipo e cores da clínica no cabeçalho do PDF.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Melhoria de produto futura: hoje os PDFs usam o layout auditável padrão da plataforma Iris. **Spec fechada em #258 (26/08/2026)** — formato "Tech Lead Review" com guardrails (config por tenant, contraste WCAG AA, selo Iris inviolável no rodapé, sanitização de upload), diagrama de sequência e 6 tasks atômicas T1–T6. Pronto pra mão de obra, não precisa de `/superpowers:writing-plans`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | #120 · #258 · `src/lib/export/pdf-generator.ts`                                                                                                                                             |
| **D10** | **Assinatura Digital ICP-Brasil A1/A3 (#120)** — integração com certificados ICP-Brasil para relatórios com exigência judicial/pericial.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Melhoria de produto futura: o padrão atual (MFA + SHA-256 + AuditLog) atende ao piso legal, mas certas instâncias judiciais pedem ICP-Brasil. **Spec fechada em #259 (26/08/2026)** — guardrails (PAdES-B-LT, custódia A1 em envelope encryption/KMS, auditoria em `audit_log`, fallback), diagrama de sequência e 6 tasks atômicas T1–T6. Pronto pra mão de obra, não precisa de `/tlc-spec-driven`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | #120 · #259 · `src/lib/export/pdf-generator.ts`                                                                                                                                             |
| **D11** | **Estratégia de Ativo de Dados & Indexação RAG (#120)** — pipeline de tokenização e treinamento de IA sobre históricos exportados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Diretriz de negócio Iris: preservação integral de evoluções e prontuários no banco para vetorização/RAG e aperfeiçoamento dos modelos clínicos. **Spec fechada em #260 (26/08/2026)** — guardrails (RLS na tabela vetorial, consentimento LGPD ativo, anonimização de PII, citação rastreável), diagrama de arquitetura e 6 tasks atômicas T1–T6. Pronto pra mão de obra, não precisa de `/tlc-spec-driven`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | #120 · #260 · `src/lib/extraction/`                                                                                                                                                         |
| **D42** | **O piso de R$ 5,00 decide o gate inteiro, e não só a emissão — então cobrança VIVA de total pequeno nunca chega à tela.** `resolverGateDeDebito` chama `decidirGate(total)` e devolve `adiado` **antes** do laço de reuso (`debito.ts`, ramo `adiar`), então o `provider_charge_id` do ciclo nem chega a ser consultado no gateway. O P-8 documentado em `emitirConsolidada` afirmava o contrário ("cobrança que já existe é apresentada mesmo com total pequeno"); na revisão do PR #339 o comentário foi corrigido para descrever o código, com a divergência nomeada nos dois pontos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Hoje é inofensivo por construção: só existe cobrança viva de total abaixo do piso se alguém tiver emitido abaixo do piso, e é justamente o piso que impede. Vira real no dia em que `PISO_COBRANCA_AVULSA_CENTAVOS` subir (ele é **escolha conservadora, não medição** — a verificação no sandbox segue pendente): cobranças emitidas sob o piso antigo passariam a ficar escondidas da tela, com a dívida viva e o copia-e-cola invisível. A dívida não é perdoada em nenhum dos dois desenhos; o que muda é se a clínica consegue pagar o que já foi emitido. **Não corrigido de carona na revisão do #339 porque é mudança de comportamento, não defeito medido.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | #290 · #310 · `src/lib/billing/debito.ts` (`resolverGateDeDebito`, ramo `adiar`; `emitirConsolidada`, P-8)                                                                                  |

| **D48** | **Decisão pendente do Rômulo: `tcc_rpd_entry.origem_resposta_racional` (`paciente_independente` / `com_apoio_terapeuta` / `nao_informado`).** A issue #389 marcava essa coluna como "proposta não fechada... confirmar com o Rômulo antes de implementar" — não implementada nesta sessão, de propósito. | O RPD formato Padesky (#389) foi entregue sem essa coluna. Se aprovada depois, é migração aditiva simples (coluna nova nullable, sem backfill — não existe hoje). `protocolo-tcc.md` R5 é onde a proposta original está descrita. | #389 · `docs/agente/protocolo-tcc.md` R5 · `src/db/schema.ts` (`tccRpdEntry`) |
| **D63** | **Governança da via excepcional de expurgo está indefinida DE PROPÓSITO — e a indefinição precisa continuar visível.** `app_purgar_paciente_excepcional(uuid, text, text)` (`0128`) purga um prontuário **sem** passar pelo gate de elegibilidade, exigindo apenas `base_legal` não-vazia. Ela não tem UI no V1: hoje só é alcançável pela role dona, por `psql`, e pelo replay pós-restore de tombstones (`reaplicar-tombstones.sql`, #89). Quem além do coordenador autoriza um expurgo antecipado — DPO? responsável pela conta? decisão judicial anexada? — **não** foi decidido, por decisão explícita do Rômulo em 25/08/2026 (`context.md` §4 P5 e §7): não desenhar processo especulativo antes do primeiro pedido real. | O risco não é a função — é ela ganhar UI antes do processo. Uma tela de "expurgo excepcional" sem regra de autorização escrita transforma o único caminho que ignora o prazo legal de guarda numa operação irreversível a um clique de distância, com `base_legal` virando campo de texto que ninguém confere. Enquanto ela exigir `psql` e role dona, o atrito É o controle. **Reabrir quando surgir a primeira demanda real, não antes** — e o gatilho de reabertura é o pedido, não o calendário. | #352 · `context.md` §4 P5, §7 · `db/migrations/0128_retencao_expurgo_wiring.sql` (`app_purgar_paciente_excepcional`) · `infra/backup/reaplicar-tombstones.sql` · #89 |
| **D65** | **Paciente de modalidade `conventional` não tem botão de registrar alta — nem de arquivar.** `AltaDialog` (#352, T10) foi montado nos dois `PageHeader` de `src/app/(app)/pacientes/[id]/page.tsx` (ramo TCC e ramo protocol-driven), mas a modalidade `conventional` **não passa por essa página**: ela redireciona para `/temas`, que não tem `PageHeader`. **Buraco pré-existente, não introduzido por #352** — o arquivamento manual já tinha exatamente o mesmo alcance parcial; #352 só o tornou visível ao pendurar mais uma ação no mesmo ponto de montagem. | Sem `alta_em`, o paciente nunca fica elegível a expurgo: `app_paciente_expurgavel` exige `alta_em IS NOT NULL` (`0128`). Ou seja, prontuário de terapia convencional **nunca entra na fila de retenção** e o prazo legal de guarda nunca começa a correr para ele — a clínica guarda dado de saúde indefinidamente sem que nada no produto sinalize. O conserto não é mover o diálogo: é decidir onde mora a ação de ciclo de vida do paciente numa modalidade cuja tela principal é `/temas`. | #352 · #98 · #99 · `src/app/(app)/pacientes/[id]/page.tsx` · `src/app/(app)/pacientes/[id]/alta-dialog.tsx` · `db/migrations/0128_retencao_expurgo_wiring.sql` (`app_paciente_expurgavel`) |
| **D68** | **Toda PR paga os 11 checks incondicionalmente, mesmo quando o diff é zero-código — e a poda foi ADIADA de propósito, não esquecida.** Medido em 26/08/2026 sobre as 20 PRs mergeadas mais recentes: **9 (45%)** não tocam nenhum arquivo em `src/`, `db/`, `e2e/`, `scripts/` ou `infra/` — 6 delas são de 1 arquivo só (`BACKLOG.md`). Cada PR custa ~15 min de runner (`test` 3m37s + `test-rls` 3m14s + `test-e2e` 2m18s + `build` 1m05s + `lint`/`typecheck` ~1m35s, mais CodeQL). **Feito nesta sessão (risco zero):** `python` removido do CodeQL default setup — o repo tem 3 arquivos `.py`, todos em `scripts/bakeoff/` (ferramenta de eval, não vai para produção, não é importada pela app); ~51s/PR. **Deliberadamente NÃO feito:** tornar `test`/`test-rls`/`test-e2e` condicionais. Três razões medidas, nesta ordem: (1) os quatro estão em `required_status_checks` do ruleset `Main Protection` — `paths:` no `on:` do workflow faz o check nunca reportar e o PR fica `BLOCKED` para sempre (é o D58/#423 reencenado); a única forma segura é `if:` no nível do **job**, porque job _skipped_ reporta sucesso ao ruleset e workflow que não roda não reporta nada; (2) o glob ingênuo "docs-only ⇒ pula `test`" cega justamente o guard de `docs/legal/` — `src/lib/legal.test.ts:160` lê o markdown do disco e asserta conteúdo, então PR doc-only é exatamente onde o `test` é load-bearing (a PR #483 é o caso vivo); (3) jobs rodam em **paralelo**, então pular `test-e2e` (2m18s) não tira 1 segundo do wall-clock, que é ditado pelo job mais lento (`test`, 3m37s) — a poda otimiza cota, nunca latência. **Quando reabrir:** ao virar o repo para privado E a cota de Actions doer de fato (medir a fatura, não estimar). **Como fazer, se fizer:** inverter o predicado — não perguntar "essa PR precisa de RLS?" (indecidível), e sim "essa PR é **provadamente** zero-código?", com allowlist mínima (`*.md` na raiz + `docs/**` menos `docs/legal/**`), default = roda tudo, fail-closed. | O `ci.yml` inteiro é cicatriz de "verde com skip é vermelho disfarçado" — 64 de 68 arquivos RLS pulados em silêncio (comentários das linhas 19-26), pisos medidos `--min-tests`/`--min-files` para reprovar se a suíte encolher. Path filter institucionaliza exatamente o pulo que o resto do arquivo passa 130 linhas impedindo, e o move de "detectável pelo gate" para "invisível por design": o piso protege contra a **suíte** sumir, nada protege contra o **job** sumir. Somado a isso, a regra de atomizar tudo em tasks pequenas vira evasão de filtro sem querer — PR A muda a migração (roda `test-rls`), PR B muda o caller que decide o tenant, e o composto nunca é testado junto. Num produto cujo risco central é vazamento cross-tenant de prontuário, trocar essa garantia por ~3 min de runner é câmbio ruim enquanto o runner é grátis. | `.github/workflows/ci.yml` (jobs `test`, `test-rls`, `test-e2e`, `build`) · ruleset `Main Protection` (required: `lint`, `typecheck`, `test`, `test-rls`, `test-e2e`, `base-must-be-main`) · `src/lib/legal.test.ts:160` · D58 · #423 · D69 |
| **D69** | **`infra/Dockerfile` (a imagem da aplicação) e `infra/Dockerfile.migrate` nunca são construídos em CI — só no deploy.** `scripts/ci/carga-imagens-infra.sh` tem 7 alvos (`escalonamento`, `backup`, `billing`, `retencao`, `alarme`, `exportacao`, `arquivamento`), todos imagens de **job**; nenhum constrói a imagem do app. O `paths` de `.github/workflows/carga-imagens-infra.yml` também não lista `infra/Dockerfile` nem `infra/Dockerfile.migrate` — eles não estão sob nenhum dos subdiretórios listados, então mudar qualquer um dos dois dispara **zero** CI. **Corrigido de carona nesta sessão (buraco irmão, 1 linha):** `infra/alarme/**` faltava no `paths` dos dois gatilhos, apesar de `carga_alarme()` já existir no `case` e em `todos` do script — mesmo bug que o D64 fechou para `arquivamento`. **Não corrigido:** a cobertura da imagem do app em si. | É o desenho de risco que já mordeu duas vezes por caminhos diferentes. O `@swc/helpers`/`module-sync` (next 16.3.1) deixou a imagem verde e o `node server.js` morto no boot — build passou, produção caiu. O `RUN pnpm build` da linha 40 depende de rede externa (fonte do Google) e de `patches/` estar no contexto. Nenhuma dessas falhas é alcançável por `pnpm test`/`typecheck`/`lint`, que rodam contra a árvore do repo com o `node_modules` completo. Hoje o único sinal pré-deploy sobre essa imagem é indireto: o job `build` do `ci.yml`, que prova só "compila sem banco" (ver comentário lá) — não prova COPY, não prova trace do standalone, não prova o reparo do `@swc/helpers`, não prova que o `esbuild` do seed resolve no musl. O custo de descobrir no deploy é uma janela de indisponibilidade, não um CI vermelho. | `infra/Dockerfile` · `infra/Dockerfile.migrate` · `scripts/ci/carga-imagens-infra.sh` (7 alvos) · `.github/workflows/carga-imagens-infra.yml` · `.github/workflows/ci.yml` (job `build`) · D64 · #126 · #157 · D68 |
| **D70** | **Publicação do Iris na Google Play Store (#185, Etapa 3)** — bloqueado em duas frentes: (1) rodar `@bubblewrap/cli init`/`build` numa máquina com JDK 17 + Android SDK (a sessão que fez o resto da issue não tinha esse ferramental) para gerar `twa/twa-manifest.json` e o `.aab` de desenvolvimento; (2) ação do Rômulo — criar conta de organização no Play Console (US$ 25, verificação de alguns dias úteis) e gerar a keystore de release. Todo o resto está pronto e medido: manifesto PWA, Service Worker, `assetlinks.json` parametrizado por env, `.gitignore` blindado contra a keystore. Runbooks: `twa/README.md` (build local) e `docs/arquitetura/publicacao-play-store.md` (Play Console). | O critério de aceite 3 da spec (app instalado sem barra de endereço do Chrome) só é verificável com o `.aab` compilado e instalado num aparelho — nenhuma das duas frentes de bloqueio é evitável por código. | #185 · `twa/README.md` · `docs/arquitetura/publicacao-play-store.md` · `src/app/.well-known/assetlinks.json/route.ts` |
| **D71** | **`audio_capture` não persiste o mime/codec original do clipe de ditado de voz — `Content-Type` fixado em `audio/webm` ao reler do bucket, errado para clipes iOS/Safari (mp4/AAC).** Achado na revisão final da onda T09/T07/T15 de #72. Hoje inerte: `infra/asr/servidor.py` ignora o header `Content-Type` e detecta o formato por magic bytes do conteúdo, então a transcrição funciona mesmo com o header errado. Vira bug real no dia em que o serviço passar a inspecionar o header ou a extensão do arquivo temporário para escolher o demuxer — nesse dia um clipe iOS quebra silenciosamente. | O gap existe porque T09 (grava o clipe) e T07 (lê pra transcrever) nunca precisaram do mime até agora — o serviço aceita bytes crus. Fechar antes de habilitar `ASR_PROVIDER=self-hosted` com usuários iOS/Safari reais: persistir `mime_type` em `audio_capture` na gravação (T09) e usá-lo no `Content-Type` da leitura (T07). | #72 · `src/app/(app)/diario/[sessionId]/logic.ts` · `src/app/api/internal/jobs/asr-transcrever/route.ts` · `infra/asr/servidor.py` |
| **D73** | **Oito defeitos no pipeline de ASR já mergeado em `main` (PR #490) — todos bloqueadores de ligar `FEATURE_FLAG_ASR_ENABLED`, nenhum alcançável hoje.** Achados na revisão pós-merge de 31/08/2026 e confirmados no código, não deduzidos. Rastreados como T14-T21 na #494. **🔴 (1)** `src/lib/asr/self-hosted.ts:9-24` classifica só `503` como `saturacao`; `401`/`403`/`404`/`502`/`504` e `AbortError` caem no `default: "transitoria"`, então `route.ts:143` calcula `reverter = false`, o clipe gasta tentativa e em `tentativas >= 3` a linha vai a `falhou` **com `objeto_ref = NULL`** — o que faz `app_asr_objetos_em_uso` (`0138`) reportar "fora de uso" e `route.ts:162-164` apagar o objeto. **🔴 (2)** `ASR_SERVICE_TIMEOUT_MS` tem padrão `30_000` (`self-hosted.ts:46-50`), menor que a mediana **medida** na VPS (43,31s, `infra/asr/runbook.md` §2); e nem `ASR_SERVICE_URL` (obrigatória, `self-hosted.ts:28-33` lança sem ela) nem `ASR_SERVICE_TIMEOUT_MS` estão no `.env.example`. **🔴 (3)** `DrizzleQueryError.message` embute os params da query — a transcrição — e `route.ts:149`/`:196`/`:201` devolvem `mensagemDoErro(err)` no corpo, que `scripts/disparo-asr-transcrever.mjs:169` loga literalmente. **🔴 (4)** `logic.ts:388-392` lê `.code` na raiz do erro em vez de `codigoPg()` (`src/db/pg-error.ts`), então o `23505` do `UNIQUE(lote_id, ordem)` da `0137` provavelmente nunca é reconhecido. **🟡 (5)** `0136:79,116,179` concedem `EXECUTE` a `app_role` em três definers cross-tenant que devolvem/mutam dado de outras clínicas. **🟡 (6)** `agendador.sh:97-121` não tem guarda de sobreposição e um tick pode levar ~215s contra `sleep 20`, então 503 é o regime normal e `app_asr_falhar(id, true)` devolve o clipe à fila ignorando o teto — linha e objeto presos para sempre. **🟡 (7)** `logic.ts:334-346` trata "linha inserida" como "lote concluído", deixando linhas `nao_solicitado` órfãs num reenvio pós-queda de conexão. **🟡 (8)** sem índice em `objeto_ref`, `app_asr_objetos_em_uso` faz seq scan a cada clipe. | O atenuante é real e é o que evita chamar isto de incidente: a flag é `false` por padrão (fail-closed), o gate está na autoridade (`logic.ts:313`) e **não existe UI que alcance o pipeline** — nada disso pode disparar hoje. Mas os quatro 🔴 compõem entre si de um jeito que não perdoa: subir como documentado hoje faz o clipe mediano abortar em 30s → `AbortError` → `transitoria` → morto e apagado em 3 ticks, e uma rotação de `ASR_SERVICE_TOKEN` feita só de um lado destrói toda a fila em ~60s. Áudio clínico apagado não volta. Consertar antes de ligar a flag, não depois do primeiro piloto. | #72 · #494 (T14-T21) · PR #490 · `src/lib/asr/self-hosted.ts` · `src/app/api/internal/jobs/asr-transcrever/route.ts` · `src/app/(app)/diario/[sessionId]/logic.ts` · `src/db/pg-error.ts` · `db/migrations/0136_asr_fila.sql` · `db/migrations/0138_asr_objetos_em_uso.sql` · `infra/asr/agendador.sh` · `scripts/disparo-asr-transcrever.mjs` · `.env.example` |
| **D76** | **Modelo de papel não suporta mais de um coordenador por clínica.** Levantado ao decidir #517 (C5, opção 3 — recepção fica sem agendar). Hoje o negócio parte de "o coordenador que define a demanda"; a modelagem assume implicitamente um coordenador só por clínica. Não é bug — é lacuna de modelo. Registrada como issue **#520** (registro + trava da régua correta; **não** propõe implementar). | Só passa a doer se o negócio crescer para clínicas com demanda dividida entre coordenadores. Registrar aqui evita perder o achado até virar prioridade. | #520 · issue #517 · #512 · `docs/ux/jornada-sessao-unificada.md` §2, §3.5, §4 (E4), §7.5 · `.specs/features/512-jornada-sessao-unificada/spec.md` |
| **D77** | (issue **#521**) **A premissa da decisão C5 (issue #517) está factualmente errada: `admin_recepcao` JÁ PODE criar sessão.** Medido em 01/09/2026 ao atomizar a #512: `requireAgendar` (`src/auth/require-role.ts:61`) é `requireRole(ctx, "coordenador", "admin_recepcao")` — e é essa guarda que protege as DUAS ações de criação, `criarRegra` (`src/app/(app)/agenda/queries.ts:327`, guarda `:331`) e `criarAvulsa` (`:556`, guarda `:560`). O comentário da própria guarda diz "coordenador e recepção (`admin_recepcao`) podem agendar". O que é coordenador-only é **a tela** (`agenda/semana/page.tsx:41`), não a permissão. A decisão da #517 ("agendar segue ato exclusivo do coordenador, fica como está") foi tomada acreditando que a autorização nega; ela concede. | Não é bug hoje — é inalcançável por UI. Vira bug no momento em que a jornada unificada trouxer a semana para dentro de `/agenda` (R-29 da spec): a criação de sessão fica **exposta à recepção por consequência acidental de layout**, sem ninguém ter decidido isso. Registrar agora porque a decisão precisa ser retomada com o fato correto ANTES das tasks T09 e T13, não durante. As três opções (gatear a UI / estreitar `requireAgendar` / reverter C5) estão em `.specs/features/512-jornada-sessao-unificada/spec.md` §4 P1. | #517 · #512 · `src/auth/require-role.ts:61` · `src/app/(app)/agenda/queries.ts:327,331,556,560` · `src/app/(app)/agenda/semana/page.tsx:41` · `docs/ux/jornada-sessao-unificada.md` §4 (E4) · `.specs/features/512-jornada-sessao-unificada/spec.md` §4 P1 |
| **D78** | (issue **#522**) **O brief da jornada unificada afirma que "Reabrir revisão" é derivável sem migração — não é.** `evidenceRevisionAcao` (`src/db/schema.ts:164-168`) tem exatamente três valores: `confirmar`, `reclassificar`, `invalidar`. Não existe `reabrir`. O predicado da fila (`src/app/(app)/validacao/queries.ts:17-19`) tira o item da lista **porque** existe linha em `evidence_revision`, e `evidence` é append-only com `UPDATE`/`DELETE` revogados de `app_role` (`src/db/schema.ts:1343-1344`) — não há caminho que devolva o item à fila sem valor de enum novo ou mecanismo novo. | Contradiz `docs/ux/jornada-sessao-unificada.md` §6 ("Não toca: modelo de dados") e a promessa de que a jornada é reversível por `git revert` puro. Importa porque §3.8 usa a reabertura como justificativa para colapsar dois gates em um: sem ela, "1 gesto" vira "1 chance". Três opções (cortar do escopo / enum novo + migração / modelar como `invalidar`) em `.specs/features/512-jornada-sessao-unificada/spec.md` §4 P2. | #512 · `src/db/schema.ts:164-168,1343-1344` · `src/app/(app)/validacao/queries.ts:17-19` · `docs/ux/jornada-sessao-unificada.md` §3.8, §6 · `.specs/features/512-jornada-sessao-unificada/spec.md` §4 P2 · memória `enum-novo-e-check-numa-migracao` |
| **D79** | (auditoria 360 `PR-07`, issue **#537**) **`report_tipo.avaliativo_interdisciplinar` existe no enum e em nenhum lugar do código.** `grep -rn avaliativo_interdisciplinar src` → só `src/db/schema.ts:1533`. Nenhuma query, action, UI ou provider produz ou consome esse valor; o relatório interdisciplinar continua 🔴 no `mapa-jornadas-gaps.md` (estado 09/2026). O valor **não foi removido** nesta rodada: tirar valor de enum Postgres exige recriar o tipo (memória `enum-novo-e-check-numa-migracao`) e a decisão de produto (spec do relatório interdisciplinar × remoção) é do Rômulo. | "Schema pronto, necessidade não entregue": dá falsa sensação de cobertura a quem lê o enum, e um agente novo pode gerar `report` desse tipo sem nenhum renderizador atrás. Enquanto não houver consumidor, qualquer `INSERT` com esse tipo é dado órfão. | `src/db/schema.ts:1533` · `docs/produto/mapa-jornadas-gaps.md` (tabela 09/2026) · `docs/produto/auditoria-360-relatorio-2026-09-01.md` `PR-07` |
| **D80** | (issue **#542**, auditoria 360 `Q-06`) **Flake em `e2e/represcricao-mv4.spec.ts:33` ("represcrever para baixo confirma antes e leva à barra da disciplina afetada") continua sem causa medida.** Conhecido desde a PR #426 (23/08/2026): o gate `scripts/ci/verificar-cobertura-e2e.mjs` passou a somar `expected + flaky` para não reprovar "cobertura caiu" por engano — corrigiu o gate, não o flake. Hipótese principal (não medida): `expect(barra).toBeInViewport()` (`:105`), scroll-to-anchor após navegação client-side. | `retries: 2` no CI esconde o sintoma e ninguém está olhando: um teste que oscila hoje por timing pode amanhã oscilar por regressão real de navegação, e o gate não distingue os dois. Fecha só com a assertiva identificada (trace do Playwright), causa corrigida e `flaky=0` como piso (`--max-flaky=0`). | #542 · `e2e/represcricao-mv4.spec.ts:33-105` · `scripts/ci/verificar-cobertura-e2e.mjs` · `docs/produto/auditoria-360-relatorio-2026-09-01.md` `Q-06` |
| **D81** | (issue **#566**, auditoria 360 `DS-01`) **O painel admin é a única superfície do produto inteiramente fora da Regra 0 do `AGENTS.md`, e o lint que passou a valer no W10 não o alcança de propósito.** Medido em 03/09/2026 na `main`: 159 classes de paleta crua do Tailwind em 6 arquivos — `benjamin/clinicas/page.tsx` (46), `benjamin/saude/page.tsx` (39), `benjamin/page.tsx` (31), `components/admin/kpi-card.tsx` (23), `admin-nav.tsx` (18), `benjamin/layout.tsx` (2). `src/app/(admin)` e `src/components/admin` ficaram fora de `ESCOPO_DS` no bloco `ds/sem-paleta-crua` do `eslint.config.mjs` porque a regra acusaria o painel inteiro. `KpiCard` tem 1 consumidor e `ui/metric-card.tsx` + `ui/stat.tsx` já existem; falta o bloco `[data-mode="admin"]` no `globals.css`. | Enquanto `(admin)` estiver fora do escopo do lint, o painel cresce com paleta crua sem nada reclamar — o enforcement do DS-05 dá a impressão de cobrir o produto e cobre todo ele menos essa rota. Não morde usuário final (painel interno), morde a próxima pessoa que estende o admin. | #566 · #538 · PR #556 · `eslint.config.mjs:97-104` · `scripts/lint/gerar-baseline-ds.mjs` · `src/components/admin/kpi-card.tsx` |
| **D82** | (issue **#567**, exposto pelo `A-06` da auditoria 360) **`session_snapshot.segmentacao[*][*].metrica` tem dois formatos em produção e dois dos três leitores tratam como string.** Objeto `{ eixo, ordinalRecente }` vindo de `src/lib/evidence/materializar.ts:649` (toda sessão normal) e string `"nivel_ajuda"` vinda da anamnese marco-zero — a dupla forma está documentada em `src/lib/evidence/snapshot-schema.ts`. `timeline-client.tsx:276-277` discrimina por `typeof` e acerta; `src/lib/supervisao/sinais.ts:4,36,57` declara `metrica: string` e repassa o objeto; `briefing/queries.ts:150` faz `String(metricaBruta)`. | Dois sintomas medidos, ambos silenciosos: o card de supervisão **omite** a linha `Métrica: …` para todo sinal originado de sessão normal (`supervisao-card.tsx:89-95` guarda por `typeof === "string"`), e o briefing renderiza **`[object Object]`** na lista da última sessão (`briefing/ultima-sessao.tsx:33`). O guard do card testar contra as strings `"undefined"`/`"null"` é sinal de que a defesa foi posta no renderizador em vez da leitura. | #567 · #538 · PR #556 · `src/lib/supervisao/sinais.ts` · `src/app/(app)/pacientes/[id]/briefing/queries.ts:143-155` · `src/components/ui/supervisao-card.tsx:89-105` · `src/lib/evidence/snapshot-schema.ts` |
| **D83** | (rascunho de issue: `docs/superpowers/specs/sequela-557-provas-e-desvios.md`) **A #557 entregou a prontidão do prontuário e deixou metade da §6 da spec — a coluna "Prova" — sem escrever, mais 4 desvios de implementação nunca registrados.** Medido na `main` em 03/09/2026 (commit `a3142384`). **7 buracos de prova**, todos com o arquivo medido como inexistente ou incompleto: `src/lib/patient/prontidao-rotas.test.ts` (alcance de rota — a spec manda rodar **antes** dos testes de componente, e `/diario/[id]` já virou redirect uma vez na #512); `src/app/(app)/sessoes/[id]/page.test.tsx` (4 papéis × gesto primário — hoje `layout.test.tsx` cobre só `coordenador` e `admin_recepcao`, faltam os **dois** terapeutas, que são justamente o cenário que D-A10/opção (b) existe para atender); `e2e/prontidao-do-prontuario.spec.ts` (caminho feliz, única prova que costura as três superfícies); `src/components/app/cartao-prontidao.stories.tsx` (story dos 7 estados, que a §3.2 chama de **obrigatória**); conta em somente-leitura (`CartaoProntidaoProps` é só `{prontidao, titulo}` — falta a **prop**, não só o teste, e nada prova que a action recusa pela conta ANTES da escada); modalidade trocada depois de pronta (`alterarModalidadeClinica` não aparece em `sessoes/[id]/bloqueio-documentar.int.test.ts` — é a prova de D-A4, "derivada nunca coluna"); e o 5º passo do onboarding (`src/lib/onboarding/passos.ts:56`), a que faltava o caso do **passo desfeito** — o único que a §6 nomeia (**correção de medição, 03/09/2026**: a redação anterior dizia "nada no repo importa em teste", errado — `db/tests/onboarding-progresso-rls.int.test.ts` já cobria 3 casos do 5º passo desde a própria #557; a varredura original olhou só `src/**`). **4 desvios:** (A) `cartao-prontidao.tsx` usa `--status-error-fg` no estado `bloqueante`, onde a §3.2/R-7 exige `--status-warning-*` e diz literal "não `error`"; (B) `prontidao-queries.ts` ficou em `src/app/(app)/pacientes/[id]/` em vez de `src/lib/patient/`, e `onboarding-queries.ts:5` importa tipo de rota → rota importando rota (= **#559**); (C) os `catch` de `layout.tsx:78` e `page.tsx:108` usam `console.warn` com template próprio em vez de `logarErroSemPII`, que **existe** em `src/lib/observabilidade/logar-erro.ts:167` (não vaza PII hoje — loga só `name` + SQLSTATE — mas é o template que a próxima query copia; parente de **#560**); (D) `obterFatosProntidao` **lança** onde a §4a define `FatosProntidao \| null` — o `catch` do layout preserva o fail-closed, mas "não visível", "não existe" e "falha de infra" caíram no mesmo ramo, que é a distinção que R-1 criou. **Decisão do Rômulo (03/09/2026): a spec vence no desvio D — quem muda é a implementação.** <br><br> **ESTADO EM 03/09/2026 (fim do dia) — a maior parte FECHOU no mesmo dia, em 7 PRs mergeadas na `main`:** **#571** (`c526c1b9`) B-1 alcance de rota, 11 casos, nenhum botão morto; **#572** (`3613cc32`) desvio A + B-4, token `--status-warning-*` no `bloqueante` e story dos 7 estados, mais a correção de contraste AA do estado `pendente` (4.20:1 medido, piso 4.5 para 12px semibold — a spec foi corrigida com o número, não o contrário); **#579** (`199f6a7f`) desvios B + C + D de uma vez — ERRCODEs dedicados `IR001`/`IR002` (migração `0152_fatos_prontidao_errcodes.sql`), contrato `FatosProntidao | null`, `git mv` de `prontidao-queries.ts` para `src/lib/patient/` (**fecha a #559**) e `logarAvisoSemPII` nos dois `catch`; **#577** (`268001f5`) B-5 conta somente-leitura, prop nova no cartão + ordem das recusas na action; **#576** (`50222320`) B-7 5º passo do onboarding, estendendo `db/tests/onboarding-progresso-rls.int.test.ts` de 7 para 12 casos em vez de criar arquivo duplicado; **#578** (`b739b965`) B-2 4 papéis × gesto primário nas duas superfícies; **#575** (`82982de2`) B-6 modalidade trocada depois de pronta, prova de D-A4. <br><br> **FECHADO EM 03/09/2026 — as três pontas que faltavam entraram no mesmo dia, somando 10 PRs:** **#591** (`22b91001`) B-3, o e2e do caminho feliz: um cenário, dois `BrowserContext`, costurando cartão do prontuário + pill da lista + passo Documentar, com fixture própria no seed demo; a mutação em `podeDocumentar` derruba a primeira asserção. **#586** (`547def32`) B-8, a lacuna NOVA medida durante a #578: a §4a promete o selo fixo "Aguardando coordenação" para quem não enxerga o prontuário clínico, e isso não era produzível — `CartaoProntidao` devolve `null` quando `proximo === null`, então "prontuário pronto" e "fatos não visíveis", de significado oposto, colapsavam no mesmo pixel vazio. Resolvido com `SituacaoProntidao` (`pendente` | `pronto` | `fatos_nao_visiveis`) preenchido num lugar só, em `montarProntidao`; o selo mora na superfície do Documentar, porque a decisão de produto diverge por superfície de propósito (no prontuário o cartão some; no Documentar ele explica). **#584** (`a09e4559`) varredura `0144`→`0149` (18 ocorrências em 11 arquivos; 2 mantidas de propósito) e reconciliação dos documentos. <br><br> **Segue aberto, e é de fora desta sequela:** `scripts/lint/console-erro-sem-pii.test.ts` estoura o `testTimeout` de 5s localmente — o caso leva 20-34s porque sobe o ESLint de verdade por identificador. **Pré-existente e medido**: falha idêntica em `2358a279`, antes de qualquer PR desta série, e passa no CI, cuja máquina é mais rápida. Merece `testTimeout` próprio, não conserto de carona. Junto: `e2e/helpers/sessao.ts:107` reexecuta `sign-in/email` sob 429 mas **não** o `verify-totp` — flake observado pelo agente do e2e, merece issue própria. Os passos de **prova de mutação** e de **rodar suíte** do plano seguem `[ ]` de propósito: não deixam artefato no repo. <br><br> **Higiene junto:** os comentários que apontavam para a migração `0144` como se fosse o definer da prontidão (ela foi escrita como `0144` e **renumerada para `0149`** no merge; hoje `0144` é `0144_erro_validacao_detalhe.sql`, outra coisa) foram corrigidos para `0149` — 18 ocorrências em 11 arquivos. | Nada aqui é regressão de produção: a feature funciona. É dívida de **prova** e de **idioma**. O custo é o precedente: a §6 não é lista de desejos — cada linha dela nasceu de um defeito já pago neste repo (o teste de alcance de rota existe porque `/diario/[id]` virou redirect; a matriz de 4 papéis existe porque a #512 passou com 31 testes verdes na action e zero na rota). Fechar a feature sem essas provas é apostar que desta vez o mesmo buraco não abre. O desvio A é o que morde usuário: `error` treina o operador a ler a escada como falha dele, e não como ausência de dado. | PR **#557** (`a3142384`) · `docs/superpowers/specs/sequela-557-provas-e-desvios.md` (rascunho da issue, com as 3 ondas de execução) · `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` §3.2/§4/§4a/§6/§7 · `docs/superpowers/plans/2026-09-01-prontidao-do-prontuario.md` · **#559** · **#560** |

---

## 🏁 Sessão 03/09/2026 (tarde) — #567 fechada: a `metrica` do snapshot passou a ter UM formatador

**O defeito, em uma frase:** `session_snapshot.segmentacao[*][*].metrica` tem duas formas em produção (objeto `{ eixo, ordinalRecente }` de toda sessão normal; string `"nivel_ajuda"` da anamnese marco-zero) e dois dos três leitores tratavam como `string` — sem que nada disso fosse erro de tipo, porque `sinais.ts` mentia na declaração e `briefing/queries.ts` resolvia com `String()`.

**Entregue (PR #570):** `formatarMetricaSegmentacao` em `src/lib/evidence/snapshot-schema.ts`, ao lado do schema que já descreve a forma. Os três leitores passam por ele. `DetalheEstagnacao.metrica` virou `string | null` de verdade e `SnapshotRow.segmentacao` reusa `Segmentacao` do Zod em vez de redeclarar `metrica: string`. `briefing/logic.ts` ganhou `linhasUltimaSessaoDe` (pura, testável sem banco). O card perdeu a defesa morta contra as strings `"undefined"`/`"null"` — que nasciam do `String(objeto)` a montante.

**Sem backfill.** `lerDetalheAlerta` formata na **leitura** o `alerta.detalhe` (jsonb) já persistido; o teste de `supervisao/queries.ts` alimenta uma linha antiga na forma objeto e afirma o rótulo renderizado. Confirmado medindo, não presumido.

**Decisão de produto (validada com o Rômulo):** forma objeto exibe **`Nível de ajuda: 3`** — `eixo` é constante literal hoje (`segmentacao.ts:131,169`), só `ordinalRecente` carrega dado. `ordinalRecente` nulo cai para **`Nível de ajuda`** (rótulo do eixo sozinho), não para "sem métrica registrada": eixo registrado SEM medida ≠ nada registrado, mesma régua de `espectro.ts` (ausência de dado nunca vira zero).

**Mutação registrada na PR:** reverter o formatador em `sinais.ts` derruba o teste do card; reverter em `briefing/logic.ts` traz `[object Object]` de volta (`Received: "[object Object]"`); reverter `lerDetalheAlerta` derruba o teste da linha antiga.

**Achado lateral (não é regressão):** `pnpm test` local reprova 1/2736 em `scripts/lint/console-erro-sem-pii.test.ts` com `Test timed out in 5000ms` — o teste instancia um `ESLint` real e o boot estoura 5s sob a carga da suíte. Medido em `main` limpo (`git stash -u` + `pnpm test`): **mesma falha**, 2713 passam. Passa isolado (5/5) e o CI é verde. Não virou débito por ser flake de carga local; anotado em memória.

## 🏁 Sessão 03/09/2026 — D-A6/A8/A9/A10 ratificados; a sequela da #557 catalogada

**Ratificação.** As quatro decisões que a auditoria de 02/09 acrescentou à spec
`docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md` estavam
marcadas "⚠️ pendente de validação com o Rômulo" — e as quatro já estavam **em
produção** desde a PR #557 (commit `a3142384`). Ratificadas pelo Rômulo em
03/09/2026:

- **D-A6** — em `cognitive_behavioral`, o degrau bloqueante é ≥1 aplicação de
  instrumento padronizado, e quem resolve é o **próprio terapeuta**. É o único
  degrau bloqueante que o papel bloqueado destrava sozinho.
- **D-A8** — a régua morde na **action**, não só na página. A UI apenas antecipa
  o que a action vai recusar.
- **D-A9** — os fatos só são lidos para `coordenador` e `terapeuta`;
  `admin_recepcao` nunca recebe escada nem selo.
- **D-A10** — resolvido pela **opção (b)** da própria spec: `obterFatosProntidao`
  ganhou visibilidade para o terapeuta **da sessão** via o definer
  `app_fatos_prontidao` (`db/migrations/0149_fatos_prontidao_definer.sql`,
  `prosecdef = true`, dentro de `FUNCOES_COM_HELPER`, com caso negativo
  cross-tenant próprio e guard interno espelhando o predicado da policy de
  leitura). A opção (a) — a agenda passar a exigir equipe ao agendar — foi
  descartada.

**Sequela da #557 registrada como D83.** O plano
`docs/superpowers/plans/2026-09-01-prontidao-do-prontuario.md` teve os ~60
checkboxes reconciliados contra a `main`: 49 marcados por arquivo que existe,
11 deixados vazios por ausência medida ou por não serem decidíveis sem rodar
código (as provas de mutação, em especial — marcar "mutação provada" sem
tê-la rodado é o defeito da memória `teste-verde-que-nao-testa-nada`). O corpo
da issue-sequela — 7 buracos de prova, 4 desvios, 3 ondas de execução com
worktree e banco `iris_wN` por agente — está rascunhado em
`docs/superpowers/specs/sequela-557-provas-e-desvios.md`. **Issue ainda não
aberta**: o Rômulo decide quando postar.

**Fechamento no mesmo dia (03/09/2026, fim do dia).** As três ondas rodaram e
7 PRs entraram na `main`: #571, #572, #579 (que fecha a #559), #577, #576,
#578 e #575 — ver a tabela "Estado da execução" na sequela e o bloco
"Reconciliação" no topo do plano. **Continuam abertos**: o e2e do caminho
feliz (B-3, branch `test/prontidao-e2e`) e a lacuna nova **B-8** — a §4a
promete "Aguardando coordenação" no passo Documentar para o papel sem leitura
clínica, mas `CartaoProntidao` devolve `null` quando `proximo === null` e esse
papel vê ausência, não selo (branch `feat/prontidao-aguardando-coordenacao`).

---

## 🏁 Sessão 03/09/2026 — #553 fechada: `extraction.payload` é FLAT por medição, e o backfill em produção não tinha o que recuperar

**Item (2) — forma canônica ratificada: FLAT.** Não por leitura de código, por contagem no banco de produção (psql como owner, 03/09/2026):

```
SELECT (payload ? 'evidencia') AS forma_aninhada, count(*)
  FROM extraction WHERE subtipo='evidencia' GROUP BY 1;
→ f | 310      (zero linhas aninhadas)
```

Coerente com os escritores: `payloadDoSubtipo` (`llm-provider.ts`), `DemoStubProvider`, `NullProvider` e `scripts/seed-demo-account.ts` gravam flat, e **nunca houve escritor aninhado** — antes da D57 (`7886e8f4`) produção rodava `NullProvider`, porque o `.env` não tinha chave de LLM e a flag não tinha efeito. **Nada a migrar.**

**Correção ao enunciado da issue:** o item (2) **não toca** `docs/agente/output-schema.json`. Aquele doc é o contrato de saída do _agente_, que é e continua **aninhado** (`{tipo, evidencia:{…}}`); o que estava indefinido era a forma da _coluna jsonb_, que `payloadDoSubtipo` desembrulha. Camadas distintas — não exigiu `/tlc-spec-driven`.

**Item (3) — medição em produção executada, backfill NÃO executado.** Aprovações sem `evidence`: **3 linhas**, todas da clínica DesignerS, todas com `jsonb_array_length(alvos) = 0`, sessão numerada e revisor presente. São os **skips legítimos** já previstos no cabeçalho do script (alvo vazio), não resíduo da deriva. O backfill não teria o que recuperar; nenhuma escrita foi feita em produção.

**Fixtures aninhadas realinhadas para flat** (`db/tests/fase4-materializar.int.test.ts` ×2, `db/tests/fase4-evidence-rls.int.test.ts`, `db/tests/anamnese-rematerializacao.int.test.ts`, `colapso-aprovacao.int.test.ts`). Foi essa forma de fixture que escondeu a deriva da #532/#533 — ela semeava uma forma que nenhum escritor produz.

**Oráculo de mutação** (helper reduzido a só-aninhado, o defeito da #553):

| Fixture          | Helper mutado | Resultado                                   |
| :--------------- | :------------ | :------------------------------------------ |
| aninhado (antes) | só-aninhado   | **5 passed** — verde com o defeito presente |
| flat (agora)     | só-aninhado   | **4 failed** (`evidence` 1 → 0)             |

Ou seja: o fixture aninhado era um teste verde que não testava nada. `fase4-evidence-rls` passa sob a mutação porque seu payload é decorativo (não alimenta o on-approve) — realinhado por coerência, sem ganho de cobertura.

`conteudoDoSubtipo` **permanece tolerante de propósito**: tolerância na leitura, forma única na escrita.

---

## 🏁 Sessão 01/09/2026 — issue #517 (C5): recepção fica como está, opção 3

**Decisão do Rômulo:** `admin_recepcao` não agenda e não vê a semana — opção 3, fica como está. Agendar continua ato exclusivo do coordenador, alinhado ao modelo de negócio atual onde é o coordenador quem define a demanda. Ressalva do próprio Rômulo: pode mudar se o modelo mudar, mas não faz sentido abrir escrita hoje.

**Rename do papel na UI** (cogitado na opção 3 original da issue) descartado — não necessário agora.

**Gap levantado pela decisão:** falta suporte a mais de um coordenador por clínica na modelagem de papéis — ver **D76**.

**Registrado em `docs/ux/jornada-sessao-unificada.md` §2 e §4 (E4)**, conforme exigia a Definição de Pronto da issue. C5 marcada como decidida na tabela consolidada (§4).

---

## 🏁 Sessão 31/08/2026 (4ª) — #506: clínica de um terapeuta só ficava sem NENHUM caminho de escrita no diário

**O sintoma reportado por usuário real** era o ditado de voz recusando com "Só o terapeuta da sessão envia o ditado de voz.", mas o ditado só foi o primeiro botão clicado: `requireRole(ctx, "terapeuta")` guardava as **8** ações de `diario/[sessionId]/logic.ts` — captura de texto, escopo de protocolo, áudio local, consolidar, enviar lote ASR, ler estado do lote, aceitar transcrição, reprocessar extração. Nenhuma aceitava `coordenador`, que é o único papel que `criarClinicaEVinculo` (`src/auth/cadastro.ts`) grava para o fundador. Toda clínica solo nascia inutilizável no módulo mais central do produto.

**O workaround que a issue propunha não funciona — medido.** A issue dizia para o coordenador se auto-convidar como terapeuta pela tela de Equipe. O `user_role` até é criado, mas `papelAtivo` (`src/auth/papel-ativo.ts:14`) devolve `coordenador` assim que ele está presente, e `resolveTenant` só lê o cookie de papel no ramo `needsSelection` — que nunca acontece nesse combo. `ctx.role` continuava `"coordenador"` e o diário seguia barrado. Consequência: as três opções de produto listadas na issue eram todas de **provisionamento**, e nenhuma delas resolveria sozinha.

**Correção escolhida (decisão do Rômulo):** as ações do diário passam a aceitar `terapeuta` **e** `coordenador`, via `requireDiario` novo em `src/auth/require-role.ts` (mesmo idioma de `requireAgendar`). Sem migração, sem backfill — conserta as clínicas solo já existentes no deploy.

**Por que isso não afrouxa nada:** quem restringe a escrita ao profissional que atendeu nunca foi a guarda de papel, e sim a RLS — `session_note_insert`/`session_note_update` (`db/migrations/0006_fase2_rls.sql:70-84`) e `audio_update` exigem `app_session_terapeuta_id(session_id) = current_setting('app.user_id')`. Coordenador de clínica grande continua sem alcançar diário alheio; ele só escreve onde ele mesmo é o terapeuta da sessão. A agenda já operava nessa régua: `validarTerapeutaDaClinica` (`src/app/(app)/agenda/queries.ts:313`) aceita `["terapeuta", "coordenador"]` como profissional que atende. O diário era o único módulo fora dela.

**Auditoria que a issue pedia: feita e negativa.** `grep -rn 'requireRole(ctx' src --include=*.ts | grep -v test` — `requireRole(ctx, "terapeuta")` isolado só existia no diário. Todo outro gate ou já inclui `coordenador`, ou é administrativo por desenho (`pacientes/novo` = `admin_recepcao` + `coordenador`). Nenhum outro módulo travava clínica solo.

**Verificação:** `pnpm typecheck` limpo, `pnpm lint` 0 erros, `pnpm test` 2253/2253, `pnpm test:rls` 1279/1279 (145 arquivos, 0 pulados). Mutação: revertendo `requireDiario` para `terapeuta` sozinho, os dois testes `#506` de `actions.int.test.ts` caem. O teste que exigia `coordenador` ser barrado foi reescrito para `admin_recepcao` — o papel que segue (corretamente) sem escrita no diário.

**Aberto, não tocado nesta PR:** o modelo de papel múltiplo (`papelAtivo` fazendo `coordenador` vencer sempre, cadastro concedendo um papel só) continua como está. Enquanto isso valer, "ser coordenador" e "atender pacientes" seguem sendo o mesmo `ctx.role` — aceitável hoje porque a RLS é quem separa, mas é a raiz que a issue expôs.

---

## 🏁 Sessão 31/08/2026 (3ª) — #494: a UI que faltava, os defeitos da revisão pós-merge e a limpeza da transcrição

Fecha o grosso da #494 (continuação da #72). **T24 não entra e não podia entrar:** é o smoke no painel Easypanel, e só o Rômulo tem acesso — segue como o único item aberto da issue.

**Parte 1 — a UI (T11/T12/T25).** `DitadoVoz` é o componente novo; `AudioLocal` delega a ele quando `asrHabilitado` desce do server component (R21). Teto de 2 min com encerramento automático (R1), sem teto de quantidade (R2), lista revisável com descartar/regravar por item (R4), envio só no clique explícito (R5), ordem preservada (R6), botão que desabilita cobrindo o LOTE inteiro (R24), clipe enviado sem ações de edição (R27). O resultado vira 1 parágrafo por clipe com selo visível "Transcrito pela IA" (R17, `StatusBadge` do design system); clipe falho vira "Não transcrito" com reenvio ou digitação à mão (R12/R13); o texto só entra no diário no clique em "Usar no diário" e salvar continua sendo ato separado (R18). `useGravador` extrai a máquina de microfone porque as duas telas precisam do mesmo comportamento em permissão negada, codec de Safari (R7) e encerramento das trilhas.

**Dois defeitos que os testes acharam antes do merge**, ambos da classe "tela certa, dado errado": a `ordem` do clipe lida de dentro do updater de `setClipes` chegava sempre `0` (o blob ia para a chave errada com a lista correta na tela — R6 morrendo em silêncio), e a renumeração dos blobs feita dentro do updater esvaziava o mapa na segunda invocação do StrictMode. Os dois têm teste que cai sob a mutação correspondente.

**Parte 2 — os defeitos.** T14: recusa de infraestrutura (401/403/404/502/504/abort/rede) passou a reverter a tentativa como o 503 já fazia — antes, uma rotação de `ASR_SERVICE_TOKEN` feita só de um lado apagava toda a fila em ~60s. T15: timeout padrão de 30s (abaixo da mediana **medida** de 43,31s) subiu para 120s, e `ASR_SERVICE_URL`/`ASR_SERVICE_TIMEOUT_MS` entraram no `.env.example` e no runbook. T16: o corpo do worker carrega categoria fechada, nunca `mensagemDoErro` — o `DrizzleQueryError` embutia a transcrição nos params e o script de disparo logava o corpo literal. T20: idempotência passou a olhar o ESTADO do lote, e o reenvio retoma os clipes que ficaram sem upload. T23: `__pycache__` destrackeado, `--dry-run` parou de reportar "N apagado(s)", e o rascunho do IndexedDB ganhou expiração por idade (sessão expirada / aba fechada / crash nunca chamavam `purgarTudo`).

**T18/T19/T21 — as três de banco.** `0140` cria `iris_asr_worker` e REVOGA de `app_role` o `EXECUTE` das três definers cross-tenant que não devolvem 1 bit; `app_asr_objetos_em_uso` fica, porque cumpre a régua e o sweeper depende dela. `0141` fecha o laço de `503` com teto de 10 reversões em contador PRÓPRIO (usar `tentativas` reintroduziria o defeito que a reversão existe para evitar) e `app_asr_expirar_presos` como backstop de idade da LINHA — havia backstop para o objeto, nenhum para a linha, e era a linha que isentava o objeto. `0139` traz o índice parcial de `objeto_ref`: medido em 50k linhas, `Seq Scan` 3334 buffers / 9,416 ms → `Index Scan` 3 buffers / 0,066 ms.

**A premissa de T19 na issue estava parcialmente errada, e o comentário da `0141` corrige.** O laço do agendador É serial — ele espera o `node --once`. A sobreposição real vem do cliente do disparo abortar em 120s enquanto o tick do servidor segue até ~215s, e lockfile nenhum alcança isso. O lockfile entrou mesmo assim, cobrindo só o que cobre de fato: um segundo agendador no mesmo container.

**⚠️ Requisito de deploy novo:** `ASR_WORKER_DATABASE_URL` é fail-closed, sem fallback para `DATABASE_URL`. Provisionar `iris_asr_worker_login` (`CREATE ROLE … LOGIN … IN ROLE iris_asr_worker`) **antes** de deployar, ou a rota do worker recusa subir — por desenho: o fallback silencioso faria o tick morrer em `42501` a cada passada, ou reabrir o furo se alguém reconcedesse o grant.

**Parte 4 — T25, decisão C de R19.** `aceitarTranscricaoLote` lê e apaga `transcricao_texto` no MESMO statement e só devolve o que o UPDATE tocou: se a RLS barrar a escrita ela afeta 0 linhas em silêncio, e devolver o texto ali entregaria uma transcrição que continua no banco. Fecha **D74**.

**O que muda nos débitos:** **D72** fechado (a UI existe e é alcançável). **D73** fechado nos oito defeitos que listava. **D74** fechado. **D71** (mime/codec de clipe iOS/Safari) segue aberto e não foi tocado — continua sendo pré-requisito de ligar `ASR_PROVIDER=self-hosted` com usuários de iPhone reais.

**T22 achou um vazamento real, não só testes fracos.** O teste de "erro do S3 não vaza credenciais" injetava `new Error("AccessDenied: bad signature")` — literal que não conteria credencial sob implementação nenhuma, então a assertiva era verdadeira para qualquer entrada. Com o erro **realista** do SDK v3, que embute o cabeçalho `Authorization` inteiro (`Credential=<ACCESS_KEY>/…`), os três caminhos de `storage.ts` vazavam a chave — num log que vai para o painel Easypanel em HTTP puro. Entrou `redigirCredenciais`. Na mesma leva: a auth do worker comparava um token de 13 bytes contra um de 23, então a checagem de comprimento curto-circuitava e `return true` na comparação sobrevivia à suíte; e os 4 testes de `main()` do sweeper rejeitavam dentro de `resolveConfig()` sem nunca alcançar `varrer`, deixando passar a mutação que faria o sweeper apagar áudio `na_fila` vivo.

**Ainda sem teste próprio, nomeado:** `objeto_ref IS NOT NULL` (`0136:68`), a guarda `asr_status = 'transcrevendo'` nos três UPDATEs, o clamp de `greatest(tentativas - 1, 0)` e o `FOR UPDATE SKIP LOCKED`.

**T13 — o E2E existe mas ainda não vigia nada em CI.** `e2e/ditado-voz.spec.ts` cobre o caminho feliz com `MediaRecorder` dublado e o `StubAsrProvider`, e é um projeto Playwright opt-in por env — não um `test.skip`, porque `scripts/ci/verificar-cobertura-e2e.mjs` reprova com `stats.skipped > 0` e derrubaria o job para todo mundo. **O job `test-e2e` sobe só Postgres**, então o spec é coletado zero vez lá: fechar o ponto cego de verdade exige service MinIO + bucket + as 5 envs de ASR + subir `--min-tests`/`--min-files`. Enquanto isso não existir, o cenário que a #72 provou ser possível — todos os checks verdes com a feature inutilizável — continua possível. **Task irmã a abrir.**

**O que continua bloqueando ligar a flag:** T24 (os dois serviços de pé no painel com heartbeat avançando, e um lote real transcrito ponta a ponta contra clínica de teste) e a revisão do `INTERVALO_S` de 20s contra volume observado — que é raciocínio, não medição de fila sob carga. Issue fechada não é serviço no ar.

---

## 🏁 Sessão 31/08/2026 (2ª) — Onda 4 de #72: T16 (bateria de mutação) e T17 (documentação e sincronização), débito D72 registrado

**T16** — bateria de verificação por mutação (comportamento a comportamento, régua de `tasks.md` §T16) mergeada em `9a179ffd`, cobrindo os 9 cenários de §3 e os 7 pares comportamento/mutação da tabela do tasks.md. Fechou o TDD end-to-end do backend/infra do Modo 2. Achado durante a bateria (não um defeito de T16 em si): a régua de mutação da UI (iniciar/parar gravação, mostrar/esconder parágrafo, teto de 2min) não tem produção para derrubar — os testes exercitam comportamento que **não existe** em `audio-local.tsx`, porque T11/T12 nunca entraram no código. Virou D72.

**T17** — reconciliação de documentação com a realidade medida:

- `docs/superpowers/specs/2026-08-02-issue-72-ditado-voz-asr-design.md`: nota de reconciliação no topo apontando para `.specs/features/72-ditado-voz-asr/` como fonte de verdade técnica; corrigidos os 3 pontos que o rascunho original de produto erra contra o implementado — escopo V1 (só Modo 2), storage efêmero (apaga em sucesso E falha, não TTL de 7 dias) e provider self-hosted (não Google/Gemini).
- `.env.example`: `FEATURE_FLAG_ASR_ENABLED`, `ASR_PROVIDER` e `ASR_SERVICE_TOKEN` documentadas (faltavam; `ASR_S3_*`/`ASR_JOB_*` já estavam desde T04/T07).
- `infra/README.md`: já tinha a seção completa do worker/agendador/sweeper de ASR (§"Worker de transcrição de ditado de voz") com pointer para `infra/asr/runbook.md` — nenhuma mudança necessária.
- Issue #72: corpo atualizado via `--body-file` para deixar explícito que T01-T10/T13-T16 (backend/infra) estão implementados e mergeados nesta PR, mas T11/T12 (UI multi-clipe e renderização do resultado) seguem pendentes — Modo 2 não é usável ponta a ponta por uma terapeuta ainda, só o pipeline de backend está provado.
- `BACKLOG.md`: débito **D72** registrado (T11/T12 nunca implementadas), marcado como proposta pendente de validação com o Rômulo — decidir se vira issue de continuação ou reabre #72.

PR #490 permanece em escopo de backend/infra; UI do Modo 2 fica para uma decisão de produto separada.

---

## 🏁 Sessão 31/08/2026 — Onda 1 de #72 (T09/T07/T15) via subagent-driven-development, achado de integração dos 3

Onda executada com controlador + subagentes: implementer→reviewer→fix-loop por task, mais uma revisão final de integração (opus) e um fix wave único.

**T09** (`enviarLoteAsr`): 1 fix round — checagem de idempotência (R24) tinha janela TOCTOU sem backstop no banco; fechado com `UNIQUE(lote_id, ordem)` (migração `0137`) + captura de `23505` como sucesso idempotente, provado com teste de concorrência real (`Promise.all`, não sequencial).

**T07** (rota worker): review clean de primeira, 1 Minor deferido (Content-Type fixo — virou D71).

**T15** (sweeper de objetos órfãos): review clean de primeira, 2 Minor deferidos (validação tardia de env; nome `apagados` confuso em dry-run).

**Achado só visível na revisão final de integração (3 Important, mesma assinatura — linha `na_fila` com `objeto_ref` de objeto já apagado):**

1. O `finally` de T07 apagava o objeto efêmero em TODOS os desfechos, inclusive quando o clipe volta pra fila (503-reversão de R16, ou falha transitória com tentativas<3) — matava o próprio mecanismo de retry que a migração de T02 (onda anterior) já documentava como intenção.
2. T09 inseria a linha já `na_fila` antes do upload do blob terminar — worker podia reservar um objeto que ainda não existia, e o `finally` acabava apagando o upload que chegasse depois.
3. O sweeper de T15 media idade só pelo `LastModified` do bucket, sem checar a linha em `audio_capture` — fila represada ou agendador (T08, futuro) parado >6h faria o sweeper apagar objeto de clipe ainda `na_fila`, nunca processado.

Corrigido num fix wave único: nova migração `0138_asr_objetos_em_uso.sql` (função SECURITY DEFINER que devolve quais chaves ainda estão em uso — preferida a editar a `0136` porque mudar tipo de retorno pediria `DROP FUNCTION` de qualquer jeito, e editar migração já aplicada bate no guard D17 de hash); T07 só apaga no desfecho terminal; T09 promove a linha a `na_fila` só via `UPDATE` depois de cada `guardar()` confirmar; T15 consulta a função nova antes de apagar. Efeito colateral bom: a limpeza de fixture que o fix trouxe para o teste de T07 eliminou uma contaminação cross-file pré-existente — `pnpm test:rls` foi de 59 suites falhando (baseline herdada) para 144/1253 100% verde.

**Não fica dívida do fix em si** — tudo revisado limpo (task reviews + revisão final + re-review escopada do fix wave, todas ADDRESSED, zero quebra nova). Ficam 2 gaps de escopo maior, registrados como D71 (mime/codec) e nota solta (expurgo LGPD não apaga objeto efêmero de clipe em voo — coberto pelo sweeper de 6h, só não documentado no runbook).

---

## 🏁 Sessão 26/08/2026 (3ª) — Radar de priorização de produto (débitos abertos + issues) e correção de D9/D10/D11 desatualizados

Rômulo pediu 2 tabelas de PM: itens prontos pra mão de obra vs. itens que ainda precisam de spec/desenho/tasks atômicas, ordenados "produto first". Levantamento cobriu os 13 débitos abertos do BACKLOG (D9–D65) e as 15 issues abertas no GitHub.

**Achado:** D9 (#258), D10 (#259) e D11 (#260) estavam marcados aqui como "Sem spec ainda" apontando para `/superpowers:writing-plans`/`/tlc-spec-driven`, mas as 3 issues já têm spec técnica completa (formato "Tech Lead Review": guardrails de negócio, diagrama de arquitetura Mermaid e 6 tasks atômicas T1–T6 cada) — escritas depois que este arquivo foi atualizado pela última vez nesses itens. As 3 linhas acima foram corrigidas para refletir que já estão prontas pra execução, sem precisar de passo de design adicional.

**Outros achados sem alteração no BACKLOG (ficam registrados aqui, não geram débito novo):**

- **D63** (governança da via excepcional de expurgo) é adiamento deliberado do Rômulo (25/08), não gap de spec — não entra em fila de priorização até haver pedido real.
- **D42, D48, D65** têm graus diferentes de "falta decisão" vs. "falta spec" — dependem de decisão de escopo/produto do Rômulo antes de virar task atômica. **Correção do radar:** D39 estava listado aqui como "decisão homologada, falta implementar" — achado falso: PR #459 (24/08/2026) já fechou a implementação, e a linha da tabela acima estava desatualizada (fechada nesta sessão, 26/08/2026).
- Radar completo publicado como artifact (link no histórico da sessão) — não versionado aqui porque decisões de priorização mudam rápido; a fonte de verdade estrutural continua sendo esta tabela e as issues.

---

## 🏁 Sessão 26/08/2026 (2ª) — incidente pós-#471: `iris_alarme_login`/`iris_retencao_login` com 28P01 em produção, alarme de backup-offsite com falso-positivo, ambos fechados e verificados

- **Status:** credenciais corrigidas manualmente no Postgres/Easypanel (fora de PR, confirmado pelo Rômulo). PR [#473](https://github.com/romulosutil/Iris/pull/473) mergeado em `main` (`82fcbce3`). Verificação final: revarredura dos 18 serviços do projeto `espectro-mvp` no Easypanel via Claude in Chrome, log a log.

**O que apareceu.** Auditoria de logs do Easypanel (18 serviços) achou dois usuários Postgres `_login` falhando autenticação (`28P01 password authentication failed`) ao mesmo tempo: `iris_retencao_login` (job de aviso-prévio de expurgo LGPD, silencioso desde 25/08 17:32 — "a clínica perde os 90 dias de antecedência, prontuário chega vencido na fila sem que ninguém tenha sido avisado") e `iris_alarme_login` (detector do próprio #294/#471, cego pra `billing` e `escalonamento` há 14+ varreduras, limite 6). Provisionado pela #294/#471, entregue com senha que nunca chegou a autenticar em produção — nenhum dos dois caminhos tinha alarme sobre si mesmo.

**Segunda camada, só visível depois da senha corrigida.** Com a credencial certa, `iris-alarme` trocou o 28P01 por `ERR_INVALID_URL`: a senha gerada continha `/` e `+` sem URL-encode dentro da connection string `postgres://usuario:senha@host:porta/db`, e a barra no meio da senha quebra o parser de URL antes de chegar no driver. Corrigido junto com a rotação da credencial.

**Terceiro achado, sem relação com credencial:** o alarme de `backup-offsite` disparava e-mail todo dia por falso-positivo — `LIMITE_BACKUP_H` fixo em 36h presumindo cadência diária, enquanto produção roda `OFFSITE_INTERVAL_DAYS=7` (semanal, deliberado). PR #473 trocou o limite fixo por `OFFSITE_INTERVAL_DAYS*24 + 12h` de margem, lido do mesmo env var do serviço de backup; sem a var, comportamento não muda (36h). 38/38 testes de `scripts/alarme-jobs.test.mjs` (2 novos cobrindo `OFFSITE_INTERVAL_DAYS=7`), `pnpm lint`/`pnpm typecheck` limpos. PR também corrigiu um bug pré-existente e não-relacionado: shebang em `scripts/alarme-jobs.mjs` derrubava `pnpm test` inteiro sob Vitest (`AsyncFunction` não faz strip de shebang) — sem uso real, `infra/alarme/agendador.sh` já invocava via `node "${SCRIPT}"`.

**Verificado, não presumido:** revarredura completa dos 18 serviços (`api`, `clinic`, `iris-alarme`, `iris-app`, `iris-arquivamento`, `iris-backup`, `iris-billing`, `iris-escalonamento`, `iris-glitchtip`, `iris-glitchtip-worker`, `iris-migrate`, `iris-minio`, `iris-postgres`, `iris-redis`, `iris-retencao`, `mysql`, `patient`, `redis`) confirmou: `iris-retencao` emitindo aviso-prévio normalmente (0 falhas), `iris-alarme` sem mais `password authentication failed` nem `ERR_INVALID_URL`, log do alarme de backup-offsite citando `OFFSITE_INTERVAL_DAYS` em vez do limite fixo. Nenhum débito D-numerado dependia deste incidente — #294/#471 já estavam fechados antes dele acontecer; este registro cobre o incidente pós-deploy e o fix, não um novo D. Observação que segue aberta, fora de escopo (feature nova, não bug de infra): `iris-glitchtip` com `ALLOWED_HOSTS` wildcard em produção (hardening, não incidente).

---

## 🏁 Sessão 25/08/2026 (4ª) — D57 fechado por medição real (não pela página certa da primeira vez), drift Claude→Gemini corrigido em produção, D59 e D66 destravados, implantado

- **Status:** PR [#470](https://github.com/romulosutil/Iris/pull/470) mergeado em `main` (`7886e8f4`, 26/08/2026 00:49 -03). `GOOGLE_API_KEY` e `EXTRACTION_LLM_ENABLED=true` confirmados pelo Rômulo no Easypanel (iris-app) e implantados.

**Como D57 realmente fechou.** A pergunta "o Gemini API standalone está no escopo do Cloud DPA?" foi feita duas vezes contra fontes diferentes, e a primeira deu resposta errada por procurar no lugar errado: `cloud.google.com/security/compliance/services-in-scope` só lista produtos **GCP/Vertex AI** (chave de service account) — a chave de developer/AI Studio (`GOOGLE_API_KEY`, a que o Iris usa) não aparece ali em lugar nenhum, o que por um instante pareceu significar "não coberto, precisa migrar pra Vertex". A resposta certa estava nos **Termos de Serviço Adicionais da API Gemini** (`ai.google.dev/gemini-api/terms`): com billing pago ativo, todo uso vira "Serviço Pago" e o Adendo de Tratamento de Dados (DPA) aplica automaticamente, sem precisar de Vertex. As três confirmações do D57 (billing pago, escopo do DPA, equivalência ao Art. 33 LGPD) fecharam com essa fonte.

**O achado que importava mais não era de compliance, era de código.** Ao conferir o `.env` de produção pra decidir onde ligar a flag, apareceu que `provider.ts` (`resolveProvider`) gatilhava `ANTHROPIC_API_KEY`/`ClaudeProvider`, não `GOOGLE_API_KEY`/Gemini — divergente da decisão registrada desde 21/08/2026 e dos termos de consentimento já ratificados (que citam Google/Gemini, nunca Anthropic). O `.env` de produção não tinha nenhuma das duas chaves, então `EXTRACTION_LLM_ENABLED=true` não teria efeito nenhum — caía em silêncio no `NullProvider`. Se alguém tivesse só preenchido `ANTHROPIC_API_KEY` pra "ativar a flag" sem essa checagem, teria mandado prontuário de paciente menor pra um provedor não nomeado em nenhum termo assinado.

**Decisão do Rômulo, ampliando o escopo do PR:** produto usa só Gemini, sem exceção. `src/lib/extraction` migrado (`ClaudeProvider`→`LlmExtractionProvider`, `claude-provider.ts`→`llm-provider.ts`, `gemini-test-invoker.ts`→`gemini-invoker.ts` deixando de ser test-only, `createAnthropicInvoker` e a dependência do SDK Anthropic removidos do caminho de extração) e o escopo ampliado no mesmo PR pros Agentes 2/3 (D66) — `resolveFamilyReportProvider`/`resolveConvenioNarrativoProvider` também gateiam em `GOOGLE_API_KEY` agora, ambos com esqueleto próprio (`gemini-provider.ts`), ambos ainda não implementados (`gerar()` lança). `ANTHROPIC_API_KEY` saiu do `.env.example` — zero referência restante em `src/`.

**Consequência em cascata:** com D57 fechado, o gate de impressão do **D59** (termo de consentimento de menor) destravou — dependia exatamente dessa mesma confirmação. Termo pode ser colhido com titular real.

**Verificação:** 71 testes de `src/lib/extraction` + 43 de `src/lib/report` + suíte completa (270 arquivos/1981 testes) verdes, `pnpm typecheck`/`pnpm lint` limpos, PR passou pelos 7 checks obrigatórios do ruleset antes de sair de Draft.

---

## 🏁 Sessão 24/08/2026 (3ª) — AGENTS.md ganha §8.4 (grafo), PR #462 CONFLICTING resolvido por causa raiz medida

- **Status:** merge de `origin/main` na branch `fix/446-d46-loga-envelope-retentativa-inesperado` executado e conflito resolvido a favor do texto fechado do D46 (main ainda tinha D46 aberto). `AGENTS.md` §8 ganhou item 4 (grafo).
- **Causa raiz do conflito medida, não suposta** (`git merge --no-commit --no-ff` num worktree isolado contra `origin/main`, único arquivo em conflito: `BACKLOG.md`, marcador único em torno da linha do D46): D45 e D46 são fechados **de duas sessões diferentes, em paralelo** — main fechou D45 (PR #461/`e5e2468`) sem tocar D46; esta branch fechou D45 (texto idêntico, `dfacfdd`) **e** D46 (`dd8ed5e`) no mesmo commit. Como as duas linhas de tabela ficam adjacentes, sem linha em branco entre elas, o merge 3-way de linha (não semântico) trata a edição de duas linhas contíguas do nosso lado como um hunk único que colide com o hunk de uma linha do lado do `main` — mesmo a linha do D45 sendo byte-idêntica nos dois lados (confirmado por `md5sum`). Não é conteúdo divergente: é hunk-boundary colidindo por falta de linha de contexto entre débitos na tabela.
- `src/lib/billing/subscription.ts` e `classificacao-recusa.int.test.ts` vieram do merge de `main` (D39, PR #459) sem conflito — só tocam o repo por causa do merge, não desta sessão.
- Arquivo `docs/daily-summary/2026-08-24.md` continua untracked, não commitado, não faz parte deste PR.
- **Auditoria dos arquivos-base sobre Grafo/Backlog/Checkpoint/GitHub:** Backlog+Checkpoint já imperativo em `AGENTS.md` §8 (itens 1-3). GitHub já imperativo em §5.3/§5.4. Grafo (graphify) **estava só no `CLAUDE.md` global do usuário**, fora do alcance de Jules e outros agentes que leem `AGENTS.md` como porta de entrada — **corrigido nesta sessão**: `AGENTS.md` §8 item 4 agora exige `git commit` + `git push` + `graphify update .` ao fim de toda tarefa que altere código/doc.

---

## 🏁 Sessão 24/08/2026 (2ª) — #378 (cartão de crédito pós-pago): D11 revertido para retentativa automática 5x, D3/D12 mantidos com negociação Asaas em curso

- **Status:** spec revisada (`docs/spec-378-cartao-credito`, commit `c1d18ca`, comentário na issue), ainda **não** liberada para label `jules` — T0 (spike bloqueante) ganhou 6º item de medição.

Rômulo trouxe 3 atualizações sobre a spec fechada em 24/08/2026 (madrugada) para #378:

1. **D3/D12 (taxa mínima cobrada de novo ao trocar de cartão)** — mantido como especificado, mas Rômulo está negociando direto com o Asaas a remoção dessa cobrança **nos dois trilhos** (Pix Automático e cartão). Sem confirmação ainda; a implementação segue cobrando `VALOR_ATIVACAO_PADRAO_CENTAVOS` — é a constante que muda se a negociação avançar, não o fluxo.
2. **Gate externo de tokenização em produção** — já solicitado ao gerente de contas Asaas, em atendimento. Continua bloqueando só a virada da flag `BILLING_CARTAO_HABILITADO`, não a implementação.
3. **D11 revertido.** A decisão original ("zero retentativa automática no cartão, recuperação 100% manual") foi trocada: Rômulo quer retentativa automática, **5x — 3 no dia da recusa, 2 no dia seguinte**, espelhando a cadência que já roda em produção no Pix Automático (#322). Problema: não existe endpoint nativo do Asaas para retentar cobrança **avulsa** de cartão (o endpoint de retry do #322 é específico do trilho Pix Automático) — não está medido se o Asaas retenta sozinho cobrança avulsa de cartão ou se o 5x só existe no objeto `Assinatura` nativo (que mudaria a arquitetura: cartão sairia do padrão "cobrança avulsa por ciclo" que o Pix usa hoje).

**Fica aberto:** T0 ganhou um 6º item de medição (existe retry nativo do Asaas para cobrança avulsa de cartão recusada, ou o mecanismo de 5x é nosso a construir?) — bloqueia a nova tarefa **T5b** (motor de retentativa). Se a medição apontar para `Assinatura` nativa, volta para ratificação com o Rômulo antes de programar T4/T5/T5b — não é decisão que o executor autônomo deve tomar sozinho.

---

## 🏁 Sessão 23/08/2026 — revisão tech lead dos PRs #423 e #425: o CI que rodava duas vezes, a suíte que nunca rodava, e o check obrigatório que vira armadilha

- **Status:** #425 mergeada em `main` (`b64784d`) depois de ficar verde em CI real; #423 verde mas `BLOCKED` por ruleset (ação de admin pendente, D58).

### O que a revisão mediu

**PR #425 (#424 — recria `seed:demo`, liga `e2e/` no CI).** Chegou vermelho em dois checks, e os dois eram defeito real, não flake:

1. `test-e2e` morria em `pnpm seed:e2e` com `node: .env: not found`. Os scripts de seed usam `tsx --env-file=.env`, e o runner passa as variáveis pelo bloco `env:` do job, sem arquivo. Corrigido com `--env-file-if-exists=.env` nos dois seeds novos (fluxo local, que tem `.env`, não muda). Os outros seeds continuam com `--env-file` porque nenhum deles roda headless.
2. `test` reprovava em `scripts/lib/guardrail-seed-wiring.test.ts` — e reprovava **com razão**: o guardrail D52 exige que todo script de seed declarado no `package.json` esteja na lista coberta pelo teste de fiação, porque `seed-demo.ts` e `seed-e2e.ts` fazem `TRUNCATE` e gravam senha padrão. Os dois já chamavam `assertSeedAllowed()` antes de abrir conexão; faltava entrar na lista. O guardrail pegou exatamente o que foi escrito para pegar.

**Achado próprio da revisão:** `scripts/ci/verificar-cobertura-e2e.mjs` nasceu **sem teste**, ao contrário do irmão `verificar-cobertura-testes.mjs` (que tem `.test.mjs`). Gate de cobertura sem teste é o próprio verde falso que ele existe para impedir — um `parseArgs` que engolisse `--min-tests` inválido desligaria o piso em silêncio. Escrito `scripts/ci/verificar-cobertura-e2e.test.mjs` com 11 casos (piso, zero testes, arquivo sumido, skip, unexpected, relatório truncado, pisos ausentes/inválidos/desconhecidos).

**Cobertura de servidor que o redesenho do teste parecia derrubar — não derrubou.** O spec `Resiliência de Formulário` provava, via `novalidate`, que `validarCadastro` (servidor) recusa senha curta mesmo com cliente scriptado. O wizard de 2 passos tornou esse caminho inalcançável pelo navegador e o teste foi redesenhado para o gate client-side. Verificado que a rede de segurança do servidor **continua coberta** em `src/app/(auth)/cadastro/logic.test.ts:109` (`exige senha de no mínimo 12 caracteres`) — a cobertura mudou de camada, não sumiu.

### Verde medido (CI real, não local)

`test-e2e` do run `32617527004`: `[cobertura-e2e] arquivos=10 testes=17 pulado=0 inesperado=0 flaky=0`. Suíte inteira em 2m25s, `17 passed (49.8s)`. `test`, `test-rls`, `lint`, `typecheck`, `build`, CodeQL e `jules/review` (verdict: approve) verdes.

### PR #423 (remove 3 workflows redundantes) — o diff está certo, o bloqueio é de configuração

Confirmado com `pnpm exec vitest list` que `src/db/migrations.test.ts`, `src/lib/legal.test.ts` e `src/lib/security/guardrail-preview-layout.test.ts` são coletados pelo projeto `[unit]`, ou seja, o job `test` do `ci.yml` já os roda — a remoção não abre buraco de cobertura.

O que a remoção abre é outra coisa, e é grave: o ruleset `Main Protection` exige `journal` e `versoes-legais` como **checks obrigatórios**, e esses dois nomes vêm justamente dos workflows deletados. Check obrigatório que nunca reporta não reprova — deixa o PR `BLOCKED` para sempre. O #423 já está assim hoje. Registrado como **D58**; é ação de admin no ruleset, fora de qualquer diff.

### O que fica aberto

- **D58** (ruleset) — **fechado na própria sessão**, com a permissão liberada: `journal` e `versoes-legais` saíram de `required_status_checks` e o #423 virou `CLEAN`. Fica só o passo de acrescentar `test-e2e` aos obrigatórios, depois que as duas branches abertas sem o job mergearem ou rebasearem.
- `retries: 2` continua valendo no CI e o gate só **loga** `flaky`, não reprova. Medido hoje: `flaky=0`. Se aparecer flaky recorrente, o gate ganha `--max-flaky=0`; não vale antecipar sem um caso real.
- `registro_numero` passou a ser gravado **mascarado** (`99/8877`), porque `formatarNumeroRegistro` formata antes do submit. O teste agora afirma o valor real do produto; se a intenção era guardar dígitos puros, é decisão de produto a abrir como issue própria — não foi tratada aqui.

---

## 🏁 Sessão 22/08/2026 (2ª) — D40 / #330: eliminação dos 3 N+1 restantes em `materializarSnapshot` (PR #417)

- **Status:** ✅ Concluído (revisão tech lead + resolução de conflitos com `main`).
- **Objetivo:** Fechar o **D40**, resíduo do PR #316 — aquele fechou apenas o N+1 de `tipo_estrutura` do marco e deixou 3 buscas sequenciais vivas em `src/lib/evidence/materializar.ts`, uma delas com **3 round-trips por meta**.
- **Entregas principais:**
  - Três novos métodos em lote no contrato `MaterializarQueries`, com implementação nos dois backends (`drizzleMaterializarQueries` e `postgresMaterializarQueries`):
    - `taxonomiasDosProtocolos(protocolIds)` — 1 query (`inArray` / `= ANY($ids)::uuid[]`) no lugar de N em `protocol`;
    - `criteriosDominioDasMetas(goalIds)` — 1 query no lugar de N em `goal`;
    - `lerCandidaturasGoalsAtuais(goalIds)` — 1 query no lugar de N em `goal_candidacy`.
  - Cada método **curto-circuita com lista vazia** (`if (ids.length === 0) return new Map()`), então recompute sem evidências não vai ao banco.
  - Gravações de `aplicarSnapshot` (por número de sessão) e `aplicarCandidaturaGoal` (por meta) paralelizadas com `Promise.all` — são linhas independentes, sem dependência de ordem entre si.
  - Remoção de `repertorioPorGoal`, cálculo morto que rodava `computarRepertorio` sobre o histórico inteiro sem consumidor.
- **Revisão tech lead (PR #417):**
  - **Conflitos com `main` resolvidos de forma aditiva** em worktree isolado (`.worktrees/fix-330-n-plus-1-materializar-snapshot`): `BACKLOG.md`, `checkpoint.md` e `docs/GO_LIVE.md` colidiram porque `main` avançou com #414, #415 e #416 enquanto a branch estava aberta. Nas tabelas, a colisão era de **alinhamento de coluna do Prettier** — 43 linhas "diferentes", apenas 3 com divergência real de conteúdo. Resolução: base = `main`, com a linha do **D40** vinda da branch e a do **D31** vinda de `main`. Verificado por script: **0 identificadores `D<n>` perdidos** de qualquer um dos lados.
  - **Correção de conteúdo**: o `checkpoint.md` da branch afirmava que o provedor de IA (Gemini) já estava nomeado em `docs/legal/`. Não está — `main` corrige isso e a versão de `main` prevaleceu (`[[teste-afirma-doc-nao-commitado]]`).
  - **Dívida residual aceita, não bloqueante**: `taxonomiaDoProtocolo`, `criterioDominioDaMeta` e `lerCandidaturaGoalAtual` seguem no contrato sem chamador em produção. Mantidos de propósito — como `tipoEstruturaDoMarco` desde a #316 — porque os testes asseriam `not.toHaveBeenCalled()` sobre eles: é esse par (batch chamado 1×, unitário 0×) que prova que o N+1 não voltou.
- **Validação (medida, mutando o código de produção):**
  - `pnpm typecheck`: 0 erros. `pnpm lint`: 0 erros (9 warnings pré-existentes).
  - `pnpm test`: **246/246 arquivos · 1.777/1.777 testes verdes** (worktree já com `main` mergeada).
  - Mutante **M1** — trocar `taxonomiasDosProtocolos(protocolIds)` de volta pelo laço `for` que chama `taxonomiaDoProtocolo(pid)` → **morto** (1 teste cai).
  - Mutante **M2** — `candidacySince = isCandidate ? new Date() : null` (perde a preservação da data de candidatura já existente) → **morto** (1 teste cai). Este é o mutante que importa: sem ele, o batch novo poderia "funcionar" e ainda assim reiniciar a contagem de há quanto tempo a meta é candidata a cada recompute (`[[carimbo-de-estado-nao-limpo-na-volta]]`).
  - Oráculos de contagem em `db/tests/fase4-materializar.int.test.ts` (5 testes novos) medem **SQL real por tabela** (`milestone`, `protocol`, `goal`, `goal_candidacy`) e exigem `toBe(1)`, mais um teste de "listas vazias → 0 queries". **Não rodam nesta máquina** (Docker/Postgres local desligado); a prova fica com o job `test-rls` do CI.
- **Achado da revisão, corrigido nesta PR (`1f6b5ee`):** o teste `listas vazias não vão ao banco` reprovou no `test-rls` com `expected 1 to be +0`, **enquanto as quatro asserções de `Map` vazio passavam**. Não era o código de produção: o contador era zerado dentro do callback da transação, mas a asserção rodava **depois** que o `tx` fechou — e o `COMMIT` que o próprio Drizzle emite ao sair já tinha entrado na conta. Os quatro métodos em lote curto-circuitam corretamente. Correção: mover a asserção para **dentro** da transação, onde ela mede só o que os métodos emitiram. O oráculo não afrouxou — se algum método voltar a consultar o banco com lista vazia, o teste segue vermelho.
  - Lição: **oráculo que conta query tem que delimitar a janela de contagem no mesmo escopo da unidade sob teste.** Contar fora da transação mistura BEGIN/COMMIT com o SQL do código, e o vermelho aponta para o lugar errado. Vale para todo teste de contagem daqui pra frente.

---

## 🏁 Sessão 21/08/2026 (3ª) — Remoção da side-stripe banida do componente Alert (D54)

Execução do débito **D54** (solicitado como D57 na sessão, correspondente à remoção da side-stripe de alertas):

1. **Refatoração de `src/components/ui/alert.tsx`**:
   - Remoção de `border-l-[4px]` da classe raiz do componente.
   - Remoção das propriedades `bordaEsquerda` e `bordaOutras` do mapa `estilo`.
   - Adição de `borda` com cor uniforme sólida de 2px (`border-2 border-[var(--status-{severidade}-border)]`) por severidade (`erro`, `error`, `warning`, `info`, `sucesso`, `success`).
2. **Cobertura de Testes**:
   - Criação de `src/components/ui/alert.test.tsx` com 6 testes unitários cobrindo todas as severidades, validação de ausência estrita de side-stripe e bordas assimétricas, suporte a `destacado`, `ref` e acessibilidade (`role="alert"` / `role="status"`, `sr-only`).
   - Todos os 241 arquivos de teste e 1.717 testes unitários passando 100% verdes.
3. **Knowledge Graph**: Grafo atualizado via `graphify update .`.

### Revisão tech lead (22/08/2026) — resolução de conflitos e correção de escopo (PR #416)

- **Conflitos com `main` resolvidos** em `BACKLOG.md`, `checkpoint.md` e `docs/GO_LIVE.md`, após `main` avançar com as PRs #412 (D52), #413 (D53), #414 (D47) e #415 (#328). Resolução **aditiva**: o diff de `docs/GO_LIVE.md` contra `main` tem **0 linhas removidas** — as tabelas dos 4 pilares foram unidas por chave (`D<n>` / `#<issue>`), preservando as linhas que `main` trouxe. Lição aplicada: `[[merge-sem-conflito-apaga-feature-mergeada]]`.
- **Achado corrigido — teste afirmando conteúdo de documento não commitado.** A branch alterava `src/lib/legal.test.ts` e `src/components/legal/documento-legal.test.tsx` para exigir `Google (Gemini API)` e `EXTRACTION_LLM_ENABLED` na Política de Privacidade, mas `docs/legal/politica-privacidade.md` **continua na versão `2026-08-07`, sem nenhuma menção a Gemini** (medido: `grep -c Gemini` = 0). Os dois testes falhavam de vermelho. Ambos foram **revertidos ao estado de `main`**: (a) a mudança é fora do escopo do D54; (b) `docs/legal/` exige autorização explícita do Rômulo (`CLAUDE.md` § Permissões). O gate D57 (nomear o provedor de IA na política) segue **aberto**, registrado no PILAR 1 do `docs/GO_LIVE.md`.
- **Resistência a mutação medida** (mutando `src/components/ui/alert.tsx`, não o teste):
  - Mutante reintroduzindo `border-l-[4px]` na classe raiz → **morto** (9 de 10 testes caem).
  - Mutante trocando as 6 cores de `borda` por `--border-brutal` uniforme → **morto** (7 testes caem).
- **Varredura de perímetro:** `bordaEsquerda`, `bordaOutras` e `border-l-[4px]` têm **0 ocorrências** em `src/` fora do próprio teste de guarda.
- **Validação após o merge (medida):** `pnpm typecheck` 0 erros · `pnpm lint` 0 erros (9 warnings pré-existentes de Storybook/`<a>`) · `pnpm test` **245/245 arquivos · 1.773/1.773 testes verdes** · `pnpm build` Next.js concluído com sucesso.

---

## 🏁 Sessão 21/08/2026 (2ª) — Revisão jurídica de `docs/legal/`, 3 achados corrigidos e provedor de IA de extração definido (Gemini)

Revisão jurídica completa dos 14 documentos de `docs/legal/`, feita a pedido do Rômulo (persona advogado LGPD/psicologia), entregue em `docs/legal/revisao-juridica-2026-08-21.md`. Três achados não estavam sinalizados em nenhum lugar do corpus:

1. **`pesquisa-planos-de-saude-prontuario.md` §4 afirmava que relatórios/evoluções de prontuário alimentariam um índice RAG "dos modelos de inteligência clínica da plataforma"** — contradizia `politica-privacidade.md` §6 (uso agregado só com consentimento específico, hoje inativo) and o Art. 11 da LGPD (veda uso de dado sensível de saúde entre controladores para vantagem econômica). Frase removida; nenhum índice vetorial existe em `src/db/schema.ts` — não confirmado como implementado.
2. **`visibility_level` (sigilo multidisciplinar) e `e_psi_verified`/`e_psi_number`, especificados por `docs/legal/aditivo-especificacoes-legais.md` (advogado Thiago Lyra Galvão), não existem no schema** — abrem D55 e D56 acima.
3. **Teste de proporcionalidade do legítimo interesse (Art. 10 LGPD) do mecanismo antifraude `cpf_hash`, referido como pendente desde 07/08, foi produzido** — `docs/legal/teste-proporcionalidade-legitimo-interesse-antifraude.md`.

Decisões tomadas pelo Rômulo na mesma sessão, aplicadas aos documentos: DPO informal = o próprio Rômulo (Rômulo Sutil Corrêa) até o negócio crescer; prazo de aviso de alteração relevante dos Termos = 30 dias corridos; canal de contato contratual = `notificacoes@irisclinica.ia.br`; **o Dr. Thiago lerá os documentos jurídicos mas não emitirá parecer escrito assinado por ora** — o protocolo de ratificação por leitura sem apontamento (já em uso desde 29/07) continua sendo o método de validação do projeto, por decisão consciente, não por lacuna a fechar.

**Provedor de IA de extração definido: Gemini (Google).** Pesquisa de termos em 21/08/2026: tier pago do Gemini API tem opt-out automático de treino com o conteúdo enviado, retenção de ~30 dias só para segurança, e DPA do Google Cloud incorporado automaticamente ao ativar billing — o DPA cobre transferência internacional via cláusulas-padrão (Appendix 3). **Não confirmado:** (a) se a chave `GOOGLE_API_KEY` em uso está de fato numa conta com billing pago ativo — tier gratuito usa conteúdo para treino e não tem DPA, inaceitável para dado de saúde de menor; (b) se o Gemini API standalone (via chave, sem Vertex AI/região) está no escopo dos "Audited Services" do DPA do jeito que Vertex AI está — verificar em `cloud.google.com/security/compliance/services-in-scope`; (c) se as cláusulas-padrão do Google satisfazem o Art. 33 LGPD na mesma medida que satisfazem GDPR — pendente de leitura do Dr. Thiago. `EXTRACTION_LLM_ENABLED` continua `false` até essas três confirmações — ver D57.

`politica-privacidade.md` §4, os termos de consentimento (`termo-consentimento-titular-adulto.md` §5/§9, `termo-consentimento-curatela.md` §6/§10) e o "gate de impressão" correspondente foram atualizados com o nome do provedor e a ressalva acima — nenhum termo pode ser impresso/assinado com titular real até as três confirmações do parágrafo anterior fecharem.

**Gate D-H (Consentimento / Anamnese) 100% finalizado:** A revisão confirmou que o relato da dinâmica familiar/terceiros no contexto da anamnese está respaldado pela Tutela da Saúde (Art. 11, II, "f") em conjunto com o consentimento de admissão do menor (Art. 14, §1º), com o gate técnico ativo no código (`app_prontuario_somente_leitura`).

**PRs abertas nesta sessão:** [#412](https://github.com/romulosutil/Iris/pull/412) (D52 - guardrail de seed), [#413](https://github.com/romulosutil/Iris/pull/413) (D53 - guardrail de preview em layout), [#414](https://github.com/romulosutil/Iris/pull/414) (D47 - sincronização convencional) e [#415](https://github.com/romulosutil/Iris/pull/415) (#328 - testes comportamentais de proxy matcher).

## 🏁 Sessão 21/08/2026 — D47: sincronização de fixtures e contrato documental do modo Terapia Convencional

Fechamento do débito **D47**: alinhamento completo entre o contrato executável de runtime (`agentOutputSchema` / `output-schema.json`), o documento do protocolo (`docs/agente/protocolo-terapia-convencional.md` §3, §7, §8.3) e todas as fixtures do eval set do modo convencional (`docs/agente/casos-de-teste-terapia-convencional.md` TC-1 a TC-5b).

### O que mudou:

1. **`alerta_risco` unificado nos 3 modos:**
   - Atualizado para a forma canônica `{categoria, severidade, certeza, trecho_fonte, detalhe}` nullable (`null` em ausência de risco), eliminando o campo legado booleano `presente`.
   - `certeza` ("explicito" | "ambiguo_citado") e `severidade` refletidos na documentação e em todas as saídas esperadas dos casos de teste.
   - Achado 1 da §7 de `protocolo-terapia-convencional.md` marcado formalmente como resolvido por #122/R20 e #390.
2. **`temas: string[]`:**
   - Fixtures do eval set (TC-1 a TC-5b) atualizadas de array de objetos (`{tema, trecho_fonte}`) para array simples de strings (`string[]`), em perfeita paridade com `agentOutputSchema.temas`.
3. **Cobertura de Testes:**
   - `src/lib/extraction/agent-output-schema.test.ts` atualizado com testes diretos validando as saídas dos Casos TC-1 (ausência de risco = `null`) e TC-2 (presença de alerta unificado) contra o schema `agentOutputSchema`. 17/17 testes passam com 100% de sucesso.
   - **Guard executável contra re-drift (revisão tech lead do PR #414):** as 6 saídas esperadas do eval set foram lidas do doc e validadas contra `agentOutputSchema` — todas rejeitavam por `extracoes` ausente, campo `required` tanto no schema quanto no tool schema entregue ao modelo. Fixtures corrigidas para abrir com `"extracoes": []`, e adicionado bloco de teste que lê `docs/agente/casos-de-teste-terapia-convencional.md` e valida cada saída esperada, com trava de contagem (6) para não ficar verde caso o extrator deixe de casar o heading. Sem ele o alinhamento do D47 seguia manual e voltaria a dessincronizar em silêncio — foi assim que o D47 nasceu.
   - **Medição por mutação:** 5 mutantes mortos — remover `extracoes` de uma fixture, reverter `alerta_risco` à forma booleana antiga (`presente`), reverter `temas` a array de objetos, `certeza` fora do enum, e renomear o heading `Saída esperada`.

---

## 🏁 Sessão 21/08/2026 (2ª) — Guardrail de Ambiente nos Scripts de Seed (Fechamento do D52)

Implementação do guardrail de proteção ambiental para todos os scripts de seed (`pnpm seed`, `pnpm seed:local`, `pnpm seed:custom`, `pnpm seed:superadmin`).

- **Módulo Guardrail (`scripts/lib/guardrail-seed.ts`)**: Funções `assertSeedAllowed`, `isLocalDatabaseHost`, `isLocalDatabase` e `extractDatabaseHost`. Extrai e normaliza hostnames de URLs PostgreSQL (`postgres://`, `postgresql://`, formatos IPv4, IPv6 e libpq key-value). Bloqueio fail-closed se o host não for loopback (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`) e `ALLOW_SEED_REMOTE !== "true"`.
- **Ponto de Entrada e Scripts Integrados**: `scripts/seed.ts` criado e configurado em `package.json` (`pnpm seed`). Guardrail aplicado em `scripts/seed-local.ts`, `scripts/seed-demo-account.ts` e `scripts/seed-super-admin.ts`.
- **Documentação de Ambiente**: `.env.example` atualizado com a documentação da flag de invocação `ALLOW_SEED_REMOTE=true`.
- **Cobertura de Testes Unitários & Mutação**: 16 testes unitários em `scripts/lib/guardrail-seed.test.ts`. Verificado por teste de mutação (7 falhas de teste quando o guardrail é relaxado).

**Medição:** `pnpm typecheck` 0 erros · `pnpm lint` 0 erros · `pnpm format:check` 100% limpo · `pnpm test` 241 arquivos / 1.722 testes verdes (0 skips).

---

## 🏁 Sessão 21/08/2026 — Features #407, #409 e Navegação Clínica mergeadas em `main` (PRs #408, #410, #411)

Entrega completa das features de Marco Zero (Anamnese), Navegação de Prontuário e Sub-navegação em Configurações da Clínica.

- **Feature #407 (PR #408 — `96044e1`)**: Anamnese estruturada como marco 0 da linha do tempo. 34/34 tasks concluídas por SDD (`.specs/features/407-anamnese-marco-zero/`). Tabelas `anamnese` e `anamnese_alvo` (migração `0115`), procedure `app_validar_anamnese` (snapshot 0 em `session_snapshot` com merge jsonb), gates de coordenador/protocolo/teto/consentimento, scrubber/timeline lendo marco 0 e formulário no design system.
- **Feature #409 (PR #410 — `498d335`)**: Ponto de entrada da aba "Anamnese" no prontuário (`src/app/(app)/pacientes/[id]/layout.tsx`), condicionada a `protocol_driven` via `modalidade.ts`.
- **Navegação & Dashboards (PR #411 — `5adfe6f`)**: Sub-navegação de `/clinica` com `TabsNav` (`/clinica/dados`, `/clinica/feriados`, `/clinica/emergencia`), fechando **D31**. Atalhos diretos em PEI e Ficha Clínica para dashboards de progresso dos protocolos.

**Medição:** `pnpm typecheck` 0 erros · `pnpm lint` 0 erros · `pnpm test` 240 arquivos / 1.706 testes verdes · `pnpm test:rls` 119 arquivos / 1.071 testes verdes (0 skips) · `src/db/migrations.test.ts` 8/8 verdes.

---

## 🏁 Sessão 21/08/2026 — Guardrail de CI contra injeção de scripts de preview em layout.tsx (D53)

Fechamento definitivo do débito **D53**, eliminando o risco de scripts de live reload / preview de UI (como Impeccable Live) vazarem em `src/app/layout.tsx` ou em qualquer arquivo de código do produto.

### O que foi entregue

1. **Remoção de injeção residual:** Limpeza da tag `<script src="http://localhost:8400/live.js" />` remanescente em `src/app/layout.tsx`.
2. **Módulo de guardrail estático (`src/lib/security/guardrail-preview-layout.ts`):** Motor de análise estática pura que detecta referências à porta 8400, scripts apontando para `localhost` ou `127.0.0.1`, scripts `live.js` e marcadores de preview `impeccable-live` (comentários HTML/JSX e atributos `data-impeccable-live`).
3. **Suíte de testes de regressão & integridade (`src/lib/security/guardrail-preview-layout.test.ts` e `src/app/layout.test.tsx`):**
   - 10 casos de teste estático cobrindo variações de injeção, bypass por condicionais (`NODE_ENV === "development"` com diretivas de ESLint) e varredura recursiva de diretórios (`src/app/` e `src/`).
   - 3 casos de teste unitário para `RootLayout` garantindo que metadados, estrutura de layout e ausência de scripts no DOM renderizado sejam rigorosamente verificados.
4. **Workflow de CI dedicado (`.github/workflows/layout-preview-guardrail.yml`):** Gate rápido executado em pull requests e push para `main`, bloqueando qualquer merge que contenha scripts de preview.

### Medição e Verificação Real

- **Ciclo TDD Red-Green verificado:** Testes falharam acusando exatamente a injeção em `src/app/layout.tsx:54` antes do fix e passaram 100% após a remoção.
- `pnpm typecheck`: 0 erros.
- `pnpm lint`: 0 erros (9 warnings conhecidos e não relacionados).
- `pnpm test`: 242 arquivos / 1719 testes aprovados (100% verdes).
- `pnpm build`: Build Next.js 16.2.11 gerado com sucesso em 15.4s (49 páginas estáticas e dinâmicas compiladas).

---

## 🏁 Sessão 20/08/2026 (2ª) — auditoria da aba Evolução: a falha de rede que virava fato clínico, e a modalidade que nunca chegou na porta de entrada

Auditoria de jornada e carga cognitiva de `/pacientes` → prontuário → aba **Evolução**, a pedido do Rômulo. Resultado: **12/40** nas heurísticas de Nielsen. Um P0 corrigido nesta sessão; o redesenho saiu como plano, não como código.

Registro completo em [`.impeccable/critique/2026-08-20T15-28-14Z__src-app-app-pacientes-id-aba-evolu-o.md`](.impeccable/critique/2026-08-20T15-28-14Z__src-app-app-pacientes-id-aba-evolu-o.md).

### 1. O P0, corrigido: falha de rede apresentada como afirmação clínica

Os três `catch` de [`timeline-client.tsx`](<src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx>) faziam `console.error` + `setState(null | [])`. Como `null` e `[]` são exatamente os valores que alimentam o **empty state**, uma oscilação de rede renderizava:

- "Nenhuma alteração clínica registrada nesta sessão"
- "Nenhuma evidência registrada para este trecho nas sessões selecionadas"

Ou seja: o produto que se vende em "nada é maquiado como certeza" afirmava que o paciente não evoluiu, com base em nada. O coordenador que valida por exceção passaria direto por um trecho que nunca carregou.

Novo [`estado-de-erro.tsx`](<src/app/(app)/pacientes/[id]/timeline/estado-de-erro.tsx>): `role="status"` (não `alert` — a semântica que interrompe o leitor de tela segue reservada ao risco clínico, como em `layout.tsx` e `FaixaTrial`), ícone SVG estático, texto literal, botão "Tentar de novo" com contador de tentativa nas dependências do efeito.

**Regra que o componente carrega:** ausência de dado e ausência de resposta nunca compartilham componente. Empty state afirma um fato; estado de erro afirma que não sabemos.

Junto veio o defeito que o fix expôs: `carregandoDelta` e `carregandoComparacao` viraram estados separados. Os dois liam o mesmo `isPending` do `useTransition`, e o painel recebia `carregando={isPending && !compararAtivo}` — **com o comparador ligado, trocar de sessão deixava os números da sessão anterior na tela, sem sinal de que estavam obsoletos.**

Cobertura: [`delta-sessao.test.tsx`](<src/app/(app)/pacientes/[id]/timeline/delta-sessao.test.tsx>), 5 casos. O caso decisivo é `erro === true` **junto de** `delta === null` (o estado exato que o `catch` deixa): cada asserção afirma o que aparece **e** o que não aparece, senão a inversão da ordem das guardas passaria verde. Mutação conferida — desligar a guarda de erro quebra a suíte.

### 2. Decisões de produto travadas nesta sessão (Rômulo, 20/08)

| Decisão                             | Conteúdo                                                                                                                                                                                                                                                                                                                                                          |
| :---------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Uma pergunta por tela**           | A aba responde "o que mudou nesta sessão?" e "como este alvo evoluiu no tempo?" — são duas vistas, não seis painéis simultâneos.                                                                                                                                                                                                                                  |
| **`conventional` não tem Evolução** | Psicologia convencional é acompanhamento empírico/narrativo. Métrica derivada dali seria certeza fabricada. A rota base redireciona para `Temas`.                                                                                                                                                                                                                 |
| **Registro ≠ leitura**              | A aba da modalidade (`PEI & Metas` / `TCC` / `Temas`) é onde se **escreve**; Evolução é onde se **lê**. Hoje TCC quebra isso: os gráficos moram junto do formulário de RPD.                                                                                                                                                                                       |
| **O hexágono vira cobertura**       | Ele plotava `valor` — média de progresso normalizada por eixo, a única síntese do produto, e a mesma operação que "a IA nunca pontua protocolos" proíbe em todo o resto. Passa a plotar `contagemEvidencias`, dado que **já existe em `DadosEixoRadar` e nunca foi mostrado**. Continua sendo a assinatura visual; passa a responder "onde há e onde falta dado". |

Plano de execução em [`docs/superpowers/plans/2026-08-20-evolucao-por-modalidade-e-cobertura-de-evidencia.md`](docs/superpowers/plans/2026-08-20-evolucao-por-modalidade-e-cobertura-de-evidencia.md) — 5 tarefas, TDD, código completo por passo.

### 3. Achados medidos que o plano endereça

- **A aba padrão mente para 2 das 3 modalidades.** `mapearEixo()` deriva os 6 eixos de `milestone.dominioId` (mando, tato, ecoico, ouvinte) ou da disciplina Fono/TO, e `materializarSnapshot` **não tem gate de modalidade**. Paciente de TCC com evidências aprovadas abre o prontuário e vê um hexágono VB-MAPP zerado com pico solitário em Cognição (o fallback), "Marcos e Protocolos" em empty state e um `<select>` com dois `optgroup` vazios. É o padrão `feature-sem-caminho-de-escrita-do-campo` de novo: a modalidade chegou nas abas e não chegou na porta de entrada.
- **A leitura de evolução do TCC já existe, na aba errada.** `GraficoEvolucaoCrencas` (intensidade pré × pós reestruturação) está dentro de `tcc/page.tsx`, e `instrumento_aplicacao.escoreTotal` (PHQ-9/GAD-7) nunca virou série temporal — que é a medida de desfecho padrão em TCC.
- **A Epistemic Honesty Rule está quebrada na cor.** `grep status-ia|violeta` na aba inteira devolve **0**. "Candidato" — a saída da IA — usa `--status-info-*` (azul, papel = notificação), e `delta-sessao.tsx` usa o mesmo azul para "Introduzidos na Sessão": azul significa duas coisas na mesma tela.
- **Barra de progresso invisível.** Faixa "conquistados" `#b2dfdb` sobre trilha `#e5e7eb` = **1,17:1**; "candidatos" `#eff6ff` sobre o mesmo cinza = **1,19:1**. Mínimo WCAG 1.4.11 para objeto gráfico é 3:1. As duas faixas também são indistinguíveis entre si.
- **`focus:outline-none` em 4 controles sem substituto**; `grep focus-visible` na aba devolve 0.
- **Alvos abaixo de 44px:** `<select>` de trajetória ≈38px, `<select>` do comparador ≈32px, checkbox `size-4` = 16px.
- **`text-xxs` (3×) e `text-muted` (6×) são classes mortas** — nem `--text-xxs` nem `--color-muted` estão declarados no `@theme` de `globals.css`. O texto herda tamanho e cor do pai.
- **4 painéis usam `bg-canvas`** (`--bg-app`, a cor da **página**) enquanto scrubber e delta usam `--surface-card`. Emenda visível.
- **Radar estourava no mobile:** 300×300 fixo, rótulos projetados a `1.2 × raio` com `overflow-visible` → extremos em x = −20 e 320, contra ~276px úteis num viewport de 360px. Rótulos em 9px.
- **Copy com vocabulário de engenharia na tela clínica:** "Guard G7 Ativado", "snapshots de repertório materializados", `dominioId` cru em `UPPERCASE`, e UUID truncado no fallback de nome de alvo.
- **Emoji como ícone** em 6 pontos (`📭 ⚠️ 🚀 📈 📉 🔒`) — fecha o item aberto da rodada anterior ("auditar se algum empty state ainda usa emoji": usa).
- **Cobertura de UI zero** nas 1352 linhas de `TimelineClient` + `Scrubber` + `DeltaSessaoLateral`: nenhum `.test.tsx`, nenhuma `.stories.tsx`. O `a11y.test.tsx` de `/pacientes` cobre layout e lista, e o axe sob jsdom **não avalia contraste**.

### 4. Verificação

`pnpm typecheck` 0 erros · `npx vitest run "src/app/(app)/pacientes"` **175/175 verdes** · ESLint 0 erros nos arquivos tocados (1 warning `react-hooks/exhaustive-deps` em `timeline-client.tsx`, confirmado pré-existente em `main` por comparação direta).

**Não verificado em runtime:** o dev server responde, mas `/pacientes` exige login e não é permitido digitar senha. Contraste, foco e alvo de toque foram medidos no código e nos tokens resolvidos, não no DOM renderizado.

### 5. Fica aberto

- **D54** (novo): `Alert` embute a side-stripe banida — em todo uso no produto.
- Ações do `PageHeader` do prontuário duplicam abas logo abaixo, e o botão "PEI & Metas" aparece até para paciente TCC.
- Empty state manda "Agendar Primeira Sessão" → `/agenda`, mas o próximo passo real de um paciente novo é prescrição → equipe (a lista já marca "Sem prescrição"). Falta decidir a ordem canônica de onboarding do paciente.
- `useState<any[]>` e `ev: any` no drilldown — o único ponto da tela que exibe texto clínico literal é o único sem tipo.

---

## 🏁 Sessão 20/08/2026 — rodada de design: revelação progressiva, semiótica de cor e 18 commits atômicos de trabalho represado

Sessão de **design de interface**, não de feature nova. Fechou a dívida de árvore suja que vinha se acumulando: **144 arquivos modificados e 20 não rastreados** na branch `feat/ajuste-menus-navegacao-e-permissoes`, resultado de várias sessões de UI sem commit.

### O trabalho de design em si

- **Revelação progressiva em `AlertaRiscoCard` e `SupervisaoCard`.** Os cards mostravam ao mesmo tempo contador de SLA vivo, disclaimer de IA, dever legal do ECA e três botões — leitura de auditoria fiscal, não de decisão clínica. A superfície passa a carregar só a **história humana** (categoria/paciente + relato literal, ou a frase do sinal), a pílula de estado e **um CTA único**. Metadado regulatório e técnico recuam para `<details>` ("Ver respaldo regulatório" / "Ver detalhes técnicos"); Resolver e Descartar saem para menu de reticências.
- **Dois marcadores ficam visíveis de propósito:** "Prazo vencido" e "Dever legal aplicável". São gatilhos que mudam a decisão — esconder por completo o aviso do ECA seria risco maior que o ruído que ele causa. Só o **texto integral** recua; o sinal fica.
- **Semiótica de cor na navegação de governança.** Todas as abas usavam badge de aviso, então nada se destacava. Vermelho vira exclusivo de Alertas de Risco; violeta marca as filas processadas por IA (Validação, Exceções); cinza marca as operacionais (Supervisão, Pendências); badge zerado recua em vez de disputar atenção.
- **Ouro brutal deixa de marcar menu ativo** (Header) e passa a ser reservado a botões de ação e alertas. Header e `TabsNav` convergem para o padrão _underline tabs_.
- **Banner ganha `formato="compacto"` + `dismissible`**, e a `FaixaTrial` para de ocupar altura de decisão clínica para falar de cobrança. Em `trial_aguardando` o CTA vira "Cadastrar primeiro paciente" — quem está em trial ainda não tem o que assinar.
- **`obterContadoresGovernanca`** centraliza as cinco filas em paralelo e aceita valores pré-calculados, para a página ativa não repetir a própria query.

### Dois primitivos novos, e por que foram escritos à mão

- **`MenuAcoes`** implementa o padrão WAI-ARIA de _menu button_ sem dependência nova: o projeto não tem `@radix-ui/react-dropdown-menu` e a alternativa era instalar uma. Tabindex móvel, setas em ciclo, Home/End, Escape e Tab fechando com devolução de foco.
- **`DetalhesExpansiveis`** usa `<details>`/`<summary>` nativos: o gatilho já é focável e anunciado sem ARIA manual, e o conteúdo fechado **sai da árvore de acessibilidade** em vez de ficar lido por baixo da interface.

### O defeito de foco que só apareceu porque o teste mediu a ordem

Fechar o menu é atualização de estado — entra no mesmo lote do handler. A ação selecionada (tipicamente abrir um `Dialog`) rodava com o foco **ainda no `menuitem`**; o Radix grava como "foco anterior" o elemento ativo no instante em que o modal abre, e devolveria o foco a um nó já desmontado ao fechar. Quem navega por teclado terminaria a confirmação sem foco nenhum.

Corrigido com `flushSync` antes de invocar a ação. **O teste que pegou isso não asserta o resultado, asserta a ordem:** o callback registra se o menu ainda estava no DOM quando rodou. Um teste que só verificasse "o modal abriu" passaria com o defeito vivo.

### A árvore suja tinha 106 arquivos de ruído puro e 2 bloqueadores reais

Classificação feita **medindo, não olhando**: para cada arquivo modificado, a versão do `HEAD` foi reformatada com o Prettier do projeto e comparada com a atual. Resultado:

- **31 arquivos** com diferença só de formatação (rastro de um `pnpm format` repo-wide) — inclusive **8 snapshots do Drizzle** e o `pnpm-lock.yaml` com 11.985 linhas de churn que era só troca de aspas. Restaurados.
- **74 arquivos** com diferença só de EOL (`core.autocrlf`), que o `git diff` já normaliza para vazio. Restaurados.
- **39 arquivos** com mudança real. Commitados.

Os dois bloqueadores achados no caminho viraram **D52** (senha literal no seed de demo, sem fronteira entre banco local e produção) e **D53** (script de preview em `localhost` injetado no `layout.tsx`, revertido à mão). Um terceiro achado virou correção: `cadastro-form.tsx` era o **único erro de lint do repositório** (`react-hooks/set-state-in-effect`) — voltar ao passo 1 quando o servidor recusa credenciais é derivação do resultado da action, não sincronização com sistema externo, então passou a ser ajuste de estado durante o render.

### Verde medido

`pnpm typecheck` limpo · `pnpm lint` **0 erros** (era 1) · `pnpm test` **225 arquivos / 1564 testes**, incluindo 12 novos (6 de `MenuAcoes`, 4 de `AlertaRiscoCard`, 2 de `SupervisaoCard`).

**18 commits atômicos**, do token de base ao card final, em ordem de dependência: `01eaaa4` tokens/ícones → `dc6e3bd` controles → `e1f23af` empty-state/page-header → `2867153` banner → `85024d2` header/abas → `77d535f` badges de governança → `f852bd8` contadores → `01c8584` ClinicalQuote → `b9850a0` MenuAcoes/DetalhesExpansiveis → `8243817` cards → `d382df8` faixa de trial → `0dee836` provisionamento → `c4153d0` cadastro → `8f595fb` a11y → `fba2a00` barrel → `ffbcdab` DESIGN.md → `1785352` scripts → `632a0cc` chore.

### O que fica aberto

- **Nada disso foi visto em navegador.** A verificação é typecheck + lint + suíte + axe em jsdom; não houve passada de Storybook nem screenshot. Contraste real dos novos tokens (`--surface-muted`) em tema claro e escuro segue **não medido em tela**.
- **A branch não foi enviada.** Os 18 commits estão locais em `feat/ajuste-menus-navegacao-e-permissoes`.
- `acoes` foi **removido** da API dos dois cards (virou `acaoPrimaria` + `acoesSecundarias`). Mudança de contrato, não aditiva — todos os consumidores do repositório foram migrados, mas nada impede que uma branch paralela ainda use a prop antiga.

---

## 🏁 Sessão 18/08/2026 (3ª) — fila de 9 issues TCC: #388, #387 e #390 executados

Execução em cadeia da ordem #388→#387→#390→#389→#391→#392→#395→#393→#394, orquestrada com subagentes em paralelo por issue (spec via `/tlc-spec-driven`, pesquisa grounded via fork, 2-3 subagentes de implementação em arquivos disjuntos, verificação final pelo orquestrador). Branches empilhadas: `feat/388-clinical-modality-cognitive-behavioral` ← `feat/387-clinical-modality-selector` ← `feat/390-output-schema-tcc-convencional` ← (em andamento) `feat/389-...`.

- **#388** (PR #397): enum `clinical_modality` ganha `cognitive_behavioral` (migração `0107`, isolada). Roteamento modalidade→modo→prompt exaustivo, `default` lança. `TCC_SYSTEM_PROMPT` novo com regra de risco. Bug real corrigido em `layout.tsx` (aba TCC aparecia em `conventional`, invertido). Aba/rota Temas nova — achado: `resumo_sessao`/`temas[]` nunca foram persistidos, vira gap documentado (fechado depois pela #390 no eixo de contrato, mas a persistência real do resumo pela extração segue em aberto).
- **#387** (PR #398): seletor de modalidade no cadastro (radio group obrigatório, sem fallback silencioso — causa raiz original do bug relatado pelo Rômulo). Gate de consentimento adulto+TCC/convencional exige `titular_adulto`, bloqueado em client e servidor. Edição via Server Action — **correção de premissa**: a issue pedia `SECURITY DEFINER`, mas `patient_update` (RLS) já cobria a escrita; mirror de `alternarArquivamento` sem migração nova. Guard 404 em `tcc/page.tsx` que faltava.
- **#390** (PR #399): `output-schema.json` e Zod sincronizados. `risco_seguranca` faltava no doc (Zod já aceitava — falso negativo de segurança só documental). `extracoes[].tipo` ganha `registro_pensamento`/`aplicacao_escala_relatada`/`tarefa_casa` (migração `0108`, isolada). `item_risco_positivo` é `boolean|null`, nunca defaultado pra `false`. `alerta_risco` unificado nos 3 modos (forma já implementada por #122/R20) — achado: a doc de protocolo convencional e a fixture de caso-de-teste usam forma antiga, virou **D47**.
- **#389** (PR pendente de abrir): RPD sai do formato Burns puro (`distorcao_cognitiva` `NOT NULL`, pedágio antes da resposta racional, zero evidência) pro superconjunto Burns+Padesky — evidências a favor/contra viram núcleo, distorção vira opcional/multivalorada/posterior, colapsada por padrão. Migração em duas levas (`0109` add+backfill com `RAISE NOTICE` de não-casados, `0110` drop) — Postgres não deixa promover enum e usar na mesma transação, e aqui o motivo extra foi `drizzle-kit generate` pedir prompt interativo (sem TTY) pra ambiguidade rename-vs-drop+add quando add e drop saem juntos. Taxonomia de distorções vira `clinic.taxonomia_distorcoes` (config por clínica, mesmo padrão de `protocol.taxonomia_ajuda`, PROIBIDO virar enum/CHECK — R19). Completude ("registro capturado" vs "reestruturação completa") derivada em leitura, nunca coluna gravada; gráfico só plota completos. `origem_resposta_racional` ficou de fora de propósito — decisão pendente do Rômulo, virou **D48**.

Verde medido em cada PR: `typecheck`/`lint` (0 erros)/`test`/`test:rls`. Migrações `0107`-`0110` verificadas via `pg_enum`/`information_schema`/`has_column_privilege` (não só leitura do `.sql`). Nenhuma das 4 PRs foi mergeada ainda — empilhadas, aguardando revisão do Rômulo ou merge sequencial.

Incidente operacional (2x nesta sessão, ambos por descuido do orquestrador, não do usuário): (1) um `git reset --hard` durante split de branch, antes do #388, apagou edições não commitadas de `checkpoint.md` e `docs/GO_LIVE.md` de sessão anterior — `checkpoint.md` foi reconstruído a partir da memória da sessão; `docs/GO_LIVE.md` não, diff perdido, sem tentativa de adivinhar conteúdo. (2) Um comando Bash com crases dentro de string de shell entre aspas duplas (`bash -c "... \`git reset --hard\` ..."`) fez o shell expandir as crases como substituição de comando **antes** de chegar ao Python — isso rodou `git reset --hard`de verdade (revertendo uma edição incompleta deste próprio arquivo, refeita aqui) e tentou executar trechos de`checkpoint.md` como comandos, criando 5 arquivos-lixo na raiz do repo a partir de caracteres de blockquote (`>`) sendo lidos como redirecionamento de shell — removidos na mesma sessão. Lição: nunca crases dentro de string bash entre aspas duplas; usar heredoc de aspas simples (`<<'EOF'`) ou a ferramenta Edit direta.

---

## 🏁 Sessão 18/08/2026 (2ª) — TCC e Terapia Convencional: features mergeadas e 100% inacessíveis (#387-#395 abertas)

**Gatilho:** o Rômulo relatou que TCC não aparece como opção clicável no menu, nem psicologia convencional — e trouxe feedback de usuário-teste de que o campo de distorção cognitiva confunde pacientes, sendo o que importa saber reestruturar o pensamento e fazer as evidências. As duas observações se confirmaram, e a primeira revelou um defeito maior do que o relatado.

**Achado central — o campo que ativa a feature nunca foi renderizado.** `src/app/(app)/pacientes/novo/logic.ts:149-153` lê `formData.get("clinicalModality")`, mas `novo-paciente-form.tsx` não tem nenhum controle com esse `name`, e não existe rota de UPDATE da coluna em lugar nenhum (`GRANT UPDATE (clinical_modality)` da `0096:3` nunca exercido). O ternário cai sempre em `protocol_driven`. Consequência: **todo paciente em produção é `protocol_driven`**, a aba TCC (`layout.tsx:79`) nunca aparece e `CONVENTIONAL_SYSTEM_PROMPT` é inalcançável. Tudo que os PRs #305 (#98) e #306 (#99) entregaram — `tcc_rpd_entry` + RLS (`0103`), formulário RPD, gráfico de crenças, prompt convencional, roteamento de modo — é **código morto**. `layout.test.tsx:44,51,76` passa porque mocka a modalidade: um teste que mocka o campo que a UI nunca grava prova o gating, não a feature. Ambas as issues foram fechadas pelo diff, com CI verde — mesmo padrão de `merge-sem-conflito-apaga-feature-mergeada`. **Nem a #98 nem a #99 exigiram caminho de escrita do campo na Definição de Pronto** (AGENTS.md §5.2, ponto "dono do dado").

**Erro de modelagem.** `layout.tsx:53-83` trata TCC como sub-caso de "conventional", o que contradiz a decisão desta mesma BACKLOG (linha 3173-3174, 29/07/2026) de que **TCC-sem-protocolo sai do nicho convencional**. TCC é o oposto de convencional naquele sentido — estruturada, manualizada, com instrumento formal e tarefa entre sessões; PHQ-9/GAD-7 **são** `protocolos_ativos[]`. Decisão: `clinical_modality` ganha um 3º valor `cognitive_behavioral` e o roteamento (abas + `modo` do agente + system prompt) vira 3-way, com `switch` exaustivo que **lança** em vez de cair em ABA por omissão.

**Feedback do usuário-teste é clinicamente correto, e o próprio `protocolo-tcc.md` já tinha a evidência sem tirar a conclusão** (§2.1 e §6 achado 2: a enumeração das distorções varia por autor, de 8 a 15 itens, as fronteiras são ambíguas, e não existe fonte canônica única). Estávamos exigindo do paciente uma decisão que os próprios manuais não tomam de forma consistente. Decisão: adotar o **superconjunto Burns + Padesky** — o registro de 7 colunas de Greenberger & Padesky não tem coluna de distorção e tem duas colunas de evidência no lugar. **`distorcao_cognitiva` deixa de ser `NOT NULL`**, vira multivalorada, opcional, colapsada e posicionada **depois** da reestruturação; entram `evidencias_favor` / `evidencias_contra` como núcleo, mais credibilidade (%) do pensamento e da alternativa. "Campo obrigatório" é substituído por dois estados salváveis — _registro capturado_ (situação/pensamento/emoção) e _reestruturação completa_ — sendo a completude **derivada em leitura, nunca coluna gravada**. O gráfico só plota delta de registros completos.

**Armadilha registrada de propósito:** a saída óbvia para `distorcao_cognitiva` ser `text` livre seria promover as 12 opções de `constants.ts` a enum PG ou CHECK. Isso **viola R19** — `taxonomia_distorcoes` é campo do contrato por clínica, pelo mesmo motivo que `taxonomia_ajuda` não é constante do agente. Estabilidade de agregação se resolve gravando **slugs** validados contra a taxonomia da clínica sob RLS, não com enum de banco.

**Duas afirmações de `protocolo-tcc.md` §4 estavam obsoletas e foram corrigidas no doc:** (1) `duty to warn` **não** está em aberto — foi fechado pelo parecer Thiago Lyra (#110), Opção B, e o Iris nunca notifica família/SAMU/polícia/Conselho Tutelar (`regra-alerta-risco.md` §5.3: notificação externa é _descartada_, não adiada); (2) a implementação do motor **já aconteceu** em #122 (migração `0049`, `alerta_risco_clinico`, `src/lib/risco/`, fila `/alertas-risco`, `scripts/escalonamento-risco.mjs`). O bloqueador real de TCC é outro: **nenhuma superfície de TCC consegue alimentar o motor** — `registrarAlertaRisco` tem exatamente 1 chamador (consolidação do diário, `diario/[sessionId]/logic.ts:475-491`), `session_id` é obrigatório no vínculo (CHECK `alerta_risco_vinculo`), não existe caminho determinístico não-LLM para o item 9 do PHQ-9, e o `SYSTEM_PROMPT` padrão **não tem regra de risco nenhuma** (R5-TC existe só no prompt convencional, e os dois modos compartilham o mesmo tool schema).

**Divergência de contrato encontrada de brinde:** `output-schema.json:147-163` lista `sinalizacoes[].tipo` sem `risco_seguranca` — valor que o código **já usa** em `levantarRiscoDeSinalizacoes` (`agent-output-schema.ts:186-211`) para promover a `alerta_risco`. O contrato documentado não descreve o campo que dispara o trilho de risco; quem tomar o doc como fonte reintroduz um falso negativo de segurança. Mesmo formato de `discriminador-cego-no-trilho-headless`.

**Documentos produzidos:**

- [`docs/arquitetura/modalidades-clinicas-e-abordagens.md`](docs/arquitetura/modalidades-clinicas-e-abordagens.md) — três eixos ortogonais (modelo de registro / protocolos ativos / família de abordagem), enum de 3 valores com a restrição de `ALTER TYPE ... ADD VALUE`, os três caminhos de escrita, e o mapa das 6 lacunas do trilho de risco.
- [`docs/agente/rpd-desenho-de-formulario.md`](docs/agente/rpd-desenho-de-formulario.md) — ordem das 11 colunas, copy do campo opcional, regra de completude, mudanças de schema, taxonomia por clínica, a11y.
- `docs/agente/protocolo-tcc.md` — dois blocos de atualização inseridos (§2.1 formulário decidido, §4 duty-to-warn fechado e motor implementado).

**Issues abertas (9):** [#387](https://github.com/romulosutil/Iris/issues/387) seletor de modalidade (P0, `bug`) · [#388](https://github.com/romulosutil/Iris/issues/388) 3º valor do enum + roteamento 3-way + aba Temas (P0) · [#389](https://github.com/romulosutil/Iris/issues/389) RPD Padesky · [#390](https://github.com/romulosutil/Iris/issues/390) output-schema + Zod + `risco_seguranca` · [#391](https://github.com/romulosutil/Iris/issues/391) alerta de risco a partir de RPD e instrumento (segurança) · [#392](https://github.com/romulosutil/Iris/issues/392) ponte agente→RPD · [#393](https://github.com/romulosutil/Iris/issues/393) PHQ-9/GAD-7 com gate de fonte primária · [#394](https://github.com/romulosutil/Iris/issues/394) tarefa de casa · [#395](https://github.com/romulosutil/Iris/issues/395) suíte derivada dos casos de teste.

**Ordem recomendada:** #388 → #387 (enum antes do seletor, senão o seletor nasce oferecendo a modelagem errada) → #390 (schema antes de prompt) → #389 → #391 → #392 → #395 → #393 → #394.

**Pendências de decisão do Rômulo antes de aplicar a label `jules`:** (a) `origem_resposta_racional` — `protocolo-tcc.md` R5 marca como proposta não fechada; (b) onde a fila de RPD sugerido vive (aba do paciente vs. fila de validação geral); (c) como o escore de PHQ-9 aparece na UI (gráfico de tendência vs. só texto) — `protocolo-tcc.md` §7.3 registra explicitamente como não decidido; (d) se a tarefa de casa aberta aparece como lembrete no diário da sessão seguinte.

**Aberto e não coberto pelas 9 issues:** lembrete de reaplicação de escala intervalar (`protocolo-tcc.md` §6 achado 4 — bloqueante para o caso de uso da coordenação); escolha do _hot thought_ quando há vários pensamentos automáticos no mesmo episódio (hoje `pensamento_automatico` é escalar); portabilidade de histórico na troca de terapeuta; conceituação cognitiva, agenda de sessão e escala de crença %; adoção formal da C-SSRS (marcada como PRECISA CONFIRMAÇÃO COM FONTE PRIMÁRIA); eixo idade da §5.2 de `regra-alerta-risco.md` não consumido em lugar nenhum do trilho de risco. **#331** (contrato de entrada do modo convencional diverge da spec) segue aberta. **#119** (`visibility_level` por disciplina, resolvendo a colisão com `alerta_risco_scope` e `trecho_fonte`) foi **concluída e verificada nesta sessão (24/08/2026)**.

---

## 🏁 Sessão 18/08/2026 (5ª) — #393 fechada: escalas PHQ-9/GAD-7 - schema, escore relatado e gate de fonte primária (PR #404, stack sobe pra #403)

Executada issue [#393](https://github.com/romulosutil/Iris/issues/393): estrutura, schema e gatilho de risco para PHQ-9 e GAD-7 — **nenhum texto de item licenciado (Pfizer) commitado no repositório**, gate verificado por grep manual no diff.

- Tabela `instrumento_aplicacao` (RLS copiada literal de `tcc_rpd_entry`/`0103`, `app_role` com INSERT direto sob RLS, sem definer) + `instrumento_item_texto` vazia por padrão (SELECT-only, sem seed) na migração `0113`.
- Servidor recalcula `escore_total`/`item_9_valor` de `respostas_por_item` — nunca confia em total pré-calculado do cliente.
- `item_risco_positivo` mantém `null` distinto de `false` em todo o caminho de escrita (testado a nível de banco de dados, `IS NULL` vs `IS NOT DISTINCT FROM false`).
- `TCC_SYSTEM_PROMPT` ganhou **R14-TC**: agente nunca soma o escore, só registra o número quando literal no texto da nota clínica — cobrindo o gap de `aplicacao_escala_relatada`.
- Severidade do item 9 mapeada por valor em `registrar.ts` (`0` não dispara, `1`→`ideacao_passiva`, `2`/`3`→`ideacao_ativa_sem_plano` — **nunca** `ideacao_ativa_com_plano` só pelo número, já que o PHQ-9 mede frequência, não presença de plano).

**Achados reais corrigidos durante a implementação:**

1. **Caminho manual não tinha âncora para o alerta de risco** — o CHECK de `alerta_risco_clinico` (#391) exigia `origem_extraction_id`, que só existe no caminho via agente. Migração `0114` adicionou `instrumento_aplicacao_id` como âncora alternativa; `registrarAlertaRiscoInstrumentoManual` espelha o caminho via agente sem forjar proveniência.
2. **Formulário de aplicação na UI** — montado `InstrumentoForm` (PHQ-9 e GAD-7) com a query de itens de texto `obterInstrumentoItensTexto` integrada em `src/app/(app)/pacientes/[id]/tcc/escalas/page.tsx`.
3. **Verificação T7:** registro de policies RLS (`db/tests/clinic-id-helper-rls.int.test.ts`) atualizado com as 4 policies novas (`POLICIES_COM_HELPER`, 52→56). Duas fixtures de teste em `registrar.int.test.ts` que citavam rótulos oficiais de frequência do PHQ-9 foram substituídas por texto sintético para honrar o gate de fonte primária.

**Débitos registrados:**

- **D50 (RQ6/#393):** escore literal vs. ausência provado a nível de instrução de prompt, sem teste de pipeline/LLM real.
- **D51 (RQ9/#393):** imutabilidade de alerta em edição de instrumento untestável por ausência de função de UPDATE em `instrumento_aplicacao`.

Verde medido: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` (213 arquivos/1507 testes, 111/1024 RLS). PR [#404](https://github.com/romulosutil/Iris/pull/404) aberto, `base-must-be-main` verificado na branch rebaseada sobre a main, checks de CI passando, marcado como ready for review. Próximo: #394.

---

## 🏁 Sessão 18/08/2026 (4ª) — #395 fechada: suíte automatizada dos 10 casos TCC/convencional, contra Gemini (PR #403, stack sobe pra #402)

Executada issue [#395](https://github.com/romulosutil/Iris/issues/395): primeira suíte que testa **comportamento do agente**, não CRUD/RLS — converte `docs/agente/casos-de-teste-tcc.md` (T1-T5) e `casos-de-teste-terapia-convencional.md` (TC-1..TC-5) em 13 testes reais, chamando `buildUserMessage`/`TCC_SYSTEM_PROMPT`/`CONVENTIONAL_SYSTEM_PROMPT`/`agentOutputSchema.parse` de produção (não reimplementação). Isolada de `pnpm test`/CI: `*.llm.test.ts` + `vitest.llm.config.ts` + `pnpm test:llm`.

**Decisão do Rômulo, explícita após dois avisos do risco:** rodar contra **Gemini**, não Anthropic (produção é 100% Anthropic, `resolveProvider` intocado) — custo menor, escolha consciente de que a suíte prova "prompt seguido por LLM razoável", não "prompt seguido pelo modelo de produção". `@google/genai` como devDependency, `createGeminiInvoker` novo (`gemini-test-invoker.ts`), modelo padrão `gemini-2.0-flash`.

**Baseline real: 11/13 verde.** 2 vermelhos são achado real, deixados vermelhos de propósito: T4 (agente inventa `tarefa_casa` mesmo sem instrução no `TCC_SYSTEM_PROMPT` — schema permite, prompt não cobre) e o probe R4-TCC/R11-TC (confiança `"alta"` indevida em duas distorções ambíguas, deveria ser `media` com as duas ou `baixa` com nenhuma).

**D49 aberta:** prova de mutação (R1/R3/R4-TCC/R11 — comentar a regra em `prompt.ts`, provar que o teste correspondente falha, reverter) **bloqueada por quota gratuita do Gemini** (20 req/dia, esgotada no próprio baseline). Alvos já mapeados: R1/R9-TC ~linhas 100-103, R3/R4-TC ~68-70, R4-TCC/R11-TC ~106-109, R11/R12-TC ~110-113 de `prompt.ts` (conferir linha atual antes de mutar — pode ter mudado). Executar quando houver quota nova ou key paga.

**Achado de higiene operacional:** ao checar `Get-Clipboard`, os primeiros 20 caracteres da `GOOGLE_API_KEY` (de 53) foram impressos no transcript por engano antes de eu perceber e mudar de abordagem — key completa nunca apareceu, gravada direto em `.env.local` (gitignored) depois disso, nunca commitada (conferido). Exposição parcial, não total; registrado para o Rômulo avaliar se quer rotacionar.

`pnpm typecheck && pnpm lint && pnpm test` verdes (suíte LLM fora do padrão). PR [#403](https://github.com/romulosutil/Iris/pull/403) aberto stacked em `feat/392-ponte-agente-rpd-sugerido`. Próximo: #393.

---

## 🏁 Sessão 18/08/2026 (3ª) — #392 fechada: ponte agente→RPD sugerido com fila de validação na aba TCC (PR #402, stack sobe pra #401)

Executada issue [#392](https://github.com/romulosutil/Iris/issues/392): o valor central do produto para TCC (terapeuta escreve narrativo, agente estrutura) não existia — `tcc_rpd_entry` só era escrita por formulário digitado. Decisão de UX pendente do Rômulo fechada nesta sessão via `AskUserQuestion`: a fila de RPD sugerido vive **dentro da aba TCC do paciente**, não na fila geral `/validacao` (essa é `evidence`/`evidence_current`, domínio de meta/protocolo, não de pensamento automático — reaproveitar forçaria encaixe artificial).

**Pipeline completo via `/tlc-spec-driven`** (specify → design → tasks → execute), primeira vez nesta sessão que o escopo justificou as 4 fases — `.specs/features/392-ponte-agente-rpd-sugerido/{spec,design,tasks}.md`. Gap real achado na fase de spec: `registroPensamentoSchema` do agente (#390) não cobre `situacao`/`emocao`/`intensidade`, campos `NOT NULL` em `tcc_rpd_entry` — resolvido por design: aprovação não é toggle, é abrir `rpd-form.tsx` pré-preenchido com o que o agente extraiu, terapeuta completa o resto. 6 tasks executadas por subagentes (T1 prompt sequencial → T2 migração `0112`+`registrar.ts` ∥ T3 fase de risco no diário → T4 queries/actions ∥ T5 UI → T6 checklist de invariantes + gate completo), com 2 colisões de interface entre agentes concorrentes auto-corrigidas nos próprios relatórios (assinatura de `registrarAlertaRiscoRPDSugerido`, shape de `RPDSugestao`).

**Achado real de T1:** `TCC_SYSTEM_PROMPT` não instruía emissão de `registro_pensamento` — a seção "Formato de saída" dizia o oposto (stale desde #390). Corrigido, R9-TC a R13-TC citando explicitamente qual regra cada uma reforça.

**Invariante herdada de #391, generalizada:** alerta de risco dispara na _criação_ da sugestão (ancorado em `origem_extraction_id`), não espera aprovação; aprovar não recria/migra o alerta — trilha imutável, mesmo princípio.

**Erro operacional corrigido nesta sessão:** o commit de #392 foi empurrado por engano para dentro da branch `feat/391-...` (já com PR #401 ready-for-review), poluindo o diff. Corrigido com `force-push --force-with-lease` (confirmado com o Rômulo via `AskUserQuestion` antes de agir, branch sem revisão externa ainda) devolvendo #401 ao diff limpo e movendo o commit de #392 para branch própria stacked em cima.

`pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` verdes (209 arquivos/1466 testes, 109/1007 RLS). PR [#402](https://github.com/romulosutil/Iris/pull/402) aberto stacked em `feat/391-alerta-risco-rpd-instrumento`, ready for review. Próximo: #395.

---

## 🏁 Sessão 18/08/2026 (2ª) — #391 fechada: alerta de risco a partir de RPD e instrumento formal (PR #401, stack #388→#387→#390→#389 continua)

Executada issue [#391](https://github.com/romulosutil/Iris/issues/391): motor de alerta (#122) só disparava na consolidação do diário — RPD e instrumento formal não criavam alerta por construção. Migração `0111`: coluna `origem` (`diario_sessao`|`registro_pensamento`|`instrumento_formal`) em `alerta_risco_clinico`, CHECK `alerta_risco_vinculo` relaxado por origem sem afrouxar a FK composta `(patient_id, clinic_id)` anti-IDOR. Caminho determinístico não-LLM para item de risco de instrumento formal (valor ≥1 dispara, `null`/recusado dispara, `0` não dispara — decisão em código puro sobre payload já persistido). Gatilho no RPD transversal a modalidade/protocolo. `SYSTEM_PROMPT` padrão ganhou a regra de risco (R20) — antes só `CONVENTIONAL_SYSTEM_PROMPT` tinha.

**Verificação em duas rodadas via subagente fork:** 1ª passada mediu o diff contra os 9 itens da Definição de Pronto — 7 PASS, 2 gaps (imutabilidade do alerta em edição de RPD sem teste; RLS sem cobertura das origens novas). 2ª rodada (2 builders paralelos): RLS ganhou 2 testes cross-tenant novos (`registro_pensamento`, `instrumento_formal`) em `alerta-risco-rls.int.test.ts`, 13/13 verde. O de imutabilidade **achou que a feature não existe** — `logic.ts` do RPD só expõe `salvarRPD` (insert) e `obterRPDEntries` (select), sem update — invariante vale hoje por ausência, não por design testado; registrado como débito de teste pendente para quando/se edição de RPD for implementada.

**Bug real achado durante a verificação (corrigido neste PR, fora do escopo original):** `actions.int.test.ts` limpava `extraction` antes de `alerta_risco_clinico` no describe de instrumento formal — a FK nova `origem_extraction_id` violava na cleanup. Ordem invertida.

`pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` verdes (108/108 arquivos, 1000/1000 testes RLS). PR [#401](https://github.com/romulosutil/Iris/pull/401) aberto stacked em `feat/389-rpd-formato-padesky` (mesmo padrão dos PRs #398–#400), `base-must-be-main` falha por design (esperado em PR empilhado), demais checks verdes, marcado ready for review. Próximo da corrente do goal: #392 → #395 → #393 → #394.

---

## 🏁 Sessão 18/08/2026 — #341/#332 fechadas via pnpm patch, #327 fechada, fila sandbox Asaas pausada por erro (achado, sem issue)

**Código:** PR [#386](https://github.com/romulosutil/Iris/pull/386) mergeada (09:51Z) fechando **#341** (Storybook/Vitest coletava 59 arquivos e rodava 0 testes em instalação limpa no Windows) e **#332** (suíte a11y flaky sob concorrência). Causa raiz do #341: o fix de 17/08 nunca existia no repo — o verde local vinha de 4 arquivos de `node_modules/.pnpm/module-alias@2.3.4` editados à mão, fora de controle de versão. Com o pacote pristino, 59/59 stories falhavam. Três bugs reais no `module-alias@2.3.4`: rejeição de path com `\` no Windows, `ERR_UNSUPPORTED_DIR_IMPORT` no Linux por alias de diretório sem completar `index.js`, e erro de protocolo para path absoluto no Windows. Corrigido via `patches/module-alias@2.3.4.patch` (pnpm patch, versionado) — não mais monkeypatch em runtime de `Module._resolveFilename`. CI validado: 15/15 checks, 202 arquivos / 1412 testes, 0 pulados. `infra/Dockerfile` ganhou `COPY patches ./patches` (build de produção quebraria sem isso, já que `patchedDependencies` exige o diretório presente). PR [#384](https://github.com/romulosutil/Iris/pull/384) mergeada (03:19Z) fechando **#327** (throttle de redefinir-senha sem oráculo de chave/limites).

**Achado sem issue, fora do código do repo:** e-mail do Asaas às 18/08 avisa fila de webhook `Iris - sandbox (tunel local)` **pausada há 7 dias por erro de sincronização** — eventos retidos são apagados em 14 dias, fila desativada em 30 se não corrigida. Contradiz `BACKLOG.md` (linha da sessão de 03/08, "Sandbox: webhook desativado, 0 eventos penalizados") — **não está desativada**, está pausada acumulando falha; ou nunca foi desativada, ou foi religada nas medições da #321 (15/08). Túnel `cloudflared` → `localhost:3010` do sandbox está morto desde 04/08, então a fila não tem para onde entregar. **Zero impacto em produção** (webhook de produção é separado, confirmado 11/08) — puramente ambiente de teste. Sem issue dedicada; mais próximas são #375 (runbook de webhooks/conciliação) e #294 (alarme automático de falha de job — o padrão "só descobrimos por e-mail do fornecedor" é exatamente o que #294 existe para fechar). Ação pendente do Rômulo: desativar/excluir a fila no painel Asaas (nada de valor nela — só lixo de teste do sandbox, já listado na sessão de 03/08).

---

## 🏁 Sessão 17/08/2026 — #322: a flag que não recuperava um centavo (passo 9 — a linha de billing fecha aqui)

Executado o **passo 9**, o último: issue [#322](https://github.com/romulosutil/Iris/issues/322) — a retentativa extradia do Pix Automático era uma **flag inerte**. `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS` (entregue na #317) apenas **permite**; cada tentativa é comandada pelo recebedor, e até esta sessão o Iris não comandava nenhuma. Um único dia sem saldo matava o ciclo. Orquestração em subagentes (2 de pesquisa → 4 builders → revisão adversarial + campanha de mutação em paralelo → reparo → oráculos). Branch `feat/322-orquestracao-retentativa`, 6 commits, migração `0106`.

| Commit    | O quê                                                                 |
| :-------- | :-------------------------------------------------------------------- |
| `a869a0f` | `feat(billing): add extradia retry columns to billing_cycle`          |
| `a827b59` | `feat(billing): add retry command port and read retry webhook fields` |
| `aaa396f` | `feat(billing): command extradia retries from the closing sweep`      |
| `de017f6` | `feat(billing): report the retry stage in the closing job`            |
| `0e22f2b` | `fix(billing): repair three grave defects in the retry sweep`         |
| `e0f5772` | `test(billing): add the oracles the mutation campaign proved missing` |

### O corpo da issue mentia em quatro pontos

A carência **não** é 7 dias (é 10, desde a `0098`) e as duas janelas **não somam** — `pastDueDesde` recebe `?? agora` na primeira recusa, então a retentativa corre **dentro** da carência. A "pendência" que a #322 mandava decidir já tinha sido fechada na #319. A elegibilidade "só `PAYMENT_OVERDUE`" é mais restritiva que a tabela da #318. E a dependência da #317 já estava satisfeita. O FAQ do Asaas nega a existência da retentativa extradia — é anterior à Jornada 3 e não é fonte. Terceira sessão seguida em que **planejar pelo corpo da issue sozinho produziria retrabalho**.

### As três decisões que mudam o que o sistema faz

- **O gatilho é varredura no job, não reação ao webhook.** A validação das 23h59 do dia anterior faz do horário de execução parte da regra, e uma varredura que só comanda `dueDate ≥ amanhã` a satisfaz por construção. Somado a isso: o envelope de `paymentInstruction` **nunca foi medido**, e entrega de webhook não é garantida — varredura reavalia o predicado e se auto-cura. Custo assumido: até ~1 dia de latência, que é zero na prática porque o dia da recusa já é coberto pela retentativa **intradia** do PSP, que não consome nenhuma das 3.
- **Elegibilidade automática por campo novo, `retentavelAutomaticamente`, `true` só em G2.** `valeGastarRetentativa` responde "vale a pena algum dia" e vem com "**depois** que a clínica agir" em G1/G4/G6. Varredura não age nem conserta. Reusar aquele campo seria confundir flag habilitadora com mecanismo, e queimaria tentativas que o caso de saldo precisa.
- **A reserva do contador vem ANTES da chamada** (compare-and-set), o contrário da regra da #319. A inversão vale só aqui: lá o efeito era interno e reversível, aqui é externo e irreversível, e a doc do Asaas nomeia a chamada concorrente como modo de falha primário. Perder uma reserva custa 1 das 3 tentativas e **não** trava o ciclo.

### A revisão adversarial derrubou a 1ª versão em 3 GRAVES

1. **A fila nunca drenava.** Grupo, orçamento e janela de 7 dias eram avaliados **depois** do `LIMIT 20`. Ciclo permanentemente inelegível não muda de estado, então 20 deles ocupavam a passada inteira todo dia, para sempre, e a recusa de saldo de hoje nunca chegava a ser avaliada. Os três predicados foram para o `WHERE`, e o pré-filtro grosso da janela foi **medido contra o Postgres** para provar que é conservador.
2. **Cobrança já paga era retentada.** A guarda perguntava se havia instrução pendente, nunca se a cobrança liquidou — com o webhook perdido, a passada seguinte comandava um **segundo débito da mesma mensalidade**. E "já liquidada" não está entre as 5 validações documentadas do Asaas: nada garante que ele recusaria. Agora a varredura consulta antes de reservar e **concilia** em vez de retentar.
3. **O guard de `RETRY_AFTER_DUE_DATE` engolia recusa de causa diferente**, inclusive G3 (`corteImediato`): a autorização morria, `recusa_codigo` seguia dizendo "sem saldo" e o backstop ficava cego. **Dois testes de integração consagravam o defeito** e foram invertidos.

Mais dois MÉDIOS: a data comandada podia cair **no dia do corte** por carência (a clínica pagaria e ficaria `canceled`) — virou o teto C; e o predicado de carência dizia no comentário ser cópia fiel, mas tinha perdido o `status = 'past_due'`.

### A mutação: 19 mutantes, 13 mortos, 6 sobreviventes — e o nº 1 era a decisão principal

O mutante que trocou `retentavelAutomaticamente` por `valeGastarRetentativa` **não matou nenhum teste**: o único caso de grupo não-retentável usava G5, em que os dois campos são `false`. A decisão mais importante do desenho não tinha oráculo. Os grupos que divergem (G1, G6) entraram como caso. Os outros cinco cobriam assinatura `canceled`, ciclo que não está `falhou`, o método público `instrucaoParaRetentativa` (sem teste nenhum), o teto de 20 por passada com a sonda `+1`, e a borda **exata** da carência — o caso existente usava um dia além, onde `<` e `<=` empatam. Cada oráculo novo foi validado aplicando o mutante e contando os mortos.

### Verde medido

`pnpm test` **201 arquivos / 1396 testes** · integração **242 suites / 971 testes** · `pnpm test:rls` **107 arquivos / 971 testes, 0 pulados** · `typecheck` limpo · `lint` 0 erros / 10 warnings pré-existentes. Migração `0106` aplicada e medida em `information_schema` (colunas, tipos, grants) — e a medição **corrigiu o plano**: em `billing_cycle` quem escreve é `iris_auth`, não `app_role`.

### O que continua não medido

Nada do trilho headless foi exercitado contra gateway real — o sandbox não ativa Pix Automático. Viraram **D44** (alinhamento do "próximo ciclo", cujo pior caso queima o orçamento inteiro), **D45** (contador de 3 por instrução × por cobrança) e **D46** (`purpose`/`retryAttempt` nunca observados, dos quais o guard depende). Nenhum vira suposição: os três estão escritos no docblock e entram no ensaio com clínica de teste em produção.

---

## 🏁 Sessão 16/08/2026 (3ª) — #289: o alarme que calava no caminho do dinheiro (passo 7 da linha de billing)

Executado o **passo 7**: issue [#289](https://github.com/romulosutil/Iris/issues/289) — `erro_aplicacao` gravava a mesma frase para dois desfechos opostos. Orquestração em subagentes (spec → builder → duas revisões adversariais em paralelo + campanha de mutação → reparo). Branch `fix/289-erro-aplicacao-discriminador`, nascida de `main`, **7 commits**, sem push e sem PR. **Nenhuma migração** — a entrega inteira cabe em código e teste.

| Commit    | O quê                                                                  |
| :-------- | :--------------------------------------------------------------------- |
| `52b188d` | `feat(billing): add shared erro_aplicacao vocabulary and classifier`   |
| `6e70935` | `fix(billing): classify erro_aplicacao and stop the sweep erasing it`  |
| `d63c2fe` | `docs(billing): move aplicado_em/erro_aplicacao note out of schema.ts` |
| `ab05a04` | `fix(billing): classify headless debit events as real alarms`          |
| `8b1e9c5` | `fix(billing): make the DoD query read live cycle state`               |
| `b16da8c` | `test(billing): add the missing oracles for sweep and emitted prefix`  |
| `2d63e1c` | `docs(billing): scope the external-reference heading to its own track` |

### O defeito não era um texto feio — era um sinal que nasce poluído

`erro_aplicacao` recebia `"cobrança sem ciclo correspondente"` para **todo** evento em que `conciliarPagamentoDeCiclo` devolvia `false`. Esse `false` cobre desfechos **opostos**: a cobrança de **ativação** do Pix Automático (nunca tem ciclo, nunca terá, acontece em toda ativação para sempre — correto) e a **mensalidade paga sem ciclo conciliado** (dinheiro recebido e não creditado). Com N clientes, o ruído cresce linearmente e o sinal não. O primeiro ciclo real vence em **12/09/2026**: a partir dali essa coluna é o que denuncia dinheiro perdido.

O vocabulário fechado ficou em `src/lib/billing/erro-aplicacao.ts`, num lugar só, consumido pelos **dois** caminhos que escrevem a coluna. O motivo de ser compartilhado é medido: a rota gravava `"evento sem id utilizável"` e a varredura `"sem id utilizável"` — duas cópias do mesmo desfecho que **já tinham divergido**.

### A revisão adversarial derrubou o discriminador no caminho principal

A decisão original era discriminar por `payment.externalReference` — fato sobre o que **nós** emitimos, não identificador do gateway, medido dos dois lados (`cycle:<id>`, `debito:<âncora>`, e a ativação que nasce do `immediateQrCode`, o qual **não aceita** o campo). Está certo — **para o trilho que tem objeto `payment`**.

O débito mensal do Pix Automático é **headless**: o Asaas cria a instrução, debita e notifica. Esses eventos chegam com `paymentInstruction` e **sem** objeto `payment`, então `externalReference` é `undefined` neles. Classificar só pela referência mandava o débito mensal — **o modo de falha que a issue existe para denunciar** — para o balde da ativação. O alarme calaria exatamente no caminho principal do dinheiro.

Regra nova, **fail-closed: a instrução decide antes da referência**, inclusive vencendo referência de terceiro. A presença de `providerInstructionId` é prova **por construção** de que a cobrança é nossa — instrução só existe dentro de uma autorização de Pix Automático, e a única que este sistema cria é a da mensalidade. O docblock nomeia os **três fatos que tornariam a prova falsa** e registra que nos três o erro cai para o lado do **alarme**, nunca do silêncio.

### A consulta da Definição de Pronto lia um carimbo histórico

A 1ª versão de `listarCobrancasDeCicloNaoConciliadas` filtrava `erro_aplicacao = <constante>`, por igualdade. Ler o texto é ler verdade **do instante em que foi gravada**, jamais reavaliada — e cada um dos dois defeitos daí já invalidava a consulta como oráculo:

1. **Corrida ⇒ alarme falso permanente.** Se `PAYMENT_CREATED` vence a escrita de `billing_cycle.provider_charge_id`, o texto de alarme fica gravado para sempre, mesmo depois de o ciclo aparecer e o pagamento conciliar. A própria #289 documenta a corrida gêmea medida em produção: pagamento **1,3 s antes** de existir o primeiro ciclo.
2. **Cegueira ⇒ alarme que não aparece.** Falha por exceção grava a **mensagem da exceção**, não o motivo classificado — e nunca casava com a igualdade. A consulta jurava que estava tudo bem.

O predicado novo é **o mesmo teste do webhook, avaliado agora**: cobrança nossa (id de instrução **ou** prefixo nosso, lidos do `payload` bruto, que nunca é reescrito) **e** `NOT EXISTS` ciclo com aquele `provider_charge_id`. É isso que faz a linha da corrida **sumir sozinha** quando o ciclo aparece, sem reprocessamento. O `LIKE` que sobrou é de **prefixo sobre a referência**, nunca substring sobre o motivo: `LIKE '%ciclo%'` traria a ativação de volta.

### A mutação achou 3 buracos que a suíte verde escondia

**12 mutantes: 9 mortos, 3 sobreviventes** — e os 3 sobreviventes viraram exatamente os 3 reparos de teste:

- **Mutante I** — o caminho de **sucesso** da varredura não exigia `erro_aplicacao = null`; tornar a escrita incondicional não quebrava nada.
- **Mutante L** — o ramo de **vínculo/desconhecido** da varredura não tinha oráculo. Assimetria medida: a rota tinha 3 testes cobrindo o equivalente, a varredura zero.
- **Mutante M** — o **formato do prefixo emitido** não tinha oráculo: `cycle:` → `cycle-` nos dois sites de emissão não deixava nada vermelho. A asserção nova é **literal**, não a constante importada — importar a constante é o teste tautológico de sempre.

Cada reparo foi validado **aplicando o mutante e contando os mortos**: R1 → 3, R2 → 2, R3 → 1, R4 → 1, R5 → 2.

### Verde medido

`pnpm typecheck` limpo · `pnpm lint` **0 erros / 10 warnings** pré-existentes · `pnpm test` **199 arquivos / 1339 testes** · integração dos 4 arquivos tocados com `--config vitest.integration.config.ts`: **13 suites / 74 testes, 0 falhas**. `pnpm test:rls` **não foi rodado** — nada tocou banco, policy nem migração.

### O que fica aberto

- **D43** (acima): a ativação nunca foi medida no trilho real, e o aviso indevido para cobrança de terceiro segue vivo.
- **Divergência com o comentário 1 da issue**, que declarava `externalReference` descartado e apontava `conciliationIdentifier`/`endToEndIdentifier`. Nenhum dos dois foi usado, e nenhum é necessário para o alarme. Decisão do Rômulo (§3b do `checkpoint.md`) — é o mesmo padrão já registrado em [[comentario-de-issue-envelhece-e-desfaz-decisao]].
- **A consulta nova não tem leitor** — nenhuma tela, job ou alerta a chama. Deliberado (a UI é o **D36**), mas hoje o alarme corrigido só aparece para quem chamar a função à mão.
- **A DoD da issue é prosa, sem SQL.** Quem quiser conferir fora do repo não tem o que rodar, e a versão em prosa não diz que a consulta precisa reler o estado vivo — foi por isso que a 1ª versão filtrou o texto histórico.
- **A issue #289 continua `open` e sem label `jules`**: foi executada aqui, não delegada. Fecha por `Closes #289`, em inglês, quando a PR sair.
- **1 caso flaky sob carga** (`disponibilidade-editor`, a11y): falhou em **1 de 2** execuções da suíte cheia (a 2ª deu 199/1339 verde) e passa **10/10** em isolamento; a regra é `color-contrast` do `axe-core`. Fora do diff. Não pinado nem silenciado.
- **Nota de processo:** `git diff` sob o hook do RTK devolve resumo, não patch aplicável — `git apply -R` falha com `No valid patches in input`. Para reverter mutante, gerar com `rtk proxy git diff`; nunca `git checkout -- .`.

---

## 🏁 Sessão 16/08/2026 (2ª) — #311: o piso que já estava certo (passo 6 da linha de billing)

Executado o **passo 6**: issue [#311](https://github.com/romulosutil/Iris/issues/311) — `PISO_COBRANCA_AVULSA_CENTAVOS = 500` era, pelo próprio docblock, "escolha conservadora, **NÃO** medição". Orquestração em **4 subagentes** (recon → builder → revisão adversarial com mutação → reparo); 1 commit na `feat/311-piso-cobranca-medido`, PR [#340](https://github.com/romulosutil/Iris/pull/340) — **encadeada** sobre a PR [#339](https://github.com/romulosutil/Iris/pull/339) (#310), que subiu na mesma sessão. Mergear na ordem: a base da #340 só vira `main` quando a #339 fechar, e a keyword `Closes #311` só dispara nesse momento. Nenhuma migração e **nenhuma mudança de comportamento**: o diff é verdade documental e oráculo de teste.

### O número já estava certo — o que estava errado era o código não saber disso

A Medição 6 da #321 (15/08, sandbox) sondou `POST /payments` PIX em `0.01`, `0.50`, `1.00` e `3.00` — todos **HTTP 400** com `invalid_object` e mensagem nomeada — e `5.00` → **HTTP 200**. O piso real do gateway é **exatamente R$ 5,00**, e o `500` **coincide** com ele; não é folga por cima. A cláusula do plano ("se o Asaas não tiver mínimo próprio, a entrega vira **remover** a constante") está resolvida **contra** a remoção: o mínimo existe, é do Asaas, e a API o impõe.

Consequência: **dos 3 itens da DoD, 2 já estavam cumpridos antes da sessão** — o registro no `infra/README.md` veio junto com o runbook da #321, e o teste de fronteira seguia verde porque o número não mudou. A substância real ficou **fora** da DoD.

### O que a mutação derrubou: os dois testes de fronteira eram tautológicos

`decidirGate(PISO - 1)` → `adiar` e `decidirGate(PISO)` → `cobrar` **importam a própria constante**. Medido: com `500 → 400` os dois seguem **verdes** — provam `<` vs `<=`, nunca o número. Entrou um caso com literais (`499` → `adiar`, `500` → `cobrar`), que mata a mutação de valor sozinho; a mutação de operador (`<` → `<=`) morre por dois casos. Sem esse literal, "medição" seria uma palavra no comentário sem nada que a defendesse — o padrão de [[teste-verde-que-nao-testa-nada]] ("asserir com a constante que o código usa").

### A fronteira entre medido e deduzido, que a 1ª versão apagou

A mensagem crua do gateway enuncia a regra sobre o **líquido**: `value − discount >= R$ 5,00`. Hoje isso coincide com `value >= 500` **só porque nenhum caminho de emissão do Iris envia `discount`** (verificado: o `POST /payments` do adapter monta cinco campos, e `discount` não aparece em `src/lib/billing/`). Mas a consequência — R$ 5,00 com R$ 1,00 de desconto passaria neste piso e seria recusada lá — é **dedução da mensagem**, não medição: as cinco sondagens rodaram todas com desconto R$ 0,00.

A primeira versão do docblock escreveu isso no indicativo, junto dos fatos medidos. A revisão pegou, e a regra que sai vale além da issue: **trocar "não medido" por afirmação não marcada reintroduz, em escala menor, exatamente o defeito que a issue existe para consertar.**

### A constante NÃO é renomeada — e por quê

O comentário 1 da issue (14/08) pede `VALOR_MINIMO_COBRANCA_CENTAVOS`, "deixando 'piso' reservado ao conceito do Pix Automático". **Recusado**: aquele comentário é **anterior** à **D-E da #317**, que já resolveu a mesma colisão com o par `PISO_COBRANCA_AVULSA_CENTAVOS` (o que **nós** cobramos) × `PISO_TETO_AUTORIZACAO_CENTAVOS` (o teto que o **pagador** autoriza). Executar o comentário ao pé da letra hoje **desfaria uma entrega**. Medido que os dois não colidem: nunca aparecem no mesmo arquivo nem são importados juntos.

O defeito real ali era outro: a desambiguação era **unidirecional**. Depois da #317 os dois passaram a carregar "medido em 15/08/2026 (#321)" com sentidos **opostos**, e só `debito.ts` avisava "não confundir" — quem chegasse por `calculator.ts` não recebia aviso nenhum. Agora as duas pontas se nomeiam.

### O registro cru é imutável, e a 1ª versão o contaminou

Em `infra/README.md` só a **conclusão** da Medição 6 podia mudar (citava o nome morto `PISO_COBRANCA_CENTAVOS` e o intervalo `debito.ts:41-55`, que já não existia). Tabela e respostas cruas preservadas byte a byte, confirmado no diff. Mas a 1ª versão escreveu ali "**A #311 foi fechada por esta medição, em 16/08/2026**" — e as duas metades estavam erradas: a issue está **`open`** (o runbook afirmando consumado um evento que não ocorreu, sendo ele a âncora que o código cita), e a data injetada **colide com a da medição** (15/08), virando a única data dentro daquele bloco. Corrigido.

Fechado junto o **RISCO-1** (`piso não medido`) em `.specs/features/debito-reativacao-290/design.md`, que seguia listado como aberto. `spec.md`, `premortem.md` e os planos em `docs/superpowers/plans/` **não** foram tocados: são registros point-in-time, e citam o nome morto por época. Efeito colateral aceito: uma busca pelo nome **vivo** não os encontra.

### Verde medido

`pnpm test` **197 arquivos / 1317 testes** (era 1316 — o +1 é o oráculo literal) · `pnpm test:rls` **106 arquivos / 934 testes, 0 pulados** (idêntico à baseline da #310 — nada aqui toca banco) · `debito.test.ts` **10/10** · `gate-debito.int.test.ts` **27 coletados / 27** (com `--config vitest.integration.config.ts`; sem ele **coleta zero e sai verde**) · `pnpm typecheck` limpo · `pnpm lint` **0 erros / 10 warnings** pré-existentes.

### O que fica aberto

Nenhum débito novo (segue D1–D41). Quatro achados sem dono, detalhados no `checkpoint.md` §4: `discount ≠ 0` nunca sondado (barato de medir no sandbox, inerte hoje); a degradação 4xx com um único teste, gated por banco, agora promovida a única rede contra o Asaas mudar o piso; a issue e as specs falando do nome morto; e o parâmetro `piso` de `decidirGate` sobrevivendo por uma justificativa nova. **Decisão de tech lead tomada:** manter a `feat/311` empilhada em vez de recortá-la — o `checkpoint.md`/`BACKLOG.md` da #310 só existem naquela branch, e refazer a #311 a partir de `main` produziria dois históricos de doc divergentes, que é o modo de falha do #305/#306. O custo é a ordem de merge, que já estava determinada de qualquer jeito.

---

## 🏁 Sessão 16/08/2026 (1ª) — #310: a cobrança que já existia (passo 5 da linha de billing)

Executado o **passo 5**: issue [#310](https://github.com/romulosutil/Iris/issues/310) — o gate de reativação da #290 emitia cobrança nova **sempre**, inclusive para o ciclo cuja cobrança o Asaas ainda mantém pagável. As duas ficavam vivas e a clínica podia pagar o mesmo ciclo duas vezes. Orquestração em **11 subagentes**; 8 commits na `feat/310-reaproveitar-cobranca-gate`, sem push e sem PR. Plano versionado em `docs/superpowers/plans/2026-08-16-310-reaproveitar-cobranca-do-gate.md`.

### A medição que fixou o desenho

A decisão (a) — reaproveitar — já vinha da issue. O que **não** estava decidido era o caso **comum**: débito total maior que a cobrança antiga, que é o que o corte por carência produz (congela o ciclo `falhou`, que tem cobrança, junto com os `aberto`/`apurado`, que não têm). Medido no MCP de docs do Asaas:

- **Não existe rota para cancelar uma instrução pendente** — "O cancelamento ocorre apenas de forma indireta, por meio do cancelamento da autorização".
- **`DELETE /v3/payments/{id}` existe, mas a doc não lista quais status aceita**, e nada diz que aceita `OVERDUE` de Pix Automático.
- Confirmado o que sustenta a (a): "O Asaas mantém o link ativo com boleto e Pix Copia e Cola após o encerramento da retentativa", `Payment` em `OVERDUE`, autorização **Ativa**.
- Janela crítica, literal: "A partir das 22h de D-1 até o dia do vencimento D."

Consolidar tudo numa cobrança só exigiria cancelar a antiga — desenhar contra endpoint **não medido** para evitar cobrança dupla é como se produz cobrança dupla. Por isso o débito **se divide**: cada ciclo com cobrança viva é reapresentado como forma de pagamento própria, e os demais viram uma consolidada. O modelo já suportava (âncora + `debito_agrupado_em`); o gate é que passou a devolver lista.

**A janela das 22h não é calculada por relógio.** O sinal é existir instrução `AWAITING_REQUEST`/`SCHEDULED` para aquela cobrança — se o banco já está com o débito a caminho, a tela não mostra código e manda aguardar. Dispensa fuso, horário de verão e a suposição de que o relógio do container bate com o do BACEN.

### A revisão adversarial derrubou a 1ª versão: 3 GRAVES, um deles regressão nossa

1. **Reentrada no gate cobrava duas vezes.** Dois ciclos sem cobrança (R$ 13 + R$ 7): a 1ª chamada emitia R$ 20 e agrupava o segundo; na 2ª, o agrupado **parecia virgem** (ciclo agrupado nunca recebe `provider_charge_id`), virava âncora e ganhava um POST próprio de R$ 7. Duas cobranças vivas somando R$ 27 para dívida de R$ 20; pagar a de R$ 20 quitava R$ 13. **Antes da #310 isso era impossível** — a âncora era sempre `ciclos[0]` e a idempotência por `externalReference` matava a 2ª emissão. Foi a divisão do débito que abriu o buraco.
2. **Ciclo liquidado pela cascata era cobrado de novo.** Cobrança da âncora já `RECEIVED` liquida âncora **e** agrupados; o laço iterava um **snapshot** e mandava o agrupado emitir. O plano já mandava "recomputar o débito antes de decidir", e isso não fora implementado.
3. **A listagem de instruções trancava a clínica no caminho mais comum.** A cobrança que o gate emite é Pix **comum**, sem instrução nenhuma: um 404 da listagem virava "tente novamente em alguns instantes", que nunca resolve.

**Regra que vale além desta issue: "não reaproveitável" ≠ "não pagável pelo cliente".** `DUNNING_*` é cobrança terceirizada e segue pagável pelo pagador; a allow-list a classificava como não-reaproveitável e o gate emitia por cima — fail-closed para o reuso, fail-**open** para a cobrança dupla. Hoje **só o 404 libera o id**; todo o resto bloqueia sem emitir (ver **D41**).

### O que a mutação derrubou

Três testes passavam **em vácuo**, e só apareceram porque a mutação foi medida:

- O oráculo "não houve consulta de reuso" casaria também o `GET /payments/{id}/pixQrCode` que **toda** emissão faz — o caso passaria contando o QR da cobrança que ele mesmo emitira.
- Os testes de "não sobrescreve o id" e do negativo da DoD passavam com o gate **bloqueado**: nada acontecendo também deixa o id intacto.
- O primeiro par escrito para o achado 4+5 **sobreviveu ao mutante**, porque sem um ciclo virgem ao lado os dois comportamentos são indistinguíveis.

E o teste antigo de P-6 **codificava o bug do achado 1** — afirmava como correto o agrupamento que gerava a segunda cobrança.

### Duas baselines consertadas (vermelho herdado, não regressão)

- **`pnpm lint` acusava 39 erros**, todos de `.worktrees/issue-312/.next/`: o `.next/**` do flat config é **ancorado na raiz** e não pega `.next` aninhado. Zero em código-fonte. Passou a ignorar `**/.next/**` e `.worktrees/**`.
- **`vencimento.test.ts` estourava o teto de 5s** (roda em ~5,4s). Encolher a varredura de 730 dias é o que **não** se pode fazer — ela é o único teste que pega o bug sazonal.

### Verde medido

`pnpm test` **197 arquivos / 1316 testes** · `pnpm test:rls` **106 arquivos / 934 testes, 0 pulados** · integração `src/lib/billing` **8 / 56** · `gate-debito.int.test.ts` **27/27** · `typecheck` limpo · `lint` **0 erros / 10 warnings**.

### `main` mudou no meio da sessão, e a #312 fechou isolada

A branch nasceu de `main` e, depois disso, **a #312 foi concluída de forma isolada, fora desta linha de trabalho** — PR **#334** (`feat/312-aviso-email-cancelamento`) mergeado em **16/08/2026 às 14:20**, issue **#312 fechada** no mesmo minuto, com o commit `2adad86` reforçando a suíte por teste de mutação após revisão. **O passo 8 da ordem de conclusão já está entregue e não precisa ser replanejado:** o que a ordem previa — escrever a #312 depois da #319, para cobrir os dois gatilhos de corte com copy diferente de uma vez — foi feito. Junto entrou a **#329** (PR #335).

As duas foram mergeadas para a branch da #310 e validadas por **medição** — typecheck, unit e integração — e não pela ausência de conflito: merge limpo não é prova, e foi assim que o #305/#306 reverteu trabalho de `main` sem conflitar.

---

## 🏁 Sessão 15/08/2026 (5ª) — #318 em código, D33 e D35 fechados, e um defeito de produção achado por acidente

Branch `feat/317-parametros-autorizacao-pix`, **13 commits, sem push, sem PR**. Orquestração em **6 subagentes**. Três frentes: fechar a dívida de medição da #319 (**D33**), consertar o pipe do motivo de recusa (**D35**) e implementar a #318 inteira — classificação por código, coluna nova e o backstop de D+7 da Decisão 2. Commits: `30a2b11`, `448b404`, `adc39c4`, `d2424e4`, `633623f`, `8f497ff`, `6a6bc27`, `92aadb2`, `1c83ec1`, `c5480ee`, `89bb61c`, `dbd7cae`, `f0c1773`.

### D33: o que a execução real pegou e o `toSQL()` jamais pegaria

O Postgres local voltou e a `0098` **já estava aplicada** — pela sessão anterior, não por esta. Medido em `information_schema`/`pg_indexes`: `column_default = '10'`, `is_nullable = NO`, `subscription_carencia_idx = btree (status, past_due_desde)`. Os 12 casos de integração rodaram **12/12, 0 pulados**; `pnpm test:rls` deu **102 arquivos / 102 executados / 0 pulados**, 869 testes — o medo registrado em [[suite-rls-rodando-como-superusuario]] não se materializou. As 7 falhas de `equipe/convidar/logic.test.ts` eram só `ECONNREFUSED :5433` e sumiram (7/7).

**O que a execução comprou, e é o argumento inteiro do débito:** duas falhas que a suíte gated nunca mostraria. (1) O template `sql` do Drizzle **não codifica `Date`** — `ERR_INVALID_ARG_TYPE` em runtime; o predicado de carência precisou de `${iso}::timestamptz` (`adc39c4`). **`toSQL()` renderiza o statement sem codificar parâmetro nenhum**, então a "prova" da sessão anterior media exatamente a metade que não estava quebrada. (2) A cadeia `??` sobre `(e as any).detail ?? .hint ?? .originalError` era **placebo**: `DrizzleQueryError` não tem nenhum dos três, caía em `.message`, **que é o SQL que nós mesmos emitimos** — o job do corte reportava a própria query como causa raiz (`d2424e4`). Virou `detalharErro()`, que anda a cadeia `cause` até a raiz (teto de 8 níveis) e **anexa** `code`/`detail`/`hint` em vez de substituir `message`: `detail`/`hint` do Postgres complementam a mensagem, nunca a substituem.

**A ressalva que fica escrita, porque "não medido" é resultado:** o **backfill** continua não exercitado. `subscription` tem **0 linhas** neste banco, então o `UPDATE … WHERE carencia_dias = 7` tocou 0 linhas — provou-se o DDL, não a migração de dado. Em base com linhas, segue por medir.

**Duas armadilhas de processo, registradas onde se registram armadilhas:**

- **`pnpm vitest run <arquivo>.int.test.ts` coleta ZERO testes e sai verde**, porque `vitest.config.ts` tem `exclude: ["**/*.int.test.ts"]` — integração só roda com `--config vitest.integration.config.ts`. Suíte que não coleta nada é indistinguível de suíte que passa; conferir o **número coletado**, não a cor. Entrada nova para o catálogo de [[teste-verde-que-nao-testa-nada]], e a única desta lista que não é sobre asserção: aqui não há asserção nenhuma. Nota de processo, não débito de produto.
- **`created_at` em `drizzle.__drizzle_migrations` é o `when` do journal**, não o instante da aplicação. Não serve para datar nem para ordenar por tempo real — foi tentado nesta sessão e produziu conclusão errada antes de ser falsificado.

### D35: o motivo passou a ser lido do recurso que o tem

Confirmado no MCP de docs do Asaas: `GET /v3/pix/automatic/paymentInstructions/{id}` devolve `refusalReason` com `type: "string"` e **sem `enum`** — o catálogo é aberto **por contrato**, não por precaução nossa —, enquanto `status` tem enum fechado (`AWAITING_REQUEST|SCHEDULED|DONE|CANCELLED|REFUSED`).

Saíram as três leituras vazias de `asaas.ts:898-901`. Entrou `EventoWebhookNormalizado.providerInstructionId` — o normalizador **já enxergava** `paymentInstruction.id` e o descartava —, `consultarCobranca(id, { providerInstructionId })` e um fallback por `GET /pix/automatic/paymentInstructions?paymentId=…&status=REFUSED`. **O filtro `status=REFUSED` é load-bearing:** sob `ALLOW_THREE_IN_SEVEN_DAYS` uma cobrança tem **várias** instruções, e uma `SCHEDULED` não tem motivo para devolver. `reprocessarEventosPendentes` passou a informar `{ providerInstructionId }`, então a varredura de reprocessamento deixou de cair no fallback por índice.

**Degradação declarada, e é escolha, não descuido:** falha ao buscar ⇒ `motivoRecusa: null` + `console.warn("[billing-recusa] …")`. O motivo é **enriquecimento**; quem decide o destino do ciclo é o `status`, que já veio no evento. Deixar o 404 subir trocaria dinheiro conciliado por diagnóstico.

Fixtures inventadas migradas para os códigos reais (`LIMITE_AUTORIZADO_EXCEDIDO` → `MAXIMUM_AMOUNT_EXCEEDED`, `SALDO_INSUFICIENTE` → `PAYMENT_OVERDUE`) em `asaas.test.ts` (2), `route.int.test.ts` (2), `reprocessamento-provedor.int.test.ts` (2) e no plano `2026-08-13-286-teto-pix-automatico.md` (4). E — o que importa mais — **os dublês de cobrança passaram a não ter campo de motivo nenhum**, como a produção: o dublê que devolvia o literal esperado era metade do defeito.

### #318 em código: catálogo separado de política, e o log como oráculo

**`0099_billing_cycle_recusa_codigo`**, idx 99, `when` 1786819013377. Medido: `text`, nullable, sem default; `column_privileges` = `app_role SELECT` · `iris_auth SELECT,INSERT,UPDATE`.

`src/lib/billing/classificacao-recusa.ts` separa **de propósito** o que a tabela da sessão anterior misturava: **`CATALOGO`** é fato do gateway (9 grupos, 25 códigos), **`POLITICAS`** é decisão nossa (`marcaCicloFalhou`, `carimbaPastDue`, `conciliaComoPago`, `valeGastarRetentativa`, `corteImediato`, `diagnostico`, `copy`). O catálogo muda quando o Asaas publica código novo; a política muda quando **nós** mudamos de ideia — misturados, toda revisão de produto viraria edição de fato de gateway. `classificarRecusa(codigo: string | null): PoliticaRecusa`, com **G0 sendo o `?? "G0"` do lookup**, então código desconhecido **e** `null` caem no mesmo lugar sem ramo especial. Comparação **exata** (`trim` + caixa alta), nunca `includes`/`LIKE`: casar por substring seria reintroduzir, um nível abaixo, o texto livre que a issue existe para matar.

**G8 é correção de dinheiro, não classificação.** `liquidarCiclo` foi extraído e é o **mesmo** caminho do pagamento confirmado — ciclo → `pago` + `cobrado_em`, cascata de `debito_agrupado_em`, saída de `past_due` com `past_due_desde` zerado. Antes, `PAYMENT_ALREADY_DONE` virava `falhou` → `past_due` → **dívida congelada contra clínica adimplente**, com o gate da #290 barrando exatamente quem já tinha pago.

**O achado que mudou o desenho dos testes:** no banco, **G6, G7 e G0 são indistinguíveis** — os três não escrevem nada. Um mapa que jogasse G6 em G0 passaria por qualquer suíte que medisse só tabelas. O **log virou o oráculo** desses três, com as asserções de pertinência ao grupo **no fim** de cada caso, para o oráculo comportamental morrer primeiro. 4 mutantes provados, entre eles `POLITICAS.G6.marcaCicloFalhou: false→true`, que exibe literalmente o dano que o G6 evita.

### O backstop de D+7: por que coluna nova, e por que é a última etapa

**`0100`**: `billing_cycle.vencimento_cobranca timestamptz`, nullable **sem backfill**, `when` 1786820981475, índice `billing_cycle_backstop_idx = btree (status, vencimento_cobranca)`. Escrita na **mesma instrução** que `provider_charge_id`/`cobranca_emitida_em`, com o **exato `Date`** passado a `emitirCobrancaDeCiclo`.

**Os marcos que já existiam foram descartados por erro de sinal, não por gosto.** A emissão acontece de 2 a 10 dias úteis **antes** do vencimento (regra da #317), então D+7 contado de `cobranca_emitida_em` ou `apurado_em` cairia **antes** da data em que a clínica tinha de pagar — com folga no cluster de fim de ano, **a mesma sazonalidade do bug que a #317 fechou**, o que faria a #318 reintroduzir a falha que o passo anterior removeu. `cobrado_em` só existe depois de pago. E recalcular `vencimentoCobrancaDeCiclo(cobranca_emitida_em)` foi recusado por outro motivo: mexer no calendário bancário **reescreveria retroativamente** o vencimento de cobranças já emitidas — o mesmo princípio que fez a `0099` guardar o código cru e não o grupo.

**Ordem na rota interna: quarta e última** (reprocessar → fechar ciclos → carência → backstop), e o argumento não é cosmético. O backstop carimba `past_due_desde = agora`; a carência é `past_due_desde + carencia_dias`; o CHECK só exige `>= 0`. Com o backstop **antes** da carência, uma clínica de carência **zero** seria carimbada e cortada **no mesmo tick**, sem um único dia de prazo, por um ato irreversível. É a mesma família de raciocínio da D-1 da #319 (varrer depois de fechar), aplicada um degrau adiante.

**O `falhou` é o elo que faltava:** `congelarCiclosComoDebito` não congela `aguardando_pagamento`, então carimbar `past_due` sem levar o ciclo a `falhou` produziria corte com `levantarDebito = 0` e o gate da #290 aberto — exatamente a perda que a D-4 da #319 fechou no outro ramo. Duas issues, dois ramos, o mesmo buraco.

**Fail-closed do G3:** corta só se `consultarVinculo` responder `cancelada` (mapeamento de `CANCELLED`/`REFUSED`/`EXPIRED`, `asaas.ts:225`). Barram o corte: `autorizada` (o código mentiu ⇒ vira G7), qualquer outro status incluindo o default `pendente`, rede/timeout/5xx, e ausência de `provider`/`provider_subscription_id`. **Toda degradação leva ao mesmo lugar seguro** — carimba (reversível por pagamento) e deixa o corte para a carência, 10 dias depois.

`route.test.ts` foi de **16 para 22** casos: além da ordem, passou a provar **cada etapa chamada exatamente 1×**, o que mata a "correção" que duplica a chamada em vez de movê-la. **Baselines:** unit `src/lib/billing` 138/138 · unit total 1251/1251 · integração 104 arquivos / 896 testes / 0 pulados · `typecheck` limpo · `lint` 0 erros / 10 warnings pré-existentes.

### A deriva de hash: a premissa da sessão anterior estava invertida, e embaixo dela havia um defeito de produção

Das **37 divergências** no Postgres local: **35 são só fim de linha** (a sessão anterior supunha 3), **2 são de conteúdo** (`0072`, `0073`), **0 sem arquivo em disco**. **Causa medida:** `core.autocrlf=true` vindo do `gitconfig` do instalador do Git for Windows contra `* text=auto` — índice 100% LF, worktree misto (117 crlf / 14 lf), e `__drizzle_migrations` congelou o EOL vivo **no momento de cada aplicação**; a divergência corre **nos dois sentidos**. Falsificadas com evidência, não descartadas por plausibilidade: o algoritmo do drizzle-orm 0.45.2 é idêntico ao nosso, Prettier está fora (conteúdo byte-idêntico módulo `\r`) e dump-restore está fora. Medido de passagem: `0055_fix_purga_report_oracle` está no journal e **nunca foi aplicado aqui** — sintoma da #165, remediado pela `0063`, que está aplicada. `0073` é **não-problema**: hash local byte-idêntico ao `hashAplicado` **de produção**, a edição do `b53b294` não rodou em lugar nenhum e a `0082` remediou.

**`0072_super_admin_role` é o defeito real, e é de produção — virou D37.** Detalhe completo na linha do débito e em `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`. O resumo: policy `alerta_risco_auth_select` **ausente** com grant presente ⇒ `iris_auth` lê zero linhas **sem erro de permissão**, e o painel Super Admin reporta `totalAlertas: 0` em silêncio. Produção afetada por **inferência forte** (o `hashAplicado` pinado é o sha256 LF do blob pré-fix), **não medida** — sem acesso a produção nesta sessão.

**A varredura que dá confiança ao resto:** os **170 objetos** declarados pelas 37 migrações divergentes foram conferidos em `information_schema`/`pg_policies`/`pg_proc`/`pg_indexes`/`pg_type` — **1 ausência genuína**, a de cima. Billing limpo. **Nada foi pinado em `DERIVAS_CONHECIDAS`, de propósito:** silenciar 35 rótulos de EOL esconderia o 36º que for real, e foi justamente por o guard estar barulhento que a `0072` apareceu. Lição transferível, e é a inversão do reflexo normal: **ruído de guard que você entendeu ainda é o guard funcionando** — a resposta é diagnosticar a causa (o `autocrlf`), não silenciar o sintoma.

### O que fica com o Rômulo, e o que continua aberto

Quatro decisões, uma frase cada, sem recomendação embutida — detalhe em `checkpoint.md` §3b: (1) `alerta_risco_auth_select` — migração agora × aceitar o zero silencioso até o reset pré-go-live, já que o `.sql` em disco já tem o fix; (2) **D34** — trilha em `audit_log` para o corte + limiar que derrube o `exit code` do job; (3) **D38** — mudar o contrato da rota para não perder o relatório sob falha parcial; (4) **D39** — reabrir a decisão de que G6 não escreve `recusa_codigo`.

**Continuam abertos:** **D34** (agora com um segundo produtor automático de `past_due`) e **D36**, que ficou **mais** urgente e não menos — os 9 grupos deixaram de diferir só em log, o produto passou a saber por que cada ciclo falhou, e continua não contando à clínica.

---

## 🏁 Sessão 15/08/2026 (4ª) — #318: a tabela de desfechos das recusas (passo 4 da linha de billing)

Branch `feat/317-parametros-autorizacao-pix`, **nenhum código alterado**. A entrega do passo 4 é decisão de produto: fechar a tabela código → desfecho e o checklist §5.2 da #318, e só então aplicar a label `jules`. A tabela está fechada e publicada na issue ([comentário](https://github.com/romulosutil/Iris/issues/318#issuecomment-5303443178)), e as três decisões que sobraram foram fechadas pelo tech lead num [segundo comentário](https://github.com/romulosutil/Iris/issues/318#issuecomment-5303503322) a pedido do Rômulo. **A label não foi aplicada, e não será:** a issue roteia por `/tlc-spec-driven` — ver o porquê no fim.

Orquestração em 3 subagentes paralelos: recon da issue e comentários (`gh api`, porque `gh issue view --comments` devolve vazio neste ambiente) × mapeamento do caminho da recusa no código × levantamento do catálogo oficial contra o MCP de docs do Asaas.

**As 3 correções materiais que o recon produziu, todas contra premissas escritas:**

1. **O motivo nunca chega** — virou **D35**. O comentário de 14/08 na própria issue afirmava "o motivo já é capturado e gravado, só é ignorado", e por isso estimava a #318 como barata. Medido como falso: os três campos que `consultarCobranca` lê não existem no recurso `payment`. Lição que se repete: **comentário de issue é a melhor fonte disponível, não é prova** — é o mesmo padrão de [[vermelho-cronico-com-diagnostico-invertido]], onde o registro de falha apontava a query e o errado era o teste.
2. **O catálogo é aberto, não enum fechado.** 25 códigos publicados, mas o OpenAPI declara `refusalReason` como `string` **sem `enum`** e a doc avisa que valores entram sem aviso prévio. Ramo default deixa de ser zelo e vira requisito — se o mapa fosse exaustivo, um código novo cairia em `undefined` e o comportamento seria acidental.
3. **A retentativa extradia é comandada por nós, não automática.** `ALLOW_THREE_IN_SEVEN_DAYS` (#317) só **habilita**; executar é `POST /pix/automatic/paymentInstructions/{id}/retries`, e as validações do endpoint são de contagem, data e política — **nenhuma de motivo**. Isso muda o sentido da pergunta "é retentável?": ela não descreve o que o gateway fará sozinho, e sim **se vale gastar uma das 3 tentativas**. É o orçamento finito que torna a classificação necessária — comandar retentativa para `ACCOUNT_CLOSED` queima a tentativa que o caso de saldo precisaria. (O que é automático e não consome orçamento é a retentativa **intradia** do banco do pagador, obrigatória ao menos uma vez entre 18h e 21h.)

**A tabela: 25 códigos, 9 grupos, agrupados por desfecho e não por origem** — dois códigos ficam juntos se e somente se o sistema deve fazer a mesma coisa com eles. Detalhe integral na issue; aqui só o que não é óbvio:

- **G1 (teto, `MAXIMUM_AMOUNT_EXCEEDED`) carimba `past_due` de propósito.** O instinto é poupar quem "tem saldo e quer pagar", mas sem carimbo a assinatura nunca é cortada e um teto baixo demais vira **assinatura gratuita vitalícia, sem erro em lugar nenhum**. Os 10 dias de carência **são** o prazo para subir o limite. O que muda em relação a G2 não é o relógio — é a copy e o estado de UI: tratar como inadimplente quem só configurou um número errado é o defeito que a issue existe para matar.
- **G3 (autorização morta) corta na hora, mas nunca só pelo código.** Antes de cancelar, reconsultar `GET /pix/automatic/authorizations/{id}` e só cortar se o gateway **disser** `CANCELLED`/`EXPIRED`/`REFUSED`; se responder `ACTIVE`, o código mente e o caso cai em G7. É o mesmo fail-closed que a #319 construiu em `cancelarVinculo`. Sem o guard, um código espúrio revoga autorização — e revogação não volta sem novo consentimento da clínica no app do banco.
- **G6 (defeito nosso, 9 códigos) não move estado nenhum** — e não é só "não carimba `past_due`": o ciclo **não vai para `falhou`**, mantém o status que tinha. Motivo concreto: `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` (retentativa nossa mal emitida) chega **depois** da recusa de saldo que já carimbou `past_due` corretamente. Deixar G6 escrever apagaria o estado certo com um erro nosso. Mesma família do guard assimétrico da #319, que ressuscitava `canceled`.
- **G7/G0 não escalam por contador, escalam por prazo** — ver "As 3 decisões fechadas" abaixo, que substituiu o desenho original.

**A regra que gera a coluna "carimba `past_due`?"**, e que é o que torna a tabela ensinável: carimba no ato quando a recusa é, **por si só, prova de um fato sobre a clínica sobre o qual ela pode agir**; não carimba quando não prova nada sobre ela. G1 (o limite é dela), G2 (a conta dela não tinha saldo), G4 (o documento é dela) e G5 (a conta é dela) provam. G6 prova algo sobre **nós**; G7 prova algo sobre o **banco**; G0 não se sabe.

- **G8 é correção de dinheiro, não classificação.** `PAYMENT_ALREADY_DONE` significa cobrança **liquidada**: hoje viraria `falhou` → `past_due` → dívida contra clínica adimplente. Achado de brinde da classificação.

**Os 5 pontos do §5.2 que estavam abertos, fechados:** a metade cara (reemissão) **não** entra na #318, vira issue própria junto da #322 — mas as decisões ficam escritas agora porque determinam o estado de UI que a #318 já precisa desenhar. **Quem dispara é a clínica, por botão**, nunca varredura: o guia **proíbe** o banco de notificar que o cliente ajustou o teto, então não existe sinal para varredura observar, e varredura cega queimaria as 3 tentativas sem informação — a clínica é o único sensor que existe. **Limites: 3 por ciclo, no máximo 1 por dia, nenhuma depois de D+7**, que não é escolha nossa e sim o teto do `3R_7D` (o gateway devolve 400 em cada borda) — botão **desabilitado com motivo escrito**, em vez de deixar a clínica tocar para receber erro de gateway. **Idempotência:** não comandar se já houver instrução pendente. **Copy sem citar valor**, porque o teto é ilegível por regulação; regra que vale para os 9 grupos: **dizer o que fazer e onde, nunca o código** — a própria doc do Asaas orienta não expor o código bruto ao usuário final.

**Por que a label `jules` não foi aplicada.** Três motivos, todos surgidos durante o trabalho:

1. **A tarefa 0 não é mecânica.** Ler o motivo do recurso certo é mudança de adapter num caminho **não verificável em sandbox** (#321: nenhuma autorização ativa ⇒ nenhuma instrução ⇒ nenhuma recusa). O executor autônomo escreveria contra um dublê que ele mesmo desenha — exatamente o padrão que produziu as fixtures inventadas.
2. **A DoD pede uma consulta, e consulta exige coluna.** "Listar ciclos que falharam por teto" não se resolve com `LIKE` em `billing_cycle.erro` — texto livre cobrindo situações distintas é o defeito que a issue existe para matar. Proposta: **`billing_cycle.recusa_codigo text`**, guardando o literal do gateway e derivando o grupo em código (o grupo evolui; o código recebido é fato imutável). Toca modelo de dados ⇒ pela regra do `CLAUDE.md` a issue roteia por **`/tlc-spec-driven`**, não pela label. Some-se `GRANT` de coluna: `app_role` só tem `SELECT` em `billing_cycle`. **Isso derruba a premissa do artifact de ordem de conclusão** de que nenhum passo desta linha toca modelo de dados.
3. **Duas decisões eram do arquiteto, não do Rômulo:** a divergência deliberada da DoD em **G5** e o limite de **3** de G7/G0. Foram levadas a ele e **devolvidas para decisão do tech lead** — fechadas abaixo.

### As 3 decisões fechadas, e por que duas mudaram ao serem decididas de verdade

**G5 (conta encerrada/bloqueada) ratificada, por outro motivo.** O desfecho não muda — carimba, consome carência, nunca gasta retentativa. A **justificativa** muda, e isso importa: "implemento a intenção da DoD, não a letra" é fraco, porque vira licença para reinterpretar qualquer DoD. Substituída pela regra geral acima — conta encerrada é fato sobre a clínica tanto quanto saldo zerado, então carimba pelo mesmo motivo que G2, não por exceção. **Restrição inegociável que sai junto:** `ACCOUNT_BLOCKED` **não** dispara o corte imediato do G3. Bloqueio é frequentemente temporário (judicial, antifraude, revisão cadastral) e o corte revoga a autorização, que não volta sem novo consentimento no app do banco — cortar na hora por um bloqueio que se resolve em três dias troca problema reversível por irreversível.

**O contador de 3 caiu; entrou um prazo.** Regra nova: **um ciclo que continue não pago em D+7 do vencimento carimba `past_due`, qualquer que tenha sido o motivo — exceto G6.** O contador tinha três defeitos que só apareceram ao tentar defendê-lo: (1) **não conta nada enquanto a #322 não existir** — sem orquestração de retentativa cada ciclo produz **uma** recusa, o contador nunca chega a 3, e o banco que erra sempre vira assinatura gratuita vitalícia, que é exatamente o buraco que ele foi inventado para tapar; guard que só funciona depois de outra issue entrar não é guard; (2) **depende de quantos webhooks o gateway resolve mandar**, fato não medido (#321) e fora do nosso controle; (3) **precisaria de persistência** — uma coluna de contador, mais schema para medir a coisa errada. O prazo não tem nenhum dos três, e **o número não é escolha**: em D+7 o `POST .../retries` passa a devolver 400 pelo limite `7D`, então o trilho automático está **provadamente** esgotado, seja qual for o motivo original. O princípio: o que a recusa operacional compra é **tempo, não imunidade** — o banco ter falhado não faz a mensalidade deixar de ser devida. `past_due_desde` recebe o instante do carimbo (D+7), não a data da recusa: o relógio começa quando concluímos que a clínica deve, e ela fica com 7 + 10 = 17 dias, intencionalmente, porque metade do prazo foi consumida por um erro que não era dela. **G6 fica sem backstop de propósito:** defeito nosso é custo nosso, e cobrar a clínica por um `dueDate` que **nós** calculamos seria carimbá-la de inadimplente pelo nosso bug — G6 é barulhento por construção, então o remédio é consertar. Buraco de receita por bug permanente nosso: aceito e registrado.

**A coluna `billing_cycle.recusa_codigo text` aprovada, e a razão não é relatório.** A justificativa pela consulta da DoD também era fraca — DoD se afrouxa. A razão real é que a coluna é **estrutural para a quarta coluna da tabela**: a classificação acontece na escrita (`conciliarPagamentoDeCiclo`), a tela lê depois, noutro request. Sem o código persistido, o app **não tem como saber** por que o ciclo falhou; o G1 nunca renderiza "suba o limite no seu banco", e os nove grupos passam a diferir apenas em texto de log. A consulta da DoD era sintoma; o requisito é a UI. `LIKE` sobre `billing_cycle.erro` está descartado sem discussão — texto livre cobrindo situações distintas **é o defeito que esta issue existe para matar**, e reintroduzi-lo como mecanismo de leitura seria fechar a issue com o próprio bug. Guarda o **código cru**; o grupo se deriva em código, porque do cru sempre se re-deriva o grupo e do grupo não se recupera o cru — e o catálogo é aberto, então os grupos vão mudar.

**O que foi medido para escrever a migração** (leitura de `.sql`, não `information_schema` — sem Postgres nesta máquina): `billing_cycle` tem privilégio **de tabela**, nunca coluna a coluna — `GRANT SELECT ON billing_cycle TO app_role` (`0071:237`) e `GRANT SELECT, INSERT, UPDATE, DELETE ... TO iris_auth` (`0071:244`, reforçado em `0075:67`) — e **nenhum `REVOKE` jamais tocou esta tabela**, então a coluna nova já entra coberta. Ainda assim emitir os `GRANT` explícitos, seguindo o idioma que `subscription` usa (`0088:28-29`, `0089:33-34`) e não o da própria `billing_cycle` (a `0097` acrescentou coluna e não emitiu grant nenhum): custo de uma linha, e é o que sobrevive ao dia em que alguém converter a tabela para granular — a armadilha do §Migrações item 4 do `CLAUDE.md`. Nullable sem default, igual à coluna análoga `erro` (`0071:106`, `schema.ts:1886`): `NOT NULL` exigiria sentinela para toda linha nunca recusada, e `ADD COLUMN NOT NULL` sem default falha em tabela com linhas. Nenhuma policy muda (`billing_cycle_select` e `billing_cycle_auth_all` são por linha e só citam `clinic_id`); não existe view sobre a tabela; `billing_apurar_ciclo` faz `SELECT` com lista explícita de colunas, sem `SELECT *`, então não precisa de `CREATE OR REPLACE`. Caminho canônico é `pnpm db:generate` (é mudança de `schema.ts`) e depois editar o `.sql` gerado para acrescentar os `GRANT`, **sem tocar no snapshot**. Próxima tag `0099`, idx 99.

**Consequência de processo:** a #318 **sai da rota `jules`** e vai para `/tlc-spec-driven`, porque a coluna toca modelo de dados. Não é perda — a tarefa 0 também não era entregável por executor autônomo, por não ser verificável em sandbox.

**Fixtures inventadas, pré-requisito e não item cosmético:** `LIMITE_AUTORIZADO_EXCEDIDO` (real: `MAXIMUM_AMOUNT_EXCEEDED`) e `SALDO_INSUFICIENTE` (real: `PAYMENT_OVERDUE`), em `asaas.test.ts`, `route.int.test.ts`, `reprocessamento-provedor.int.test.ts` e no plano da #286. Dois códigos em **português** num campo que o gateway devolve em inglês. Passam hoje porque o repo só faz passthrough de string — e quebram no dia da classificação **para o lado errado**: as fixtures validariam contra um dialeto que o gateway nunca produz, e o mapa nasceria sem cobertura real. Registro adjacente: `INSUFFICIENT_BALANCE`, que existe na API do Asaas, **não** é motivo de recusa de Pix Automático — é valor de `PaymentEscrowFinishReason` (Conta Escrow), domínio sem relação.

**Achados novos que não têm dono e ficaram registrados** (detalhe no `checkpoint.md` §4): o docstring de `fecharCiclosVencendo` (`subscription.ts:576-579`) afirma que o erro é persistido em `billing_cycle.erro`, mas o `catch` real (`:756-766`) não faz `UPDATE` nenhum — `:1250` é o **único** ponto do repo que grava `erro` não-nulo; o envelope que `normalizarEventoAsaas` assume (`asaas.ts:385-453`) não aparece no exemplo publicado da doc e não foi medido; e o FAQ do Asaas (item 5) **contradiz** a página de retentativas ao negar tentativas em dias posteriores — o FAQ é anterior à Jornada 3 e não serve de fonte para `3R_7D`.

**Não medido, e não por falta de tentativa:** em que campo do payload de **webhook** o código de recusa pousa. Entra no ensaio com clínica de teste em produção, junto das demais perguntas da #321.

---

## 🏁 Sessão 15/08/2026 (3ª) — #319: a carência que nunca corria (passo 3 da linha de billing)

Branch `feat/317-parametros-autorizacao-pix`, 3 commits de código (`eea42ea`, `061a147`, `2d9e486`), **sem push**. Plano versionado em `docs/superpowers/plans/2026-08-15-319-carencia-que-nunca-corre.md`.

**O defeito:** `past_due` era terminal. Três comentários no código afirmavam que a carência levava a `canceled`; nenhum implementava — `carencia_dias` e `past_due_desde` eram escritos e nunca lidos, e `cancelarVinculo` não tinha chamador em produção desde que nasceu. Consequência: quem parava de pagar escrevia indefinidamente, nenhum ciclo virava `devido`, e **toda a máquina de dívida da #287/#290 só era alcançável por revogação voluntária no app do banco**. A doc do Asaas fecha a saída pelo outro lado: "a falha de uma instrução não cancela a autorização" — o `cancelada` que o Iris esperava do provedor nunca chegaria por inadimplência.

**A conta errada no corpo da própria issue.** A #319 afirmava "7 de retentativa + 7 de carência = 14 dias de escrita livre". Falso: `pastDueDesde: assinatura.pastDueDesde ?? agora` preserva o **primeiro** carimbo, e a assinatura vira `past_due` na primeira recusa — então as retentativas `ALLOW_THREE_IN_SEVEN_DAYS` do #317 correm **dentro** da carência. As janelas se sobrepõem, não somam. Foi essa medição que mudou o dimensionamento: a carência foi para **10 dias** (7 da janela de retentativa + 3 de folga) justamente porque, com 7, a última das três tentativas do Asaas pode cair no mesmo dia do corte — clínica cortada com um débito ainda em voo.

**As 5 decisões da issue, fechadas com o Rômulo:** (D-1) a varredura roda na rota interna `/api/internal/billing/fechar-ciclos`, como 3ª chamada **depois** de `fecharCiclosVencendo` — fechar ciclos é o que produz as recusas do dia, e varrer antes cortaria quem ainda ia ser cobrado; (D-2) `cancelarVinculo` é chamado **fail-closed**, falha ⇒ não transiciona; (D-3) carência 7 → 10; (D-4) ciclo `falhou` vira `devido`; (D-5) aviso ao cliente fica para a **#312**, que a ordem de conclusão já prevê escrever depois daqui para cobrir os dois gatilhos de corte com copy diferente de uma vez.

**Armadilha nova do desenho:** `pastDueDesde` **precisa** ser zerado no corte. Sobrevivendo, a assinatura reativada voltaria a `past_due` numa recusa futura, o `?? agora` preservaria o carimbo **velho**, a carência nasceria vencida e o corte seria imediato. Mesma classe do `cancelada_em` não limpo na reativação (que saturou o 2º pro-rata no piso de 1 dia). Detalhe que importa para quem escrever teste parecido: **o round-trip sozinho não mata esse mutante** — `aplicarStatusProvider` zera o carimbo em toda transição que não seja para `past_due`, então quem discrimina é a asserção intermediária, medindo a coluna logo depois do corte.

**Revisão adversarial — 3 GRAVES, corrigidos antes do commit:**

1. **Ordem de escrita irrecuperável.** O congelamento rodava depois do `UPDATE canceled`. Falhando ali, a linha já era `canceled`, a passada seguinte não a selecionava (o predicado é `status='past_due'`) e nada mais congelava: `levantarDebito` = 0, gate da #290 aberto, clínica cortada reativando **de graça** — exatamente a perda que a D-4 existe para fechar. Virou revogar → congelar → gravar, com os dois últimos na mesma transação. Lição transferível: **em varredura cujo predicado é o próprio estado que ela muda, a escrita que muda o estado tem que ser a última** — senão a falha parcial some do conjunto elegível e nunca se auto-cura.
2. **Não era fail-closed, era loop preso.** `cancelarVinculo` é um `DELETE` cru, e o helper `chamar` converte qualquer não-2xx em throw, sem a classificação 4xx-definitivo/5xx-transitório que `reprocessarEventosPendentes` já tinha no mesmo arquivo. Se o Asaas processasse e a resposta se perdesse — ou se o cliente já tivesse revogado no app do banco — toda passada diária responderia 404 e a assinatura **nunca** seria cortada, com `past_due` liberando escrita: o bug que a issue existe para matar, de volta com aparência de fail-closed. Agora 404 conta como sucesso (o objetivo já está atingido) e 400 reconsulta o `GET`, aceitando só se o gateway **disser** `CANCELLED/REFUSED/EXPIRED`; rede, timeout e 5xx seguem barrando. O status real do `DELETE` sobre autorização já cancelada **não foi medido** — a tolerância é desenho defensivo, e entra no ensaio em produção.
3. **O corte era reversível por não pagar.** Defeito **pré-existente** que só a #319 torna alcançável em massa: o ramo `recusada` de `conciliarPagamentoDeCiclo` gravava `past_due` sem guard de status, enquanto o ramo `paga` tem. Clínica cortada → pede o débito da #290 → não paga → cobrança vai a `OVERDUE` → a assinatura voltava de `canceled` para `past_due`, **recuperando escrita e ganhando 10 dias novos**. Guard acrescentado.

Mais quatro menores fechados: o erro do resultado passou a distinguir a etapa que falhou (gateway × congelamento × escrita), porque contar como "não cortada" uma assinatura efetivamente cortada envenena o log do job; a varredura ganhou ordenação (mais antigo primeiro) e teto por passada, com o truncamento subindo no corpo JSON e não só num `console.warn` — silêncio ali leria como "cobri tudo" sem ter coberto; e o comentário do piso do congelamento, que afirmava que `aberto`/`apurado` significa "sem cobrança emitida", foi corrigido (`apurado` **com** `provider_charge_id` é alcançável).

**⚠️ O que esta entrega não tem, e é a dívida mais cara da sessão: nenhuma verificação contra banco.** Postgres local recusa conexão em 5433 e o daemon do Docker não sobe na máquina. A `0098` está escrita e **não aplicada** (sem prova em `information_schema` do default 10, em `pg_indexes` do índice novo, nem contagem do backfill); os **12 casos de integração nunca rodaram** — confirmado só que coletam e pulam limpo com `ALLOW_SKIP_INTEGRATION=1`, e verde de suíte gated não é prova de nada; o predicado `past_due_desde + make_interval(days => carencia_dias) <= agora` foi provado por `toSQL()` (SQL válido, bind não quebrado), não por execução. Verde do que roda: `typecheck` limpo, `lint` 0 erros, `src/lib/billing` 133 passando, `migrations.test.ts` 8 passando.

**Efeitos nas issues vizinhas:** a **#318** está destravada (era o que a #319 bloqueava) e é o passo 4; a **#310** ganhou urgência — enquanto ela não entra, existe janela de **cobrança dupla**, porque o ciclo virou `devido` no Iris e a cobrança antiga segue `OVERDUE` e pagável no Asaas; a **#312** herda o segundo gatilho de corte (carência vencida), com copy própria; a **D-D** da sessão anterior (`carencia_dias` fica em 7, redimensionar é pauta da #319) está **resolvida**.

---

## 🏁 Sessão 15/08/2026 (2ª) — #317: parâmetros irreversíveis da autorização (passo 2 da linha de billing)

Branch `feat/317-parametros-autorizacao-pix`, 4 commits (`a2b3e36`, `792bff1`, `dd9efb7`, `597128c`), **sem push**. Plano versionado em `docs/superpowers/plans/2026-08-15-317-parametros-autorizacao-pix.md`; DoD consolidada postada como comentário na própria issue, porque corpo + comentários 1 e 2 tinham três versões sobrepostas e o comentário 3 (medição #321) declarou impossíveis vários itens de "medir no sandbox".

**O que entrou:** `minLimitValue` (R$ 39,00) e `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` no payload de criação da autorização; `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS`; `vencimentoCobrancaDeCiclo` + calendário bancário brasileiro novo.

**O bug sazonal que apareceu no caminho.** `vencimento: somarDias(agora, 5)` somava **dias corridos**. Atravessando Carnaval, feriado prolongado ou o cluster de fim de ano, cinco corridos podem deixar **menos de dois dias úteis** de antecedência — recusa `RECEIVED_TOO_LATE`. Verde o ano inteiro, vermelho em fevereiro e dezembro; nenhum teste que usa a data de hoje o veria. A unidade da janela é genuinamente indeterminada (doc de Implementação do Asaas diz "2 a 10 dias **úteis**", Motivos de Recusa dizem "2 dias"/"10 dias" sem qualificar, BACEN diz corridos) e **não é mensurável no sandbox** (#321). A regra nova satisfaz a metade mais restritiva de cada leitura: **piso em dias úteis bancários, teto em dias corridos** — 10 corridos é sempre ≤ 10 úteis, então o resultado está dentro sob qualquer interpretação. Feriados móveis são **calculados** da Páscoa, não tabelados: tabela chumbada vence em silêncio, que é exatamente o modo de falha que a entrega remove.

**Decisões de produto (detalhe no plano e no comentário da issue):**

- **D-A** — `minLimitValue` deriva de `FAIXAS_PRECIFICACAO[0]`, **não** de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS`, que o próprio docblock declara LEGADO e fora de produção. Derivar da constante morta, como o corpo da issue pedia, a ressuscitaria em produção contra o que ela mesma diz.
- **D-B** — entra só a flag; a orquestração extradia (quem comanda cada retentativa é o recebedor, via API) é a **#322**. A flag sozinha é inerte **e irreversível** — o Asaas não permite habilitá-la depois, e o conserto seria novo QR e novo consentimento, cliente a cliente. É isso, não a gravidade, que colocou este passo antes dos outros.
- **D-D** — `carencia_dias` **fica em 7**: sem a orquestração, o comportamento não muda. Redimensionar é pauta da #319.
- **D-E** — rename do piso, senão nascem dois "piso" opostos no mesmo domínio: o do que **nós cobramos** (gate de reativação) e o do teto que o **pagador** autoriza.

**Revisão adversarial pegou 4 defeitos que os testes verdes não pegaram:**

1. **Faltavam 24/12 e 31/12** no calendário — justamente os dois dias bancários-e-não-civis, que é a distinção que o módulo declara fazer. Sem eles, 8 fechamentos em 2026-27 caíam para **1 dia útil** de antecedência (fechar em 22/12/2026 → vencer em 28/12, com só o dia 23 no meio). O bug sazonal teria sobrevivido à entrega que existia para matá-lo.
2. **A varredura de 730 dias era tautológica** — importava as constantes que deveria vigiar e asseria a própria condição de saída da implementação. Mutar o piso de 2 para 0 a deixava **verde**. Nova entrada no catálogo de "teste verde que não testa nada": _asserir com a constante que o código usa_. Limites agora são literais.
3. **Teto da janela e `diasCorridosEntre` com cobertura zero** — o ramo do `RangeError` é inalcançável a partir de fechamento real (o pior caso é 9 corridos), e `diasCorridosEntre` poderia devolver `0` constante com a suíte inteira verde. A checagem virou `verificarTetoDaJanela`, exportada e testada direto.
4. **Faltava o teste de cluster de fim de ano** que o comentário 2 da issue pedia textualmente — a ausência dele é o que deixou o defeito 1 passar.

Cada asserção nova foi provada por mutação, com a mutação revertida **por patch inverso à mão** (nunca `git checkout`, que apagaria o código novo junto).

**Achados abertos que ficaram sem dono** — tabela completa no `checkpoint.md` §4: qual calendário de feriados o Asaas usa (o nosso é o nacional; estadual/municipal não entra — suposição não medida); o teto de 10 corridos é vigiado por um único teste; `.specs/features/debito-reativacao-290/design.md:56` cita o nome antigo da constante (registro de época, não corrigido de propósito); `moveisPorAno` é cache global sem limite.

**Ambiente:** `pnpm test` completo **não fecha verde nesta máquina** — 7 falhas `ECONNREFUSED :5433` em `src/app/(app)/equipe/convidar/logic.test.ts`, com Postgres local fora do ar e daemon do Docker que não sobe. Verificado pré-existente e alheio ao diff (que não toca `equipe/`). `typecheck` e `lint` limpos; 133 testes verdes em `src/lib/billing`.

---

## 🏁 Sessão 15/08/2026 — #321: sessão de medição no sandbox do Asaas (passo 1 da linha de billing)

Executado o passo 1 da [ordem de conclusão](https://claude.ai/code/artifact/59b6c2d8-ea6c-401a-b62f-9572ed26d243). Sete perguntas que vinham de leitura de doc (guia BACEN + MCP do Asaas) foram levadas à API real de homologação. Registro cru em `infra/README.md:1921` (`### Runbook — sessão de medição no sandbox do Asaas (#321)`), commit `838d5be`, branch `feat/290-gate-debito-reativacao` **sem push**.

**Achado estrutural que muda o planejamento: o sandbox do Asaas não permite ativar uma autorização de Pix Automático.** O único simulador de pagamento (`pix/qrCodes/pay`) trava em `AWAITING_CRITICAL_ACTION_AUTHORIZATION`; `/transfers/{id}/authorize` devolve 404; o token `000000` não move o estado nem em header nem em corpo. Existem exatamente 3 endpoints de simulação — `myAccount/approve`, `payment/{id}/confirm`, `payment/{id}/overdue` — e nenhum toca autorização. Consequência: **todo o trilho de débito headless é imensurável fora de produção**. O que o sandbox resolve é criação de autorização (aceitação de campo e enum) e o trilho de cobrança **avulsa**. Cinco das sete perguntas dependem agora do ensaio com clínica de teste em produção.

**Medido:**

- `minLimitValue: 39.00` **sem** `value` é aceito (200, persiste, `value: null`, `status: CREATED`).
- `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` é **aceito na criação**, com eco na resposta — logo o `NOT_ALLOWED` que o adapter manda hoje (`asaas.ts:513-533`) é escolha, não limitação da API.
- Piso real de cobrança PIX avulsa: **R$ 5,00** (0,01 / 0,50 / 1,00 / 3,00 → 400 nomeado; 5,00 → 200). A regra é sobre **`value − discount`**, líquido de desconto. Confirma o `500` da constante — que desde a #317 se chama `PISO_COBRANCA_AVULSA_CENTAVOS`.
- No trilho avulso, `dueDate` em sábado, domingo e feriado 07/09 foram os três aceitos, com a data devolvida igual — sem empurrão para dia útil.
- O código de recusa vive em **`paymentInstruction.refusalReason`**, via `GET /pix/automatic/paymentInstructions/{id}` (endpoint confirmado no ar). O `/pix/automatic/payments` que se supunha antes dá 404.
- O piso de R$ 5,00 **não** se aplica ao QR de ativação: `originalValue: 0.01` foi aceito. `VALOR_ATIVACAO_PADRAO_CENTAVOS = 1` segue viável.

**Não medido, com motivo:** unidade da janela de antecedência (úteis × corridos) — o 400 de autorização inativa dispara **antes** da checagem de janela, e o controle montado _dentro_ da janela recebeu o mesmo 400, provando que a resposta não carrega informação de janela; recorrência com dois valores diferentes; pagador concluir a autorização sem preencher teto; identificador da cobrança de ativação; payload do webhook de recusa.

**Armadilhas medidas, que valem além desta issue:**

- **Campo desconhecido passa 200 e some.** `maxLimitValue` inventado foi aceito e não voltou na resposta. **Eco na resposta é o único teste de que um campo existe** — status 200 não prova nada. Parente direto da lição do D5 (dublê não cobre o dialeto do destino).
- **Forçar vencimento reescreve `dueDate`** e preserva `originalDueDate`. Comparar `dueDate` com a data planejada depois do vencimento lê a data errada.
- Taxa Pix de R$ 0,99 sobre cobrança no piso → `netValue: 4,01`, ~20% do débito.

**Efeitos nas issues dependentes** (comentados em cada uma, em pt-BR, com data e ambiente):

- **#317** — `retryPolicy` aceito destrava o escopo. A contradição úteis × corridos **continua aberta**: entra no plano como suposição declarada, nunca como fato.
- **#311** — deixa de ser candidata a remoção. A entrega vira trocar o comentário de `src/lib/billing/debito.ts:41-55` — que se declara _"escolha conservadora, NÃO medição"_ e pede exatamente este teste — por "medido em 15/08/2026", acrescentando a precisão do líquido de desconto.
- **#289** — o discriminador **não pode ser `externalReference`**: o `immediateQrCode` não tem o campo, e a cobrança de ativação nem existe até o QR ser pago (após criar 3 autorizações, zero cobranças de R$ 0,01). Candidatos disponíveis antes do pagamento: `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier` da autorização. **A escolha entre os dois segue decisão de produto em aberto — a issue ainda não pode ir para o Jules.**
- **#318** — achado colateral: `consultarCobranca` (`src/lib/billing/provider/asaas.ts:799`, fallback em 818-821) procura em `pixTransaction.failureReason`, que **não existe** no recurso `payment` — medido num payment OVERDUE forçado, `pixTransaction: null`.

---

## 🏁 Sessão 13/08/2026 — #248: Fila de Validação integrada ao design system (PR #279, pronto para revisão)

Entregue em `feat/validacao-fila-design-system-248`: migração da fila para `ConfidenceCard`/`CompareRow`/`BatchBar` + `aprovarEvidenciasLote` (transação atômica, elegibilidade re-derivada no servidor via `avaliarFriccao`, locks em ordem determinística, audit por evidência, teto 50). Spec da issue corrigida contra o modelo real (`evidence` append-only — não há `UPDATE ... status`; provável causa da morte do PR #256 do Jules).

**Decisão do Rômulo (13/08/2026): mantém invariante 12/07/2026.** Predicado da fila (`baixa_confianca` OU `inconsistente`) continua tornando **zero** itens elegíveis a lote — não amplia a fila para incluir alta+consistente não confirmadas, pois isso abriria caminho de aprovação sem abrir cartão para dado clínico extraído por IA, risco julgado maior que o ganho de fricção. `BatchBar` (`src/components/ui/patterns/batch-bar.tsx`) ajustada para estado informativo quando `totalElegiveis === 0`: sem botão morto "Aprovar Lote (0)", copy explica que todos os itens exigem revisão individual. Decisão de lote de verdade (se algum dia fizer sentido) fica como issue de governança própria, não amarrada ao #248.

---

## 🏁 Sessão 13/08/2026 — #102: risco de residência/DPA Hostinger aceito pelo Rômulo

**Achado (lido direto de `hostinger.com/br/legal/dpa`, não busca genérica):** o DPA padrão da Hostinger (i) já é aceito automaticamente no aceite dos Termos de Serviço — não existe fluxo de "assinar" separado; (ii) não garante país/data center específico, só cita "REDE HOSTINGER" genérica; (iii) não define prazo de notificação de incidente, só "sem atrasos indevidos"; (iv) se declara documento integral, sem espaço para aditivo customizado por cliente.

**Impacto:** as regras de negócio #1 (garantia geográfica exclusiva BR) e #2 (notificação em 48h) da issue #102 **não têm cláusula correspondente** no documento padrão — T1 ("abrir chamado solicitando DPA assinado") é redundante e T2 ("validar cláusulas") não tem o que validar.

**Decisão do Rômulo (13/08/2026): aceita o risco residual.** Segue sem garantia contratual de residência exclusiva BR — apoiado só na evidência de medição já feita (latência 33ms, sessão 27/07). Não bloqueia entrada de dado real de paciente por este motivo. Mantém alinhado com a régua já registrada na sessão 03/08 (#102 gated por 40 pacientes em prod, não pela entrada inicial).

Comentário registrado na issue: [#102](https://github.com/romulosutil/Iris/issues/102#issuecomment-5275794015). Detalhe completo em memória `hostinger-dpa-padrao-sem-garantia-br-nem-prazo-incidente`.

---

## 🏁 Sessão 11/08/2026 — Desarquivamento Clínico Unificado (D7/D8) e Helpers GUC de Papel e Identidade (D23, D5)

**O que foi entregue e verificado nesta sessão:**

1. **D5 Fechado:** Webhook de produção cadastrado na conta de produção do Asaas e token `ASAAS_WEBHOOK_TOKEN` confirmado ativo em produção pelo Rômulo em 11/08 (valor só no runbook privado — `S-09`).
2. **D7 Fechado (#174):** Helper central `desarquivarPacienteSeArquivado` em `src/lib/patient/desarquivamento.ts` com gate de RLS prévio e emissão atômica de `audit_log` (`paciente_desarquivado_automaticamente`). Cobertura completa de todos os atos clínicos (diário de sessão, áudio local, consolidação, escopo, aprovação de evidências, confirmação/reclassificação de fila, dúvidas clínicas, ativação de protocolos, metas e ficha clínica).
3. **D8 Fechado (#174):** Procedure `app_desarquivar_paciente` (`SECURITY DEFINER`, migração `0092`) autoriza condutores e substitutos de sessão (`session.terapeuta_id` ou `session.atendido_por_id` na mesma clínica) a reativar o paciente de forma atômica no ato clínico.
4. **D23 Fechado:** Migração `0093_user_role_id_helpers.sql` criou 6 helpers com código de erro diagnóstico `P0001` e regex guard. Reescrita de 6 funções DEFINER (`app_alerta_risco_visivel`, `app_session_clinica_visivel`, `app_salvar_config_emergencia`, `app_salvar_cpf_cnpj_clinica`, `app_desarquivar_paciente`, `app_criar_alerta_risco`). Guards de CI em `db/tests/clinic-id-helper-rls.int.test.ts` estendidos.
5. **PR #247:** Aberta na branch `feat/d7-desarquivamento-clinico` com todas as alterações acima.

---

## 🏁 Sessão 10/08/2026 (2ª) — #36 especificada: a ativação Asaas nunca funcionou, e a causa raiz é modelo de dados, não adapter

**Medição que muda o quadro (psql, produção):** `SELECT provider, status,
count(*) FROM subscription GROUP BY 1, 2` → `mercado_pago/free_tier: 1` +
`mercado_pago/setup_pending: 1`. Duas linhas na tabela inteira, nenhuma
`active`, nenhuma `past_due`. Leituras: (1) **nenhuma clínica jamais concluiu
uma ativação**, em gateway nenhum; (2) **o MP nunca faturou ninguém** — a
remoção não derruba faturamento de cliente algum. Atenção de processo: a
primeira rodada dessa medição foi digitada no `bash` do container (não no
`psql`) e o `syntax error` do shell quase foi lido como resultado.

**Causa raiz do 400 da ativação** (log com `corpoGateway: ''`): o Asaas exige
`cpfCnpj` para `POST /customers` (`asaas.ts:482-490`, falha rápida correta),
`PedidoAtivacao.cpfCnpj` é opcional, `assinatura/logic.ts` nunca preenche, e
`clinic` **não tem coluna de documento**. O `?` na porta escondeu um buraco no
modelo de dados. `corpoGateway` vazio é correto aqui — o erro nasce na
validação local do adapter, antes de qualquer HTTP; o log do PR #242 funciona.

**Defeito novo achado na sessão (D29):** `schema.ts:1743` mantém
`.default("mercado_pago")` no banco — o D26/D27 só removeram o default do
código. É a origem da linha `free_tier`+`mercado_pago` e pré-requisito da
remoção do MP.

**Decisões travadas com o Rômulo:**

1. **Trial irrestrito MANTIDO** — a hipótese de exigir assinatura no 1º clique
   de "+ Novo paciente" foi rejeitada: contradiz #163/#175 e reabriria o
   deadlock que `estado-conta.ts` existe para matar. Gate segue pós-trial.
2. **CPF/CNPJ coletado na própria `/assinatura`**, coluna nova em `clinic`.
   Página "Dados da clínica" dedicada derivou para item próprio (D31).
3. **Mercado Pago sai do código** (adapter, rota de webhook, tabela, 3 envs) —
   agora com medição que sustenta (ver D24), condicionado ao D29.

**Doc do Asaas consultada (10/08):** `POST /customers` exige só `name` +
`cpfCnpj`, **sem validação nome×documento** documentada (nome da clínica com
CPF de autônomo passa); `PUT /customers/{id}` **permite trocar `cpfCnpj`**
("change of registered CPF or CNPJ" é caso de uso citado), sem restrição
documentada por existirem cobranças.

**Artefatos:** spec em `.specs/features/billing-ativacao-asaas/spec.md`
(9 requisitos ATIV-01..09), design em `design.md` ao lado, resumo publicado na
issue #36. Débitos novos: D29, D30, D31, D32 (tabela acima).

---

## 🏁 Sessão 10/08/2026 (3ª) — #36 Fase A: T1-T7 e T9 implementados, D29/D30/D32 fecham

Execução da spec da sessão anterior. Ordem real diferiu do plano: o gate
`full` do T4 não fechava sem o T9 (o CHECK novo derrubava 6 caminhos de
teste — INSERTs **e** UPDATEs que viram `active`/`past_due`/`canceled`), então
T9 foi antecipado. T1→T2→T3→T4→**T9**→T5/T6[P]→T7. Detalhe tarefa a tarefa,
evidência medida e cheque de mutação de cada uma: `tasks.md`.

**Fechados nesta sessão:** D29 (default do banco removido, T1), D30 (modelo
de dados + validador + definer + gravação, T1/T2/T5/T7 — **mas ativação só
completa de fato depois do T8**, campo ainda não existe no formulário), D32
(`provider_customer_id` persistido, T6).

**Novo:** `docs/dados/modelo-de-dados.md` §2.12 documenta `clinic.cpf_cnpj`
(nullable, só dígitos, por que não reaproveitar `responsavel_conta_id`).

**Baseline de teste**: 165 arquivos/1076 testes (antes do T1) →
**168 arquivos/1093 testes** (unit) + **96 arquivos/808 testes** (`test:rls`),
nenhum deletado.

**Pendente**: T8 (campo de CPF/CNPJ no formulário — bloqueia ativação real em
produção), T3 (backfill de produção — gate Rômulo), T10 (prova E2E sandbox).
Fase B (T11-T13, jornada) e Fase C (T14-T18, remoção do MP) não iniciadas.

---

## 🏁 Sessão 10/08/2026 — D22 fechada: ativação do Pix declara o que cobra (#239, PR #240) + regra de gestão de tokens no CLAUDE.md

**D22.** A ativação do Pix Automático sempre cobrou R$ 0,01 de verdade (ver
sessão 08/08 acima, item 1), mas a tela não dizia isso antes do QR Code, e o
valor era decisão de produto ainda em aberto. Fechada: fica em R$ 0,01,
`AutorizacaoPendente` no ramo `pix_copia_e_cola` passou a exigir
`valorAtivacaoCentavos` (obrigatório, não opcional — de propósito, ver linha
D22 acima), migração `0089_valor_ativacao_pix.sql` guarda o valor em
`subscription.valor_ativacao_centavos`, `formulario-ativacao.tsx` exibe o
valor antes do QR. PR #240 mergeada 10/08 12:43, issue #239 fechada.

**Post-mortem de token da própria sessão D22 (não é código, é processo).**
A implementação girou em cerca de 423k tokens por round-trips redundantes,
não por bug: mesma investigação repetida em duas sessões do mesmo dia,
4 passadas de formatação separadas nos mesmos arquivos, lint full-repo fora
de escopo. Nenhuma dessas coisas era necessária ao resultado. Duas regras
novas em `CLAUDE.md` (§"Gestão de tokens: atomização e checkpoint de
contexto") para não repetir: (1) toda issue nova entra atomizada via
`/tlc-spec-driven` (se toca dado/RLS/schema do agente) ou
`/superpowers:writing-plans` (demais casos) antes de implementar; (2) teto
estimado de ~50 mensagens por sessão, com checkpoint em `checkpoint.md` e
aviso para `/clear` ao se aproximar — harness não expõe contador exato, por
isso é estimativa, não substitui a compressão automática de contexto.

---

## 🏁 Sessão 08/08/2026 — Asaas volta a ser trilho possível: adapter implementado e webhook aplicando efeito (#231, avança #36, fecha D12)

**O que destravou.** A conta de produção do Asaas foi aprovada em 08/08/2026 e o
Pix Automático liberado — o D12, que bloqueava a Fase 7 inteira desde 03/08,
está fechado. Isso não é só "mais um gateway": o Mercado Pago **não** resolve o
problema central do modelo comercial. O Iris cobra no FIM do ciclo, somando
fichas ativas (criada no ciclo **ou** com interação no ciclo), e débito headless
de valor variável no MP depende de MIT/CoF negociado com o suporte — gate externo
que continua aberto. No Asaas isso é o desenho do Pix Automático Jornada 3: a
clínica autoriza uma vez, **sem `value`**, e cada ciclo é debitado com o valor
realmente apurado.

**O que foi construído.**

- `src/lib/billing/provider/asaas.ts` — os sete métodos da porta. Vínculo =
  `POST /pix/automatic/authorizations` sem `value`, `paymentCreationMode: MANUAL`
  (o modo `SUBSCRIPTION` do Asaas EXIGE valor fixo, que é exatamente a armadilha
  que `types.ts` descreve); cobrança = `POST /payments` com
  `pixAutomaticAuthorizationId`. `BILLING_PROVIDER=asaas` deixou de lançar.
- A rota `/api/hooks/asaas` deixou de ser só registro e passou a **aplicar
  efeito**, no mesmo desenho da do Mercado Pago: grava e responde 200 antes de
  aplicar, falha de aplicação nunca vira 5xx, recuperação por
  `reprocessarEventosPendentes`. A migração `0086` acrescenta
  `aplicado_em`/`erro_aplicacao` com `GRANT UPDATE` **coluna a coluna** — a
  `0066` só tinha dado `SELECT, INSERT`, e o grant faltando apareceria como
  `permission denied for table`, que não diz qual coluna.
- `reprocessarEventosPendentes` passou a varrer **os dois trilhos**, cada tabela
  com o adapter dela. A primeira versão varria só a do provedor **ativo**, e a
  revisão do Jules no PR #232 mostrou o furo: `subscription.provider` é
  persistido por linha, então depois de uma virada de chave as assinaturas
  antigas continuam amarradas ao gateway de origem e continuam entregando
  webhook — uma falha transitória naquela rota ficaria encalhada para sempre na
  tabela do gateway inativo. O cuidado que motivou a versão errada continua
  valendo e virou invariante testado: **tabela e adapter andam em par**. Cruzá-los
  faria o adapter errado normalizar payload de outro dialeto e consultar ids
  inexistentes, carimbando evento legítimo como falha definitiva (4xx) — perda de
  faturamento em silêncio. O `limite` é por trilho, senão um backlog num gateway
  consome a cota do outro.

**O que o Pix Automático impõe e não dá para esconder.**

1. **A ativação cobra de verdade.** A autorização só vai a `ACTIVE` depois que o
   QR imediato é liquidado. Não existe autorização de graça, e o desenho
   comercial dizia "onboarding R$ 0" — o adapter usa o menor débito possível
   (R$ 0,01). Decisão tomada em 10/08/2026 (**D22**): fica em R$ 0,01, e a tela
   de ativação declara o valor antes do QR Code. O que não dá para esconder,
   continua não dando: o jeito de honrar "onboarding R$ 0" no Pix Automático
   não existe.
2. **O Asaas não tem idempotência na criação de cobrança**, e a doc avisa que a
   API aceita duplicatas. A barreira é procurar por `externalReference`
   (`cycle:<id>`) antes de emitir. Falha na busca **aborta** a emissão: engolir
   o erro transformaria "não consegui verificar" em "não existe", que é o caminho
   exato para cobrar a clínica duas vezes.
3. **O corpo do webhook não é autenticado** — a entrega usa token fixo no header,
   não HMAC sobre o corpo. Por isso o efeito vem sempre de uma consulta ao
   gateway pelo id, nunca do estado que veio no evento.
4. **A fila para depois de 15 falhas consecutivas** e evento não entregue some em
   14 dias. É o que torna proibido devolver 5xx por falha de aplicação.

**Verificado por mutação, não por "passou".** O adapter tem 40 testes unitários e
quatro mutações deliberadas derrubam o vermelho certo: trocar o fuso de
`America/Sao_Paulo` por `toISOString()` (adiantaria o vencimento em um dia e
cairia fora da janela de 2 a 10 dias úteis), preencher `value` na autorização
(travaria o débito no valor de hoje), remover a busca de idempotência (cobrança
dupla) e tratar `CREATED` como autorizada (liberaria cadastro de clínica que não
autorizou nada). A rota tem 19 testes de integração contra banco real, e a
mutação da precedência cobrança-antes-de-vínculo **passou verde na primeira
tentativa** porque nenhum payload trazia os dois ids ao mesmo tempo — o caso de
`paymentInstruction` foi acrescentado justamente por isso.

**O dialeto real, não o dublê.** O payload de referência é o evento real do
sandbox (`docs/evidencias/2026-08-03-asaas-sandbox-evento-real.json`): `id` no
formato `evt_<hex32>&<int>` com `&` literal, e três formatos de data convivendo
no mesmo objeto, nenhum com fuso. `new Date("03/08/2026")` leria 8 de MARÇO — um
erro de cinco meses que não estoura em lugar nenhum, e foi por isso que o parser
de data é escrito à mão com `-03:00` explícito.

**Continua fora.** A virada de chave: `BILLING_PROVIDER` segue `mercado_pago`.
Trocar é decisão de produto e exige, antes, provisionar as envs e o webhook de
produção no painel do Asaas. **Nenhum evento real de PRODUÇÃO foi exercitado
ponta a ponta em nenhum dos dois trilhos** — sandbox e teste de integração não
substituem isso, e é a última milha que continua aberta na #36.

---

## 🏁 Sessão 08/08/2026 — #105: o verificador da réplica off-site tinha o mesmo `exit 0` mentiroso que ele existia para desmascarar

**O gap encontrado.** O `infra/backup/verify-offsite.sh` calculava o sha256 do
dump decifrado, imprimia, mandava o operador conferir **a olho** contra a linha
`sha256=` que o `backup.sh` logou — e na linha seguinte imprimia o banner de
aceite `RÉPLICA OFF-SITE VERIFICADA` **incondicionalmente**, tendo a conferência
acontecido ou não. O script cuja razão de existir é desmascarar o `exit 0`
enganoso do `backup.sh` tinha um `exit 0` enganoso próprio. O critério de aceite
3 da issue (carimbo do objeto **posterior** à rotação da chave age de 28/07/2026
~04:00 UTC) não era checado em lugar nenhum.

**O que mudou** (branch `infra/105-prova-replica-offsite`):

- `verify-offsite.sh` lê `OFFSITE_EXPECTED_SHA256` /
  `OFFSITE_EXPECTED_SHA256_GLOBALS` (opcionais) e **compara por máquina**, em vez
  de pedir olho humano; e `OFFSITE_MIN_CARIMBO` (`YYYYMMDDTHHMMSSZ`), que recusa
  objeto anterior ao corte **antes de baixar**, com mensagem dizendo que o achado
  real é "nenhuma réplica nova subiu desde o corte", não "a réplica está
  corrompida".
- Contrato novo de saída: `0` = verificado de ponta a ponta, e **só então** o
  banner de aceite é impresso; `1` = falha; `2` = decifra e restaura mas a
  procedência **não** foi provada porque nenhum sha esperado foi fornecido
  (imprime `VERIFICAÇÃO PARCIAL`). **Exit 2 não satisfaz o critério de aceite da
  issue.**
- `test-offsite.sh`: o caminho feliz agora passa os shas extraídos do próprio log
  do `backup.sh`; casos novos cobrem sha ausente (exit 2, sem banner — é a trava
  de mutação que prova que o banner deixou de ser incondicional), sha errado
  (exit 1), corte posterior ao objeto (exit 1), corte anterior (passa) e corte
  malformado (exit 1). 29 → 35 asserções.
- `infra/backup/test-verify-offsite-logica.sh` novo: teste unitário em bash puro
  das duas peças de lógica novas, sem Docker, roda no Git Bash da máquina do
  Rômulo. Extrai o código do script real com `sed` e **falha alto** se a extração
  não achar nada.
- `infra/README.md`: a verificação ganhou runbook `###` próprio — ela é
  reexecutada a cada rotação de chave age e no drill trimestral, então enterrá-la
  como passo 7 do runbook de provisionamento (que roda uma vez) estava errado —
  mais o clique-a-clique de tirar o sha256 esperado do log do serviço de backup e
  uma tabela de códigos de saída dizendo explicitamente que **exit 2 não é
  aprovação**.
- `.env.example`: as três variáveis novas documentadas como **do operador e de
  uma execução só** — não são lidas pelo serviço de backup e **não devem** ser
  setadas na VPS.
- `infra/docker-compose.yml`: as três precisaram ser declaradas no `environment:`
  do serviço `backup`. `VAR=x docker compose run backup ...` **não** entrega a
  variável ao container se ela não estiver declarada lá — sem isso o runbook
  rodaria com o sha esperado vazio, sairia 2 e o operador leria "procedência não
  provada" quando o defeito era o repasse. É a mesma classe de defeito do resto
  desta sessão: a mensagem certa para a causa errada.

**Segundo defeito, pego pela revisão do diff e provado por mutação.** A primeira
versão do teste unitário novo era **meia vácua**: o cabeçalho afirmava extrair
tudo do script real, mas as 7 asserções de carimbo testavam reimplementações
locais. A suíte seguia 14/14 verde com o `<` do script trocado por `>`. Corrigido
extraindo as funções de verdade (o que exigiu tirar a lógica de inline e nomeá-la
em `corte_carimbo_valido` / `carimbo_abaixo_do_corte`), e agora as três mutações
— comparação invertida, regex do formato esvaziado, strip do `iris-` removido —
derrubam a suíte. 21 asserções. Regra que fica: **se a asserção não lê o arquivo
sob teste, não é teste** — e a prova disso é rodar a mutação, não afirmar.

**Lacuna deixada aberta de propósito.** Procedência provada não é recência
provada: um objeto antigo, conferido contra o sha que o `backup.sh` logou
_naquele_ dia, passa em tudo e sai 0. O `OFFSITE_MIN_CARIMBO` fecha isso, mas é
opcional — quando ausente, o script agora imprime uma linha `ATENÇÃO` dizendo o
que não checou, em vez de deixar o banner sugerir mais do que foi medido. Torná-lo
obrigatório para o exit 0 é decisão do Rômulo, não tomada aqui.

**Bug pego antes do commit, e o padrão vale registro.** A validação do sha
esperado nasceu dentro de uma substituição `$(...)`, onde `exit 1` mata só a
subshell: um sha malformado cairia no ramo "não foi fornecido" e sairia 2 com a
mensagem errada — exatamente o tipo de diagnóstico invertido que essa ferramenta
existe para não dar. Achado pelo teste unitário novo, não pela leitura. Corrigido
com `printf -v` gravando no escopo do chamador.

**A #105 fecha com o merge da PR #226 (`Closes`), por decisão do Rômulo — mas a
prova em si migrou para a #227.** O que esta sessão entregou é o código que faz a
execução **provar** alguma coisa, não a execução. A #227 herda o label
`P1 · antes de dado real` e o runbook de 6 passos; enquanto ela estiver aberta, a
terceira camada de backup segue _presumida_ restaurável — o estado que é
indistinguível de uma réplica inútil. A prova exige operador
com a chave privada age, credencial Oracle **com leitura** (a de produção é
write-only por desenho; o caminho que funcionou em 28/07 foi conceder
temporariamente `read objects` ao grupo `iris-backup-writers` e remover depois) e
um objeto no bucket com carimbo posterior a 28/07/2026 04:00 UTC — o que depende
do `OFFSITE_INTERVAL_DAYS` (7 em produção, ou seja, replicação semanal).

---

## 🏁 Sessão 08/08/2026 — #229 fechada: as 48 policies resolvem o tenant por `app_clinic_id_exigido()` (D16)

Migração **`0085_policies_tenant_helper.sql`** (à mão, `when` = anterior +
1000). O débito dizia 43 policies; medido em `pg_policies` são **48**, em 4
formas sintáticas — 42 estritas, 4 com `missing_ok`, 1 comparando a PK própria
(`clinic_read`) e 1 aninhada em `EXISTS` (`app_user_read`).

**O desenho recusou o fix mecânico.** O próprio D16 registrava a armadilha:
trocar por `app_clinic_id_atual()` (que devolve `NULL`) faz `clinic_id = NULL`
virar NULL, a linha sumir e ninguém saber. Num predicado de isolamento
multi-tenant, silêncio é pior que estouro. Então a saída foi manter o estouro e
consertar o **diagnóstico**: `app_clinic_id_exigido()` levanta um `P0001` que
nomeia o tenant e aponta o `withTenant()`, no lugar de `42704`/`22P02`.

Sob `app_role`, GUC ausente ou malformado nunca é estado legítimo —
`withTenant()` (`src/db/rls.ts:34-41`) já falha rápido antes de abrir a
transação se `clinicId` vier vazio.

**Três medições mudaram decisões:**

1. **Levantar exceção dentro de policy é seguro aqui — porque as 48 são
   `TO app_role`,** e nenhuma tabela envolvida tem policy permissiva de
   `app_role` **sem** o termo de clínica. Sem isso o risco seria real: policies
   permissivas são OR-adas e o Postgres não garante curto-circuito, então uma
   exceção num ramo abortaria a query mesmo com outro ramo permitindo. O
   caminho de billing (`iris_auth`) não passa por essas policies — tem as suas,
   `*_auth_all`, que não leem o GUC.
2. **A leniência das 4 `missing_ok` era incidental, não requisito.** Verificado
   caller a caller: nenhum leitor sob `app_role`. Os comentários da `0071`/`0058`
   dizem espelhar `clinic_read` — que é a forma **estrita**. Ficaram estritas,
   mudança de comportamento declarada na PR.
3. **Nenhum código captura `22P02`/`42704`** (grep em `src/` e `scripts/`), então
   trocar o SQLSTATE não quebra tratamento de erro em lugar nenhum.

**Custo por linha não mudou.** `app_clinic_id_exigido()` é SQL/`STABLE` de
propósito: o planner faz inlining, e o `EXPLAIN` mostra o `COALESCE` inteiro
expandido no filtro — só o ramo que levanta continua sendo chamada de função, e
o `COALESCE` só o alcança quando o tenant não resolve. A função que levanta é
`STABLE` e **não** `IMMUTABLE` de propósito: `IMMUTABLE` sem argumento seria
dobrada em tempo de plano e levantaria durante o planejamento.

**As 48 `ALTER POLICY` foram geradas do texto vivo de `pg_policies`**, trocando
só o termo de clínica, e conferidas por comparação normalizada antes/depois:
**4 divergências, exatamente as 4 leniências que a issue declara mudar**, e nada
mais. Nota de ferramenta: o `diff` do shell (via wrapper `rtk`) respondeu
`[ok] Files are identical` para arquivos que diferem em 4 linhas — a comparação
que vale foi refeita em Node. Wrapper de ferramenta também precisa de mutação
antes de virar evidência.

**A leniência que morreu tem teste próprio.** A mudança de comportamento das 4
`missing_ok` não podia ficar só na invariante estrutural — texto de policy não
prova runtime. `subscription_select` (a de cadeia de FK mais barata das 4) ganhou
regressão que distingue os três desfechos possíveis: GUC ausente levanta `P0001`
e **não** devolve 0 linhas (o comportamento antigo), GUC lixo levanta `P0001` e
**não** `22P02`. Provado por mutação: revertida a policy para a forma leniente,
os dois testes falham — `expected +0 to be -1` e `expected '22P02' to be 'P0001'`.

Aí apareceu uma armadilha de teste que vale registrar: o Postgres registra um
**placeholder** para GUC customizado no primeiro toque da _sessão_, e o registro
**sobrevive ao `ROLLBACK`**. Depois disso `current_setting('app.clinic_id', true)`
devolve `''`, não `NULL` — "ausente" vira indistinguível de "vazio" e o caso
ausente passa a medir outra coisa. Como a conexão dona é compartilhada
(`max: 1`), qualquer teste anterior contamina. O caso ausente ganhou conexão
própria e uma asserção medida (`expect(r.guc).toBeNull()`) provando o estado
antes de exercitar a regra.

**Limite declarado da trava:** o teste de comportamento por tabela cobre
`clinic`, `patient`, `session`, `audit_log` e `subscription`. As demais ficam
cobertas estruturalmente (invariante de que nenhuma policy usa a forma crua +
lista explícita das 48) e pelas suítes de isolamento que já existem. Policy de
`SELECT` não avalia o predicado em tabela vazia, então semear a cadeia de FK de
cada uma custaria mais do que entrega.

Fica aberto o **D17** (editar migração já aplicada não roda e não avisa), que é
débito irmão e não foi tocado aqui.

---

## 🏁 Sessão 07/08/2026 — #191 fechada: CPF obrigatório + trava anti-fraude de trial (hash cego cross-tenant)

**O que entrou.** Migração `0083_patient_cpf_antifraude.sql` (via `db:generate`:
colunas `cpf`, `responsavel_cpf`, `cpf_hash`, os dois `UNIQUE(clinic_id, …)` e
o índice de `cpf_hash`) + `0084_cpf_hash_antifraude_definer.sql` (à mão:
`app_cpf_hash_usado_em_outro_trial(text)`, SECURITY DEFINER). No app:
`src/lib/cpf.ts` (Módulo 11), `src/lib/security/cpf-hash.ts` (HMAC-SHA256),
validação e gravação em `criarPacienteEConsent`, campo novo no formulário e
estado `trial_bloqueado_fraude` em `estado-conta.ts`.

**A decisão que não era óbvia: esta é a primeira função do repo que LÊ fora do
próprio tenant.** As DEFINER anteriores (`0064`, `0081`, `0048`, `0067`)
escrevem no próprio `clinic_id`; nenhuma consultava outra clínica. Detectar que
um CPF já consumiu trial em OUTRA conta é, por definição, uma pergunta
cross-tenant — nenhuma policy de RLS deve responder isso, e afrouxar `patient`
para responder seria abrir leitura de paciente entre clínicas.

O que torna isso aceitável é a **forma do retorno, não a intenção**: a função
devolve um `boolean` e nada mais. O chamador aprende "este hash já foi titular
de trial em algum lugar" e nada sobre onde, quem ou quantos. Como a entrada é o
hash (o CPF em claro nunca cruza a fronteira do banco) e a saída é 1 bit, não há
consulta que reconstrua dado de outro tenant. **Se algum dia essa função passar
a retornar linha, id, contagem ou data, ela deixa de ser cega e vira vazamento
cross-tenant** — é o guardrail a defender em qualquer alteração futura dela.

**Duas armadilhas evitadas, ambas com precedente no repo:**

- **Salt com fallback.** A spec original (`docs/superpowers/specs/2026-08-03-…`)
  propunha `process.env.CPF_HASH_SALT || "iris-anti-abuse-salt-2026"`. Salt
  literal no código anula o mecanismo inteiro: qualquer um que leia o repo
  recalcula o hash de um CPF conhecido e descobre se aquela pessoa é paciente
  em alguma clínica — vazamento pela porta criada para ser cega. `gerarCpfHash`
  **lança** sem a env var. `CPF_HASH_SALT` entrou no `.env.example`; **falta
  provisioná-la no Easypanel antes do deploy** (ver "pendências" abaixo).
- **Falha aberta na leitura do oráculo.** A primeira versão fazia
  `const [{ usado }] = …`; linha ausente viraria `undefined` → falsy → trial
  liberado. É exatamente o modo de falha que a #215 fechou. Hoje ausência de
  linha aborta o cadastro com erro próprio (e não com acusação de fraude, que
  seria a mensagem errada para um defeito nosso).

**Por que a checagem só roda em `trial_aguardando`.** Rodar em todo cadastro
puniria clínica pagante cujo paciente já foi atendido em outro lugar — situação
comum e legítima. E `trial_comeco_em IS NOT NULL` está no predicado de
propósito: só queima o CPF a clínica que de fato iniciou o relógio, não a que
apenas cadastrou alguém sem nunca entrar em trial.

**Verificado medindo, não lendo** (CLAUDE.md §Migrações, regra 3): colunas em
`information_schema`, constraints em `pg_constraint`, `prosecdef = true` em
`pg_proc`, `has_function_privilege` confirmando `EXECUTE` para `app_role` e
**negado** para `PUBLIC`. Probe `BEGIN … ROLLBACK` com 3 casos, incluindo a
contraprova que separa as duas hipóteses: clínica que tem o mesmo CPF mas
**nunca iniciou trial** devolve `false`. Sem esse caso, um predicado que
ignorasse `trial_comeco_em` passaria no teste.

**Quebra deliberada de contrato.** CPF virou **obrigatório** no cadastro, então
os 17 testes de `actions.int.test.ts` que não mandavam CPF quebraram — quebra
esperada, não regressão. Corrigidos com CPFs distintos por caso (repetir o mesmo
esbarraria em `uq_patient_clinic_cpf` e falharia pelo motivo errado). Os 3
pontos de E2E que preenchem o formulário também foram atualizados. Inserts
diretos de `patient` nos testes de RLS seguem válidos: a obrigatoriedade é da
camada de aplicação, a coluna é nullable no banco (paciente já cadastrado antes
desta migração continua sem CPF).

**Pendências que esta sessão NÃO fechou:**

1. **`CPF_HASH_SALT` em produção.** Sem ela o cadastro de paciente lança. Tem de
   ser provisionada no Easypanel **antes** do deploy desta branch, e o valor tem
   de ser estável para sempre — trocar o salt invalida todos os `cpf_hash` já
   gravados e zera a trava anti-fraude em silêncio.
2. **Leitura do advogado sobre o texto legal novo.** O advogado validou a
   _coleta_ de CPF; o texto das seções foi escrito depois disso, com
   autorização do Rômulo, e sobe como versão `2026-08-07` dos dois documentos.
   O ponto a conferir com ele está dito no próprio documento: é a **primeira
   vez que o Iris figura como controlador** de dado originado do paciente
   (Política, seção 2.1, legítimo interesse). Ficaram dois `⟨PENDENTE⟩` novos
   lá: teste de proporcionalidade (Art. 10) e prazo de conservação do
   `cpf_hash`.

   Descoberta colateral: os Termos prometiam o período de teste **sem
   ressalva**, e o produto passou a poder negá-lo. Cláusula 7.2 agora diz
   "uma vez por pessoa, não por conta" — sem isso, contrato e entrega
   divergiriam, que é exposição de CDC (o mesmo erro corrigido em 04/08/2026,
   #163).

3. **Sem caminho de edição de CPF.** Deliberado: as colunas novas não ganharam
   `GRANT UPDATE` (o `UPDATE` de `patient` é coluna a coluna desde a `0044`).
   Erro de digitação hoje só se corrige pela role dona.

---

## 🏁 Sessão 07/08/2026 — #221 fechada: o vermelho crônico de `listarTerapeutas` era o teste, não a query

O vermelho de `db/tests/agenda2-janela-actions.int.test.ts` estava registrado
como falha pré-existente desde a Fatia 2, com o diagnóstico invertido: "a lista
inclui o coordenador, que a asserção espera excluir" descreve o sintoma como se
a query estivesse errada. Não estava. O commit `eddbf5d` ("filtro de
disciplinas da equipe e coordenador em agendamentos") **ampliou de propósito**
`listarTerapeutas` — de `eq(userRole.papel, "terapeuta")` para
`inArray(userRole.papel, ["terapeuta", "coordenador"])`, e de `.select` para
`.selectDistinct`. O `expect(...).not.toContain(U_COORD_A)` simplesmente ficou
para trás.

A regra de produto por trás disso: **em clínica pequena quem coordena também
atende**. Fora dessa lista o coordenador não tem janela de trabalho e não recebe
alocação na agenda — ou seja, "corrigir" a query para o que o teste pedia
apagaria metade da capacidade de atendimento das clínicas menores.

**Lacuna fechada junto, que ninguém cobria:** a PK de `user_role` é
`(user_id, clinic_id, papel)`, então **papel duplo na mesma clínica é possível**
— é exatamente por isso que `eddbf5d` trocou `select` por `selectDistinct`.
Nenhum teste do repo tinha fixture de usuário com dois papéis, então essa metade
do comportamento nunca foi exercida. Agora tem (`U_DUAL_A`).

**Verificação — medida, não lida:**

- **Cheque de mutação nas duas metades, uma mutação por teste, sem
  sobreposição:** revertendo `inArray` para `eq(..., "terapeuta")` → falha
  `listarTerapeutas retorna terapeutas e coordenadores da clínica`; revertendo
  `selectDistinct` para `select` → falha `listarTerapeutas não duplica quem
acumula os dois papéis`. Sem esse cheque os dois testes novos passariam
  também contra a query antiga.
- Arquivo isolado: **5/5**. `pnpm typecheck` limpo.
- Suíte `pnpm test:rls` completa: **756/756, 90/90 arquivos, zero vermelho** —
  primeira vez em semanas. O número só fecha depois de repor à mão as 3 famílias
  de protocolo que faltavam no banco local (ver #222 abaixo); a suíte roda verde,
  mas a base local ainda precisa desse conserto até a #222 fechar.
- `pnpm lint`: os mesmos **2 erros pré-existentes** em
  `agenda/semana/combobox-entidade.tsx:52` e `popover-alocar.tsx:98`
  (`setState` síncrono em efeito), arquivos que este diff não toca.

Diff: só `db/tests/agenda2-janela-actions.int.test.ts` (+22/−6). **Nenhuma
mudança de código de produção** — o que é o resultado esperado quando a falha
está no oráculo, não no sistema.

### Achado lateral, virou #222 — catálogo de famílias de protocolo truncado por outro teste

Não é regressão deste diff.
`src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo.int.test.ts` falha no
**setup**, com
`PostgresError: insert or update on table "protocol" violates foreign key constraint "protocol_familia_protocol_familia_catalogo_id_fk"`.

Medido: a migração `0001_rls.sql:244-248` semeia **4** famílias; o banco local
tinha **2** — `aba_marcos_desenvolvimento` e `vbmapp-e`, sendo que `vbmapp-e`
**não existe no seed**, foi inserida por um teste. Ou seja, algum dos 10
arquivos que mexem em `protocol_familia_catalogo` trunca o catálogo e repõe só o
que ele mesmo precisa. Prova: repondo as 3 famílias faltantes, o arquivo passa
**11/11** sem alterar uma linha de código. Falha igual rodando sozinho — o
estado sujo **persiste no banco entre execuções**, que é o que torna isso caro
de diagnosticar.

Nota para quem for pegar a #222: esta é uma causa **diferente** da já registrada
antes para o mesmo arquivo (o bug de fuso das 21h–0h de Brasília). Mesmo arquivo
vermelho, dois motivos independentes.

#### ✅ Fechado (09/08/2026) — os dois culpados eram nomeáveis

Os arquivos eram `duvidas/actions.int.test.ts:51` e `validacao/actions.int.test.ts:63`:
ambos listavam `protocol_familia_catalogo` no próprio `TRUNCATE ... CASCADE` e
repunham só a família sintética que usavam (`vbmapp-e` / `vbmapp-d`). As 4
famílias do seed sumiam **permanentemente** — nada as repõe, nem re-rodar as
migrações, que já estão aplicadas.

Fix em três camadas, deliberadamente redundantes porque nenhuma basta sozinha:

1. **Causa:** o catálogo saiu dos dois `TRUNCATE`. É dado de referência da
   migração, não fixture.
2. **Regressão:** guard estático `db/tests/no-truncate-reference-data.test.ts`
   varre todo `*.test.ts` e falha se um TRUNCATE citar tabela de referência.
   Roda no `pnpm test` (não lê banco) — se só rodasse no `test:rls`, dependeria
   do ambiente que ele existe para proteger. Tem auto-teste do próprio detector,
   senão um regex quebrado sairia verde sem checar nada.
3. **Banco já sujo:** o `globalSetup` repõe o seed antes de qualquer arquivo, via
   `db/tests/reference-data.ts`. Sem isto a única saída para uma base local já
   estragada seria dropar o banco.

E `protocolo.int.test.ts` passou a semear as famílias de que depende
(`ON CONFLICT DO NOTHING`), em vez de assumir que o seed continua lá — padrão que
`src/db/rls.int.test.ts:108` já usava e que agora é a regra.

Verificação: guard vermelho antes do fix nomeando os 2 arquivos, verde depois.
`pnpm test:rls` completo **795/795 em 215 suítes**, rodando contra o banco local
**ainda sujo** (era o que provava a camada 3). `pnpm test` unit **938/938**.
`pnpm typecheck` limpo, `eslint` limpo nos arquivos tocados.

Sobra conhecida, aceita: as famílias sintéticas dos testes (`vbmapp-d`,
`vbmapp-e`, `fam-1`…) acumulam no catálogo local. São **aditivas** — a FK só
exige que a linha-pai exista —, então não quebram ninguém. Limpá-las exigiria
justamente o DELETE que esta issue proíbe.

---

## 🏁 Sessão 07/08/2026 — #215 fechada: `app_conta_somente_leitura()` falha aberta com GUC inválido (abre D16 e D17)

Migração **`0082_conta_somente_leitura_guc_invalido.sql`** (à mão, `when` =
anterior + 1000). Com `app.clinic_id` presente e não-UUID — string vazia (o que
sobra quando alguém "limpa" o tenant), lixo, UUID truncado — a função estourava
`invalid input syntax for type uuid` (**22P02**). Como ela é chamada de dentro
do trigger `app_barreira_somente_leitura`, a exceção **não fica na sonda**:
aborta a transação de escrita inteira, em clínica pagante, por um GUC
malformado. E é o oposto da decisão da `0073` — tenant não resolvível tem que
falhar **aberto**, senão o webhook que promove a assinatura para `active` (a
única saída do bloqueio) fica trancado e a conta segue em somente-leitura
**depois de pagar**.

**Dois achados mudaram o desenho do fix:**

1. **O guard já estava no arquivo e nunca chegou no banco.** O
   `CASE ... ~ '^[0-9a-fA-F]{8}-...'` foi escrito editando a `0073` **no lugar**
   (`b53b294`), depois de ela já ter sido aplicada — junto com os `GRANT EXECUTE`
   para `iris_auth`. Drizzle não reexecuta tag já registrado: sem erro, sem
   aviso. Dev e CI (base do zero) tinham o guard; produção, não. Virou **D17**.
2. **Só o guard não resolvia.** Medido em `pg_policies`: `clinic_read` é
   `id = current_setting('app.clinic_id')::uuid`, sem `missing_ok`. Sob
   `app_role`, o `FROM clinic` da própria função dispara a policy e o 22P02 vem
   **dela**, antes de o `CASE` decidir qualquer coisa. Guard interno que ainda
   assim toca a tabela é guard que não guarda. As outras 42 policies no mesmo
   padrão viraram **D16**.

Desenho final: helper `app_clinic_id_atual()` (`missing_ok` + regex, `NULL` em
vez de exceção) e a função reescrita em **plpgsql** para curto-circuitar —
`cid IS NULL → RETURN false` **sem tocar** `clinic`/`subscription`. Regra de
negócio idêntica à `0073`, linha por linha (inclusive a folga de `+ 1 day` que a
mantém mais permissiva que `src/lib/trial.ts`). Segue **sem `SECURITY DEFINER`**
(`prosecdef = false` medido nas três funções).

**Verificação — medida no banco, não lida no diff:**

- **Cheque de mutação:** com a função revertida à versão pré-fix no Postgres
  local, o caso 10 novo falha com `{vazio, lixo, truncado} = 'erro:22P02'`.
  Depois da `0082`, os três dão `false`.
- Suíte `pnpm test:rls`: **754/755**, e o único vermelho é o pré-existente
  `agenda2-janela-actions` (registrado abaixo, não deste diff). O outro vermelho
  crônico registrado abaixo — `conta-somente-leitura-rls → sem GUC de tenant a
função devolve false` — **passou a verde**: era a mesma causa raiz.
- `pg_proc`/`has_function_privilege`: `prosecdef = false` nas três, `EXECUTE`
  para `app_role` e `iris_auth` nas três, `PUBLIC` revogado.

`pnpm typecheck` limpo. `pnpm lint`: 2 erros pré-existentes em
`agenda/semana/combobox-entidade.tsx:52` e `popover-alocar.tsx:98`
(`setState` síncrono em efeito), ambos em arquivos que este diff não toca.

---

## 🏁 Sessão 07/08/2026 — #216 improcedente: o critério (c) já não existe na apuração viva (fecha D15)

A issue pedia congelar o critério (c) (`arquivado_em IS NULL`) no fim do ciclo,
com fix pronto: `arquivado_em IS NULL OR arquivado_em >= v_fim`. **O fix não tem
onde ser aplicado.** O D15 foi escrito lendo a `0071:320`, mas a `0075` fez
`CREATE OR REPLACE` de `billing_apurar_ciclo` e trocou o critério inteiro por
(a)+(b) da DECISÃO 8 — sem nenhuma referência a `arquivado_em`.

**Verificado medindo, não lendo o diff** (`pg_proc`, banco local com as 80
migrações aplicadas):

```sql
SELECT prosecdef, prosrc LIKE '%arquivado_em%'
  FROM pg_proc WHERE proname = 'billing_apurar_ciclo';
-- t | f
```

Consequências registradas:

- **Aplicar o fix seria regressão de produto**, não correção: reintroduziria o
  critério (c) que a DECISÃO 8 (04/08) removeu de propósito. A clínica em recesso
  voltaria a ser cobrada, contrariando `docs/produto/modelo-de-negocio.md:169-185`.
- **A apuração já é congelada.** Todo predicado da função compara timestamp
  contra `[v_inicio, v_fim)`; a fresta entre o fim do ciclo e o tick de 1h de
  `fecharCiclosVencendo` não muda resultado nenhum. A varredura da `0080` também
  não: ela só escreve `patient.arquivado_em`, coluna que a apuração não lê.
- **Trava de regressão adicionada** em `db/tests/billing-apuracao.int.test.ts`,
  para que a propriedade seja falseável e ninguém reintroduza (c) por engano em
  qualquer das duas direções.
- **Resíduo consciente, fora do escopo desta issue:**
  `src/app/(admin)/benjamin/queries.ts:143` e `:208` contam
  `arquivado_em is null` **no agora** para o MRR do backoffice. É termômetro, não
  fatura, e o próprio arquivo documenta isso em `:17-45` — mas o número diverge
  da soma das faturas depois de cada varredura de 90 dias.

**Lição operacional (nova):** `git log` e o diff de uma migração não dizem qual é
o corpo vivo de uma função quando outra migração fez `CREATE OR REPLACE` depois.
Antes de abrir débito citando `NNNN:linha` de uma função, conferir em `pg_proc`.
Mesma família do precedente "migração commitada não é migração aplicada" (#165).

---

## 🏁 Sessão 07/08/2026 — #174 fechada: varredura de 90 dias + UI de arquivamento (fecha D4 e D6)

Fecha os dois débitos que sobraram da PR #177: a régua de inatividade nunca
rodava sozinha (D4) e não havia tela para arquivar, desarquivar ou sequer
**saber** que um paciente voltou a contar na fatura (D6).

**A decisão que destravou D4 — "última atividade" tem uma definição só.**
O débito estava parado porque a definição decide o que a clínica paga. A saída
não foi escolher a "melhor" régua: foi **copiar a de `billing_apurar_ciclo`
(0071)** — `session` (agendada/check-in/criação), `session_note`, `evidence`
aprovada e `patient.criado_em`. Duas réguas divergentes arquivariam paciente
que a clínica ainda paga, ou o contrário; a divergência é o defeito, não a
escolha.

**A varredura é do banco (`0080`), não do TypeScript.** Cruza todas as clínicas
numa passada, logo não passa por `withTenant` e não existe GUC `app.clinic_id`
para policy nenhuma avaliar → `SECURITY DEFINER`, mesmo idioma de
`app_escalonar_risco_vencidos` (0049). A função **nunca recebe `clinic_id`**: o
tenant sai sempre da própria linha de `patient`, então não há caminho para
forjar tenant chamando-a. Role `iris_arquivamento` sem `SELECT` em tabela
alguma — credencial de job vazada não lê paciente nem diário.

**Dias civis, não `age()`.** Aritmética crua faz o resultado depender da hora:
a varredura da manhã veria 82 onde a da tarde vê 83. Truncar para data UTC
antes de subtrair torna a régua invariante por hora do dia — e idêntica à regra
pura de `src/lib/jobs/auto-arquivamento.ts`, cuja paridade tem teste.

**Janela do aviso fechada em cima, `[83, 90)`.** Fosse `>= 83`, todo paciente
parado geraria uma linha de aviso a cada varredura — e `audit_log` é
append-only e imutável para `app_role`, então lixo ali ninguém apaga depois. A
deduplicação ancora na **última atividade**, não em "existe algum aviso":
atividade nova reinicia o relógio, e aí um aviso posterior é legítimo.

**Sessão futura dá `dias` negativo, e está certo.** Paciente com consulta
marcada está ativo; número negativo não cruza nenhum dos dois limiares. Não
foi "corrigido" com `GREATEST(0, …)` — isso viraria agendamento futuro em
inatividade de zero dias, que é atividade de hoje por acidente.

**Testes:** 20 casos de integração com data **injetada** (`p_agora`), com a
fronteira exercitada em 82/83/89/90/91 e **dois testes de mutação** que variam
`p_dias_arquivamento` para 89 e 92 — a suíte falha se a janela escorregar. Mais
9 casos no `.mjs` (incluindo paridade da régua com o TS), 8 de integração das
Server Actions e 5 do diálogo.

**Item (g) da issue — "métrica de alerta: registro para paciente arquivado".**
Entregue como **mecanismo**, não como painel: registrar diário/sessão
**desarquiva automaticamente** (`app_desarquivar_paciente`, 0067) e grava
`paciente_desarquivado_automaticamente` na trilha, que a faixa da ficha lê.
Isso remove o incentivo na origem em vez de contá-lo depois. Dashboard agregado
fica de fora porque **não existe superfície de painel no produto hoje** — quando
existir, a trilha já tem o dado.

**Aberto:** D7 (áudio/`evidence` não desarquivam) e D8 (terapeuta de cobertura
não desarquiva) foram assumidos inicialmente e ambos resolvidos/fechados em 11/08/2026 (#174).

---

## 🏁 Sessão 06/08/2026 — Prescrição de horas vira pilar mestre; equipe passa a consumir saldo (#203)

Refino do `docs/implementation_plan.md` por **jornada** (não por tela) e
implementação da **fatia 1**. A dupla Disciplina + Horas passa a ser soberana,
mora na ficha clínica com vigência, e a equipe consome esse saldo. Protocolo
estruturado vira sub-encaixe **opcional** por disciplina.

### Decisões clínicas travadas (não reabrir sem novo motivo)

- **D-A · Quem sai do time perde acesso na hora, sem carência.** Verificado por
  medição, não por leitura: `app_is_on_team` (`0001_rls.sql:37-46`) já filtra
  `vigencia_fim IS NULL` e governa a leitura de todas as tabelas clínicas.
  **Nada a implementar na RLS** — o trabalho é de UI (confirmar antes de
  encerrar, dizer no toast que o acesso foi cortado).
- **D-B · `substituto` CONSOME saldo.** Hora entregue é hora entregue: a família
  recebeu e o convênio conta. A barra responde "a prescrição está sendo
  entregue?", não "quem é o titular".
- **D-C · `coordenador_referencia` NÃO consome — é gestão.** O **papel** define o
  consumo, nunca a pessoa: coordenador que também atende ganha um **segundo
  vínculo** como `terapeuta_referencia`. Consequências de modelagem: o índice
  único parcial inclui `papel_na_equipe`, e horas em papel de gestão são
  **proibidas por CHECK**.
- **D-D · Horas obrigatórias** em vínculo novo de papel que consome. Validação de
  **aplicação**, não `NOT NULL` — a coluna precisa aceitar NULL pelo legado e
  pela gestão.
- **D-E · Hora se exibe como tempo, não como decimal de planilha:** `30min`,
  `1h`, `1h30`, `20h`. Nunca `2,0h`. Formatador único em `src/lib/horas.ts`; o
  decimal segue sendo só armazenamento/cálculo (`numeric(4,1)`).

### Fatia 1 entregue e verificada por medição

Migração `0076` (à mão, `when` = anterior + 1000): coluna `horas_semana` nullable,
CHECK de passo/teto **nos dois lados da conta** (`patient_alvo_disciplina` estava
sem constraint nenhuma — dava para prescrever `0,3h` e nunca alocar contra isso),
CHECK `ctm_gestao_sem_horas`, índice único parcial `ctm_unico_vigente` e
`GRANT UPDATE (horas_semana)` (a `0044` revogou UPDATE de tabela; coluna nova não
herda nada). Mais `src/lib/horas.ts` como fonte única de formato, passo e
`PAPEIS_QUE_CONSOMEM_SALDO`.

Verificação: **21/21 asserções medidas** no Postgres (`information_schema`,
`pg_constraint`, `pg_indexes`, `has_column_privilege` e `BEGIN … ROLLBACK`
exercitando cada CHECK), mais 40 testes unitários e 15 de integração.

### Achados que o plano anterior não cobria

- **Sem índice único**, duplo-clique no submit vira **dupla contagem de carga** —
  barra estoura sem causa visível.
- **TOCTOU** na validação de saldo: duas alocações simultâneas de 6h passam
  contra 8h restantes. Fatia 4 resolve com `SELECT … FOR UPDATE` do alvo vigente
  - insert na mesma transação.
- **Sobrealocação é derivada, nunca coluna** — flag persistida diverge do fato
  assim que alguém encerra um vínculo por outro caminho.
- Remover disciplina/horas de `/pacientes/novo` sem handoff cria **beco sem
  saída**: paciente incompleto e silencioso. Daí redirect, banner e selo
  `Sem prescrição`.

### ⚠️ Falhas pré-existentes encontradas em `pnpm test:rls` (não deste diff)

Confirmadas por `git stash` — falham igual sem nenhuma alteração desta sessão:

- `agenda2-janela-actions` → `listarTerapeutas retorna o terapeuta da clínica`:
  a lista inclui o coordenador, que a asserção espera excluir. **Resolvido em
  07/08/2026 (#221)** — não havia bug na query: a asserção é que ficou
  desatualizada em relação ao commit `eddbf5d`, que ampliou `listarTerapeutas`
  de `eq(papel, "terapeuta")` para `inArray(papel, ["terapeuta",
"coordenador"])` de propósito. O teste foi reescrito para a regra vigente —
  ver a sessão no topo.
- `conta-somente-leitura-rls` → `sem GUC de tenant a função devolve false`:
  `invalid input syntax for type uuid: ""` — `app_conta_somente_leitura()`
  estoura no cast em vez de falhar fechado, que é exatamente o que o teste
  existe para provar. **Resolvido em 07/08/2026 pela `0082` (#215)** — ver a
  sessão no topo; a causa raiz estava na policy `clinic_read`, não só na função.

Ficam registradas aqui porque **suíte vermelha crônica é o caminho mais curto
para vermelho novo passar despercebido**.

### Fatia 2 entregue — prescrição na ficha clínica + handoff 1

Migração `0077` (à mão, `when` = anterior + 1000), fechando o lado do **teto**:

- **`patient_alvo_unico_vigente`** — o `idx_patient_alvo_vigente` **não era
  unique** (medido, não deduzido): nada impedia duas prescrições vigentes da
  mesma disciplina, e o teto virava sorteio de qual linha a query pegasse. É o
  espelho exato do `ctm_unico_vigente` do lado do consumo. O índice antigo foi
  derrubado (mesma chave, mesmo predicado — manter os dois pagaria escrita
  dobrada sem ganho de leitura).
- **`REVOKE UPDATE` de tabela + `GRANT UPDATE (vigencia_fim)`** — numa tabela
  SCD2, `UPDATE` de tabela permitia reescrever `horas_alvo_semana` no lugar e
  destruir o histórico que o convênio audita. Mesmo padrão da `0044`.
- **`REVOKE DELETE` + `DROP POLICY` de delete** (decisão do Rômulo, 06/08/2026):
  prescrição vira append-only de verdade. A policy cai junto para não ficar
  órfã convidando alguém a reconceder o grant achando que a barreira seguia
  de pé.

Aplicação: `prescricao-logic.ts` (SCD2 — fecha vigência e abre linha nova, as
duas datas do mesmo `now() AT TIME ZONE 'America/Sao_Paulo'`, na mesma
transação), seção de prescrição na ficha clínica, e o handoff 1 completo
(cadastro deixou de prescrever · redirect para `#prescricao` · banner de
continuidade · selo `Sem prescrição` na lista, **derivado na leitura**).

Dois achados que mudaram código durante a verificação:

- **`SELECT … FOR UPDATE` não serve nesta tabela.** O row lock do Postgres exige
  `UPDATE` em **nível de tabela**, e a `0077` passou a conceder por coluna — o
  `FOR UPDATE` do plano §4.4 falharia como `permission denied for table
patient_alvo_disciplina`. Serialização feita com `pg_advisory_xact_lock`, que
  não depende de privilégio de tabela e morre com a transação. **A fatia 4
  precisa disso**: o plano prevê `FOR UPDATE` do alvo vigente para o TOCTOU da
  equipe, e esse caminho está fechado.
- **`horas-queries.ts` contava prescrição fechada.** O filtro era
  `vigencia_fim IS NULL OR vigencia_fim >= hoje`; represcrever fecha a linha
  antiga hoje e abre a nova hoje, então as duas casavam e o alvo ficava com a
  que o Postgres devolvesse por último. Trocado por `IS NULL` — o mesmo critério
  do `app_is_on_team` e de todo o #203.

Verificação: 12 asserções de DDL medidas no Postgres (`pg_indexes`,
`has_column_privilege`, `has_table_privilege`, `pg_policies`) + 14 de integração
da jornada. `pnpm test` 917/917; `test:rls` só com as **duas falhas
pré-existentes** acima.

### ✅ `0076` e `0077` verificadas EM PRODUÇÃO por medição (06/08/2026)

`db/verificacao/0076-0077-pos-deploy.sql` rodado pelo Rômulo contra o Postgres
de produção depois do implante: **13/13 PASSOU** — coluna, os três CHECKs, os
dois índices únicos parciais, o drop do índice antigo, os grants de coluna e as
**negativas** (`UPDATE` de tabela e `DELETE` revogados em
`patient_alvo_disciplina`, policy de delete derrubada).

As negativas são o ponto: um grant que sobrou não denuncia a si mesmo, e é
exatamente aí que um deploy parcial se esconderia. Fica registrado aqui porque
o precedente da `0055` foi uma issue fechada olhando o diff, com a falha viva em
produção (#165).

### Fatia 3 entregue — protocolo vira encaixe opcional da disciplina prescrita

**Sem migração.** O que faltava não era coluna: era a seção de protocolo parar de
viver em paralelo à prescrição e passar a ser sub-encaixe dela.

Decisões desta fatia (confirmadas com o Rômulo, 06/08/2026):

- **Saiu o rádio "Terapia Convencional × Protocolos de Marcos".** Ele guardava em
  `useState` uma escolha que o banco não registra — ao recarregar, o modo era
  reconstituído pela existência de vínculo, então o controle **mentia sobre ser
  uma decisão**. A ausência de protocolo já significa acompanhamento narrativo; o
  que faltava era dizer isso em texto, não pedir de novo.
- **Protocolo de disciplina não prescrita não é oferecido nem aceito.** O
  catálogo passou a ser agrupado por disciplina prescrita vigente. O guard vive
  no **núcleo** (`protocolo-logic.ts`), não no dropdown: Server Action é
  endpoint, e uma aba aberta desde antes de a prescrição ser encerrada continua
  chamando.
- **Vínculo órfão ganha bloco `Fora da prescrição atual`**, mesmo tratamento que
  o plano §3.1 deu ao membro de equipe fora da prescrição. Esconder produziria
  linha viva no banco que ninguém enxerga nem consegue desvincular pela UI.
- **Encerrar prescrição NÃO desencaixa protocolo** — seria efeito colateral
  clínico não pedido num ato que já é auditável por si.

Três defeitos pré-existentes que a fatia fechou de passagem:

- **Toda recusa era engolida.** As actions de protocolo retornavam `void` e
  descartavam o `{ error }` do núcleo: erro de papel, de conta em somente-leitura
  ou de vínculo já desfeito revalidavam a página sem uma palavra na tela.
  Passaram a `useActionState`.
- **`ativarProtocolo`/`desativarProtocolo` não passavam pelo `comEscrita`** —
  conta em somente-leitura (#163+#159) escrevia protocolo.
- **Duplo-clique criava dois vínculos vigentes** do mesmo protocolo. Advisory
  lock de transação + checagem de idempotência (já ativo devolve `ok`, não erro).
  Sem isso o segundo vínculo ficava vivo e **invisível**, porque a tela deduplica.

Verificação: 9 testes unitários do agrupamento puro + 8 de integração;
**7 dos 8 de integração falham contra o código anterior** (o único que passa é o
caminho feliz, que já existia), e o agrupamento foi checado por mutação. `pnpm
test` 926/926 · `typecheck` limpo · `lint` com os **mesmos 2 erros
pré-existentes** de `agenda/semana` (confirmados por `git stash`) · `test:rls`
só com as **duas falhas pré-existentes** acima.

#### Revisão da PR #205 — 7 achados fechados na própria branch

O mais grave reabria a classe de bug que a fatia dizia fechar: **o bloco `Fora
da prescrição atual` era derivado do catálogo**, e o catálogo é deduplicado por
`nome` em `obterOuInicializarProtocolosDaClinica`. Duas linhas `protocol` de
mesmo nome fazem um id sumir da lista, e o vínculo vigente apontando para ele
não aparecia em grupo nenhum **nem** no bloco de órfãos — linha viva no banco,
invisível e sem como desencaixar. Passou a ser derivado dos **vínculos**, com
cartão degradado quando o protocolo não está no catálogo.

Os outros seis:

- `desativarProtocolo` não filtrava por paciente — a RLS enxerga a clínica
  inteira, então um id de vínculo de outro paciente desativava a linha e
  revalidava a página errada. `patientId` entrou no predicado e na assinatura.
- Prescrições vigentes que diferem só em caixa/espaço (o índice único da `0077`
  é sobre a coluna crua) rendiam **dois grupos idênticos**: chave React repetida
  e dois cartões comandando o mesmo vínculo. Agrupamento passou a deduplicar por
  chave normalizada.
- O advisory lock **não era exercitado por teste** — o caso de duplo-clique era
  sequencial e passava só com a checagem de idempotência. Entrou um caso com
  duas ativações em `Promise.all`.
- O `comEscrita` das duas actions **não tinha teste**: remover o wrapper deixava
  a suíte verde. Entrou um caso com `subscription` em `canceled`.
- `obterOuInicializarProtocolosDaClinica(tx: any)` devolvia `any` até a tela;
  agora é `Tx` → `Promise<ProtocoloCatalogo[]>`.
- O SQL de verificação buscava objeto sem qualificar schema (`search_path`
  decidia). Homônimo em outro schema daria `PASSOU` falso — num arquivo que
  existe justamente para não deixar ninguém _achar_ que mediu.

Depois dos ajustes: 11 unitários do agrupamento + 11 de integração de protocolo
verdes, `typecheck` limpo, `eslint` limpo no diretório tocado, e `test:rls`
678 casos com **as mesmas duas falhas pré-existentes** (`agenda2-janela-actions`
e `conta-somente-leitura-rls`).

### Fatia 4 entregue — a equipe passa a CONSUMIR o saldo prescrito

**Sem migração.** A `0076` já tinha posto coluna, CHECKs, índice único parcial e
grant; o que faltava era a aplicação passar a usá-los. Até aqui a tela de equipe
aceitava disciplina em texto livre e nenhuma hora — dava para alocar 40h de Fono
num paciente com 8h prescritas e nada avisava.

O que mudou de natureza:

- **Disciplina deixou de ser texto livre.** O dropdown lista só prescritas
  vigentes e a opção `Outra` + campo livre **saiu**; no lugar entra o link
  `Prescrever outra disciplina →`. O servidor confirma contra o banco, não
  contra o form — e grava a **grafia prescrita**, não a que veio do cliente,
  senão `"fonoaudiologia"` alocado contra `"Fonoaudiologia"` prescrito partiria
  o saldo em dois em silêncio.
- **Horas obrigatórias em papel que consome (D-D) e proibidas em
  `coordenador_referencia` (D-C).** O campo some no papel de gestão em vez de
  ficar desabilitado — desabilitado sem explicação ocupa espaço e não diz o que
  fazer.
- **Edição de vínculo vigente** (`editarMembroEquipe`), que não existia. Sem
  ela, corrigir 8h digitadas como 18h exigiria encerrar o vínculo — e encerrar
  **corta o acesso ao prontuário na hora** (D-A) e registra no histórico uma
  saída que nunca aconteceu. Erro de digitação não pode custar evento clínico
  falso.
- **Estado vazio MV2**: sem prescrição, o formulário fica **oculto** (não
  desabilitado) e a tela mostra `Ir para a prescrição →`.
- **Três blocos na lista**, porque são três coisas diferentes: quem entrega a
  carga, `Gestão do caso` (fora da conta, D-C) e `Fora da prescrição atual`
  (legado). Mais o chip `Horas não definidas` — vínculo legado sem carga é
  dívida **visível**, senão a barra afirma 8h/20h enquanto cinco terapeutas
  atendem.

Decisões de implementação que valem registro (divergem do plano por medição):

- **O lock é `pg_advisory_xact_lock`, não `SELECT … FOR UPDATE`** como o plano
  §4.4 previa. Motivo medido na fatia 2 e válido aqui também: o row lock exige
  privilégio de UPDATE em **nível de tabela**, e tanto a `0044` (equipe) quanto a
  `0077` (prescrição) revogaram UPDATE de tabela e concedem coluna a coluna — o
  `FOR UPDATE` falharia com `permission denied for table …`. A chave é a **mesma**
  de `prescricao-logic.ts` (`patientId:disciplina`, namespace 203) de propósito:
  represcrever e alocar ao mesmo tempo também é corrida.
- **Edição trava as DUAS disciplinas em ordem alfabética.** Alterar disciplina
  move carga entre dois saldos; sem ordem determinística, uma transação pegando
  Fono→TO e outra TO→Fono deadlockam.
- **`ignorarMembershipId` na validação compartilhada.** Sem ele, editar as
  próprias 8h para 10h contaria as 8h antigas junto (18 contra 10) e recusaria
  alteração cabível.
- **O Drizzle embrulha o erro do driver.** `DrizzleQueryError` guarda o
  `PostgresError` em `cause`, então checar `code === '23505'` só no topo devolve
  `false` sempre — o duplo-clique, que é o caso comum, chegaria como 500 em vez
  da frase amigável. A cadeia de `cause` é percorrida. **Este bug passou verde
  na primeira rodada e só apareceu porque o teste de duplo-clique existia.**
- **`calcularCobertura` é módulo puro** (`equipe/cobertura.ts`), usado pela tela
  e pela validação. Duplicar a agregação faria o coordenador ler "restam 8h" e
  receber recusa ao alocar 8h. A fatia 5 renderiza esta saída sem recalcular.
- **Encerrar filtra `vigencia_fim IS NULL` no `WHERE`**: sem isso, reencerrar
  moveria a data de saída de quem saiu em março para hoje.

Verificação: 17 testes de integração da equipe + 15 unitários de cobertura,
todos verdes. `pnpm test` 942/942 · `typecheck` limpo · `lint` e `test:rls` com
**exatamente as mesmas falhas pré-existentes** já registradas acima (confirmado
por `git stash`).

### Fatia 5 — barra de cobertura nos 4 estados, a11y e copy (PR #207)

**Sem migração e sem conta nova.** A fatia 4 já deixava `calcularCobertura`
devolvendo os quatro estados; o que faltava era a barra deixar de ser um cartão
de texto e virar um `progressbar` de verdade, com a copy de MV3 fechada.

O que entrou:

- **`BarraCobertura`** (`equipe/barra-cobertura.tsx`) — `Progress` +
  `StatusBadge` do design system, um por disciplina prescrita. **Não recalcula
  nada**: consome a saída de `calcularCobertura`, a mesma que valida o saldo no
  servidor. Barra que fizesse a própria conta diria "restam 8h" e o servidor
  recusaria alocar 8h.
- **A copy virou função pura** (`textoCobertura`, `textoVinculosSemHoras`,
  `ROTULO_ESTADO` em `cobertura.ts`). A frase de MV3 é a mesma coisa que o
  `aria-valuetext`: **o que se ouve é o que se lê**, por construção, não por
  disciplina de quem edita. E, morando fora do componente, a diferença entre
  "restam 8h" e "sobrealocação de 5h" — que é clínica — tem teste sem DOM.
- **Estado nunca depende de cor** (§MV3, princípio de acessibilidade do
  produto): aparece no selo (texto + ícone), na frase por extenso e no
  `aria-valuetext`. A cor da barra é a quarta via, redundante de propósito.
- **>100% satura a régua em 100 e diz a verdade no texto.** `aria-valuemax` é
  100; deixar `aria-valuenow` em 125 entregaria ao leitor de tela um valor fora
  da faixa declarada. O excedente e a **instrução de saída** ("Reduza as horas de
  um membro ou aumente a prescrição") são parte da frase — sobrealocação não
  trava a tela, então o caminho de volta precisa estar escrito onde o problema
  aparece. Mais um resumo no topo do bloco, porque num paciente com muitas
  disciplinas a linha sobrealocada pode estar fora da dobra.
- **Design system ganhou duas variantes**, e nenhuma delas é decoração:
  `Progress` passou a aceitar `variante` (`acao` — default histórico, `neutro`,
  `atencao`, `sucesso`, `erro`) porque quatro estados na mesma cor seriam quatro
  estados invisíveis para quem enxerga; `StatusBadge` ganhou `error`, que não
  existia — só havia `warning` para desfecho ruim, e sobrealocação não é aviso.
- **5 stories** (`barra-cobertura.stories.tsx`), incluindo o vínculo legado sem
  horas. Nenhuma story escreve número à mão: todas montam o dado por
  `calcularCobertura`, senão o Storybook viraria documentação que mente sobre o
  produto quando a regra mudar.

Verificação — **mutação rodada, não presumida**: apagando a instrução de saída de
`textoCobertura` e o `aria-valuetext` do componente, 4 testes caem, e o
`aria-valuetext` cai para o `"100%"` que o Radix gera sozinho — que é exatamente
o anúncio pobre que o teste existe para impedir. `pnpm test` **964/964**
(846 unitários + 118 de story) · `typecheck` limpo · `lint` e `test:rls` com
**exatamente as mesmas falhas pré-existentes** já registradas acima
(`agenda2-janela-actions`, `conta-somente-leitura-rls`, 2 erros de
`react-hooks/set-state-in-effect` em `agenda/semana/`).

### Fatia 6 — represcrição com confirmação (MV4) + toast de devolução (PR #208)

**Sem migração e sem regra nova.** As duas contas já existiam (`calcularCobertura`
da fatia 4, `textoCobertura` da 5); o que faltava eram os dois momentos em que o
produto precisa **falar** — antes de salvar uma redução que sobrealoca, e depois
de encerrar um vínculo.

O que entrou:

- **Confirmação ANTES, não aviso depois (§MV4).** Ao detectar no submit que a
  nova carga é menor que o alocado vigente, `prescreverDisciplina` **não salva**:
  devolve `confirmacao` (disciplina, horas atuais, horas novas, alocado, frase).
  Reduzir continua permitido — travar obrigaria a desmontar a equipe para depois
  corrigir a prescrição, ordem que a clínica não segue.
- **A frase do diálogo é a MESMA da barra**, por construção: vem de
  `textoCobertura` passando por `calcularCobertura`, não de paráfrase escrita à
  mão. Duas redações da mesma consequência divergem, e a que o coordenador lê ao
  confirmar deixaria de ser a que ele encontra na tela de destino.
- **A soma da confirmação roda sob o MESMO advisory lock da alocação**
  (`patientId:disciplina`, namespace 203) e dentro da transação que grava: entre
  ler o diálogo e clicar em "Salvar mesmo assim", o pedido é revalidado do zero.
- **Depois de confirmar, o coordenador vai para a barra da disciplina afetada** —
  `ancoraCobertura()` em `cobertura.ts` gera o `id` e o link do mesmo lugar, para
  âncora montada em dois pontos não divergir no primeiro acento. O trabalho não
  termina no salvar, termina no ajuste.
- **Encerrar vínculo agora confirma antes e explica depois (D-A + §3.3).**
  `encerrarVinculoAction` deixou de retornar `void` — o encerramento acontecia e
  a tela só piscava. Novo `EncerrarVinculoForm` pergunta antes (o corte de acesso
  ao prontuário é imediato e total) e o toast diz as **duas** consequências:
  o saldo que voltou e o acesso que caiu.
- **`saldoTexto` é lido depois do UPDATE e na mesma transação.** Fora dela, uma
  alocação concorrente faria o toast citar um saldo que nunca existiu; sem o
  filtro de vigência, o vínculo recém-encerrado voltaria para a soma e o toast
  diria que nada mudou. Em vínculo fora da prescrição (§3.1) o campo vem
  `undefined`: não há teto a nomear, e "0h de 0h" seria número inventado.

Verificação — **mutação rodada, não presumida**: removendo o filtro
`vigencia_fim IS NULL` da soma da confirmação, o caso "vínculo ENCERRADO não
conta" cai (era a sobrealocação fantasma de §4.5 aparecendo). 8 testes de
integração novos (5 de represcrição + 3 de encerramento). `pnpm test` 964/964 ·
`typecheck` limpo · `test:rls` 698 passando, `lint` e as 2 falhas restantes
**exatamente as mesmas pré-existentes** já registradas acima (confirmado por
`git stash`).

#### Revisão adversarial da PR #208 — o que ela pegou

Toda a lógica de risco da fatia estava no cliente, e os 8 testes eram todos de
servidor. Foi exatamente ali que estavam os dois bloqueantes:

- **O diálogo de confirmação existia só dentro da linha vigente.**
  `prescreverDisciplinaAction` é a mesma action do formulário de prescrição
  NOVA, que recebia `confirmacao` e não sabia lê-la: nada salvava, nada
  aparecia, o submit virava clique sem efeito — o defeito que a fatia existe
  para matar, reintroduzido no formulário irmão. E o caminho é real: encerrar a
  prescrição mantém os vínculos, prescrever de novo com carga menor cai ali.
  O diálogo virou `ConfirmarSobrealocacaoDialog`, compartilhado pelos dois.
- **O diálogo não fechava por Esc, X nem overlay.** `open` derivava de
  `state.confirmacao`, que só muda no próximo submit; `onOpenChange` não tinha
  como baixá-lo. Com o focus trap do Radix, quem navega por teclado ficava
  preso, e a única saída era um `window.location.reload()` que jogava fora as
  edições não salvas do resto do cadastro. Agora o descarte é local (guarda o
  objeto da confirmação: resposta nova reabre sozinha, sem efeito de reset).

Correções menores da mesma revisão:

- **Sem prescrição vigente, `horasAtuais` vem `undefined`** — "passa de 0h para
  10h" afirmava um teto que nunca existiu, a mesma mentira educada que o
  encerramento de vínculo já se recusava a contar.
- **O papel passou a ser filtrado por `PAPEIS_QUE_CONSOMEM_SALDO`**, não por
  exclusão de `coordenador_referencia`. Empatam com os três papéis do CHECK
  atual; um quarto papel faria a represcrição e a barra discordarem em silêncio.
- **`avisoSemHoras` acompanha a frase**: com vínculo sem horas, o diálogo
  mostrava uma frase e a barra de destino duas — divergência por omissão.
- **O lock serializa a corrida, não a detecta.** O confirm passou a ecoar
  `horasAtuaisEsperadas`; se o teto mudou enquanto o diálogo estava aberto, a
  gravação é recusada em vez de apagar a decisão do outro coordenador.
- **`isLoading` deixou de ser adorno**: os diálogos não fecham mais no `onClick`
  do submit, então o botão cobre o roundtrip inteiro e o submit não depende de
  o evento sobreviver ao unmount do próprio `<form>`.
- **A barra de destino ficou focável** (`tabIndex={-1}` + região rotulada): o
  handoff movia scroll, e scroll não é foco — quem usa leitor de tela confirmava
  a redução e continuava no contexto antigo.

Cobertura nova: 6 testes de componente (5 do diálogo + 1 que reproduz o submit
mudo da prescrição nova) e 6 de integração (recusa por teto mudado, confirm sem
o teto lido, prescrição nova sobre equipe legada, vínculo sem horas no aviso,
`substituto` na conta). `pnpm test` **970/970** · `typecheck` limpo · `lint` só
as 2 falhas pré-existentes de `react-hooks/set-state-in-effect` em
`agenda/semana/`.

#### O que só o E2E pegou (`e2e/represcricao-mv4.spec.ts`)

Dois defeitos que passavam por 970 unitários + 703 de integração, porque os dois
só existem no navegador:

- **O handoff de §MV4 nunca acontecia.** Represcrever é SCD2: fecha a linha
  vigente e insere OUTRA, com id novo. O `revalidatePath` re-renderiza a lista,
  a `key` do `<li>` muda, `LinhaPrescricao` **desmonta** — e leva junto o
  `useActionState` e o `useEffect` que fariam o `router.push`. O coordenador
  confirmava a redução e ficava parado na tela onde não há o que fazer, que é
  exatamente o "descobrir depois" que a fatia existe para eliminar. **Regra que
  fica:** navegação que segue uma gravação SCD2 não pode morar num efeito do
  componente que a gravação substitui — vai no `redirect()` do servidor.
- **"Encerrar prescrição" não encerrava** (defeito **pré-existente**, da fatia
  2). O `onClick` do submit fechava o diálogo no mesmo clique, desmontando o
  `<form>` antes do envio. Mesmo padrão que a fatia 6 tinha copiado para
  `EncerrarVinculoForm`; os dois foram corrigidos. **Regra que fica:** diálogo
  de confirmação fecha quando a action responde, nunca no `onClick` do submit.

Achados de ambiente, todos anteriores a esta PR — **levantados na #209 e
resolvidos lá** (ver seção seguinte).

### E2E: suíte volta a rodar, e não aponta mais para produção (#209)

O que mudou em `playwright.config.ts`:

- **O config carrega o env sozinho**, na ordem `shell > .env.e2e > .env`
  (`process.loadEnvFile` não sobrescreve o que já está em `process.env`, então
  carregar `.env.e2e` primeiro faz o arquivo dedicado vencer). Fim do
  `AUTH_DATABASE_URL não definida` na primeira linha e do ritual manual de
  `set -a; . ./.env.local`. Template versionado em `.env.e2e.example`.
- **Guard que recusa `baseURL` não-local**, com escape explícito
  `E2E_ALLOW_REMOTE=1`. `.env.local` desta máquina aponta para
  `https://irisclinica.ia.br`; carregá-lo para pegar o `BETTER_AUTH_SECRET`
  jogava a suíte inteira contra produção, e o único sinal era
  `INVALID_EMAIL_OR_PASSWORD` — que parece falha de seed. **Regra que fica:**
  enquanto rodar contra produção depender de ninguém esquecer um `export`, uma
  hora acontece; documentação não é trava.
- **`webServer` invoca `node ./node_modules/next/dist/bin/next start`**, sem
  passar pelo pnpm — `pnpm start` aborta quando o pnpm do PATH diverge do campo
  `packageManager` (11.16.0 × 11.11.0) e o Playwright só reporta
  `Exit code: 1`.
- **Projeto de setup `e2e/servidor.setup.ts`** roda antes de tudo e prova que
  quem atende na `baseURL` é o Iris (`/api/auth/ok` + `<title>`).
  `reuseExistingServer` reaproveita _qualquer coisa_ na porta: na sessão da
  #208 a suíte rodou contra outro projeto na 3000 e o `{"error":"Not found"}`
  do `/api/auth` parecia bug do Iris.

Specs defasados reconciliados com a UI atual: `/` é landing pública e
redireciona para `/agenda`; consentimento é `role="radio"`; submit do cadastro
é "Salvar e prescrever a carga horária"; `Conselho`/`Nº do registro`/`UF`
perderam os rótulos antigos e a UF virou `Select` (não aceita `fill`); `Senha`
casava também com o botão "Exibir senha em texto" (`exact: true`); o resultado
do reenvio aparece em Alert **e** Toast, ambos `role="status"`.

Um flake real corrigido: `cadastro-clinico.spec.ts` dava `reload()` logo após o
clique em salvar, podendo abortar a server action em voo — o campo voltava
vazio e o teste acusava "não persistiu" numa gravação que só não teve tempo de
acontecer. **Regra que fica:** esperar a confirmação antes de recarregar.

**Resultado medido:** 15 passam, 2 falham.

**Aberto (não é da #209):** `diario-demo.spec.ts` e `revisao.spec.ts` dependem
de `pnpm seed:demo` / `scripts/seed-demo.ts`, **removidos na `b53b294` (#163)**
sem que os specs fossem ajustados. Estão inrodáveis desde então. Recriar o seed
---

## 📅 Sessão 21/08/2026 — Feature #407: Anamnese Marco Zero (Sessão 0 no Espectro Brutal)

- **Status:** ✅ Concluído (34/34 tasks concluídas e validadas).
- **Objetivo:** Permitir que o coordenador registre uma anamnese inicial estruturada para pacientes em modalidade `protocol_driven`, materializando o Marco Zero (`session_numero = 0`) no `session_snapshot` e derivando metas ativas (`goal`), sem criar sessões fantasmas na agenda e sem alterar a apuração de faturamento.
- **Entregas principais:**
  - **Schema & Migrações:** Tabelas `anamnese` e `anamnese_alvo` com RLS por tenant/clínica, integridade referencial com `patient` e `goal` (`on delete set null`), constraints de procedência (`relatado_responsavel`, `observado_avaliador`, `registro_anterior`) e procedência preservada em `repertorio_state`.
  - **Funções Definidoras:** `app_salvar_rascunho_anamnese` e `app_validar_anamnese` (`SECURITY DEFINER`) com isolamento multi-tenant via `app_clinic_id_exigido()`, gates de protocolo ativo (com taxonomia >= 2 níveis), consentimento revogado / prontuário em somente-leitura e exclusividade de papel coordenador.
  - **Lógica e Server Actions:** `salvarRascunhoAnamnese`, `validarAnamnese`, e suporte a anamnese complementar com desempate determinístico (`validada_em DESC, id DESC`).
  - **Timeline e Gráficos:** Scrubber de sessões e gráfico de espectro com suporte ao ponto "Anamnese" (sessão 0), cálculo correto de delta da Sessão 1 contra a Sessão 0, chip de procedência `ProcedenciaMarcoZero` e acessibilidade `role="status"` em conformidade com o Design System.
  - **Formulário de Anamnese:** Página `/pacientes/[id]/anamnese` com controle de acesso para coordenador, teto de 24 alvos e modo somente-leitura após validação.
- **Validação e Métricas (Medido, não presumido):**
  - `pnpm typecheck`: 0 erros.
  - `pnpm lint`: 0 erros (9 warnings de eslint pré-existentes, 0 erros).
  - `pnpm test`: 239 arquivos de teste unitário passando (1.704 testes verdes).
  - `pnpm test:rls`: 119 arquivos de teste de integração/RLS passando (1.071 testes verdes).
  - `src/db/migrations.test.ts`: 8/8 testes passando com snapshot e journal íntegros.

---

## 📅 Sessão 21/08/2026 — Feature #409: Ponto de Entrada da Anamnese no Prontuário

- **Status:** ✅ Concluído.
- **Objetivo:** Adicionar a aba "Anamnese" na navegação do prontuário (`TabsNav` em `src/app/(app)/pacientes/[id]/layout.tsx`), condicionada à modalidade clínica `protocol_driven` (`temAnamnese: true` em `modalidade.ts`), posicionada após "Ficha Clínica" e antes da aba da modalidade.
- **Entregas principais:**
  - `src/app/(app)/pacientes/[id]/modalidade.ts`: Flag `temAnamnese: boolean` em `CapacidadesDaModalidade` configurada para `true` exclusivamente em `protocol_driven`.
  - `src/app/(app)/pacientes/[id]/layout.tsx`: Item condicional `Anamnese` (`/pacientes/[id]/anamnese`) exposto no `TabsNav`.
  - `src/app/(app)/pacientes/[id]/modalidade.test.ts` e `layout.test.tsx`: Testes unitários e de componente cobrindo presença e ausência da aba conforme modalidade.
- **Validação:**
  - `pnpm typecheck`: 0 erros.
  - `pnpm lint`: 0 erros (9 warnings pré-existentes).
  - `pnpm test`: 239/239 arquivos passando (1.704 testes).

---

## 📅 Sessão 21/08/2026 — Navegação: Sub-navegação de Clínica e Atalhos de Dashboards PEI/Protocolos

- **Status:** ✅ Concluído.
- **Objetivo:** Resolver rotas desconectadas e órfãs no módulo de Clínica e nos Dashboards de Protocolos e PEI.
- **Entregas principais:**
  - `src/app/(app)/clinica/layout.tsx` e `page.tsx`: Layout com `TabsNav` unificado para `/clinica/dados`, `/clinica/feriados` e `/clinica/emergencia`, além de redirect automático na raiz `/clinica`.
  - `src/app/(app)/clinica/layout.test.tsx`: Testes de layout e autorização por papel coordenador.
  - `src/app/(app)/pacientes/[id]/metas/page.tsx`: Ações no `PageHeader` com links para "Visão do PEI" (`/pacientes/[id]/pei`) e "Progresso dos Protocolos" (`/pacientes/[id]/protocolos`).
  - `src/app/(app)/pacientes/[id]/cadastro-clinico/protocolos-secao.tsx`: Botão de acesso ao dashboard de protocolos ativos.
- **Validação:**
  - `pnpm typecheck`: 0 erros.
  - `pnpm lint`: 0 erros (9 warnings pré-existentes).
  - `pnpm test`: 240/240 arquivos passando (1.706 testes).

---

## 📅 Sessão 22/08/2026 — Feature #383: Webhook Resend de Bounce/Complaint

- **Status:** ✅ Concluído.
- **Objetivo:** Criar endpoint de webhook para recebimento de eventos de entrega, bounces e reclamações de e-mails transacionais enviados via Resend, com validação criptográfica de assinatura Svix e registro em log estruturado em conformidade estrita com a LGPD (zero vazamento de dados de destinatário, assunto ou conteúdo).
- **Entregas principais:**
  - `src/lib/email/webhook.ts`: `processarWebhookResend` — validação de assinatura Svix (`svix-id`, `svix-timestamp`, `svix-signature`) contra `RESEND_WEBHOOK_SECRET` e tratamento dos eventos `email.bounced`, `email.complained` e entregas, em caminho único de autorização.
  - `src/app/api/webhooks/resend/route.ts`: Endpoint oficial Next.js Route Handler (`POST`), com runtime Node, dinâmico, fail-closed para assinaturas inválidas (401 sem log de payload) e retorno resiliente 200 para eventos válidos (evitando loops de retry do gateway).
  - `src/app/api/hooks/resend/route.ts`: Rota alias / backward-compatible seguindo o padrão das rotas existentes em `/api/hooks/*`.
  - `src/lib/email/webhook.test.ts` e `src/app/api/webhooks/resend/route.test.ts`: Cobertura unitária e de rota (11 testes) cobrindo verificação de assinatura, rejeição de payloads inválidos, tratamento de bounces/complaints, tolerância a eventos desconhecidos e garantia de não-vazamento de PII.
  - `.env.example`: Documentação detalhada da variável `RESEND_WEBHOOK_SECRET`.
- **Revisão tech lead (PR #418 — 22/08/2026):** três correções aplicadas em sandbox antes do merge.
  1. **`bounce.message` deixou de ser logado (LGPD).** O campo é texto livre do MTA de destino (diagnóstico SMTP) e costuma embutir o endereço do destinatário (`550 5.1.1 <alguem@dominio>: Recipient address rejected`). O guardrail "nenhum dado identificável nos logs" passava só porque a fixture original usava a mensagem benigna `"Mailbox does not exist"` — verde por escolha de fixture, não por construção (`[[teste-verde-que-nao-testa-nada]]`). Restou apenas `bounce.type`, categoria fechada e operacional. Teste de regressão novo usa o formato real de diagnóstico; **mutante reintroduzindo `bounceMessage` no log → morto**.
  2. **`verificarAssinaturaResend` removido.** Helper exportado com 0 chamadores de produção: `processarWebhookResend` reimplementa a verificação inline, e os dois caminhos já **divergiam** (o helper devolvia `true` para `SyntaxError`; o processador devolve 400). Manter dois caminhos de autorização para o mesmo webhook é risco sem contrapartida; os 4 testes que exercitavam só o helper foram removidos junto.
  3. **Alias `/api/hooks/resend` com config de segmento literal.** A rota reexportava `runtime`/`dynamic` de outro módulo; o Next exige que a config de segmento seja estaticamente analisável no próprio arquivo de rota, e o modo de falha seria silencioso. Medido no `next build`: `ƒ /api/hooks/resend` e `ƒ /api/webhooks/resend` (ambas dinâmicas).
- **Fora de escopo revertido:** `src/lib/legal.test.ts` e `src/components/legal/documento-legal.test.tsx` traziam asserção de `Google (Gemini API)` na Política de Privacidade — texto que **não existe em `main`** (`grep -c Gemini docs/legal/politica-privacidade.md` = 0). Mesma reincidência do `[[teste-afirma-doc-nao-commitado]]` fechada na PR #416: os testes foram revertidos para `origin/main`, e o gate documental do provedor de IA continua sendo **D57**, aberto.
- **Sincronização de status verificada com o GitHub (não deduzida do texto local):** `docs/GO_LIVE.md` ainda listava #327 e #332/#341 como backlog aberto do Jules. Medido: PR #384 (`MERGED`) fecha #327 e PR #386 (`MERGED`) fecha #341 e #332 — as três issues estão `CLOSED`. As linhas foram promovidas a Entregue. Lição `[[comentario-de-issue-envelhece-e-desfaz-decisao]]`: status de doc envelhece em silêncio; conferir em `gh`, não no próprio doc.
- **Validação e Métricas (Medido, não presumido — pós-merge de `main` e pós-correções):**
  - `pnpm typecheck`: 0 erros.
  - `pnpm lint`: 0 erros, 0 warnings.
  - `pnpm test`: **1.788/1.788 testes verdes** (0 falhas).
  - `pnpm build`: sucesso; ambas as rotas do webhook compiladas como dinâmicas (`ƒ`).
  - Mutação: reintroduzir `bounceMessage` no log **mata** o teste novo; código original verde.

---

## 🏁 Sessão 22/08/2026 — #328: Perímetro Comportamental do `config.matcher` do Proxy (PR #415)

- **Status:** ✅ Concluído.
- **Objetivo:** Fechar o finding de mutação comportamental zero da issue #328 — o `config.matcher` de `src/proxy.ts` decide quais rotas entram no middleware (e, portanto, se a interceptação de token do `/redefinir-senha`, finding C1, acontece), mas nenhum teste avaliava esse perímetro.
- **Entregas principais:**
  - `src/proxy.test.ts`, suíte `Perímetro do matcher (config.matcher)`: o matcher é avaliado com `getPathMatch` — o **mesmo helper do Next.js** que faz o casamento em runtime, e não uma reimplementação da regex.
    - Rotas que DEVEM ser interceptadas: `/redefinir-senha` (segurança/C1), páginas de app (`/`, `/login`, `/pacientes/123/anamnese`, `/clinica`, …), API e webhooks (`/api/auth/*`, `/api/webhooks/asaas`) e descoberta de agentes (`/robots.txt`, `/.well-known/*`, `/auth.md`).
    - Rotas que DEVEM passar direto: `/_next/static/*`, `/_next/image`, `/favicon.ico`, `/brand/*`.
  - Cobertura adicional no manipulador `proxy()`: POST de webhook não sofre redirect nem injeção de `Link`; rotas `/api` (auth e webhook) não recebem `Link`.
- **Revisão tech lead (PR #415):** foram **removidos dois testes tautológicos** que a versão original trazia sob o rótulo de "resistência a mutação":
  - um asseria o texto literal de `config.matcher` (`toContain("/((?!_next/static|…).*)")`) — trava a escrita da regex sem provar comportamento e quebraria em qualquer reescrita equivalente;
  - outro chamava o helper com `[]` fixo, sem tocar `src/proxy.ts` — `[].some()` é falso por construção, o teste passaria contra qualquer código.
  - Lição aplicada: `[[teste-verde-que-nao-testa-nada]]`. A resistência a mutação é propriedade da suíte comportamental, medida mutando o **código de produção**, não asserida com a própria constante.
- **Validação (medida, mutando `src/proxy.ts`):**
  - `pnpm typecheck`: 0 erros. `pnpm lint`: 0 erros.
  - `pnpm test src/proxy.test.ts`: 17/17 passando.
  - Mutante `matcher: []` → **morto** (5 testes caem).
  - Mutante sem `brand/` na exclusão → **morto** (1 teste).
  - Mutante sem `_next/image` na exclusão → **morto** (1 teste).
  - Mutante removendo a entrada explícita `"/redefinir-senha"` → **sobrevive**, e é **mutante equivalente**: o catch-all `/((?!_next/static|_next/image|favicon.ico|brand/).*)` já casa `/redefinir-senha`. A entrada explícita é redundante no casamento e permanece apenas como declaração de intenção da rota crítica; nenhum teste novo é devido por ela.

---

## 📦 Sessão 22/08/2026 — Feature #374: Exportação Integral do Acervo da Clínica (Unificando #374 e #353)

- **Status:** 🟡 Em revisão no PR #422 (implementação entregue; 9 achados da review corrigidos — ver a seção seguinte).
- **Objetivo:** Implementar a exportação integral e portabilidade do acervo da clínica (Termos de Uso §7.4(b) e LGPD Art. 18), com geração assíncrona de pacote ZIP contendo todas as 37 tabelas do prontuário em formato NDJSON, relatórios clínicos congelados em PDF, manifesto com checksum SHA-256 e download seguro por token de uso único.
- **Entregas principais:**
  - **T1 — Migração `0117_export_bundle`:**
    - Tabelas `export_bundle` e `export_bundle_blob` com status de ciclo de vida (`pendente`, `processando`, `pronto`, `falhou`, `expirado`), índice `uq_export_bundle_ativo` (UNIQUE parcial) e constraints de check.
    - Políticas de RLS (`export_bundle_select`, `export_bundle_insert`, `export_bundle_blob_select`) com `app_clinic_id_exigido()` e `app_user_id_exigido()`. Nenhuma policy de UPDATE/DELETE para `app_role`.
    - Quatro funções `SECURITY DEFINER`: `app_export_bundle_reservar`, `app_export_bundle_concluir`, `app_export_bundle_falhar`, `app_export_bundle_expirar`.
    - **Isenção D10 documentada:** Ambas as tabelas deliberadamente isentas de `app_barreira_somente_leitura` para permitir que clínicas com conta em somente-leitura (pós-trial ou cancelada) exportem seus dados.
  - **T2 — Coletor de Dados NDJSON (`src/lib/export/acervo/coletor.ts`):**
    - Coleta sob `withTenant(clinicId, solicitanteId)` (D9) com ordenação determinística por PK.
    - Projeção estrita de `app_user` (`id, name, email, created_at`), exclusão de `patient.cpf_hash` e segredos, e exclusão de soft-delete (`deletado_em IS NOT NULL`).
    - Catálogo explícito de 37 tabelas e lista de negação estrita (`TABELAS_NEGADAS`).
  - **T3 — Empacotador ZIP + Manifesto (`src/lib/export/acervo/bundle.ts`):**
    - Compactação em memória via `fflate` gerando `dados/*.ndjson`, `relatorios/*.pdf`, `README.txt` e `manifest.json`.
    - Cálculo de SHA-256 por arquivo e do ZIP inteiro via `sha256Hex`.
    - Teto de 250 MiB com erro nomeado `bundle_excede_limite` (D7).
  - **T4 — Motor de Estado (`src/lib/export/acervo/motor.ts`):**
    - `solicitarExportacao`: Gate D1 de responsável da conta (`clinic.responsavel_conta_id`), inserção de `export_bundle` pendente e `audit_log` (`exportacao_integral_solicitada`).
    - `processarProximo`: Reserva transacional atômica com teto de 3 tentativas (`tentativas_esgotadas`), geração de token seguro de download, transição para `pronto` com persistência de blob e `audit_log` (`exportacao_integral_concluida` / `exportacao_integral_falhou`).
    - `expirarVencidos`: Expiração após 72h, descarte do blob em `export_bundle_blob` e `audit_log` (`exportacao_integral_expirada`).
    - `obterHistoricoExportacoes`: Consulta do estado ativo e histórico sob RLS.
  - **T5 — Job + Rota Interna (`src/app/api/internal/jobs/exportacao-integral/route.ts`):**
    - Endpoint autenticado via Bearer token constante (`EXPORT_JOB_TOKEN`), processando a fila e disparando expiração.
  - **T6 — Download Seguro (`src/app/api/export/acervo/[id]/route.ts` + `download.ts`):**
    - Validação de sessão do responsável, conferência de token via SHA-256 + `timingSafeEqual`, 404 genérico para token/id inválidos (sem vazamento de existência), 410 para expirados e `audit_log` (`exportacao_integral_download`).
  - **T7 — Interface do Usuário:**
    - Página `src/app/(app)/clinica/exportacao/page.tsx` (Server Component com gate D1).
    - View client `exportacao-view.tsx` com polling temporizado (10s, máx 60 tentativas / 10 min), estado de sucesso permanente, cópia de checksum SHA-256 e componentes do Design System.
    - Server Action `actions.ts` e endpoint de estado `/api/exportacao/estado`.
    - Estórias Storybook em `exportacao-view.stories.tsx`.
    - Link estático "Exportar acervo" na tarja de somente-leitura (`FaixaTrial`) e no menu de navegação do coordenador (`AppHeader`).
  - **T8 — Testes e Conformidade:**
    - `coletor.test.ts`, `bundle.test.ts`, `route.test.ts`, `actions.test.ts` (testes unitários).
    - `coletor.int.test.ts`, `motor.int.test.ts`, `download.int.test.ts`, `acervo.int.test.ts` (testes de integração/RLS).
    - Verificação de negação estrita varrendo o ZIP real descompactado (zero tabelas de credencial/gateway e zero `cpf_hash`).
    - Verificação de funcionamento com conta em somente-leitura (D10).
    - Verificação das 5 ações da trilha imutável em `audit_log`.
- **Validação e Métricas (Medição real):**
  - `pnpm typecheck`: **0 erros**.
  - `pnpm lint`: **0 erros**.
  - `pnpm test`: **253/253 arquivos de teste passando (1.804 testes verdes)**.
  - `POLICIES_COM_HELPER`: 67 policies validadas em `clinic-id-helper-rls.int.test.ts`.

---

## 🔎 Sessão 22/08/2026 — Review do PR #422 (tech lead) e correções

- **Status:** ✅ Correções aplicadas; PR #422 destravado (era `CONFLICTING`, agora `MERGEABLE`).
- **Contexto:** o PR estava com merge sujo contra `main`, o que impedia o GitHub
  de calcular o merge ref — só o CodeQL rodava. CI, integridade de migrações e
  integridade das versões legais **nunca chegaram a executar**. "4 checks
  verdes" era, na prática, ausência de checks.

### Conflitos resolvidos

- `db/migrations/meta/_journal.json` — `main` parou na `0116`, a branch traz a
  `0117`. Resolução: as duas entradas, na ordem.
- `.specs/features/374-.../{spec,design,tasks}.md` — 43 linhas "divergentes",
  **zero** com conteúdo diferente: era só realinhamento de padding de tabela do
  Prettier (`main` formatada pelo #421). Adotada a versão de `main`.
- Verificado que a resolução não reverteu `main`:
  `git diff origin/main HEAD -- src/lib/billing scripts docs/legal` = vazio
  (armadilha conhecida — branch antiga que já mergeou `main` pode apagar
  trabalho mergeado sem conflitar).

### Achados corrigidos

| #   | Severidade | Achado                                                                                                                                                                                                                                  |
| :-- | :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P0         | **Feature inalcançável.** O token de download nasce no job, é gravado só como SHA-256 e o texto claro era descartado pela rota interna. A UI montava o link sem `?token=`, e `baixarBundleAcervo` devolve 404 quando o token vem vazio. |
| 2   | P0         | `download.ts` lia `criado_em` de `export_bundle` — coluna inexistente na `0117` e no `schema.ts`. Todo download estouraria em runtime.                                                                                                  |
| 3   | P0         | Nenhum gatilho do job: sem `scripts/exportacao-acervo.mjs` e sem `EXPORT_JOB_TOKEN` no `.env.example`, toda solicitação ficaria em `pendente` para sempre.                                                                              |
| 4   | P1         | `app_export_bundle_reservar` sem guard de status: reservar um bundle `pronto` o devolvia a `processando`, matando o link vigente e podendo estourar `uq_export_bundle_ativo` dentro do DEFINER.                                         |
| 5   | P1         | Os quatro DEFINER do job tinham `GRANT EXECUTE ... TO app_role` e aceitam qualquer `uuid` sem resolver tenant. `app_role` perdeu o EXECUTE; quem chama é o job, sob `iris_auth`.                                                        |
| 6   | P1         | Gate D1 com três leituras diferentes do mesmo fato (`page.tsx` exigia coordenador com `responsavel_conta_id` nulo; motor e download liberavam qualquer papel). Unificado em `lib/export/acervo/gate.ts`, pela regra mais restrita.      |
| 7   | P1         | `err.message` cru gravado em `export_bundle.erro` e `audit_log.detalhe` — texto de terceiro carrega valores de linha. Virou categoria fechada; o texto original fica só no log do processo.                                             |
| 8   | P2         | Nada provava a cobertura do catálogo do coletor. O teste novo varre o `schema.ts` e já achou um buraco real: `report_pdf` não estava em nenhuma das duas listas (agora em `TABELAS_EXPORTADAS_BINARIAS`).                               |
| 9   | P2         | `expirarVencidos` ignorava o boolean de `app_export_bundle_expirar` e auditava expiração sem linha alterada.                                                                                                                            |

### Lição transversal — o lockfile alterna de formato

`pnpm-lock.yaml` não estava no `.prettierignore`. O Prettier expande os flow
maps (`resolution: {integrity: …}` vira bloco multilinha) e troca as aspas,
inflando o arquivo em ~3,4 k linhas; o `pnpm install` seguinte desfaz tudo.
Resultado: cada branch alterna entre os dois formatos e produz um diff de
**12 mil linhas** para uma dependência nova (`fflate`, 1 linha no
`package.json`). Conjunto de pacotes conferido: idêntico ao de `main` **mais**
`fflate@0.8.3`. O lockfile entrou no `.prettierignore`.

### Medições após as correções

- `pnpm typecheck`: **0 erros**.
- `pnpm lint`: **0 erros** (9 warnings pré-existentes).
- `pnpm vitest run`: **253 arquivos / 1.805 testes, 0 falha**.
- Suíte de integração/RLS: depende de Postgres; roda no job `test-rls` do CI
  (Docker local indisponível nesta sessão).
- `FUNCOES_COM_HELPER` subiu de 18 para 19 (entra
  `app_export_bundle_token_definir`, com guard de tenant).

## 📐 Sessão 24/08/2026 — Spec da #277: painel de governança e segurança da clínica

`/tlc-spec-driven` sobre a #277. Spec aceita pelo Rômulo e label `Jules` aplicada.
Comentários na issue: spec, tarefas atomizadas (T1–T10) e registro do aceite.

### O levantamento derrubou 2 das 3 entregas propostas

- **Atalho para a trilha de auditoria não tem destino.** `audit_log` tem policy
  de leitura coordenador-only (`0046:11`) e a view `audit_log_mascarado`, mas a
  varredura de `src/` mostra **só escrita** — nenhuma tela lê a trilha. Virou
  issue de desdobramento (T9), não link morto na tela.
- **"Termo de Governança e Criptografia" não existe.** `docs/legal/` tem 16
  documentos e nenhum é esse. Redigir documento jurídico exige o Rômulo. Virou
  T10.

### A métrica pedida é estruturalmente constante

`src/auth/tenant.ts:170` desvia papel clínico sem 2FA para `/mfa/setup`: quem
não ativou **não entra no app**. Logo "quantos terapeutas ativaram 2FA" é sempre
100% entre quem usa o sistema — o painel afirmaria um risco inexistente.

O que `app_user.two_factor_enabled = false` marca de verdade é **convite
provisionado que nunca teve primeiro acesso** (`equipe/convidar/logic.ts` cria o
`user_role` na hora, com senha temporária viva). Sinal melhor, mas outro — a
copy diz "Ativação pendente", nunca "não ativou o 2FA".

Exceção real: **`admin_recepcao` não é coberto pelo gate de MFA**. Para esse
papel a flag em `false` significa mesmo "opera sem segundo fator" — categoria
separada na UI. E `listarTerapeutas` exclui recepção do filtro, então a query
nova não pôde reusá-la.

### Nem toda leitura nova é superfície de RLS nova

A issue supunha `SECURITY DEFINER` para atravessar a fronteira até a credencial
`two_factor`. Não é preciso tocá-la: o sinal está na coluna
`app_user.two_factor_enabled` (`0047:8`) e a policy `app_user_read`
(`0002:35`, reescrita em `0085:113`) já entrega as linhas dos colegas da clínica
ativa — é o que `listarTerapeutas` usa hoje.

**Medido, não deduzido** (a leitura das migrações não decidia: a `0001:21` deu
`GRANT ... ON ALL TABLES` antes de a coluna existir, e a `0057` ainda assim
concedeu colunas de `app_user` explicitamente):

- `has_column_privilege('app_role','app_user','two_factor_enabled','SELECT')` → `t`
- grant do `app_role` em `app_user` é de **tabela**, e privilégio de tabela
  alcança coluna criada depois
- confirmado ponta-a-ponta como `app_role` com as GUCs setadas: a query devolve
  `name` + `two_factor_enabled` dos colegas pela `app_user_read`

Consequência: **a issue não tem migração**. `.sql` no diff = desenho fora do trilho.

### Decisões travadas

1. Rota `/(app)/clinica/seguranca`, quarta aba do `TabsNav` — `/(app)/configuracoes/*`
   não existe no repo, e o `clinica/layout.tsx` já é coordenador-only.
2. Granularidade **nominal para pendências, agregada para conformes**: listar
   nominalmente quem está em conformidade não serve a nenhuma ação do
   coordenador e amplia exposição sem ganho.
3. Papel duplo (clínico + recepção) classifica pelo lado **mais restritivo**.
4. Falha na leitura **propaga** — não vira lista vazia. Painel de segurança que
   mostra "tudo certo" porque a query estourou é afirmação falsa.
5. Tela é somente leitura: sem forçar MFA, sem reenviar convite.

---

## 🏁 Sessão 31/08/2026 (3ª) — Pós-merge da #72: revisão, issue de continuação #494 e decisão de R19

PR #490 mergeada (squash `e373d0af`). Os dois checks vermelhos eram o **mesmo** bot externo (`sanjay3290/jules-pr-reviewer@v1`, `Collected review (0 chars)` após 87 tentativas de poll) — nenhum dos dois está em `required_status_checks`, e o mesmo workflow passou 7 vezes nesta branch antes. Transiente, não regressão.

**Achado de CI de carona:** `fail_on: never` em `pr-review.yml` cobre findings, não timeout — a action morre com exit≠0 e a intenção documentada ("revisor é ADVISORY, nunca bloqueia o merge") não vale nesse caminho. Fechar com `continue-on-error: true` no step quando alguém tocar nesse workflow.

**Revisão pós-merge (Opus, diff completo contra `main`).** Limpo e verificado, para o registro: nenhuma migração nova resolve tenant (os definers são deliberadamente globais e `clinic_id` sai de `app_asr_reservar` como coluna de resultado, nunca como predicado — a regra 6 do `CLAUDE.md` governa o caso oposto); `0135:13` concede `UPDATE` nas 6 colunas novas e `objeto_ref` já vinha da `0006:126`; `_journal.json` com `when` estritamente crescente, `idx` contíguo e as migrações à mão (`0136`, `0138`) sem snapshot, como devem; as leituras da app passam por `withTenant` e herdam a barreira de sigilo `audio_select` (`0123:12`), então `transcricao_texto` nasce coberta. **Oito defeitos confirmados** viraram **D73** — quatro 🔴 que compõem entre si e destroem áudio clínico ou vazam a transcrição para o log do painel.

**Cobertura que passa pelo motivo errado** (mutações que sobrevivem à suíte, detalhadas em #494 T22): auth do worker aceita qualquer portador do comprimento certo (o teste usa token de 13 bytes contra um de 23, e a checagem de comprimento curto-circuita); a guarda fail-closed do sweeper só é provada dentro de `resolveConfig()` e nunca alcança `varrer`, então trocar `refsEmUso` por `async () => new Set()` deixa tudo verde e o sweeper de produção passa a apagar áudio `na_fila` vivo; `objeto_ref IS NOT NULL` (`0136:68`) e a guarda `asr_status = 'transcrevendo'` nos três UPDATEs não têm teste nenhum. Bem coberto, em contraste: a posição de `tentativas < 3` dentro da subquery do LIMIT, a guarda `objetoEmUso` nos dois lados e a reversão `falhar(id, true)`.

**Ponto cego estrutural:** não existe E2E do fluxo de ditado em `e2e/`. Os 6 checks obrigatórios passaram verdes sobre uma feature inutilizável — o gate nunca teria acusado a ausência da UI. Virou T13 na #494.

**Encaminhamento:** #72 fechada com comentário de cruzamento; **#494** aberta reunindo tudo que falta para o Modo 2 poder ser ligado (UI T11-T13, defeitos T14-T22, higiene T23, smoke de produção T24) com ordem de execução sugerida. **D72** atualizado (o débito não morreu, mudou de lugar de rastreio).

**Decisão de R19 (opção C, ver D74).** A transcrição passa a ser efêmera no servidor: limpa quando o terapeuta aceita o texto no rascunho da nota, pela mesma régua que R11 já aplica ao áudio bruto. O que decidiu não foi a redação e sim a medição — nenhum caminho de produção limpava `transcricao_texto`, então o campo descrito como rascunho intermediário era permanente, e um dado clínico guardado indefinidamente sem ser devolvido no pedido de portabilidade não se sustenta. R19 reescrito em `spec.md` com a decisão datada e a rastreabilidade estendida a T12.
