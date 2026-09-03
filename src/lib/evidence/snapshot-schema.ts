import { z } from "zod";

/**
 * Forma persistida de `session_snapshot.repertorio_state` e `.segmentacao`
 * (jsonb). Escrita por `materializar.ts` (sessões) e por
 * `anamnese/logic.ts` (marco-zero, via `app_validar_anamnese`); lida por
 * `timeline/queries.ts`, `timeline/logic.ts`, `supervisao/queries.ts` e
 * `lib/supervisao/sinais.ts`. Fonte única (A-06, #538): antes cada leitor
 * tipava `any` e a tela da linha do tempo lia campos em camelCase
 * (`nivelAjudaRecente`, `isCandidata`) que o snapshot nunca teve.
 *
 * Chaves são ids (uuid) em snake_case, como o banco grava:
 *   repertorio_state = { goal_id: { nivel_ajuda_recente, contagem, is_candidata, origem?, procedencia? } }
 *   segmentacao      = { goal_id: { protocol_id: { tipo_estrutura, metrica, rotulo } } }
 *
 * `metrica` tem DOIS formatos em produção: objeto `{ eixo, ordinalRecente }`
 * (`materializar.ts`) e string `"nivel_ajuda"` (anamnese marco-zero e
 * `sinais.ts`). Rejeitar a string derrubou a fila de supervisão e a linha do
 * tempo de todo paciente com anamnese validada (CI `test-rls` da PR #556).
 *
 * Leitura TOLERANTE por entrada: campo ausente ganha default; chave
 * desconhecida é descartada; entrada fora da forma é IGNORADA com aviso de
 * categoria fechada (nunca id, nunca conteúdo). A tela nunca fica vazia por
 * causa de uma entrada ruim — e nunca em silêncio.
 */
export const RepertorioEntrySchema = z.object({
  nivel_ajuda_recente: z.number().nullable().default(null),
  contagem: z.number().default(0),
  is_candidata: z.boolean().optional(),
  origem: z.string().optional(),
  procedencia: z.string().optional(),
});

export const MetricaSegmentacaoSchema = z.object({
  eixo: z.string().optional(),
  ordinalRecente: z.number().nullable().optional(),
});

export const ResultadoSegmentacaoSchema = z.object({
  tipo_estrutura: z.string(),
  metrica: z
    .union([MetricaSegmentacaoSchema, z.string()])
    .nullable()
    .optional(),
  rotulo: z.string(),
});

export const RepertorioStateSchema = z.record(
  z.string(),
  RepertorioEntrySchema,
);
export const SegmentacaoSchema = z.record(
  z.string(),
  z.record(z.string(), ResultadoSegmentacaoSchema),
);

export type RepertorioEntry = z.output<typeof RepertorioEntrySchema>;
export type RepertorioState = z.output<typeof RepertorioStateSchema>;
export type ResultadoSegmentacao = z.output<typeof ResultadoSegmentacaoSchema>;
export type Segmentacao = z.output<typeof SegmentacaoSchema>;

/** Categorias fechadas — o aviso nunca carrega id nem conteúdo clínico. */
export type CategoriaAvisoSnapshot =
  | "json_invalido"
  | "repertorio_nao_objeto"
  | "repertorio_entrada_invalida"
  | "segmentacao_nao_objeto"
  | "segmentacao_meta_invalida"
  | "segmentacao_entrada_invalida";

export type AvisoSnapshot = {
  categoria: CategoriaAvisoSnapshot;
  quantidade: number;
};

export type EmissorDeAviso = (aviso: AvisoSnapshot) => void;

/** Sem `err`, sem ids: só a categoria e quantas entradas foram ignoradas. */
export const avisarNoConsole: EmissorDeAviso = ({ categoria, quantidade }) => {
  console.warn(
    `[snapshot-schema] ${categoria}: ${quantidade} entrada(s) ignorada(s)`,
  );
};

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function desserializar(bruto: unknown, avisar: EmissorDeAviso): unknown {
  if (bruto == null) return {};
  if (typeof bruto !== "string") return bruto;
  try {
    return JSON.parse(bruto);
  } catch {
    avisar({ categoria: "json_invalido", quantidade: 1 });
    return {};
  }
}

/** `repertorio_state` vindo do banco (objeto, string JSON ou null) → tipado. */
export function lerRepertorioState(
  bruto: unknown,
  avisar: EmissorDeAviso = avisarNoConsole,
): RepertorioState {
  const dados = desserializar(bruto, avisar);
  if (!ehObjeto(dados)) {
    avisar({ categoria: "repertorio_nao_objeto", quantidade: 1 });
    return {};
  }
  const saida: RepertorioState = {};
  let invalidas = 0;
  for (const [goalId, entrada] of Object.entries(dados)) {
    const r = RepertorioEntrySchema.safeParse(entrada);
    if (r.success) saida[goalId] = r.data;
    else invalidas++;
  }
  if (invalidas > 0) {
    avisar({ categoria: "repertorio_entrada_invalida", quantidade: invalidas });
  }
  return saida;
}

/** `segmentacao` vindo do banco (objeto, string JSON ou null) → tipado. */
export function lerSegmentacao(
  bruto: unknown,
  avisar: EmissorDeAviso = avisarNoConsole,
): Segmentacao {
  const dados = desserializar(bruto, avisar);
  if (!ehObjeto(dados)) {
    avisar({ categoria: "segmentacao_nao_objeto", quantidade: 1 });
    return {};
  }
  const saida: Segmentacao = {};
  let metasInvalidas = 0;
  let entradasInvalidas = 0;
  for (const [goalId, porProtocolo] of Object.entries(dados)) {
    if (!ehObjeto(porProtocolo)) {
      metasInvalidas++;
      continue;
    }
    const protocolos: Record<string, ResultadoSegmentacao> = {};
    for (const [protocolId, entrada] of Object.entries(porProtocolo)) {
      const r = ResultadoSegmentacaoSchema.safeParse(entrada);
      if (r.success) protocolos[protocolId] = r.data;
      else entradasInvalidas++;
    }
    saida[goalId] = protocolos;
  }
  if (metasInvalidas > 0) {
    avisar({
      categoria: "segmentacao_meta_invalida",
      quantidade: metasInvalidas,
    });
  }
  if (entradasInvalidas > 0) {
    avisar({
      categoria: "segmentacao_entrada_invalida",
      quantidade: entradasInvalidas,
    });
  }
  return saida;
}

/**
 * Rótulos de exibição dos eixos de `metrica`. Hoje a segmentação só computa o
 * eixo de nível-de-ajuda (`segmentacao.ts` §escopo travado); eixo desconhecido
 * atravessa como veio, em vez de virar linha vazia.
 */
const ROTULO_POR_EIXO: Record<string, string> = {
  nivel_ajuda: "Nível de ajuda",
};

/**
 * `ROTULO_POR_EIXO[chave]` cru resolveria pelo protótipo: um eixo gravado como
 * `"constructor"` devolveria a FUNÇÃO `Object`, e o `??` não age sobre valor
 * definido — a tela receberia uma função e o React quebraria com
 * "Functions are not valid as a React child". O eixo vem do jsonb: é dado, não
 * literal de código.
 */
function rotuloDoEixo(chave: string): string {
  return Object.hasOwn(ROTULO_POR_EIXO, chave)
    ? ROTULO_POR_EIXO[chave]!
    : chave;
}

/**
 * `metrica` → rótulo de exibição, decidido em UM lugar só (#567).
 *
 * O campo tem duas formas em produção (ver docblock do módulo) e três leitores
 * a tratavam de jeitos diferentes: a fila de supervisão tipava `string` e o
 * objeto sumia no guard do card; o briefing fazia `String(objeto)` e
 * renderizava `[object Object]`. Nenhum dos dois era erro de tipo.
 *
 * Decisão de produto (03/09/2026, validada com o Rômulo): a forma objeto sai
 * como `Nível de ajuda: 3` — `eixo` é constante hoje, só `ordinalRecente`
 * carrega informação. `ordinalRecente` nulo cai para o rótulo do eixo sozinho:
 * eixo registrado SEM medida é diferente de nada registrado (mesma régua de
 * `espectro.ts` — ausência de dado nunca vira zero).
 *
 * Devolve `null` para "não há métrica" — nunca a string `"undefined"`/`"null"`,
 * nunca `String(objeto)`. Vazio não vira linha na tela.
 */
export function formatarMetricaSegmentacao(
  metrica: ResultadoSegmentacao["metrica"],
): string | null {
  if (metrica == null) return null;

  if (typeof metrica === "string") {
    const bruta = metrica.trim();
    if (bruta === "") return null;
    return rotuloDoEixo(bruta);
  }

  const eixo = metrica.eixo?.trim();
  if (!eixo) return null;
  const rotulo = rotuloDoEixo(eixo);
  return typeof metrica.ordinalRecente === "number"
    ? `${rotulo}: ${metrica.ordinalRecente}`
    : rotulo;
}
