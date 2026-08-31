/**
 * Limites de polling do ditado de voz (#72, R20). Moram num módulo neutro —
 * nem servidor, nem cliente — porque as duas pontas precisam do MESMO número:
 * `logic.ts` importa `server-only` e a UI de T11/T12 não pode importá-lo, e
 * `actions.ts` é `"use server"` (só exporta funções async, nunca constantes).
 * Sem este arquivo os valores seriam redigitados no cliente e divergiriam em
 * silêncio na primeira vez que alguém ajustasse um dos lados.
 *
 * O teto é comportamento do CLIENTE: estourá-lo nunca transforma a resposta do
 * servidor em "falhou" — só faz a UI parar de perguntar.
 */
export const POLLING_INTERVALO_MS = 3000;
export const POLLING_TETO_MS = 600_000;
