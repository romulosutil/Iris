# Fase 4 — Camada de resolução slug→UUID (unblocker de 4B)

> Status: **design + 1 decisão aberta** (toca contrato do agente — expensive category).
> Contexto: `evidence` guarda refs crus (`protocol_slug`/`dominio_id`/`goal_ref`) + UUIDs
> resolvidos nullable. Hoje os UUIDs ficam nulos. 4B (fold/segmentação/candidatura) precisa deles.

---

## 1. Contrato real (investigado)

O agente **não** recebe nem emite o UUID do protocolo/milestone. O que trafega:

| Ref no alvo | O que é | Resolvível? |
| --- | --- | --- |
| `goal_id` | **UUID real** de `goal`, ecoado do contexto (`context-loader.ts:93`) | ✅ identidade |
| `protocol_id` | **slug de `familia`** (`"vbmapp"`), não o UUID (`context-assembler.ts:11`) | ✅ lookup |
| `dominio_id` | slug de domínio (`"mando"`), `milestone.dominio_id` text | — (parcial) |
| `milestone_id` | **não existe** no alvo | ⚠️ ambíguo |

`milestone` é único por `(protocol_id, dominio_id, nivel)` — um par `(protocolo, domínio)` tem
**N marcos, um por nível**. O alvo não carrega `nivel` → não dá para escolher o marco.

## 2. Resolvedor determinístico (o que dá para fazer já)

Função `resolverAlvoParaFks(clinicId, patientId, alvo)`:

1. **goal_id** → aceita se `alvo.goal_id` é UUID que existe em `goal` do paciente (RLS já escopa).
   Identidade. (Já funciona no backfill.)
2. **protocol_id** → `SELECT p.id FROM protocol p JOIN patient_protocol pp ON pp.protocol_id = p.id
   WHERE p.clinic_id = :clinic AND p.familia = :slug AND pp.patient_id = :patient
   AND pp.desativado_em IS NULL`. Determinístico quando o paciente tem **1** protocolo ativo dessa
   família (caso normal). Se >1 → ambíguo → `null` + flag (não adivinha).
3. **milestone_id** → só quando `(protocol_id, dominio_id)` tem **exatamente 1** marco; senão `null`.

Onde roda: **na aprovação da extração** (não só no backfill). Precisa nascer um caminho de
inserção de `evidence` on-approve (hoje só o backfill escreve `evidence`) — ver §4.

## 3. DECISÃO ABERTA — resolução de `milestone_id` (contrato do agente)

Quando um domínio tem múltiplos marcos por nível, o alvo atual não permite escolher. Opções:

- **(A) Adicionar `nivel` (ou `milestone_ref`) ao alvo do agente.** Muda
  `agent-output-schema.ts` + `prompt.ts` + `contexto-exemplo.json` (o contexto passa a expor os
  marcos por nível para o agente ecoar). Resolução determinística total. **Custo:** mudança de
  contrato do agente (uma das 3 coisas mais caras de errar; superfície de prompt-injection — ver
  [[prompt-injection-fase3]]). Precisa de teste do agente.
- **(B) Disambiguação humana na aprovação.** Quando `(protocol, dominio)` for ambíguo, a tela de
  revisão pede ao terapeuta/coordenador escolher o marco (nível) antes de aprovar. Sem tocar o
  contrato do agente; move o custo para a UI de revisão (Fase 3). Clinicamente defensável (o humano
  confirma o alvo formal).
- **(C) Aceitar `milestone_id` nulo por ora.** Trajetória/briefing operam em grão de **goal** e
  **protocolo/família** (que resolvem), e candidatura de marco (`milestone_candidacy`) fica dormente
  até (A) ou (B). Menor escopo; adia o valor de marco.

**Recomendação:** **(C) agora + (B) como evolução.** goal+protocolo já entregam timeline,
comparação e boa parte do briefing; a candidatura de marco formal combina com disambiguação humana
(B), que é o lugar clinicamente certo para fixar o nível — e não expande a superfície do agente.
(A) só se a disambiguação manual provar-se cara no uso real.

## 4. Caminho de inserção de `evidence` on-approve

Hoje `extraction` aprovada não gera `evidence` (só o backfill gera). Para o fluxo forward:
na ação de aprovar (`src/app/(app)/revisao/[sessionId]/actions.ts`), após transicionar para
`aprovada`/`editada`, inserir 1 `evidence` por alvo (grão de alvo, `alvo_ordinal` por índice),
chamando `resolverAlvoParaFks`, gravando refs crus + FKs resolvidos, e então
`app_materializar_snapshot(patient, session_numero)`. Idempotente (mesma `uq_evidence_alvo`).
⚠️ Toca código da Fase 3 (aprovação) — diff para revisão.

## 5. Ordem proposta

1. Resolvedor determinístico (goal identidade + protocol família→ativo + milestone single-only).
2. Inserção de `evidence` on-approve + chamada da materialização (esqueleto já existe).
3. Reusar o resolvedor no `backfill-evidence.ts` (hoje só aceita UUID — passar a resolver slug).
4. Decisão milestone (§3) destrava candidatura de marco.
