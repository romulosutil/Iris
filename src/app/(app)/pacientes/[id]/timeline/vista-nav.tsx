"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export type VistaEvolucao = "sessao" | "tempo";

/**
 * Aceita qualquer coisa vinda de `searchParams` e devolve uma vista válida.
 * Valor desconhecido cai em "sessao": a entrada padrão é sempre a pergunta do
 * terapeuta ("o que mudou agora?"), nunca a superfície analítica.
 */
export function vistaValida(
  bruto: string | string[] | undefined,
): VistaEvolucao {
  return bruto === "tempo" ? "tempo" : "sessao";
}

const OPCOES: Array<{ vista: VistaEvolucao; rotulo: string }> = [
  { vista: "sessao", rotulo: "Esta sessão" },
  { vista: "tempo", rotulo: "No tempo" },
];

/**
 * A vista vive na URL (`?vista=`), não em `useState`, por dois motivos: o
 * coordenador precisa conseguir mandar uma leitura para o supervisor, e o
 * botão "voltar" do navegador precisa desfazer a troca de vista.
 *
 * Piso de 44px (`--control-sm`) porque esta é a primeira decisão da tela e o
 * terapeuta a toca com o polegar, em pé.
 */
export function VistaNav({
  basePath,
  vistaAtual,
}: {
  basePath: string;
  vistaAtual: VistaEvolucao;
}) {
  return (
    // Rótulo instrutivo, não descritivo: "Vista da evolução" só nomeia o
    // componente e obriga quem usa leitor de tela a entrar na lista para
    // descobrir o que as duas opções fazem. Achado de revisão de copy
    // (P2 "seis regiões, três relógios, nenhuma âncora").
    <nav aria-label="Alternar entre esta sessão e histórico">
      {/* Mesma superfície do `SegmentedControl` (borda âncora + sombra dura em
          cima de `--surface-card`), mas com `<Link>` em vez de `<button>`: a
          vista precisa ter `href` de verdade — clique do meio, abrir em nova
          aba e "voltar" do navegador têm que funcionar. */}
      <ul
        role="group"
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-1 shadow-[var(--ds-shadow)]"
      >
        {OPCOES.map(({ vista, rotulo }) => {
          const ativo = vista === vistaAtual;
          return (
            <li key={vista}>
              <Link
                href={`${basePath}?vista=${vista}`}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[var(--control-sm)] items-center rounded-[var(--radius-xs)] px-4 text-sm font-medium transition-all duration-150",
                  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
                  ativo
                    ? "bg-[var(--action-primary)] font-bold text-[var(--action-primary-fg)]"
                    : "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
