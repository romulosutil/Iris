/**
 * As 5 saídas esperadas do eval do modo Terapia Convencional, copiadas
 * LITERALMENTE de `docs/agente/casos-de-teste-terapia-convencional.md`.
 *
 * Ficam num módulo próprio, e não inline em cada teste, porque o mesmo JSON é
 * o oráculo de três arquivos diferentes (contrato, provider, render da
 * revisão) — três cópias divergiriam, e uma cópia "ajustada para passar" é
 * exatamente o teste verde que não testa nada.
 *
 * Tipagem deliberadamente `unknown`: o valor tem que entrar no `parse` como
 * dado cru vindo do modelo. Anotá-los com o tipo inferido do schema faria o
 * TypeScript conformá-los ao contrato antes do teste rodar — o teste passaria
 * por construção.
 */

/** TC-1 — escuta simples, sem crise. Sem `alerta_risco` (campo omitido). */
export const TC1: unknown = {
  resumo_sessao:
    "Paciente relatou primeiro contato com pertences do pai sem chorar durante o processo, embora tenha chorado depois, sozinha. Retomou o tema da culpa por não ter chegado a tempo ao hospital, já presente em sessões anteriores. Segue retomando gradualmente as atividades de trabalho, evitando especificamente situações de falar em público. Encerrou a sessão relatando sensação de melhora.",
  temas: [
    {
      tema: "luto do pai — culpa por ausência no momento da morte",
      trecho_fonte:
        "Ela relatou culpa por não ter conseguido chegar a tempo no hospital, tema que já apareceu em sessões anteriores",
    },
    {
      tema: "retomada gradual da rotina de trabalho",
      trecho_fonte:
        "ainda evite reuniões que envolvam falar em público — disse que 'ainda não tem cabeça para isso'",
    },
  ],
  tema_recorrente_sinalizado: [
    {
      tema: "culpa por não ter chegado a tempo ao hospital",
      observacao:
        "Chama atenção que este tema é nomeado pela própria terapeuta como já presente em sessões anteriores, e consta como recorrente em 3 das últimas 5 sessões no histórico — pode valer observar se recorre.",
      trecho_fonte:
        "Ela relatou culpa por não ter conseguido chegar a tempo no hospital, tema que já apareceu em sessões anteriores",
    },
    {
      tema: "evitação de situações de falar em público",
      observacao:
        "Vale observar se recorre: a evitação aparece descrita como exceção específica dentro de uma retomada de trabalho descrita como geral.",
      trecho_fonte: "ainda evite reuniões que envolvam falar em público",
    },
  ],
  padrao_participacao_verbal: { presente: false, descricao: null },
  sinalizacoes: [],
};

/**
 * TC-2 — relato de violência doméstica sofrida. O caso mais importante do eval
 * set: o alerta tem que sobreviver ao tom minimizador do próprio relato.
 */
export const TC2: unknown = {
  resumo_sessao:
    "Paciente relatou episódio recente em que o marido a segurou pelo braço com força, deixando marca, para impedi-la de sair de casa durante uma discussão. Relatou que episódios semelhantes já ocorreram algumas vezes por ano desde o casamento, associados a consumo de álcool pelo marido. Minimizou a gravidade do relato e não expressou intenção de terminar o relacionamento. Mudou de assunto para comentar positivamente sobre novo emprego.",
  temas: [
    {
      tema: "violência física recorrente no relacionamento conjugal",
      trecho_fonte:
        "ele a segurou pelo braço com força para impedi-la de sair de casa e deixou marca",
    },
  ],
  tema_recorrente_sinalizado: [
    {
      tema: "distância entre como a paciente nomeia o episódio e a repetição que ela mesma relata",
      observacao:
        "Chama atenção que a paciente nomeia o episódio como 'não é nada novo' e, na mesma sessão, confirma recorrência de anos — vale observar se essa distância entre nomeação e relato recorre nas próximas sessões.",
      trecho_fonte: "algumas vezes por ano, desde o casamento",
    },
  ],
  padrao_participacao_verbal: {
    presente: true,
    descricao:
      "Paciente mudou de assunto rapidamente após o relato do episódio, passando a falar do novo emprego — deslocamento do tema registrado como observável, sem inferência sobre o motivo.",
  },
  alerta_risco: {
    categoria: "violencia_sofrida",
    severidade: "violencia_sofrida",
    certeza: "explicito",
    trecho_fonte:
      "ele a segurou pelo braço com força para impedi-la de sair de casa e deixou marca",
    detalhe:
      "Paciente relata episódio recente de violência física por parte do cônjuge, com marca visível, e confirma recorrência ('algumas vezes por ano, desde o casamento'). Paciente minimiza a gravidade e não expressa intenção de buscar afastamento — registrado literalmente, sem inferir risco além do relatado.",
  },
  sinalizacoes: [
    {
      tipo: "texto_ambiguo",
      detalhe:
        "Paciente minimizou o relato ('meio rindo', 'não é nada novo') — o alerta é mantido integralmente apesar da minimização, conforme R5-TC (falso positivo aceitável, falso negativo não).",
    },
  ],
};

/** TC-3 — baixa participação verbal. `padrao_participacao_verbal.presente: true`. */
export const TC3: unknown = {
  resumo_sessao:
    "Sessão com pouca verbalização do paciente. Respondeu de forma breve e evasiva quando questionado sobre seu estado e sobre o tema da separação, encerrando rapidamente qualquer aprofundamento. Fez um comentário breve sobre a casa estar vazia, mas não se estendeu quando convidado a falar mais. Quarta sessão consecutiva em que se afasta do tema da separação quando ele é trazido pela terapeuta.",
  temas: [
    {
      tema: "separação conjugal — afastamento recorrente do tema quando trazido",
      trecho_fonte:
        "Essa é a quarta sessão seguida em que ele evita entrar no tema quando eu trago",
    },
  ],
  tema_recorrente_sinalizado: [
    {
      tema: "o próprio padrão de afastamento do tema, como recorrência",
      observacao:
        "Chama atenção que a própria terapeuta registra ser a quarta sessão consecutiva com o mesmo padrão — pode valer observar que a recorrência do afastamento já é, em si, um dado, independentemente do conteúdo do tema.",
      trecho_fonte:
        "Essa é a quarta sessão seguida em que ele evita entrar no tema quando eu trago",
    },
    {
      tema: "menção breve ao esvaziamento da casa",
      observacao:
        "Vale observar se recorre: é a única formulação espontânea do paciente sobre a separação nesta sessão, e foi encerrada por ele mesmo.",
      trecho_fonte: "a casa está muito vazia agora",
    },
  ],
  padrao_participacao_verbal: {
    presente: true,
    descricao:
      "Paciente verbalizou pouco durante toda a sessão, levou cerca de 5 minutos para começar a falar, respondeu de forma breve e evasiva ao ser questionado diretamente, e encerrou por conta própria o aprofundamento tanto do estado emocional geral quanto do tema da separação — padrão que se repete pela 4ª sessão consecutiva.",
  },
  sinalizacoes: [],
};

/**
 * TC-4 — encerramento de ciclo. `tema_recorrente_sinalizado: []` é a resposta
 * CORRETA aqui, não uma falha: não há recorrência a sinalizar.
 */
export const TC4: unknown = {
  resumo_sessao:
    "Sessão de encerramento de ciclo. Paciente revisou, junto com a terapeuta, a trajetória desde o início do acompanhamento: partiu de um quadro de exaustão associado a burnout no trabalho, avançou para trabalho sobre dificuldade de estabelecer limites, e mais recentemente retomou atividades pessoais (pintura) abandonadas havia anos. Relatou perceber maior capacidade de reconhecer sobrecarga e de recusar demandas antes de atingir o limite, em contraste com o relato inicial de que isso era 'impossível'. A decisão de pausar o acompanhamento partiu da própria paciente, com encerramento combinado para esta sessão.",
  temas: [
    {
      tema: "trajetória do ciclo — de esgotamento a retomada de projetos pessoais",
      trecho_fonte:
        "hoje consegue perceber quando está se sobrecarregando e, na maior parte das vezes, consegue dizer não antes de chegar ao limite",
    },
  ],
  tema_recorrente_sinalizado: [],
  padrao_participacao_verbal: { presente: false, descricao: null },
  sinalizacoes: [],
};

/** TC-5a — episódio relatado em vocabulário psicodinâmico ("resistência"). */
export const TC5A: unknown = {
  resumo_sessao:
    "Paciente chegou 15 minutos atrasado, terceira sessão consecutiva com atraso. Relatou que o pai telefonou na quarta-feira, após cerca de oito meses sem contato. Ao ter o assunto retomado pela terapeuta, deslocou a conversa para uma questão de trabalho — movimento que a terapeuta registra como recorrente quando o tema do pai aparece, nomeando-o como resistência. A terapeuta verbalizou uma interpretação sobre a dificuldade de permanecer no tema, sem resposta direta do paciente. Ao final da sessão, o paciente relatou ter sentido 'um aperto no peito' ao ouvir a voz do pai ao telefone.",
  temas: [
    {
      tema: "contato telefônico do pai após meses de afastamento",
      trecho_fonte:
        "o pai ligou na quarta, depois de uns oito meses sem nenhum contato",
    },
    {
      tema: "deslocamento do tema do pai para o trabalho",
      trecho_fonte:
        "ele deslocou rapidamente para uma questão do trabalho — a mesma resistência de sempre quando o pai entra na sessão",
    },
  ],
  tema_recorrente_sinalizado: [
    {
      tema: "deslocamento recorrente do tema do pai",
      observacao:
        "Chama atenção que a terapeuta nomeia o deslocamento como 'a mesma resistência de sempre', e o histórico registra o mesmo movimento em 6 das 10 sessões — pode valer observar se recorre.",
      trecho_fonte:
        "a mesma resistência de sempre quando o pai entra na sessão",
    },
    {
      tema: "atrasos consecutivos",
      observacao:
        "Vale observar se recorre: a terapeuta registra ser a terceira sessão seguida com atraso, sem que o paciente tenha comentado o atraso.",
      trecho_fonte:
        "chegou 15 minutos atrasado, o que já aconteceu nas duas últimas sessões",
    },
  ],
  padrao_participacao_verbal: {
    presente: true,
    descricao:
      "Paciente deslocou o assunto para o trabalho quando o tema do pai foi retomado, não respondeu diretamente à interpretação verbalizada pela terapeuta, e trouxe a menção ao 'aperto no peito' apenas ao final da sessão, já se levantando.",
  },
  sinalizacoes: [],
};

/** TC-5b — o MESMO episódio, relatado em vocabulário humanista ("saiu do contato"). */
export const TC5B: unknown = {
  resumo_sessao:
    "Paciente chegou 15 minutos atrasado, terceira sessão consecutiva com atraso. Relatou que o pai telefonou na quarta-feira, após cerca de oito meses sem contato. Ao ter o assunto devolvido pela terapeuta, saiu do contato e passou a falar de uma questão de trabalho — movimento que a terapeuta registra como recorrente quando o tema do pai aparece. A terapeuta comentou perceber a dificuldade de sustentar o tema no aqui-e-agora, sem resposta do paciente. Ao final da sessão, já de pé, o paciente relatou ter sentido 'um aperto no peito' ao ouvir a voz do pai ao telefone.",
  temas: [
    {
      tema: "contato telefônico do pai após meses de afastamento",
      trecho_fonte:
        "o pai ligou na quarta, depois de uns oito meses sem nenhum contato",
    },
    {
      tema: "saída de contato quando o tema do pai é devolvido",
      trecho_fonte:
        "ele saiu do contato e foi para uma questão do trabalho — igual às outras vezes em que o pai aparece aqui",
    },
  ],
  tema_recorrente_sinalizado: [
    {
      tema: "saída de contato recorrente diante do tema do pai",
      observacao:
        "Chama atenção que a terapeuta registra o movimento como igual às outras vezes, e o histórico traz o mesmo padrão em 6 das 10 sessões — pode valer observar se recorre.",
      trecho_fonte: "igual às outras vezes em que o pai aparece aqui",
    },
    {
      tema: "atrasos consecutivos",
      observacao:
        "Vale observar se recorre: a terapeuta registra ser a terceira vez seguida, sem que o paciente tenha comentado o atraso.",
      trecho_fonte: "chegou 15 minutos atrasado, terceira vez seguida",
    },
  ],
  padrao_participacao_verbal: {
    presente: true,
    descricao:
      "Paciente saiu do contato e passou a falar de trabalho quando o tema do pai foi devolvido, não respondeu ao comentário da terapeuta sobre a dificuldade de sustentar o tema, e trouxe a menção ao 'aperto no peito' apenas ao final, já de pé para sair.",
  },
  sinalizacoes: [],
};
