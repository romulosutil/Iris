import { type FaixaDia, fundirFaixasPorDia, horaParaMin, minParaHora } from "./janela";

export function colunasDaGrade(passoMin: number, abertura = "07:00", fechamento = "20:00"): string[] {
  const ini = horaParaMin(abertura);
  const fim = horaParaMin(fechamento);
  const cols: string[] = [];
  for (let m = ini; m < fim; m += passoMin) cols.push(minParaHora(m));
  return cols;
}

export function chaveCelula(dia: number, coluna: string): string {
  return `${dia}-${coluna}`;
}

export function faixasParaCelulas(faixas: FaixaDia[], passoMin: number, abertura = "07:00", fechamento = "20:00"): Set<string> {
  const cols = colunasDaGrade(passoMin, abertura, fechamento);
  const cel = new Set<string>();
  for (const f of faixas) {
    const ini = horaParaMin(f.horaInicio);
    const fim = horaParaMin(f.horaFim);
    for (const c of cols) {
      const cm = horaParaMin(c);
      if (cm >= ini && cm < fim) cel.add(chaveCelula(f.diaSemana, c));
    }
  }
  return cel;
}

export function celulasParaFaixas(celulas: Set<string>, passoMin: number): FaixaDia[] {
  const brutas: FaixaDia[] = [];
  for (const chave of celulas) {
    const idx = chave.indexOf("-");
    const dia = Number(chave.slice(0, idx));
    const coluna = chave.slice(idx + 1);
    brutas.push({ diaSemana: dia, horaInicio: coluna, horaFim: minParaHora(horaParaMin(coluna) + passoMin) });
  }
  return fundirFaixasPorDia(brutas);
}

export function copiarDia(celulas: Set<string>, diaOrigem: number, diasDestino: number[], cols: string[]): Set<string> {
  const novo = new Set(celulas);
  for (const destino of diasDestino) {
    for (const c of cols) novo.delete(chaveCelula(destino, c));
    for (const c of cols) if (celulas.has(chaveCelula(diaOrigem, c))) novo.add(chaveCelula(destino, c));
  }
  return novo;
}
