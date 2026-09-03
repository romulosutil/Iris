import Link from "next/link";
import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { asrHabilitado } from "@/lib/flags";
import { ReprocessarExtracao } from "../../diario/[sessionId]/reprocessar-extracao";
import type { carregarSessao } from "./queries";
import { ROTULO_GESTO, ROTULO_MOTIVO } from "./timeline";
import { PassoDocumentar } from "./passo-documentar";
import { PassoRevisar } from "./passo-revisar";
import { PassoVerNoAcervo } from "./passo-ver-no-acervo";
import { CartaoProntidao } from "@/components/app/cartao-prontidao";
import type { getTenantContext } from "@/auth/tenant";

/**
 * Extraído de `page.tsx` (T07b, débito reportado por Task 7): a régua que
 * troca `PassoDocumentar` pelo `CartaoProntidao` — `dados.prontidao.
 * podeDocumentar` — vivia só dentro de `SessaoPage`, então nenhum teste
 * mutava aquele `if` e ficava vermelho. Exportado aqui para
 * `passo-em-foco.test.tsx` renderizar o passo "documentar" nos dois estados
 * (bloqueado/liberado) sem montar a página inteira.
 */
export async function PassoEmFoco({
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
        // §4a / D-A9 — fail-closed SEM afirmação falsa. Quando os fatos não
        // são legíveis para o papel atual, a escada vem VAZIA: `CartaoProntidao`
        // cairia no seu `proximo === null → return null` e esta superfície não
        // mostraria NADA — indistinguível do bom caso "prontuário pronto,
        // formulário liberado". Quem olha não saberia se pode documentar, e o
        // sistema não diria por quê.
        //
        // O texto é FIXO e não nomeia degrau clínico nenhum: nomeá-lo seria
        // afirmação falsa (sob a RLS desse papel todo `EXISTS` clínico devolve
        // `false` para linhas que EXISTEM) e vazamento de estado clínico no
        // mesmo selo. `quemResolve` sai da própria régua — não é copy nova.
        //
        // Só aqui, e não dentro de `CartaoProntidao`: no PRONTUÁRIO o cartão
        // continua sumindo ("nada a fazer não ocupa pixel"), e a recepção não
        // pode receber selo nenhum lá. É nesta superfície — onde a régua morde
        // e o formulário some — que a ausência precisa de razão.
        if (dados.prontidao.situacao === "fatos_nao_visiveis") {
          return (
            <Alert
              severidade="info"
              titulo="Esta sessão ainda não pode ser documentada"
            >
              Aguardando {dados.prontidao.quemResolve ?? "Coordenação"}.
            </Alert>
          );
        }
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
      // #533 — em `revisada`, o coordenador ganha "Abrir na fila de
      // validação" (`/validacao?sessao=<id>`); ver `passo-ver-no-acervo.tsx`.
      return (
        <PassoVerNoAcervo
          revisada={resultado.estado === "revisada"}
          patientId={dados.patientId}
          sessionId={sessionId}
          ehCoordenador={ctx.role === "coordenador"}
        />
      );
  }
}
