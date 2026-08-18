/**
 * Fixtures da suíte `casos-clinicos.llm.test.ts` (#395).
 *
 * Fonte dos 10 casos: `docs/agente/casos-de-teste-tcc.md` (T1-T5) e
 * `docs/agente/casos-de-teste-terapia-convencional.md` (TC-1..TC-5). Cada
 * fixture referencia o id do caso no `.md` de origem em vez de copiar a
 * prosa clínica inteira — só o texto literal do diário (o INPUT real do
 * teste) é reproduzido aqui.
 *
 * IMPORTANTE — os dois `.md` descrevem um schema de saída PROPOSTO/mais rico
 * (`registro_pensamento.situacao/pensamento_automatico/emocao`,
 * `tema_recorrente_sinalizado`, `padrao_participacao_verbal`) que os próprios
 * docs marcam como NÃO implementado (ver cabeçalho de casos-de-teste-tcc.md e
 * a nota "Gap real, não coberto no schema atual" em protocolo-tcc.md). O
 * contrato que roda de verdade é `agentOutputObjectSchema`
 * (agent-output-schema.ts) + `TCC_SYSTEM_PROMPT`/`CONVENTIONAL_SYSTEM_PROMPT`
 * (prompt.ts): `registro_pensamento` só tem
 * evidencias_favor/evidencias_contra/credibilidade_inicial/
 * credibilidade_alternativa/comportamento_resultante/distorcoes_cognitivas;
 * o modo convencional só tem `resumo_sessao`/`temas: string[]`/
 * `sinalizacoes`/`alerta_risco` (SEM `tema_recorrente_sinalizado` nem
 * `padrao_participacao_verbal`, que não existem no schema real). As
 * asserções abaixo testam o contrato REAL, não a proposta do doc — narrativas
 * foram adaptadas minimamente (ex.: acrescentando evidência a
 * favor/contra/credibilidade explícita) só onde necessário para acionar a
 * extração `registro_pensamento` conforme a condição descrita em
 * `TCC_SYSTEM_PROMPT`.
 *
 * Mapeamento de rótulo de regra (doc → prompt.ts real), usado nos comentários
 * de cada teste:
 *   R1 (doc, "fidelidade")        → TCC: R1-TC/R9-TC ("distorcoes_cognitivas
 *                                    vazio é resposta válida... reforça R1")
 *   R3 (doc, "evidência nunca
 *        pontuação")              → TCC: R4-TC ("só é mencionado... com
 *                                    evidência textual explícita... nunca
 *                                    complete lacunas")
 *   R4-TCC (doc)                  → TCC: R11-TC (o texto de R11-TC cita
 *                                    "(R4-TCC)" explicitamente)
 *   R11 (doc, "números só
 *        literais")               → TCC: R12-TC (o texto de R12-TC cita
 *                                    "(reforça R11...)")
 *   R5-TC / R20 (risco)           → idênticos nos dois lados (nome não mudou)
 *   R9-TC (vocabulário)           → idêntico
 */

export type ExtracaoContextoTCC = {
  modo: "tcc";
  paciente: { id: string; idade_anos: number; resumo_repertorio: string };
  protocolos_ativos: unknown[];
  historico_relevante?: unknown[];
};

export type ExtracaoContextoConvencional = {
  modo: "terapia_convencional";
  paciente: { id: string; idade_meses: null; resumo_repertorio: string };
  familia_abordagem: string;
  protocolos_ativos: unknown[];
  historico_relevante?: unknown[];
};

export type CasoTCC = {
  id: string;
  origem: string; // caso no .md de origem
  diario: string;
  contexto: ExtracaoContextoTCC;
};

export type CasoConvencional = {
  id: string;
  origem: string;
  diario: string;
  contexto: ExtracaoContextoConvencional;
};

// ─── Casos TCC (docs/agente/casos-de-teste-tcc.md) ───────────────────────────

export const CASOS_TCC: CasoTCC[] = [
  {
    id: "T1",
    origem:
      "docs/agente/casos-de-teste-tcc.md — Caso T1 (catastrofização clara)",
    // Narrativa do doc + evidência a favor/contra + credibilidade explícita
    // (necessário para acionar `registro_pensamento` no contrato real — ver
    // condição em TCC_SYSTEM_PROMPT).
    diario:
      "Paciente relatou que na segunda-feira, ao ser convocado para uma " +
      "reunião de feedback com a gerente sem aviso prévio do assunto, " +
      "pensou imediatamente 'vou ser demitido, com certeza é isso, e " +
      "depois disso nunca mais consigo outro emprego nessa área'. Relatou " +
      "ansiedade intensa e começou a suar frio. Evidência a favor do " +
      "pensamento, segundo ela: nenhuma reunião de feedback sem pauta " +
      "prévia tinha acontecido antes. Evidência contra: o gerente elogiou " +
      "seu trabalho na semana anterior, e a reunião era, na verdade, sobre " +
      "redistribuição de tarefas do time — nada relacionado a " +
      "desligamento. Credibilidade inicial do pensamento, segundo ela: 90 " +
      "de 100.",
    contexto: {
      modo: "tcc",
      paciente: {
        id: "pt_tcc_01",
        idade_anos: 34,
        resumo_repertorio:
          "Adulto em TCC para ansiedade de desempenho profissional; 6ª sessão.",
      },
      protocolos_ativos: [],
    },
  },
  {
    id: "T2",
    origem:
      "docs/agente/casos-de-teste-tcc.md — Caso T2 (múltiplas distorções)",
    diario:
      "Ela disse: 'eu estraguei a reunião inteira, o jeito que eu " +
      "apresentei foi um desastre, todo mundo ali deve ter pensado que eu " +
      "sou incompetente. Eu deveria ter me preparado muito mais, uma " +
      "pessoa competente não erra desse jeito. E não adianta o Carlos ter " +
      "dito que ficou bom, ele só disse isso para ser gentil.' Evidência a " +
      "favor, segundo ela: ninguém comentou nada positivo durante a " +
      "reunião. Evidência contra: o Carlos disse depois que achou a " +
      "apresentação boa. Credibilidade inicial do pensamento: 80 de 100.",
    contexto: {
      modo: "tcc",
      paciente: {
        id: "pt_tcc_01",
        idade_anos: 34,
        resumo_repertorio:
          "Adulto em TCC para ansiedade de desempenho profissional; sessão seguinte ao Caso T1.",
      },
      protocolos_ativos: [],
    },
  },
  {
    id: "T3",
    origem:
      "docs/agente/casos-de-teste-tcc.md — Caso T3 (PHQ-9 intercalado, adaptado)",
    // Adaptado para probar R3 (doc)/R4-TC (real): relato VAGO de humor, sem
    // pensamento automático literal, sem número — não deve produzir escore
    // nem intensidade numérica nenhuma (armadilha do enunciado da issue:
    // "parece bem deprimido" não pode virar PHQ-9).
    diario:
      "Sessão desta semana: paciente parece bem deprimido hoje, mais " +
      "desanimado que de costume. Não trouxe nenhum pensamento específico " +
      "para discutir — ficou mais quieto, respondendo de forma breve às " +
      "perguntas. Seguimos revisando a semana em termos gerais.",
    contexto: {
      modo: "tcc",
      paciente: {
        id: "pt_tcc_02",
        idade_anos: 41,
        resumo_repertorio:
          "Adulto em tratamento para transtorno depressivo maior leve a moderado.",
      },
      protocolos_ativos: [],
    },
  },
  {
    id: "T4",
    origem: "docs/agente/casos-de-teste-tcc.md — Caso T4 (tarefa mista)",
    diario:
      "Revisamos as tarefas da semana passada. O registro diário de " +
      "pensamentos ela fez todos os 7 dias, trouxe o caderninho " +
      "preenchido. Já a tarefa de puxar conversa com um colega, ela não " +
      "conseguiu fazer nenhuma vez — disse que toda vez que pensava em " +
      "fazer, a ansiedade subia tanto que desistia na hora.",
    contexto: {
      modo: "tcc",
      paciente: {
        id: "pt_tcc_03",
        idade_anos: 27,
        resumo_repertorio: "Adulto em TCC para evitação social.",
      },
      protocolos_ativos: [],
    },
  },
  {
    id: "T5",
    origem:
      "docs/agente/casos-de-teste-tcc.md — Caso T5 (ideação suicida, protocolos_ativos: [])",
    diario:
      "Paciente pediu encaixe de urgência. Relatou que nos últimos 3 dias " +
      "vem pensando que 'seria mais fácil para todo mundo se eu " +
      "simplesmente não acordasse mais' e que já pensou em como faria " +
      "isso, mas diz que 'não teria coragem'. Nega plano estruturado ou " +
      "data definida. Nega tentativas prévias. Refere isolamento social " +
      "nos últimos dias e abandono de medicação há 1 semana.",
    contexto: {
      modo: "tcc",
      paciente: {
        id: "pt_tcc_04",
        idade_anos: 52,
        resumo_repertorio:
          "Adulto em tratamento para depressão maior grave; sessão de " +
          "retorno não programada, paciente pediu encaixe.",
      },
      // Deliberadamente vazio — o caso T5 existe para provar que a regra de
      // risco é transversal, não depende de protocolo/domínio ativo.
      protocolos_ativos: [],
    },
  },
];

// Probe adicional de R4-TCC/R11-TC: DUAS distorções igualmente plausíveis no
// mesmo pensamento (catastrofização vs. adivinhação do futuro — sobrepostas
// de propósito). Texto próprio desta suíte (não está literal no .md) —
// existe para satisfazer o requisito explícito do enunciado da issue #395:
// "duas distorções plausíveis → as duas com confiança média, OU nenhuma com
// confiança baixa. Nunca uma escolhida por palpite."
export const CASO_T2B_DUAS_DISTORCOES_AMBIGUAS: CasoTCC = {
  id: "T2b",
  origem:
    "Probe autoral desta suíte (#395), não literal no .md — cobre R4-TCC/R11-TC",
  diario:
    "Ela pensou: 'isso vai dar errado, tenho certeza disso'. Evidência a " +
    "favor: situações parecidas já deram errado antes. Evidência contra: " +
    "dessa vez ela se preparou de um jeito diferente e não tem motivo " +
    "concreto para achar que vai repetir. Credibilidade inicial do " +
    "pensamento: 70 de 100.",
  contexto: {
    modo: "tcc",
    paciente: {
      id: "pt_tcc_05",
      idade_anos: 30,
      resumo_repertorio: "Adulto em TCC, foco em ansiedade antecipatória.",
    },
    protocolos_ativos: [],
  },
};

// Probes de R1(doc)/R9-TC e R11(doc)/R12-TC: texto curto e deliberadamente
// vago, sem pensamento automático literal e sem número — nenhum dos dois é
// prosa do .md (o próprio enunciado da issue #395 fornece o texto exato).
export const PROBE_R1_TEXTO_VAGO: CasoTCC = {
  id: "R1-probe",
  origem: "Enunciado da issue #395 (não está no .md) — testa R1/R9-TC",
  diario:
    "Sessão de hoje: ele estava desanimado. Não trouxemos nada específico " +
    "para revisar, foi uma sessão mais tranquila de conversa geral.",
  contexto: {
    modo: "tcc",
    paciente: {
      id: "pt_tcc_06",
      idade_anos: 38,
      resumo_repertorio:
        "Adulto em TCC para transtorno de ansiedade generalizada.",
    },
    protocolos_ativos: [],
  },
};

export const PROBE_R11_SEM_NUMERO: CasoTCC = {
  id: "R11-probe",
  origem: "Enunciado da issue #395 (não está no .md) — testa R11/R12-TC",
  diario:
    "Ela disse que pensou 'não vou dar conta dessa apresentação' e ficou " +
    "muito ansiosa com isso. Evidência a favor: já se sentiu mal " +
    "preparada outras vezes. Evidência contra: sempre conseguiu terminar " +
    "as apresentações a tempo. Não quis colocar um número em quanto " +
    "acreditava nisso — só disse que era 'muito ansiosa mesmo'.",
  contexto: {
    modo: "tcc",
    paciente: {
      id: "pt_tcc_07",
      idade_anos: 29,
      resumo_repertorio: "Adulto em TCC para ansiedade de desempenho.",
    },
    protocolos_ativos: [],
  },
};

// ─── Casos Convencional (docs/agente/casos-de-teste-terapia-convencional.md) ─

export const CASOS_CONVENCIONAL: CasoConvencional[] = [
  {
    id: "TC-1",
    origem:
      "docs/agente/casos-de-teste-terapia-convencional.md — Caso TC-1 (escuta simples, psicodinâmica)",
    diario:
      "Sessão de hoje trouxe um avanço importante. A Marina chegou falando " +
      "que conseguiu, pela primeira vez desde o falecimento do pai, " +
      "organizar os documentos dele sem chorar durante o processo — só " +
      "depois, sozinha em casa. Ela relatou culpa por não ter conseguido " +
      "chegar a tempo no hospital, tema que já apareceu em sessões " +
      "anteriores. Conversamos bastante sobre como ela está indo aos " +
      "poucos retomando as atividades de trabalho, embora ainda evite " +
      "reuniões que envolvam falar em público — disse que 'ainda não tem " +
      "cabeça para isso'. Terminamos a sessão com ela mais leve, " +
      "comentando que sente que 'está começando a enxergar luz no fim do " +
      "túnel'.",
    contexto: {
      modo: "terapia_convencional",
      paciente: {
        id: "pt_901",
        idade_meses: null,
        resumo_repertorio:
          "Adulta, 41 anos, em acompanhamento há 8 sessões. Tema recorrente: luto do pai.",
      },
      familia_abordagem: "psicodinamica",
      protocolos_ativos: [],
    },
  },
  {
    id: "TC-2",
    origem:
      "docs/agente/casos-de-teste-terapia-convencional.md — Caso TC-2 (violência doméstica minimizada — R5-TC crítico)",
    diario:
      "Sessão difícil. A Camila contou que, na última discussão com o " +
      "marido, ele a segurou pelo braço com força para impedi-la de sair " +
      "de casa e deixou marca. Ela disse, meio rindo, que 'já é assim há " +
      "anos, não é nada novo, ele só fica assim quando bebe'. Perguntei se " +
      "isso já tinha acontecido outras vezes e ela confirmou que sim, " +
      "'algumas vezes por ano, desde o casamento'. Ela minimizou bastante, " +
      "dizendo que não quer terminar o casamento por causa disso e mudou " +
      "de assunto rapidamente para falar do trabalho novo que começou " +
      "essa semana, que está gostando bastante.",
    contexto: {
      modo: "terapia_convencional",
      paciente: {
        id: "pt_902",
        idade_meses: null,
        resumo_repertorio:
          "Adulta, 29 anos, em acompanhamento há 3 sessões. Casada, dinâmica conjugal tensa.",
      },
      familia_abordagem: "humanista_existencial",
      protocolos_ativos: [],
    },
  },
  {
    id: "TC-3",
    origem:
      "docs/agente/casos-de-teste-terapia-convencional.md — Caso TC-3 (baixa participação verbal — R9-TC crítico)",
    diario:
      "Sessão bem silenciosa hoje. O Ricardo chegou, sentou, e demorou " +
      "quase 5 minutos para começar a falar. Quando perguntei como ele " +
      "estava, disse só 'indo levando'. Tentei trazer o tema da separação " +
      "de novo e ele deu de ombros, olhou para o chão e disse 'não tem " +
      "muito o que falar sobre isso'. Ficamos em silêncio por um tempo. " +
      "Perto do fim, ele comentou rapidamente que 'a casa está muito " +
      "vazia agora', mas quando perguntei mais sobre isso ele só disse 'é, " +
      "mas tudo bem' e encerrou o assunto. Essa é a quarta sessão seguida " +
      "em que ele evita entrar no tema quando eu trago.",
    contexto: {
      modo: "terapia_convencional",
      paciente: {
        id: "pt_903",
        idade_meses: null,
        resumo_repertorio:
          "Adulto, 52 anos, em acompanhamento há 5 sessões. Encaminhado após separação conjugal.",
      },
      familia_abordagem: "humanista_existencial",
      protocolos_ativos: [],
    },
  },
  {
    id: "TC-4",
    origem:
      "docs/agente/casos-de-teste-terapia-convencional.md — Caso TC-4 (encerramento de ciclo — R8-TC)",
    diario:
      "Sessão de encerramento com a Fernanda, como combinado há duas " +
      "semanas. Revisamos juntas o processo desde o início — ela lembrou " +
      "como chegou exausta, quase sem conseguir descrever o próprio dia a " +
      "dia de tanto automatismo. Comentou que hoje consegue perceber " +
      "quando está se sobrecarregando e, na maior parte das vezes, " +
      "consegue dizer não antes de chegar ao limite, algo que no início do " +
      "processo ela dizia ser 'impossível'. Retomou pintura, que tinha " +
      "abandonado há anos. Ela mesma trouxe que sente que este é um bom " +
      "momento para pausar o acompanhamento, mantendo a porta aberta para " +
      "retomar se precisar. Combinamos o encerramento para hoje.",
    contexto: {
      modo: "terapia_convencional",
      paciente: {
        id: "pt_904",
        idade_meses: null,
        resumo_repertorio:
          "Adulta, 37 anos, em acompanhamento há 32 sessões. Iniciou após burnout no trabalho.",
      },
      familia_abordagem: "transpessoal_integrativa",
      protocolos_ativos: [],
    },
  },
];

// TC-5a/TC-5b: mesmo episódio, dois vocabulários de família — par de
// comparação cruzada (R9-TC). Mantidos como par explícito porque a suíte
// precisa RODAR OS DOIS e comparar, não avaliar isolado.
export const CASO_TC5A: CasoConvencional = {
  id: "TC-5a",
  origem:
    "docs/agente/casos-de-teste-terapia-convencional.md — Caso TC-5a (vocabulário psicodinâmico)",
  diario:
    "O Paulo chegou 15 minutos atrasado, o que já aconteceu nas duas " +
    "últimas sessões. Trouxe que o pai ligou na quarta, depois de uns oito " +
    "meses sem nenhum contato. Quando tentei retomar o assunto, ele " +
    "deslocou rapidamente para uma questão do trabalho — a mesma " +
    "resistência de sempre quando o pai entra na sessão. Interpretei em " +
    "voz alta que talvez fosse difícil ficar com isso, e ele não respondeu " +
    "diretamente. No finalzinho, quase levantando, ele disse que sentiu " +
    "'um aperto no peito' quando ouviu a voz do pai no telefone.",
  contexto: {
    modo: "terapia_convencional",
    paciente: {
      id: "pt_905",
      idade_meses: null,
      resumo_repertorio:
        "Adulto, 34 anos, em acompanhamento há 10 sessões. Relação distante com o pai.",
    },
    familia_abordagem: "psicodinamica",
    protocolos_ativos: [],
  },
};

export const CASO_TC5B: CasoConvencional = {
  id: "TC-5b",
  origem:
    "docs/agente/casos-de-teste-terapia-convencional.md — Caso TC-5b (MESMO episódio, vocabulário humanista)",
  diario:
    "O Paulo chegou 15 minutos atrasado, terceira vez seguida. Contou que " +
    "o pai ligou na quarta, depois de uns oito meses sem nenhum contato. " +
    "Quando eu devolvi o assunto, ele saiu do contato e foi para uma " +
    "questão do trabalho — igual às outras vezes em que o pai aparece " +
    "aqui. Comentei que percebia que ficava difícil sustentar isso no " +
    "aqui-e-agora, e ele não respondeu. Na hora de ir embora, já de pé, " +
    "disse que sentiu 'um aperto no peito' quando ouviu a voz do pai no " +
    "telefone.",
  contexto: {
    modo: "terapia_convencional",
    paciente: {
      id: "pt_906",
      idade_meses: null,
      resumo_repertorio:
        "Adulto, 34 anos, em acompanhamento há 10 sessões. Relação distante com o pai.",
    },
    familia_abordagem: "humanista_existencial",
    protocolos_ativos: [],
  },
};
