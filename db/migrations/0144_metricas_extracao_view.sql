-- #535 (auditoria 360, DA-01): view de métricas da extração por clínica e
-- semana ISO — "Saúde da IA" no /supervisao do coordenador.
--
-- "≥70% de aprovação sem edição" (PRODUCT.md:34, modelo-de-negocio.md:279) não
-- era medido em lugar nenhum. Esta view agrega `extraction` (sem PII: nenhuma
-- coluna de texto clínico, nenhum id de paciente/sessão) por semana ISO,
-- modelo e versão do prompt (colunas da 0143), com:
--   total_sugeridas          linhas que a IA produziu (todo estado exceto
--                            `pendente_reprocessamento`, que é ausência de
--                            sugestão, não sugestão)
--   aprovadas_sem_edicao     estado = 'aprovada' (payload_editado é NULL por
--                            construção nesse estado — ver schema.ts)
--   editadas / descartadas   estado = 'editada' / 'descartada'
--   pendentes                linhas `pendente_reprocessamento` (chamada falhou)
--   mediana_segundos_ate_revisao  percentil 50 de (revisado_em - criado_em)
--                            entre as linhas já revisadas
--   mediana_latencia_ms      percentil 50 de `latencia_ms` (só linhas medidas)
--   tokens_entrada / tokens_saida  somas (NULL quando nada foi medido)
--
-- Isolamento — regra 6 do CLAUDE.md: a view roda com os direitos do dono
-- (BYPASSRLS) e o tenant é reimposto AQUI por `app_clinic_id_exigido()`,
-- nunca por `current_setting('app.clinic_id')` cru (42704/22P02 sem nomear o
-- tenant). `security_barrier` impede que um predicado do chamador seja
-- avaliado antes do filtro de clínica. Não é `security_invoker`: a policy de
-- SELECT de `extraction` restringe o terapeuta às próprias sessões, e a
-- métrica é da CLÍNICA — por isso o papel é filtrado na própria view:
-- só `coordenador` lê (mesmo padrão de `audit_log_mascarado`, 0046/0087).
-- Painel super-admin (fora do tenant) fica como pendência: exige definer
-- com allowlist justificada (W1), não uma view aberta.
CREATE VIEW metricas_extracao_por_clinica_semana WITH (security_barrier = true) AS
  SELECT
    clinic_id,
    -- segunda-feira da semana ISO (date_trunc('week') é ISO no Postgres)
    date_trunc('week', criado_em)::date AS semana_inicio,
    to_char(criado_em, 'IYYY-"W"IW') AS semana_iso,
    modelo,
    prompt_versao,
    count(*) FILTER (WHERE estado <> 'pendente_reprocessamento')::int AS total_sugeridas,
    count(*) FILTER (WHERE estado = 'aprovada')::int AS aprovadas_sem_edicao,
    count(*) FILTER (WHERE estado = 'editada')::int AS editadas,
    count(*) FILTER (WHERE estado = 'descartada')::int AS descartadas,
    count(*) FILTER (WHERE estado = 'pendente_reprocessamento')::int AS pendentes,
    (percentile_cont(0.5) WITHIN GROUP (
       ORDER BY extract(epoch FROM (revisado_em - criado_em))
     ) FILTER (WHERE revisado_em IS NOT NULL))::double precision AS mediana_segundos_ate_revisao,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY latencia_ms)
       FILTER (WHERE latencia_ms IS NOT NULL))::double precision AS mediana_latencia_ms,
    sum(tokens_entrada)::bigint AS tokens_entrada,
    sum(tokens_saida)::bigint AS tokens_saida
  FROM extraction
  WHERE clinic_id = app_clinic_id_exigido()
    AND current_setting('app.user_role', true) = 'coordenador'
  GROUP BY clinic_id, 2, 3, modelo, prompt_versao;
--> statement-breakpoint
GRANT SELECT ON metricas_extracao_por_clinica_semana TO app_role;
