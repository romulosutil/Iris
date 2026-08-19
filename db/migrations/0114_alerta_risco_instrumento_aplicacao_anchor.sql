ALTER TABLE "alerta_risco_clinico" ADD COLUMN "instrumento_aplicacao_id" uuid;--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD CONSTRAINT "alerta_risco_instrumento_aplicacao_fk" FOREIGN KEY ("instrumento_aplicacao_id") REFERENCES "public"."instrumento_aplicacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- A partir daqui é escrito à mão (gap fix #391→#393, sessão 18/08/26).
--
-- `alerta_risco_vinculo` (criada na 0111, relaxada na 0112 para
-- `registro_pensamento` — NENHUM dos dois arquivos é editado aqui, memória
-- `editar-migracao-aplicada-nao-roda`). Texto base lido da definição VIVA via
-- `pg_get_constraintdef` (não do `.sql` da 0111, que já estava desatualizado
-- em relação à 0112) — só o branch `instrumento_formal` ganha um OR novo:
-- `origem_extraction_id IS NOT NULL` (caminho via agente, #391 Fase E)
-- OR `instrumento_aplicacao_id IS NOT NULL` (caminho MANUAL novo, #393 T4).
-- As duas âncoras são mutuamente exclusivas na prática (o guard da função
-- abaixo só aceita uma por chamada), mas o CHECK não precisa impor isso — é
-- suficiente garantir que PELO MENOS uma exista. Ramo de pseudonimização
-- ganha `instrumento_aplicacao_id IS NULL` pelo mesmo motivo que já exige
-- `origem_extraction_id IS NULL`: expurgo (H2) solta TODAS as âncoras.
ALTER TABLE "alerta_risco_clinico" DROP CONSTRAINT "alerta_risco_vinculo";--> statement-breakpoint
ALTER TABLE "alerta_risco_clinico" ADD CONSTRAINT "alerta_risco_vinculo" CHECK (("alerta_risco_clinico"."pseudonimizado_em" IS NULL
            AND "alerta_risco_clinico"."patient_id" IS NOT NULL
            AND (
              ("alerta_risco_clinico"."origem" = 'diario_sessao' AND "alerta_risco_clinico"."session_id" IS NOT NULL)
              OR ("alerta_risco_clinico"."origem" = 'registro_pensamento' AND ("alerta_risco_clinico"."rpd_entry_id" IS NOT NULL OR "alerta_risco_clinico"."origem_extraction_id" IS NOT NULL))
              OR ("alerta_risco_clinico"."origem" = 'instrumento_formal' AND ("alerta_risco_clinico"."origem_extraction_id" IS NOT NULL OR "alerta_risco_clinico"."instrumento_aplicacao_id" IS NOT NULL))
            ))
       OR ("alerta_risco_clinico"."pseudonimizado_em" IS NOT NULL
            AND "alerta_risco_clinico"."patient_id" IS NULL
            AND "alerta_risco_clinico"."session_id" IS NULL
            AND "alerta_risco_clinico"."rpd_entry_id" IS NULL
            AND "alerta_risco_clinico"."origem_extraction_id" IS NULL
            AND "alerta_risco_clinico"."instrumento_aplicacao_id" IS NULL));--> statement-breakpoint

-- `app_criar_alerta_risco` (definer, 0049, últimos parâmetros na 0111/0112)
-- ganha `p_instrumento_aplicacao_id uuid DEFAULT NULL` (11º parâmetro). Corpo
-- copiado da definição VIVA via `pg_get_functiondef` (10 parâmetros,
-- confirmado igual ao texto da 0112 antes desta migração), só o branch
-- `instrumento_formal` do CASE muda — vira o mesmo formato IF/ELSIF/ELSE do
-- branch `registro_pensamento` (0112): âncora dupla, nenhuma das duas é erro
-- do chamador isoladamente, só a AUSÊNCIA das duas é.
--
-- Novo parâmetro (mesmo com DEFAULT) muda a assinatura de tipos —
-- `CREATE OR REPLACE` criaria uma SEGUNDA função sobrecarregada em vez de
-- substituir (mesma armadilha documentada na 0111/0112). Derruba a
-- sobrecarga de 10 argumentos antes de recriar.
DROP FUNCTION IF EXISTS app_criar_alerta_risco(
  uuid, uuid, alerta_risco_categoria, alerta_risco_severidade,
  alerta_risco_certeza, text, text, alerta_risco_origem, uuid, uuid
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_criar_alerta_risco(
  p_patient                  uuid,
  p_session                  uuid,
  p_categoria                alerta_risco_categoria,
  p_severidade                alerta_risco_severidade,
  p_certeza                  alerta_risco_certeza,
  p_trecho                   text,
  p_detalhe                  text,
  p_origem                   alerta_risco_origem DEFAULT 'diario_sessao',
  p_rpd_entry                uuid DEFAULT NULL,
  p_origem_extraction        uuid DEFAULT NULL,
  p_instrumento_aplicacao_id uuid DEFAULT NULL
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
      -- pendente de aprovação (`p_origem_extraction`).
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
      -- Gap fix #393: âncora dupla — extração via agente (`p_origem_extraction`,
      -- #391 Fase E) OU aplicação MANUAL sem extração (`p_instrumento_aplicacao_id`,
      -- T4). `instrumento_aplicacao` tem `patient_id`/`clinic_id` diretos
      -- (diferente de `extraction`, que deriva paciente via `session`) — guard
      -- mais simples, sem JOIN.
      IF p_origem_extraction IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM extraction e
           JOIN session s ON s.id = e.session_id
           WHERE e.id = p_origem_extraction
             AND e.clinic_id = v_clinic
             AND s.patient_id = p_patient
        ) THEN
          RAISE EXCEPTION 'app_criar_alerta_risco: extração inexistente ou sem permissão';
        END IF;
      ELSIF p_instrumento_aplicacao_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM instrumento_aplicacao ia
           WHERE ia.id = p_instrumento_aplicacao_id
             AND ia.clinic_id = v_clinic
             AND ia.patient_id = p_patient
        ) THEN
          RAISE EXCEPTION 'app_criar_alerta_risco: aplicação de instrumento inexistente ou sem permissão';
        END IF;
      ELSE
        RAISE EXCEPTION 'app_criar_alerta_risco: instrumento_formal exige origem_extraction_id ou instrumento_aplicacao_id';
      END IF;
  END CASE;

  IF app_prontuario_somente_leitura(p_patient) THEN
    RAISE EXCEPTION 'Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)';
  END IF;

  -- Idempotência: chave ganha `instrumento_aplicacao_id` além das âncoras já
  -- existentes — sem isso, duas chamadas para origens diferentes (uma via
  -- extração, outra via instrumento manual) com as demais âncoras NULL nos
  -- dois lados poderiam colidir por engano no `IS NOT DISTINCT FROM`.
  SELECT a.id INTO v_id
    FROM alerta_risco_clinico a
   WHERE a.origem = p_origem
     AND a.session_id IS NOT DISTINCT FROM p_session
     AND a.rpd_entry_id IS NOT DISTINCT FROM p_rpd_entry
     AND a.origem_extraction_id IS NOT DISTINCT FROM p_origem_extraction
     AND a.instrumento_aplicacao_id IS NOT DISTINCT FROM p_instrumento_aplicacao_id
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
    instrumento_aplicacao_id,
    categoria, severidade, certeza, trecho_fonte, detalhe,
    prazo_minutos, prazo_reconhecimento, atualizado_por
  ) VALUES (
    v_clinic, p_patient, p_session, p_origem, p_rpd_entry, p_origem_extraction,
    p_instrumento_aplicacao_id,
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
  alerta_risco_certeza, text, text, alerta_risco_origem, uuid, uuid, uuid
) TO app_role;