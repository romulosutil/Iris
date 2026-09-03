import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { carregarSessao } from "./queries";
import { Timeline } from "./timeline";
import { CorrigirNota } from "./corrigir-nota";
import { PassoEmFoco } from "./passo-em-foco";

/**
 * `/sessoes/[id]` — timeline dos 5 estados canônicos + o passo em foco
 * (T06, jornada-sessao-unificada.md §3.2). Absorve `/diario/[sessionId]`
 * (captura + consolidação) e `/revisao/[sessionId]` (revisão de extrações):
 * refactor de montagem — reusa os componentes e queries de ambos, não
 * reimplementa a lógica de negócio.
 *
 * R-05: quem escolhe o passo em foco é `resultado.gesto`, devolvido por
 * `deriveEstadoSessao` (T01) — esta página não redefine gesto por conta
 * própria, só troca de componente por cima do valor já decidido.
 */
export default async function SessaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const ctx = await getTenantContext();
  const agora = new Date();

  const dados = await carregarSessao(ctx, sessionId, agora);
  if (!dados) notFound();

  // Defesa em profundidade — mesmo critério de `/diario` e `/revisao`: RLS já
  // isola por clínica/equipe, mas a tela só é do terapeuta dono ou coordenação.
  if (!dados.podeVer) notFound();

  const { resultado } = dados;

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Sessões", href: "/sessoes" },
              {
                rotulo: dados.pacienteNome
                  ? `Sessão · ${dados.pacienteNome}`
                  : "Sessão",
                atual: true,
              },
            ]}
          />
        }
        title="Sessão"
        description={dados.pacienteNome ?? "Paciente (acesso restrito)"}
      />

      <Timeline resultado={resultado} />

      <PassoEmFoco
        sessionId={sessionId}
        ctx={ctx}
        dados={dados}
        resultado={resultado}
      />

      {/* #513 — conserto de um passo já concluído, não o próximo passo: fica
          depois do gesto primário e fechado por padrão. Só aparece com nota
          gravada (nada a corrigir sem ela) e só para o dono (a RLS recusa a
          escrita de qualquer outro — #514). Fora dos terminais (`gesto ===
          null`): numa sessão de falta/cancelada não há mais trabalho clínico
          a fazer, e reconsolidar ali reabriria a análise da IA. */}
      {dados.ehDono && dados.notaConsolidada && resultado.gesto !== null ? (
        <CorrigirNota
          sessionId={sessionId}
          texto={dados.notaConsolidada.texto}
          visibilityLevel={dados.notaConsolidada.visibilityLevel}
        />
      ) : null}
    </Stack>
  );
}
