# Design Técnico — Painel de Governança e Segurança da Clínica

## Architecture & Data Flow

### 1. Migração SQL (`db/migrations/NNNN_funcao_status_mfa_equipe.sql`)
Criar a função Postgres `app_obter_status_mfa_equipe()` com o seguinte contrato e implementação:

```sql
CREATE OR REPLACE FUNCTION app_obter_status_mfa_equipe()
RETURNS TABLE (
  user_id uuid,
  nome text,
  email text,
  papel text,
  mfa_ativo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
  v_role   text := app_user_role_exigido();
BEGIN
  IF v_role <> 'coordenador' THEN
    RAISE EXCEPTION 'app_obter_status_mfa_equipe: acesso restrito a coordenador (papel atual: %)', v_role
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.name AS nome,
    u.email AS email,
    ur.papel::text AS papel,
    u.two_factor_enabled AS mfa_ativo
  FROM user_role ur
  JOIN app_user u ON u.id = ur.user_id
  WHERE ur.clinic_id = v_clinic
  ORDER BY u.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION app_obter_status_mfa_equipe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_obter_status_mfa_equipe() TO app_role;
```

### 2. Capa de Queries (`src/app/(app)/configuracoes/seguranca/queries.ts`)
- `obterStatusMfaEquipe(ctx)`: Executa `sql` via `withTenant(ctx, tx => tx.execute(sql`SELECT * FROM app_obter_status_mfa_equipe()`))` e retorna a lista de membros com status de MFA.
- `obterLogsAuditoriaClinica(ctx, limite)`: Executa busca na tabela `audit_log` onde `clinic_id = ctx.clinicId` ordenado por `criado_em DESC`.
- `gerarTermoGovernanca(ctx)`: Monta o texto legível e auditável com metadados da clínica e carimbo de segurança/criptografia.

### 3. Componentes da Interface (`src/app/(app)/configuracoes/seguranca/`)
- `page.tsx`: Server Component. Protegido por `requireRole(ctx, "coordenador")`. Busca dados em paralelo e renderiza as seções.
- `status-mfa-card.tsx`: Card no Design System *Espectro Brutal* (`Surface`, `Pill`, `Table`) exibindo os terapeutas/membros, seus papéis e badges de 2FA.
- `audit-logs-card.tsx`: Card exibindo os eventos recentes de `audit_log` da clínica.
- `termo-governanca-card.tsx`: Card com ações para visualizar e baixar o Termo de Governança e Criptografia.
