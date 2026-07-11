// Fuso da clínica — América/São_Paulo é UTC-3 o ano todo (sem horário de verão
// desde 2019). Centraliza o par IANA + offset usado na agenda (ancoragem de
// datetime-local nas actions e formatação da grade na página).
export const FUSO_CLINICA = "America/Sao_Paulo";
export const FUSO_CLINICA_OFFSET = "-03:00";
