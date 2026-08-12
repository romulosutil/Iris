/**
 * Lógica de resposta ao titular para solicitações de eliminação de dados (erasure LGPD).
 * Harmoniza a tensão entre o expurgo imediato do banco ativo e a retenção de backups (30 dias).
 */
export function gerarMensagemConfirmacaoEliminacao(nomeTitular: string, dataHora: Date): string {
  return `Prezado(a) ${nomeTitular}, confirmamos que seus dados pessoais foram eliminados do banco de dados ativo da plataforma Iris em ${dataHora.toISOString()}. Em conformidade com as diretrizes de segurança da informação, cópias de segurança cifradas (backups) são expurgadas automaticamente no ciclo de rotação em até 30 dias.`;
}
