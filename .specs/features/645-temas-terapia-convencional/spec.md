# Persistir `temas[]` e ligar `historico_relevante` do modo convencional — Especificação

> Issue [#645](https://github.com/romulosutil/Iris/issues/645) · continuação da #464 · Modalidade: `terapia_convencional` apenas.
>
> **Áreas cinzentas FECHADAS** (proposta pendente de ratificação do Rômulo): [`context.md`](./context.md) — G-1 a G-7.
>
> Citações `arquivo:linha` medidas em 08/09/2026 sobre `main@379bf316`.

## Problema

`historico_relevante` é a base do **R14** (INCONSISTÊNCIA COM HISTÓRICO, o
anti-rubber-stamping — `src/lib/extraction/prompt.ts`). A #464 ligou dois dos três
modos:

| modo                   | fonte                               | estado antes desta issue |
| ---------------------- | ----------------------------------- | ------------------------ |
| `protocol_driven`      | `session_snapshot.repertorio_state` | ligado (#464)            |
| `tcc`                  | `instrumento_aplicacao`             | ligado (#464)            |
| `terapia_convencional` | `temas[]` do agente                 | **`[]` fixo**            |

O convencional ficou de fora porque **a fonte não existe**. Medido:

- `agent-output-schema.ts:320` declara e valida `temas: z.array(z.string()).optional()`.
- `LlmExtractionProvider.extrair` (`llm-provider.ts:168-180`) devolve só
  `drafts` / `alertaRisco` / `meta` — `temas` e `resumo_sessao` são descartados.
- `grep session_tema src/db/schema.ts` → 0 linhas. Não há tabela nem coluna.
- `src/app/(app)/pacientes/[id]/temas/queries.ts:11-27` documenta a lacuna em
  comentário e lê a nota consolidada como paliativo.

Consequência: R14 está **dormente exatamente no modo onde recorrência de tema é o
sinal clínico principal**.

A variante de destino já existe no contrato desde a #464 e não tem produtor:
`{ tipo: "tema", tema, resumo }` em `historico-relevante.ts:44`.

## Requisitos

| ID       | Requisito                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-01** | Tabela `session_tema` com `clinic_id` NOT NULL, RLS habilitada e forçada, 4 policies resolvendo o tenant por `app_clinic_id_exigido()`, e GRANT para `app_role`. |
| **R-02** | Isolamento por tenant provado por teste de integração: clínica B não lê nem escreve linha da clínica A.                                                          |
| **R-03** | `ExtractionResult` carrega `temas: string[]`; `LlmExtractionProvider` deixa de descartar `saida.temas`.                                                          |
| **R-04** | A consolidação grava os temas da rodada como `estado='sugerido'`, apagando só as linhas `sugerido` da mesma sessão. Linha `aprovado` sobrevive à reextração.     |
| **R-05** | Aprovar (ou editar-e-aprovar) qualquer extração da sessão promove os temas `sugerido` da sessão para `aprovado`. Idempotente: reaprovar não duplica.             |
| **R-06** | Chave de agrupamento determinística `normalizarTema`, pura e testada: `"luto do pai"` e `"luto pelo pai"` colidem na mesma chave.                                |
| **R-07** | `projetarHistoricoDeTemas` puro em `historico-relevante.ts`, produzindo a variante `{tipo:"tema", tema, resumo}`, janela 5 / recorrência ≥ 3 (G-4).              |
| **R-08** | `context-loader.ts` liga o ramo `terapia_convencional` — deixa de mandar `[]` e passa a ler `session_tema` com `estado='aprovado'`.                              |
| **R-09** | `/pacientes/[id]/temas` mostra os temas reais (agrupados, com contagem e última ocorrência) acima da lista de notas; o comentário "paliativo" sai.               |
| **R-10** | Acervo exportado (`coletor.ts`) inclui `session_tema`.                                                                                                           |
| **R-11** | Expurgo de prontuário remove as linhas de `session_tema` do paciente — provado por teste de integração, não presumido do DDL.                                    |
| **R-12** | `docs/agente/protocolos-e-agente.md`: a tabela de modos deixa de dizer que o convencional "ainda não é persistido".                                              |
| **R-13** | `docs/agente/casos-de-teste-terapia-convencional.md`: o caso que exercita R14 contra tema recorrente aponta para contexto real, não fixture.                     |

## Fora de escopo

- `resumo_sessao` (o outro campo descartado pelo provider) — nada o consome hoje; entra quando houver leitor.
- Edição/remoção de tema aprovado pela UI — G-5.
- Curadoria/agrupamento de temas pelo terapeuta — G-3.
- Qualquer alteração em `docs/legal/` (exige confirmação do Rômulo).
- Mostrar os temas `sugerido` na tela de revisão antes de aprovar. Hoje o
  terapeuta aprova a extração e os temas da sessão são promovidos junto, sem
  um cartão próprio na revisão. É deliberado (o gesto de aprovação é o mesmo
  que a Definição de Pronto da issue descreve), mas fica registrado como
  candidato a follow-up: adoção só se mede depois que o dado existir.

## Definição de pronto

`pnpm typecheck`, `pnpm lint`, `pnpm test` e a suíte de integração desta feature
verdes, com os testes de R-02, R-05 e R-11 rodando de verdade contra Postgres
(não `skipped`).
