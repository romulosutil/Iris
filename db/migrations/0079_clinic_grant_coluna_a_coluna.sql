-- Débito D3 (#188) — `clinic` herdou o `GRANT ... ON ALL TABLES` da 0001, que é
-- point-in-time: `app_role` ficou com INSERT/UPDATE/DELETE de TABELA sobre as 19
-- colunas. Hoje nada disso é exercitável porque a 0002 deu a `app_role` só uma
-- policy `FOR SELECT` em `clinic` — a barreira é 100% RLS, sem defesa em
-- profundidade no nível de privilégio. Basta uma policy de escrita adicionada por
-- distração amanhã para abrir TODAS as colunas de uma vez, inclusive
-- `isento_trial` (flag de faturamento: quem a ligasse sairia do gate de cobrança).
--
-- Mesmo idioma da 0044 (`patient`) e da 0057 (`app_user`): REVOKE do privilégio
-- de tabela + GRANT coluna a coluna só no que é superfície de escrita do produto.
-- A ausência do privilégio de coluna NEGA no nível de tabela, então a lista de
-- mutáveis abaixo é a única fonte de verdade.
--
-- Esta migração NÃO cria policy de escrita e NÃO destrava nenhum caminho novo:
-- é redução de privilégio pura. O que hoje é no-op continua no-op.
--
-- `iris_auth` (pool do Better-Auth, policy `clinic_auth_all` da 0002) e a role
-- dona não são tocadas: o INSERT de clínica do self-service signup
-- (`src/auth/cadastro.ts`) e o `UPDATE responsavel_conta_id` seguem por lá, e
-- `app_iniciar_trial()` (0064) escreve `trial_comeco_em` como SECURITY DEFINER.

-- Imutáveis para `app_role`, e o porquê de cada uma:
--   id                    · identidade do tenant — reescrevê-la é forja de posse
--   responsavel_conta_id  · dono da conta, escrito só pelo signup (iris_auth)
--   is_demo               · flag interna de ambiente, não é dado do cliente
--   trial_comeco_em       · relógio de trial, só via app_iniciar_trial() (0064)
--   trial_dias            · teto do trial, hipótese de produto (0057)
--   isento_trial          · flag de faturamento, UPDATE só para iris_auth (0064)
--   criado_em             · auditoria
REVOKE INSERT, UPDATE, DELETE ON clinic FROM app_role;
--> statement-breakpoint

-- Mutáveis = configuração da clínica editável pelo produto. `clinic` já está na
-- lista de tabelas cobertas pela barreira de conta somente-leitura da 0073
-- ("config da clínica é escrita do produto"), então a superfície é intencional.
-- Grant de COLUNA faltando aparece como "permission denied for table clinic",
-- diagnóstico caro — por isso a lista é explícita.
GRANT UPDATE (
  nome,
  politica_retencao_meses,
  politica_retencao_config,
  timezone,
  passo_grade_min,
  duracao_disciplina,
  faltas_limiar,
  faltas_janela_semanas,
  responsavel_tecnico_id,
  protocolo_emergencia_interno,
  protocolo_emergencia_declarado_em,
  protocolo_emergencia_declarado_por
) ON clinic TO app_role;
