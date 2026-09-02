# Auditoria 360º — revisão cruzada com a spec de admissão (02/09/2026)

> Memo complementar ao `auditoria-360-relatorio-2026-09-01.md`. Objeto: a spec
> `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`
> (ratificada pelo Rômulo em 01/09/2026, 177 linhas) e os planos ainda não
> executados `docs/superpowers/plans/2026-09-01-prontidao-do-prontuario.md`
> (10 tasks) e `docs/superpowers/plans/2026-09-01-shell-rail-unico.md` (7 tasks).
> Nenhum dos três está commitado. **A spec não foi editada** — sugestões ficam aqui.
> Leitura read-only, sem execução de testes; citações com `arquivo:linha` medidas
> em 02/09/2026 sobre a árvore de trabalho.

---

## Parte 1 — O que muda no relatório da auditoria

### 1(a) Algum achado vira PARCIALMENTE MAPEADO ou JÁ CONHECIDO?

**Nenhum.** Percorri os 54 achados contra a spec e os dois planos. A spec fecha
três defeitos que ela mesma nomeia (D1 porta aberta, D2 estado vazio mente, D3
onboarding abandona) — e **nenhum dos três estava no relatório** como achado
próprio. O motivo é honesto: a auditoria olhou "estado vazio" da Evolução como
tela ad hoc (`U-03`), não como afirmação falsa; a spec enxergou melhor ali.

O que existe é **sobreposição de família**, não de achado:

| Achado | Relação com a spec | Status após reavaliação |
| --- | --- | --- |
| `Q-01` DLQ grava `{error}` em `payload_editado` e reaprova sem evidência | Mesma família de `erro-renderizado-como-empty-state` (§4 da spec): falha vira conteúdo clínico. A spec aplica o princípio ao cartão novo e **não toca** `revisao/[sessionId]/logic.ts`. | NOVO / P1 — inalterado |
| `PR-06` `mapa-jornadas-gaps.md` defasado | A spec §1.2 confirma que a **jornada** de admissão está incompleta (D1–D3), refinando a frase "admissão implementada" do relatório: a entidade existe, a escada não. A spec não atualiza o mapa. | NOVO / P3 — inalterado, texto anotado |
| `U-03` linha do tempo ad hoc | A spec §5 troca o estado vazio de `pacientes/[id]/page.tsx` pelo cartão; `timeline-client.tsx` (972 linhas, paleta crua, `title=`) continua como está. | NOVO / P2 — inalterado |
| `A-02` regra em rota, rota importa rota | A spec põe `prontidao-queries.ts` em `pacientes/[id]/` e o plano o importa de `sessoes/[id]/queries.ts` (`../../pacientes/[id]/prontidao-queries`). Acrescenta um caso ao achado. | NOVO / P3 — inalterado |
| `Q-04` sem teste de alcance / e2e por papel | Três superfícies novas; "6. Prova" não tem e2e por papel nem alcance. | NOVO / P2 — inalterado |
| `PR-05` sessão substituta / "quem é o terapeuta" | **Agravado** (ver 1(c) e R-1). | PARCIALMENTE MAPEADO / P1 — inalterado, risco anotado |
| `PR-01`, `PR-08` | Risco de recorrência do mecanismo (ver 1(c)). | inalterados, risco anotado |
| `S-03` PHI em `console.error` | O plano nasce com `console.warn(..., erro.message)` no layout do prontuário (Task 5). | NOVO / P1 — inalterado, risco anotado |

Conclusão de 1(a): **zero mudanças de status**. Nove notas de reavaliação
inline no relatório (`PR-01`, `PR-08`, `PR-05`, `PR-06`, `Q-01`, `S-03`, `A-02`,
`Q-04`, `U-03`) e um adendo no cabeçalho.

### 1(b) A spec cobre por completo ou deixa resíduo?

Para os itens de família acima, a spec cobre **só o caso novo** e deixa o
resíduo intacto como achado real:

- `Q-01`: o "catch que mente" já em produção (`revisao/[sessionId]/logic.ts:354-378`)
  não é tocado. Resíduo = o achado inteiro.
- `U-03`: o estado vazio deixa de mentir (bom), a tela que vem depois dele
  continua fora do DS e da a11y. Resíduo = o achado inteiro menos o empty state.
- `PR-06`: resíduo = o documento continua sem nota de revisão; a spec é mais
  uma fonte que o mapa não cita.
- `A-02`, `Q-04`, `S-03`: a spec **adiciona** um exemplar ao padrão em vez de
  reduzi-lo.

### 1(c) O mecanismo do P0 (`PR-01`) tem chance real de se repetir aqui?

**Sim, e por três caminhos concretos.** Registrado como risco NOVO nas notas de
`PR-01`/`PR-08`; detalhado em R-1/R-2 da Parte 2.

1. **Gesto condicionado a papel sem prova por papel.** `montarProntidao`
   devolve `rota: null` quando `role !== papelQueResolve` (plano, Task 2, linhas
   ~515-529) e o cartão renderiza "Aguardando coordenação". A matriz de teste
   unitário cobre `modalidade × fatos × papel` na **função pura**; o int-test de
   `prontidao-queries.ts` cobre "fatos corretos" e "cross-tenant"; o teste de
   componente cobre "sem botão morto". Nenhum teste monta a página com o
   contexto de um papel e afirma qual gesto aparece — o mesmo buraco pelo qual a
   #512 passou (31 testes verdes na action, zero na rota).

2. **Fatos lidos sob a RLS do papel atual e interpretados como existência.**
   `obterFatosProntidao` lê `patient_clinical_profile`, `anamnese`, `goal`,
   `instrumento_aplicacao` e `session_snapshot` com `withTenant(ctx)` e o
   comentário "os subselects NÃO repetem filtro por clínica — quem filtra é a
   policy". Só que essas policies não filtram **só** por clínica:
   - `pcp_read`: `user_role <> 'admin_recepcao' AND app_patient_in_clinic AND (coordenador OR app_is_on_team)` — `db/migrations/0001_rls.sql:121-126`
   - `goal_select`: `coordenador OR app_is_on_team(patient_id)` — `0006_fase2_rls.sql:207-213`
   - `instrumento_aplicacao_select`: idem — `0113_instrumento_aplicacao.sql:45-49`
   - `anamnese_select`: idem — `0115_anamnese_marco_zero.sql:97-101`
   - `session_snapshot_select`: idem — `0016_fase4_session_snapshot_rls.sql:19-24`

   Consequência: para **`admin_recepcao`** (que tem `/pacientes` no menu e cadastra
   paciente) todos os fatos são `false` em **todos** os pacientes → a pill da
   lista (Task 8) diz "Falta ficha / Falta meta" para prontuários prontos; e para
   um **terapeuta que atende sem estar na equipe de cuidado** — cenário suportado
   e testado (`diario/[sessionId]/actions.int.test.ts:321`, "terapeuta de
   cobertura (fora da equipe)"; a agenda só valida `user_role`,
   `agenda/queries.ts:301-320`) — `podeDocumentar` sai `false` e o passo
   Documentar é **bloqueado** com "Falta meta ativa — aguardando coordenação"
   num prontuário que o coordenador vê como pronto. É um bloqueio funcional
   novo para um papel, gerado por uma regra que não é sobre esse papel — a
   forma exata do `PR-01`, com o agravante de o teste "cross-tenant devolve
   tudo false" (plano, Task 3) **codificar** que "oculto pela policy" = "não
   existe".

3. **Régua de negócio verificada em uma forma, imposta em nenhuma.** O bloqueio
   do Documentar mora no `case "documentar"` de `sessoes/[id]/page.tsx` (Task 7).
   As server actions `capturarDiario`/`consolidarSessao` (`diario/[sessionId]/logic.ts`)
   não são tocadas: link salvo, aba antiga ou chamada direta documentam do mesmo
   jeito, e `materializar.ts` continua descartando a evidência em silêncio. A
   mutação proposta (trocar a condição por `false`) prova a UI, não a régua. É o
   padrão "gate lido de N formas" do PR #422 na variante N=1 leitura, 0
   imposições.

---

## Parte 2 — O que talvez devesse mudar na spec (memo, não edição)

Ordenado por importância. Cada item diz o que a spec já garante, o que fica
aberto e o que sugerir a quem implementar.

### R-1 · Separar "não visível para este papel" de "não existe" nos fatos de prontidão (P1)

- **O que a spec garante**: isolamento de tenant por RLS, sem `WHERE clinic_id`
  redundante — correto e alinhado à `onboarding-queries.ts`.
- **O que fica aberto**: as cinco tabelas lidas têm policies de **papel e
  equipe**, não só de clínica (citações em 1(c).2). `EXISTS` sob a RLS de
  `admin_recepcao` ou de terapeuta fora da equipe devolve `false` para linhas
  que existem. `montarProntidao` recebe esse `false` como fato e produz
  "pendente/bloqueante".
- **Por que não é o `S-02` e por que o lembrete ainda vale**: `S-02` era um
  `SECURITY DEFINER` que **abria demais** quando um parâmetro vinha nulo; aqui
  o formato é o inverso — leitura sob RLS que **fecha demais** quando o papel não
  enxerga. A direção é fail-closed (bloqueia, não vaza), o que é a escolha
  certa entre as duas; mas a spec §4 declara que o cartão "nunca finge pronto"
  e não diz que ele também **não pode fingir bloqueado**. A tentação de
  resolver isso com um definer "que enxerga tudo" recriaria o `S-02` — daí o
  lembrete: se algum fato precisar ser lido acima da RLS, o definer deve
  guardar `clinic_id = app_clinic_id_exigido()` **e** `app_patient_in_clinic(p_patient)`,
  entrar em `FUNCOES_COM_HELPER` e ter caso negativo cross-tenant.
- **Sugestão**: (i) `obterFatosProntidao` só é chamada para papéis que a policy
  deixa enxergar o prontuário clínico — para `admin_recepcao` o cartão/pill vem
  de `role`, não de fatos ("Aguardando coordenação" fixo, sem escada); (ii) para
  terapeuta, decidir se a régua é "está na equipe" (então a agenda deve exigir
  equipe ao agendar — hoje não exige) ou "é o terapeuta da sessão" (então os
  fatos precisam ser lidos com uma visibilidade que a RLS atual não dá); (iii)
  três casos de int-test explícitos: `ctxRecepcao`, `ctxTerapeutaForaDaEquipe`,
  `ctxTerapeutaNaEquipe` — o segundo é o que vai ficar vermelho hoje.

### R-2 · A régua do Documentar precisa morder na action, não só na página (P1)

- **O que a spec garante**: D-A1 escolhe o ponto certo (documentar), a UI
  substitui o formulário pelo cartão, e há mutação para a guarda.
- **O que fica aberto**: `capturarDiario` e `consolidarSessao` continuam
  aceitando escrita sem protocolo/meta; `materializar.ts` continua descartando
  em silêncio. A régua fica com uma leitura (UI) e zero imposições.
- **Sugestão**: uma função única `assertPodeDocumentar(ctx, tx, patientId)` em
  `src/lib/patient/` chamada por `capturarDiarioCore` e `consolidarSessaoCore`
  (dentro do `withTenant` já aberto — mesma imagem do banco), com a UI apenas
  **antecipando** o que a action vai recusar; o teste de mutação passa a
  reverter a guarda na action. Copy de recusa literal ("Esta sessão não pode
  ser documentada: falta meta ativa. Quem resolve: coordenação."), não
  "Erro interno". Registrar na spec como decisão (D-A8) se o Rômulo preferir
  manter UI-only por fricção — mas então dizer isso em voz alta.

### R-3 · Regra de log seguro desde o nascimento de `prontidao*.ts` (P2)

- **O que a spec garante**: falha de leitura → cartão ausente, nunca "pronto".
- **O que fica aberto**: o plano (Task 5) escreve
  `console.warn("[prontidao] falha ao ler fatos (patientId=…):", erro.message)`.
  Para `DrizzleQueryError`, `message` = SQL completo + `params` (`S-03`). Aqui o
  único parâmetro é `patientId` (baixo risco), mas o idioma é o que se copia
  para a próxima query, que terá texto clínico. E `carregarSessao` (Task 7)
  propaga o erro **sem** catch — correto (fail-closed) — mas quem o loga é o
  `error.tsx`/Sentry, de novo com a mensagem inteira.
- **Sugestão**: a spec §7 (anti-padrões) ganhar uma linha: "❌ logar
  `err.message`/`err` de driver; usar `name` + `cause.code` (`codigoPg`) + id de
  correlação". Se o helper de `S-03` não existir ainda, `prontidao-queries.ts`
  é um bom primeiro consumidor.

### R-4 · Lacunas da seção "6. Prova" à luz do oráculo de RLS (P2)

- O int-test "cross-tenant não vaza" é o **espelho** do problema de R-1: prova
  que outra clínica devolve `false`, e com isso fixa a semântica "invisível =
  inexistente". Acrescentar os três contextos de R-1 e um caso "paciente
  inexistente devolve `null`/erro, não escada".
- Nenhum caso cobre **conta em somente-leitura** com prontuário bloqueado
  (§4 lista o estado; "6. Prova" não).
- Nenhum caso cobre `modalidade` **trocada** depois de pronta (`alterarModalidadeClinica`
  existe): protocol_driven pronto → cognitive_behavioral deve voltar a
  bloquear por instrumento. D-A4 promete isso ("derivada, nunca coluna");
  um teste prova.
- O 5º passo do onboarding lê `EXISTS` na mesma transação dos outros quatro
  sob a RLS do **coordenador** — ok hoje; se um dia rodar para terapeuta,
  cai em R-1.
- Nada em "6. Prova" impede que uma implementação use `SECURITY DEFINER` para
  a pill da lista (Task 8 põe 4 `EXISTS` correlacionados por linha com
  `app_is_on_team` avaliado por linha — custo que convida a um definer). Se
  isso acontecer, o oráculo atual (`clinic-id-helper-rls.int.test.ts`, allowlist
  positiva — achado `Q-05`) **não** acusa a falta de guard. Sugerir à spec:
  "qualquer definer novo entra em `FUNCOES_COM_HELPER` e tem caso negativo".

### R-5 · Prova por papel e por alcance (P2)

- A matriz `modalidade × fatos × papel` na função pura é excelente e não
  substitui: (i) um teste de componente/página por papel (`coordenador`,
  `terapeuta` na equipe, `terapeuta` fora, `admin_recepcao`) afirmando **qual**
  gesto primário aparece; (ii) um e2e do caminho feliz "coordenador prescreve →
  cria meta → cartão some → terapeuta documenta"; (iii) o teste de alcance de
  rota recomendado em `Q-04` — a spec cria destinos (`rota(patientId)`) para
  cada degrau e é o primeiro lugar onde um `href` errado ou uma rota
  redirecionada pela #512 (`/diario/[id]`, `/revisao/[id]`) viraria botão morto.

### R-6 · Onde mora a query (P3)

- `prontidao.ts` (puro) vai para `src/lib/patient/` — certo. `prontidao-queries.ts`
  vai para `src/app/(app)/pacientes/[id]/` e é importada por `sessoes/[id]/queries.ts`
  e por `pacientes/queries.ts`. Três consumidores em três rotas = módulo de
  `lib`. Sugestão: `src/lib/patient/prontidao-queries.ts` (o precedente
  `onboarding-queries.ts` está em `src/app/(app)/`, mas tem um consumidor só).

### R-7 · `CartaoProntidao` em `components/app/` e o vocabulário do DS (P3)

- A spec escolhe `src/components/app/cartao-prontidao.tsx`. O relatório
  (`U-02`, `DS-02`) mostra que o DS já tem colisão de semântica para "pendente /
  candidato / bloqueado". Um degrau `bloqueante` não pode reutilizar o violeta
  de "sugerido pela IA" nem o verde de "aprovado". Sugestão: a spec dizer qual
  par de tokens cada `EstadoDegrau` usa (`concluido` → success; `pendente` →
  neutro; `bloqueante` → warning, não error — é ausência de dado, não erro) e
  que o rótulo textual é obrigatório (nunca cor sozinha), com story no
  Storybook para os 7 estados da §4.

### R-8 · Dois detalhes de produto que a spec deixa implícitos (P3)

- **`temSessaoConsolidada` = existe `session_snapshot`** (Task 3). Com o
  `Q-03`/`Q-01` do relatório, há sessões consolidadas e aprovadas sem snapshot
  (evidência descartada, número sequencial nulo, DLQ). A escada dirá "1ª sessão
  pendente" para uma sessão que aconteceu — coerente com a intenção ("sessão
  sem snapshot é o que esta feature existe para tornar impossível"), mas o
  rótulo deveria ser "1ª sessão **com dado na evolução**", senão parece que a
  sessão sumiu.
- **`conventional` sem degrau bloqueante** (D-A7) + gate só na UI (R-2): para
  essa modalidade nada muda; fine. Mas `cognitive_behavioral` bloqueia por
  **instrumento aplicado**, que é ato do terapeuta — a spec §3.1 diz "bloqueia
  documentar" e `papelQueResolve` é `terapeuta`: o próprio terapeuta se
  desbloqueia aplicando o instrumento antes de documentar. Vale confirmar que
  é isso mesmo (e não "coordenação define o instrumento"), porque é o único
  degrau bloqueante que o papel bloqueado resolve sozinho.

---

## Resumo

- Notas de reavaliação aplicadas no relatório original: **9** (`PR-01`, `PR-08`,
  `PR-05`, `PR-06`, `Q-01`, `S-03`, `A-02`, `Q-04`, `U-03`) + adendo no cabeçalho.
  Mudanças de status: **nenhuma**. Riscos novos registrados: 2 (recorrência do
  mecanismo do P0; log inseguro em módulo novo).
- Recomendações mais importantes para a spec: **R-1** (fatos sob RLS de papel ≠
  existência — recepção e terapeuta fora da equipe veem prontuário pronto como
  bloqueado), **R-2** (régua do Documentar imposta na action, não só na página)
  e **R-4/R-5** (prova por papel, por alcance e contra definer sem guard).
