# Checkpoint — Iris

> **Data:** 19/08/2026
> **Status:** 🟢 **#388, #387, #390, #389, #391 e #392 mergeadas na main (PRs #397, #398, #399, #400, #401, #402). #395 rebaseada limpa na main, verificada e com PR aberta (#403).** #395: primeira suíte que testa comportamento do agente (13 testes derivados de `docs/agente/casos-de-teste-{tcc,terapia-convencional}.md`), isolada de `pnpm test` (`*.llm.test.ts`/`pnpm test:llm`). Roda contra **Gemini** por decisão explícita do Rômulo (custo, não qualidade — produção segue 100% Anthropic). Baseline real 11/13 verde, 2 vermelhos são achado real documentado (T4 inventa `tarefa_casa` sem instrução; probe R4-TCC/R11-TC pega confiança "alta" indevida). **D49 aberta:** prova de mutação bloqueada por quota grátis do Gemini (20 req/dia esgotada) — alvos já mapeados em `prompt.ts`, retomar com quota nova/key paga. Verde: `pnpm typecheck/lint/test` (suíte LLM fora do padrão). Detalhe completo no `BACKLOG.md`. Próximo: #393.
>
> **#388 e #387 executados, verificados e commitados.** #387 (PR #398, empilhada sobre #397/#388): seletor de modalidade no cadastro (radio group obrigatorio, sem fallback), gate de consentimento adulto+TCC/convencional (client+servidor), edicao via Server Action (UPDATE direto + audit_log, sem SECURITY DEFINER — RLS `patient_update` ja cobria, correcao de premissa da issue original), guard 404 em `tcc/page.tsx`. Verde: typecheck/lint/test (205/1433)/test:rls. Branch `feat/387-clinical-modality-selector` empilhada sobre `feat/388-...`. Proximo: #390.
>
> **#388 executado, verificado e commitado (branch `feat/388-clinical-modality-cognitive-behavioral`, nascida de `main`/e4c4cda).** `clinical_modality` ganhou 3º valor `cognitive_behavioral` (migração `0107`, isolada, `pg_enum` verificado via psql). Roteamento modalidade→modo→prompt agora 3-way e exaustivo (`context-loader.ts`, `claude-provider.ts` — `default` lança). Novo `TCC_SYSTEM_PROMPT` com regra de risco obrigatória (R5-TC). `layout.tsx` corrigiu bug real (aba TCC aparecia em `conventional`, invertido). Nova aba/rota `/temas` para o modo convencional — achado real: `resumo_sessao`/`temas[]` nunca foram persistidos (schema Zod não tem `temas`, `ClaudeProvider.extrair()` descarta `resumo_sessao`), página lê `session_note` (nota_consolidada) como aproximação, gap documentado inline para follow-up (candidato a entrar em #390). Verde medido: `typecheck` limpo, `lint` 0 erros/10 warnings pré-existentes, `pnpm test` 203 arquivos/1421 testes, `test:rls` verde. Trabalho feito por 3 subagentes em paralelo (T1 migração pelo orquestrador, T2 agent-routing, T3 UI/Temas) via `/tlc-spec-driven` (spec em `.specs/features/388-clinical-modality-cognitive-behavioral/`). Ordem da sessão: #388→#387→#390→#389→#391→#392→#395→#393→#394. Próximo: #387 (seletor de modalidade, escreve a coluna).
>
> ⚠️ **Nota de operação (18/08/2026):** um `git reset --hard` durante um split de branch apagou edições não commitadas deste arquivo e de `docs/GO_LIVE.md` que vinham de sessão anterior (a de fechamento de #396/9 issues). O essencial dessa sessão (PR #396, BACKLOG.md, README.md, as 9 issues #388-#394 mais #395) já estava commitado em `e4c4cda` e sobreviveu. Reconstruído abaixo, a partir da memória da sessão, o que se perdeu deste arquivo:
>
> **Sessão 17/08/2026 (4ª, reconstruída) — fechamento de #396 e roteiro de issues.** Sem novas investigações — notificação antiga já processada. PR #396 criado com a documentação de arquitetura de modalidades clínicas, especificação do formulário RPD, correções de protocolo e nove issues sequenciais abertas (#388 a #394, mais depois #395 pra suíte automatizada). Próximo passo definido então: implementação seguindo a sequência de issues a partir de #388 — é exatamente o que esta sessão (18/08) começou a executar.
> **Branch:** `feat/322-orquestracao-retentativa` — nascida de `main` (`a7d6e4e`), **6 commits**, 0 atrás de `origin/main`.
> **Status:** 🟢 **Passo 9 (#322) executado, revisado adversarialmente e reparado — a linha de billing do Pix Automático fecha aqui.** A retentativa extradia deixou de ser uma flag inerte: `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS` só **permite**, e até esta sessão nada no Iris comandava tentativa nenhuma — um único dia sem saldo matava o ciclo. Agora a varredura do job de fechamento comanda `POST /pix/automatic/paymentInstructions/{id}/retries`, até 3 em 7 dias corridos, **só para recusa por saldo (G2)**, com a data calculada contra as 4 restrições do gateway; e a conciliação passou a ler `purpose`/`retryAttempt`, então uma retentativa recusada não carimba `past_due` pela segunda e terceira vez sobre o mesmo ciclo. A revisão adversarial derrubou a 1ª versão em **3 GRAVES** (§1) e a campanha de mutação achou **6 oráculos faltando**; tudo corrigido e coberto. Verde medido: `pnpm test` **201 arquivos / 1396 testes** · integração **242 suites / 971 testes** · `pnpm test:rls` **107 arquivos / 971 testes, 0 pulados** · `typecheck` limpo · `lint` **0 erros / 10 warnings** pré-existentes. Migração **`0106`** aplicada e medida. Próximo passo concreto: §3.
>
> **Sessão anterior (16/08/2026, 3ª):** 🟢 **Passo 7 (#289) executado, revisado adversarialmente e reparado.** `erro_aplicacao` deixou de gravar a mesma frase para dois desfechos opostos: ruído de ativação (esperado para sempre) × mensalidade paga e não conciliada (dinheiro recebido e não creditado). A revisão derrubou o discriminador original **no caminho principal**: evento de `paymentInstruction` (débito mensal headless — exatamente o modo de falha que a issue existe para denunciar) chega **sem objeto `payment`**, então classificar só por `externalReference` mandava o alarme para o balde da ativação. Regra nova, fail-closed: **a instrução decide antes da referência**. E a consulta da DoD parou de ler carimbo histórico — passou a reavaliar o estado vivo do `billing_cycle`, o que mata uma corrida que gerava alarme falso permanente e traz de volta as falhas por exceção, que a versão anterior não enxergava. 3 mutantes sobreviventes da campanha viraram 3 oráculos. Verde medido: `pnpm test` **199 arquivos / 1339 testes** · integração dos 4 arquivos tocados **13 suites / 74 testes, 0 falhas** · `typecheck` limpo · `lint` **0 erros / 10 warnings** pré-existentes. Nenhuma migração. **A label `jules` não foi aplicada — a issue foi executada aqui**, e o que sobra dela é uma decisão do Rômulo (§3b). Próximo passo concreto: §3.
>
> **Sessão anterior (16/08/2026, 2ª):** branch `feat/311-piso-cobranca-medido` (1 commit nesta sessão, **empilhada** sobre `feat/310-reaproveitar-cobranca-gate`). As duas foram **pushadas** e viraram PR: [#339](https://github.com/romulosutil/Iris/pull/339) (#310 → `main`) e [#340](https://github.com/romulosutil/Iris/pull/340) (#311 → `feat/310-…`, encadeada). ✅ **As duas foram mergeadas em 16/08** (#339 às 21:23, #340 às 21:28) e as issues **#310 e #311 fecharam** — o `Closes` disparou, conferido por `gh api`.
> **Status:** 🟢 **Passo 6 (#311) executado e verificado.** O piso de cobrança deixou de se declarar não medido: `PISO_COBRANCA_AVULSA_CENTAVOS = 500` **coincide com o piso real** do `POST /payments` PIX (R$ 5,00, medido na #321 em 15/08), então o número não muda — o que muda é o código parar de pedir uma verificação que já tinha sido feita, e o número **ganhar oráculo**: os dois testes de fronteira que existiam importavam a própria constante e sobreviviam à mutação `500 → 400`. Decisão fechada: a constante **não** é renomeada (o comentário que pede isso é anterior à D-E da #317, e executá-lo desfaria uma entrega). Verde medido: `pnpm test` **197 arquivos / 1317 testes** · `typecheck` limpo · `lint` **0 erros / 10 warnings**. Nenhuma migração, nenhuma mudança de comportamento. Próximo passo concreto: §3.
>
> **Sessão anterior (16/08/2026, 1ª):** 🟢 **Passo 5 (#310) executado em código e verificado.** O gate de reativação deixou de emitir cobrança por cima de cobrança viva: ciclo cuja cobrança o Asaas ainda mantém pagável é reapresentado, o resto vira uma consolidada. A revisão adversarial derrubou a 1ª versão em **3 GRAVES** — um deles **regressão desta branch** — e todos foram corrigidos e cobertos (§1). Verde medido: `pnpm test` **197 arquivos / 1316 testes** · `pnpm test:rls` **106 / 934, 0 pulados** · `typecheck` limpo · `lint` **0 erros / 10 warnings**. Também nesta sessão: **`main` mudou embaixo de nós** — a **#312 fechou isolada** (PR #334) e a **#329** entrou (PR #335); as duas já foram mergeadas para cá e validadas por medição, não pela ausência de conflito. Próximo passo concreto: §3.
>
> **Histórico anterior (15/08/2026):** passos 1, 2, 3 e 4 executados **em código**. O Postgres local voltou: a **D33 fechou na parte mensurável** (`0098` aplicada e medida, 12/12 casos de integração, `test:rls` 102/102 sem pular) — **resta não exercitado só o backfill**, porque `subscription` tem 0 linhas neste banco. A **D35 fechou**: o motivo da recusa passou a ser lido do recurso que o tem. A #318 entrou inteira (classificação por código + coluna `recusa_codigo` + backstop de D+7). **D34 e D36 seguem abertos**, e o D36 ficou **mais** urgente. Achado novo e grave, de produção: **`alerta_risco_auth_select` não existe** — o painel Super Admin reporta zero em silêncio (§1, "A deriva de hash"). Próximo passo concreto: §3.

---

## 0. Ordem de leitura — comece aqui

> **Você está no passo 3 de 4.** Se abriu este arquivo primeiro, leia os dois anteriores antes de agir: eles dizem **o que** fazer e **em que ordem**; este diz apenas onde a última sessão parou.

| #     | Documento                                                                                                 | O que só existe aqui                                                                                                                                                                                           |
| :---- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | [**Ordem de conclusão**](https://claude.ai/code/artifact/59b6c2d8-ea6c-401a-b62f-9572ed26d243) (artifact) | A sequência dos 9 passos e **por que essa ordem** — irreversibilidade, não gravidade. Grafo de dependência, modelo indicado e prompt pronto de cada passo.                                                     |
| **2** | **A issue do passo corrente** (GitHub)                                                                    | Escopo exato, Definição de Pronto e os comentários com as medições já feitas. ⚠️ `gh issue view --comments` **retorna vazio neste ambiente** — usar `gh api repos/romulosutil/iris/issues/N` e `.../comments`. |
| **3** | `checkpoint.md` (este arquivo)                                                                            | Estado da última sessão: o que foi medido, o que ficou aberto **e por qual motivo**, e o próximo passo concreto.                                                                                               |
| **4** | [`BACKLOG.md`](BACKLOG.md)                                                                                | Débitos vivos (D1–D46) e log de sessões. Consulta, não leitura linear — venha buscar o histórico de uma decisão específica.                                                                                    |

### Instruções para o próximo

1. **Leia na ordem acima.** O artifact é o ponto de entrada — ele decide qual issue é a próxima, com qual modelo e com qual skill. Não escolha o passo por conta própria.
2. **Leia os comentários da issue — e desconfie deles também.** Nas issues desta linha os comentários **corrigem o corpo original** em pontos materiais, e planejar pelo corpo sozinho já produziu retrabalho (na #319 o próprio corpo tinha uma conta errada, §1c). Mas na #318 um **comentário** afirmava que o pipe de captura já funcionava, e isso caiu na medição (§1). Comentário é a melhor fonte disponível, não é prova.
3. **Não replaneje medição contra o sandbox do Asaas.** Autorização de Pix Automático não ativa lá (§1e). Toda pergunta sobre o trilho headless só se responde no ensaio com clínica de teste **em produção**.
4. **"Não medido" é resultado, não pendência.** Propague com o motivo. Nunca converta em suposição pelo caminho — foi exatamente esse defeito que criou a #289.
5. **Antes de aplicar a label `jules`**, feche o checklist de handoff (`AGENTS.md` §5.2). A #289 está bloqueada nisso hoje: falta decidir o discriminador.
6. **Ao fechar um passo:** atualize este arquivo **e** acrescente a sessão no `BACKLOG.md`, nessa ordem. O artifact só muda quando a ordem dos passos mudar.
7. **Commits em inglês**, documentação e copy em pt-BR. Formate só os arquivos tocados (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`, que reformata o repo inteiro.

---

## 1. Resumo da Sessão (17/08/2026) — passo 9: #322, a flag que não recuperava um centavo

Orquestração em subagentes (2 de pesquisa → 4 builders → revisão adversarial + campanha de mutação em paralelo → reparo → oráculos). Branch nova `feat/322-orquestracao-retentativa`, nascida de `main`. **6 commits.** Uma migração: a `0106`.

| Commit    | O quê                                                                 |
| :-------- | :-------------------------------------------------------------------- |
| `a869a0f` | `feat(billing): add extradia retry columns to billing_cycle`          |
| `a827b59` | `feat(billing): add retry command port and read retry webhook fields` |
| `aaa396f` | `feat(billing): command extradia retries from the closing sweep`      |
| `de017f6` | `feat(billing): report the retry stage in the closing job`            |
| `0e22f2b` | `fix(billing): repair three grave defects in the retry sweep`         |
| `e0f5772` | `test(billing): add the oracles the mutation campaign proved missing` |

### O corpo da issue estava errado em quatro pontos, e três deles mudariam o desenho

Planejar pelo corpo sozinho teria produzido retrabalho — de novo. O que a leitura dos comentários das #317/#318/#319 corrigiu:

1. **"7 de retentativa + 7 de carência = 14 dias de escrita livre"** — falso duas vezes. A carência é **10** dias desde a `0098`, e as janelas **se sobrepõem**: `pastDueDesde` recebe `?? agora` na **primeira** recusa, então a retentativa corre **dentro** da carência. A "pendência" que a #322 manda decidir já tinha sido fechada na #319.
2. **"Só retentar `PAYMENT_OVERDUE`"** — mais restritivo que a tabela da #318, que marca `valeGastarRetentativa` também em G0, G1, G4, G6 e G7. O desenho converge com o corpo mesmo assim, mas **por outro motivo** (D-2 abaixo), e isso importa: a diferença é exatamente o defeito que o mutante 7 encontrou.
3. **A dependência da #317 já estava satisfeita** — a flag entrou em 15/08.
4. O FAQ do Asaas (item 5) **nega** a existência da retentativa extradia. É anterior à Jornada 3. Não é fonte.

### As decisões que fixaram o desenho

O plano inteiro, com o porquê de cada uma, está em `docs/superpowers/plans/2026-08-16-322-orquestracao-retentativa.md`. As três que mudam o que o sistema faz:

- **D-1, o gatilho é varredura, não webhook.** A validação das 23h59 do dia anterior transforma horário de execução em parte da regra; uma varredura que só comanda `dueDate ≥ amanhã` a satisfaz **por construção**. E o envelope de `paymentInstruction` que `normalizarEventoAsaas` assume **nunca foi medido** — pendurar recuperação de receita nele seria empilhar desenho sobre suposição. Contrapartida assumida: até ~1 dia de latência, que custa zero porque o dia da recusa já é coberto pela retentativa **intradia**, executada pelo PSP e que não consome nenhuma das 3.
- **D-2, elegibilidade automática por campo novo.** `valeGastarRetentativa` responde "vale a pena **algum dia**", e em G1/G4/G6 vem com "**depois** que a clínica agir". Varredura não age nem conserta. Reusar aquele campo como gatilho seria confundir **flag habilitadora com mecanismo** — o defeito exato de [[pipe-que-le-o-recurso-errado]] — e queimaria tentativas que o caso de saldo precisa. Nasceu `retentavelAutomaticamente`, `true` **só em G2**.
- **D-4, a reserva vem antes da chamada.** O contador é reservado por compare-and-set **antes** do `POST /retries`, o **contrário** da regra da #319 ([[varredura-escreve-o-proprio-predicado]]). A inversão vale só aqui: lá o efeito era interno e reversível, aqui é **externo e irreversível**, e a doc do Asaas nomeia a chamada concorrente como modo de falha primário. O custo — perder 1 das 3 tentativas numa falha de rede — não trava o ciclo, porque a elegibilidade continua sendo `contador < 3 ∧ sem instrução pendente ∧ existe data possível`.

### O que a revisão adversarial derrubou: 3 GRAVES, e o pior deles não tinha nada a ver com retentativa

- **A fila nunca drenava.** Os filtros baratos (grupo, orçamento, janela de 7 dias) rodavam **depois** do `LIMIT 20`. Ciclo permanentemente inelegível **não muda de estado** — então 20 deles ordenados por vencimento ASC ocupavam a passada inteira, todo dia, para sempre, e a recusa de saldo de hoje nunca era avaliada. É pior que o caso análogo do backstop justamente porque lá a linha avaliada muda de estado e sai do conjunto. Os três predicados foram para o `WHERE`; o pré-filtro grosso da janela foi **medido contra o Postgres** para provar que é conservador (00:00 SP de `hoje−6` passa, 23:59 SP de `hoje−7` não), e a autoridade da data exata continua na função pura.
- **Cobrança já paga era retentada.** A guarda perguntava se havia instrução pendente; nunca se a **cobrança liquidou**. Com o webhook perdido — premissa explícita da própria D-1 — a passada seguinte comandava um **segundo débito da mesma mensalidade**. E "cobrança já liquidada" **não está** entre as 5 validações documentadas do Asaas: nada garante que o gateway recusaria. Agora a varredura consulta o status antes de reservar e, se pago, **concilia** em vez de retentar — auto-cura do webhook perdido.
- **O guard de `RETRY_AFTER_DUE_DATE` engolia recusa de causa diferente.** Cenário: recusa original por saldo; a clínica revoga a autorização no app do banco; a retentativa volta G3 (`corteImediato`). O guard descartava, `recusa_codigo` seguia dizendo "sem saldo", e `aplicarBackstopDePrazo` — que decide o corte lendo essa coluna — ficava cego para uma autorização morta. **Dois testes de integração consagravam o defeito**, e foram invertidos. Ressalva honesta: o guard é **inerte em produção** hoje, porque `purpose` nunca foi observado em payload real; o defeito acordaria junto com o campo.

Mais dois MÉDIOS: a `dueDate` podia cair **no dia do corte** por carência (clínica pagaria e ficaria `canceled`) — virou o teto C; e o predicado de carência dizia no comentário ser cópia fiel e tinha perdido o `status = 'past_due'`.

### A mutação: 19 mutantes, 13 mortos, 6 sobreviventes — e o sobrevivente nº 1 era a decisão D-2

O mutante que trocou `retentavelAutomaticamente` por `valeGastarRetentativa` no filtro **não matou nenhum teste**. Motivo medido: o único caso de grupo não-retentável usava **G5**, em que os dois campos são `false`. A decisão mais importante do desenho não tinha oráculo. Os grupos que **divergem** (G1, G6) entraram como caso.

Os outros cinco sobreviventes cobriam assinatura `canceled`, ciclo que não está `falhou`, `instrucaoParaRetentativa` (método público sem teste nenhum), teto de 20 por passada com a sonda `+1`, e a borda **exata** da carência — o caso existente usava um dia além, onde `<` e `<=` empatam. Cada oráculo novo foi validado **aplicando o mutante e contando os mortos**, não presumindo.

### Achados de ferramenta que custaram tempo

- **Um `sql<Date>` cru num select do Drizzle volta como _string_** (`2026-08-20 12:00:00+00`): o caminho `.values()` do `postgres-js` pula a decodificação, e `civilSp` estourou `Invalid time value`. Resolvido com `.mapWith(...)`.
- **`git diff` sob o hook do RTK devolve resumo, não patch aplicável** — de novo. Para reverter mutante, `rtk proxy git diff`; nunca `git checkout -- .`, que apagaria a entrega ([[mutacao-reverter-sem-git-checkout]]).

### O que continua não medido — e não vira suposição

**Nada do trilho headless foi exercitado contra gateway real.** O sandbox não ativa Pix Automático ([[sandbox-asaas-nao-ativa-pix-automatico]]), então `purpose`, `retryAttempt`, o corpo de sucesso do `POST /retries` e o alinhamento entre a recorrência do Asaas e o ciclo do Iris seguem sem medição. Os dois de maior consequência estão escritos no docblock da varredura e viraram **D44** e **D45**: se o alinhamento estiver um ciclo atrás, **toda** retentativa volta 400 e o orçamento é queimado; se o contador de 3 do Asaas for por instrução e não por cobrança, escolher sempre a instrução mais recente abre orçamento além de 3.

---

## 1b. Resumo da sessão de 16/08/2026 (3ª) — passo 7: #289, o alarme que calava no caminho do dinheiro

Orquestração em subagentes (spec → builder → duas revisões adversariais em paralelo + campanha de mutação → reparo). Branch nova `fix/289-erro-aplicacao-discriminador`, nascida de `main`. **7 commits**, sem push e sem PR. Nenhuma migração: a entrega inteira cabe em código e teste.

| Commit    | O quê                                                                  |
| :-------- | :--------------------------------------------------------------------- |
| `52b188d` | `feat(billing): add shared erro_aplicacao vocabulary and classifier`   |
| `6e70935` | `fix(billing): classify erro_aplicacao and stop the sweep erasing it`  |
| `d63c2fe` | `docs(billing): move aplicado_em/erro_aplicacao note out of schema.ts` |
| `ab05a04` | `fix(billing): classify headless debit events as real alarms`          |
| `8b1e9c5` | `fix(billing): make the DoD query read live cycle state`               |
| `b16da8c` | `test(billing): add the missing oracles for sweep and emitted prefix`  |
| `2d63e1c` | `docs(billing): scope the external-reference heading to its own track` |

### O defeito, e por que ele não era um texto feio

`erro_aplicacao` gravava `"cobrança sem ciclo correspondente"` para **todo** evento de cobrança em que `conciliarPagamentoDeCiclo` devolvia `false`. Esse `false` cobre dois desfechos **opostos**: a cobrança de **ativação** do Pix Automático (nunca tem ciclo, nunca terá, acontece em toda ativação para sempre — comportamento correto) e a **mensalidade paga sem ciclo conciliado** (dinheiro recebido e não creditado). Um texto só para os dois torna a coluna inútil como sinal: o alarme afoga no ruído, e a única saída vira conferir evento por evento no payload bruto. O primeiro ciclo real vence em **12/09/2026** — a partir dali essa coluna é o que denuncia dinheiro perdido.

O vocabulário fechado ficou em `src/lib/billing/erro-aplicacao.ts`, num lugar só, consumido pelos **dois** caminhos que escrevem a coluna (a rota do webhook e `reprocessarEventosPendentes`). O motivo de ser compartilhado é medido, não estético: a rota gravava `"evento sem id utilizável"` e a varredura `"sem id utilizável"` — duas cópias do mesmo desfecho que **já tinham divergido**.

### O que a revisão adversarial derrubou: o discriminador era cego no caminho principal

A decisão original (D-1) era discriminar por `payment.externalReference` — fato sobre **o que nós emitimos**, não identificador do gateway, e medido dos dois lados: ciclo sai com `cycle:<id>`, débito consolidado com `debito:<âncora>`, e a ativação nasce do `immediateQrCode`, que **não aceita `externalReference`** (medido na #321). Está certo — **para o trilho que tem objeto `payment`**.

O débito mensal do Pix Automático é **headless**: o Asaas cria a instrução, debita e notifica. Esses eventos chegam com `paymentInstruction` e **sem** o objeto `payment` no envelope, então `payment.externalReference` é `undefined` neles. Classificar só pela referência mandava o débito mensal — **o modo de falha que a #289 existe para denunciar** — para o balde da ativação. O alarme calaria exatamente no caminho principal do dinheiro.

Regra nova, **fail-closed: a instrução decide antes da referência, sem exceção** (inclusive vencendo referência de terceiro). A presença de `providerInstructionId` é prova **por construção** de que a cobrança é nossa: instrução de pagamento só existe dentro de uma autorização de Pix Automático, e a única autorização que este sistema cria é a da mensalidade. O docblock nomeia os **três fatos que tornariam essa prova falsa** (outra app na mesma conta Asaas apontada para este endpoint; autorização nossa para algo que não seja a mensalidade; o Asaas passar a modelar a ativação como instrução) e registra que nos três o erro cai para o lado do **alarme**, nunca do silêncio — uma linha a mais para conferir, em vez de dinheiro não creditado sem registro.

### A consulta da DoD lia um carimbo histórico — duas falhas, cada uma fatal sozinha

A primeira versão de `listarCobrancasDeCicloNaoConciliadas` filtrava `erro_aplicacao = <constante>`, por igualdade. Ler o texto é ler verdade **do instante em que foi gravada**, jamais reavaliada:

1. **Corrida ⇒ alarme falso permanente.** Se `PAYMENT_CREATED` vence a escrita de `billing_cycle.provider_charge_id`, o webhook grava o texto de alarme — e ele fica gravado para sempre, mesmo depois de o ciclo aparecer e o pagamento conciliar. Não é hipótese: a própria #289 documenta a corrida gêmea medida em produção (pagamento **1,3 s antes** de existir o primeiro ciclo).
2. **Cegueira ⇒ alarme que não aparece.** Quando a aplicação falha por exceção (gateway 500, banco fora), a coluna recebe a **mensagem da exceção**, não o motivo classificado. Uma cobrança nossa nessa situação nunca casava com a igualdade, e a consulta jurava que estava tudo bem.

O predicado novo é **o mesmo teste do webhook, avaliado agora**: a cobrança é nossa (id de instrução **ou** prefixo nosso na referência, lidos do `payload` bruto, que nunca é reescrito) **e** `NOT EXISTS` ciclo com aquele `provider_charge_id` — o predicado literal de `conciliarPagamentoDeCiclo`, executado no instante da consulta. É isso que faz a linha da corrida **sumir sozinha** quando o ciclo passa a apontar para a cobrança, sem reprocessamento nenhum. Entram agora as linhas que falharam por exceção e as ainda pendentes; `erroAplicacao` e `aplicadoEm` voltam na linha como evidência, para separar "na fila de retentativa" de "desistiu".

O `LIKE` que sobrou é de **prefixo sobre a referência** (equivalente ao `startsWith` do classificador), nunca substring sobre o motivo: `LIKE '%ciclo%'` em `erro_aplicacao` traria a ativação de volta — o ruído que a issue remove.

### A mutação achou 3 buracos que a suíte verde escondia

Campanha de **12 mutantes: 9 mortos, 3 sobreviventes** — e os 3 sobreviventes viraram exatamente os 3 reparos de teste:

- **Mutante I** — o caminho de **sucesso** da varredura não exigia `erro_aplicacao = null`. Tornar a escrita incondicional não quebrava nada.
- **Mutante L** — o ramo de **vínculo/desconhecido** da varredura não tinha oráculo de diagnóstico. Assimetria medida: a rota tinha 3 testes cobrindo o equivalente (mutante J morreu lá), a varredura tinha zero.
- **Mutante M** — o **formato do prefixo emitido** não tinha oráculo: trocar `cycle:` por `cycle-` nos dois sites de emissão não deixava nada vermelho. A asserção nova é **literal no teste**, não a constante importada — importar a constante é o teste tautológico de sempre ([[teste-verde-que-nao-testa-nada]]).

Cada reparo foi validado **aplicando o mutante e contando os mortos**, não presumindo: R1 → 3 testes, R2 → 2, R3 → 1, R4 → 1, R5 → 2.

Armadilha de processo que custou uma passada e vale registrar: **`git diff` sob o hook do RTK devolve um resumo, não um patch aplicável** — `git apply -R` falha com `No valid patches in input`. Para reverter mutante, gerar o patch com `rtk proxy git diff`. Nunca `git checkout -- .`, que apagaria o código novo junto ([[mutacao-reverter-sem-git-checkout]]).

### Verde medido

`pnpm typecheck` limpo · `pnpm lint` **0 erros / 10 warnings** pré-existentes (`src/stories/**` e `app/error.tsx`, não tocados) · `pnpm test` **199 arquivos / 1339 testes** · integração dos 4 arquivos tocados com `--config vitest.integration.config.ts`: **13 suites / 74 testes, 0 falhas** (route 31, reprocessamento 12, fechamento 1, gate-debito 30).

### O que continua não medido — e não vira suposição

**Qual campo a cobrança de ativação de fato traz nunca foi medido**, e o bloqueio é estrutural: o sandbox do Asaas não ativa Pix Automático ([[sandbox-asaas-nao-ativa-pix-automatico]]). A classificação da ativação se apoia em "chega sem referência **e** sem instrução". Se em produção a ativação chegar **com** instrução, ela vira alarme — falso e barulhento. Está escrito no docblock como o falsificador nº 3, e entra no ensaio com clínica de teste.

---

## 1c. Resumo da sessão de 16/08/2026 (2ª) — passo 6: #311, o piso que já estava certo

Orquestração em **4 subagentes** (recon → builder → revisão adversarial com mutação → reparo). Branch nova `feat/311-piso-cobranca-medido`, **empilhada** sobre a `feat/310-…` (que segue sem push e sem PR). 1 commit. Nenhuma migração, nenhuma mudança de comportamento: o diff é de **verdade documental** e de **oráculo de teste**.

### A entrega não era o número — o número já estava certo

O passo 6 previa "ajustar a constante com a medição do passo 1 na mão", com a cláusula "se o Asaas não tiver mínimo próprio, a entrega vira **remover** a constante". A cláusula está **resolvida contra a remoção**: a Medição 6 da #321 (15/08, sandbox) sondou `POST /payments` PIX em `0.01`, `0.50`, `1.00`, `3.00` — todos **HTTP 400** com `invalid_object` e mensagem nomeada — e `5.00` → **HTTP 200**. O piso real é **exatamente R$ 5,00**, e `PISO_COBRANCA_AVULSA_CENTAVOS = 500` **coincide** com ele. Não é folga por cima.

O que estava errado, então, não era o valor: era o código **declarar-se não medido**. O docblock dizia "Este número é escolha conservadora, NÃO medição" e terminava pedindo, como verificação pendente, exatamente a medição que já tinha sido feita e escrita no runbook um dia antes.

**Dos 3 itens da DoD da issue, 2 já estavam cumpridos antes desta sessão** (o registro no `infra/README.md` veio com o runbook da #321; o teste de fronteira seguia verde porque o número não mudou). A substância real da entrega está fora da DoD: dar **oráculo** ao número.

### O que a mutação derrubou

Os dois casos de fronteira que já existiam (`decidirGate(PISO - 1)` → `adiar`, `decidirGate(PISO)` → `cobrar`) **importam a própria constante**. Medido: com `500 → 400`, os dois seguem **verdes** — eles provam `<` vs `<=`, nunca o número. Um caso novo com literais (`499` → `adiar`, `500` → `cobrar`) mata a mutação sozinho. A mutação de operador (`<` → `<=`) é morta por dois casos. Sem o literal, "medição" seria uma palavra no comentário sem nada que a defendesse — irmão direto de [[teste-verde-que-nao-testa-nada]].

### A regra é sobre o líquido, e essa parte é dedução

A mensagem crua do gateway enuncia `value − discount >= R$ 5,00`, não `value >= R$ 5,00`. Hoje as duas coincidem **só porque nenhum caminho de emissão do Iris envia `discount`** (verificado: o `POST /payments` do adapter monta cinco campos, e `discount` não aparece em `src/lib/billing/`). A consequência — uma cobrança de R$ 5,00 com R$ 1,00 de desconto passaria neste piso e seria recusada lá — é **dedução da mensagem, não medição**: as cinco sondagens rodaram todas com desconto R$ 0,00.

A primeira versão do docblock escreveu essa consequência no **indicativo**, junto dos fatos medidos e sem marcador. A revisão pegou, e o motivo é o próprio motivo da issue existir: **trocar "não medido" por afirmação não marcada reintroduz o defeito em escala menor**. Agora a fronteira entre medido e deduzido está escrita.

### Decisão fechada: a constante NÃO é renomeada

O comentário 1 da issue (14/08) pede `VALOR_MINIMO_COBRANCA_CENTAVOS`, "deixando 'piso' reservado ao conceito do Pix Automático". **Recusado**, e não por preferência: aquele comentário é **anterior** à D-E da #317, que já resolveu a mesma colisão com o par `PISO_COBRANCA_AVULSA_CENTAVOS` (o que **nós** cobramos) × `PISO_TETO_AUTORIZACAO_CENTAVOS` (o teto que o **pagador** autoriza). Executar o comentário ao pé da letra hoje **desfaria** uma decisão já entregue. Medido que os dois nomes não colidem: nunca aparecem no mesmo arquivo e nunca são importados juntos.

O que a revisão achou de verdade ali foi que a desambiguação era **unidirecional** — só `debito.ts` avisava "não confundir". Depois da #317 os dois passaram a carregar "medido em 15/08/2026 (#321)" com **sentidos opostos**, e quem chegasse por `calculator.ts` não recebia aviso nenhum. Agora as duas pontas se nomeiam.

### O registro cru é imutável — e a 1ª versão o contaminou

Em `infra/README.md`, só a **conclusão** da Medição 6 podia mudar (nome morto `PISO_COBRANCA_CENTAVOS`, ponteiro de linha `:41-55` que já não existia). A tabela e as respostas cruas foram preservadas byte a byte, confirmado no diff.

Mas a 1ª versão escreveu na conclusão "**A #311 foi fechada por esta medição, em 16/08/2026**" — duas coisas erradas de uma vez: a issue está **`open`** (o runbook afirmava consumado um evento que não ocorreu, sendo ele a âncora que o código cita), e a data injetada **colide com a da medição** (15/08), passando a ser a única data dentro daquele bloco. Corrigido para registrar a data da medição e não afirmar estado de issue que o arquivo não controla.

Também marcado como fechado o **RISCO-1** (`piso não medido`) em `.specs/features/debito-reativacao-290/design.md`, que continuava listado como aberto. `spec.md`, `premortem.md` e os planos em `docs/superpowers/plans/` **não** foram tocados de propósito: são registros point-in-time, e citam o nome morto por época, não por descuido.

### Verde medido

`pnpm test` **197 arquivos / 1317 testes** (era 1316 — o +1 é o oráculo literal) · `pnpm test:rls` **106 arquivos / 934 testes, 0 pulados** (idêntico à baseline da #310, como tinha de ser — nada tocou banco) · `debito.test.ts` **10/10** (eram 9) · `gate-debito.int.test.ts` **27 coletados / 27** (com `--config vitest.integration.config.ts`; sem ele coleta zero e sai verde) · `pnpm typecheck` limpo · `pnpm lint` **0 erros / 10 warnings** pré-existentes em `src/stories/**`.

---

## 1d. Sessão anterior (16/08/2026, 1ª) — passo 5: #310, a cobrança que já existia

Orquestração em **11 subagentes**. 8 commits, **sem push, sem PR**. O passo 5 da ordem de conclusão: o gate de reativação da #290 emitia cobrança nova sempre, inclusive para o ciclo cuja cobrança o Asaas **ainda mantém pagável** — as duas ficavam vivas, e a clínica podia pagar o mesmo ciclo duas vezes.

| Commit    | O quê                                                                        |
| :-------- | :--------------------------------------------------------------------------- |
| `3b11e26` | `chore(lint): stop linting the .next build nested in a worktree`             |
| `8be7cd9` | `refactor(billing): let the debt carry its cycles, not a dead charge id`     |
| `f2dc0ec` | `feat(billing): ask the gateway whether an existing charge is reusable`      |
| `a6e0666` | `feat(billing): let the gate answer with N charges, or with none`            |
| `7e20735` | `feat(billing): reuse the charge the payer can still pay`                    |
| `21e421b` | `fix(billing): cover the gate edges, and stop a 404 from locking the clinic` |
| `d1602b9` | `feat(assinatura): show every open charge, and say when one is in flight`    |
| `9eb6c0b` | `fix(billing): close the double charges the review found`                    |

### O que fixou o desenho foi a medição do contrato, não a preferência

A issue já trazia a decisão (a) — reaproveitar. O que **não** estava decidido era o que fazer quando o débito total é **maior** que a cobrança antiga, e esse é o caso **comum**, não a borda: no corte por carência congelam-se o ciclo `falhou` (que tem cobrança) e os `aberto`/`apurado` (que não têm).

Medido no MCP de docs do Asaas, e foi o que eliminou a alternativa mais óbvia:

- **Não existe rota para cancelar uma instrução pendente.** Literal: "O cancelamento ocorre apenas de forma indireta, por meio do cancelamento da autorização".
- **`DELETE /v3/payments/{id}` existe, mas a doc não lista quais status ele aceita**, e nada diz que aceita cobrança `OVERDUE` de Pix Automático.
- Confirmado o que sustenta a opção (a): "O Asaas mantém o link ativo com boleto e Pix Copia e Cola após o encerramento da retentativa", com `Payment` em `OVERDUE` e autorização **Ativa**.
- Janela crítica, literal: "O recebimento por outro meio fica bloqueado somente dentro da janela crítica: A partir das 22h de D-1 até o dia do vencimento D."

Consolidar tudo numa cobrança só exigiria cancelar a antiga — ou seja, desenhar contra um endpoint **não medido** para evitar cobrança dupla, que é como se produz cobrança dupla. Daí a decisão **D-2**: cada ciclo com cobrança viva vira uma forma de pagamento própria; o resto vira uma consolidada. O modelo de dados já suportava (âncora + `debito_agrupado_em`); o que mudou foi o gate devolver uma **lista**.

**A janela das 22h não é calculada por relógio (D-6).** O sinal é a existência de instrução `AWAITING_REQUEST`/`SCHEDULED` para aquela cobrança: se o banco já está com o débito a caminho, a tela não mostra código nenhum e diz para aguardar. Dispensa fuso, horário de verão e a suposição de que o relógio do container bate com o do Banco Central.

### As 7 decisões fechadas antes de planejar

`D-1` pagável = `PENDING`/`OVERDUE` **e** `deleted !== true` (não existe status "cancelada" no Asaas; `deleted` é o único marcador) · `D-2` acima · `D-3` 404 segue e emite, rede/5xx **não emite e não reativa** · `D-4` cobrança já paga liquida o ciclo ali mesmo, sem esperar o webhook · `D-5` `provider_charge_id` da âncora só é sobrescrito quando emitimos para ela · `D-6` acima · `D-7` estados terminais com ramo próprio, sem herdar o `throw` de `estornada`.

### A revisão adversarial derrubou a 1ª versão: 3 GRAVES, um deles regressão nossa

Todos corrigidos em `9eb6c0b`, cada um com teste que os reproduz.

1. **Reentrada no gate cobrava duas vezes — e fomos nós que introduzimos.** Com dois ciclos sem cobrança (A=R$13, B=R$7), a 1ª chamada emitia R$20 e agrupava B em A. Na 2ª, A era reaproveitado e **B parecia virgem** (ciclo agrupado nunca recebe `provider_charge_id`), virava âncora e ganhava um 2º POST de R$7. Duas cobranças vivas somando R$27 para dívida de R$20, e pagar a de R$20 quitava só R$13. Antes da #310 a âncora era sempre `ciclos[0]` e a idempotência por `externalReference` matava a 2ª emissão — **a divisão do débito é que abriu o buraco**. `levantarDebito` passou a carregar `debito_agrupado_em`, e ciclo agrupado segue a âncora em vez de virar uma.
2. **Ciclo liquidado pela cascata dentro do próprio laço era cobrado de novo.** Cobrança da âncora `RECEIVED` ⇒ `conciliarPagamentoDeCiclo` liquida a âncora **e** os agrupados; mas o laço iterava um **snapshot**, então o agrupado seguia para o conjunto (b) e ganhava POST por um ciclo já `pago`. O D-4 do plano mandava "recomputar o débito antes de decidir" e isso não tinha sido implementado. Agora o débito é relido do banco depois de qualquer liquidação — o snapshot é obsoleto por construção naquele ponto.
3. **A listagem de instruções trancava a clínica no caminho mais comum.** A cobrança que o próprio gate emite é Pix **comum**, sem instrução nenhuma; um 404 da listagem virava `bloqueado/gateway_indisponivel` e a clínica lia "tente novamente em alguns instantes" — que nunca resolve. 404/400 passaram a significar "não tem instrução"; 5xx, rede e timeout seguem fail-closed, porque aí o gateway não respondeu à pergunta.

**Regra que saiu da revisão e vale além desta issue: "não reaproveitável" ≠ "não pagável pelo cliente".** `DUNNING_REQUESTED`/`DUNNING_RECEIVED` são cobrança terceirizada e **seguem pagáveis pelo pagador**; a allow-list os classificava como não-reaproveitáveis e o gate emitia por cima de uma cobrança viva — fail-closed para o reuso, fail-**open** para a cobrança dupla. Agora **só o 404 libera o id**; todo outro desfecho bloqueia sem emitir.

### O que a mutação provou, e o que ela derrubou

Três testes **passavam em vácuo** e só apareceram porque a mutação foi medida, não presumida:

- O oráculo "não houve consulta de reuso" do plano casaria também o `GET /payments/{id}/pixQrCode` que **toda** emissão faz — o caso passaria contando o QR da cobrança que ele mesmo acabara de emitir.
- Os testes de D-5 e do negativo do DoD passavam com o gate **bloqueado**: nada acontecendo também deixa o `provider_charge_id` intacto. Ganharam asserção de que o reuso de fato ocorreu.
- O primeiro par de testes escrito para o achado 4+5 **sobreviveu ao mutante** ("manda para (b) mantendo o id") porque sem um ciclo virgem ao lado os dois comportamentos são indistinguíveis. Reescritos.

E o teste antigo de P-6 **codificava exatamente o bug do achado 1** — ele afirmava como correto o agrupamento que produzia a segunda cobrança.

### Baselines medidas, e uma que estava errada

`pnpm test` **197 arquivos / 1316 testes** · `pnpm test:rls` **106 arquivos / 934 testes, 0 pulados** · integração `src/lib/billing` **8 arquivos / 56** · `gate-debito.int.test.ts` **27/27** · `asaas.test.ts` **67** · `formulario-ativacao.test.tsx` **32/32** · `typecheck` limpo · `lint` **0 erros / 10 warnings**.

Duas correções de baseline entraram como higiene, e as duas eram vermelho herdado que teria sido confundido com regressão desta entrega:

- **`pnpm lint` acusava 39 erros**, todos vindos de `.worktrees/issue-312/.next/`: o padrão `.next/**` do flat config é **ancorado na raiz** e não pega `.next` aninhado. Zero erros em código-fonte. Ignorados `**/.next/**` (como o `.gitignore` já fazia) e `.worktrees/**`.
- **`vencimento.test.ts` estourava o teto de 5s** do vitest (roda em ~5,4s). Encolher a varredura de 730 dias para caber no default é o que **não** se pode fazer — ela é o único teste que pega o bug sazonal. O teto do caso subiu.

### `main` mudou embaixo da sessão

A branch nasceu de `main` às 11:28. Depois disso, **duas coisas entraram em `main`**:

- **#312 — aviso por e-mail no cancelamento — foi concluída de forma isolada**, fora desta linha de trabalho: PR **#334** (`feat/312-aviso-email-cancelamento`) mergeado em **16/08/2026 às 14:20**, issue **#312 fechada** no mesmo minuto. Leva junto o commit `2adad86`, que reforçou a suíte por teste de mutação depois da revisão. Ou seja: o passo 8 da ordem de conclusão **já está entregue**, e não precisa ser replanejado — o que a ordem previa (escrever a #312 depois da #319 para cobrir os dois gatilhos de corte) foi feito.
- **#329** (guard de tenant do escalonamento) via PR **#335**.

As duas foram mergeadas para esta branch e **validadas por medição** — typecheck, unit e integração — e não pela ausência de conflito. O merge veio limpo, e merge limpo não é prova: é exatamente o modo de falha do #305/#306, em que uma branch antiga reverteu trabalho de `main` sem conflitar.

---

## 1e. Sessão anterior (15/08/2026, 5ª) — #318 em código, D33 e D35 fechados

Orquestração em **6 subagentes**. 13 commits, **sem push, sem PR**. Três frentes: fechar a dívida de medição da #319 (**D33**), consertar o pipe do motivo de recusa (**D35**) e implementar a #318 inteira — classificação por código, coluna nova e o backstop de D+7 da Decisão 2.

| Commit    | O quê                                                                                |
| :-------- | :----------------------------------------------------------------------------------- |
| `30a2b11` | `test(billing): cover the fechar-ciclos route, ordering first (#319)`                |
| `448b404` | `fix(billing): read the Pix refusal reason from the payment instruction`             |
| `adc39c4` | `fix(billing): bind grace-period deadline as timestamptz (#319)`                     |
| `d2424e4` | `fix(billing): report the root cause of a failed cutoff, not the wrapped SQL (#319)` |
| `633623f` | `test(billing): assert the refusal reason before the resource it came from`          |
| `8f497ff` | `docs(migrations): diagnose the 37-migration hash drift on the local DB`             |
| `6a6bc27` | `docs(migrations): correct the hash guard docstring with measured numbers`           |
| `92aadb2` | `feat(billing): persist the raw refusal code on the billing cycle (#318)`            |
| `1c83ec1` | `feat(billing): route the refusal outcome by its gateway code (#318)`                |
| `c5480ee` | `test(billing): make the refusal log the oracle for the silent groups (#318)`        |
| `89bb61c` | `fix(test): type the console.warn spy by inference (#318)`                           |
| `dbd7cae` | `feat(db): store the due date we send to the gateway (0100, #318)`                   |
| `f0c1773` | `feat(billing): close the refusal hole with a D+7 backstop (#318)`                   |

### D33 — fechado na parte mensurável, e o que continua não medido

O Postgres local voltou. A `0098` **já estava aplicada** (pela sessão anterior, não por esta). Medido em `information_schema`/`pg_indexes`, não lido no diff: `column_default = '10'`, `is_nullable = NO`, e `subscription_carencia_idx` = `btree (status, past_due_desde)`.

- **12 casos de integração: 12/12, 0 pulados.** Armadilha que vale registrar porque custou uma passada: `pnpm vitest run <arquivo>.int.test.ts` **coleta zero testes e sai verde** — `vitest.config.ts` tem `exclude: ["**/*.int.test.ts"]`. O caminho é `--config vitest.integration.config.ts`. Suíte que não coleta nada é indistinguível de suíte que passa.
- **`pnpm test:rls`: 102 arquivos, 102 executados, 0 pulados**, 869 testes. O medo registrado em [[suite-rls-rodando-como-superusuario]] ("verde com 64/68 pulados") **não se materializou**.
- As 7 falhas de `src/app/(app)/equipe/convidar/logic.test.ts` eram só `ECONNREFUSED :5433` e **sumiram**: 7/7.

**Continua não medido, e o motivo importa: o backfill.** `subscription` tem **0 linhas** neste banco, então o `UPDATE … WHERE carencia_dias = 7` da `0098` tocou 0 linhas. Em base **com** dados — produção — o backfill segue não exercitado. Não converter isso em "funcionou": o que se mediu foi o DDL, não a migração de dado.

**Duas correções de código saíram da execução real, e nenhuma das duas era alcançável sem banco:**

- **`adc39c4` — o template `sql` do Drizzle não codifica `Date`** (`ERR_INVALID_ARG_TYPE` em runtime). O predicado de carência precisa de `${iso}::timestamptz`. **`toSQL()` nunca poderia ter pego isso**: ele renderiza o statement sem codificar parâmetro nenhum. É literalmente o buraco que o D33 nomeava — "provado por `toSQL()`, não por execução" era a descrição exata do defeito que estava lá.
- **`d2424e4` — a cadeia `??` herdada sobre `(e as any).detail ?? .hint ?? .originalError` era placebo.** `DrizzleQueryError` não tem nenhum dos três, então caía em `.message`, **que é o SQL que nós mesmos emitimos** — o job reportava a própria query como causa. Virou `detalharErro()`, que anda a cadeia `cause` até a raiz (teto de 8 níveis) e **anexa** `code`/`detail`/`hint` em vez de substituir `message`. Princípio que fica: `detail`/`hint` do Postgres **complementam** a mensagem, nunca a substituem.

**Correção metodológica:** `created_at` em `drizzle.__drizzle_migrations` **é o `when` do journal**, não o instante em que a migração rodou. Não serve para datar aplicação — nem para ordenar por tempo real.

### D35 — fechado: o motivo passou a ser lido do recurso que o tem

Confirmado no MCP de docs do Asaas: `GET /v3/pix/automatic/paymentInstructions/{id}` devolve `refusalReason` com `type: "string"` e **sem `enum`** — catálogo aberto **por contrato**, não por precaução nossa. O DTO tem `id`, `authorization{id,…}`, `paymentId`, `retryAttempt`, `purpose` e um `status` com enum **fechado** (`AWAITING_REQUEST|SCHEDULED|DONE|CANCELLED|REFUSED`).

Saíram as três leituras vazias de `asaas.ts:898-901`. Entraram:

- `EventoWebhookNormalizado.providerInstructionId` — o normalizador **já enxergava** `paymentInstruction.id` e o descartava;
- `consultarCobranca(id, { providerInstructionId })`, que consulta a instrução quando o id veio junto;
- fallback por `GET /pix/automatic/paymentInstructions?paymentId=…&status=REFUSED`. **O filtro `status=REFUSED` é load-bearing:** sob `ALLOW_THREE_IN_SEVEN_DAYS` uma cobrança tem **várias** instruções, e uma `SCHEDULED` não tem motivo nenhum para devolver.

**Degradação documentada, e é escolha:** falha ao buscar ⇒ `motivoRecusa: null` + `console.warn("[billing-recusa] …")`. O motivo é **enriquecimento**; quem decide o destino do ciclo é o `status`, que já veio no evento. Deixar o 404 subir faria a conciliação inteira falhar por um campo acessório — trocar dinheiro conciliado por diagnóstico.

**Fixtures inventadas migradas** para os códigos reais (`LIMITE_AUTORIZADO_EXCEDIDO` → `MAXIMUM_AMOUNT_EXCEEDED`, `SALDO_INSUFICIENTE` → `PAYMENT_OVERDUE`): `asaas.test.ts` (2), `route.int.test.ts` (2), `reprocessamento-provedor.int.test.ts` (2), `docs/superpowers/plans/2026-08-13-286-teto-pix-automatico.md` (4). E os dublês de **cobrança** passaram a **não ter campo de motivo nenhum**, como a produção — o dublê que devolvia o literal esperado era metade do defeito.

### #318, núcleo: a coluna e a classificação

**Migração `0099_billing_cycle_recusa_codigo`**, idx 99, `when` 1786819013377. Medido no banco: `text`, nullable, sem default; `column_privileges` = `app_role SELECT` · `iris_auth SELECT,INSERT,UPDATE`.

`src/lib/billing/classificacao-recusa.ts` separa **de propósito** duas coisas que a tabela da sessão anterior misturava:

- **`CATALOGO`** — fato do gateway: 9 grupos, 25 códigos.
- **`POLITICAS`** — decisão nossa: `marcaCicloFalhou`, `carimbaPastDue`, `conciliaComoPago`, `valeGastarRetentativa`, `corteImediato`, `diagnostico`, `copy`.

O catálogo muda quando o Asaas publica código novo; a política muda quando **nós** mudamos de ideia. Misturados, toda revisão de produto viraria edição de fato de gateway.

Assinatura: `classificarRecusa(codigo: string | null): PoliticaRecusa`. **G0 é o `?? "G0"` do lookup**, então código desconhecido **e** `null` caem no mesmo lugar sem ramo especial. Comparação **exata** (`trim` + caixa alta), sem `includes`/`LIKE` — casar por substring é o defeito que a issue existe para matar, um nível abaixo.

**G8 é correção de dinheiro, não classificação.** `liquidarCiclo` foi extraído e é o **mesmo** caminho do pagamento confirmado: ciclo → `pago` + `cobrado_em`, cascata de `debito_agrupado_em`, saída de `past_due` com `past_due_desde` zerado. Antes, `PAYMENT_ALREADY_DONE` virava `falhou` → `past_due` → **dívida congelada contra clínica adimplente**, com o gate da #290 barrando exatamente quem já tinha pago.

`reprocessarEventosPendentes` passou a informar `{ providerInstructionId }`, então a varredura de reprocessamento deixou de cair no fallback por índice.

**O achado que mudou o desenho dos testes:** no banco, **G6, G7 e G0 são indistinguíveis** — os três não escrevem nada. Medir só tabelas deixaria passar um mapa que jogasse G6 em G0. O **log virou o oráculo** desses três, com as asserções de pertinência ao grupo **no fim** de cada caso, para o oráculo comportamental morrer primeiro. 4 mutantes provados, entre eles `POLITICAS.G6.marcaCicloFalhou: false→true`, que mostra literalmente o dano que G6 evita.

### O backstop de D+7 (Decisão 2 implementada)

**Migração `0100`**: `billing_cycle.vencimento_cobranca timestamptz`, nullable **sem backfill**, `when` 1786820981475. Índice `billing_cycle_backstop_idx = btree (status, vencimento_cobranca)`. Escrita na **mesma instrução** que `provider_charge_id`/`cobranca_emitida_em`, com o **exato `Date`** passado a `emitirCobrancaDeCiclo` — não uma recomputação.

**Por que coluna nova, e não um marco existente — é erro de sinal, não gosto.** A emissão acontece de 2 a 10 dias úteis **antes** do vencimento (regra da #317), então D+7 contado de `cobranca_emitida_em` ou `apurado_em` cairia **antes** da data em que a clínica tinha de pagar — com folga no cluster de fim de ano, **a mesma sazonalidade do bug que a #317 fechou**. `cobrado_em` só existe depois de pago, e ciclo pago não precisa de backstop. Recalcular `vencimentoCobrancaDeCiclo(cobranca_emitida_em)` foi recusado por outro motivo: mexer no calendário bancário **reescreveria retroativamente** o vencimento de cobranças já emitidas.

**Ordem na rota interna: quarta e última** — reprocessar → fechar ciclos → carência → backstop. O argumento não é cosmético:

> O backstop carimba `past_due_desde = agora`; a carência é `past_due_desde + carencia_dias`; o CHECK só exige `>= 0`. Com o backstop **antes** da carência, uma clínica de carência **zero** seria carimbada e cortada **no mesmo tick**, sem um único dia de prazo — por um ato irreversível.

**O `falhou` é o elo que faltava.** `congelarCiclosComoDebito` não congela `aguardando_pagamento`; carimbar `past_due` sem levar o ciclo a `falhou` produziria corte com `levantarDebito = 0` e o gate da #290 aberto — exatamente a perda que a D-4 da #319 fechou no outro ramo.

**Fail-closed do G3:** corta só se `consultarVinculo` responder `cancelada` (mapeamento de `CANCELLED`/`REFUSED`/`EXPIRED`, `asaas.ts:225`). Barram o corte: `autorizada` (o código mentiu ⇒ vira G7), qualquer outro status incluindo o default `pendente`, rede/timeout/5xx, e ausência de `provider`/`provider_subscription_id`. **Toda degradação leva ao mesmo lugar seguro:** carimba (reversível por pagamento) e deixa o corte para a carência, 10 dias depois.

`route.test.ts` foi de **16 para 22** casos. Além da ordem, passou a provar **cada etapa chamada exatamente 1×** — o que mata a "correção" que duplica a chamada em vez de movê-la.

**Baselines finais, medidas:** unit `src/lib/billing` **138/138** · unit total **1251/1251** · integração **104 arquivos / 896 testes / 0 pulados** · `pnpm typecheck` limpo · `pnpm lint` 0 erros / 10 warnings pré-existentes.

### A deriva de hash: a premissa da sessão anterior estava invertida

Das **37 divergências** de hash no Postgres local: **35 são só fim de linha** (não 3, como se supunha), **2 são de conteúdo** (`0072`, `0073`), **0 sem arquivo em disco**.

**Causa medida:** `core.autocrlf=true` vindo do `gitconfig` do instalador do Git for Windows contra `* text=auto` — índice 100% LF, worktree misto (117 crlf / 14 lf), e `__drizzle_migrations` congelou o EOL vivo **no momento de cada aplicação**. A divergência corre **nos dois sentidos**. Falsificadas com evidência, não descartadas por plausibilidade: o algoritmo do drizzle-orm 0.45.2 é idêntico ao nosso; Prettier está fora (conteúdo byte-idêntico módulo `\r`); dump-restore está fora.

Medido de passagem: `0055_fix_purga_report_oracle` está no journal e **nunca foi aplicado aqui** — é o sintoma da #165, remediado pela `0063`, que **está** aplicada.

`0073` é **não-problema**: o hash local é byte-idêntico ao `hashAplicado` **de produção**; a edição do `b53b294` não rodou em lugar nenhum e a `0082` remediou.

**`0072_super_admin_role` é defeito real, e é de produção.** O hash local não corresponde a **nenhum blob do repositório** — varredura exaustiva de `git cat-file --batch-all-objects`, 919 candidatos, testados em LF **e** CRLF. Ou seja: rodou de working tree não commitado. O commit `f6e0884` acrescenta exatamente uma coisa: `CREATE POLICY alerta_risco_auth_select ON alerta_risco_clinico … TO iris_auth`.

Medido no banco local:

- policy **ausente** (`pg_policies` só tem `alerta_risco_scope`, para `{app_role}`);
- `relrowsecurity` e `relforcerowsecurity` ambos `true`;
- `has_column_privilege('iris_auth', …)` **`true`**.

**Grant presente + policy ausente = zero linhas, sem erro de permissão.** `src/app/(admin)/benjamin/queries.ts` lê por `authDb` (role `iris_auth`), então o painel Super Admin reporta `totalAlertas: 0` **em silêncio**. Não é provável por `count(*)`: a tabela está vazia e `0` é a resposta dos dois jeitos — a prova é `pg_policies` + `has_column_privilege`, não a contagem.

**Produção corre o mesmo risco, por inferência forte — e isso NÃO é medição.** O `hashAplicado` pinado de produção é exatamente o sha256 LF do blob **pré-fix**, e `alerta_risco_auth_select` é criada num único lugar em todo o repo. **Não medido** (sem acesso a produção nesta sessão): se a policy existe lá. Fecha com uma consulta read-only, via console Bash do `iris-postgres`, `psql -U iris -d iris`:

```sql
SELECT policyname, roles, cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'alerta_risco_clinico';
```

**Varredura de schema:** os 170 objetos declarados pelas 37 migrações divergentes foram conferidos em `information_schema`/`pg_policies`/`pg_proc`/`pg_indexes`/`pg_type` — **1 ausência genuína**, a de cima. Billing limpo. Diagnóstico completo em `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`. **Nada foi pinado em `DERIVAS_CONHECIDAS`** — silenciar 35 rótulos de EOL esconderia o 36º que for real.

---

## 1f. Sessão anterior (15/08/2026, 4ª) — passo 4: #318, a decisão de produto

Executado o **passo 4**: issue [#318](https://github.com/romulosutil/Iris/issues/318) — `REFUSED` colapsa causas distintas num único desfecho. O passo era **decisão de produto antes de código**: fechar a tabela código → desfecho e o checklist §5.2, depois aplicar a label `jules`.

A tabela está fechada e publicada na issue ([comentário](https://github.com/romulosutil/Iris/issues/318#issuecomment-5303443178)), e as três decisões que sobraram foram fechadas pelo tech lead num [segundo comentário](https://github.com/romulosutil/Iris/issues/318#issuecomment-5303503322), a pedido do Rômulo. **A label não foi aplicada, e não será** — o recon derrubou premissas que mudam o roteamento da issue para `/tlc-spec-driven`.

Orquestração em 3 subagentes paralelos: recon da issue e comentários (via `gh api`) × mapeamento do caminho da recusa no código × levantamento do catálogo oficial contra o MCP de docs do Asaas. Nenhum código alterado nesta sessão.

### As 3 correções materiais que o recon produziu

1. **O motivo nunca chega — o pipe está quebrado na origem.** O comentário de 14/08 na issue concluía "o motivo já é capturado e gravado, só é ignorado", e por isso estimava a issue como barata. Medido como falso: `consultarCobranca` (`asaas.ts:898-901`) lê `refusalReason` / `failureReason` / `pixTransaction.failureReason` do corpo de `GET /payments/{id}`, e o `PaymentGetResponseDTO` **não tem nenhum dos três** — `pixTransaction` é `string` (o id), não objeto, então o terceiro fallback não tem onde procurar nem no tipo. Do outro lado, `normalizarEventoAsaas` (`asaas.ts:378-473`) lê `paymentInstruction` só para ids e status, e descarta `refusalReason`. Em produção, `motivoRecusa` é `null` **por construção**. Uma tabela de classificação plugada hoje classificaria `null` para sempre — e passaria em todos os testes, porque os dublês devolvem o literal que o próprio teste espera.
2. **O catálogo é aberto, não enum fechado.** São 25 códigos publicados, mas o OpenAPI declara `refusalReason` como `string` **sem `enum`** e a doc avisa que valores entram sem aviso prévio. Ramo default deixa de ser zelo e vira requisito.
3. **A retentativa extradia é comandada por nós.** `ALLOW_THREE_IN_SEVEN_DAYS` (#317) só **habilita**; executar é `POST /pix/automatic/paymentInstructions/{id}/retries`, e as validações do endpoint são de contagem, data e política — **nenhuma de motivo**. Isso muda o sentido da coluna "é retentável" da tabela: ela não descreve o que o gateway faz sozinho, e sim **se vale gastar uma das 3 tentativas**. Orçamento finito é o que torna a classificação necessária. (O que é automático e não consome o orçamento é a retentativa **intradia** do banco do pagador, entre 18h e 21h.)

### A tabela: 25 códigos, 9 grupos

Grupos definidos por **desfecho**, não por origem: dois códigos ficam juntos se e somente se o sistema deve fazer a mesma coisa com eles.

| Grupo                                               | Carimba `past_due`?                       | Consome carência?  | Vale gastar retentativa?       | Clínica vê                                                          |
| :-------------------------------------------------- | :---------------------------------------- | :----------------- | :----------------------------- | :------------------------------------------------------------------ |
| **G1** Teto (`MAXIMUM_AMOUNT_EXCEEDED`)             | Sim                                       | Sim (10 d)         | Sim, só depois que ela agir    | Estado próprio (subir limite no banco), **não** a tarja de devedora |
| **G2** Saldo (`PAYMENT_OVERDUE`)                    | Sim                                       | Sim                | Sim — caso canônico do `3R_7D` | Mensalidade não paga + prazo                                        |
| **G3** Autorização morta (3 códigos)                | Não — **corte imediato**, com confirmação | Não (carência = 0) | Não                            | Autorização inválida + reativar                                     |
| **G4** Cadastral da clínica (3 códigos)             | Sim                                       | Sim                | Depois da correção             | CPF/CNPJ não confere + corrigir                                     |
| **G5** Conta terminal (`ACCOUNT_CLOSED`/`_BLOCKED`) | Sim                                       | Sim                | **Não**                        | Conta encerrada + outra conta                                       |
| **G6** Defeito nosso (9 códigos)                    | Não                                       | Não                | Só depois do conserto          | **Nada**                                                            |
| **G7** Operacional (5 códigos)                      | Não — só o backstop de D+7                | Só a partir de D+7 | Sim                            | Nada até D+7; depois igual a G2                                     |
| **G8** Já resolvido (`PAYMENT_ALREADY_DONE`)        | Não                                       | Não                | Não                            | Ciclo concilia como **pago**                                        |
| **G0** Desconhecido (default)                       | Não — só o backstop de D+7                | Só a partir de D+7 | Sim                            | Igual a G7                                                          |

**A regra que gera a 1ª coluna** (vale para a tabela inteira, e é o que a torna ensinável):

> Carimba `past_due` no ato quando a recusa é, **por si só, prova de um fato sobre a clínica sobre o qual ela pode agir**. Não carimba quando a recusa não prova nada sobre ela.

G1 (o limite é dela), G2 (a conta dela não tinha saldo), G4 (o documento é dela) e G5 (a conta é dela) provam. G6 prova algo sobre **nós**; G7 prova algo sobre o **banco**; G0 não se sabe.

Quatro decisões que sustentam a tabela e não são óbvias:

- **G1 carimba `past_due` de propósito.** O instinto é poupar quem "tem saldo e quer pagar", mas sem carimbo a assinatura nunca é cortada e um teto baixo demais vira assinatura gratuita vitalícia, sem erro em lugar nenhum. Os 10 dias **são** o prazo para subir o limite. O que muda em relação a G2 não é o relógio — é a copy e o estado de UI.
- **G3 corta na hora, mas nunca só pelo código.** Antes de cancelar, reconsultar `GET /pix/automatic/authorizations/{id}` e só cortar se o gateway **disser** `CANCELLED`/`EXPIRED`/`REFUSED`; se responder `ACTIVE`, o código mente e o caso vira G7. É o mesmo fail-closed que a #319 construiu em `cancelarVinculo`. Sem o guard, código espúrio revoga autorização — e revogação não volta sem novo consentimento no app do banco.
- **G6 não move estado nenhum**, e não é só "não carimba `past_due`": o ciclo **não vai para `falhou`**. Motivo concreto: `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` (retentativa nossa mal emitida) chega **depois** da recusa de saldo que já carimbou `past_due` corretamente. Deixar G6 escrever apagaria o estado certo com erro nosso.
- **G7/G0 não escalam por contador, escalam por prazo** — ver a Decisão 2 abaixo, que substituiu o desenho original.

E uma correção de dinheiro que a classificação encontrou de brinde: **`PAYMENT_ALREADY_DONE` significa cobrança liquidada.** Hoje viraria `falhou` → `past_due` → dívida contra clínica adimplente.

### Os 5 pontos abertos do §5.2, fechados

- **Metade cara (reemissão) não entra na #318** — vira issue própria, junto da #322. Mas as decisões abaixo ficam fechadas agora porque determinam o estado de UI que a #318 já precisa desenhar.
- **Quem dispara: a clínica, por botão** ("Já ajustei o limite"), nunca varredura. O guia **proíbe** o banco de notificar que o cliente ajustou o teto — não existe sinal para varredura observar, e varredura cega queimaria as 3 tentativas sem informação. A clínica é o único sensor que existe.
- **Limites da reemissão: 3 por ciclo, no máx. 1 por dia, nenhuma depois de D+7 do vencimento.** Não é escolha nossa — é o teto do `3R_7D`, e o gateway devolve 400 em cada borda. Botão **desabilitado com motivo escrito** ao atingir qualquer uma, em vez de deixar a clínica tocar para receber erro de gateway.
- **Idempotência:** não comandar se já houver instrução pendente (`AWAITING_REQUEST`/`SCHEDULED`) — o gateway recusaria com `PAYMENT_ALREADY_SCHEDULED`, que é G6, defeito nosso.
- **Copy sem citar valor** (o teto é ilegível por regulação). Regra que vale para os 9 grupos: **dizer o que fazer e onde, nunca o código** — a própria doc do Asaas orienta não expor o código bruto.

### As 3 decisões que ficaram pendentes, fechadas pelo tech lead

Rômulo pediu a decisão em vez da consulta. Nenhuma volta como "a validar" — o §5.2 existe para que o executor não escolha por nós. **Duas das três mudaram ao serem decididas de verdade**, e a razão da mudança é a parte que importa.

**Decisão 1 — G5 RATIFICADA, por outro motivo.** `ACCOUNT_CLOSED`/`ACCOUNT_BLOCKED` seguem carimbando, consumindo carência e nunca gastando retentativa. Mas a justificativa "implemento a intenção da DoD, não a letra" era **fraca** — vira licença para reinterpretar qualquer DoD. Substituída pela regra geral da 1ª coluna (acima): conta encerrada é fato sobre a clínica tanto quanto saldo zerado, e por isso carimba. **Restrição inegociável que sai junto:** `ACCOUNT_BLOCKED` **não** pode disparar o corte imediato do G3 — bloqueio é frequentemente temporário (judicial, antifraude, revisão cadastral), e o corte revoga a autorização, que não volta sem novo consentimento. Cortar na hora por um bloqueio que se resolve em 3 dias troca problema reversível por irreversível.

**Decisão 2 — o contador de 3 CAI. Entra prazo: um ciclo não pago em D+7 do vencimento carimba `past_due`, qualquer que tenha sido o motivo — exceto G6.** O contador tinha três defeitos que só apareceram ao tentar defendê-lo:

1. **Não conta nada enquanto a #322 não existir.** Sem orquestração de retentativa, cada ciclo produz **uma** recusa; o contador nunca chegaria a 3 e o banco que erra sempre viraria assinatura gratuita vitalícia — exatamente o buraco que ele foi inventado para tapar. Guard que só funciona depois de outra issue entrar não é guard.
2. **Depende de quantos webhooks o gateway resolve mandar**, fato não medido (#321) e fora do nosso controle. Régua que se move sozinha.
3. **Precisaria de persistência** — uma coluna de contador, mais schema para medir a coisa errada.

O prazo não tem nenhum dos três, e **o número não é escolha**: em D+7 o `POST .../retries` passa a devolver 400 pelo limite `7D`, então o trilho automático está **provadamente** esgotado, seja qual for o motivo original. O que a recusa operacional compra é **tempo, não imunidade** — o banco ter falhado não faz a mensalidade deixar de ser devida. `past_due_desde` recebe o instante do carimbo (D+7), não a data da recusa: o relógio começa quando concluímos que a clínica deve, então ela fica com 7 + 10 = 17 dias, e isso é intencional. **G6 não tem backstop, deliberadamente:** defeito nosso é custo nosso, e cobrar a clínica por um `dueDate` que **nós** calculamos seria carimbá-la de inadimplente pelo nosso bug. Roda como varredura na rota interna, **depois** de `fecharCiclosVencendo` (mesma regra de ordem da #319). Régua de mutação: um teste em D+6 que não carimba, um em D+7 que carimba, medindo a coluna.

**Decisão 3 — coluna `billing_cycle.recusa_codigo text` APROVADA, e a razão não é relatório.** A justificativa pela consulta da DoD também era fraca (DoD se afrouxa). A razão real é que a coluna é **estrutural para a 4ª coluna da tabela**: a classificação acontece na escrita, a tela lê depois, noutro request — sem o código persistido o app não sabe por que o ciclo falhou, o G1 nunca renderiza "suba o limite no seu banco", e os 9 grupos passam a diferir só em log. A consulta da DoD é sintoma; o requisito é a UI. `LIKE` sobre `erro` está descartado sem discussão: texto livre cobrindo situações distintas **é o defeito que a issue existe para matar**. Guarda o **código cru**, grupo derivado em código — do cru sempre se re-deriva o grupo, do grupo não se recupera o cru.

SQL medido nas migrações (não em `information_schema` — sem Postgres nesta máquina): `billing_cycle` tem privilégio **de tabela** (`0071:237` para `app_role`, `0071:244` + `0075:67` para `iris_auth`) e **nenhum `REVOKE` jamais tocou esta tabela**, então a coluna nova já entra coberta. Emitir os `GRANT` explícitos mesmo assim, seguindo o idioma de `subscription` (`0088:28-29`, `0089:33-34`) e não o da própria `billing_cycle` (`0097` não emitiu nenhum): custo de uma linha, e sobrevive ao dia em que alguém converter a tabela para granular. Nullable sem default, igual a `erro` (`0071:106`). Nenhuma policy muda (são por linha, só citam `clinic_id`); não há view sobre a tabela; `billing_apurar_ciclo` faz `SELECT` com lista explícita, sem `CREATE OR REPLACE`. Caminho canônico é `pnpm db:generate` e depois editar o `.sql` para os `GRANT`, **sem tocar no snapshot**. Próxima tag `0099`, idx 99.

**Consequência de processo:** a #318 sai da rota `jules` e vai para **`/tlc-spec-driven`**. Não é perda — a tarefa 0 também não era entregável por executor autônomo, por não ser verificável em sandbox.

### O que falta, em ordem

1. Migrar as fixtures inventadas para os códigos reais (não depende de nada, pode ir primeiro).
2. Tarefa 0: ler `paymentInstruction.refusalReason` pelo recurso certo, com o `paymentInstruction.id` que o webhook já entrega e o normalizador descarta. Remover a leitura sobre `GET /payments/{id}` — não é defensiva, é vazia.
3. Migração `0099_billing_cycle_recusa_codigo` + gravação de `recusa_codigo` no ramo `recusada`.
4. `classificarRecusa(codigo) → grupo` em `subscription.ts:1236`, governando as três decisões que hoje são incondicionais: texto do `erro`, se o ciclo vai a `falhou`, se o bloco de carimbo roda.
5. Varredura do backstop de D+7 na rota interna, depois de `fecharCiclosVencendo`.
6. UI por grupo — sem ela os 9 grupos diferem só em log. Cruza com a #312 e com o **D36**.

Um teste por grupo, com régua de comportamento: apagar a linha daquele grupo no mapa derruba **aquele** teste e nenhum outro.

---

## 1g. Sessão anterior (15/08/2026, 3ª) — passo 3: #319

Executado o **passo 3**: issue [#319](https://github.com/romulosutil/Iris/issues/319) — `past_due` era terminal, a carência nunca corria, e a máquina de dívida da #287/#290 era alcançável **só** por revogação voluntária no app do banco. Quem simplesmente parava de pagar escrevia para sempre.

Orquestração em subagents: recon → plano → dois builders em paralelo (migração × varredura) → builder de testes → revisão adversarial → reparo. Plano versionado em `docs/superpowers/plans/2026-08-15-319-carencia-que-nunca-corre.md`.

### O fato medido que derrubou a premissa da própria issue

O corpo da #319 afirma "7 dias de retentativa + 7 de carência = **14 dias** de escrita livre". Falso. `subscription.ts` carimba `pastDueDesde: assinatura.pastDueDesde ?? agora` — preserva o **primeiro** carimbo. A assinatura vira `past_due` na primeira recusa, então as retentativas `ALLOW_THREE_IN_SEVEN_DAYS` do #317 correm **dentro** da carência, não antes dela. As janelas se sobrepõem; não somam. A decisão de dimensionamento mudou por causa disso.

### O que entrou

| Commit    | O quê                                                                                                                        |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `eea42ea` | `carencia_dias` 7 → 10 (migração `0098`, com backfill à mão restrito a `= 7`) + índice `subscription_carencia_idx`           |
| `061a147` | `cancelarAssinaturasComCarenciaVencida` + encaixe na rota interna + guard do ramo `recusada` + `cancelarVinculo` idempotente |
| `2d9e486` | 12 casos de integração em `carencia-vencida.int.test.ts` + plano versionado                                                  |

### As 5 decisões da issue, fechadas com o Rômulo

- **D-1 Onde roda a varredura.** Na rota interna `/api/internal/billing/fechar-ciclos`, como **3ª chamada**, depois de `fecharCiclosVencendo`. A ordem é a regra: fechar ciclos é o que produz as recusas do dia, e varrer antes cortaria uma clínica cuja cobrança ainda ia ser tentada — sendo que o corte revoga a autorização, que não volta sem novo consentimento. O `.mjs` segue gatilho magro.
- **D-2 `cancelarVinculo`: chamar, fail-closed.** Revoga no gateway **antes** de escrever. Falha ⇒ a assinatura **não** transiciona, fica em `past_due` e a passada seguinte tenta de novo. Recusado o best-effort: deixaria autorização viva no Asaas com assinatura morta no Iris.
- **D-3 Carência 7 → 10 dias.** 7 da janela de retentativa + 3 de folga, para a última das três tentativas liquidar antes do corte. Backfill seguro porque nenhuma tela jamais escreveu essa coluna.
- **D-4 Ciclo `falhou` vira `devido`.** É o que fecha o buraco — `congelarCiclosComoDebito` só pegava `aberto`/`apurado`, deixando de fora justamente o ciclo que não foi pago. **Efeito colateral assumido:** a cobrança antiga segue `OVERDUE` e pagável no Asaas, então existe janela de cobrança dupla até a **#310** entrar.
- **D-5 Aviso ao cliente fora de escopo.** Vai para a **#312**, que a ordem de conclusão já prevê escrever depois do #319 para cobrir os dois gatilhos de corte com copy diferente de uma vez.

### A armadilha nova que o desenho encontrou

`pastDueDesde` **precisa** ser zerado no corte. Se sobrevivesse, a assinatura reativada mais tarde voltaria a `past_due` numa recusa futura, o `?? agora` preservaria o carimbo **velho**, a carência nasceria vencida e o corte seria imediato na primeira recusa. Mesma classe do `cancelada_em` não limpo na reativação (que fez o 2º pro-rata saturar no piso de 1 dia). O teste de ida-volta-ida sozinho **não** mata esse mutante — `aplicarStatusProvider` zera o carimbo em toda transição que não seja para `past_due`; quem mata é a asserção intermediária, medindo a coluna logo depois do corte.

### Revisão adversarial: 3 GRAVES, todos corrigidos antes do commit

1. **Ordem de escrita irrecuperável.** O congelamento rodava **depois** do `UPDATE canceled`. Falhando ali, a linha já era `canceled`, a próxima passada não a selecionava (o predicado é `status = 'past_due'`) e **nada mais congelava**: `levantarDebito` = 0, gate da #290 aberto, clínica cortada reativando de graça — exatamente a perda que a D-4 existe para fechar. Agora é revogar → congelar → gravar, com os dois últimos na mesma transação.
2. **Não era fail-closed, era loop preso.** `cancelarVinculo` é um `DELETE` cru e o helper converte qualquer não-2xx em throw. Se o Asaas processasse e a resposta se perdesse — ou se o cliente já tivesse revogado no app do banco — toda passada responderia 404 e a assinatura **nunca** seria cortada, com `past_due` liberando escrita. Agora 404 conta como sucesso (o objetivo já está atingido) e 400 reconsulta o `GET`, aceitando só se o gateway **disser** `CANCELLED/REFUSED/EXPIRED`. Rede, timeout e 5xx seguem barrando.
3. **O corte era reversível por não pagar.** Defeito **pré-existente** que só a #319 torna alcançável: o ramo `recusada` de `conciliarPagamentoDeCiclo` gravava `past_due` **sem guard de status** (o ramo `paga` tem). Clínica cortada → pede o débito da #290 → não paga → cobrança vai a `OVERDUE` → a assinatura **voltava** de `canceled` para `past_due`, recuperando escrita e ganhando 10 dias novos. Guard acrescentado.

Mais quatro achados menores fechados: erro do resultado agora distingue em que etapa falhou (gateway × congelamento × escrita); varredura ganhou ordenação (mais antigo primeiro) e teto por passada, com o truncamento subindo no corpo JSON e não só no `console.warn`; comentário do piso corrigido.

### ⚠️ O que esta entrega **não** tem

**Nenhuma verificação contra banco.** O Postgres local recusa conexão em 5433 e o daemon do Docker não sobe nesta máquina. Portanto:

- a migração `0098` **não foi aplicada** — não há prova em `information_schema` do default 10, nem em `pg_indexes` do índice novo, nem contagem de linhas afetadas pelo backfill;
- os **12 casos de integração nunca rodaram**. Confirmado só que coletam e pulam limpo com `ALLOW_SKIP_INTEGRATION=1` (`12 skipped`). Verde de suíte gated não é prova de nada — os valores (3900, 1300, a borda inclusiva `<=`) seguem por confirmar;
- o predicado `past_due_desde + make_interval(days => carencia_dias) <= agora` foi provado por `toSQL()` (o SQL emitido é válido e o driver não quebra o bind), **não por execução**.

Verde do que roda: `pnpm typecheck` limpo · `pnpm lint` 0 erros (10 warnings pré-existentes em `src/stories/**`) · `pnpm vitest run src/lib/billing` 133 passando · `src/db/migrations.test.ts` 8 passando.

---

## 1h. Sessão anterior (15/08/2026, 2ª) — passo 2: #317

Parâmetros que só existem na criação da autorização: `minLimitValue` (R$ 39,00, derivado de `FAIXAS_PRECIFICACAO[0]`) + `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"`; `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS`; `vencimentoCobrancaDeCiclo` + `calendario-bancario.ts` com feriados móveis calculados da Páscoa. Commits `a2b3e36`, `792bff1`, `dd9efb7`, `597128c`.

O bug sazonal do caminho: `vencimento: somarDias(agora, 5)` somava **dias corridos** — atravessando Carnaval ou o cluster de fim de ano, cinco corridos deixam menos de dois dias úteis de antecedência (recusa `RECEIVED_TOO_LATE`). Verde o ano inteiro, vermelho em fevereiro e dezembro. A regra nova satisfaz a metade mais restritiva de cada leitura da doc: **piso em dias úteis bancários, teto em dias corridos**.

Revisão adversarial pegou 4 defeitos, todos corrigidos: faltavam 24/12 e 31/12 (os dois dias bancários-e-não-civis, que é exatamente a distinção que o módulo diz fazer — sem eles, 8 fechamentos em 2026-27 caíam para 1 dia útil); a varredura de 730 dias era tautológica (importava as constantes que deveria vigiar); teto da janela e `diasCorridosEntre` sem cobertura; faltava o teste de cluster de fim de ano que o comentário 2 da issue pedia.

Decisões: **D-A** `minLimitValue` deriva de `FAIXAS_PRECIFICACAO[0]`, não de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` (LEGADO) · **D-B** só a flag, orquestração é a **#322** · **D-C** janela conservadora sem medição · **D-D** `carencia_dias` fica em 7 e redimensionar é pauta da #319 — **resolvido nesta 3ª sessão: virou 10** · **D-E** rename do piso, número e comentário seguem escopo da **#311**.

---

## 1i. Sessão anterior (15/08/2026, 1ª) — passo 1: #321

Sessão de medição no sandbox do Asaas (`api-sandbox.asaas.com/v3`, chave `$aact_hmlg_`).

### Achado estrutural que muda o planejamento

**O sandbox do Asaas não permite ativar uma autorização de Pix Automático.** O simulador `pix/qrCodes/pay` trava em `AWAITING_CRITICAL_ACTION_AUTHORIZATION`; `/transfers/{id}/authorize` devolve 404; o token `000000` não move o estado. Existem 3 endpoints de simulação — `myAccount/approve`, `payment/{id}/confirm`, `payment/{id}/overdue` — e nenhum toca autorização. Consequência: **todo o trilho de débito headless é imensurável fora de produção**.

| #   | Pergunta                                             | Veredito                                                                                                       |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `minLimitValue: 39.00` sem `value` é aceito?         | **Medido — sim.** 200, persiste, `value: null`. Recorrência com dois valores distintos: **não medido**         |
| 2   | Pagador conclui sem preencher teto?                  | **Não medido** — exige app de banco. A API não expõe nem aceita teto, só `minLimitValue`                       |
| 3   | `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` é aceito? | **Medido — sim**, com eco na resposta. `NOT_ALLOWED` no código era escolha, não limitação                      |
| 4   | Janela de 2 dias: úteis ou corridos?                 | **Não medido.** O 400 de autorização inativa dispara antes da checagem de janela                               |
| 5   | `dueDate` em sábado/domingo/feriado é aceito?        | **Medido no trilho avulso — os três aceitos (200)**, sem empurrão para dia útil. Trilho automático: não medido |
| 6   | Menor `value` num PIX avulso?                        | **Medido — piso real R$ 5,00**, sobre `value − discount` (líquido)                                             |
| 7a  | `externalReference` na cobrança de ativação?         | **Medido que não serve.** `immediateQrCode` não tem o campo                                                    |
| 7b  | Onde pousa o código de recusa?                       | **Medido — `paymentInstruction.refusalReason`**. Payload do **webhook**: não medido                            |

### Armadilhas medidas (valem para quem vier depois)

- **Campo desconhecido passa 200 e some.** `maxLimitValue` inventado foi aceito e não voltou na resposta. **Eco na resposta é o único teste de que um campo existe.**
- **Forçar vencimento reescreve `dueDate`** e preserva `originalDueDate`.
- Taxa Pix de R$ 0,99 sobre cobrança no piso → `netValue: 4,01`, ~20% do débito.
- O piso **não** se aplica ao QR de ativação: `originalValue: 0.01` foi aceito.

---

## 2. Estado do Repositório & Branch

- **Branch atual:** `feat/322-orquestracao-retentativa` — nascida de `main` (`a7d6e4e`), **6 commits próprios**, 0 atrás de `origin/main`, árvore limpa.
- **Arquivos novos desta sessão:** `db/migrations/0106_billing_cycle_retentativa_extradia.sql` (+ snapshot e journal), `src/lib/billing/retentativa-data.ts` (+ `.test.ts`), `src/lib/billing/retentativa-extradia.int.test.ts`, `src/lib/billing/classificacao-recusa.test.ts`, `docs/superpowers/plans/2026-08-16-322-orquestracao-retentativa.md`. **Tocados:** `src/db/schema.ts`, `src/lib/billing/{subscription,classificacao-recusa,calendario-bancario}.ts`, `src/lib/billing/provider/{types,asaas}.ts` (+ `asaas.test.ts`), `src/app/api/hooks/asaas/route.ts`, `src/app/api/internal/billing/fechar-ciclos/route.ts` (+ `.test.ts`), `scripts/fechamento-ciclo-billing.mjs` (+ `.test.mjs`), `db/tests/provedor-fake.ts`.
- ✅ **Migração `0106` aplicada e medida** no Postgres local: as 3 colunas conferidas em `information_schema.columns` (`retentativas_comandadas integer NOT NULL DEFAULT 0`, `ultima_retentativa_em timestamptz`, `ultima_retentativa_vencimento date`), grants em `column_privileges` e `created_at` do `__drizzle_migrations` batendo com o `when` do journal. ⚠️ **Correção do plano medida no banco:** em `billing_cycle` quem escreve é **`iris_auth`** (`SELECT/INSERT/UPDATE`); `app_role` recebe **só `SELECT`** — o plano dizia `UPDATE` para `app_role` e estava errado. Precedente nas `0100`/`0101`.
- **Baselines medidas nesta sessão:** `pnpm test` **201 arquivos / 1396 testes** · integração **242 suites / 971 testes, 0 falhas** · `pnpm test:rls` **107 arquivos / 971 testes, 0 pulados** · `typecheck` limpo · `lint` **0 erros / 10 warnings** pré-existentes (`src/stories/**`, `app/error.tsx`, `header.tsx` — não tocados).
- ⚠️ **A #322 continuava dizendo que dependia da #317** e que a carência era de 7 dias. Os dois pontos estão superados; quem reler a issue depois do merge precisa do §1 para não replanejar contra o corpo.

### Estado da branch anterior

- **`fix/289-erro-aplicacao-discriminador`** — **mergeada**: PR [#347](https://github.com/romulosutil/Iris/pull/347) entrou em `main` (`a7d6e4e`) e a **issue #289 fechou**, conferido por `gh api` ([[pr-em-pt-br-nao-fecha-issue]]). Os itens 4 e 9 do checkpoint anterior estão **consumados**.
- **Commits desta sessão (7):** `52b188d`, `6e70935`, `d63c2fe` (núcleo, sessão anterior interrompida) + `ab05a04`, `8b1e9c5`, `b16da8c`, `2d63e1c` (reparo dos 5 achados). Tabela com os subjects em §1.
- **Arquivos novos:** `src/lib/billing/erro-aplicacao.ts`, `src/lib/billing/erro-aplicacao.test.ts`. Tocados: `src/app/api/hooks/asaas/route.ts` (+ `route.int.test.ts`), `src/lib/billing/subscription.ts`, `src/lib/billing/debito.ts`, `reprocessamento-provedor.int.test.ts`, `fechamento-provedor-por-linha.int.test.ts`, `src/app/(app)/assinatura/gate-debito.int.test.ts`. **Nenhuma migração** — `src/db/schema.ts` volta ao estado de `main` (a nota do `d63c2fe` saiu de lá para o módulo).
- ✅ **`#310` e `#311` fecharam** (PRs #339 e #340 mergeados em 16/08 às 21:23 e 21:28). Conferido por `gh api`, não presumido pelo `Closes` ([[pr-em-pt-br-nao-fecha-issue]]). Os itens 2 e 3 da §3 do checkpoint anterior estão **consumados**.
- ⚠️ **`pnpm test` tem 1 caso flaky sob carga**: `disponibilidade-editor` (a11y, `semViolacoes`) falhou em **1 de 2 execuções** da suíte cheia (a 2ª deu **199/199 arquivos, 1339/1339 testes**) e passa **10/10 em isolamento**. A falha é `color-contrast` do `axe-core` — sensível a carga. Fora do diff desta branch: flake de ambiente, medido nas duas direções, não regressão.
- **Baselines medidas nesta sessão:** `pnpm test` **199 arquivos / 1339 testes** · integração dos 4 arquivos tocados **13 suites / 74 testes, 0 falhas** · `typecheck` limpo · `lint` 0 erros / 10 warnings pré-existentes. **`pnpm test:rls` não foi rodado** — nada tocou banco, policy nem migração.
- **Branch anterior:** `feat/311-piso-cobranca-medido` — **pushada**, PR [#340](https://github.com/romulosutil/Iris/pull/340) aberta, 1 commit próprio. ⚠️ **Nasceu da `feat/310-…`, não de `main`** (empilhada), e a PR **também tem `base = feat/310-…`**, para que o diff mostre só os 6 arquivos desta entrega. Foi escolha de tech lead: o `checkpoint.md`/`BACKLOG.md` da #310 só existem naquela branch, e sair de `origin/main` produziria dois históricos de doc divergentes — que é como se apaga trabalho num merge limpo ([[merge-sem-conflito-apaga-feature-mergeada]]). Consequência assumida: **a `feat/311` contém os 11 commits da `feat/310`**, e o GitHub só reaponta a #340 para `main` quando a #339 fechar.
- **Branch anterior:** `feat/310-reaproveitar-cobranca-gate` — **pushada**, PR [#339](https://github.com/romulosutil/Iris/pull/339) aberta contra `main`, 8 commits próprios + docs, nascida de `main` e com `origin/main` já mergeada (traz #312 e #329). Só a #310; não acumula passos.
  - ⚠️ **Keyword de fechamento em inglês** nas duas PRs: `Closes #310`, `Closes #311`. "Fecha #310" mergeia e deixa a issue **aberta em silêncio**. E a keyword da #340 **só dispara quando a base virar `main`** — conferir `gh issue view 311` depois do merge, não presumir.
- **O passo 5 anterior (`feat/317-parametros-autorizacao-pix`) já foi mergeado:** está 0 commits à frente de `main` e 24 atrás. #317, #319 e #318 estão em `main`, com as migrações renumeradas para `0099`/`0100`/`0101`. O checkpoint anterior dizia "28 commits sem push" — **desatualizado, não confiar**.
- **`fix/329-escalonamento-guard-tenant` também já entrou** (PR #335), e a **#312 fechou isolada** (PR #334, 16/08 14:20).
- **Commits da sessão de 15/08 (5ª), 13:** `30a2b11`, `448b404`, `adc39c4`, `d2424e4`, `633623f`, `8f497ff`, `6a6bc27`, `92aadb2`, `1c83ec1`, `c5480ee`, `89bb61c`, `dbd7cae`, `f0c1773` (+ o de docs que fecha a sessão). Tabela com os subjects em §1.
- **Sessão de 15/08 (4ª, passo 4 / #318): nenhum código alterado** — a entrega foi decisão de produto, publicada como comentário na issue.
- **Commits da sessão de 15/08 (3ª):** `eea42ea`, `061a147`, `2d9e486` (+ o de docs que fecha a sessão).
- **Arquivos novos da 5ª sessão:** `db/migrations/0099_billing_cycle_recusa_codigo.sql` e `0100_billing_cycle_vencimento_cobranca.sql` (+ snapshots e journal), `src/lib/billing/classificacao-recusa.ts`, `src/lib/billing/classificacao-recusa.int.test.ts`, `src/lib/billing/backstop-prazo.int.test.ts`, `src/app/api/internal/billing/fechar-ciclos/route.test.ts`, `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`.
- **Arquivos novos das sessões anteriores:** `db/migrations/0098_subscription_carencia_dez_dias.sql` (+ snapshot), `src/lib/billing/carencia-vencida.int.test.ts`, `docs/superpowers/plans/2026-08-15-319-carencia-que-nunca-corre.md`.
- ✅ **O Postgres local está no ar e as migrações estão aplicadas** — `0098`, `0099` e `0100` verificadas em `information_schema`/`pg_indexes`/`column_privileges`. As 7 falhas de `src/app/(app)/equipe/convidar/logic.test.ts` eram `ECONNREFUSED :5433` e **sumiram** (7/7).
- **Baselines medidas nesta sessão:** unit `src/lib/billing` **138/138** · unit total **1251/1251** · integração **104 arquivos / 896 testes / 0 pulados** · `pnpm test:rls` **102 arquivos / 102 executados / 0 pulados**, 869 testes · `typecheck` limpo · `lint` 0 erros / 10 warnings pré-existentes em `src/stories/**`.
- ⚠️ **`pnpm vitest run <arquivo>.int.test.ts` coleta ZERO testes e sai verde** — `vitest.config.ts` tem `exclude: ["**/*.int.test.ts"]`. Integração só roda com `--config vitest.integration.config.ts`. Conferir o número de testes coletados, não a cor.
- ⚠️ **`git status` mostra 5 arquivos modificados com `git diff` vazio** — é o `core.autocrlf` da deriva de hash (§1), não mudança pendente.
- **Não versionado (pendente de decisão do Rômulo):** `.mcp.json` (aponta para o MCP de docs do Asaas) e `docs/daily-summary/2026-08-14.md`.
- **Memória gravada:** `sandbox-asaas-nao-ativa-pix-automatico.md`, `janela-dia-util-24-12-e-31-12.md`, `carencia-nunca-corria-e-ordem-de-escrita.md`.

---

## 3. Próximos Passos Sugeridos

1. ✅ ~~**Medir `alerta_risco_auth_select` em produção.**~~ — **feito em 16/08 por Rômulo via psql**. A query `SELECT policyname, roles, cmd FROM pg_policies WHERE schemaname='public' AND tablename='alerta_risco_clinico'` retornou `alerta_risco_auth_select | {iris_auth} | SELECT` (e `alerta_risco_scope | {app_role} | ALL`). A policy **existe em produção**. A suspeita de que produção rodava sem a policy foi falsificada por evidência direta; **D37 fechado por medição**. O defeito estava restrito ao banco de dados de desenvolvimento local.
2. ✅ ~~Mergear PR #339 e PR #340~~ — **feito em 16/08** (21:23 e 21:28); **#310 e #311 fecharam**, conferido por `gh api`. Registro original abaixo, para quem vier atrás do encadeamento: ~~**Mergear na ordem: PR [#339](https://github.com/romulosutil/Iris/pull/339) (#310 → `main`) e depois PR [#340](https://github.com/romulosutil/Iris/pull/340) (#311).**~~ As duas branches foram **pushadas e as PRs abertas em 16/08**. A #340 é **encadeada**: `base = feat/310-…`, para que o diff dela mostre só os 6 arquivos da #311 — o GitHub reaponta para `main` sozinho quando a #339 fechar. ⚠️ **A keyword `Closes #311` só dispara no merge para `main`**, então conferir `gh issue view 311` depois do merge; o mesmo vale para o `Closes #310` da #339 ([[pr-em-pt-br-nao-fecha-issue]]).
3. ~~**Passo 6: #311**~~ — **feito nesta sessão** (§1). O piso real é exatamente R$ 5,00, então o `500` ficou; a entrega foi verdade documental + oráculo de teste. A cláusula "se o Asaas não tiver mínimo próprio, remover a constante" está **resolvida contra a remoção**: o mínimo é do Asaas, medido, e a API o impõe com mensagem nomeada. **A issue #311 continua `open`** e sem label — fecha pelo `Closes #311` do PR.
4. ~~**Passo 7: #289**~~ — **executado em 16/08**. PR [#347](https://github.com/romulosutil/Iris/pull/347) aberto, mergeado e issue **#289 fechada**.
5. ~~**Passo 9: #322**~~ — **executado nesta sessão** (§1), PR [#348](https://github.com/romulosutil/Iris/pull/348) aberto. Com ele **a ordem de conclusão da linha de billing termina**: os 9 passos estão fechados. O que sobra da linha não é passo, é medição em produção (itens 7 e 8) e leitura na interface (item 6). ⚠️ O **D39** ficou **mais** concreto, não menos: a varredura agora produz `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS`, que é G6 e não persiste `recusa_codigo` — o caso hipotético virou caminho de código vivo.
6. **D36 — a clínica continua sem ver nada (Próximo Passo Imediato de UI).** A #310 acrescentou tela para as cobranças em aberto, mas a recusa em si (`recusa_codigo`, os 9 grupos da #318) segue sem leitor na interface principal: `faixa-trial.tsx` devolve `null` para `pagamento_atrasado`. O Rômulo fechou a decisão (§3b item 12): D36 foca exclusivamente na faixa de alerta urgente de recusa na UI.
7. ✅ ~~**Exercitar o backfill da `0098` e ensaio em produção.**~~ — **executado e homologado em 17/08 por Rômulo com clínica real em produção**. Autorização de Pix Automático e débito de mensalidade debitados com sucesso. **D43 e D44 fechados por medição real**.
8. **Próximas Frentes de Código & Infra:**
   - **D36:** Implementar faixa de alerta urgente de recusa em `src/components/app/faixa-trial.tsx`.
   - **D34 / D39:** Emitir `audit_log` atômico no corte por carência vencida + `exit 1` no script noturno sob falhas + persistir código cru de recusa G6.
   - **D40 / #330:** Eliminar os 3 N+1 restantes em `src/lib/evidence/materializar.ts`.
   - **Infraestrutura:** Provisionar job `iris-arquivamento` no Easypanel (#293). Os jobs `iris-billing` e `iris-escalonamento` já estão 100% provisionados e ativos no Easypanel.

---

## 3b. Decisões que ficam com o Rômulo

As decisões marcadas com ✅ foram fechadas pelo Rômulo em 17/08/2026; as demais seguem abertas. Nenhuma tem recomendação embutida — a escolha é dele.

1. ✅ **Cobrança apagada no painel tranca a clínica (D41):** — **Fechado em 17/08 pelo Rômulo**: **Manter.** Segue a regra conservadora e segura: `deleted: true` bloqueia a tela com "fale com o suporte" para não arriscar ressuscitar cobrança apagada.
2. ✅ **A clínica pode ver duas formas de pagamento na mesma tela?** — **Fechado em 17/08 pelo Rômulo**: **Pagamento único.** A reativação de R$ 0,01 vira a cobrança no valor devido (o QR code / ativação do Pix Automático assume o valor total do débito consolidado). Aplica-se inclusive a quem passou o prazo de carência e foi cancelado por inadimplência.
3. **Fase 7 do plano da #310 não foi executada** (comentário de módulo consolidando o desenho + abertura do PR). Fecho numa próxima sessão, ou o PR sai como está?
4. ~~**`alerta_risco_auth_select` (D37):**~~ — **Fechado por medição em produção** (16/08). A policy existe em produção (`SELECT TO iris_auth`). Nenhuma migração necessária.
5. ✅ **D34 (Auditoria e exit code do corte):** — **Fechado em 17/08 pelo Rômulo**: **Aprovado.** O corte por inadimplência passa a registrar evento atômico em `audit_log` e o job ganha limiar de `carenciaFalhas` que derruba o `exit code` (`exit 1` sob falhas de corte), alertando a infraestrutura.
6. ~~**Perda do relatório da rota sob falha parcial**~~ — **fechada**: virou o **D38** e já foi resolvida no PR #323 (a rota mantém o 500 com o corpo completo, e ganhou `carenciaAbortada`/`backstopAbortado`).
7. ✅ **Resíduo do G6 (D39):** — **Fechado em 17/08 pelo Rômulo**: **Aprovado.** Reabrir a decisão de persistência do G6 para gravar o código cru de recusa (`recusa_codigo`), permitindo que a varredura de backstop de D+7 identifique que foi defeito interno nosso e **não** carimbe `past_due` nem penalize a clínica.
8. ✅ **O discriminador da #289:** — **Fechado em 17/08 pelo Rômulo**: **Aprovado.** Ratificada a divergência e aprovada a solução simples em produção: discriminar mensalidade vs. ativação inicial de R$ 0,01 pela presença do objeto `paymentInstruction`.
9. ~~**A PR da `fix/289-…` sai agora, ou espera?**~~ — **consumada**: PR #347 aberta, mergeada e issue #289 fechada em 16/08.
10. ✅ **G7 (operacional/transitório) na retentativa automática:** — **Fechado em 17/08 pelo Rômulo**: **Mantenha.** Erros transitórios/operacionais (G7) continuam tratados exclusivamente pela retentativa intradia do PSP, reservando as 3 tentativas extradias para falta de saldo (G2).
11. **O esgotamento do orçamento deixou de aparecer no relatório do job.** É consequência direta da correção do GRAVE 1: o ciclo com 3 tentativas gastas é barrado no `WHERE`, então não sai mais linha nenhuma dizendo "esgotou". O número continua legível em `billing_cycle.retentativas_comandadas`, mas ninguém o lê. Aceitar, ou o relatório precisa de um contador próprio de esgotados?
12. ✅ **A retentativa não tem leitor (Escopo do D36):** — **Fechado em 17/08 pelo Rômulo**: **Opção B (Separar).** O D36 focará exclusivamente na entrega urgente da faixa de alerta de recusa e prazo de carência/bloqueio para a clínica; o mostrador detalhado de histórico/status de retentativas automáticas vira uma issue dedicada.

---

## 4. Achados abertos (não são pendência de issue nenhuma)

Registrados aqui porque nasceram no caminho e não têm dono. Detalhe no `BACKLOG.md`.

**Saíram em 17/08, por terem sido homologados em clínica real em produção:** **D43** (autorização Pix Automático via `immediateQrCode` sem rejeição) e **D44** (alinhamento de ciclo e cobrança de mensalidade no Asaas).

**Saiu na 3ª sessão de 16/08, por ter fechado:** o **discriminador indefinido do `erro_aplicacao`** — que era o que travava a #289 e a label `jules`.

**Saíram em 16/08, por terem fechado:** o ruído de 39 erros de lint (era `.next` aninhado em worktree, não código), o timeout de `vencimento.test.ts`, a janela de cobrança dupla que a #319 abriu (é o que a #310 fecha), a perda do relatório da rota sob falha parcial (D38, PR #323) e — na 2ª sessão — **o piso de cobrança declarado como não medido** (RISCO-1 da spec da #290; era o `500` sem prova, agora medido e com oráculo).

### Novos em 17/08 (sessão da #322)

| Achado                                                                                                                                                                                  | Onde                                                                      | Estado                                                                                                                                                                                                                                                                                                                  |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**O "início do próximo ciclo" da validação 4 do Asaas é lido de `subscription.ciclo_atual_fim`, e o alinhamento entre a recorrência do gateway e o ciclo do Iris nunca foi medido**~~ | `subscription.ts` (teto B da varredura)                                   | **Fechado em 17/08 por medição real em produção (D44).** Mensalidade debitada com sucesso no Asaas em clínica real sem colisão de recorrência.                                                                                                                                                                          |
| **O contador de 3 tentativas do Asaas pode ser por instrução, não por cobrança** — a varredura escolhe sempre a instrução recusada **mais recente**                                     | `provider/asaas.ts` (escolha determinística da instrução `REFUSED`)       | **Não medido.** A escolha deixou de ser `lista[0]` (arbitrária) e passou a ser a mais recente com desempate estável — mas se o contador for por instrução, retentar sempre a mais nova **abre orçamento além de 3**. Virou **D45** (aguardando 1º ciclo de recusa).                                                     |
| **`purpose` e `retryAttempt` nunca apareceram em payload real** — o guard que impede o carimbo triplo depende dos dois                                                                  | `provider/asaas.ts` (`normalizarEventoAsaas`) · `subscription.ts` (guard) | **Não medido, aguardando evento real de retentativa em produção.** Se a doc estiver errada, os dois voltam `null` **em silêncio**, o guard nunca dispara e o mesmo ciclo é carimbado `past_due` até 3 vezes. A conferência é ler o `bruto` do primeiro `INSTRUCTION_REFUSED` de retentativa em produção. Virou **D46**. |
| **O esgotamento do orçamento não aparece mais no relatório do job**                                                                                                                     | `subscription.ts` (`WHERE` da varredura) · `fechar-ciclos/route.ts`       | Consequência direta da correção do GRAVE 1 — o ciclo esgotado é barrado no SQL, então não gera linha. O número segue legível em `billing_cycle.retentativas_comandadas`, e **ninguém o lê**. Decisão 11 da §3b.                                                                                                         |
| **A retentativa não tem leitor: nenhuma tela diz que houve, quantas restam ou quando é a próxima**                                                                                      | UI · `faixa-trial.tsx`                                                    | Deliberado — é o **D36**, que já engolia a recusa. Mas o peso mudou: a clínica passa a ser debitada até 3 vezes em 7 dias sem ver uma linha sobre isso. Decisão 12 da §3b.                                                                                                                                              |
| **`isNotNull(vencimento_cobranca)` no predicado é redundante** — o pré-filtro grosso da janela já exclui `NULL`                                                                         | `subscription.ts` (elegibilidade)                                         | Medido pela mutação: só amputando as três cláusulas juntas o caso fica vermelho. O oráculo fixa o comportamento fail-closed, mas **não isola aquela linha** — irmão de [[teste-verde-que-nao-testa-nada]]. Mantido por ser a regra literal.                                                                             |
| **O guard de `RETRY_AFTER_DUE_DATE` é inerte em produção hoje**                                                                                                                         | `subscription.ts` (`conciliarPagamentoDeCiclo`)                           | Só dispara se `paymentInstruction.purpose` existir, e isso nunca foi observado. O defeito que a revisão achou nele (engolir recusa de causa diferente) foi corrigido, mas o **acerto** também só acorda quando o campo chegar. Parte do **D46**.                                                                        |
| **`mensagemDeErroAsaas` junta N descrições com `" \| "`, e a classificação casa na ordem de `TRECHOS_DE_VALIDACAO`**                                                                    | `provider/asaas.ts`                                                       | Corpo com dois erros classifica pelo primeiro trecho **da nossa lista**, não pelo primeiro erro **do gateway**. Inerte hoje (as 5 validações são mutuamente exclusivas na prática), mas é ordem nossa disfarçada de ordem deles.                                                                                        |
| **Um `sql<Date>` cru num select do Drizzle volta como _string_**                                                                                                                        | ferramental (`postgres-js` + Drizzle)                                     | `.values()` pula a decodificação, e o valor chega como `2026-08-20 12:00:00+00`; `civilSp` estourou `Invalid time value`. Resolvido com `.mapWith(...)`. Nota de processo, custou uma passada.                                                                                                                          |
| **No instante exato do corte por carência, "comandada" é inalcançável**                                                                                                                 | `retentativa-extradia.int.test.ts`                                        | Nota de teste: com o corte hoje, a candidata mínima (`hoje+1`) sempre cai no dia do corte ou depois, e o teto C barra. O par de casos prova que o predicado devolveu falso, não que a retentativa sairia.                                                                                                               |

### Novos em 16/08 (sessão da #289, 3ª)

| Achado                                                                                                                                                                                                                     | Onde                                                                              | Estado                                                                                                                                                                                                                                                                                                       |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**Qual campo a cobrança de ativação de fato traz nunca foi medido**~~                                                                                                                                                    | `src/lib/billing/erro-aplicacao.ts` (docblock do classificador)                   | **Fechado em 17/08 por medição real em produção (D43).** Ativação de Pix Automático executada e concluída com sucesso em clínica piloto.                                                                                                                                                                     |
| **`normalizarEventoAsaas` trata QUALQUER `externalReference` não-vazia como cobrança nossa** — então cobrança de terceiro vira `cobranca.*` e dispara `avisarRecusaQueNaoConciliou`                                        | `src/lib/billing/provider/asaas.ts` · `erro-aplicacao.ts` (`MOTIVO_..._TERCEIRO`) | **Pré-existente, agora visível.** Foi o que obrigou o motivo de terceiro a ter texto próprio: os dois casos não são o mesmo estado a jusante, e colapsar os textos apagaria qual dos dois aconteceu. O aviso indevido em si **não foi corrigido** nesta entrega — só ficou diagnosticável. Parte do **D43**. |
| **A Definição de Pronto da issue é prosa, sem SQL** — a consulta de verificação existe só em código (`listarCobrancasDeCicloNaoConciliadas`)                                                                               | GitHub #289 · `erro-aplicacao.ts`                                                 | Quem quiser conferir a DoD **fora** do repo não tem o que rodar, e a versão em prosa ("consulta que lista cobranças de ciclo não conciliadas") não diz que ela precisa reler o estado vivo — foi justamente por isso que a 1ª versão filtrou o texto histórico. Vale um comentário na issue com o predicado. |
| **A consulta nova não tem leitor: nenhuma tela, nenhum job, nenhum alerta a chama**                                                                                                                                        | `erro-aplicacao.ts` · UI                                                          | Deliberado — a UI é o **D36**, e a #289 fecha o sinal, não a leitura. Mas registrado sem eufemismo: hoje o alarme corrigido só aparece para quem abrir um console e chamar a função à mão.                                                                                                                   |
| **`pnpm test` tem 1 caso flaky sob carga** — `disponibilidade-editor` (a11y): falhou em **1 de 2** execuções da suíte cheia, passou **199/1339** na 2ª e **10/10** em isolamento; a regra é `color-contrast` do `axe-core` | `src/app/(app)/equipe/[id]/`                                                      | Fora do diff desta branch. Medido nas duas direções antes de ser chamado de flake. **Não pinar nem silenciar** — enquanto não reproduzir de novo, "flake de ambiente" é a leitura mais provável, não um fato provado.                                                                                        |
| **`git diff` sob o hook do RTK devolve resumo, não patch aplicável**                                                                                                                                                       | ferramental (`rtk`)                                                               | Nota de processo, e custou uma passada nesta sessão: `git apply -R` falha com `No valid patches in input`. Para reverter mutante, gerar com `rtk proxy git diff`. Nunca `git checkout -- .` ([[mutacao-reverter-sem-git-checkout]]).                                                                         |

### Novos em 16/08 (sessão da #311)

| Achado                                                                                                                                                                                   | Onde                                                                                 | Estado                                                                                                                                                                                                                                                                                                                |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A regra `value − discount >= 500` é dedução da mensagem do gateway, não medição** — as 5 sondagens da Medição 6 rodaram todas com desconto R$ 0,00, e `discount ≠ 0` nunca foi enviado | `src/lib/billing/debito.ts` (docblock do piso) · `infra/README.md` Medição 6         | **Não medido, e mensurável barato:** ao contrário do trilho de Pix Automático, `POST /payments` avulso funciona no sandbox — bastaria uma sondagem com `discount`. Inerte hoje (nenhum caminho de emissão do Iris envia desconto), e a fronteira medido × deduzido está escrita no docblock. Não vale sessão própria. |
| **A degradação 4xx do gate tem um único teste, e ele some sem banco** — `gate-debito.int.test.ts:485` roda sob `describe.skipIf(!hasDb)`                                                 | `src/lib/billing/debito.ts` (`resolverGateDeDebito`) · `gate-debito.int.test.ts`     | **Pré-existente, mas o peso mudou:** com o piso medido, o docblock promove essa degradação à **única** rede restante contra o Asaas mudar o piso — e a suíte unitária que a DoD aponta não prova nada dela. Irmão de [[vitest-int-test-coleta-zero]]: sem banco, a rede não é testada, e a cor da suíte não muda.     |
| **A issue #311 (corpo e os 2 comentários) fala de `PISO_COBRANCA_CENTAVOS`**, nome morto desde a D-E da #317                                                                             | GitHub #311 · `.specs/features/debito-reativacao-290/*` · `docs/superpowers/plans/*` | Quem planejar pela issue sozinha procura um símbolo que não existe. As specs e os planos foram deixados intactos **de propósito** (registro point-in-time), mas isso significa que uma busca pelo nome **vivo** não os encontra. O `infra/README.md` foi corrigido por ser documento operacional, não histórico.      |
| **O parâmetro `piso` de `decidirGate` perdeu a justificativa original**                                                                                                                  | `src/lib/billing/debito.ts` (`decidirGate`)                                          | Existia "para o dia em que o valor real do gateway for medido". Esse dia chegou. Mantido, com a justificativa trocada: o piso é **do gateway**, e acompanhar uma mudança dele não pode exigir tocar na regra. Nota, não débito — mas se um dia ninguém souber por que o parâmetro existe, a resposta está aqui.       |

### Novos em 16/08 (sessão da #310)

| Achado                                                                                                                                                        | Onde                                                 | Estado                                                                                                                                                                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cobrança `removida` (apagada no painel) tranca a clínica** — só o 404 libera o id; `deleted: true` bloqueia com "fale com o suporte" e não tem saída no app | `src/lib/billing/debito.ts` · `provider/asaas.ts`    | **Escolha deliberada, não descuido:** liberar o id arriscaria a idempotência de `debito:<ancora>` ressuscitar a cobrança deletada. **Não medido** se `GET /payments?externalReference=` devolve cobrança deletada. Virou **D41**, e é a decisão 1 da §3b.     |
| **`DUNNING_RECEIVED` — "recuperada" ou "em recuperação"?** A doc do Asaas não distingue                                                                       | `provider/asaas.ts` (`STATUS_COBRANCA_TERCEIRIZADA`) | **Não medido.** Inerte hoje: os dois desfechos possíveis proíbem emitir outra cobrança, então o bloqueio está certo nos dois casos. Vira problema se algum dia quisermos reaproveitar esse estado. Parte do **D41**.                                          |
| **Em que `status` fica o `Payment` quando a instrução é recusada no AGENDAMENTO por teto**                                                                    | doc do Asaas · `classificacao-recusa.ts`             | **Não medido, e o sandbox não alcança** (não ativa Pix Automático). O desenho da #310 **não depende disso** — a classificação é allow-list sobre o status, não sobre o motivo. Entra no ensaio com clínica de teste em produção.                              |
| **Instrução `SCHEDULED` sobrevive à revogação da autorização?**                                                                                               | `provider/asaas.ts` (`temInstrucaoPendente`)         | **Não medido.** O D-6 fica correto nos dois casos (instrução pendente ⇒ não apresentar código), mas se sobreviver há um estado "em processamento" que nunca se resolve sozinho. Ensaio em produção.                                                           |
| **O guard `!c.agrupadoEm` na escolha de âncora não é morto por nenhuma mutação**                                                                              | `src/lib/billing/debito.ts`                          | Defensivo: a âncora liberada por 404 é sempre a primeira do array, então o guard nunca é o que decide hoje. Mantido porque é a regra literal ("ciclo agrupado nunca vira âncora"), mas é código sem oráculo — irmão de [[teste-verde-que-nao-testa-nada]].    |
| **O dublê `provedor-fake.ts` não fala o dialeto completo do reuso**                                                                                           | `db/tests/provedor-fake.ts`                          | Melhorado nesta sessão (expressa `removida`, `em_processamento`, `status_nao_pagavel` pelo corpo do wire), mas segue mais pobre que o Asaas real. Os testes que valem são os de `gate-debito.int.test.ts` e `asaas.test.ts`, com stub HTTP no dialeto medido. |
| **`.mcp.json` e `docs/daily-summary/*` seguem não versionados**                                                                                               | raiz do repo                                         | Pendente de decisão do Rômulo desde 15/08. O `.mcp.json` aponta para o MCP de docs do Asaas, que foi **a ferramenta que fixou o desenho desta sessão** — sem ele, a próxima sessão mede menos.                                                                |

### Abertos de antes, que continuam valendo

**Saíram na 5ª sessão de 15/08, por terem fechado:** a #319 sem verificação contra banco (D33, resíduo do backfill abaixo), o motivo de recusa que nunca chegava (D35), a ordem da rota sem teste (`route.test.ts`, 22 casos), as fixtures inventadas (migradas), o catálogo aberto (virou o G0 implementado) e a premissa do artifact sobre modelo de dados (consumada nas `0099`/`0100`).

| Achado                                                                                                                                                                                                                                                                                                                                                                        | Onde                                              | Estado                                                                                                                                                                                                                                                                                                                |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A varredura de corte não escreve `audit_log`** — é a 1ª ação **irreversível** dirigida por job no repo                                                                                                                                                                                                                                                                      | `src/lib/billing/subscription.ts`                 | Coerente com o módulo (nenhum `billing/*.ts` audita), mas revogar autorização sem trilha não tem precedente. **Continua aberto (D34)**, e o backstop da #318 acrescentou um segundo caminho automático até o corte. Decisão de produto pendente (§3b).                                                                |
| **O job sai `exit 0` mesmo com `carenciaFalhas` cheio** — clínica que falha o corte todo dia não alerta ninguém                                                                                                                                                                                                                                                               | `scripts/fechamento-ciclo-billing.mjs`            | O `.mjs` só loga o corpo. **Continua aberto (D34).** Vale um limiar que derrube o exit code, ou o corte silencioso vira permanente.                                                                                                                                                                                   |
| **`billing_apurar_ciclo` reescreve `pacientes_contados`** ao congelar ciclo `falhou` já faturado                                                                                                                                                                                                                                                                              | `db/migrations/0075` + `congelarCiclosComoDebito` | O piso `Math.max` protege o **valor**; o memorial de quem foi contado, não. Nenhum teste mede `pacientes_contados`.                                                                                                                                                                                                   |
| **`past_due` com `past_due_desde` NULL nunca é cortado e não aparece em `carenciaAvaliadas`**                                                                                                                                                                                                                                                                                 | `src/lib/billing/subscription.ts`                 | Silêncio, não erro. Estado não deveria existir (os dois produtores carimbam juntos), mas nada o impede.                                                                                                                                                                                                               |
| **O predicado corta por instante, não por dia civil** — quem entra em `past_due` às 23h é cortado às 23h do 10º dia                                                                                                                                                                                                                                                           | `src/lib/billing/subscription.ts`                 | Diverge de `calendario-bancario.ts`, que normaliza para horário civil de SP. Inerte hoje (SP sem DST, container UTC); quebra em fuso com DST.                                                                                                                                                                         |
| **Status real do `DELETE` de autorização já cancelada no Asaas não medido** — a tolerância a 404 é desenho defensivo, não medição                                                                                                                                                                                                                                             | `src/lib/billing/provider/asaas.ts`               | Entra no ensaio em produção. Se o Asaas responder 200 idempotente, o cuidado sobra; se responder outra coisa, o loop preso volta.                                                                                                                                                                                     |
| **`billing_apurar_ciclo` carimba `apurado` antes do `UPDATE` do TS** — crash entre as duas escritas converte `falhou` em `apurado`                                                                                                                                                                                                                                            | `db/migrations/0075`                              | E `apurado` está na lista padrão do congelamento, então a revogação voluntária passaria a pegá-lo. Sem cobertura.                                                                                                                                                                                                     |
| **Qual calendário de feriados o Asaas usa** — o nosso é o nacional; bancário estadual/municipal não entra                                                                                                                                                                                                                                                                     | `src/lib/billing/calendario-bancario.ts`          | Suposição não medida, mesma classe do `INSTRUCTION_REFUSED → OVERDUE` da #286. Entra no ensaio em produção.                                                                                                                                                                                                           |
| **O teto de 10 dias corridos só é vigiado por um teste** — nenhum fechamento real passa de 9                                                                                                                                                                                                                                                                                  | `src/lib/billing/vencimento.test.ts`              | Aceito e documentado. Apagar aquele caso solta a constante sem nada ficar vermelho.                                                                                                                                                                                                                                   |
| **Uma recusa não produz nada na interface** — `faixa-trial.tsx:68-73` devolve `null` para `pagamento_atrasado`                                                                                                                                                                                                                                                                | `faixa-trial.tsx` · `estado-conta.ts:40,197`      | Piorou com a #319 e **de novo com a #318**: os 9 grupos agora diferem de verdade no banco (`recusa_codigo` persistido, políticas distintas) e **nenhuma tela lê**. A clínica é carimbada `past_due` e cortada em 10 dias sem ver uma linha; a tarja só aparece se já houver débito. **D36**, mais urgente, não menos. |
| **O docstring de `fecharCiclosVencendo` afirma que o erro é persistido em `billing_cycle.erro`** — o `catch` real não faz `UPDATE`                                                                                                                                                                                                                                            | `subscription.ts:576-579` × `:756-766`            | `subscription.ts:1250` é o **único** ponto do repo que grava `erro` não-nulo. Corrigir o comentário ou fazer o `catch` gravar — decisão à parte.                                                                                                                                                                      |
| **`refusalReason` no payload de webhook não é documentado** — a página de motivos diz que vem "no evento"; o exemplo não o mostra                                                                                                                                                                                                                                             | doc do Asaas, "Eventos para Pix Automático"       | O caminho garantido é `GET /pix/automatic/paymentInstructions/{id}` disparado pelo evento. Não desenhar contando com o campo no envelope.                                                                                                                                                                             |
| **O envelope que `normalizarEventoAsaas` assume não aparece na doc e não foi medido**                                                                                                                                                                                                                                                                                         | `asaas.ts:385-453`                                | Assume `paymentInstruction.status`, `.paymentId` e `.authorization.id`. Entra no ensaio em produção antes de empilhar mais desenho em cima.                                                                                                                                                                           |
| **O FAQ do Asaas contradiz a página de retentativas** — nega a existência de tentativas em dias posteriores                                                                                                                                                                                                                                                                   | doc do Asaas, FAQ item 5                          | O FAQ é anterior à Jornada 3. Registrado para não virar "descoberta" numa próxima sessão. Não usar como fonte para `3R_7D`.                                                                                                                                                                                           |
| ~~**Discriminador do `erro_aplicacao` continua indefinido**~~ — **fechado em 16/08/2026** (§1): o discriminador é **duplo** — `externalReference` no trilho com `payment`, **id de instrução** (fail-closed) no headless. Não foi nenhum dos dois candidatos do comentário 1; a divergência vai à §3b, e a label `jules` deixou de ser o caminho (a issue foi executada aqui) | #289                                              | Decisão de produto em aberto entre `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier`. **Trava a label `jules`.**                                                                                                                                                                                        |
| **`.specs/features/debito-reativacao-290/design.md:56` cita `PISO_COBRANCA_CENTAVOS`**, nome que não existe mais                                                                                                                                                                                                                                                              | spec histórica                                    | Registro de época, não corrigido de propósito. O nome vivo é `PISO_COBRANCA_AVULSA_CENTAVOS`.                                                                                                                                                                                                                         |
| **`moveisPorAno` é cache global sem limite** no calendário bancário                                                                                                                                                                                                                                                                                                           | `src/lib/billing/calendario-bancario.ts`          | Irrelevante no uso atual (o job toca 2-3 anos); é estado global não limpável entre testes.                                                                                                                                                                                                                            |
| **`carencia_dias` pode precisar de `GRANT UPDATE` de coluna** se a app um dia escrever nela                                                                                                                                                                                                                                                                                   | `subscription`                                    | Não medido. O backfill roda na role de migração, então a `0098` passa; nada na app escreve essa coluna hoje.                                                                                                                                                                                                          |

**Novos nesta sessão (15/08, 5ª):**

| Achado                                                                                                                                                                                              | Onde                                                                                           | Estado                                                                                                                                                                                                                                                                                                                        |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A policy `alerta_risco_auth_select` não existe** — grant de coluna presente, policy ausente ⇒ `iris_auth` lê **zero linhas sem erro**; o painel Super Admin reporta `totalAlertas: 0` em silêncio | `0072_super_admin_role` × `f6e0884` · `src/app/(admin)/benjamin/queries.ts`                    | **Medido no banco local** (`pg_policies` + `has_column_privilege`, não por `count(*)` — a tabela está vazia). **Produção: não medido**, afetada por inferência forte (o `hashAplicado` pinado é o sha256 LF do blob pré-fix). Consulta de fechamento em §1. Virou **D37**.                                                    |
| **A rota descarta `resultados` sob falha parcial** — se `cancelarAssinaturasComCarenciaVencida` lançar, o 500 leva junto o corpo com o `providerChargeId` de cada cobrança já emitida no gateway    | `src/app/api/internal/billing/fechar-ciclos/route.ts` · `scripts/fechamento-ciclo-billing.mjs` | Mesma classe que o `carenciaTruncado` existe para evitar: **perder o registro de um ato irreversível é pior que cortar devagar**. O job só grava esse JSON. Correção natural (`try` próprio na última etapa + `carenciaAbortada` no 200) **muda o contrato da rota e o log do job** ⇒ decisão do Rômulo (§3b). Virou **D38**. |
| **Resíduo do G6 no backstop** — ciclo cuja **primeira** recusa foi G6 chega a D+7 indistinguível do silêncio total, e **é carimbado**                                                               | `src/lib/billing/classificacao-recusa.ts` · `subscription.ts`                                  | Consequência direta da decisão fechada da #318 (G6 não persiste `recusa_codigo`, senão apagaria o diagnóstico correto de uma recusa anterior). Fechar exige **reabrir** aquela decisão. A **#322** passa a produzir exatamente esse caso: `EXCEEDED_MAXIMUM_RETRY_ATTEMPTS` é G6. Virou **D39**.                              |
| **O backfill da `0098` nunca foi exercitado** — `subscription` tem 0 linhas neste banco, então o `UPDATE … WHERE carencia_dias = 7` tocou 0 linhas                                                  | `db/migrations/0098_subscription_carencia_dez_dias.sql`                                        | **Não medido**, e é o resíduo declarado do D33. O DDL está provado; a migração de dado não. Só se fecha em base com linhas.                                                                                                                                                                                                   |
| **`pnpm vitest run <arquivo>.int.test.ts` coleta zero e sai verde**                                                                                                                                 | `vitest.config.ts` (`exclude: ["**/*.int.test.ts"]`)                                           | Nota de processo, não débito de produto. Integração exige `--config vitest.integration.config.ts`. Conferir o **número coletado**, nunca a cor — irmão de [[teste-verde-que-nao-testa-nada]].                                                                                                                                 |
| **`created_at` em `drizzle.__drizzle_migrations` é o `when` do journal**, não o instante da aplicação                                                                                               | `drizzle.__drizzle_migrations`                                                                 | Nota de processo. Não serve para datar nem para ordenar por tempo real — foi tentado nesta sessão e produziu conclusão errada antes de ser falsificado.                                                                                                                                                                       |
| **O guard de hash acusa 37 divergências nesta máquina, 35 delas só de fim de linha**                                                                                                                | `scripts/verificar-hash-migracoes.mjs` · `core.autocrlf=true` × `* text=auto`                  | **Nada foi pinado em `DERIVAS_CONHECIDAS` de propósito:** silenciar 35 rótulos de EOL esconderia o 36º que for real — foi exatamente assim que a `0072` apareceu. Diagnóstico em `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`.                                                                                     |
