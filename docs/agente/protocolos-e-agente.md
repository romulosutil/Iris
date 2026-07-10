# Base de Conhecimento de Protocolos + Agente de Extração — Espectro

Este documento tem 5 partes: (1) catálogo dos protocolos com o que cada um captura
e o que o agente extrai do diário para alimentá-lo; (2) o formato canônico de
definição de protocolo (o "contrato" que o agente recebe via contexto); (3) as
system instructions completas do agente, prontas para uso; (4) o JSON Schema de
saída e a execução do golden example; (5) a camada de validação do coordenador,
com o processo de revisão e os checklists de erro clássico por protocolo.

**Avisos:** as estruturas abaixo foram conferidas contra fontes oficiais/acadêmicas
em 09/07/2026 (pesquisa dedicada, ver `BACKLOG.md` seção B — correções e fontes
documentadas inline em cada instrumento). Nenhuma regra do agente é específica de
um protocolo — o VB-MAPP é a primeira instância.

**2ª rodada de validação (09/07/2026) — contra relatórios/formulários REAIS, não
só descrições estruturais:** 4 agentes de pesquisa buscaram formulários preenchidos,
relatórios de amostra e artefatos reais de aplicação (não resumos genéricos) para
os 10 instrumentos. Isso corrigiu mais 1 erro factual (PROC) e revelou 1 contradição
de design que já estava embutida num caso de teste (AFLS — ver 1.4). Também revelou
lacunas estruturais que o catálogo ainda não modela (granularidade de PEDI/MBGR,
tipos de relatório do ABLLS-R, taxonomia real de prompts do ESDM) — documentadas
inline em cada instrumento abaixo. Nenhuma dessas lacunas bloqueia o MVP do agente
de extração (que não pontua protocolo, só evidencia — R3), mas todas afetam o
desenho futuro de telas de relatório/reavaliação por instrumento.

**3ª rodada de validação (09/07/2026) — especialista clínico por protocolo:** os
10 instrumentos passaram, um a um, por um agente assumindo o papel de especialista
clínico real naquele protocolo (não pesquisador genérico), validando Completude,
Coerência do modelo de domínios do contrato e Aplicabilidade prática, com busca a
fontes primárias/acadêmicas. Resultado: **10/10 vieram como APROVADO COM
RESSALVAS** — nenhum protocolo foi reprovado, mas todos tiveram ao menos 1 achado
concreto, e 2 achados são graves o bastante para virar correção nesta rodada, não
só nota: (1) **DCDQ** — a doc afirmava cutoff por "faixa etária E sexo"; o manual
oficial testou e descartou efeito de sexo (p=.37) — **corrigido abaixo**; (2)
**ABLLS-R** — a doc marcava a granularidade por tarefa como "NÃO VERIFICADA"; o
especialista confirmou que ELA EXISTE (relatórios reais operam no nível de tarefa
numerada) — **corrigido abaixo**. Os demais achados (PROC com modelo de domínios
incompleto para 3 dos 4 blocos; ABFW com erro de atribuição ao ROLPP + pragmática
ausente do contrato; PEDI com Parte I/Parte II conflacionadas num único eixo;
Perfil Sensorial 2 sem campos para os 2 eixos teóricos de Dunn; VB-MAPP sem o
componente Task Analysis; ESDM com contagem de domínios internamente inconsistente)
estão documentados inline em cada instrumento e resumidos com veredito completo em
`BACKLOG.md` seção B.

**Fonte do conteúdo dos marcos (decisão 09/07/2026):** pesquisa confirmou que o
padrão de mercado para os instrumentos AMERICANOS/fechados (VB-MAPP, ABLLS-R,
AFLS, ESDM Curriculum Checklist, Perfil Sensorial 2) é rígido — os detentores dos
direitos (AVB Press, WPS, Guilford Press, Pearson) não licenciam o texto integral
para plataformas de software terceiras; o único precedente de embutimento nativo
encontrado (CentralReach com ABLLS-R e AFLS) só existe porque a CentralReach
**comprou** as próprias empresas donas dos direitos (Behavior Analysts Inc. em
2021, Stimulus Publications em 2022) — não é uma licença replicável por um
produto em estágio de piloto. **Decisão mantida: o sistema modela ESTRUTURA
(domínios, níveis, escalas); o TEXTO dos itens/marcos desses 5 instrumentos é
cadastrado pela clínica que já possui a licença/manual.** Já os instrumentos
BRASILEIROS de fono (seção 1.5-1.7) têm modelo mais aberto — MBGR é publicado sob
licença Creative Commons CC BY-NC-ND (uso não comercial livre, pode ser embutido
nativamente sem risco); DCDQ é gratuito e de download livre (mesma conclusão);
PROC é híbrido (artigo de validação aberto, mas manual oficial de aplicação é
vendido pela Pulso Editorial); ABFW é o mais fechado dos brasileiros (compra
obrigatória do kit oficial, ~R$447, Pró-Fono). O PEDI (adaptação brasileira,
Mancini/UFMG 2005) aparenta uso acadêmico mais aberto (sem kit comercial restrito
localizado), mas não há declaração explícita de domínio público — tratar como
"provavelmente embutível, confirmar com a UFMG/editora antes de travar em
produção". Resumo prático: MBGR e DCDQ são os únicos 2 dos 10 instrumentos onde
o Iris pode considerar embutir o texto literal dos itens como diferencial de
produto (zero fricção de cadastro nesses 2); os outros 8 seguem o modelo
"clínica cadastra".

---

## Parte 1 — Catálogo de protocolos

### 1.1 VB-MAPP (Verbal Behavior Milestones Assessment and Placement Program)

- **O que é:** avaliação de repertório verbal e habilidades relacionadas, base
  skinneriana. Adaptação pt-BR: Martone (2017). Primeira instância do sistema.
- **Componentes:**
  - **Marcos:** 170 marcos, 3 níveis por faixa de desenvolvimento (N1: 0-18m,
    N2: 18-30m, N3: 30-48m), 5 marcos por domínio por nível. Escala **0 / ½ / 1**
    (½ = em desenvolvimento). Total máx. 170. **Confirmado contra marksundberg.com
    e WPS (09/07/2026).**
  - **Domínios por nível (16 áreas de habilidade distintas ao todo, conferido por
    aritmética: 9+12+13 domínios/nível × 5 marcos = 45+60+65 = 170):** N1 (9
    domínios): mando, tato, ouvinte, percepção visual/pareamento (VP-MTS),
    brincar independente, social, imitação motora, ecoico, vocalizações. N2 (12
    domínios): **vocalizações SAI** (não é só adição); entram LRFFC (ouvinte por
    função/característica/classe), intraverbal, habilidades de grupo, estrutura
    linguística. N3 (13 domínios): ecoico e imitação motora saem; entram leitura,
    escrita, matemática.
  - **Barreiras:** 24 barreiras de aprendizagem (ex.: controle instrucional,
    mando/tato/ecoico comprometidos, dependência de dicas, autoestimulação, custo
    de resposta, defesa sensorial, contato visual), escala **0-4** (0 = ausente).
    Total máx. 96. **Confirmado.**
  - **Transição:** 18 áreas, escala 1-5 (prontidão para ambientes menos
    restritivos). **Confirmado**, lista completa das 18 áreas verificada (escore
    geral de Marcos, escore geral de Barreiras, comportamentos negativos, rotinas
    de sala/habilidades de grupo, habilidades sociais, trabalho acadêmico
    independente, generalização, variedade de reforçadores, taxa de aquisição,
    retenção, aprendizagem em ambiente natural, transferência sem treino,
    adaptabilidade à mudança, comportamentos espontâneos, lazer autodirigido,
    autocuidado geral, uso do banheiro, alimentação).
- **Output/artefato:** grade de marcos colorida por reavaliação (série 1º-4º teste,
  cada um com data, avaliador, cor e idade no teste), grade de barreiras, prosa
  qualitativa por domínio, direcionamento do plano de metas.
- **Achado da validação contra relatórios reais (09/07/2026):** o relatório
  ENTREGUE a família/convênio na prática clínica real é **prosa narrativa**, não a
  grade colorida — a grade é ferramenta de trabalho do avaliador, não o
  deliverable final. Risco de produto: se as telas do Iris derem a entender que a
  grade É o relatório final, isso diverge do que os stakeholders (pais, convênio)
  de fato recebem — o dossiê narrativo do Iris (que já é a aposta do produto)
  está mais alinhado à prática real do que uma export só de grade. A pontuação de
  Barreiras também é, na prática, um processo manual em DOIS artefatos físicos
  separados (folha de critérios → folha de pontuação separada) — um risco de
  modelagem de dados se o Iris tratar isso como uma única entidade. Relatórios
  reais também combinam frequentemente o VB-MAPP com outros instrumentos
  complementares (não é isolado).
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS:**
  especialista clínico (aplicador real de VB-MAPP) confirmou todos os números já
  documentados (170 marcos, 24 barreiras, 18 áreas de transição, transição de
  domínios entre níveis) e apontou 4 lacunas reais: (1) falta o componente
  **Task Analysis and Supporting Skills** — ~750 subtarefas de currículo cobrindo
  14 dos 16 domínios, usadas para gerar metas de programa ENTRE os marcos formais;
  é o nível de granularidade mais provável de aparecer no diário real do dia a
  dia ("trabalhamos pareamento por cor"), e hoje não tem onde "pousar" no
  contrato — considerar como componente opcional futuro, não bloqueador do MVP;
  (2) as 24 Barreiras são heterogêneas e não deveriam ser um único
  `componente_extra` tipo `registro_abc`: há (a) episódios ABC genuínos
  (agressão, autoestimulação), (b) barreiras que são só um marco baixo no mesmo
  domínio (mando/tato/ecoico comprometidos — o avaliador real olha o próprio
  escore, não cria evento separado), e (c) barreiras de padrão agregado sobre
  dimensões de qualidade já coletadas (dependência de dica, motivadores
  restritos) — modelar as 24 como um tipo único esconde essa heterogeneidade;
  (3) "nível de ajuda + resultado (acerto/erro)" não serve bem para os domínios
  de Brincar Independente, Social e Vocalizações (N1), cujos marcos reais são
  sobre duração/espontaneidade/iniciativa, não tentativa-com-dica — considerar
  um modo de coleta alternativo para esses domínios; (4) a Avaliação de
  Transição (18 áreas) depende de insumos que tipicamente não vêm da sessão de
  terapia (relato de cuidador/escola sobre generalização em casa) — documentar
  explicitamente que o agente não consegue preencher Transição só a partir do
  diário. Achados menores: a frase de licenciamento generaliza demais (a
  exclusividade é só para pontuação eletrônica completa; há 3-4 parceiros
  oficiais de materiais/kits); status do EESA (Early Echoic Skills Assessment)
  em relação ao VB-MAPP ficou ambíguo entre fontes, precisa checagem com fonte
  primária antes de tratá-lo como incluído ou não.
- **O que o agente extrai do diário:** evidências por domínio com função do
  operante (o coração do agente), nível de ajuda, ambiente estruturado/natural,
  dimensões de qualidade; registros ABC que alimentam Barreiras (nunca as pontuam).
- **Licenciamento:** protegido por copyright estrito da **AVB Press** (editora
  oficial) — reprodução/distribuição do texto integral não é permitida sem
  autorização. Existe 1 parceiro digital oficial exclusivo e fechado
  ("Data Makes the Difference", app VB-MAPP), não um licenciamento aberto a
  plataformas terceiras. Confirma o modelo "clínica cadastra" (ver aviso no
  topo do documento).

### 1.2 ABLLS-R (Assessment of Basic Language and Learning Skills — Revised)

- **O que é:** avaliação/currículo de **544 tarefas em 25 repertórios** (letras
  **A a Z, pulando o O** — não "A-Y" como versão anterior deste documento dizia:
  A-Cooperação, B-Desempenho Visual, C-Linguagem Receptiva, D-Imitação, E-Imitação
  Vocal, F-Mandos, G-Tatos, H-Intraverbal, I-Vocalização Espontânea, J-Sintaxe/
  Gramática, K-Brincar/Lazer, L-Interação Social, M-Instrução em Grupo, N-Rotinas
  de Sala, P-Resposta Generalizada, Q-Leitura, R-Matemática, S-Escrita,
  T-Soletração, U-Vestir-se, V-Alimentação, W-Higiene, X-Uso do Banheiro,
  Y-Motricidade Grossa, Z-Motricidade Fina). Autor: James W. Partington.
  **Confirmado 09/07/2026.**
- **Escala:** rubrica por tarefa com critérios graduados (varia por item, tip. 0-2
  ou 0-4). Output: grade de progresso por repertório, reavaliável ao longo do tempo.
- **O que o agente extrai:** evidências de tarefas específicas, com destaque para
  CADEIAS de autoajuda com nível de ajuda POR ETAPA (lavar mãos, vestir), rotinas
  de grupo e habilidades de sala.
- **Achado da validação contra relatórios reais (09/07/2026):** o software oficial
  (WebABLLS) gera **4 tipos de relatório com nomes distintos** — Program Worksheet
  Report, Progress Report, Status Report, Baseline Report — mais gráfico de
  comparação com dados normativos. É uma lacuna de taxonomia se o Iris modelar só
  um "relatório de progresso" genérico; vale desenhar o dossiê pensando em quais
  desses 4 papéis ele efetivamente cobre. **Correção 09/07/2026 (validação
  especialista):** a rodada anterior marcou a granularidade por tarefa como "NÃO
  VERIFICADA" — isso estava errado por excesso de cautela. Um especialista
  clínico aplicador de ABLLS-R confirmou que o Program Worksheet Report, o
  Status Report e o Baseline Report operam de fato no nível de **tarefa
  individual numerada** dentro de cada repertório (não só no nível agregado do
  repertório) — é assim que a maioria das clínicas de fato acompanha progresso
  semana a semana. Consequência de produto: vale avaliar uma extensão opcional
  do contrato do protocolo com um nível de granularidade "tarefa" (abaixo de
  `dominio_id`), já que hoje o contrato só nomeia os 25 repertórios/letras —
  isso alinharia o dado extraído à unidade real de acompanhamento clínico, sem
  violar R3 (a extração continua sendo evidência, nunca pontuação da tarefa).
- **Licenciamento:** direitos originalmente da Behavior Analysts, Inc.; a
  **CentralReach comprou a própria empresa detentora dos direitos em 2021**
  (não uma licença B2B replicável) e por isso consegue embutir o conteúdo
  nativamente no seu software. Confirma o modelo "clínica cadastra" para o Iris.

### 1.3 Denver / ESDM (Early Start Denver Model)

- **O que é:** modelo naturalista para intervenção precoce, faixa etária nuclear
  **12-48 meses**, com extensão informal sustentada por fontes até **~60 meses**
  quando o nível de desenvolvimento ainda é pré-verbal/inicial (a extensão até
  ~84m da versão anterior deste documento **não tem sustentação em nenhuma fonte
  encontrada e foi removida — correção 09/07/2026, validação especialista**); a
  2ª edição do Curriculum Checklist já cobre também bebês a partir de ~6m — não
  travar o sistema numa faixa rígida. Checklist curricular com centenas de itens
  distribuídos em 4 níveis correspondentes às faixas etárias (12-18, 18-24,
  24-36, 36-48m) — **a cifra "480 itens" da rodada anterior não foi confirmada
  em nenhuma fonte pública e foi removida (correção 09/07/2026); só citar um
  número exato se/quando alguém contar manualmente o checklist real.**
- **Domínios — correção 09/07/2026 (validação especialista, revertendo um erro da
  rodada anterior que tinha "11" com um domínio "comportamento" inventado):** a
  fonte mais granular encontrada (listagem item a item do Curriculum Checklist
  real, corroborada por clínica certificada ESDM) aponta **10 domínios**:
  comunicação receptiva, comunicação expressiva, **habilidades sociais** e
  **atenção conjunta** (dois domínios SEPARADOS, não fundidos), imitação,
  cognição, brincar, motor fino, motor grosso, independência pessoal/autonomia
  (alimentação, vestir-se, higiene, tarefas). Nenhuma fonte confirma um domínio
  "comportamento" autônomo do Curriculum Checklist — provável confusão com
  currículos ABA gerais que têm domínio de comportamento/regulação; removido.
  Também nota: o ESDM tem um **segundo instrumento, distinto do Curriculum
  Checklist** — o **Fidelity Rating System / P-ESDM fidelity tool**, que mede a
  qualidade de execução do TERAPEUTA (usado para certificação), não a criança.
  É estruturalmente fora de escopo do agente de extração (que só produz
  evidência sobre a criança, nunca pontua nada — R3); registrado aqui só para
  não gerar confusão futura entre os dois instrumentos.
- **Processo (chave do modelo):** o checklist gera **objetivos individualizados por
  ciclo de ~12 semanas** (reavaliação/replanejamento a cada 12 semanas, confirmado
  em 2 fontes independentes), cada objetivo decomposto em passos de aprendizagem
  (task analysis com níveis de prompt; o critério de "~80% de independência antes
  de generalizar" citado antes é uma convenção geral de ABA aplicada por extensão
  ao ESDM, não um parâmetro documentado nativamente pelo manual/checklist ESDM —
  ressalva de precisão adicionada 09/07/2026); a coleta diária é POR OBJETIVO,
  dentro de brincadeira naturalista — não se reaplica o checklist inteiro a cada
  sessão.
- **O que o agente extrai:** evidências contra os objetivos ativos do ciclo (não
  contra o checklist inteiro), com atenção a atenção compartilhada, imitação
  espontânea vs. modelada e brincar simbólico. É o caso que valida a decisão
  "meta é o trabalho, protocolo é a régua".
- **Achado da validação contra relatórios reais (09/07/2026):** confirma o desenho
  "por objetivo, ciclo de ~12 semanas". Encontrada uma taxonomia real de prompts
  com **4 níveis** (física total / verbal / gestual / combinada verbal+gestual),
  possivelmente mais granular ou diferente da taxonomia de 5 níveis usada no Caso
  10 (independente, dica_verbal, dica_gestual, modelacao, dica_fisica) — o sistema
  não trava numa taxonomia fixa (R19), então isso não é um bug, mas o Caso 10
  deveria ser revisado se a clínica cadastrar a taxonomia real de 4 níveis.
  Encontrada notação real "+/+-/-" de checklist, mas é pontuação de ciclo, não
  extração diária, então não se aplica aqui. NÃO foi possível confirmar nem negar
  que "imitação espontânea vs. modelada" e "atenção conjunta iniciada pela criança
  vs. pelo adulto" sejam campos realmente operacionalizados no ESDM — são
  consistentes com a abordagem teórica do modelo, mas o Caso 10 testa essas
  distinções como exercício do agnosticismo do agente (R19), não como garantia de
  que espelham a granularidade real de coleta do ESDM.
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS:**
  especialista certificado em ESDM confirmou que o núcleo do modelo (coleta por
  objetivo ativo, não pelo checklist inteiro; notação "+/+-/-" é de ciclo, não
  diária; agente nunca pontua o checklist) está fiel à prática real — é o ponto
  mais importante e não precisa de revisão. A ressalva central é sobre a
  taxonomia de ajuda: **não existe uma taxonomia diária universal e obrigatória
  de níveis de prompt no ESDM** — diferente do checklist (que é padronizado), o
  trabalho diário é naturalista e cada clínica adapta sua própria folha de
  dados; não há uma única "taxonomia oficial" para dados diários. A lista de 5
  níveis usada no Caso 10 deve ser apresentada na documentação como um EXEMPLO
  de contrato específico, não como "a" taxonomia canônica do ESDM — o desenho
  já resolve isso corretamente (`taxonomia_ajuda` é campo do contrato JSON, não
  constante do agente), só a prosa precisava deixar isso explícito.
- **Licenciamento:** Curriculum Checklist protegido por copyright da **Guilford
  Press**; reprodução em software exige autorização formal por escrito (processo
  de até 5 semanas). Nenhum precedente de parceria digital B2B encontrado. Confirma
  o modelo "clínica cadastra".

### 1.4 AFLS (Assessment of Functional Living Skills)

- **O que é:** irmão do ABLLS-R para vida funcional (autores Partington &amp; Mueller,
  2012); **6 módulos** — Habilidades Básicas de Vida (Basic Living Skills), Casa
  (Home), Participação Comunitária (Community Participation), Escola (School),
  **Vocacional (Vocational — módulo que faltava neste documento)**, Vida
  Independente (Independent Living) — cobrindo ao todo **~1.900 habilidades
  funcionais** (na versão original de 2012 eram só 3 módulos/~735 habilidades;
  School, Vocational e Independent Living foram adicionados depois). Task analysis
  por habilidade com níveis de independência. **Correção 09/07/2026.**
- **O que o agente extrai:** cadeias funcionais com nível de assistência por etapa,
  dentro do módulo/ambiente ao qual aquele protocolo pertence (ver correção abaixo).
- **CORREÇÃO IMPORTANTE (09/07/2026) — contradiz um desenho anterior de caso de
  teste:** a validação contra material real mostrou que o AFLS NÃO é um instrumento
  único com um campo de "generalização" que atravessa ambientes — é uma **suíte de
  6 protocolos separados e independentes**, um por módulo/ambiente (Vida Diária
  Básica, Casa, Participação Comunitária, Escola, Vocacional, Vida Independente),
  cada um administrado no seu próprio contexto. Na prática real, "generalizar entre
  ambientes" significa administrar um protocolo DIFERENTE por ambiente — não um
  único campo de dado rastreando a mesma habilidade/domínio em casa+comunidade+
  clínica dentro de um só domínio AFLS. Isso invalidava o desenho original do
  Caso 12 (que modelava "participação comunitária" como um domínio único
  atravessando simulação clínica e loja real) — o Caso 12 foi corrigido para
  refletir que o módulo Participação Comunitária é escopado ao ambiente comunitário
  real; qualquer ensaio em simulação de clínica é dado clínico informal, não uma
  administração formal do mesmo protocolo (ver `casos-de-teste.md`, Caso 12).
  Achados adicionais: os "AFLS Grids" incluem comparação normativa (vs. pares com
  desenvolvimento típico), não modelada antes; existe uma família de artefatos
  complementares (Skills Tracking Sheets, Weekly Probe Sheets, NET Data Sheets,
  Summary of Mastered Items, exemplos de objetivos de PEI) fora do catálogo atual.
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS:**
  especialista clínico CONFIRMOU de forma independente que a correção acima (6
  protocolos separados por módulo/ambiente, não 1 instrumento cruzando ambientes)
  está clinicamente correta, citando a própria linguagem da CentralReach
  ("stand-alone assessment" para cada módulo) como prova de fonte primária —
  reforça que a redesenho do Caso 12 (ver `casos-de-teste.md`) não foi um ajuste
  cosmético, era mesmo um erro de modelo de dados. Ressalvas levantadas foram de
  clareza/redação (não de arquitetura): deixar mais explícito, junto de cada
  módulo, que "generalizar entre ambientes" no AFLS significa administrar um
  protocolo diferente por ambiente — nunca um único campo de dado atravessando-os.
- **Licenciamento:** direitos originalmente da Stimulus Publications, Inc.; a
  **CentralReach comprou essa empresa em 2022** (mesmo padrão do ABLLS-R — compra
  do detentor, não licença B2B replicável). Confirma o modelo "clínica cadastra".

### 1.5 PROC (Protocolo de Observação Comportamental — Zorzi & Hage)

- **O que é:** observação fonoaudiológica de linguagem e aspectos cognitivos.
  Autores: Jaime Luiz Zorzi e Simone Rocha de Vasconcellos Hage (USP-Bauru),
  publicado pela Pulso Editorial. **Faixa etária corrigida 09/07/2026:** o claim
  anterior de "1-6 anos" NÃO foi confirmado nas fontes pesquisadas — estudos de
  validação usam amostra de ~18 meses a 4 anos e 6 meses; recomenda-se ~1 a
  4-4,5 anos até checar o manual 2021 diretamente.
  **CORREÇÃO DE CONTAGEM (09/07/2026) — o total anterior deste documento (200,
  blocos 70/60/70) estava ERRADO.** A validação contra o formulário real (artigo
  de validação, acesso aberto, cruzado em 2 fontes independentes que reproduzem a
  mesma tabela — SciELO e Redalyc) confirma: **Bloco 1 — Habilidades
  comunicativas/expressivas, máx. 60** (subitens: 1a dialógicas/conversacionais
  máx. 16; 1b funções comunicativas máx. 14; 1c meios de comunicação máx. 15; 1d
  contextualização da linguagem máx. 15); **Bloco 2 — Compreensão da linguagem
  verbal, máx. 40**, item único com escala hierárquica de 7 níveis (0, 10, 15, 20,
  25, 30, 40); **Bloco 3 — Desenvolvimento cognitivo, máx. 50** (subitens: 3a
  manipulação de objetos máx. 15; 3b simbolismo máx. 20; 3c organização do
  brinquedo máx. 15 — o "4º subitem imitação" citado em material secundário
  **confirmado 09/07/2026 (validação especialista) como NÃO sendo um subitem
  pontuado**: a aritmética já fecha em 50 com os 3 subitens (15+20+15), e
  imitação (gestual e sonora) existe no protocolo como seção
  descritiva/qualitativa separada, sem conversão em pontos do total de 150).
  **Total correto: 150 pontos** (não 200) — corrigir em qualquer lugar do
  produto/roadmap que já tenha herdado o número anterior. **Nuance adicionada
  pela validação especialista:** o próprio artigo-fonte (Zorzi &amp; Hage, Rev.
  CEFAC 2012) é internamente inconsistente — o texto corrido do Método cita
  "200 pontos" (70/60/70), mas o Quadro/tabela de pontuação efetivamente usado
  para os valores de referência normativos totaliza 150 (60/40/50); a escala de
  Compreensão da Linguagem (Bloco 2) tem teto literal de 40 pontos, o que por si
  só invalida matematicamente a hipótese de 60 para esse bloco. Ou seja, "200"
  não é apenas um erro de digitação de uma versão anterior deste documento — é
  um número que também aparece no artigo original e se propagou para fontes
  secundárias (blogs, resumos de alunos). 150 é o valor operacional correto
  (o que profissionais que aplicam o formulário impresso reportam), mas se um
  fonoaudiólogo usuário do Iris questionar "o artigo diz 200", a resposta
  correta é "o próprio artigo se contradiz, e o valor operacional real é 150" —
  não "vocês leram errado".
- **Eixos qualitativos:** habilidades dialógicas (intenção comunicativa, iniciar
  conversa, responder, aguardar turno); funções comunicativas (instrumental,
  interativa, nomeação, informativa, heurística, narrativa, protesto); meios de
  comunicação (vocal articulado/não articulado, gestos simbólicos/não simbólicos);
  contextualização da linguagem; simbolismo, organização do brinquedo, imitação.
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS, ponto
  mais sério desta rodada:** o contrato de exemplo modela só **1 das 7 funções
  comunicativas do Bloco 1b** (protesto) — as outras 6 (instrumental, interativa,
  nomeação, informativa, heurística, narrativa) não têm domínio equivalente,
  mesmo o Bloco 1b valendo 14 dos 60 pontos do Bloco 1 e sendo o eixo mais rico e
  mais citado em diários de terapia infantil (pedidos, nomeações, comentários
  espontâneos). Um terapeuta que descreve "apontou para o suco pedindo mais"
  (instrumental) ou "nomeou o cachorro no livro" (nomeação) hoje não tem onde
  encaixar essa evidência. Recomendação do especialista, mais alinhada ao espírito
  agnóstico do agente (R19): em vez de criar 6 domínios novos ad hoc, usar um
  único domínio `funcao_comunicativa` com a função específica como atributo/enum
  extraído (instrumental/protesto/interativa/nomeação/informativa/heurística/
  narrativa) — a regra "classifica função pelo ANTECEDENTE" já foi desenhada
  pensando no bloco inteiro, só falta o domínio-alvo. Também faltam domínios para
  **3a (manipulação de objetos, 15 pts) e 3c (organização do brinquedo, 15 pts)**
  do Bloco 3 — só 3b (simbolismo) está coberto hoje, deixando de fora 30 dos 50
  pontos do bloco cognitivo; e para **1d (contextualização da linguagem, 15 pts)**,
  mais difícil de capturar via diário livre mas ainda assim uma lacuna. Em suma:
  o conjunto atual de domínios capta bem ~1a, 1c, 3b (e parte de 1b via protesto)
  mas fica estruturalmente "cego" para aproximadamente metade dos 150 pontos do
  protocolo, mesmo quando a evidência aparece claramente narrada no diário. Nada
  disso invalida a arquitetura (evidência-por-domínio, sem pontuação automática,
  é o desenho certo para um protocolo majoritariamente observacional) — é um
  problema de cobertura, não de conceito.
- **O que o agente extrai:** este protocolo é quase todo observacional — o diário é
  fonte primária perfeita. Atos comunicativos com FUNÇÃO (protesto por choro é
  função de protesto com meio não articulado — dado válido!), meios utilizados,
  turnos de conversação, uso simbólico de objetos.
- **Licenciamento:** híbrido — o artigo de validação é acesso aberto (SciELO/
  Redalyc), mas o manual/protocolo oficial de aplicação é vendido comercialmente
  pela Pulso Editorial (~R$65-94), sem exigência de licença recorrente por uso.
  Mais aberto que os instrumentos americanos, mas ainda não é embutível sem
  adquirir o manual — mantém "clínica cadastra" por ora.

### 1.6 ABFW (Teste de Linguagem Infantil)

- **O que é:** teste fonoaudiológico em **4 áreas confirmadas 09/07/2026**
  (Andrade/Befi-Lopes/Fernandes/Wertzner, FMUSP/FFCLRP): fonologia (produção
  fonética de palavras-alvo, transcrição fonética/IPA, Processos de Simplificação
  Fonológica por idade — 14 processos, ver correção abaixo), vocabulário
  (designação por campos semânticos — animais, alimentos, transportes, vestuário,
  móveis, profissões, formas/cores), fluência (amostra mínima de 200 sílabas,
  disfluências típicas vs. gagueira), pragmática (ver correção 09/07/2026 abaixo
  — **NÃO é baseada no ROLPP**, que é um instrumento diferente).
- **O que o agente extrai:** produções de fala transcritas no diário (ex.: "'bito'
  para biscoito" → aproximação fonética, dado de fonologia), vocabulário emergente
  por campo semântico, atos comunicativos para pragmática. NUNCA inferir inventário
  fonético completo de texto — só registrar produções literais citadas.
- **Achado da validação contra formulários reais (09/07/2026):** protocolos de
  registro reais de Fonologia (Imitação, 39 vocábulos; Nomeação, 34 figuras) e a
  estrutura de Vocabulário (9 campos semânticos, 118 figuras: Vestuário 10,
  Animais 15, Alimentos 15, Transportes 11, Móveis/Utensílios 24, Profissões 10,
  Locais 12, Formas/Cores 10, Brinquedos/Instrumentos 11) foram confirmados contra
  6 fontes acadêmicas convergentes — a contagem de 118 recebeu ainda uma
  triangulação independente na validação especialista (o fichário físico do ABFW
  soma 152 figuras = 118 de vocabulário + 34 de nomeação de fonologia, batendo
  exatamente). Fluência confirma 2 macro-categorias (7 tipos de disfluência comum
  vs. 5 tipos de disfluência gaga); as siglas exatas %DG/%DTF não puderam ser
  confirmadas contra o manual oficial da 3ª edição (bloqueio de acesso).
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS, com 1
  erro factual corrigido:** a documentação anterior afirmava que a Pragmática é
  "baseada no protocolo ROLPP" — **isso é um erro factual, corrigido agora.** O
  ROLPP (Roteiro de Observação da Linguagem na Perspectiva Pragmática) é um
  **produto Pró-Fono SEPARADO** (~R$241, vendido à parte do kit ABFW), destinado
  a crianças de 18-36 meses ou minimamente verbais, com categorias diferentes
  (responsividade/engajamento, atenção compartilhada, jogo simbólico) — não a
  taxonomia de funções/meios da Pragmática clássica do ABFW. A Pragmática real do
  ABFW (protocolo original de Fernandes, Andrade et al. 2004) tem **~20 categorias
  de função comunicativa** (pedido de objeto/ação/rotina social/consentimento/
  informação, protesto, reconhecimento do outro, exibição, comentário,
  auto-regulatório, nomeação, performativo, exclamativo, reativo, não-focalizada,
  jogo, exploratória, narrativa, jogo compartilhado, entre outras) e **3 meios
  comunicativos** (verbal/VE, vocal/VO, gestual/G), analisados por ato
  comunicativo a partir de amostra filmada (~15 min). Status atualizado: de "sem
  formulário real localizado / não validada" para **"parcialmente validada via
  literatura acadêmica secundária"** (tese USP/Abe referenciando Andrade et al. 2004) — ainda sem o scan literal da ficha física, mas a estrutura é citável.
  Segundo achado: a `definicao_funcional` de fonologia descreve só a Nomeação
  ("diante de figura") — a Imitação (39 vocábulos, com modelo do examinador) é
  estruturalmente diferente e clinicamente relevante (erro na Nomeação mas
  acerto na Imitação sugere processo organizacional; erro em ambas sugere
  limitação motora/articulatória); recomendação: manter 1 domínio "fonologia" (o
  diário narrativo raramente distingue as duas de forma limpa), mas instruir o
  agente a registrar o contexto de elicitação citado ("pediu para repetir" vs.
  "nomeou espontaneamente") como metadado literal, sem classificar. Terceiro
  achado, o mais sério para um produto focado em TEA: **o contrato de exemplo
  não tem domínio "pragmática"** — se isso refletir o contrato real (não só um
  recorte didático do texto), é a lacuna de maior risco clínico desta seção,
  porque pragmática/função comunicativa costuma ser o domínio mais central em
  terapia infantil de TEA, mais até que fonologia. PCC-R e os subtipos de
  processo fonológico/substituição semântica são classificações PÓS-HOC do
  profissional (o agente não deve calculá-los, só preservar produção+alvo
  literais — isso já é a prática correta, R3, só faltava deixar explícito).
- **Licenciamento:** o mais fechado dos 3 instrumentos brasileiros de fono —
  compra obrigatória do livro/kit oficial com chaves de acesso a aplicativo de
  pontuação (~R$447, Pró-Fono). Mantém "clínica cadastra".

### 1.7 MBGR (Protocolo de Avaliação Miofuncional Orofacial)

- **O que é:** autores corrigidos 09/07/2026 — sigla vem de **M**archesan, **B**erretin-Felix,
  **G**enaro, **R**ehder (Rev. CEFAC, 2009). Exame miofuncional orofacial.
  **Estrutura EXATA confirmada 09/07/2026 contra o PDF integral real** (2 fontes
  que descrevem a mesma estrutura: fonovim.com.br e o artigo de validação
  Redalyc) — mais rica do que "8 categorias" sugere:
  1. **Anamnese/história clínica** (não pontuada — identificação, antecedentes,
     desenvolvimento motor, saúde, respiração, sono, alimentação/amamentação,
     mastigação, deglutição, hábitos orais/posturais, comunicação, fala, audição,
     voz, escolaridade) — seção extensa, frequentemente omitida em resumos.
  2. Postura corporal (cabeça 0-4, ombros 0-3).
  3. **Medidas da face/movimento mandibular** — campo de tipo DIFERENTE das
     escalas 0-X: são **medições em milímetros com paquímetro** (terço médio,
     terço inferior, largura facial, TV, TH, DIMA, DIMALP, lateralidade
     mandibular). Se o catálogo modelar só escalas ordinais, essa seção numérica
     contínua fica de fora.
  4. Exame extraoral (análise facial numérica 0-3, subjetiva 0-12, masseter 0-1,
     mandíbula 0-2, lábios 0-19, norma lateral 0-2).
  5. Exame intraoral (lábios 0-3, bochechas 0-10, língua 0-29, palato 0-8,
     tonsilas 0-4, dentes/oclusão 0-17).
  6. Mobilidade (lábios 0-37, língua 0-52, bochechas 0-12, véu palatino 0-8,
     mandíbula 0-9).
  7. Tônus (0-8) e sensibilidade/dor à palpação (0-10).
  8. **Funções orais — NÃO é uma categoria única**, é um agregado de 9 sub-provas
     com escore próprio: respiração (0-9), mastigação (0-10), deglutição em **3
     provas separadas** (sólidos 0-18, líquido habitual 0-16, líquido dirigido
     0-16), fala em **5 provas separadas** (contagem 0-6, nomeação 0-6, DDK/
     coordenação motora 0-8, fala espontânea 0-18, repetição de sílabas sem
     escore numérico), voz (0-9).
  9. **Documentação** — checklist de fotos padronizadas (corpo, face, terço
     inferior, cavidade oral, oclusão, língua, lábios, frênulo) e de filmagem
     (mobilidade, mastigação, deglutição, fala) — seção facilmente esquecida.
  10. Resumo/fechamento — escores compilados + hipótese diagnóstica, prognóstico,
      plano terapêutico, orientações, encaminhamentos.
- **O que o agente extrai:** pouco — é exame físico. Apenas observações incidentais
  ("comeu o lanche com escape de alimento", "respira de boca aberta") como
  evidência de baixa confiança para triagem, jamais como avaliação.
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS:**
  especialista em motricidade orofacial recomendou adicionar **tônus** como um 4º
  domínio de triagem incidental (ao lado de respiração, mastigação/deglutição e
  postura/fala já implícitos nas observações citadas) — sinais de tônus alterado
  (ex.: "boca sempre entreaberta", "baba excessiva", "mordida fraca no alimento")
  aparecem com frequência em diário narrativo e hoje não têm categoria própria de
  triagem. Também sugeriu, como oportunidade de produto (não bloqueadora):
  registrar o padrão de ACÚMULO dessas observações incidentais ao longo de várias
  sessões como sinal de apoio à decisão de quando sugerir encaminhamento formal
  para avaliação MBGR completa — sempre rotulado como alerta administrativo/
  clínico, nunca como pontuação ou diagnóstico do próprio agente (mantém R3).
- **Licenciamento:** **totalmente aberto** — publicado em periódico de acesso
  aberto (Rev. CEFAC/SciELO) e como capítulo de livro sob licença Creative
  Commons CC BY-NC-ND 4.0 (ebook gratuito, UNESP-Marília). É o único dos 10
  instrumentos do catálogo onde o Iris pode considerar embutir o texto literal
  dos itens nativamente, sem necessidade de a clínica cadastrar o conteúdo.

### 1.8 PEDI (Inventário de Avaliação Pediátrica de Incapacidade)

- **CORREÇÃO IMPORTANTE (09/07/2026):** a versão anterior deste documento descrevia
  só o domínio de Autocuidado, dando a impressão errada de que o PEDI é
  monodominial. O PEDI (Haley et al., 1992; adaptação brasileira por Marisa Cotta
  Mancini, UFMG, 2005) tem **3 domínios em AMBAS as escalas**:
  - **Escala de Habilidades Funcionais** (Part I, 0/1 = capaz/não capaz, total
    **197 itens**): Autocuidado **73 itens**, Mobilidade **59 itens**, Função
    Social **65 itens**.
  - **Escala de Assistência do Cuidador** (Part II, 0-5, total **20 atividades
    complexas**): Autocuidado **8 atividades** (alimentação, higiene, banho,
    vestir superior/inferior, uso do banheiro, controles urinário/intestinal —
    esta parte já estava certa), Mobilidade **7 atividades**, Função Social
    **5 atividades**.
  - Existe ainda uma **Escala de Modificações** (Part III, reaplica as mesmas 20
    atividades da Escala de Assistência, categorizando o tipo de adaptação:
    Nenhuma / Orientada à criança / Equipamento de reabilitação / Modificações
    extensas) — não modelada neste documento até agora; avaliar se entra no
    escopo do MVP ou fica para depois.
  - Escores: bruto, normativo (<30 = abaixo do esperado para a idade) e contínuo
    (0-100).
- **Escala de assistência do cuidador (6 níveis, confirmado):** independente →
  supervisão → mínima → moderada → máxima → total.
- **Achado da validação contra formulário real (09/07/2026):** não foi possível
  abrir o texto literal dos 59 itens de Mobilidade (bloqueio JS + copyright em
  todas as cópias encontradas), mas a estrutura foi confirmada por múltiplas
  fontes convergentes: Mobilidade se subdivide em **4 subcategorias — 24
  transferências, 13 locomoção em ambientes internos, 12 locomoção em ambientes
  externos, 10 uso de escadas** (24+13+12+10=59). Achado estrutural importante: a
  **Escala de Assistência do Cuidador não é item-a-item** como a Escala de
  Habilidades Funcionais — ela pontua por **cluster/tarefa agregada** (os 20
  "itens" da Parte II já são clusters, não itens individuais equivalentes aos 197
  da Parte I). Se o produto tratar "item" como unidade única e equivalente nas 2
  escalas, isso é uma inconsistência de modelagem a corrigir. Escores brutos por
  domínio convertem para normativos (0-100) por faixa etária — comparação
  normativa, não só soma bruta.
- **O que o agente extrai:** eventos de autocuidado, mobilidade E função social na
  sessão com nível de assistência ("foi ao banheiro com ajuda máxima", "comeu
  sozinha", "subiu a escada com apoio") — mapeados à taxonomia de assistência do
  PEDI (agora nos 3 domínios, não só autocuidado), que é diferente da taxonomia de
  dicas ABA (o formato canônico da Parte 2 resolve isso por protocolo).
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS, achado
  mais importante desta rodada:** o desenho atual conflaciona num único eixo de
  evidência duas coisas que o PEDI real trata como **duas escalas distintas com
  perguntas diferentes**: a Parte I (Escala de Habilidades Funcionais) pergunta
  "a criança CONSEGUE fazer isso, de forma capaz/não capaz (0/1)?" — é sobre
  CAPACIDADE; a Parte II (Escala de Assistência do Cuidador) pergunta "quanto de
  ASSISTÊNCIA o cuidador precisa dar, numa escala de 6 níveis (independente→
  total)?" — é sobre o cuidador, não sobre a criança isoladamente. Uma mesma cena
  do diário ("comeu sozinha o lanche") pode responder às duas perguntas de forma
  diferente (capaz de comer sozinha ≠ automaticamente independente sem qualquer
  supervisão do cuidador no dia a dia). Tratar isso como um único "nível de
  assistência" perde a distinção formal do instrumento entre o QUE a criança
  consegue fazer e QUANTO suporte ela recebe na prática. Recomendação: modelar
  como **dois eixos de evidência separados** (capacidade Parte I: capaz/não capaz;
  assistência Parte II: os 6 níveis), cada evidência podendo alimentar um, outro,
  ou os dois quando o texto permitir inferir ambos — sem que o agente jamais
  calcule o escore formal (mantém R3). Este é o achado de maior prioridade de
  correção entre os 10 protocolos revisados nesta rodada.
- **Licenciamento:** a versão brasileira (Mancini/UFMG) circula como manual
  acadêmico — não encontrei venda como "kit de teste restrito" como os
  instrumentos americanos; protocolos de aplicação aparecem disponibilizados em
  portais universitários. Não é uma declaração explícita de domínio público —
  tratar como "provavelmente mais aberto que os instrumentos fechados, confirmar
  com a UFMG/editora do manual antes de embutir o texto literal em produção".

### 1.9 DCDQ (Questionário de Transtorno do Desenvolvimento da Coordenação)

- **O que é:** versão DCDQ'07 (a padrão de uso atual), questionário respondido
  pelos PAIS, **15 itens** em 3 fatores (controle durante o movimento, motricidade
  fina/escrita, coordenação geral), escala 1-5 por item, **total 15-75**, faixas
  indicativas de TDC por idade. **Confirmado 09/07/2026** — PDF oficial aberto e
  os 15 itens reais extraídos (dcdq.ca), agrupados exatamente nos 3 fatores já
  documentados. Achados adicionais do formulário real: **correção 09/07/2026
  (validação especialista) — os pontos de corte diferem SÓ por faixa etária, NÃO
  por sexo.** A afirmação anterior ("faixa etária E sexo") estava errada e era
  internamente inconsistente com a frase seguinte deste mesmo item (que já dizia
  corretamente "faixas por idade", sem sexo). O manual oficial do DCDQ'07 é
  explícito: testou e descartou efeito de gênero (F(1,284)=.8, p=.37) — por isso
  a revisão de 2007 eliminou a estratificação por sexo que o DCDQ original de
  1997 tinha. Regra de validade exige **os 15 itens preenchidos** para gerar
  escore total (sem substituição por média em caso de item faltante). **Achado
  adicional:** existe uma adaptação transcultural brasileira validada, o
  **DCDQ-Brasil** (Prado, Magalhães &amp; Wilson, 2009, UFMG) — não é tradução 1:1:
  os itens 3 e 13 do original foram SUBSTITUÍDOS por itens com melhor
  discriminação psicométrica na amostra brasileira, e há discussão na literatura
  (SciELO) sobre se os cutoffs canadenses devem ser recalibrados para a
  população brasileira. Como o Iris opera em português, vale declarar
  explicitamente qual versão (DCDQ'07 original vs. DCDQ-Brasil) está em uso.
- **O que o agente extrai:** nada diretamente (relato de pais). Observações motoras
  do diário ("não copia círculo", "preensão palmar") viram evidências do domínio
  motor de outros instrumentos e insumo qualitativo.
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS:**
  além da correção do cutoff por sexo acima, o especialista sugeriu 2 pontos de
  produto (não bloqueadores): (1) hoje, quando os pais devolvem o DCDQ preenchido
  e o terapeuta narra o resultado no diário ("recebido DCDQ dos pais — escore 42,
  coordenação geral rebaixada"), o DCDQ não estar em `protocolos_ativos` faz essa
  evidência cair sempre em vínculo nulo — avaliar permitir adicionar o DCDQ a
  `protocolos_ativos` quando formalmente encaminhado/devolvido, para que o
  RESULTADO RELATADO pelo terapeuta (nunca calculado pelo agente) possa ser
  citado como evidência vinculada; (2) um sinalizador baseado em padrão de
  observações motoras incidentais acumuladas poderia sugerir o momento de
  encaminhar o DCDQ aos pais — sempre rotulado como apoio administrativo, nunca
  como inferência diagnóstica (mantém R3).
- **Licenciamento:** **gratuito** — site oficial (dcdq.ca) disponibiliza o DCDQ'07
  livremente para download; só a versão "Little DCDQ" (pré-escolares) é paga
  (CAD 50). Segundo dos 2 instrumentos do catálogo (com o MBGR) onde embutir o
  texto literal é viável sem risco de licenciamento.

### 1.10 Perfil Sensorial 2

- **O que é:** questionário de processamento sensorial, formulário Criança
  confirmado 09/07/2026 na faixa **3:0 a 14:11** (3 a 14 anos e 11 meses — bate
  com "3-14"); **86 itens — CONFIRMADO (correção 09/07/2026, validação
  especialista):** a ressalva anterior ("não confirmado contra o manual
  primário") foi suavizada demais — duas fontes secundárias independentes e
  coerentes (apresentação ILOTA 2014 com copyright Pearson explícito, e blog
  clínico especializado Pabau) confirmam 86 itens (reduzidos de 125 no Sensory
  Profile original de 1999), sem nenhuma fonte contraditória; ainda vale
  registrar que o manual pago da Pearson não foi acessado diretamente. Quadrantes
  (nomenclatura oficial confirmada): exploração/busca (Seeking), esquiva/evitação
  (Avoiding), sensibilidade (Sensitivity), registro/observação (Registration).
  Seções sensoriais: auditivo, visual, tato, movimentos, posição do corpo, oral.
  Comportamentais: conduta, socioemocional, atenção. Classificação em faixas
  normativas ("muito menos que os outros" ↔ "muito mais que os outros"). **Achado
  adicional (validação especialista):** existem outras versões da família Sensory
  Profile 2 fora do escopo atual — Infantil (0-6m, 25 itens), Toddler (7-35m),
  Curto/Short (34 itens) — relevantes só se o Iris atender bebês no futuro; e o
  "Adolescent/Adult Sensory Profile" é um **produto Pearson SEPARADO** (autorrelato,
  11+ anos, estrutura de itens diferente), não uma simples extensão etária do
  Perfil Sensorial 2 — vale essa distinção clara se o roadmap um dia incluir
  adolescentes/adultos.
- **Achado da validação contra relatórios de amostra reais da Pearson (09/07/2026):**
  relatórios reais (Score Summary, Multi-Rater, School Companion) mostram camadas
  não modeladas no catálogo: suporte a **multi-respondente** (até 3 respondentes
  lado a lado, ex.: avô/pai/mãe, códigos R1/R2/R3 por seção) — relevante se o
  Iris precisar suportar múltiplos informantes no mesmo protocolo; e, na versão
  "School Companion" (relatório completo/planejamento), campos adicionais fora do
  escore numérico — "Fatores Escolares" (4 aspectos contextuais do ambiente),
  Análise de Itens (44 comportamentos com frequência de resposta), e uma seção
  narrativa de planejamento (forças da criança, motivo do encaminhamento,
  objetivos desejados, recomendações clínicas em texto livre). Se o Iris modelar
  o Perfil Sensorial 2 só como "4 quadrantes + escore", essas 2 camadas
  (multi-respondente e bloco narrativo/contextual) ficam de fora do desenho de
  relatório futuro.
- **O que o agente extrai:** EVENTOS SENSORIAIS do diário no formato ABC estendido
  (gatilho sensorial + resposta + estratégia de regulação + duração + categoria
  sensorial: auditivo/tátil/vestibular/oral/visual/proprioceptivo). Ex.: sirene →
  tapar ouvidos + queda + choro → contenção/abraço profundo → ~2min → auditivo/
  esquiva. Alimenta o raciocínio clínico da TO; não pontua o questionário.
- **Achado da validação especialista (09/07/2026) — APROVADO COM RESSALVAS, achado
  de coerência de modelo:** os 4 quadrantes de Dunn não são categorias arbitrárias
  — são o produto de **2 eixos ortogonais**: limiar neurológico (alto vs. baixo) e
  estratégia de autorregulação (ativa vs. passiva). O `registro_abc` estendido
  atual captura bem o domínio sensorial (mapeia direto às 6 seções) e parcialmente
  o eixo ativo/passivo (via consequência/regulação), mas **não existe nenhum campo
  que capture o limiar** — se o estímulo foi mínimo/cotidiano (sugerindo limiar
  baixo) ou genuinamente intenso/extremo (uma sirene é estímulo forte para
  qualquer criança, isso sozinho não indica limiar baixo). Sem essa informação,
  dois eventos com a mesma resposta ("tapar ouvidos") ficam indistinguíveis entre
  Esquiva (reage a qualquer barulho) e reação pontual a um estímulo objetivamente
  extremo. Achado relacionado: o próprio exemplo da documentação ("auditivo/
  esquiva") já mistura um rótulo de padrão/quadrante dentro do que deveria ser só
  a subcategoria sensorial — sinal de que essa ambiguidade já existe no desenho do
  schema, não só como risco de execução do LLM; recomenda-se esclarecer se existe
  (ou deveria existir) um campo distinto para "padrão/quadrante", separado de
  "subcategoria sensorial". Recomendação concreta de melhoria (mantendo
  compliance com R3 — campos descritivos, não pontuação): adicionar
  `intensidade_estimulo` (estímulo cotidiano/mínimo vs. atípico/intenso, extraído
  literalmente do relato) e `modo_resposta` (ativo: a criança buscou/evitou/agiu
  vs. passivo: só manifestou desconforto ou precisou ser alertada) ao
  `registro_abc` sensorial — os 3 campos juntos (domínio + intensidade + modo)
  dão à TO os eixos necessários para ELA (não o agente) inferir o padrão de Dunn.
  Achado menor: os campos narrativos do School Companion ("forças da criança",
  "motivo de encaminhamento") são plausíveis mas não puderam ser confirmados
  diretamente contra amostra pública — double-check recomendado antes de tratá-los
  como definitivos.
- **Licenciamento:** produto comercial restrito da Pearson Clinical Brasil
  (~R$1.300 o kit completo), com cadernos consumíveis por faixa etária vendidos
  em pacotes de 10 + créditos de correção computadorizada (não reutilizáveis),
  listado como "Teste Restrito" (exige registro profissional para compra). Mantém
  "clínica cadastra".

### Veredito consolidado — validação especialista por protocolo (09/07/2026)

10/10 protocolos passaram por um agente-especialista clínico dedicado
(Completude / Coerência do modelo / Aplicabilidade), com busca a fontes
primárias. Nenhum foi reprovado; todos vieram **APROVADO COM RESSALVAS** — o que
é o resultado esperado numa 1ª rodada de validação externa, não um sinal de
problema. Resumo de 1 linha por protocolo (detalhe completo inline em cada
seção 1.x acima):

1. **VB-MAPP** — números corretos; falta o componente Task Analysis (~750
   subtarefas) e as Barreiras são heterogêneas demais para um único tipo de
   coleta.
2. **ABLLS-R** — granularidade por tarefa estava marcada como não verificada;
   **corrigido**, é confirmada; considerar extensão opcional de contrato no
   nível de tarefa.
3. **Denver/ESDM** — núcleo do processo (objetivo por ciclo) correto; contagem
   de domínios e itens **corrigida** (10 domínios, não 11/"comportamento"; "480
   itens" removido por falta de fonte); taxonomia de ajuda reenquadrada como
   exemplo, não canônica.
4. **AFLS** — correção da rodada anterior (6 protocolos separados)
   **confirmada de forma independente** por fonte primária da CentralReach;
   só ressalvas de clareza.
5. **PROC** — total de 150 confirmado, com nuance sobre a contradição do
   próprio artigo-fonte; modelo de domínios incompleto para ~metade dos pontos
   do protocolo (6 das 7 funções comunicativas, 2 dos 3 subitens do bloco
   cognitivo, contextualização) — maior achado de cobertura desta rodada.
6. **ABFW** — erro factual **corrigido** (pragmática não é baseada no ROLPP);
   pragmática promovida a "parcialmente validada"; falta domínio de pragmática
   no contrato — risco relevante para um produto focado em TEA.
7. **MBGR** — estrutura confirmada; recomendado tônus como 4º domínio de
   triagem incidental.
8. **PEDI** — achado mais importante da rodada: Parte I (capacidade) e Parte II
   (assistência do cuidador) estavam conflacionadas num único eixo de
   evidência; recomendados 2 eixos separados.
9. **DCDQ** — erro factual **corrigido** (cutoff é só por idade, não idade+sexo);
   adicionada nota sobre o DCDQ-Brasil (2 itens diferentes do original).
10. **Perfil Sensorial 2** — contagem de 86 itens **promovida** de "não
    confirmada" para confirmada; falta capturar os 2 eixos teóricos de Dunn
    (limiar + modo de resposta) no `registro_abc` sensorial.

Nenhum desses achados bloqueia o MVP do agente de extração (nenhum exige
pontuar protocolo — R3 continua intacto em todos); são, na maioria, lacunas de
COBERTURA de domínio ou precisão de contagem, não erros de arquitetura. Ver
`BACKLOG.md` seção B para o registro completo com decisão de prioridade por
achado.

### Síntese do processo clínico (onde o agente vive)

```
Avaliação inicial (instrumentos formais, por disciplina)
      → Plano de cuidados (horas/semana por área)
      → Metas individualizadas (PEI, ciclos de 8-12 semanas)
      → SESSÕES DIÁRIAS → diário do terapeuta → [AGENTE] → evidências
      → dossiê acumulado por meta/marco → "candidatos a avaliação"
      → Reavaliação formal (série 1º-4º teste) → relatório interdisciplinar
      → novo plano de cuidados / novas metas → ciclo recomeça
```

O agente atua exclusivamente na seta sessão→evidência. Tudo acima e abaixo é ato
clínico humano que o dossiê abastece.

---

## Parte 2 — Formato canônico de definição de protocolo (recebido via contexto)

O agente nunca conhece protocolos de fábrica. Ele recebe, por paciente, um contexto
montado pelo backend com este formato (versão condensada — só domínios relevantes e
itens abertos, para caber no contexto):

```json
{
  "paciente": {
    "id": "pt_123",
    "idade_meses": 60,
    "resumo_repertorio": "Comunicação predominantemente não-verbal; mandos vocais emergentes ('ba'); pareamento visual sólido; hipersensibilidade auditiva.",
    "metas_ativas": [
      {
        "goal_id": "g_01",
        "descricao": "Emitir mando vocal para 5 itens diferentes sem dica ecoica",
        "disciplina": "ABA",
        "mapeamentos": [
          { "protocol_id": "vbmapp", "dominio_id": "mando", "nivel": 1 }
        ]
      }
    ]
  },
  "protocolos_ativos": [
    {
      "protocol_id": "vbmapp",
      "nome": "VB-MAPP",
      "tipo_coleta": "evidencia_por_dominio",
      "escala_formal": {
        "valores": [0, 0.5, 1],
        "quem_pontua": "terapeuta_em_avaliacao"
      },
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
          "dominio_id": "mando",
          "nome": "Mando",
          "definicao_funcional": "pedido motivado por necessidade/desejo; antecedente = motivação, não pergunta",
          "sinais_no_texto": ["pediu", "puxou a mão", "apontou querendo"]
        },
        {
          "dominio_id": "tato",
          "nome": "Tato",
          "definicao_funcional": "nomeação diante de estímulo não-verbal presente",
          "sinais_no_texto": ["nomeou", "respondeu 'o que é isso?'"]
        }
      ],
      "componentes_extras": [
        {
          "id": "barreiras",
          "tipo_coleta": "registro_abc",
          "categorias": ["comportamental", "sensorial"]
        }
      ]
    }
  ],
  "historico_relevante": [
    {
      "dominio_id": "tato",
      "resumo": "nunca emitiu tato sem dica ecoica (últimas 20 sessões)"
    }
  ]
}
```

Regras do formato:

- `definicao_funcional` e `sinais_no_texto` são cadastrados pela clínica (conteúdo
  licenciado fica no banco dela, não no prompt do produto).
- `taxonomia_ajuda` é POR PROTOCOLO: VB-MAPP usa dicas ABA; PEDI usa níveis de
  assistência (independente→total); ESDM usa apoio dentro do objetivo. O agente
  usa a taxonomia declarada, com fallback para a taxonomia universal.
- `historico_relevante` habilita a sinalização de inconsistência (anti-rubber-stamping).
- Adicionar protocolo novo = novo objeto neste array. Zero mudança no agente.

### 2.1 Extensões de contrato resolvidas — cobertura de domínio (09/07/2026)

A validação especialista por protocolo (10/10, ver Parte 1 e `BACKLOG.md` seção
B) documentou lacunas de cobertura como RECOMENDAÇÃO, sem fechar a decisão de
como modelar. Esta seção fecha a decisão para as 5 lacunas de maior prioridade
(PEDI, PROC, ABFW, MBGR, Perfil Sensorial 2) como extensão do formato canônico
acima — pronta para virar o catálogo DEFAULT que o produto entrega (a clínica
ainda pode editar/adicionar; isso não é o conteúdo licenciado, é a ESTRUTURA de
domínio, que o Iris pode fornecer como ponto de partida mesmo para os 8
instrumentos "clínica cadastra"). Implementação em código (schema real do
banco/UI de cadastro) continua Fase 3 — o que fecha aqui é a MODELAGEM, não o
código.

**PEDI — dois eixos de avaliação (achado de maior prioridade da rodada).**
Cada domínio do PEDI ganha um novo campo de contrato, `eixos_avaliacao`, que
generaliza para qualquer protocolo futuro com a mesma característica (uma
mesma cena respondendo a mais de uma pergunta formal). O agente usa o novo
campo `eixo_protocolo` do `output-schema.json` (ver Parte 4) para marcar a
qual eixo aquela evidência pertence — gerando 2 extrações quando o texto
sustenta os dois eixos, nunca uma extração combinada:

```json
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
      "dominio_id": "pedi_autocuidado",
      "nome": "Autocuidado",
      "eixos_avaliacao": [
        {
          "eixo_id": "capacidade",
          "nome": "Escala de Habilidades Funcionais (Parte I)",
          "escala": ["capaz", "nao_capaz"],
          "quem_pontua": "terapeuta_em_avaliacao_formal"
        },
        {
          "eixo_id": "assistencia_cuidador",
          "nome": "Escala de Assistência do Cuidador (Parte II)",
          "escala": [
            "independente",
            "supervisao",
            "assistencia_minima",
            "assistencia_moderada",
            "assistencia_maxima",
            "assistencia_total"
          ],
          "quem_pontua": "terapeuta_em_avaliacao_formal"
        }
      ],
      "sinais_no_texto": [
        "comeu sozinha",
        "precisou de ajuda para",
        "fez sem supervisão"
      ]
    },
    {
      "dominio_id": "pedi_mobilidade",
      "nome": "Mobilidade",
      "eixos_avaliacao": "mesma estrutura de pedi_autocuidado"
    },
    {
      "dominio_id": "pedi_funcao_social",
      "nome": "Função Social",
      "eixos_avaliacao": "mesma estrutura de pedi_autocuidado"
    }
  ]
}
```

Uma mesma cena ("comeu sozinha o lanche") pode gerar 1 extração no eixo
`capacidade` (capaz) e, se o texto informar o contexto de supervisão, outra no
eixo `assistencia_cuidador` — nunca fundidas. A Escala de Modificações (Parte
III) fica de fora por ora (achado documentado em 1.8, não bloqueador).

**PROC — domínio único `funcao_comunicativa` com atributo enum, mais 2 domínios
do bloco cognitivo.** Substitui o domínio "protesto" isolado, cobrindo as 7
funções do Bloco 1b (14 dos 60 pontos do Bloco 1) num único domínio — a regra
"classifica função pelo ANTECEDENTE" já desenhada para R3 se aplica ao campo
`funcao` (já existente no `output-schema.json`, reaproveitado sem mudança de
schema):

```json
{
  "dominio_id": "funcao_comunicativa", "nome": "Função Comunicativa (PROC Bloco 1b)",
  "definicao_funcional": "ato comunicativo classificado pela função a partir do ANTECEDENTE (o que motivou o ato), nunca pela forma",
  "valores_funcao": ["protesto", "instrumental", "interativa", "nomeacao", "informativa", "heuristica", "narrativa"],
  "sinais_no_texto": ["apontou para o suco pedindo mais (instrumental)", "nomeou o cachorro no livro (nomeacao)", "chorou quando tiraram o brinquedo (protesto)"]
},
{ "dominio_id": "manipulacao_objetos", "nome": "Manipulação de Objetos (PROC Bloco 3a)" },
{ "dominio_id": "organizacao_brinquedo", "nome": "Organização do Brinquedo (PROC Bloco 3c)" }
```

`contextualizacao_linguagem` (Bloco 1d, 15 pts) fica registrado como domínio
de baixa prioridade — mais difícil de capturar via diário livre, não
implementado nesta rodada.

**ABFW — domínio `pragmatica` (achado de maior risco clínico, produto focado em
TEA).** Reaproveita `funcao` (mesmo campo do PROC acima, ~20 categorias em vez
de 7) e `topografia` (já existente — cobre os 3 meios comunicativos VE/VO/G
sem precisar de campo novo: `vocal_articulado`≈VE, `vocal_nao_articulado`≈VO,
`gestual_simbolico`/`gestual_elementar`≈G):

```json
{
  "dominio_id": "pragmatica",
  "nome": "Pragmática (ABFW)",
  "definicao_funcional": "ato comunicativo por função (pedido, protesto, comentário, jogo compartilhado...) e meio (verbal/vocal/gestual) — NÃO confundir com ROLPP, protocolo Pró-Fono separado",
  "valores_funcao": [
    "pedido_objeto",
    "pedido_acao",
    "pedido_rotina_social",
    "pedido_consentimento",
    "pedido_informacao",
    "protesto",
    "reconhecimento_outro",
    "exibicao",
    "comentario",
    "auto_regulatorio",
    "nomeacao",
    "performativo",
    "exclamativo",
    "reativo",
    "nao_focalizada",
    "jogo",
    "exploratoria",
    "narrativa",
    "jogo_compartilhado"
  ]
}
```

**MBGR — `tono` como 4º domínio de triagem incidental** (ao lado de respiração,
mastigação/deglutição e postura/fala já implícitos): `{ "dominio_id": "tono",
"sinais_no_texto": ["boca sempre entreaberta", "baba excessiva", "mordida
fraca no alimento"] }` — sempre confiança baixa/triagem, nunca substitui
avaliação formal (mantém R3).

**Perfil Sensorial 2 — 2 novos campos em `registro_abc` (não domínio novo).**
`intensidade_estimulo` e `modo_resposta` já adicionados ao `output-schema.json`
(Parte 4) — junto de `subcategoria_sensorial` (já existente), dão à TO os 3
eixos para ela (nunca o agente) inferir o quadrante de Dunn (limiar × modo de
autorregulação). Exemplo: sirene (estímulo objetivamente intenso) → tapar
ouvidos + queda + choro → `intensidade_estimulo: "atipico_intenso"`,
`modo_resposta: "ativo"` — a TO decide se isso indica Esquiva ou reação pontual
esperada para qualquer criança; o agente só descreve.

---

## Parte 3 — System instructions do agente de extração (prontas para uso)

```
# AGENTE DE EXTRAÇÃO CLÍNICA — ESPECTRO

## Papel
Você converte o diário de sessão de um terapeuta infantil (texto livre ou transcrição
de áudio, em pt-BR) em EVIDÊNCIAS estruturadas. Você é um assistente de organização
de dados clínicos. Você NÃO é avaliador: você sugere, o terapeuta decide.

## Entradas
1. O texto do diário da sessão.
2. O contexto do paciente: idade, resumo de repertório, metas ativas (com
   mapeamentos a protocolos), definições dos protocolos ativos (domínios com
   definição funcional, taxonomia de ajuda, componentes extras) e histórico
   relevante. Você só conhece os protocolos descritos nesse contexto.

## Saída
Exclusivamente o JSON do schema fornecido. Nada fora do JSON.

## Regras invioláveis
R1. FIDELIDADE AO TEXTO: extraia apenas o que está escrito. Proibido inferir eventos,
    intenções ou resultados não descritos. Retornar poucas extrações (ou nenhuma) é
    sucesso quando o texto é pobre — nunca complete lacunas.
R2. PROVENIÊNCIA: toda extração cita o trecho literal (`trecho_fonte`) que a
    sustenta. Sem trecho, não há extração.
R3. EVIDÊNCIA, NUNCA PONTUAÇÃO: você não declara marcos atingidos, não atribui
    pontuações de protocolo, não calcula escores. Você produz evidências que o
    sistema acumula.
R4. FUNÇÃO ANTES DA FORMA: classifique cada comportamento pelo ANTECEDENTE descrito,
    não pela palavra emitida. A mesma palavra pode ser: pedido motivado por desejo
    (ex.: mando), nomeação diante de estímulo presente (tato), repetição do modelo
    do adulto (ecoico) ou resposta a estímulo verbal sem o item presente
    (intraverbal). Se o antecedente não permitir decidir, classifique como
    "funcao_indefinida" com confiança baixa — não escolha por palpite.
R5. NÍVEL DE AJUDA SEMPRE: toda evidência recebe o nível de ajuda usando a
    `taxonomia_ajuda` do protocolo mapeado (fallback universal: independente,
    dica_verbal, dica_ecoica, dica_gestual, dica_entonacao, modelacao, dica_fisica).
    Registre também `resultado` (acerto | erro | acerto_apos_dica) e tentativas
    quando o texto informar ("errou a 1ª, acertou com apontamento" = 2 tentativas).
    Falhas anteriores e latência ("só na 3ª chamada") fazem parte da evidência.
R6. EVIDÊNCIA NEGATIVA VALE: dificuldades, falhas e padrões rígidos ("repetiu a
    mesma pergunta em todas as rodadas") são extrações com `polaridade: "negativa"`.
    Pares de contraste (falhou X, acertou Y com antecedente diferente) geram DUAS
    extrações vinculadas por `par_contraste_id`.
R7. COMUNICAÇÃO NÃO-VERBAL CONTA: puxar a mão, apontar, alternar o olhar
    item→adulto→item são atos comunicativos válidos (`topografia` registra o meio:
    vocal_articulado, vocal_nao_articulado, gestual_simbolico, gestual_elementar,
    fisico). Choro/grito com função identificável (ex.: protesto) é ato comunicativo
    E pode gerar registro ABC — extraia ambos.
R8. MÚLTIPLOS ALVOS: um mesmo trecho pode evidenciar mais de um domínio/meta
    (ex.: pedido espontâneo com contato visual → mando E social). Gere uma extração
    por alvo, mesmo `trecho_fonte`.
R9. CADEIAS POR ETAPA: rotinas de vida diária (lavar mãos, vestir, lanche) são
    extraídas como cadeia com nível de ajuda POR ETAPA descrita no texto.
R10. REGISTROS ABC: episódios de comportamento (choro, queda, arremesso,
    estereotipia, fuga) e eventos sensoriais viram `registro_abc`: antecedente,
    comportamento, duração (se informada), consequência/estratégia de regulação,
    categoria (comportamental | sensorial) e subcategoria sensorial quando
    aplicável (auditivo, tátil, vestibular, oral, visual, proprioceptivo).
    AUSÊNCIA relatada ("zero fugas hoje") vira `ausencia_comportamento`.
R11. NÚMEROS SÓ LITERAIS: "vários", "muitas vezes", "quase sempre" NUNCA viram
    contagem. Use `frequencia: {"informada": false}`. Só registre números escritos
    ("3 mandos", "40 segundos").
R12. DIMENSÕES DE QUALIDADE: quando o texto indicar, registre variabilidade
    ("sempre pede os mesmos 2 itens"), generalização ("só com a terapeuta X",
    "primeira vez fora da sala") e restrição a preferências ("só nomeia itens
    favoritos"). São a matéria-prima da prosa dos relatórios formais.
R13. AMBIENTE: classifique estruturado (mesa, tentativas discretas) | natural
    (brincadeira, NET, rotina) | nao_informado.
R14. INCONSISTÊNCIA COM HISTÓRICO: se uma extração contradiz o `historico_relevante`
    — em QUALQUER direção —, mantenha a extração, marque
    `inconsistente_com_historico: true` e explique em `justificativa_confianca`.
    Duas direções contam igualmente: (a) desempenho "bom demais" (ex.: comportamento
    independente que a criança nunca exibiu nem com dica); (b) possível REGRESSÃO
    (ex.: nível de ajuda muito acima do histórico recente numa habilidade antes
    independente, ou falha em algo já dominado). A UI dará fricção extra — você
    não descarta.
R15. TRANSCRIÇÃO DE ÁUDIO: trate erros prováveis de ASR com caridade ("bola" vs
    "cola" pelo contexto), preserve produções fonéticas literais entre aspas quando
    o texto as citar ("bito"), e rebaixe a confiança quando a dúvida for relevante.
R16. PRODUÇÕES DE FALA: registre a produção literal citada e o alvo ("'bito' para
    'biscoito'", aproximação fonética). Nunca infira inventário fonético além do
    citado.
R17. PREFERÊNCIAS E REFORÇADORES: quando o texto indicar interesse ou motivação
    ("muito motivado pela pista de carrinhos", "demonstrou maior interesse pela
    massinha", "o tempo de interesse por reforçador é muito pequeno"), gere uma
    extração `preferencia_reforcador` com o item/atividade, a valência
    (alta | baixa | saciado/perdeu interesse) e o trecho-fonte. Alimenta o perfil
    vivo de reforçadores usado no briefing pré-sessão.
R18. SEVERIDADE DE INCIDENTE: registros ABC recebem `severidade` (leve | moderada
    | grave). GRAVE = autolesão, agressão com risco, fuga do ambiente, ou quando
    o terapeuta descrever risco explícito — dispara notificação obrigatória ao
    coordenador. Na dúvida entre moderada e grave, marque grave (falso positivo
    é aceitável; falso negativo não).
R19. AGNOSTICISMO: nenhuma regra acima depende de um protocolo específico. Os
    domínios contra os quais você classifica vêm SEMPRE do contexto. Se o contexto
    trouxer um protocolo com `tipo_coleta` ou `taxonomia_ajuda` diferentes, use-os.

## Confiança (por extração)
- ALTA: antecedente + comportamento + nível de ajuda explícitos no texto; mapeamento
  direto a um domínio/meta do contexto.
- MÉDIA: comportamento claro, mas antecedente parcialmente inferido do contexto
  imediato do parágrafo; ou mapeamento plausível a 2 domínios.
- BAIXA: função indefinida, texto ambíguo, ou suspeita de erro de transcrição.
  Sempre explique em `justificativa_confianca`.
- **Confiança é independente de `inconsistente_com_historico` (correção
  09/07/2026, achado do teste cego dos Casos 10-17):** inconsistência com o
  histórico (R14) NÃO rebaixa a confiança por si só — se o texto descreve
  antecedente + comportamento + nível de ajuda com a mesma clareza de sempre,
  a confiança permanece ALTA/MÉDIA normalmente; quem sinaliza a divergência é
  o boolean `inconsistente_com_historico: true` + a `justificativa_confianca`,
  nunca uma confiança artificialmente baixa. Confundir "isto diverge do
  histórico" com "não tenho certeza do que aconteceu" era um erro presente no
  golden example anterior (corrigido abaixo) e em parte dos 9 casos originais.

## Processo
1. Segmente o diário em eventos (antecedente → comportamento → consequência).
2. Para cada evento: classifique a função pelo antecedente (R4), o nível de ajuda
   (R5), a topografia (R7), o ambiente (R13).
3. Mapeie cada evento às metas ativas e domínios dos protocolos do contexto (R8).
4. Identifique registros ABC, ausências e cadeias (R9, R10).
5. Capture dimensões de qualidade e frequências literais (R11, R12).
6. Cheque contra o histórico (R14). Atribua confiança. Monte o JSON.
```

---

## Parte 4 — JSON Schema de saída + execução do golden example

### Schema (compatível com structured outputs; versão condensada)

```json
{
  "type": "object",
  "required": ["extracoes", "resumo_sessao"],
  "properties": {
    "extracoes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["tipo", "trecho_fonte", "confianca"],
        "properties": {
          "tipo": {
            "enum": [
              "evidencia",
              "registro_abc",
              "ausencia_comportamento",
              "cadeia",
              "preferencia_reforcador"
            ]
          },
          "trecho_fonte": { "type": "string" },
          "confianca": { "enum": ["alta", "media", "baixa"] },
          "justificativa_confianca": { "type": "string" },
          "inconsistente_com_historico": { "type": "boolean" },
          "par_contraste_id": { "type": ["string", "null"] },
          "evidencia": {
            "type": "object",
            "properties": {
              "descricao": { "type": "string" },
              "polaridade": { "enum": ["positiva", "negativa"] },
              "funcao": { "type": "string" },
              "funcao_indefinida": { "type": "boolean" },
              "alvos": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "goal_id": { "type": ["string", "null"] },
                    "protocol_id": { "type": ["string", "null"] },
                    "dominio_id": { "type": ["string", "null"] }
                  }
                }
              },
              "nivel_ajuda": { "type": "string" },
              "resultado": {
                "enum": ["acerto", "erro", "acerto_apos_dica", "nao_aplicavel"]
              },
              "tentativas": {
                "type": "object",
                "properties": {
                  "informado": { "type": "boolean" },
                  "total": { "type": ["integer", "null"] },
                  "acertos": { "type": ["integer", "null"] }
                }
              },
              "topografia": {
                "enum": [
                  "vocal_articulado",
                  "vocal_nao_articulado",
                  "gestual_simbolico",
                  "gestual_elementar",
                  "fisico",
                  "nao_informado"
                ]
              },
              "producao_literal": { "type": ["string", "null"] },
              "alvo_producao": { "type": ["string", "null"] },
              "ambiente": {
                "enum": ["estruturado", "natural", "nao_informado"]
              },
              "frequencia": {
                "type": "object",
                "properties": {
                  "informada": { "type": "boolean" },
                  "valor": { "type": ["number", "null"] },
                  "unidade": { "type": ["string", "null"] }
                }
              },
              "dimensoes_qualidade": {
                "type": "object",
                "properties": {
                  "variabilidade": { "type": ["string", "null"] },
                  "generalizacao": { "type": ["string", "null"] },
                  "restricao_preferencia": { "type": ["string", "null"] }
                }
              }
            }
          },
          "cadeia": {
            "type": "object",
            "properties": {
              "nome": { "type": "string" },
              "etapas": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "descricao": { "type": "string" },
                    "nivel_ajuda": { "type": "string" }
                  }
                }
              }
            }
          },
          "registro_abc": {
            "type": "object",
            "properties": {
              "antecedente": { "type": "string" },
              "comportamento": { "type": "string" },
              "duracao_segundos": { "type": ["integer", "null"] },
              "consequencia_regulacao": { "type": "string" },
              "categoria": { "enum": ["comportamental", "sensorial"] },
              "subcategoria_sensorial": { "type": ["string", "null"] },
              "severidade": { "enum": ["leve", "moderada", "grave"] }
            }
          },
          "ausencia_comportamento": {
            "type": "object",
            "properties": {
              "comportamento": { "type": "string" },
              "contexto": { "type": "string" }
            }
          },
          "preferencia_reforcador": {
            "type": "object",
            "properties": {
              "item_atividade": { "type": "string" },
              "valencia": { "enum": ["alta", "baixa", "saciado"] }
            }
          }
        }
      }
    },
    "resumo_sessao": { "type": "string" },
    "sinalizacoes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "tipo": {
            "enum": [
              "inconsistencia_historico",
              "possivel_erro_transcricao",
              "texto_ambiguo"
            ]
          },
          "detalhe": { "type": "string" }
        }
      }
    }
  }
}
```

### Execução do golden example (diário do Leo → saída esperada)

**Nota de sincronização (09/07/2026):** esta seção estava DESATUALIZADA — faltavam
2 extrações (a inconsistência de histórico no tato "cachorro" e o
`preferencia_reforcador` da "pista de carrinhos") que já tinham sido corrigidas no
arquivo canônico `golden-example-output.json`, mas o copy-paste aqui nunca foi
atualizado. Corrigido agora, com o ajuste adicional de que a inconsistência com o
histórico não rebaixa mais a confiança por si só (ver "Confiança" acima) — o tato
"cachorro" mantém confiança ALTA (antecedente+comportamento+nível de ajuda
explícitos) e sinaliza a divergência só via `inconsistente_com_historico` +
`justificativa_confianca`.

```json
{
  "extracoes": [
    {
      "tipo": "preferencia_reforcador",
      "trecho_fonte": "Ele estava muito motivado pela pista de carrinhos",
      "confianca": "alta",
      "preferencia_reforcador": {
        "item_atividade": "pista de carrinhos",
        "valencia": "alta"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "Quando o carrinho travou, ele olhou para mim, fez contato visual espontâneo e disse 'ajuda'",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Mando vocal espontâneo ('ajuda') diante de motivação clara (carrinho travado)",
        "polaridade": "positiva",
        "funcao": "mando",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "mando" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "ajuda",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "ele olhou para mim, fez contato visual espontâneo",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Contato visual espontâneo dirigido ao adulto durante solicitação",
        "polaridade": "positiva",
        "funcao": "comunicacao_social",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "social" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "gestual_elementar",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "perguntei 'O que é isso?'. Ele respondeu claramente 'cachorro'",
      "confianca": "alta",
      "inconsistente_com_historico": true,
      "justificativa_confianca": "Tato emitido de forma independente (antecedente, comportamento e nível de ajuda todos explícitos no texto), mas o histórico_relevante registra que o paciente nunca emitiu tato sem dica ecoica nas últimas 20 sessões — possível avanço real ou erro de observação/registro (R14, direção 'bom demais para ser verdade'). A confiança na EXTRAÇÃO em si permanece alta (o texto é claro); a divergência é sinalizada separadamente via inconsistente_com_historico, não pela confiança.",
      "evidencia": {
        "descricao": "Tato do item 'cachorro' diante do estímulo presente e pergunta",
        "polaridade": "positiva",
        "funcao": "tato",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "tato" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "cachorro",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "Pedi para ele: 'Leo, bate palma', e ele bateu",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Seguiu instrução motora simples",
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
      "trecho_fonte": "eu disse 'faz igual' e toquei no nariz, e ele imitou perfeitamente",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Imitação motora sob instrução 'faz igual'",
        "polaridade": "positiva",
        "funcao": "imitacao_motora",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "imitacao" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "pedi 'pega a bola', mas ele pegou o sapato. Tentei de novo apontando de leve para a bola, e aí ele acertou",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Seleção por instrução: erro na 1ª tentativa, acerto com dica gestual (apontamento)",
        "polaridade": "positiva",
        "funcao": "ouvinte",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "ouvinte" }],
        "nivel_ajuda": "dica_gestual",
        "resultado": "acerto_apos_dica",
        "tentativas": { "informado": true, "total": 2, "acertos": 1 },
        "ambiente": "estruturado"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "dei a dica verbal dizendo 'biscoito'. Ele repetiu 'bito' e eu entreguei na mesma hora",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Ecoico com dica: repetiu aproximação fonética do modelo para obter item",
        "polaridade": "positiva",
        "funcao": "ecoico",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "ecoico" }],
        "nivel_ajuda": "dica_ecoica",
        "resultado": "acerto_apos_dica",
        "topografia": "vocal_articulado",
        "producao_literal": "bito",
        "alvo_producao": "biscoito",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "evidencia",
      "trecho_fonte": "Cantei 'cada coisa no seu...' e fiz uma pausa, e ele completou cantando 'lugar!'",
      "confianca": "alta",
      "evidencia": {
        "descricao": "Intraverbal: completou frase de música após pausa",
        "polaridade": "positiva",
        "funcao": "intraverbal",
        "alvos": [{ "protocol_id": "vbmapp", "dominio_id": "intraverbal" }],
        "nivel_ajuda": "independente",
        "resultado": "acerto",
        "topografia": "vocal_articulado",
        "producao_literal": "lugar",
        "ambiente": "natural"
      }
    },
    {
      "tipo": "registro_abc",
      "trecho_fonte": "Quando avisei que a sessão estava acabando e comecei a guardar a massinha, ele jogou um pedaço no chão e gritou, choramingando por uns 40 segundos",
      "confianca": "alta",
      "registro_abc": {
        "antecedente": "Aviso de fim de sessão + início da guarda da massinha (transição)",
        "comportamento": "Jogou massinha no chão, gritou e choramingou",
        "duracao_segundos": 40,
        "consequencia_regulacao": "Espera pela regulação + redirecionamento com música de guardar brinquedos",
        "categoria": "comportamental",
        "subcategoria_sensorial": null
      }
    }
  ],
  "resumo_sessao": "Sessão com evidências positivas em mando, tato, ouvinte, imitação, ecoico e intraverbal; forte motivação por 'pista de carrinhos' (reforçador); 1 episódio breve de comportamento em transição, regulado com música. Tato independente sinalizado para revisão por inconsistência com o histórico recente.",
  "sinalizacoes": [
    {
      "tipo": "inconsistencia_historico",
      "detalhe": "Tato de 'cachorro' emitido de forma independente (sem dica ecoica); histórico das últimas 20 sessões registra que o paciente nunca emitiu tato sem dica ecoica."
    }
  ]
}
```

Diferenças intencionais vs. um extrator ingênuo: o "ajuda" gerou DUAS extrações
(R8); o "pega a bola" registra o erro e as 2 tentativas (R5); o "bito" guarda a
produção literal e o alvo (R16); o choro é ABC, não pontuação (R10); nenhum marco
foi declarado atingido (R3); o tato "cachorro" mantém confiança alta mas é
sinalizado por divergir do histórico (R14, sem confundir os dois sinais).

---

## Parte 5 — Camada de validação do coordenador (reclassificação supervisionada)

### O modelo de governança em 3 camadas

```
Camada 1 — IA:         sugere extrações (nunca decide)
Camada 2 — Terapeuta:  aprova/edita/rejeita → evidência oficial (dono da sessão)
Camada 3 — Coordenador: valida POR EXCEÇÃO e pode RECLASSIFICAR → nova versão
                        da evidência (autoridade clínica de supervisão)
```

A reclassificação do coordenador (habilidade classificada como X → mudar para Y)
está alinhada à hierarquia clínica real: em ABA, o supervisor tem autoridade sobre
o programa; o AT coleta. Mas para funcionar sem destruir adoção nem virar gargalo,
ela obedece a 5 regras:

**V1 — Por exceção, nunca gate.** O coordenador NÃO revisa tudo (25 terapeutas ×
8 sessões/dia = impossível e desnecessário). A fila de validação recebe apenas:
(a) evidências de confiança baixa aprovadas pelo terapeuta;
(b) evidências marcadas `inconsistente_com_historico`;
(c) amostra aleatória configurável (ex.: 5-10%) para auditoria de qualidade;
(d) período de calibração: 100% das primeiras N sessões de terapeuta novo;
(e) revisão pré-avaliação formal: TODO o dossiê de um marco "candidato a
avaliação" antes da janela de pontuação (este é o momento de maior valor);
(f) evidências que o próprio terapeuta encaminhou com dúvida.

**V2 — Reclassificar exige justificativa; ambiguidade devolve, não adivinha.**
Ações possíveis do coordenador: CONFIRMAR | RECLASSIFICAR (X→Y, justificativa
obrigatória) | DEVOLVER ao terapeuta com pergunta | INVALIDAR (com motivo).
Regra de ouro: a fonte da verdade é o texto do diário. Se o texto não permite
decidir entre X e Y, a ação correta é DEVOLVER (só o terapeuta esteve na sessão)
— nunca reclassificar por palpite.

**V3 — Versionado, nunca sobrescrito.** Reclassificação gera nova versão da
Evidence no log imutável (autor, data, de→para, justificativa). A linha do tempo
e os snapshots recompõem. MilestoneAssessment já realizada NUNCA é alterada por
reclassificação — avaliação formal é ato fechado; se o dossiê mudou, agenda-se
reavaliação.

**V4 — Feedback, não punição.** O terapeuta é notificado de toda reclassificação
com a justificativa — é instrumento de formação (o par mando/tato mal classificado
é conteúdo de supervisão). A notificação nunca é silenciosa (minaria confiança) e
o enquadramento segue a decisão anti-vigilância.

**V5 — Divergência vira métrica e dataset.** Taxa de reclassificação por
terapeuta/domínio/protocolo é o proxy de concordância entre observadores (IOA):
alta divergência num domínio → pauta de supervisão; alta divergência num padrão
do agente → caso de teste novo para o extractor. Cada reclassificação é um par
(texto, classificação-errada, classificação-certa) — o dataset mais valioso do
produto para evoluir a IA.

### Checklists de validação por protocolo (os erros clássicos que o coordenador caça)

**VB-MAPP (operantes verbais) — confusões de função:**

- Mando vs. tato: havia MOTIVAÇÃO (queria o item) ou só o estímulo presente?
  "Disse 'bola' vendo a bola" sem querer a bola = tato, não mando.
- Tato vs. ecoico: houve modelo vocal do adulto imediatamente antes? Se repetiu,
  é ecoico — mesmo que o item estivesse presente.
- Tato vs. intraverbal: o estímulo estava fisicamente presente? Sem estímulo
  presente (responder sobre o café da manhã) = intraverbal.
- Mando com dica disfarçada: "o que você quer?" antes do pedido muda o registro.
- Independente "generoso": a dica de entonação, a repetição da instrução e o
  gesto sutil contam como dica — o texto menciona e o agente às vezes suaviza.
- ABC sem antecedente: registro de barreira sem o que veio antes é incompleto —
  devolver ao terapeuta.

**ABLLS-R / AFLS (cadeias e rubricas):**

- Nível de ajuda POR ETAPA, não da cadeia inteira ("lavou as mãos com ajuda" não
  serve; qual etapa teve ajuda?).
- AFLS é 6 protocolos separados por módulo/ambiente (não 1 instrumento com campo
  cruzando ambientes — corrigido 09/07/2026): o erro clássico é registrar um
  ensaio de simulação em clínica como se fosse a mesma administração formal do
  módulo Participação Comunitária (que é escopado ao ambiente comunitário real).
  Ensaio clínico é dado informal/preparatório; não substitui nem se soma à
  administração do módulo correto.

**ESDM / Denver (objetivos de ciclo):**

- A evidência aponta para o OBJETIVO certo do ciclo de 12 semanas e o passo de
  aprendizagem correto — não para o domínio genérico.
- Contexto naturalista: evidência obtida em tentativa massificada de mesa num
  programa naturalista merece nota, não celebração.

**PROC / ABFW (fono):**

- Função comunicativa correta: choro/grito pode ser PROTESTO (função válida) —
  o erro clássico é registrar só como comportamento inadequado e perder o dado
  de pragmática. O inverso também: nem todo choro tem função comunicativa.
- Meio de comunicação correto (vocal articulado vs. não articulado vs. gesto
  simbólico vs. elementar).
- Produção fonética: só o literal citado; reclassificar qualquer inventário
  inferido além do texto.

**PEDI (funcionalidade):**

- Taxonomia certa: nível de ASSISTÊNCIA (independente→total), não dica ABA.
  "Comeu com dica verbal" em contexto PEDI = supervisão/assistência mínima.
- Autocuidado observado na clínica ≠ desempenho em casa — marcar contexto.

**Perfil Sensorial 2 (eventos sensoriais):**

- Categoria sensorial correta (a sirene é auditivo; jogar-se no chão pode ser
  vestibular/proprioceptivo ou comportamental — o antecedente decide).
- Padrão correto: ESQUIVA (afasta-se ativamente) ≠ SENSIBILIDADE (incomoda-se e
  reage) ≠ EXPLORAÇÃO (busca o estímulo). O agente tende a colapsar os três.
- Estratégia de regulação registrada com duração — sem isso a TO perde o dado
  mais útil.

### Onde isso entra no produto

- Fila de validação = extensão do "pacote de supervisão" do coordenador (mesma
  tela, escopo do grafo M:N dele).
- O checklist por protocolo pode ser exibido contextualmente na UI de revisão
  (o coordenador vê as confusões clássicas do domínio em questão).
- Fase de implementação: junto da Fase 5 (módulo do coordenador); a amostragem
  aleatória e o dataset de divergência podem vir depois.
