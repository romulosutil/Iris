-- Verificação pós-deploy das migrações 0076 e 0077 (#203, fatias 1 e 2).
--
-- Leitura pura: nenhum INSERT/UPDATE/DDL. Todo objeto é procurado com o schema
-- EXPLÍCITO (`public`), e não pelo `search_path`: um homônimo em outro schema —
-- ou um `search_path` diferente na sessão que rodar isto — devolveria PASSOU
-- para um objeto que não é o que a aplicação usa, e o custo de errar aqui é
-- acreditar que mediu.
SELECT item, esperado, encontrado,
       CASE WHEN ok THEN 'PASSOU' ELSE '>>> FALHOU <<<' END AS veredito
FROM (
  -- ─── 0076 · lado do CONSUMO (care_team_membership) ─────────────────────────
  SELECT 1 AS n, '0076 coluna horas_semana' AS item,
         'numeric(4,1) nullable' AS esperado,
         coalesce((SELECT data_type||'('||numeric_precision||','||numeric_scale||') '||
                          CASE WHEN is_nullable='YES' THEN 'nullable' ELSE 'not null' END
                     FROM information_schema.columns
                    WHERE table_schema='public'
                      AND table_name='care_team_membership' AND column_name='horas_semana'),
                  'AUSENTE') AS encontrado,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public'
                    AND table_name='care_team_membership' AND column_name='horas_semana'
                    AND numeric_precision=4 AND numeric_scale=1 AND is_nullable='YES') AS ok
  UNION ALL
  SELECT 2, '0076 CHECK ctm_horas_semana_passo', 'existe',
         coalesce((SELECT 'existe' FROM pg_constraint
                    WHERE conname='ctm_horas_semana_passo' AND connamespace='public'::regnamespace),'AUSENTE'),
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='ctm_horas_semana_passo' AND contype='c'
                    AND connamespace='public'::regnamespace)
  UNION ALL
  SELECT 3, '0076 CHECK patient_alvo_horas_passo', 'existe',
         coalesce((SELECT 'existe' FROM pg_constraint
                    WHERE conname='patient_alvo_horas_passo' AND connamespace='public'::regnamespace),'AUSENTE'),
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='patient_alvo_horas_passo' AND contype='c'
                    AND connamespace='public'::regnamespace)
  UNION ALL
  SELECT 4, '0076 CHECK ctm_gestao_sem_horas (D-C)', 'existe',
         coalesce((SELECT 'existe' FROM pg_constraint
                    WHERE conname='ctm_gestao_sem_horas' AND connamespace='public'::regnamespace),'AUSENTE'),
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='ctm_gestao_sem_horas' AND contype='c'
                    AND connamespace='public'::regnamespace)
  UNION ALL
  SELECT 5, '0076 indice ctm_unico_vigente', 'UNIQUE e PARCIAL',
         coalesce((SELECT indexdef FROM pg_indexes
                    WHERE schemaname='public' AND indexname='ctm_unico_vigente'),'AUSENTE'),
         EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public'
                    AND indexname='ctm_unico_vigente'
                    AND indexdef LIKE 'CREATE UNIQUE INDEX%'
                    AND indexdef LIKE '%papel_na_equipe%'
                    AND indexdef LIKE '%WHERE (vigencia_fim IS NULL)%')
  UNION ALL
  SELECT 6, '0076 GRANT UPDATE (horas_semana) p/ app_role', 'true',
         has_column_privilege('app_role','public.care_team_membership','horas_semana','UPDATE')::text,
         has_column_privilege('app_role','public.care_team_membership','horas_semana','UPDATE')

  -- ─── 0077 · lado do TETO (patient_alvo_disciplina) ─────────────────────────
  UNION ALL
  SELECT 7, '0077 indice patient_alvo_unico_vigente', 'UNIQUE e PARCIAL',
         coalesce((SELECT indexdef FROM pg_indexes
                    WHERE schemaname='public' AND indexname='patient_alvo_unico_vigente'),'AUSENTE'),
         EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public'
                    AND indexname='patient_alvo_unico_vigente'
                    AND indexdef LIKE 'CREATE UNIQUE INDEX%'
                    AND indexdef LIKE '%WHERE (vigencia_fim IS NULL)%')
  UNION ALL
  SELECT 8, '0077 indice antigo idx_patient_alvo_vigente', 'derrubado',
         coalesce((SELECT 'AINDA EXISTE' FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_patient_alvo_vigente'),'derrubado'),
         NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname='public' AND indexname='idx_patient_alvo_vigente')
  UNION ALL
  SELECT 9, '0077 UPDATE de TABELA em patient_alvo_disciplina', 'false (revogado)',
         has_table_privilege('app_role','public.patient_alvo_disciplina','UPDATE')::text,
         NOT has_table_privilege('app_role','public.patient_alvo_disciplina','UPDATE')
  UNION ALL
  SELECT 10, '0077 GRANT UPDATE (vigencia_fim) p/ app_role', 'true',
         has_column_privilege('app_role','public.patient_alvo_disciplina','vigencia_fim','UPDATE')::text,
         has_column_privilege('app_role','public.patient_alvo_disciplina','vigencia_fim','UPDATE')
  UNION ALL
  SELECT 11, '0077 UPDATE de horas_alvo_semana por app_role', 'false (SCD2 protegido)',
         has_column_privilege('app_role','public.patient_alvo_disciplina','horas_alvo_semana','UPDATE')::text,
         NOT has_column_privilege('app_role','public.patient_alvo_disciplina','horas_alvo_semana','UPDATE')
  UNION ALL
  SELECT 12, '0077 DELETE em patient_alvo_disciplina', 'false (append-only)',
         has_table_privilege('app_role','public.patient_alvo_disciplina','DELETE')::text,
         NOT has_table_privilege('app_role','public.patient_alvo_disciplina','DELETE')
  UNION ALL
  SELECT 13, '0077 policy patient_alvo_disciplina_delete', 'derrubada',
         coalesce((SELECT 'AINDA EXISTE' FROM pg_policies
                    WHERE schemaname='public' AND policyname='patient_alvo_disciplina_delete'),'derrubada'),
         NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname='public' AND policyname='patient_alvo_disciplina_delete')
) AS checagens
ORDER BY n;
