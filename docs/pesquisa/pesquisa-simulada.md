# Pesquisa Simulada — Projeto Espectro

## Metodologia e limites (leia antes de tudo)

Estas entrevistas são **simuladas**: personas sintéticas construídas a partir de conhecimento de domínio sobre clínicas de intervenção infantil no Brasil, prática ABA/TO/Fono e os protocolos citados. Elas servem para **gerar hipóteses e antecipar riscos de design antes do MVP** — não substituem pesquisa real. Todo achado abaixo é uma hipótese com grau de confiança atribuído. A seção final traz os roteiros para você validar com pessoas reais pós-MVP, priorizando os achados de menor confiança.

Painel: 2 especialistas em protocolos, 4 terapeutas (AT/ABA, Fono, TO, supervisora ABA), 2 coordenadores, 3 responsáveis.

---

## Grupo 1 — Especialistas em protocolos

### E1 · "Dra. Camila" — BCBA-D, 15 anos, supervisora certificada, aplica VB-MAPP há uma década

**Sobre a extração automática a partir do diário:**
> "O conceito está certo, mas tem um erro conceitual perigoso na sua lógica: anotação de sessão **não pontua marco**. O VB-MAPP tem critérios formais — o Mando nível 1-M2, por exemplo, exige X mandos diferentes em condições específicas, sem dica além de 'o que você quer?'. Uma criança pedir 'ajuda' uma vez numa terça-feira é **evidência a favor** do marco, não o marco atingido. Se o seu gráfico pintar o marco porque a IA viu uma frase, vocês vão gerar avaliações infladas e perder toda a credibilidade clínica."

> "O fluxo certo: a IA acumula evidências por marco, com data e nível de ajuda. Quando o acúmulo sugere que o critério formal pode ter sido atingido, ela sinaliza 'candidato a avaliação'. Aí o terapeuta — na janela de avaliação formal, que costuma ser semestral — testa e pontua. O que muda no dia a dia é que ele chega na avaliação com o dossiê pronto, em vez de começar do zero."

**Sobre o que validar na saída da IA:**
> "O nível de ajuda que vocês modelaram está correto e é o que separa produto sério de brinquedo. Acrescentaria: registrar se a resposta foi em ambiente estruturado (mesa, tentativa discreta) ou natural (NET) — o VB-MAPP diferencia isso em vários marcos. E o Barriers do VB-MAPP é um instrumento próprio com 24 barreiras pontuadas de 0-4; seus registros ABC alimentam essa avaliação, não a substituem. Mesma lógica: evidência acumula, avaliação é formal."

> "Uma coisa que narrativa não captura bem: **frequência**. 'Fez vários mandos' não serve para taxa de mando/hora, que é um dado clássico. Não tentem extrair número de texto vago — marquem como 'frequência não informada' e deixem o terapeuta preencher se quiser. Pior que dado ausente é dado inventado."

### E2 · "Dr. Rafael" — psicólogo, certificado ESDM (Denver), equipe interdisciplinar

> "O Denver não funciona como o VB-MAPP. No ESDM a gente escreve **objetivos individualizados por período de 12 semanas** a partir do checklist do currículo, e coleta dado por objetivo, por sessão. Ou seja: a unidade do dia a dia não é o marco do protocolo, é a **meta do plano de intervenção da criança** (o PEI). Se o seu sistema só conhece 'marcos do protocolo', ele não modela como metade das clínicas trabalha. Modele: Protocolo → gera → Metas individualizadas → recebem → evidências das sessões. O marco é a régua; a meta é o trabalho."

> "Isso resolve seu problema multidisciplinar de graça: a TO e a fono podem ter metas no mesmo plano da criança, mesmo sem protocolo VB-MAPP. O diário e a extração funcionam contra metas; o mapeamento para protocolo é uma camada a mais quando existir."

**Validação dos outputs dos cenários de exemplo:** ambos os especialistas confirmaram as extrações esperadas (Leo, Sofia, Lucas, Miguel) como corretas, com duas correções: (1) no cenário do Leo, "ajuda" espontâneo é evidência de mando *e* de comunicação social — a dupla contagem é desejável; (2) no cenário da Sofia, a resposta ao nome na 3ª tentativa deve registrar as duas falhas anteriores como parte da evidência (latência de resposta importa), não só o acerto.

---

## Grupo 2 — Terapeutas

### T1 · "Aline" — 27, acompanhante terapêutica ABA, 7-8 atendimentos/dia em clínica média

> "Eu atendo de 8h às 18h com 10 minutos entre sessões, que na prática viram 3, porque tem troca de sala, criança que não quer sair, pai querendo conversar. **Eu não registro entre sessões. Eu registro tudo no fim do dia**, de memória, e é aí que a qualidade cai. Se eu pudesse ditar áudio de 1 minuto no corredor logo depois da sessão, enquanto está fresco, e organizar tudo no fim do dia, seria perfeito."

> "Só que tem um detalhe: corredor tem pai, tem outra criança, tem recepção. Eu não posso falar 'o João bateu na irmã' em voz alta. Ou eu dito num canto, ou digito. O app precisa aceitar os dois e nunca pode perder um áudio."

> "Uma coisa que me daria medo: se a coordenadora recebe relatório de quanto eu preencho e quando, isso vira ferramenta de cobrança. Eu ia querer saber exatamente o que ela vê de mim."

**Sobre agenda:** "Meu dia começa olhando minha grade. Se o app não sabe quem eu atendo hoje, eu tenho que criar sessão na mão toda vez — aí eu desisto na primeira semana. A grade já existe (hoje é planilha da recepção); o app precisa dela dentro, nem que seja simples."

### T2 · "Bruno" — 34, fonoaudiólogo, atende TEA e apraxia de fala

> "VB-MAPP eu conheço e uso os operantes verbais como referência, mas meu registro diário é sobre **metas fonoaudiológicas**: inventário fonético, inteligibilidade, praxias. Se o produto só funcionar 'mapeando pro VB-MAPP', para mim ele vira um diário bonito e nada mais. Agora, se a IA organizar minhas anotações por **metas da criança**, uso no dia um. O protocolo é um detalhe da equipe ABA; a meta é universal."

### T3 · "Marina" — TO, 12 anos, formação em integração sensorial

> "O episódio da sirene no seu exemplo da Sofia — aquilo para mim é ouro. Perfil sensorial, estratégia de regulação que funcionou, tempo de regulação. Terapeuta ocupacional vive disso e ninguém registra estruturado. Se a IA extrair eventos sensoriais com gatilho + resposta + estratégia + duração, vocês têm um diferencial que nenhuma planilha de ABA tem."

### T4 · "Paula" — psicóloga ABA sênior, supervisora de campo, faz as avaliações formais

> "Aprovar extração por extração, todo dia, oito pacientes? Na segunda semana eu aprovo tudo sem ler — e você sabe disso. O desenho certo: alta confiança pré-selecionada para aprovar em lote, baixa confiança destacada uma a uma, e **me mostre só o que discorda do padrão histórico da criança**. Se a IA diz que o Miguel fez tato independente e ele nunca fez nem com dica, isso pisca. O resto flui."

> "E confirmo o que a Camila disse: se vocês deixarem gráfico de protocolo se pintar sozinho, nenhum supervisor sério adota. Evidência acumulada + candidato a avaliação é o desenho certo."

---

## Grupo 3 — Coordenadores

### C1 · "Fernanda" — coordenadora clínica, 25 terapeutas, ~80 pacientes ativos

> "Todo software me vende dashboard. Eu não tenho 2 horas para olhar 80 gráficos. O que eu preciso quando sento às 7h30: **quais 5 pacientes precisam da minha atenção hoje e por quê**. Estagnação, aumento de comportamento-barreira, terapeuta há uma semana sem registrar, queda de frequência da família. Lista priorizada, motivo em uma linha, clico e vejo o caso. Dashboard é o drill-down, não a entrada."

> "Para supervisão quinzenal com o terapeuta, o que eu monto hoje na mão: últimas sessões, o que evoluiu, o que travou, os episódios de comportamento. Se o sistema me der esse 'pacote de supervisão' pronto por paciente, só isso já paga a assinatura."

> "Sobre a taxa de preenchimento: eu preciso dela, mas concordo que não pode parecer vigilância. Enquadrem como qualidade do prontuário, deixem o terapeuta ver a própria métrica, e me deem o agregado."

### C2 · "Diego" — dono e coordenador de clínica pequena, 6 terapeutas, convênios

> "Vou te falar o relatório que importa de verdade: **o do convênio**. Toda autorização de continuidade de tratamento exige relatório periódico por paciente. Hoje isso consome dias meus, todo trimestre. O relatório para a família é simpático; o relatório para a operadora é o que mantém a clínica viva. Se a mesma base de evidências gerar os dois, vocês têm meu cartão de crédito hoje."

> "E clínica pequena não tem 'coordenador' separado — sou eu, atendendo e coordenando. Os papéis do sistema precisam acumular na mesma pessoa."

---

## Grupo 4 — Pais e responsáveis

### P1 · "Juliana" — mãe do Théo (4 anos), muito engajada, grupos de WhatsApp

> "O que eu recebo hoje é ou nada, ou um relatório técnico que eu não entendo ('operante verbal', 'pareamento'). O que eu quero saber: **o que ele conquistou, o que estão trabalhando agora, e o que eu posso fazer em casa para ajudar**. Essa terceira parte ninguém me dá, e é a que eu mais quero."

> "E chega para mim por WhatsApp, PDF. Eu não vou baixar mais um app, nem criar mais um login. Sério."

### P2 · "Marcos" — pai da Alice (6 anos), engenheiro

> "Eu sou o chato dos dados: quero ver o gráfico, a tendência, o antes e depois. Minha esposa detesta, quer o resumo humano. O ideal é o resumo vir com um anexo opcional com os dados. E uma coisa importante: mês sem avanço, **me conta**. Eu percebo quando estão dourando a pílula, e isso mina a confiança em tudo que veio antes."

### P3 · "Rosana" — avó e responsável legal do Pedro (5 anos), baixa familiaridade digital

> "Se vier texto grande, eu não leio. Se vier coisa com número, eu não entendo. O que a psicóloga faz que funciona: me conta uma coisa que o Pedro fez de novo esse mês, tipo 'ele agora pede água com palavra'. Uma coisa. Aí eu choro, aí eu entendo."

---

## Síntese — temas, confiança e implicação no produto

**Tema 1 · Evidência acumula; pontuação formal é ato clínico** (confiança alta — consenso E1/E2/T4).
O maior risco do desenho atual: gráfico de protocolo preenchido pela IA = avaliação inflada = rejeição pelos supervisores. Mudança: a IA acumula evidências por marco/meta e sinaliza "candidato a avaliação"; a pontuação do marco é feita pelo terapeuta, tipicamente em janelas formais, com o dossiê de evidências pronto. **Muda a proposta de valor: de "a IA preenche o protocolo" para "você chega na avaliação com o dossiê pronto".**

**Tema 2 · A meta individualizada (PEI) é a unidade do dia a dia; o protocolo é a régua periódica** (confiança alta — E2, T2, T4).
Modelar Meta como entidade central entre o diário e o protocolo resolve o Denver/ESDM, inclui TO e Fono sem protocolo mapeado, e reflete como clínicas reais trabalham.

**Tema 3 · Sem agenda mínima, não há adoção** (confiança alta — T1, C1).
O diário nasce de uma sessão agendada. MVP precisa de cadastro de pacientes + grade de sessões simples (recorrência semanal) + check-in. Não é um módulo de agendamento completo — é o esqueleto que dá contexto ao diário.

**Tema 4 · O registro real acontece em dois tempos** (confiança média-alta — T1).
Áudio curto imediato ("captura") + organização no fim do dia ("consolidação") em fila de pendências. Ditado tem restrição de privacidade em corredor — texto e áudio são alternativas iguais, e áudio nunca pode ser perdido.

**Tema 5 · Coordenador entra por exceções, não por dashboard** (confiança alta — C1).
Entrada = lista priorizada de "pacientes que precisam de atenção + motivo". Dashboard é drill-down. O "pacote de supervisão" por paciente é o entregável mais valioso do módulo.

**Tema 6 · O relatório do convênio é o job-to-be-done econômico** (confiança média — C2; validar cedo em pesquisa real).
Mesma base de evidências, dois relatórios: família (empático) e operadora (técnico, periódico). Fora do MVP, mas o schema do FamilyReport deve generalizar para Report com tipo.

**Tema 7 · Métricas de preenchimento sem enquadramento viram vigilância** (confiança média-alta — T1, C1).
Terapeuta vê a própria métrica; coordenador vê agregado e casos críticos; comunicação explícita do que cada papel enxerga.

**Tema 8 · Relatório da família: conquistas + "como ajudar em casa" + honestidade em platôs + PDF via WhatsApp** (confiança média-alta — P1/P2/P3).
Sem portal, sem login (valida o corte já feito). Estrutura: 1 conquista em destaque, o que está sendo trabalhado, como apoiar em casa, dados opcionais em anexo. Nunca dourar a pílula.

**Tema 9 · Eventos sensoriais são diferencial de TO** (confiança média — T3).
Registro ABC estendido: gatilho sensorial + resposta + estratégia de regulação + duração já cabem no formato atual; só garantir que a taxonomia de barreiras não seja exclusivamente comportamental.

**Tema 10 · Revisão por exceção contra o histórico da criança** (confiança alta — T4).
Além de confiança da extração, comparar com o padrão histórico: sugestão inconsistente com o repertório conhecido ganha fricção extra. Confirma e refina o desenho anti-rubber-stamping.

### Ordem de implementação revisada (consenso do painel)

1. Pacientes + agenda mínima (grade semanal, check-in de sessão)
2. Diário por texto ligado à sessão + fila de pendências do dia
3. Extração + tela de revisão (metas primeiro, protocolo como camada)
4. Metas/PEI + acúmulo de evidências + gráfico de protocolo (com "candidatos a avaliação")
5. Coordenador: lista de exceções + pacote de supervisão
6. Relatório da família (PDF exportável)
7. Ditado por voz (captura rápida) + polish + LGPD hardening
Fast-follow pós-MVP: relatório de convênio; avaliação formal assistida (janela de pontuação com dossiê).

---

## Roteiros para pesquisa real (pós-MVP)

Regras gerais: 45-60 min, gravadas com consentimento, 5-8 participantes por grupo. Nunca pergunte "você usaria?" — pergunte sobre comportamento passado e observe reação a protótipo. Priorize validar os temas de confiança média (6, 9) e os pressupostos de disposição a pagar.

### Roteiro A — Especialista em protocolos (validar outputs da IA)
Aquecimento: trajetória, protocolos que aplica, papel nas avaliações.
Contexto: como é hoje uma janela de avaliação formal? Quanto tempo consome? O que você consulta para pontuar?
Mergulho: mostre 3 diários reais anonimizados + a extração da IA. Peça para corrigir item a item ("o que está errado aqui? o que falta?"). Anote taxa de concordância por operante. Pergunte: "com que evidência acumulada você se sentiria confortável em ver um marco marcado como 'candidato'?"
Reação: mostre o gráfico de protocolo com marcos "candidatos". "O que esse visual te faz acreditar sobre a criança? Onde ele te enganaria?"
Encerramento: "o que faria você recomendar contra esse produto para uma clínica?"

### Roteiro B — Terapeutas (jornada, agenda, áudio)
Aquecimento: rotina de um dia típico, nº de atendimentos, intervalos reais.
Contexto: "me mostra (ou descreve) o último registro de sessão que você fez. Quando fez? Quanto demorou? O que você deixou de fora por falta de tempo?"
Mergulho: reconstitua o dia de ontem hora a hora — onde o registro realmente aconteceu. Explore áudio: "você gravaria um áudio de 1 min após a sessão? Onde estaria fisicamente? Quem estaria por perto?" Explore agenda: quem monta a grade, como fica sabendo de mudanças.
Reação: teste de usabilidade da tela de revisão com extração real de um diário que a própria pessoa escreveu na hora (tarefa: aprovar/corrigir). Meça tempo e onde hesita. Pergunta crítica: "o que a sua coordenadora deveria e NÃO deveria ver sobre isso?"
Encerramento: "se esse app sumisse depois de um mês de uso, o que você sentiria falta?"

### Roteiro C — Coordenadores (insights, supervisão, disposição a pagar)
Aquecimento: tamanho da equipe, carteira, rotina de coordenação.
Contexto: "como você descobriu o último paciente que estava estagnado? Quanto tempo levou entre o fato e você saber?"
Mergulho: reunião de supervisão — o que você prepara, quanto tempo leva, o que sempre falta. Relatórios de convênio: quais operadoras, formato exigido, quem escreve, quanto tempo por trimestre (validar Tema 6 com números).
Reação: mostre a lista de exceções priorizada e o pacote de supervisão. "O que está aqui que você não usaria? O que falta para substituir seu processo atual?" Pergunte preço por terapeuta/mês só no final, depois de valor percebido.
Encerramento: "quem além de você decidiria a compra?"

### Roteiro D — Pais/responsáveis (recepção de resultados)
Recrutamento: variar escolaridade e familiaridade digital; incluir ao menos 1 responsável não-pai/mãe. Cuidado ético: tema sensível, deixar claro que não é avaliação da criança.
Aquecimento: rotina de terapias da criança (quantas horas/semana, há quanto tempo).
Contexto: "qual foi a última informação que a clínica te deu sobre a evolução? Como chegou? O que você fez com ela?"
Mergulho: "me conta uma vez que você recebeu uma notícia boa da terapia. E uma vez que sentiu que estavam te escondendo algo ou enfeitando." Como prefere receber: canal, frequência, tamanho.
Reação: mostre 2 versões do relatório (resumo humano vs. resumo + dados) e um exemplo de mês SEM avanço escrito com honestidade acolhedora. "Como isso te faz sentir? O que você faria depois de ler?"
Encerramento: "o que você nunca gostaria de ler num relatório desses?"

---

## O que só a pesquisa real pode responder

Disposição a pagar e modelo de preço (nenhuma simulação vale aqui); a taxa real de concordância especialista × IA (base do produto — medir com diários reais); se o registro em dois tempos (captura + consolidação) se sustenta após a novidade passar; o peso real do relatório de convênio na decisão de compra; e a reação emocional genuína das famílias a relatórios de platô — o item mais delicado e menos simulável de todos.
