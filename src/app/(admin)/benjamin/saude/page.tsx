import { getSuperAdminSaude } from "../queries";

export default async function SuperAdminSaudePage() {
  const saude = await getSuperAdminSaude();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-bold text-2xl text-slate-100 sm:text-3xl">
          Saúde do Sistema & Integrações
        </h1>
        <p className="mt-1 text-slate-400 text-sm">
          Monitoramento de resiliência de webhooks (Asaas) e disparos de alertas do sistema.
        </p>
      </div>

      {/* Grid de Webhooks Asaas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg text-slate-200">
                Webhooks Asaas
              </h2>
              <p className="text-slate-400 text-xs">
                Log de recepção e deduplicação de eventos de faturamento.
              </p>
            </div>
            <span className="rounded bg-teal-950/80 border border-teal-800/50 px-2.5 py-1 text-xs font-mono font-medium text-teal-300">
              Total: {saude.webhooksAsaas.totalRecebidos}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 font-semibold text-slate-400 uppercase bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">ID Evento Asaas</th>
                  <th className="px-3 py-2 text-right">Processado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {saude.webhooksAsaas.ultimosEventos.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500 font-sans">
                      Nenhum webhook recebido recentemente.
                    </td>
                  </tr>
                ) : (
                  saude.webhooksAsaas.ultimosEventos.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-850/50">
                      <td className="px-3 py-2.5 font-sans font-medium text-slate-200">
                        {evt.evento}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                        {evt.asaasEventId}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-400">
                        {new Date(evt.processadoEm).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Grid de Alertas de Risco */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg text-slate-200">
                Alertas de Risco Clínico
              </h2>
              <p className="text-slate-400 text-xs">
                Historico de estagios e avisos de risco emitidos pela plataforma.
              </p>
            </div>
            <span className="rounded bg-indigo-950/80 border border-indigo-800/50 px-2.5 py-1 text-xs font-mono font-medium text-indigo-300">
              Total: {saude.alertasRisco.totalAlertas}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 font-semibold text-slate-400 uppercase bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2">Severidade</th>
                  <th className="px-3 py-2">Clínica ID</th>
                  <th className="px-3 py-2 text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {saude.alertasRisco.ultimosAlertas.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-500 font-sans">
                      Nenhum alerta de risco registrado.
                    </td>
                  </tr>
                ) : (
                  saude.alertasRisco.ultimosAlertas.map((alerta) => (
                    <tr key={alerta.id} className="hover:bg-slate-850/50">
                      <td className="px-3 py-2.5 font-sans">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            alerta.nivel === "alta"
                              ? "bg-rose-950 text-rose-300 border border-rose-800/50"
                              : "bg-amber-950 text-amber-300 border border-amber-800/50"
                          }`}
                        >
                          {alerta.nivel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                        {alerta.clinicId}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-400">
                        {new Date(alerta.criadoEm).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
