import Link from "next/link";
import { getSuperAdminKpis, getSuperAdminClinicas } from "./queries";
import { KpiCard } from "@/components/admin/kpi-card";
import { formatarBRL } from "@/lib/billing/calculator";

export default async function SuperAdminDashboardPage() {
  const kpis = await getSuperAdminKpis();
  const topClinicas = await getSuperAdminClinicas({
    ordenacao: "receita_desc",
  });

  const top5 = topClinicas.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">
          Visão Geral da Plataforma
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Métricas consolidadas de saúde financeira, base de fichas e trials
          ativos. O MRR aqui é TETO pelo critério &quot;ficha não
          arquivada&quot;: a fatura real conta só ficha cadastrada ou com
          movimento no ciclo (ver o bloco de comentário em queries.ts).
        </p>
      </div>

      {/* Grid de Cards KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          titulo="MRR Estimado"
          valor={formatarBRL(kpis.mrrEstimadoCentavos)}
          subtitulo="Teto estimado — não é a fatura apurada"
          highlight
          badge={{ texto: "Pay-as-you-grow", cor: "emerald" }}
        />

        <KpiCard
          titulo="Clínicas Ativas"
          valor={kpis.clinicasAtivas}
          subtitulo="Pagantes e Isentas ativas"
          badge={{ texto: "Operacional", cor: "indigo" }}
        />

        <KpiCard
          titulo="Fichas na Base"
          valor={kpis.fichasNaBaseTotais}
          subtitulo="Fichas não arquivadas; nem toda ficha é faturada"
          badge={{ texto: "Base Total", cor: "slate" }}
        />

        <KpiCard
          titulo="Clínicas em Trial"
          valor={kpis.clinicasEmTrial}
          subtitulo="7 dias a partir do 1º paciente"
          badge={{ texto: "Em Trial", cor: "amber" }}
        />

        <KpiCard
          titulo="Clínicas Isentas"
          valor={kpis.clinicasIsentas}
          subtitulo="Contas legadas sem gate"
          badge={{ texto: "Isento", cor: "slate" }}
        />
      </div>

      {/* Tabela de Destaques: Top Clínicas por Receita */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">
              Top Clínicas por Receita Projetada
            </h2>
            <p className="text-xs text-slate-400">
              Clínicas com maior volumen de faturamento estimado neste ciclo.
            </p>
          </div>
          <Link
            href="/benjamin/clinicas"
            className="text-xs font-medium text-teal-400 transition-colors hover:text-teal-300"
          >
            Ver todas as clínicas &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/50 text-xs font-semibold text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3">Clínica</th>
                <th className="px-4 py-3">Dono / E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Fichas na Base</th>
                <th className="px-4 py-3 text-right">Valor Estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {top5.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Nenhuma clínica cadastrada na plataforma.
                  </td>
                </tr>
              ) : (
                top5.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-850/50 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-medium text-slate-100">
                      {c.nome}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      <div>{c.donoNome || "Sem nome"}</div>
                      <div className="font-mono text-slate-500">
                        {c.donoEmail || "Sem e-mail"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                          c.status === "ativa"
                            ? "border-emerald-800/50 bg-emerald-950/80 text-emerald-300"
                            : c.status === "trial"
                              ? "border-amber-800/50 bg-amber-950/80 text-amber-300"
                              : c.status === "isenta"
                                ? "border-indigo-800/50 bg-indigo-950/80 text-indigo-300"
                                : "border-rose-800/50 bg-rose-950/80 text-rose-300"
                        }`}
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                      {c.fichasNaBaseCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-teal-400">
                      {formatarBRL(c.valorEstimadoCentavos)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
