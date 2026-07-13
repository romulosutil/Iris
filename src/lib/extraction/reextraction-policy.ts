// Política de re-extração (P0). Evita re-chamar o LLM (custo) e proteger
// extrações já revisadas ao reconsolidar um diário sem mudança de texto.
export function deveReextrair(args: {
  textoMudou: boolean;
  temExtracoes: boolean;
  temPendente: boolean;
}): boolean {
  return args.textoMudou || !args.temExtracoes || args.temPendente;
}
