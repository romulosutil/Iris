ALTER TABLE "tcc_rpd_entry" ADD COLUMN "origem_extraction_id" uuid;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD COLUMN "origem_agente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tcc_rpd_entry" ADD CONSTRAINT "tcc_rpd_entry_origem_extraction_id_extraction_id_fk" FOREIGN KEY ("origem_extraction_id") REFERENCES "public"."extraction"("id") ON DELETE no action ON UPDATE no action;

-- A partir daqui é escrito à mão (#392). Relaxa o CHECK `alerta_risco_vinculo`
-- (criado na 0111, já commitado/PR #401 — NÃO editar aquele arquivo, memória
-- `editar-migracao-aplicada-nao-roda`): um alerta com `origem='registro_pensamento'`
-- passa a aceitar `origem_extraction_id IS NOT NULL` como âncora alternativa a
-- `rpd_entry_id IS NOT NULL` — cobre o RPD SUGERIDO (extração ainda não
-- aprovada, a linha em `tcc_rpd_entry` não existe ainda). Texto base copiado
-- literal de `0111_alerta_risco_origem_rpd_instrumento.sql`, só o branch
-- `registro_pensamento` muda (OR novo). FK composta anti-IDOR
-- (`alerta_risco_clinico_patient_id_clinic_id_fk`) e os demais branches do
-- CHECK (diario_sessao, instrumento_formal, pseudonimização) ficam intocados.
ALTER TABLE "alerta_risco_clinico" DROP CONSTRAINT "alerta_risco_vinculo";--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD CONSTRAINT "alerta_risco_vinculo" CHECK (("alerta_risco_clinico"."pseudonimizado_em" IS NULL
            AND "alerta_risco_clinico"."patient_id" IS NOT NULL
            AND (
              ("alerta_risco_clinico"."origem" = 'diario_sessao' AND "alerta_risco_clinico"."session_id" IS NOT NULL)
              OR ("alerta_risco_clinico"."origem" = 'registro_pensamento' AND ("alerta_risco_clinico"."rpd_entry_id" IS NOT NULL OR "alerta_risco_clinico"."origem_extraction_id" IS NOT NULL))
              OR ("alerta_risco_clinico"."origem" = 'instrumento_formal' AND "alerta_risco_clinico"."origem_extraction_id" IS NOT NULL)
            ))
       OR ("alerta_risco_clinico"."pseudonimizado_em" IS NOT NULL
            AND "alerta_risco_clinico"."patient_id" IS NULL
            AND "alerta_risco_clinico"."session_id" IS NULL
            AND "alerta_risco_clinico"."rpd_entry_id" IS NULL
            AND "alerta_risco_clinico"."origem_extraction_id" IS NULL));--> statement-breakpoint

-- `app_criar_alerta_risco` (definer, 0049, últimos parâmetros novos na 0111)
-- também precisa mudar: o guard do branch `registro_pensamento` só aceitava
-- `p_rpd_entry` como âncora (`tcc_rpd_entry` existente). O RPD SUGERIDO ainda
-- não tem linha em `tcc_rpd_entry` — ancorar por `p_origem_extraction`
-- (mesma checagem `extraction JOIN session` já usada no branch
-- `instrumento_formal`, extraction não tem patient_id direto). Assinatura
-- (10 parâmetros, mesmos tipos da 0111) é idêntica — `CREATE OR REPLACE`
-- SUBSTITUI a função existente, não cria overload nova (ao contrário do caso
-- documentado na 0111, aqui os tipos batem exatamente). Corpo copiado da
-- 0111, só o branch `registro_pensamento` do CASE muda.
CREATE OR REPLACE FUNCTION app_criar_alerta_risco(
  p_patient           uuid,
  p_session           uuid,
  p_categoria         alerta_risco_categoria,
  p_severidade        alerta_risco_severidade,
  p_certeza           alerta_risco_certeza,
  p_trecho            text,
  p_detalhe           text,
  p_origem            alerta_risco_origem DEFAULT 'diario_sessao',
  p_rpd_entry         uuid DEFAULT NULL,
  p_origem_extraction uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic  uuid := app_clinic_id_exigido();
  v_minutos integer;
  v_id      uuid;
BEGIN
  IF p_trecho IS NULL OR btrim(p_trecho) = '' THEN
    RAISE EXCEPTION 'app_criar_alerta_risco: trecho_fonte literal é obrigatório';
  END IF;

  CASE p_origem
    WHEN 'diario_sessao' THEN
      IF NOT EXISTS (
        SELECT 1 FROM session s
         WHERE s.id = p_session
           AND s.patient_id = p_patient
           AND s.clinic_id = v_clinic
      ) THEN
        RAISE EXCEPTION 'app_criar_alerta_risco: sessão inexistente ou sem permissão';
      END IF;
    WHEN 'registro_pensamento' THEN
      -- #392: âncora dupla — RPD já aprovado (`p_rpd_entry`) OU sugestão
      -- pendente de aprovação (`p_origem_extraction`, mesma checagem do
      -- branch `instrumento_formal` abaixo). Exatamente uma das duas é
      -- esperada; nenhuma das duas é erro do chamador, não falha aberta.
      IF p_rpd_entry IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM tcc_rpd_entry r
           WHERE r.id = p_rpd_entry
             AND r.patient_id = p_patient
             AND r.clinic_id = v_clinic
        ) THEN
          RAISE EXCEPTION 'app_criar_alerta_risco: registro de pensamento inexistente ou sem permissão';
        END IF;
      ELSIF p_origem_extraction IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM extraction e
           JOIN session s ON s.id = e.session_id
           WHERE e.id = p_origem_extraction
             AND e.clinic_id = v_clinic
             AND s.patient_id = p_patient
        ) THEN
          RAISE EXCEPTION 'app_criar_alerta_risco: extração inexistente ou sem permissão';
        END IF;
      ELSE
        RAISE EXCEPTION 'app_criar_alerta_risco: registro_pensamento exige rpd_entry_id ou origem_extraction_id';
      END IF;
    WHEN 'instrumento_formal' THEN
      IF NOT EXISTS (
        SELECT 1 FROM extraction e
         JOIN session s ON s.id = e.session_id
         WHERE e.id = p_origem_extraction
           AND e.clinic_id = v_clinic
           AND s.patient_id = p_patient
      ) THEN
        RAISE EXCEPTION 'app_criar_alerta_risco: extração inexistente ou sem permissão';
      END IF;
  END CASE;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  SELECT a.id INTO v_id
    FROM alerta_risco_clinico a
   WHERE a.origem = p_origem
     AND a.session_id IS NOT DISTINCT FROM p_session
     AND a.rpd_entry_id IS NOT DISTINCT FROM p_rpd_entry
     AND a.origem_extraction_id IS NOT DISTINCT FROM p_origem_extraction
     AND a.trecho_fonte = p_trecho
     AND a.categoria = p_categoria
     AND a.severidade = p_severidade
     AND a.deletado_em IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_minutos := app_prazo_risco_minutos(p_severidade, p_certeza);

  INSERT INTO alerta_risco_clinico (
    clinic_id, patient_id, session_id, origem, rpd_entry_id, origem_extraction_id,
    categoria, severidade, certeza, trecho_fonte, detalhe,
    prazo_minutos, prazo_reconhecimento, atualizado_por
  ) VALUES (
    v_clinic, p_patient, p_session, p_origem, p_rpd_entry, p_origem_extraction,
    p_categoria, p_severidade, p_certeza, p_trecho, p_detalhe,
    v_minutos, now() + make_interval(mins => v_minutos),
    app_user_id_atual()
  ) RETURNING id INTO v_id;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, app_user_id_atual(),
          'alerta_risco_criado', 'alerta_risco_clinico', v_id, p_patient,
          jsonb_build_object('severidade', p_severidade, 'certeza', p_certeza,
                             'origem', p_origem, 'prazo_minutos', v_minutos));

  RETURN v_id;
END;
$$;

-- Sem GRANT novo: assinatura idêntica à da 0111, `app_role` já tem EXECUTE
-- nela (0111 já concedeu). `CREATE OR REPLACE` não revoga grants existentes.