import Link from "next/link";
import { getSuperAdminKpis, getSuperAdminClinicas } from "./queries";
import { MetricCard } from "@/components/ui/metric-card";
import { Pill } from "@/components/ui/primitives/pill";
import { StatusClinicaPill } from "@/components/admin/status-clinica-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          Visão Geral da Plataforma
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Métricas consolidadas de saúde financeira, base de fichas e trials
          ativos. O MRR aqui é TETO pelo critério &quot;ficha não
          arquivada&quot;: a fatura real conta só ficha cadastrada ou com
          movimento no ciclo (ver o bloco de comentário em queries.ts).
        </p>
      </div>

      {/* Grid de Cards KPI. `densidade="compacta"` porque o MRR é moeda
          formatada: no peso hero (40px) o valor estoura a coluna da grade de
          cinco. O selo é um <Pill> do DS — a cor vem do colorScheme dele, o
          chamador nunca abre paleta. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          densidade="compacta"
          destaque
          titulo="MRR Estimado"
          valor={formatarBRL(kpis.mrrEstimadoCentavos)}
          descricao="Teto estimado — não é a fatura apurada"
          selo={
            <Pill colorScheme="menta" size="sm">
              Pay-as-you-grow
            </Pill>
          }
        />

        <MetricCard
          densidade="compacta"
          titulo="Clínicas Ativas"
          valor={kpis.clinicasAtivas}
          descricao="Pagantes e Isentas ativas"
          selo={
            <Pill colorScheme="azul" size="sm">
              Operacional
            </Pill>
          }
        />

        <MetricCard
          densidade="compacta"
          titulo="Fichas na Base"
          valor={kpis.fichasNaBaseTotais}
          descricao="Fichas não arquivadas; nem toda ficha é faturada"
          selo={
            <Pill colorScheme="neutral" size="sm">
              Base Total
            </Pill>
          }
        />

        <MetricCard
          densidade="compacta"
          titulo="Clínicas em Trial"
          valor={kpis.clinicasEmTrial}
          descricao="7 dias a partir do 1º paciente"
          selo={
            <Pill colorScheme="ouro" size="sm">
              Em Trial
            </Pill>
          }
        />

        <MetricCard
          densidade="compacta"
          titulo="Clínicas Isentas"
          valor={kpis.clinicasIsentas}
          descricao="Contas legadas sem gate"
          selo={
            <Pill colorScheme="neutral" size="sm">
              Isento
            </Pill>
          }
        />
      </div>

      {/* Tabela de Destaques: Top Clínicas por Receita. O <Table> do DS já
          traz a moldura (borda âncora + sombra) e o wrapper com rolagem
          horizontal própria — por isso o painel externo com borda saiu: dois
          quadros aninhados é ruído, não hierarquia. */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Top Clínicas por Receita Projetada
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Clínicas com maior volumen de faturamento estimado neste ciclo.
            </p>
          </div>
          <Link
            href="/benjamin/clinicas"
            className="focus-visible:outline-focus rounded-[var(--radius-sm)] text-xs font-semibold text-[var(--action-primary)] underline underline-offset-2 transition-colors outline-none hover:text-[var(--text-primary)] focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
          >
            Ver todas as clínicas &rarr;
          </Link>
        </div>

        <Table>
          <caption className="sr-only">
            Cinco clínicas com maior faturamento estimado no ciclo atual.
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Dono / E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fichas na Base</TableHead>
              <TableHead className="text-right">Valor Estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top5.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-[var(--text-secondary)]"
                >
                  Nenhuma clínica cadastrada na plataforma.
                </TableCell>
              </TableRow>
            ) : (
              top5.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-xs">
                    <div>{c.donoNome || "Sem nome"}</div>
                    <div className="font-mono text-[var(--text-secondary)]">
                      {c.donoEmail || "Sem e-mail"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusClinicaPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {c.fichasNaBaseCount}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-[var(--action-primary)]">
                    {formatarBRL(c.valorEstimadoCentavos)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
