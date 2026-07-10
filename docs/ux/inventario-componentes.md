# Inventário de Componentes do Design System (Espectro Brutal)

Levantamento feito a partir de uma leitura completa de
`docs/ux/fluxos-e-wireframes.md` (todos os wireframes, flows de exceção e a
tabela de estados de UI). Objetivo: dar visibilidade do que vem pela frente
sem construir nada disso agora — a Fase 0.5 continua enxuta (tokens + Botão,
Card, Alerta). Cada fase, ao chegar, consulta esta lista antes de estilizar
qualquer coisa na tela.

**Regra permanente que rege esta lista:** nenhuma tela cria componente
hardcoded. Antes de estilizar algo novo, checar (1) se já existe no
Storybook, (2) se um componente existente pode ser estendido/melhorado para
cobrir o caso, e só then (3) criar um novo componente formal no design
system (com tokens, estados e story) — nunca estilo solto na tela. Regra
completa, com o "porquê", em `HANDOFF-FASE1.md` (bloco "Regra de engenharia
não-negociável").

---

## Já especificados (Fase 0.5)

Botão Primário, Content Card, Alerta de Erro Redundante — spec completa em
`docs/ux/design-system-espectro-brutal.md` seção 4.

**Implementados (10/07/2026)** em `src/components/ui/` com stories no Storybook:
`button`, `card`, `alert` e `logo`. O **Logo** (marca de anéis hexagonais
concêntricos ouro/menta/azul + wordmark "IRIS") tem variações completo/marca/
wordmark, tom cor/mono, animação em cascata (respeita reduced-motion) e serve o
favicon (`src/app/icon.svg`). Fonte do SVG: `public/brand/iris-logo.svg`.

## Camada de comportamento para componentes complexos

Vários itens abaixo (menu de ação, modal, seletor de data, combobox,
scrubber) têm requisitos de acessibilidade não-triviais — foco preso dentro
de modal, navegação por teclado em menu/slider, `aria-*` correto. Construir
isso do zero por componente é caro e arrisca justamente os critérios de
aceite que o design system já promete (seção 5 do briefing). Adicionar
**Radix UI Primitives** (headless/sem estilo) como camada de comportamento
por baixo da pele visual "Espectro Brutal" — Radix resolve teclado/foco/ARIA,
os tokens do design system resolvem a aparência. Registrar como decisão de
stack quando a Fase que primeiro precisar de um desses componentes chegar
(provavelmente Fase 3, no seletor de alvo).

---

## Componentes previstos, por fase

### Fase 1 — Pacientes + agenda mínima

| Componente                                      | Tela de origem                                       | O que resolve                                                          | Relação com os 3 base                                                                |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Cabeçalho com voltar + título + contexto        | Praticamente toda tela (`← Grade Sessão 47 · Vitor`) | Navegação consistente entre mobile (terapeuta) e desktop (coordenador) | Novo primitivo de layout — construir na Fase 1, é usado por todas as fases seguintes |
| Item de Agenda com status                       | 5.1 Grade do dia                                     | Linha de horário + paciente + estado (✓ feito / ● agora / ○ futuro)    | Estende Content Card                                                                 |
| Formulário em etapas (administrativo → clínico) | 4.1 Cadastro                                         | Dois donos, dois momentos, mesma jornada (fronteira RLS visível)       | Container estende Card; navegação entre etapas é novo primitivo                      |
| Seleção múltipla com chip de vigência           | 4.1 (`☑ PROC — desde 09/07/2026`)                    | Selecionar protocolo(s) de referência com nota contextual inline       | Novo primitivo pequeno                                                               |

### Fase 2 — Metas + diário (sem IA)

| Componente                        | Tela de origem                           | O que resolve                                                                        | Relação com os 3 base              |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| Textarea de diário                | 5.2 Captura                              | Texto longo, é a fonte da verdade do produto — merece tratamento tipográfico próprio | Novo primitivo                     |
| Toggle segmentado Texto/Áudio     | 5.2 (`◉ Texto ○ Áudio`)                  | Alternar modo de captura                                                             | Novo primitivo (segmented control) |
| Chip de protocolo editável        | 5.2 (`🏷 ABA · alimenta VB-MAPP+ABLLS-R`) | Mostra e permite corrigir a família de protocolo pré-preenchida                      | Novo primitivo pequeno             |
| Formulário de critério de domínio | 4.4 (`N acertos... em M sessões...`)     | Input estruturado (não texto livre) para o que alimenta "candidata a dominada"       | Novo primitivo                     |
| Item de fila com CTA              | 5.3 Fila de pendências                   | Lista com ação principal por item                                                    | Estende Content Card               |

### Fase 3 — Extração + revisão

| Componente                                      | Tela de origem                                           | O que resolve                                                                                                            | Relação com os 3 base                                                                       |
| ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Cartão de Sugestão**                          | 1.2 Tela de Revisão                                      | O componente mais crítico do produto: 3 estados de confiança, compacto/expandido, ações inline (Aprovar/Editar/Rejeitar) | Estende Content Card, mas grande o bastante para spec própria — não é "só um Card colorido" |
| Badge de Confiança                              | 🟢🟡🔴🔷, reusado em Revisão/Gráfico/Filas               | Vocabulário visual único de confiança em todo o produto                                                                  | Novo primitivo pequeno, token-driven — definir uma vez, nunca recriar cor a cor por tela    |
| Seletor de alvo (combobox meta/marco/protocolo) | 2.2 Correção de marco                                    | Buscar e escolher o alvo correto ao editar sugestão                                                                      | Novo primitivo — candidato a Radix Combobox como base de comportamento                      |
| Banner informativo (1ª execução)                | ("As sugestões abaixo foram geradas automaticamente...") | Avisar sem ser erro                                                                                                      | Variante nova da família Alerta — tom informativo, não tom de erro                          |

### Fase 4 — Evidências acumuladas + linha do tempo

| Componente                                       | Tela de origem                   | O que resolve                                                          | Relação com os 3 base                                                                                  |
| ------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Barra de progresso do protocolo                  | 1.3 Gráfico do protocolo         | Segmento sólido (conquistado) + hachurado (candidato) por meta/domínio | Novo primitivo — usa diretamente o par de tokens "candidato/conquistado" já definido no briefing       |
| Scrubber de linha do tempo                       | 1b                               | Arrastar entre sessões, "voltar no tempo" ao snapshot                  | Componente mais complexo do catálogo — Radix Slider como base de comportamento + skin                  |
| Banner fixo de modo passado                      | 1b (`📍 Vendo sessão 45 de 120`) | Nunca deixar confundir passado com presente                            | Mesma família do banner informativo da Fase 3                                                          |
| Trajetória (faixa colorida por trecho, clicável) | 1b                               | Evolução/estagnação/regressão visual, clicável para ver evidências     | Mini-visualização de dado — ao chegar aqui, herdar só os 3 acentos já definidos, nunca inventar 4ª cor |
| Comparação lado a lado                           | 1b (sessão N vs M)               | Layout de 2 colunas                                                    | Composição de Cards existentes, não é componente novo                                                  |

### Fase 5 — Coordenador + exportação

| Componente                        | Tela de origem                                             | O que resolve                                                  | Relação com os 3 base                                                          |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Item de Lista de Exceção          | 4.2                                                        | Severidade + 1 linha + CTA, "já tratado por outro coordenador" | Estende Content Card + Badge                                                   |
| Checklist de apoio à decisão      | 4.5 (`Checklist de confusões clássicas`)                   | Apoio à validação, não obrigatório marcar                      | Novo primitivo pequeno                                                         |
| Menu de ação com múltiplas opções | 4.5 (`Confirmar / Reclassificar ▾ / Devolver / Invalidar`) | Ação com sub-opções                                            | Radix DropdownMenu como base + skin                                            |
| Modal com campo obrigatório       | 4.5 (justificativa obrigatória ao reclassificar)           | Confirmação com input travado                                  | Radix Dialog como base + skin                                                  |
| Notificação de formação           | 4.5 (🔔 "ótima observação registrada")                     | Tom deliberadamente positivo, nunca punitivo                   | 3ª variante da família Banner — nunca reusar o Alerta de erro aqui, tom errado |
| Item de Equipe de Cuidado         | 4.3                                                        | Avatar/inicial + nome + papel + vigência                       | Novo primitivo pequeno                                                         |
| Botão-tile de exportação          | 4.6 (`[ 👪 Relatório para a família ] PDF narrativo...`)   | Título + descrição de 1 linha, maior que o Botão padrão        | Variante nova — não forçar encaixe no Botão Primário base                      |
| Seletor de período (date range)   | 4.6                                                        | Selecionar intervalo antes do preview factual                  | Radix (ou date picker equivalente) como base de comportamento                  |
| Lista de preview factual          | 4.6 (`Este dossiê vai incluir: •...`)                      | Preview antes de gerar PDF                                     | Reusa Content Card + lista simples, não é componente novo                      |

### Fase 6 — Ditado por voz + polish

| Componente                          | Tela de origem   | O que resolve                                             | Relação com os 3 base                                        |
| ----------------------------------- | ---------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Gravador de áudio + fila de reenvio | 5.2, exceção 2.5 | Estado de upload pendente/falhou sobre a captura de áudio | Extensão do primitivo de captura da Fase 2, não novo do zero |

### Transversais (aparecem em quase toda fase — tabela 7 do UX doc)

| Componente               | Onde aparece                                                             | O que resolve                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado vazio             | "dia limpo", "sem sessão anterior", "sem exceções — celebrar brevemente" | Ícone + texto + CTA opcional, reusável em qualquer lista                                                                                                                                        |
| Badge de estado genérico | upload falhou, extração pendente de reprocessamento                      | Antes de criar um 2º badge parecido com o Badge de Confiança da Fase 3, avaliar se dá para generalizar um só — é exatamente o tipo de decisão que a regra de "melhorar em vez de recriar" cobre |

---

## Como usar esta lista

Nenhum item aqui está aprovado para construção antes da fase que o
referencia chegar. Ao codar uma fase: (1) abrir esta tabela, ver o que ela
prevê; (2) checar no Storybook se já existe algo que cobre o caso — mesmo de
outra fase; (3) se existir e for parecido mas não igual, preferir estender
(props/variante nova) a criar um componente paralelo; (4) só criar
componente novo quando nenhuma extensão razoável cobrir o caso — e aí ele
entra no catálogo Storybook com token, estados e story, no mesmo padrão da
Fase 0.5, antes de ser usado na tela real.
