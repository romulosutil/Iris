"use client";

import { useRouter } from "next/navigation";
import { Pagination } from "@/components/ui/pagination";

/**
 * #453 — o ÚNICO client component desta tela, e ele recebe dois números.
 *
 * `Pagination` do design system é interativo (`onPaginaChange`), então precisa
 * de um wrapper cliente. O wrapper fica aqui, isolado, para que nenhuma linha da
 * trilha atravesse a fronteira servidor→cliente: o que ele conhece é
 * `paginaAtual` e `totalPaginas`, e nada mais.
 */
export function PaginacaoTrilha({
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
        router.push(`/clinica/auditoria?pagina=${pagina}`)
      }
      sumario={
        <>
          <span className="font-semibold text-[var(--text-primary)]">
            {total}
          </span>{" "}
          {total === 1 ? "registro" : "registros"} nos últimos 180 dias
        </>
      }
    />
  );
}
