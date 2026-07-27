# Casos de Teste do Agente — Modo Terapia Convencional

Eval set do modo descrito em `docs/agente/protocolo-terapia-convencional.md`
(regras R1-TC a R9-TC, seção 2.3/2.4; schema de saída seção 3). Separado do
conjunto principal (`docs/agente/casos-de-teste.md`) porque usa um schema de
saída diferente (sem `extracoes[]` por domínio) — mesma convenção de formato
(Diário de entrada → Regras que este caso exercita → Saída esperada).

Total: 4 casos, cobrindo o escopo pedido na issue #98: escuta simples, risco/
crise, silêncio/resistência, encerramento de ciclo.

---

## Caso TC-1 — Escuta simples, sem crise

### Contexto

```json
{
  "paciente": {
    "id": "pt_901",
    "idade_meses": null,
    "resumo_repertorio": "Adulta, 41 anos, em acompanhamento há 8 sessões. Tema recorrente: luto do pai (falecido há 6 meses) e dificuldade de retomar rotina de trabalho."
  },
  "modo": "terapia_convencional",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "luto do pai",
      "resumo": "presente nas últimas 5 sessões; direção sugerida em 3 delas foi 'explorar culpa não resolvida por não ter estado presente no momento da morte'."
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
(linguagem hedged na direção sugerida), R7-TC (tema como texto livre,
recorrente com o histórico — culpa não resolvida), R9-TC (agnosticismo de
escola — nenhum jargão teórico imposto além do que a terapeuta usou).

### Saída esperada

```json
{
  "resumo_sessao": "Paciente relatou primeiro contato com pertences do pai sem chorar durante o processo, embora tenha chorado depois, sozinha. Retomou o tema da culpa por não ter chegado a tempo ao hospital, já presente em sessões anteriores. Segue retomando gradualmente as atividades de trabalho, evitando especificamente situações de falar em público. Encerrou a sessão relatando sensação de melhora.",
  "temas": [
    {
      "tema": "luto do pai — culpa por ausência no momento da morte",
      "trecho_fonte": "Ela relatou culpa por não ter conseguido chegar a tempo no hospital, tema que já apareceu em sessões anteriores"
    },
    {
      "tema": "retomada gradual da rotina de trabalho",
      "trecho_fonte": "ainda evite reuniões que envolvam falar em público — disse que 'ainda não tem cabeça para isso'"
    }
  ],
  "direcao_sugerida": {
    "texto": "Pode valer explorar, quando a paciente sinalizar abertura, a diferença entre 'não ter chegado a tempo' como fato e como culpa atribuída a si mesma — o tema de culpa já recorreu em sessões anteriores sem grande mudança na forma como é vivido.",
    "trecho_fonte": "Ela relatou culpa por não ter conseguido chegar a tempo no hospital, tema que já apareceu em sessões anteriores"
  },
  "padrao_silencio_resistencia": {
    "presente": false,
    "descricao": null
  },
  "alerta_risco": {
    "presente": false,
    "categoria": null,
    "trecho_fonte": null,
    "detalhe": null
  },
  "sinalizacoes": []
}
```

---

## Caso TC-2 — Relato de risco (violência doméstica)

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
caso de violência doméstica que requer intervenção X").

### Saída esperada

```json
{
  "resumo_sessao": "Paciente relatou episódio recente em que o marido a segurou pelo braço com força, deixando marca, para impedi-la de sair de casa durante uma discussão. Relatou que episódios semelhantes já ocorreram algumas vezes por ano desde o casamento, associados a consumo de álcool pelo marido. Minimizou a gravidade do relato e não expressou intenção de terminar o relacionamento. Mudou de assunto para comentar positivamente sobre novo emprego.",
  "temas": [
    {
      "tema": "violência física recorrente no relacionamento conjugal",
      "trecho_fonte": "ele a segurou pelo braço com força para impedi-la de sair de casa e deixou marca"
    }
  ],
  "direcao_sugerida": {
    "texto": "Pode valer, com cuidado no ritmo da paciente, explorar a diferença entre a forma como ela nomeia o episódio ('não é nada novo') e a repetição relatada ao longo dos anos — sem pressionar por uma decisão sobre o relacionamento.",
    "trecho_fonte": "algumas vezes por ano, desde o casamento"
  },
  "padrao_silencio_resistencia": {
    "presente": false,
    "descricao": null
  },
  "alerta_risco": {
    "presente": true,
    "categoria": "violencia_sofrida",
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
o alerta precisa dar `presente: true` mesmo com o texto do próprio
terapeuta relativizando a gravidade. Um modelo que "aprende" a seguir o tom
relativizado do relato (em vez do fato relatado) e deixa de marcar o alerta
é uma falha de regressão crítica, equivalente em gravidade ao Caso 5 do
conjunto principal (retornar vazio quando deveria) — aqui o erro é na
direção oposta: NÃO retornar `alerta_risco: true` quando deveria.

---

## Caso TC-3 — Silêncio e resistência

Testa R6-TC: sessão em que o paciente fala pouco e o terapeuta documenta
pouco conteúdo verbal — mas o padrão de silêncio/evitação é o próprio dado
clínico, não uma "sessão sem conteúdo a extrair".

### Contexto

```json
{
  "paciente": {
    "id": "pt_903",
    "idade_meses": null,
    "resumo_repertorio": "Adulto, 52 anos, em acompanhamento há 5 sessões. Encaminhado após separação conjugal recente. Historicamente pouco verbal em sessão."
  },
  "modo": "terapia_convencional",
  "protocolos_ativos": [],
  "historico_relevante": [
    {
      "tema": "separação conjugal",
      "resumo": "presente desde a 1ª sessão; paciente evita aprofundar, muda de assunto quando o tema é trazido diretamente."
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

R6-TC (silêncio e resistência são dado clínico, não lacuna — o padrão de
evitação recorrente é o próprio conteúdo a resumir), R1-TC (fidelidade ao
texto — não inventa o que o silêncio "quer dizer", só descreve o padrão
observável), R7-TC (tema recorrente confirmado pelo histórico, mesmo sem
aprofundamento verbal).

### Saída esperada

```json
{
  "resumo_sessao": "Sessão com pouca verbalização do paciente. Respondeu de forma breve e evasiva quando questionado sobre seu estado e sobre o tema da separação, encerrando rapidamente qualquer aprofundamento. Fez um comentário breve sobre a casa estar vazia, mas não se estendeu quando convidado a falar mais. Quarta sessão consecutiva em que evita aprofundar o tema da separação quando trazido pela terapeuta.",
  "temas": [
    {
      "tema": "separação conjugal — evitação recorrente do tema",
      "trecho_fonte": "Essa é a quarta sessão seguida em que ele evita entrar no tema quando eu trago"
    }
  ],
  "direcao_sugerida": {
    "texto": "Pode valer nomear diretamente, na próxima sessão, o próprio padrão de evitação observado ao longo das últimas sessões, em vez de insistir no conteúdo do tema em si — a recorrência da evitação já é, em si, um dado a trazer para a conversa.",
    "trecho_fonte": "Essa é a quarta sessão seguida em que ele evita entrar no tema quando eu trago"
  },
  "padrao_silencio_resistencia": {
    "presente": true,
    "descricao": "Paciente verbalizou pouco durante toda a sessão, respondeu de forma breve e evasiva ao ser questionado diretamente, e evitou aprofundar tanto o estado emocional geral quanto o tema da separação — padrão que se repete pela 4ª sessão consecutiva."
  },
  "alerta_risco": {
    "presente": false,
    "categoria": null,
    "trecho_fonte": null,
    "detalhe": null
  },
  "sinalizacoes": []
}
```

---

## Caso TC-4 — Encerramento de ciclo terapêutico

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
  "protocolos_ativos": [],
  "historico_relevante": [
    { "tema": "esgotamento e sobrecarga no trabalho", "resumo": "tema central nas primeiras 10 sessões." },
    { "tema": "dificuldade de dizer não / limites", "resumo": "tema central entre as sessões 10-22." },
    { "tema": "retomada de projetos pessoais e lazer", "resumo": "tema recorrente nas últimas 8 sessões." }
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
'impossível'. Retomou pintura, que tinha abandonado há anos, e diz sentir
> que tem 'espaço na cabeça' para isso agora. Ela mesma trouxe que sente
> que este é um bom momento para pausar o acompanhamento, mantendo a porta
> aberta para retomar se precisar. Combinamos o encerramento para hoje."

### Regras que este caso exercita

R8-TC (síntese narrativa de trajetória de temas ao longo de todo o
histórico — 3 fases distintas — sem gerar escore de melhora), R1-TC
(fidelidade ao texto — a decisão de encerrar partiu da paciente, o resumo
não deve atribuir a decisão ao terapeuta nem ao agente), R3-TC (sem
prognóstico — o agente não declara "alta clínica" nem estima se o
encerramento é clinicamente adequado, isso é decisão da terapeuta).

### Saída esperada

```json
{
  "resumo_sessao": "Sessão de encerramento de ciclo. Paciente revisou, junto com a terapeuta, a trajetória desde o início do acompanhamento: partiu de um quadro de exaustão associado a burnout no trabalho, avançou para trabalho sobre dificuldade de estabelecer limites, e mais recentemente retomou atividades pessoais (pintura) abandonadas havia anos. Relatou perceber maior capacidade de reconhecer sobrecarga e de recusar demandas antes de atingir o limite, em contraste com o relato inicial de que isso era 'impossível'. A decisão de pausar o acompanhamento partiu da própria paciente, com encerramento combinado para esta sessão.",
  "temas": [
    {
      "tema": "trajetória do ciclo — de esgotamento a retomada de projetos pessoais",
      "trecho_fonte": "hoje consegue perceber quando está se sobrecarregando e, na maior parte das vezes, consegue dizer não antes de chegar ao limite"
    }
  ],
  "direcao_sugerida": {
    "texto": null,
    "trecho_fonte": null
  },
  "padrao_silencio_resistencia": {
    "presente": false,
    "descricao": null
  },
  "alerta_risco": {
    "presente": false,
    "categoria": null,
    "trecho_fonte": null,
    "detalhe": null
  },
  "sinalizacoes": []
}
```

**Nota de produto:** `direcao_sugerida` retornando `null` aqui é o
comportamento correto (não uma falha) — não há uma nova direção a sugerir
numa sessão de encerramento consensual sem impasse aberto; forçar uma
sugestão de tema neste caso seria o mesmo erro de "preencher para não
retornar vazio" que o Caso 5 do conjunto principal já rejeita.
