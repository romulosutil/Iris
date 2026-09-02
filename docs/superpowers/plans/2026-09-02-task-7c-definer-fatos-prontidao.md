# Task 7c — `app_fatos_prontidao`, definer para o terapeuta de cobertura

> Adendo ao plano `2026-09-01-prontidao-do-prontuario.md`. Nasce de uma
> regressão medida na Task 7b, não de uma hipótese.
> Decisão do Rômulo em 02/09/2026: definer espelhando a `0092`.

## 1. O defeito, medido

Ligar `assertPodeDocumentar` no caminho de escrita expôs um vão real da RLS.

`goal_select` (`db/migrations/0006_fase2_rls.sql:207`) autoriza:

```sql
clinic_id = current_setting('app.clinic_id')::uuid
AND (current_setting('app.user_role') = 'coordenador' OR app_is_on_team(patient_id))
```

Não há recorte de **terapeuta de cobertura**. Mas a `0092` (D8/#174) já
estabeleceu que cobertura é autorização clínica legítima: quem tem
`session.terapeuta_id` ou `session.atendido_por_id` apontando para si pode
atender e gravar nota (`session_note_insert`).

Consequência da Task 7b: um terapeuta de cobertura, documentando a **própria**
sessão, lê `temMetaAtiva = false` para uma meta que existe, e o gate — fiel ao
desenho fail-closed — o barra. A branch, como está, quebraria a cobertura.

A Task 7b contornou isso na **fixture** de teste (uma linha de
`care_team_membership`), não em produção. Este adendo é o conserto real.

## 2. Decisões

| #         | Decisão                                                                                                                      | Racional                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-A10** | Um `SECURITY DEFINER` que lê os fatos, com guard interno copiando o predicado de leitura + o recorte de cobertura da `0092`. | É o único caminho que devolve fato VERDADEIRO ao terapeuta legítimo sem afrouxar `goal_select` para todo mundo.                                                                                                                                                    |
| **D-A11** | O guard **NÃO** autoriza `admin_recepcao`, divergindo da `0092` de propósito.                                                | A `0092` escreve `arquivado_em` (dado administrativo, e a recepção arquiva). Esta função devolve estado clínico, que D-A9 proíbe à recepção. Copiar a `0092` inteira aqui reintroduziria o vazamento que D-A9 fechou.                                              |
| **D-A12** | Assinatura recebe `uuid[]` e devolve `SETOF`, não um paciente por chamada.                                                   | A lista `/pacientes` precisa dos mesmos fatos para N pacientes. Uma função escalar viraria N+1, ou obrigaria a lista a manter uma cópia dos seis `EXISTS` — uma terceira semântica de visibilidade, divergente das outras duas no primeiro terapeuta de cobertura. |
| **D-A13** | Guard reprovado **levanta exceção**, não devolve tudo `false`.                                                               | `false` silencioso é exatamente o defeito que este adendo conserta. Erro nomeado é diagnosticável.                                                                                                                                                                 |

## 3. A migração

`db/migrations/0149_fatos_prontidao_definer.sql`. Entrada manual no
`_journal.json`: `idx: 142`, `when: 1788190225804` (= `1788190224804` da `0141`
**+ 1000**). `when` menor ou igual ao máximo faz o Drizzle **pular o arquivo em
silêncio** — foi o que aconteceu com a `0055` em produção (#165).

Não toca `schema.ts` e não altera snapshot: função + grants são DDL que o
Drizzle não modela.

```sql
CREATE OR REPLACE FUNCTION app_fatos_prontidao(p_patients uuid[])
RETURNS TABLE (
  patient_id uuid,
  tem_ficha_clinica boolean,
  tem_anamnese boolean,
  tem_protocolo_ativo boolean,
  tem_meta_ativa boolean,
  tem_instrumento_aplicado boolean,
  tem_sessao_consolidada boolean
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pac uuid;
BEGIN
  -- 1. Isolamento multi-tenant, por paciente. INEGOCIÁVEL e primeiro.
  -- 2. Autorização clínica: espelha `goal_select` MAIS o recorte de cobertura
  --    que a 0092 (D8/#174) já reconhece como legítimo.
  --    `admin_recepcao` NÃO entra, ao contrário da 0092: aquela função escreve
  --    `arquivado_em` (administrativo); esta devolve estado clínico.
  FOREACH v_pac IN ARRAY p_patients LOOP
    IF NOT app_patient_in_clinic(v_pac) THEN
      RAISE EXCEPTION 'app_fatos_prontidao: paciente % fora da clínica do chamador (isolamento multi-tenant)', v_pac;
    END IF;

    IF NOT (
      current_setting('app.user_role') = 'coordenador'
      OR app_is_on_team(v_pac)
      OR EXISTS (
        SELECT 1 FROM session s
         WHERE s.patient_id = v_pac
           AND s.clinic_id = app_clinic_id_exigido()
           AND (s.terapeuta_id = (current_setting('app.user_id'))::uuid
                OR s.atendido_por_id = (current_setting('app.user_id'))::uuid)
      )
    ) THEN
      RAISE EXCEPTION 'app_fatos_prontidao: paciente % fora da equipe ou cobertura do chamador (autorização cross-team)', v_pac;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    p.id,
    EXISTS (SELECT 1 FROM patient_clinical_profile x WHERE x.patient_id = p.id),
    EXISTS (SELECT 1 FROM anamnese x WHERE x.patient_id = p.id),
    EXISTS (SELECT 1 FROM patient_protocol x WHERE x.patient_id = p.id AND x.desativado_em IS NULL),
    EXISTS (SELECT 1 FROM goal x WHERE x.patient_id = p.id AND x.estado = 'ativa'),
    EXISTS (SELECT 1 FROM instrumento_aplicacao x WHERE x.patient_id = p.id),
    EXISTS (SELECT 1 FROM session_snapshot x WHERE x.patient_id = p.id)
  FROM patient p
  WHERE p.id = ANY(p_patients);
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_fatos_prontidao(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_fatos_prontidao(uuid[]) TO app_role;
```

## 4. O que muda na aplicação

- `obterFatosProntidaoNaTx(tx, patientId)` troca os seis `EXISTS` inline por
  `SELECT * FROM app_fatos_prontidao(ARRAY[$1]::uuid[])`.
- `listarTodosPacientes` troca os seis `exists(...)` correlacionados por **uma**
  chamada com o array de ids da página, casada por `patient_id`.
- As duas portas passam a ler pelo mesmo predicado — que é o ponto.
- A linha de `care_team_membership` que a Task 7b acrescentou à fixture de
  `actions.int.test.ts` como contorno **sai**, e o teste de cobertura volta a
  provar o que devia.

## 5. Prova

| Alvo                            | Critério                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| cobertura                       | terapeuta com `session.terapeuta_id = self`, FORA da equipe, lê `tem_meta_ativa = true`                                                          |
| cobertura por `atendido_por_id` | idem, pelo segundo campo que a `0092` reconhece                                                                                                  |
| fora de tudo                    | terapeuta sem equipe e sem sessão → **exceção**, não `false`                                                                                     |
| recepção                        | `admin_recepcao` → **exceção** (D-A11), nunca fatos                                                                                              |
| cross-tenant                    | paciente de outra clínica → exceção de isolamento                                                                                                |
| lote                            | array com um paciente autorizado e um de outra clínica → exceção, nenhuma linha                                                                  |
| guard D16                       | `app_clinic_id_exigido()`, nunca `current_setting` cru                                                                                           |
| guard D23                       | `app_fatos_prontidao` entra em `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts:273`); a asserção de tamanho passa de 21 para 22 |
| migração aplicada               | conferir em `pg_proc` que a função existe e que `prosecdef` é `true` — `git log` não prova execução                                              |

## 6. Anti-padrões

- ❌ Autorizar `admin_recepcao` por simetria com a `0092` (D-A11).
- ❌ Devolver `false` quando o guard reprova (D-A13).
- ❌ Deixar a lista com a cópia dos seis `EXISTS` (D-A12).
- ❌ Afrouxar `goal_select` para reconhecer cobertura: abriria a leitura de
  metas por um caminho que ninguém pediu, para toda query da aplicação.
- ❌ Escrever a entrada do `_journal.json` com `when` ≤ o da `0141`.

## 7. Adendo (02/09/2026) — a lacuna não parava nos seis fatos

Descoberto ao rodar a suíte com o contorno de fixture já removido: com
`care_team_membership` fora, o terapeuta de cobertura passou a falhar no degrau
**modalidade**, não nos seis fatos. Dois testes de `actions.int.test.ts`
(cobertura recebe o próximo número; regra 6 / D8 salva diário E desarquiva)
ficaram vermelhos com `ProntuarioIncompletoError: ... falta definir a
modalidade clínica`.

**Causa.** `patient_select` (`0085_policies_tenant_helper.sql:224`) é
`clinic_id = app_clinic_id_exigido() AND (papel IN (coordenador,
admin_recepcao) OR app_is_on_team(id))` — também sem recorte de cobertura. A
cobertura não lê a linha `patient` NENHUMA, e `patient.clinical_modality` é
entrada da MESMA régua. O `leftJoin` de `logic.ts` (Task 7b, deliberado e
documentado) fazia `clinicalModality` chegar `null`, e a régua recusava por
modalidade ausente. O fluxo D8/regra 6 estava quebrado em produção pela 7b.

**Decisão.** A `0144` ganha uma 8ª coluna de retorno, `modalidade
clinical_modality`. Mesma porta, mesmo guard, nenhuma policy tocada.

| Alternativa                                                     | Por que não                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Alargar `patient_select` com o recorte de cobertura             | expõe a linha `patient` inteira (PII) a quem precisa de um enum; muda a leitura de paciente para toda a aplicação |
| Manter o `care_team_membership` na fixture e registrar a lacuna | deixa o fluxo D8/regra 6 quebrado em produção, com teste verde                                                    |

**Divergências que a decisão assume, nomeadas.** O §7 da spec manda que o guard
de um definer copie o predicado EXATO da policy de leitura correspondente. Para
a coluna `modalidade` a policy correspondente é `patient_select`, e o guard
diverge dela nas duas direções:

- **Mais estrito:** `patient_select` autoriza `admin_recepcao`; o guard não
  (D-A11). Direção fail-closed — a recepção nunca lê pela função.
- **Mais frouxo:** `patient_select` não reconhece cobertura; o guard sim. É a
  mesma exceção D-A10 já ratificada para `goal_select`, aplicada ao mesmo
  chamador (a régua de documentação) e ao mesmo recorte da `0092`.

**`DROP FUNCTION` antes do `CREATE`.** `CREATE OR REPLACE` não troca o tipo de
retorno de uma função existente (`42P13`). A `0144` nunca saiu da máquina de
desenvolvimento; o par DROP+CREATE deixa a migração idempotente para quem já
aplicou a versão de seis colunas localmente.

**Prova acrescentada.** Terapeuta de cobertura FORA da equipe lê a `modalidade`
REAL do paciente, não `null` (`db/tests/fatos-prontidao-definer.int.test.ts`) —
sem esse caso a coluna nova não tem oráculo. E os dois testes de
`actions.int.test.ts` ficam verdes SEM tocar na fixture: adicionar
`care_team_membership` de volta seria reintroduzir o contorno que esta task
existe para remover.

## 8. Anti-padrões (adendo)

- ❌ Reintroduzir `care_team_membership` para `U_COBERTURA` em
  `actions.int.test.ts` para fazer o vermelho passar.
- ❌ Alargar `patient_select` para resolver a modalidade.
- ❌ Deixar em `logic.ts` os comentários que justificam o `leftJoin` depois que
  o `leftJoin` sai: comentário que descreve código morto mente mais que a
  ausência dele.

## 9. Renumeração para `0144` (02/09/2026)

A migração nasceu `0142`. Enquanto a branch trabalhava, `main` mergeou DUAS
migrações — `0142_alerta_trecho_fonte_guard_tenant` (#529) e
`0143_profissional_responsavel_da_sessao` (#539) — ocupando o mesmo `idx` e o
mesmo `when`. Quem acusou foi `src/db/migrations-vs-main.test.ts`, comparando
com `origin/main`: migração nova com `when` ≤ o maior de `main` fica pulável
em silêncio pelo próximo hand-migration (#165, #305, #306).

A branch integrou `main` e a nossa virou `0149_fatos_prontidao_definer`, com
`when` = 1788190227804 (o maior de `main` + 1000). Renumerar foi seguro só
porque esta migração nunca saiu da máquina de desenvolvimento — editar a tag
de uma migração já aplicada em produção não reexecuta nada, porque o Drizzle
aplica por tag.

**O que a renumeração exigiu além do rename**, e é onde se erra:

- Apagar o registro obsoleto em `drizzle.__drizzle_migrations` do banco local.
  O `0142` antigo ficou gravado com `created_at` = 1788190225804, **o mesmo
  `when` do `0142` de `main`** — e o Drizzle só aplica o que tem `when` maior
  que o máximo já aplicado. Sem apagar, o `0142` de `main` seria pulado EM
  SILÊNCIO no banco local.
- Trocar as 17 referências a `0142` espalhadas em comentários. Deixá-las
  apontaria para a migração de `main`, que é outra coisa. As referências a
  `0142` que sobraram em `db/tests/clinic-id-helper-rls.int.test.ts` são de
  `main` (#529) e estão certas.
- Somar os dois lados nos oráculos de conjunto exato do guard D16/D23, que as
  duas branches mexeram: `FUNCOES_COM_HELPER` 21 → **25**,
  `FUNCOES_COM_USER_ROLE_HELPER` 15 → **17**,
  `FUNCOES_COM_USER_ID_EXIGIDO_HELPER` 9 → **12**. Resolver a favor de um lado
  só apagaria a função do outro do oráculo.
- Em `logic.ts`, `main` (#539) reintroduziu a leitura de `sess` no passo 2,
  onde ela ficava antes da T07b. A T07b a ADIANTOU para antes da primeira
  escrita, porque a régua tem de correr na mesma transação e antes do upsert.
  A resolução mantém a leitura adiantada e o `app_session_definir_numero_
sequencial` de `main` — manter as duas seria redeclarar `sess`.
