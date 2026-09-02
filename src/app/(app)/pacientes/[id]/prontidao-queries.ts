import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import type { FatosProntidao } from "@/lib/patient/prontidao";
import type { ModalidadeClinica } from "./modalidade";

/**
 * Formato cru de uma linha de `app_fatos_prontidao` (colunas `snake_case` do
 * Postgres, não convertidas pelo Drizzle porque a leitura é `tx.execute`, não
 * `tx.select`). Exportado porque `listarTodosPacientes`
 * (`src/app/(app)/pacientes/queries.ts`) lê pela MESMA função — D-A12 — e
 * precisa do mesmo formato de linha para a chamada em lote.
 */
// `type`, não `interface`: só um alias de tipo-literal ganha o índice
// implícito (`[k: string]: unknown`) que `Tx["execute"]<TRow>` exige
// (`TRow extends Record<string, unknown>`) — uma `interface` homônima
// estoura TS2344 nos dois chamadores.
export type LinhaFatosProntidaoCrua = {
  patient_id: string;
  tem_ficha_clinica: boolean;
  tem_anamnese: boolean;
  tem_protocolo_ativo: boolean;
  tem_meta_ativa: boolean;
  tem_instrumento_aplicado: boolean;
  tem_sessao_consolidada: boolean;
  /** 8ª coluna (Task 7c): `patient.clinical_modality`, lida pelo MESMO guard
   * dos seis fatos. Ver o cabeçalho de `obterFatosProntidaoNaTx`. */
  modalidade: ModalidadeClinica | null;
};

/**
 * O que a régua da prontidão precisa, numa estrutura só: os seis fatos MAIS a
 * modalidade que decide QUAIS deles bloqueiam (`capacidadesDaModalidade`).
 * Uma porta, um guard, uma imagem do banco.
 */
export type ProntidaoLida = {
  fatos: FatosProntidao;
  modalidade: ModalidadeClinica | null;
};

/**
 * Fatos da prontidão, numa transação só e numa chamada ao definer.
 *
 * Mesmo formato de `obterProgressoOnboarding` (`src/app/(app)/onboarding-queries.ts`):
 * os seis precisam enxergar a MESMA imagem do banco. Em seis idas, uma
 * prescrição concorrente apareceria para metade da resposta e a escada
 * piscaria entre dois estados.
 *
 * Toda leitura sai por `withTenant` (`app_role`, RLS ativa) — o isolamento é
 * do BANCO.
 *
 * D-A9/D-A10 (Task 7c, `docs/superpowers/plans/2026-09-02-task-7c-definer-fatos-prontidao.md`):
 * `goal`, `patient_protocol`, `anamnese`, `instrumento_aplicacao` e
 * `session_snapshot` têm policy de SELECT chaveada por papel e equipe
 * (`goal_select`, `db/migrations/0006_fase2_rls.sql:207` — `coordenador` OR
 * `app_is_on_team`), sem recorte de terapeuta de cobertura. Ler os seis fatos
 * direto sob essa RLS devolveria `false` para fatos que EXISTEM sempre que o
 * chamador for um terapeuta de cobertura (`session.terapeuta_id`/
 * `atendido_por_id`) fora da equipe — falso-negativo que o gate fail-closed
 * transformaria em bloqueio indevido. `app_fatos_prontidao` (`SECURITY
 * DEFINER`, migração `0142`) espelha `goal_select` MAIS o recorte de
 * cobertura que a `0092` (D8/#174) já reconhece como autorização clínica
 * legítima, e RAISE em vez de `false` silencioso quando nem isso autoriza.
 * `montarProntidao` (`src/lib/patient/prontidao.ts`) segue só montando
 * escada para {coordenador, terapeuta}; esta função nunca decide papel
 * sozinha.
 *
 * ── A 8ª coluna: `modalidade` ─────────────────────────────────────────────
 * A lacuna de cobertura não parava nos seis fatos. `patient_select`
 * (`db/migrations/0085_policies_tenant_helper.sql:224`) é
 * `clinic_id = app_clinic_id_exigido() AND (papel IN (coordenador,
 * admin_recepcao) OR app_is_on_team(id))` — também SEM recorte de cobertura.
 * Não é que o terapeuta de cobertura leia a modalidade errada: ele não lê a
 * linha `patient` NENHUMA. E `patient.clinical_modality` é entrada da MESMA
 * régua (`montarProntidao`, degrau "modalidade", bloqueante quando ausente).
 * Enquanto ela vinha de fora — pelo `leftJoin` que `logic.ts` mantinha —
 * "não vejo" e "não está definida" chegavam idênticos à régua, que tratava o
 * primeiro como o segundo: o bloqueio indevido reaparecia um campo adiante
 * do que os seis fatos fecharam. Devolvê-la AQUI mantém uma porta só e um
 * guard só; alargar `patient_select` exporia a linha `patient` inteira (PII)
 * a quem só precisa de um enum.
 *
 * ── Duas portas, UMA query ────────────────────────────────────────────────
 * `obterFatosProntidaoNaTx` recebe a `tx` já aberta; `obterFatosProntidao`
 * abre a sua. A extração existe porque quem já está dentro de uma transação
 * (`carregarSessao`, `assertPodeDocumentar`) precisa dos fatos na MESMA
 * imagem do banco — e porque `withTenant` aninhado é uma armadilha: ele seta
 * o tenant com `set_config(..., true)` (transaction-local) e a transação
 * interna do Drizzle vira SAVEPOINT; ao liberar o savepoint, os valores que
 * ele escreveu PERMANECEM no resto da transação externa. Hoje ninguém passa
 * `ctx` diferente, então nada quebra — amanhã, um `ctx` diferente trocaria o
 * tenant de todas as queries seguintes da transação externa, em silêncio.
 * As duas portas rodam o MESMO SQL: é esse o ponto da extração.
 */
export async function obterFatosProntidaoNaTx(
  tx: Tx,
  patientId: string,
): Promise<ProntidaoLida> {
  const linhas = (await tx.execute<LinhaFatosProntidaoCrua>(
    sql`SELECT * FROM app_fatos_prontidao(ARRAY[${patientId}]::uuid[])`,
  )) as unknown as LinhaFatosProntidaoCrua[];
  const linha = linhas[0];

  return {
    fatos: {
      temFichaClinica: Boolean(linha?.tem_ficha_clinica),
      temAnamnese: Boolean(linha?.tem_anamnese),
      temProtocoloAtivo: Boolean(linha?.tem_protocolo_ativo),
      temMetaAtiva: Boolean(linha?.tem_meta_ativa),
      temInstrumentoAplicado: Boolean(linha?.tem_instrumento_aplicado),
      temSessaoConsolidada: Boolean(linha?.tem_sessao_consolidada),
    },
    modalidade: linha?.modalidade ?? null,
  };
}

/** Porta para quem AINDA NÃO tem transação aberta (páginas, layouts). */
export async function obterFatosProntidao(
  ctx: TenantContext,
  patientId: string,
): Promise<ProntidaoLida> {
  return withTenant(ctx, (tx) => obterFatosProntidaoNaTx(tx, patientId));
}
