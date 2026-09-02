// Régua ÚNICA de "quem é o profissional responsável pela sessão" no lado da
// aplicação (#539, auditoria 360 PR-05 · decisão D-AUD-7, proposta pendente de
// validação).
//
// Espelha `app_session_profissional_responsavel(session_id)` (migração 0143):
// titular (`terapeuta_id`) OU substituto designado na agenda
// (`atendido_por_id`). É o que a RLS de `session_note`/`audio_capture`/
// `extraction`/`session_protocol_scope` exige para ESCREVER — então é o que
// `ehDono` (formulário de documentação, botão "reprocessar", correção da nota)
// e `fila.ts` (`minha`) têm que perguntar. Antes havia três réguas divergentes
// e o substituto ficava sem formulário numa sessão em que o banco o deixava
// documentar.
//
// Sem `"use server"` de propósito: é predicado puro, sem I/O, chamado por
// queries de servidor — não vira endpoint.

export type SessaoComResponsaveis = {
  terapeutaId: string;
  atendidoPorId: string | null;
};

export function ehProfissionalResponsavel(
  userId: string,
  sessao: SessaoComResponsaveis,
): boolean {
  return sessao.terapeutaId === userId || sessao.atendidoPorId === userId;
}
