# Casos de Teste do Agente — Modo Terapia Convencional

Eval set do modo descrito em `docs/agente/protocolo-terapia-convencional.md`
(regras R1-TC a R9-TC, seção 2.3/2.4; schema de saída seção 3). Separado do
conjunto principal (`docs/agente/casos-de-teste.md`) porque usa um schema de
saída diferente (sem `extracoes[]` por domínio) — mesma convenção de formato
(Diário de entrada → Regras que este caso exercita → Saída esperada).

`extracoes` continua **obrigatório** no contrato executável (`agentOutputSchema`
e o tool schema entregue ao modelo o listam em `required`): o modo convencional
não emite o campo _ausente_, emite `extracoes: []`. Por isso toda saída esperada
abaixo abre com `"extracoes": []` — sem ele a fixture não é uma saída válida do
agente, e o eval set deixaria de servir como referência de comparação. Guard em
`src/lib/extraction/agent-output-schema.test.ts` valida cada bloco deste arquivo
contra o schema de runtime.

Total: **5 casos**, cobrindo o escopo pedido na issue #98: escuta simples,
risco/crise, baixa participação verbal, encerramento de ciclo, e **um caso
cruzado entre famílias de abordagem**.

## Três mudanças que atravessam todos os casos

1. **Cada caso declara a família de abordagem do terapeuta no contexto**
   (`familia_abordagem`). Consequência direta da definição de nicho de §1 do
   protocolo: o nicho é composto por três famílias nomeadas — psicanálise/
   psicodinâmica, humanista/existencial, transpessoal/integrativa — e R9-TC
   deixou de ser "agnosticismo entre todas as escolas" para ser **"não impor o
   vocabulário de uma das 3 famílias a terapeuta de outra"**. Um eval set que
   não diz de qual família parte o relato não consegue testar essa regra.
   O nome do campo `familia_abordagem` e seus valores são **proposta pendente
   de confirmação** (§2.2 do protocolo) — o que está travado é a existência das
   três famílias, não o formato do campo.
2. **Dois campos conceituais foram renomeados** (§3.1 do protocolo):
   `padrao_silencio_resistencia` → `padrao_participacao_verbal`, e
   `direcao_sugerida` (objeto único) → `tema_recorrente_sinalizado` (**array**,
   com `trecho_fonte` por item). Todos os casos abaixo já usam os nomes novos.
3. **Estrutura unificada de `alerta_risco` e formato de `temas` (#390 / D47):**
   - `alerta_risco` segue a forma canônica unificada nos 3 modos (`{categoria, severidade, certeza, trecho_fonte, detalhe}` nullable, ausência = `null`, sem `presente: boolean`).
   - `temas` é um array de strings (`string[]`), sem objetos aninhados.

---

## Caso TC-1 — Escuta simples, sem crise (família psicodinâmica)

### Contexto

```json
{
  "paciente": {
    "id": "pt_901",
    "idade_meses": null,
    "resumo_repertorio": "Adulta, 41 anos, em acompanhamento há 8 sessões. Tema recorrente: luto do pai (falecido há 6 meses) e dificuldade de retomar rotina de trabalho."
  },
  "modo": "terapia_convencional",
  "familia_abordagem": "psicodinamica",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "luto do pai",
      "resumo": "presente nas últimas 5 sessões; sinalizado como tema recorrente em 3 delas, com a culpa por não ter estado presente no momento da morte aparecendo literalmente no relato."
    }
  ]
}
```

### Diário de entrada

> "Sessão de hoje trouxe um avanço importante. A Marina chegou falando que
> conseguiu, pela primeira vez desde o falecimento do pai, organizar os
> documentos dele sem chorar durante o processo — só depois, sozinha em
> casa. Ela relatou culpa por não ter conseguido chegar a tempo no hospital,
> tema que já apareceu em sessões anteriores. Conversamos bastante sobre
> como ela está indo aos poucos retomando as atividades de trabalho, embora
> ainda evite reuniões que envolvam falar em público — disse que 'ainda não
> tem cabeça para isso'. Terminamos a sessão com ela mais leve, comentando
> que sente que 'está começando a enxergar luz no fim do túnel'."

### Regras que este caso exercita

R1-TC (fidelidade ao texto — resumo descreve só o relatado), R4-TC
(linguagem hedged na sinalização de recorrência), R7-TC (tema como texto
livre, recorrente com o histórico — culpa não resolvida), R9-TC (a terapeuta
é da família psicodinâmica **mas não usou jargão nenhum neste relato** — então
o agente também não usa: nada de "transferência", "conteúdo latente" ou
"defesa" aparecendo do nada. Espelhar a família não é licença para introduzir
o vocabulário dela).

### Saída esperada

```json
{
  "extracoes": [],
  "resumo_sessao": "Paciente relatou primeiro contato com pertences do pai sem chorar durante o processo, embora tenha chorado depois, sozinha. Retomou o tema da culpa por não ter chegado a tempo ao hospital, já presente em sessões anteriores. Segue retomando gradualmente as atividades de trabalho, evitando especificamente situações de falar em público. Encerrou a sessão relatando sensação de melhora.",
  "temas": [
    "luto do pai — culpa por ausência no momento da morte",
    "retomada gradual da rotina de trabalho"
  ],
  "tema_recorrente_sinalizado": [
    {
      "tema": "culpa por não ter chegado a tempo ao hospital",
      "observacao": "Chama atenção que este tema é nomeado pela própria terapeuta como já presente em sessões anteriores, e consta como recorrente em 3 das últimas 5 sessões no histórico — pode valer observar se recorre.",
      "trecho_fonte": "Ela relatou culpa por não ter conseguido chegar a tempo no hospital, tema que já apareceu em sessões anteriores"
    },
    {
      "tema": "evitação de situações de falar em público",
      "observacao": "Vale observar se recorre: a evitação aparece descrita como exceção específica dentro de uma retomada de trabalho descrita como geral.",
      "trecho_fonte": "ainda evite reuniões que envolvam falar em público"
    }
  ],
  "padrao_participacao_verbal": {
    "presente": false,
    "descricao": null
  },
  "alerta_risco": null,
  "sinalizacoes": []
}
```

**Nota de produto (efeito da renomeação).** Comparado à versão anterior deste
caso, a saída deixou de conter uma única "direção sugerida" em prosa
interpretativa ("explorar a diferença entre 'não ter chegado a tempo' como
fato e como culpa atribuída a si mesma") e passou a conter **dois itens de
recorrência ancorados em trecho-fonte**. Essa é exatamente a diferença que
§3.1 do protocolo pretende: o campo antigo convidava o agente a formular uma
leitura clínica; o campo novo o obriga a apontar algo verificável no texto.

---

## Caso TC-2 — Relato de risco (violência doméstica) (família humanista/existencial)

Testa diretamente R5-TC: o alerta precisa disparar mesmo quando o próprio
relato do terapeuta relativiza a gravidade ("já é assim há anos, não é nada
novo").

### Contexto

```json
{
  "paciente": {
    "id": "pt_902",
    "idade_meses": null,
    "resumo_repertorio": "Adulta, 29 anos, em acompanhamento há 3 sessões. Casada, relatou dinâmica conjugal tensa desde a admissão."
  },
  "modo": "terapia_convencional",
  "familia_abordagem": "humanista_existencial",
  "protocolos_ativos": [],
  "historico_relevante": []
}
```

### Diário de entrada

> "Sessão difícil. A Camila contou que, na última discussão com o marido,
> ele a segurou pelo braço com força para impedi-la de sair de casa e
> deixou marca. Ela disse, meio rindo, que 'já é assim há anos, não é nada
> novo, ele só fica assim quando bebe'. Perguntei se isso já tinha
> acontecido outras vezes e ela confirmou que sim, 'algumas vezes por ano,
> desde o casamento'. Ela minimizou bastante, dizendo que não quer terminar
> o casamento por causa disso e mudou de assunto rapidamente para falar do
> trabalho novo que começou essa semana, que está gostando bastante."

### Regras que este caso exercita

R5-TC (alerta de risco obrigatório — violência doméstica sofrida, mesmo
minimizada pela própria paciente e mesmo sendo padrão "antigo", não um
evento novo), R1-TC (fidelidade ao texto — registra a minimização como parte
do relato, sem amplificar nem reduzir a gravidade do fato em si), R4-TC (o
resumo evita qualquer linguagem prescritiva do tipo "ela deveria" ou "é um
caso de violência doméstica que requer intervenção X"), **R9-TC** (a terapeuta
é da família humanista/existencial: o agente **não** pode descrever a
minimização como "defesa", "negação" ou "resistência" — todos vocabulário da
família psicodinâmica. Descreve o observável: "minimizou", "mudou de assunto").

### Saída esperada

```json
{
  "extracoes": [],
  "resumo_sessao": "Paciente relatou episódio recente em que o marido a segurou pelo braço com força, deixando marca, para impedi-la de sair de casa durante uma discussão. Relatou que episódios semelhantes já ocorreram algumas vezes por ano desde o casamento, associados a consumo de álcool pelo marido. Minimizou a gravidade do relato e não expressou intenção de terminar o relacionamento. Mudou de assunto para comentar positivamente sobre novo emprego.",
  "temas": ["violência física recorrente no relacionamento conjugal"],
  "tema_recorrente_sinalizado": [
    {
      "tema": "distância entre como a paciente nomeia o episódio e a repetição que ela mesma relata",
      "observacao": "Chama atenção que a paciente nomeia o episódio como 'não é nada novo' e, na mesma sessão, confirma recorrência de anos — vale observar se essa distância entre nomeação e relato recorre nas próximas sessões.",
      "trecho_fonte": "algumas vezes por ano, desde o casamento"
    }
  ],
  "padrao_participacao_verbal": {
    "presente": true,
    "descricao": "Paciente mudou de assunto rapidamente após o relato do episódio, passando a falar do novo emprego — deslocamento do tema registrado como observável, sem inferência sobre o motivo."
  },
  "alerta_risco": {
    "categoria": "violencia_sofrida",
    "severidade": "violencia_sofrida",
    "certeza": "explicito",
    "trecho_fonte": "ele a segurou pelo braço com força para impedi-la de sair de casa e deixou marca",
    "detalhe": "Paciente relata episódio recente de violência física por parte do cônjuge, com marca visível, e confirma recorrência ('algumas vezes por ano, desde o casamento'). Paciente minimiza a gravidade e não expressa intenção de buscar afastamento — registrado literalmente, sem inferir risco além do relatado."
  },
  "sinalizacoes": [
    {
      "tipo": "texto_ambiguo",
      "detalhe": "Paciente minimizou o relato ('meio rindo', 'não é nada novo') — o alerta é mantido integralmente apesar da minimização, conforme R5-TC (falso positivo aceitável, falso negativo não)."
    }
  ]
}
```

**Nota de produto:** este é o caso mais importante do eval set deste modo —
o alerta precisa disparar (`alerta_risco` não-nulo, com `categoria: "violencia_sofrida"`) mesmo com o texto do próprio
terapeuta relativizando a gravidade. Um modelo que "aprende" a seguir o tom
relativizado do relato (em vez do fato relatado) e deixa de marcar o alerta
é uma falha de regressão crítica, equivalente em gravidade ao Caso 5 do
conjunto principal (retornar vazio quando deveria) — aqui o erro é na
direção oposta: NÃO retornar `alerta_risco` (ou retornar `null`) quando deveria.

**Nota sobre `padrao_participacao_verbal` neste caso.** O campo renomeado
cobre naturalmente um fenômeno que o nome antigo tornava desconfortável de
registrar: a paciente **falou muito**, então não há "silêncio", mas o
deslocamento de tema é um dado de participação verbal. Sob o nome antigo, o
agente teria que decidir se isso é "resistência" — um juízo teórico que R9-TC
proíbe para uma terapeuta humanista. Sob o nome novo, ele só descreve.

---

## Caso TC-3 — Baixa participação verbal (família humanista/existencial)

Testa R6-TC: sessão em que o paciente fala pouco e o terapeuta documenta
pouco conteúdo verbal — mas o padrão de participação/afastamento do tema é o
próprio dado clínico, não uma "sessão sem conteúdo a extrair".

**Também é o caso que prova a renomeação de AV-1**: a terapeuta é humanista, o
relato dela **não** usa a palavra "resistência", e a saída esperada também não
— nem no texto, nem no nome do campo.

### Contexto

```json
{
  "paciente": {
    "id": "pt_903",
    "idade_meses": null,
    "resumo_repertorio": "Adulto, 52 anos, em acompanhamento há 5 sessões. Encaminhado após separação conjugal recente. Historicamente pouco verbal em sessão."
  },
  "modo": "terapia_convencional",
  "familia_abordagem": "humanista_existencial",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "separação conjugal",
      "resumo": "presente desde a 1ª sessão; paciente não aprofunda, muda de assunto quando o tema é trazido diretamente."
    }
  ]
}
```

### Diário de entrada

> "Sessão bem silenciosa hoje. O Ricardo chegou, sentou, e demorou quase 5
> minutos para começar a falar. Quando perguntei como ele estava, disse só
> 'indo levando'. Tentei trazer o tema da separação de novo e ele deu de
> ombros, olhou para o chão e disse 'não tem muito o que falar sobre isso'.
> Ficamos em silêncio por um tempo. Perto do fim, ele comentou rapidamente
> que 'a casa está muito vazia agora', mas quando perguntei mais sobre isso
> ele só disse 'é, mas tudo bem' e encerrou o assunto. Essa é a quarta
> sessão seguida em que ele evita entrar no tema quando eu trago."

### Regras que este caso exercita

R6-TC (silêncio e baixa participação verbal são dado clínico, não lacuna — o
padrão de afastamento recorrente é o próprio conteúdo a resumir), R1-TC
(fidelidade ao texto — não inventa o que o silêncio "quer dizer", só descreve o
padrão observável), R7-TC (tema recorrente confirmado pelo histórico, mesmo sem
aprofundamento verbal), **R9-TC** (o agente descreve "falou pouco", "encerrou o
assunto", "se afasta do tema" — e **nunca** "resistência", "defesa" ou
"conteúdo latente", ausentes do relato e estranhos à família da terapeuta).

### Saída esperada

```json
{
  "extracoes": [],
  "resumo_sessao": "Sessão com pouca verbalização do paciente. Respondeu de forma breve e evasiva quando questionado sobre seu estado e sobre o tema da separação, encerrando rapidamente qualquer aprofundamento. Fez um comentário breve sobre a casa estar vazia, mas não se estendeu quando convidado a falar mais. Quarta sessão consecutiva em que se afasta do tema da separação quando ele é trazido pela terapeuta.",
  "temas": [
    "separação conjugal — afastamento recorrente do tema quando trazido"
  ],
  "tema_recorrente_sinalizado": [
    {
      "tema": "o próprio padrão de afastamento do tema, como recorrência",
      "observacao": "Chama atenção que a própria terapeuta registra ser a quarta sessão consecutiva com o mesmo padrão — pode valer observar que a recorrência do afastamento já é, em si, um dado, independentemente do conteúdo do tema.",
      "trecho_fonte": "Essa é a quarta sessão seguida em que ele evita entrar no tema quando eu trago"
    },
    {
      "tema": "menção breve ao esvaziamento da casa",
      "observacao": "Vale observar se recorre: é a única formulação espontânea do paciente sobre a separação nesta sessão, e foi encerrada por ele mesmo.",
      "trecho_fonte": "a casa está muito vazia agora"
    }
  ],
  "padrao_participacao_verbal": {
    "presente": true,
    "descricao": "Paciente verbalizou pouco durante toda a sessão, levou cerca de 5 minutos para começar a falar, respondeu de forma breve e evasiva ao ser questionado diretamente, e encerrou por conta própria o aprofundamento tanto do estado emocional geral quanto do tema da separação — padrão que se repete pela 4ª sessão consecutiva."
  },
  "alerta_risco": null,
  "sinalizacoes": []
}
```

**Critério de regressão explícito deste caso.** Uma saída que contenha a
palavra "resistência", "resistiu", "defesa" ou "mecanismo de defesa **é
falha**, mesmo que o resumo esteja no mérito correto — o relato da terapeuta
não usa esses termos e ela não é da família que os usa. Este é o teste
mecânico mais direto de R9-TC no seu escopo novo.

---

## Caso TC-4 — Encerramento de ciclo terapêutico (família transpessoal/integrativa)

Testa R8-TC: revisão de jornada sem meta formal — síntese narrativa da
trajetória de temas ao longo do histórico, nunca um "escore de melhora" ou
sugestão de alta.

### Contexto

```json
{
  "paciente": {
    "id": "pt_904",
    "idade_meses": null,
    "resumo_repertorio": "Adulta, 37 anos, em acompanhamento há 32 sessões (aproximadamente 8 meses). Iniciou o processo após burnout no trabalho."
  },
  "modo": "terapia_convencional",
  "familia_abordagem": "transpessoal_integrativa",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "esgotamento e sobrecarga no trabalho",
      "resumo": "tema central nas primeiras 10 sessões."
    },
    {
      "tema": "dificuldade de dizer não / limites",
      "resumo": "tema central entre as sessões 10-22."
    },
    {
      "tema": "retomada de projetos pessoais e lazer",
      "resumo": "tema recorrente nas últimas 8 sessões."
    }
  ]
}
```

### Diário de entrada

> "Sessão de encerramento com a Fernanda, como combinado há duas semanas.
> Revisamos juntas o processo desde o início — ela lembrou como chegou
> exausta, quase sem conseguir descrever o próprio dia a dia de tanto
> automatismo. Comentou que hoje consegue perceber quando está se
> sobrecarregando e, na maior parte das vezes, consegue dizer não antes de
> chegar ao limite, algo que no início do processo ela dizia ser
> 'impossível'. Retomou pintura, que tinha abandonado há anos, e diz sentir
> que tem 'espaço na cabeça' para isso agora. Ela mesma trouxe que sente
> que este é um bom momento para pausar o acompanhamento, mantendo a porta
> aberta para retomar se precisar. Combinamos o encerramento para hoje."

### Regras que este caso exercita

R8-TC (síntese narrativa de trajetória de temas ao longo de todo o
histórico — 3 fases distintas — sem gerar escore de melhora), R1-TC
(fidelidade ao texto — a decisão de encerrar partiu da paciente, o resumo
não deve atribuir a decisão ao terapeuta nem ao agente), R3-TC (sem
prognóstico — o agente não declara "alta clínica" nem estima se o
encerramento é clinicamente adequado, isso é decisão da terapeuta), **R9-TC**
(a terapeuta é da família transpessoal/integrativa, mas escreveu o relato em
linguagem comum — então o agente **não** introduz "integração", "expansão de
consciência" ou "dimensão espiritual", que ela não usou; e tampouco importa
"elaboração" ou "insight", da família psicodinâmica).

### Saída esperada

```json
{
  "extracoes": [],
  "resumo_sessao": "Sessão de encerramento de ciclo. Paciente revisou, junto com a terapeuta, a trajetória desde o início do acompanhamento: partiu de um quadro de exaustão associado a burnout no trabalho, avançou para trabalho sobre dificuldade de estabelecer limites, e mais recentemente retomou atividades pessoais (pintura) abandonadas havia anos. Relatou perceber maior capacidade de reconhecer sobrecarga e de recusar demandas antes de atingir o limite, em contraste com o relato inicial de que isso era 'impossível'. A decisão de pausar o acompanhamento partiu da própria paciente, com encerramento combinado para esta sessão.",
  "temas": [
    "trajetória do ciclo — de esgotamento a retomada de projetos pessoais"
  ],
  "tema_recorrente_sinalizado": [],
  "padrao_participacao_verbal": {
    "presente": false,
    "descricao": null
  },
  "alerta_risco": null,
  "sinalizacoes": []
}
```

**Nota de produto:** `tema_recorrente_sinalizado` retornando **array vazio**
aqui é o comportamento correto (não uma falha) — não há recorrência a
sinalizar numa sessão de encerramento consensual sem impasse aberto; forçar um
item neste caso seria o mesmo erro de "preencher para não retornar vazio" que o
Caso 5 do conjunto principal já rejeita. Sob o schema anterior o equivalente
era `direcao_sugerida: { texto: null }`; a semântica de "nada a sinalizar" é a
mesma, a forma é que mudou (§3.1 do protocolo).

---

## Caso TC-5 — Mesma sessão, duas famílias (caso cruzado de R9-TC)

**Este caso é novo (29/07/2026) e existe por causa da definição de nicho de
§1.** Ele é o teste de regressão que protege a decisão de nicho: o **mesmo
episódio clínico**, com o mesmo paciente e os mesmos fatos, relatado por dois
terapeutas de famílias diferentes. As duas saídas esperadas devem ser
**diferentes no vocabulário e equivalentes no conteúdo factual** — provando
que o agente espelha o vocabulário do relato que recebeu e **não** impõe o da
outra família.

Formato: um episódio, dois contextos (TC-5a e TC-5b), duas entradas, duas
saídas esperadas, mais um critério de comparação cruzada que vale para o par.

**O episódio (mesmo fato clínico nas duas variantes).** Paciente adulto, em
acompanhamento há cerca de 10 sessões, chega atrasado, comenta que o pai
telefonou durante a semana depois de meses sem contato, desvia para falar de
trabalho quando o terapeuta retoma o assunto do pai, e no fim da sessão diz
que sentiu "um aperto no peito" ao ouvir a voz do pai no telefone.

### TC-5a — Relato em vocabulário psicodinâmico

#### Contexto

```json
{
  "paciente": {
    "id": "pt_905",
    "idade_meses": null,
    "resumo_repertorio": "Adulto, 34 anos, em acompanhamento há 10 sessões. Relação distante com o pai é tema desde a admissão."
  },
  "modo": "terapia_convencional",
  "familia_abordagem": "psicodinamica",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "relação com o pai",
      "resumo": "presente em 6 das 10 sessões; paciente costuma deslocar o assunto para trabalho quando o tema é retomado."
    }
  ]
}
```

#### Diário de entrada (TC-5a)

> "O Paulo chegou 15 minutos atrasado, o que já aconteceu nas duas últimas
> sessões. Trouxe que o pai ligou na quarta, depois de uns oito meses sem
> nenhum contato. Quando tentei retomar o assunto, ele deslocou rapidamente
> para uma questão do trabalho — a mesma resistência de sempre quando o pai
> entra na sessão. Interpretei em voz alta que talvez fosse difícil ficar com
> isso, e ele não respondeu diretamente. No finalzinho, quase levantando, ele
> disse que sentiu 'um aperto no peito' quando ouviu a voz do pai no
> telefone."

#### Regras que este caso exercita

R9-TC (a terapeuta **usou** "resistência", "deslocou" e "interpretei" — o
agente **pode** espelhar esses termos descritivamente, porque vieram do relato
e são da família dela), R1-TC (não estender a interpretação além do que a
terapeuta escreveu — ela disse "talvez fosse difícil", o agente não converte
isso em conteúdo psíquico afirmado), R6-TC (o desvio de assunto é dado de
participação verbal).

#### Saída esperada (TC-5a)

```json
{
  "extracoes": [],
  "resumo_sessao": "Paciente chegou 15 minutos atrasado, terceira sessão consecutiva com atraso. Relatou que o pai telefonou na quarta-feira, após cerca de oito meses sem contato. Ao ter o assunto retomado pela terapeuta, deslocou a conversa para uma questão de trabalho — movimento que a terapeuta registra como recorrente quando o tema do pai aparece, nomeando-o como resistência. A terapeuta verbalizou uma interpretação sobre a dificuldade de permanecer no tema, sem resposta direta do paciente. Ao final da sessão, o paciente relatou ter sentido 'um aperto no peito' ao ouvir a voz do pai ao telefone.",
  "temas": [
    "contato telefônico do pai após meses de afastamento",
    "deslocamento do tema do pai para o trabalho"
  ],
  "tema_recorrente_sinalizado": [
    {
      "tema": "deslocamento recorrente do tema do pai",
      "observacao": "Chama atenção que a terapeuta nomeia o deslocamento como 'a mesma resistência de sempre', e o histórico registra o mesmo movimento em 6 das 10 sessões — pode valer observar se recorre.",
      "trecho_fonte": "a mesma resistência de sempre quando o pai entra na sessão"
    },
    {
      "tema": "atrasos consecutivos",
      "observacao": "Vale observar se recorre: a terapeuta registra ser a terceira sessão seguida com atraso, sem que o paciente tenha comentado o atraso.",
      "trecho_fonte": "chegou 15 minutos atrasado, o que já aconteceu nas duas últimas sessões"
    }
  ],
  "padrao_participacao_verbal": {
    "presente": true,
    "descricao": "Paciente deslocou o assunto para o trabalho quando o tema do pai foi retomado, não respondeu diretamente à interpretação verbalizada pela terapeuta, e trouxe a menção ao 'aperto no peito' apenas ao final da sessão, já se levantando."
  },
  "alerta_risco": null,
  "sinalizacoes": []
}
```

### TC-5b — O MESMO episódio, relato em vocabulário humanista

#### Contexto

```json
{
  "paciente": {
    "id": "pt_906",
    "idade_meses": null,
    "resumo_repertorio": "Adulto, 34 anos, em acompanhamento há 10 sessões. Relação distante com o pai é tema desde a admissão."
  },
  "modo": "terapia_convencional",
  "familia_abordagem": "humanista_existencial",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "relação com o pai",
      "resumo": "presente em 6 das 10 sessões; paciente costuma mudar de assunto para trabalho quando o tema é retomado."
    }
  ]
}
```

#### Diário de entrada (TC-5b)

> "O Paulo chegou 15 minutos atrasado, terceira vez seguida. Contou que o pai
> ligou na quarta, depois de uns oito meses sem nenhum contato. Quando eu
> devolvi o assunto, ele saiu do contato e foi para uma questão do trabalho —
> igual às outras vezes em que o pai aparece aqui. Comentei que percebia que
> ficava difícil sustentar isso no aqui-e-agora, e ele não respondeu. Na hora
> de ir embora, já de pé, disse que sentiu 'um aperto no peito' quando ouviu
> a voz do pai no telefone."

#### Regras que este caso exercita

R9-TC no seu escopo novo — a terapeuta usou "saiu do contato" e
"aqui-e-agora", vocabulário da família humanista. O agente pode espelhar
**esses** termos, e **não pode** introduzir "resistência", "deslocamento",
"transferência", "defesa" ou "interpretação" (todos da família 1), ainda que o
fenômeno descrito seja o mesmo do TC-5a. Também R1-TC e R6-TC, idem TC-5a.

#### Saída esperada (TC-5b)

```json
{
  "extracoes": [],
  "resumo_sessao": "Paciente chegou 15 minutos atrasado, terceira sessão consecutiva com atraso. Relatou que o pai telefonou na quarta-feira, após cerca de oito meses sem contato. Ao ter o assunto devolvido pela terapeuta, saiu do contato e passou a falar de uma questão de trabalho — movimento que a terapeuta registra como recorrente quando o tema do pai aparece. A terapeuta comentou perceber a dificuldade de sustentar o tema no aqui-e-agora, sem resposta do paciente. Ao final da sessão, já de pé, o paciente relatou ter sentido 'um aperto no peito' ao ouvir a voz do pai ao telefone.",
  "temas": [
    "contato telefônico do pai após meses de afastamento",
    "saída de contato quando o tema do pai é devolvido"
  ],
  "tema_recorrente_sinalizado": [
    {
      "tema": "saída de contato recorrente diante do tema do pai",
      "observacao": "Chama atenção que a terapeuta registra o movimento como igual às outras vezes, e o histórico traz o mesmo padrão em 6 das 10 sessões — pode valer observar se recorre.",
      "trecho_fonte": "igual às outras vezes em que o pai aparece aqui"
    },
    {
      "tema": "atrasos consecutivos",
      "observacao": "Vale observar se recorre: a terapeuta registra ser a terceira vez seguida, sem que o paciente tenha comentado o atraso.",
      "trecho_fonte": "chegou 15 minutos atrasado, terceira vez seguida"
    }
  ],
  "padrao_participacao_verbal": {
    "presente": true,
    "descricao": "Paciente saiu do contato e passou a falar de trabalho quando o tema do pai foi devolvido, não respondeu ao comentário da terapeuta sobre a dificuldade de sustentar o tema, e trouxe a menção ao 'aperto no peito' apenas ao final, já de pé para sair."
  },
  "alerta_risco": null,
  "sinalizacoes": []
}
```

### Critério de aprovação do par TC-5a / TC-5b

Este caso só passa se **as três condições** valerem — é comparação entre as
duas saídas, não avaliação isolada de cada uma:

1. **Equivalência factual.** Os fatos registrados são os mesmos nas duas
   saídas: atraso (3ª vez), telefonema do pai após ~8 meses, mudança de
   assunto para trabalho quando o tema é retomado, comentário do terapeuta sem
   resposta do paciente, "aperto no peito" mencionado ao final. Nenhum fato
   aparece em uma saída e falta na outra.
2. **Divergência de vocabulário, na direção certa.** TC-5a pode conter
   "resistência", "deslocou", "interpretação"; TC-5b **não pode conter nenhum
   dos três**. TC-5b pode conter "saiu do contato", "aqui-e-agora"; TC-5a
   **não pode introduzir** esses termos, que não estão no seu relato. Qualquer
   cruzamento é falha de R9-TC.
3. **Nenhuma saída inventa mecanismo.** Nem "ele resiste porque…", nem "há uma
   interrupção de contato causada por…". As duas descrevem o observável e
   param aí (R1-TC). O agente espelha vocabulário; não adere a uma teoria.

**Por que este caso importa mais que os outros quatro.** TC-1 a TC-4 testam
uma família cada, isoladamente — e um modelo pode passar em todos eles usando
sempre o vocabulário de uma única família por sorte de correlação com o
relato. Só a comparação cruzada expõe a falha que a definição de nicho de §1
tornou custosa: importar o jargão da família errada. Se este caso passar e os
outros falharem, há um bug pontual; se este falhar, o posicionamento de nicho
inteiro está sem cobertura de teste.
