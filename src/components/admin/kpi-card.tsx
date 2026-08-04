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
      className={`rounded-xl border p-5 transition-all shadow-sm ${
        highlight
          ? "border-teal-500/40 bg-slate-900/90 shadow-teal-950/20"
          : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-400 text-sm">{titulo}</span>
        {badge && (
          <span
            className={`rounded px-2 py-0.5 font-medium text-xs border ${
              badgeColors[badge.cor || "slate"]
            }`}
          >
            {badge.texto}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-bold text-slate-100 text-2xl sm:text-3xl tracking-tight">
          {valor}
        </span>
      </div>

      {subtitulo && (
        <p className="mt-1 text-slate-400 text-xs">{subtitulo}</p>
      )}
    </div>
  );
}
