-- #154, item 3 — "duas pontas soltas" do e-mail ao RT. Nenhuma delas quebra
-- hoje; as duas são superfície aberta que só custa caro depois.
--> statement-breakpoint

-- ── Ponta A: `rt_nome` devolvido e nunca consumido ──────────────────────────
-- `app_rt_do_alerta` devolvia (rt_email, rt_nome), mas o único chamador
-- (`scripts/escalonamento-risco.mjs`) só desestrutura `rt_email`. Coluna
-- devolvida sem uso é superfície de graça numa função SECURITY DEFINER — o
-- nome do RT sai do tenant sem ninguém precisar dele.
--
-- Por que REMOVER em vez de passar a usar: o corpo do e-mail é
-- `montarCorpoAlertaRt(appUrl)`, que recebe SÓ a URL de propósito — é esse
-- parâmetro único que materializa o guardrail §4.2.1 (nada de clínico, nada
-- de identificação, pode ser interpolado no corpo), e ele é espelhado em
-- `src/lib/email/resend.ts` com teste de paridade. Consumir `rt_nome` exigiria
-- abrir esse contrato para um segundo parâmetro; remover a coluna é o caminho
-- que preserva o mínimo privilégio.
--
-- Mudar o tipo de retorno exige DROP: `CREATE OR REPLACE` não altera
-- `RETURNS TABLE`. Ordem: DROP → CREATE → REVOKE → GRANT (a função nova nasce
-- com o EXECUTE default de PUBLIC até o REVOKE).
--
-- O predicado é o da 0056, inalterado: só estágio 2, só não-deletado, só RT
-- com papel vigente.
DROP FUNCTION IF EXISTS app_rt_do_alerta(uuid);
--> statement-breakpoint

-- SECURITY DEFINER: iris_escalonamento não tem SELECT em clinic/app_user/
-- user_role (só EXECUTE nesta função). Guard interno confere estágio e
-- vigência do papel — não confia em o alerta já ter sido validado alhures.
CREATE FUNCTION app_rt_do_alerta(p_alerta uuid)
RETURNS TABLE (rt_email text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.email
    FROM alerta_risco_clinico a
    JOIN clinic c ON c.id = a.clinic_id
    JOIN app_user u ON u.id = c.responsavel_tecnico_id
   WHERE a.id = p_alerta
     AND a.status = 'escalado_estagio_2'
     AND a.deletado_em IS NULL
     AND EXISTS (
       SELECT 1 FROM user_role ur
        WHERE ur.user_id = u.id AND ur.clinic_id = c.id
     );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_rt_do_alerta(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_rt_do_alerta(uuid) TO iris_escalonamento;
--> statement-breakpoint

-- ── Ponta B: UPDATE sem guard de soft-delete ────────────────────────────────
-- `app_registrar_email_rt` fazia `UPDATE ... WHERE id = p_alerta` sem
-- `AND deletado_em IS NULL`, diferente das funções irmãs.
--
-- A correção NÃO é adicionar `AND deletado_em IS NULL` ao UPDATE: um UPDATE
-- que não casa afeta 0 linhas EM SILÊNCIO e não estoura, e o INSERT no
-- audit_log logo abaixo gravaria assim mesmo — trilha afirmando um registro
-- que não aconteceu. É exatamente a classe de falha silenciosa da #108.
--
-- Em vez disso: `deletado_em` entra no SELECT de guarda do topo e um alerta
-- soft-deletado vira RAISE EXCEPTION explícito, no mesmo estilo do
-- 'alerta inexistente'. A exceção aborta a transação da função inteira, então
-- o audit_log também não grava — ou tudo, ou nada.
--
-- Seguro porque `varrer()` (mesma PR) isola cada alerta em try/catch próprio:
-- a exceção não derruba a varredura, só o alerta problemático. E o caminho é
-- raro: `app_rt_do_alerta` e `app_alertas_estagio2_sem_email` já filtram
-- `deletado_em IS NULL`, então só um soft-delete acontecendo ENTRE a leitura
-- da fila e o registro chega aqui — que é justamente o caso que a gente quer
-- ver estourando, não sumindo.
--
-- Resto do corpo idêntico à 0068 (teto de 3 tentativas, marcador `_adiado`).
CREATE OR REPLACE FUNCTION app_registrar_email_rt(
  p_alerta      uuid,
  p_sucesso     boolean,
  p_transitorio boolean,
  p_detalhe     text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic      uuid;
  v_tentativas  int;
  v_deletado_em timestamptz;
  v_marcador    text;
BEGIN
  SELECT clinic_id, email_rt_tentativas, deletado_em
    INTO v_clinic, v_tentativas, v_deletado_em
    FROM alerta_risco_clinico WHERE id = p_alerta;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'app_registrar_email_rt: alerta inexistente';
  END IF;
  IF v_deletado_em IS NOT NULL THEN
    RAISE EXCEPTION 'app_registrar_email_rt: alerta soft-deletado (deletado_em=%)', v_deletado_em;
  END IF;

  IF p_sucesso THEN
    v_marcador := 'email_responsavel_tecnico_enviado';
  ELSIF p_transitorio AND v_tentativas < 2 THEN
    -- v_tentativas é o número de falhas JÁ gravadas. 0 e 1 ainda adiam;
    -- ao chegar em 2 a próxima falha é a 3ª e vira permanente.
    v_marcador := 'email_responsavel_tecnico_adiado';
  ELSE
    v_marcador := 'email_responsavel_tecnico_falhou';
  END IF;

  UPDATE alerta_risco_clinico
     SET canais_notificados = canais_notificados || to_jsonb(v_marcador::text),
         email_rt_tentativas = CASE WHEN p_sucesso THEN email_rt_tentativas
                                    ELSE email_rt_tentativas + 1 END,
         atualizado_em = now()
   WHERE id = p_alerta;

  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, NULL, 'alerta_risco_email_rt', 'alerta_risco_clinico', p_alerta, NULL,
          jsonb_build_object('sucesso', p_sucesso, 'transitorio', p_transitorio, 'detalhe', p_detalhe));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_registrar_email_rt(uuid, boolean, boolean, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_registrar_email_rt(uuid, boolean, boolean, text) TO iris_escalonamento;
