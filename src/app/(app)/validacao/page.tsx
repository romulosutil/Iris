import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { listarFilaValidacao } from "./queries";
import { alvosValidosDoPaciente, type AlvoValido } from "./alvos";
import { ValidacaoFila } from "./validacao-fila";

/**
 * Fila de validação do coordenador (Fase 5 · Fatia 1), restaurada em #533
 * (auditoria 360, `PR-01`, P0 — decisão D-AUD-1, opção b).
 *
 * A #512 (T14) tinha transformado esta rota num `redirect("/sessoes")`, e com
 * isso a fila POR EVIDÊNCIA — confirmar / reclassificar com justificativa /
 * invalidar / lote de alta confiança, a 3ª camada do modelo de governança —
 * ficou sem nenhuma página que a montasse: as actions e queries continuaram
 * existindo e testadas (31 int-tests), mas nenhum coordenador chegava nelas.
 * `/sessoes` é a fila POR SESSÃO (o que está travado); esta é a fila por
 * evidência (o que a IA anotou com fricção e pede um segundo olhar). São
 * duas perguntas diferentes, e esta volta a ter porta em `nav.ts`
 * (`alcance-de-rotas.test.ts` trava isso).
 *
 * Só coordenador. Terapeuta e `admin_recepcao` não recebem 404 mudo (o guard
 * pré-#512 era `notFound()`): vão para a tela que É deles — a fila de sessões
 * e a agenda — sem fingir que a rota não existe.
 *
 * `?sessao=<id>` chega de `/sessoes/[id]` em `revisada` ("Abrir na fila de
 * validação"): a página recorta os itens daquela sessão e oferece o caminho de
 * volta à fila inteira. Se a sessão não tem mais item pendente, diz isso por
 * extenso e mostra a fila inteira — nunca um "Tudo em dia" falso por cima de
 * uma fila cheia.
 */
export default async function ValidacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") {
    redirect(ctx.role === "terapeuta" ? "/sessoes" : "/agenda");
  }

  const sp = await searchParams;
  const sessaoEmFoco =
    typeof sp.sessao === "string" && sp.sessao.trim() !== "" ? sp.sessao : null;

  const fila = await listarFilaValidacao(ctx);

  const itensDaSessao =
    sessaoEmFoco === null
      ? null
      : fila.itens.filter((i) => i.sessionId === sessaoEmFoco);
  const itens =
    itensDaSessao !== null && itensDaSessao.length > 0
      ? itensDaSessao
      : fila.itens;

  const pacientesUnicos = Array.from(new Set(itens.map((i) => i.patientId)));
  const alvosPorPaciente: Record<string, AlvoValido[]> = {};
  if (pacientesUnicos.length > 0) {
    await withTenant(ctx, async (tx) => {
      for (const patientId of pacientesUnicos) {
        alvosPorPaciente[patientId] = await alvosValidosDoPaciente(
          tx,
          patientId,
        );
      }
    });
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Validação"
        description={
          fila.total === 0
            ? "Nenhuma evidência aguardando seu olhar clínico."
            : `A IA anotou ${fila.total} ${fila.total === 1 ? "sugestão de sessão" : "sugestões de sessões"} com fricção. Pronto para validar com seu olhar clínico?`
        }
      />
      {itensDaSessao !== null ? (
        itensDaSessao.length > 0 ? (
          <Alert severidade="info">
            Mostrando só{" "}
            {itensDaSessao.length === 1
              ? "o item"
              : `os ${itensDaSessao.length} itens`}{" "}
            da sessão que você abriu.{" "}
            <Link href="/validacao" className="font-semibold underline">
              Ver a fila inteira ({fila.total})
            </Link>
          </Alert>
        ) : (
          <Alert severidade="info">
            Esta sessão não tem item pendente na fila de validação — já foi
            encerrada ou nunca entrou. Abaixo, a fila inteira.
          </Alert>
        )
      ) : null}
      <ValidacaoFila itens={itens} alvosPorPaciente={alvosPorPaciente} />
    </Stack>
  );
}
