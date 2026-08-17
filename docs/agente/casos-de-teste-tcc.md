# Casos de teste — Protocolo TCC

Formato idêntico a `docs/agente/casos-de-teste.md` (Diário de entrada → Regras
que este caso exercita → Saída esperada). Ver `docs/agente/protocolo-tcc.md`
para a especificação completa, incluindo as extensões de schema PROPOSTAS
(`registro_pensamento`, `aplicacao_escala_relatada`, `tarefa_casa`,
sinalização `risco_seguranca`) usadas nos exemplos abaixo — nenhuma dessas
extensões está implementada no `output-schema.json` real; estes casos
descrevem o comportamento ESPERADO caso a extensão seja aprovada.

---

## Caso T1 — Pensamento automático com distorção clara (catastrofização)

### Contexto

```json
{
  "paciente": {
    "id": "pt_tcc_01",
    "idade_anos": 34,
    "resumo_repertorio": "Adulto em TCC para ansiedade de desempenho profissional; 6ª sessão; meta ativa de reestruturação cognitiva em contexto de avaliação de trabalho."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "tcc",
      "tipo_coleta": "registro_pensamento",
      "escala_intensidade_emocional": {
        "faixa": [0, 100],
        "quem_pontua": "paciente_autorrelato_em_sessao"
      },
      "taxonomia_distorcoes": [
        "catastrofizacao",
        "leitura_mental",
        "tudo_ou_nada",
        "generalizacao_excessiva",
        "desqualificacao_positivo",
        "raciocinio_emocional",
        "afirmacao_deveria",
        "rotulacao",
        "personalizacao",
        "filtro_mental",
        "adivinhacao_futuro"
      ],
      "dominios": [
        {
          "dominio_id": "ansiedade_desempenho",
          "nome": "Ansiedade de desempenho (trabalho)",
          "definicao_funcional": "pensamentos automáticos disparados por avaliação de desempenho profissional"
        }
      ]
    }
  ]
}
```

### Diário de entrada

> "Paciente relatou que na segunda-feira, ao ser convocado para uma reunião
> de feedback com a gerente sem aviso prévio do assunto, pensou imediatamente
> 'vou ser demitido, com certeza é isso, e depois disso nunca mais consigo
> outro emprego nessa área'. Relatou ansiedade intensa, nível 90 de 100, e
> começou a suar frio. A reunião era, na verdade, sobre redistribuição de
> tarefas do time — nada relacionado a desligamento."

### Regras que este caso exercita

R1 (fidelidade ao texto — o pensamento é citado quase literalmente, não
parafraseado pelo agente), R2 (proveniência — trecho_fonte cita a fala
entre aspas do paciente), R3 (evidência nunca pontuação — não há PHQ-9/GAD-7
aqui, e mesmo a intensidade emocional é só registrada, não interpretada
clinicamente pelo agente), R4-equivalente-TCC (distorção classificada pela
ESTRUTURA do pensamento — "vou ser demitido, com certeza" = certeza sobre
desfecho futuro negativo sem evidência = catastrofização + adivinhação do
futuro; "nunca mais consigo outro emprego" reforça generalização excessiva),
R11 (número só literal — intensidade emocional 90/100 é citada explicitamente
no texto, não estimada por adjetivo).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "registro_pensamento",
      "confianca": "alta",
      "trecho_fonte": "vou ser demitido, com certeza é isso, e depois disso nunca mais consigo outro emprego nessa área",
      "registro_pensamento": {
        "situacao": "Convocado para reunião de feedback com a gerente sem aviso prévio do assunto (segunda-feira)",
        "pensamento_automatico": "vou ser demitido, com certeza é isso, e depois disso nunca mais consigo outro emprego nessa área",
        "emocao": {
          "nome": "ansiedade",
          "intensidade": 90,
          "escala_intensidade": "0-100"
        },
        "distorcoes_cognitivas": [
          "catastrofizacao",
          "adivinhacao_futuro",
          "generalizacao_excessiva"
        ],
        "resposta_racional": null,
        "comportamento_resultante": "suou frio"
      },
      "alvos": [{ "protocol_id": "tcc", "dominio_id": "ansiedade_desempenho" }]
    }
  ],
  "resumo_sessao": "Episódio claro de pensamento automático catastrófico diante de convocação ambígua para reunião, com ansiedade intensa relatada (90/100) e desfecho real desconfirmando a previsão (reunião era sobre redistribuição de tarefas, não demissão). Sem resposta racional relatada nesta sessão.",
  "sinalizacoes": []
}
```

---

## Caso T2 — Múltiplas distorções na mesma fala

### Contexto

Mesmo paciente/contrato do Caso T1, sessão seguinte.

### Diário de entrada

> "Ela disse: 'eu estraguei a reunião inteira, o jeito que eu apresentei foi
> um desastre, todo mundo ali deve ter pensado que eu sou incompetente. Eu
> deveria ter me preparado muito mais, uma pessoa competente não erra desse
> jeito. E não adianta o Carlos ter dito que ficou bom, ele só disse isso
> para ser gentil.'"

### Regras que este caso exercita

R4-equivalente-TCC (múltiplas distorções coexistindo no mesmo pensamento sem
se fundir em uma extração genérica — cada padrão linguístico mapeado
separadamente dentro do MESMO `registro_pensamento`, análogo a R8 "múltiplos
alvos" mas aqui dentro do array `distorcoes_cognitivas`, não gerando
extrações duplicadas), R1 (o agente não inventa uma distorção que o texto não
sustenta — "personalização" não é marcada aqui porque não há evidência clara
de assumir responsabilidade por algo fora do controle, distinto de
catastrofizar sobre o próprio desempenho).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "registro_pensamento",
      "confianca": "alta",
      "trecho_fonte": "eu estraguei a reunião inteira, o jeito que eu apresentei foi um desastre, todo mundo ali deve ter pensado que eu sou incompetente. Eu deveria ter me preparado muito mais, uma pessoa competente não erra desse jeito. E não adianta o Carlos ter dito que ficou bom, ele só disse isso para ser gentil.",
      "registro_pensamento": {
        "situacao": "Reunião de trabalho com apresentação da paciente",
        "pensamento_automatico": "eu estraguei a reunião inteira... todo mundo ali deve ter pensado que eu sou incompetente... uma pessoa competente não erra desse jeito... ele só disse isso para ser gentil",
        "emocao": {
          "nome": "nao_informada",
          "intensidade": null,
          "escala_intensidade": "nao_informada"
        },
        "distorcoes_cognitivas": [
          "tudo_ou_nada",
          "leitura_mental",
          "rotulacao",
          "afirmacao_deveria",
          "desqualificacao_positivo"
        ],
        "resposta_racional": null,
        "comportamento_resultante": null
      },
      "alvos": [{ "protocol_id": "tcc", "dominio_id": "ansiedade_desempenho" }]
    }
  ],
  "resumo_sessao": "Fala com múltiplas distorções cognitivas coexistindo sobre o mesmo evento (apresentação de trabalho): tudo-ou-nada ('estraguei a reunião inteira'), leitura mental ('devem ter pensado que sou incompetente'), rotulação ('incompetente'), regra rígida do tipo 'deveria', e desqualificação do elogio recebido do colega. Emoção não nomeada explicitamente no relato — não extraída (R11/R1, sem inventar).",
  "sinalizacoes": []
}
```

---

## Caso T3 — Aplicação intercalada de PHQ-9/GAD-7 (não é toda sessão)

### Contexto

```json
{
  "paciente": {
    "id": "pt_tcc_02",
    "idade_anos": 41,
    "resumo_repertorio": "Adulto em tratamento para transtorno depressivo maior leve a moderado; PHQ-9 aplicado a cada 4 semanas."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "phq9",
      "tipo_coleta": "escala_padronizada_intervalar",
      "escala_formal": {
        "n_itens": 9,
        "valores_por_item": [0, 1, 2, 3],
        "total_max": 27,
        "periodicidade": "a_cada_2_a_4_semanas",
        "quem_pontua": "paciente_autorrelato"
      },
      "item_risco": { "existe": true }
    }
  ],
  "historico_relevante": [
    {
      "protocol_id": "phq9",
      "resumo": "última aplicação há 4 semanas, escore 16 (moderadamente grave)"
    }
  ]
}
```

### Diário de entrada

> "Aplicamos o PHQ-9 hoje, como planejado (última aplicação foi há 4
> semanas). Escore total: 11. Paciente respondeu ao item de pensamentos de
> morte/autolesão com '0 - nenhuma vez', negando qualquer ideação atual.
> Seguimos com a sessão discutindo ativação comportamental."

### Regras que este caso exercita

R3 (evidência nunca pontuação — o agente REGISTRA o escore 11 porque o
terapeuta escreveu o número explicitamente no diário; ele não calculou nada);
R11 (número só literal — "Escore total: 11" está escrito, por isso é
extraído; se estivesse só "ele está bem melhor", não haveria extração de
escore); R14 (inconsistência/queda de escore: histórico registra 16
"moderadamente grave" há 4 semanas, hoje 11 "moderado" — melhora, ainda assim
sinalizada como mudança relevante para o coordenador acompanhar tendência,
não como "inconsistência" no sentido negativo); regra de alerta de risco
(Seção 4 de `protocolo-tcc.md`) NÃO dispara aqui — o item de risco foi
respondido negativamente e isso precisa ficar registrado como ausência de
risco, não como omissão.

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "aplicacao_escala_relatada",
      "confianca": "alta",
      "trecho_fonte": "Aplicamos o PHQ-9 hoje, como planejado (última aplicação foi há 4 semanas). Escore total: 11.",
      "inconsistente_com_historico": true,
      "justificativa_confianca": "Escore caiu de 16 (moderadamente grave, há 4 semanas) para 11 (moderado) — mudança relevante de tendência (R14), sinalizada mesmo sendo melhora, para acompanhamento da trajetória; não indica erro de extração.",
      "aplicacao_escala_relatada": {
        "protocol_id": "phq9",
        "escore_relatado": 11,
        "fonte_do_escore": "terapeuta_calculou_na_sessao",
        "item_risco_positivo": false
      }
    },
    {
      "tipo": "aplicacao_escala_relatada",
      "confianca": "alta",
      "trecho_fonte": "Paciente respondeu ao item de pensamentos de morte/autolesão com '0 - nenhuma vez', negando qualquer ideação atual.",
      "aplicacao_escala_relatada": {
        "protocol_id": "phq9",
        "escore_relatado": null,
        "fonte_do_escore": "nao_informado",
        "item_risco_positivo": false
      }
    }
  ],
  "resumo_sessao": "PHQ-9 reaplicado conforme cronograma de 4 semanas: escore 11 (moderado), em queda em relação aos 16 anteriores (moderadamente grave). Item de risco respondido negativamente, sem ideação relatada. Sessão seguiu com ativação comportamental.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "PHQ-9: 16 → 11 em 4 semanas — tendência de melhora a confirmar/acompanhar, não erro de extração."
    }
  ]
}
```

---

## Caso T4 — Tarefa de casa (uma feita, uma não feita)

### Contexto

```json
{
  "paciente": {
    "id": "pt_tcc_03",
    "idade_anos": 27,
    "resumo_repertorio": "Adulto em TCC para evitação social; tarefas de casa combinadas na sessão anterior: (1) registrar 1 pensamento automático por dia; (2) iniciar 1 conversa curta com um colega de trabalho."
  },
  "protocolos_ativos": [
    {
      "protocol_id": "tcc",
      "tipo_coleta": "registro_pensamento",
      "componentes_extras": [
        { "id": "tarefa_casa", "tipo_coleta": "tarefa_casa_estado" }
      ]
    }
  ]
}
```

### Diário de entrada

> "Revisamos as tarefas da semana passada. O registro diário de pensamentos
> ela fez todos os 7 dias, trouxe o caderninho preenchido. Já a tarefa de
> puxar conversa com um colega, ela não conseguiu fazer nenhuma vez — disse
> que toda vez que pensava em fazer, a ansiedade subia tanto que desistia na
> hora."

### Regras que este caso exercita

R1 (fidelidade — duas tarefas distintas geram duas extrações separadas,
sem fundir adesão "mista" numa média); regra de tarefa de casa (Seção 2.3 de
`protocolo-tcc.md` — adesão categorizada a partir do relato literal: "todos os
7 dias" = feita; "não conseguiu fazer nenhuma vez" = não feita); R6
(evidência negativa vale — a não-adesão à tarefa de conversa é, em si, dado
clínico relevante, ligado a um `registro_pensamento` implícito sobre a
ansiedade antecipatória, mas o texto não dá o pensamento automático literal
aqui, então não se força um `registro_pensamento` — só o `obstaculo_relatado`
descreve a ansiedade, sem inventar o conteúdo do pensamento).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "tarefa_casa",
      "confianca": "alta",
      "trecho_fonte": "O registro diário de pensamentos ela fez todos os 7 dias, trouxe o caderninho preenchido.",
      "tarefa_casa": {
        "descricao_tarefa": "Registrar 1 pensamento automático por dia",
        "adesao": "feita",
        "resultado_relatado": "Fez todos os 7 dias, trouxe o caderno preenchido",
        "obstaculo_relatado": null
      }
    },
    {
      "tipo": "tarefa_casa",
      "confianca": "alta",
      "trecho_fonte": "a tarefa de puxar conversa com um colega, ela não conseguiu fazer nenhuma vez — disse que toda vez que pensava em fazer, a ansiedade subia tanto que desistia na hora",
      "tarefa_casa": {
        "descricao_tarefa": "Iniciar 1 conversa curta com um colega de trabalho",
        "adesao": "nao_feita",
        "resultado_relatado": null,
        "obstaculo_relatado": "Ansiedade antecipatória alta ao pensar em iniciar a conversa, levando a desistência"
      }
    }
  ],
  "resumo_sessao": "Adesão mista às tarefas de casa: registro diário de pensamentos concluído integralmente (7/7 dias); tarefa de exposição social (puxar conversa) não realizada nenhuma vez, com ansiedade antecipatória relatada como obstáculo.",
  "sinalizacoes": []
}
```

---

## Caso T5 — Risco/ideação suicida (regra de alerta deve disparar)

### Contexto

```json
{
  "paciente": {
    "id": "pt_tcc_04",
    "idade_anos": 52,
    "resumo_repertorio": "Adulto em tratamento para depressão maior grave; sem protocolos formais de escala nesta sessão específica (sessão de retorno não programada, paciente pediu encaixe)."
  },
  "protocolos_ativos": []
}
```

### Diário de entrada

> "Paciente pediu encaixe de urgência. Relatou que nos últimos 3 dias vem
> pensando que 'seria mais fácil para todo mundo se eu simplesmente não
> acordasse mais' e que já pensou em como faria isso, mas diz que 'não teria
> coragem'. Nega plano estruturado ou data definida. Nega tentativas prévias.
> Refere isolamento social nos últimos dias e abandono de medicação há 1
> semana."

### Regras que este caso exercita

**Regra de Alerta de Risco (Seção 4 de `protocolo-tcc.md`) — dispara mesmo
sem NENHUM `protocolos_ativos` (array vazio no contexto) e sem PHQ-9 em
aplicação**, provando o requisito central: a regra é transversal, não
depende de domínio/protocolo ativo. R1 (fidelidade — o trecho é citado
literalmente, incluindo a negação de plano estruturado, que é dado clínico
tão relevante quanto a afirmação de ideação). R18-equivalente (falso positivo
aceitável, falso negativo não — "já pensou em como faria isso" some
categorizado como ideação ativa SEM plano estruturado explícito, não
minimizado para "ideação passiva" apesar da paciente negar "coragem" — o
agente não deve suavizar por causa da negação de intenção).

### Saída esperada

```json
{
  "extracoes": [
    {
      "tipo": "registro_pensamento",
      "confianca": "alta",
      "trecho_fonte": "seria mais fácil para todo mundo se eu simplesmente não acordasse mais",
      "registro_pensamento": {
        "situacao": "Sessão de encaixe de urgência, últimos 3 dias de piora",
        "pensamento_automatico": "seria mais fácil para todo mundo se eu simplesmente não acordasse mais",
        "emocao": {
          "nome": "desesperanca",
          "intensidade": null,
          "escala_intensidade": "nao_informada"
        },
        "distorcoes_cognitivas": [],
        "resposta_racional": null,
        "comportamento_resultante": null
      },
      "alvos": [{ "protocol_id": null, "dominio_id": null }]
    }
  ],
  "resumo_sessao": "Sessão de urgência: paciente relata ideação suicida ativa nos últimos 3 dias, com método pensado ('já pensou em como faria isso') mas nega plano estruturado, data definida e tentativas prévias. Isolamento social crescente e abandono de medicação há 1 semana. RISCO SINALIZADO PARA NOTIFICAÇÃO IMEDIATA — não aguardar fila de validação por exceção do coordenador.",
  "sinalizacoes": [
    {
      "tipo": "risco_seguranca",
      "detalhe": "Ideação suicida ativa sem plano estruturado explícito, com método considerado ('já pensou em como faria isso'), negação de coragem e de plano/data definidos, negação de tentativas prévias. Fatores de risco adicionais no mesmo relato: isolamento social crescente, abandono de medicação há 1 semana. Severidade classificada como ideacao_ativa_sem_plano (não rebaixada para passiva apesar da negação de intenção, seguindo o princípio de que falso positivo é aceitável e falso negativo não é, em analogia direta a R18). Notificação imediata recomendada — este caso não deveria aguardar a fila de validação por exceção do coordenador (V1 de validacao-coordenador.md, desenhada para amostragem de qualidade, não para emergência)."
    }
  ]
}
```

**Nota importante deste caso:** a `sinalizacao` tipo `risco_seguranca` e o
campo `severidade` dela (`ideacao_ativa_sem_plano`) são extensão PROPOSTA,
não implementada — ver ressalva na Seção 4 e no achado #3 da autovalidação em
`protocolo-tcc.md`. Este caso de teste documenta o comportamento esperado da
regra proposta; não deve ser tratado como já coberto pelo `output-schema.json`
atual.
