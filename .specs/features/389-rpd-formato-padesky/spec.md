# Spec — #389 RPD formato Padesky

Design de referencia: `docs/agente/rpd-desenho-de-formulario.md`, `docs/agente/protocolo-tcc.md` §2.1/§6/§7.2.

## Ja feito pelo orquestrador (nao reimplementar)

- Migracao `0109` (schema.ts + backfill + drop de coluna, sequenciado num unico arquivo hand-edited pos-`db:generate`).
- `src/app/(app)/pacientes/[id]/tcc/completude.ts` — funcao pura `calcularCompletudeRPD(entry)`, retorna `"registro_capturado" | "reestruturacao_completa"`. Contrato: `"reestruturacao_completa"` exige (`evidenciasFavor` OU `evidenciasContra` preenchido) E `respostaRacional` preenchido E `intensidadePos` nao-nulo. Caso contrario `"registro_capturado"`. Import de `{ calcularCompletudeRPD }` de `./completude`.

## `origem_resposta_racional` — FORA DE ESCOPO

A issue original marca essa coluna como "proposta nao fechada... confirmar com o Romulo antes de implementar". **Nao implementar.** Nao adicionar a coluna, nao adicionar ao Zod, nao adicionar ao formulario. Registrar em `BACKLOG.md` como decisao pendente (feito pelo orquestrador).

## Decisoes de design

- **Taxonomia por clinica**: `clinic.taxonomia_distorcoes` (jsonb, array de slugs, `NOT NULL DEFAULT` com os 12 slugs padrao), mesmo padrao de `protocol.taxonomia_ajuda` (`contexto-exemplo.json`: array simples de strings-slug, sem objetos). Rotulos ficam em `constants.ts` (mapa slug→rotulo), nao no banco.
- **12 opcoes viram slug+rotulo** em `constants.ts`: `catastrofizacao`, `leitura_mental`, `tudo_ou_nada`, `generalizacao_excessiva`, `desqualificacao_positivo`, `raciocinio_emocional`, `afirmacoes_deveria`, `rotulacao`, `personalizacao`, `filtro_mental`, `adivinhacao_futuro`, `outra_nao_especificada`.
- **Validacao de slug fora da taxonomia**: invariante de aplicacao em `salvarRPD` (le `clinic.taxonomia_distorcoes` da clinica do paciente, rejeita slug que nao pertence), testada por integracao — NAO `CHECK` de banco (R19, PROIBIDO enum/CHECK fixo).
- **Completude nunca e coluna gravada** — sempre calculada em leitura via `calcularCompletudeRPD`.
- **Grafico** (`grafico-evolucao-crencas.tsx`): filtra entradas para `calcularCompletudeRPD(e) === "reestruturacao_completa"` ANTES de plotar. Import de `./completude`.

## Requisitos

- R1 `constants.ts`: `salvarRpdSchema` reescrito — campos 1-3 (`situacao`, `pensamentoAutomatico`, `emocao`+`intensidade`) obrigatorios; `credibilidadeInicial` opcional (0-100); `evidenciasFavor`/`evidenciasContra` opcionais (string); `respostaRacional` **deixa de ser obrigatorio** (era `.min(1)`, vira `.optional()`); `credibilidadeAlternativa` opcional (0-100); `distorcoesCognitivas` opcional, **array** de slugs (`z.array(z.string()).optional()`, valida contra taxonomia da clinica em `salvarRPD`, nao no Zod — Zod so valida forma); `intensidadePos` opcional (ja existia); `comportamentoResultante` opcional (string). Nomes de campo em camelCase no TS, snake_case no banco (padrao Drizzle ja usado).
- R2 `logic.ts`: `salvarRPDCore` grava os campos novos; busca `clinic.taxonomiaDistorcoes` da clinica (`ctx.clinicId`) e rejeita (mensagem clara) qualquer slug em `distorcoesCognitivas` que nao esteja nela. `obterRPDEntries` sem mudanca de assinatura (completude e derivada no consumidor, nao aqui).
- R3 `rpd-form.tsx`: reordenar campos conforme tabela da issue (situacao, pensamento automatico, emocao+intensidade, credibilidade inicial [opcional], evidencias a favor [nucleo], evidencias contra [nucleo], pensamento alternativo [rotulo novo pro campo `respostaRacional`], credibilidade alternativa [opcional], distorcao cognitiva [**opcional, ultimo antes de reavaliar, colapsado por padrao**, fieldset+legend com checkboxes — NAO combobox], reavaliar intensidade, comportamento resultante [opcional]). Copy exata do campo de distorcao: label "Que armadilha de pensamento parece ser? (opcional)", texto de apoio "Pular este campo não prejudica o registro. As categorias se sobrepõem e nem os manuais concordam entre si — o que muda o quadro é examinar as evidências e formular uma alternativa, o que você já fez acima." Escalas 0-100 com `input[type=number]` alem do slider (se houver slider). Campos opcionais marcados no rotulo (ex: "Credibilidade inicial (opcional)").
- R4 `grafico-evolucao-crencas.tsx`: filtro de completude (ver Decisoes acima). Interface `RpdGraficoEntry` ganha os campos novos necessarios pro calculo de completude (`evidenciasFavor`, `evidenciasContra`, `respostaRacional` ja existe).
- R5 Testes: RPD salva com `distorcoesCognitivas` vazio/ausente (ok); RPD salva so com campos 1-3 (`registro_capturado`, ok, sem erro); grafico exclui registro em `registro_capturado` (teste com entrada parcial, prova exclusao via snapshot/assert de pontos renderizados ou array filtrado); slug fora da taxonomia da clinica rejeitado (integracao, duas clinicas com taxonomias diferentes, mesmo padrao de setup de `logic.int.test.ts` ja existente); teste a11y do fieldset de distorcoes (`role`, `fieldset`/`legend`, navegacao por teclado dos checkboxes — sem `axe`, convencao do repo).
- R6 `GRANT`: tabela `tcc_rpd_entry` ja tem `GRANT ... ON tcc_rpd_entry TO app_role` **sem restricao por coluna** (migracao `0103`) — colunas novas ja estao cobertas, SEM necessidade de GRANT novo. Verificar com `has_column_privilege` mesmo assim (medir, nao presumir). `clinic.taxonomia_distorcoes` tambem cai sob o GRANT existente da tabela `clinic` a menos que uma migracao anterior tenha revogado coluna a coluna — CONFERIR antes de assumir, e se houver revogacao, adicionar GRANT explicito so pra essa coluna.

## Fora de escopo

`origem_resposta_racional` (ver acima). UI de edicao da taxonomia por clinica (so o dado/validacao existem; tela de configuracao fica pra issue futura). `familia_abordagem` (#331).
