# #645 — Tarefas

Ordem é dependência real. `[P]` = paralelizável com a anterior.

| #   | Tarefa                                                                                                                   | Requisitos     | Estado |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ |
| T1  | `normalizarTema` puro em `src/lib/extraction/normalizar-tema.ts` + teste unitário                                        | R-06           | ✅     |
| T2  | `sessionTemaEstado` + `sessionTema` em `src/db/schema.ts`; `pnpm db:generate` → `0159`; RLS/GRANT à mão; `_journal.json` | R-01           | ✅     |
| T3  | `ExtractionResult.temas`; `llm-provider`, `null-provider`, `demo-stub-provider`                                          | R-03           | ✅     |
| T4  | Consolidação grava `sugerido` (delete só de `sugerido` + insert dedup por `tema_chave`)                                  | R-04           | ✅     |
| T5  | Promoção `sugerido → aprovado` em `aprovarExtracao`/`editarExtracao`                                                     | R-05           | ✅     |
| T6  | `projetarHistoricoDeTemas` puro + teste unitário (janela 5, recorrência ≥ 3, ordenação estável)                          | R-07           | ✅     |
| T7  | `context-loader.ts`: ramo `terapia_convencional` lê `session_tema` aprovado e projeta                                    | R-08           | ✅     |
| T8  | `/pacientes/[id]/temas`: seção de temas reais + remoção do comentário "paliativo"                                        | R-09           | ✅     |
| T9  | Acervo: `session_tema` na lista + bloco de coleta                                                                        | R-10           | ✅     |
| T10 | Int-test: isolamento por tenant, idempotência da promoção, cascata do expurgo                                            | R-02/R-05/R-11 | ✅     |
| T11 | Docs: tabela de modos em `protocolos-e-agente.md` + caso R14 em `casos-de-teste-terapia-convencional.md`                 | R-12/R-13      | ✅     |
| T12 | Gate: `pnpm typecheck && pnpm lint && pnpm test` + int-tests desta feature                                               | —              | ✅     |
