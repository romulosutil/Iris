# Terapia Convencional — Modo do Agente Sem Protocolo

> Especificação do segundo nicho de atendimento do Iris: psicoterapia
> tradicional, sem instrumento formal e sem pontuação. Referência de origem:
> [issue #98](https://github.com/romulosutil/Iris/issues/98). Este documento
> segue o mesmo formato de `docs/agente/protocolos-e-agente.md` (catálogo →
> contrato → regras → schema → validação), mas descreve um **modo diferente**
> do agente, não um protocolo a mais no array `protocolos_ativos`.

**Aviso central, para não repetir o erro que a issue já preveniu:** este NÃO é
"protocolo vazio com as mesmas regras R1-R19". Terapia Convencional não tem
`dominio_id`, não tem `sinais_no_texto`, não tem meta pontuável, não tem
`taxonomia_ajuda`. R1-R19 (Parte 3 de `protocolos-e-agente.md`) foram
desenhadas para evidência-por-domínio de instrumentos formais — pressupõem
que existe um domínio contra o qual classificar cada evento. Terapia
Convencional não tem domínio: o "dado" é a sessão inteira, e o agente atua
como leitor que resume e sugere direção, nunca como extrator de evidência
estruturada por eixo clínico. Por isso este documento define um conjunto de
regras próprio (seção 2), não uma reinterpretação das R1-R19.

---

## 1. O que é o nicho

Terapia Convencional é o atendimento psicoterapêutico tradicional — escuta,
elaboração de história de vida, "aprender a viver melhor" — sem instrumento
de avaliação formal e sem escala de pontuação. Deliberadamente **não
prescreve uma escola** (psicodinâmica, humanista, cognitivo-comportamental
sem protocolo estruturado, integrativa, sistêmica etc.): o produto atende
qualquer abordagem em que o profissional não tenha (ou não use) uma escala
formal de acompanhamento — é "atendimento genérico convencional", não um
modelo teórico específico.

Diferenças estruturais em relação ao nicho TEA/neurodesenvolvimento infantil
já coberto pelo Iris:

- **Público majoritariamente adulto**, autoconsentindo — diferente do nicho
  TEA, hoje quase inteiramente infantil com consentimento de responsável.
- **Sem meta individualizada pontuável** (PEI) e sem protocolo de referência.
  O princípio inegociável 4 do README ("a meta individualizada é a unidade
  central; o protocolo é a régua") não se aplica aqui — não há régua.
- **Sem grade de evidências por domínio.** Não existe "10 domínios do
  ESDM" ou "170 marcos do VB-MAPP" para mapear frases do diário. O relato de
  sessão é processado como um todo, não frase a frase contra uma lista de
  sinais.
- **Cadência de acompanhamento diferente.** Não há ciclo de reavaliação de
  8-12 semanas contra marcos; o "progresso" em terapia convencional é
  trajetória narrativa ao longo de muitas sessões, mais parecido com "notas
  de evolução" de prontuário tradicional do que com grade de escore.

### Compatibilidade com os 8 princípios inegociáveis (README.md)

Revisão item a item, conforme pedido na issue:

1. **Texto livre como fonte da verdade** — sustenta o modo, sem alteração:
   aqui o texto é ainda mais central, já que não há domínio estruturado para
   "descarregar" a interpretação.
2. **Governança em 3 camadas (IA→terapeuta→coordenador)** — mantida; a
   diferença é que a Camada 3 aqui não reclassifica "X→Y" de domínio (não
   existe domínio), reclassifica presença/ausência de alerta e adequação do
   resumo/direção sugerida (ver seção 5).
3. **Evidência ≠ pontuação formal** — sustenta o modo sem alteração; aqui
   levado ao extremo, porque não há pontuação de NENHUM tipo, nem
   "candidatos a avaliação".
4. **Meta individualizada é a unidade central; protocolo é a régua** — **não
   se aplica**. Não há régua. Este é o único dos 8 princípios que não
   generaliza diretamente; ver seção 2 para o que substitui a "unidade
   central" neste modo (tema recorrente + direção sugerida, não meta
   pontuável).
5. **Protocolo é dado, não código** — sustenta o modo: o motivo de este
   documento existir é justamente que "ausência de protocolo" também precisa
   ser um dado explícito (`modo: "terapia_convencional"`), não uma lacuna
   silenciosa tratada como bug.
6. **Linha do tempo reconstruível** — sustenta, com adaptação: aqui a
   "evolução/estagnação/regressão" não é sobre nível de ajuda num domínio, é
   sobre recorrência de tema/direção ao longo de sessões (ex.: "mesmo tema
   de conflito familiar apareceu nas últimas 6 sessões sem mudança de
   direção sugerida" é o análogo de estagnação).
7. **Grafo M:N com vigência** — sustenta sem alteração; é modelo
   organizacional, agnóstico de nicho clínico.
8. **LGPD para dados de menores** — sustenta como piso, mas Terapia
   Convencional atende majoritariamente adultos autoconsentindo — ver seção
   5 para a lacuna concreta e a proposta de correção.

Achado preliminar da issue (nenhum princípio pressupõe "sempre há protocolo
com pontuação") está **confirmado**: 6 dos 8 sustentam sem qualquer ajuste,
1 (o 8º) precisa de extensão documentada (não substituição), e apenas 1 (o
4º) genuinamente não se aplica — o que é esperado, já que ele descreve o
mecanismo central do nicho TEA, não uma regra do produto como um todo.

---

## 2. O que muda no contrato do agente — um MODO novo, não um protocolo vazio

### 2.1 Por que não é "protocolo vazio com R1-R19"

R1-R19 pressupõem, em algum grau, um domínio contra o qual mapear a evidência
(`dominio_id`, `alvos`, `eixo_protocolo`), uma taxonomia de ajuda
(`taxonomia_ajuda`, R5), uma função classificável pelo antecedente (R4) e uma
saída em `extracoes[]` no formato de `output-schema.json`. Nenhum desses
conceitos tem correspondente natural em terapia convencional:

- Não há "domínio" — o que existe é **tema** (ex.: relação com a mãe,
  ansiedade no trabalho, luto), mas tema não é uma lista fechada como os
  domínios de um protocolo; é aberto, emergente, e não deve virar um enum
  fixo do produto (isso reintroduziria pontuação disfarçada de taxonomia).
- Não há "nível de ajuda" nem "resultado" (acerto/erro) — psicoterapia não
  opera em tentativas discretas com critério de acerto.
- Não há "evidência positiva/negativa" no sentido de R6 — "o paciente chorou
  ao falar do pai" não é um dado que aponta a favor ou contra um marco.
- A regra mais transferível é o espírito de **R3 (evidência, nunca
  pontuação)**, mas até ela precisa de reformulação: aqui a linha não é
  "não pontuar o protocolo", é "não diagnosticar" — um risco categoricamente
  diferente (ver seção 4).

Conclusão: usar `protocolos_ativos: []` (array vazio, já suportado
estruturalmente — ver `ativarProtocolo` em
`src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo-logic.ts`, uma ação
opcional e separada do cadastro básico) é necessário mas não suficiente. O
agente também precisa saber que está operando em outro MODO — caso contrário
ele tentaria, sem domínios para mapear, inventar categorias ad hoc (viola o
espírito de R19/agnosticismo invertido: "nenhuma regra depende de protocolo
específico" não pode virar "o agente inventa protocolo quando não há um").

### 2.2 Sinalização do modo no contrato

Proposta de extensão ao formato canônico (Parte 2 de `protocolos-e-agente.md`):
um campo `modo` no nível raiz do contexto, paralelo a `protocolos_ativos`:

```json
{
  "paciente": {
    "id": "pt_789",
    "idade_meses": null,
    "resumo_repertorio": "Adulto, 34 anos, em acompanhamento há 8 sessões. Tema recorrente: luto do pai (falecido há 6 meses) e dificuldade de retomar rotina de trabalho."
  },
  "modo": "terapia_convencional",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "luto do pai",
      "resumo": "presente nas últimas 5 sessões; direção sugerida em 3 delas foi 'explorar culpa não resolvida'."
    }
  ]
}
```

Quando `modo: "terapia_convencional"`, o backend NUNCA envia
`protocolos_ativos` não-vazio (mistura de modos não é suportada nesta
versão — ver Achados da autovalidação, item sobre comorbidade/paciente misto)
e o agente usa o system prompt da seção 2.4 em vez das system instructions da
Parte 3 de `protocolos-e-agente.md`.

### 2.3 R1-TC a R9-TC — regras do modo Terapia Convencional

Numeração própria (`-TC`) para não colidir com R1-R19 nem sugerir que é a
mesma escala de regra. Reaproveita o espírito de 4 regras existentes
(marcadas abaixo) e cria 5 novas específicas do risco deste modo.

**R1-TC — FIDELIDADE AO TEXTO (reaproveita o espírito de R1).** Resuma
apenas o que foi relatado. Proibido inferir conteúdo psíquico, motivação
inconsciente ou history não descrita. Uma sessão pobremente registrada gera
um resumo pobre — nunca "completar" a lacuna com interpretação clínica que
o texto não sustenta.

**R2-TC — NUNCA DIAGNOSTICAR (nova, é a regra mais importante deste modo).**
O agente nunca atribui, sugere ou nomeia quadro nosológico, transtorno,
CID ou traço de personalidade — mesmo que o texto do terapeuta contenha
linguagem que soe diagnóstica ("parece ter traços de X"). Diagnóstico é ato
privativo do psicólogo/psiquiatra (Resolução CFP nº 6/2019 e correlatas);
o agente que sugerisse um violaria prática profissional regulada, não
apenas um princípio de produto. Isto é o análogo, para este modo, de R3
("evidência, nunca pontuação") — mas com risco regulatório mais direto do
que "pontuar errado um protocolo": aqui o risco é exercício não autorizado
de diagnóstico por sistema de IA.

**R3-TC — SEM META, SEM PROGNÓSTICO, SEM CONDUTA PRESCRITA (nova).** O
agente não prescreve técnica, não recomenda "o que fazer na próxima
sessão" como instrução, e não estima duração de tratamento. Ele pode
apontar um TEMA a explorar ("pode valer explorar a relação com a demissão
antes de avançar para o tema do casamento") — sempre como sugestão hedged ao
terapeuta, nunca como prescrição de conduta. A diferença entre "sugerir
direção" e "prescrever conduta" é o teste central deste modo: sugerir
direção descreve ONDE olhar; prescrever conduta descreve O QUE FAZER
tecnicamente (ex.: "aplique reestruturação cognitiva sobre essa crença") —
o segundo é ato técnico do profissional, nunca do agente.

**R4-TC — LINGUAGEM SEMPRE HEDGED (nova, mecanismo de enforcement de R2-TC
e R3-TC).** Toda sugestão de tema/direção usa formulação hedged
obrigatória: "pode valer explorar", "chama atenção que", "vale observar se
recorre", "é possível que mereça atenção". PROIBIDO: "o paciente tem",
"o paciente sofre de", "isso indica [quadro clínico]", "recomenda-se
[técnica]". Esta regra é mecânica (padrão de linguagem verificável), não
apenas de intenção — dá ao coordenador/QA um critério objetivo de auditoria
de saída do agente (ver seção 6, Achados da autovalidação, sobre
enforcement automatizado desta regra).

**R5-TC — ALERTA DE RISCO OBRIGATÓRIO (nova, a mais crítica operacionalmente;
desenho operacional completo — canal, SLA, escalonamento, schema, copy — em
`docs/agente/regra-alerta-risco.md`, issue #101; regra compartilhada com TCC,
não reescrita duas vezes).**
Qualquer menção, direta ou indireta, a ideação suicida, autolesão, violência
(sofrida ou praticada, contra si ou terceiros — incluindo violência
doméstica, abuso infantil relatado por terceiros, risco a menores no
entorno do paciente) dispara `alerta_risco: true` com categoria e trecho
citado, SEMPRE, independentemente de o terapeuta já ter mencionado que
"está sob controle" ou "paciente já em acompanhamento psiquiátrico". Falso
positivo é aceitável; falso negativo não (mesma lógica de R18 do modo TEA,
aqui com risco mais grave — é dado de vida, não de barreira comportamental).
O alerta NUNCA é engolido por outra regra (mesmo em sessão de encerramento
de ciclo, mesmo em sessão de silêncio) e nunca vem acompanhado de sugestão
de conduta clínica (isso seria R3-TC) — só do fato relatado, com o alerta.

**R6-TC — SILÊNCIO E AUSÊNCIA DE FALA SÃO DADO, NÃO LACUNA (nova, equivalente
parcial a R6 de evidência negativa).** Uma sessão em que o paciente falou
pouco, ficou em silêncio, ou resistiu à abordagem de um tema NÃO é uma
sessão "sem conteúdo a resumir" — o padrão de resistência/silêncio em si é
o dado clínico relevante (ex.: "terceira sessão consecutiva evitando o
tema do divórcio ao ser trazido"). Distinto de R1-TC: aqui o texto pode ser
escasso em conteúdo verbal do paciente mas ainda assim rico em observação
do terapeuta sobre o padrão — o agente resume o padrão de silêncio, nunca
inventa conteúdo que o silêncio não revelou.

**R7-TC — TEMA COMO UNIDADE DE CONTINUIDADE (nova, é o análogo de
`dominio_id`, mas texto livre em vez de enum fechado).** Quando o texto
permitir, identifique o(s) tema(s) centrais da sessão como texto livre curto
(não enum — ver seção 3), para permitir que `historico_relevante` rastreie
recorrência entre sessões (linha do tempo do princípio 6 do README,
adaptada). Nunca force um tema quando o relato não sustentar um claramente.

**R8-TC — PRODUÇÃO DE ENCERRAMENTO DE CICLO É REVISÃO, NÃO AVALIAÇÃO (nova).**
Em sessões de encerramento/revisão de jornada terapêutica, o agente pode
resumir a trajetória de temas ao longo do histórico (ex.: "o tema de luto,
presente nas primeiras 8 sessões, deu lugar a temas de retomada de rotina
nas últimas 4"), mas isso é síntese narrativa de trajetória, nunca um
"escore de melhora" ou "alta clínica sugerida pelo agente" — decisão de alta
é sempre do terapeuta.

**R9-TC — AGNOSTICISMO DE ESCOLA (reaproveita o espírito de R19).** O agente
não pressupõe arcabouço teórico específico (psicanálise, TCC, humanista
etc.) nem usa vocabulário técnico de uma escola em particular a menos que o
próprio terapeuta o tenha usado no diário. Se o terapeuta escreveu em
linguagem psicodinâmica, o resumo pode espelhar esse vocabulário
descritivamente (nunca interpretativamente além do texto); se o terapeuta
não usa jargão de escola nenhuma, o agente também não usa.

### 2.4 System instructions do modo (rascunho)

```
# AGENTE DE RESUMO DE SESSÃO — TERAPIA CONVENCIONAL (MODO SEM PROTOCOLO)

## Papel
Você converte o relato de sessão de um psicoterapeuta (texto livre, pt-BR) em um
RESUMO estruturado com possíveis temas e alertas. Você NÃO diagnostica, NÃO
pontua, NÃO prescreve conduta técnica. Você é um assistente de organização de
registro clínico — o terapeuta é o único responsável pela leitura clínica.

## Entradas
1. O texto do relato da sessão.
2. Contexto do paciente: idade (se relevante), resumo textual livre (nunca
   estruturado por domínio), histórico de temas de sessões anteriores.
   NUNCA há protocolos_ativos populado neste modo.

## Saída
Exclusivamente o JSON do schema de saída do modo Terapia Convencional. Nada
fora do JSON.

## Regras invioláveis
R1-TC. Fidelidade ao texto — resuma só o relatado, nunca infira conteúdo psíquico
       não descrito.
R2-TC. Nunca diagnostique — proibido nomear transtorno, CID, traço, quadro.
R3-TC. Sem meta, sem prognóstico, sem conduta prescrita — só direção/tema a
       explorar, nunca técnica a aplicar.
R4-TC. Linguagem sempre hedged em qualquer sugestão de direção/tema
       ("pode valer explorar", nunca "o paciente tem").
R5-TC. Alerta de risco obrigatório para qualquer menção a ideação suicida,
       autolesão ou violência (sofrida ou praticada) — sempre, sem exceção,
       falso positivo aceitável, falso negativo não.
R6-TC. Silêncio/resistência é dado clínico, não lacuna — resuma o padrão.
R7-TC. Tema como texto livre curto, nunca enum fechado; só quando o relato
       sustentar um tema claro.
R8-TC. Encerramento de ciclo é síntese narrativa de trajetória de temas, nunca
       escore de melhora nem sugestão de alta.
R9-TC. Agnosticismo de escola — não pressuponha nem imponha vocabulário
       teórico que o terapeuta não usou.

## Processo
1. Leia o relato inteiro antes de resumir.
2. Verifique PRIMEIRO por qualquer sinal de risco (R5-TC) — isso precede
   qualquer outra análise.
3. Identifique tema(s) só se o texto sustentar claramente (R7-TC).
4. Redija o resumo da sessão em linguagem descritiva, sem diagnóstico.
5. Se aplicável, redija sugestão de direção em linguagem hedged (R4-TC).
6. Monte o JSON.
```

---

## 3. Estrutura de dado da sessão

Sem grade/escala, o que fica registrado por sessão de Terapia Convencional:

```json
{
  "resumo_sessao": "string — narrativa descritiva do que foi trabalhado, sem diagnóstico",
  "temas": [
    {
      "tema": "string livre curto, ex.: 'luto do pai'",
      "trecho_fonte": "string — trecho literal que sustenta o tema"
    }
  ],
  "direcao_sugerida": {
    "texto": "string, sempre em linguagem hedged, ou null se o relato não sustentar sugestão",
    "trecho_fonte": "string ou null"
  },
  "padrao_silencio_resistencia": {
    "presente": "boolean",
    "descricao": "string ou null — ex.: 'terceira sessão evitando o tema X'"
  },
  "alerta_risco": {
    "presente": "boolean",
    "categoria": "ideacao_suicida | autolesao | violencia_sofrida | violencia_praticada | risco_a_terceiro | null",
    "trecho_fonte": "string ou null",
    "detalhe": "string ou null — descrição literal, nunca interpretação de gravidade além do relatado"
  },
  "sinalizacoes": [
    { "tipo": "texto_ambiguo | possivel_erro_transcricao", "detalhe": "string" }
  ]
}
```

Notas de modelagem:

- Não há campo equivalente a `confianca` por extração individual (não há
  "extrações" no plural — é um resumo único da sessão), mas `alerta_risco`
  deveria, na implementação real, ter sua própria auditoria de confiança
  (ver Achados da autovalidação).
- `temas[]` é um array porque uma sessão pode tocar mais de um tema, mas cada
  item é texto livre — nunca um enum fixo de "temas possíveis" (isso
  recriaria uma taxonomia disfarçada, indo contra a proposta do nicho).
- `alerta_risco` é estruturalmente separado de `direcao_sugerida` de
  propósito: risco nunca deve competir por atenção com sugestão de tema — a
  UI deve poder renderizar o alerta com prioridade visual absoluta,
  independentemente do resto do resumo.

---

## 4. Riscos clínicos e de produto

**Risco 1 — Diagnóstico não intencional.** Mesmo com R2-TC/R4-TC explícitas,
um LLM pode "vazar" linguagem diagnóstica por generalização estatística
(ex.: um relato descrevendo tristeza persistente + perda de interesse +
alteração de sono é, estruturalmente, muito próximo do texto de treino
associado a "depressão" — o modelo pode gerar "sintomas compatíveis com
quadro depressivo" mesmo com a regra proibindo). Mitigação: R4-TC como
regra de FORMATO verificável (lista de frases proibidas), permitindo
validação automatizada de saída antes de chegar ao terapeuta — não basta
confiar na instrução do prompt. Isso é diferente do risco equivalente no
modo TEA (lá o risco é "pontuar sem querer"; aqui é "diagnosticar sem
querer" — violação de prática de psicologia regulada, não só erro de
produto).

**Risco 2 — Sugestão de direção lida como prescrição.** Um terapeuta
sob pressão de tempo pode aceitar "pode valer explorar X" e tratá-lo como
"a IA disse para eu fazer X" — erodindo a fronteira entre sugestão de tema
(o que é aceitável) e prescrição de conduta técnica (o que não é). Mitigação
de produto (não deste documento, mas a registrar como requisito de UX):
toda `direcao_sugerida` deveria ser visualmente marcada na UI como "sugestão
a avaliar", nunca como "recomendação" — e nunca aprovável com 1 clique sem
que o terapeuta veja o trecho-fonte ao lado.

**Risco 3 — Alerta de risco engolido por resumo tranquilizador.** Se o
terapeuta escreve "ela mencionou já ter pensado em desistir de tudo, mas
disse que já passou" no meio de um relato geral positivo, o resumo agregado
pode minimizar o trecho de risco. Mitigação: R5-TC é processada ANTES e
SEPARADAMENTE do resumo geral (ver Processo, passo 2) — nunca como uma
frase dentro do `resumo_sessao`.

**Risco 4 — Ausência de instrumento formal reduz a base de auditoria.**
No modo TEA, `historico_relevante` permite checar inconsistência (R14) contra
dado estruturado. Aqui, sem domínio/escala, a auditoria de qualidade do
coordenador (V1-V5 de `validacao-coordenador.md`) perde o principal gatilho
automatizado ("confiança baixa" e "inconsistente_com_historico" hoje vêm de
comparação estruturada). Ver seção 6 para o achado de que a amostragem por
`alerta_risco` precisa suprir esse gap.

---

## 5. Consentimento — lacuna confirmada e proposta pendente

**Lacuna confirmada, lendo o código:** `criarPacienteEConsent`
(`src/app/(app)/pacientes/novo/logic.ts`, linhas 34-41 e 66-71) exige
`responsavelSignatario` como campo obrigatório e grava sempre
`consent.tipo = "tratamento_dados_menor"` — hardcoded, sem branch condicional
por idade ou tipo de paciente. O enum `consentTipo`
(`src/db/schema.ts`, linhas 37-41) já tem 3 valores (`tratamento_dados_menor`,
`uso_ia_processamento`, `exportacao_relatorios`), mas nenhum deles cobre
autoconsentimento de titular adulto — os 3 pressupõem consentimento por
responsável ou consentimento acessório (uso de IA, exportação), não o ato
primário de admissão de um paciente adulto que consente por si mesmo.

Terapia Convencional atende majoritariamente adultos. Forçar
`responsavelSignatario` para um paciente adulto autoconsentindo é
semanticamente errado (não existe "responsável" numa relação terapêutica com
adulto capaz) e juridicamente arriscado (documenta uma relação de
responsável-por-menor que não existe).

> **PROPOSTA PENDENTE DE CONFIRMAÇÃO COM O RÔMULO — não decidida, não
> implementada.** Adicionar um 4º valor ao enum `consentTipo`:
> `tratamento_dados_titular_adulto` (nome sujeito a revisão), com semântica:
> o próprio paciente assina, `responsavelSignatario` não se aplica (o nome
> do titular já está em `patient.nome`) e o formulário de cadastro precisa de
> um branch condicional — provavelmente por um campo explícito
> "cadastro para adulto autoconsentindo" ou pela ausência de flag de menor —
> em vez de inferir a partir de `nascimento` (idade sozinha não deveria
> decidir tipo de consentimento sem confirmação explícita no formulário,
> para não silenciosamente classificar errado um adulto sem data de
> nascimento preenchida, ou um adolescente emancipado). Isso é mudança de
> schema/migração e de `criarPacienteEConsent` — cai na categoria "confirmar
> com o Rômulo antes" do CLAUDE.md (DDL que altera contrato de tabela com
> dado real), não algo a implementar a partir deste documento.

Enquanto a proposta não for confirmada, a UI de cadastro para Terapia
Convencional NÃO deveria reutilizar `criarPacienteEConsent` sem ajuste — cadastrar
um adulto autoconsentindo hoje, sem o novo tipo, produziria um registro de
consentimento tecnicamente incorreto (LGPD tratado como se fosse dado de
menor). Este é um bloqueador de implementação, não de documentação — mas
precisa estar registrado aqui porque a issue #98 pede essa decisão explícita
como item de escopo.

---

## 6. Personas de teste

Casos completos, no formato exato de `docs/agente/casos-de-teste.md`, ficam em
`docs/agente/casos-de-teste-terapia-convencional.md` (arquivo separado para não
misturar com o eval set do modo TEA, que usa um schema de saída diferente).
Resumo dos 4 casos ali cobertos:

1. **Caso TC-1 — Escuta simples, sem crise.** Sessão de retomada de rotina
   pós-luto, tema claro, direção sugerida hedged, sem alerta.
2. **Caso TC-2 — Relato de risco (violência doméstica).** Testa R5-TC —
   alerta obrigatório mesmo com o terapeuta relativizando ("ela disse que
   já é assim há anos, não é nada novo").
3. **Caso TC-3 — Silêncio e resistência.** Testa R6-TC — sessão com pouca
   fala do paciente, terapeuta registra pouco, mas o PADRÃO de silêncio é o
   dado.
4. **Caso TC-4 — Encerramento de ciclo.** Testa R8-TC — revisão de jornada
   sem meta formal, síntese narrativa de trajetória de temas.

---

## 7. Achados da autovalidação

Revisão crítica deste documento, no mesmo padrão de rigor aplicado aos 10
protocolos de `protocolos-e-agente.md` (nenhum "aprovado sem ressalva"):

1. **`alerta_risco` não tem campo de confiança/ambiguidade — lacuna real.**
   O schema da seção 3 trata `alerta_risco.presente` como binário, mas um
   relato pode ser ambíguo sobre risco (ex.: "ela brincou que ia sumir do
   mapa" — pode ser expressão coloquial ou ideação genuína). R5-TC hoje
   resolve isso mandando SEMPRE marcar risco na dúvida (falso positivo
   aceitável), o que é a decisão certa para não perder um caso grave — mas
   o schema deveria ter um campo `certeza: "explicito" | "ambiguo_citado"`
   para o coordenador priorizar a fila de revisão sem perder nenhum alerta.
   Esta é uma lacuna concreta do desenho de dado, não só uma nota — deveria
   ser corrigida antes de qualquer implementação.

2. **Paciente com atendimento misto (TEA + terapia convencional simultânea)
   não está coberto.** O documento assume `modo` como propriedade exclusiva
   do contexto (ou é TEA com protocolo, ou é Terapia Convencional, nunca os
   dois). Mas é plausível uma clínica atender adolescente com TEA em terapia
   ABA E em psicoterapia convencional concomitante (com profissionais
   diferentes) — análogo ao Caso 9 de `casos-de-teste.md` (multiprotocolo
   VB-MAPP+PEDI via `SessionProtocolScope`). Se isso acontecer, qual `modo`
   o `SessionProtocolScope` escolhe para aquela sessão específica? A resposta
   mais provável (escopar por profissional/disciplina, como já faz o Caso 9)
   não está documentada aqui e deveria ser, antes de tratar este modo como
   mutuamente exclusivo por padrão. Registrado como lacuna, não resolvido.

3. **R7-TC (tema como texto livre) cria risco de fragmentação sem
   nenhum controle de qualidade.** Ao evitar deliberadamente um enum fechado
   de temas (para não recriar taxonomia disfarçada), o produto perde a
   capacidade de agregar "quantas sessões trataram de luto" de forma
   confiável — "luto do pai", "luto paterno" e "morte do pai" seriam 3
   strings distintas para o mesmo tema real, quebrando a continuidade que
   R7-TC e `historico_relevante` pretendem sustentar. Não há solução óbvia
   que não reintroduza o problema que se quer evitar (um enum aberto tende a
   virar taxonomia de fato); ao menos vale registrar como tensão não
   resolvida — possível mitigação futura (não decidida): normalização por
   similaridade textual no backend, sem expor um enum ao agente.

4. **Achado menor — `direcao_sugerida` como campo único (não array)
   pode ser insuficiente.** Diferente de `temas[]` (array), o schema da
   seção 3 modela só uma direção sugerida por sessão. Uma sessão pode
   plausivelmente sustentar mais de uma direção plausível (ex.: "vale
   explorar tanto a raiva não processada quanto o padrão de evitação de
   conflito") — o desenho atual forçaria escolher uma ou concatenar em
   texto livre dentro do campo único, perdendo a rastreabilidade por
   trecho-fonte que as outras estruturas do produto mantêm. Corrigir para
   array segue o mesmo padrão já usado em `temas[]` — mudança pequena, mas
   não implementada aqui (documentação, não código).

Nenhum destes 4 achados invalida a arquitetura proposta (modo separado,
R1-TC a R9-TC, alerta de risco como cidadão de primeira classe); são lacunas
de cobertura e um ponto de tensão de design ainda sem solução fechada — o
mesmo padrão de "aprovado com ressalvas" já usado para os 10 protocolos TEA.

---

## 8. Achados de validação (consultório + manuais + entrevistas simuladas)

Segunda rodada de validação deste documento, complementar à autovalidação da
seção 7, confrontando R1-TC a R9-TC contra convenções reais de registro
clínico (prontuário psicológico, sigilo profissional) e simulando entrevista
com duas personas céticas — terapeuta e coordenador de clínica —, no mesmo
espírito da rodada de validação por agente-especialista clínico aplicada aos
10 protocolos TEA (`protocolos-e-agente.md`, ~linha 689).

**Nota de rigor sobre fontes:** onde uma resolução do CFP é citada por
número e eu não tenho certeza absoluta do número exato, está marcado
explicitamente "(verificar número exato)" — nenhum número foi inventado.
Onde não identifiquei uma resolução específica correspondente a uma
convenção de prática, isso está dito explicitamente em vez de forçar uma
citação.

### 8.1 Confronto regra-a-regra com convenções reais de registro clínico

| Regra | Convenção real | Avaliação |
| --- | --- | --- |
| **R1-TC** (fidelidade ao texto) | Resolução CFP nº 001/2009 (Manual de Elaboração de Documentos Psicológicos): documentos devem descrever fatos observados de forma objetiva, evitando juízo de valor não fundamentado. | Alinhado, sem divergência. |
| **R2-TC** (nunca diagnosticar) | Diagnóstico como ato privativo do psicólogo/psiquiatra; Código de Ética Profissional do Psicólogo (Resolução CFP nº 010/2005 — **verificar número exato**) reserva a leitura clínica ao profissional. O próprio documento já cita "Resolução CFP nº 6/2019 e correlatas" na seção 2.3 — **há risco de inconsistência entre os números de resolução citados em pontos diferentes do próprio ecossistema de documentação do Iris; recomendo ao Rômulo unificar/confirmar qual resolução é a referência correta antes de usar qualquer uma delas em copy voltada ao usuário final** (terapeuta, coordenador ou parecer jurídico). | Alinhado no mérito; divergência apenas na precisão da citação, não na regra em si. |
| **R3-TC** (sem conduta prescrita) | Não corresponde a uma norma formal específica — nenhuma resolução do CFP regula "o que uma ferramenta de apoio pode sugerir". É decisão de produto ancorada no princípio geral de que técnica clínica é ato do profissional. | Sem divergência; sem norma específica a citar (não fabricado). |
| **R4-TC** (linguagem hedged) | Idem R3-TC — mitigação de produto, não exigência normativa. | Sem divergência; registrar que a regra não tem autoridade normativa própria, só de produto. |
| **R5-TC** (alerta de risco obrigatório) | Sigilo profissional (Código de Ética Profissional do Psicólogo — **verificar número exato**) tem exceção reconhecida para risco de vida a si ou a terceiros. Essa exceção é o que torna legítima a própria existência do alerta de risco — sem ela, o alerta poderia ser lido como o produto violando sigilo por padrão. | **Gap: o documento nunca cita essa base normativa explicitamente** (nem na seção 2.3, nem na seção 4) — ver achado AV-3. |
| **R6-TC** (silêncio é dado) | Convenção de prática clínica amplamente ensinada em formação (registrar recusas/resistência do paciente, não só fala verbalizada) — não localizei uma resolução CFP específica que normatize isso; não fabricado. | Alinhado como prática, sem base normativa própria a citar. |
| **R7-TC** (tema como texto livre) | Prontuários humanos sofrem do mesmo problema de inconsistência terminológica entre sessões quando o profissional não usa vocabulário padronizado — o achado 3 da seção 7 (fragmentação de tema) **não é exclusivo do agente**, é um problema já presente na prática humana. Isso reduz, mas não elimina, a severidade do achado 3 original. | Tensão de design já registrada; contexto adicional, não gap novo. |
| **R8-TC** (encerramento como síntese) | Alinhado com a prática de nota/relatório de encerramento em prontuário, tipicamente narrativa. | Alinhado. |
| **R9-TC** (agnosticismo de escola) | Em tensão com o próprio schema da seção 3 — ver achado AV-1. | **Gap encontrado na modelagem de dado, não no texto gerado.** |

### 8.2 Entrevista simulada — persona "terapeuta clínico experiente, cético quanto a IA em terapia convencional"

**P1. IA vai ler minhas anotações e ficar sugerindo "explorar isso, explorar
aquilo" — isso não é dizer o que eu devo fazer na sessão?**
R: Não deveria — R3-TC/R4-TC limitam a IA a apontar TEMA, nunca técnica, e a
formulação é sempre hedged. Mas a regra vive no texto gerado; nada garante
que a UI de fato distinga visualmente "sugestão a avaliar" de "recomendação"
(a seção 4, Risco 2, já registra isso como requisito de UX "a registrar",
não como requisito confirmado).

**P2. E se o resumo generalizar e soar como diagnóstico sem eu perceber,
porque eu confio e nem releio linha por linha?**
R: Risco 1 da seção 4 já reconhece esse cenário e propõe "validação
automatizada de saída antes de chegar ao terapeuta" — mas hoje isso está
descrito como mitigação possível, não como gate obrigatório de bloqueio de
entrega. A entrevista expõe que, na prática, o terapeuta não vai reler
linha a linha — então esse gate precisa ser tratado como bloqueante de
lançamento, não nice-to-have.

**P3. Meu prontuário segue o que o CFP exige (documentos psicológicos,
Resolução CFP nº 001/2009) — como sei que o resumo da IA não vira meu
registro oficial sem eu poder editar antes?**
R: O princípio de governança em 3 camadas (seção 1, item 2) sustenta em
tese que a Camada 2 (terapeuta) sempre revisa antes de qualquer coisa virar
registro — mas este documento específico nunca declara, para o modo Terapia
Convencional, que a saída da IA é sempre rascunho editável até aprovação
explícita do terapeuta. Pela Resolução CFP nº 001/2009, a responsabilidade
pelo conteúdo do documento psicológico é sempre de quem o assina — um texto
gerado por IA que vira prontuário sem edição/aprovação explícita é risco de
responsabilidade profissional do terapeuta, não só do produto.

**P4. Silêncio na sessão — a IA vai ficar chamando isso de "resistência", um
termo carregado de teoria psicanalítica que eu nem uso (sou humanista)?**
R: Achado real e novo: o campo do schema (seção 3) já se chama
`padrao_silencio_resistencia` — "resistência" é vocabulário de escola
(psicanalítica) embutido no CONTRATO DE DADO, não só na saída textual. Isso
contradiz o espírito de R9-TC mesmo que o TEXTO gerado permaneça agnóstico,
porque o nome do campo em si já pressupõe leitura teórica.

**P5. Se eu seguir uma sugestão da IA e der errado, quem responde?**
R: R3-TC já limita a IA a sugestão de tema, nunca conduta — o que reduz o
risco de responsabilização, mas o documento não formaliza um disclaimer
explícito de que a responsabilidade profissional pela conduta clínica é
sempre integralmente do terapeuta, independentemente de ter seguido ou não
a sugestão. Hoje isso fica implícito, não declarado.

**P6. Meus registros de terapia convencional entram na mesma auditoria do
coordenador que ele usa pra TEA? Meus pacientes adultos não são crianças
com TEA — o coordenador não devia ter acesso irrestrito a "traição
conjugal" só por ser coordenador.**
R: Pergunta legítima sem resposta neste documento — ver AV-6 (achado que se
confirma e aprofunda na entrevista da persona coordenador, seção 8.3).

**P7. E o direito do meu paciente de ver o que ficou registrado sobre ele?**
R: Fora do escopo deste documento (é feature genérica de acesso a dado
pessoal do produto, não específica deste nicho) — registrado como lembrete
de verificação cruzada, não bloqueante aqui (ver AV-9).

### 8.3 Entrevista simulada — persona "coordenador de clínica, preocupado com supervisão e responsabilidade civil"

**P1. Se a IA gerar um alerta de risco falso-negativo e o terapeuta não
perceber, quem responde perante o CFP ou a Justiça — a clínica, o
terapeuta, o Iris?**
R: R5-TC mitiga falso-negativo (viés para falso-positivo), e o Risco 3 da
seção 4 já cobre o cenário de alerta "engolido" por resumo tranquilizador —
mas nenhum dos dois é, tecnicamente, um disclaimer de responsabilidade. O
documento não declara explicitamente que `alerta_risco` é ferramenta de
apoio e não substitui o julgamento clínico do profissional licenciado.

**P2. Como eu superviso qualidade sem violar sigilo dos meus pacientes
adultos? No TEA eu tenho evidência estruturada por domínio pra auditar;
aqui é texto livre de sessão de adulto — divórcio, trauma, infidelidade,
muito mais sensível.**
R: Achado novo além do já registrado (achado 4 da seção 7, sobre perda do
gatilho automatizado de auditoria): mesmo onde existir acesso de
supervisão, dar à Camada 3 acesso ao `resumo_sessao` completo de um adulto
em terapia convencional levanta um problema de sigilo profissional
diferente — e mais sensível — do que dar acesso a evidência estruturada por
domínio de uma criança com TEA. O modelo de acesso da Camada 3 pode
precisar ser mais restrito neste modo (ex.: auditoria só sobre
`alerta_risco` e metadados, não sobre `resumo_sessao` completo, salvo
exigência legal específica) — **isto é decisão de modelo de acesso/RLS,
proposta pendente de confirmação com o Rômulo, não implementada aqui.**

**P3. Meu contrato de responsabilidade técnica exige que eu, como
coordenador-psicólogo, tenha ciência de qualquer risco grave dos pacientes
da clínica — isso bate com R5-TC?**
R: `regra-alerta-risco.md` (issue #101) já desenha canal/SLA/escalonamento
compartilhado com TCC, mas nem esse documento nem este citam a base legal
para a categoria "risco a menores no entorno" — o Estatuto da Criança e do
Adolescente prevê dever de comunicação de suspeita de violência contra
criança/adolescente (**verificar número exato do artigo**). A regra já
cobre o caso operacionalmente (marca o alerta), mas não ancora
normativamente por que esse caso tem urgência jurídica distinta — e não
deixa claro que o dever de comunicar é do profissional humano, nunca do
sistema.

**P4. Terapia Convencional e TEA no mesmo prontuário — se eu vejo os dois,
sei diferenciar o que é regra de cada modo? Existe risco de eu aplicar
julgamento de protocolo TEA (ex.: "confiança baixa") em cima de um resumo
de terapia convencional que nem tem esse conceito?**
R: Reforça o achado 2 da seção 7 (paciente com atendimento misto TEA +
terapia convencional). A entrevista eleva a severidade percebida: é cenário
plausível e recorrente em clínica real (não hipotético raro), então o
achado 2 deveria ser tratado como **bloqueante**, não apenas "lacuna
registrada", para clínicas que atendem os dois públicos simultaneamente.

**P5. Como decido quais sessões revisar, sem confiança nem histórico
estruturado? Vou ter que ler tudo?**
R: Acrescenta um requisito concreto ao achado 1/Risco 4 da seção 7: falta
uma política de amostragem explícita para a Camada 3 neste modo (ex.: 100%
das sessões com `alerta_risco.presente=true` + amostra aleatória de X% do
restante + N primeiras sessões de terapeuta novo na plataforma) —
atualmente não especificada em nenhum documento. Proposta de produto, não
decidida aqui.

**P6. Terapia convencional reembolsada por convênio tem exigência de
relatório periódico como a TEA tem (CID F84 como gatilho)?**
R: Fora do escopo da issue #98 e deste documento — convênio de terapia
convencional adulta provavelmente segue formato de relatório psicológico
diferente do TEA (Resolução CFP nº 001/2009, não o modelo de laudo por
domínio usado no TEA). Registrado como possível fast-follow, não bloqueante
para este nicho agora.

### 8.4 Lista consolidada de achados

| ID | Achado | Severidade | Cobertura |
| --- | --- | --- | --- |
| AV-1 | `padrao_silencio_resistencia` embute vocabulário de escola psicanalítica no NOME DO CAMPO do schema (seção 3), em tensão com R9-TC mesmo que o texto gerado seja agnóstico. | Bloqueante | Gap novo — nome de campo é mudança de contrato de dado; se corrigido, entra como proposta pendente de confirmação com o Rômulo. |
| AV-2 | Documento não declara que a saída da IA neste modo é sempre rascunho editável pelo terapeuta antes de virar registro oficial de prontuário (Resolução CFP nº 001/2009 responsabiliza quem assina o documento). | Bloqueante | Gap novo — parcialmente sustentado pelo princípio geral de governança em 3 camadas (seção 1), mas não formalizado para este modo especificamente. |
| AV-3 | R5-TC nunca cita a base normativa (exceção de sigilo profissional por risco de vida) que legitima a própria existência do alerta de risco. | Bloqueante | Gap novo, referência exata de resolução a verificar. |
| AV-4 | Categoria "risco a menores no entorno" de R5-TC não cita a base legal do dever de comunicação (ECA, verificar artigo) nem deixa claro que o dever é do profissional, não do sistema. | Importante | Gap novo. |
| AV-5 | Falta política concreta de amostragem/auditoria da Camada 3 para este modo (quais sessões revisar, sem gatilho estruturado). | Importante | Amplia achado 1/Risco 4 já existentes na seção 7 — não é totalmente novo, mas ganha requisito concreto. |
| AV-6 | Modelo de acesso da Camada 3 a `resumo_sessao` completo de adulto pode precisar ser mais restrito que o acesso a evidência estruturada de TEA, por sensibilidade de conteúdo (sigilo profissional). | Importante | Gap novo — decisão de modelo de acesso/RLS, proposta pendente de confirmação com o Rômulo. |
| AV-7 | Falta disclaimer explícito de que a responsabilidade profissional pela conduta clínica é sempre do terapeuta, independentemente de sugestão da IA. | Importante | Gap novo, complementar ao Risco 2 já registrado (que cobre só a marcação visual, não o texto do disclaimer). |
| AV-8 | "Validação automatizada de saída" (Risco 1) está descrita como mitigação possível, não como gate obrigatório antes da entrega ao terapeuta. | Importante | Amplia Risco 1 já existente — eleva de sugestão a requisito. |
| AV-9 | Direito do paciente adulto de acessar o próprio resumo/prontuário não é mencionado neste documento. | Nice-to-have | Provável feature genérica do produto, fora do escopo deste nicho — lembrete de verificação cruzada. |
| AV-10 | Requisitos de relatório periódico para convênio em Terapia Convencional adulta não abordados. | Nice-to-have | Fora do escopo da issue #98 — possível fast-follow. |
| AV-11 | Achado 2 da seção 7 (paciente com atendimento misto TEA + terapia convencional) tem severidade subestimada — é cenário plausível e recorrente, não hipotético raro. | Bloqueante (reclassificação) | Reforça achado já existente; eleva sua severidade de "lacuna registrada" para bloqueante em clínicas com os dois públicos. |
| AV-12 | Divergência entre os números de resolução do CFP citados em pontos diferentes da documentação do Iris ("nº 6/2019" na seção 2.3 vs. "nº 001/2009" e "nº 010/2005 — verificar" nesta seção). | Importante | Gap de precisão de citação, não de mérito da regra — recomenda-se unificação/confirmação pelo Rômulo antes de uso em copy voltada ao usuário. |

Nenhum destes 12 achados invalida a arquitetura proposta. Nenhuma mudança de
schema, DDL, ou modelo de acesso foi implementada a partir desta seção — os
itens AV-1, AV-2 e AV-6 que tocam contrato de dado ou modelo de acesso estão
explicitamente marcados como proposta pendente de confirmação com o
Rômulo, conforme a categoria "confirmar antes" do `CLAUDE.md` do projeto.
