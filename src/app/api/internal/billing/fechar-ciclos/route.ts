import { timingSafeEqual } from "node:crypto";
import {
  aplicarBackstopDePrazo,
  cancelarAssinaturasComCarenciaVencida,
  comandarRetentativasPendentes,
  fecharCiclosVencendo,
  reprocessarEventosPendentes,
  type ResultadoBackstopPrazo,
  type ResultadoComandoRetentativa,
  type ResultadoCortePorCarencia,
} from "@/lib/billing/subscription";
import {
  detalheDoErro,
  detalheSemPii,
  registrarHeartbeat,
} from "@/lib/jobs/heartbeat";

/**
 * Gatilho interno do fechamento de ciclo (#36).
 *
 * Por que a apuração mora numa rota do app e não dentro do script agendado:
 * a imagem Docker do job NÃO herda as dependências do app (o Dockerfile lista
 * COPY e instala pacotes à mão), e um import novo que não chegou lá já derrubou
 * o motor de escalonamento em produção com test, typecheck e lint verdes. Se a
 * tabela de faixas de preço vivesse num `.mjs` paralelo, seria a mesma classe
 * de bug — com a agravante de cobrar valor errado em silêncio. O job é um POST;
 * a lógica fica aqui, onde `calculator.ts` é a única fonte do preço.
 *
 * Não é rota pública. A autenticação é um bearer fixo (`BILLING_JOB_TOKEN`)
 * comparado em tempo constante — mesmo idioma de `../../hooks/asaas/route.ts`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Texto de erro sem inventar causa: `Error.message` quando há, senão o valor cru. */
function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Bearer em tempo constante. Env ausente → false, nunca "passa porque não há
 * token configurado": um deploy sem o segredo deve recusar tudo, não liberar
 * um endpoint que dispara cobrança.
 */
function autorizado(header: string | null): boolean {
  const esperado = process.env.BILLING_JOB_TOKEN;
  if (!esperado || !header) return false;
  const prefixo = "Bearer ";
  if (!header.startsWith(prefixo)) return false;
  const recebido = header.slice(prefixo.length);
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let dryRun = false;
  try {
    const corpo = (await request.json()) as { dryRun?: unknown };
    dryRun = corpo?.dryRun === true;
  } catch {
    // Corpo ausente ou malformado = execução normal. O job manda `{dryRun}`,
    // mas um POST vazio disparado à mão continua válido.
  }

  try {
    // Reprocessa primeiro: um evento de ativação pendente que só agora se
    // aplica precisa entrar no estado ANTES da varredura de ciclos, senão a
    // clínica recém-ativada fica de fora deste fechamento.
    const pendentes = await reprocessarEventosPendentes();
    const resultados = await fecharCiclosVencendo({ dryRun });

    // Retentativa extradia DEPOIS do fechamento e ANTES da carência (#322, D-8).
    //
    // Depois do fechamento pela mesma regra da #319: é ele que emite as
    // cobranças do dia e, portanto, quem produz as recusas de saldo (G2) que
    // esta varredura recupera. Rodando antes, a recusa desta passada só seria
    // vista amanhã — um dia inteiro de janela jogado fora numa janela que já é
    // de 7 dias.
    //
    // Antes da carência porque comandar antes de cortar é a ordem certa: o
    // corte revoga a autorização de Pix Automático, e uma retentativa comandada
    // sobre uma autorização revogada é tentativa gasta em quem já saiu. A
    // própria varredura ainda exclui a assinatura cuja carência vence NESTA
    // passada (`carencia_vence_nesta_passada`), então nem o round-trip acontece
    // para quem o corte leva logo em seguida.
    //
    // `try/catch` próprio pela mesma razão da carência e do backstop: quando
    // esta linha é alcançada, `fecharCiclosVencendo` já emitiu cobrança de
    // verdade no gateway. Deixar a exceção subir descartaria `resultados`
    // inteiro num 500 seco, e o job só grava este JSON (D38).
    let retentativas: ResultadoComandoRetentativa[] = [];
    let retentativaAbortada: string | null = null;
    try {
      retentativas = await comandarRetentativasPendentes({ dryRun });
    } catch (err) {
      retentativaAbortada = mensagemDoErro(err);
      console.error("[billing-fechamento] etapa de retentativa abortou", err);
    }
    const retentativasComErro = retentativas.filter((r) => r.erro);

    // Corte por carência vencida por ÚLTIMO, e a ordem é a regra (#319):
    // `fecharCiclosVencendo` é quem emite as cobranças do dia e, portanto, quem
    // produz as recusas que carimbam `past_due`. Varrendo a carência antes,
    // cortaríamos no mesmo tick uma clínica cuja cobrança ainda ia ser tentada
    // — e o corte revoga a autorização de Pix Automático, que é irreversível
    // sem uma nova autorização da clínica no app do banco. Depois, o pior caso
    // é um dia a mais de carência, que é o lado seguro.
    //
    // `try/catch` PRÓPRIO, e a razão é o que já aconteceu acima: quando esta
    // linha é alcançada, `fecharCiclosVencendo` já emitiu cobrança de verdade no
    // gateway e já persistiu o ciclo. Deixar a exceção subir para o `catch` do
    // fim descartaria `resultados` inteiro num 500 seco — e o job
    // (`scripts/fechamento-ciclo-billing.mjs`) só grava este JSON, então o
    // registro de um ato IRREVERSÍVEL sumiria com ele (débito D38).
    let cortes: ResultadoCortePorCarencia[] = [];
    let carenciaAbortada: string | null = null;
    try {
      cortes = await cancelarAssinaturasComCarenciaVencida({ dryRun });
    } catch (err) {
      carenciaAbortada = mensagemDoErro(err);
      console.error("[billing-fechamento] etapa de carência abortou", err);
    }
    const cortesComErro = cortes.filter((c) => c.erro);

    // Backstop de D+7 por ÚLTIMO (#318, Decisão 2). Três razões, nesta ordem:
    //
    // 1. **Depois de `fecharCiclosVencendo`**, pela mesma regra da #319: o
    //    fechamento emite as cobranças do dia, e o backstop pode CORTAR (G3
    //    confirmado). Cortar antes revogaria a autorização de uma clínica cuja
    //    cobrança ainda ia ser tentada nesta mesma passada.
    // 2. **Depois de `cancelarAssinaturasComCarenciaVencida`**, e é aqui que a
    //    ordem deixa de ser cosmética: o backstop CARIMBA `past_due` com
    //    `past_due_desde = agora`, e a carência é `past_due_desde +
    //    carencia_dias`. A coluna admite `0` (o CHECK só exige `>= 0`), então
    //    com o backstop ANTES uma clínica de carência zero seria carimbada e
    //    cortada no MESMO tick — sem um dia sequer de prazo, e o corte é
    //    irreversível. Nesta ordem o carimbo só é lido pela passada seguinte,
    //    qualquer que seja a carência da linha.
    // 3. `reprocessarEventosPendentes` roda antes de tudo, e isso importa aqui:
    //    um evento de PAGAMENTO que ficou pendente desde ontem precisa ser
    //    aplicado antes de o backstop concluir que o ciclo não foi pago.
    //
    // `try/catch` próprio pela mesma razão da carência, e roda MESMO se a
    // carência abortou: a invariante da ordem é "o backstop não carimba antes de
    // a carência ter passado neste tick", e uma carência que estourou não cortou
    // ninguém. O carimbo de `past_due_desde` feito aqui só será lido na passada
    // seguinte, então nada de irreversível acontece cedo demais.
    let backstop: ResultadoBackstopPrazo[] = [];
    let backstopAbortado: string | null = null;
    try {
      backstop = await aplicarBackstopDePrazo({ dryRun });
    } catch (err) {
      backstopAbortado = mensagemDoErro(err);
      console.error("[billing-fechamento] etapa de backstop abortou", err);
    }
    const backstopComErro = backstop.filter((b) => b.erro);

    const comErro = resultados.filter((r) => r.erro);

    // Uma etapa posterior ao faturamento que aborta continua sendo 500 e
    // `ok: false` — perder o alarme seria trocar um problema por outro (D34: o
    // job já sai `exit 0` demais). O que muda em relação ao 500 seco é que o
    // corpo vai INTEIRO: `resultados` (as cobranças que de fato saíram) e um
    // discriminador por etapa dizendo qual delas caiu e por quê. Assim o log do
    // job separa "não faturou" de "faturou e a varredura seguinte caiu", que
    // exigem reações opostas.
    const etapaAbortou =
      retentativaAbortada !== null ||
      carenciaAbortada !== null ||
      backstopAbortado !== null;

    // #536 — sinal de vida no banco (o `.mjs` deste job é fetch-only). O
    // detector de alarme continua medindo o billing pelo EFEITO (ciclo
    // vencido, 0129); esta linha é diagnóstico legível no banco. Dry-run não
    // grava: mascararia um job parado. Só contagens — nunca clinic_id/valor.
    if (!dryRun) {
      await registrarHeartbeat(
        "billing",
        !etapaAbortou,
        detalheSemPii({
          ciclosFechados: resultados.length,
          comErro: comErro.length,
          etapaAbortou,
        }),
      );
    }

    return Response.json(
      {
        ok: !etapaAbortou,
        // `null` quando a etapa correu — presente em toda resposta para que o
        // job possa ler a chave sem adivinhar se ela existe.
        retentativaAbortada,
        carenciaAbortada,
        backstopAbortado,
        dryRun,
        eventosReprocessados: pendentes,
        ciclosProcessados: resultados.length,
        // Chaves próprias da retentativa extradia (#322, D-8), NUNCA somadas às
        // do fechamento: uma retentativa comandada não é cobrança nova emitida,
        // e contá-la em `ciclosProcessados` faria o faturamento do dia parecer
        // maior do que foi — exatamente o número que se confere contra o extrato.
        retentativasAvaliadas: retentativas.length,
        retentativasComandadas: retentativas.filter(
          (r) => r.acao === "comandada",
        ).length,
        // Mesmo motivo do truncamento das outras etapas: o job só registra este
        // JSON, e uma passada que parou no teto com fila atrás é indistinguível
        // de uma que cobriu tudo se o sinal não subir aqui.
        retentativasTruncado: retentativas.some((r) => r.truncado),
        retentativasFalhas: retentativasComErro.map((r) => ({
          clinicId: r.clinicId,
          cicloId: r.cicloId,
          // A ação vai junto, como em `backstopFalhas`: a reserva da tentativa é
          // gravada ANTES da chamada ao gateway (D-4), então existe linha que
          // reservou e falhou depois. Sem este campo o log leria "falhou" onde
          // uma das 3 tentativas do ciclo já foi consumida.
          acao: r.acao,
          tentativa: r.tentativa,
          erro: r.erro,
        })),
        retentativas: retentativas.map((r) => ({
          clinicId: r.clinicId,
          cicloId: r.cicloId,
          providerChargeId: r.providerChargeId,
          providerInstructionId: r.providerInstructionId,
          recusaCodigo: r.recusaCodigo,
          grupo: r.grupo,
          tentativa: r.tentativa,
          dueDate: r.dueDate,
          acao: r.acao,
          // `motivo` é o que dá visibilidade ao fim da janela ANTES do corte
          // (D-6): `sem_data_possivel` e `carencia_vence_nesta_passada`
          // aparecem aqui na passada em que acontecem, e não junto com o
          // cancelamento dias depois. O esgotamento do orçamento NÃO passa por
          // aqui — o ciclo que gastou as 3 é barrado no `WHERE` da varredura,
          // para não ocupar vaga da passada para sempre.
          motivo: r.motivo,
        })),
        // Chaves próprias, e não somadas às do fechamento: `ciclosProcessados` e
        // `falhas` são lidas no log do job como "faturamento do dia", e misturar
        // corte de inadimplente ali tornaria as duas leituras impossíveis de
        // separar depois do fato.
        carenciaAvaliadas: cortes.length,
        carenciaCortadas: cortes.filter((c) => c.cortada).length,
        // Truncamento vai no corpo, não só no `console.warn`: o job só registra
        // o JSON, e uma passada que parou no teto com fila atrás é
        // indistinguível de uma que cobriu tudo se esse sinal não subir.
        carenciaTruncado: cortes.some((c) => c.truncado),
        carenciaFalhas: cortesComErro.map((c) => ({
          clinicId: c.clinicId,
          erro: c.erro,
        })),
        // Chaves próprias, como as da carência e pela mesma razão: "carimbado por
        // prazo" e "cortado por carência" são consequências diferentes, e somá-las
        // tornaria impossível separar depois do fato quantas clínicas entraram em
        // inadimplência por silêncio do gateway.
        backstopAvaliados: backstop.length,
        backstopCarimbados: backstop.filter((b) => b.acao === "carimbada")
          .length,
        backstopCortados: backstop.filter((b) => b.acao === "cortada").length,
        backstopIgnoradosG6: backstop.filter((b) => b.acao === "ignorada_g6")
          .length,
        backstopTruncado: backstop.some((b) => b.truncado),
        backstopFalhas: backstopComErro.map((b) => ({
          clinicId: b.clinicId,
          cycleId: b.cycleId,
          // A ação vai junto: um G3 cuja reconsulta falhou é carimbado E traz
          // erro, e sem este campo o log leria "falhou" onde houve consequência.
          acao: b.acao,
          erro: b.erro,
        })),
        backstopPorPrazo: backstop.map((b) => ({
          clinicId: b.clinicId,
          cycleId: b.cycleId,
          vencimento: b.vencimento,
          grupo: b.grupo,
          recusaCodigo: b.recusaCodigo,
          acao: b.acao,
        })),
        cortesPorCarencia: cortes.map((c) => ({
          clinicId: c.clinicId,
          pastDueDesde: c.pastDueDesde,
          carenciaDias: c.carenciaDias,
          cortada: c.cortada,
        })),
        // Falha de UMA clínica não derruba a varredura, mas também não pode
        // sumir: vai no corpo, e o job registra a linha inteira no log.
        falhas: comErro.map((r) => ({ clinicId: r.clinicId, erro: r.erro })),
        resultados: resultados.map((r) => ({
          clinicId: r.clinicId,
          fichasContadas: r.fichasContadas,
          valorCentavos: r.valorCentavos,
          cobrancaEmitida: r.cobrancaEmitida,
          providerChargeId: r.providerChargeId,
        })),
      },
      { status: etapaAbortou ? 500 : 200 },
    );
  } catch (err) {
    // Este `catch` agora significa uma coisa só: caiu ANTES de o faturamento
    // terminar (`reprocessarEventosPendentes` ou `fecharCiclosVencendo`). As
    // etapas posteriores têm guarda própria e respondem com o corpo completo,
    // justamente para não descartar cobrança já emitida.
    //
    // Os três discriminadores vão como `null` e não omitidos: o job lê as
    // mesmas chaves nos dois caminhos, e chave ausente exigiria que ele
    // adivinhasse se a etapa correu ou nem chegou a ser tentada.
    //
    // O texto real do erro vai no corpo: uma mensagem genérica aqui
    // transformaria o diagnóstico de faturamento parado numa caçada às cegas.
    console.error("[billing-fechamento] falha na varredura", err);
    if (!dryRun) {
      await registrarHeartbeat("billing", false, detalheDoErro(err));
    }
    return Response.json(
      {
        ok: false,
        retentativaAbortada: null,
        carenciaAbortada: null,
        backstopAbortado: null,
        error: mensagemDoErro(err),
      },
      { status: 500 },
    );
  }
}
