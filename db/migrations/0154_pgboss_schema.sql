-- Criação do schema pgboss e grants de privilégio para app_role
-- Permite que pg-boss crie e gerencie tabelas de jobs sem exigir privilégio de superusuário ou BYPASSRLS em runtime.

CREATE SCHEMA IF NOT EXISTS pgboss;

GRANT USAGE, CREATE ON SCHEMA pgboss TO app_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgboss TO app_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgboss TO app_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA pgboss TO app_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON SEQUENCES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON FUNCTIONS TO app_role;
