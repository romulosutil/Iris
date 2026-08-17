export type EscopoBloqueio = "clinica" | "terapeuta" | "paciente";

export type BloqueioValidado = {
  escopo: EscopoBloqueio;
  terapeutaId: string | null;
  patientId: string | null;
  dataInicio: string;
  dataFim: string;
  motivo: string;
};

export function validarBloqueio(input: {
  escopo?: string | null;
  terapeutaId?: string | null;
  patientId?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  motivo?: string | null;
}): { ok: true; valor: BloqueioValidado } | { ok: false; error: string } {
  const escopo = input.escopo;
  if (escopo !== "clinica" && escopo !== "terapeuta" && escopo !== "paciente") {
    return { ok: false, error: "Escopo de bloqueio inválido." };
  }
  const dataInicio = (input.dataInicio ?? "").trim();
  const dataFim = (input.dataFim ?? "").trim();
  if (!dataInicio || !dataFim)
    return { ok: false, error: "Informe data de início e fim." };
  if (dataFim < dataInicio)
    return {
      ok: false,
      error: "A data de fim não pode ser anterior à de início.",
    };
  const motivo = (input.motivo ?? "").trim();
  if (!motivo) return { ok: false, error: "Informe o motivo do bloqueio." };

  let terapeutaId: string | null = null;
  let patientId: string | null = null;
  if (escopo === "terapeuta") {
    terapeutaId = (input.terapeutaId ?? "").trim() || null;
    if (!terapeutaId)
      return { ok: false, error: "Bloqueio de terapeuta exige um terapeuta." };
  } else if (escopo === "paciente") {
    patientId = (input.patientId ?? "").trim() || null;
    if (!patientId)
      return { ok: false, error: "Bloqueio de paciente exige um paciente." };
  }
  return {
    ok: true,
    valor: { escopo, terapeutaId, patientId, dataInicio, dataFim, motivo },
  };
}
