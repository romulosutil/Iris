# Bake-off do agente de extração — Claude Sonnet 5 vs. Gemini

Harness para o item de maior prioridade do `BACKLOG.md`, seção B: rodar o
golden example + os 17 casos de teste (`docs/agente/casos-de-teste.md` —
Casos 2-9 do desenho original + Casos 10-17, um por instrumento sem cobertura
prévia, adicionados na 2ª rodada de validação) contra modelos candidatos e
medir **% de extrações aprovadas sem edição** — a
métrica que autoriza escalar o GTM (`docs/produto/modelo-de-negocio.md`, §6-7:
meta ≥70%, junto com ≥80% de adesão ao diário na semana 4+).

Isso **não é um teste automatizado de string-diff**. A aprovação "sem edição"
é julgamento clínico (o terapeuta leu a extração e não mudou nada). O que este
harness automatiza é a parte mecânica — chamar os modelos, garantir saída no
schema certo, e montar o material lado a lado para a revisão humana ser rápida.

## Setup

```bash
cd scripts/bakeoff
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...
export GOOGLE_API_KEY=...
```

Antes de rodar de verdade, abra `run_bakeoff.py` e confirme os `model=` em
`MODELOS` contra a documentação atual de cada provedor — não travamos um ID
aqui de propósito, porque nomes de modelo mudam com frequência e um ID errado
cai silenciosamente em erro 404, não em resultado ruim.

## Passo a passo

1. **Gerar/atualizar o eval set** a partir das fontes reais (nunca editar
   `eval_set.json` à mão — ele é gerado):

   ```bash
   python3 parse_cases.py --repo /caminho/para/iris
   ```

   Isso lê `docs/agente/casos-de-teste.md` (Casos 2-9), o golden example
   (`docs/prompts/serie-de-prompts.md` + `docs/agente/golden-example-output.json`)
   e o contexto default (`docs/agente/contexto-exemplo.json`), e escreve
   `eval_set.json` com os 10 casos (golden + 9). Se um caso mudar no
   markdown, rode este passo de novo antes do bake-off.

2. **Teste seco (sem gastar API)** — confirma que o harness não quebra antes
   de rodar de verdade:

   ```bash
   python3 run_bakeoff.py --repo /caminho/para/iris --out results_dryrun --dry-run
   ```

3. **Rodar de verdade** (depois de confirmar os IDs de modelo):

   ```bash
   python3 run_bakeoff.py --repo /caminho/para/iris --out results
   ```

   Gera:
   - `results/<provider>__<label>/<case_id>.json` — resposta bruta de cada modelo
   - `results/report.md` — esperado vs. real, lado a lado, para leitura humana
   - `results/scoring_template.csv` — planilha vazia para preencher

4. **Revisão humana** (terapeuta/coordenador, ou você mesmo vestindo esse
   chapéu no piloto): abra `results/report.md`, compare bloco a bloco, e
   preencha `results/scoring_template.csv` na coluna `aprovado_sem_edicao`
   (`TRUE`/`FALSE`) e `notas` (o que precisou de edição, se algo precisou).

5. **Apurar o resultado:**

   ```bash
   python3 tally.py --scoring results/scoring_template.csv
   ```

   Mostra % de aprovação sem edição por modelo contra a meta de 70%.

## Por que o Caso 9 importa aqui

Os Casos 1-8 usam só VB-MAPP. O Caso 9 (multiprotocolo VB-MAPP+PEDI) é o único
que testa se o modelo usa a `taxonomia_ajuda` que VEM DO CONTEXTO (regra R19,
AGNOSTICISMO) em vez de aplicar a escala ABA (`dica_verbal`, `dica_fisica`...)
por hábito/prior de treino. Um modelo que "decora" a escala ABA e a aplica fora
de contexto passaria despercebido nos Casos 1-8 e falharia silenciosamente em
produção assim que a 2ª clínica cadastrasse um protocolo de Fono/TO — por isso
ele entrou no eval set antes do bake-off valer a pena rodar (ver nota no
próprio Caso 9 em `casos-de-teste.md` e a correção da seção 2.5 de
`modelo-de-dados.md`, ambas de 09/07/2026).

## Notas de engenharia

- `run_bakeoff.py` força saída estruturada: `tool_choice` no Claude (via
  `output-schema.json` como `input_schema` da tool), `response_schema` no
  Gemini (com um pequeno conversor `to_gemini_schema` porque o Gemini não
  aceita union types `["string","null"]` do JSON Schema — vira
  `{"type":"string","nullable":true}`).
- Validação de schema (`jsonschema`) roda em toda resposta antes da revisão
  humana — pega erro estrutural na hora, sem gastar tempo de revisão clínica
  com JSON malformado.
- Caso 7 (regressão) tem um patch manual de `historico_relevante` em
  `run_bakeoff.py` (`apply_manual_context_patches`) porque esse caso descreve
  o histórico em prosa no markdown, não em bloco `json` — sem ele, R14 não
  tem como disparar.
