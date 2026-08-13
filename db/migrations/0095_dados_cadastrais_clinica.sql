ALTER TABLE "clinic" ADD COLUMN "razao_social" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_logradouro" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_numero" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_complemento" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_bairro" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_cidade" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_uf" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "endereco_cep" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "email_financeiro" text;--> statement-breakpoint
-- ============================================================================
-- #262 (D31) — Parte manual (fora do modelo Drizzle): função de escrita dos
-- dados cadastrais/fiscais da clínica + grants de coluna.
--
-- clinic NÃO tem policy de UPDATE para app_role (0079 revogou tudo e concede
-- coluna a coluna): toda escrita destes campos passa por esta função
-- SECURITY DEFINER. Guard interno espelha o predicado da policy de leitura
-- clinic_read (id = app_clinic_id_exigido(), 0085) e exige papel coordenador.
--
-- Gate do guardrail 5 (#262, decisão 12/08/2026): mudança de cpf_cnpj é
-- REJEITADA quando a clínica já tem cobrança emitida no gateway
-- (EXISTS billing_cycle com cobranca_emitida_em IS NOT NULL). "Nota fiscal"
-- não existe no modelo — este é o sinal concreto. Demais campos seguem
-- sempre editáveis.
--
-- app_salvar_cpf_cnpj_clinica (0090) segue viva: é o caminho do onboarding
-- de ativação, que roda antes de existir cobrança e só sabe documento.
-- ============================================================================
CREATE OR REPLACE FUNCTION app_salvar_dados_clinica(
  p_razao_social text,
  p_cpf_cnpj text,
  p_logradouro text,
  p_numero text,
  p_complemento text,
  p_bairro text,
  p_cidade text,
  p_uf text,
  p_cep text,
  p_email_financeiro text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
  v_digitos text := regexp_replace(COALESCE(p_cpf_cnpj, ''), '\D', '', 'g');
  v_uf text := upper(btrim(COALESCE(p_uf, '')));
  v_cep text := regexp_replace(COALESCE(p_cep, ''), '\D', '', 'g');
  v_doc_atual text;
BEGIN
  IF app_user_role_exigido() <> 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: exige papel coordenador (papel do chamador: %)',
      app_user_role_exigido();
  END IF;

  IF app_conta_somente_leitura() THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: conta somente leitura — regularize a assinatura para editar dados da clínica';
  END IF;

  IF v_digitos <> '' AND length(v_digitos) NOT IN (11, 14) THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos — recebeu % dígitos', length(v_digitos);
  END IF;

  IF v_uf <> '' AND v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: UF deve ter exatamente 2 letras — recebeu "%"', v_uf;
  END IF;

  IF v_cep <> '' AND length(v_cep) <> 8 THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: CEP deve ter 8 dígitos — recebeu % dígitos', length(v_cep);
  END IF;

  SELECT cpf_cnpj INTO v_doc_atual FROM clinic WHERE id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: clínica % não encontrada', v_clinic;
  END IF;

  -- Gate do guardrail 5: documento travado após cobrança emitida.
  IF NULLIF(v_digitos, '') IS DISTINCT FROM v_doc_atual
     AND EXISTS (
       SELECT 1 FROM billing_cycle
       WHERE clinic_id = v_clinic AND cobranca_emitida_em IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'app_salvar_dados_clinica: documento travado — já existem cobranças emitidas com o CPF/CNPJ atual';
  END IF;

  UPDATE clinic SET
    razao_social = NULLIF(btrim(COALESCE(p_razao_social, '')), ''),
    cpf_cnpj = NULLIF(v_digitos, ''),
    endereco_logradouro = NULLIF(btrim(COALESCE(p_logradouro, '')), ''),
    endereco_numero = NULLIF(btrim(COALESCE(p_numero, '')), ''),
    endereco_complemento = NULLIF(btrim(COALESCE(p_complemento, '')), ''),
    endereco_bairro = NULLIF(btrim(COALESCE(p_bairro, '')), ''),
    endereco_cidade = NULLIF(btrim(COALESCE(p_cidade, '')), ''),
    endereco_uf = NULLIF(v_uf, ''),
    endereco_cep = NULLIF(v_cep, ''),
    email_financeiro = NULLIF(btrim(COALESCE(p_email_financeiro, '')), '')
  WHERE id = v_clinic;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_salvar_dados_clinica(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_salvar_dados_clinica(text, text, text, text, text, text, text, text, text, text) TO app_role;
--> statement-breakpoint
-- Leitura das colunas novas (padrão 0090: SELECT explícito, SEM UPDATE —
-- escrita só via definer acima).
GRANT SELECT (razao_social, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, email_financeiro) ON clinic TO app_role;
