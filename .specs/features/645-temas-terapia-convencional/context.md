# #645 — Áreas cinzentas do Design, FECHADAS

> Os 7 pontos que a issue #645 manda fechar ANTES da label `jules` (`AGENTS.md` §5.2).
> Decididas por Claude Code em 08/09/2026 sobre `main@379bf316`, **como proposta pendente de ratificação do Rômulo** (`CLAUDE.md` — "Decisão nova de arquitetura ou produto: marcar como proposta pendente de validação").
> Toda citação `arquivo:linha` foi medida nesta data.

---

## G-1 · Grão e tabela

**Decisão: tabela própria `session_tema`, uma linha por `(session_id, tema_chave)`.**

Não é coluna JSONB em `session_note` nem em `extraction`:

- `extraction` é por DRAFT (uma linha por item de `extracoes[]`), e `temas[]` é do
  RUN inteiro (`agent-output-schema.ts:320`, campo irmão de `extracoes`, não filho).
  Guardar em `extraction` duplicaria o array em N linhas sem dono definido.
- `session_note` é o texto que o HUMANO escreveu. Tema é derivado por IA sobre esse
  texto — misturar as duas coisas numa linha só apaga a distinção
  "o que a pessoa escreveu" vs. "o que o modelo leu ali", que é o eixo de auditoria
  da Camada 1.
- A projeção `historico_relevante` precisa cruzar N sessões por paciente e contar
  recorrência (G-4). Isso é `GROUP BY tema_chave` — consulta de linha, não de jsonb.

Colunas: `id`, `clinic_id`, `session_id`, `patient_id`, `tema` (texto cru como o
agente escreveu), `tema_chave` (normalização determinística, G-3), `estado`
(`sugerido` | `aprovado`), `criado_em`, `revisado_em`.

`clinic_id` NOT NULL + `ENABLE`/`FORCE ROW LEVEL SECURITY` + 4 policies com
`app_clinic_id_exigido()` (D16/#229), predicado copiado literal de
`instrumento_aplicacao` (`0113:45-72`) — coordenador OU membro da equipe;
DELETE só coordenador. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO app_role`
(não há `SECURITY DEFINER` no caminho de escrita).

## G-2 · Ponto de escrita

**Decisão: dois tempos — `sugerido` na extração, `aprovado` na aprovação.**

1. **Consolidação** (`src/lib/sessao/diario-consolidacao.ts`, Fase C): grava os
   `temas[]` da rodada como `estado = 'sugerido'`. Mesma disciplina das extrações:
   apaga só as linhas `sugerido` da sessão antes de regravar — linha já
   `aprovado` NUNCA é tocada por reextração.
2. **Aprovação** (`src/app/(app)/revisao/[sessionId]/logic.ts`, dentro de
   `aprovarExtracao` / `editarExtracao`): promove `sugerido → aprovado` para a
   sessão inteira, num `UPDATE ... WHERE session_id = $1 AND estado = 'sugerido'`.

O registro oficial nasce na aprovação — a regra do `evidence`. E é a régua que a
própria Definição de Pronto da issue fixa ("reaprovar a mesma extração não
duplica"): a promoção é UPDATE, não INSERT, e a unicidade
`(session_id, tema_chave)` fecha a porta de qualquer jeito.

**Consequência aceita e documentada:** sessão convencional que não teve NENHUMA
extração aprovada não contribui tema para o histórico. É o mesmo contrato do
`evidence` (sugestão não é registro), não um bug. Só a leitura de `aprovado`
alimenta `historico_relevante`.

## G-3 · Identidade do tema

**Decisão: normalização determinística em código puro (`normalizarTema`), sem IA e
sem curadoria manual nesta fase.**

`tema_chave` = minúsculas → sem acento (NFD + strip de diacrítico) → só letras,
dígitos e espaço → remoção de conectivos fechados (`de do da das dos e em no na
nos nas com pelo pela por o a os as um uma ao aos à às`) → tokens ordenados
alfabeticamente e unidos por espaço.

`"luto do pai"` e `"luto pelo pai"` → ambos `"luto pai"`. É exatamente o exemplo
que a issue usa. A ordenação dos tokens também casa `"pai, luto"`.

Regra fechada e testável, sem custo de token e sem depender de julgamento do
modelo. Curadoria pelo terapeuta fica registrada como evolução possível se a
chave se mostrar grosseira demais em uso real — não entra aqui.

`tema` (o texto cru) é preservado ao lado da chave: a UI e o resumo mostram como o
terapeuta lê, a chave só agrupa.

## G-4 · Régua do resumo

**Decisão: janela de 5 sessões, recorrência a partir de 3.**

É a régua que `docs/agente/protocolo-terapia-convencional.md` já pratica
("presente nas últimas 5 sessões; sinalizado como recorrente em 3 delas"),
transposta literal:

- Janela `N = 5`: as 5 sessões mais recentes do paciente **que têm ao menos um
  tema aprovado**, por `numero_sequencial_paciente` desc. Sessão sem tema não
  consome janela — senão 5 sessões de ABA no meio zerariam o histórico de um
  paciente convencional.
- "Sinalizado" = o tema aparece naquela sessão (uma linha `aprovado` com aquela
  `tema_chave`). Não há grau nem peso: o contrato do agente é `temas: string[]`
  (`agent-output-schema.ts:320`), sem intensidade. Inventar peso seria afirmar
  dado que ninguém coletou.
- `recorrente` = presente em **≥ 3** das sessões da janela.

Resumo produzido (determinístico, sem IA — mesmo espírito do G4 da Fase 4):
`"presente em 4 das últimas 5 sessões com tema registrado; última em 05/09/2026."`
mais o sufixo `" Recorrente."` quando ≥ 3.

Ordenação de saída: recorrência desc, depois `tema_chave` asc — estável, para que
duas execuções iguais não produzam prompts diferentes (mesma regra da projeção de
instrumentos, `historico-relevante.ts`).

## G-5 · Edição/correção

**Decisão: não editável depois de aprovado, nesta fase. A correção é a reextração.**

Enquanto o tema está `sugerido`, corrigir a nota consolidada e reconsolidar
substitui as linhas — é o caminho natural e já existe. Depois de `aprovado` a
linha é registro e fica.

Não entra `session_tema_revision` (o par do `evidence_revision`): não há aqui o que
`evidence_revision` protege — nível de ajuda, alvo mapeado, número da sessão. Tema
é rótulo de texto livre derivado de uma nota que o próprio terapeuta escreveu; a
trilha de auditoria útil é o par `(tema cru, nota de origem)`, e as duas pontas já
ficam gravadas.

O enum nasce com `sugerido | aprovado` — sem `descartado`. Acrescentar um terceiro
valor depois é uma linha de migração; nascer com um valor que nada produz é o
"estado derivado inalcançável" que já mordeu este repo.

## G-6 · Tela `/pacientes/[id]/temas`

**Decisão: mostra os dois, com os temas em primeiro.**

A tela ganha uma seção "Temas recorrentes" no topo, lendo `session_tema` com
`estado = 'aprovado'` agrupado por `tema_chave` (contagem + última ocorrência), e
mantém abaixo a lista de notas de sessão que já existe.

A lista de notas não é paliativo de tema — é o texto integral da sessão, útil por
si. O que sai é o **comentário** de `queries.ts:11-27` que a chamava de paliativo.

## G-7 · LGPD

**Decisão: tema é prontuário. Entra no acervo exportado e sai no expurgo.**

- **Acervo** (`src/lib/export/acervo/coletor.ts`): `session_tema` entra na lista de
  tabelas e ganha bloco de coleta próprio. `coletor-colunas.int.test.ts` compara a
  lista contra o `information_schema` — tabela nova fora da lista quebra o CI, que é
  o comportamento desejado.
- **Expurgo** (`app_purgar_paciente_interno`, `0128`): coberto por **FK
  `ON DELETE CASCADE`** em `session_id` e `patient_id`, o mesmo caminho que a
  `0158` (`patient_record_embedding`) escolheu. Não há `CREATE OR REPLACE` da
  função de expurgo — e há teste de integração que mede o cascata de verdade,
  em vez de assumir.
- Base legal e prazo de guarda: os mesmos do prontuário; nada de novo a declarar
  em `docs/legal/`, porque o dado é derivado de `session_note`, que já está
  coberto. Nenhum arquivo de `docs/legal/` é tocado (exige confirmação do Rômulo,
  `CLAUDE.md` § Permissões).
