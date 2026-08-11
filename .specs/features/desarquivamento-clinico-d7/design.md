# Design Técnico (Tech Lead Validated): Resolução D7 — Desarquivamento Clínico Unificado

> **Data:** 11/08/2026  
> **Status:** 🟢 Design Arquitetural Consolidado  
> **Componentes:** `src/lib/patient/desarquivamento.ts` & Pontos de Invocação Clínicos  

---

## 1. Contrato e Estrutura do Helper de Domínio

### 1.1 `src/lib/patient/desarquivamento.ts`

```typescript
import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { TenantContext, Tx } from "@/db/rls";
import { auditLog, patient } from "@/db/schema";

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
 * Princípios do design:
 * 1. O UPDATE em `patient` é mediado por `app_desarquivar_paciente` (SECURITY DEFINER)
 *    porque terapeutas não possuem privilégio de UPDATE em `patient` (RLS 0001).
 * 2. O gate `SELECT ... WHERE arquivado_em IS NOT NULL` antes da chamada atua sob o RLS
 *    do chamador. Para quem não vê o paciente ou para pacientes já ativos, a função
 *    retorna `false` imediatamente sem custo de lock ou chamadas ao DEFINER.
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
  const alvo = await tx
    .select({ id: patient.id })
    .from(patient)
    .where(and(eq(patient.id, patientId), isNotNull(patient.arquivadoEm)));

  if (alvo.length === 0) return false;

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

## 2. Mapa Completo de Injeção Transacional

```
                                  [ Ação Clínica ]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
          [ Transação da Ação ]                     [ Transação da Ação ]
       Ex: Inserção de Evidence                  Ex: Ativação de Protocolo
                   │                                           │
                   ▼                                           ▼
   desarquivarPacienteSeArquivado(tx, ctx, patientId, "aprovacao_evidencia")
                   │
                   ├─► 1. SELECT id FROM patient WHERE arquivado_em IS NOT NULL
                   │      (Se vazio / já ativo / sem RLS -> retorna false)
                   │
                   ├─► 2. SELECT app_desarquivar_paciente(patientId) (SECURITY DEFINER)
                   │      (Executa UPDATE patient SET arquivado_em = NULL)
                   │
                   └─► 3. Se desarquivou = true:
                          INSERT INTO audit_log (acao = 'paciente_desarquivado_automaticamente')
```

### Detalhamento por Arquivo e Função:

1. **`src/app/(app)/diario/[sessionId]/logic.ts`**
   * `capturarDiarioCore`: `desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "registro_clinico")`
   * `consolidarSessaoCore`: `desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "registro_clinico")`
   * `corrigirEscopoProtocoloCore`: `desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "escopo_protocolo")`
   * `registrarAudioLocalCore`: `desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "audio_local")`

2. **`src/app/(app)/revisao/[sessionId]/logic.ts`**
   * `transicionar`: Quando `novoEstado === "aprovada" || novoEstado === "editada"`, executa `desarquivarPacienteSeArquivado(tx, ctx, sess.patientId, "aprovacao_evidencia")`

3. **`src/app/(app)/validacao/logic.ts`**
   * `confirmarEvidenciaCore`: `desarquivarPacienteSeArquivado(tx, ctx, e.patientId, "validacao_evidencia")`
   * `reclassificarEvidenciaCore`: `desarquivarPacienteSeArquivado(tx, ctx, e.patientId, "validacao_evidencia")`

4. **`src/app/(app)/duvidas/logic.ts`**
   * `responderQueryCore`: `desarquivarPacienteSeArquivado(tx, ctx, e.patientId, "validacao_evidencia")`

5. **`src/app/(app)/pacientes/[id]/cadastro-clinico/protocolo-logic.ts`**
   * `ativarProtocoloCore`: `desarquivarPacienteSeArquivado(tx, ctx, patientId, "ativacao_protocolo")`

6. **`src/app/(app)/pacientes/[id]/metas/logic.ts`**
   * `criarMetaCore`: `desarquivarPacienteSeArquivado(tx, ctx, d.patientId, "criacao_meta")`

7. **`src/app/(app)/pacientes/[id]/cadastro-clinico/prescricao-logic.ts`**
   * `salvarPrescricaoCore`: `desarquivarPacienteSeArquivado(tx, ctx, patientId, "prescricao_disciplina")`

8. **`src/app/(app)/pacientes/[id]/cadastro-clinico/logic.ts`**
   * `salvarFichaClinicaCore`: `desarquivarPacienteSeArquivado(tx, ctx, patientId, "ficha_clinica")`
