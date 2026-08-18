# Registro de Pensamentos (RPD) — desenho do formulário

> Status: **proposta pendente de validação com o Rômulo**.
> Complementa `docs/agente/protocolo-tcc.md` §2.1, que especifica o RPD como
> contrato clínico. Este documento decide o **formulário humano**: quais
> campos são obrigatórios, em que ordem, e por quê.
> Gatilho: feedback de usuário-teste (18/08/2026) de que o campo de distorção
> cognitiva confunde pacientes, e de que reestruturar o pensamento e examinar
> as evidências é o que importa.

---

## 1. O estado atual e o problema

`tcc_rpd_entry` (`src/db/schema.ts:2069-2106`, migração `0103`) implementa o
registro no formato **Burns**:

```
situacao → pensamento_automatico → emocao + intensidade (0-100)
         → distorcao_cognitiva (NOT NULL, text livre)
         → resposta_racional → intensidade_pos (nullable)
```

Três problemas, em ordem de gravidade.

### 1.1 A distorção é obrigatória e vem antes da reestruturação

`distorcaoCognitiva` é `NOT NULL` e o formulário a pede **antes** da
resposta racional. Isso força o usuário a produzir uma classificação
taxonômica como pré-condição para registrar o trabalho terapêutico.

O feedback do usuário-teste está clinicamente correto, e o próprio
`protocolo-tcc.md` já continha a evidência do problema sem tirar a
conclusão: §2.1 e §6 achado 2 registram que **a enumeração das distorções
varia por autor** (8 a 15 itens), que as fronteiras entre categorias são
ambíguas — "adivinhação do futuro" é subtipo de catastrofização em alguns
manuais e categoria própria em outros — e que não existe fonte canônica
única.

Ou seja: pedimos ao paciente uma decisão que **os autores da literatura não
tomam de forma consistente entre si**. Rotular distorção é habilidade
taxonômica de terapeuta treinado, não porta de entrada de paciente.

O custo não é só de usabilidade. É de dado e de terapia:

- **dado:** campo obrigatório mal compreendido vira ruído. `text` livre
  (§1.3) agrava — o gráfico agrega categorias que não são estáveis;
- **terapia:** treina o paciente a **caçar rótulo** em vez de **testar
  evidência**. A mudança clínica vem do exame de evidência e da formulação
  de um pensamento alternativo, não de nomear o viés corretamente.

### 1.2 Falta o núcleo da reestruturação

Não existem campos de **evidência a favor** e **evidência contra** o
pensamento automático. `resposta_racional` é pedida como salto direto: o
paciente sai do pensamento automático para a resposta racional sem o passo
intermediário que a torna crível.

Uma resposta racional sem exame de evidência é **autoafirmação, não
reestruturação** — e tipicamente não move a intensidade emocional, que é
justamente o que `intensidade_pos` mede.

### 1.3 `distorcao_cognitiva` é `text` livre, e única

- **`text` livre:** o catálogo de 12 opções em
  `src/app/(app)/pacientes/[id]/tcc/constants.ts:3-16` só existe em TS, e o
  Zod valida `z.string().min(1)`. Qualquer texto passa. Agregação em
  `grafico-evolucao-crencas.tsx` corrompe em silêncio.
- **única:** `protocolo-tcc.md` §2.1 é explícito que **pode haver mais de
  uma distorção por pensamento**. A coluna é escalar.

---

## 2. Decisão: adotar o formato de Padesky, mantendo a distorção como opcional

Existem duas variantes canônicas do Registro de Pensamentos, e a diferença
entre elas é exatamente o eixo desta decisão:

|                        | **Burns** (_Feeling Good_, 1980) | **Greenberger & Padesky** (_Mind Over Mood_)                 |
| ---------------------- | -------------------------------- | ------------------------------------------------------------ |
| Coluna de distorção    | **Sim** — é o passo central      | **Não existe**                                               |
| Evidência a favor      | Não                              | **Sim, coluna própria**                                      |
| Evidência contra       | Não                              | **Sim, coluna própria**                                      |
| Pensamento alternativo | "resposta racional"              | "pensamento alternativo/equilibrado", com % de credibilidade |
| Reavaliação de humor   | Sim                              | Sim                                                          |

O registro de 7 colunas de Padesky **não tem coluna de distorção cognitiva**.
Isso é fato estrutural do instrumento, não interpretação. A ferramenta mais
usada em TCC contemporânea para ensinar reestruturação ao paciente já
resolve o problema que o usuário-teste apontou, retirando exatamente aquele
campo e colocando duas colunas de evidência no lugar.

**Decisão:** o RPD do Iris passa a ser o **superconjunto das duas
variantes** — as colunas de evidência de Padesky viram o núcleo obrigatório
do trabalho; a coluna de distorção de Burns é preservada como **opcional**,
posicionada **depois** do exame de evidência.

Por que superconjunto e não só Padesky: há terapeutas que trabalham
explicitamente com a taxonomia de distorções e a ensinam ao paciente como
psicoeducação. Retirar o campo puniria essa prática. Mantê-lo opcional e
posterior atende as duas escolas sem forçar nenhuma — mesma lógica de R19
(agente agnóstico) aplicada ao formulário humano.

> **Ressalva de fonte.** A comparação estrutural acima segue o mesmo padrão
> de rigor de `protocolo-tcc.md`: descreve estrutura de instrumentos
> amplamente documentada na literatura de TCC, **sem leitura direta de fonte
> primária nesta sessão**. O que está sendo decidido é o formulário do
> produto, não uma afirmação editorial sobre a obra de nenhum autor. Não
> reproduzir layout, numeração de colunas ou texto de formulário publicado —
> `protocolo-tcc.md` §2.1 registra que a **estrutura conceitual é livre**,
> mas o layout/texto de edições específicas pode ter direitos autorais.

---

## 3. Ordem do formulário

A ordem é parte da intervenção, não estética. O paciente percorre:

| #   | Campo                                | Obrigatório | Nota                                |
| --- | ------------------------------------ | ----------- | ----------------------------------- |
| 1   | **Situação**                         | sim         | quem, o quê, onde, quando — factual |
| 2   | **Pensamento automático**            | sim         | verbatim quando possível            |
| 3   | **Emoção** + **intensidade**         | sim         | escala da clínica (§5)              |
| 4   | **Credibilidade do pensamento** (%)  | não         | quanto acredita nele, 0-100         |
| 5   | **Evidências a favor**               | ver §4      | o que sustenta o pensamento         |
| 6   | **Evidências contra**                | ver §4      | o que o contradiz                   |
| 7   | **Pensamento alternativo**           | ver §4      | era `resposta_racional`             |
| 8   | **Credibilidade da alternativa** (%) | não         | 0-100                               |
| 9   | **Distorção cognitiva**              | **NÃO**     | multisseleção, opcional, colapsada  |
| 10  | **Reavaliar intensidade da emoção**  | ver §4      | `intensidade_pos`                   |
| 11  | **Comportamento resultante**         | não         | evitação, checagem, enfrentamento   |

Mudanças de posição relevantes:

- a distorção sai do meio do fluxo e vai para **depois** da reestruturação.
  Deixa de ser pedágio e vira anotação;
- as evidências entram **entre** o pensamento e a alternativa, que é onde
  fazem trabalho terapêutico;
- credibilidade (%) do pensamento e da alternativa é eixo distinto da
  intensidade da emoção. Um pensamento pode perder credibilidade antes da
  emoção ceder — e essa defasagem é informação clínica, não ruído.

### 3.1 Copy do campo de distorção

Rótulo: **"Que armadilha de pensamento parece ser? (opcional)"**

Texto de apoio, visível:

> Pular este campo não prejudica o registro. As categorias se sobrepõem e
> nem os manuais concordam entre si — o que muda o quadro é examinar as
> evidências e formular uma alternativa, o que você já fez acima.

Campo **colapsado por padrão**, expansível. Nunca bloqueia o salvamento.

### 3.2 Acessibilidade

Acessibilidade é compromisso de primeira classe do produto, não verniz.

- Distorções: `fieldset` + `legend` com checkboxes — **não** combobox
  multisseleção, que é hostil a leitor de tela e a teclado.
- Escalas 0-100: `input[type=number]` sempre disponível como par do slider;
  slider sozinho não é operável de forma confiável por teclado nem por
  motricidade reduzida.
- Campos opcionais marcados no **rótulo**, não só por ausência de asterisco —
  ausência não é anunciada por leitor de tela.

---

## 4. Regra de validação: "registro" vs. "reestruturação completa"

Substituir "campo obrigatório" por **dois estados de completude**, ambos
salváveis:

- **Registro capturado** — campos 1, 2, 3. É o mínimo para não perder o
  episódio. Um paciente em crise precisa conseguir registrar e sair.
- **Reestruturação completa** — adicionalmente: pelo menos uma das duas
  colunas de evidência preenchida **E** pensamento alternativo **E**
  intensidade reavaliada.

A distorção **nunca** entra em nenhum dos dois critérios.

Consequências:

- o formulário salva parcial e permite retomar depois; nada se perde por
  falta de campo;
- `grafico-evolucao-crencas.tsx` só plota delta de intensidade a partir de
  registros em estado **reestruturação completa** — um delta calculado sobre
  registro parcial é ruído apresentado como resultado;
- a completude é **derivada**, nunca uma coluna gravada. Carimbo de estado
  gravado e não limpo na volta já produziu defeito silencioso neste repo
  (memória `carimbo-de-estado-nao-limpo-na-volta`).

---

## 5. Taxonomia de distorções: contrato por clínica, não enum no banco

`protocolo-tcc.md` §2.1 e §6 achado 2 são categóricos: `taxonomia_distorcoes`
**precisa** ser campo do contrato por clínica, pelo mesmo motivo que
`taxonomia_ajuda` não é constante do agente (R19). Uma lista fixa no produto
reintroduz o defeito que o documento marcou como fácil de reintroduzir.

Isso **contraria** a saída óbvia para o problema do `text` livre (§1.3), que
seria promover as 12 opções de `constants.ts` a enum PG ou CHECK. Registrado
aqui de propósito, porque é a armadilha natural: **enum PG resolveria a
estabilidade de agregação e violaria R19.**

Desenho proposto:

- as 12 opções de `constants.ts:3-16` viram **semente padrão**, não lei;
- a clínica tem sua própria `taxonomia_distorcoes` (array de slugs +
  rótulo), editável;
- `tcc_rpd_entry` grava **slugs**, não rótulos livres — estabilidade de
  agregação sem enum PG;
- validação: os slugs precisam pertencer à taxonomia **da clínica do
  paciente**, checada no core sob RLS. Não é `CHECK` de banco, é invariante
  de aplicação com teste de integração.
- clínicas diferentes com taxonomias diferentes **não** são comparáveis entre
  si. Nenhum agregado cross-clínica de distorção deve existir — e a
  comparabilidade **dentro** da clínica depende de a clínica padronizar,
  não do sistema (`protocolo-tcc.md` §7.4).

---

## 6. Mudanças de schema

Sobre `tcc_rpd_entry` (`0103`). Migração nova; ver restrição de transação em
`docs/arquitetura/modalidades-clinicas-e-abordagens.md` §3.2 caso algum enum
PG entre junto.

| Coluna                      | Ação                              | Notas                                                                                                                                                          |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `distorcao_cognitiva`       | **remover**                       | substituída abaixo                                                                                                                                             |
| `distorcoes_cognitivas`     | **adicionar** `text[] NULL`       | plural, opcional, slugs (§5)                                                                                                                                   |
| `evidencias_favor`          | **adicionar** `text NULL`         |                                                                                                                                                                |
| `evidencias_contra`         | **adicionar** `text NULL`         |                                                                                                                                                                |
| `credibilidade_inicial`     | **adicionar** `smallint NULL`     | CHECK 0-100                                                                                                                                                    |
| `credibilidade_alternativa` | **adicionar** `smallint NULL`     | CHECK 0-100                                                                                                                                                    |
| `comportamento_resultante`  | **adicionar** `text NULL`         | `protocolo-tcc.md` §2.1                                                                                                                                        |
| `origem_resposta_racional`  | **adicionar**                     | enum `paciente_independente` / `com_apoio_terapeuta` / `nao_informado`. **Proposta não fechada** — `protocolo-tcc.md` R5 a marca como pendente de confirmação. |
| `resposta_racional`         | manter, **renomear** rótulo na UI | vira "pensamento alternativo"; nome de coluna preservado para não quebrar `logic.ts`/testes                                                                    |

Cuidados obrigatórios:

- **`GRANT` por coluna.** `patient` e outras tabelas têm `UPDATE` revogado
  por tabela e concedido coluna a coluna. Coluna nova sem `GRANT` explícito
  produz `permission denied for table X` (regra 4 de `CLAUDE.md`,
  memória `postgres-column-grant-denies-table`). Conferir com
  `has_column_privilege`, não com `role_table_grants`.
- **Backfill de `distorcao_cognitiva` → `distorcoes_cognitivas`.** Os
  registros existentes são de desenvolvimento, mas o script tem que
  existir e ser idempotente. Valor que não casar com nenhum slug da
  taxonomia da clínica vai para `NULL`, **não** é descartado em silêncio —
  registrar a contagem de não-casados na saída da migração.
- **RLS:** copiar `0103:37-60` verbatim para qualquer tabela nova. Usar
  `app_clinic_id_exigido()`, nunca `current_setting('app.clinic_id')` cru
  nem `app_clinic_id_atual()` em predicado de isolamento (regra 6 de
  `CLAUDE.md`).

---

## 7. Implicação para o agente de extração

Quando a ponte agente→RPD existir (hoje não existe: `tcc_rpd_entry` só é
escrita pelo formulário manual), as regras já valem:

- **R1 com força redobrada na distorção.** Se o texto não permite reconhecer
  o padrão, o agente **não classifica**. Array vazio é resposta válida e
  esperada — agora com respaldo do formulário, onde o campo também é
  opcional. Antes desta decisão havia uma incoerência: o contrato do agente
  permitia vazio, o formulário humano exigia preenchimento.
- **R4-TCC (distorção antes da emoção)** continua: classifica pela estrutura
  do pensamento, nunca pela emoção nomeada. Duas distorções plausíveis →
  registrar as duas com confiança média, ou nenhuma com confiança baixa.
  Nunca escolher por palpite.
- **R11 (números só literais)** vale para intensidade **e** credibilidade.
  "muito ansioso" não vira 80; "acho que acredito bastante" não vira 75%.
- Extração de RPD entra na fila de validação humana como sugestão. Nenhum
  RPD gerado por agente vira registro oficial sem aprovação do terapeuta —
  exceto o caminho de risco, que é o único que não espera fila
  (`protocolo-tcc.md` §4).

---

## 8. Fora de escopo deste documento

- Escolha do "hot thought" quando há vários pensamentos automáticos no mesmo
  episódio: hoje `pensamento_automatico` é escalar. Registrar em
  `BACKLOG.md`; muda a cardinalidade do registro, não cabe nesta rodada.
- Escala de intensidade 0-10 vs. 0-100 por clínica: `protocolo-tcc.md` §2.1
  já decidiu que é campo do contrato. O formulário lê da clínica; a
  implementação do contrato é issue própria.
- Ligação com o motor de alerta de risco quando um RPD contém ideação:
  `modalidades-clinicas-e-abordagens.md` §7.
