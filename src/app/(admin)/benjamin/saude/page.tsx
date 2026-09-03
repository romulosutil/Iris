import { getSuperAdminSaude } from "../queries";
import { Pill } from "@/components/ui/primitives/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SuperAdminSaudePage() {
  const saude = await getSuperAdminSaude();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          Saúde do Sistema &amp; Integrações
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Monitoramento de resiliência de webhooks (Asaas) e disparos de alertas
          do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Webhooks Asaas. O <Table> do DS já traz a moldura e a rolagem
            horizontal — o painel externo com borda saiu para não aninhar dois
            quadros. */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Webhooks Asaas
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Log de recepção e deduplicação de eventos de faturamento.
              </p>
            </div>
            <Pill colorScheme="menta" size="sm" className="font-mono">
              Total: {saude.webhooksAsaas.totalRecebidos}
            </Pill>
          </div>

          <Table className="text-xs">
            <caption className="sr-only">
              Últimos eventos de webhook recebidos do Asaas.
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>ID Evento Asaas</TableHead>
                <TableHead className="text-right">Processado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saude.webhooksAsaas.ultimosEventos.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-4 text-center text-[var(--text-secondary)]"
                  >
                    Nenhum webhook recebido recentemente.
                  </TableCell>
                </TableRow>
              ) : (
                saude.webhooksAsaas.ultimosEventos.map((evt) => (
                  <TableRow key={evt.id}>
                    <TableCell className="p-3 font-medium">
                      {evt.evento}
                    </TableCell>
                    <TableCell className="p-3 font-mono text-[var(--text-secondary)]">
                      {evt.asaasEventId}
                    </TableCell>
                    <TableCell className="p-3 text-right font-mono text-[var(--text-secondary)]">
                      {new Date(evt.processadoEm).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        {/* Alertas de Risco Clínico */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Alertas de Risco Clínico
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Historico de estagios e avisos de risco emitidos pela
                plataforma.
              </p>
            </div>
            <Pill colorScheme="azul" size="sm" className="font-mono">
              Total: {saude.alertasRisco.totalAlertas}
            </Pill>
          </div>

          <Table className="text-xs">
            <caption className="sr-only">
              Últimos alertas de risco clínico emitidos pela plataforma.
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>Severidade</TableHead>
                <TableHead>Clínica ID</TableHead>
                <TableHead className="text-right">Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saude.alertasRisco.ultimosAlertas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-4 text-center text-[var(--text-secondary)]"
                  >
                    Nenhum alerta de risco registrado.
                  </TableCell>
                </TableRow>
              ) : (
                saude.alertasRisco.ultimosAlertas.map((alerta) => (
                  <TableRow key={alerta.id}>
                    <TableCell className="p-3">
                      <Pill
                        variant="outline"
                        size="sm"
                        colorScheme={alerta.nivel === "alta" ? "coral" : "ouro"}
                      >
                        {alerta.nivel}
                      </Pill>
                    </TableCell>
                    <TableCell className="p-3 font-mono text-[var(--text-secondary)]">
                      {alerta.clinicId}
                    </TableCell>
                    <TableCell className="p-3 text-right font-mono text-[var(--text-secondary)]">
                      {new Date(alerta.criadoEm).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
