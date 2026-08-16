# Terapia Convencional — Modo do Agente Sem Protocolo

> Especificação do segundo nicho de atendimento do Iris: psicoterapia em três
> famílias de abordagem — **psicanálise/psicodinâmica, humanista/existencial,
> transpessoal/integrativa** — caracterizadas por não ter cronograma rígido,
> não ter tarefa de casa e não ter pontuação de sintoma (ver §1 para a
> definição de nicho e a fronteira com o nicho TCC da issue #99).
> Referência de origem:
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
como leitor que resume e sinaliza recorrência, nunca como extrator de evidência
estruturada por eixo clínico. Por isso este documento define um conjunto de
regras próprio (seção 2), não uma reinterpretação das R1-R19.

---

## 1. O que é o nicho

> **Mudança de premissa — 29/07/2026 (decisão do dono, issue #98).** Até esta
> data este documento definia o nicho como "atendimento convencional
> genérico" e afirmava explicitamente que **não prescrevia uma escola**,
> incluindo na lista "cognitivo-comportamental sem protocolo estruturado".
> **Isso estava errado e foi revertido.** O nicho é agora definido por
> **três famílias de abordagem nomeadas** (abaixo), e TCC — inclusive
> TCC-sem-protocolo — **sai deste nicho** e pertence à issue #99. O motivo:
> "genérico" não é um nicho comercializável nem validável com usuário real,
> e a ausência de fronteira fazia este modo herdar, por omissão, expectativas
> de escala pontuada e tarefa de casa que ele não atende.

Terapia Convencional é o atendimento psicoterapêutico conduzido em uma de
**três famílias de abordagem**:

1. **Psicanálise e Psicoterapia Psicodinâmica** — trabalho com história de
   vida, transferência, conteúdo latente, associação livre.
2. **Abordagens Humanistas e Existenciais** — centrada na pessoa, Gestalt-
   terapia, logoterapia, análise existencial, fenomenologia.
3. **Abordagens Transpessoais e Integrativas** — abordagens que incorporam
   dimensão espiritual/transpessoal e composições integrativas que não se
   organizam por protocolo de sessão.

**Os três critérios de admissão no nicho.** Uma abordagem entra neste modo
quando as três condições valem simultaneamente. São **critério**, não
descrição — se uma delas falhar, o atendimento não é deste nicho:

- **Sem cronograma rígido de sessões.** Não há sequência pré-definida de
  módulos/sessões numeradas com conteúdo previsto por sessão.
- **Sem tarefa de casa.** Não há prescrição de atividade entre sessões cuja
  adesão seja acompanhada como dado clínico.
- **Sem pontuação de sintoma.** Não há escala pontuada aplicada
  periodicamente (PHQ-9, GAD-7, inventários) como régua de progresso.

O que as três famílias priorizam, em comum, é **autoconhecimento profundo no
ritmo natural do paciente** — e é exatamente isso que torna o cronograma, a
tarefa de casa e a pontuação não apenas ausentes, mas incompatíveis com o
método.

**Fronteira explícita com o nicho TCC (issue #99).** TCC tem, por desenho,
escala pontuada (PHQ-9/GAD-7) e tarefa de casa com adesão acompanhada —
falha, portanto, em dois dos três critérios acima. **TCC-sem-protocolo
também não entra neste nicho**: o que a caracteriza não é a ausência de um
manual, é a presença de estrutura de sessão, registro de pensamentos e
mensuração de sintoma, que o modo Terapia Convencional não sabe representar
(não há `tipo_coleta`, não há `registro_pensamento`, não há
`escala_padronizada_intervalar` aqui). Um terapeuta cognitivo-comportamental
que não usa protocolo formal deve ser atendido pelo modo de #99 com escala
opcional, nunca por este modo.

Diferenças estruturais em relação ao nicho TEA/neurodesenvolvimento infantil
já coberto pelo Iris — também aqui lidas como **critério de admissão**, não
apenas como descrição comparativa:

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

**Como usar estas 4 diferenças como critério.** Um atendimento candidato a
este modo precisa satisfazer as quatro: público adulto autoconsentindo (ou
adolescente com o consentimento correto, nunca por omissão), ausência de meta
pontuável, ausência de grade de evidência por domínio e cadência narrativa em
vez de ciclo de reavaliação contra marcos. Falhando qualquer uma, o caso
pertence a outro modo (TEA com protocolo, ou #99) — não a uma variação deste.
Isso é o que impede o modo Terapia Convencional de virar o destino-padrão de
todo atendimento que não caiba nos outros dois.

### Compatibilidade com os 8 princípios inegociáveis (README.md)

Revisão item a item, conforme pedido na issue:

1. **Texto livre como fonte da verdade** — sustenta o modo, sem alteração:
   aqui o texto é ainda mais central, já que não há domínio estruturado para
   "descarregar" a interpretação.
2. **Governança em 3 camadas (IA→terapeuta→coordenador)** — mantida; a
   diferença é que a Camada 3 aqui não reclassifica "X→Y" de domínio (não
   existe domínio), reclassifica presença/ausência de alerta e adequação do
   resumo/tema recorrente sinalizado (ver seção 5) — e, neste modo, com
   acesso deliberadamente reduzido ao corpo do resumo (ver AV-6, §8.4).
3. **Evidência ≠ pontuação formal** — sustenta o modo sem alteração; aqui
   levado ao extremo, porque não há pontuação de NENHUM tipo, nem
   "candidatos a avaliação".
4. **Meta individualizada é a unidade central; protocolo é a régua** — **não
   se aplica**. Não há régua. Este é o único dos 8 princípios que não
   generaliza diretamente; ver seção 2 para o que substitui a "unidade
   central" neste modo (tema da sessão + tema recorrente sinalizado, não meta
   pontuável).
5. **Protocolo é dado, não código** — sustenta o modo: o motivo de este
   documento existir é justamente que "ausência de protocolo" também precisa
   ser um dado explícito (`modo: "terapia_convencional"`), não uma lacuna
   silenciosa tratada como bug.
6. **Linha do tempo reconstruível** — sustenta, com adaptação: aqui a
   "evolução/estagnação/regressão" não é sobre nível de ajuda num domínio, é
   sobre recorrência de tema ao longo de sessões (ex.: "mesmo tema
   de conflito familiar apareceu nas últimas 6 sessões, sinalizado como
   recorrente em 4 delas" é o análogo de estagnação).
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
  "familia_abordagem": "psicodinamica",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "luto do pai",
      "resumo": "presente nas últimas 5 sessões; sinalizado como tema recorrente em 3 delas ('culpa não resolvida' aparece literalmente no relato)."
    }
  ]
}
```

> **PROPOSTA PENDENTE DE CONFIRMAÇÃO — o campo `familia_abordagem`.** A
> definição de nicho de §1 (3 famílias nomeadas) exige que o agente saiba a
> qual família o terapeuta pertence, para poder cumprir R9-TC (não importar
> vocabulário de outra família). O campo acima (`familia_abordagem`, valores
> `psicodinamica | humanista_existencial | transpessoal_integrativa`) é a
> forma mais direta de transportar isso, mas **nome do campo, nome dos
> valores e onde a informação é cadastrada (no profissional? no vínculo
> profissional-paciente? por sessão?) não foram decididos pelo Rômulo** — as
> três opções têm implicações diferentes numa clínica com terapeutas de
> famílias distintas. Fica registrado como proposta; nenhuma migração ou
> enum foi criado a partir deste documento. Vale notar que R9-TC **funciona
> mesmo sem este campo** — a regra base é "espelhe só o vocabulário que o
> terapeuta usou", que não depende de saber a família; o campo serve para
> transformar a regra em verificação automatizável (detectar jargão da
> família errada na saída), não para habilitá-la.

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
privativo do psicólogo/psiquiatra — e qualquer documento psicológico com
conteúdo diagnóstico emitido pelo profissional é regulado pela Resolução CFP
nº 06/2019 (documentos escritos: declaração, atestado, relatório, laudo,
parecer). A base normativa exata da reserva do ato diagnóstico em si continua
pendente de confirmação profissional (issue #110, pergunta 6);
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

> **Reposicionamento de 29/07/2026.** O campo que carregava isso na saída
> deixou de se chamar `direcao_sugerida` e passou a `tema_recorrente_sinalizado`
> (array — ver §3). A mudança não relaxa R3-TC, **estreita** o que o campo pode
> conter: em vez de "onde olhar clinicamente", ele carrega **recorrência
> observável no próprio texto do terapeuta e no histórico** ("este tema apareceu
> em 4 das últimas 6 sessões"). A IA sinaliza um candidato; o humano decide o
> que fazer com ele — princípio 3 do README. O exemplo do parágrafo acima ("pode
> valer explorar a relação com a demissão antes de avançar…") continua permitido
> como formulação hedged, mas só quando ancorado numa recorrência que o texto
> sustente, nunca como julgamento de ordem clínica inventado pelo agente.

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

**R6-TC — SILÊNCIO E BAIXA PARTICIPAÇÃO VERBAL SÃO DADO, NÃO LACUNA (nova,
equivalente parcial a R6 de evidência negativa).** Uma sessão em que o
paciente falou pouco, ficou em silêncio, ou se afastou de um tema quando ele
foi trazido NÃO é uma sessão "sem conteúdo a resumir" — o próprio **padrão de
participação verbal** é o dado clínico relevante (ex.: "terceira sessão
consecutiva em que se afasta do tema do divórcio quando ele é trazido").
Distinto de R1-TC: aqui o texto pode ser escasso em conteúdo verbal do
paciente mas ainda assim rico em observação do terapeuta sobre o padrão — o
agente descreve o padrão observável, nunca inventa conteúdo que o silêncio
não revelou.

> **Nota de vocabulário (consequência da definição de nicho de §1).** O corpo
> desta regra **não usa mais a palavra "resistência"**, e o agente também não
> deve usá-la por conta própria. "Resistência" é conceito da família 1
> (psicanálise/psicodinâmica); um gestalt-terapeuta descreveria o mesmo
> fenômeno como interrupção de contato ou baixa awareness, e um terapeuta
> existencial como evitação de um tema angustiante. Descrever o observável
> ("falou pouco", "mudou de assunto quando o tema foi trazido") é neutro entre
> as três famílias; nomear o mecanismo não é. Se o terapeuta escreveu
> "resistência" no diário, o agente pode espelhar o termo descritivamente
> (R9-TC) — nunca introduzi-lo.

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

**R9-TC — NÃO IMPOR O VOCABULÁRIO DE UMA DAS 3 FAMÍLIAS A TERAPEUTA DE OUTRA
(reaproveita o espírito de R19; escopo redefinido em 29/07/2026).**

**O que esta regra deixou de ser.** Ela **não** é mais "agnosticismo entre
todas as escolas de psicoterapia". Esse escopo perdeu sentido quando §1 passou
a nomear o nicho: o produto agora sabe que o terapeuta pertence a uma de três
famílias, e "ser agnóstico" em relação a TCC, por exemplo, é irrelevante aqui
(TCC não é deste nicho — é #99).

**O que ela é agora.** O agente nunca importa o vocabulário técnico de uma das
três famílias para o relato de um terapeuta de outra. Concretamente:

| Família do terapeuta | Vocabulário que o agente pode espelhar se o terapeuta usou | Vocabulário que o agente **nunca** introduz |
| --- | --- | --- |
| 1. Psicanálise / psicodinâmica | transferência, resistência, conteúdo latente, associação livre, defesa | contato, awareness, campo fenomenológico, self-atualização, transpessoal, expansão de consciência |
| 2. Humanista / existencial | contato, awareness, aqui-e-agora, congruência, sentido, angústia existencial | resistência, transferência, inconsciente, defesa, transpessoal |
| 3. Transpessoal / integrativa | expansão de consciência, dimensão espiritual, integração, estados ampliados | resistência, transferência, inconsciente (como aparato metapsicológico) |

**Por que o mecanismo continua igual e ficou MAIS necessário.** O mecanismo
não muda: **espelhar apenas o vocabulário que o próprio terapeuta usou no
diário**, descritivamente, nunca interpretativamente além do texto; se o
terapeuta não usa jargão nenhum, o agente também não usa. O que mudou é a
severidade da falha. Antes, importar jargão errado produzia um resumo
esquisito. Agora produz um resumo que o terapeuta **lê como leitura teórica
alheia imposta ao seu paciente** — e os três vocabulários são mutuamente
hostis em grau incomum: para boa parte da família 2, "resistência" é
justamente o conceito que a abordagem centrada na pessoa rejeitou; para a
família 1, "expansão de consciência" não é linguagem clínica. Um resumo com o
jargão da família errada não é impreciso, é **ofensivo ao método** — e é o
caminho mais rápido para o terapeuta abandonar o produto.

**Consequência de contrato de dado.** Esta regra vale também para os NOMES DOS
CAMPOS do schema, não só para o texto gerado — é o que motivou a renomeação de
`padrao_silencio_resistencia` (ver §3 e AV-1 em §8.4).

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
3. A família de abordagem do terapeuta (uma de: psicodinamica |
   humanista_existencial | transpessoal_integrativa) — usada só para saber
   qual vocabulário NÃO importar (R9-TC), nunca para escolher uma leitura
   clínica.

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
R6-TC. Silêncio e baixa participação verbal são dado clínico, não lacuna —
       descreva o padrão observável, sem nomear mecanismo teórico (não use
       "resistência" se o terapeuta não a usou).
R7-TC. Tema como texto livre curto, nunca enum fechado; só quando o relato
       sustentar um tema claro.
R8-TC. Encerramento de ciclo é síntese narrativa de trajetória de temas, nunca
       escore de melhora nem sugestão de alta.
R9-TC. Este terapeuta pertence a UMA de três famílias — psicanálise/
       psicodinâmica, humanista/existencial, transpessoal/integrativa. Nunca
       importe o vocabulário técnico de uma família para o relato de outra.
       Espelhe apenas o vocabulário que o próprio terapeuta usou no diário;
       se ele não usou jargão, você também não usa. Descrever o observável é
       sempre seguro; nomear o mecanismo não é.

## Processo
1. Leia o relato inteiro antes de resumir.
2. Verifique PRIMEIRO por qualquer sinal de risco (R5-TC) — isso precede
   qualquer outra análise.
3. Identifique tema(s) só se o texto sustentar claramente (R7-TC).
4. Redija o resumo da sessão em linguagem descritiva, sem diagnóstico.
5. Se aplicável, aponte tema(s) recorrente(s) — recorrência observável no
   próprio texto/histórico do terapeuta — em linguagem hedged (R4-TC).
   Nunca rumo clínico, nunca técnica.
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
  "tema_recorrente_sinalizado": [
    {
      "tema": "string — o tema cuja recorrência foi observada",
      "observacao": "string, sempre em linguagem hedged, descrevendo a recorrência observável (nunca rumo clínico)",
      "trecho_fonte": "string — trecho literal do relato ou do histórico que sustenta a recorrência"
    }
  ],
  "padrao_participacao_verbal": {
    "presente": "boolean",
    "descricao": "string ou null — ex.: 'falou pouco; mudou de assunto quando o tema do divórcio foi trazido, 3ª sessão seguida'"
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
- `alerta_risco` é estruturalmente separado de `tema_recorrente_sinalizado` de
  propósito: risco nunca deve competir por atenção com sinalização de tema — a
  UI deve poder renderizar o alerta com prioridade visual absoluta,
  independentemente do resto do resumo.

### 3.1 Renomeação de dois campos (decisão travada, 29/07/2026)

Decisão do dono, tomada junto com a definição de nicho de §1. O motivo é
**validação com usuários reais das três famílias**: um nome de campo é
contrato de dado, aparece em API, em log, em export e eventualmente em tela —
e um contrato de dado que já decidiu uma leitura teórica não sobrevive ao
primeiro terapeuta da família errada que o lê.

| Antes | Agora | Por quê |
| --- | --- | --- |
| `padrao_silencio_resistencia` (objeto) | `padrao_participacao_verbal` (objeto, mesma forma) | "Resistência" é conceito da família 1 (psicanálise). Humanistas descrevem o mesmo fenômeno como interrupção de contato / baixa awareness. O nome antigo **decidia uma leitura teórica no próprio contrato de dado**, contradizendo R9-TC mesmo quando o texto gerado era neutro. "Participação verbal" descreve o observável e é neutro entre as três famílias. |
| `direcao_sugerida` (objeto único) | `tema_recorrente_sinalizado` (**array**) | Duas mudanças numa. (a) **Array**, atendendo o achado 4 de §7 — uma sessão pode sustentar mais de um tema recorrente, e o campo único forçava escolher um ou concatenar em texto livre, perdendo o `trecho_fonte` por item. (b) **Reposicionamento**: "direção sugerida" convida a ser lido como rumo clínico, quase prescrição. O campo agora carrega **recorrência observável no próprio texto do terapeuta** — a IA sinaliza um candidato, o humano decide (princípio 3 do README). |

Notas de compatibilidade:

- `tema_recorrente_sinalizado` como array vazio (`[]`) é o análogo correto do
  antigo `direcao_sugerida: { texto: null }` — não há sinalização a fazer.
  Array vazio é resposta válida e esperada, não falha (ver Caso TC-4 em
  `casos-de-teste-terapia-convencional.md`).
- `padrao_participacao_verbal.presente: false` mantém a semântica anterior:
  nada de notável no padrão de participação, não "o paciente participou bem".
- Nenhuma migração, DDL ou código foi escrito a partir desta seção. A
  renomeação é de contrato documentado; a implementação vem nas fatias de
  código da issue #98.

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

**Risco 2 — Sinalização de tema lida como prescrição.** Um terapeuta
sob pressão de tempo pode aceitar "pode valer explorar X" e tratá-lo como
"a IA disse para eu fazer X" — erodindo a fronteira entre sinalizar tema
(o que é aceitável) e prescrever conduta técnica (o que não é). Mitigação
de produto (não deste documento, mas a registrar como requisito de UX):
todo item de `tema_recorrente_sinalizado` deveria ser visualmente marcado na
UI como "recorrência observada — avalie", nunca como "recomendação" — e nunca
aprovável com 1 clique sem que o terapeuta veja o trecho-fonte ao lado. A
renomeação de §3.1 **reduz** este risco (o nome do campo não promete mais um
rumo clínico) mas não o elimina: o texto do item continua sendo prosa hedged
que pode ser lida como conselho.

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
Resumo dos 5 casos ali cobertos. **Cada caso declara a família de abordagem do
terapeuta no contexto** — consequência direta da definição de nicho de §1: um
eval set que não diz de qual família parte o relato não consegue testar R9-TC.

1. **Caso TC-1 — Escuta simples, sem crise** (família psicodinâmica). Sessão
   de retomada de rotina pós-luto, tema claro, recorrência sinalizada em
   linguagem hedged, sem alerta.
2. **Caso TC-2 — Relato de risco (violência doméstica)** (família humanista/
   existencial). Testa R5-TC — alerta obrigatório mesmo com o terapeuta
   relativizando ("ela disse que já é assim há anos, não é nada novo").
3. **Caso TC-3 — Baixa participação verbal** (família humanista/existencial).
   Testa R6-TC — sessão com pouca fala do paciente, terapeuta registra pouco,
   mas o PADRÃO de participação é o dado. Também prova que o agente descreve o
   observável sem introduzir "resistência".
4. **Caso TC-4 — Encerramento de ciclo** (família transpessoal/integrativa).
   Testa R8-TC — revisão de jornada sem meta formal, síntese narrativa de
   trajetória de temas; `tema_recorrente_sinalizado: []` é a saída correta.
5. **Caso TC-5 — Mesma sessão, duas famílias (caso cruzado).** Testa R9-TC no
   seu escopo novo — o MESMO episódio clínico relatado duas vezes, uma em
   vocabulário psicodinâmico e outra em vocabulário humanista, com duas saídas
   esperadas que espelham cada relato e **não** importam o vocabulário da outra
   família. É o caso de regressão que protege a decisão de nicho de §1.

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
   mutuamente exclusivo por padrão.

   > **Direção decidida pelo dono (29/07/2026) — ver também AV-11 em §8.4.**
   > No MVE, paciente misto (TEA com protocolo **e** psicoterapia adulta
   > simultâneas) é **proibido por constraint de banco**, não por convenção nem
   > por validação de aplicação — a proibição precisa ser inviolável enquanto o
   > desenho de escopo por profissional não existir, porque a falha silenciosa
   > (coordenador aplicando julgamento de protocolo TEA sobre um resumo de
   > psicoterapia) é pior que o bloqueio explícito. O suporte real ao caso misto
   > ganha **issue própria** e sai do escopo de #98. A constraint em si é
   > trabalho de migração — não deste PR doc-only, e não desta issue.

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

4. **✅ RESOLVIDO (29/07/2026) — `direcao_sugerida` como campo único (não
   array) era insuficiente.** Resolvido pela renomeação de §3.1:
   `tema_recorrente_sinalizado` é array, com `trecho_fonte` por item. O texto
   original do achado fica abaixo para registro.

   Diferente de `temas[]` (array), o schema da
   seção 3 modelava só uma direção sugerida por sessão. Uma sessão pode
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
| **R1-TC** (fidelidade ao texto) | Resolução CFP nº 001/2009 (obrigatoriedade do registro documental) exige registro da evolução do trabalho e dos procedimentos técnico-científicos adotados; Resolução CFP nº 06/2019 rege os documentos escritos emitidos. Em ambas, o registro descreve fatos observados de forma objetiva, evitando juízo de valor não fundamentado. | Alinhado, sem divergência. |
| **R2-TC** (nunca diagnosticar) | Diagnóstico como ato privativo do psicólogo/psiquiatra; Código de Ética Profissional do Psicólogo (**Resolução CFP nº 010/2005 — número confirmado, norma vigente**) reserva a leitura clínica ao profissional. A aparente divergência de citação com a seção 2.3 ("nº 6/2019") **está resolvida**: as duas resoluções estão vigentes e regulam objetos diferentes — 010/2005 é o Código de Ética, 06/2019 rege documentos escritos emitidos, 001/2009 rege o registro documental/prontuário. Ver `docs/legal/briefing-duty-to-warn.md`, Anexo A.1. Confirmação profissional dessa leitura segue pendente na issue #110 antes de qualquer copy user-facing citar resolução. | Alinhado no mérito; citação agora precisa. |
| **R3-TC** (sem conduta prescrita) | Não corresponde a uma norma formal específica — nenhuma resolução do CFP regula "o que uma ferramenta de apoio pode sugerir". É decisão de produto ancorada no princípio geral de que técnica clínica é ato do profissional. | Sem divergência; sem norma específica a citar (não fabricado). |
| **R4-TC** (linguagem hedged) | Idem R3-TC — mitigação de produto, não exigência normativa. | Sem divergência; registrar que a regra não tem autoridade normativa própria, só de produto. |
| **R5-TC** (alerta de risco obrigatório) | Sigilo profissional (Código de Ética Profissional do Psicólogo — **verificar número exato**) tem exceção reconhecida para risco de vida a si ou a terceiros. Essa exceção é o que torna legítima a própria existência do alerta de risco — sem ela, o alerta poderia ser lido como o produto violando sigilo por padrão. | **Gap: o documento nunca cita essa base normativa explicitamente** (nem na seção 2.3, nem na seção 4) — ver achado AV-3. |
| **R6-TC** (silêncio e baixa participação verbal são dado) | Convenção de prática clínica amplamente ensinada em formação (registrar recusas/resistência do paciente, não só fala verbalizada) — não localizei uma resolução CFP específica que normatize isso; não fabricado. | Alinhado como prática, sem base normativa própria a citar. |
| **R7-TC** (tema como texto livre) | Prontuários humanos sofrem do mesmo problema de inconsistência terminológica entre sessões quando o profissional não usa vocabulário padronizado — o achado 3 da seção 7 (fragmentação de tema) **não é exclusivo do agente**, é um problema já presente na prática humana. Isso reduz, mas não elimina, a severidade do achado 3 original. | Tensão de design já registrada; contexto adicional, não gap novo. |
| **R8-TC** (encerramento como síntese) | Alinhado com a prática de nota/relatório de encerramento em prontuário, tipicamente narrativa. | Alinhado. |
| **R9-TC** (não impor vocabulário de uma das 3 famílias a terapeuta de outra — escopo redefinido em 29/07/2026, antes era "agnosticismo de escola") | Não há norma do CFP que regule vocabulário teórico — é decisão de produto, e agora também de posicionamento de nicho (§1). A convenção real relevante é de prática: o registro em prontuário usa o vocabulário da abordagem de quem atende, e vocabulário importado de outra escola é lido como leitura clínica alheia. | **Gap AV-1 RESOLVIDO** por renomeação de campo (§3.1): `padrao_silencio_resistencia` → `padrao_participacao_verbal`. A tensão era no contrato de dado, não no texto gerado — e o contrato de dado deixou de embutir vocabulário de família. |

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
explícita do terapeuta. A responsabilidade pelo conteúdo do documento
psicológico é sempre de quem o assina (Resolução CFP nº 06/2019, que rege os
documentos escritos emitidos; o registro/prontuário em si é regido pela
Resolução CFP nº 001/2009) — um texto
gerado por IA que vira prontuário sem edição/aprovação explícita é risco de
responsabilidade profissional do terapeuta, não só do produto.

**P4. Silêncio na sessão — a IA vai ficar chamando isso de "resistência", um
termo carregado de teoria psicanalítica que eu nem uso (sou humanista)?**
R: Achado real e novo **— e resolvido em 29/07/2026.** O campo do schema
chamava-se `padrao_silencio_resistencia`: "resistência" é vocabulário da
família psicodinâmica embutido no CONTRATO DE DADO, não só na saída textual.
Isso contradizia o espírito de R9-TC mesmo com o TEXTO gerado neutro, porque o
nome do campo em si já pressupunha leitura teórica. **O campo passou a
`padrao_participacao_verbal`** (§3.1), e o corpo de R6-TC deixou de usar a
palavra. Esta pergunta da persona humanista é literalmente o motivo da
renomeação — foi validação simulada que virou decisão do dono.

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
R: **Pergunta agora respondida — AV-6 virou decisão travada em 29/07/2026.**
No modo psicoterapia adulta, a Camada 3 vê por padrão só o alerta de risco e
os metadados da sessão; o corpo do `resumo_sessao` não. Ver AV-6 em §8.4.

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
domínio de uma criança com TEA. **Isto deixou de ser proposta: em 29/07/2026 o
dono travou a decisão** — a Camada 3 audita, por padrão, apenas `alerta_risco`
e metadados da sessão, nunca o `resumo_sessao` completo, salvo escalonamento do
próprio psicólogo ou exigência legal, sempre com auditoria. Ver AV-6 em §8.4
para o enunciado completo e a referência de implementação (issue #119).

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
R: **Suposição corrigida pelo dono em 29/07/2026.** A resposta anterior tratava
isso como provável não-requisito ("psicanálise/humanista não tem plano"). Está
errado: **tem.** Paciente de psicanálise, de abordagem humanista e de abordagem
integrativa é reembolsado por convênio como qualquer outro, e a operadora exige
relatório periódico do mesmo jeito. O requisito de relatório para convênio
**vale também para este nicho** — o que muda é o formato, não a existência da
exigência: aqui o documento segue o padrão de relatório psicológico narrativo
(Resolução CFP nº 06/2019, que rege relatório/laudo/parecer emitidos), não o
modelo de laudo por domínio usado no TEA. Isso interage com um requisito já
conhecido do produto: operadoras rejeitam narrativo puro e pedem dado
mensurável — e este nicho, por definição de §1, **não tem número para dar**.
Registrado como pendência real de produto no `BACKLOG.md`, não como
fast-follow descartável. Segue fora do escopo desta issue.

### 8.4 Lista consolidada de achados

| ID | Achado | Severidade | Cobertura |
| --- | --- | --- | --- |
| AV-1 | `padrao_silencio_resistencia` embutia vocabulário da família psicodinâmica no NOME DO CAMPO do schema (seção 3), em tensão com R9-TC mesmo com o texto gerado neutro. | ~~Bloqueante~~ → **✅ RESOLVIDO (29/07/2026), DEIXA DE SER BLOQUEANTE** | **Resolvido por renomeação, decisão do dono:** o campo passou a `padrao_participacao_verbal` (§3.1) e o corpo de R6-TC deixou de usar "resistência". O achado era sobre contrato de dado; o contrato de dado foi corrigido, então não há resíduo — não é "mitigado", é resolvido. A implementação da renomeação vem nas fatias de código de #98; a decisão não depende de mais nada. |
| AV-2 | Documento não declara que a saída da IA neste modo é sempre rascunho editável pelo terapeuta antes de virar registro oficial de prontuário (Resolução CFP nº 06/2019 responsabiliza quem assina o documento emitido; Resolução CFP nº 001/2009 rege o registro documental). | Bloqueante | Gap novo — parcialmente sustentado pelo princípio geral de governança em 3 camadas (seção 1), mas não formalizado para este modo especificamente. |
| AV-3 | R5-TC nunca cita a base normativa (exceção de sigilo profissional por risco de vida) que legitima a própria existência do alerta de risco. | Bloqueante | **Referência levantada:** Código de Ética (Res. CFP nº 010/2005), **art. 10** — o psicólogo "poderá decidir pela quebra de sigilo, baseando sua decisão na busca do menor prejuízo", restringindo-se ao estritamente necessário. É **faculdade**, não dever. Confirmação profissional pendente na issue #110; ver `docs/legal/briefing-duty-to-warn.md` Anexo A.2. |
| AV-4 | Categoria "risco a menores no entorno" de R5-TC não cita a base legal do dever de comunicação (ECA, verificar artigo) nem deixa claro que o dever é do profissional, não do sistema. | Importante | **Referência levantada:** ECA **art. 13** (comunicação obrigatória ao Conselho Tutelar) e Lei 13.431/2017 **art. 13** (dever de qualquer pessoa comunicar imediatamente). Diferente de AV-3: aqui há **dever legal**, não faculdade — e o dever é do profissional, não do sistema. Confirmação pendente na issue #110; ver Anexo A.3 do briefing. |
| AV-5 | Falta política concreta de amostragem/auditoria da Camada 3 para este modo (quais sessões revisar, sem gatilho estruturado). | Importante | Amplia achado 1/Risco 4 já existentes na seção 7 — não é totalmente novo, mas ganha requisito concreto. |
| AV-6 | Modelo de acesso da Camada 3 ao `resumo_sessao` completo de paciente adulto em psicoterapia. | Importante | **✅ DECISÃO TRAVADA (29/07/2026) — deixou de ser proposta.** Ver §8.5 para o enunciado normativo completo. Implementação em RLS é da **issue #119**, não de #98. |
| AV-7 | Falta disclaimer explícito de que a responsabilidade profissional pela conduta clínica é sempre do terapeuta, independentemente de sugestão da IA. | Importante | Gap novo, complementar ao Risco 2 já registrado (que cobre só a marcação visual, não o texto do disclaimer). |
| AV-8 | "Validação automatizada de saída" (Risco 1) está descrita como mitigação possível, não como gate obrigatório antes da entrega ao terapeuta. | Importante | Amplia Risco 1 já existente — eleva de sugestão a requisito. |
| AV-9 | Direito do paciente adulto de acessar o próprio resumo/prontuário não é mencionado neste documento. | Nice-to-have | Provável feature genérica do produto, fora do escopo deste nicho — lembrete de verificação cruzada. |
| AV-10 | Requisitos de relatório periódico para convênio em Terapia Convencional adulta não abordados. | ~~Nice-to-have~~ → **Importante (reclassificado 29/07/2026)** | **Suposição corrigida pelo dono:** psicanálise/humanista/integrativa **têm** paciente de convênio e **têm** exigência de relatório periódico. O requisito vale para este nicho; o formato é o do relatório psicológico narrativo, não o laudo por domínio do TEA. Tensão real: operadora pede dado mensurável e este nicho, por definição de §1, não tem número a dar. Registrado no `BACKLOG.md`. Segue fora do escopo de #98. |
| AV-11 | Achado 2 da seção 7 (paciente com atendimento misto TEA + terapia convencional) tem severidade subestimada — é cenário plausível e recorrente, não hipotético raro. | Bloqueante (reclassificação) | Reforça achado já existente; eleva sua severidade de "lacuna registrada" para bloqueante em clínicas com os dois públicos. **Direção decidida pelo dono (29/07/2026):** no MVE, paciente misto é **proibido por constraint de banco** — bloqueio explícito é preferível à falha silenciosa de aplicar julgamento de um modo sobre a saída do outro. Suporte real ao caso misto ganha **issue própria** e sai do escopo de #98. A constraint é trabalho de migração, não deste PR. |
| AV-12 | Divergência entre os números de resolução do CFP citados em pontos diferentes da documentação do Iris ("nº 6/2019" na seção 2.3 vs. "nº 001/2009" e "nº 010/2005 — verificar" nesta seção). | Importante | **Resolvido (issue #110).** Não havia divergência: as três resoluções estão vigentes e regulam objetos distintos — 001/2009 (registro documental/prontuário, alterada pela 05/2010), 06/2019 (documentos escritos emitidos), 010/2005 (Código de Ética). As citações deste documento foram corrigidas. Tabela completa em `docs/legal/briefing-duty-to-warn.md`, Anexo A.1. Segue valendo: nenhuma copy user-facing cita resolução até confirmação profissional. |

Nenhum destes 12 achados invalida a arquitetura proposta. Nenhuma mudança de
schema, DDL, ou modelo de acesso foi implementada a partir desta seção.

**Estado dos itens após a sessão de 29/07/2026:**

- **AV-1 — resolvido, não mais bloqueante.** Renomeação de campo (§3.1).
- **AV-6 — decisão travada, não mais proposta.** Enunciado em §8.5;
  implementação em RLS pela issue #119.
- **AV-10 — reclassificado para Importante** (convênio vale para este nicho).
- **AV-11 — direção decidida** (proibir misto por constraint no MVE, issue
  própria para o suporte real).
- **AV-2 continua bloqueante** e **segue como proposta pendente de confirmação
  com o Rômulo**: o documento ainda não declara normativamente que a saída da
  IA neste modo é rascunho editável até aprovação explícita do terapeuta. Não
  foi objeto da decisão desta sessão e não deve ser lido como resolvido.
- AV-3, AV-4, AV-5, AV-7, AV-8, AV-9 seguem no estado registrado acima.

### 8.5 AV-6 — decisão travada: acesso da Camada 3 no modo psicoterapia adulta

**Decisão do dono, 29/07/2026.** Deixa de ser proposta pendente e passa a
regra do produto:

- No modo psicoterapia adulta (`modo: "terapia_convencional"`), a **Camada 3
  (coordenação/supervisão) vê por padrão apenas**: o `alerta_risco` e os
  **metadados da sessão** — data da sessão, terapeuta responsável, e o fato
  booleano de haver ou não alerta.
- A Camada 3 **não** vê, por padrão, o corpo do `resumo_sessao`, nem
  `temas[]`, nem `tema_recorrente_sinalizado`, nem
  `padrao_participacao_verbal`.
- O resumo completo é acessível **só** em duas hipóteses: **escalonamento pelo
  próprio psicólogo** que atende (ato deliberado dele, não do coordenador), ou
  **exigência legal** específica.
- Em **ambas** as hipóteses o acesso é **sempre auditado** — quem acessou, o
  quê, quando e sob qual hipótese. Acesso legítimo e acesso auditado não são
  alternativas: o acesso excepcional só é legítimo porque fica registrado.

**Por quê.** Sigilo profissional. Auditar qualidade sobre evidência
estruturada por domínio de uma criança em TEA é uma coisa; ler o relato de
divórcio, trauma ou infidelidade de um adulto porque se é coordenador é outra.
O coordenador continua conseguindo cumprir sua responsabilidade técnica — ele
recebe todo alerta de risco, que é exatamente o que essa responsabilidade
exige (§8.3, P3) — sem receber, de graça, o conteúdo íntimo da sessão.

**Efeito colateral aceito, e é real.** Esta decisão **agrava AV-5**: a política
de amostragem da Camada 3 fica ainda mais dependente de `alerta_risco`, porque
sobra menos superfície auditável. A auditoria de qualidade do resumo neste modo
passa a depender de escalonamento pelo terapeuta, não de varredura pelo
coordenador. É uma troca consciente de auditabilidade por sigilo — e é a troca
certa para conteúdo de psicoterapia adulta.

**Escopo de implementação.** A implementação em RLS/modelo de acesso é da
**issue #119**, não da #98. Nenhuma policy, migração ou código foi escrito
aqui — este documento apenas registra a decisão para que #119 a implemente sem
reabrir o debate.
