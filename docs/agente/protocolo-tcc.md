# Protocolo TCC (Terapia Cognitivo-Comportamental) — Especificação Clínica

> Documento produzido no papel de especialista clínico dedicado ao nicho TCC,
> seguindo o mesmo processo de validação já aplicado aos 10 protocolos TEA em
> `protocolos-e-agente.md` (Parte 1): pesquisa contra fontes conhecidas,
> marcação explícita de qualquer número/nome sem certeza absoluta como
> **PRECISA CONFIRMAÇÃO COM FONTE PRIMÁRIA**. Diferente do catálogo TEA, aqui
> não houve acesso a manuais oficiais/formulários reais durante esta sessão —
> os números abaixo vêm de conhecimento consolidado da literatura clínica
> (Beck, Burns, PHQ-9/GAD-7 de Spitzer-Kroenke-Williams), não de fonte primária
> lida diretamente. Tratar como 1ª rodada de validação, equivalente à "1ª
> rodada" do catálogo TEA antes da checagem contra fontes primárias/formulários
> reais — **não** como a validação de 3 rodadas já concluída para TEA.

Escopo: GitHub issue [#99](https://github.com/romulosutil/Iris/issues/99).
Contexto lido antes de escrever: `docs/agente/protocolos-e-agente.md` (Partes
1-4), `docs/agente/output-schema.json`, `docs/agente/casos-de-teste.md` (Caso
9), `README.md`, `docs/governanca/validacao-coordenador.md`.

---

## 1. O que é TCC

Terapia Cognitivo-Comportamental (Aaron Beck, anos 1960-70) é um modelo
estruturado e de curto/médio prazo (tipicamente 12-20 sessões, mas variável)
que trata sofrimento emocional pela cadeia:

```
Situação (evento/gatilho)
   → Pensamento automático (cognição rápida, não deliberada)
      → Distorção cognitiva (viés de processamento no pensamento, quando presente)
         → Emoção (com intensidade mensurável)
            → Comportamento (incluindo evitação, checagem, etc.)
```

Diferente do modelo TEA (marco de desenvolvimento observado por terceiros em
criança pré-verbal), TCC trata **majoritariamente adultos**, com **autorrelato
verbal** como fonte primária de dado (o próprio paciente descreve seu
pensamento e emoção — o terapeuta não infere de fora como faz um observador de
VB-MAPP). Isso muda a epistemologia da extração: a "evidência" aqui é o
relato do paciente TRANSCRITO/RESUMIDO pelo terapeuta no diário de sessão, não
uma observação comportamental direta de um avaliador treinado.

Trabalho é orientado a metas de curto prazo (reestruturação cognitiva,
redução de evitação, ativação comportamental) e usa tarefas de casa
sistematicamente entre sessões — diferente de TEA, onde a generalização
entre ambientes é dado de observação (ex.: AFLS), aqui é dado de **adesão
declarada** a uma tarefa combinada.

---

## 2. Instrumentos/componentes candidatos

### 2.1 Registro de Pensamentos (Thought Record / RPD) — unidade central

- **O que é:** a ferramenta central da TCC clássica (Beck; popularizada em
  formato de 7 colunas por David Burns, *Feeling Good*, 1980, e por Christine
  Padesky/Judith Beck em variações de 5-7 colunas). **PRECISA CONFIRMAÇÃO COM
  FONTE PRIMÁRIA:** o número exato de colunas varia por autor/manual (o
  "Registro de Pensamentos Disfuncionais" clássico de Beck tem 5 colunas;
  variações de Burns/Padesky chegam a 7 com uma coluna extra de "reavaliação
  da crença" pós-intervenção) — não travar em um número único; o formato
  abaixo modela o núcleo comum a todas as variações.
- **Componentes (estrutura de EVENTO, análoga ao `registro_abc` do VB-MAPP —
  não é "marco de domínio"):**
  - **Situação:** contexto/gatilho objetivo (quem, o quê, onde, quando).
  - **Pensamento automático:** a cognição relatada verbatim ou parafraseada
    pelo paciente ("vou ser demitido", "ela me acha um fracasso").
  - **Emoção:** nome da emoção (tristeza, ansiedade, raiva, vergonha, culpa
    etc.) **+ intensidade numérica**. Escala tipicamente **0-100** (mais comum
    em protocolos de TCC formal, ex.: manuais de Judith Beck) ou **0-10**
    (mais comum em uso informal/simplificado) — **o sistema não trava numa
    escala única** (mesmo princípio de `taxonomia_ajuda` ser campo do
    contrato, não constante do agente — ver R19 em Parte 3 de
    `protocolos-e-agente.md`); a clínica declara qual escala usa.
  - **Distorção cognitiva:** classificação do viés no pensamento (lista
    clássica abaixo). Pode haver mais de uma por pensamento.
  - **Resposta racional / pensamento alternativo:** a reformulação produzida
    em sessão (com ou sem reavaliação de intensidade emocional pós-resposta).
  - **Comportamento resultante:** ação tomada (evitação, enfrentamento,
    ritual de checagem etc.) — nem sempre presente no mesmo registro.
- **Distorções cognitivas clássicas (lista consolidada Beck/Burns — núcleo
  amplamente citado na literatura, mas a **enumeração exata varia por autor**;
  Burns lista 10 em *Feeling Good*, outros manuais listam entre 8 e 15 —
  **PRECISA CONFIRMAÇÃO COM FONTE PRIMÁRIA se o produto quiser uma lista
  "oficial" fechada**; a lista abaixo é o consenso prático de mercado):
  1. **Catastrofização** (magnificação do pior cenário) — "se eu errar essa
     reunião, vou ser demitido e nunca mais consigo emprego".
  2. **Leitura mental** (mind reading) — assumir o que o outro pensa sem
     evidência — "ela acha que eu sou incompetente".
  3. **Tudo-ou-nada** (pensamento dicotômico/polarizado) — "ou eu sou perfeito
     ou sou um fracasso total".
  4. **Generalização excessiva** — um evento isolado vira padrão universal —
     "eu sempre estrago tudo".
  5. **Desqualificação do positivo** — descartar evidência positiva como
     "não conta" — "eles só elogiaram por educação".
  6. **Raciocínio emocional** — tratar o sentimento como prova do fato — "eu
     sinto que sou um fracasso, então devo ser".
  7. **Afirmações do tipo "deveria"** (should statements) — regras rígidas
     autoimpostas — "eu deveria dar conta de tudo sozinho".
  8. **Rotulação** (labeling) — generalização extrema virando identidade —
     "eu sou um perdedor" em vez de "eu errei esta vez".
  9. **Personalização** — assumir responsabilidade/culpa por eventos fora do
     controle do indivíduo — "o projeto falhou por minha causa" mesmo com
     múltiplos fatores.
  10. **Filtro mental** (mental filter/abstração seletiva) — foco exclusivo em
      um detalhe negativo, ignorando o quadro geral.
  11. **Adivinhação do futuro** (fortune telling — às vezes tratada como
      subtipo de catastrofização, às vezes como categoria própria — **variação
      entre autores, confirmar**) — prever um desfecho negativo como certeza.
  12. **Comparação injusta** — comparar-se desfavoravelmente com um padrão
      irreal (menos citada de forma consistente; **confirmar se entra na
      lista "canônica" adotada pelo produto**).
- **Escala:** não há pontuação formal do registro em si — é estrutura
  qualitativa de evento + 1 medida numérica de intensidade emocional (que,
  diferente de PHQ-9/GAD-7, é auto-relatada PONTUALMENTE por evento, não um
  instrumento validado com pontos de corte).
- **O que o agente extrai:** situação, pensamento automático (literal/citado),
  emoção nomeada + intensidade (só se numericamente informada — mesmo
  princípio de R11 "números só literais"), distorção(ões) identificada(s) a
  partir de PADRÕES LINGUÍSTICOS no relato (nunca por diagnóstico do agente —
  ver Regra R4-TCC abaixo), resposta racional e comportamento resultante
  quando presentes.
- **Licenciamento:** o formato de registro de pensamentos em si é uma técnica
  clínica genérica, sem titular de direitos autorais restritivo conhecido —
  **diferente de VB-MAPP/ABLLS-R** (não há "kit" comercial protegido para o
  RPD). Formulários específicos publicados em livros de autoajuda/manuais
  (ex.: o formulário exato de 7 colunas do *Feeling Good Handbook* de Burns)
  podem ter direitos autorais sobre o LAYOUT/texto do formulário — mas a
  ESTRUTURA conceitual (situação→pensamento→emoção→distorção→resposta) é de
  domínio público clínico. Modelo "clínica cadastra o texto do formulário
  específico se usar um de marca registrada; a estrutura é livre".

### 2.2 Escalas de triagem/desfecho padronizadas de uso público

**Diferença estrutural central vs. TEA:** estas escalas são **de uso público
e livre** (ao contrário de VB-MAPP/ABLLS-R/AFLS/Perfil Sensorial 2, que são
protegidos por copyright comercial fechado) e são aplicadas em **intervalos**
(ex.: a cada 2-4 semanas, ou no início/meio/fim do tratamento), **não por
sessão** — mais parecido com a lógica de reavaliação formal do VB-MAPP
(1º-4º teste) do que com evidência-por-sessão.

#### PHQ-9 (Patient Health Questionnaire-9) — triagem/desfecho de depressão

- **O que é:** instrumento de autorrelato para sintomas depressivos,
  desenvolvido por Robert L. Spitzer, Janet B.W. Williams e Kurt Kroenke, com
  suporte da Pfizer Inc., derivado do PRIME-MD. **De uso público e gratuito**
  — Pfizer disponibiliza o instrumento sem exigir licenciamento para uso
  clínico/pesquisa (diferente do modelo "AVB Press/WPS/Pearson" do catálogo
  TEA). **PRECISA CONFIRMAÇÃO COM FONTE PRIMÁRIA** (site oficial
  phqscreeners.com/Pfizer) antes de travar a frase de licenciamento em
  produção — a política de uso público é amplamente reportada na literatura,
  mas não foi verificada contra o texto oficial de licença nesta sessão.
- **Estrutura:** **9 itens**, cada um mapeando um dos 9 critérios do DSM para
  episódio depressivo maior. Escala por item **0-3** (0 = nunca, 1 = vários
  dias, 2 = mais da metade dos dias, 3 = quase todos os dias), referente às
  **últimas 2 semanas**. **Total 0-27.**
- **Pontos de corte (consolidado na literatura, PRECISA CONFIRMAÇÃO COM FONTE
  PRIMÁRIA para uso em produção):** 0-4 mínimo/nenhum; 5-9 leve; 10-14
  moderado; 15-19 moderadamente grave; 20-27 grave.
- **Item crítico:** o item 9 pergunta sobre "pensamentos de que estaria melhor
  morto ou de se machucar de alguma forma" — **este item é o gatilho mais
  direto e formal de risco de ideação suicida no instrumento**, e deve estar
  ligado à Regra de Alerta de Risco (Seção 4), independente de qualquer outra
  regra do protocolo.
- **Periodicidade:** aplicação inicial (baseline) + reaplicação em intervalos
  (comum: a cada 2-4 semanas, ou em marcos do tratamento) — não por sessão.
- **Quem pontua:** o PACIENTE responde e soma o próprio escore (ou o
  terapeuta soma a partir das respostas do paciente) — nunca o agente de
  extração (mantém paralelo direto a R3/`escala_formal.quem_pontua` do
  catálogo TEA, ex.: VB-MAPP `"quem_pontua": "terapeuta_em_avaliacao"`; aqui
  seria `"paciente_autorrelato"` ou `"terapeuta_aplicando_com_paciente"`).

#### GAD-7 (Generalized Anxiety Disorder-7) — triagem/desfecho de ansiedade

- **O que é:** instrumento de autorrelato para sintomas de ansiedade
  generalizada, mesmos autores (Spitzer, Kroenke, Williams), mesmo modelo de
  licenciamento público/gratuito. **Mesma ressalva de confirmação de fonte
  primária que o PHQ-9.**
- **Estrutura:** **7 itens**, mesma escala por item **0-3**, referente às
  **últimas 2 semanas**. **Total 0-21.**
- **Pontos de corte (consolidado na literatura, PRECISA CONFIRMAÇÃO COM FONTE
  PRIMÁRIA):** 0-4 mínimo; 5-9 leve; 10-14 moderado; 15-21 grave.
- **Periodicidade:** mesmo padrão do PHQ-9 — intervalar, não por sessão.
- **Quem pontua:** paciente/autorrelato, nunca o agente.
- **Nota de cobertura:** GAD-7 não tem item de risco equivalente ao item 9 do
  PHQ-9 — a Regra de Alerta de Risco (Seção 4) não pode depender de nenhuma
  das duas escalas estar ativa; precisa ser transversal ao relato livre.

#### Outras escalas candidatas (fora do escopo desta 1ª rodada — registrar como backlog)

- Escala de Pensamentos Automáticos (Automatic Thoughts Questionnaire, ATQ) —
  citada na literatura, **não pesquisada em profundidade nesta sessão**;
  candidata natural por medir diretamente a frequência de pensamentos
  automáticos negativos, mas duplicaria parcialmente o RPD. **PRECISA
  PESQUISA DEDICADA se for entrar no catálogo.**
- Escalas específicas por transtorno (PCL-5 para TEPT, Y-BOCS para TOC, escala
  de Beck para depressão/ansiedade — BDI-II/BAI, que **são pagas/licenciadas**,
  diferente de PHQ-9/GAD-7) — fora de escopo desta issue; registrar como
  próxima rodada quando o produto expandir por transtorno específico.

### 2.3 Tarefa de casa (homework) — evento entre sessões

- **O que é:** elemento estrutural de TCC — o trabalho de mudança acontece
  majoritariamente FORA da sessão; a tarefa combinada e sua adesão são
  revisadas na sessão seguinte. Sem equivalente direto no catálogo TEA atual
  (mais próximo, em espírito, da "generalização" do AFLS — mas lá é
  observação direta em ambiente formal, aqui é **autorrelato de adesão**).
- **Componentes:**
  - **Descrição da tarefa combinada** (o que foi pedido na sessão anterior).
  - **Adesão:** feita / parcial / não feita.
  - **Resultado relatado** (o que aconteceu quando tentou, incluindo
    obstáculos).
  - **Vínculo à sessão de origem** (a tarefa nasce numa sessão e é revisada
    numa sessão seguinte — estrutura de evento com 2 pontas no tempo, não uma
    única extração isolada).
- **Escala:** não há pontuação formal — é estado categórico (feita/parcial/não
  feita) + narrativa livre do resultado.
- **O que o agente extrai:** menção à tarefa combinada anterior (se citada),
  status de adesão categorizado a partir do relato literal ("não consegui
  fazer", "fiz só duas vezes", "fiz todo dia"), resultado/obstáculo relatado.
  Nunca infere adesão não descrita — se o diário não menciona a tarefa da
  sessão anterior, não há extração (mesmo princípio de R1, fidelidade ao
  texto).
- **Licenciamento:** não aplicável — não é instrumento comercial, é prática
  clínica genérica.

### 2.4 Componente extra vs. eixo de avaliação — decisão de modelagem

Seguindo o precedente já resolvido em `protocolos-e-agente.md` (Parte 2.1:
PEDI ganhou `eixos_avaliacao`; VB-MAPP Barreiras usa `componente_extra` tipo
`registro_abc`):

- **Registro de Pensamentos → NOVO TIPO DE EXTRAÇÃO no nível do
  `output-schema.json`, análogo a `registro_abc`, não um "domínio".** É
  estrutura de evento (como `registro_abc`), não avaliação de marco/rubrica.
  Modelar como domínio faria o mesmo erro que o desenho original das
  Barreiras do VB-MAPP quase cometeu (achado 1.1 do catálogo TEA) — forçar
  uma estrutura de evento heterogênea dentro do molde "evidência por
  domínio". Proposta: novo `tipo` no enum de `extracoes[].tipo`:
  `"registro_pensamento"`, com objeto próprio `registro_pensamento` (ver
  Seção 3).
- **PHQ-9/GAD-7 → `protocolos_ativos[]` com `tipo_coleta` NOVO:
  `"escala_padronizada_intervalar"`** (distinto de `"evidencia_por_dominio"`
  e de `"registro_abc"` — nem marco observado por sessão, nem evento
  narrativo; é resultado de instrumento formal aplicado em intervalo,
  pontuado pelo paciente). O agente NUNCA soma o escore — só registra que o
  RESULTADO FOI RELATADO pelo terapeuta/paciente no diário (mesmo padrão já
  recomendado para o DCDQ no catálogo TEA, achado 1.9: "quando os pais
  devolvem o DCDQ preenchido... o RESULTADO RELATADO pelo terapeuta, nunca
  calculado pelo agente, pode ser citado como evidência").
- **Tarefa de casa → `componente_extra` tipo `tarefa_casa`**, estrutura mais
  simples que `registro_abc` (categórico + narrativa), anexado ao protocolo
  guarda-chuva `tcc`.

### 2.5 Formato canônico `protocolos_ativos[]` proposto para TCC (concreto)

```json
{
  "protocolos_ativos": [
    {
      "protocol_id": "tcc",
      "nome": "Terapia Cognitivo-Comportamental — Registro de Pensamentos",
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
          "definicao_funcional": "pensamentos automáticos disparados por avaliação de desempenho profissional",
          "sinais_no_texto": ["reunião", "avaliação", "chefe", "vou ser demitido"]
        }
      ],
      "componentes_extras": [
        {
          "id": "tarefa_casa",
          "tipo_coleta": "tarefa_casa_estado"
        }
      ]
    },
    {
      "protocol_id": "phq9",
      "nome": "PHQ-9",
      "tipo_coleta": "escala_padronizada_intervalar",
      "escala_formal": {
        "n_itens": 9,
        "valores_por_item": [0, 1, 2, 3],
        "total_max": 27,
        "periodicidade": "a_cada_2_a_4_semanas",
        "quem_pontua": "paciente_autorrelato"
      },
      "item_risco": {
        "existe": true,
        "descricao": "item 9 pergunta sobre pensamentos de morte/autolesão — sempre dispara Regra de Alerta de Risco (Seção 4), independente de escore total"
      }
    },
    {
      "protocol_id": "gad7",
      "nome": "GAD-7",
      "tipo_coleta": "escala_padronizada_intervalar",
      "escala_formal": {
        "n_itens": 7,
        "valores_por_item": [0, 1, 2, 3],
        "total_max": 21,
        "periodicidade": "a_cada_2_a_4_semanas",
        "quem_pontua": "paciente_autorrelato"
      },
      "item_risco": { "existe": false }
    }
  ]
}
```

Extensão proposta ao `output-schema.json` (documentação apenas — implementação
de schema é Fase 3, fora do escopo desta issue):

```json
{
  "tipo": { "enum": ["evidencia", "registro_abc", "ausencia_comportamento", "cadeia", "preferencia_reforcador", "registro_pensamento", "aplicacao_escala_relatada", "tarefa_casa"] },
  "registro_pensamento": {
    "type": ["object", "null"],
    "properties": {
      "situacao": { "type": "string" },
      "pensamento_automatico": { "type": "string" },
      "emocao": {
        "type": "object",
        "properties": {
          "nome": { "type": "string" },
          "intensidade": { "type": ["number", "null"] },
          "escala_intensidade": { "enum": ["0-10", "0-100", "nao_informada"] }
        }
      },
      "distorcoes_cognitivas": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Enum vem de taxonomia_distorcoes do contrato (R19-equivalente); pode haver mais de uma por pensamento; vazio se nenhuma distorção clara identificável no texto (R1 — não inventar)."
      },
      "resposta_racional": { "type": ["string", "null"] },
      "comportamento_resultante": { "type": ["string", "null"] }
    }
  },
  "aplicacao_escala_relatada": {
    "type": ["object", "null"],
    "properties": {
      "protocol_id": { "type": "string" },
      "escore_relatado": { "type": ["number", "null"] },
      "fonte_do_escore": { "enum": ["paciente_informou", "terapeuta_calculou_na_sessao", "nao_informado"] },
      "item_risco_positivo": { "type": ["boolean", "null"] }
    }
  },
  "tarefa_casa": {
    "type": ["object", "null"],
    "properties": {
      "descricao_tarefa": { "type": "string" },
      "adesao": { "enum": ["feita", "parcial", "nao_feita", "nao_informada"] },
      "resultado_relatado": { "type": ["string", "null"] },
      "obstaculo_relatado": { "type": ["string", "null"] }
    }
  }
}
```

---

## 3. Regras do agente para TCC — como R1-R19 se aplicam

O agente permanece agnóstico (R19) — nenhuma regra abaixo é código novo, são
as regras já existentes de `protocolos-e-agente.md` Parte 3 reinterpretadas
para o contexto de autorrelato verbal adulto:

- **R1 (fidelidade ao texto)** aplica-se com força redobrada à distorção
  cognitiva: se o terapeuta não descreveu o pensamento com clareza suficiente
  para reconhecer um padrão de viés, o agente NÃO classifica distorção — texto
  vago ("ele estava desanimado") não vira "raciocínio emocional".
- **R2 (proveniência)** — toda extração de `registro_pensamento` cita o
  trecho literal do pensamento automático relatado, não uma paráfrase do
  agente.
- **R3 (evidência, nunca pontuação) — aplica-se de forma direta e crítica
  aqui:** o agente NUNCA soma o escore do PHQ-9/GAD-9 nem infere um escore a
  partir da narrativa ("parece bem deprimido" não vira "PHQ-9 ≈ 18"). Quem
  pontua é sempre o paciente respondendo ao instrumento formal (ou o
  terapeuta somando as respostas do paciente) — o agente só registra
  `escore_relatado` QUANDO o terapeuta explicitamente escreveu o número no
  diário ("aplicamos o PHQ-9 hoje, escore 14"). Sem número explícito, sem
  extração de escore — mesmo padrão de R11 (números só literais).
- **R4 (função antes da forma) → equivalente-TCC: distorção antes da
  emoção.** A mesma emoção relatada (ansiedade) pode vir de distorções
  diferentes (catastrofização vs. leitura mental) — o agente classifica pela
  ESTRUTURA do pensamento relatado, não pela emoção nomeada. Se a estrutura
  do pensamento não permitir decidir entre duas distorções, registrar as
  duas com confiança média, ou nenhuma com confiança baixa — nunca escolher
  por palpite (mesmo espírito de "funcao_indefinida").
- **R5 (nível de ajuda sempre)** não se aplica no sentido literal ABA (TCC
  adulto não tem "dica ecoica"), mas tem equivalente: registrar se a resposta
  racional foi gerada PELO PACIENTE de forma independente ou COM apoio ativo
  do terapeuta (technique: questionamento socrático, role-play, exame de
  evidências) — proposta de campo `origem_resposta_racional`: enum
  `paciente_independente` | `com_apoio_terapeuta` | `nao_informado`. **Marcar
  como proposta não fechada** (não incluída no schema draft acima por não ter
  sido validada com o Rômulo).
- **R6 (evidência negativa vale)** — ausência de mudança de pensamento após
  intervenção, ou reafirmação da crença disfuncional apesar do
  questionamento, é extração válida com `polaridade: negativa`.
- **R7-R9 (comunicação/múltiplos alvos)** aplicam-se se o produto mapear
  pensamentos a metas de tratamento (ex.: meta "reduzir catastrofização em
  contexto de trabalho") — análogo direto a `alvos[]` do schema atual.
- **R10 (registros ABC)** — TCC pode ter episódios comportamentais
  (crise de pânico, autolesão leve, ritual compulsivo) que também cabem em
  `registro_abc` já existente — **não é preciso schema novo aqui**, o
  `registro_abc` genérico já serve (categoria poderia ganhar valor
  `"psicologico"` além de `comportamental`/`sensorial`, a confirmar se vale a
  pena estender o enum ou se cabe em `comportamental`).
- **R11 (números só literais)** aplica-se com força total à intensidade
  emocional (0-100 ou 0-10) e ao escore de PHQ-9/GAD-7: só registrar se o
  paciente/terapeuta informou o número, nunca estimar por adjetivo ("muito
  ansioso" não vira "80/100").
- **R13 (ambiente)** menos relevante em TCC adulto (a maior parte é relatada
  em sessão de consultório) — mas pode aplicar-se à tarefa de casa (ambiente
  onde a tarefa foi tentada: casa, trabalho, transporte).
- **R14 (inconsistência com histórico)** aplica-se ao acompanhamento de
  escore de PHQ-9/GAD-7 ao longo do tempo (piora inesperada de escore) e à
  reincidência de uma distorção já supostamente trabalhada — mesma lógica de
  regressão do Caso 9/Caso 7 do catálogo TEA.
- **R15-R16 (transcrição/produção)** aplicam-se igual (sessões de TCC também
  podem vir de transcrição de áudio).
- **R17 (preferências/reforçadores)** não tem equivalente direto relevante em
  TCC adulto — não forçar o campo.
- **R18 (severidade de incidente) → torna-se a base direta da Regra de Alerta
  de Risco (Seção 4)**, generalizada e reforçada.
- **R19 (agnosticismo)** é o motivo pelo qual nada disso exige mudança de
  código — só um objeto novo em `protocolos_ativos[]` e, no máximo, extensão
  do enum `tipo` do output-schema (documentada, não implementada nesta
  issue).

---

## 4. Regra de alerta de risco (ideação suicida/autolesão) — TRANSVERSAL

**Esta é a regra de maior prioridade clínica desta especificação.** TCC adulto
frequentemente trata quadros com risco de vida real (depressão maior,
transtornos de humor, TEPT) — risco categoricamente mais alto e mais imediato
do que qualquer coisa no catálogo TEA infantil atual (onde o pior caso
mapeado, R18, é autolesão/agressão física em criança, já tratado como
"grave"). A diferença central de design exigida:

- **Não pode depender de domínio, protocolo ativo, ou de o paciente estar
  respondendo ao item 9 do PHQ-9.** Um paciente pode mencionar ideação
  suicida em qualquer trecho do diário de qualquer sessão, com ou sem TCC
  formalmente ativa, com ou sem PHQ-9 em `protocolos_ativos`. A regra precisa
  ser uma camada do agente **independente do contexto de protocolo** — mais
  parecida com uma checagem de segurança de sistema do que com uma regra de
  extração clínica.
- **Proposta concreta (equivalente a uma nova regra "R20", proposta pendente
  de confirmação — NÃO implementada, este documento só especifica):**
  1. Qualquer menção no texto (relatada pelo terapeuta ou citação direta do
     paciente) a ideação suicida, plano, intenção, autolesão passada/atual,
     ou desejo de morrer/"estar melhor morto" — inclusive respostas ao item 9
     do PHQ-9 — gera **sempre** uma `sinalizacao` de novo tipo
     `"risco_seguranca"` (extensão do enum `sinalizacoes[].tipo`), com
     `severidade` obrigatória (`ideacao_passiva` | `ideacao_ativa_sem_plano` |
     `ideacao_ativa_com_plano` | `autolesao_recente` | `tentativa_relatada`).
  2. **Notificação obrigatória e imediata** — não fica na fila de validação
     por exceção do coordenador (V1 de `validacao-coordenador.md`), que é
     desenhada para amostragem/qualidade, não para emergência. Precisa de rota
     de escalonamento própria (equivalente do R18 "dispara notificação
     obrigatória ao coordenador", mas com prioridade/SLA mais alto — proposta,
     não fechada: notificação IMEDIATA e SEM aprovação prévia do terapeuta,
     diferente do fluxo normal em que a extração vira evidência oficial só
     depois que o terapeuta aprova).
  3. **Nunca é o agente quem decide o nível de risco clínico real** — ele
     apenas sinaliza com a máxima sensibilidade (falso positivo aceitável,
     falso negativo não — mesmo princípio de R18) e cita o trecho literal; a
     avaliação de risco real (protocolo de crise, contato de emergência,
     encaminhamento) é sempre ato humano imediato do terapeuta/coordenador.
  4. **Compartilhado com Terapia Convencional (issue #98)** — a issue #99 já
     assume isso; esta regra não deveria ser reescrita duas vezes para os
     dois nichos. Recomendação: esta regra vive como comportamento GLOBAL do
     agente (nível "Parte 3" do documento principal, não amarrada a um
     protocolo específico), não como regra específica de TCC — só está
     detalhada aqui porque TCC é o nicho que primeiro torna essa lacuna
     visível e urgente.
- **Desenho operacional fechado em documento próprio:** canal, SLA,
  escalonamento, schema e copy foram especificados em
  `docs/agente/regra-alerta-risco.md` (issue #101) — fila dedicada
  (`alerta_risco_clinico`, não extensão da tabela `alerta` de
  `/supervisao`), notificação síncrona a terapeuta responsável E
  coordenador, SLA por severidade (15min a 4h) com escalonamento em 2
  estágios. **Duty to warn permanece explicitamente não decidido** —
  documento levanta as perguntas para validação profissional (CFP/jurídico),
  não responde. Nenhuma implementação real deveria avançar antes dessa
  validação.

---

## 5. Personas de teste

Ver `docs/agente/casos-de-teste-tcc.md` — 5 casos no formato exato de
`casos-de-teste.md`.

---

## 6. Achados da autovalidação (papel de especialista clínico, rigoroso, não complacente)

Seguindo o mesmo padrão do "10/10 protocolos passaram por agente-especialista
clínico dedicado" do catálogo TEA — esta seção é a autocrítica exigida antes
de considerar a especificação pronta. **Veredito: APROVADO COM RESSALVAS**,
com riscos reais que não deveriam ser escondidos:

1. **Nenhum número desta especificação foi confirmado contra fonte primária
   nesta sessão** (sem acesso a phqscreeners.com, ao manual de Judith Beck,
   ou ao artigo original de Burns). Diferente do catálogo TEA, que passou por
   3 rodadas de validação contra fontes reais antes de ser considerado
   confiável, este documento é uma 1ª rodada baseada em conhecimento
   consolidado da literatura clínica geral — **risco real de erro de detalhe
   (ex.: ponto de corte exato, autor exato de uma variação do RPD) que só uma
   pesquisa dedicada, análoga à já feita para os 10 protocolos TEA, resolveria
   com confiança**. Não travar nenhum destes números em UI/produto sem essa
   pesquisa.

2. **A lista de distorções cognitivas não tem uma fonte "canônica" única —
   isso é um risco de produto, não só de documentação.** Diferentes manuais
   (Beck, Burns, terceiros) usam listas de 8 a 15 itens com nomes e fronteiras
   ligeiramente diferentes (ex.: "adivinhação do futuro" às vezes é subtipo de
   catastrofização, às vezes categoria própria). Se o produto tratar a lista
   deste documento como fixa/hardcoded no agente, isso viola o mesmo
   princípio de R19 que já levou a decisão explícita de manter
   `taxonomia_ajuda` como campo do contrato, não constante — a
   `taxonomia_distorcoes` **precisa** ser campo do contrato por clínica
   (já modelado assim na Seção 2.5), não uma lista fixa do agente. Isso está
   correto no desenho acima, mas é um risco fácil de reintroduzir se alguém
   implementar sem reler esta ressalva.

3. **A Regra de Alerta de Risco (Seção 4) é o achado mais grave desta
   validação, e ainda está sob-especificada para ir a produção.** Diferente
   dos achados do catálogo TEA (que são lacunas de cobertura de domínio, sem
   risco de vida), aqui a lacuna é sobre uma decisão de segurança real. Este
   documento propõe a REGRA (sinalizar sempre, transversal, notificação
   imediata) mas deliberadamente NÃO fecha o desenho operacional (canal, SLA,
   interação com duty-to-warn, interação com o fluxo de aprovação do
   terapeuta) — fechá-lo exige input jurídico e clínico que este documento
   sozinho não pode fornecer. Tratar esta seção como "requisito confirmado
   que precisa de especificação operacional própria antes de qualquer
   implementação", não como pronta para virar código.

4. **Escalas intervalares (PHQ-9/GAD-7) introduzem uma dimensão temporal que
   o modelo atual de "sessão → extração" não cobre bem.** O catálogo TEA já
   tem um precedente parcial (reavaliação formal VB-MAPP, série 1º-4º teste),
   mas aqui a aplicação don't acontece toda sessão — o sistema precisa de uma
   forma de "lembrar" quando a última aplicação ocorreu e sinalizar quando é
   hora de reaplicar (ex.: "há 5 semanas sem PHQ-9, sugerir reaplicação") —
   isso não está desenhado neste documento (é decisão de produto/UX, não
   de contrato do agente) e deveria virar item de `BACKLOG.md` se a issue #99
   avançar para implementação.

5. **Menor, mas real:** a Seção 3 propõe um campo novo
   (`origem_resposta_racional`) e uma extensão de enum de `registro_abc`
   (categoria `"psicologico"`) como sugestões não fechadas — marcadas como
   tal no texto, mas registrando aqui de novo para reforçar: nenhuma delas
   deveria ser tratada como decisão travada sem confirmação do Rômulo, seguindo
   a regra do projeto de nunca apresentar proposta como decisão validada.

Nenhum destes achados invalida a arquitetura geral (evidência-nunca-pontuação
continua correta e aplicável a TCC; `protocolos_ativos[]` genérico continua
suficiente com a extensão de `tipo_coleta` proposta) — mas, ao contrário do
catálogo TEA, o achado #3 acima (regra de risco) é bloqueador de qualquer
implementação real, não apenas nota de cobertura.

---

## 7. Achados de validação (manuais + fonte primária + entrevistas simuladas)

Rodada de validação adicional a pedido do Rômulo, complementar à
autovalidação da Seção 6. Diferente da Seção 6 (autocrítica sem consulta
externa), esta seção (a) checa os números do documento contra o que é
conhecimento amplamente documentado e público sobre PHQ-9/GAD-7 — sem acesso
real a phqscreeners.com ou a um manual oficial nesta sessão, então "confirmado"
abaixo significa "confiança razoável por serem instrumentos públicos
extremamente citados na literatura", não "verificado contra o texto-fonte
primário linha a linha"; (b) confronta a estrutura de dados proposta com o
formato real de prontuário TCC de consultório; (c) simula entrevistas com duas
personas.

### 7.1 Verificação contra fonte primária (conhecimento consolidado, não leitura direta do texto oficial)

**PHQ-9 — pode ser confirmado com confiança razoável, com uma ressalva:**

- Estrutura: 9 itens, cada um mapeando um dos 9 critérios do DSM para episódio
  depressivo maior; escala por item 0-3; janela de referência "últimas 2
  semanas"; total 0-27. **Isso está correto e é conhecimento amplamente
  documentado** (Kroenke, Spitzer & Williams, 2001, *J Gen Intern Med*) — pode
  ter o marcador "PRECISA CONFIRMAÇÃO COM FONTE PRIMÁRIA" removido quanto à
  ESTRUTURA (n. de itens, escala, total).
- Item 9 = ideação suicida/autolesão: correto, é conhecimento consolidado e já
  citado corretamente no Caso T5 e na Seção 4. Pode remover o marcador quanto
  a esse fato específico.
- Pontos de corte (0-4/5-9/10-14/15-19/20-27): **também é a faixa amplamente
  citada e replicada na literatura clínica e em guidelines de triagem**, com
  confiança razoável para remover o marcador quanto aos LIMIARES em si.
- **O que continua exigindo confirmação real, e não deve ser destravado sem
  ela:** (1) o texto exato da política de licenciamento público/gratuito da
  Pfizer — o doc já isola essa ressalva corretamente, mantém-se; (2) se existe
  e qual é a validação formal para uso clínico em português/Brasil (adaptação
  transcultural, ponto de corte eventualmente diferente em amostra
  brasileira) — isso é uma pergunta de fonte primária brasileira específica
  que este documento não pode responder por conhecimento geral; (3) o texto
  literal exato de cada um dos 9 itens em português (para não hardcodar
  tradução não oficial em UI/relatório).

**GAD-7 — mesmo padrão do PHQ-9:**

- Estrutura (7 itens, 0-3 por item, últimas 2 semanas, total 0-21) e pontos de
  corte (0-4/5-9/10-14/15-21) **podem ser confirmados com a mesma confiança
  razoável** (Spitzer et al., 2006, *Arch Intern Med*) — remover o marcador
  quanto a esses números.
- Ausência de item de risco equivalente ao item 9 do PHQ-9: correto, GAD-7 não
  tem item de ideação — a Seção 4 já modela isso certo (regra de risco não
  pode depender de nenhuma escala específica).
- Mesmas ressalvas do PHQ-9 continuam pendentes: licenciamento formal exato,
  validação/adaptação em português do Brasil, texto literal dos 7 itens.

**Registro de Pensamentos / taxonomia de distorções — o doc já está certo em
não fechar isso, confirmado nesta rodada:**

- Não existe fonte única canônica. Beck (formulário clássico, ~5 colunas) e
  Burns (*Feeling Good*, 1980, lista de 10 distorções e formulário de coluna
  dupla/tripla) divergem tanto em número de colunas do registro quanto em
  enumeração de distorções — isso é consenso bem documentado na literatura
  sobre TCC, não uma lacuna deste documento. **Confirmado: manter
  `taxonomia_distorcoes` como campo do contrato por clínica, nunca lista fixa
  hardcoded, e manter o formulário como estrutura sem dono de copyright sobre
  o conceito** (só sobre o layout de edições específicas, como já registrado
  na Seção 2.1). Nenhuma mudança recomendada aqui — o doc já modelou
  corretamente a ambiguidade real da fonte.

### 7.2 Estrutura de dados vs. prática real de consultório TCC

Prontuário de TCC em formato de coluna (o "diário de pensamentos" que o
paciente preenche ou o terapeuta registra em sessão) tipicamente segue:
**Situação → Pensamento automático → Emoção (nome + intensidade%) → Distorção
→ Resposta racional/alternativa → Reavaliação da emoção (opcional, pós-
resposta)**. Comparando com `registro_pensamento` proposto na Seção 2.1/2.5:

- **Situação, pensamento automático, emoção+intensidade, distorções, resposta
  racional, comportamento resultante** — cobre bem as colunas centrais usadas
  na prática (situação/pensamento/emoção/resposta são universais em qualquer
  variação do RPD, seja de 5 ou 7 colunas).
- **Gap identificado — reavaliação da emoção pós-resposta racional não está
  no schema proposto.** Formatos de 7 colunas (Burns/Padesky) incluem
  tipicamente uma coluna final de "reavaliar a intensidade da emoção depois de
  formular a resposta racional" (ex.: ansiedade caiu de 90 para 40 depois do
  questionamento socrático) — esse número é o principal indicador de eficácia
  da técnica sessão a sessão, e o schema atual só tem `emocao.intensidade`
  (um valor, pré-resposta) e `resposta_racional` (texto), sem campo para a
  intensidade pós-resposta. **Severidade: importante — gap novo, não coberto
  pelo doc atual.** Proposta (pendente de confirmação com o Rômulo, não
  decisão travada): adicionar `emocao.intensidade_pos_resposta: number | null`
  ao objeto `registro_pensamento`.
- **Formato de coluna vs. objeto único:** o schema modela um evento por
  registro (um pensamento = um objeto), que corresponde a uma LINHA do
  formulário de coluna real — isso está coerente com a prática (cada linha do
  diário do paciente é um evento independente), não é um desalinhamento.

### 7.3 Entrevista simulada — persona "terapeuta TCC"

> **Persona:** psicóloga cognitivo-comportamental, 8 anos de prática, usa
> PHQ-9/GAD-7 rotineiramente com pacientes adultos.

**P: Vocês estão propondo que o sistema registre o escore do PHQ-9 quando eu
digito no diário. Isso vira número solto num dashboard?**
R: Não — a Seção 3/R3 é explícita que o agente só REGISTRA o escore que você
escreveu, nunca interpreta ou classifica clinicamente. Mas essa pergunta expõe
que o doc não define quem, na interface, decide COMO esse número é
apresentado (gráfico de tendência? só texto?) — isso é decisão de UX fora do
escopo deste documento de contrato do agente.

**P: O item 9 sobre pensamento de morte — se meu paciente responde "1 -
vários dias" (não "0"), isso dispara alerta automático mesmo sendo resposta
de rotina de triagem, não uma crise?**
R: Sim, dispara — a Seção 4 é explícita: qualquer resposta positiva ao item 9
gera sinalização, sem julgamento de gravidade pelo agente. **Achado de gap:
o doc não distingue explicitamente "item 9 respondido com 1" (o mais brando,
ideação passiva ocasional) de "item 9 respondido com 3" (quase todos os dias)
no fluxo de severidade da sinalização — a lista de `severidade` em
`sinalizacao.risco_seguranca` (Seção 4) é baseada no CONTEÚDO relatado em
texto livre, mas não amarra explicitamente ao VALOR numérico do item 9
quando ele é a única fonte do sinal.** Severidade: importante — mapear
valor 0-3 do item 9 para uma severidade mínima sugerida (nunca definitiva)
é gap não coberto.

**P: Minha maior preocupação: o PHQ-9 vira "só um número" pro coordenador,
que nunca fala com o paciente? O item 9 é clínico demais pra virar estatística
de dashboard.**
R: Concordo, e a Seção 4 já trata isso com peso — a notificação de risco não
espera a fila de validação do coordenador (item 2 da regra proposta) e o
agente nunca decide o nível de risco real (item 3). Esse ponto já está
coberto.

**P: E se eu aplicar o PHQ-9 mas o paciente pular o item 9 (recusa
responder)? Isso é diferente de responder "0".**
R: **Gap real, não coberto no schema atual.** `item_risco_positivo` é
booleano (Seção 2.5) — não distingue "respondeu 0 = negou" de "não
respondeu/recusou". Clinicamente essas duas situações exigem reação
diferente (recusa de resposta a item de risco é, em si, um sinal de alerta em
muitos protocolos de triagem). Severidade: **importante** — proposta pendente
de confirmação: `item_risco_positivo: boolean | null` (`null` = não
respondido/não informado), nunca default para `false`.

### 7.4 Entrevista simulada — persona "coordenador de clínica"

> **Persona:** coordenadora clínica responsável por padronização entre 6
> terapeutas TCC da mesma clínica.

**P: Cada terapeuta aplica a escala do jeito que quiser? Um usa 0-10 pra
intensidade emocional, outro usa 0-100 — dá pra comparar isso entre
pacientes de terapeutas diferentes?**
R: Não, e o doc já assume isso corretamente — a Seção 2.1 é explícita que a
escala de intensidade emocional (0-10 ou 0-100) é campo do contrato por
clínica, não constante do agente, exatamente para não travar um padrão único
"errado". Mas isso significa que comparação longitudinal ENTRE terapeutas da
mesma clínica só é confiável se a clínica padronizar a escala internamente —
**isso não é decisão do agente, é decisão operacional da clínica, e o doc não
diz isso explicitamente em lugar nenhum.** Severidade: nice-to-have — vale uma
nota explícita de que a comparabilidade entre pacientes depende de a clínica
padronizar a escala, não é garantia do sistema.

**P: Periodicidade do PHQ-9 — "a cada 2 a 4 semanas" é elástico demais.
Como eu sei se um terapeuta está atrasado na reaplicação?**
R: **Gap já identificado no achado #4 da Seção 6** (autovalidação): o sistema
não tem hoje mecanismo de "lembrar quando foi a última aplicação e sinalizar
atraso" — está corretamente registrado como decisão de produto/UX fora do
escopo deste documento, e já recomendado como item de `BACKLOG.md`. Nenhuma
mudança nova necessária aqui, só reforço de que é bloqueante para o caso de
uso da coordenadora se a Fase de implementação avançar sem esse mecanismo.

**P: Se um paciente troca de terapeuta no meio do tratamento, o histórico de
PHQ-9/GAD-7 e do registro de pensamentos segue com ele?**
R: O doc não trata esse caso — `historico_relevante` (usado no Caso T3)
assume implicitamente continuidade, mas não há regra escrita sobre
portabilidade de histórico entre terapeutas dentro da mesma clínica.
Severidade: **nice-to-have** — é um caso de borda de produto (troca de
terapeuta), não um gap central do protocolo clínico; registrar como nota
para BACKLOG.md se o produto for multi-terapeuta por paciente.

**P: Preciso garantir que toda clínica que usa TCC tenha pelo menos uma
escala padronizada ativa, ou isso fica 100% opcional?**
R: O doc modela PHQ-9/GAD-7 como protocolos independentes em
`protocolos_ativos[]`, sem exigir nenhum como obrigatório — Caso T5 inclusive
mostra `protocolos_ativos: []` e a Regra de Alerta de Risco disparando mesmo
assim (o que é correto e intencional, a regra de risco é transversal). Isso
está certo pelo desenho atual: obrigatoriedade de escala padronizada é
decisão de produto/clínica, não do contrato do agente — nenhuma mudança
necessária.

### 7.5 Consolidação dos achados

| # | Achado | Severidade | Status |
|---|--------|------------|--------|
| 1 | Estrutura e pontos de corte de PHQ-9/GAD-7 (n. itens, escala 0-3, total, faixas de corte) | — | **Confirmado nesta rodada** — marcador "PRECISA CONFIRMAÇÃO" pode ser removido quanto a esses números específicos |
| 2 | Licenciamento exato (texto oficial), validação/adaptação em português do Brasil, texto literal dos itens em PT-BR | Importante | Segue pendente — precisa fonte primária real (não coberto por conhecimento geral) |
| 3 | Taxonomia de distorções cognitivas sem fonte única canônica | — | **Confirmado nesta rodada** que o doc já modela isso corretamente (campo do contrato, não lista fixa) — nenhuma mudança necessária |
| 4 | Falta campo de reavaliação de emoção pós-resposta racional em `registro_pensamento` | Importante | Gap novo — proposta pendente de confirmação com o Rômulo |
| 5 | `item_risco_positivo` booleano não distingue "negou" de "recusou/não respondeu" | Importante | Gap novo — proposta pendente de confirmação com o Rômulo |
| 6 | Severidade de sinalização de risco não amarrada ao valor numérico 0-3 do item 9 quando é a única fonte do sinal | Importante | Gap novo, complementar à Seção 4 — não bloqueia a regra em si, mas deixa a classificação de severidade menos precisa |
| 7 | Falta mecanismo de lembrete/atraso de reaplicação de escala intervalar | Bloqueante para uso em produção pela coordenação (não bloqueante para a especificação do agente) | Já identificado no achado #4 da Seção 6 — reforçado aqui, recomendado para `BACKLOG.md` |
| 8 | Comparabilidade entre terapeutas depende de padronização de escala pela clínica, não está dita explicitamente | Nice-to-have | Gap novo, documentação apenas |
| 9 | Portabilidade de histórico clínico entre terapeutas na troca de caso | Nice-to-have | Gap novo, caso de borda de produto |

**Conclusão desta rodada:** nenhum achado invalida a arquitetura proposta.
PHQ-9/GAD-7 tiveram sua estrutura numérica central confirmada com confiança
razoável (conhecimento público amplamente documentado); o que segue
genuinamente pendente é licenciamento formal e adaptação/validação em
português do Brasil, que exigem fonte primária real, não conhecimento geral.
O achado mais acionável para a Fase 3 é o #4 (campo de reavaliação
pós-resposta) e o #5 (distinguir recusa de negação no item de risco) — ambos
pequenos no schema, mas com peso clínico real. Nenhum destes achados muda o
veredito "APROVADO COM RESSALVAS" da Seção 6, nem a prioridade máxima já
dada à Regra de Alerta de Risco (achado #3 da Seção 6) como bloqueador
central antes de qualquer implementação.
