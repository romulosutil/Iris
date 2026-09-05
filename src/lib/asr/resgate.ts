/**
 * Janela de resgate do áudio de um clipe que a IA não conseguiu transcrever
 * (`db/migrations/0155_asr_mime_e_janela_de_resgate.sql`).
 *
 * POR QUE ESTA JANELA EXISTE: até a `0155`, `app_asr_falhar` zerava
 * `objeto_ref` no teto de 3 tentativas; sem a referência,
 * `app_asr_objetos_em_uso` deixava de reivindicar a chave e o `finally` do
 * worker apagava o áudio do MinIO no mesmo tick. A UI só sabe reenviar a
 * partir do blob LOCAL (IndexedDB, TTL 24 h) — passado isso, a única saída
 * oferecida à terapeuta era digitar o trecho à mão. Áudio clínico destruído
 * por uma falha que não é do clipe.
 *
 * POR QUE ELA TEM FIM: o bucket de ASR é efêmero POR DESIGN (R11) — não tem
 * retenção nem expurgo LGPD. Preservar para sempre não seria conservar
 * documento clínico, seria esconder áudio de paciente fora de todo wiring de
 * expurgo. Por isso a janela é fechada por `app_asr_expirar_resgate`, que
 * solta a referência e devolve o objeto ao alcance do sweeper de órfãos.
 *
 * NÃO É RETENÇÃO DE PRONTUÁRIO. É o prazo em que a terapeuta ainda consegue
 * remandar o clipe à fila; o registro clínico que sobrevive é a nota do
 * diário, não o áudio (decisão C de 31/08/2026 sobre transcrição efêmera).
 *
 * Módulo neutro (sem `server-only`) e sem import de banco de propósito: é lido
 * pelo worker (`api/internal/jobs/asr-transcrever`) E pelo core do diário
 * (`lib/sessao/diario-asr.ts`). Duas cópias da mesma aritmética envelheceriam
 * separado — e a cópia errada aqui apaga áudio.
 */

/**
 * 30 dias: uma terapeuta que gravou numa sexta e só volta ao diário depois de
 * férias ainda alcança o clipe. Não é medido — é escolha de produto, e por
 * isso é sobreponível por env sem migração nova.
 */
export const ASR_RESGATE_DIAS_PADRAO = 30;

/**
 * Janela em dias, de `ASR_RESGATE_DIAS`. Valor ausente, não numérico, zero ou
 * negativo cai no padrão: zero significaria "apagar no mesmo tick", que é
 * exatamente o defeito que esta janela conserta — um env vazio no painel do
 * Easypanel não pode reintroduzi-lo em silêncio (memória
 * `env-compartilhada-so-no-servico-alvo`).
 */
export function janelaDeResgateDias(): number {
  const raw = process.env.ASR_RESGATE_DIAS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : ASR_RESGATE_DIAS_PADRAO;
}

/** A janela como literal de `interval` do Postgres (`"30 days"`). */
export function janelaDeResgateIntervalo(): string {
  return `${janelaDeResgateDias()} days`;
}
