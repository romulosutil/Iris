// Converte um instante absoluto (timestamptz) para o dia-da-semana e minuto
// locais na zona da clínica, via Intl (respeita DST). C10: avulsas do banco
// precisam virar minutos-locais SP antes de comparar com regras (hora crua).

const DIA_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function paraMinutosLocais(
  instante: Date,
  fuso: string,
): { diaSemana: number; inicioMin: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = Object.fromEntries(
    fmt.formatToParts(instante).map((p) => [p.type, p.value]),
  );
  const diaSemana = DIA_INDEX[partes.weekday as string]!;
  const hora = Number(partes.hour === "24" ? "0" : partes.hour);
  const minuto = Number(partes.minute);
  return { diaSemana, inicioMin: hora * 60 + minuto };
}

// Converte um instante absoluto para a data local (YYYY-MM-DD) na zona da
// clínica, via Intl (respeita DST). F2: comparar sessões concretas/esperadas
// por data local, não por timestamp cru.
export function paraDataLocal(instante: Date, fuso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
