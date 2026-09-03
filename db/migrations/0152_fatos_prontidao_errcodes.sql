-- `app_fatos_prontidao` — ERRCODE dedicado por guarda (#559, desvio D da spec
-- `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`).
--
-- MOTIVAÇÃO. A §4a da spec define `obterFatosProntidao` devolvendo
-- `FatosProntidao | null`, onde `null` cobre DOIS casos e só dois:
--   (a) o paciente não é visível para este papel (fora da equipe e sem
--       recorte de cobertura);
--   (b) o paciente não existe, ou é de outra clínica.
-- Exceção fica reservada para falha REAL de leitura — e aí o cartão da
-- prontidão some, em vez de afirmar "Aguardando coordenação" sobre um
-- prontuário que ninguém conseguiu ler (memória `erro-renderizado-como-empty-state`,
-- achado R-1 da auditoria de 02/09).
--
-- A `0149` já distingue os dois casos com `RAISE EXCEPTION`, mas SEM `USING
-- ERRCODE`: o SQLSTATE cai no default do PL/pgSQL, `P0001`. E `P0001` é o
-- código de TODO `RAISE` do repositório — `app_clinic_id_exigido()` (`0085`),
-- `app_user_role_exigido()`/`app_user_id_exigido()` (`0093`),
-- `app_conta_somente_leitura()` (`0073`), `job_heartbeat` (`0146`). Um
-- `catch (P0001) → null` na camada TypeScript transformaria "o helper de
-- tenant falhou" em "Aguardando coordenação" na tela: exatamente o defeito
-- que R-1 existe para matar.
--
-- Casar por TEXTO da mensagem também está fora: o Drizzle embrulha o erro do
-- driver e a `.message` do `DrizzleQueryError` é o SQL que NÓS mandamos com
-- os `params` interpolados, não a exceção do banco (ver `mensagemPg`,
-- `src/db/pg-error.ts`). Mensagem é diagnóstico humano; não é contrato.
--
-- Resta o SQLSTATE. Esta migração dá um código PRÓPRIO a cada uma das duas
-- guardas, e só a elas — qualquer outro SQLSTATE continua propagando.
--
-- ESCOLHA DOS CÓDIGOS. O padrão SQL reserva as classes que começam com os
-- caracteres `5`-`9` e `I`-`Z` para condições definidas pela implementação. O
-- Postgres não usa NENHUMA classe iniciada por `I` (as dele são `00`-`58`,
-- `72`, `F0`, `HV`, `P0`, `XX`) e o repositório inteiro só emitia `P0001` até
-- aqui (`grep -rn ERRCODE db/migrations/`). Classe `IR` (Iris), portanto,
-- não colide nem com o Postgres nem com o repo:
--
--   IR001 — isolamento multi-tenant: paciente fora da clínica do chamador OU
--           inexistente. A spec junta os dois DE PROPÓSITO: distinguir
--           "não existe" de "existe em outra clínica" já seria vazamento de
--           existência cross-tenant. Do lado TypeScript vira `null` COM log
--           de segurança — é tentativa de leitura fora do tenant e tem valor
--           de auditoria.
--   IR002 — autorização clínica: fora da equipe e sem recorte de cobertura
--           por sessão. Do lado TypeScript vira `null` SEM log: é rotina
--           (todo terapeuta abre a lista de pacientes que não são dele).
--
-- O QUE NÃO MUDA. O corpo do guard é o da `0149`, caractere a caractere:
-- `app_patient_in_clinic`, `app_user_role_exigido()`, `app_is_on_team` e o
-- `EXISTS` de cobertura com `app_clinic_id_exigido()`/`app_user_id_exigido()`.
-- Nenhum predicado afrouxado; nenhuma linha nova devolvida. A função continua
-- em `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts`, D23) e
-- continua `SECURITY DEFINER SET search_path = public`. As MENSAGENS também
-- são as mesmas — `db/tests/fatos-prontidao-definer.int.test.ts` casa por
-- texto para diagnóstico; o CÓDIGO é que passa a ser o contrato.
--
-- `CREATE OR REPLACE` e não `DROP`+`CREATE`: a assinatura e o tipo de retorno
-- são idênticos aos da `0149`, então não há `42P13` a contornar, e o REPLACE
-- preserva o `GRANT EXECUTE` para `app_role` já concedido lá.

CREATE OR REPLACE FUNCTION app_fatos_prontidao(p_patients uuid[])
RETURNS TABLE (
  patient_id uuid,
  tem_ficha_clinica boolean,
  tem_anamnese boolean,
  tem_protocolo_ativo boolean,
  tem_meta_ativa boolean,
  tem_instrumento_aplicado boolean,
  tem_sessao_consolidada boolean,
  modalidade clinical_modality
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
      RAISE EXCEPTION 'app_fatos_prontidao: paciente % fora da clínica do chamador (isolamento multi-tenant)', v_pac
        USING ERRCODE = 'IR001';
    END IF;

    IF NOT (
      app_user_role_exigido() = 'coordenador'
      OR app_is_on_team(v_pac)
      OR EXISTS (
        SELECT 1 FROM session s
         WHERE s.patient_id = v_pac
           AND s.clinic_id = app_clinic_id_exigido()
           AND (s.terapeuta_id = app_user_id_exigido()
                OR s.atendido_por_id = app_user_id_exigido())
      )
    ) THEN
      RAISE EXCEPTION 'app_fatos_prontidao: paciente % fora da equipe ou cobertura do chamador (autorização cross-team)', v_pac
        USING ERRCODE = 'IR002';
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
    EXISTS (SELECT 1 FROM session_snapshot x WHERE x.patient_id = p.id),
    p.clinical_modality
  FROM patient p
  WHERE p.id = ANY(p_patients);
END; $$;
--> statement-breakpoint

-- Repetidos por segurança: `CREATE OR REPLACE` preserva os privilégios da
-- `0149`, mas quem restaurar um banco onde só esta migração rodou (ou quem
-- recriar a função à mão) não pode ficar sem o par REVOKE/GRANT.
REVOKE ALL ON FUNCTION app_fatos_prontidao(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_fatos_prontidao(uuid[]) TO app_role;
