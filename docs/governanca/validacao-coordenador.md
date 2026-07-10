# Camada de validação do coordenador — Camada de validação do coordenador (reclassificação supervisionada)

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
- Generalização: a habilidade ocorreu fora do contexto treinado? (AFLS vive disso
  — casa vs. clínica vs. comunidade.)

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
