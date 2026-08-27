-- D60 (#352 P4) — extensão de retenção por paciente (ordem judicial, perícia,
-- requisição do MP). Fecha a dívida registrada em `context.md` §4 P4: o
-- predicado de expurgo hoje não distingue "a clínica ainda não decidiu" de
-- "decidiu estender por processo em curso" — as duas leituras colapsam em
-- ausência de evento.
--
-- Nada aqui é modelado pelo Drizzle (funções), logo esta migração é escrita à
-- mão e NÃO toca `meta/NNNN_snapshot.json`. Entrada manual no `_journal.json`
-- com `when` = `when` da 0130 + 1000.
--
-- `patient.retencao_estendida_ate`/`retencao_estendida_motivo` (0130) são
-- NULLable e sem UI própria no V1 — só o predicado passa a lê-las. NULL
-- continua "sem extensão" (comportamento hoje, preservado por construção).
--
-- Comparação em DATA CIVIL no fuso da clínica, igual ao resto do predicado
-- (0128): `retencao_estendida_ate` é `date`, não `timestamptz` — não existe
-- fuso a resolver na própria coluna, só na referência de "hoje".
--
-- Ambas as funções abaixo já tinham o predicado de vencimento duplicado
-- (0128, item 6: "a ÚNICA fronteira é o guard interno" — por isso não
-- delegam a `app_paciente_expurgavel`). A extensão entra IDÊNTICA nas duas
-- para não reabrir a divergência que a 0128 já tinha fechado uma vez.
--
-- ⚠️ `CREATE OR REPLACE` torna o diff enganoso: ler este `.sql` NÃO prova o
--    corpo vigente no banco. A verificação é `pg_proc.prosrc`.

CREATE OR REPLACE FUNCTION public.app_paciente_expurgavel(p_patient uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.alta_em IS NOT NULL
    AND p.nascimento IS NOT NULL
    AND (now() AT TIME ZONE c.timezone)::date
          >= app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
    AND (p.retencao_estendida_ate IS NULL
          OR (now() AT TIME ZONE c.timezone)::date >= p.retencao_estendida_ate)
  FROM patient p JOIN clinic c ON c.id = p.clinic_id
  WHERE p.id = p_patient
    AND p.clinic_id = app_clinic_id_exigido();  -- isolamento cross-tenant
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_pacientes_expurgaveis(
  p_limite integer, p_offset integer
) RETURNS TABLE (
  paciente_id uuid,
  nome        text,
  alta_em     date,
  vence_em    date,
  avisado_em  timestamptz,
  total       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH elegiveis AS (
    SELECT p.id,
           p.nome,
           p.alta_em,
           app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses) AS vence_em
      FROM patient p
      JOIN clinic c ON c.id = p.clinic_id
     WHERE p.clinic_id = app_clinic_id_exigido()
       AND app_user_role_exigido() = 'coordenador'
       AND p.alta_em IS NOT NULL
       AND p.nascimento IS NOT NULL
       AND (now() AT TIME ZONE c.timezone)::date
             >= app_retencao_vence_em(p.alta_em, p.nascimento, c.politica_retencao_meses)
       AND (p.retencao_estendida_ate IS NULL
             OR (now() AT TIME ZONE c.timezone)::date >= p.retencao_estendida_ate)
  ), contado AS (
    SELECT e.*, count(*) OVER () AS total FROM elegiveis e
  )
  SELECT ct.id,
         ct.nome,
         ct.alta_em,
         ct.vence_em,
         (SELECT max(al.criado_em) FROM audit_log al
           WHERE al.entidade = 'patient'
             AND al.entidade_id = ct.id
             AND al.acao = 'expurgo_aviso_previo') AS avisado_em,
         ct.total
    FROM contado ct
   ORDER BY ct.vence_em ASC, ct.id ASC
   LIMIT p_limite OFFSET p_offset;
$$;
--> statement-breakpoint

COMMENT ON FUNCTION public.app_paciente_expurgavel(uuid) IS
  'D60/#352 P4 — elegibilidade de expurgo. NÃO expurgável enquanto retencao_estendida_ate futura, mesmo com o prazo padrão vencido.';
