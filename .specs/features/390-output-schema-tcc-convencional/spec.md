# Spec — #390 output-schema.json e Zod: variantes TCC/convencional

Migracao ja feita pelo orquestrador: `db/migrations/0108_extraction_subtipo_tcc_convencional.sql` (enum `extraction_subtipo` PG ganhou `registro_pensamento`, `aplicacao_escala_relatada`, `tarefa_casa` — isolada, verificado via `pg_enum`). Enum `pendente` (legado NullProvider) e valores TCC ficam fora do escopo de comparacao doc-vs-Zod (ver R1).

## Decisoes ja fechadas pela pesquisa (nao reabrir)

- **`alerta_risco` unificado**: usar a MESMA forma ja implementada em `agent-output-schema.ts` (`alertaRiscoSchema`: `{categoria, severidade, certeza, trecho_fonte, detalhe}`, `.nullable().optional()`, SEM `.catch()`, ausencia = `null`) pros 3 modos. **NAO criar uma segunda forma.** `protocolo-terapia-convencional.md` §3 tem uma forma antiga (`{presente: boolean, ...}`) que PREDATA #122/R20 e esta desatualizada — e divida documental, nao contrato a seguir. `casos-de-teste-terapia-convencional.md` Caso TC-1 tambem usa a forma antiga na fixture — ao escrever o teste com essa fixture, adapte a expectativa pra forma nova (`presente:false` → `alerta_risco: null`; se fosse `presente:true` → objeto completo com os 5 campos).
- **`tarefa_casa`**: shape MINIMO nesta issue (a issue nao detalha os campos). #394 ("Tarefa de casa: evento com duas pontas no tempo") e quem desenha o modelo completo depois. Aqui: reservar o valor no enum de `tipo` com um objeto minimo plausivel (`descricao: string`, `trecho_fonte: string`), sem se comprometer com mais — comentario no codigo linkando #394.
- **`distorcoes_cognitivas`**: `z.array(z.string()).optional()` — estrutural, permissivo. Validacao contra `taxonomia_distorcoes` da clinica (R19) NAO acontece no parse do Zod (schema nao tem acesso a config por clinica); fica pra camada de validacao downstream (fila de validacao do RPD). Nao hardcodar enum fixo de distorcoes.
- **`item_risco_positivo`**: `z.boolean().nullable()` — SEM `.optional()` como unico modificador (se vier ausente do JSON e for opcional-e-null tudo bem, mas o ponto central e: NUNCA fazer `.default(false)` ou qualquer coercao. Teste explicito: `null` sobrevive ao parse como `null`, nao vira `false`.
- **`temas[]` (convencional)**: campo novo top-level, `z.array(z.string()).optional()`. Antes de adicionar mais campos convencionais (`tema_recorrente_sinalizado`, `padrao_participacao_verbal`), **conferir o que `CONVENTIONAL_SYSTEM_PROMPT` (`src/lib/extraction/prompt.ts`) ja promete na secao "Formato de saida"** — o prompt e o contrato de runtime que ja esta em producao (mesmo que a UI nao alcance ainda); alinhar o Zod com o que o prompt ja promete, nao com o doc desatualizado.
- **`resumo_sessao` + `temas[]` sem `extracoes[]`/`dominio_id`**: nao precisa de discriminated union nova — manter `extracoes` opcional (array vazio pro modo convencional), sem enforcement de tipo a mais. Simplicidade > union nova (YAGNI).

## Requisitos

- R1 Teste que compara os enums do `output-schema.json` (doc) com os enums do Zod (`agent-output-schema.ts`) — `extracoes[].tipo` e `sinalizacoes[].tipo`. Escopo do teste: doc deve ser subconjunto/igual ao que o Zod aceita nesses dois enums (excluir `pendente` do PG, que e legado e nunca esteve no doc nem no Zod — nao e o defeito desta issue).
- R2 `output-schema.json`: `sinalizacoes[].tipo` ganha `risco_seguranca`. Documentar objeto `alerta_risco` (schema completo, forma unificada acima). Registrar a assimetria `alerta_risco` estrito vs `sinalizacoes` com `.catch([])` como comentario/nota no doc.
- R3 `agent-output-schema.ts`: `extracoes[].tipo` ganha `registro_pensamento`, `aplicacao_escala_relatada`, `tarefa_casa` (shape minimo, ver acima). `registro_pensamento` com os campos do `rpd-desenho-de-formulario.md` §6 (mais recente que `protocolo-tcc.md` §2.5, que esta desatualizado): `evidencias_favor`, `evidencias_contra`, `credibilidade_inicial`, `credibilidade_alternativa` (smallint 0-100, nullable), `comportamento_resultante`, `distorcoes_cognitivas` (ver acima). `aplicacao_escala_relatada` com `item_risco_positivo: boolean|null` (ver acima) e `emocao.escala_intensidade` como numero livre (contrato da clinica define a escala, nao o agente).
- R4 `output-schema.json` espelha as 3 formas novas de R3 e o `temas[]`/convencional de forma consistente com o Zod (doc segue o executavel, nao o contrario).
- R5 Teste com fixture real de `casos-de-teste-terapia-convencional.md` (Caso TC-1, adaptando `alerta_risco` pra forma unificada) validando contra o schema Zod.
- R6 Teste `item_risco_positivo: null` sobrevive ao parse sem virar `false`.
- R7 Teste que `risco_seguranca` em `sinalizacoes[].tipo` continua sendo promovido pra `alerta_risco` (`levantarRiscoDeSinalizacoes` ja faz isso — teste de regressao, nao mudanca de logica).
- R8 `pg_enum` de `extraction_subtipo` ja verificado pelo orquestrador (9 valores, incluindo `pendente` legado).

## Fora de escopo

Shape completo de `tarefa_casa` (#394). `familia_abordagem` (#331). Corrigir `protocolo-terapia-convencional.md` §3 e `casos-de-teste-terapia-convencional.md` pra forma nova de `alerta_risco` — **anotar como pendencia** (BACKLOG.md), nao bloquear esta issue nisso (doc de protocolo/caso-de-teste sao artefatos separados do contrato executavel).
