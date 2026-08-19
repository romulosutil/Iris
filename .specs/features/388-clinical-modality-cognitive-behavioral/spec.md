# Spec — #388 clinical_modality ganha 3o valor cognitive_behavioral

Design de referencia: `docs/arquitetura/modalidades-clinicas-e-abordagens.md` §3, §4.2, §7.1 (ja escrito, sessao anterior).

## Requisitos

- R1 `pg_enum clinical_modality` = {conventional, protocol_driven, cognitive_behavioral}. Migration isolada, sem uso do literal na mesma leva. Arquivo `db/migrations/0107_clinical_modality_cognitive_behavioral.sql`, journal `when=1786931303361` (0106 + 1000).
- R2 `src/lib/extraction/context-loader.ts:142-145` — mapeador modalidade→modo vira 3-way (`protocol_driven`, `tcc`, `terapia_convencional`). Tipo `modo` em `context-assembler.ts` ganha literal `"tcc"`.
- R3 `src/lib/extraction/claude-provider.ts:62-66` — ternario vira `switch` exaustivo sobre `modo`, `default` lanca erro (nao cai em ABA).
- R4 `src/lib/extraction/prompt.ts` — novo export `TCC_SYSTEM_PROMPT`, mesmo formato template-string de `SYSTEM_PROMPT`/`CONVENTIONAL_SYSTEM_PROMPT` (Papel/Entradas/Saida/Regras invioláveis Rn-TC/Formato de saida), herda R1-R19, **obrigatorio** conter regra de risco (unica hoje em `CONVENTIONAL_SYSTEM_PROMPT` R5-TC; `SYSTEM_PROMPT` nao tem nenhuma). Nao prometer campos de #390 (usar so campos ja existentes no output-schema atual).
- R5 `buildUserMessage()` em `prompt.ts:180-234` — achado extra da pesquisa, nao citado na issue original: hoje 2-way (`eConvencional`), vira 3-way tambem (disclaimer de regras por modo).
- R6 `src/app/(app)/pacientes/[id]/layout.tsx:60-83` — abas por modalidade: `protocol_driven`→PEI&Metas, `cognitive_behavioral`→TCC, `conventional`→Temas (nova).
- R7 Aba/rota "Temas" nova para modo convencional, renderiza `resumo_sessao` + `temas[]`. Nao existe hoje (convencional só existe por ausência).
- R8 Testes: `migrations.test.ts` verde (journal ja no formato certo); `layout.test.tsx` reescrito p/ 3 casos (hoje invertido: TCC aparece em `conventional`, bug real); `prompt.test.ts` ganha describe block p/ `TCC_SYSTEM_PROMPT` assertando presenca da regra de risco; teste novo provando `switch` de `claude-provider.ts` lanca em `modo` desconhecido.

## Fora de escopo

`familia_abordagem` (#331). Escrita de `patient.clinical_modality` (issue do seletor, #387 — mais adiante na ordem). Campos novos de output-schema (#390).

## Correcoes de path vs issue original

Issue cita `src/lib/agent/context-loader.ts` e `claude-provider.ts` — path real e `src/lib/extraction/`.
