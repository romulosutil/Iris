-- D56 / Res. CFP 009/2024 — caminho de escrita da declaração de e-Psi.
--
-- POR QUE FUNÇÃO E NÃO POLICY NOVA:
-- `app_user` tem `FORCE ROW LEVEL SECURITY` e UMA policy para `app_role`:
-- `app_user_read`, `FOR SELECT` (0002, predicado reescrito pela 0085 para usar
-- `app_clinic_id_exigido()`). Não existe policy `FOR UPDATE`, e isso é
-- deliberado. UPDATE barrado por RLS afeta 0 linhas EM SILÊNCIO, não estoura —
-- o mesmo defeito que a 0081 documenta para `clinic` (#212: a tela salvava,
-- devolvia ok, e nada mudava no banco).
--
-- Doutrina do repo (CLAUDE.md regra 5; precedentes 0048, 0064, 0067, 0081):
-- escrita fora do que a RLS permite vai de SECURITY DEFINER. Uma policy
-- `FOR UPDATE ON app_user` abriria de uma vez toda coluna que algum GRANT já
-- concedeu — inclusive `conselho`/`registro_numero`/`registro_uf`, que hoje só
-- `iris_auth` escreve, no signup, uma única vez. A função mantém a superfície
-- em exatamente as três colunas de e-Psi.
--
-- GUARD = FRONTEIRA DE AUTORIZAÇÃO:
-- Sendo DEFINER, a função bypassa RLS e o guard interno é a ÚNICA barreira.
-- Duas coisas o compõem:
--   1. o alvo NUNCA entra por parâmetro — é sempre `app_user_id_exigido()`.
--      Não existe assinatura que aceite o id de outra pessoa, então não existe
--      caminho de declarar e-Psi no registro alheio nem de forjar tenant.
--   2. o predicado de `app_user_read` (0085) é espelhado: o chamador tem que
--      ter papel NESTA clínica. Copiado da leitura correspondente, não
--      inventado — é a regra do repo para guard de definer.
--
-- `app_clinic_id_exigido()` / `app_user_id_exigido()` (0085/0093) em vez de
-- `current_setting(...)::uuid` cru: o cast cru estoura 42704/22P02 dentro da
-- função sem nomear o tenant, e o guard de auditoria varre `pg_proc` além de
-- `pg_policies` (CLAUDE.md regra 6).
--
-- DECLARAÇÃO É REVOGÁVEL: `p_verified = false` zera número e data. O fato de
-- ter declarado antes não some — fica no `audit_log`, que é imutável para
-- `app_role` (REVOKE UPDATE na 0039). Por isso o INSERT na trilha acontece nos
-- dois sentidos, não só quando declara.
CREATE OR REPLACE FUNCTION app_declarar_e_psi(p_verified boolean, p_numero text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
  v_user   uuid := app_user_id_exigido();
  v_numero text := NULLIF(btrim(COALESCE(p_numero, '')), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_role
     WHERE user_id = v_user
       AND clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'app_declarar_e_psi: usuário % não tem papel na clínica % (isolamento multi-tenant)', v_user, v_clinic;
  END IF;

  -- Espelha o CHECK `app_user_e_psi_check` (0130) com mensagem diagnosticável.
  -- Sem isto o caminho falharia como violação de constraint anônima, e a UI não
  -- teria como distinguir "faltou o número" de qualquer outro erro de banco.
  IF p_verified AND v_numero IS NULL THEN
    RAISE EXCEPTION 'app_declarar_e_psi: declarar cadastro ativo exige o número do e-Psi';
  END IF;

  UPDATE app_user
     SET e_psi_verified     = p_verified,
         e_psi_number       = CASE WHEN p_verified THEN v_numero ELSE NULL END,
         e_psi_declarado_em = CASE WHEN p_verified THEN now() ELSE NULL END
   WHERE id = v_user;

  -- `patient_id` NULL: a declaração é do profissional, não tem sujeito
  -- paciente. `entidade_id` = o próprio usuário, âncora da linha.
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, v_user, 'e_psi_declarado', 'app_user', v_user, NULL,
          jsonb_build_object('verified', p_verified, 'numero', v_numero));
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_declarar_e_psi(boolean, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_declarar_e_psi(boolean, text) TO app_role;
