-- Fatia A (#163): aceite de termos do PROFISSIONAL adulto. Distinto do
-- consentimento do titular do tratamento (migração 0049) — outro titular,
-- outra base legal. Registro auditável e imutável pela aplicação.
CREATE TABLE professional_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  clinic_id uuid NOT NULL REFERENCES clinic(id),
  versao_termo text NOT NULL,
  aceito_em timestamptz NOT NULL DEFAULT now(),
  -- `text`, não `inet`: o valor vem de X-Forwarded-For (pode ser vazio ou lista)
  -- e o schema Drizzle o declara como text. Tipo divergente entre DDL e schema é
  -- erro que só aparece em runtime.
  ip text,
  user_agent text
);

CREATE INDEX professional_consent_user_idx ON professional_consent (user_id);
ALTER TABLE professional_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_consent FORCE ROW LEVEL SECURITY;

-- Leitura escopada ao tenant ativo, como todo o resto do produto.
CREATE POLICY professional_consent_select ON professional_consent
  FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- Escrita só pelo caminho de identidade (iris_auth), que é quem roda o cadastro
-- antes de existir GUC de tenant. app_role NÃO recebe INSERT/UPDATE/DELETE:
-- aceite é imutável para a aplicação de produto.
GRANT SELECT ON professional_consent TO app_role;
GRANT SELECT, INSERT ON professional_consent TO iris_auth;

CREATE POLICY professional_consent_auth_all ON professional_consent
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
