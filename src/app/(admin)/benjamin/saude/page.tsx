import { getSuperAdminSaude } from "../queries";

export default async function SuperAdminSaudePage() {
  const saude = await getSuperAdminSaude();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">
          Saúde do Sistema & Integrações
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Monitoramento de resiliência de webhooks (Asaas) e disparos de alertas
          do sistema.
        </p>
      </div>

      {/* Grid de Webhooks Asaas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-200">
                Webhooks Asaas
              </h2>
              <p className="text-xs text-slate-400">
                Log de recepção e deduplicação de eventos de faturamento.
              </p>
            </div>
            <span className="rounded border border-teal-800/50 bg-teal-950/80 px-2.5 py-1 font-mono text-xs font-medium text-teal-300">
              Total: {saude.webhooksAsaas.totalRecebidos}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/50 font-semibold text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">ID Evento Asaas</th>
                  <th className="px-3 py-2 text-right">Processado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {saude.webhooksAsaas.ultimosEventos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center font-sans text-slate-500"
                    >
                      Nenhum webhook recebido recentemente.
                    </td>
                  </tr>
                ) : (
                  saude.webhooksAsaas.ultimosEventos.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-850/50">
                      <td className="px-3 py-2.5 font-sans font-medium text-slate-200">
                        {evt.evento}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">
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
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-200">
                Alertas de Risco Clínico
              </h2>
              <p className="text-xs text-slate-400">
                Historico de estagios e avisos de risco emitidos pela
                plataforma.
              </p>
            </div>
            <span className="rounded border border-indigo-800/50 bg-indigo-950/80 px-2.5 py-1 font-mono text-xs font-medium text-indigo-300">
              Total: {saude.alertasRisco.totalAlertas}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/50 font-semibold text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2">Severidade</th>
                  <th className="px-3 py-2">Clínica ID</th>
                  <th className="px-3 py-2 text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {saude.alertasRisco.ultimosAlertas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center font-sans text-slate-500"
                    >
                      Nenhum alerta de risco registrado.
                    </td>
                  </tr>
                ) : (
                  saude.alertasRisco.ultimosAlertas.map((alerta) => (
                    <tr key={alerta.id} className="hover:bg-slate-850/50">
                      <td className="px-3 py-2.5 font-sans">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${
                            alerta.nivel === "alta"
                              ? "border border-rose-800/50 bg-rose-950 text-rose-300"
                              : "border border-amber-800/50 bg-amber-950 text-amber-300"
                          }`}
                        >
                          {alerta.nivel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">
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
