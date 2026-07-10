# Série de Prompts — Projeto Espectro (MVP Terapeuta + IA)

Como usar: cole o **Bloco 0** no início de cada sessão (ou salve como contexto de projeto / CLAUDE.md). Depois rode os prompts 1→4 em ordem, colando o output relevante do prompt anterior quando indicado.

---

## Bloco 0 — Contexto Compartilhado (cole antes de qualquer prompt)

```
# CONTEXTO DO PROJETO — ESPECTRO

## O produto
SaaS para clínicas de terapia infantil (foco inicial: intervenção ABA para autismo, no Brasil).
Problema central: terapeutas gastam tempo excessivo preenchendo manualmente planilhas de
protocolos clínicos (VB-MAPP, ABLLS-R, Denver). O produto substitui esse preenchimento por
um diário de sessão em texto livre/voz, do qual uma IA extrai dados estruturados que o
terapeuta revisa e aprova.

## Escopo do MVP (não expandir sem eu pedir)
Fundação — sem isso não há adoção (nem legalidade):
0. Cadastro de pacientes com FICHA CLÍNICA ESSENCIAL (diagnóstico/hipótese,
   medicações, alergias, contatos de emergência, escola) + CONSENTIMENTO LGPD na
   admissão (tratamento de dados de menor + uso de IA no processamento + ciência
   sobre exportação de relatórios) + agenda mínima: grade semanal de sessões
   recorrentes e check-in (realizada/falta). NÃO é módulo de agendamento completo.
   O dia do terapeuta começa na sua grade.
0.5. CICLO DE VIDA DA META (pré-requisito lógico da extração): coordenador cria
   metas com o terapeuta a partir da avaliação/dossiê; estados rascunho → ativa →
   dominada → pausada → descontinuada; toda meta nasce com CRITÉRIO DE DOMÍNIO
   explícito (ex.: "3 sessões consecutivas com acerto independente") — é o critério
   que transforma acúmulo de evidências em candidata a dominada; revisão em ciclos
   de 8-12 semanas.

Jornada principal — TERAPEUTA:
1a. BRIEFING PRÉ-SESSÃO (gerado por IA sobre dados existentes): ao abrir a sessão
   na grade, resumo da última sessão, metas ativas priorizadas, alertas de manejo
   (ex.: gatilhos recentes) e reforçadores atuais do perfil de preferências.
1. Registrar diário de sessão (texto livre ou ditado) ligado à sessão da agenda,
   com fila de pendências do dia (o registro real acontece em dois tempos: captura
   rápida pós-sessão + consolidação no fim do dia).
2. IA extrai evidências e sugere o mapeamento para metas/marcos do paciente.
3. Terapeuta revisa, corrige e APROVA cada extração (em lote para alta confiança;
   uma a uma para baixa confiança ou inconsistência com o histórico da criança).
4. As evidências aprovadas ACUMULAM no gráfico do protocolo e podem marcar um
   marco como "candidato a avaliação" — nunca como atingido.

Jornada secundária — COORDENADOR (versão mínima):
5. Entrada por EXCEÇÕES, não por dashboard: lista priorizada de "pacientes que
   precisam de atenção + motivo em uma linha" (estagnação, aumento de barreiras,
   diários atrasados, queda de frequência). O dashboard consolidado é o drill-down.
6. Drill-down no perfil de um paciente: diários, evidências aprovadas e gráficos,
   com "pacote de supervisão" pronto para a reunião quinzenal (últimas sessões,
   avanços, travas, episódios de comportamento). Papéis acumulam: em clínica
   pequena, a mesma pessoa é terapeuta e coordenadora.
7. EXPORTAR RELATÓRIO do paciente (PDF, pensado para envio via WhatsApp): evolução
   em linguagem acessível para o coordenador enviar aos pais/responsáveis por fora
   do sistema. Estrutura: 1 conquista em destaque, o que está sendo trabalhado,
   "como apoiar em casa", dados/gráficos em anexo opcional. Meses sem avanço são
   tratados com honestidade acolhedora — nunca dourar a pílula. O rascunho é gerado
   por IA, mas o coordenador revisa e edita antes de exportar (human-in-the-loop).

Fora do MVP (mas o schema deve permitir): portal/login da família, envio automático
de resumos, RELATÓRIO DE CONVÊNIO/operadora e RELATÓRIO AVALIATIVO INTERDISCIPLINAR
(fast-follows prioritários — o mesmo dossiê de evidências alimenta os formatos
técnicos formais, ver artefato de referência abaixo; em clínicas pequenas é o
job-to-be-done que paga o produto), avaliação formal assistida (janela de pontuação
com dossiê), faturamento, agendamento completo.

## Decisões de arquitetura já tomadas (não questionar, apenas respeitar)
- O texto livre do diário é a FONTE DA VERDADE clínica. Dados estruturados são derivados,
  versionados e sempre rastreáveis à frase de origem.
- Nada extraído pela IA vira registro oficial sem aprovação explícita do terapeuta
  (human-in-the-loop obrigatório).
- GOVERNANÇA EM 3 CAMADAS: IA sugere → terapeuta aprova (dono da sessão) →
  coordenador valida POR EXCEÇÃO e pode RECLASSIFICAR (categoria X→Y) com
  justificativa obrigatória. Reclassificação gera nova versão da evidência
  (nunca sobrescreve), notifica o terapeuta (formação, não punição) e alimenta a
  métrica de divergência (proxy de IOA) + dataset de melhoria do agente. Fila de
  validação por exceção: baixa confiança, inconsistência com histórico, amostra
  aleatória, calibração de terapeuta novo e revisão pré-avaliação formal do
  dossiê. Texto ambíguo se DEVOLVE ao terapeuta, não se adivinha. Avaliação
  formal já realizada nunca é alterada por reclassificação.
- EVIDÊNCIA ≠ PONTUAÇÃO FORMAL: evidências aprovadas acumulam por marco/meta; a
  pontuação formal do marco (ex.: VB-MAPP tem critérios específicos por marco) é um
  ato clínico do terapeuta, tipicamente em janelas de avaliação, feito com o dossiê
  de evidências pronto. A IA pode sinalizar "candidato a avaliação", nunca pontuar.
  Proposta de valor: "chegue na avaliação com o dossiê pronto", não "a IA preenche
  o protocolo".
- A META INDIVIDUALIZADA (plano de intervenção/PEI da criança) é a unidade central
  entre o diário e o protocolo. Metas podem ou não estar mapeadas a marcos de
  protocolo — isso permite TO, Fono e abordagens como Denver/ESDM (que trabalham
  por objetivos de 12 semanas) usarem o mesmo core. O protocolo é a régua; a meta
  é o trabalho diário.
- Toda evidência carrega proveniência: trecho do diário, versão do modelo, score de
  confiança, quem aprovou e quando.
- LINHA DO TEMPO RECONSTRUÍVEL (dados conectados): as sessões de um paciente são
  numeradas sequencialmente (sessão 1, 2, ... N) e as evidências são EVENTOS
  IMUTÁVEIS ligados à sessão de origem. O estado do paciente em qualquer ponto é a
  soma das evidências até ali. Três consultas obrigatórias:
  (a) SNAPSHOT: "mostra os resultados da sessão 45" = o estado acumulado do
      repertório como era na sessão 45, mesmo estando hoje na sessão 500;
  (b) DELTA: "o que a sessão 45 acrescentou?" = os ganhos/eventos daquela sessão
      específica em relação à 44;
  (c) TRAJETÓRIA: evolução da sessão 1 até a N, por meta/domínio, com períodos de
      EVOLUÇÃO, ESTAGNAÇÃO e REGRESSÃO visíveis (regressão = evidências negativas
      ou perda de nível de independência onde antes havia acerto independente).
- PROTOCOLO É DADO, NÃO CÓDIGO: o agente de extração é genérico — ele recebe no
  contexto a definição do protocolo ativo (estrutura de domínios/marcos/escalas
  cadastrada no banco) e mapeia evidências contra ela. Adicionar um protocolo novo
  (ABLLS-R, Denver, PROC, PEDI, Perfil Sensorial...) = cadastrar sua estrutura, sem
  mudança de código nem novo prompt. O VB-MAPP é apenas a PRIMEIRA INSTÂNCIA usada
  para validar o mecanismo; nenhuma regra do sistema ou do agente pode ser
  hardcoded para ele.
- Suporte a múltiplos protocolos por paciente desde o schema (mas MVP implementa 1).
- Métricas sobre terapeutas (ex.: taxa de preenchimento) são transparentes: o
  terapeuta vê a própria métrica e sabe exatamente o que o coordenador vê
  (anti-vigilância — condição de adoção).
- MODELO ORGANIZACIONAL É GRAFO M:N COM VIGÊNCIA, não árvore:
  · 1 coordenador supervisiona N terapeutas; 1 terapeuta pode ser supervisionado
    por MAIS DE UM coordenador.
  · 1 terapeuta atende N pacientes; 1 paciente pode ser atendido por MAIS DE UM
    terapeuta (equipe interdisciplinar: ABA, Fono, TO...) e acompanhado por mais
    de um coordenador.
  · Todo vínculo (supervisão e equipe de cuidado) tem VIGÊNCIA (início/fim), para
    que a linha do tempo saiba quem supervisionava/atendia em qualquer sessão
    passada — trocas de terapeuta não podem quebrar o lastro histórico.
  · Visibilidade padrão (validar em pesquisa real): membros da equipe de cuidado
    veem o prontuário INTEGRAL do paciente (cuidado integrado), cada um editando
    apenas suas próprias sessões; coordenador vê o escopo dos terapeutas que
    supervisiona + pacientes que acompanha diretamente.

## Restrições
- Dados clínicos de MENORES → LGPD: minimização, criptografia em repouso, trilha de
  auditoria imutável, soft-delete apenas.
- VB-MAPP/ABLLS-R são instrumentos com direitos autorais: o sistema modela a ESTRUTURA
  (níveis, marcos, pontuações) sem reproduzir o conteúdo textual dos manuais. Marcos são
  cadastrados pela clínica ou via configuração, não hardcoded com texto proprietário.
- Time: 1 pessoa (eu) desenvolvendo com Claude. Priorize simplicidade operacional,
  poucas peças móveis, serviços gerenciados. O objetivo é um produto FUNCIONAL, não
  uma arquitetura para escala futura.
- Idioma do produto: português brasileiro.

## Artefato de referência: o Relatório Avaliativo Interdisciplinar
Documento real que clínicas produzem hoje (analisado a partir de um exemplar
anonimizado) e que o dossiê de evidências do sistema deve alimentar no futuro.
Estrutura típica:
- Aviso de confidencialidade em todas as páginas; identificação da criança e
  responsáveis; período avaliativo; avaliadores POR DISCIPLINA com registro
  profissional (CRP, CRFa, CREFITO, CFEP).
- Introdução com disclaimer: resultados são parâmetros para intervenção, SEM
  função de diagnóstico.
- Seção por disciplina, cada uma com seus próprios instrumentos padronizados:
  Psicologia → VB-MAPP (Marcos: pontuação X/170, escala 0 / ½ / 1; Barreiras:
  X/96, 24 barreiras em escala 0-4; grade visual colorida por reavaliação);
  Fonoaudiologia → PROC, ABFW, MBGR (pontuações por aspecto + descrição
  qualitativa); TO → PEDI (escore bruto/normativo/contínuo + nível de assistência
  por atividade de autocuidado), DCDQ, Perfil Sensorial 2 (faixas normativas
  "muito menos ↔ muito mais que os outros"); Psicopedagogia → domínios acadêmicos
  do VB-MAPP nível 3.
- Cada seção combina GRADE QUANTITATIVA + PROSA QUALITATIVA descrevendo
  repertório, dependência de dicas, variabilidade e restrições (ex.: "realiza
  tatos de forma espontânea, mas dependente de dicas ecoicas e limitados aos
  itens de sua preferência").
- Suporte a SÉRIE de reavaliações (1º a 4º teste, cada um com data, avaliador e
  cor própria na grade) e idade no teste.
- Conclusão = PLANO DE CUIDADOS: horas semanais por disciplina.
- Assinaturas: supervisor clínico (assinatura digital gov.br) + ciência dos
  responsáveis; referências bibliográficas dos instrumentos.
Implicações: (a) o dossiê de evidências deve um dia preencher esse relatório —
é o irmão maior do relatório de convênio no fast-follow; (b) o schema de
instrumentos precisa acomodar estruturas muito heterogêneas; (c) a prosa
qualitativa do relatório é o que o agente de extração alimenta com dimensões de
qualidade (variabilidade, generalização, dependência de dica).

## Métricas de sucesso do MVP
- Tempo de registro por sessão < 5 min (vs ~20 min em planilha).
- ≥ 70% das extrações da IA aprovadas sem edição.
- Zero pontuações no prontuário sem aprovação humana registrada.
```

---

## Prompt 1 — Modelo de Domínio e Arquitetura de Dados

```
Atue como um engenheiro de software especialista em modelagem de dados para healthtech.

Usando o CONTEXTO DO PROJETO acima, projete o modelo de dados do MVP.

## Tarefa
1. Modelo de domínio: entidades, relacionamentos e cardinalidades. No mínimo: Clinic,
   User (papéis ACUMULÁVEIS: terapeuta, coordenador — a mesma pessoa pode ser os
   dois), SupervisionAssignment (coordenador↔terapeuta, M:N, com vigência
   início/fim), CareTeamMembership (paciente↔profissional, M:N, com disciplina,
   papel — terapeuta ou coordenador de referência — e vigência), Patient,
   Appointment (agenda mínima: recorrência semanal + check-in
   realizada/falta), Session (a ocorrência realizada), SessionNote (o texto livre),
   Goal (meta individualizada do plano de intervenção — unidade central, com ESTADOS
   rascunho/ativa/dominada/pausada/descontinuada, CRITÉRIO DE DOMÍNIO estruturado e
   ciclo de revisão; opcionalmente mapeada a Milestones), ReinforcerProfile (perfil
   vivo de preferências/reforçadores, alimentado pelas extrações), Consent
   (consentimentos LGPD da admissão, versionados), Protocol, Milestone, Extraction
   (sugestão da IA),
   Evidence (extração aprovada, acumulada por Goal/Milestone), MilestoneAssessment
   (pontuação FORMAL do marco, ato do terapeuta em janela de avaliação, com link para
   as Evidences que a embasaram; avaliações formam SÉRIE por paciente — 1º, 2º, 3º
   teste, cada uma com data, avaliador e idade no teste, para comparação entre
   reavaliações como no relatório de referência), Report (tipo: família |
   convênio/avaliativo-futuro; conteúdo, quem revisou, quando exportou) e AuditLog.
   Deixe preparado (sem implementar) o gancho para CarePlan (horas semanais por
   disciplina, resultado da avaliação). Justifique cada entidade em 1-2 frases.
2. Resolva explicitamente estes problemas de lógica:
   a. Como um mesmo trecho do diário pode gerar evidência para MÚLTIPLAS metas/marcos?
      (ex.: "pediu 'ajuda' com contato visual" evidencia mando E comunicação social —
      dupla contagem é desejável)
   b. Como versionar evidências e avaliações quando o terapeuta corrige uma aprovação
      anterior OU quando o coordenador reclassifica (X→Y, com autor, justificativa e
      de→para)? (histórico imutável — prontuário nunca sobrescreve, só adiciona
      versão; a reclassificação recompõe snapshots afetados)
   b2. Como o acúmulo de Evidences por Milestone dispara o estado "candidato a
      avaliação" (regra simples e transparente, ex.: N evidências independentes em
      M sessões distintas), e como MilestoneAssessment consome esse dossiê?
   b3. Como o CRITÉRIO DE DOMÍNIO da meta (estruturado, ex.: "N sessões consecutivas
      com acerto independente") é avaliado deterministicamente sobre o log de
      evidências para marcar a meta como CANDIDATA A DOMINADA (decisão final é do
      coordenador na revisão de ciclo)?
   b4. LINHA DO TEMPO RECONSTRUÍVEL (padrão event-sourcing leve): evidências são
      eventos imutáveis ligados à sessão numerada. Projete como responder com boa
      performance: (a) snapshot as-of ("estado na sessão 45" estando na 500) —
      avalie recomputar o fold sob demanda vs. materializar um snapshot por sessão
      (tabela SessionSnapshot) e recomende um; (b) delta por sessão ("o que a 45
      acrescentou vs. a 44"); (c) trajetória por meta/domínio da sessão 1 à N com
      segmentação de períodos de evolução/estagnação/regressão — defina a regra de
      segmentação (ex.: janela deslizante de X sessões sem evidência positiva nova
      = estagnação; evidência negativa ou queda de independência em habilidade
      antes independente = regressão) como REGRA DETERMINÍSTICA em SQL/código,
      não como julgamento de IA. Edições/correções retroativas de evidência devem
      invalidar e recompor os snapshots afetados sem tocar no log de eventos.
   c. Como o schema de Protocol/Milestone suporta instrumentos com estruturas MUITO
      heterogêneas sem uma tabela por protocolo? Casos reais a acomodar: VB-MAPP
      (170 marcos em 3 níveis, escala 0/½/1 + componente de Barreiras com 24 itens
      0-4), ABLLS-R (domínios + tarefas), PEDI (escore bruto/normativo/contínuo +
      nível de assistência por atividade), Perfil Sensorial 2 (faixas normativas
      comparativas). Avalie JSONB vs. tabelas normalizadas e recomende um.
   d. Como fica o estado de uma Extraction: sugerida → aprovada / editada-e-aprovada /
      rejeitada. Diagrama de estados.
   e. Extraction tem DOIS tipos com estruturas diferentes: (1) evidência de marco/
      operante (com nível de ajuda: independente, dica verbal, dica visual/gestual,
      dica física; e resultado: acerto, erro, acerto-após-dica) e (2) registro de
      comportamento/barreira no formato ABC (antecedente, comportamento, duração,
      consequência) — ex.: choro de 40s na transição de atividade. O tipo (1) precisa
      acomodar evidência POSITIVA e NEGATIVA (dificuldade/falha em um marco); o tipo
      (2) precisa acomodar a AUSÊNCIA registrada de comportamentos ("zero fugas na
      sessão"). Modele isso sem duplicar a máquina de estados de aprovação.
3. DDL em PostgreSQL das 5 tabelas mais críticas, com índices e constraints.
4. Estratégia de multi-tenancy (recomendo avaliar RLS do Postgres) e permissões
   derivadas do GRAFO M:N: terapeuta vê o prontuário integral dos pacientes da sua
   equipe de cuidado (editando só as próprias sessões); coordenador vê o escopo dos
   terapeutas que supervisiona (via SupervisionAssignment vigente) + pacientes que
   acompanha diretamente. Mostre as políticas RLS que expressam isso e resolva:
   quando um vínculo ENCERRA (terapeuta sai da equipe), ele perde acesso ao
   paciente dali em diante, mas o histórico produzido por ele permanece íntegro e
   atribuído. Trilha de auditoria compatível com LGPD — incluindo registro de cada
   exportação de relatório (dado de menor saindo do sistema).

## Formato de saída
Diagrama ER em Mermaid + DDL + decisões com trade-offs (máx. 2 alternativas por decisão,
com recomendação clara). Sem código de aplicação ainda.

## Não fazer
Não projetar para os módulos fora do MVP além de deixar chaves estrangeiras preparadas.
Não sugerir microsserviços.
```

---

## Prompt 2 — Agente de Extração (pipeline + system instructions)

```
Atue como um engenheiro de IA especialista em extração estruturada com LLMs.

Usando o CONTEXTO DO PROJETO e o modelo de dados do Prompt 1 (colado abaixo), projete o
agente que transforma o diário de sessão em sugestões de evidência.

[COLE AQUI O MODELO DE DADOS DO PROMPT 1]

JÁ EXISTE UMA IMPLEMENTAÇÃO DE REFERÊNCIA (arquivo protocolos-e-agente-espectro.md):
catálogo dos protocolos com o que cada um captura, formato canônico de definição de
protocolo via contexto, system instructions com 19 regras (R1-R19), JSON Schema de
saída e o golden example executado. Cole-a abaixo e use-a como base: critique,
refine e complete — não recomece do zero.

[COLE AQUI O CONTEÚDO DE protocolos-e-agente-espectro.md]

## Tarefa
1. Pipeline completo: quando roda (ao salvar o diário, síncrono com feedback de progresso
   — o terapeuta revisa em seguida, não em batch noturno), o que recebe de contexto
   (protocolo ativo do paciente, marcos ainda não atingidos, últimas N sessões) e o que
   devolve.
2. System instructions completas do agente, incluindo:
   - AGNOSTICISMO DE PROTOCOLO: as instructions não podem citar VB-MAPP como regra
     fixa. A taxonomia de domínios/marcos/escalas chega VIA CONTEXTO (definição do
     protocolo ativo do paciente, vinda do banco). Os exemplos few-shot usam VB-MAPP
     porque é a primeira instância, mas as REGRAS (função vs. forma, nível de ajuda,
     evidência negativa, ABC, dimensões de qualidade) são universais e devem
     funcionar igualmente quando o contexto trouxer ABLLS-R, Denver, PROC ou PEDI.
     Teste mental obrigatório: trocar o protocolo do contexto não pode exigir mudar
     uma linha do system prompt.
   - Papel e limites: o agente SUGERE, nunca decide. Proibido inferir além do texto.
   - Regra de proveniência: toda sugestão cita o trecho literal do diário que a sustenta.
   - Regra de nível de ajuda (ANTI-ALUCINAÇÃO CENTRAL): toda evidência classifica o
     prompting com taxonomia completa — independente, dica verbal, dica ecóica, dica
     gestual/apontamento, dica de entonação/repetição da instrução, modelação
     (terapeuta demonstra), dica física. Registrar também nº de tentativas e
     acertos-após-erro. Isso diferencia marco DOMINADO de marco EM AQUISIÇÃO — é o
     dado mais importante para o terapeuta.
   - Regra evidência-nunca-pontuação: o agente produz EVIDÊNCIAS para metas/marcos.
     Ele jamais declara um marco atingido — no máximo o sistema sinaliza "candidato
     a avaliação" por regra de acúmulo. Alvo primário da evidência é a META
     individualizada do paciente (recebida no contexto); o marco de protocolo é o
     mapeamento secundário quando existir.
   - Regra de contexto de ensino: registrar se a resposta ocorreu em ambiente
     ESTRUTURADO (mesa, tentativa discreta) ou NATURAL (NET, brincadeira) quando o
     texto permitir inferir — protocolos diferenciam isso em vários marcos.
   - Regra de dimensões de qualidade: além do nível de ajuda, capturar quando o texto
     indicar VARIABILIDADE ("sempre pede os mesmos 2 itens"), GENERALIZAÇÃO ("só faz
     com a terapeuta X / só na sala Y") e RESTRIÇÃO A PREFERÊNCIAS ("tatos limitados
     aos itens favoritos"). São essas dimensões que alimentam a prosa qualitativa do
     relatório avaliativo (ver artefato de referência no contexto) — ex.: "realiza
     tatos de forma espontânea, mas dependente de dicas ecoicas e limitados aos itens
     de sua preferência".
   - Regra anti-invenção de números: narrativa vaga ("fez vários mandos") NUNCA vira
     contagem. Marcar frequência como "não informada" e deixar campo para o terapeuta
     preencher. Tentativas falhas e latência ("respondeu ao nome só na 3ª chamada")
     fazem parte da evidência, não apenas o acerto final.
   - Regra de classificação por função, não por forma: a mesma palavra dita pela
     criança pode ser mando (pedido), tato (nomeação), ecoico (repetição) ou
     intraverbal (responder pergunta/completar frase) dependendo do antecedente.
     Mandos podem ser NÃO-VERBAIS (puxar a mão, apontar). Extrair pares de contraste
     quando existirem: "falhou no intraverbal ('som da vaca?') mas acertou o tato
     ('quem é esse?')" — os dois registros importam.
   - Regra de evidência negativa: falhas, dificuldades e padrões rígidos ("repetiu a
     mesma pergunta em todas as rodadas") são extrações tão válidas quanto acertos.
     O protocolo precisa saber o que a criança NÃO faz ainda.
   - Cadeias de tarefas (vida diária — lavar as mãos, vestir-se): extrair a cadeia
     com o nível de ajuda POR ETAPA ("independente em abrir torneira e pegar sabão;
     dica gestual em esfregar as costas das mãos").
   - Barreiras: episódios de comportamento (choro, jogar objeto, queda ao chão,
     estereotipia, hipersensibilidade sensorial) viram registro ABC (antecedente,
     comportamento, duração, consequência/estratégia de regulação), não pontuação de
     marco. A AUSÊNCIA de comportamentos ("zero fugas hoje") também é um registro
     válido e valioso.
   - Mapeamento multi-protocolo: uma mesma evidência pode alimentar marcos de
     protocolos diferentes (VB-MAPP para operantes verbais; ABLLS-R/AFLS para vida
     diária; áreas de brincar/social). O agente sugere o marco no(s) protocolo(s)
     ativo(s) do paciente, recebidos no contexto.
   - Score de confiança (alto/médio/baixo) com critérios objetivos para cada nível.
   - Comportamento quando não há evidência: retornar vazio é sucesso, não falha.
   - Tratamento de texto ditado com erros de transcrição.
3. JSON Schema de saída (compatível com structured outputs) alinhado à tabela Extraction,
   cobrindo os dois tipos: evidência de operante/marco e registro ABC.
4. GOLDEN EXAMPLE (use como few-shot no system prompt e como primeiro caso de teste).
   Diário de entrada:
   ---
   "Hoje a sessão com o Leo (3 anos) foi excelente e com bastante energia. Começamos no
   tapete com os brinquedos de encaixe. Ele estava muito motivado pela pista de carrinhos.
   Quando o carrinho travou, ele olhou para mim, fez contato visual espontâneo e disse
   'ajuda', o que foi um ótimo avanço! Depois, peguei uma miniatura de cachorro, mostrei
   para ele e perguntei 'O que é isso?'. Ele respondeu claramente 'cachorro'.
   Passamos para a mesa para algumas tentativas estruturadas. Pedi para ele: 'Leo, bate
   palma', e ele bateu. Depois eu disse 'faz igual' e toquei no nariz, e ele imitou
   perfeitamente. Em seguida, espalhei algumas figuras na mesa e pedi 'pega a bola', mas
   ele pegou o sapato. Tentei de novo apontando de leve para a bola, e aí ele acertou.
   Na hora do lanchinho, ele tentou puxar o pacote de biscoito da minha mão. Eu segurei
   e dei a dica verbal dizendo 'biscoito'. Ele repetiu 'bito' e eu entreguei na mesma hora.
   No final, tivemos um pequeno episódio de choro. Quando avisei que a sessão estava
   acabando e comecei a guardar a massinha, ele jogou um pedaço no chão e gritou,
   choramingando por uns 40 segundos. Esperei ele se acalmar e comecei a cantar a música
   de guardar os brinquedos. Cantei 'cada coisa no seu...' e fiz uma pausa, e ele
   completou cantando 'lugar!'. Foi uma ótima transição para encerrar o dia."
   ---
   Saída esperada (o "desembaraço" que o agente deve produzir):
   - Preferência/reforçador: motivação alta pela "pista de carrinhos" (R17).
   - Mando: pediu "ajuda" espontaneamente, com contato visual (independente).
   - Tato: nomeou "cachorro" diante da pergunta "o que é isso?" (independente) —
     se o contexto do paciente registrar histórico de tato só com dica ecoica,
     esta extração é candidata a `inconsistente_com_historico` (R14, direção
     "bom demais para ser verdade"; ver `golden-example-output.json`).
   - Comportamento de ouvinte: seguiu "bate palma" (independente); em "pega a bola",
     errou a 1ª tentativa (pegou o sapato) e acertou com dica gestual (apontamento).
   - Imitação motora: imitou "tocar o nariz" sob instrução "faz igual" (independente).
   - Ecoico: repetiu "bito" após dica verbal "biscoito" (com dica — nota: aproximação
     fonética, não palavra completa).
   - Intraverbal: completou a música com "lugar!" (independente).
   - Registro ABC: antecedente = aviso de fim da sessão/guardar massinha; comportamento
     = jogou massinha, gritou e choramingou; duração ≈ 40s; consequência = espera +
     redirecionamento com música de transição.
   Formalize essa saída no JSON Schema do item 3, cada item com trecho-fonte e confiança.
   Nota (09/07/2026): `golden-example-output.json` foi regenerado para incluir a
   extração de preferência/reforçador e a sinalização de inconsistência do tato —
   o few-shot está alinhado às regras R14/R17 atuais (ver achado no `BACKLOG.md`,
   seção B, sobre a versão anterior estar defasada).

5. BIBLIOTECA DE CASOS DE TESTE (entrada real → saída esperada). Use os três abaixo
   como testes de regressão do agente; cada um exercita regras diferentes.

   CENÁRIO A — Habilidades básicas e sensorial (2 anos):
   Entrada: "A sessão com a Sofia começou na sala sensorial. Ela entrou correndo e foi
   direto para o balanço, ignorando meus chamados pelo nome nas duas primeiras vezes.
   Na terceira tentativa, chamando com a voz mais animada, ela olhou rapidamente, fez
   contato visual e sorriu. No balanço, trabalhamos o pedido. Eu segurava o equipamento
   e ela precisava pedir para continuar. Inicialmente ela só puxava minha mão, mas com
   a dica verbal 'vai', ela começou a vocalizar 'ba' para eu empurrar. Depois, na mesa,
   fizemos pareamento visual. Entreguei blocos de cores diferentes e ela conseguiu
   colocar o vermelho com vermelho e azul com azul sem nenhuma ajuda. Perto do fim da
   sessão, ao ouvir um barulho alto de sirene na rua, ela tapou os ouvidos, se jogou no
   chão e chorou, precisando de cerca de 2 minutos de contenção e abraço profundo para
   se regular."
   Saída esperada:
   - Comportamento de ouvinte: respondeu ao nome na 3ª tentativa, com dica de entonação.
   - Mando: não-verbal (puxar a mão) evoluindo para vocalização "ba" com dica ecóica.
   - Percepção visual/pareamento: pareou cores idênticas, independente.
   - Registro ABC: antecedente = sirene (hipersensibilidade auditiva); comportamento =
     tapar ouvidos, queda ao chão, choro; duração ≈ 2 min; consequência/regulação =
     contenção e abraço profundo.

   CENÁRIO B — Linguagem avançada e rotina (6 anos):
   Entrada: "Hoje o trabalho com o Lucas foi bem focado em habilidades de rotina diária
   e conversação. Ao chegar na clínica, perguntei 'O que você comeu no café da manhã
   hoje?' e ele respondeu de bate-pronto 'Pão com queijo e suco'. Fomos para o banheiro
   treinar a lavagem das mãos. Ele abriu a torneira, molhou as mãos e pegou o sabão de
   forma independente, mas precisou de uma leve dica gestual minha para lembrar de
   esfregar as costas das mãos. Depois, fomos jogar 'Cara a Cara' para trabalhar
   alternância de turnos. Ele esperou a minha vez super bem, mas teve dificuldade em
   formular as perguntas sobre as características dos personagens, repetindo a mesma
   pergunta 'ele tem chapéu?' em quase todas as rodadas, mesmo quando não fazia sentido.
   Tivemos zero comportamentos de fuga hoje."
   Saída esperada:
   - Intraverbal: respondeu pergunta sobre evento passado, independente.
   - Vida diária (ABLLS-R/AFLS): cadeia de lavar as mãos quase independente; dica
     gestual apenas na etapa "esfregar costas das mãos" (nível de ajuda POR ETAPA).
   - Social/brincar: alternância de turnos respeitada, independente.
   - Evidência negativa (Tato/características, VB-MAPP nível 3): dificuldade em variar
     perguntas sobre características; padrão rígido ("ele tem chapéu?" repetido).
   - Barreiras: AUSÊNCIA de comportamentos de fuga — registrar como dado positivo.

   CENÁRIO C — Brincar naturalista e atenção compartilhada (4 anos):
   Entrada: "Sessão muito fluida com o Miguel. Fomos para o tapete brincar com a
   fazendinha. No começo, ele pegou o cavalo e o porco de plástico e começou a bater um
   no outro de forma repetitiva, olhando para o teto. Tentei modelar a brincadeira:
   peguei o meu boneco, fiz ele dar comida para a vaca e disse 'nham nham, que fome!'.
   Ele parou, observou, pegou o cavalo dele, levou até o comedouro de brinquedo e imitou
   o meu 'nham nham'. Aproveitei a atenção dele e apontei para a vaca perguntando 'Qual
   o som que a vaca faz?'. Ele não respondeu. Mudei a instrução para 'Quem é esse aqui?'
   e ele respondeu 'vaca'. Mais pro final, ele apontou para a prateleira querendo
   alcançar a caixa de massinha, e ficou olhando para mim e para a caixa alternadamente
   até eu levantar para pegar."
   Saída esperada:
   - Brincar/estereotipia (barreira): brincadeira repetitiva sem função (bater objetos)
     com desatenção visual no início da sessão.
   - Imitação + brincar simbólico: imitou ação e som ("nham nham") dando função ao
     brinquedo, após MODELAÇÃO do terapeuta.
   - Par de contraste: falhou no intraverbal ("som da vaca?") e acertou o tato ("quem é
     esse?") — extrair os DOIS registros, evidenciando que a mudança de antecedente
     mudou o resultado.
   - Comunicação social/atenção compartilhada: apontamento com alternância de olhar
     (item → adulto → item) para solicitar — mando não-verbal com rastreio visual,
     independente.

6. Casos de teste adicionais: 4 diários de exemplo (escreva-os) cobrindo: sessão sem
   evidências, texto ambíguo (função do operante indefinível sem antecedente), regressão
   (criança PERDEU uma habilidade — como representar?), e ditado com erros de transcrição.
7. Estratégia de avaliação: como eu meço a taxa de aprovação sem edição (métrica de
   sucesso: ≥70%) e detecto degradação quando trocar de modelo. Os cenários A-C e o
   golden example formam o conjunto inicial de avaliação. Segunda métrica: taxa de
   RECLASSIFICAÇÃO pelo coordenador (proxy de IOA) por domínio/protocolo — cada
   reclassificação gera o par (texto, classificação errada, classificação correta),
   que alimenta o conjunto de testes de regressão do agente.
8. Segundo agente (mais simples): gerador do relatório para a família. Recebe as
   EVIDÊNCIAS APROVADAS do período (e MilestoneAssessments concluídas, quando
   existirem) — nunca "Scores": este agente não tem acesso a nenhuma pontuação
   direta de protocolo, só ao que foi efetivamente aprovado como evidência ou
   formalmente avaliado pelo terapeuta. Produz um resumo em pt-BR empático e sem
   jargão técnico, estruturado em: (a) UMA conquista em destaque (a evidência/
   avanço mais relevante do período — não uma lista exaustiva); (b) o que está
   sendo trabalhado agora (metas ativas em linguagem simples, sem nome de
   protocolo); (c) como apoiar em casa (sugestão prática derivada das evidências
   da própria criança, nunca genérica); (d) dados opcionais em anexo, para quem
   quiser ver números/gráfico (nem toda família quer — ver personas P1 vs. P2 na
   pesquisa simulada). SEMPRE como rascunho para revisão do coordenador antes do
   envio. Inclua as system instructions com regras de tom: celebrar avanços sem
   prometer resultados; tratar períodos sem evolução com honestidade e
   acolhimento — NUNCA "dourar a pílula" (queixa nº1 dos responsáveis na pesquisa
   simulada, Tema 8); e nunca inventar fatos fora das evidências recebidas.

## Formato de saída
System prompt em bloco de código pronto para uso + JSON Schema + casos de teste com
saída esperada de cada um.

## Não fazer
Não usar fine-tuning. Não propor RAG sobre manuais dos protocolos (restrição de copyright
— o contexto de marcos vem do banco, cadastrado pela clínica).
```

---

## Prompt 3 — User Flows e UX da Jornada do Terapeuta

```
Atue como um product designer sênior especialista em ferramentas clínicas e redução de
carga cognitiva.

Usando o CONTEXTO DO PROJETO e os outputs anteriores, desenhe a experiência do terapeuta.

Contexto de uso real: 7-8 atendimentos/dia com intervalos de ~10 min que viram 3.
O registro acontece em DOIS TEMPOS: captura rápida logo após a sessão (áudio de 1 min
ou nota curta, muitas vezes num corredor com pais e outras crianças por perto —
privacidade do ditado importa) + consolidação no fim do dia numa fila de pendências.
Mobile-first. O dia do terapeuta começa na grade de sessões (agenda), que é o ponto
de entrada de tudo.

## Tarefa
1. Flow principal (grade do dia → BRIEFING PRÉ-SESSÃO → check-in da sessão →
   captura → consolidação → revisão → evidências acumuladas no gráfico), passo a
   passo, com o estado do sistema em cada tela. O briefing pré-sessão é 1 tela
   escaneável em 30 segundos no corredor: última sessão em 3 linhas, metas do dia,
   alertas de manejo, reforçadores atuais. A tela de REVISÃO das sugestões da IA é o coração do produto:
   detalhe como o terapeuta vê lado a lado o trecho do diário e a evidência sugerida,
   como aprova em lote as de alta confiança e revisa uma a uma as de baixa confiança
   OU as inconsistentes com o histórico da criança (ex.: tato independente para uma
   criança que nunca fez nem com dica → fricção extra), e como edita discordando da IA.
   Mostre também como o gráfico exibe "candidato a avaliação" sem parecer marco
   atingido.
1b. LINHA DO TEMPO DO PACIENTE (visão longitudinal — usada por terapeuta e
   coordenador): desenhe como navegar entre sessões ("me mostra a sessão 45"):
   - Scrubber/navegador de sessões: selecionar qualquer sessão passada e ver o
     SNAPSHOT do repertório como era naquele ponto (o gráfico inteiro "volta no
     tempo"), com indicação clara de que se está vendo o passado.
   - Painel de DELTA da sessão: o que aquela sessão específica acrescentou
     (evidências novas, primeiro acerto independente, episódios ABC).
   - Trajetória por meta/domínio da sessão 1 até a atual, com períodos de
     evolução, estagnação e regressão visualmente distintos (cores/faixas) e
     clicáveis para ver as evidências que os explicam.
   - Comparação entre dois pontos ("sessão 45 vs. sessão 120").
2. Flows de exceção (obrigatórios):
   - IA não encontrou nenhuma evidência no diário.
   - IA sugeriu marco errado e o terapeuta corrige.
   - Terapeuta abandona a revisão no meio (o que fica pendente? como é lembrado?).
   - Falha do pipeline de IA (diário salvo, extração indisponível — o diário NUNCA
     pode ser perdido).
   - Ditado por voz com transcrição ruim.
3. Estados de confiança na UI: como diferenciar visualmente sugestão de alta vs. baixa
   confiança sem gerar vício de aprovação automática ("rubber-stamping") — proponha
   fricção deliberada onde necessário.
4. Jornada do COORDENADOR (versão mínima, desktop aceitável aqui):
   - CADASTRO CLÍNICO do paciente (ato do coordenador, distinto do cadastro
     ADMINISTRATIVO feito pela recepção — contato, convênio, consentimento
     LGPD): perfil clínico + PROTOCOLO(S) DE REFERÊNCIA ativos para aquele
     paciente (um só, ou combinação — ex.: uma criança sob PROC + VB-MAPP
     simultâneos, outra só Denver) + composição inicial da equipe de cuidado.
     É o primeiro estado do paciente no sistema, antes de qualquer meta
     existir — desenhe o estado vazio do gráfico do protocolo até a primeira
     meta/evidência aparecer.
   - Entrada por EXCEÇÕES: lista priorizada de "pacientes que precisam de atenção +
     motivo em uma linha" → drill-down no paciente → pacote de supervisão pronto
     (últimas sessões, avanços, travas, episódios). Dashboard consolidado é
     secundário, não a entrada. A lista é ESCOPADA ao grafo do coordenador (seus
     terapeutas supervisionados + pacientes que acompanha); se um paciente tem 2
     coordenadores, ambos o veem — mostre como evitar dupla intervenção (ex.:
     indicador de "já visto/tratado por outro coordenador").
   - No perfil do paciente, a EQUIPE DE CUIDADO é visível: quem atende (por
     disciplina), quem coordena, com vigências — e a linha do tempo identifica o
     autor de cada sessão/evidência.
   - CRIAÇÃO E REVISÃO DE METAS: fluxo em que o coordenador (com o terapeuta)
     cria metas a partir da avaliação/dossiê — descrição, disciplina, mapeamento
     opcional a marcos, e CRITÉRIO DE DOMÍNIO estruturado via formulário (não
     texto livre: N acertos independentes em M sessões consecutivas). Revisão de
     ciclo (8-12 semanas): lista de metas com status, candidatas a dominada
     destacadas com o dossiê que as sustenta, decisão de dominar/manter/ajustar.
   - Lista de exceções inclui alerta de ASSIDUIDADE (faltas recorrentes) e
     INCIDENTES GRAVES (registro ABC com severidade alta → notificação imediata
     ao coordenador; desenhe também o fluxo de ciência do responsável).
   - FILA DE VALIDAÇÃO do coordenador (dentro do pacote de supervisão): itens por
     exceção (baixa confiança, inconsistência com histórico, calibração de
     terapeuta novo, dossiê pré-avaliação formal). Ações: confirmar |
     reclassificar X→Y (justificativa obrigatória) | devolver ao terapeuta com
     pergunta | invalidar. A UI mostra o checklist de confusões clássicas do
     domínio em questão (ex.: mando vs. tato) ao lado do trecho do diário.
     Desenhe também a notificação de reclassificação que o terapeuta recebe —
     tom de formação, nunca de correção punitiva.
   - Flow de exportação do relatório da família: gerar rascunho com IA → coordenador
     edita/aprova → exporta PDF (para envio via WhatsApp) → sistema registra a
     exportação. Estrutura do relatório: 1 conquista em destaque, o que está sendo
     trabalhado, "como apoiar em casa", dados em anexo opcional. Inclua o estado de
     "período sem evolução" (o que o rascunho diz? como a UI orienta o coordenador?).
     Na MESMA tela de exportação, reserve um segundo ponto de entrada "Exportar para
     convênio" (desabilitado/"em breve" nesta fase é aceitável) — validação de campo
     (terapeuta real, ao ver o protótipo, perguntou por isso primeiro) mostra que o
     usuário espera essa opção ali; não desenhe o conteúdo do relatório de convênio
     agora (decisão de escopo ainda pendente), só o ponto de entrada.
   - Transparência anti-vigilância: mostre onde o terapeuta vê a própria métrica de
     preenchimento e o aviso do que o coordenador enxerga.
5. Wireframes em texto/ASCII das 7 telas principais: grade do dia, diário/captura,
   fila de pendências, revisão, gráfico do protocolo (com candidatos a avaliação),
   lista de exceções do coordenador, revisão do relatório da família.
6. Microcopy em pt-BR dos momentos críticos: estado vazio, confirmação de aprovação,
   erro do pipeline, aviso de que sugestões de IA exigem validação profissional, e
   confirmação de exportação (lembrete de responsabilidade sobre dados do paciente).

## Formato de saída
Flows em Mermaid (flowchart) + wireframes + tabela de estados de UI. Justifique decisões
de design em 1-2 frases cada.

## Não fazer
Não desenhar portal/login da família. Não assumir desktop como contexto principal para
o terapeuta (para o coordenador, pode).
```

---

## Prompt 4 — Stack e Plano de Construção Incremental

```
Atue como um tech lead pragmático que otimiza para um desenvolvedor solo construindo
com auxílio de IA (Claude Code).

Usando o CONTEXTO DO PROJETO e todos os outputs anteriores, defina a stack e o plano.

## Tarefa
1. Stack completa com justificativa de 1-2 frases por escolha, otimizando para: uma
   pessoa, poucas peças móveis, serviços gerenciados, custo baixo em validação.
   Cubra: framework web, banco (considere o RLS do Prompt 1), auth, processamento da
   extração (avalie se um job assíncrono simples basta vs. fila dedicada — lembre que
   a revisão é imediata), API do LLM, transcrição de voz, hospedagem, observabilidade
   mínima (especialmente logging das extrações para a métrica de 70%).
2. O que explicitamente NÃO usar nesta fase e por quê (ex.: Kubernetes, microsserviços,
   vector DB, filas distribuídas).
3. Plano de construção em fatias verticais — cada fase termina com algo testável com
   um terapeuta real:
   - Fase 1: pacientes (cadastro ADMINISTRATIVO pela recepção + cadastro CLÍNICO
     pelo coordenador — ficha clínica essencial, consentimento LGPD da admissão
     e protocolo(s) de referência via `PatientProtocol`) + agenda mínima (grade
     semanal, check-in) — sem isso não há contexto para o diário, adoção, nem
     legalidade.
   - Fase 2: metas (ciclo de vida + critério de domínio) + diário por texto ligado
     à sessão + fila de pendências do dia (sem IA de extração).
   - Fase 3: extração + tela de revisão, com metas individualizadas primeiro e
     mapeamento a protocolo(s) de referência do paciente como camada (um
     paciente pode ter mais de um protocolo ativo via `PatientProtocol`).
   - Fase 4: acúmulo de evidências + gráfico do protocolo com "candidatos a
     avaliação" + histórico/versionamento + linha do tempo (snapshot as-of, delta
     por sessão, trajetória) + briefing pré-sessão + perfil de reforçadores.
   - Fase 5: coordenador (lista de exceções com assiduidade e incidentes graves +
     pacote de supervisão + fila de validação/reclassificação + revisão de ciclo
     de metas) + exportação do relatório da família (PDF) + dossiê BRUTO de
     auditoria de convênio (PDF factual, sem síntese de IA — decisão confirmada
     09/07/2026, ver BACKLOG.md).
   - Fase 6: ditado por voz (captura rápida) + polish + hardening LGPD.
   Para cada fase: escopo, critério de pronto, e o risco que ela elimina.
   Fast-follow pós-MVP (não construir agora): relatório de convênio/operadora
   NARRATIVO (o dossiê bruto já está na Fase 5, ver acima), avaliação formal
   assistida, anamnese estruturada. Backlog nomeado: relatório escolar,
   transição/alta, reunião interdisciplinar, treino parental (ver
   mapa-jornadas-gaps.md).
4. Checklist de segurança/LGPD mínimo viável antes de usar com dados reais de pacientes.

## Formato de saída
Tabela de stack + plano por fases + checklist. Sem código.

## Não fazer
Não propor arquitetura "para quando escalar". Não incluir CI/CD elaborado, feature
flags ou infra-as-code nesta fase.
```

---

## O que mudou em relação ao prompt original

- **Persona dupla eliminada** — cada prompt tem uma persona única e especializada; a profundidade vem do encadeamento, não do acúmulo.
- **Decisões de lógica travadas no contexto** (fonte da verdade, human-in-the-loop, proveniência, versionamento) — o LLM executa em vez de decidir sozinho as questões mais críticas.
- **Escopo cortado com precisão** — terapeuta é a jornada principal; coordenador entra em versão mínima (dashboard + supervisão); o portal da família é substituído por um relatório exportável revisado pelo coordenador, mantendo o valor de transparência sem construir um terceiro portal.
- **Restrições explícitas** que faltavam: LGPD/dados de menores, copyright dos protocolos, dev solo, mobile-first, momento de execução da IA.
- **Fluxos de exceção obrigatórios** — o original só pedia o caminho feliz.
- **Métricas de sucesso** definidas e conectadas à estratégia de avaliação do agente.
- **Seções "Não fazer"** em cada prompt, contendo o escopo e evitando respostas genéricas de "arquitetura para escala".
- **Revisão pós-pesquisa (painel simulado — ver pesquisa-simulada-espectro.md):** evidência ≠ pontuação formal (IA sinaliza "candidato a avaliação", terapeuta pontua); meta individualizada (PEI) como unidade central, tornando o core protocol-agnóstico (TO/Fono/Denver); agenda mínima como fundação do MVP; registro em dois tempos (captura + consolidação); coordenador entra por exceções com pacote de supervisão; relatório da família com "como apoiar em casa" e honestidade em platôs; métricas de terapeuta transparentes (anti-vigilância); relatório de convênio como fast-follow prioritário.
