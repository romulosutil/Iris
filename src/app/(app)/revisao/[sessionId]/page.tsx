import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { carregarRevisao } from "./queries";
import { RevisaoLista } from "./revisao-lista";

/**
 * Tela de revisão das extrações sugeridas pela IA de uma sessão (Fase 3 Plano
 * 2). Princípio 1 (honestidade visual) + Camada 1 (a IA nunca decide): cada
 * sugestão é `sugerida` até uma ação humana; aprovar EXIGE abrir o cartão — o
 * botão de aprovar só existe no estado expandido (lastro de que o conteúdo foi
 * exibido por inteiro). A página só resolve tenant + dados; a interação vive no
 * componente cliente `RevisaoLista`.
 */
export default async function RevisaoPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const ctx = await getTenantContext();

  const dados = await carregarRevisao(ctx, sessionId);
  if (!dados) notFound();

  // Defesa em profundidade: RLS já isola por tenant/equipe, mas a revisão é
  // ato do terapeuta DONO da sessão (as actions barram os demais no RLS de
  // update). Coordenação pode abrir para acompanhar, sem poder aprovar.
  const podeVer = ctx.role === "coordenador" || dados.ehDono;
  if (!podeVer) notFound();

  const n = dados.extracoes.length;

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Revisão de extrações
        </h1>
        <p className="text-ink text-lg">
          {dados.pacienteNome ?? "Paciente (acesso restrito)"} ·{" "}
          {n === 0
            ? "nada a revisar"
            : `${n} ${n === 1 ? "sugestão aguarda" : "sugestões aguardam"} sua revisão`}
        </p>
      </Stack>

      <RevisaoLista
        sessionId={sessionId}
        extracoes={dados.extracoes}
        ehDono={dados.ehDono}
      />
    </Stack>
  );
}
