# Spec — #392 Ponte agente → RPD sugerido, com fila de validação

Decisão de UX já fechada com o Rômulo (18/08/2026): a fila de RPD sugerido vive **dentro da aba TCC do paciente** (`src/app/(app)/pacientes/[id]/tcc/`), não na fila de validação geral `/validacao`. Motivo: `/validacao` opera sobre `evidence`/`evidence_current` (rastreamento de meta/protocolo/domínio) — domínio conceitual diferente de RPD/pensamento automático. Reaproveitar a tabela `evidence` para RPD forçaria um encaixe artificial.

## Já verificado pela pesquisa (fatos, não reabrir)

- `TCC_SYSTEM_PROMPT` já existe (`prompt.ts:41`, entregue por #388). Confirmar nesta issue apenas que instrui o agente a emitir `tipo: "registro_pensamento"` quando aplicável — não presumir, ler o prompt completo antes de codar.
- `registro_pensamento` já está no `tipoExtracaoEnum` (`agent-output-schema.ts:22`, #390) e tem shape próprio (`registroPensamentoSchema`, linha 125): `evidencias_favor`, `evidencias_contra`, `credibilidade_inicial`, `credibilidade_alternativa`, `comportamento_resultante`, `distorcoes_cognitivas[]`.
- **Gap real de shape:** `registroPensamentoSchema` **não inclui** `situacao`, `pensamento_automatico`, `emocao`, `intensidade` — campos `NOT NULL` em `tcc_rpd_entry` (`schema.ts:2133-2136`). O doc de #390 documenta isso como intencional ("fora de escopo de #390, cobertos por `resumo_sessao`/`sinalizacoes` por ora"). **Isto não é um bug a corrigir por fora — é a razão pela qual a aprovação não pode ser um clique cego**, ver "Decisão de design: forma da aprovação" abaixo.
- A extração já é persistida genericamente para QUALQUER `subtipo` (incluindo `registro_pensamento`) em `diario/[sessionId]/logic.ts` Fase C (linha ~463), com `estado: extractionEstado` (`sugerida | pendente_reprocessamento | aprovada | editada | descartada`, `schema.ts:100`). **A "fila de sugestão" já existe estruturalmente** — não é preciso criar tabela de staging nova nem coluna de status nova em lugar nenhum além de `tcc_rpd_entry` (proveniência).
- `extraction` não tem `patientId` direto — só `sessionId` (+ `clinicId`). A query da fila na aba TCC precisa join `extraction → session → patient` (ou usar `session.patientId` se a coluna existir — conferir `schema.ts` antes de escrever a query, não presumir).
- #391 (já commitado nesta sessão, PR #401) criou `alerta_risco_clinico.origem` com `registro_pensamento` ancorado **exclusivamente** em `rpd_entry_id NOT NULL` (CHECK `alerta_risco_vinculo`, migração `0111`). Isso cobre alerta de RPD **já aprovado**. Uma sugestão pendente de aprovação não tem `rpd_entry_id` (a linha em `tcc_rpd_entry` só existe pós-aprovação) — precisa de ancoragem alternativa. Ver "Decisão de design: alerta antes da aprovação".

## Decisão de design: forma da aprovação

Aprovar uma sugestão **não é um toggle de estado puro** — é abrir o formulário de RPD (`rpd-form.tsx`) **pré-preenchido** com o que o agente extraiu (`evidencias_favor/contra`, `credibilidade_inicial/alternativa`, `distorcoes_cognitivas`, `comportamento_resultante`, e `trecho_fonte` sugerido como base de `pensamento_automatico`), com `situacao`, `emocao`, `intensidade` **em branco, obrigatórios**, exatamente como no caminho manual (`salvarRpdSchema` já exige os três). O terapeuta completa o que falta e confirma — isto **é** "aprovar ou editar" ao mesmo tempo, não dois fluxos separados. "Descartar" é a única ação de um clique.

Consequência: aprovação reutiliza `salvarRPD` (`logic.ts:36`) sem tocar sua assinatura de negócio — só ganha dois campos novos de proveniência no INSERT (ver schema abaixo) e, ao final com sucesso, transiciona `extraction.estado` da sugestão de `sugerida` → `aprovada` (mesma transação, mesmo padrão de escrita única usado em `validacao/logic.ts`).

## Decisão de design: alerta de risco antes da aprovação

O alerta de #391 para `registro_pensamento` exige `rpd_entry_id` (linha oficial). Uma sugestão pendente não tem essa linha. Duas opções:

1. Rodar `detectarSinaisDeRiscoRPD` (ou equivalente) sobre o `payload` da extração no momento em que ela é criada (Fase C/D-bis de `diario/[sessionId]/logic.ts`, mesmo padrão da Fase E para `aplicacao_escala_relatada`), e ancorar o alerta em `origem_extraction_id` — **reaproveitando a forma de ancoragem que `instrumento_formal` já usa**, mas com `origem='registro_pensamento'`.
2. Isso exige relaxar o CHECK `alerta_risco_vinculo` de `0111` (que hoje exige `rpd_entry_id NOT NULL` para `registro_pensamento`) para aceitar **qualquer uma das duas âncoras** nessa origem: `rpd_entry_id IS NOT NULL OR origem_extraction_id IS NOT NULL`. **Nova migração `0112`** (não editar `0111`, já commitado/já em PR #401 — memória `editar-migracao-aplicada-nao-roda`), só alterando o CHECK (`DROP CONSTRAINT` + `ADD CONSTRAINT`), sem tocar a FK composta anti-IDOR.
3. `app_criar_alerta_risco` ganha uma nova função-wrapper (ou parâmetro) `registrarAlertaRiscoRPDSugerido(ctx, {patientId, extractionId, sinal})` em `src/lib/risco/registrar.ts`, espelhando `registrarAlertaRiscoInstrumento` (mesma forma de retorno, nunca lança).
4. **Import**: quando a sugestão for aprovada depois, o alerta já existe e **não é recriado nem migrado** para apontar pro `rpd_entry_id` novo — ele permanece ancorado na extração, que é dado histórico imutável (mesmo princípio de #391: "editar RPD depois não apaga alerta já criado", aqui generalizado para "aprovar sugestão não migra o alerta").

Isto é julgamento de engenharia desta issue, documentar explicitamente no código.

## Escopo (issue #392, texto original)

1. O agente, em modo `tcc`, emite `extracoes[]` com `tipo: "registro_pensamento"`.
2. Cada extração vira um RPD sugerido, não um registro oficial. Entra na fila de validação (aba TCC do paciente); o terapeuta aprova (= completa o formulário pré-preenchido), edita os campos livremente antes de confirmar, ou descarta.
3. Aprovação grava em `tcc_rpd_entry` com proveniência: sessão, trecho literal, `origem_agente = true`.
4. O formulário manual (`rpd-form.tsx` sem sugestão associada) continua existindo e é o caminho para o que o agente não capturou — sem alteração.

## Regras do agente (já valem, conferir prompt, não reimplementar)

- **R1** reforçada: texto sem padrão reconhecível → `distorcoes_cognitivas` vazio é resposta válida e esperada.
- **R2**: `trecho_fonte` cita o pensamento automático **literal**, nunca paráfrase.
- **R4-TCC**: classifica pela estrutura do pensamento, nunca pela emoção nomeada. Duas distorções plausíveis → registrar as duas com confiança média, ou nenhuma com confiança baixa.
- **R11**: números só quando literais no texto — vale para intensidade e credibilidade.
- **R6**: reafirmação da crença disfuncional apesar do questionamento é extração válida (polaridade negativa).

## Schema (proposta, migração `0112`)

```sql
-- 0112_rpd_sugerido_provenencia.sql
ALTER TABLE tcc_rpd_entry
  ADD COLUMN origem_extraction_id uuid REFERENCES extraction(id),
  ADD COLUMN origem_agente boolean NOT NULL DEFAULT false;

ALTER TABLE alerta_risco_clinico
  DROP CONSTRAINT alerta_risco_vinculo,
  ADD CONSTRAINT alerta_risco_vinculo CHECK (
    (pseudonimizado_em IS NULL AND patient_id IS NOT NULL AND (
      (origem = 'diario_sessao' AND session_id IS NOT NULL)
      OR (origem = 'registro_pensamento' AND (rpd_entry_id IS NOT NULL OR origem_extraction_id IS NOT NULL))
      OR (origem = 'instrumento_formal' AND origem_extraction_id IS NOT NULL)
    ))
    OR (pseudonimizado_em IS NOT NULL AND patient_id IS NULL AND session_id IS NULL AND rpd_entry_id IS NULL AND origem_extraction_id IS NULL)
  );
```

`origem_extraction_id` em `tcc_rpd_entry` guarda proveniência (qual extração originou a sugestão aprovada) — coluna DIFERENTE de `alerta_risco_clinico.origem_extraction_id` (tabelas distintas, mesmo nome por clareza semântica, sem relação de FK cruzada entre si).

Verificar em `information_schema` + `pg_proc` após aplicar (regra 3 do CLAUDE.md), não só `git log`.

## Requisitos de código

- **RQ1** Confirmar (ler, não presumir) que `TCC_SYSTEM_PROMPT` instrui emissão de `registro_pensamento`; se não instruir, é gap real desta issue — adicionar instrução, testar em `prompt.test.ts`.
- **RQ2** `diario/[sessionId]/logic.ts`: nova fase (após Fase E, mesmo padrão) — para cada draft com `subtipo === "registro_pensamento"`, rodar detecção de risco sobre os campos de texto do `payload` (reaproveitar `detectarSinaisDeRiscoRPD` de `pacientes/[id]/tcc/deteccao-risco.ts` se a assinatura aceitar o shape da extração, ou criar variante equivalente — não duplicar a lista de termos) e, se houver sinal, chamar `registrarAlertaRiscoRPDSugerido` (`registrar.ts`, novo). Erro não derruba a extração já persistida, aparece no retorno.
- **RQ3** `src/app/(app)/pacientes/[id]/tcc/logic.ts` (ou novo `sugestoes.ts` no mesmo diretório): `obterRPDSugestoes(ctx, patientId)` — lê `extraction` com `subtipo='registro_pensamento' AND estado='sugerida'` para sessões do paciente, ordenado por data.
- **RQ4** `aprovarRPDSugestao`: recebe `extractionId` + os mesmos campos de `salvarRpdSchema` (situação/emoção/intensidade preenchidos pelo terapeuta + o resto pré-populável do payload, mas o cliente reenvia tudo — servidor não confia em payload antigo da extração para os campos clínicos finais, só usa para a UI pré-preencher o form). Insere em `tcc_rpd_entry` com `origem_extraction_id` + `origem_agente=true`, transiciona `extraction.estado` para `aprovada` na MESMA transação (advisory lock por paciente, mesmo padrão de `validacao/logic.ts`), depois roda a varredura de risco de RPD normal (#391, `salvarRPDCore`) sobre os campos finais confirmados pelo terapeuta — pode gerar um SEGUNDO alerta se o terapeuta confirmar/adicionar sinal que a extração não continha; não deduplicar contra o alerta da sugestão, são eventos distintos no tempo.
- **RQ5** `descartarRPDSugestao`: transiciona `extraction.estado` para `descartada` (`comEscrita`, `requireRole` coordenador/terapeuta). Não apaga a extração, não apaga alerta de risco já criado a partir dela.
- **RQ6** UI (`pacientes/[id]/tcc/page.tsx` ou componente novo): lista de sugestões pendentes na aba TCC, cada item abre o form pré-preenchido (aprovar) ou permite descartar direto.
- **RQ7** Testes de integração (`logic.int.test.ts` e/ou novo arquivo): sugestão sem sinal de risco não cria alerta; sugestão com ideação cria alerta ancorado em `origem_extraction_id` mesmo sem aprovação; aprovação grava proveniência e muda `extraction.estado`; descarte não apaga trecho nem alerta pré-existente; RLS cross-tenant para o novo caminho de ancoragem.

## Invariantes (checklist de revisão)

- [ ] RPD sugerido não aparece em nenhum gráfico/consulta que trata `tcc_rpd_entry` como registro oficial (a linha só existe pós-aprovação — não há "sugestão fantasma" na própria tabela).
- [ ] Alerta de risco dispara na CRIAÇÃO da sugestão, não na aprovação.
- [ ] Aprovar não recria/migra o alerta já ancorado na extração.
- [ ] Descartar não apaga trecho do diário nem alerta já criado.
- [ ] Texto vago não produz classificação de distorção (R1) — mesma regra do formulário manual, sem exceção para o agente.
- [ ] Intensidade/credibilidade só quando número é literal (R11).
- [ ] `app_role` continua sem INSERT direto em `alerta_risco_clinico` — caminho novo passa por `app_criar_alerta_risco`.
- [ ] Nenhuma string "SLA".

## Fora de escopo

Reprocessamento automático de sugestão editada. Notificação (push/e-mail) de nova sugestão pendente — fica só visível na aba ao terapeuta abrir.

## Próxima fase

**Recomendo `design.md` antes de `tasks.md`/execute.** Escopo toca: schema (`tcc_rpd_entry` + CHECK de `alerta_risco_clinico`, migração nova sobre uma constraint que #391 acabou de criar), RLS (política de leitura da fila de sugestões precisa ser conferida — provavelmente herda de `extraction_select` existente, mas não presumir), shape de saída do agente (RQ1, output-schema/Zod), e uma superfície de UI nova (fila + form pré-preenchido) com uma decisão de UX não-trivial (aprovação = form completo, não toggle). É "Complexo" na régua do skill (ambiguidade real resolvida aqui pela primeira vez: como uma extração incompleta vira um registro `NOT NULL`-completo). Meu conselho: `design.md` cobre a árvore de decisão da fila (onde a query mora, como o RLS da leitura é garantido) e o `tasks.md` quebra em: (T1) prompt/RQ1, (T2) migração 0112 + registrar.ts, (T3) Fase de risco em diario/logic.ts, (T4) queries+actions em tcc/, (T5) UI, (T6) testes de integração/RLS — pelo menos T2/T3 e T4/T5 podem rodar em paralelo depois de T1 confirmar o prompt.
