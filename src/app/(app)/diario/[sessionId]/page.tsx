import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import {
  careTeamMembership,
  patient,
  patientProtocol,
  protocol,
  session,
} from "@/db/schema";
import { Stack } from "@/components/ui/layout";
import { CapturaForm } from "./captura-form";
import { ConsolidarForm } from "./consolidar-form";

/**
 * Tela do diário de uma sessão: captura rápida (texto/áudio) + consolidação.
 * Carrega a sessão e os protocolos ativos do paciente na mesma disciplina do
 * terapeuta logado (heurística simples de pré-preenchimento — o terapeuta
 * pode corrigir o escopo no próprio `CapturaForm`).
 */
export default async function DiarioPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const ctx = await getTenantContext();

  const dados = await withTenant(ctx, async (tx) => {
    const [sess] = await tx
      .select({
        id: session.id,
        patientId: session.patientId,
        terapeutaId: session.terapeutaId,
      })
      .from(session)
      .where(eq(session.id, sessionId));
    if (!sess) return null;

    const [pac] = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, sess.patientId));

    // Disciplina do terapeuta da sessão junto a este paciente — base da
    // pré-seleção do chip de protocolo (o terapeuta corrige se a inferência
    // errar, via corrigirEscopoProtocoloAction).
    const [membro] = await tx
      .select({ disciplina: careTeamMembership.disciplina })
      .from(careTeamMembership)
      .where(
        and(
          eq(careTeamMembership.patientId, sess.patientId),
          eq(careTeamMembership.userId, sess.terapeutaId),
          isNull(careTeamMembership.vigenciaFim),
        ),
      );

    // Protocolos ativos do paciente — o filtro por disciplina só decide a
    // pré-seleção do chip, nunca esconde protocolos de outra disciplina.
    const protocolos = await tx
      .select({ id: protocol.id, nome: protocol.nome, disciplina: protocol.disciplina })
      .from(patientProtocol)
      .innerJoin(protocol, eq(protocol.id, patientProtocol.protocolId))
      .where(
        and(
          eq(patientProtocol.patientId, sess.patientId),
          isNull(patientProtocol.desativadoEm),
        ),
      );

    return { sess, pacienteNome: pac?.nome, protocolos, disciplina: membro?.disciplina };
  });

  if (!dados) notFound();

  // Pré-seleção: protocolos da disciplina do terapeuta; se nenhum casar
  // (disciplina desconhecida ou sem protocolo correspondente), cai para
  // "todos os protocolos ativos" — nunca deixa o chip vazio à toa.
  const daDisciplina = dados.disciplina
    ? dados.protocolos.filter((p) => p.disciplina === dados.disciplina)
    : [];
  const preSelecionados = (daDisciplina.length > 0 ? daDisciplina : dados.protocolos).map(
    (p) => p.id,
  );

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Diário da sessão
        </h1>
        <p className="text-ink text-lg">
          {dados.pacienteNome ?? "Paciente (acesso restrito)"}
        </p>
      </Stack>

      <Stack gap="md" como="section" aria-labelledby="captura-titulo">
        <h2
          id="captura-titulo"
          className="font-display text-ink-anchor text-2xl font-bold"
        >
          Captura rápida
        </h2>
        <CapturaForm
          sessionId={sessionId}
          protocolos={dados.protocolos}
          protocolIdsPreSelecionados={preSelecionados}
        />
      </Stack>

      <Stack gap="md" como="section" aria-labelledby="consolidar-titulo">
        <h2
          id="consolidar-titulo"
          className="font-display text-ink-anchor text-2xl font-bold"
        >
          Consolidar sessão
        </h2>
        <ConsolidarForm sessionId={sessionId} />
      </Stack>
    </Stack>
  );
}
