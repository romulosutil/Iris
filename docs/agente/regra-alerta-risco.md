# Regra de Alerta de Risco Clínico — Desenho Operacional

> Fecha o gap descrito na [issue #101](https://github.com/romulosutil/Iris/issues/101):
> `docs/agente/protocolo-terapia-convencional.md` (R5-TC) e
> `docs/agente/protocolo-tcc.md` (Seção 4, "R20" proposta) já definiram **QUE**
> a regra existe e **QUANDO** ela dispara — casos de teste já fixam isso
> (`docs/agente/casos-de-teste-terapia-convencional.md` TC-2,
> `docs/agente/casos-de-teste-tcc.md` T5). Este documento fecha **O QUE
> ACONTECE DEPOIS** do disparo: canal, SLA, escalonamento, modelo de dado,
> copy. Escopo: só especificação/documentação — nada aqui está implementado.
> Contexto lido antes de escrever: os dois protocolos acima, `README.md` (8
> princípios), `docs/governanca/validacao-coordenador.md` (V1-V5),
> `docs/legal/briefing-para-advogado.md`, `src/db/schema.ts` (tabela `alerta`,
> linhas ~1151-1223), `src/app/(app)/supervisao/logic.ts` e `BACKLOG.md`
> (sessão 20/07/2026, Fase 5 Fatia 2).

**Como ler este documento:** ele fecha decisões técnicas (canal, SLA,
schema, copy) com recomendação concreta e justificada — não deixa "opções
penduradas". Mas há um ponto (Seção 5, duty to warn) que é **explicitamente
deixado em aberto**, porque é decisão de responsabilidade profissional/ética
(CFP), não de engenharia — travá-la aqui seria o próprio erro que a issue
pede para evitar.

---

## 1. O gatilho de detecção

### 1.1 Princípio central — sinalização, nunca autoridade

O agente de IA **nunca classifica risco clínico com autoridade**. Ele
identifica um candidato a risco no texto e sinaliza para revisão humana
imediata — a mesma fronteira já estabelecida em toda a Camada 1 do modelo de
3 governança (`README.md` princípio 2: "IA sugere → terapeuta aprova →
coordenador valida"), levada ao extremo aqui porque o custo de erro é maior.
A diferença para uma extração clínica comum: risco não espera aprovação do
terapeuta para virar "evidência oficial" (ver Seção 3) — ele já dispara
notificação no momento da sinalização, precisamente porque a revisão humana
precisa acontecer **antes**, não depois, de qualquer decisão de produto.

### 1.2 O que conta como gatilho

Consolidado de R5-TC e da Seção 4 de `protocolo-tcc.md`, sem contradição
entre os dois — mesma regra, duas portas de entrada (modo Terapia
Convencional sem protocolo, e modo TCC com `protocolos_ativos` populado):

Qualquer menção — direta, indireta, citação literal do paciente, ou registro
do terapeuta sobre o que o paciente descreveu — a:

1. **Ideação suicida** (incluir "estar melhor morto", "não acordar mais",
   "sumir", "desistir de tudo" quando o contexto sustentar leitura de
   ideação, não apenas expressão coloquial de cansaço — ver Seção 1.4 sobre
   ambiguidade).
2. **Autolesão** (passada ou atual, incluindo automutilação sem intenção
   suicida declarada).
3. **Violência sofrida** pelo paciente (física, sexual, psicológica,
   doméstica) — inclusive quando o próprio paciente minimiza ("já é assim há
   anos, não é nada de mais" — Caso TC-2 é o eval canônico disto: a
   minimização do relato NÃO suprime o alerta).
4. **Violência praticada** pelo paciente contra terceiro.
5. **Risco a terceiro vulnerável no entorno do paciente** relatado por
   terceiro — abuso infantil, negligência, violência doméstica presenciada
   por menor no ambiente familiar do paciente.
6. **Item de risco de instrumento formal** respondido positivamente (ex.:
   item 9 do PHQ-9) — dispara pela mesma regra, não por uma regra separada
   "de escala"; o item positivo é só mais uma forma de o texto conter o
   gatilho, nunca um caminho alternativo com critério diferente.

### 1.3 Níveis de severidade

A literatura de triagem de risco suicida (protocolo padrão de avaliação de
risco em saúde mental — p.ex. escalas tipo Columbia-Suicide Severity Rating
Scale, C-SSRS, cuja estrutura geral é amplamente replicada em triagens
clínicas — **PRECISA CONFIRMAÇÃO COM FONTE PRIMÁRIA se o produto quiser
adotar a C-SSRS formalmente**; aqui só se usa a distinção conceitual, já
consolidada e não controversa, entre ideação/plano/meios) distingue
consistentemente ideação passiva de ideação ativa, e ideação de plano
estruturado. O produto adota essa distinção como campo de severidade — nunca
para decidir SE o alerta dispara (dispara sempre, nível 1.2), só para
priorizar a fila de resposta humana (Seção 4):

| Severidade                 | Definição operacional                                                                                   | Exemplo (dos próprios casos de teste do produto)                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ideacao_passiva`           | Desejo de não estar vivo / de "sumir", sem pensamento sobre método, sem intenção ativa declarada.       | "queria que tudo simplesmente acabasse", sem elaboração de método.                            |
| `ideacao_ativa_sem_plano`   | Pensamento ativo sobre método ("já pensou em como faria"), sem plano estruturado, data ou meios prontos. | Caso T5 (`casos-de-teste-tcc.md`): "já pensou em como faria isso", nega plano/data/coragem.  |
| `ideacao_ativa_com_plano`   | Método + meios + intenção/tempo definidos ou em preparação.                                              | Não coberto ainda por caso de teste do produto — ver Seção 8, Caso ARC-2, a suprir esse gap. |
| `autolesao_recente`         | Autolesão sem intenção suicida declarada, ocorrida ou em curso.                                          | —                                                                                              |
| `tentativa_relatada`        | Tentativa de suicídio relatada (passada, mesmo que antiga).                                              | —                                                                                              |
| `violencia_sofrida`         | Violência sofrida pelo paciente, física/sexual/psicológica.                                              | Caso TC-2: violência doméstica minimizada pela própria paciente.                              |
| `violencia_praticada`       | Violência praticada pelo paciente contra terceiro.                                                        | —                                                                                              |
| `risco_a_terceiro`          | Risco relatado a terceiro vulnerável (menor, dependente) no entorno do paciente.                          | —                                                                                              |

**Regra de desempate obrigatória (herdada diretamente do Caso T5):** na
dúvida entre dois níveis adjacentes, o agente sempre classifica no nível MAIS
GRAVE dos dois candidatos plausíveis — nunca "suaviza" pela negação de
intenção do próprio paciente ("não teria coragem" não rebaixa
`ideacao_ativa_sem_plano` para `ideacao_passiva`; a presença de método
pensado é o que decide a severidade, não a autoavaliação de coragem do
paciente, que não é dado confiável de risco real).

### 1.4 Ambiguidade não suprime o alerta

Um relato pode ser ambíguo ("ela brincou que ia sumir do mapa" — achado 1 da
autovalidação de `protocolo-terapia-convencional.md`). A regra deste
documento: **ambiguidade nunca é motivo para NÃO marcar o alerta** — ela é
motivo para marcar com um campo de certeza mais baixo, que prioriza a fila
mas não faz o alerta desaparecer (ver Seção 7, campo `certeza`). Isso fecha a
lacuna identificada nos dois documentos de origem.

---

## 2. Falso positivo vs. falso negativo — a assimetria e o risco de fadiga

**Custo assimétrico, declarado nos dois documentos de origem e mantido aqui
sem ambiguidade:** perder um alerta real (falso negativo) é uma ordem de
grandeza pior que gerar um alerta espúrio (falso positivo). R5-TC e a Seção 4
de `protocolo-tcc.md` já fixam isso; este documento herda o princípio sem
reabrir a discussão.

Mas o projeto já documentou o efeito colateral desse tipo de decisão em
outro contexto: um gate/gatilho barato demais é aprendido a ser ignorado pelo
operador (precedente do projeto: gate de verificação que sempre falha vira
gate que ninguém confia mais — mesmo princípio aplicado aqui a fadiga de
alerta). Duas medidas concretas para não reintroduzir esse problema:

1. **O campo `certeza` (Seção 7) existe justamente para isso.** Um alerta
   `certeza: "explicito"` (ex.: Caso TC-2, Caso T5 — menção direta e
   inequívoca) e um alerta `certeza: "ambiguo_citado"` (ex.: "brincou que ia
   sumir do mapa") NUNCA deveriam ter o mesmo tratamento de urgência na UI —
   ambos disparam, ambos entram na fila, mas o explícito é visualmente
   distinto e o SLA (Seção 4) pode diferenciar por certeza, não só por
   severidade. Sem essa distinção, cada caso ambíguo (que existirá em volume
   real, dado que linguagem coloquial de sofrimento é comum) teria o mesmo
   peso visual de uma emergência real — a receita exata da fadiga de alerta.
2. **Volume esperado é auditável desde o dia 1.** A tabela proposta (Seção
   7) precisa de uma métrica simples desde o lançamento: proporção de
   alertas com `certeza: "ambiguo_citado"` que o terapeuta descarta como não
   sendo risco genuíno vs. os que confirma. Se a proporção de descarte for
   muito alta (o gatilho está gerando ruído desproporcional), é sinal de
   recalibração do prompt do agente — mas a recalibração é sempre "reduzir
   ruído em `ambiguo_citado`", nunca "reduzir sensibilidade do gatilho em
   si" (a linha entre as duas é o que preserva a assimetria de custo).

**Decisão explícita sobre o trade-off:** o produto aceita a fadiga como
custo residual conhecido e mitigado (por severidade+certeza na UI), não como
problema a resolver reduzindo a sensibilidade do gatilho. Essa é a única
posição compatível com "falso positivo aceitável, falso negativo não".

---

## 3. Canal e destinatário

### 3.1 Decisão

**Terapeuta responsável pela sessão E coordenador, sempre os dois,
simultaneamente, de forma síncrona (não só fila).** Justificativa:

- **Por que não só o terapeuta:** o terapeuta pode estar indisponível
  (sessão terminou, ele já saiu, está em outra sessão) no momento exato em
  que o risco foi registrado — um alerta que depende de uma única pessoa
  notada é um ponto único de falha exatamente no cenário de maior custo de
  atraso.
- **Por que não só o coordenador:** o coordenador pode não ter contexto
  clínico direto do paciente (não é ele quem atende) — precisa do terapeuta
  para agir com informação completa, e delegar 100% ao coordenador
  reintroduziria o mesmo gargalo que V1 (`validacao-coordenador.md`)
  deliberadamente evita para o fluxo normal. Aqui a decisão é diferente de
  V1 não porque o coordenador vira gargalo de qualidade (ele não está
  revisando qualidade), mas porque a gravidade justifica dobrar a cobertura
  em vez de escolher um único destinatário.
- **Por que síncrono, não só fila:** a fila `/supervisao` (Fase 5 Fatia 2)
  foi desenhada para sinais que toleram alguém abrir a tela em algum
  momento do dia/semana (estagnação, regressão, faltas — nenhum deles é
  emergência de minutos). Risco clínico não tolera esse modelo — precisa de
  push imediato (notificação in-app com som/badge persistente no mínimo;
  e-mail/SMS como camada adicional é decisão de infraestrutura de
  notificação fora do escopo deste documento, mas deveria ser avaliada antes
  do piloto real com paciente de risco alto conhecido).

### 3.2 Fila dedicada, não extensão da fila `/supervisao`

**Decisão: fila dedicada (`/alertas-risco` ou nome equivalente), NÃO um novo
`tipo` de sinal na tabela `alerta` existente.** Razões concretas, olhando o
schema real (`src/db/schema.ts` linhas 1151-1223) e a lógica
(`src/app/(app)/supervisao/logic.ts`):

1. **O modelo de concorrência da tabela `alerta` pressupõe sinal "vivo até
   cessar", não evento pontual de emergência.** `chaveNatural` com unique
   index parcial (`WHERE deletado_em IS NULL`) e o padrão de "1 alerta vivo
   por condição" fazem sentido para estagnação/regressão (a condição
   persiste até ser resolvida ou o sinal cessar) — mas risco clínico é
   evento pontual: cada menção em cada sessão é um evento novo que merece
   reconhecimento próprio, mesmo que o mesmo paciente já tenha tido um
   alerta anterior (dedupe por `chaveNatural` faria dois relatos de risco em
   sessões diferentes colidirem ou se suprimirem incorretamente se a chave
   não for desenhada com essa diferença em mente — risco real de bug se
   forçado no mesmo modelo).
2. **A constraint `alerta_locator` (linha 1210-1214) é hardcoded para os 3
   tipos existentes** (`goalId`+`protocolId` obrigatórios para
   estagnação/regressão, ambos nulos para faltas). Um alerta de risco não
   tem `goalId` nem `protocolId` como localizador natural — teria que
   forçar o padrão de "faltas" (ambos nulos) e perderia a chance de um
   localizador mais específico (severidade, certeza, canal) que a tabela
   atual não tem colunas para representar sem migração.
3. **SLA e escalonamento (Seção 4) não existem em NENHUM sinal atual da
   tabela `alerta`** (confirmado lendo `logic.ts`: reconhecer/resolver/
   descartar não têm timestamp de prazo nem lógica de escalonamento) — isso
   não é uma pequena extensão, é um conceito novo de domínio (tempo como
   dimensão de decisão, não só estado). Encaixar isso na tabela existente
   misturaria dois modelos de dado com semânticas de urgência incompatíveis
   dentro da mesma tabela, comprometendo a legibilidade da fila de
   supervisão comum (um coordenador olhando `/supervisao` não deveria ter
   que escanear entre "estagnação de meta" e "risco de vida" na mesma lista
   ordenada pelos mesmos critérios).
4. **RLS/autorização já é diferente:** hoje `/supervisao` é
   coordenador-only (`requireRole(ctx, "coordenador")` em toda action de
   `logic.ts`). A fila de risco precisa também do terapeuta responsável
   (Seção 3.1) — role diferente, política de RLS diferente. Reaproveitar a
   tabela `alerta` obrigaria estender a política de RLS dela para outro
   papel, alterando o modelo de autorização de um recurso já implantado em
   produção (Fase 5 Fatia 2, `BACKLOG.md` linha 612) por causa de um
   requisito que não é dela — acoplamento desnecessário.

**Trade-off reconhecido, não escondido:** fila dedicada custa mais
implementação (nova tabela, nova RLS, nova UI) do que estender a existente.
A decisão aqui é que o custo de acoplar um evento de vida/segurança ao
modelo de dado de "sinal de estagnação de meta pedagógica" é maior que o
custo de implementação de uma tabela nova — coerente com "custo de erro
muito maior" já citado na própria issue #101.

---

## 4. SLA e escalonamento

Este é o primeiro conceito de SLA/escalonamento por tempo em qualquer fila
do Iris — não há precedente direto no produto para adaptar; a proposta abaixo
é desenho novo, sujeito a validação com o Rômulo antes de virar código (fora
do escopo deste documento, que é só especificação).

### 4.1 SLA proposto

| Severidade                                             | SLA de reconhecimento (por qualquer um dos dois destinatários) |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `ideacao_ativa_com_plano`, `tentativa_relatada`         | 15 minutos                                                          |
| `ideacao_ativa_sem_plano`, `autolesao_recente`          | 1 hora                                                              |
| `ideacao_passiva`, `violencia_sofrida`/`praticada`, `risco_a_terceiro` | 4 horas (mesmo dia útil)                             |
| Qualquer severidade com `certeza: "ambiguo_citado"`     | Mesmo SLA da severidade classificada — a ambiguidade não relaxa o prazo, só afeta apresentação (Seção 2) |

"Reconhecer" aqui significa uma ação humana explícita de "estou ciente,
estou avaliando" — não implica que o caso esteja resolvido, só que alguém
com competência clínica já está com os olhos nele. Distinto de "resolver"
(Seção 7), que fecha o caso.

### 4.2 Escalonamento se ninguém reconhecer no prazo

Proposta em 2 estágios:

1. **Estágio 1 (SLA vencido, ninguém reconheceu):** escalar para TODOS os
   coordenadores da clínica (não só o vinculado ao paciente) — o grafo M:N
   já suporta múltiplos coordenadores por clínica (princípio 7 do README).
   Notificação de escalonamento explicitamente marcada como "SLA de alerta
   de risco vencido" — nunca silenciosa, mesmo princípio de V4
   (`validacao-coordenador.md`: "a notificação nunca é silenciosa").
2. **Estágio 2 (dobro do SLA original vencido, ainda ninguém reconheceu):**
   este é o ponto em que o produto **não pode decidir sozinho o que fazer** —
   escalar para um canal fora do produto (contato de emergência da clínica?
   linha de crise? isso depende diretamente da resposta jurídica/ética da
   Seção 5, duty to warn) é decisão que **não deveria ser travada aqui**.
   Registrado como requisito confirmado (precisa existir um estágio 2), com
   o mecanismo concreto pendente da mesma validação profissional da Seção 5.

### 4.3 Por que 2 estágios e não escalonamento contínuo

Um esquema de escalonamento que soa a cada N minutos indefinidamente tende a
gerar o mesmo efeito de fadiga discutido na Seção 2, na direção oposta
(alarme persistente sendo silenciado pelo usuário por exaustão, não por
descrença). Dois estágios discretos (mais coordenadores → canal externo)
equilibram urgência real com o mesmo cuidado antifadiga.

---

## 5. Duty to warn — decisão que exige validação profissional (NÃO travada aqui)

**Este documento não responde as perguntas desta seção.** Elas são
apresentadas como perguntas objetivas, no mesmo formato de
`docs/legal/briefing-para-advogado.md`, precisamente para que a resposta
venha de quem tem competência para dá-la — psicólogo(a)/advogado(a)
consultado(a) pelo Rômulo, nunca deste documento nem do agente de IA.
Nenhuma implementação do fluxo desta seção deveria avançar sem essas
respostas.

**Perguntas objetivas para o profissional consultado:**

1. O terapeuta que atende pelo Iris tem, pela Resolução CFP aplicável (e por
   eventual dispositivo estadual do conselho regional), alguma **obrigação
   de notificar terceiro** (autoridade, família, contato de emergência) ao
   identificar risco de vida a si ou a outrem relatado em sessão? Essa
   obrigação muda conforme o tipo de risco (ideação vs. violência sofrida
   vs. violência a terceiro, especialmente menor)?
2. Se existe obrigação de notificação, ela é do **terapeuta enquanto
   profissional** (responsabilidade dele, independente de ferramenta) ou o
   **produto Iris** assume alguma responsabilidade adicional por
   intermediar/registrar/armazenar o alerta? (Esta pergunta decide se o
   produto pode, no futuro, oferecer "notificar contato de emergência
   diretamente pelo app" como feature, ou se isso teria que ficar
   estritamente fora do escopo do produto, deixando a ação humana 100% fora
   da ferramenta.)
3. O SLA proposto na Seção 4 (15 minutos / 1 hora / 4 horas) é compatível
   com o padrão de diligência esperado da prática profissional, ou existe
   um prazo de referência já usado em protocolo de crise clínico que o
   produto deveria espelhar em vez de propor um número novo?
4. Existe risco de o produto, ao oferecer QUALQUER automação neste fluxo
   (mesmo só "sinalizar e notificar", sem decidir nada), criar **falso senso
   de segurança** para a clínica-cliente — isto é, a clínica passar a confiar
   que "o Iris cobre isso" e relaxar o próprio protocolo de crise interno?
   Se sim, que texto/disclaimer contratual (termos de uso, `docs/legal/`)
   mitigaria esse risco?
5. Isso muda por estado do Brasil, por tipo de vínculo profissional (CLT vs.
   autônomo vs. clínica-empresa), ou por idade do paciente (adulto
   autoconsentindo vs. menor com responsável)?

**Enquanto essas respostas não existirem:** o desenho deste documento
(Seções 3-4) cobre só a parte que é seguramente território de produto —
notificar rapidamente os humanos certos dentro do Iris. Qualquer ação que
"saia" do produto (notificar terceiro externo, acionar serviço de
emergência) fica fora de escopo até a resposta acima existir — nunca
implementar por analogia ou suposição.

---

## 6. Copy do alerta

Princípio idêntico ao já usado em R4-TC e no restante de `docs/agente/`:
linguagem sempre hedged, nunca overclaim de capacidade diagnóstica da IA.
Nunca "IA detectou risco de suicídio" — sempre formulação que deixa claro
que a interpretação/decisão é humana.

### 6.1 Texto do alerta na UI (proposta)

**Título (lista da fila):**
> "Sinal identificado no relato requer revisão prioritária"

**Corpo (detalhe do alerta, visível ao abrir):**
> "O relato de sessão contém um trecho que corresponde a um padrão de
> [categoria — ex.: 'menção a ideação suicida', 'relato de violência
> sofrida']. Esta sinalização é gerada automaticamente a partir de padrões no
> texto e **não constitui avaliação clínica de risco** — cabe a você revisar
> o trecho abaixo e decidir a conduta apropriada."

**Nunca usar (lista negativa, mesmo padrão de R4-TC):**

- "A IA detectou risco de suicídio."
- "Paciente em risco de [X]."
- "Alerta de suicídio."
- "Confirmado: [categoria de risco]."
- Qualquer formulação que atribua ao sistema um veredito, em vez de uma
  sinalização.

**Sempre usar:**

- "Sinal identificado", "padrão correspondente a", "requer revisão".
- O trecho literal do diário, sempre visível ao lado do alerta (nunca
  parafraseado) — o profissional precisa ver a fonte, não confiar na
  categorização.

### 6.2 Notificação push/e-mail (texto curto)

> "Iris: novo sinal prioritário no diário de [nome do paciente] requer
> revisão. Abrir agora."

Deliberadamente sem categoria de risco no texto da notificação push (que
pode aparecer em tela de bloqueio de celular, visível a terceiros) — a
categoria só aparece dentro do app, após autenticação. Ver Seção 9, achado
sobre isso.

---

## 7. Modelo de dado proposto

Tabela nova, dedicada (Seção 3.2), paralela a `alerta` mas não filha dela.
Nome proposto: `alerta_risco_clinico` (sujeito a revisão de nome, não
decisão travada). Segue os mesmos padrões estruturais já usados em `alerta`
(soft-delete via `deletadoEm`, audit inline, `clinicId`+`patientId` FK
composta anti-IDOR) — reaproveita convenção sem reaproveitar a tabela.

```ts
export const alertaRiscoCategoria = pgEnum("alerta_risco_categoria", [
  "ideacao_suicida",
  "autolesao",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
]);

export const alertaRiscoSeveridade = pgEnum("alerta_risco_severidade", [
  "ideacao_passiva",
  "ideacao_ativa_sem_plano",
  "ideacao_ativa_com_plano",
  "autolesao_recente",
  "tentativa_relatada",
  "violencia_sofrida",
  "violencia_praticada",
  "risco_a_terceiro",
]);

export const alertaRiscoCerteza = pgEnum("alerta_risco_certeza", [
  "explicito",       // menção direta, inequívoca (ex.: Caso TC-2, Caso T5)
  "ambiguo_citado",  // texto ambíguo, mas citado literalmente — alerta mantido (Seção 1.4)
]);

export const alertaRiscoStatus = pgEnum("alerta_risco_status", [
  "aberto",              // recém-criado, aguardando reconhecimento
  "reconhecido",         // um dos destinatários confirmou ciência (SLA cumprido)
  "escalado_estagio_1",  // SLA vencido, escalado para todos coordenadores da clínica
  "escalado_estagio_2",  // 2º SLA vencido — canal externo (Seção 4.2, pendente Seção 5)
  "resolvido",           // conduta humana definida e registrada
  "descartado",          // avaliado como não-risco após revisão humana (nunca apaga o registro)
]);

export const alertaRiscoClinico = pgTable(
  "alerta_risco_clinico",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id").notNull().references(() => clinic.id),
    patientId: uuid("patient_id").notNull(),
    sessionId: uuid("session_id").notNull().references(() => session.id),

    categoria: alertaRiscoCategoria("categoria").notNull(),
    severidade: alertaRiscoSeveridade("severidade").notNull(),
    certeza: alertaRiscoCerteza("certeza").notNull(),
    trechoFonte: text("trecho_fonte").notNull(), // citação literal do diário
    detalhe: text("detalhe").notNull(),          // descrição literal do agente, sem interpretação de gravidade além do relatado

    status: alertaRiscoStatus("status").notNull().default("aberto"),

    // canal(is) de notificação disparados neste alerta — auditoria de envio, não decisão
    canaisNotificados: jsonb("canais_notificados").notNull(), // ex.: ["push_terapeuta", "push_coordenador"]

    slaMinutos: integer("sla_minutos").notNull(), // resolvido na criação, a partir de severidade+certeza (Seção 4.1)
    prazoReconhecimento: timestamp("prazo_reconhecimento", { withTimezone: true }).notNull(),

    reconhecidoPor: uuid("reconhecido_por").references(() => appUser.id),
    reconhecidoEm: timestamp("reconhecido_em", { withTimezone: true }),

    escaladoEm: timestamp("escalado_em", { withTimezone: true }), // 1º estágio
    escaladoEstagio2Em: timestamp("escalado_estagio_2_em", { withTimezone: true }),

    condutaRegistrada: text("conduta_registrada"), // preenchido em resolver — o que o humano decidiu fazer
    motivoDescarte: text("motivo_descarte"),        // preenchido em descartar

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoPor: uuid("atualizado_por").notNull().references(() => appUser.id),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),

    deletadoEm: timestamp("deletado_em", { withTimezone: true }), // nunca usado para expurgo (ver achado 9.2) — só paridade RLS
  },
  (t) => [
    foreignKey({
      columns: [t.patientId, t.clinicId],
      foreignColumns: [patient.id, patient.clinicId],
      name: "alerta_risco_patient_fk",
    }).onDelete("cascade"),
    index("idx_alerta_risco_fila").on(t.clinicId, t.status).where(sql`${t.deletadoEm} IS NULL`),
    index("idx_alerta_risco_sla").on(t.status, t.prazoReconhecimento), // suporte ao job de escalonamento (achado 9.1)
  ],
);
```

Notas de modelagem:

- **Sem dedupe por `chaveNatural`.** Diferente de `alerta`, cada linha é um
  evento (uma menção, numa sessão específica) — dois relatos de risco em
  sessões diferentes do mesmo paciente são dois alertas distintos,
  deliberadamente (Seção 3.2, ponto 1).
- **`condutaRegistrada` é texto livre, não enum.** A conduta humana diante
  de um risco real (contato com família, encaminhamento a serviço de
  emergência, plano de segurança combinado em sessão) é diversa demais para
  travar em enum nesta primeira versão — e um enum aqui correria o risco de
  sugerir ao terapeuta "opções aceitáveis", o que não é papel do produto
  definir (mesmo espírito de R3-TC: o produto nunca prescreve conduta).
- **`sessionId` obrigatório** (diferente de `alerta`, que não referencia
  sessão) — o alerta de risco nasce sempre de uma sessão específica, e a
  rastreabilidade ao diário de origem é o próprio mecanismo de auditoria
  (princípio 1 do README: "dados estruturados são derivados e rastreáveis à
  frase de origem").

---

## 8. Casos de teste

Formato idêntico a `docs/agente/casos-de-teste.md` (Diário de entrada →
Regras que este caso exercita → Saída esperada), estendido aqui com uma
seção "Fluxo pós-disparo esperado" porque o foco destes 4 casos é o
desenho OPERACIONAL (Seções 3-4), não a extração em si (já coberta por TC-2 e
T5). Arquivo companheiro sugerido:
`docs/agente/casos-de-teste-alerta-risco.md` — replicado aqui por
completude, sem duplicar TC-2/T5 (que continuam sendo os casos canônicos de
disparo do agente).

### Caso ARC-1 — Ideação passiva sem plano, certeza ambígua

**Contexto:** paciente adulto, modo Terapia Convencional, 5ª sessão, sem
histórico de risco anterior.

**Diário de entrada:**

> "Sessão de rotina. O paciente comentou, meio de passagem, que 'às vezes
> dá vontade de simplesmente sumir, de não ter que lidar com nada disso' ao
> falar sobre a sobrecarga no trabalho. Não aprofundou quando perguntei mais,
> mudou de assunto para falar da entrega de um projeto."

**Regras que este caso exercita:** R5-TC / Seção 4 de `protocolo-tcc.md`
(alerta dispara mesmo em sessão de rotina, sem contexto prévio de risco);
Seção 1.4 deste documento (ambiguidade — "dá vontade de sumir" no contexto de
sobrecarga de trabalho é candidato a ideação passiva, mas não é inequívoco —
`certeza: "ambiguo_citado"`, não `"explicito"`); Seção 2 (o alerta dispara
mesmo assim — ambiguidade nunca suprime).

**Saída esperada (alerta):**

```json
{
  "categoria": "ideacao_suicida",
  "severidade": "ideacao_passiva",
  "certeza": "ambiguo_citado",
  "trecho_fonte": "às vezes dá vontade de simplesmente sumir, de não ter que lidar com nada disso",
  "detalhe": "Paciente relatou, no contexto de sobrecarga de trabalho, desejo passivo de 'sumir'/'não lidar com nada'. Não aprofundou quando questionado. Sem menção a método, plano ou intenção ativa. Classificado como ideação passiva com certeza ambígua — trecho pode refletir expressão coloquial de cansaço, mas o padrão linguístico corresponde a ideação passiva e o alerta é mantido integralmente."
}
```

**Fluxo pós-disparo esperado:** SLA de 4 horas (Seção 4.1). Notificação
síncrona a terapeuta e coordenador, apresentação na UI com prioridade visual
mais baixa que um caso `certeza: "explicito"` de mesma severidade (Seção 2),
mas o SLA continua sendo o mesmo — a certeza não relaxa o prazo.

---

### Caso ARC-2 — Ideação ativa com plano e meios (severidade máxima)

**Contexto:** paciente adulto, modo TCC, em tratamento para depressão maior
grave — mesmo paciente-tipo do Caso T5, mas evolução de gravidade (gap
identificado na Seção 1.3, agora suprido).

**Diário de entrada:**

> "Paciente relatou nesta sessão que já separou os comprimidos que pretende
> usar 'se as coisas não melhorarem até o fim do mês', guardados numa gaveta
> específica. Disse que já escreveu uma carta, mas não decidiu ainda o dia
> exato. Nega ter contado para alguém da família."

**Regras que este caso exercita:** Seção 1.3 (distinção entre
`ideacao_ativa_sem_plano` — Caso T5 — e `ideacao_ativa_com_plano` — este
caso: meios já separados + carta escrita + prazo aproximado definido = plano
estruturado, não apenas método pensado); Seção 4.1 (SLA de 15 minutos, o mais
curto da tabela); R1-TC/R1 (fidelidade — "nega ter contado para família" é
dado clínico relevante registrado literalmente, sem inferir o motivo da
paciente não ter contado).

**Saída esperada (alerta):**

```json
{
  "categoria": "ideacao_suicida",
  "severidade": "ideacao_ativa_com_plano",
  "certeza": "explicito",
  "trecho_fonte": "já separou os comprimidos que pretende usar 'se as coisas não melhorarem até o fim do mês', guardados numa gaveta específica ... já escreveu uma carta",
  "detalhe": "Paciente relata plano estruturado: meios já separados e guardados, carta de despedida já escrita, prazo aproximado ('fim do mês') definido. Nega ter comunicado a família. Severidade máxima da tabela — não rebaixada por ausência de data exata (a ausência de dia específico não reduz a gravidade do plano já em curso)."
}
```

**Fluxo pós-disparo esperado:** SLA de 15 minutos. Se ninguém reconhecer no
prazo, escalonamento estágio 1 imediato (todos os coordenadores da clínica,
Seção 4.2) — este é o caso onde o estágio 2 (canal externo, pendente da
Seção 5) mais provavelmente se aplicaria na prática, mas o mecanismo
concreto do estágio 2 continua não fechado por este documento.

---

### Caso ARC-3 — Alerta reconhecido dentro do SLA

**Contexto:** continuação do Caso ARC-1 (severidade `ideacao_passiva`, SLA
de 4 horas, criado às 14h00).

**Evento:** o terapeuta responsável abre o alerta às 15h30 (1h30 após a
criação, dentro do SLA de 4 horas) e registra reconhecimento.

**Regras que este caso exercita:** Seção 4.1 (SLA cumprido — nenhum
escalonamento deve disparar); Seção 7 (campos `reconhecidoPor`/
`reconhecidoEm` preenchidos, `status` transiciona `aberto` → `reconhecido`);
distinção Seção 4.1 entre "reconhecer" (ciência) e "resolver" (Seção 7,
`condutaRegistrada`) — reconhecer não fecha o caso.

**Saída esperada (transição de estado):**

```json
{
  "status_anterior": "aberto",
  "status_novo": "reconhecido",
  "reconhecido_por": "usr_terapeuta_123",
  "reconhecido_em": "2026-07-27T15:30:00-03:00",
  "sla_cumprido": true,
  "escalonamento_disparado": false
}
```

**Nota de produto:** o caso permanece `status: "reconhecido"` até que uma
conduta seja registrada (transição para `resolvido`) ou o caso seja avaliado
como não-risco após revisão humana (transição para `descartado`, com
`motivoDescarte` obrigatório — nunca silencioso, mesmo princípio V4 de
`validacao-coordenador.md`).

---

### Caso ARC-4 — Alerta não reconhecido → escalonamento dispara

**Contexto:** paciente adulto, modo Terapia Convencional. Alerta criado com
severidade `autolesao_recente` (SLA de 1 hora, Seção 4.1), às 22h00 — fora do
horário comercial da clínica.

**Diário de entrada:**

> "Paciente mostrou marcas recentes de corte no antebraço, disse que fez
> isso 'há dois dias, numa noite ruim'. Nega intenção suicida associada,
> disse que 'foi só para aliviar a tensão'. Concordou em falar sobre isso
> mais na próxima sessão."

**Evento:** nem o terapeuta responsável nem o coordenador reconhecem o
alerta dentro de 1 hora (23h00). Nenhuma ação humana registrada.

**Regras que este caso exercita:** Seção 4.2 (escalonamento estágio 1 —
todos os coordenadores da clínica são notificados às 23h00, marcados
explicitamente como "SLA de alerta de risco vencido"); Seção 3.1 (o
cenário de indisponibilidade do terapeuta fora do horário comercial é
justamente o caso que motiva notificar os dois destinatários desde o
início — aqui nem os dois destinatários originais reconheceram, forçando o
próximo nível); Seção 4.3 (escalonamento em estágio discreto, não contínuo —
uma única notificação de escalonamento às 23h00, não uma a cada 5 minutos).

**Saída esperada (transição de estado):**

```json
{
  "status_anterior": "aberto",
  "status_novo": "escalado_estagio_1",
  "prazo_reconhecimento": "2026-07-27T23:00:00-03:00",
  "escalado_em": "2026-07-27T23:00:00-03:00",
  "canais_notificados": [
    "push_terapeuta_original",
    "push_coordenador_original",
    "push_todos_coordenadores_clinica"
  ],
  "sla_cumprido": false
}
```

**Nota de produto:** este caso é o que valida a decisão da Seção 3.1 de
notificar os dois destinatários desde o início — mesmo assim, indisponibilidade
simultânea de ambos é um cenário real (fora de horário comercial, férias,
etc.) que o escalonamento precisa cobrir. Sem escalonamento, este caso
seria exatamente o tipo de falso negativo operacional (não de detecção, mas
de resposta) que a Seção 2 trata como inaceitável.

---

## 9. Achados da autovalidação

Revisão crítica deste documento, no mesmo padrão de rigor já aplicado aos
outros documentos de `docs/agente/` — nenhum "aprovado sem ressalva".

1. **O SLA (Seção 4) depende de um job/cron para detectar vencimento e
   disparar escalonamento — e o Iris hoje não tem execução agendada nativa
   no ambiente de produção.** A memória do projeto sobre a migração para
   VPS/Easypanel já registra que a v2.31 do Easypanel não tem cron nativo
   para app (agendador precisa ser script do repo no campo Comando) — o
   escalonamento por SLA proposto aqui depende diretamente dessa
   infraestrutura de agendamento existir e ser confiável. Se o cron/job
   falhar silenciosamente, o alerta fica "aberto" indefinidamente sem
   nenhum escalonamento disparar — isso é, na prática, o mesmo problema de
   falso negativo que a Seção 2 trata como inaceitável, só que na camada de
   infraestrutura, não de detecção do agente. **Este documento não resolve
   isso** — só registra que a implementação real precisa de monitoramento
   ativo do próprio job de escalonamento (alerta sobre o alerta), não
   apenas do fluxo de negócio.

2. **A notificação push (Seção 6.2) deliberadamente omite a categoria de
   risco por causa de exposição em tela de bloqueio — mas isso mesmo cria
   uma tensão com o SLA de 15 minutos do caso mais grave.** Um destinatário
   que só vê "novo sinal prioritário" numa notificação genérica pode não
   priorizar corretamente entre um alerta de `ideacao_ativa_com_plano` e
   outros tipos de notificação do produto (validação de rotina, pendência
   comum) — o texto humano-neutro que protege privacidade em tela de
   bloqueio é o mesmo texto que reduz a urgência percebida no primeiro
   olhar. Não há solução óbvia sem um canal de notificação dedicado com
   estilo visual/sonoro distinto (fora do escopo deste documento, é decisão
   de infraestrutura de notificação) — registrado como tensão não resolvida.

3. **O modelo assume um terapeuta responsável único e um conjunto de
   coordenadores por clínica, mas não trata o caso de paciente com
   atendimento multiprofissional simultâneo** (o mesmo gap já identificado
   no achado 2 da autovalidação de `protocolo-terapia-convencional.md`,
   agora com uma implicação nova aqui: SE um paciente é atendido por dois
   profissionais diferentes (ex.: psicólogo em terapia convencional E
   fonoaudiólogo em outro protocolo), o alerta de risco desta sessão
   deveria notificar qual dos dois terapeutas? A resposta mais segura
   (notificar o profissional daquela sessão específica + sempre o
   coordenador) já está implícita na Seção 3.1 (`sessionId` obrigatório no
   schema, Seção 7), mas não foi testada explicitamente em nenhum dos 4
   casos da Seção 8 — lacuna de cobertura de teste, não de desenho.

4. **A retenção/expurgo de `alerta_risco_clinico` não foi tratada aqui e é
   provavelmente o ponto de maior tensão com LGPD deste documento.** O
   projeto já tem o precedente de que audit_log é pseudonimizado no expurgo
   em vez de deletado (memória do projeto: "erasure×trilha — pseudonimizar
   audit_log no expurgo, não deletar", decisão da Fase 6). Um registro de
   risco clínico é dado sensível por natureza (Art. 5º, II, LGPD — dado de
   saúde) e provavelmente merece o mesmo tratamento de trilha imutável — mas
   a decisão de erasure especificamente para ESTA tabela (paciente pede
   exclusão de dados, o registro de risco deveria ser pseudonimizado como o
   audit_log, ou seguir a política de retenção geral de prontuário de
   `docs/legal/politica-retencao-dados.md`?) não foi tomada neste
   documento. Marcado como lacuna a resolver antes de qualquer
   implementação real — é exatamente o tipo de decisão de dado de menor/
   erasure que o `CLAUDE.md` do projeto marca como "confirmar com o Rômulo
   antes" (DDL que altera contrato de tabela com dado real), então nem
   deveria ser decidida por este documento de qualquer forma.

Nenhum destes 4 achados invalida a arquitetura proposta (fila dedicada,
severidade+certeza, SLA em 2 estágios, canal duplo síncrono) — são lacunas
de cobertura de infraestrutura/teste e um ponto de tensão de retenção ainda
sem solução fechada, seguindo o mesmo padrão de "aprovado com ressalvas" já
usado nos dois documentos de origem. **A ressalva mais importante continua
sendo a Seção 5:** nenhuma parte deste documento deveria virar código de
produção antes da validação profissional (CFP/jurídico) sobre duty to warn.

---

## 10. Decisões de hardening (tech lead)

Fecha os dois achados 9.1 e 9.4, que não podiam ficar como TBD numa fatia que
lida com dado de vida/segurança — mesmo padrão de rigor de
`.specs/features/fase6/spec.md` (nunca "avaliar depois" em fatia de
segurança/LGPD). Verificado no repo antes de decidir, não presumido:
`src/db/schema.ts` linha 235 já tem `clinic.politicaRetencaoMeses` (coluna
`integer`, nullable, já existe); `app_purgar_paciente` já existe
(`db/migrations/0045_expurgo_retencao.sql`, spec `A2`/`A3` de
`.specs/features/fase6/spec.md`) e já implementa pseudonimização de
`audit_log` no expurgo, não delete — esse é o precedente direto que H2 usa.

### H1 — Mecanismo de escalonamento de SLA em produção (Easypanel sem cron nativo)

**Decisão a travar:** job agendado, mesmo padrão já validado no projeto para
o outro caso de ausência de cron nativo — script do repo executado pelo
campo "Comando" de um serviço schedulable na Easypanel (precedente:
`[[easypanel-sem-cron-e-host-interno]]`, Easypanel v2.31 não tem agendador
nativo para app). O job varre
`alerta_risco_clinico WHERE status = 'aberto' AND prazo_reconhecimento < now()`
(o índice `idx_alerta_risco_sla` da Seção 7 já foi desenhado para essa
consulta) e dispara a transição de estágio (`aberto` → `escalado_estagio_1`;
`escalado_estagio_1` → `escalado_estagio_2` no dobro do prazo, Seção 4.2).

**Frequência do polling: a cada 1 minuto.** Justificativa do trade-off: o
SLA mais curto da tabela (Seção 4.1) é 15 minutos
(`ideacao_ativa_com_plano`/`tentativa_relatada` — exatamente o Caso ARC-2,
severidade máxima). Um polling de 5 minutos já introduziria até 1/3 de atraso
adicional sobre um SLA de 15 minutos no pior caso (alerta criado 1s depois de
um ciclo de polling) — inaceitável dado que a Seção 2 trata falso negativo
*operacional* (alerta não escalado a tempo) com a mesma gravidade que falso
negativo de detecção. 1 minuto limita o atraso máximo de escalonamento a
~7% do SLA mais curto, com custo de carga desprezível (uma query indexada
sobre uma tabela de volume baixo — alertas de risco não são um fluxo de alto
volume por natureza).

**Onde roda: serviço dedicado na Easypanel, não `setInterval` dentro do
processo Next.js.** Avaliados os dois:

- `setInterval` no processo Next.js — descartado. O processo Next.js em
  produção normalmente roda com múltiplas instâncias/replicas atrás do load
  balancer (mesmo em VPS único, o processo pode reiniciar em deploy, crash,
  ou health-check); um `setInterval` interno dispararia o job **uma vez por
  instância viva**, produzindo notificações de escalonamento duplicadas (ou,
  pior, nenhuma, se a única instância cair no minuto exato do vencimento e
  o restart demorar). Não há mecanismo de lock distribuído já existente no
  projeto para serializar isso, e criar um só para este job seria
  engenharia desproporcional ao problema.
- Serviço dedicado (script do repo, campo "Comando", mesmo padrão do
  precedente citado) — escolhido. Processo único, independente do ciclo de
  vida do Next.js, mesma infraestrutura operacional já em uso no projeto
  (não introduz uma tecnologia nova), e falha do job é observável
  isoladamente (log do serviço de escalonamento não se mistura com log da
  aplicação principal) — resolve também parte do achado 9.1 original
  ("precisa de monitoramento ativo do próprio job de escalonamento"): um
  serviço dedicado é o que torna esse monitoramento (health-check do
  serviço em si) possível sem instrumentar o processo web.

**Monitoramento do job (fecha o resíduo do achado 9.1):** o serviço de
escalonamento deve emitir um heartbeat/log a cada execução bem-sucedida;
ausência de heartbeat por N ciclos (ex.: 5 minutos sem execução) é ela
mesma uma condição de alerta operacional — "o alerta sobre o alerta" citado
no achado original. Mecanismo concreto de alerta operacional (e-mail ao
Rômulo, painel da Easypanel, etc.) fica como implementação, não decisão de
desenho.

**Pendente de confirmação do Rômulo antes de codar:** criação do serviço na
Easypanel é decisão de infraestrutura de via única (`CLAUDE.md` do
projeto — "provisionar serviço" entra na mesma categoria de confirmar
antes). O desenho acima (mecanismo, frequência, local de execução) é decisão
de tech lead fechada; a execução (criar o serviço, configurar o Comando) não.

### H2 — Retenção e expurgo LGPD de `alerta_risco_clinico`

**Decisão a travar: pseudonimizar no expurgo, nunca deletar — mesmo padrão
já implementado para `audit_log` em `app_purgar_paciente`
(`db/migrations/0045_expurgo_retencao.sql`, precedente `A3` de
`.specs/features/fase6/spec.md`).** Peso explícito do trade-off:

- **A favor de deletar:** minimiza superfície de dado sensível de saúde
  retido (Art. 5º, II, LGPD) — princípio de minimização.
- **A favor de pseudonimizar (decisão adotada):** um registro de risco
  clínico tem duas funções que sobrevivem ao pedido de erasure do paciente
  e que deletar destruiria: (1) **continuidade de cuidado** — se o paciente
  retorna à clínica (mesma ou outra, com transferência de prontuário) anos
  depois, o histórico de que um risco grave já foi identificado e como foi
  conduzido é informação clínica relevante para o próximo profissional, da
  mesma forma que um prontuário médico de emergência não é descartado
  porque o paciente pediu exclusão de dados de marketing; (2) **defesa
  profissional do terapeuta** — em caso de processo por omissão de conduta
  diante de risco relatado, o registro de que o alerta existiu, foi
  reconhecido dentro do SLA e teve conduta registrada (`condutaRegistrada`,
  Seção 7) é exatamente o tipo de prova que protege o profissional que agiu
  corretamente; deletar essa trilha no primeiro pedido de erasure do
  paciente removeria a única evidência de diligência do terapeuta. Este é o
  mesmo raciocínio que já fundamentou `audit_log` ser imutável e
  pseudonimizado em vez de deletado (`A3`, `.specs/features/fase6/spec.md`)
  — a trilha de um evento de segurança pesa mais que a minimização estrita
  quando as duas colidem, e o projeto já tomou essa decisão uma vez; H2
  apenas estende o mesmo princípio à tabela nova.

**O que pseudonimizar, especificamente:** ao expurgar o paciente (via
`app_purgar_paciente`, que já cascateia sobre `alerta_risco_clinico` por
causa da FK composta `alerta_risco_patient_fk` com `onDelete("cascade")`
definida na Seção 7 — **isso precisa mudar**, ver nota abaixo), as colunas
que identificam o sujeito e o conteúdo literal do relato
(`trechoFonte`, `detalhe`, `condutaRegistrada`, `motivoDescarte`) devem ser
substituídas por um marcador de expurgo (mesmo padrão de "hash + fato
purgado, remover PII" de `A3`), preservando `categoria`, `severidade`,
`certeza`, `status`, os timestamps de SLA/reconhecimento/escalonamento, e
`sessionId`/`clinicId` (sem PII direta do paciente) — o suficiente para
provar que o processo de resposta a risco funcionou, sem reter o conteúdo
sensível do relato em si.

**Consequência de desenho que este achado força a corrigir na Seção 7:** o
`onDelete("cascade")` de `alerta_risco_patient_fk` está incorreto à luz
desta decisão — cascade deleta a linha inteira, o oposto de pseudonimizar.
A FK deve ser ajustada (migração futura, não deste documento) para não
cascatear delete, e a pseudonimização de `alerta_risco_clinico` deve ser
adicionada como um passo explícito dentro de `app_purgar_paciente` (mesmo
lugar onde `audit_log` já é pseudonimizado), não deixada para o
comportamento default de FK.

**Prazo de retenção: ancorado em `clinic.politicaRetencaoMeses`.**
Verificado em `src/db/schema.ts` linha 235 — a coluna já existe
(`integer("politica_retencao_meses")`, nullable). `alerta_risco_clinico`
usa a mesma política de retenção geral de dado clínico da clínica, sem
prazo dedicado mais curto — um alerta de risco é parte do prontuário do
paciente, não um dado de categoria diferente que justificasse regra própria
de retenção. Quando a política de retenção geral expurga o paciente
(rotina de elegibilidade de expurgo já prevista em `A2(b)` de
`.specs/features/fase6/spec.md`), `alerta_risco_clinico` é pseudonimizado
junto, pelo mesmo mecanismo do erasure sob pedido — não há dois caminhos de
expurgo para esta tabela, só um.

**Pendente de confirmação do Rômulo antes de codar:** qualquer migração real
que altere `alerta_risco_patient_fk` (mudar `onDelete("cascade")`) ou que
estenda `app_purgar_paciente` com o passo de pseudonimização desta tabela —
ambas são DDL/alteração de contrato sobre dado que, uma vez em produção,
carrega dado real de saúde (`CLAUDE.md` do projeto: "qualquer DDL que altere
tabela que já tenha dado" entra na categoria de confirmar antes). O desenho
acima (pseudonimizar, o quê pseudonimizar, ancorar em
`politicaRetencaoMeses`) é decisão de tech lead fechada.
