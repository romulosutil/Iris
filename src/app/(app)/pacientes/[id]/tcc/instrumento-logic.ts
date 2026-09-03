import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { instrumentoAplicacao, instrumentoItemTexto } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { registrarAlertaRiscoInstrumentoManual } from "@/lib/risco/registrar";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

/**
 * #393 — arquivo separado de `logic.ts` de propósito (`logic.ts` já cresceu
 * com RPD/#389/#392; instrumento não compartilha schema nem fluxo de
 * aprovação). Mesmo padrão `comEscrita` + `requireRole` + `withTenant` de
 * `salvarRPD` (`./logic.ts:63-168`).
 */

export const respostaItemSchema = z.object({
  item: z.number().int().min(1, "Número do item inválido"),
  valor: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export const salvarInstrumentoAplicacaoSchema = z.object({
  patientId: z.string().uuid("ID do paciente inválido"),
  sessionId: z.string().uuid("ID de sessão inválido").nullable().optional(),
  tipoInstrumento: z.enum(["phq9", "gad7"]),
  // Servidor NUNCA aceita escore/item9/itemRiscoPositivo pré-calculados do
  // cliente — só as respostas brutas por item. `escoreTotal`/`item9Valor`/
  // `itemRiscoPositivo` são sempre derivados aqui dentro, nunca lidos do
  // input (mesmo princípio anti-forjamento de severidade de #391).
  respostasPorItem: z
    .array(respostaItemSchema)
    .min(1, "Informe ao menos uma resposta"),
  fonteDoEscore: z.enum([
    "paciente_informou",
    "terapeuta_calculou_na_sessao",
    "nao_informado",
  ]),
});

export type SalvarInstrumentoAplicacaoInput = z.input<
  typeof salvarInstrumentoAplicacaoSchema
>;

type InstrumentoState = {
  error?: string;
  bloqueioConta?: BloqueioConta;
  id?: string;
  /** Mesmo padrão de `RpdState.alertaRiscoErro` (`./logic.ts:29-33`): o
   * instrumento já foi salvo quando este campo aparece, só o registro do
   * alerta de risco falhou/não pôde ser tentado. */
  alertaRiscoErro?: string;
};

/**
 * PHQ-9 item 9 mede frequência de ideação/autolesão nos últimos 14 dias
 * (0-3 dias/semana), NUNCA presença de plano — inferir "com plano" do valor
 * numérico violaria R2 (proveniência literal, ver design.md §3). Só extrai
 * item 9 para PHQ-9: GAD-7 não tem item 9 (item9Valor sempre null).
 */
function extrairItem9Valor(
  tipoInstrumento: "phq9" | "gad7",
  respostasPorItem: Array<{ item: number; valor: 0 | 1 | 2 | 3 }>,
): number | null {
  if (tipoInstrumento !== "phq9") return null;
  const resposta = respostasPorItem.find((r) => r.item === 9);
  return resposta ? resposta.valor : null;
}

/**
 * `null` !== `false`: item de risco NÃO respondido é distinto de
 * "respondeu 0/negou" — mesma semântica de `aplicacaoEscalaRelatadaSchema`
 * (`agent-output-schema.ts:146-159`, `item_risco_positivo: z.boolean().nullable()`,
 * nunca `.default(false)`). `item9Valor === null` (não respondido/GAD-7) →
 * `null`; `0` → `false`; `1|2|3` → `true`.
 */
function derivarItemRiscoPositivo(item9Valor: number | null): boolean | null {
  if (item9Valor === null) return null;
  return item9Valor >= 1;
}

async function salvarInstrumentoAplicacaoCore(
  ctx: TenantContext,
  input: SalvarInstrumentoAplicacaoInput,
): Promise<InstrumentoState> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = salvarInstrumentoAplicacaoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }
  const d = parsed.data;

  // Cálculo no SERVIDOR, a partir de `respostasPorItem` — nunca de um total
  // enviado pelo cliente (o schema de input acima nem expõe esse campo).
  const escoreTotal = d.respostasPorItem.reduce((acc, r) => acc + r.valor, 0);
  const item9Valor = extrairItem9Valor(d.tipoInstrumento, d.respostasPorItem);
  const itemRiscoPositivo = derivarItemRiscoPositivo(item9Valor);

  try {
    const resultado = await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(instrumentoAplicacao)
        .values({
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          sessionId: d.sessionId ?? null,
          // Sem catálogo de instrumento dedicado ainda (design.md §1):
          // `protocolId` referencia o próprio tipo, único identificador
          // estável disponível hoje.
          protocolId: d.tipoInstrumento,
          tipoInstrumento: d.tipoInstrumento,
          escoreTotal,
          fonteDoEscore: d.fonteDoEscore,
          respostasPorItem: d.respostasPorItem,
          item9Valor,
          itemRiscoPositivo,
          criadoPor: ctx.userId,
        })
        .returning({ id: instrumentoAplicacao.id });

      return { id: row!.id };
    });

    // #393 — alerta de risco a partir de item de risco positivo, mesmo
    // padrão de `salvarRPD` (varredura DEPOIS do INSERT commitar, fora da
    // transação de escrita): o instrumento já está salvo, uma falha aqui
    // não pode derrubar isso — só aparece no retorno para a UI.
    //
    // Gap fix (sessão 18/08/26): `registrarAlertaRiscoInstrumentoManual`
    // ancora via `instrumento_aplicacao_id` (migração 0114) — não exige mais
    // `extractionId`, que o caminho manual nunca tem. Dispara em `true`
    // (respondido positivo) OU `null` restrito a PHQ-9 (item 9 não
    // respondido = recusa, sinal por si só, mesma regra da Fase E de #391
    // em `diario/[sessionId]/logic.ts:524`, `!== false`); GAD-7 nunca chega
    // aqui porque `itemRiscoPositivo` só é não-`false` quando
    // `tipoInstrumento === 'phq9'` (`derivarItemRiscoPositivo` só recebe
    // `item9Valor` não-null quando `extrairItem9Valor` já filtrou por PHQ-9).
    const deveTentarAlerta =
      d.tipoInstrumento === "phq9" && itemRiscoPositivo !== false;
    if (deveTentarAlerta) {
      const trechoFonte =
        item9Valor === null
          ? "PHQ-9 (aplicação manual): item 9 não respondido."
          : `PHQ-9 (aplicação manual): item 9 = ${item9Valor}.`;
      const r = await registrarAlertaRiscoInstrumentoManual(ctx, {
        patientId: d.patientId,
        instrumentoAplicacaoId: resultado.id,
        responsavelId: ctx.userId,
        sinal: {
          // Única categoria de instrumento hoje — mesma decisão de Fase E
          // (`diario/[sessionId]/logic.ts:537`).
          categoria: "ideacao_suicida",
          severidade: "ideacao_ativa_sem_plano",
          certeza: itemRiscoPositivo === true ? "explicito" : "ambiguo_citado",
          trecho_fonte: trechoFonte,
          detalhe:
            "Item de risco de instrumento formal (PHQ-9 item 9) aplicado " +
            "manualmente, respondido positivamente ou não respondido " +
            "(recusa).",
        },
        item9Valor,
      });
      if ("erro" in r) {
        return { id: resultado.id, alertaRiscoErro: r.erro };
      }
    }

    return { id: resultado.id };
  } catch (err) {
    logarErroSemPII("salvarInstrumentoAplicacao:", err);
    return { error: "Não foi possível salvar a aplicação do instrumento." };
  }
}

export const salvarInstrumentoAplicacao = comEscrita(
  salvarInstrumentoAplicacaoCore,
);

export async function obterInstrumentoAplicacoes(
  ctx: TenantContext,
  patientId: string,
) {
  requireRole(ctx, "coordenador", "terapeuta", "admin_recepcao");
  return await withTenant(ctx, async (tx) => {
    return await tx
      .select()
      .from(instrumentoAplicacao)
      .where(eq(instrumentoAplicacao.patientId, patientId))
      .orderBy(desc(instrumentoAplicacao.criadoEm));
  });
}

/**
 * Textos dos itens carregados (T3: `instrumento_item_texto` vazia por
 * padrão — conteúdo licenciado pendente de confirmação). Leitura global,
 * sem escopo de `patientId`: a policy da tabela já é SELECT-only para
 * qualquer `app_role`, sem predicado de clínica (conteúdo compartilhado).
 */
export async function obterInstrumentoItensTexto(
  ctx: TenantContext,
  tipoInstrumento: "phq9" | "gad7",
) {
  return await withTenant(ctx, async (tx) => {
    return await tx
      .select({
        numeroItem: instrumentoItemTexto.numeroItem,
        texto: instrumentoItemTexto.texto,
      })
      .from(instrumentoItemTexto)
      .where(eq(instrumentoItemTexto.tipoInstrumento, tipoInstrumento))
      .orderBy(instrumentoItemTexto.numeroItem);
  });
}
