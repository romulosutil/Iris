-- #329 — o guard de "destinatário no tenant" passa a ter UM predicado só, e ele
-- vive em SQL.
--
-- O PROBLEMA MEDIDO: `assertDestinatariosNoTenant`
-- (`src/lib/risco/notificacao.ts`) se descreve como a rede de segurança que
-- garante que nenhum caminho de código notifica fora da clínica. Mas o motor de
-- escalonamento (`scripts/escalonamento-risco.mjs`) NUNCA a chama, e não tem
-- como chamar: é Node `.mjs` puro, sem TS e sem build, e a imagem
-- `infra/escalonamento/Dockerfile` sequer copia `src/`. Ou seja: o único
-- caminho que de fato dispara notificação para FORA do processo do app (o
-- e-mail ao RT) roda sem o guard que promete cobri-lo.
--
-- POR QUE EM SQL: os dois caminhos (criação, em TypeScript; escalonamento, em
-- `.mjs`) não podem compartilhar código de aplicação. O que eles compartilham é
-- o Postgres. Então o predicado desce para o banco — o TS passa a delegar a ele
-- e o job passa a consumi-lo através de `app_rt_do_alerta`. Predicado duplicado
-- em duas linguagens é predicado que diverge; aqui existe um só.
--
-- O SEGUNDO PROBLEMA MEDIDO: `app_rt_do_alerta` (0056, redefinida na 0069) já
-- filtrava o RT por papel vigente na clínica, mas com um `EXISTS` dentro do
-- WHERE — ou seja, RT fora do tenant devolvia ZERO LINHAS. O job registrava
-- isso como "RT nao encontrado ou sem papel vigente na clinica", exatamente a
-- mesma trilha de uma clínica que simplesmente não cadastrou RT. Um bloqueio de
-- isolamento de tenant ficava indistinguível de um cadastro incompleto na
-- auditoria. Aqui a função passa a devolver o MOTIVO, sem nunca devolver o
-- e-mail junto.
--> statement-breakpoint

-- ── (a) O predicado ─────────────────────────────────────────────────────────
-- Devolve, de `p_user_ids`, exatamente os ids que NÃO têm papel na clínica
-- `p_clinic_id`. Array vazio = todo mundo está no tenant.
--
-- Semântica idêntica à do TS que ela substitui (`SELECT DISTINCT ur.user_id
-- FROM user_role ur WHERE ur.clinic_id = $1 AND ur.user_id = ANY($2::uuid[])`,
-- e o chamador subtraía do conjunto de entrada): "no tenant" = existe LINHA em
-- `user_role` para o par (user, clinic). Papel qualquer, não só coordenador.
--
-- SECURITY DEFINER de propósito: provar AUSÊNCIA de papel exige enxergar
-- `user_role` inteira, e sob RLS a ausência de linha por falta de visibilidade é
-- indistinguível da ausência de linha por falta de papel — o que faria o guard
-- acusar forasteiro onde não há, ou pior, depender do tenant corrente do GUC
-- para decidir. Não vaza dado novo: só devolve ids que o CHAMADOR já forneceu, e
-- só o bit "não tem papel aqui". Mesmo raciocínio de `app_cpf_hash_*` (0084) e
-- do oráculo cross-tenant da 0055 — DEFINER que só responde sim/não sobre um
-- identificador que o chamador já tinha em mãos.
--
-- `p_user_ids` NULL ou vazio → array vazio (não é erro; é "nada a verificar"),
-- espelhando o early-return da função TS.
CREATE OR REPLACE FUNCTION app_destinatarios_fora_do_tenant(
  p_clinic_id uuid,
  p_user_ids  uuid[]
) RETURNS uuid[]
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT coalesce(
    array_agg(candidato) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM user_role ur
         WHERE ur.clinic_id = p_clinic_id
           AND ur.user_id = candidato
      )
    ),
    ARRAY[]::uuid[]
  )
  FROM unnest(coalesce(p_user_ids, ARRAY[]::uuid[])) AS candidato;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_destinatarios_fora_do_tenant(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_destinatarios_fora_do_tenant(uuid, uuid[]) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_destinatarios_fora_do_tenant(uuid, uuid[]) TO iris_escalonamento;
--> statement-breakpoint

-- ── (b) A asserção ──────────────────────────────────────────────────────────
-- Mesma decisão de sempre neste repo: quem quer a lista chama (a); quem quer que
-- o caminho MORRA chama esta. Estourar é o comportamento correto — um
-- destinatário fora do tenant não é um caso de borda a tratar, é um bug de
-- código novo que precisa aparecer alto e cedo.
CREATE OR REPLACE FUNCTION app_assert_destinatarios_no_tenant(
  p_clinic_id uuid,
  p_user_ids  uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forasteiros uuid[];
BEGIN
  v_forasteiros := app_destinatarios_fora_do_tenant(p_clinic_id, p_user_ids);
  IF array_length(v_forasteiros, 1) > 0 THEN
    RAISE EXCEPTION
      'notificacao de risco: destinatário fora do tenant (%) — o Iris nunca notifica fora da clínica (regra de ouro §4.2.1).',
      array_to_string(v_forasteiros, ', ')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_assert_destinatarios_no_tenant(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_assert_destinatarios_no_tenant(uuid, uuid[]) TO app_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_assert_destinatarios_no_tenant(uuid, uuid[]) TO iris_escalonamento;
--> statement-breakpoint

-- ── (c) `app_rt_do_alerta` deixa de filtrar em silêncio ─────────────────────
-- Mudança de tipo de retorno exige DROP: `CREATE OR REPLACE` não altera
-- `RETURNS TABLE`. Ordem igual à da 0069: DROP → CREATE → REVOKE → GRANT (a
-- função nova nasce com o EXECUTE default de PUBLIC até o REVOKE).
--
-- O que MUDA: o `EXISTS (SELECT 1 FROM user_role ...)` sai do WHERE e vira o
-- predicado compartilhado (a), avaliado DEPOIS de resolver o RT. Um RT sem papel
-- na clínica agora devolve UMA linha com `motivo_bloqueio` preenchido e
-- `rt_email` NULL — o job registra o bloqueio de tenant como tal na trilha, em
-- vez de gravar "RT nao encontrado".
--
-- O que NÃO muda: os filtros de `status = 'escalado_estagio_2'` e
-- `deletado_em IS NULL` continuam no WHERE. Alerta inexistente, fora do estágio
-- 2, soft-deletado, ou clínica sem `responsavel_tecnico_id` (o JOIN em
-- `app_user` não casa) continuam devolvendo ZERO linhas — o job continua
-- registrando "RT nao encontrado ou sem papel vigente na clinica" nesses casos.
--
-- INVARIANTE: `rt_email` e `motivo_bloqueio` nunca vêm preenchidos juntos. O
-- e-mail do RT forasteiro não sai desta função em hipótese alguma — quem
-- bloqueia não precisa do endereço para bloquear, e devolvê-lo seria justamente
-- entregar ao job o dado que a regra de ouro proíbe usar.
DROP FUNCTION IF EXISTS app_rt_do_alerta(uuid);
--> statement-breakpoint

CREATE FUNCTION app_rt_do_alerta(p_alerta uuid)
RETURNS TABLE (rt_email text, motivo_bloqueio text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    CASE WHEN cardinality(fora.forasteiros) = 0 THEN alvo.email END AS rt_email,
    CASE WHEN cardinality(fora.forasteiros) = 0 THEN NULL
         ELSE 'destinatario fora do tenant: ' || array_to_string(fora.forasteiros, ', ')
    END AS motivo_bloqueio
  FROM (
    SELECT c.id AS clinic_id, u.id AS user_id, u.email
      FROM alerta_risco_clinico a
      JOIN clinic c ON c.id = a.clinic_id
      JOIN app_user u ON u.id = c.responsavel_tecnico_id
     WHERE a.id = p_alerta
       AND a.status = 'escalado_estagio_2'
       AND a.deletado_em IS NULL
  ) AS alvo
  CROSS JOIN LATERAL (
    SELECT app_destinatarios_fora_do_tenant(alvo.clinic_id, ARRAY[alvo.user_id]) AS forasteiros
  ) AS fora;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_rt_do_alerta(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_rt_do_alerta(uuid) TO iris_escalonamento;
