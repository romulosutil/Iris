-- #535 (auditoria 360, DA-01): view de métricas da extração por clínica e
-- semana ISO — "Saúde da IA" no /supervisao do coordenador.
--
-- "≥70% de aprovação sem edição" (PRODUCT.md:34, modelo-de-negocio.md:279) não
-- era medido em lugar nenhum. Esta view agrega `extraction` (sem PII: nenhuma
-- coluna de texto clínico, nenhum id de paciente/sessão) por semana ISO,
-- modelo e versão do prompt (colunas da 0147), com:
--   total_sugeridas          linhas que a IA produziu (todo estado exceto
--                            `pendente_reprocessamento`, que é ausência de
--                            sugestão, não sugestão)
--   aprovadas_sem_edicao     estado = 'aprovada'. Nesse estado o conteúdo
--                            efetivo é `payload` (a sugestão original); uma
--                            aprovação com texto alterado vira 'editada'.
--                            Linha reaprovada depois de `erro_validacao`
--                            (DLQ, #532) pode carregar `payload_editado`
--                            residual — ainda conta como aprovada aqui.
--   editadas / descartadas   estado = 'editada' / 'descartada'
--   erro_validacao           estado = 'erro_validacao' (DLQ da revisão: a
--                            IA sugeriu, o humano decidiu, a gravação falhou)
--   pendentes                linhas `pendente_reprocessamento` (chamada falhou)
--   mediana_segundos_ate_revisao  percentil 50 de (revisado_em - criado_em)
--                            entre as linhas já revisadas
--   mediana_latencia_ms      percentil 50 de `latencia_ms` (só linhas medidas)
--   tokens_entrada / tokens_saida  somas (NULL quando nada foi medido)
--
-- Semana no FUSO DA CLÍNICA (`clinic.timezone`, D61): `date_trunc('week')`
-- em timestamptz depende do `TimeZone` da sessão — com o banco em UTC, uma
-- consolidação de domingo à noite em Brasília cairia na semana seguinte.
-- `criado_em AT TIME ZONE c.timezone` fixa o calendário antes de truncar;
-- `supervisao/queries.ts` faz a mesma conversão no `WHERE`.
--
-- Isolamento — regra 6 do CLAUDE.md: a view roda com os direitos do dono
-- (BYPASSRLS) e o tenant é reimposto AQUI por `app_clinic_id_exigido()`,
-- nunca por `current_setting('app.clinic_id')` cru (42704/22P02 sem nomear o
-- tenant). `security_barrier` impede que um predicado do chamador seja
-- avaliado antes do filtro de clínica. Não é `security_invoker`: a policy de
-- SELECT de `extraction` restringe o terapeuta às próprias sessões, e a
-- métrica é da CLÍNICA — por isso o papel é filtrado na própria view via
-- `app_user_role_atual()` (0093): só `coordenador` lê (mesmo padrão de
-- `audit_log_mascarado`, 0046/0087). Painel super-admin (fora do tenant) fica
-- como pendência: exige definer com allowlist justificada (W1), não uma view
-- aberta.
CREATE VIEW metricas_extracao_por_clinica_semana WITH (security_barrier = true) AS
  SELECT
    e.clinic_id,
    -- segunda-feira da semana ISO (date_trunc('week') é ISO no Postgres)
    date_trunc('week', e.criado_em AT TIME ZONE c.timezone)::date AS semana_inicio,
    to_char(e.criado_em AT TIME ZONE c.timezone, 'IYYY-"W"IW') AS semana_iso,
    e.modelo,
    e.prompt_versao,
    count(*) FILTER (WHERE e.estado <> 'pendente_reprocessamento')::int AS total_sugeridas,
    count(*) FILTER (WHERE e.estado = 'aprovada')::int AS aprovadas_sem_edicao,
    count(*) FILTER (WHERE e.estado = 'editada')::int AS editadas,
    count(*) FILTER (WHERE e.estado = 'descartada')::int AS descartadas,
    count(*) FILTER (WHERE e.estado = 'erro_validacao')::int AS erro_validacao,
    count(*) FILTER (WHERE e.estado = 'pendente_reprocessamento')::int AS pendentes,
    (percentile_cont(0.5) WITHIN GROUP (
       ORDER BY extract(epoch FROM (e.revisado_em - e.criado_em))
     ) FILTER (WHERE e.revisado_em IS NOT NULL))::double precision AS mediana_segundos_ate_revisao,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY e.latencia_ms)
       FILTER (WHERE e.latencia_ms IS NOT NULL))::double precision AS mediana_latencia_ms,
    sum(e.tokens_entrada)::bigint AS tokens_entrada,
    sum(e.tokens_saida)::bigint AS tokens_saida
  FROM extraction e
  JOIN clinic c ON c.id = e.clinic_id
  WHERE e.clinic_id = app_clinic_id_exigido()
    AND app_user_role_atual() = 'coordenador'
  GROUP BY e.clinic_id, 2, 3, e.modelo, e.prompt_versao;
--> statement-breakpoint
GRANT SELECT ON metricas_extracao_por_clinica_semana TO app_role;
