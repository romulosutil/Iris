-- #212 — `salvarConfigEmergencia` era no-op silencioso.
--
-- `src/app/(app)/clinica/emergencia/logic.ts` rodava `UPDATE clinic SET
-- responsavel_tecnico_id, protocolo_emergencia_interno, ..._declarado_em,
-- ..._declarado_por` pelo pool da aplicação (`withTenant` -> `app_role`). Mas a
-- 0002 dá a `app_role` UMA policy em `clinic`, `clinic_read`, `FOR SELECT`, com
-- `FORCE ROW LEVEL SECURITY` ligado — não existe policy `FOR UPDATE`, e isso é
-- deliberado (a 0064 documenta: "clinic só tem policy de SELECT para app_role
-- (0002) — de propósito").
--
-- UPDATE barrado por RLS afeta 0 linhas EM SILÊNCIO, não estoura. A tela
-- salvava, gravava `audit_log`, devolvia `{ ok: true }` — e nada mudava no
-- banco. Responsável técnico e Protocolo de Emergência Interno provavelmente
-- nunca foram persistidos. Medido:
--
--   BEGIN;
--   INSERT INTO clinic (id, nome) VALUES ('9999…','Probe');
--   SET LOCAL ROLE app_role;
--   SELECT set_config('app.clinic_id','9999…',true);
--   UPDATE clinic SET protocolo_emergencia_interno = 'x' WHERE id='9999…';
--   -->  UPDATE 0
--   ROLLBACK;
--
-- POR QUE FUNÇÃO E NÃO POLICY NOVA:
-- Doutrina do repo (AGENTS.md / CLAUDE.md, precedentes 0048, 0064, 0067):
-- escrita fora do que a RLS permite vai de SECURITY DEFINER. Uma policy
-- `FOR UPDATE ON clinic` abriria de uma vez TODAS as colunas mutáveis que a
-- 0079 concedeu a `app_role` — inclusive `nome`, `timezone` e a configuração de
-- agenda, que nenhum caminho do produto escreve hoje. A função mantém a
-- superfície em exatamente as quatro colunas de emergência.
--
-- A 0079 (#188) NÃO é desfeita: os GRANTs de coluna continuam como estão. Eles
-- são defesa em profundidade e seguem sem policy que os exercite — o caminho
-- real passa a ser esta função, que roda como dona e não depende deles.
--
-- GUARD = FRONTEIRA DE AUTORIZAÇÃO:
-- Sendo DEFINER, a função bypassa RLS e o guard interno é a única barreira.
-- Ele espelha o predicado de `clinic_read` (0002) — `id =
-- current_setting('app.clinic_id')::uuid` — e acrescenta a exigência de papel
-- coordenador, que hoje só existe no wrapper (`requireRole` em `actions.ts`) e
-- portanto não é barreira de banco. A clínica NUNCA entra por parâmetro:
-- assim não existe caminho de forjar tenant.
--
-- O responsável técnico é revalidado aqui dentro por `user_role` da MESMA
-- clínica. A checagem já existe em `logic.ts` (para produzir mensagem amigável)
-- mas roda sob RLS; como a função bypassa RLS, sem esta segunda checagem um
-- chamador poderia apontar o responsável técnico para um usuário de outro
-- tenant. A de `logic.ts` é UX, esta é segurança.
--
-- A declaração (QUEM/QUANDO) é preservada pelo `COALESCE`: reeditar o texto do
-- protocolo não reescreve a data de um aceite anterior nem transfere a autoria
-- para quem só corrigiu um texto — mesma semântica do UPDATE original.
CREATE OR REPLACE FUNCTION app_salvar_config_emergencia(
  p_responsavel_tecnico uuid,
  p_protocolo_interno text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := current_setting('app.clinic_id')::uuid;
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_config_emergencia: exige papel coordenador (papel do chamador: %)', current_setting('app.user_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_role
     WHERE clinic_id = v_clinic
       AND user_id = p_responsavel_tecnico
  ) THEN
    RAISE EXCEPTION 'app_salvar_config_emergencia: responsável técnico % não tem papel nesta clínica (isolamento multi-tenant)', p_responsavel_tecnico;
  END IF;

  UPDATE clinic
     SET responsavel_tecnico_id = p_responsavel_tecnico,
         protocolo_emergencia_interno = p_protocolo_interno,
         protocolo_emergencia_declarado_em =
           COALESCE(protocolo_emergencia_declarado_em, now()),
         protocolo_emergencia_declarado_por =
           COALESCE(protocolo_emergencia_declarado_por,
                    current_setting('app.user_id')::uuid)
   WHERE id = v_clinic;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_salvar_config_emergencia(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_salvar_config_emergencia(uuid, text) TO app_role;
