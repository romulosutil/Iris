// Fuso fixo de FALLBACK apenas (D61) — usado quando `clinic.timezone` não
// pode ser lido: componentes de design system órfãos, sem caminho de request
// (`calendar-root.tsx`, `calendar-header.tsx`, `calendar-event-sidebar.tsx` —
// nenhum tem caller em produção, ver BACKLOG.md D61) e o default de prop de
// `calendar-grid.tsx`. Todo código com acesso a `TenantContext` ou a uma tx
// aberta DEVE usar `fusoDaClinica`/`fusoDaClinicaAtual`
// (`@/lib/agenda/clinic-timezone`), nunca esta constante.
export const FUSO_CLINICA = "America/Sao_Paulo";
export const FUSO_CLINICA_OFFSET = "-03:00";
