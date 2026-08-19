CREATE TYPE "public"."alerta_risco_origem" AS ENUM('diario_sessao', 'registro_pensamento', 'instrumento_formal');--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" DROP CONSTRAINT "alerta_risco_vinculo";--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD COLUMN "origem" "alerta_risco_origem" DEFAULT 'diario_sessao' NOT NULL;--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD COLUMN "rpd_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD COLUMN "origem_extraction_id" uuid;--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD CONSTRAINT "alerta_risco_clinico_rpd_entry_id_tcc_rpd_entry_id_fk" FOREIGN KEY ("rpd_entry_id") REFERENCES "public"."tcc_rpd_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD CONSTRAINT "alerta_risco_clinico_origem_extraction_id_extraction_id_fk" FOREIGN KEY ("origem_extraction_id") REFERENCES "public"."extraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD CONSTRAINT "alerta_risco_vinculo" CHECK (("alerta_risco_clinico"."pseudonimizado_em" IS NULL
            AND "alerta_risco_clinico"."patient_id" IS NOT NULL
            AND (
              ("alerta_risco_clinico"."origem" = 'diario_sessao' AND "alerta_risco_clinico"."session_id" IS NOT NULL)
              OR ("alerta_risco_clinico"."origem" = 'registro_pensamento' AND "alerta_risco_clinico"."rpd_entry_id" IS NOT NULL)
              OR ("alerta_risco_clinico"."origem" = 'instrumento_formal' AND "alerta_risco_clinico"."origem_extraction_id" IS NOT NULL)
            ))
       OR ("alerta_risco_clinico"."pseudonimizado_em" IS NOT NULL
            AND "alerta_risco_clinico"."patient_id" IS NULL
            AND "alerta_risco_clinico"."session_id" IS NULL
            AND "alerta_risco_clinico"."rpd_entry_id" IS NULL
            AND "alerta_risco_clinico"."origem_extraction_id" IS NULL));--> statement-breakpoint

-- A partir daqui é escrito à mão (#391). `app_criar_alerta_risco` ganha 3
-- parâmetros novos, todos com DEFAULT — chamadas posicionais existentes (7
-- argumentos, origem diario_sessao) continuam funcionando sem alteração.
-- Corpo copiado da definição VIVA (pg_get_functiondef), não da 0049 original:
-- migrações intermediárias (0056/0068/0072/0085/0087/0093/0094/0105) já
-- adicionaram o guard `app_prontuario_somente_leitura` e trocaram
-- `current_setting` cru por `app_clinic_id_exigido()` — preservado abaixo.
-- `CREATE OR REPLACE` só substitui quando a assinatura de tipos bate; 3
-- parâmetros novos (mesmo com DEFAULT) criam uma SEGUNDA função sobrecarregada
-- em vez de substituir — a de 7 argumentos ficaria viva, com o guard antigo
-- (sem origem) e sem o `RETURN` inserir `origem`/`rpd_entry_id`/
-- `origem_extraction_id` (cairia no DEFAULT 'diario_sessao', "funcionaria" por
-- acaso, mas duas fontes de verdade divergentes é exatamente a armadilha que
-- a memória `create-or-replace-torna-diff-enganoso` descreve). Derruba a
-- sobrecarga antiga antes de recriar.
DROP FUNCTION IF EXISTS app_criar_alerta_risco(
  uuid, uuid, alerta_risco_categoria, alerta_risco_severidade,
  alerta_risco_certeza, text, text
);--> statement-breakpoint

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
    -- §6: o trecho literal é sempre visível ao lado do alerta. Um alerta sem
    -- trecho seria um veredito da IA/regra sem evidência — proibido.
    RAISE EXCEPTION 'app_criar_alerta_risco: trecho_fonte literal é obrigatório';
  END IF;

  -- Guard por origem (#391): cada âncora prova, por si, que pertence a
  -- paciente+clínica do chamador — erro OPACO unificado por branch, mesmo
  -- padrão anti-oráculo cross-tenant de 0045. `CASE` sem ramo pra um `origem`
  -- fora do enum é impossível (tipo fecha o domínio) — sem ELSE de propósito.
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
      IF NOT EXISTS (
        SELECT 1 FROM tcc_rpd_entry r
         WHERE r.id = p_rpd_entry
           AND r.patient_id = p_patient
           AND r.clinic_id = v_clinic
      ) THEN
        RAISE EXCEPTION 'app_criar_alerta_risco: registro de pensamento inexistente ou sem permissão';
      END IF;
    WHEN 'instrumento_formal' THEN
      -- `extraction` não tem patient_id direto — deriva via session (0049
      -- original tampouco tinha; predicado lido de `\d extraction`, não presumido).
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

  -- Idempotência de RE-EXTRAÇÃO/RE-SALVAMENTO (não é dedupe clínico, §3.2):
  -- chave = (origem, âncora, trecho literal, categoria, severidade).
  -- `IS NOT DISTINCT FROM` compara certo mesmo quando a âncora não usada pela
  -- origem é NULL nos dois lados.
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
    RETURN v_id;  -- não reabre, não reinicia prazo, não renotifica
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
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_criar_alerta_risco(
  uuid, uuid, alerta_risco_categoria, alerta_risco_severidade,
  alerta_risco_certeza, text, text, alerta_risco_origem, uuid, uuid
) TO app_role;