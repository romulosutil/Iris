-- #174, regra 6 — registrar atendimento novo para paciente arquivado desarquiva.
--
-- POR QUE UMA FUNÇÃO E NÃO UM UPDATE DIRETO:
-- `patient_update` (0001) só admite `admin_recepcao` e `coordenador`. Quem grava
-- diário/nota de sessão é o TERAPEUTA. Um `UPDATE patient SET arquivado_em =
-- NULL` no caminho de gravação da sessão não daria erro — a RLS simplesmente
-- filtraria a linha e o UPDATE afetaria 0 linhas em silêncio. O resultado seria
-- o pior dos mundos: código que parece funcionar, paciente que continua
-- arquivado, e a clínica deixando de faturar um paciente em atendimento ativo.
--
-- POR QUE NÃO AFROUXAR `patient_update` PARA TERAPEUTA:
-- Isso abriria TODAS as colunas mutáveis de `patient` (nome, nascimento,
-- convênio, alta_em…) para o terapeuta, de uma vez, para resolver uma transição
-- de uma coluna. A função DEFINER mantém a superfície em exatamente
-- `arquivado_em: NOT NULL -> NULL`.
--
-- GUARD = FRONTEIRA DE AUTORIZAÇÃO:
-- Sendo SECURITY DEFINER, esta função bypassa RLS, então o guard interno é a
-- única barreira. Ele espelha o predicado de LEITURA `patient_select` (0001) —
-- clínica correta E (coordenador/admin_recepcao OU membro vigente da equipe) —
-- e não o de UPDATE. É a escolha certa aqui: quem pode LER o paciente e está
-- registrando atendimento dele é exatamente quem pode reativá-lo. Copiar o
-- predicado da leitura, e não inventar um novo, é a regra do repo (ver 0048).
--
-- Retorna `true` só quando de fato houve transição, para que o chamador grave
-- a linha de `audit_log` uma única vez — e não a cada nota de sessão.
CREATE OR REPLACE FUNCTION app_desarquivar_paciente(p_patient uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_afetadas int;
BEGIN
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  -- Paridade exata com patient_select (0001).
  IF NOT (current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
          OR app_is_on_team(p_patient)) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da equipe do chamador (autorização cross-team)', p_patient;
  END IF;

  -- `arquivado_em IS NOT NULL` torna a chamada idempotente: gravar cinco notas
  -- na mesma sessão desarquiva uma vez e devolve false nas outras quatro.
  UPDATE patient
     SET arquivado_em = NULL
   WHERE id = p_patient
     AND arquivado_em IS NOT NULL;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_desarquivar_paciente(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_desarquivar_paciente(uuid) TO app_role;
