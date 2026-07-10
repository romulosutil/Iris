# Mapa de Cobertura das Jornadas Terapêuticas — Gaps

Análise do ciclo de vida completo (paciente e personas) contra tudo que já está
definido na série de prompts, no documento de protocolos e na pesquisa simulada.
Legenda: ✅ coberto · 🟡 parcial · 🔴 ausente. Cada gap tem destino recomendado.

---

## O ciclo de vida do paciente na clínica

```
1. ADMISSÃO → 2. AVALIAÇÃO INICIAL → 3. PLANO/METAS → 4. CICLO DE SESSÕES
   (pré → durante → pós) → 5. SUPERVISÃO/QUALIDADE → 6. REAVALIAÇÃO →
   7. COMUNICAÇÃO EXTERNA (família/convênio/escola) → 8. TRANSIÇÃO/ALTA
```

### 1. Admissão do paciente — 🔴 AUSENTE (crítico, promover ao MVP)

O paciente hoje "aparece" cadastrado no sistema. Falta a jornada de entrada:

- Ficha clínica essencial: diagnóstico/hipótese, medicações, alergias, restrições,
  convulsões, contatos de emergência, escola.
- Anamnese (entrevista com responsáveis) — documento rico que alimenta o resumo
  de repertório usado pelo agente.
- CONSENTIMENTO LGPD específico: tratamento de dados de menor + uso de IA no
  processamento + termo de ciência sobre exportação de relatórios. Sem isso, o
  produto não pode operar com dados reais.
  → Destino: versão mínima (ficha + consentimento) na Fase 1; anamnese estruturada
  como fast-follow.

### 2. Avaliação inicial — ✅ coberto como processo, 🟡 como jornada

O catálogo de protocolos e a MilestoneAssessment em série cobrem o dado. A
JORNADA de aplicar a avaliação (agendar bateria, registrar por instrumento,
gerar o relatório interdisciplinar) é fast-follow declarado ("avaliação formal
assistida"). Sem mudança — já priorizado corretamente.

### 3. Plano de cuidados e metas (PEI) — 🔴 GAP MAIS GRAVE (promover ao MVP)

A meta é a "unidade central" do sistema, mas nenhum prompt desenha o CICLO DE
VIDA DA META:

- Quem cria: coordenador/supervisor (com o terapeuta), a partir da avaliação e
  do dossiê. Hoje o sistema recebe "metas ativas" como se caíssem do céu.
- Estados: rascunho → ativa → dominada → pausada → descontinuada.
- CRITÉRIO DE DOMÍNIO definido na criação (ex.: "3 sessões consecutivas com
  acerto independente") — é ele que transforma o acúmulo de evidências em
  candidata a dominada; sem critério, o "candidato a avaliação" não tem régua.
- Ciclos de revisão (8-12 semanas, estilo ESDM): revisar metas com o dossiê.
  → Destino: MVP. Sem meta criada não há alvo de extração — é pré-requisito lógico
  da Fase 3.

### 4. Ciclo de sessões

- **Pré-sessão — 🔴 AUSENTE (alto valor, custo baixo):** o terapeuta chega e
  trabalha o quê? Falta o BRIEFING DE SESSÃO: resumo da última sessão, metas
  ativas priorizadas, alertas ("evite transição abrupta com massinha"),
  reforçadores atuais. É IA barata (resumo sobre dados existentes) e ataca a
  carga cognitiva — a promessa do produto. → Destino: MVP, Fase 4.
- **Durante/pós-sessão — ✅ coberto** (captura, consolidação, extração, revisão).
- **Perfil de reforçadores vivo — 🟡 parcial:** o diário menciona preferências
  ("motivado pela pista de carrinhos") e o agente as ignora. Avaliação de
  preferência é prática ABA diária. → Destino: novo tipo de extração
  `preferencia_reforcador` no agente (custo quase zero) alimentando o briefing.
- **Falta/cancelamento — 🟡 parcial:** check-in registra falta, mas faltas
  RECORRENTES (assiduidade caindo → risco terapêutico e de convênio) só aparecem
  implícitas na lista de exceções. → Destino: explicitar regra de alerta de
  assiduidade na lista de exceções (Fase 5, barato).
- **Incidente grave — 🟡 parcial:** o ABC cobre o registro, mas autolesão/agressão
  severa tem workflow próprio: severidade, notificação obrigatória ao coordenador
  e ao responsável, registro destacado. → Destino: campo `severidade` no ABC +
  notificação (Fase 5).

### 5. Supervisão e qualidade — ✅ coberto

Exceções, pacote de supervisão, fila de validação/reclassificação, métricas
transparentes. Único 🟡: REUNIÃO INTERDISCIPLINAR (fono + ABA + TO discutindo o
mesmo caso) — o pacote de supervisão é coordenador↔terapeuta; falta a visão
"discussão de caso" com as metas de todas as disciplinas lado a lado.
→ Destino: pós-MVP (o perfil do paciente com equipe de cuidado já dá 70% disso).

### 6. Reavaliação — ✅ coberto (série 1º-4º teste, dossiê, candidatos). Fast-follow.

### 7. Comunicação externa

- Família (relatório PDF) — ✅ coberto.
- Convênio — ✅ fast-follow declarado.
- **ESCOLA — 🔴 ausente:** relatório para professores/AT escolar e orientações de
  manejo é demanda real e recorrente (reuniões escolares semestrais). Mesma base
  de evidências, terceiro formato de Report. → Destino: backlog pós-MVP; custo
  marginal baixo porque Report já tem `tipo`.
- **Treino parental / orientação para casa — 🟡 parcial:** o "como apoiar em casa"
  do relatório é unidirecional. Treino parental formal (frequente exigência
  clínica) e registro de generalização em casa pelos pais → backlog pós-MVP
  (exigiria o portal da família, decisão já tomada de adiar).

### 8. Transição e alta — 🔴 ausente (aceitável adiar, mas nomear)

O VB-MAPP tem componente de Transição (18 áreas) exatamente para isso: prontidão
para ambientes menos restritivos, redução de carga, alta. Relatório de alta é
obrigação clínica. → Destino: backlog pós-MVP, apoiado pelo dossiê + série de
avaliações (a infraestrutura já serve).

---

## Gaps por persona (resumo)

| Persona      | Coberto                                  | Gaps                                                                                            |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Terapeuta    | agenda, captura, revisão, linha do tempo | 🔴 briefing pré-sessão · 🟡 reforçadores · 🔴 participação na criação de metas                  |
| Coordenador  | exceções, supervisão, validação, exports | 🔴 criação/revisão de metas · 🟡 assiduidade · 🟡 reunião interdisciplinar · 🟡 incidente grave |
| Família      | relatório PDF                            | 🟡 treino parental · 🔴 consentimento na admissão (é jornada DELES)                             |
| Clínica/dono | (herda coordenador)                      | 🟡 admissão do paciente · backlog: escola, alta                                                 |

## Auditoria do dia terapêutico (hora a hora) — jul/2026

Verificação da especificação contra o dia real de uma clínica, do check-in da
recepção ao fim do expediente. O núcleo do dia (briefing → sessão → captura →
consolidação → extração → revisão → supervisão por exceção) está ✅ bem coberto
após as promoções acima. Achados restantes:

- **🟡 Papel da recepção/admin não modelado.** A grade "já existe, é planilha da
  recepção" (T1). Quem mantém a agenda e faz check-in no sistema? No MVP os
  papéis acumulam (coordenador/terapeuta), mas o User precisa aceitar um papel
  `admin/recepção` sem acesso a dado clínico (minimização LGPD). Barato no
  schema, caro se descoberto depois. → Prompt 1.
- **⚪ Non-goal consciente: coleta por tentativa (trial-by-trial) durante a
  sessão.** Concorrentes (ComportaTUDO, Neoaba, ABA+) oferecem formulário de
  coleta em tempo real; o Xpect aposta que a narrativa pós-sessão captura mais
  qualidade com menos fricção. É a aposta central do produto — mantida, mas
  agora NOMEADA como risco a validar (supervisores "old school" e auditoria de
  operadora podem exigir folha fria). → pergunta nos Roteiros A e C.
- **🟡 Risco de sequenciamento na captura em dois tempos.** A tese de adoção
  (Tema 4) é captura imediata + consolidação no fim do dia, mas o ditado por
  voz está na Fase 6. Se a Fase 2 entregar só "diário no fim do dia", o piloto
  testa a tese errada. Mitigação barata: campo de captura rápida POR TEXTO
  (2-3 linhas, vira rascunho na fila de pendências) já na Fase 2. → Prompt 3.
- **🟡 Comunicação diária com a família.** Prática real: mensagem de WhatsApp
  pós-sessão ("como foi hoje?"). O relatório mensal não cobre isso. Subproduto
  barato do diário aprovado: resumo de 2 frases copiável, sem dado sensível,
  para o terapeuta colar no WhatsApp. → pós-MVP nomeado (validar demanda no
  piloto antes).
- **🟡 Sessão substituta.** Terapeuta faltou, outro cobre. O grafo M:N com
  vigência suporta o vínculo, mas a jornada (substituto vê briefing? registra
  no prontuário de paciente que não é "dele"?) não está desenhada. Regra
  simples: membro temporário da equipe de cuidado com vigência de 1 dia.
  → Prompt 1 (schema) + Prompt 3 (fluxo).
- **✅ Reforço de decisão:** a pesquisa de mercado (ver modelo-de-negocio.md)
  confirma que agenda completa/financeiro são commodity dos concorrentes —
  o corte do Bloco 0 (agenda mínima apenas) está correto.

## Decisões de promoção (aplicadas à série de prompts)

1. **Ciclo de vida da meta → MVP** (novo item na jornada do coordenador; estados
   e critério de domínio no Prompt 1; fluxo de criação no Prompt 3).
2. **Ficha do paciente + consentimento LGPD → Fase 1** (é pré-condição legal).
3. **Briefing pré-sessão → Fase 4** (IA de resumo sobre dados existentes).
4. **Perfil de reforçadores → agente (R18 + schema)** e insumo do briefing.
5. **Severidade no ABC + alerta de assiduidade → Fase 5** (regras baratas).
6. **Backlog nomeado (pós-MVP):** relatório escolar, transição/alta, reunião
   interdisciplinar, treino parental, anamnese estruturada.
