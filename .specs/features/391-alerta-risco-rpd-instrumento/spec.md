# Spec — #391 Alerta de risco a partir de RPD e de instrumento formal

Design de referencia: `docs/agente/regra-alerta-risco.md` §1.2-1.4, §4.1, §5. Issue de seguranca clinica — precisao > velocidade.

## Ja verificado pela pesquisa (fatos, nao reabrir)

- `TCC_SYSTEM_PROMPT` **ja tem** R5-TC (regra de risco), shippado pela #388. **Nao e mais gap.** Gap real: `SYSTEM_PROMPT` (modo ABA/padrao) nao tem NENHUMA regra de risco — nem R5-TC nem equivalente. `diario/[sessionId]/logic.ts:475` ja tem um comentario citando "R20 / R5-TC" — sinal de que a regra nova do ABA deveria ser **R20** (numeracao ja antecipada em comentario, antes de existir).
- Nao existe tabela persistida de instrumento formal (PHQ-9/GAD-7) ainda — isso e escopo da #393 (mais adiante na fila). Hoje `aplicacao_escala_relatada` (Zod, `agent-output-schema.ts`) so vira uma linha de `extraction` (subtipo, fila de validacao comum). O gatilho deterministico desta issue tem que ler `item_risco_positivo` **de dentro da extracao ja persistida**, no momento da criacao (nao da aprovacao) — nao esperar #393 pra existir.
- `app_criar_alerta_risco` (0049) ja e generica o bastante (patient/session/categoria/severidade/certeza/trecho/detalhe) — nao precisa mudar a LOGICA de prazo/dedupe/audit, so ganhar suporte a ancora alternativa (RPD ou extracao) no lugar de `session_id`.
- Policy `alerta_risco_scope` (SELECT/UPDATE) **nao precisa mudar** — o predicado ja usa `app_is_on_team(patient_id)` como um dos OR, que nao depende de `session_id`. Alertas ancorados em RPD/instrumento continuam visiveis pra equipe do paciente.
- Coluna `email_rt_tentativas` existe na tabela hoje (posterior a 0049) — **conferir migracoes intermediarias antes de escrever a nova**, para nao colidir.
- Regra "empate de severidade resolve pelo mais grave" (`regra-alerta-risco.md` §1.3) e "ambiguidade rebaixa certeza, nunca suprime" (§1.4) se aplicam ao design da deteccao no RPD (ver abaixo).

## Decisao de design: deteccao de risco no RPD (scope item 3)

RPD e formulario preenchido **diretamente pelo terapeuta** (nao passa pelo LLM/agente) — nao ha `alerta_risco` do agente pra ler. Decisao: **varredura deterministica por palavras-chave** nos campos de texto livre (`situacao`, `pensamentoAutomatico`, `evidenciasFavor`, `evidenciasContra`, `respostaRacional`, `comportamentoResultante`), case-insensitive, normalizando acentos. Duas listas:

- `ideacao_suicida`: "suicid", "me matar", "tirar minha vida", "acabar com tudo", "nao aguento mais viver", "quero morrer", "sumir de vez".
- `autolesao`: "automutil", "me cortar", "me machucar", "cortar meus", "queimar minha pele", "bater em mim mesm".

Casamento por substring (nao regex de fronteira de palavra rigorosa) — falso positivo aceitavel, falso negativo nao (mesmo principio de R5-TC). `certeza` do alerta criado por keyword-match e **sempre `ambiguo_citado`** (nunca `explicito` — e deteccao textual bruta, nao juizo semantico de LLM ou de terapeuta). `severidade`: por ausencia de mais contexto estruturado, usar o nivel **mais grave dentro da categoria que casou** (regra do empate, aplicada por falta de informacao pra diferenciar): `ideacao_suicida` → `ideacao_ativa_sem_plano`; `autolesao` → `autolesao_recente`. Se as duas listas casarem no mesmo registro, cria **dois alertas** (categorias diferentes, nao um so).

**Este e um julgamento de engenharia, nao uma citacao direta da issue/doc — documentar explicitamente no codigo e neste spec, pra ser auditavel e corrigivel.**

## Decisao de design: deteccao de risco no instrumento (scope item 2)

Regra generica (doc §1.2, item 6): item de risco positivo dispara pela **mesma regra**, nao regra separada "de escala" — **nao** hardcodar "item 9 do PHQ-9" especificamente (violaria R19, mesmo espirito de nao hardcodar instrumento). Gatilho: sempre que uma linha de `extraction` for criada com `subtipo = 'aplicacao_escala_relatada'` **e** o payload JSON tiver `item_risco_positivo !== false` (ou seja, `true` OU `null` — recusa de resposta dispara, `0`/`false` nao), criar alerta com `categoria = 'ideacao_suicida'` (unica categoria de instrumento hoje, dado que o unico item de risco padrao em escalas de depressao e ideacao — se outro instrumento vier depois, revisar), `certeza = 'explicito'` quando `item_risco_positivo = true`, `certeza = 'ambiguo_citado'` quando `null` (recusa — sinal, mas sem confirmacao positiva), `severidade = 'ideacao_ativa_sem_plano'` (nivel intermediario, nao o minimo `ideacao_passiva`, seguindo a mesma logica de nao suavizar por falta de informacao). Isso e **deterministico, sem LLM no caminho de decisao** — o LLM ja rodou pra produzir a extracao, mas a decisao de criar alerta le so o campo booleano estruturado, sem novo julgamento de modelo.

## Migracao (orquestrador, blast radius alto)

1. Novo enum `alerta_risco_origem`: `diario_sessao` | `registro_pensamento` | `instrumento_formal`.
2. Nova coluna `origem alerta_risco_origem NOT NULL DEFAULT 'diario_sessao'` (linhas existentes sao todas do diario, default correto e nao mascara nada).
3. Novas colunas nullable: `rpd_entry_id uuid REFERENCES tcc_rpd_entry(id)`, `origem_extraction_id uuid REFERENCES extraction(id)`.
4. `session_id` deixa de ser sempre obrigatorio — CHECK `alerta_risco_vinculo` relaxado:
   ```sql
   CHECK (
     (pseudonimizado_em IS NULL AND patient_id IS NOT NULL AND (
       (origem = 'diario_sessao' AND session_id IS NOT NULL)
       OR (origem = 'registro_pensamento' AND rpd_entry_id IS NOT NULL)
       OR (origem = 'instrumento_formal' AND origem_extraction_id IS NOT NULL)
     ))
     OR (pseudonimizado_em IS NOT NULL AND patient_id IS NULL AND session_id IS NULL AND rpd_entry_id IS NULL AND origem_extraction_id IS NULL)
   )
   ```
5. **A FK composta anti-IDOR `(patient_id, clinic_id)` NAO muda.** Nao tocar.
6. `app_criar_alerta_risco` ganha `p_origem`, `p_rpd_entry uuid DEFAULT NULL`, `p_origem_extraction uuid DEFAULT NULL`. Guard interno vira `CASE p_origem`: `diario_sessao` mantem o guard atual (sessao pertence a paciente+clinica); `registro_pensamento` guarda `tcc_rpd_entry.patient_id = p_patient AND tcc_rpd_entry.clinic_id = v_clinic` (mesmo predicado da policy `tcc_rpd_entry_select`, regra 5 do CLAUDE.md); `instrumento_formal` guarda `extraction.patient_id = p_patient AND extraction.clinic_id = v_clinic` (conferir predicado exato da policy de leitura de `extraction` antes de escrever — LER, nao presumir). `p_session` vira opcional (`DEFAULT NULL`). Dedupe por `(origem, COALESCE(session_id, rpd_entry_id, origem_extraction_id), trecho_fonte, categoria, severidade)`.
7. Migracao isolada de enum (mesma restricao das anteriores: `ADD VALUE`... espera, `alerta_risco_origem` e enum NOVO, nao ADD VALUE em existente — pode ser criado e usado na MESMA transacao, a restricao so vale pra `ALTER TYPE ... ADD VALUE` em enum ja existente). `CREATE OR REPLACE FUNCTION` pode estar na mesma leva do `CREATE TYPE` novo.
8. Verificar em `information_schema` (colunas) + `pg_proc` (`prosecdef` da funcao atualizada) apos aplicar — nao so `git log`.

## Requisitos de codigo (subagents)

- R1 `src/lib/risco/registrar.ts`: nova funcao (ou parametro extra na existente) `registrarAlertaRiscoRPD(ctx, {patientId, rpdEntryId, categoria, severidade, certeza, trechoFonte, detalhe})` chamando `app_criar_alerta_risco` com `p_origem='registro_pensamento'`. Mesma forma de retorno (`{alertaId} | {erro}`), nunca lanca.
- R2 `src/app/(app)/pacientes/[id]/tcc/logic.ts` (`salvarRPDCore`): depois do INSERT commitar (fora da transacao de escrita do RPD, mesmo padrao do diario — falha no alerta NAO derruba o salvamento do RPD), varredura deterministica (keyword, ver acima) nos campos de texto do RPD recem-salvo. Se casar, chama R1. Erro de registro de alerta aparece no retorno pra UI (campo tipo `alertaRiscoErro`), sem impedir o RPD de ter sido salvo.
- R3 Achar onde linhas de `extraction` com `subtipo='aplicacao_escala_relatada'` sao criadas a partir do output do agente (provavelmente `diario/[sessionId]/logic.ts`, perto de onde `alertaRisco` do diario ja e tratado — LER o arquivo, nao presumir). Adicionar: apos persistir a extracao, se `item_risco_positivo !== false` no payload, chamar `app_criar_alerta_risco` (via nova funcao `registrarAlertaRiscoInstrumento` em `registrar.ts`, `p_origem='instrumento_formal'`) com os valores fixos descritos acima (categoria/certeza/severidade). Falha no alerta nao derruba a extracao ja persistida, erro visivel.
- R4 `src/lib/extraction/prompt.ts`: `SYSTEM_PROMPT` (ABA) ganha regra **R20** de alerta de risco, mesmo teor de R5-TC ("Alerta de risco obrigatório para qualquer menção a ideação suicida, autolesão ou violência — sempre, sem exceção, falso positivo aceitável, falso negativo não"), adaptada ao estilo de numeracao `Rn` (nao `Rn-TC`) do prompt ABA. Teste em `prompt.test.ts` assertando presenca.
- R5 Nomenclatura: nenhuma string "SLA" nova em nenhum arquivo tocado (grep de auditoria antes de fechar).
- R6 Testes de integracao/RLS (mesmo padrao de `db/tests/alerta-risco-rls.int.test.ts` — `owner` + `TRUNCATE` + seed fixo + `ctx()` + `withTenant`):
  - RPD com ideacao no texto cria linha em `alerta_risco_clinico` com `origem='registro_pensamento'`, `rpd_entry_id` correto.
  - RPD sem sinal nao cria alerta.
  - Extracao `aplicacao_escala_relatada` com `item_risco_positivo=true` cria alerta com `origem='instrumento_formal'`, `certeza='explicito'`, sem chamar LLM (teste prova isso testando so a funcao/camada determinística, nao o pipeline de extracao inteiro).
  - `item_risco_positivo=null` cria alerta com `certeza='ambiguo_citado'`.
  - `item_risco_positivo=false` NAO cria alerta.
  - Alerta ancorado em RPD/instrumento respeita `alerta_risco_scope` (visivel pra equipe do paciente mesmo sem `session_id`).

## Invariantes (nao quebrar, checklist de revisao)

- [ ] Nenhuma notificacao externa (familia/SAMU/policia/Conselho Tutelar) — motor so cria linha em `alerta_risco_clinico`, nada de e-mail/SMS pra fora da clinica.
- [ ] Alerta dispara ANTES da revisao do terapeuta (RPD: no salvamento; instrumento: na criacao da extracao, nao na aprovacao).
- [ ] Severidade/prazo resolvidos so no banco (`app_prazo_risco_minutos`), nunca calculados/forjados no cliente.
- [ ] `app_role` continua sem INSERT direto em `alerta_risco_clinico` (so via funcao SECURITY DEFINER).
- [ ] Nenhuma string "SLA de atendimento".
- [ ] Editar RPD depois (remover evidencia de ideacao) NAO apaga alerta ja criado.

## Fora de escopo

Adocao formal da C-SSRS. Tabela persistida de instrumento formal completa (#393 — aqui so le o campo estruturado que ja existe na extracao).
