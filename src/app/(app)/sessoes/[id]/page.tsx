import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { asrHabilitado } from "@/lib/flags";
import { ReprocessarExtracao } from "../../diario/[sessionId]/reprocessar-extracao";
import { carregarSessao } from "./queries";
import { Timeline, ROTULO_GESTO, ROTULO_MOTIVO } from "./timeline";
import { PassoDocumentar } from "./passo-documentar";
import { PassoRevisar } from "./passo-revisar";
import { CorrigirNota } from "./corrigir-nota";
import { CartaoProntidao } from "@/components/app/cartao-prontidao";

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

async function PassoEmFoco({
  sessionId,
  ctx,
  dados,
  resultado,
}: {
  sessionId: string;
  ctx: Awaited<ReturnType<typeof getTenantContext>>;
  dados: NonNullable<Awaited<ReturnType<typeof carregarSessao>>>;
  resultado: NonNullable<
    Awaited<ReturnType<typeof carregarSessao>>
  >["resultado"];
}) {
  // Terminal: nenhum passo pendente.
  if (resultado.gesto === null) {
    return (
      <Alert severidade="info">
        Sessão encerrada sem passo pendente (
        {resultado.estado === "falta" ? "falta" : "cancelada"}).
      </Alert>
    );
  }

  switch (resultado.gesto) {
    case "registrar_sessao":
      return (
        <Alert severidade="info" titulo={ROTULO_GESTO.registrar_sessao}>
          Esta sessão ainda não aconteceu.{" "}
          <Link href="/agenda" className="font-semibold underline">
            Registrar o desfecho na agenda
          </Link>
          .
        </Alert>
      );

    case "documentar":
      // A régua morde aqui: agendar é livre, documentar não. Sem protocolo
      // vigente e meta ativa, `materializar.ts` descarta a evidência — o
      // terapeuta gastaria a sessão inteira preenchendo um formulário cujo
      // resultado nunca chega à evolução.
      if (!dados.prontidao.podeDocumentar) {
        return (
          <CartaoProntidao
            prontidao={dados.prontidao}
            titulo="Esta sessão ainda não pode ser documentada"
          />
        );
      }
      return (
        <PassoDocumentar
          sessionId={sessionId}
          protocolos={dados.protocolos}
          protocolIdsPreSelecionados={dados.protocolIdsPreSelecionados}
          asrHabilitado={asrHabilitado()}
          temCaptura={dados.temCaptura}
          ehDono={dados.ehDono}
        />
      );

    case "revisar_evidencias":
      // `extracao_travada` também aponta gesto `reprocessar_extracao`, nunca
      // `revisar_evidencias` (ver estado.ts) — chegar aqui com
      // `precisa_atencao` só acontece no motivo `na_fila_validacao`.
      return (
        <Stack gap="md">
          {resultado.estado === "precisa_atencao" ? (
            <Alert severidade="warning">
              {ROTULO_MOTIVO[resultado.motivo]}
            </Alert>
          ) : null}
          <PassoRevisar
            ctx={ctx}
            sessionId={sessionId}
            podeColapsarAprovacao={dados.podeColapsarAprovacao}
          />
        </Stack>
      );

    case "reprocessar_extracao":
      return (
        <Stack gap="md">
          <Alert severidade="erro" titulo={ROTULO_GESTO.reprocessar_extracao}>
            {resultado.estado === "precisa_atencao"
              ? ROTULO_MOTIVO[resultado.motivo]
              : "A extração falhou e precisa ser reprocessada."}
          </Alert>
          {dados.ehDono ? (
            <ReprocessarExtracao sessionId={sessionId} />
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Só o terapeuta da sessão pode reprocessar.
            </p>
          )}
        </Stack>
      );

    case "ver_no_acervo":
      return (
        <Alert severidade="sucesso" titulo={ROTULO_GESTO.ver_no_acervo}>
          {resultado.estado === "revisada"
            ? "Revisada — falta só a coordenação encerrar o item na fila."
            : "Toda a documentação desta sessão já está no acervo do paciente."}{" "}
          <Button asChild variante="neutra">
            <Link href={`/pacientes/${dados.patientId}`}>Ver no acervo</Link>
          </Button>
        </Alert>
      );
  }
}
