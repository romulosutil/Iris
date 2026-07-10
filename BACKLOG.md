# Backlog — Iris

O que ainda falta ser feito, em ordem de dependência.

## A. Especificação (rodar a série de prompts) — CONCLUÍDA em 09/07/2026

Os 4 prompts rodaram e geraram os 4 documentos-base (`docs/dados/modelo-de-dados.md`,
`docs/agente/*`, `docs/ux/fluxos-e-wireframes.md`,
`docs/arquitetura/stack-e-plano-de-construcao.md`).
Os 2 itens `[ ]` abaixo (dentro do Prompt 1 e do Prompt 2) NÃO são trabalho de
especificação pendente — são dependências explícitas da seção B, deixadas em
aberto de propósito como referência cruzada. Próximo passo real: seção B.

- [x] **Rodar Prompt 1** → modelo de domínio (concluído 2026-07-09) —
      `docs/dados/modelo-de-dados.md`:
  - [x] 25 entidades justificadas + diagrama ER (Mermaid); nota de
        consistência: Extraction segue os 5 subtipos reais do
        `output-schema.json` (Prompt 2), não os "2 tipos" do rascunho original.
  - [x] Papel `admin_recepcao` modelado (Patient separado de
        PatientClinicalProfile, RLS nega acesso clínico) e sessão substituta
        modelada (`care_team_membership.papel_na_equipe='substituto'`,
        vigência de 1 dia) — gaps do mapa de jornadas que estavam destinados
        ao Prompt 1.
  - [x] Versionamento sem sobrescrita (Evidence imutável + EvidenceRevision +
        EvidenceQuery para "devolver com dúvida"), acúmulo → candidato a
        avaliação, critério de domínio → candidata a dominada, event-sourcing
        da linha do tempo (SessionSnapshot materializado, trade-off
        justificado), Protocol/Milestone heterogêneo via JSONB (trade-off
        justificado), diagrama de estados da Extraction e da Evidence.
  - [x] DDL PostgreSQL das 5 tabelas mais críticas + DDL de apoio
        (care_team_membership, supervision_assignment) + políticas RLS
        (terapeuta/coordenador/admin_recepcao) + trilha de auditoria LGPD com
        log obrigatório de exportação de relatório.
  - [ ] Pendente do Prompt 1: nenhum item de tarefa — mas o modelo assume
        respostas prováveis às validações legais do grupo B (assinatura,
        imutabilidade); pode exigir ajuste de schema quando aquele grupo
        fechar (ver nota em `modelo-de-dados.md`, seção 5).
- [x] **Rodar Prompt 2** → refinar o agente de referência (concluído 2026-07-09):
  - [x] Auditoria "Evidência ≠ Pontuação" (apontamento da Dra. Camila): conferido
        que o núcleo (README, R3 do agente, output-schema.json, golden example,
        modelo de dados do Prompt 1) já é evidência-first — nunca houve um
        conceito de "Score" no design. Único vazamento de terminologia
        encontrado: item 8 do Prompt 2 ("Segundo agente") dizia "Scores
        aprovados"/"fatos fora dos Scores". Corrigido em
        `docs/prompts/serie-de-prompts.md` para "Evidências aprovadas" +
        estrutura explícita do relatório da família (1 conquista em destaque +
        trabalho atual + como apoiar em casa + dados opcionais em anexo — Tema 8
        da pesquisa simulada, personas P1-P3).
  - [x] R14 (inconsistência com histórico) corrigida em `system-instructions.md`
        e `protocolos-e-agente.md`: a redação anterior só exemplificava a
        direção "bom demais para ser verdade"; agora cobre explicitamente
        REGRESSÃO (nível de ajuda acima do histórico / falha em habilidade
        antes dominada) — lacuna encontrada ao escrever o caso de teste de
        regressão.
  - [x] Cenários A-C (Sofia, Lucas, Miguel) formalizados em JSON conforme
        `output-schema.json` (antes só existiam como prosa) +
        4 casos de teste novos (sessão sem evidências, texto ambíguo,
        regressão, erro de transcrição) + pipeline de extração definido — tudo
        em `docs/agente/casos-de-teste.md`.
  - [x] Segundo agente (relatório da família) com system instructions completas
        (regras F1-F9), schema de saída e 2 casos de teste (período com avanço
        / período de platô) — `docs/agente/agente-2-relatorio-familia.md`.
  - [x] ~~Pendente do Prompt 2: rodar os 8 casos de teste contra um modelo
        real~~ — **checkbox estava desatualizado (corrigido na revisão de
        09/07/2026)**: isso já foi feito e superado — ver seção B abaixo
        ("Testar as system instructions reais...", concluído, e depois
        ampliado para 17 casos na 2ª/3ª rodada de validação).
- [x] **Rodar Prompt 3** → user flows Mermaid, wireframes das 9 telas, tabela de
      estados de UI, microcopy pt-BR (concluído 09/07/2026) —
      `docs/ux/fluxos-e-wireframes.md`:
  - [x] Flow principal (grade → briefing → check-in → captura → consolidação →
        revisão → gráfico do protocolo) + linha do tempo do paciente (scrubber,
        snapshot as-of, delta por sessão, trajetória por meta com faixas
        evolução/estagnação/regressão, comparação entre 2 pontos).
  - [x] 5 flows de exceção obrigatórios (sem evidência, correção de marco
        errado, abandono no meio da revisão, falha do pipeline, ditado com
        transcrição ruim) + tabela de estados de confiança (alta/baixa/
        inconsistente/candidato) com fricção deliberada contra rubber-stamping.
  - [x] Jornada mínima do coordenador: cadastro clínico + `PatientProtocol`
        (novo, ver abaixo), entrada por exceções escopada ao grafo do
        coordenador, equipe de cuidado visível, criação/revisão de metas com
        critério de domínio estruturado, fila de validação (confirmar/
        reclassificar/devolver/invalidar com notificação tom-formação),
        exportação do relatório da família + ponto de entrada de convênio,
        transparência anti-vigilância.
  - [x] Incluída a NFR de confiabilidade do ditado (Tema 4, persona Aline): flow
        de exceção 2.5 cobre transcrição ruim com áudio original sempre
        preservado; captura local antes do upload confirmado + fila de reenvio
        detalhada no flow 2.4 (falha do pipeline).
  - [x] **Gap resolvido no modelo (09/07/2026)**: protocolo é aplicado POR
        PACIENTE, não por clínica — um terapeuta atende N pacientes com
        protocolo(s) diferentes (ex.: criança A só Denver, criança B só PROC,
        criança C PROC+VB-MAPP simultâneo). Confirmado com Rômulo: configuração é
        responsabilidade do COORDENADOR (ou psicólogo responsável técnico), nunca
        do `admin_recepcao`. `GoalMilestoneMapping` já suportava a COMBINAÇÃO de
        protocolos numa mesma meta, mas só depois de a meta existir; adicionada
        nova associativa **`PatientProtocol`** (Patient↔Protocol M:N com vigência,
        decisão 2.9 de `modelo-de-dados.md`) para o passo anterior — "quais
        protocolos são referência ativa para este paciente agora", que alimenta o
        gráfico do protocolo, os candidatos a avaliação e o agendamento de
        bateria de avaliação formal. DDL + RLS (herda a política clínica de
        `patient_clinical_profile`, admin_recepcao nunca lê) já em
        `modelo-de-dados.md` seção 3 e 2.9.
  - [x] **Consequência para o Prompt 3 — resolvida**: jornada de CADASTRO do
        paciente (já sinalizada 🔴 ausente em `mapa-jornadas-gaps.md`, item 1,
        Admissão) adicionada como tarefa explícita do item 4 (jornada do
        coordenador) em `docs/prompts/serie-de-prompts.md` E desenhada em
        `docs/ux/fluxos-e-wireframes.md` seção 4.1: cadastro ADMINISTRATIVO
        (`admin_recepcao`) vs. CLÍNICO (coordenador: perfil clínico +
        `PatientProtocol` + equipe de cuidado + metas iniciais), incluindo o
        estado vazio do gráfico do protocolo antes da 1ª evidência.
  - [x] **Sinal de campo incorporado**: terapeuta real, ao ver protótipo,
        perguntou primeiro se dava para exportar relatório de convênio — tela
        de exportação (seção 4.6 de `docs/ux/fluxos-e-wireframes.md`) desenhada
        com o dossiê de convênio (ver confirmação abaixo, não ficou só "em breve").
  - [x] **Ponto de atenção levantado por Rômulo (09/07/2026) — CONFIRMADO**:
        capacidade de BAIXAR ARQUIVOS BRUTOS para auditoria de plano de
        saúde/convênio. Decisão final: separar em dois artefatos. (1) Relatório
        de convênio NARRATIVO (IA + revisão do coordenador, formatado) continua
        fast-follow do tier Convênio, sem mudança. (2) **Dossiê BRUTO de
        auditoria** (sessões/evidências/presença de um período, sem síntese de
        IA) — confirmado no MVP, **Fase 5, tier Clínica** (não fica preso ao
        tier Convênio, porque auditoria de operadora pode acontecer com
        qualquer clínica que atenda convênio). Reaproveita o pipeline de
        export/`audit_log` já construído para o relatório da família
        (`Report.tipo='convenio_bruto'`, distinto de `convenio_narrativo` —
        split corrigido em 09/07/2026 na revisão da seção A, os dois tipos
        colidiam no mesmo valor `convenio`) — muito mais barato que o
        narrativo por não ter etapa de geração/edição de texto. Especificado
        em `modelo-de-dados.md` seção 5, empacotamento em
        `modelo-de-negocio.md` seção 4, fluxo completo (seleção de
        paciente+período, preview factual antes de gerar, PDF listagem) em
        `docs/ux/fluxos-e-wireframes.md` seção 4.6.
- [x] **Rodar Prompt 4** → stack, o que não usar, plano das fases 1-6 com
      critérios de pronto + checklist LGPD mínimo viável (concluído 09/07/2026)
      — `docs/arquitetura/stack-e-plano-de-construcao.md`:
  - [x] Stack: Next.js + Supabase (Postgres/RLS nativo/Auth/Storage) + Claude
        API para extração + Vercel/Supabase ambos em região São Paulo
        (confirmado por busca — `sa-east-1`/`gru1` disponíveis) + Sentry para
        observabilidade mínima. Extração via job assíncrono simples (webhook +
        retry), sem fila dedicada.
  - [x] Fase 1 já inclui o cadastro clínico + `PatientProtocol`; Fase 5 já
        inclui o dossiê bruto de auditoria de convênio — as duas decisões
        fechadas nesta rodada de conversa entraram no plano sem re-trabalho.
  - [x] Checklist de LGPD com 11 itens, incluindo teste automatizado de RLS
        (não só a policy criada) e restore de backup testado (não só backup
        existir) — nenhum item novo além do que a validação legal já
        confirmou como piso.
- [x] **Decisão de arquitetura tratada durante a especificação**: escolha da
      API do LLM de extração (Claude vs. OpenRouter vs. Gemini) — registrada
      aqui por ter surgido no meio do Prompt 4, não por ser um 5º prompt.
  - [x] **OpenRouter avaliado e descartado por ora (09/07/2026)**: Rômulo
        perguntou se trocar a API do LLM de extração para OpenRouter sairia
        mais barato mantendo qualidade. Pesquisa confirmou: OpenRouter não tem
        markup sobre o preço do provedor, mas cobra 5,5% em conta
        pay-as-you-go (só dispensado com BYOK, que exige manter a chave direta
        do provedor mesmo assim) — a economia só existe se TROCAR de modelo,
        não por usar o roteador. No estágio atual (1-2 clínicas, margem de IA
        já >90%), o custo de IA é irrelevante para a economia unitária; a
        variável que importa é a métrica de ativação (≥70% aprovação sem
        edição), que ainda não foi validada contra NENHUM modelo real (ver
        item abaixo). Além disso, OpenRouter não garante retenção zero por
        padrão — adiciona um processador de dado sensível de saúde de menor
        fora do DPA já desenhado com a Anthropic. Decisão: manter Claude API
        direta agora; revisitar OpenRouter como ferramenta de EXPERIMENTAÇÃO
        (testar modelos mais baratos contra o golden example) só depois da
        validação abaixo estabelecer o baseline. Detalhado em
        `docs/arquitetura/stack-e-plano-de-construcao.md` seção 2.
- [x] **Revisão completa da seção A (09/07/2026, a pedido de Rômulo)** — reli
      os 4 documentos-base cruzando com `BACKLOG.md`, `README.md` e
      `serie-de-prompts.md`. Corrigidos direto (mecânicos, sem ambiguidade):
      (1) bloco duplicado no próprio BACKLOG (decisão do `PatientProtocol`
      entrada duas vezes); (2) colisão de schema — `Report.tipo='convenio'`
      era usado tanto para o dossiê BRUTO (MVP) quanto pro relatório
      NARRATIVO (fast-follow), os dois artefatos ficavam indistinguíveis no
      banco — split em `convenio_bruto`/`convenio_narrativo`; (3)
      `patient_protocol` tinha só um COMENTÁRIO prometendo RLS igual a
      `patient_clinical_profile`, mas a policy de fato nunca foi escrita —
      adicionada; (4) frase "mapeamento a 1 protocolo" defasada em
      `serie-de-prompts.md` e `stack-e-plano-de-construcao.md` (o próprio
      `PatientProtocol` que fechamos permite mais de um) — corrigida; (5)
      `README.md` não mencionava a decisão pendente de Claude vs. Gemini —
      adicionada.
  - [x] **`PatientProtocol` refinado com as 4 famílias reais de Rômulo
        (09/07/2026)**: confirmado que existem 4 famílias de protocolo —
        `aba_marcos_desenvolvimento` (VB-MAPP/ABLLS-R/AFLS),
        `intervencao_naturalista` (Denver/ESDM, família PRÓPRIA mesmo
        entregue por profissional ABA), `fonoaudiologia` (PROC/ABFW/MBGR),
        `terapia_ocupacional` (PEDI/DCDQ/Perfil Sensorial 2) — paciente pode
        ter 1-4 vigentes ao mesmo tempo (`PatientProtocol` já suportava isso
        sem mudança). Novo: cada SESSÃO alimenta só a família relevante
        (sessão de Fono não deveria virar candidata a marco de VB-MAPP) —
        modelado como `SessionProtocolScope` (Session↔Protocol M:N),
        pré-preenchido pela disciplina do profissional (zero fricção no caso
        comum), editável na consolidação só quando ambíguo (ex.: mesmo
        terapeuta ABA alternando estruturado/naturalista). Descartada a ideia
        de fixar protocolo no terapeuta (quebra nesse mesmo caso e toda vez
        que `PatientProtocol` mudar de vigência independente da equipe).
        Detalhado em `modelo-de-dados.md` decisão 2.10.
  - [x] **`Clinic.responsavel_conta_id` — "responsável" em clínica pequena/
        freelancer (09/07/2026, CONFIRMADO por Rômulo)**: Rômulo levantou o
        cenário de clínica pequena/freelancer onde o terapeuta faz tudo
        sozinho, inclusive financeiro, e perguntou se existe (ou deveria
        existir) um perfil "admin" para representar "o responsável". Análise:
        nenhuma das duas noções de "responsável" já modeladas cobria isso —
        `UserRole` é sobre acesso a dado clínico (já resolve o terapeuta+
        coordenador acumulados, persona Diego) e `responsavel_tecnico_id`
        (pendente, seção B) é sobre responsabilidade técnica perante conselho
        profissional. Faltava a noção de responsável COMERCIAL/pela CONTA
        (contrato, cobrança). Descartado reaproveitar `admin_recepcao` (papel
        deliberadamente de baixo privilégio, misturaria acesso clínico com
        titularidade comercial) e descartado criar um `UserRole` novo (não há
        feature de billing no produto — modelar papel para capacidade
        inexistente é over-engineering). Decisão: campo simples
        `Clinic.responsavel_conta_id` (FK nullable para User), ORTOGONAL a
        `UserRole` e a `responsavel_tecnico_id`, sem UI de billing associada
        nesta rodada — no freelancer, é a mesma pessoa que já acumula
        terapeuta+coordenador. Detalhado em `modelo-de-dados.md` decisão 2.11
        (entidade em 1.1, diagrama ER, distinção explícita de
        `responsavel_tecnico_id` na seção 5).
  - [x] **Taxonomia de nível de ajuda entre protocolos diferentes — corrigido
        (09/07/2026)**: `modelo-de-dados.md` seção 2.5 assumia UMA ordem
        ordinal fixa de `nivel_ajuda` para calcular evolução/estagnação/
        regressão na linha do tempo, mas R19 do agente (AGNOSTICISMO) e a
        confirmação das 4 famílias de protocolo já deixavam claro que
        `taxonomia_ajuda` é POR PROTOCOLO (PEDI usa escala de assistência do
        cuidador, diferente da escala ABA do VB-MAPP). Seção 2.5 reescrita:
        o ordinal usado agora é sempre `protocol.taxonomia_ajuda` do
        protocolo de origem daquela Evidence; `SessionSnapshot.segmentacao`
        passa a guardar o resultado por `protocol_id`, nunca uma leitura
        única fundida quando uma Goal combina protocolos.
  - [x] **9º caso de teste adicionado (09/07/2026)**: `casos-de-teste.md`
        ganhou o Caso 9 (Théo — VB-MAPP + PEDI simultâneos, sessão de TO
        escopada só ao PEDI via `SessionProtocolScope`), exercitando R19 (usa
        a `taxonomia_ajuda` do PEDI vinda do contexto, não a escala ABA
        hardcoded) e R14 (regressão dentro da escala do PEDI) — a correção da
        seção 2.5 acima só tem valor de teste com este caso existindo.
  - [x] **Gap do dossiê bruto no tier Diário — resolvido (09/07/2026, decisão
        de Rômulo)**: o racional em `modelo-de-negocio.md` para trazer o
        dossiê de auditoria pro MVP foi "qualquer clínica dos tiers
        Diário/Clínica com paciente de convênio pode ser auditada" — mas o
        dossiê estava empacotado SÓ no tier Clínica (dentro do módulo
        coordenador), deixando o terapeuta autônomo do tier Diário que fatura
        convênio direto sem a proteção que justificou a própria decisão.
        Escolhida a opção (b) das três propostas: destravar a tela de
        exportação do dossiê bruto (seção 4.6) também no tier Diário,
        escopada aos próprios pacientes do profissional, sem o resto do
        módulo coordenador. Custo técnico baixo — reaproveita o
        pipeline/tela já construídos, é só regra de acesso por tier. O tier
        Clínica não perde diferenciação (mantém módulo coordenador inteiro:
        exceções, pacote de supervisão, fila de validação, revisão de ciclo
        de metas, relatório da família, métricas). Atualizado em
        `modelo-de-negocio.md` seção 4 (tabela de tiers + racional) e
        `fluxos-e-wireframes.md` seção 4.6 (wireframe da tela por tier +
        rótulo "profissional" em vez de "coordenador" no fluxo do dossiê).
  - [x] **`Report` ganhou DDL própria — resolvido (09/07/2026)**: adicionada
        em `modelo-de-dados.md` seção 3, logo após `session_snapshot` — `tipo`
        já nasce com o enum corrigido (`convenio_bruto`/`convenio_narrativo`/
        `familia`/`avaliativo_interdisciplinar`), com CHECKs que impedem
        `convenio_bruto` de ter `gerado_por_ia=true` ou de existir fora do
        estado `exportado`, e RLS herdando o escopo de `patient` (mesmo padrão
        de `evidence`).
  - [x] **`Protocol.familia` deixou de ser ENUM — corrigido (09/07/2026, a
        pedido de Rômulo: "o modelo de dados deve prever a possibilidade de
        novos protocolos")**: a decisão 2.6 já garantia isso para a ESTRUTURA
        de um protocolo novo (Milestone/JSONB, "1 INSERT, não uma migração"),
        mas a decisão 2.10 (família) introduziu um Postgres ENUM
        (`protocol_familia`) com só 4 valores fixos — uma família nova (ex.:
        se o Iris expandir para Fisioterapia, Nutrição, Psicomotricidade)
        exigiria `ALTER TYPE ... ADD VALUE`, contradizendo o princípio #5 no
        ponto exato que o resto do modelo já tinha resolvido. Convertido para
        `protocol_familia_catalogo` (tabela seed com os 4 valores atuais) +
        `protocol.familia` como `TEXT REFERENCES` a esse catálogo — nova
        família passa a ser 1 INSERT. `milestone.tipo_estrutura` FICOU como
        CHECK de lista fechada (exceção deliberada, documentada inline: um
        tipo de estrutura novo sempre exige um renderer de UI novo mesmo sem
        migração de banco, então o custo marginal de manter como CHECK é
        baixo). Detalhado em `modelo-de-dados.md` seção 2.10 e seção 3.

## B. Validações antes de construir

- [x] **Conferir estruturas/contagens dos protocolos contra fontes oficiais —
      concluído (09/07/2026)**: 4 pesquisas dedicadas (uma por família de
      protocolo) rodadas contra manuais/editoras/artigos acadêmicos primários.
      Resultado por instrumento, todo já corrigido em `protocolos-e-agente.md`
      seção 1 (com fontes citadas inline):
  - **VB-MAPP**: todos os números confirmados (170 marcos, 24 barreiras, 18
    áreas de transição); 1 nuance corrigida — o domínio "vocalizações" SAI
    no Nível 2 (não é só adição de novos domínios), total de 16 áreas de
    habilidade distintas nos 3 níveis.
  - **ABLLS-R**: 544 tarefas confirmado; nomenclatura corrigida — são 25
    repertórios de **A a Z pulando o O** (não "A-Y" como estava escrito).
  - **AFLS**: catálogo estava incompleto — faltava o módulo **Vocacional**
    (são 6 módulos, não 5) e o total real é ~1.900 habilidades (a versão
    2012 original tinha só 3 módulos/~735 habilidades; School, Vocational
    e Independent Living foram adicionados depois).
  - **Denver/ESDM**: 4 níveis confirmados, mas o total é **480 itens** e o
    catálogo tinha só 7 domínios onde o Curriculum Checklist real tem
    **11** — faltava o domínio "comportamento". Faixa etária "12-48m" é a
    nuclear oficial, mas o modelo é usado informalmente fora dela; ciclo de
    ~12 semanas confirmado.
  - **PROC — correção adicional (2ª rodada, 09/07/2026):** o total que eu
    tinha registrado aqui (70/60/70/200) estava ERRADO — confirmado contra
    o formulário real (artigo de validação, cruzado em 2 fontes
    independentes, SciELO e Redalyc, mesma tabela): os blocos são
    **60/40/50, total 150**, com subitens detalhados por bloco (ver
    `protocolos-e-agente.md` 1.5). Também a faixa etária
    do catálogo ("1-6 anos") não tem respaldo nas fontes — corrigida para
    "~1 a 4-4,5 anos, confirmar no manual 2021". Pontuação por subitem
    (dentro de cada bloco) tem fontes secundárias inconsistentes — fica
    como pendência de checagem no manual físico antes de codificar a
    rubrica fina.
  - **ABFW**: as 4 áreas do catálogo confirmadas com mais detalhe (ROLPP para
    pragmática, %DG/%DTF para fluência).
  - **MBGR**: autores corrigidos (Marchesan, Berretin-Felix, Genaro, Rehder —
    não estava claro antes) e estrutura ampliada (faltavam postura
    corporal, medidas faciais, exame extra/intraoral, sensibilidade à
    palpação).
  - **PEDI — achado mais importante desta rodada**: o catálogo descrevia SÓ o
    domínio de Autocuidado, passando a impressão errada de instrumento
    monodominial. O PEDI real tem **3 domínios em ambas as escalas**
    (Autocuidado/Mobilidade/Função Social: 73/59/65 itens na Escala de
    Habilidades Funcionais, 8/7/5 atividades na Escala de Assistência do
    Cuidador) + uma 3ª escala (Modificações) não modelada ainda. Corrigido
    por completo em `protocolos-e-agente.md` 1.8 — isso muda o que o
    agente deveria extrair para TO (mobilidade e função social, não só
    autocuidado).
  - **DCDQ**: 15 itens/escala 1-5/total 15-75 confirmado sem alteração.
  - **Perfil Sensorial 2**: faixa etária confirmada (3:0-14:11); a contagem de
    86 itens ~~NÃO foi confirmada contra o manual primário~~ **— checkbox
    desatualizado, corrigido na revisão de 09/07/2026**: a validação
    especialista (3ª rodada, ver mais abaixo) promoveu essa contagem de
    "não confirmada" para CONFIRMADA (2 fontes secundárias independentes e
    coerentes, sem nenhuma fonte contraditória) — não é mais pendência.
- [x] **Definir a fonte do conteúdo dos marcos — resolvido (09/07/2026)**: a
      mesma pesquisa cobriu o status de licenciamento de cada instrumento.
      Conclusão: os instrumentos AMERICANOS/fechados (VB-MAPP, ABLLS-R, AFLS,
      Denver/ESDM, Perfil Sensorial 2) não têm modelo de licenciamento digital
      B2B aberto a plataformas terceiras — o único precedente encontrado
      (CentralReach embutindo ABLLS-R e AFLS nativamente) só existe porque a
      CentralReach **comprou** as próprias empresas donas dos direitos
      (Behavior Analysts Inc. em 2021, Stimulus Publications em 2022), o que
      não é replicável por um produto em estágio de piloto. Decisão mantida:
      **o sistema modela ESTRUTURA; o TEXTO desses 5 instrumentos é cadastrado
      pela clínica que já possui a licença.** Achado novo e favorável: dos 10
      instrumentos do catálogo, **MBGR e DCDQ são totalmente abertos**
      (Creative Commons / gratuito) — o Iris PODE embutir o texto literal
      desses 2 nativamente, sem risco de licenciamento, como diferencial de
      zero-fricção nessas 2 disciplinas. O PEDI (adaptação brasileira Mancini/
      UFMG) aparenta uso acadêmico mais aberto que os americanos, mas sem
      declaração explícita de domínio público — tratar como "provavelmente
      embutível, confirmar com a UFMG/editora antes de produção". PROC e ABFW
      seguem exigindo compra do manual oficial (PROC mais barato/aberto que
      ABFW). Tudo documentado no aviso do topo e em cada entrada de
      `protocolos-e-agente.md` seção 1.
- [ ] Verificar requisitos legais de prontuário eletrônico no Brasil (CFP/CFM/
      COFFITO) e hospedagem de dados de saúde — pesquisa feita em 09/07/2026,
      resultado completo em `docs/legal/validacao-legal-prontuario.md`. Só
      marquei `[x]` os subitens com respaldo direto em fonte primária; o resto
      fica pendente de parecer jurídico (não é possível ter certeza absoluta só
      com pesquisa documental):
  - [x] LGPD Art. 11/14/15/16/33 lidos na fonte primária (planalto.gov.br) — o
        `Consent` do modelo de dados já atende ao Art. 14 (consentimento
        específico e destacado de responsável legal). Nada a mudar no schema.
  - [x] Nenhum conselho pesquisado (CFP, COFFITO, CFFa) exige certificação
        ICP-Brasil para prontuário eletrônico — login+senha+trilha de auditoria
        (já modelado em `AuditLog`/imutabilidade de `Evidence`) é piso
        juridicamente razoável. Certificado ICP-Brasil fica como upgrade
        opcional de robustez, não bloqueador.
  - [x] Não há exigência legal de hospedar dados de saúde no Brasil —
        transferência internacional é permitida via Resolução CD/ANPD nº
        19/2024 (cláusulas-padrão, em vigor). Recomendação de produto (não
        exigência): hospedar em região Brasil do provedor cloud mesmo assim,
        para não ter que lidar com essas cláusulas — decidir no Prompt 4.
  - [x] **Achado novo e não previsto**: ABA não é profissão regulamentada no
        Brasil; o responsável técnico legal por evidência ABA de um AT sem CRP
        é o psicólogo supervisor — gap real no modelo de dados. Ajuste proposto
        (`responsavel_tecnico_id`) documentado em `modelo-de-dados.md`, seção 5;
        ainda não implementado em DDL (decisão de produto+jurídica pendente).
  - [x] **Iris é produto de tecnologia, não estabelecimento de saúde**
        (confirmado 09/07/2026): CNES/alvará sanitário são obrigação da
        clínica-cliente, não do Iris (critério oficial do CNES exclui
        prestador que não presta atendimento direto ao paciente). Isso resolve
        a dúvida sobre a Lei 13.787/2018 — ela vincula a clínica (se ela se
        enquadrar como estabelecimento de saúde), nunca o Iris diretamente.
        Consequência de produto: **retenção vira campo configurável por
        clínica**, não uma regra hardcoded — ver `modelo-de-dados.md`.
  - [x] A IA de extração provavelmente NÃO é "Software como Dispositivo
        Médico" (SaMD) sob a RDC ANVISA nº 657/2022 — o desenho R3
        (evidência sugerida, nunca pontuação automática, aprovação humana
        sempre obrigatória) casa com os critérios de exclusão do P&R oficial
        da ANVISA. Não é determinação formal da ANVISA — recomenda-se consulta
        formal ou parecer especializado antes do LANÇAMENTO COMERCIAL (não
        bloqueia o piloto).
  - [ ] **Ainda sem certeza absoluta, precisa de parecer jurídico antes do
        piloto com dado real**: prazo de guarda DEFAULT sugerido pelo produto
        (MAX(paciente completa 18 anos, alta+10 anos) é síntese de risco entre
        CFP/COFFITO/CFFa, não regra escrita — mas agora é configurável por
        clínica, o risco de errar caiu, e já tem rascunho de política própria
        em `docs/legal/politica-retencao-dados.md`, ver seção D). **Desenho de
        dados fechado (09/07/2026), só falta a confirmação jurídica**:
        `responsavel_tecnico_id` (supervisão técnica do psicólogo sobre o AT)
        já virou DDL real em `modelo-de-dados.md` (`care_team_membership`,
        seção 4.1) — granularidade por VÍNCULO (não por clínica/sessão), com
        constraint contra auto-supervisão. O que falta é só o parecer jurídico
        confirmando essa granularidade, não mais o desenho — se o parecer
        pedir algo diferente, é agregação da mesma coluna, não migração.
- [x] Testar as system instructions reais contra o golden example + os 9 casos
      de teste (`docs/agente/casos-de-teste.md`) num modelo de verdade e medir
      concordância com as saídas esperadas — desbloqueado agora que os
      cenários A-C, os 4 casos do Prompt 2 e o Caso 9 (multiprotocolo) estão
      formalizados em JSON. **Dado por completo em 09/07/2026, a pedido de
      Rômulo** ("vamos dar esse por completo, já que ele funciona"): a
      validação interna com Claude Sonnet 5 abaixo é considerada suficiente
      para destravar o próximo item do backlog — não é (e não pretende ser) o
      número oficial de % aprovação sem edição, que ainda depende de revisão
      de terapeuta de verdade contra a API paga. A comparação Claude vs.
      Gemini fica explicitamente DEFERIDA para quando construir e for
      equilibrar custo (ver sub-item aberto abaixo) — não é bloqueador deste
      item.
  - [x] **Harness do bake-off construído (09/07/2026)** — `scripts/bakeoff/`:
        `parse_cases.py` gera `eval_set.json` direto das fontes reais
        (`casos-de-teste.md` + `serie-de-prompts.md` + `golden-example-output.json`,
        nunca transcrição manual — se um caso mudar no markdown, é só rodar de
        novo); `run_bakeoff.py` chama Claude (tool-use forçado pelo
        `output-schema.json`) e Gemini (`response_schema`, com conversor para
        o subset de JSON Schema que o Gemini aceita) para os 9 casos + golden,
        valida schema automaticamente, e gera `report.md` (lado a lado
        esperado vs. real) + `scoring_template.csv` para a revisão humana
        (aprovação sem edição é julgamento clínico, não string-diff);
        `tally.py` apura % por modelo contra a meta de 70%. Testado
        ponta-a-ponta em `--dry-run` (sem gastar API) — pipeline OK.
        Pendente antes de rodar de verdade: (1) confirmar no código os IDs
        atuais de modelo (`CONFIRME-...` são placeholders de propósito — nomes
        de modelo mudam), (2) `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`. Os 3
        achados de spec abaixo (schema nullable, R8, golden-example) já foram
        corrigidos em 09/07/2026 — não bloqueiam mais o bake-off pago.
  - [x] **Achado no dry-run do harness — corrigido (09/07/2026)**: opção (a)
        aplicada em `output-schema.json` — `evidencia`, `cadeia`,
        `registro_abc`, `ausencia_comportamento` e `preferencia_reforcador`
        agora são `type: ["object","null"]` (só o payload correspondente ao
        `tipo` da extração é preenchido; os outros quatro ficam `null`, o que
        já era o comportamento real do Caso 8). `eval_set.json` regenerado e
        os 9 casos + golden validam limpo contra o schema corrigido
        (`jsonschema.validate`, sem erro em nenhum caso).
  - [x] **Validação interna rodada com Claude Sonnet 5 (09/07/2026, a pedido de
        Rômulo — "vamos validar aqui mesmo", sem gastar chamada de API paga)**:
        em vez de chamar a API do Anthropic (que teria custo e exigiria chave),
        rodei os 9 casos + golden como 13 subagents do Claude Sonnet 5 desta
        própria sessão (mesmo modelo que já usamos, custo zero adicional —
        cada subagent só recebeu system-instructions.md + output-schema.json +
        contexto + diário, CEGO à saída esperada, então é um teste
        genuinamente cego, não eu conferindo gabarito). Resultado: os 2 testes
        de maior risco passaram limpo — Caso 9 (multiprotocolo VB-MAPP+PEDI,
        o motivo de este caso existir) usou corretamente a taxonomia do PEDI
        sem nenhum vazamento da escala ABA, e Caso 7 (regressão) detectou as
        duas regressões esperadas com precisão. Nenhuma falha grave em nenhum
        dos 9 casos (nenhuma alucinação, nenhum severidade=grave perdido,
        nenhum vazamento de taxonomia entre protocolos); as poucas divergências
        vs. gabarito foram classificações defensáveis/debatíveis (ex.:
        dica_verbal vs. dica_ecoica), do tipo que um terapeuta editaria em
        segundos, não erros clínicos. Sinal qualitativo forte, mas a % exata
        de "aprovação sem edição" não deve virar número oficial ainda —
        depende de revisão de terapeuta de verdade (não eu) e de rodar TODOS
        os 9 casos com o bug de contexto abaixo já corrigido (rodei a correção
        só em 4 dos 9 durante esta sessão, por tempo).
  - [x] **Achado de engenharia do teste interno — contexto default do harness
        estava incompleto**: `contexto-exemplo.json` (usado como contexto
        default pelo `parse_cases.py`) é deliberadamente um exemplo PARCIAL da
        documentação — só define 2 domínios (mando, tato) para ilustrar o
        formato. Usá-lo como contexto real do bake-off fazia o modelo
        (corretamente, por R19/AGNOSTICISMO) recusar mapear eventos para
        domínios que os Casos 2-8 realmente citam (ouvinte, ecoico,
        intraverbal, imitação, social, percepção visual, brincar) — não é
        falha do modelo, é o contexto de teste estar incompleto. Corrigido em
        `parse_cases.py` (`expand_default_context`, injeta os domínios que
        faltam no default sem tocar `contexto-exemplo.json` da documentação);
        `eval_set.json` regenerado. Recomendo rodar de novo os 9 casos (não só
        os 4 já refeitos) antes do bake-off pago valer como número oficial.
  - [x] **Achado de spec — R8 (múltiplos alvos) ambíguo — corrigido
        (09/07/2026)**: ao investigar, descobri que `modelo-de-dados.md`
        seção 2.1(a) já tinha resolvido isso na camada de dados (múltiplas
        linhas de `Extraction`/`Evidence` por alvo primário, `alvos` reservado
        só para mapeamento SECUNDÁRIO do MESMO domínio) — mas R8 em
        `system-instructions.md` nunca foi atualizada para refletir essa
        decisão, e o próprio exemplo de R8 ("mando E social") era exatamente
        o caso que deveria gerar 2 extrações, não 1 com `alvos` bundlado. Isso
        explica o comportamento inconsistente visto no teste interno. R8
        reescrita: domínios funcionalmente diferentes SEMPRE geram extrações
        separadas; `alvos` (array, mantido) só agrupa o mesmo domínio mapeado
        a mais de um Goal, ou a um Goal + Milestone do protocolo
        simultaneamente — todo item de `alvos` numa extração compartilha o
        `dominio_id`. `output-schema.json` ganhou `description` no campo
        `alvos` documentando esse invariante.
  - [x] **Achado de spec — `golden-example-output.json` defasado — corrigido
        (09/07/2026)**: regenerado com as 2 extrações que faltavam: (1) tato
        "cachorro" agora marca `inconsistente_com_historico: true`, confiança
        rebaixada para `baixa` e `justificativa_confianca` explicando o
        conflito com o `historico_relevante` (R14); (2) nova extração
        `preferencia_reforcador` para "pista de carrinhos" (R17, a própria
        frase que a regra usa como exemplo). `sinalizacoes` e `resumo_sessao`
        atualizados para refletir as duas mudanças. `serie-de-prompts.md`
        (prosa do golden example, item 4) atualizada em paralelo para não
        divergir de novo. `eval_set.json` regenerado (golden agora tem 10
        extrações esperadas, era 9).
  - [x] **2ª rodada — nivelar cobertura para os 8 instrumentos sem teste e rodar
        testes cegos de verdade (09/07/2026, a pedido de Rômulo — "rodar testes e
        nivelar todos os protocolos, precisamos de precisão, qualidade e entrega
        fiel").** Antes desta rodada, Denver/ESDM, ABLLS-R, AFLS, PROC, ABFW,
        MBGR, PEDI-detalhado e Perfil Sensorial 2 tinham ZERO casos de teste
        (só VB-MAPP e um caso multiprotocolo VB-MAPP+PEDI existiam). Escrevi 8
        casos novos (Casos 10-17, um por instrumento) em `casos-de-teste.md`,
        cada um visando o risco/regra mais difícil daquele instrumento — depois
        rodei cada um como teste CEGO de verdade (subagent recebendo só
        `system-instructions.md` + `output-schema.json` + contexto + diário,
        sem ver o gabarito) e comparei manualmente contra a saída esperada.
        Resultado completo, sem suavização, em `casos-de-teste.md` seção
        "Resultados dos testes cegos": **8/8 casos sem falha grave** — nenhuma
        alucinação de protocolo além do testado de propósito, nenhum dado
        fabricado, nenhuma pontuação inventada, nenhuma severidade grave
        perdida. Todos os 8 testes centrais de cada caso passaram (ex.: Caso 16
        não inventou protocolo "dcdq" mesmo mencionado no repertório do
        paciente; Caso 12 confirmou que a correção do AFLS abaixo é aprendível
        só pelo contexto). Divergências encontradas foram todas menores/
        debatíveis (enum de nível de ajuda inventado, resultado
        "acerto"/"acerto_apos_dica" em fronteira, 1-2 extrações redundantes) —
        do tipo que um terapeuta editaria em segundos, não erros clínicos.
  - [x] **Achado crítico do teste cego — contradição de design no AFLS,
        corrigida (09/07/2026):** ao pesquisar relatórios/formulários REAIS
        (não só descrições estruturais) para validar os 8 casos novos contra a
        prática clínica de verdade, descobri que o Caso 12 (AFLS) original
        modelava um domínio único "participação comunitária" cruzando
        simulação de clínica e loja real DENTRO do mesmo protocolo — mas o AFLS
        real é uma suíte de **6 protocolos separados e independentes**, um por
        módulo/ambiente (ver `protocolos-e-agente.md` 1.4). Isso não é um
        detalhe cosmético: é uma suposição errada sobre o MODELO DE DADOS do
        produto para este instrumento. Corrigido: o Caso 12 foi redesenhado
        (ensaio de clínica agora é dado informal sem protocol_id; só a
        administração real do módulo é formal) e o teste cego confirmou de
        forma independente que essa é a interpretação correta — o modelo, sem
        ver o gabarito, chegou à mesma decisão de roteamento sozinho.
  - [x] **Achado transversal — ambiguidade real entre R14 e a rubrica de
        Confiança, corrigida (09/07/2026):** a seção "Confiança" das system
        instructions listava "inconsistência com histórico" como gatilho de
        confiança BAIXA, conflitando com R14 (que só pede manter a extração e
        marcar o boolean `inconsistente_com_historico`). Isso fez o golden
        example original e 1 dos 8 testes cegos (Caso 11) confundirem "isto
        diverge do histórico" com "não tenho certeza do que aconteceu",
        rebaixando a confiança de extrações com texto perfeitamente claro.
        Corrigido em `system-instructions.md`, `protocolos-e-agente.md`
        (regra + golden example embutido, que também estava DESSINCRONIZADO da
        versão canônica — faltavam 2 extrações já corrigidas antes) e
        `golden-example-output.json`: confiança agora reflete só a clareza do
        texto; a divergência é sinalizada separadamente.
  - [x] **Correção adicional de contagem — PROC (09/07/2026):** a mesma
        pesquisa de validação contra material real encontrou que o total do
        PROC registrado neste backlog (70/60/70/200) estava errado — o correto,
        confirmado por 2 fontes independentes (SciELO + Redalyc, mesma
        tabela), é **60/40/50, total 150**. Corrigido acima e em
        `protocolos-e-agente.md` 1.5.
  - [ ] **Pendências que sobraram desta rodada (não bloqueiam o MVP, mas ficam
        registradas para não se perder):** (1) incorporar ao catálogo os
        achados de relatório real que não mudam o desenho do agente mas afetam
        telas futuras de relatório/reavaliação — VB-MAPP (relatório real é
        narrativo, não a grade colorida; barreiras é processo manual em 2
        artefatos separados), ABLLS-R (WebABLLS tem 4 tipos de relatório
        nomeados + gráfico normativo), Denver/ESDM (taxonomia real de prompts
        pode ter 4 níveis, não 5) — todos já documentados em
        `protocolos-e-agente.md` seção 1; (2) ~~`scripts/bakeoff/` ainda não
        atualizado para incluir os Casos 10-17~~ — **feito em 09/07/2026**, ver
        item de bake-off mais abaixo.
  - [x] **3ª rodada — validação especialista por protocolo, 10/10 (09/07/2026, a
        pedido de Rômulo: "Especialista no protocolo valida o protocolo alvo,
        verifique se tem todos os pontos, se o modelo faz sentido e está
        aplicável. Repita isso 10x até passar por todos os protocolos").**
        Rodei 10 agentes, cada um assumindo o papel de especialista clínico real
        (não pesquisador genérico) daquele instrumento, avaliando 3 eixos —
        Completude (faltou algo?), Coerência do modelo (os domínios do contrato
        fazem sentido clínico?), Aplicabilidade (um profissional real conseguiria
        usar isso sem perder informação?) — com busca a fontes primárias/
        acadêmicas e veredito final. Resultado: **10/10 vieram "APROVADO COM
        RESSALVAS"** (nenhuma reprovação, mas nenhum "aprovado sem ressalva" —
        esperado numa 1ª rodada de auditoria externa). Detalhe completo de cada
        achado já incorporado inline em `protocolos-e-agente.md` seção 1 (um
        parágrafo "Achado da validação especialista" por instrumento) e resumido
        no "Veredito consolidado" ao final da Parte 1 daquele documento.
  - [x] **2 erros factuais corrigidos por esta rodada (mais graves que o resto,
        porque contradiziam texto já publicado no produto, não só lacuna):**
        (1) **DCDQ** — a doc dizia que os cutoffs variam por "faixa etária E
        sexo"; o manual oficial do DCDQ'07 testou e descartou efeito de sexo
        (p=.37) — só varia por idade. Também era inconsistente com a frase
        seguinte do mesmo item, que já dizia certo. Corrigido. (2) **ABLLS-R** —
        a doc marcava a granularidade por tarefa (dentro de um repertório) como
        "NÃO VERIFICADA"; o especialista confirmou que ela EXISTE nos relatórios
        reais (Program Worksheet/Status/Baseline Report operam a nível de tarefa
        numerada). Corrigido, com sugestão de extensão opcional de contrato.
  - [x] **Achados de cobertura de domínio, sem erro factual mas com impacto real
        (não corrigidos no contrato JSON ainda — só documentados; decisão de
        priorização de produto fica para quando o schema de domínios entrar em
        implementação):** **PEDI** (achado de maior prioridade da rodada) —
        Parte I (capacidade: capaz/não capaz) e Parte II (assistência do
        cuidador: 6 níveis) estavam conflacionadas num único eixo de evidência;
        recomendado modelar como 2 eixos separados. **PROC** — só 1 das 7
        funções comunicativas do Bloco 1b (protesto) tem domínio; faltam também
        2 dos 3 subitens do bloco cognitivo (manipulação de objetos, organização
        do brinquedo) — juntos, ~metade dos 150 pontos do protocolo fica sem
        onde "pousar" evidência; recomendado domínio único `funcao_comunicativa`
        com a função como enum, em vez de 6 domínios novos. **ABFW** — falta
        domínio "pragmática" no contrato de exemplo (maior risco clínico desta
        seção, dado o foco em TEA); erro factual à parte corrigido: pragmática
        NÃO é baseada no ROLPP (instrumento Pró-Fono separado) — status
        promovido de "não validada" para "parcialmente validada via literatura
        acadêmica". **Perfil Sensorial 2** — falta capturar os 2 eixos teóricos
        de Dunn (limiar neurológico + modo de resposta ativo/passivo) no
        `registro_abc` sensorial; sugeridos os campos `intensidade_estimulo` e
        `modo_resposta`. **MBGR** — sugerido tônus como 4º domínio de triagem
        incidental. **VB-MAPP** — falta o componente Task Analysis and
        Supporting Skills (~750 subtarefas); as 24 Barreiras são heterogêneas
        (ABC genuíno / marco baixo / padrão agregado) e não deveriam ser 1 tipo
        de coleta único. **Denver/ESDM** — contagem de domínios corrigida de
        volta para 10 (a correção da rodada anterior tinha introduzido um
        domínio "comportamento" inexistente e uma contagem "11" internamente
        inconsistente com a própria lista); "480 itens" removido por falta de
        fonte; taxonomia de 5 níveis reenquadrada como exemplo de contrato, não
        canônica do ESDM (não existe taxonomia diária única real). **AFLS** — a
        correção da rodada anterior (6 protocolos separados) foi CONFIRMADA de
        forma independente pelo especialista, citando a própria linguagem
        "stand-alone assessment" da CentralReach como fonte primária.
  - [x] **Decisão de produto fechada (09/07/2026)** — os 5 achados de cobertura
        de maior prioridade viraram extensão formal do contrato, em
        `protocolos-e-agente.md` nova seção 2.1 (`### 2.1 Extensões de contrato
resolvidas — cobertura de domínio`): **PEDI** ganhou o campo genérico
        `eixos_avaliacao` por domínio (capacidade vs. assistência do cuidador),
        com o agente marcando `eixo_protocolo` (novo campo em
        `output-schema.json`) por extração — generaliza para qualquer protocolo
        futuro com a mesma característica, não é específico do PEDI; **PROC**
        ganhou domínio único `funcao_comunicativa` (enum das 7 funções do
        Bloco 1b, reaproveitando o campo `funcao` já existente) + domínios
        `manipulacao_objetos`/`organizacao_brinquedo` (Bloco 3a/3c);
        **ABFW** ganhou domínio `pragmatica` (reaproveita `funcao` e
        `topografia`, sem campo novo); **MBGR** ganhou domínio `tono` como 4º
        eixo de triagem incidental; **Perfil Sensorial 2** ganhou 2 campos
        novos em `registro_abc` (`intensidade_estimulo`, `modo_resposta`),
        também em `output-schema.json`. Isso fecha a MODELAGEM/decisão — a
        implementação em código (UI de cadastro de protocolo, migração real)
        continua Fase 3, sem mudança de escopo.
  - [ ] **Rodar o mesmo teste contra Claude Sonnet 5 E Gemini (3.1 Pro e 3.5
        Flash), não só um modelo** — decidido em 09/07/2026 após pesquisa de
        benchmark a pedido de Rômulo (ver `docs/arquitetura/stack-e-plano-de-construcao.md`
        seção sobre escolha de LLM). No Artificial Analysis Intelligence Index
        (jul/2026), Gemini 3.1 Pro (46) fica ABAIXO de Claude Sonnet 5 (53) e
        custa cerca do mesmo (US$ 1,74 vs US$ 1,54/M tokens blended) — não é
        "melhor" no benchmark geral comparável em preço. Gemini 3.5 Flash (50,
        US$ 1,31) chega perto da inteligência do Sonnet por um pouco menos —
        opção legítima, não um vencedor claro. Mas nenhum benchmark público
        mede o que importa aqui (aderência ao `output-schema.json`, regras
        R1-R19, tom em pt-BR) — a única forma de decidir de verdade é rodar o
        MESMO golden example + 17 casos contra os dois e comparar taxa de
        aprovação sem edição (harness pronto acima). Já que o custo de
        qualquer um dos dois é irrelevante no volume do piloto, a decisão deve
        vir 100% desse resultado, não de benchmark genérico nem de preço de
        tabela. **`eval_set.json` atualizado e revalidado (09/07/2026)**: o
        harness ainda gerava o arquivo só com os 9 casos originais mesmo os
        Casos 10-17 já existindo em `casos-de-teste.md` desde a validação
        especialista — bastou rodar `parse_cases.py` de novo (o parser já era
        genérico o bastante, sem mudança de código) para produzir os 17 casos + golden; `--dry-run` completo (3 modelos × 18 entradas, 0 erros de
        schema) confirma que o pipeline aguenta o volume novo. `README.md` e
        `run_bakeoff.py` corrigidos de "9 casos" para "17 casos" (só
        comentário/docstring, sem mudança de lógica). **Rodar de verdade não é
        mais bloqueado por chave de API ausente — é decisão deliberada de
        Rômulo (09/07/2026, ver seção D) de só gastar a chamada paga quando a
        Fase 3 (construção do pipeline de extração) começar**, já que Claude e
        Gemini são ambos de ponta (nenhuma escolha claramente pior no mercado)
        e a comparação não muda nenhuma decisão de arquitetura hoje.

## C. Construção (fases do MVP)

- [ ] **Fase 0.5 — Design system (Espectro Brutal), entregue em Storybook:**
      `@storybook/nextjs` + addons `essentials`/`a11y`, tokens em
      `tailwind.config.ts` (fonte única, 2 modos Clínico/Família via
      `data-mode`), os 3 componentes base (Botão, Card, Alerta) com matriz
      completa de estados por story, `Tokens.mdx` gerado do tema real, build
      publicado no Vercel para revisão sem rodar local. Especificação técnica
      completa em `stack-e-plano-de-construcao.md`, seção "Fase 0.5".
      Inserida antes da Fase 1 por decisão de sequenciamento (10/07/2026, ver
      seção D) — a Fase 1 já constrói UI real (cadastro, agenda) e não
      deveria nascer sem tokens definidos.
  - **Progresso (10/07/2026, PR #1 `fase-0.5-design-system`):** entregue
    Next 16 + Tailwind v4 (tokens CSS-first em `globals.css`, não
    `tailwind.config.ts`); Storybook 10 com `nextjs-vite` + `addon-a11y`;
    4 componentes (Botão, Card, Alerta, **Logo**); favicon; home distintiva
    enraizada no logo (3 anéis = 3 camadas de governança). A11y elevada a 1ª
    classe: contraste AAA, forced-colors, prefers-contrast, gate axe
    (`pnpm test`, 7/7). Taste-skill adotado seletivamente. **Falta:** publicar
    o Storybook (depende do VPS) e, opcionalmente, gate de contraste em
    browser-mode. Aguarda validação do designer de produto (PR #1).
- [ ] Fase 1 — Pacientes (ficha clínica + consentimento LGPD) + agenda mínima + check-in.
- [ ] Fase 2 — Metas (ciclo de vida + critério de domínio) + diário por texto + fila de pendências.
- [ ] Fase 3 — Extração (agente R1-R19) + tela de revisão do terapeuta.
- [ ] Fase 4 — Evidências acumuladas + gráfico do protocolo + linha do tempo + briefing pré-sessão + perfil de reforçadores.
- [ ] Fase 5 — Coordenador: exceções (estagnação, assiduidade, incidentes) + pacote de supervisão + fila de validação/reclassificação + revisão de ciclo de metas + relatório da família (PDF) + dossiê bruto de auditoria de convênio (PDF factual, sem síntese de IA — decisão confirmada em 09/07/2026, seção A) + **relatório de convênio NARRATIVO (PDF, IA + revisão do coordenador — promovido de fast-follow para MVP em 09/07/2026, seção D)**.
- [ ] Fase 6 — Ditado por voz + polish + hardening LGPD.

## D. Decisões de produto/negócio pendentes

- [ ] **Pivô de hospedagem: Vercel + Supabase gerenciado → VPS Hostinger +
      Easypanel + Supabase self-hosted (ABERTO, 09/07/2026).** Nova premissa do
      Rômulo. Proposta de tech lead completa em
      `docs/arquitetura/plano-bootstrap-e-stack-vps.md`. Decisões que dependem
      de confirmação antes da Fase 0.5/1:
  - [x] VPS Hostinger **região São Paulo** — CONFIRMADO (residência LGPD ok).
  - [x] Banco: **Postgres puro** (não Supabase) — decidido 09/07/2026. Iris é
        monólito Next (navegador não fala com o DB direto), então PostgREST/
        GoTrue/Realtime do Supabase são peso morto. RLS via session GUC
        (`app.user_id`) em vez de `auth.uid()`; greenfield, custo zero.
  - [x] Commits: **Conventional Commits em português** — decidido.
  - [x] Estrutura de pastas: **feature-first** (`src/features`, `db/`,
        `infra/`, `components/ui`) — ver plano §4.
  - [x] Auth: **Better-Auth** (MFA/2FA + multi-tenant in-app, adapter Postgres).
  - [x] Migrations/ORM: **Drizzle** (schema TS + migrações SQL; RLS em SQL cru).
  - [x] Tier do VPS: **KVM 4 (16 GB)** confortável; piso KVM 2 (8 GB).
  - [x] Observabilidade: **GlitchTip self-host** (LGPD); preview-per-PR: aceitar
        perda no MVP (staging fixo só se necessário).
  - [x] Docker no escopo: Dockerfile Next standalone + `.dockerignore` +
        `.claudeignore`.
  - [x] Convenções: commits pt-BR, pnpm/corepack, TS strict, ESLint+Prettier+
        Husky+lint-staged, Vitest+Playwright+pgTAP — todas confirmadas.
  - [x] **Provisionamento executado no Easypanel (10/07/2026, sessão DevOps):**
        VPS `31.97.170.105`, Easypanel v2.31.0. **Restrição de verba: só 3
        projects (cap do plano atual), já usados (`aladdin`, `espectro-mvp`,
        `schedule`).** Sem verba p/ 4º project → decisão: **nestar os serviços
        do Iris dentro do project `espectro-mvp`** (divisão de espaço com outro
        site), com **prefixo `iris-`** nos serviços, PROVISÓRIO até validar o
        MVP e liberar orçamento p/ project isolado. Criados: - `iris-postgres` (Postgres puro, template Easypanel) — db `iris`,
        user `iris`, senha random gerada, imagem oficial. **Rodando.** Host
        interno p/ o app: `iris-postgres:5432`. Isolado do MySQL do espectro
        (banco próprio, não compartilha — dado de menor/LGPD). - `iris-app` (Aplicativo) — source GitHub `romulosutil/Iris`@`main`,
        build **Dockerfile** `infra/Dockerfile`, domínio `irisclinica.ia.br`
        → porta **3000** (HTTPS/Let's Encrypt). **NÃO implantado** de
        propósito: repo na Fase 0.5 sem `infra/Dockerfile`/scaffold Next —
        deploy é 1 clique no bootstrap quando o Dockerfile existir. - **Env do `iris-app` pendente p/ bootstrap** (não setado p/ não manusear
        a senha do DB): `DATABASE_URL=postgres://iris:<senha>@iris-postgres:5432/iris`,
        `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://irisclinica.ia.br`. - **Domínio `irisclinica.ia.br` (registro.br, comprado, exp. 09/07/2027):**
        DNS via registro.br (não aceita `@` nem `*`/wildcard). Bind no
        Easypanel feito. **Registros A pendentes (Rômulo adiciona):**
        `irisclinica.ia.br`→`31.97.170.105` e `www`→`31.97.170.105`. Zona
        ficou travada ~2h por transição de servidores (switch p/ modo
        avançado); subdomínios futuros (`storybook.`/`staging.`) = A
        individuais (sem wildcard). - **Flag DevOps:** VPS real é **2 vCPU / 7.8 GB** (não o KVM4/16GB do
        plano §1; ~38% RAM já usada por aladdin+espectro+schedule). Fase 0.5
        cabe folgado; reavaliar RAM antes da Fase 3 (LLM/extração) e do
        GlitchTip self-host.
  - [ ] **PENDENTE (não bloqueia bootstrap/DS):** backup/restore agora é nosso —
        `pg_dump` agendado + destino em BR + restore testado (item LGPD, antes
        do dado real na Fase 1+). Easypanel tem "Cópias de segurança" nativo no
        `iris-postgres` — configurar cron + destino BR ali. DPA Hostinger + DPA
        Anthropic a assinar.
        **Bootstrap 100% especificado — sem decisões abertas para começar a Fase 0.5.**
- [x] Estrutura do modelo de negócio → `docs/produto/modelo-de-negocio.md`:
      preço POR PACIENTE ATIVO/mês (norma da categoria, validada por mercado),
      3 tiers (Diário/Clínica/Convênio) mapeados às fases, GTM com 1-2 clínicas
      fundadoras pagantes.
- [x] Entidade contratante do piloto (decidido 09/07/2026): usar o PJ
      existente do Rômulo (Designer de Produto, ME/EPP no Simples Nacional) para
      assinar os contratos-piloto e emitir as notas da assinatura do Iris nas
      1-2 clínicas fundadoras — coerente com o GTM "fazer coisas que não
      escalam" já documentado. Sendo ME/EPP (não MEI), não há o bloqueio de
      CNAE que MEI teria (desenvolvimento/licenciamento de software não está
      na lista de atividades permitidas para MEI — não se aplica aqui).
  - [x] Confirmar com o contador se o CNAE atual do PJ cobre "desenvolvimento
        e licenciamento de programas de computador" (SaaS) antes de emitir a
        primeira nota fiscal da assinatura — **encaminhado (09/07/2026):**
        Rômulo já pediu à contadora para incluir o CNAE secundário; segue com
        ela, deixa de ser pendência aberta do lado do produto.
  - [ ] Marco para abrir CNPJ dedicado do Iris: quando a métrica de ativação
        do GTM for atingida (≥80% das sessões com diário na semana 4+ e ≥70%
        de aprovação sem edição) e antes de escalar para as 5-10 clínicas por
        indicação — separa responsabilidade/passivo do negócio de design
        pessoal e deixa o CNAE/tributação corretos desde o início da escala.
- [ ] Números finais de preço e definição de "paciente ativo" — após Roteiro C
      (Van Westendorp) no piloto.
- [x] **Investigação pública dos 4 concorrentes concluída (09/07/2026)** —
      visitei os sites oficiais de ComportaTUDO, Neoaba, BlueSmiles e ABA
      Digital (sem trial/cadastro). Resultado completo em
      `modelo-de-negocio.md` seção 2 (tabela + análise). Achados principais:
      (1) **"IA no relatório/PEI" não é diferencial de nenhum dos 4** — todos
      já anunciam geração por IA, não só o ComportaTUDO como se pensava antes;
      (2) **achado mais sério: BlueSmiles já anuncia "relatórios para
      convênios e planos de saúde" publicamente** — o dossiê de convênio não
      é mais território livre, a tese precisa migrar de "ter relatório de
      convênio" para "ser o único rastreável frase a frase até a sessão de
      origem"; (3) **nenhum dos 4 menciona** proveniência frase-a-frase,
      evidência ≠ pontuação, ou reclassificação/auditoria de divergência — os
      sinais públicos (planilha com % automático, protocolo clicável, import
      de PDF de protocolo) seguem consistentes com "digitalizaram a coleta
      estruturada", reforçando (não enfraquecendo) a tese central de
      diferenciação. (4) ABA Digital cobra por Nº de terapeutas, não por
      paciente — único dos 4 fora da norma, reforça que "por paciente" é
      mesmo padrão de categoria. **Pendência que sobra, menor**: trial/demo
      completo com cadastro (o que só dá pra ver logado) não foi feito —
      continua como validação adicional, não bloqueadora.
- [x] **Non-goal de coleta por tentativa (trial-by-trial) — decisão de produto
      tomada (09/07/2026)**, em vez de deixar em aberto até o Roteiro A/C:
      mantém-se a narrativa como modo primário de registro (o campo
      `tentativas` do `output-schema.json` já cobre contagem quando o
      terapeuta menciona espontaneamente, sem exigir UI de trial-by-trial).
      Detalhado com racional completo e condição de reversão em
      `modelo-de-negocio.md`, nova subseção após §2. Reação real do mercado
      (Roteiros A/C) segue como VALIDAÇÃO da decisão já tomada, não como
      pré-requisito para decidir.
- [x] **Relatório de convênio NARRATIVO promovido de fast-follow para MVP
      (Fase 5) — decisão de produto+vendas (09/07/2026).** Rômulo encontrou
      clínicas-piloto interessadas, mas para elas relatório não pode ser
      pós-MVP. Atuando como Especialista de Produto + Especialista de Vendas
      para chegar a uma conclusão rentável (mesmo que revisável): dos 10 itens
      da seção F, só **um** muda de fase agora — o resto fica pós-MVP. Racional
      completo, tabela de custo×receita por item e o que NÃO foi promovido
      (e por quê) estão em `modelo-de-negocio.md` seção 4 e
      `stack-e-plano-de-construcao.md` seção 3 (Fase 5). Resumo executivo:
  - **Por que só este item**: é o único dos 10 que (a) é a dor que já valida
    pagamento no tier Convênio mais caro (linha 15 da tabela de validação,
    §1 de `modelo-de-negocio.md`), (b) reaproveita quase 100% de
    infraestrutura JÁ prevista na Fase 5 (o "segundo agente" — gerar
    rascunho com IA → coordenador edita/aprova → exporta PDF — já existe
    para o relatório da família; `Report.tipo='convenio_narrativo'` já
    tem DDL própria desde a correção do split `convenio_bruto`/
    `convenio_narrativo`), então o custo marginal é essencialmente um novo
    prompt/rascunho de regras + um template de PDF, não uma arquitetura
    nova, e (c) sem ele o tier Convênio (o mais caro, R$ 99-119/paciente)
    fica sem o artefato que justifica o preço até um fast-follow
    indefinido — inaceitável agora que existe cliente concreto pedindo.
  - **Por que os outros 9 ficam pós-MVP**: nenhum tem o mesmo combo
    "reaproveita infraestrutura já planejada + dor já validada com cliente
    real". Avaliação formal assistida e relatório avaliativo
    interdisciplinar exigem UI/lógica nova (janela de pontuação, síntese
    cross-protocolo) sem sinal de cliente pedindo isso especificamente
    agora — promover os três junto diluiria o foco da Fase 5 sem receita
    adicional comprovada. Anamnese estruturada é jornada de Admissão
    (Fase 1), não de relatório — fora do pedido literal de "relatórios"
    das clínicas. Os demais (2º protocolo, relatório escolar, transição/
    alta, reunião interdisciplinar, treino parental, dataset de
    divergência) não têm pedido de cliente nem urgência de receita
    identificados nesta rodada.
  - **Reversibilidade**: se as clínicas-piloto, ao serem apresentadas ao MVP
    com o narrativo incluído, sinalizarem que TAMBÉM precisam de avaliação
    formal assistida ou do relatório interdisciplinar antes de assinar,
    a mesma análise se aplica a eles — não é uma decisão fechada para
    sempre, é a leitura de produto+vendas com o sinal de hoje.
- [x] **Nome/marca e domínio decididos por Rômulo (10/07/2026): Iris,
      domínio `irisclinica.ia.br` já comprado.** Rebranding de "Xpect" para
      "Iris" já aplicado em toda a documentação (README, BACKLOG, modelo de
      dados, agente, UX, modelo de negócio, stack e os 4 documentos
      jurídicos). **O que NÃO foi renomeado ainda**: a pasta do projeto no
      computador do Rômulo continua se chamando `xpect` no sistema de
      arquivos (`C:\Users\sutil\Documents\dev\PESSOAL\apps\xpect`) — renomear
      a pasta (e, se/quando existir, o repositório git) é uma decisão dele/da
      sessão de Claude Code CLI, não uma mudança de conteúdo que esta sessão
      devesse fazer sozinha.
- [ ] Escolha do modelo LLM + custo por sessão processada — **decisão de
      TIMING tomada por Rômulo (09/07/2026): o bake-off pago (chamada real às
      APIs Anthropic/Google, seção B) só roda quando o código estiver sendo
      construído (Fase 3), não antes.** Não é mais "falta a chave de API" (uma
      pendência passiva); é uma escolha deliberada de sequenciamento. Racional
      de Rômulo, textual: "não há escolhas melhores que Claude e Gemini (salvo
      GPT), então a questão é escolher se quero ferrari ou lamborghini" — os
      dois concorrem no mesmo patamar de ponta (Artificial Analysis
      Intelligence Index, seção B: Claude Sonnet 5 = 53 vs. Gemini 3.1 Pro = 46,
      preço quase igual), então gastar a chamada paga HOJE não reduz nenhum
      risco de arquitetura nem destrava nenhuma outra decisão — só decide QUAL
      dos dois, e essa escolha só precisa existir no momento em que o código
      chamar a API pela primeira vez. Harness pronto e testado (`--dry-run`,
      seção B); rodar de verdade fica marcado como próximo passo já dentro da
      Fase 3 (ver seção C), não como bloqueio desta seção D.
  - [x] **ASR pt-BR pesquisado (09/07/2026)** — `docs/arquitetura/stack-e-plano-de-construcao.md`
        nova seção 5: 5 provedores comparados (Whisper API, gpt-4o-transcribe,
        Azure AI Speech, Google Chirp, Deepgram Nova-3). Achado principal: só o
        Azure confirma região `brazilsouth` (mesmo padrão de Supabase/Vercel);
        só o Whisper tem WER publicado por idioma para português (5-7%,
        "Tier 1 forte"). Preço não decide sozinho — 3 dos 5 empatam em
        ~US$ 0,006/min para lote. Shortlist para teste real na Fase 6:
        gpt-4o-transcribe vs. Azure AI Speech, mesmo padrão do bake-off de LLM
        (testar contra áudio real de clínica, não benchmark genérico). Decisão
        final continua adiada pra Fase 6, agora com comparação concreta em vez
        de placeholder.
- [x] **Rascunho de política de retenção/eliminação de dados escrito
      (09/07/2026)** — `docs/legal/politica-retencao-dados.md`, usando como
      piso a recomendação de `validacao-legal-prontuario.md` (MAX(paciente
      completa 18 anos, alta+10 anos), configurável por clínica), com processo
      de eliminação/anonimização, base legal (Art. 15/16) e direitos do
      titular (Art. 18). Documento é RASCUNHO DE PRODUTO, pendente de revisão
      por advogado antes de publicação — a pendência de encarregado (DPO)
      segue em aberto (seção 7 do documento), não resolvida por este rascunho.
- [x] **Rascunho de termos de uso e política de privacidade escritos
      (09/07/2026)** — `docs/legal/termos-de-uso.md` (relação B2B Iris↔
      clínica: papéis controlador/operador, licenciamento de protocolo,
      limitação de responsabilidade, uso aceitável) e
      `docs/legal/politica-privacidade.md` (dados tratados, base legal, papel
      da IA/transferência internacional, compartilhamento, segurança,
      direitos do titular). Ambos RASCUNHO DE PRODUTO — cláusulas de vigência/
      rescisão/foro (termos de uso) e definição de encarregado/contato
      (privacidade) ficam deliberadamente em aberto, pendentes de advogado.
- [ ] Clínica-piloto para o MVP (1-2 clínicas parceiras).
- [x] **Público-alvo do design system "Espectro Brutal" corrigido (10/07/2026,
      a pedido de Rômulo).** A primeira versão do briefing tratava
      acessibilidade sensorial TEA como requisito literal da interface — erro:
      quem opera o Iris é terapeuta/coordenador/responsável (em regra,
      neurotípicos), não o paciente. Correção aplicada: "espectro" vira lente
      **conceitual**, não requisito sensorial — o neobrutalismo (estética que
      expõe estrutura em vez de esconder atrás de gradiente/sombra suave) é
      usado como metáfora visual da honestidade epistêmica do produto
      (evidência ≠ pontuação, IA nunca decide sozinha, candidato ≠
      conquistado — os 5 princípios já existentes em
      `fluxos-e-wireframes.md` seção 0, agora também viram regra de token).
      Ergonomia por público recalibrada por contexto de uso real (terapeuta:
      mobile/corredor/luz variável → alto contraste funcional, não redução
      de estímulo; coordenador: desktop/fila longa → hierarquia contra
      rubber-stamping; responsável/portal da família, ainda não iniciado —
      seção F: modo "Família" mais quente dentro do mesmo token system, não
      um 2º design system). Briefing v2 completo em
      `docs/ux/design-system-espectro-brutal.md`, incluindo correções
      técnicas que já valiam independente do público (remoção do padrão de
      listras do alerta de erro — risco de estresse visual/efeito moiré;
      separação do estado Focus do estado Pressed; validação WCAG AA como
      critério de aceite, não alegação). **Nota de risco registrada**: o
      codinome "Espectro Brutal" e a palavra "espectro" ficam
      estritamente internos — usá-los em material de cliente sugeriria uma
      alegação de acessibilidade para autismo que o produto não faz.
  - [x] **Sequenciamento decidido (10/07/2026, a pedido de Rômulo):** o design
        system não estava especificado em nenhuma fase do plano de construção
        (`stack-e-plano-de-construcao.md`) nem no `HANDOFF-FASE1.md` — gap
        encontrado ao verificar em que etapa ele entraria, justo quando a
        Fase 1 é o próximo passo real do projeto. Decisão: **Fase 0.5**,
        antes da Fase 1 — escopo mínimo (tokens + Botão/Card/Alerta), não uma
        biblioteca completa; novos componentes nascem sob demanda a partir da
        Fase 1. Adicionada como item de seção C acima e detalhada em
        `stack-e-plano-de-construcao.md` (nova seção "Fase 0.5") e
        `HANDOFF-FASE1.md` (nota de pré-requisito).
  - [x] **Ferramenta de entrega decidida (10/07/2026, a pedido de Rômulo —
        "algo de qualidade, entregue no Storybook"):** Storybook
        (`@storybook/nextjs`, reaproveita o Tailwind/componentes do próprio
        app) + `addon-a11y` (valida os critérios de aceite de
        contraste/foco automaticamente por story, não manual) +
        `addon-essentials` (viewport com presets Terapeuta 375px/Coordenador
        1280px). Escopo elevado de "renderiza isolado" para "matriz de
        stories cobrindo todos os estados do briefing" (ex.: Botão com
        deslocamento leve vs. longo conforme risco da ação; Card
        Candidato vs. Conquistado lado a lado) — é o que torna o catálogo
        revisável de verdade, não decorativo. Build publicado no Vercel
        (mesmo padrão de preview do resto do stack) para o Rômulo revisar
        sem rodar nada local. Deliberadamente FORA desta fase: Chromatic
        (regressão visual paga) e Style Dictionary (pipeline de tokens
        multi-plataforma) — racional e condição de revisitar cada um em
        `stack-e-plano-de-construcao.md` seção 2. Detalhe técnico completo
        (ordem de execução, addons, estrutura de stories) na seção "Fase
        0.5" do mesmo documento.
  - [x] **Inventário de componentes futuros + regra anti-hardcode (10/07/2026,
        a pedido de Rômulo).** Levantamento completo de `fluxos-e-wireframes.md`
        (todos os wireframes, flows de exceção, tabela de estados) mapeando
        componentes de UI previstos por fase além dos 3 base — ex.: Cartão de
        Sugestão (o mais crítico, Fase 3), Badge de Confiança, Barra de
        progresso do protocolo com par candidato/conquistado, Scrubber da
        linha do tempo, Menu de ação/Modal/Seletor de período (Fase 5, com
        Radix UI Primitives cogitado como camada de comportamento acessível
        por baixo da pele visual) — lista completa e não-vinculante em
        `docs/ux/inventario-componentes.md` (nada aí está aprovado para
        construção antes da fase chegar). Junto, regra de engenharia
        permanente registrada em `HANDOFF-FASE1.md` seção 0: nenhuma tela
        estiliza elemento direto — sempre consumir componente do design
        system existente, estender um existente quando parecido, ou criar um
        novo formalmente (token + estados + story) só quando nenhum dos dois
        cobrir o caso, sempre antes de usar na tela real. Regra também salva
        na memória de projeto desta sessão (`design_system_sem_hardcode.md`)
        para sessões futuras de Cowork que revisarem design.

## E. Pesquisa real (pós-MVP — roteiros prontos em docs/pesquisa/)

- [x] **Sinal informal de validação (09/07/2026)**: Rômulo mostrou um protótipo
      a uma terapeuta real; a PRIMEIRA pergunta dela foi se dava para exportar
      relatório para convênio. Reforça a hipótese já registrada em
      `modelo-de-negocio.md` (linha 15 — relatório de convênio como analgésico
      mais forte) com um dado de campo, não só hipótese. Não muda a decisão
      pendente sobre dossiê bruto de auditoria (seção B/produto acima), mas
      aumenta a confiança nela — considerar essa pergunta como roteiro/sonda
      espontânea nas entrevistas formais de terapeutas (item abaixo).
- [ ] Especialistas: taxa de concordância especialista × IA com diários reais.
- [ ] Terapeutas: usabilidade da revisão; sustentação do registro em dois tempos.
- [ ] Coordenadores: peso do relatório de convênio na compra; disposição a pagar.
- [ ] Famílias: reação a relatórios de platô; formato/canal.
- [ ] Validar: visibilidade integral do prontuário pela equipe de cuidado;
      enquadramento anti-vigilância das métricas.

## F. Fast-follows e backlog nomeado (pós-MVP)

- [x] ~~Relatório de convênio/operadora (job-to-be-done que paga o produto em
      clínica pequena)~~ — **promovido para MVP/Fase 5 em 09/07/2026** (ver
      seção D, decisão de Produto+Vendas: clínicas-piloto exigem relatório já
      no MVP). Deixa de ser item de seção F.
- [ ] Relatório avaliativo interdisciplinar (artefato de referência).
- [ ] Avaliação formal assistida (janela de pontuação com dossiê + série 1º-4º teste).
- [ ] Anamnese estruturada na admissão.
- [ ] Segundo protocolo cadastrado (prova do "protocolo é dado, não código").
- [ ] Relatório escolar + orientações de manejo para professores.
- [ ] Transição/alta (usa o componente de Transição do VB-MAPP).
- [ ] Reunião interdisciplinar (discussão de caso multi-disciplina).
- [ ] Treino parental / portal da família.
- [ ] Dataset de divergência (reclassificações) → loop de melhoria do agente.
