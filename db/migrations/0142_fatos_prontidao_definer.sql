-- Task 7c — `app_fatos_prontidao`, definer para o terapeuta de cobertura.
--
-- MOTIVAÇÃO (D-A10, docs/superpowers/plans/2026-09-02-task-7c-definer-fatos-prontidao.md):
-- `goal_select` (0006_fase2_rls.sql:207) autoriza `coordenador` OU
-- `app_is_on_team(patient_id)` e não tem recorte de terapeuta de cobertura,
-- mesmo a 0092 (D8/#174) já reconhecendo `session.terapeuta_id` /
-- `session.atendido_por_id` como autorização clínica legítima. Sem este
-- definer, um terapeuta de cobertura documentando a própria sessão lê
-- `temMetaAtiva = false` para uma meta que existe, e o gate fail-closed o
-- bloqueia — regressão medida na Task 7b, contornada só na fixture de teste.
--
-- DESVIO do §3 do plano, mecânico: o plano copia o guard de `0092` usando
-- `current_setting('app.user_role')`/`current_setting('app.user_id')::uuid`
-- CRUS — mas esse é o texto ORIGINAL da `0092` (anterior ao D23). A `0093`
-- (`0093_user_role_id_helpers.sql`) já REESCREVEU `app_desarquivar_paciente`
-- (a própria `0092`) para `app_user_role_exigido()`/`app_user_id_exigido()`,
-- e `clinic-id-helper-rls.int.test.ts` (D23) trava toda função NOVA em
-- `public` que use o padrão cru — o guard aqui usa os helpers para não
-- quebrar essa trava e para não introduzir a ÚNICA função DEFINER pós-D23
-- fora do padrão. A lógica de autorização (D-A10 a D-A13) é idêntica; só a
-- resolução de `app.user_role`/`app.user_id` mudou de crua para helper.
--
-- 7ª COLUNA, `modalidade`: a lacuna de cobertura não para nos seis fatos.
-- `patient_select` (`0085:224`) é `clinic + (coordenador|admin_recepcao|
-- app_is_on_team)`, também SEM recorte de cobertura — a cobertura não lê a
-- linha `patient` NENHUMA, e `patient.clinical_modality` é entrada da MESMA
-- régua (`montarProntidao`, degrau "modalidade", bloqueante). Lida pelo
-- `leftJoin` de `logic.ts`, ela vinha `null` para a cobertura e a régua
-- recusava por modalidade ausente — o bloqueio indevido reaparecia um campo
-- adiante do que os seis fatos fecharam. Devolvê-la AQUI mantém uma porta
-- só e um guard só; alargar `patient_select` exporia a linha `patient`
-- inteira (PII) a quem só precisa de um enum.
--
-- `DROP` antes do `CREATE`: `CREATE OR REPLACE` não troca o tipo de retorno
-- de uma função existente (`42P13`). A `0142` nunca saiu desta máquina, e o
-- par DROP+CREATE deixa a migração idempotente para quem já aplicou a versão
-- de seis colunas localmente.

DROP FUNCTION IF EXISTS app_fatos_prontidao(uuid[]);
--> statement-breakpoint

CREATE FUNCTION app_fatos_prontidao(p_patients uuid[])
RETURNS TABLE (
  patient_id uuid,
  tem_ficha_clinica boolean,
  tem_anamnese boolean,
  tem_protocolo_ativo boolean,
  tem_meta_ativa boolean,
  tem_instrumento_aplicado boolean,
  tem_sessao_consolidada boolean,
  -- Enum real, não `text`: uma renomeação em `clinical_modality` quebra alto
  -- aqui em vez de virar string solta do outro lado.
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
      RAISE EXCEPTION 'app_fatos_prontidao: paciente % fora da clínica do chamador (isolamento multi-tenant)', v_pac;
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
    EXISTS (SELECT 1 FROM session_snapshot x WHERE x.patient_id = p.id),
    p.clinical_modality
  FROM patient p
  WHERE p.id = ANY(p_patients);
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_fatos_prontidao(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_fatos_prontidao(uuid[]) TO app_role;
