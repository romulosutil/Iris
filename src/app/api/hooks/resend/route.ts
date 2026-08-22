/**
 * Alias compatível do webhook do Resend seguindo o padrão `/api/hooks/*`
 * já usado por `asaas` e `glitchtip` (#383).
 *
 * O manipulador é reexportado de `/api/webhooks/resend`; a configuração de
 * segmento é declarada literalmente aqui porque o Next.js exige que
 * `runtime`/`dynamic` sejam estaticamente analisáveis no próprio arquivo de rota.
 */
export { POST } from "@/app/api/webhooks/resend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
