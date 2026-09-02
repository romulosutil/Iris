import { z } from "zod";

/**
 * Forma persistida de `session_snapshot.repertorio_state` e `.segmentacao`
 * (jsonb), escrita por `materializar.ts` e lida por `timeline/queries.ts`,
 * `timeline/logic.ts`, `supervisao/queries.ts` e `lib/supervisao/sinais.ts`.
 * Fonte única (A-06, #538): antes cada leitor tipava `any` e a tela da linha
 * do tempo lia campos em camelCase (`nivelAjudaRecente`, `isCandidata`) que
 * o snapshot nunca teve — em silêncio, tudo virava "não atingido".
 *
 * Chaves são ids (uuid) em snake_case, como o banco grava:
 *   repertorio_state = { goal_id: { nivel_ajuda_recente, contagem, is_candidata } }
 *   segmentacao      = { goal_id: { protocol_id: { tipo_estrutura, metrica, rotulo } } }
 *
 * Leniente na ENTRADA (campo ausente ganha default; chave desconhecida é
 * descartada) e firme na SAÍDA (`nivel_ajuda_recente` e `contagem` sempre
 * presentes — é o que `calcularDelta` soma). Valor fora da forma (string no
 * lugar do objeto) estoura: melhor um erro nomeado que uma linha do tempo
 * vazia que parece "sem progresso".
 */
export const RepertorioEntrySchema = z.object({
  nivel_ajuda_recente: z.number().nullable().default(null),
  contagem: z.number().default(0),
  is_candidata: z.boolean().optional(),
  origem: z.string().optional(),
  procedencia: z.string().optional(),
});

export const RepertorioStateSchema = z.record(
  z.string(),
  RepertorioEntrySchema,
);

export const MetricaSegmentacaoSchema = z.object({
  eixo: z.string().optional(),
  ordinalRecente: z.number().nullable().optional(),
});

export const ResultadoSegmentacaoSchema = z.object({
  tipo_estrutura: z.string(),
  metrica: MetricaSegmentacaoSchema.nullable().optional(),
  rotulo: z.string(),
});

export const SegmentacaoSchema = z.record(
  z.string(),
  z.record(z.string(), ResultadoSegmentacaoSchema),
);

export type RepertorioEntry = z.output<typeof RepertorioEntrySchema>;
export type RepertorioState = z.output<typeof RepertorioStateSchema>;
export type ResultadoSegmentacao = z.output<typeof ResultadoSegmentacaoSchema>;
export type Segmentacao = z.output<typeof SegmentacaoSchema>;

function desserializar(bruto: unknown): unknown {
  if (bruto == null) return {};
  if (typeof bruto === "string") return JSON.parse(bruto);
  return bruto;
}

/** `repertorio_state` vindo do banco (objeto, string JSON ou null) → tipado. */
export function lerRepertorioState(bruto: unknown): RepertorioState {
  return RepertorioStateSchema.parse(desserializar(bruto));
}

/** `segmentacao` vindo do banco (objeto, string JSON ou null) → tipado. */
export function lerSegmentacao(bruto: unknown): Segmentacao {
  return SegmentacaoSchema.parse(desserializar(bruto));
}
