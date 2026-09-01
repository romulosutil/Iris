import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * #512 · T14 (R-34) — `/agenda/semana` foi absorvida pelo toggle "Semana" de
 * `/agenda` (T13, `AgendaViewCliente`/`SegmentedControl`). Redirect
 * permanente para `/agenda?escala=semana`, repassando o restante da query
 * string (ex.: `repor`, `patientId`, `terapeutaId`, `disciplina` do gesto
 * "Repor" em `agenda/page.tsx`/`agenda-view-cliente.tsx`) — link salvo e
 * teste E2E por URL não podem quebrar (R-34).
 *
 * Fiação do prefill fechada (T14-fix): `agenda/page.tsx` lê os mesmos 4
 * parâmetros e monta o `Prefill` server-side, repassado por
 * `AgendaViewCliente` → `SemanaCliente`. O gesto "Repor" já linka direto para
 * `/agenda?escala=semana&repor=...`; este redirect cobre só o link salvo.
 */
export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(sp)) {
    if (chave === "escala") continue;
    if (Array.isArray(valor)) {
      for (const v of valor) params.append(chave, v);
    } else if (valor !== undefined) {
      params.set(chave, valor);
    }
  }
  params.set("escala", "semana");
  redirect(`/agenda?${params.toString()}`);
}
