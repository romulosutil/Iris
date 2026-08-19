# Spec — #393 Escalas intervalares PHQ-9 e GAD-7

Decisão de UX já fechada com o Rômulo (18/08/2026): o escore aparece na UI só como **texto** (lista com data + escore + faixa de corte), sem gráfico de tendência nesta issue.

## Já verificado pela pesquisa (fatos, não reabrir)

- **Nenhuma tabela de instrumento existe.** #391 já registrou isso explicitamente no próprio spec: "Não existe tabela persistida de instrumento formal (PHQ-9/GAD-7) ainda — isso é escopo da #393". Hoje `aplicacao_escala_relatada` só vira uma linha de `extraction` (sugestão), sem registro oficial equivalente a `tcc_rpd_entry`.
- **`item_risco_positivo` e `escore_relatado` já existem no contrato do agente** (`agent-output-schema.ts:146-159`, entregues por #390): `aplicacaoEscalaRelatadaSchema` já tem `protocol_id`, `escore_relatado: z.number().nullable().optional()`, `fonte_do_escore` (enum `paciente_informou | terapeuta_calculou_na_sessao | nao_informado`), `item_risco_positivo: z.boolean().nullable()` — **já correto quanto a `null` ≠ `false`**, com comentário no código citando `protocolo-tcc.md §7.3` explicitamente. Não é preciso mexer neste schema Zod.
- **O gatilho de risco do item 9 já existe** (`registrarAlertaRiscoInstrumento`, `registrar.ts:231`, e a Fase E de `diario/[sessionId]/logic.ts`, ambos de #391) — lê `item_risco_positivo` da extração já persistida, cria alerta com `origem='instrumento_formal'`, `origem_extraction_id`, `categoria='ideacao_suicida'` fixa, `severidade='ideacao_ativa_sem_plano'` fixa (não diferenciada por valor 0-3 do item). **Esta issue não cria o gatilho — refina a severidade** (ver "Decisão: mapeamento valor→severidade" abaixo) e fornece o dado real (tabela oficial) que hoje só existe como fixture de teste (#395).
- **Padrão de RLS a copiar**: `db/migrations/0103_*.sql` (tabela `tcc_rpd_entry`) — `ENABLE/FORCE ROW LEVEL SECURITY`, 4 policies (`select/insert/update/delete`) usando `app_clinic_id_exigido() AND app_patient_in_clinic(patient_id) AND (coordenador OR app_is_on_team(patient_id))`, `delete` restrito a coordenador. Copiar literalmente essa forma para a tabela nova, trocando o nome.
- **Não existe padrão pronto de "config vazia por padrão, tela não renderiza sem conteúdo carregado"** no repo — `clinic.taxonomia_distorcoes` (#389, `schema.ts:284`) é o único precedente de config JSONB por clínica, mas vem com **default não-vazio** (lista de distorções de Burns). #393 precisa do padrão oposto: default `NULL`/vazio, e a UI checando ausência antes de renderizar. Não reaproveitar a coluna de #389 — é campo semanticamente diferente (taxonomia de distorção ≠ texto de item de escala).
- **`TCC_SYSTEM_PROMPT` já cobre R3** (agente nunca soma escore) — conferir texto exato antes de assumir, mas o padrão dos demais campos numéricos (R11-TC/R12-TC, "número só quando literal no texto") já se aplica a `escore_relatado` por construção do prompt geral; se o prompt não mencionar `aplicacao_escala_relatada` explicitamente, é gap real desta issue (mesma classe de achado que #392 teve com R9-TC a R13-TC).

## Decisão de design: tabela oficial vs. extração-sugestão

`aplicacao_escala_relatada` continua existindo como **extração/sugestão** (mesmo pipeline do RPD pré-#392: linha em `extraction`, fila de validação). Esta issue cria a tabela **oficial** — nome proposto `instrumento_aplicacao` — análoga a `tcc_rpd_entry`, escrita por:

1. **Caminho manual** (primário, análogo a `salvarRPD`): terapeuta aplica o instrumento na sessão (presencial ou relatado) e digita os valores diretamente na aba TCC do paciente — sem depender do agente. Este é o caminho que a issue trata como "dono do dado: paciente responde, escore é do paciente/terapeuta. Agente é leitor, nunca calculador."
2. **Caminho sugerido pelo agente** (secundário) — **fora de escopo desta issue**: transformar uma extração `aplicacao_escala_relatada` sugerida em linha oficial de `instrumento_aplicacao` seguiria o MESMO padrão de fila/aprovação que #392 construiu para RPD (`sugestoes.ts`), mas isso é trabalho novo de UI/fila que a issue não pede explicitamente (o escopo da issue é "tabela, escore relatado, gate de fonte primária", não "fila de aprovação de instrumento"). Registrar como **débito de follow-up**, não bloquear #393 nisso.

Esta escolha é julgamento de engenharia — a issue não é explícita sobre se existe fila de aprovação — documentar no código.

## Decisão: mapeamento valor→severidade do item 9

Hoje `registrarAlertaRiscoInstrumento` (#391) usa severidade fixa (`ideacao_ativa_sem_plano`) para qualquer `item_risco_positivo` truthy. `protocolo-tcc.md §7.3` pede diferenciação pelo VALOR 0-3 do item, não só o booleano. Como o schema Zod atual (`item_risco_positivo: boolean | null`) não carrega o valor 0-3 — só o booleano derivado — **esta issue precisa decidir se expande o schema para carregar o valor bruto do item 9** (`item_9_valor: number | null`, 0-3) ou se mantém só o booleano e aceita a severidade fixa como suficiente por ora.

Proposta (grau de confiança médio, não é fato coberto pela issue): adicionar `item_9_valor: z.number().int().min(0).max(3).nullable().optional()` ao `aplicacaoEscalaRelatadaSchema`, mapear:
- `0`: não dispara (mantém regra atual, `item_risco_positivo` deveria ser `false`/consistente).
- `1`: severidade mínima sugerida `ideacao_passiva`.
- `2`: `ideacao_ativa_sem_plano`.
- `3`: `ideacao_ativa_sem_plano` (não existe nível mais grave que módulo atual do enum de severidade sem ver `alerta_risco_severidade` completo — **conferir o enum real em `schema.ts` antes de codar**, não assumir que só esses 3 valores existem).
- `null` (recusado): mantém o tratamento já implementado em #391 (`certeza='ambiguo_citado'`), severidade não pode ser rebaixada por causa da recusa (§1.4: ambiguidade rebaixa certeza, nunca suprime nem rebaixa severidade).
- Empate/dúvida entre dois níveis: resolve pelo mais grave (`regra-alerta-risco.md §1.3`, já citada em #391).

**Isto precisa de confirmação de leitura do `alerta_risco_severidade` enum real antes de implementar — não presumir os 3 valores acima estão certos.**

## Decisão: gate de fonte primária (conteúdo regulatório)

Nenhuma string de item PHQ-9/GAD-7 em PT-BR entra no repositório — nem em fixture de teste, nem em seed, nem em comentário. Estrutura:

- Tabela `instrumento_item_texto` (ou coluna JSONB em `protocol`/config de clínica — decidir na fase de design) guarda o texto de cada item, **vazio por padrão** (sem seed, sem migration com conteúdo).
- UI (`instrumento-form.tsx` ou equivalente) checa presença de texto carregado antes de renderizar os 9/7 itens — sem texto, tela mostra estado vazio explicando que o conteúdo pendente de configuração, não um formulário com campos sem rótulo.
- **Estrutura numérica (0-3 por item, cortes, contagem de itens) PODE ser hardcoded** — não é conteúdo licenciado, é fato de domínio público confirmado em `protocolo-tcc.md §7.1`. Só o TEXTO dos itens é gated.
- Verificação de DoD: grep no diff do PR por strings candidatas a item PHQ-9/GAD-7 (ex.: termos de tradução comuns) — **quem revisa o PR precisa rodar esse grep manualmente antes de aprovar**, não é um teste automatizado (não há como enumerar "toda tradução possível" em regex).

## Escopo (issue #393, texto original)

1. Tabela de aplicação de instrumento — `protocol_id`, data, escore relatado, `fonte_do_escore`, respostas por item.
2. `item_risco_positivo: boolean | null` — já existe no contrato do agente, a tabela oficial precisa da mesma coluna com a mesma semântica de `null`.
3. Agente nunca soma escore (R3) — já é a forma do schema (`escore_relatado` só populado se número literal no texto); confirmar prompt instrui isso.
4. Escala como `protocolos_ativos[]` com `tipo_coleta: "escala_padronizada_intervalar"` — conferir shape de `protocolos_ativos` existente (`contexto.protocolos_ativos`, já usado por #391/#392) antes de adicionar o campo novo.
5. Gatilho de risco pelo item 9 — já implementado (#391), esta issue alimenta com dado real.

## Requisitos de código

- **RQ1** Migração `0113`: tabela `instrumento_aplicacao` (nome proposto — confirmar antes de codar se já não existe convenção melhor no domínio) com `id`, `clinic_id`, `patient_id`, `session_id nullable`, `protocol_id`, `tipo_instrumento` (enum `phq9 | gad7`), `escore_total`, `fonte_do_escore` (enum, mesmo shape do agente), `respostas_por_item jsonb` (array de `{item: int, valor: int 0-3}`), `item_9_valor` (só relevante para PHQ-9, nullable), `item_risco_positivo boolean nullable` (`null` ≠ `false`), `criado_por`, `criado_em`. RLS copiada literalmente de `0103` (4 policies, `app_clinic_id_exigido() + app_patient_in_clinic + coordenador OR app_is_on_team`). `GRANT` por coluna verificado com `has_column_privilege` (não `role_table_grants` — memória `postgres-column-grant-denies-table`).
- **RQ2** Tabela/config `instrumento_item_texto` (ou equivalente) para os textos dos itens, vazia por padrão, sem seed com conteúdo PT-BR. Escopo de design a decidir: tabela separada vs. coluna de config em `clinic`/`protocol`.
- **RQ3** Formulário manual de aplicação (`pacientes/[id]/tcc/instrumento-form.tsx` ou local a decidir) — terapeuta digita escore/respostas, sem passar pelo agente. Server action com `comEscrita`/`requireRole`, mesmo padrão de `salvarRPD`.
- **RQ4** `TCC_SYSTEM_PROMPT` (e conferir `SYSTEM_PROMPT`/`CONVENTIONAL_SYSTEM_PROMPT` se aplicável) — confirmar instrução explícita de R3 (nunca somar escore) para `aplicacao_escala_relatada`; se ausente, é gap real, adicionar + testar em `prompt.test.ts`.
- **RQ5** Refinar `registrarAlertaRiscoInstrumento`/mapeamento de severidade por valor do item 9 — depende da decisão "valor→severidade" acima, incluindo conferir o enum real `alerta_risco_severidade` antes de mapear.
- **RQ6** Dois testes de extração determinística: diário com "aplicamos o PHQ-9 hoje, escore 14" → `escore_relatado = 14`; diário com "parece bem deprimido" → nenhum `escore_relatado` extraído (ausência, não `null` fabricado).
- **RQ7** Teste `null` vs `false` para `item_risco_positivo` na tabela oficial — inserir com `null`, ler de volta, confirmar não virou `false` em nenhum ponto do caminho de escrita.
- **RQ8** UI: lista texto (data + escore + faixa de corte derivada do total — cortes hardcoded por serem estrutura confirmada, não conteúdo licenciado), sem gráfico.
- **RQ9** Teste de mutação por comportamento: corrigir um escore digitado errado (UPDATE em `instrumento_aplicacao`) não apaga alerta de risco já criado a partir do valor anterior — mesma família de invariante de #391 (RPD)/#392 (aprovar não migra alerta).

## Invariantes (checklist de revisão)

- [ ] Nenhuma string de item de PHQ-9/GAD-7 em PT-BR commitada — grep manual do revisor no diff, não só teste automatizado.
- [ ] `item_risco_positivo` aceita e persiste `null` distinto de `false`, testado.
- [ ] Extração com escore literal registra o número; sem número literal, não registra (dois testes, RQ6).
- [ ] RLS copiada de `0103:37-60`, usando `app_clinic_id_exigido()`.
- [ ] `GRANT` por coluna verificado com `has_column_privilege`.
- [ ] Severidade do item 9 nunca definitiva — sempre "sugerida", nunca sobrescreve julgamento humano.
- [ ] Corrigir escore digitado errado não apaga alerta já criado.
- [ ] Nenhuma string "SLA".
- [ ] Estrutura numérica (contagem de itens, escala 0-3, cortes) pode ser hardcoded — só o TEXTO dos itens é gated por config vazia.

## Fora de escopo

- Lembrete de reaplicação (`protocolo-tcc.md §6/§7.4`) — issue própria, depende desta.
- ATQ, PCL-5, Y-BOCS, BDI-II/BAI (licenciados/pagos).
- Fila de aprovação de sugestão de instrumento pelo agente (análoga a #392 para RPD) — a issue não pede explicitamente, ver "Decisão de design" acima; registrar como follow-up se o Rômulo confirmar que quer esse caminho também.
- Gráfico de tendência do escore (decisão de UX já fechada: só texto por agora).

## Próxima fase

**Recomendo `design.md` antes de `tasks.md`/execute.** Escopo toca: schema novo (tabela + RLS + config de conteúdo gated), refinamento de uma função `SECURITY DEFINER` já existente (`registrarAlertaRiscoInstrumento`), gate de conteúdo regulatório (não é só código — é uma restrição de PROCESSO, "nunca commitar string X", que precisa de checklist de revisão humana explícito), e uma decisão de arquitetura não resolvida pela issue (tabela oficial vs. extração-sugestão, se existe fila de aprovação). Diferente de #392 (onde a ambiguidade real era "como uma extração incompleta vira registro NOT NULL-completo"), aqui a ambiguidade real é dupla: (a) o enum de severidade tem quantos níveis de fato — só se sabe lendo `schema.ts`; (b) existe ou não uma fila de aprovação de instrumento sugerido pelo agente, e a issue não decide isso. `design.md` deve resolver as duas ANTES de `tasks.md`. Proposta de quebra: T1 (ler enum severidade real + confirmar prompt R3, sem código) → T2 (migração 0113 + RLS) ∥ T3 (config de texto vazio) → T4 (form manual + queries) ∥ T5 (refinar severidade em registrar.ts) → T6 (UI lista texto) → T7 (testes integração/RLS + gate de conteúdo). T2/T3 e T4/T5 paralelos como em #392.
