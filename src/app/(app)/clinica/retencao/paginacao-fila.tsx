"use client";

import { useRouter } from "next/navigation";
import { Pagination } from "@/components/ui/pagination";

/**
 * #352 — wrapper cliente da paginação, no molde de `paginacao-trilha.tsx`.
 *
 * `Pagination` do design system é interativo (`onPaginaChange`), então precisa
 * de fronteira de cliente. Ela fica isolada AQUI para que a fila em si não
 * atravesse: o que este componente conhece é `paginaAtual`, `totalPaginas` e
 * `total` — três números, nenhum nome de paciente.
 */
export function PaginacaoFila({
  paginaAtual,
  totalPaginas,
  total,
}: {
  paginaAtual: number;
  totalPaginas: number;
  total: number;
}) {
  const router = useRouter();

  return (
    <Pagination
      paginaAtual={paginaAtual}
      totalPaginas={totalPaginas}
      onPaginaChange={(pagina) =>
        router.push(`/clinica/retencao?pagina=${pagina}`)
      }
      sumario={
        <>
          <span className="font-semibold text-[var(--text-primary)]">
            {total}
          </span>{" "}
          {total === 1
            ? "prontuário com prazo vencido"
            : "prontuários com prazo vencido"}
        </>
      }
    />
  );
}
