import React from "react";

interface KpiCardProps {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  badge?: {
    texto: string;
    cor?: "emerald" | "amber" | "indigo" | "rose" | "slate";
  };
  highlight?: boolean;
}

export function KpiCard({
  titulo,
  valor,
  subtitulo,
  badge,
  highlight = false,
}: KpiCardProps) {
  const badgeColors = {
    emerald: "bg-emerald-950/80 text-emerald-300 border-emerald-800/50",
    amber: "bg-amber-950/80 text-amber-300 border-amber-800/50",
    indigo: "bg-indigo-950/80 text-indigo-300 border-indigo-800/50",
    rose: "bg-rose-950/80 text-rose-300 border-rose-800/50",
    slate: "bg-slate-800 text-slate-300 border-slate-700",
  };

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm transition-all ${
        highlight
          ? "border-teal-500/40 bg-slate-900/90 shadow-teal-950/20"
          : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{titulo}</span>
        {badge && (
          <span
            className={`rounded border px-2 py-0.5 text-xs font-medium ${
              badgeColors[badge.cor || "slate"]
            }`}
          >
            {badge.texto}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
          {valor}
        </span>
      </div>

      {subtitulo && <p className="mt-1 text-xs text-slate-400">{subtitulo}</p>}
    </div>
  );
}
