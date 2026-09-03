import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic, janelaTrabalho, patient, userRole } from "@/db/schema";
import type { LinhaFatosProntidaoCrua } from "@/lib/patient/prontidao-queries";
import type { PassoId } from "@/lib/onboarding/passos";
import { montarProntidao } from "@/lib/patient/prontidao";

export type ProgressoOnboarding = Record<PassoId, boolean>;

/**
 * Progresso do onboarding derivado do ESTADO REAL do banco (#36, bloco D2).
 *
 * Sem coluna de flag, de propósito: flag manual só é verdadeira enquanto
 * alguém lembra de escrevê-la, e um passo desfeito (o único terapeuta removido
 * da equipe) continuaria marcado como concluído para sempre.
 *
 * Um `select` só: os passos precisam enxergar a mesma imagem do banco. Em
 * várias idas, um cadastro concorrente apareceria para metade da resposta e a
 * lista piscaria entre dois estados. Vale também para o quinto passo — por
 * isso ele entra como `json_agg` no MESMO statement, e não numa segunda query.
 *
 * Toda leitura sai por `withTenant` (`app_role`, RLS ativa) — o isolamento é do
 * BANCO, e o teste de integração cobre o vazamento cross-tenant. Os subselects
 * de `user_role`, `janela_trabalho` e `patient` NÃO repetem o filtro por
 * clínica: quem filtra é a policy. Acrescentá-lo aqui mascararia uma policy
 * quebrada. O `EXISTS` de `clinic` é a exceção porque ali o `id` é o predicado
 * do próprio passo, não isolamento.
 *
 * ── O quinto passo NÃO tem `EXISTS` próprio (D-A5) ────────────────────────
 * "Pronto para atender" é `montarProntidao().podeDocumentar`, e essa régua é
 * POR MODALIDADE (`capacidadesDaModalidade`): `protocol_driven` bloqueia em
 * protocolo + meta, `cognitive_behavioral` em instrumento aplicado,
 * `conventional` não bloqueia em nada (D-A7), e modalidade não resolvida
 * bloqueia na própria modalidade. Um `EXISTS` de "protocolo vigente E meta
 * ativa" aqui responderia certo só para o `protocol_driven` e criaria uma
 * segunda tabela de degraus fora de `modalidade.ts` — exatamente o que a
 * D-A5 proíbe. Então o SQL devolve só os FATOS (via `app_fatos_prontidao`,
 * migração `0149`, a mesma porta de `prontidao-queries.ts` e da lista de
 * pacientes) e quem decide continua sendo a função pura.
 *
 * O `json_agg` cobre todos os pacientes visíveis, sem `LIMIT`: "existe ao
 * menos um pronto" não sobrevive a um recorte arbitrário — a linha elegível
 * pode estar fora dele. Mesmo custo de leitura em lote que
 * `listarTodosPacientes` já paga (D-A12), e o único chamador é a `/agenda` do
 * coordenador (`agenda/page.tsx`), papel que o guard do definer autoriza sem
 * recorte de equipe.
 */
export async function obterProgressoOnboarding(
  ctx: TenantContext,
): Promise<ProgressoOnboarding> {
  return withTenant(ctx, async (tx) => {
    const [linha] = await tx
      .select({
        // Os dois campos do formulário de `/clinica/dados` que o faturamento
        // exige. Só um deles preenchido é cadastro pela metade, não passo
        // concluído.
        clinica: sql<boolean>`EXISTS (
          SELECT 1 FROM ${clinic}
          WHERE ${clinic.id} = ${ctx.clinicId}
            AND ${clinic.razaoSocial} IS NOT NULL
            AND ${clinic.enderecoCep} IS NOT NULL
        )`,
        // `<>` o próprio usuário: a clínica nasce com o coordenador dentro, e
        // contá-lo faria o passo nascer concluído para todo mundo.
        equipe: sql<boolean>`EXISTS (
          SELECT 1 FROM ${userRole}
          WHERE ${userRole.userId} <> ${ctx.userId}
        )`,
        agenda: sql<boolean>`EXISTS (SELECT 1 FROM ${janelaTrabalho})`,
        paciente: sql<boolean>`EXISTS (SELECT 1 FROM ${patient})`,
        // Fatos crus, não veredito: a régua fica em `montarProntidao`.
        // `COALESCE` porque `json_agg` sobre zero linhas devolve `NULL`, e
        // clínica sem paciente é o caso NORMAL neste checklist.
        fatosProntidao: sql<LinhaFatosProntidaoCrua[]>`COALESCE((
          SELECT json_agg(f)
          FROM app_fatos_prontidao(ARRAY(SELECT p.id FROM ${patient} p)::uuid[]) f
        ), '[]'::json)`,
      })
      .from(sql`(SELECT 1) AS uma_linha`);

    // `some`, não `every`: o passo é sobre o PRIMEIRO paciente pronto. Exigir
    // todos faria a lista de primeiros passos reaparecer para sempre em
    // clínica que já rodou — o checklist é de onboarding, não de qualidade.
    const primeiroPacientePronto = (linha?.fatosProntidao ?? []).some(
      (crua) =>
        montarProntidao({
          modalidade: crua.modalidade,
          fatos: {
            temFichaClinica: crua.tem_ficha_clinica,
            temAnamnese: crua.tem_anamnese,
            temProtocoloAtivo: crua.tem_protocolo_ativo,
            temMetaAtiva: crua.tem_meta_ativa,
            temInstrumentoAplicado: crua.tem_instrumento_aplicado,
            temSessaoConsolidada: crua.tem_sessao_consolidada,
          },
          role: ctx.role,
          patientId: crua.patient_id,
        }).podeDocumentar,
    );

    return {
      clinica: Boolean(linha?.clinica),
      equipe: Boolean(linha?.equipe),
      agenda: Boolean(linha?.agenda),
      paciente: Boolean(linha?.paciente),
      primeiroPacientePronto,
    };
  });
}
