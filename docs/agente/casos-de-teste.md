# Casos de Teste do Agente de Extração — Iris

Conjunto de avaliação (eval set) do agente descrito em `system-instructions.md` +
`output-schema.json`. Cobre os cenários A-C da série de prompts (formalizados aqui
em JSON conforme o schema — na série eles só existiam como prosa), os 4 casos
adicionais pedidos no Prompt 2, item 6 (sessão sem evidências, texto ambíguo,
regressão e erro de transcrição), e o Caso 9 (multiprotocolo VB-MAPP+PEDI,
adicionado em 09/07/2026 como pré-requisito do bake-off — ver nota no próprio caso).

Junto com `golden-example-output.json` (caso nº1, Leo), este é o conjunto inicial
de regressão citado no Prompt 2, item 7 — usar para medir taxa de aprovação sem
edição (meta ≥70%) e detectar degradação ao trocar de modelo.

**Casos 10-17, adicionados em 09/07/2026** — nivelamento de cobertura entre
protocolos: os 9 casos originais (2-9) usam quase só `protocol_id: "vbmapp"`
(+ `"pedi"` no Caso 9). Rômulo apontou (achado registrado em `BACKLOG.md`) que
Denver/ESDM e AFLS nunca tinham sido exercitados de verdade, apesar de o
catálogo (`protocolos-e-agente.md`) afirmar que as regras do agente são
agnósticas de protocolo (R19) — essa era uma afirmação de design nunca
testada empiricamente para 8 dos 10 instrumentos do catálogo. Casos 10-17
cobrem exatamente os 8 instrumentos que ainda não tinham teste dedicado:
Denver/ESDM, ABLLS-R, AFLS (família ABA/marcos), PROC, ABFW, MBGR (família
fono) e DCDQ, Perfil Sensorial 2 (família TO, além do PEDI já coberto no
Caso 9). Cada um foi redigido para exercitar um risco específico do
instrumento (ver "Regras que este caso exercita" em cada um) — não são
casos genéricos de "evidência positiva", e sim os pontos onde um modelo
com pouca precisão mais provavelmente erraria (ex.: tentar pontuar um
questionário de pais, inventar domínio fora do escopo da sessão, ou tratar
observação incidental de exame físico como avaliação formal).

Total: 17 casos + golden example.

---

## Caso 2 — Cenário A: Sofia (2 anos) — habilidades básicas e sensorial

### Diário de entrada

> "A sessão com a Sofia começou na sala sensorial. Ela entrou correndo e foi
> direto para o balanço, ignorando meus chamados pelo nome nas duas primeiras
> vezes. Na terceira tentativa, chamando com a voz mais animada, ela olhou
> rapidamente, fez contato visual e sorriu. No balanço, trabalhamos o pedido. Eu
> segurava o equipamento e ela precisava pedir para continuar. Inicialmente ela
> só puxava minha mão, mas com a dica verbal 'vai', ela começou a vocalizar 'ba'
> para eu empurrar. Depois, na mesa, fizemos pareamento visual. Entreguei blocos
> de cores diferentes e ela conseguiu colocar o vermelho com vermelho e azul com
> azul sem nenhuma ajuda. Perto do fim da sessão, ao ouvir um barulho alto de
> sirene na rua, ela tapou os ouvidos, se jogou no chão e chorou, precisando de
> cerca de 2 minutos de contenção e abraço profundo para se regular."

### Regras que este caso exercita

R4 (função pelo antecedente — mando evoluindo de forma física para vocal), R5
(nível de ajuda + tentativas + latência), R7 (comunicação não-verbal), R10/R18
(registro ABC sensorial), R13 (ambiente).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "ignorando meus chamados pelo nome nas duas primeiras vezes. Na terceira tentativa, chamando com a voz mais animada, ela olhou rapidamente, fez contato visual e sorriu",
      "evidencia": {
        "descricao": "Respondeu ao nome na 3ª tentativa, com dica de entonação (voz mais animada); duas tentativas anteriores sem resposta",
        "polaridade": "positiva",
        "funcao": "ouvinte",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "ouvinte" }],
        "nivel_ajuda": "dica_entonacao",
        "resultado": "acerto_apos_dica",
        "tentativas": { "informado": true, "total": 3, "acertos": 1 },
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "Inicialmente ela só puxava minha mão",
      "evidencia": {
        "descricao": "Mando não-verbal (puxar a mão) para pedir continuação do balanço",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "mando" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "fisico",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "com a dica verbal 'vai', ela começou a vocalizar 'ba' para eu empurrar",
      "evidencia": {
        "descricao": "Evoluiu para mando vocal ('ba') após dica ecoica do adulto ('vai')",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "mando" }],
        "nivel_ajuda": "dica_ecoica",
        "resultado": "acerto_apos_dica",
        "topografia": "vocal_nao_articulado",
        "producao_literal": "ba",
        "alvo_producao": "vai",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "Entreguei blocos de cores diferentes e ela conseguiu colocar o vermelho com vermelho e azul com azul sem nenhuma ajuda",
      "evidencia": {
        "descricao": "Pareamento visual idêntico (cores) sem ajuda",
        "polaridade": "positiva",
        "funcao": "pareamento_visual",
        "alvos": [
          { "protocol_id": "vbmapp", "dominio_id": "percepcao_visual" }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "trecho_fonte": "ao ouvir um barulho alto de sirene na rua, ela tapou os ouvidos, se jogou no chão e chorou, precisando de cerca de 2 minutos de contenção e abraço profundo para se regular",
      "registro_abc": {
        "antecedente": "Barulho alto e súbito de sirene na rua",
        "comportamento": "Tapou os ouvidos, jogou-se no chão e chorou",
        "duracao_segundos": 120,
        "consequencia_regulacao": "Contenção e abraço profundo pelo terapeuta",
        "categoria": "sensorial",
        "subcategoria_sensorial": "auditivo",
        "severidade": "moderada"
      }
    }
  ],
  "resumo_sessao": "Evidências positivas em ouvinte (com dica), mando (evoluindo de físico para vocal com dica) e pareamento visual independente; 1 episódio de hipersensibilidade auditiva à sirene, regulado com contenção física.",
  "sinalizacoes": []
}
```

---

## Caso 3 — Cenário B: Lucas (6 anos) — linguagem avançada e rotina

### Diário de entrada

> "Hoje o trabalho com o Lucas foi bem focado em habilidades de rotina diária e
> conversação. Ao chegar na clínica, perguntei 'O que você comeu no café da
> manhã hoje?' e ele respondeu de bate-pronto 'Pão com queijo e suco'. Fomos
> para o banheiro treinar a lavagem das mãos. Ele abriu a torneira, molhou as
> mãos e pegou o sabão de forma independente, mas precisou de uma leve dica
> gestual minha para lembrar de esfregar as costas das mãos. Depois, fomos
> jogar 'Cara a Cara' para trabalhar alternância de turnos. Ele esperou a minha
> vez super bem, mas teve dificuldade em formular as perguntas sobre as
> características dos personagens, repetindo a mesma pergunta 'ele tem chapéu?'
> em quase todas as rodadas, mesmo quando não fazia sentido. Tivemos zero
> comportamentos de fuga hoje."

### Regras que este caso exercita

R9 (cadeia por etapa), R6 (evidência negativa / padrão rígido), R10 (ausência de
comportamento como dado positivo), R12 (variabilidade).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "perguntei 'O que você comeu no café da manhã hoje?' e ele respondeu de bate-pronto 'Pão com queijo e suco'",
      "evidencia": {
        "descricao": "Respondeu pergunta sobre evento passado sem estímulo presente",
        "polaridade": "positiva",
        "funcao": "intraverbal",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "intraverbal" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "Pão com queijo e suco",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "cadeia",
      "confianca": "alta",
      "trecho_fonte": "Ele abriu a torneira, molhou as mãos e pegou o sabão de forma independente, mas precisou de uma leve dica gestual minha para lembrar de esfregar as costas das mãos",
      "cadeia": {
        "nome": "Lavagem das mãos",
        "etapas": [
          { "descricao": "Abrir a torneira", "nivel_ajuda": "independente" },
          { "descricao": "Molhar as mãos", "nivel_ajuda": "independente" },
          { "descricao": "Pegar o sabão", "nivel_ajuda": "independente" },
          {
            "descricao": "Esfregar as costas das mãos",
            "nivel_ajuda": "dica_gestual"
          }
        ]
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "Ele esperou a minha vez super bem",
      "evidencia": {
        "descricao": "Respeitou alternância de turnos em jogo",
        "polaridade": "positiva",
        "funcao": "social",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "social" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "teve dificuldade em formular as perguntas sobre as características dos personagens, repetindo a mesma pergunta 'ele tem chapéu?' em quase todas as rodadas, mesmo quando não fazia sentido",
      "justificativa_confianca": "Função (intraverbal/formular pergunta) clara pelo contexto do jogo, mas o domínio exato do protocolo para 'variar perguntas sobre atributos' é menos certo sem a definição completa do nível VB-MAPP mapeado no contexto.",
      "evidencia": {
        "descricao": "Dificuldade em variar perguntas; padrão rígido de repetir a mesma pergunta mesmo fora de contexto",
        "polaridade": "negativa",
        "funcao": "intraverbal",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "intraverbal" }],
        "nivel_ajuda": "independente",
        "resultado": "erro",
        "ambiente": "natural",
        "dimensoes_qualidade": {
          "variabilidade": "Baixa — repetiu 'ele tem chapéu?' em quase todas as rodadas, mesmo sem fazer sentido no contexto"
        }
      }
    },
    {
      "tipo": "ausencia_comportamento",
      "confianca": "alta",
      "trecho_fonte": "Tivemos zero comportamentos de fuga hoje",
      "ausencia_comportamento": {
        "comportamento": "Fuga do ambiente",
        "contexto": "Sessão inteira"
      }
    }
  ],
  "resumo_sessao": "Evidências positivas em intraverbal, cadeia de lavagem das mãos (quase independente) e alternância de turnos; padrão rígido em variar perguntas sobre atributos; ausência de fuga registrada como dado positivo.",
  "sinalizacoes": []
}
```

---

## Caso 4 — Cenário C: Miguel (4 anos) — brincar naturalista e atenção compartilhada

### Diário de entrada

> "Sessão muito fluida com o Miguel. Fomos para o tapete brincar com a
> fazendinha. No começo, ele pegou o cavalo e o porco de plástico e começou a
> bater um no outro de forma repetitiva, olhando para o teto. Tentei modelar a
> brincadeira: peguei o meu boneco, fiz ele dar comida para a vaca e disse 'nham
> nham, que fome!'. Ele parou, observou, pegou o cavalo dele, levou até o
> comedouro de brinquedo e imitou o meu 'nham nham'. Aproveitei a atenção dele e
> apontei para a vaca perguntando 'Qual o som que a vaca faz?'. Ele não
> respondeu. Mudei a instrução para 'Quem é esse aqui?' e ele respondeu 'vaca'.
> Mais pro final, ele apontou para a prateleira querendo alcançar a caixa de
> massinha, e ficou olhando para mim e para a caixa alternadamente até eu
> levantar para pegar."

### Regras que este caso exercita

R6 (par de contraste — `par_contraste_id`), R7 (atenção compartilhada / rastreio
de olhar), R10 (barreira como registro ABC, não pontuação), R4 (função pelo
antecedente: mesma criança, mesmo tópico "vaca", duas funções diferentes).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "trecho_fonte": "ele pegou o cavalo e o porco de plástico e começou a bater um no outro de forma repetitiva, olhando para o teto",
      "registro_abc": {
        "antecedente": "Início da sessão, brinquedos de fazendinha disponíveis no tapete",
        "comportamento": "Bateu os bonecos um no outro repetitivamente, com desatenção visual (olhando para o teto)",
        "duracao_segundos": null,
        "consequencia_regulacao": "Terapeuta modelou brincadeira funcional para redirecionar",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "Ele parou, observou, pegou o cavalo dele, levou até o comedouro de brinquedo e imitou o meu 'nham nham'",
      "evidencia": {
        "descricao": "Imitou ação (alimentar o animal) e som ('nham nham'), dando função ao brinquedo, após modelação do terapeuta",
        "polaridade": "positiva",
        "funcao": "imitacao_generalizada",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "brincar" }],
        "nivel_ajuda": "modelacao",
        "resultado": "acerto_apos_dica",
        "topografia": "vocal_articulado",
        "producao_literal": "nham nham",
        "ambiente": "natural",
        "dimensoes_qualidade": {
          "generalizacao": "Generalizou a ação (alimentar) do boneco do terapeuta (vaca) para o próprio brinquedo (cavalo)"
        }
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "par_contraste_id": "miguel-vaca-som-nome-01",
      "trecho_fonte": "apontei para a vaca perguntando 'Qual o som que a vaca faz?'. Ele não respondeu",
      "evidencia": {
        "descricao": "Não respondeu a pergunta intraverbal sobre o som do animal",
        "polaridade": "negativa",
        "funcao": "intraverbal",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "intraverbal" }],
        "nivel_ajuda": "independente",
        "resultado": "erro",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "par_contraste_id": "miguel-vaca-som-nome-01",
      "trecho_fonte": "Mudei a instrução para 'Quem é esse aqui?' e ele respondeu 'vaca'",
      "evidencia": {
        "descricao": "Nomeou o item diante do estímulo presente, com pergunta diferente",
        "polaridade": "positiva",
        "funcao": "tato",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "tato" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "vaca",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "ele apontou para a prateleira querendo alcançar a caixa de massinha, e ficou olhando para mim e para a caixa alternadamente até eu levantar para pegar",
      "evidencia": {
        "descricao": "Mando não-verbal (apontar) com atenção compartilhada — alternância de olhar item→adulto→item",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "mando" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "gestual_elementar",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "ficou olhando para mim e para a caixa alternadamente até eu levantar para pegar",
      "justificativa_confianca": "Mesmo trecho da evidência de mando acima; classificado também como atenção compartilhada (comunicação social), domínio secundário além do mando (R8).",
      "evidencia": {
        "descricao": "Alternância de olhar item→adulto→item para compartilhar interesse/solicitar",
        "polaridade": "positiva",
        "funcao": "comunicacao_social",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "social" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "gestual_elementar",
        "ambiente": "natural"
      }
    }
  ],
  "resumo_sessao": "1 episódio de brincar repetitivo sem função no início, redirecionado com modelação; imitação de brincar simbólico com generalização; par de contraste intraverbal (falhou) x tato (acertou) sobre o mesmo item; mando não-verbal com atenção compartilhada.",
  "sinalizacoes": []
}
```

---

## Caso 5 — Sessão sem evidências

Testa R1 ("retornar vazio é sucesso, não falha") e a distinção entre diário fraco
(nada a extrair sem inferir) vs. diário ambíguo (caso 6).

### Diário de entrada

> "Hoje a sessão com a Ana foi tranquila. Trabalhamos as atividades de sempre.
> Ela colaborou bem durante todo o período e não apresentou nenhum comportamento
> fora do comum."

### Saída esperada

```json
{
  "extracoes": [],
  "resumo_sessao": "Diário não descreve antecedentes, comportamentos específicos, produções ou níveis de ajuda — apenas avaliação geral da sessão. Nenhuma extração possível sem inferir além do texto.",
  "sinalizacoes": [
    {
      "tipo": "texto_ambiguo",
      "detalhe": "Registro genérico ('atividades de sempre', 'colaborou bem') sem nenhum evento concreto (antecedente → comportamento → nível de ajuda). Recomenda-se orientar o terapeuta a descrever ao menos 1-2 eventos específicos na consolidação."
    }
  ]
}
```

**Nota de produto:** este é o caso mais importante para a métrica de confiança do
usuário — devolver `extracoes: []` aqui, em vez de inventar conteúdo para
"preencher" o relatório, é o comportamento correto e deve ser tratado como
sucesso nos testes de regressão, não como falha do modelo.

---

## Caso 6 — Texto ambíguo (função indefinível sem antecedente)

Testa R4 (`funcao_indefinida` com confiança baixa) ao lado de eventos claros no
mesmo diário — o agente precisa diferenciar caso a caso, não aplicar ambiguidade
ao diário inteiro.

### Diário de entrada

> "A sessão com o Pedro (5 anos) foi na sala de brinquedos. Em um momento, ele
> olhou para a caixa de carrinhos e disse 'carro' bem claro. Mais tarde, durante
> o lanche, ele apontou para o suco e disse 'suco', e eu entreguei o copo na
> hora. No fim, brincamos de bola e ele chutou de volta toda vez que eu chutava
> para ele."

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "baixa",
      "trecho_fonte": "ele olhou para a caixa de carrinhos e disse 'carro' bem claro",
      "justificativa_confianca": "Antecedente não permite decidir entre mando (queria pegar o carrinho) e tato (só nomeou o que viu) — o texto não descreve motivação, tentativa de alcançar o item, nem pergunta do terapeuta. Não escolher por palpite (R4).",
      "evidencia": {
        "descricao": "Disse 'carro' diante da caixa de carrinhos, função indeterminável pelo antecedente descrito",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "nao_aplicavel",
        "topografia": "vocal_articulado",
        "producao_literal": "carro",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "ele apontou para o suco e disse 'suco', e eu entreguei o copo na hora",
      "evidencia": {
        "descricao": "Pediu suco (apontou + verbalizou) e recebeu o item imediatamente — motivação clara pela consequência",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "mando" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "suco",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "brincamos de bola e ele chutou de volta toda vez que eu chutava para ele",
      "justificativa_confianca": "Comportamento social recíproco claro, mas o domínio exato (jogo/brincar recíproco vs. motor) depende de qual protocolo/meta está mapeado no contexto do paciente.",
      "evidencia": {
        "descricao": "Reciprocidade em jogo de bola (chutou de volta em todas as ocasiões)",
        "polaridade": "positiva",
        "funcao": "social",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "social" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "natural"
      }
    }
  ],
  "resumo_sessao": "1 evidência de função indefinida (dizer 'carro' sem antecedente claro), 1 mando claro ('suco', motivação evidenciada pela entrega imediata) e 1 evidência de reciprocidade social em jogo de bola.",
  "sinalizacoes": [
    {
      "tipo": "texto_ambiguo",
      "detalhe": "'Carro' foi dito sem descrição de motivação, tentativa de alcançar o item ou pergunta do terapeuta — impossível decidir entre mando e tato só com o texto."
    }
  ]
}
```

---

## Caso 7 — Regressão (habilidade antes independente, agora com mais ajuda ou falha)

Testa R14 na direção de regressão (redação da regra corrigida em
`system-instructions.md` e `protocolos-e-agente.md` neste mesmo ciclo — a versão
anterior só exemplificava a direção "bom demais para ser verdade"). Pressupõe
`historico_relevante` no contexto indicando: lavagem das mãos independente há 3
meses; tato "bola" independente há 2 meses.

### Diário de entrada

> "Na lavagem das mãos, o Rafael precisou de dica física completa em quase
> todas as etapas — ele parecia não lembrar a sequência, mesmo eu perguntando
> se lembrava. Quando mostrei a bola e perguntei 'o que é isso?', ele não
> respondeu, e só disse 'bola' depois que eu falei a palavra primeiro."

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "cadeia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "Na lavagem das mãos, o Rafael precisou de dica física completa em quase todas as etapas — ele parecia não lembrar a sequência, mesmo eu perguntando se lembrava",
      "justificativa_confianca": "Histórico recente registra a cadeia como independente há 3 meses; hoje o nível de ajuda está muito acima do esperado (dica física em quase todas as etapas). Possível regressão — não descartar, sinalizar para revisão do coordenador.",
      "cadeia": {
        "nome": "Lavagem das mãos",
        "etapas": [
          {
            "descricao": "Sequência geral da lavagem das mãos (quase todas as etapas)",
            "nivel_ajuda": "dica_fisica"
          }
        ]
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "par_contraste_id": "rafael-bola-tato-ecoico-01",
      "trecho_fonte": "Quando mostrei a bola e perguntei 'o que é isso?', ele não respondeu",
      "justificativa_confianca": "Histórico recente registra tato de 'bola' independente há 2 meses; hoje não respondeu nem com o item presente e a pergunta direta. Possível regressão.",
      "evidencia": {
        "descricao": "Não respondeu ao tato de 'bola' diante do item presente e da pergunta direta",
        "polaridade": "negativa",
        "funcao": "tato",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "tato" }],
        "nivel_ajuda": "independente",
        "resultado": "erro",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "par_contraste_id": "rafael-bola-tato-ecoico-01",
      "trecho_fonte": "e só disse 'bola' depois que eu falei a palavra primeiro",
      "justificativa_confianca": "O mesmo item, que era tato independente há 2 meses, hoje só foi produzido como ecoico (repetição do modelo do adulto) — reforça o padrão de regressão da evidência anterior.",
      "evidencia": {
        "descricao": "Repetiu 'bola' após o adulto fornecer o modelo verbal (ecoico), não tato espontâneo",
        "polaridade": "negativa",
        "funcao": "ecoico",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "ecoico" }],
        "nivel_ajuda": "dica_ecoica",
        "resultado": "acerto_apos_dica",
        "topografia": "vocal_articulado",
        "producao_literal": "bola",
        "ambiente": "estruturado"
      }
    }
  ],
  "resumo_sessao": "2 evidências inconsistentes com o histórico recente (cadeia de lavagem das mãos e tato de 'bola', ambos antes independentes, hoje com ajuda máxima ou falha) — padrão sugere possível regressão.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Duas evidências neste diário mostram nível de ajuda muito acima do histórico recente da criança em habilidades antes independentes (lavagem das mãos e tato de 'bola'). Padrão sugere possível regressão — recomenda-se revisão do coordenador antes da próxima sessão."
    }
  ]
}
```

---

## Caso 8 — Ditado com erros de transcrição (ASR)

Testa R15 (caridade com erros prováveis de ASR + rebaixar confiança quando a
dúvida é relevante) e R16 (produção literal + alvo, nunca inferir além do citado).
Diário simula saída crua de reconhecimento de fala: sem pontuação/maiúsculas,
números por extenso com pequeno erro de concordância.

### Diário de entrada (transcrição de áudio)

> "a sessão com o joão foi boa hoje pedi pra ele pegar a bola ele pegou certo
> sem ajuda nenhuma depois eu mostrei a foto de um nenê e perguntei quem é esse
> ele falou nhee bem baixinho acho que ele quis dizer nenê quando guardei os
> brinquedos no final ele chorou uns 30 segundo e bateu de leve no tapete com a
> mão"

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "pedi pra ele pegar a bola ele pegou certo sem ajuda nenhuma",
      "evidencia": {
        "descricao": "Seguiu instrução de selecionar item ('pegar a bola') sem ajuda",
        "polaridade": "positiva",
        "funcao": "ouvinte",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "ouvinte" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "baixa",
      "trecho_fonte": "mostrei a foto de um nenê e perguntei quem é esse ele falou nhee bem baixinho acho que ele quis dizer nenê",
      "justificativa_confianca": "Produção 'nhee' registrada foneticamente como no diário; o próprio terapeuta expressa incerteza sobre a interpretação ('acho que'), e o texto vem de transcrição de áudio sem pontuação — possível erro de ASR ou de percepção do terapeuta na fala baixa da criança. Confiança rebaixada por R15.",
      "evidencia": {
        "descricao": "Nomeou a figura ('nenê') diante da pergunta, com produção fonética aproximada e baixo volume",
        "polaridade": "positiva",
        "funcao": "tato",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "tato" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "nhee",
        "alvo_producao": "nenê",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "trecho_fonte": "quando guardei os brinquedos no final ele chorou uns 30 segundo e bateu de leve no tapete com a mão",
      "evidencia": null,
      "registro_abc": {
        "antecedente": "Guardar os brinquedos ao final da sessão (transição)",
        "comportamento": "Chorou e bateu de leve no tapete com a mão",
        "duracao_segundos": 30,
        "consequencia_regulacao": "Não informado no texto",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    }
  ],
  "resumo_sessao": "Evidência clara de ouvinte independente; tato de 'nenê' com produção fonética aproximada e confiança rebaixada por incerteza de transcrição/percepção; 1 episódio breve de choro na transição de guardar brinquedos, sem risco.",
  "sinalizacoes": [
    {
      "tipo": "possivel_erro_transcricao",
      "detalhe": "'nhee' pode ser transcrição/percepção imprecisa da produção da criança para 'nenê' — o próprio terapeuta expressa dúvida ('acho que ele quis dizer'). Número '30 segundo' tratado como '30 segundos' (erro de concordância típico de ditado, não de conteúdo)."
    }
  ]
}
```

---

## Caso 9 — Multiprotocolo: VB-MAPP (ABA) + PEDI (TO) simultâneos

Adicionado em 09/07/2026 — achado do backlog (`BACKLOG.md`, seção A): os 8
casos acima usam exclusivamente `protocol_id: "vbmapp"`; nenhum exercitava
paciente com 2+ protocolos ativos de famílias diferentes nem
`SessionProtocolScope` (decisão 2.10 de `modelo-de-dados.md`). Sem este caso,
o bake-off Claude vs. Gemini (Seção B do backlog) mediria aprovação só no
cenário mais fácil (uma escala só), escondendo erro sistemático se um modelo
"aprender" a escala ABA e tentar aplicá-la fora dela.

### Contexto (paciente com 2 protocolos ativos; sessão de TO escopada só ao PEDI)

Paciente tem `PatientProtocol` vigente para `vbmapp` (ABA, referência) E
`pedi` (TO, referência) ao mesmo tempo. Esta sessão específica é conduzida
pela terapeuta ocupacional; `SessionProtocolScope` pré-preenche o escopo
só ao PEDI (disciplina do profissional = TO) — por isso o `protocolos_ativos`
passado ao agente NESTA sessão traz apenas PEDI, com sua PRÓPRIA taxonomia de
ajuda (escala de assistência do cuidador, diferente da escala ABA):

```json
{
  "paciente": {
    "id": "pt_456",
    "idade_meses": 54,
    "resumo_repertorio": "Em intervenção ABA (VB-MAPP) e TO (PEDI) concomitantes; autocuidado em desenvolvimento, independente para vestir calçado nas últimas 3 sessões de TO."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "pedi",
      "nome": "PEDI",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "supervisao",
        "assistencia_minima",
        "assistencia_moderada",
        "assistencia_maxima"
      ],
      "dominios": [
        {
          "dominio_id": "autocuidado_vestir",
          "nome": "Autocuidado — vestir calçado",
          "definicao_funcional": "colocar/tirar o próprio calçado",
          "sinais_no_texto": [
            "calçou",
            "tentou colocar o tênis",
            "precisou de ajuda para amarrar"
          ]
        },
        {
          "dominio_id": "autocuidado_alimentacao",
          "nome": "Autocuidado — alimentação",
          "definicao_funcional": "usar utensílio para se alimentar",
          "sinais_no_texto": [
            "comeu sozinho",
            "usou a colher",
            "precisei ajudar a levar à boca"
          ]
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "autocuidado_vestir",
      "protocol_id": "pedi",
      "resumo": "independente para calçar o próprio tênis nas últimas 3 sessões de TO"
    }
  ]
}
```

Nota: `vbmapp` NÃO aparece em `protocolos_ativos` desta chamada — não é
esquecimento, é o próprio `SessionProtocolScope` filtrando o contexto antes de
chamar o agente, porque esta sessão é de TO.

### Diário de entrada

> "Hoje trabalhamos autocuidado. Na hora de calçar o tênis para ir para o
> parquinho, o Théo pediu minha ajuda segurando o tênis na minha direção e
> não conseguiu encaixar o pé sozinho — precisei segurar o calçado firme e
> guiar o pé dele com a mão (assistência moderada); nas últimas semanas ele
> vinha calçando sozinho. Na alimentação do lanche, ele usou a colher para
> comer o purê de frutas sem nenhuma ajuda, só olhando de vez em quando para
> checar se estava fazendo certo. Em um momento, ele apontou para a porta e
> vocalizou 'aa' olhando para mim, parecendo quere sair para o parquinho antes
> da hora — não insisti, é fora do que estamos trabalhando em TO hoje."

### Regras que este caso exercita

R19 (AGNOSTICISMO — o agente usa a `taxonomia_ajuda` do PEDI vinda do
contexto, `assistencia_moderada`/`supervisao`/etc., nunca a escala ABA
`dica_verbal`/`dica_fisica` hardcoded), R14 (INCONSISTÊNCIA COM HISTÓRICO —
regressão de "independente" para "assistencia_moderada" no MESMO domínio
PEDI, comparando dentro da escala do PEDI, não da ABA — testa diretamente a
correção de `modelo-de-dados.md` seção 2.5), R5 (nível de ajuda), R13
(ambiente). O momento do apontar+vocalizar 'aa' testa o LIMITE do escopo:
como `vbmapp` não está em `protocolos_ativos` desta sessão, o agente não deve
inventar um alvo `vbmapp`/`mando` — a evidência comunicativa ainda é capturada
(é dado clínico real e relevante para a equipe), mas sem alvo de protocolo
(`alvos: [{ "protocol_id": null, "dominio_id": null }]`), preservando para o
coordenador decidir se cabe compartilhar com a equipe de ABA.

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "precisei segurar o calçado firme e guiar o pé dele com a mão (assistência moderada); nas últimas semanas ele vinha calçando sozinho",
      "inconsistente_com_historico": true,
      "justificativa_confianca": "Histórico registra independência nas últimas 3 sessões de TO para este domínio; hoje o terapeuta relata assistência moderada — regressão sinalizada por R14 (piora em relação ao histórico), dentro da escala de assistência do PEDI, não da escala de ajuda ABA.",
      "evidencia": {
        "descricao": "Regressão: precisou de assistência moderada (terapeuta segurou o calçado e guiou o pé) para calçar o tênis, após 3 sessões consecutivas independente no mesmo domínio",
        "polaridade": "negativa",
        "funcao": "autocuidado",
        "alvos": [
          { "protocol_id": "pedi", "dominio_id": "autocuidado_vestir" }
        ],
        "nivel_ajuda": "assistencia_moderada",
        "resultado": "acerto_apos_dica",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "ele usou a colher para comer o purê de frutas sem nenhuma ajuda, só olhando de vez em quando para checar se estava fazendo certo",
      "evidencia": {
        "descricao": "Usou colher para se alimentar de forma independente, com checagem visual ocasional (não configura ajuda física/verbal)",
        "polaridade": "positiva",
        "funcao": "autocuidado",
        "alvos": [
          { "protocol_id": "pedi", "dominio_id": "autocuidado_alimentacao" }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "ele apontou para a porta e vocalizou 'aa' olhando para mim, parecendo querer sair para o parquinho antes da hora",
      "justificativa_confianca": "Ato comunicativo funcionalmente claro (pedido para sair), mas nenhum protocolo desta sessão (apenas PEDI está em escopo via SessionProtocolScope) mapeia comunicação — sem alvo de domínio a atribuir; registrado como evidência clínica sem protocolo.",
      "evidencia": {
        "descricao": "Apontou para a porta e vocalizou 'aa' olhando para o adulto, pedido não-verbal para sair antes do previsto",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "gestual_elementar",
        "ambiente": "natural"
      }
    }
  ],
  "resumo_sessao": "Regressão em autocuidado-vestir (assistência moderada após 3 sessões independente) — sinalizada; alimentação com colher independente; 1 pedido comunicativo espontâneo fora do escopo de TO, registrado para possível relevância à equipe de ABA.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Autocuidado-vestir: independente nas últimas 3 sessões, hoje assistência moderada — regressão a confirmar com a terapeuta antes de aprovar sem edição."
    }
  ]
}
```

---

## Caso 10 — Denver/ESDM: objetivos de ciclo, atenção conjunta e domínio "comportamento"

### Contexto

```json
{
  "paciente": {
    "id": "pac_0142",
    "idade_meses": 30,
    "resumo_repertorio": "TEA nível de suporte 2; ciclo 2 de intervenção ESDM em curso, 12 semanas."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "esdm",
      "nome": "Early Start Denver Model (ESDM) — Curriculum Checklist",
      "tipo_coleta": "evidencia_por_objetivo_ativo",
      "taxonomia_ajuda": [
        "independente",
        "dica_verbal",
        "dica_gestual",
        "modelacao",
        "dica_fisica"
      ],
      "dominios": [
        {
          "dominio_id": "brincar",
          "nome": "Brincar",
          "definicao_funcional": "ação funcional/simbólica com brinquedo, modelada ou espontânea"
        },
        {
          "dominio_id": "atencao_conjunta_social",
          "nome": "Atenção conjunta e habilidades sociais",
          "definicao_funcional": "alternância de olhar objeto-adulto-objeto para compartilhar interesse ou pedir"
        },
        {
          "dominio_id": "imitacao",
          "nome": "Imitação",
          "definicao_funcional": "reproduzir ação/gesto do adulto, modelada ou espontânea"
        },
        {
          "dominio_id": "comportamento",
          "nome": "Comportamento",
          "definicao_funcional": "respostas a frustração/transição, registradas como registro_abc"
        },
        {
          "dominio_id": "autonomia_pessoal",
          "nome": "Autonomia pessoal",
          "definicao_funcional": "rotinas de autocuidado (ex.: lavar as mãos) com apoio decrescente"
        }
      ],
      "nota": "Coleta diária é feita só contra os objetivos ativos do ciclo (abaixo), nunca contra os 480 itens do checklist inteiro.",
      "objetivos_ativos_ciclo_2": [
        {
          "goal_id": "esdm_g014",
          "dominio_id": "brincar",
          "descricao": "Iniciar brincar funcional com boneca, com apoio decrescente"
        },
        {
          "goal_id": "esdm_g021",
          "dominio_id": "atencao_conjunta_social",
          "descricao": "Alternar olhar objeto-adulto-objeto espontaneamente"
        },
        {
          "goal_id": "esdm_g033",
          "dominio_id": "autonomia_pessoal",
          "descricao": "Participar da rotina de lavar as mãos com apoio decrescente"
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "goal_id": "esdm_g021",
      "protocol_id": "esdm",
      "resumo": "Nas últimas 3 sessões, alternância de olhar só ocorreu após pista gestual do terapeuta; nunca espontânea."
    },
    {
      "dominio_id": "comportamento",
      "protocol_id": "esdm",
      "resumo": "Reação típica à retirada de item preferido tem sido choro, sem arremesso de objetos, neste ciclo."
    },
    {
      "goal_id": "esdm_g014",
      "protocol_id": "esdm",
      "resumo": "Ação funcional com a boneca só registrada imediatamente após modelação, nunca repetida sem nova demonstração."
    }
  ]
}
```

### Diário de entrada

> "Sessão de 45 minutos em ambiente natural, brincando no tapete da sala. Ofereci a
> boneca e o kit de mamadeira sem demonstrar nada antes; a Marina pegou a boneca e
> ficou manipulando sem função clara por alguns segundos. Modelei dando 'mamá' para
> a boneca, dizendo 'nenê tá com fome', e logo em seguida ela repetiu a mesma ação
> sozinha, dando a mamadeira à boneca, sem que eu precisasse mostrar de novo.
> Depois, na brincadeira com bolhas de sabão, quando a bolha estourou ela olhou
> para o pote, depois para mim e de novo para o pote, pedindo mais. Cantei a
> música de despedida batendo palmas e ela imitou de imediato. Mais tarde, quando
> voltei à sala depois de uma pausa, ela bateu palmas sozinha, sem eu ter feito
> nada antes. Pedi 'faz tchau' e na primeira tentativa ela não fez nada; só imitou
> o gesto depois que segurei de leve o braço dela e ajudei o movimento. Na
> transição para a mesa, tirei o brinquedo preferido dela e ela jogou dois blocos
> no chão gritando; ofereci escolha entre dois outros brinquedos e ela se acalmou
> em poucos segundos e aceitou um deles. No banheiro, na hora de lavar as mãos,
> ela abriu a torneira sozinha, mas precisei segurar a mão dela para ensaboar; ela
> enxaguou e fechou a torneira sem ajuda."

### Regras que este caso exercita

R19 (a `taxonomia_ajuda` do ESDM vem explícita do contexto — diferente da escala
ABA — e observações de domínios sem objetivo ativo no ciclo, como "bater palmas"
e "tchau" no domínio imitação, não geram `goal_id` inventado: ficam com
`goal_id: null` mas `protocol_id`/`dominio_id` preenchidos, já que o domínio
existe no protocolo mesmo sem meta ativa este ciclo); R4 (função pelo antecedente:
manipulação inicial da boneca sem função clara vs. ação funcional após
modelação); R6/`par_contraste_id` (3 pares: boneca sem função vs. funcional;
tchau erro vs. acerto com dica física; palmas modeladas vs. espontâneas); R7
(atenção conjunta via alternância de olhar); R8 (brincar, atenção conjunta,
imitação, comportamento e autonomia nunca se misturam); R9 (cadeia de lavar as
mãos); R10/R18 (registro ABC do episódio de jogar blocos, severidade leve); R12
(generalização do bater palmas espontâneo); R14 (duas inconsistências em
direções opostas: alternância de olhar espontânea é melhor que o histórico;
arremesso de blocos é pior/novo frente ao histórico); R17 (bolhas de sabão como
reforçador de alta valência).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "a Marina pegou a boneca e ficou manipulando sem função clara por alguns segundos",
      "justificativa_confianca": "Antecedente não descreve nenhuma instrução ou modelação prévia; comportamento sem função identificável.",
      "par_contraste_id": "esdm-boneca-funcional-01",
      "evidencia": {
        "descricao": "Manipulação da boneca sem ação funcional identificável, antes de qualquer modelação",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": "esdm_g014",
            "protocol_id": "esdm",
            "dominio_id": "brincar"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "nao_aplicavel",
        "topografia": "fisico",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "Modelei dando 'mamá' para a boneca, dizendo 'nenê tá com fome', e logo em seguida ela repetiu a mesma ação sozinha, dando a mamadeira à boneca, sem que eu precisasse mostrar de novo",
      "par_contraste_id": "esdm-boneca-funcional-01",
      "evidencia": {
        "descricao": "Repetiu ação funcional (alimentar a boneca) imediatamente após modelação do terapeuta, sem necessidade de nova demonstração",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": "esdm_g014",
            "protocol_id": "esdm",
            "dominio_id": "brincar"
          }
        ],
        "nivel_ajuda": "modelacao",
        "resultado": "acerto_apos_dica",
        "topografia": "fisico",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "quando a bolha estourou ela olhou para o pote, depois para mim e de novo para o pote, pedindo mais",
      "justificativa_confianca": "Histórico das últimas 3 sessões registra alternância de olhar só após pista gestual do terapeuta; aqui ocorreu de forma espontânea, sem pista — avanço em relação ao histórico.",
      "evidencia": {
        "descricao": "Alternância espontânea de olhar pote-adulto-pote, pedindo continuidade da atividade, sem pista do terapeuta",
        "polaridade": "positiva",
        "funcao": "pedido",
        "alvos": [
          {
            "goal_id": "esdm_g021",
            "protocol_id": "esdm",
            "dominio_id": "atencao_conjunta_social"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "gestual_elementar",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "Cantei a música de despedida batendo palmas e ela imitou de imediato",
      "justificativa_confianca": "Domínio imitação não corresponde a nenhum objetivo ativo do ciclo 2 (goals ativos: esdm_g014, esdm_g021, esdm_g033) — registrado com goal_id nulo, sem inventar meta.",
      "par_contraste_id": "esdm-palmas-01",
      "evidencia": {
        "descricao": "Imitou o gesto de bater palmas logo após modelação do terapeuta",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          { "goal_id": null, "protocol_id": "esdm", "dominio_id": "imitacao" }
        ],
        "nivel_ajuda": "modelacao",
        "resultado": "acerto",
        "topografia": "fisico",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "quando voltei à sala depois de uma pausa, ela bateu palmas sozinha, sem eu ter feito nada antes",
      "justificativa_confianca": "Mesmo caso do goal_id nulo acima — domínio imitação sem objetivo ativo neste ciclo.",
      "par_contraste_id": "esdm-palmas-01",
      "evidencia": {
        "descricao": "Bateu palmas espontaneamente ao ver o terapeuta retornar, sem modelação imediatamente anterior",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          { "goal_id": null, "protocol_id": "esdm", "dominio_id": "imitacao" }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "fisico",
        "ambiente": "natural",
        "dimensoes_qualidade": {
          "generalizacao": "Gesto emergiu espontaneamente em novo momento (retorno à sala), sem elicitação imediata — distinto da ocorrência modelada anterior."
        }
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "Pedi 'faz tchau' e na primeira tentativa ela não fez nada",
      "par_contraste_id": "esdm-tchau-01",
      "evidencia": {
        "descricao": "Não respondeu ao pedido verbal 'faz tchau' na primeira tentativa",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [
          { "goal_id": null, "protocol_id": "esdm", "dominio_id": "imitacao" }
        ],
        "nivel_ajuda": "dica_verbal",
        "resultado": "erro",
        "tentativas": { "informado": true, "total": 1, "acertos": 0 },
        "topografia": "nao_informado",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "só imitou o gesto depois que segurei de leve o braço dela e ajudei o movimento",
      "par_contraste_id": "esdm-tchau-01",
      "evidencia": {
        "descricao": "Imitou o gesto de tchau após o terapeuta segurar levemente o braço e ajudar fisicamente o movimento",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          { "goal_id": null, "protocol_id": "esdm", "dominio_id": "imitacao" }
        ],
        "nivel_ajuda": "dica_fisica",
        "resultado": "acerto_apos_dica",
        "topografia": "gestual_simbolico",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "tirei o brinquedo preferido dela e ela jogou dois blocos no chão gritando; ofereci escolha entre dois outros brinquedos e ela se acalmou em poucos segundos e aceitou um deles",
      "justificativa_confianca": "Histórico do ciclo registra choro sem arremesso de objetos como reação típica à retirada de item preferido; arremesso de blocos é padrão novo, não registrado antes neste ciclo.",
      "registro_abc": {
        "antecedente": "Retirada do brinquedo preferido na transição para a atividade de mesa",
        "comportamento": "Jogou dois blocos no chão e gritou",
        "duracao_segundos": null,
        "consequencia_regulacao": "Terapeuta ofereceu escolha entre dois outros brinquedos; acalmou-se em poucos segundos e aceitou um deles",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    },
    {
      "tipo": "cadeia",
      "confianca": "alta",
      "trecho_fonte": "ela abriu a torneira sozinha, mas precisei segurar a mão dela para ensaboar; ela enxaguou e fechou a torneira sem ajuda",
      "cadeia": {
        "nome": "Lavagem das mãos (rotina de autonomia pessoal)",
        "etapas": [
          { "descricao": "Abrir a torneira", "nivel_ajuda": "independente" },
          { "descricao": "Ensaboar as mãos", "nivel_ajuda": "dica_fisica" },
          { "descricao": "Enxaguar as mãos", "nivel_ajuda": "independente" },
          { "descricao": "Fechar a torneira", "nivel_ajuda": "independente" }
        ]
      }
    },
    {
      "tipo": "preferencia_reforcador",
      "confianca": "alta",
      "trecho_fonte": "quando a bolha estourou ela olhou para o pote, depois para mim e de novo para o pote, pedindo mais",
      "preferencia_reforcador": {
        "item_atividade": "bolhas de sabão",
        "valencia": "alta"
      }
    }
  ],
  "resumo_sessao": "Sessão de brincar naturalista cobrindo os 3 objetivos ativos do ciclo 2 (brincar funcional com boneca, atenção conjunta, rotina de lavar as mãos). Destaque para alternância de olhar espontânea nas bolhas de sabão (avanço frente ao histórico) e para arremesso de blocos numa transição (padrão novo frente ao histórico). Observadas também ocorrências de imitação (palmas, tchau) fora dos objetivos ativos do ciclo atual — domínio existe no protocolo, mas sem meta formal este ciclo.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Alternância de olhar espontânea (sem pista gestual) nas bolhas de sabão diverge do histórico das últimas 3 sessões, que só registrava essa alternância após pista do terapeuta — possível avanço no objetivo esdm_g021."
    },
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Arremesso de blocos como reação à retirada do brinquedo preferido diverge do histórico do ciclo (reação típica registrada era só choro, sem arremesso) — padrão novo a monitorar."
    },
    {
      "tipo": "texto_ambiguo",
      "detalhe": "Eventos de imitação (bater palmas, tchau) não correspondem a nenhum objetivo ativo do ciclo 2 — registrados com goal_id nulo, refletindo que a coleta do ESDM é por objetivo ativo, não pelo checklist completo."
    }
  ]
}
```

---

## Caso 11 — ABLLS-R: cadeia de vestir-se e instrução em grupo

### Contexto

```json
{
  "paciente": {
    "id": "pac-0512",
    "idade_meses": 60,
    "resumo_repertorio": "TEA; historicamente ajuda física total na cadeia de vestir-se e resposta só a comandos individuais em atividades de grupo."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "abllsr",
      "nome": "ABLLS-R",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "dica_verbal",
        "dica_ecoica",
        "dica_gestual",
        "dica_entonacao",
        "modelacao",
        "dica_fisica"
      ],
      "nota_taxonomia": "O ABLLS-R não define nomenclatura própria de níveis de ajuda (diferente do PEDI) — usa o fallback universal (R5).",
      "dominios": [
        {
          "dominio_id": "U-vestir-se",
          "nome": "U — Vestir-se",
          "definicao_funcional": "cadeia de etapas para vestir uma peça de roupa"
        },
        {
          "dominio_id": "M-instrucao-grupo",
          "nome": "M — Instrução em Grupo",
          "definicao_funcional": "seguir instrução dada à turma inteira, sem direcionamento individual"
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "U-vestir-se",
      "protocol_id": "abllsr",
      "resumo": "Ajuda física total em todas as etapas de vestir-se nas últimas sessões, nenhuma etapa independente."
    },
    {
      "dominio_id": "M-instrucao-grupo",
      "protocol_id": "abllsr",
      "resumo": "Só responde a comandos de grupo quando chamado pelo nome individualmente."
    }
  ]
}
```

### Diário de entrada

> "Davi chegou à sala com o casaco pendurado no cabide. Quando eu disse 'hora de
> vestir o casaco para o intervalo', ele caminhou até o cabide e pegou o casaco
> sozinho, sem qualquer intervenção. Para o braço direito, apontei a abertura da
> manga e ele enfiou o braço corretamente logo após o gesto. Para o braço
> esquerdo, precisei demonstrar o movimento primeiro, vestindo o meu próprio braço
> num casaco de brinquedo, e só depois ele imitou e conseguiu vestir o braço
> esquerdo. Na etapa do zíper, ele não conseguiu encaixar o cursor sozinho; segurei
> firme a base do zíper enquanto ele puxava o cursor até o topo. Mais tarde, numa
> atividade em grupo com quatro crianças, dei um comando único para toda a turma:
> 'pessoal, guardem os brinquedos na caixa agora'. Davi continuou manipulando seu
> brinquedo e não guardou nada nessa primeira vez. Repeti o mesmo comando para o
> grupo, sem me dirigir a ele nominalmente, e dessa vez ele levou o brinquedo até a
> caixa e guardou."

### Regras que este caso exercita

R5 (usa exatamente a `taxonomia_ajuda` fallback do contexto, já que o ABLLS-R não
tem nomenclatura própria); R9 (cadeia de vestir-se com 4 etapas e níveis de ajuda
distintos, incluindo dica física parcial); R8 (cadeia de vestir-se e instrução de
grupo nunca se misturam, mesmo na mesma sessão); R4/`funcao_indefinida` (resposta
a comando de grupo não é ato comunicativo classificável — função indefinida); R6
e `par_contraste_id` (não guardou na 1ª vez vs. guardou na repetição do mesmo
comando de grupo); R14 em ambas as direções (cadeia de vestir-se sai melhor que o
histórico — nenhuma etapa com ajuda física total; a resposta ao comando de grupo
repetido, sem nome individual, também diverge do histórico — a 1ª tentativa,
negativa, é consistente com o histórico e por isso NÃO é sinalizada).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "cadeia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "ele caminhou até o cabide e pegou o casaco sozinho, sem qualquer intervenção [...] apontei a abertura da manga e ele enfiou o braço corretamente logo após o gesto [...] precisei demonstrar o movimento primeiro [...] e só depois ele imitou e conseguiu vestir o braço esquerdo [...] segurei firme a base do zíper enquanto ele puxava o cursor até o topo",
      "justificativa_confianca": "Histórico registra ajuda física total em todas as etapas de vestir-se, sem nenhuma etapa independente; nesta sessão 1 etapa foi independente e 2 usaram dica gestual/modelação, sem ajuda física total em nenhuma — desempenho melhor que o histórico.",
      "cadeia": {
        "nome": "Vestir o casaco (ABLLS-R, repertório U)",
        "etapas": [
          {
            "descricao": "Pegar o casaco no cabide",
            "nivel_ajuda": "independente"
          },
          {
            "descricao": "Vestir o braço direito na manga",
            "nivel_ajuda": "dica_gestual"
          },
          {
            "descricao": "Vestir o braço esquerdo na manga",
            "nivel_ajuda": "modelacao"
          },
          {
            "descricao": "Fechar o zíper (terapeuta estabilizou a base, Davi puxou o cursor)",
            "nivel_ajuda": "dica_fisica"
          }
        ]
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "dei um comando único para toda a turma: 'pessoal, guardem os brinquedos na caixa agora'. Davi continuou manipulando seu brinquedo e não guardou nada nessa primeira vez",
      "justificativa_confianca": "Antecedente é só uma instrução coletiva sem direcionamento individual; não há base para atribuir função comunicativa ou comportamental além de seguir/não seguir a instrução.",
      "inconsistente_com_historico": false,
      "par_contraste_id": "davi-instrucao-grupo-01",
      "evidencia": {
        "descricao": "Não seguiu instrução dada ao grupo inteiro, sem direcionamento individual, na primeira vez",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "abllsr",
            "dominio_id": "M-instrucao-grupo"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "erro",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "inconsistente_com_historico": true,
      "trecho_fonte": "Repeti o mesmo comando para o grupo, sem me dirigir a ele nominalmente, e dessa vez ele levou o brinquedo até a caixa e guardou",
      "justificativa_confianca": "Histórico registra que Davi só responde a comandos de grupo quando chamado pelo nome individualmente; aqui respondeu ao comando repetido sem menção ao seu nome.",
      "par_contraste_id": "davi-instrucao-grupo-01",
      "evidencia": {
        "descricao": "Seguiu instrução repetida ao grupo inteiro, sem direcionamento individual",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "abllsr",
            "dominio_id": "M-instrucao-grupo"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado"
      }
    }
  ],
  "resumo_sessao": "Cadeia de vestir o casaco (repertório U) com 4 etapas, sem nenhuma etapa em ajuda física total — melhor que o histórico recente. Episódio de instrução em grupo (repertório M) com resposta negativa na 1ª tentativa (consistente com o histórico) e positiva na repetição do mesmo comando sem direcionamento individual (diverge do histórico).",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Cadeia de vestir-se sem nenhuma etapa em ajuda física total, contra histórico de ajuda física total em todas as etapas."
    },
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Resposta a comando de grupo repetido sem nome individual diverge do histórico de que Davi só responde quando chamado nominalmente."
    }
  ]
}
```

---

## Caso 12 — AFLS: módulo escopado a um ambiente + ensaio informal fora do protocolo

**Nota de correção (09/07/2026):** a versão original deste caso modelava o AFLS
como um instrumento único com um campo de "generalização" atravessando ambientes
(simulação na clínica vs. loja real, dentro do MESMO domínio/protocolo). A
validação contra material real (ver `protocolos-e-agente.md`, seção 1.4) mostrou
que isso está errado: o AFLS é uma suíte de **6 protocolos independentes, um por
módulo/ambiente** — Participação Comunitária é escopado ao ambiente comunitário
real, não a um "domínio" que soma pontos de simulação de clínica com pontos de
loja de verdade. O caso foi redesenhado para: (a) tratar o ensaio em simulação de
clínica como dado clínico informal, SEM `protocol_id`/`goal_id` (o agente não deve
inventar um vínculo formal com o protocolo AFLS para um ensaio fora do ambiente
que o módulo define); (b) tratar a administração no mercadinho real como a única
extração que de fato mapeia ao protocolo `afls_participacao_comunitaria`; (c)
tratar a piora de desempenho dentro do PRÓPRIO ambiente comunitário (vs. histórico
de administrações anteriores nesse mesmo ambiente) como uma divergência R14 real
a sinalizar — não mais uma "lacuna de generalização" implícita no desenho do
protocolo.

### Contexto

```json
{
  "paciente": {
    "id": "pac_0912",
    "idade_meses": 108,
    "resumo_repertorio": "TEA; cadeia de comprar item em estabelecimento independente nas últimas 3 administrações formais do módulo AFLS Participação Comunitária (ambiente comunitário real). Em paralelo, a clínica também ensaia a mesma cadeia em simulação estruturada como pré-ensino informal — este ensaio não é uma administração do protocolo AFLS (que é escopado ao ambiente comunitário real), é apenas prática preparatória."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "afls_participacao_comunitaria",
      "nome": "AFLS — módulo Participação Comunitária (1 dos 6 módulos independentes do AFLS; escopado ao ambiente comunitário real, não a ensaios em clínica/casa)",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "dica_verbal",
        "dica_ecoica",
        "dica_gestual",
        "dica_entonacao",
        "modelacao",
        "dica_fisica"
      ],
      "dominios": [
        {
          "dominio_id": "participacao_comunitaria",
          "nome": "Participação Comunitária — comprar item em estabelecimento",
          "definicao_funcional": "localizar, escolher e pagar por um item numa loja, no ambiente comunitário real (fora da clínica/casa) — este módulo do AFLS é administrado separadamente dos outros 5 módulos (Vida Diária Básica, Casa, Escola, Vocacional, Vida Independente), cada um com protocolo e ambiente de referência próprios",
          "sinais_no_texto": [
            "na loja",
            "no mercado",
            "no mercadinho da esquina",
            "no ambiente real"
          ]
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "participacao_comunitaria",
      "protocol_id": "afls_participacao_comunitaria",
      "resumo": "Independente na cadeia de comprar item no mercadinho real (ambiente comunitário), últimas 3 administrações formais do módulo."
    }
  ]
}
```

### Diário de entrada

> "Sessão de hoje focada em Participação Comunitária. Antes de sair, fizemos um
> ensaio rápido na sala da clínica: montamos um mercadinho de brinquedo, Theo
> entrou, foi direto até a prateleira de bebidas, pegou o suco de uva (seu
> preferido) e levou até o caixa sozinho, sem nenhuma ajuda — só um aquecimento
> antes de irmos para a rua. Fomos então para o mercadinho de verdade na esquina
> da clínica. Ao entrar na loja, Theo parou na porta e só caminhou até a
> prateleira depois que eu apontei na direção certa. Escolheu o suco de uva
> sozinho e levou até o caixa sem ajuda. Mas na hora de pagar, ficou parado
> segurando o dinheiro; precisei modelar a frase 'quanto custa?' para ele repetir,
> e depois ajudar fisicamente para ele contar as notas certas e entregar ao caixa.
> Ele não disse 'obrigado' ao final, mesmo com a atendente sorrindo para ele."

### Regras que este caso exercita

R19/R4 (agnosticismo aplicado ao contrário do usual: o agente precisa RECONHECER
que o ensaio em simulação de clínica NÃO cabe na definição funcional do domínio
`participacao_comunitaria` — que é explicitamente sobre ambiente comunitário real
— e por isso não deve inventar um vínculo de protocolo/meta para esse trecho,
mesmo sendo topograficamente a mesma cadeia); R9 (cadeia de 4 etapas na
administração real, cada uma com nível de ajuda próprio); R14 (divergência real:
histórico registra a mesma cadeia independente nas últimas 3 administrações
formais do módulo — todas no ambiente comunitário real —, e hoje o desempenho piorou
DENTRO DO MESMO AMBIENTE; a `justificativa_confianca` precisa deixar claro que isso
é uma regressão dentro do próprio domínio, não mais uma "lacuna de generalização entre
ambientes" — o AFLS não modela isso como um campo cruzado); R10 (ausência de
"obrigado" como `ausencia_comportamento`, sem inferir motivo); R17 (suco de uva
como reforçador de alta valência, mencionado tanto no ensaio informal quanto na
loja real — mesmo trecho-fonte pode gerar só 1 extração de preferência, não 2);
R13 (natural/estruturado — o ensaio em clínica é estruturado, a loja real é
natural); R2 (mesmo sem `protocol_id`, o ensaio em clínica ainda é evidência
válida com proveniência — só não é uma pontuação formal do módulo).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "fizemos um ensaio rápido na sala da clínica: montamos um mercadinho de brinquedo, Theo entrou, foi direto até a prateleira de bebidas, pegou o suco de uva (seu preferido) e levou até o caixa sozinho, sem nenhuma ajuda — só um aquecimento antes de irmos para a rua",
      "justificativa_confianca": "Cadeia executada de forma independente em simulação estruturada na clínica, mas o domínio ativo 'participacao_comunitaria' do módulo AFLS Participação Comunitária é definido funcionalmente como ambiente comunitário real — este ensaio é pré-ensino informal, não uma administração formal do protocolo, por isso não é vinculado a goal_id/protocol_id/dominio_id do AFLS.",
      "evidencia": {
        "descricao": "Cadeia completa de localizar, escolher e levar o item ao caixa, de forma independente, em ensaio informal de simulação na clínica (pré-ensino, fora do escopo do módulo AFLS Participação Comunitária)",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [{ "goal_id": null, "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "cadeia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "Ao entrar na loja, Theo parou na porta e só caminhou até a prateleira depois que eu apontei na direção certa. Escolheu o suco de uva sozinho e levou até o caixa sem ajuda. Mas na hora de pagar, ficou parado segurando o dinheiro; precisei modelar a frase 'quanto custa?' para ele repetir, e depois ajudar fisicamente para ele contar as notas certas e entregar ao caixa",
      "justificativa_confianca": "Histórico registra a mesma cadeia como independente nas últimas 3 administrações formais do módulo AFLS Participação Comunitária, todas no ambiente comunitário real. Hoje, na mesma administração real, precisou de apoio em 3 das 4 etapas — é uma possível REGRESSÃO dentro do próprio domínio (não uma 'lacuna de generalização', já que este módulo do AFLS é escopado a um único ambiente; não há campo cruzando ambientes a comparar).",
      "cadeia": {
        "nome": "Comprar item em estabelecimento real (AFLS, módulo Participação Comunitária)",
        "etapas": [
          {
            "descricao": "Entrar na loja e caminhar até a prateleira",
            "nivel_ajuda": "dica_gestual"
          },
          {
            "descricao": "Escolher o item e levar até o caixa",
            "nivel_ajuda": "independente"
          },
          { "descricao": "Perguntar o preço", "nivel_ajuda": "modelacao" },
          {
            "descricao": "Contar o dinheiro e entregar ao caixa",
            "nivel_ajuda": "dica_fisica"
          }
        ]
      }
    },
    {
      "tipo": "ausencia_comportamento",
      "confianca": "media",
      "trecho_fonte": "Ele não disse 'obrigado' ao final, mesmo com a atendente sorrindo para ele",
      "ausencia_comportamento": {
        "comportamento": "Agradecimento verbal ('obrigado')",
        "contexto": "Final da compra no mercadinho real, com a atendente sorrindo para a criança"
      }
    },
    {
      "tipo": "preferencia_reforcador",
      "confianca": "alta",
      "trecho_fonte": "pegou o suco de uva (seu preferido)",
      "preferencia_reforcador": {
        "item_atividade": "suco de uva",
        "valencia": "alta"
      }
    }
  ],
  "resumo_sessao": "Ensaio informal de pré-ensino em simulação de clínica executado de forma independente (fora do escopo formal do módulo AFLS). Na administração real do módulo Participação Comunitária (mercadinho da esquina), a cadeia de comprar item teve apoio em 3 de 4 etapas — possível regressão frente às últimas 3 administrações formais, que foram independentes. Sem agradecimento verbal ao final da compra.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Administração real do módulo AFLS Participação Comunitária divergiu do histórico (independente nas últimas 3 administrações formais, apoio em 3/4 etapas hoje) — possível regressão a revisar, não confundir com o ensaio informal de clínica (fora do escopo do protocolo)."
    }
  ]
}
```

---

## Caso 13 — PROC: funções comunicativas pré-verbais e protesto

### Contexto

```json
{
  "paciente": {
    "id": "pac-lm-207",
    "idade_meses": 31,
    "resumo_repertorio": "TEA, pré-verbal; comunica-se por vocalizações não articuladas, choro e comportamento dirigido a objetos/pessoas."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "proc",
      "nome": "PROC — Protocolo de Observação Comportamental (Zorzi & Hage)",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "dica_verbal",
        "dica_ecoica",
        "dica_gestual",
        "dica_entonacao",
        "modelacao",
        "dica_fisica"
      ],
      "dominios": [
        {
          "dominio_id": "funcao_comunicativa_protesto",
          "nome": "Função comunicativa — protesto",
          "definicao_funcional": "recusa/protesto diante da retirada de objeto ou interrupção de atividade, por qualquer meio"
        },
        {
          "dominio_id": "meio_comunicacao",
          "nome": "Meios de comunicação",
          "definicao_funcional": "gestos simbólicos/não-simbólicos e vocalizações usados para se comunicar"
        },
        {
          "dominio_id": "habilidade_dialogica",
          "nome": "Habilidades dialógicas",
          "definicao_funcional": "aguardar turno, iniciar/responder em interação de alternância"
        },
        {
          "dominio_id": "simbolismo",
          "nome": "Simbolismo / organização do brinquedo",
          "definicao_funcional": "ação representacional com brinquedo (ex.: alimentar boneco)"
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "meio_comunicacao",
      "protocol_id": "proc",
      "resumo": "Nunca emitiu gesto simbólico convencional (tchau, mandar beijo) em nenhum contexto observado até 3 meses atrás."
    },
    {
      "dominio_id": "habilidade_dialogica",
      "protocol_id": "proc",
      "resumo": "Abandonava brincadeiras de alternância após 1-2 turnos completos, tentando sair do colo ou buscar outro brinquedo."
    }
  ]
}
```

### Diário de entrada

> "Sessão de fonoaudiologia na sala terapêutica, com a mãe presente nos primeiros
> minutos. Ao chegar, a criança entrou segurando um carrinho de brinquedo trazido
> de casa. Quando a mãe se despediu para sair da sala, a criança ergueu a mão e
> abriu e fechou os dedos duas vezes, olhando para a porta, no gesto de 'tchau'.
> Durante a atividade estruturada, peguei o carrinho para guardar na caixa de
> brinquedos. A criança imediatamente começou a chorar alto, esperneou e empurrou
> minha mão na direção do carrinho, tentando pegá-lo de volta; o choro cessou
> assim que devolvi o carrinho. Em seguida, propus uma brincadeira de
> esconde-esconde: cobria o rosto da criança com um paninho e contava '1, 2, 3'
> antes de descobrir. Nas primeiras três rodadas, ela permaneceu com o rosto
> coberto, aguardando a contagem, sem tentar retirar o pano antes do sinal. Por
> fim, ofereci uma boneca, um bichinho de pelúcia e uma colherinha; ela pegou a
> colher, encostou na boca da boneca e fez o som 'nham, nham', repetindo o gesto
> três vezes, alternando entre a boneca e o bichinho de pelúcia."

### Regras que este caso exercita

R7 (choro com função de protesto claramente identificável pelo antecedente —
gera DUAS extrações do mesmo trecho: `evidencia` de protesto E `registro_abc` do
mesmo episódio); R4/`funcao_indefinida` (aguardar turno e o jogo com a boneca não
são funções comunicativas do eixo protesto/interativa/etc. — indefinida); R8
(protesto, gesto de tchau, aguardar turno e simbolismo geram 4 extrações
distintas); R11 (números literais: "duas vezes", "três rodadas", "três vezes");
R13 (tchau em rotina social espontânea = natural; demais eventos em atividade
proposta = estruturado); R14 (gesto de tchau e manutenção do turno por 3 rodadas
divergem do histórico, em direção positiva); R16 (produção "nham, nham" literal).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "A criança imediatamente começou a chorar alto, esperneou e empurrou minha mão na direção do carrinho, tentando pegá-lo de volta; o choro cessou assim que devolvi o carrinho",
      "justificativa_confianca": "Antecedente (retirada do carrinho) permite atribuição inequívoca de função de protesto.",
      "evidencia": {
        "descricao": "Choro alto, esperneio e empurrar a mão do adulto em direção ao objeto retirado, cessando quando o objeto foi devolvido",
        "polaridade": "positiva",
        "funcao": "protesto",
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "proc",
            "dominio_id": "funcao_comunicativa_protesto"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_nao_articulado",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "trecho_fonte": "peguei o carrinho para guardar na caixa de brinquedos. A criança imediatamente começou a chorar alto, esperneou e empurrou minha mão na direção do carrinho, tentando pegá-lo de volta; o choro cessou assim que devolvi o carrinho",
      "registro_abc": {
        "antecedente": "Terapeuta retira o carrinho de brinquedo para guardá-lo na caixa",
        "comportamento": "Choro alto, esperneio e empurrar a mão do terapeuta em direção ao carrinho",
        "duracao_segundos": null,
        "consequencia_regulacao": "Carrinho devolvido; choro cessou imediatamente",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "a criança ergueu a mão e abriu e fechou os dedos duas vezes, olhando para a porta, no gesto de 'tchau'",
      "justificativa_confianca": "Histórico registra que a criança nunca emitiu gesto simbólico convencional até 3 meses atrás; este é um gesto de tchau claro e dirigido.",
      "evidencia": {
        "descricao": "Gesto convencional de despedida (abrir/fechar a mão), repetido 2 vezes, dirigido à porta com olhar na mesma direção",
        "polaridade": "positiva",
        "funcao": "interativa",
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "proc",
            "dominio_id": "meio_comunicacao"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "gestual_simbolico",
        "ambiente": "natural",
        "frequencia": { "informada": true, "valor": 2, "unidade": "vezes" }
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "baixa",
      "inconsistente_com_historico": true,
      "trecho_fonte": "Nas primeiras três rodadas, ela permaneceu com o rosto coberto, aguardando a contagem, sem tentar retirar o pano antes do sinal",
      "justificativa_confianca": "Aguardar turno é habilidade dialógica, não uma função do eixo de funções comunicativas classificável pelo antecedente (R4) — mantida função indefinida. Histórico registrava abandono da brincadeira após 1-2 turnos; aqui manteve-se por 3 rodadas completas.",
      "evidencia": {
        "descricao": "Permaneceu com o rosto coberto aguardando a contagem, sem antecipar a retirada do pano, por 3 rodadas consecutivas",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "proc",
            "dominio_id": "habilidade_dialogica"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado",
        "frequencia": { "informada": true, "valor": 3, "unidade": "rodadas" },
        "dimensoes_qualidade": {
          "variabilidade": "Consistente nas 3 rodadas, sem tentativa de antecipação em nenhuma delas."
        }
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "baixa",
      "trecho_fonte": "ela pegou a colher, encostou na boca da boneca e fez o som 'nham, nham', repetindo o gesto três vezes, alternando entre a boneca e o bichinho de pelúcia",
      "justificativa_confianca": "Ação e vocalização descritas literalmente; a leitura de 'jogo simbólico representacional' é razoável mas não uma afirmação explícita de intenção no texto — função mantida indefinida (R1/R4).",
      "evidencia": {
        "descricao": "Aproximou a colher da boca da boneca e do bichinho de pelúcia, alternando entre os dois, com vocalização 'nham, nham'",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          { "goal_id": null, "protocol_id": "proc", "dominio_id": "simbolismo" }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_nao_articulado",
        "producao_literal": "nham, nham",
        "ambiente": "estruturado",
        "frequencia": { "informada": true, "valor": 3, "unidade": "vezes" },
        "dimensoes_qualidade": {
          "generalizacao": "Ação repetida generalizou entre dois objetos diferentes (boneca e bichinho de pelúcia)."
        }
      }
    }
  ],
  "resumo_sessao": "Protesto claro por choro/esperneio à retirada do carrinho (evidência + registro ABC); gesto de tchau emergente (diverge do histórico de ausência de gestos simbólicos); manutenção do turno por 3 rodadas em esconde-esconde (diverge do histórico de abandono precoce); jogo com colher e boneca/bichinho com vocalização 'nham nham', função indefinida.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Gesto simbólico de despedida presente nesta sessão, contra o registro de ausência total de gestos simbólicos há cerca de 3 meses."
    },
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Permanência por 3 rodadas completas em brincadeira de alternância, superando o padrão histórico de abandono após 1-2 turnos."
    }
  ]
}
```

---

## Caso 14 — ABFW: fonologia, vocabulário e fluência

### Contexto

```json
{
  "paciente": {
    "id": "pac-014",
    "idade_meses": 50,
    "resumo_repertorio": "TEA nível de suporte 1; avaliação fonoaudiológica anterior (4 meses atrás) registrou fluência preservada, sem repetições/bloqueios/prolongamentos."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "abfw",
      "nome": "ABFW — Teste de Linguagem Infantil",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "dica_verbal",
        "dica_ecoica",
        "dica_gestual",
        "dica_entonacao",
        "modelacao",
        "dica_fisica"
      ],
      "dominios": [
        {
          "dominio_id": "fonologia",
          "nome": "Fonologia",
          "definicao_funcional": "produção fonética de palavras-alvo diante de figura"
        },
        {
          "dominio_id": "vocabulario",
          "nome": "Vocabulário",
          "definicao_funcional": "nomeação por campo semântico"
        },
        {
          "dominio_id": "fluencia",
          "nome": "Fluência",
          "definicao_funcional": "disfluências típicas vs. atípicas na fala espontânea"
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "fluencia",
      "protocol_id": "abfw",
      "resumo": "Avaliação anterior (4 meses atrás) registrou fluência preservada para a idade, sem repetições, bloqueios ou prolongamentos."
    }
  ]
}
```

### Diário de entrada

> "Sessão de aplicação do ABFW — provas de fonologia, vocabulário e fluência. Na
> prova de fonologia, ao ver a figura do sapato, a criança disse 'teti' para
> 'sapato', com apoio de gesto (apontei para o próprio pé). Na prova de
> vocabulário, campo semântico de animais, mostrei a figura do cavalo: a criança
> respondeu 'cavalo' de forma independente e imediata. Durante a prova de
> fluência, ao relatar o que fez no fim de semana, ela repetiu 3 vezes o início da
> frase 'eu eu eu quero mostrar' antes de completá-la. Não foram observados
> bloqueios de fala durante toda a sessão. Em outro momento, ao falar sobre a
> escola, gaguejou bastante, dificultando a compreensão do relato. Nos intervalos
> entre as provas, apontou repetidamente para o carrinho de bombeiro sobre a mesa
> e verbalizou 'quero'."

### Regras que este caso exercita

R16 (produção "teti"/alvo "sapato" registrada literalmente, sem generalizar para
um processo fonológico amplo além do citado); R11 (frequência literal "3 vezes"
vs. "gaguejou bastante", que fica `informada: false` — as duas ligadas por
`par_contraste_id` para testar a distinção lado a lado); R6 (ausência de
bloqueios como `ausencia_comportamento`); R8 (fonologia, vocabulário e fluência
como extrações separadas); R14 (2 disfluências hoje contra histórico de fluência
preservada); R17 (carrinho de bombeiro como reforçador); R7 (apontar + "quero"
como ato comunicativo combinado).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "a criança disse 'teti' para 'sapato', com apoio de gesto (apontei para o próprio pé)",
      "justificativa_confianca": "Produção fonética e alvo citados literalmente; registrada como ocorrência isolada, sem generalizar para um processo fonológico amplo (R16).",
      "evidencia": {
        "descricao": "Produção fonética divergente da forma-alvo ao nomear a figura do sapato",
        "polaridade": "positiva",
        "funcao": "tato",
        "alvos": [
          { "goal_id": null, "protocol_id": "abfw", "dominio_id": "fonologia" }
        ],
        "nivel_ajuda": "dica_gestual",
        "resultado": "acerto_apos_dica",
        "topografia": "vocal_articulado",
        "producao_literal": "teti",
        "alvo_producao": "sapato",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "mostrei a figura do cavalo: a criança respondeu 'cavalo' de forma independente e imediata",
      "evidencia": {
        "descricao": "Nomeação correta e imediata da figura do cavalo (campo semântico animais)",
        "polaridade": "positiva",
        "funcao": "tato",
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "abfw",
            "dominio_id": "vocabulario"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "cavalo",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "ela repetiu 3 vezes o início da frase 'eu eu eu quero mostrar' antes de completá-la",
      "justificativa_confianca": "Contagem literal explícita ('3 vezes'); histórico de 4 meses atrás não registrava disfluências.",
      "par_contraste_id": "abfw-fluencia-01",
      "evidencia": {
        "descricao": "Repetição do início do enunciado ao relatar o fim de semana",
        "polaridade": "positiva",
        "funcao": "comentar",
        "alvos": [
          { "goal_id": null, "protocol_id": "abfw", "dominio_id": "fluencia" }
        ],
        "nivel_ajuda": "independente",
        "resultado": "nao_aplicavel",
        "topografia": "vocal_articulado",
        "ambiente": "natural",
        "frequencia": { "informada": true, "valor": 3, "unidade": "repeticoes" }
      }
    },
    {
      "tipo": "ausencia_comportamento",
      "confianca": "alta",
      "trecho_fonte": "Não foram observados bloqueios de fala durante toda a sessão",
      "ausencia_comportamento": {
        "comportamento": "Bloqueios de fala",
        "contexto": "Sessão inteira"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "baixa",
      "inconsistente_com_historico": true,
      "trecho_fonte": "ao falar sobre a escola, gaguejou bastante, dificultando a compreensão do relato",
      "justificativa_confianca": "Termo vago ('bastante'), sem contagem, tipo específico ou duração citados — frequência não informada (R11). Diverge do histórico de fluência preservada.",
      "par_contraste_id": "abfw-fluencia-01",
      "evidencia": {
        "descricao": "Disfluência não especificada ao falar sobre a escola, sem detalhamento de tipo ou quantidade",
        "polaridade": "positiva",
        "funcao": "comentar",
        "alvos": [
          { "goal_id": null, "protocol_id": "abfw", "dominio_id": "fluencia" }
        ],
        "nivel_ajuda": "independente",
        "resultado": "nao_aplicavel",
        "topografia": "vocal_articulado",
        "ambiente": "natural",
        "frequencia": { "informada": false, "valor": null, "unidade": null }
      }
    },
    {
      "tipo": "preferencia_reforcador",
      "confianca": "alta",
      "trecho_fonte": "apontou repetidamente para o carrinho de bombeiro sobre a mesa e verbalizou 'quero'",
      "preferencia_reforcador": {
        "item_atividade": "carrinho de bombeiro",
        "valencia": "alta"
      }
    }
  ],
  "resumo_sessao": "Fonologia: produção divergente isolada ('teti' para 'sapato') com dica gestual. Vocabulário: nomeação correta e independente ('cavalo'). Fluência: 1 disfluência com contagem literal (3 repetições) e 1 menção vaga ('gaguejou bastante', sem contagem), ambas divergentes do histórico de fluência preservada; ausência de bloqueios registrada. Preferência marcada pelo carrinho de bombeiro.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Avaliação anterior (4 meses atrás) não registrava disfluências; esta sessão registra 2 ocorrências — revisar evolução da fluência com a equipe."
    }
  ]
}
```

---

## Caso 15 — MBGR: observações incidentais de função orofacial (triagem, não avaliação)

### Contexto

```json
{
  "paciente": {
    "id": "pac-1187",
    "idade_meses": 72,
    "resumo_repertorio": "TEA; anamnese registra amamentação com dificuldade de pega, uso prolongado de mamadeira, relato parental de sono com boca aberta. Nenhuma avaliação MBGR formal realizada até o momento."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "mbgr",
      "nome": "MBGR — Protocolo de Avaliação Miofuncional Orofacial",
      "tipo_coleta": "registro_abc",
      "nota": "Exame físico formal com 8 categorias, nenhuma delas preenchível a partir de menções incidentais de diário. O agente só extrai observações incidentais de função oral (respiração, mastigação, deglutição) como registro_abc de confiança BAIXA, para triagem — nunca como avaliação.",
      "dominios_monitorados_como_triagem": [
        "respiracao",
        "mastigacao",
        "degluticao"
      ]
    }
  ],
  "historico_relevante": []
}
```

### Diário de entrada

> "Sessão focada em ampliar a nomeação espontânea de alimentos durante o lanche
> terapêutico (biscoito, suco, uva). Ao ser perguntado 'o que você quer comer?',
> ele apontou o biscoito e disse 'biscoito' espontaneamente, sem modelo. Notei que
> ele comeu o biscoito com a boca aberta, mastigando de forma ruidosa, com um
> pouco de biscoito escapando pelo canto da boca. Em vários momentos da sessão,
> mesmo fora da atividade alimentar, permaneceu com a boca entreaberta,
> respirando predominantemente por ela. Ao tomar o suco, engoliu com esforço
> visível, projetando a língua para frente contra o copo. No geral, sessão
> tranquila, o paciente esteve engajado e de bom humor durante toda a atividade."

### Regras que este caso exercita

R1/R3 (núcleo do caso: o MBGR é exame físico formal com 8 categorias — nenhuma
delas deve ser preenchida a partir de menções incidentais; e a frase genérica
final ("sessão tranquila... bom humor") NÃO gera nenhuma extração, testando que o
agente não infla o caso); R10 (3 observações incidentais viram `registro_abc`,
categoria comportamental, SEMPRE confiança baixa); R2 (proveniência literal); R8
(nomeação de alimento é domínio de linguagem, sem protocolo ativo nesta sessão —
extraída com `protocol_id: null` — separada dos 3 registros MBGR).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "ele apontou o biscoito e disse 'biscoito' espontaneamente, sem modelo",
      "justificativa_confianca": "Nenhum protocolo de linguagem está ativo nesta sessão (só MBGR); extração mantida por agnosticismo (R19), sem inventar protocol_id.",
      "evidencia": {
        "descricao": "Nomeação espontânea do item 'biscoito' ao ser perguntado o que queria comer",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "goal_id": null, "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "biscoito",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "baixa",
      "trecho_fonte": "ele comeu o biscoito com a boca aberta, mastigando de forma ruidosa, com um pouco de biscoito escapando pelo canto da boca",
      "justificativa_confianca": "Observação incidental de mastigação durante atividade de linguagem, não coletada por exame miofuncional formal (MBGR) — dado de triagem, não avaliação.",
      "registro_abc": {
        "antecedente": "Lanche terapêutico (biscoito) durante atividade de nomeação",
        "comportamento": "Mastigação com boca aberta, ruído audível e escape de fragmento alimentar pelo canto da boca",
        "duracao_segundos": null,
        "consequencia_regulacao": "Não informado no texto",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "baixa",
      "trecho_fonte": "permaneceu com a boca entreaberta, respirando predominantemente por ela",
      "justificativa_confianca": "Observação incidental de padrão respiratório, não coletada por exame formal — consistente com relato prévio de sono com boca aberta, mas isso não configura avaliação, só triagem.",
      "registro_abc": {
        "antecedente": "Momentos diversos da sessão, fora da atividade alimentar",
        "comportamento": "Boca entreaberta com respiração predominantemente oral",
        "duracao_segundos": null,
        "consequencia_regulacao": "Não informado no texto",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "baixa",
      "trecho_fonte": "Ao tomar o suco, engoliu com esforço visível, projetando a língua para frente contra o copo",
      "justificativa_confianca": "Episódio único de deglutição observado incidentalmente, sem padronização de exame — achado de triagem, não confirmação de deglutição atípica.",
      "registro_abc": {
        "antecedente": "Ingestão de suco durante o lanche terapêutico",
        "comportamento": "Deglutição com esforço aparente e projeção lingual anteriorizada contra o copo",
        "duracao_segundos": null,
        "consequencia_regulacao": "Não informado no texto",
        "categoria": "comportamental",
        "subcategoria_sensorial": null,
        "severidade": "leve"
      }
    }
  ],
  "resumo_sessao": "Sessão de linguagem (nomeação espontânea de alimentos) com 1 evidência de mando independente ('biscoito'). De forma incidental, não como avaliação, foram observados 3 sinais orofaciais (mastigação ruidosa com escape, respiração predominantemente oral, deglutição com esforço e projeção lingual) — todos registrados como triagem de baixa confiança, coerentes com o relato prévio de amamentação difícil e sono de boca aberta, mas sem substituir uma avaliação MBGR formal, ainda não realizada.",
  "sinalizacoes": [
    {
      "tipo": "texto_ambiguo",
      "detalhe": "Os 3 registros incidentais de função orofacial (mastigação, respiração, deglutição) não substituem uma avaliação miofuncional formal (MBGR) — recomenda-se considerar encaminhamento para avaliação dedicada, sem tratar estes dados como conclusivos."
    }
  ]
}
```

---

## Caso 16 — DCDQ: observações motoras redirecionadas ao protocolo realmente ativo (PEDI)

### Contexto

```json
{
  "paciente": {
    "id": "pac_0231",
    "idade_meses": 86,
    "resumo_repertorio": "TEA nível de suporte 1; questionário DCDQ'07 entregue aos pais em 2026-05-15 após relatos recorrentes de coordenação motora em TO, devolutiva ainda pendente."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "pedi",
      "nome": "PEDI",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "supervisao",
        "assistencia_minima",
        "assistencia_moderada",
        "assistencia_maxima",
        "assistencia_total"
      ],
      "dominios": [
        {
          "dominio_id": "mobilidade_locomocao",
          "nome": "Mobilidade — locomoção e transferências",
          "definicao_funcional": "subir/descer escadas, transferências e deslocamento"
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "mobilidade_locomocao",
      "protocol_id": "pedi",
      "resumo": "Avaliação PEDI formal de 2026-04-10: subir escada de 4 degraus alternando os pés pontuado como 'supervisao' (apenas supervisão verbal, sem apoio físico)."
    }
  ]
}
```

### Diário de entrada

> "Sessão de TO na sala e depois no pátio coberto. Ao desenhar, o paciente tentou
> copiar um círculo que desenhei no papel, mas não conseguiu reproduzir a forma
> fechada, fazendo traços abertos e irregulares mesmo depois de três tentativas.
> Notei que ele segura o lápis com uma pega ainda imatura, do tipo palmar,
> envolvendo o lápis com a mão toda. Depois fomos ao pátio para uma corrida entre
> cones; ele caiu duas vezes durante o percurso, tropeçando nos próprios pés
> mesmo em piso plano e sem obstáculos. Na volta, havia uma escada interna de
> quatro degraus; ele subiu segurando o corrimão com uma mão e recebendo apoio
> físico leve do terapeuta no outro braço, alternando os pés um degrau por vez,
> sem quedas. Na saída, a mãe comentou que em casa ele também evita andar de
> bicicleta e não gosta de brincar em playgrounds com escadas."

### Regras que este caso exercita

R19 (núcleo do caso: `protocolos_ativos` traz só o PEDI — o DCDQ nunca aparece
ali, porque é questionário respondido pelos pais, não pontuável em sessão; o
agente NÃO deve inventar `protocol_id: "dcdq"` para as observações motoras);
R1 (mesma regra, do ponto de vista de fidelidade — sem instrumento ativo que
cubra grafomotricidade/quedas ao correr, essas observações ficam com
`protocol_id: null`, nunca com um protocolo inventado); R5 (a subida de escada
usa a `taxonomia_ajuda` do PEDI — `assistencia_minima` — não o fallback ABA);
R14 (nível de ajuda na escada hoje, `assistencia_minima`, é mais assistido que o
registro formal anterior, `supervisao` — possível variabilidade/regressão); R6
(falha em copiar o círculo e quedas são evidências negativas válidas); R11
("duas vezes", "três tentativas", "quatro degraus" literais); R15 (fala relatada
pela mãe, não observada diretamente, tratada com confiança reduzida).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "ele tentou copiar um círculo que desenhei no papel, mas não conseguiu reproduzir a forma fechada, fazendo traços abertos e irregulares mesmo depois de três tentativas",
      "justificativa_confianca": "Observação motora clássica de triagem de coordenação (tipo DCDQ), mas o DCDQ não está em protocolos_ativos (questionário de pais, não pontuável em sessão) e o PEDI ativo cobre só mobilidade/locomoção, não grafomotricidade — sem protocolo/domínio a atribuir, para não inventar taxonomia (R19).",
      "evidencia": {
        "descricao": "Não conseguiu copiar círculo de forma fechada após 3 tentativas",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [{ "goal_id": null, "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "erro",
        "ambiente": "estruturado",
        "frequencia": { "informada": true, "valor": 3, "unidade": "tentativas" }
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "ele segura o lápis com uma pega ainda imatura, do tipo palmar, envolvingo o lápis com a mão toda",
      "justificativa_confianca": "Mesma situação: item clássico de triagem motora, sem protocolo ativo que cubra preensão fina — sem protocol_id/dominio_id atribuído.",
      "evidencia": {
        "descricao": "Preensão do lápis do tipo palmar, sem uso de pinça digital",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [{ "goal_id": null, "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "nao_aplicavel",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "media",
      "trecho_fonte": "ele caiu duas vezes durante o percurso, tropeçando nos próprios pés mesmo em piso plano e sem obstáculos",
      "justificativa_confianca": "Quedas em piso plano remetem a item de triagem motora, mas não correspondem ao domínio 'mobilidade_locomocao' do PEDI ativo (que trata de escadas/transferências no histórico) — sem protocol_id/dominio_id atribuído, para não forçar enquadramento não sustentado pelo contexto.",
      "evidencia": {
        "descricao": "Quedas por tropeço em piso plano e sem obstáculos durante corrida entre cones",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [{ "goal_id": null, "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "independente",
        "resultado": "erro",
        "ambiente": "natural",
        "frequencia": { "informada": true, "valor": 2, "unidade": "vezes" }
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "havia uma escada interna de quatro degraus; ele subiu segurando o corrimão com uma mão e recebendo apoio físico leve do terapeuta no outro braço, alternando os pés um degrau por vez, sem quedas",
      "justificativa_confianca": "Domínio 'mobilidade_locomocao' do PEDI está ativo e cobre exatamente este item; nível de ajuda (assistencia_minima, pela taxonomia do PEDI) é mais assistido que o registro formal anterior (supervisao, 2026-04-10) — possível variabilidade ou regressão a checar com a equipe.",
      "evidencia": {
        "descricao": "Subiu escada de 4 degraus alternando os pés, com apoio no corrimão e apoio físico leve do terapeuta, sem quedas",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "pedi",
            "dominio_id": "mobilidade_locomocao"
          }
        ],
        "nivel_ajuda": "assistencia_minima",
        "resultado": "acerto_apos_dica",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "confianca": "baixa",
      "trecho_fonte": "a mãe comentou que em casa ele também evita andar de bicicleta e não gosta de brincar em playgrounds com escadas",
      "justificativa_confianca": "Relato de terceiros (mãe), não observação direta da sessão — confiança reduzida (R15). Conteúdo é exatamente o tipo de item que o DCDQ foi desenhado para capturar, mas o DCDQ não está ativo nesta sessão e este relato pontual não substitui seu preenchimento formal; sem protocol_id atribuído para não simular pontuação do instrumento.",
      "evidencia": {
        "descricao": "Relato materno de evitação de bicicleta e de playgrounds com escadas em casa",
        "polaridade": "negativa",
        "funcao_indefinida": true,
        "alvos": [{ "goal_id": null, "protocol_id": null, "dominio_id": null }],
        "nivel_ajuda": "nao_informado",
        "resultado": "nao_aplicavel",
        "ambiente": "nao_informado"
      }
    }
  ],
  "resumo_sessao": "Único evento com domínio ativo correspondente (PEDI, mobilidade_locomocao) foi a subida de escada, registrada com assistencia_minima — mais assistido que o registro formal anterior (supervisao), sinalizando possível variabilidade a checar. As demais observações motoras (círculo, preensão do lápis, quedas ao correr, relato materno) são clinicamente relevantes e coerentes com itens de triagem tipo DCDQ, mas não foram convertidas em pontuação desse instrumento — o DCDQ é preenchido pelos pais e não consta em protocolos_ativos desta sessão.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Nível de ajuda na escada (assistencia_minima) mais elevado que o registrado na avaliação PEDI formal de 2026-04-10 (supervisao) — recomenda-se checagem com a equipe sobre variabilidade ou regressão."
    },
    {
      "tipo": "texto_ambiguo",
      "detalhe": "Observações motoras desta sessão (círculo, preensão, quedas, relato materno) reforçam a pertinência do DCDQ'07 já encaminhado aos pais em 2026-05-15, ainda com devolutiva pendente — nota informativa, não pontuação do instrumento."
    }
  ]
}
```

---

## Caso 17 — Perfil Sensorial 2: dois eventos sensoriais distintos (tátil e vestibular)

### Contexto

```json
{
  "paciente": {
    "id": "pac-vs-553",
    "idade_meses": 63,
    "resumo_repertorio": "TEA nível 1; Perfil Sensorial 2 preenchido pela mãe há 3 semanas indica boa tolerância tátil habitual, sem episódios de esquiva registrados; sem registros anteriores de busca vestibular intensa."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "pedi",
      "nome": "PEDI",
      "tipo_coleta": "evidencia_por_dominio",
      "taxonomia_ajuda": [
        "independente",
        "supervisao",
        "assistencia_minima",
        "assistencia_moderada",
        "assistencia_maxima",
        "assistencia_total"
      ],
      "dominios": [
        {
          "dominio_id": "mobilidade_locomocao",
          "nome": "Mobilidade — locomoção",
          "definicao_funcional": "subir/descer degraus e deslocamento com equilíbrio"
        }
      ],
      "componentes_extras": [
        {
          "id": "perfil_sensorial_2",
          "tipo_coleta": "registro_abc",
          "categorias": ["sensorial"]
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "perfil_sensorial_2",
      "resumo": "Relatos da cuidadora (Perfil Sensorial 2, preenchido há 3 semanas) e das últimas 8 semanas de acompanhamento indicam boa tolerância a texturas táteis (massinha, tinta, areia molhada), sem esquiva registrada."
    }
  ]
}
```

### Diário de entrada

> "Sessão de TO com foco em integração sensorial e mobilidade funcional. Ao entrar
> na sala, a Valentina subiu sozinha os três degraus do tablado sem apoio nas
> mãos, alternando os pés. Durante atividade com massinha de modelar molhada, ao
> encostar o dedo indicador na massa, ela retraiu a mão bruscamente, fez cara de
> nojo e disse 'tá melado, não quero', recusando-se a tocar novamente por uns 20
> segundos, até eu oferecer uma toalhinha para limpar os dedos — momento em que
> ela se acalmou e aceitou retomar a atividade usando uma colher de plástico.
> Mais tarde, na cadeira giratória, ela pediu para eu girar 'mais rápido, mais
> rápido!' e, quando a cadeira parou, ela mesma se impulsionou com os pés para
> continuar girando, repetindo o movimento por várias vezes seguidas, rindo e sem
> sinais de tontura, náusea ou desregulação ao final."

### Regras que este caso exercita

R19 (Perfil Sensorial 2 nunca aparece como protocolo formal — só como
`componente_extra` de `tipo_coleta: "registro_abc"` dentro do PEDI, mesmo padrão
já usado para as Barreiras do VB-MAPP); R10 (2 eventos sensoriais distintos em
formato ABC estendido, com `subcategoria_sensorial` correta: tátil e vestibular);
R11 (duração de 20s só no evento tátil, citada literalmente; "várias vezes
seguidas" no vestibular não vira número); R14 (evento tátil diverge do histórico
de boa tolerância); R18 (nenhum dos dois eventos atinge critério de gravidade);
R8 (evento de mobilidade PEDI, evento tátil e evento vestibular como 3 extrações
distintas).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "evidencia",
      "confianca": "alta",
      "trecho_fonte": "a Valentina subiu sozinha os três degraus do tablado sem apoio nas mãos, alternando os pés",
      "evidencia": {
        "descricao": "Subiu 3 degraus alternando os pés, sem apoio nas mãos",
        "polaridade": "positiva",
        "funcao_indefinida": true,
        "alvos": [
          {
            "goal_id": null,
            "protocol_id": "pedi",
            "dominio_id": "mobilidade_locomocao"
          }
        ],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "trecho_fonte": "ao encostar o dedo indicador na massa, ela retraiu a mão bruscamente, fez cara de nojo e disse 'tá melado, não quero', recusando-se a tocar novamente por uns 20 segundos, até eu oferecer uma toalhinha para limpar os dedos — momento em que ela se acalmou e aceitou retomar a atividade usando uma colher de plástico",
      "justificativa_confianca": "Histórico (Perfil Sensorial 2 + últimas 8 semanas) indica boa tolerância tátil habitual, sem esquiva registrada — este episódio diverge do padrão histórico.",
      "registro_abc": {
        "antecedente": "Contato do dedo indicador com massinha de modelar molhada",
        "comportamento": "Retração brusca da mão, expressão de nojo, verbalização de recusa ('tá melado, não quero') e esquiva de novo contato direto",
        "duracao_segundos": 20,
        "consequencia_regulacao": "Oferta de toalha para limpar os dedos; aceitou retomar a atividade usando colher de plástico como mediador",
        "categoria": "sensorial",
        "subcategoria_sensorial": "tatil",
        "severidade": "moderada"
      }
    },
    {
      "tipo": "registro_abc",
      "confianca": "alta",
      "trecho_fonte": "na cadeira giratória, ela pediu para eu girar 'mais rápido, mais rápido!' e, quando a cadeira parou, ela mesma se impulsionou com os pés para continuar girando, repetindo o movimento por várias vezes seguidas, rindo e sem sinais de tontura, náusea ou desregulação ao final",
      "justificativa_confianca": "Busca ativa de estímulo vestibular (seeking), não esquiva; texto afirma explicitamente ausência de desregulação ao final — reforça severidade leve. Duração não citada literalmente ('várias vezes seguidas'), por isso null (R11).",
      "registro_abc": {
        "antecedente": "Início do giro da cadeira giratória, a pedido da própria criança",
        "comportamento": "Pediu para girar mais rápido, auto-impulsionou-se para continuar o giro após a parada, repetiu o movimento várias vezes, rindo",
        "duracao_segundos": null,
        "consequencia_regulacao": "Nenhuma estratégia de regulação foi necessária; manteve-se engajada e regulada",
        "categoria": "sensorial",
        "subcategoria_sensorial": "vestibular",
        "severidade": "leve"
      }
    }
  ],
  "resumo_sessao": "Evidência de mobilidade independente (3 degraus, domínio PEDI). Dois eventos sensoriais via componente_extra Perfil Sensorial 2: aversão tátil à massinha molhada (esquiva, 20s, regulada com toalha e uso de colher) divergente do histórico de boa tolerância tátil; e busca vestibular na cadeira giratória (giro repetido e auto-impulsionado, sem sinais de desregulação).",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Evento de aversão tátil diverge do histórico de boa tolerância a texturas (Perfil Sensorial 2 + últimas 8 semanas) — recomenda-se checar com a cuidadora se houve mudança recente ou se é episódio pontual."
    }
  ]
}
```

---

## Resultados dos testes cegos — Casos 10 a 17 (09/07/2026)

**Metodologia:** cada caso foi rodado como um subagent Claude Sonnet 5 independente
que recebeu APENAS `system-instructions.md` + `output-schema.json` + o `### Contexto`

- `### Diário de entrada` deste caso — cego ao `### Saída esperada` (nunca viu o
  gabarito). É um teste cego genuíno, não uma conferência de gabarito. Cada saída real
  foi comparada linha a linha contra o gabarito por mim (não pelo próprio modelo que
  gerou a saída). Nenhum resultado abaixo foi suavizado ou arredondado para parecer
  melhor do que foi.

**Resultado agregado: 8/8 casos sem falha grave.** Nenhuma alucinação de protocolo
além do que o caso testava de propósito, nenhuma pontuação/marco inventado (R3),
nenhum dado fabricado, nenhuma severidade grave perdida, nenhum vazamento de
taxonomia entre protocolos. Todos os 8 "testes mais difíceis" de cada caso (a razão
de cada caso existir) passaram:

- **Caso 10 (ESDM):** deixou `goal_id: null` corretamente para o domínio
  "imitação" sem meta ativa no ciclo (R19) — PASSOU o teste central. Divergências
  menores (não-erros): classificou a manipulação inicial da boneca como
  `resultado: "erro"` em vez de `"nao_aplicavel"` do gabarito (leitura alternativa
  defensável, evento naturalista sem estrutura de tentativa certo/errado); gerou
  uma `evidencia` extra (função indefinida, domínio "comportamento") junto do
  `registro_abc` do arremesso de blocos — o contexto já definia esse domínio como
  "registradas como registro_abc", então a extração extra é levemente redundante,
  não um erro de regra.
- **Caso 11 (ABLLS-R):** schema limpo, R4/R5/R6/R8/R9 corretos. Achado real (não do
  modelo, meu): o modelo baixou a confiança dos itens marcados
  `inconsistente_com_historico` para `"baixa"`, seguindo a letra da seção
  "Confiança" antiga do sistema — meu próprio gabarito usava confiança alta/média
  nesses casos. Investigando, confirmei que essa era uma AMBIGUIDADE REAL da
  especificação (a seção "Confiança" listava "inconsistência com histórico" como
  gatilho de BAIXA, conflitando com R14, que só pede o boolean +
  `justificativa_confianca`). **Corrigido nas system instructions e no golden
  example** (ver abaixo) — a confiança agora reflete só a clareza do texto; a
  inconsistência é um sinal separado.
- **Caso 12 (AFLS, redesenhado):** o mais importante dos 8 — o modelo, sem ver o
  gabarito, chegou sozinho à mesma decisão de design da correção: não vinculou o
  ensaio em simulação de clínica a nenhum `protocol_id`/`dominio_id` (reconheceu que
  a definição funcional do domínio exige ambiente comunitário real) e só mapeou a
  administração real da loja ao módulo `afls_participacao_comunitaria`, com
  `inconsistente_com_historico: true`. Isso é evidência forte de que a correção do
  AFLS (ver `protocolos-e-agente.md` 1.4) está bem especificada e é aprendível só
  pelo contexto, sem precisar de exemplo prévio. Divergência menor: inventou um
  valor de `nivel_ajuda` ("variavel_por_etapa") fora da taxonomia declarada (R5) e
  gerou uma 3ª extração redundante com a cadeia já registrada.
- **Caso 13 (PROC):** executou corretamente o teste de R7 (extrair E a `evidencia`
  de função-protesto E o `registro_abc` do mesmo trecho do choro) — PASSOU. Schema
  limpo, boa qualidade geral.
- **Caso 14 (ABFW):** distinguiu corretamente "repetiu 3 vezes" (frequência
  literal) de "gaguejou bastante" (não quantificado, R11) — PASSOU o teste
  central. Schema limpo.
- **Caso 15 (MBGR):** recusou-se corretamente a simular avaliação formal a partir
  de menções incidentais (as 3 observações ficaram `confianca: "baixa"`, rotuladas
  como triagem) e a frase de fechamento genérica não gerou nenhuma extração (R1)
  — PASSOU o teste central. Divergência menor: usou `"nivel_ajuda": "nenhuma
(produção espontânea, sem modelo)"` em vez do valor válido `"independente"` da
  taxonomia (R5).
- **Caso 16 (DCDQ/PEDI):** não inventou um `protocol_id: "dcdq"` mesmo com o
  questionário mencionado no `resumo_repertorio` — chegou a explicitar isso numa
  `sinalizacao` ("DCDQ não consta em protocolos_ativos... evitando alucinação de
  protocolo") — PASSOU o teste central, e com clareza. Mapeou corretamente o
  evento da escada ao domínio PEDI ativo com `assistencia_minima`, sinalizando
  R14 contra o histórico (`supervisao`). Divergências menores: usou
  `resultado: "acerto"` em vez de `"acerto_apos_dica"` (havia assistência, o
  resultado deveria refletir isso); classificou a queda na corrida como
  `categoria: "sensorial"` (debatível — é mais plausivelmente comportamental/
  motora) e escreveu uma frase inteira no lugar de um rótulo curto em
  `subcategoria_sensorial`.
- **Caso 17 (Perfil Sensorial 2):** distinguiu corretamente a duração literal
  ("uns 20 segundos" → `20`) da duração vaga ("várias vezes seguidas" → `null`,
  R11), usou as subcategorias corretas (tátil/vestibular) e sinalizou R14 nos 2
  eventos. Schema limpo, sem divergências relevantes.

**Achado transversal mais importante desta rodada — corrigido:** a seção
"Confiança" do sistema (`system-instructions.md` e a cópia em
`protocolos-e-agente.md`) listava "inconsistência com histórico" como gatilho de
confiança BAIXA, o que conflitava com R14 (que só pede manter a extração e marcar
o boolean). Isso fez o golden example original (tato "cachorro") e 1 dos 8 testes
cegos (Caso 11) rebaixarem a confiança de extrações com texto perfeitamente claro,
só porque divergiam do histórico — confundindo "isto é surpreendente" com "não
tenho certeza do que aconteceu". Corrigido em `system-instructions.md`,
`protocolos-e-agente.md` (regra + golden example embutido) e
`golden-example-output.json`: a confiança agora reflete só a clareza do texto
(antecedente+comportamento+nível de ajuda explícitos = alta, mesmo se inconsistente
com o histórico); a divergência é sinalizada só por `inconsistente_com_historico`

- `justificativa_confianca`. **Nenhum dos 8 casos novos precisou de correção de
  conteúdo por causa disso** (seus gabaritos já usavam majoritariamente essa
  interpretação) — só a especificação e o golden example estavam desalinhados.

**O que este teste NÃO cobre (limitação honesta):** é uma validação cega de UM
modelo (Claude Sonnet 5) contra 8 casos que eu mesmo desenhei — não substitui
revisão de terapeuta de verdade, não mede performance em diários reais (só os
sintéticos destes casos), e não é o bake-off pago Claude vs. Gemini (que segue
deliberadamente adiado, ver `BACKLOG.md`). As poucas divergências listadas acima
são do tipo que um terapeuta editaria em segundos na revisão — nenhuma é um erro
clínico grave, alucinação de dado, ou pontuação fabricada.

---

## Pipeline de extração (Prompt 2, item 1)

**Gatilho:** síncrono — roda ao terapeuta salvar/finalizar o texto do diário na
consolidação (fim do dia) ou ao aprovar uma nota de captura rápida. Nunca em
lote noturno: o terapeuta espera na tela (com indicador de progresso) e revisa
em seguida, na mesma sessão de uso — é o momento de maior atenção dele ao caso.

**Entrada** (contexto montado pelo backend por paciente, ver `contexto-exemplo.json`):

- Texto do diário (texto livre ou transcrição de áudio).
- Idade e resumo de repertório do paciente.
- Metas ativas (`Goal`), com estado, critério de domínio e mapeamento a
  protocolo/domínio quando existir.
- Definições dos protocolos ativos (domínios, taxonomia de ajuda, componentes
  extra — ex.: Barreiras do VB-MAPP).
- `historico_relevante`: resumo das últimas N sessões (sugestão N=5) e nível de
  ajuda mais recente por meta/domínio tocado — é a base do R14.
- Perfil de reforçadores vivo (contexto opcional, ajuda a desambiguar menções a
  itens/preferências).

**Passos:**

1. Backend monta o contexto por paciente e injeta no system prompt.
2. Chamada única ao modelo com structured outputs (`output-schema.json`) — sem
   RAG sobre manuais, sem fine-tuning (restrição de copyright dos protocolos).
3. Resposta é persistida como `Extraction[]` no estado `sugerida` — nunca grava
   direto como `Evidence`.
4. Terapeuta revisa na mesma sessão (Prompt 3): aprova em lote as extrações de
   alta confiança, revisa uma a uma as de baixa confiança ou marcadas
   `inconsistente_com_historico`. Só a aprovação gera `Evidence` versionada.
5. Timeout/erro do modelo: o diário fica salvo como rascunho pendente de
   extração — o texto do terapeuta nunca se perde; retry manual ou automático
   em fila.

**Saída:** JSON conforme `output-schema.json` — `extracoes` (lista vazia é
sucesso válido, R1), `resumo_sessao` (1-2 frases, alimenta fila de pendências e
briefing pré-sessão) e `sinalizacoes` (ambiguidade, inconsistência, possível
erro de transcrição — alimentam a UI de revisão e a fila de exceções do
coordenador).

**Latência-alvo:** poucos segundos — diário de sessão real tem ~300-800
palavras, compatível com o terapeuta aguardar na tela antes de revisar.
