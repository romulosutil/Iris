# Design Técnico (Tech Lead Validated): Resolução D8 — Desarquivamento por Terapeuta de Cobertura

> **Data:** 11/08/2026  
> **Status:** 🟢 Design Arquitetural Consolidado  
> **Componentes:** Migração `0092_desarquivar_paciente_cobertura.sql` & `src/lib/patient/desarquivamento.ts`

---

## 1. Migração de Banco: Reescrita da Procedure `app_desarquivar_paciente`

### 1.1 DDL da Migração (`db/migrations/0092_desarquivar_paciente_cobertura.sql`)

```sql
-- D8 / #174 — autoriza terapeuta de cobertura/substituto a desarquivar paciente.
--
-- MOTIVAÇÃO (D8):
-- Em 0067, o guard de autorização de app_desarquivar_paciente exigia estritamente
-- coordenador/admin_recepcao OU app_is_on_team(p_patient).
-- Terapeutas de cobertura (designados via session.terapeuta_id ou session.atendido_por_id)
-- possuem autorização clínica legítima para realizar o atendimento e gravar notas
-- (session_note_insert), mas eram barrados pela procedure.
--
-- O GUARD ATUALIZADO:
-- 1. Isolamento multi-tenant: app_patient_in_clinic(p_patient) [INEGOCIÁVEL]
-- 2. Autorização clínica:
--    - Coordenador ou admin_recepcao
--    - OU terapeuta membro da equipe (app_is_on_team)
--    - OU terapeuta com sessão atribuída ao paciente na mesma clínica
--      (session.terapeuta_id = app.user_id OU session.atendido_por_id = app.user_id)
-- 3. Idempotência: só altera arquivado_em se for NOT NULL, retornando true apenas
--    quando houve mutação real.

CREATE OR REPLACE FUNCTION app_desarquivar_paciente(p_patient uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_afetadas int;
BEGIN
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient;
  END IF;

  IF NOT (
    current_setting('app.user_role') IN ('coordenador', 'admin_recepcao')
    OR app_is_on_team(p_patient)
    OR EXISTS (
      SELECT 1 FROM session s
       WHERE s.patient_id = p_patient
         AND s.clinic_id = app_clinic_id_exigido()
         AND (s.terapeuta_id = (current_setting('app.user_id'))::uuid
              OR s.atendido_por_id = (current_setting('app.user_id'))::uuid)
    )
  ) THEN
    RAISE EXCEPTION 'app_desarquivar_paciente: paciente % fora da equipe ou cobertura do chamador (autorização cross-team)', p_patient;
  END IF;

  UPDATE patient
     SET arquivado_em = NULL
   WHERE id = p_patient
     AND arquivado_em IS NOT NULL;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_desarquivar_paciente(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_desarquivar_paciente(uuid) TO app_role;
```

---

## 2. Refatoração do Helper de Domínio (`src/lib/patient/desarquivamento.ts`)

```typescript
import "server-only";
import { sql } from "drizzle-orm";
import type { TenantContext, Tx } from "@/db/rls";
import { auditLog } from "@/db/schema";

export type OrigemDesarquivamento =
  | "registro_clinico"
  | "audio_local"
  | "escopo_protocolo"
  | "aprovacao_evidencia"
  | "validacao_evidencia"
  | "ativacao_protocolo"
  | "criacao_meta"
  | "prescricao_disciplina"
  | "ficha_clinica";

export const ACAO_DESARQUIVADO_AUTOMATICAMENTE =
  "paciente_desarquivado_automaticamente";

/**
 * #174 — regra 6: gravar registro clínico ou ato terapêutico para paciente
 * ARQUIVADO desarquiva automaticamente e deixa rastro na trilha de auditoria.
 *
 * Princípios do design (D7 + D8):
 * 1. O UPDATE em `patient` é mediado por `app_desarquivar_paciente` (SECURITY DEFINER)
 *    porque terapeutas não possuem privilégio de UPDATE em `patient` (RLS 0001).
 * 2. A procedure executa a verificação completa de autorização (coordenador, equipe
 *    ou cobertura de sessão) e isolamento multi-tenant diretamente no banco.
 * 3. Atomicidade: Executa dentro da mesma transação `tx` da ação clínica.
 * 4. Idempotência: `app_desarquivar_paciente` só retorna `true` quando houve mutação real
 *    de `arquivado_em` (NOT NULL -> NULL), emitindo exatamente 1 linha de `audit_log`.
 */
export async function desarquivarPacienteSeArquivado(
  tx: Tx,
  ctx: TenantContext,
  patientId: string,
  origem: OrigemDesarquivamento = "registro_clinico",
): Promise<boolean> {
  const linhas = (await tx.execute(
    sql`SELECT app_desarquivar_paciente(${patientId}::uuid) AS desarquivou`,
  )) as unknown as Array<{ desarquivou: boolean }>;

  if (!linhas[0]?.desarquivou) return false;

  await tx.insert(auditLog).values({
    clinicId: ctx.clinicId,
    atorId: ctx.userId,
    acao: ACAO_DESARQUIVADO_AUTOMATICAMENTE,
    entidade: "patient",
    entidadeId: patientId,
    patientId,
    detalhe: { origem },
  });

  return true;
}
```

---

## 3. Fluxo de Execução com Terapeuta de Cobertura

```
[ Terapeuta de Cobertura ] (Não está no care_team_membership, mas é session.terapeuta_id)
           │
           ▼
[ Ação Clínica: capturarDiario / consolidarSessao / registrarAudioLocal ]
           │
           ▼
[ Transação withTenant(ctx, tx) ]
           │
           ├─► 1. INSERT / UPDATE session_note / audio_capture (RLS session_note_insert valida app_session_terapeuta_id)
           │
           ├─► 2. desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "registro_clinico")
           │      │
           │      ├─► SELECT app_desarquivar_paciente(patientId) (SECURITY DEFINER)
           │      │     ├─► app_patient_in_clinic? SIM
           │      │     ├─► coordenador OR on_team OR EXISTS session (terapeuta_id = userId)? SIM (cobertura)
           │      │     ├─► UPDATE patient SET arquivado_em = NULL WHERE arquivado_em IS NOT NULL
           │      │     └─► Retorna true (se houve mutação) ou false (se já ativo)
           │      │
           │      └─► Se desarquivou = true:
           │            INSERT INTO audit_log (ator_id = ctx.userId, acao = 'paciente_desarquivado_automaticamente')
           │
           └─► 3. COMMIT da transação com diário salvo e paciente reativado com rastreabilidade completa.
```
