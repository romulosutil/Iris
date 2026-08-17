# Fase 4 — 4B compute: segmentação & candidatura (design + achado de escopo)

> Status: **design + 1 decisão de escopo aberta.** Precede a implementação do corpo de
> `app_materializar_snapshot`. Não muda modelo/RLS/contrato do agente.

---

## 1. Decisão de local do cálculo (tomada — implementação, não gate)

Segmentação **calcula em TS puro** (funções por `tipo_estrutura`, unit-testáveis sem DB); a função
`app_materializar_snapshot` (SECURITY DEFINER) faz **só o upsert privilegiado** de
`session_snapshot`/candidatura, recebendo o payload já computado. Motivo: a revisão protocolar
mostrou que a correção clínica da segmentação é a lógica de maior risco da fase — precisa de teste
exaustivo, o que dispatch-por-JSONB em plpgsql não dá. Leitura de evidence é RLS-escopada (tx do
tenant); escrita privilegiada (candidatura é `coordenador`-only) fica no definer fino.

## 2. ACHADO DE ESCOPO (precisa de decisão) — o dado de evidência só cobre 1 eixo

O `evidencia` do agente (`agent-output-schema.ts`) captura: `nivel_ajuda` (string, ordinal via
`protocol.taxonomia_ajuda`), `resultado`, `polaridade`, `tentativas`, `frequencia`,
`dimensoes_qualidade.generalizacao`. **Isto é o eixo de nível-de-ajuda / tentativa** — o eixo de
`marco_simples`.

O que o evidence **NÃO** carrega: escore de barreira (VB-MAPP Barreiras), sub-escore composto
(0/0,5/1), idade-equivalente (Denver/faixa_normativa). Esses números vêm de **avaliação formal**
(`MilestoneAssessment`), não de extração sessão-a-sessão — e `MilestoneAssessment` está **deferido
p/ Fase 5** (D4).

**Consequência:** a segmentação por `tipo_estrutura` que a revisão protocolar exigiu **não é
computável a partir de evidence** para `marco_com_barreira`/`escore_composto`/`faixa_normativa` —
o dado-fonte não existe no fluxo de sessão. A leitura correta:

- **Segmentação de evidência (4B)** cobre o **eixo de nível-de-ajuda**, em grão de **goal** (e de
  marco quando `marco_simples` e milestone resolvido). É o que a sessão realmente mede.
- **Trajetória de instrumento formal** (barreira/composto/normativo) é **dirigida por
  `MilestoneAssessment`** — série de avaliações formais — e pertence à **Fase 5**.

Isto **não contradiz** G5b (despacho por tipo): significa que, no grão de evidência, só
`marco_simples`/goal têm métrica; os outros tipos são explicitamente marcados como
"trajetória via avaliação formal (Fase 5)" na UI, em vez de produzir um número enganoso.

### Decisão aberta (escopo de 4B)

- **(1) 4B = segmentação do eixo de ajuda (goal + marco_simples); outros tipos = "aguardando
  avaliação formal (Fase 5)".** Recomendada — honesta com o dado existente; a trajetória de barreira/
  composto/normativo entra com `MilestoneAssessment` na Fase 5. Gráfico nunca mostra número falso.
- **(2) Capturar as métricas formais no evidence agora** (agente/UI passam a registrar escore de
  barreira/composto/idade-equiv. por sessão). Expande contrato do agente + captura — caro, e
  mistura avaliação formal com evidência de sessão (V3 quer a série formal imutável e separada).
- **(3) Antecipar `MilestoneAssessment` para a Fase 4** (revê D4). Aumenta muito o escopo de 4B.

## 3. Algoritmo de segmentação (eixo de ajuda — escopo (1))

Sobre `evidence_current` (classificação viva), em grão de alvo resolvido, por `(goal_id,
protocol_id)`, usando o ordinal de `protocol.taxonomia_ajuda[nivel_ajuda]`:

- **repertorio_state**: por goal/milestone → `{ nivel_ajuda_recente (ordinal), contagem,
is_candidata }`. Só numérico/enum (G6b).
- **EVOLUÇÃO**: 1ª ocorrência positiva OU melhora de ordinal no próprio protocolo vs snapshot(n-1).
- **ESTAGNAÇÃO**: janela W=5 sessões tocando o goal, mesma família, sem evidência nova.
- **REGRESSÃO**: piora sustentada ≥2 sessões no ordinal, mesmo protocolo, OU negativa em habilidade
  antes independente.
- Evidência com `evidence_query` aberta **não** conta (V1e).
- `segmentacao` = `{goal_id: {protocol_id: {tipo_estrutura, metrica: {eixo:'nivel_ajuda',
ordinal_recente, ...}, rotulo}}}`; para tipos não-`marco_simples` sem métrica: `rotulo:
'aguardando_avaliacao_formal'`.

## 4. Candidatura (reativação)

- `milestone_candidacy`: N evidências independentes positivas em M sessões distintas — mas por
  Milestone/família (não default global). Só acende quando `milestone_id` resolveu (single-domain,
  decisão C). PROC/observação: fora da candidatura por acúmulo.
- `goal_candidacy`: últimas N evidências por `session_numero` do goal satisfazem
  `Goal.criterio_dominio` (JSONB), sem interrupção por negativa. Avaliador genérico por tipo de
  critério.
- Escrita só via `app_materializar_snapshot` (definer). Recompute retroativo: de `session_numero`
  afetado em diante; advisory lock por paciente; **nunca** toca `MilestoneAssessment` (Fase 5).

## 5. Testes (DoD)

- Unit por `tipo_estrutura`: `marco_simples` computa; os outros retornam
  `aguardando_avaliacao_formal` (não número). Nenhum cruza ordinais entre protocolos.
- EVOLUÇÃO/ESTAGNAÇÃO/REGRESSÃO com fixtures de evidência.
- Candidatura acende só com milestone resolvido; exclui query aberta.
- Concorrência do recompute (2 coordenadores) via advisory lock.
