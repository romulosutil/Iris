import { getSuperAdminClinicas } from "../queries";
import { formatarBRL } from "@/lib/billing/calculator";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    ordem?: "receita_desc" | "criado_em_desc" | "pacientes_desc";
  }>;
}

export default async function SuperAdminClinicasPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const busca = params.q || "";
  const ordem = params.ordem || "criado_em_desc";

  const clinicas = await getSuperAdminClinicas({
    busca,
    ordenacao: ordem,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">
            Gestão de Clínicas & Assinaturas
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Total de {clinicas.length} clínica(s) encontrada(s).
          </p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <form
        method="GET"
        className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome da clínica ou e-mail do responsável..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500"
          >
            Buscar
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="ordem"
            className="text-xs font-medium whitespace-nowrap text-slate-400"
          >
            Ordenar por:
          </label>
          <select
            id="ordem"
            name="ordem"
            defaultValue={ordem}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
          >
            <option value="criado_em_desc">Data de Cadastro (Recentes)</option>
            <option value="receita_desc">
              Faturamento Estimado (Maior &rarr; Menor)
            </option>
            <option value="pacientes_desc">
              Fichas na Base (Maior &rarr; Menor)
            </option>
          </select>
        </div>
      </form>

      {/* Tabela Principal */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/70 text-xs font-semibold text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3.5">Nome da Clínica</th>
                <th className="px-4 py-3.5">Responsável / E-mail</th>
                <th className="px-4 py-3.5">Cadastro</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Fichas na Base</th>
                <th className="px-4 py-3.5 text-right">Fatura Estimada</th>
                <th className="px-4 py-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {clinicas.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Nenhuma clínica encontrada com os critérios informados.
                  </td>
                </tr>
              ) : (
                clinicas.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-850/50 transition-colors"
                  >
                    <td className="px-4 py-4 font-medium text-slate-100">
                      <div>{c.nome}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {c.id}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-300">
                      <div>{c.donoNome || "Sem nome"}</div>
                      <div className="font-mono text-slate-400">
                        {c.donoEmail || "Sem e-mail"}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-400">
                      {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-1">
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
                        {c.status === "trial" &&
                          c.diasTrialRestantes !== null && (
                            <span className="font-mono text-[10px] text-amber-400">
                              {c.diasTrialRestantes} dias rest.
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-slate-200">
                      {c.fichasNaBaseCount}
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-semibold text-teal-400">
                      {formatarBRL(c.valorEstimadoCentavos)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        disabled
                        title="Ações administrativas (Fase 2: Conceder isenção, pausar conta, alterar trial)"
                        className="cursor-not-allowed rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-500 opacity-60"
                      >
                        Ações (Fase 2)
                      </button>
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
