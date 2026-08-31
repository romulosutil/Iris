import type { audioCapture } from "@/db/schema";

/**
 * Constantes e tipos compartilhados do diário (polling de transcrição ASR, limites, etc.).
 *
 * Por que um arquivo de constantes separado?
 * Em Next.js App Router, arquivos com directive `"use server"` só devem exportar
 * Server Actions. Constantes e tipos compartilhados entre Server Actions,
 * Server Components e Client Components devem morar em módulos client-safe
 * neutros.
 */

export const POLLING_INTERVALO_MS = 3000;
export const POLLING_TETO_MS = 600_000;

export type EstadoClipeAsr = {
  ordem: number;
  asrStatus: (typeof audioCapture.$inferSelect)["asrStatus"];
  transcricaoTexto: string | null;
};
