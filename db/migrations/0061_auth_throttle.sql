-- Fatia A (#163), Task 7: contador de tentativas COMPARTILHADO E PERSISTENTE
-- para a rota pública de cadastro.
--
-- POR QUE EM POSTGRES E NÃO EM MEMÓRIA (`src/lib/rate-limit.ts`):
-- `verificarPossePorSenha` (src/auth/cadastro.ts) verifica a senha de um e-mail
-- já existente através de `auth.$context`, que NÃO passa por `auth.handler` — o
-- dispatcher HTTP do Better-Auth onde vivem rate limiting, contador de falha e
-- lockout. Nenhum deles roda nesse caminho. Ou seja: a rota pública de cadastro
-- é, na prática, um verificador de credencial, e a ÚNICA proteção contra força
-- bruta é este contador. Um `Map` por processo não serve: com N réplicas o
-- limite efetivo vira N×limite, e cada deploy/reciclagem zera o estado — dois
-- bypasses triviais para um atacante paciente. `src/lib/rate-limit.ts` continua
-- existindo para o que ele foi feito (anti-enumeração de baixo custo), mas não
-- é usado aqui.
CREATE TABLE auth_throttle (
  chave text PRIMARY KEY,
  contagem integer NOT NULL DEFAULT 0,
  -- Fim da janela deslizante. Tentativas excedentes EMPURRAM este valor
  -- (backoff exponencial com teto), então ele também funciona como "bloqueado
  -- até".
  janela_expira_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Suporta a limpeza oportunista de entradas velhas (chaves são controladas pelo
-- atacante — e-mails e IPs arbitrários — então a tabela precisa poder encolher).
CREATE INDEX auth_throttle_expira_idx ON auth_throttle (janela_expira_em);

ALTER TABLE auth_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_throttle FORCE ROW LEVEL SECURITY;

-- Infraestrutura de IDENTIDADE, como auth_*: só iris_auth toca. app_role (a
-- conexão do produto, que passa por withTenant) NÃO recebe grant nenhum —
-- nada em dado de paciente tem motivo para ler ou escrever aqui.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_throttle TO iris_auth;

-- Idioma padrão das tabelas de identidade (0002_rls_globais.sql): policy FOR
-- ALL casada com o GRANT completo. Diferente de professional_consent (0058),
-- que é evidência imutável e por isso tem policies estreitas de propósito.
CREATE POLICY auth_throttle_auth_all ON auth_throttle
  FOR ALL TO iris_auth USING (true) WITH CHECK (true);
