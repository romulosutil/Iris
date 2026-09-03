import { getSuperAdminClinicas } from "../queries";
import { formatarBRL } from "@/lib/billing/calculator";
import { StatusClinicaPill } from "@/components/admin/status-clinica-pill";
import { Button } from "@/components/ui/button";
import { surface } from "@/components/ui/primitives/surface";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    ordem?: "receita_desc" | "criado_em_desc" | "pacientes_desc";
  }>;
}

/**
 * Campos nativos (<input>/<select>) de propósito: este é um <form method="GET">
 * de Server Component, e o `Input`/`Select` do DS são componentes de cliente
 * (o Select é Radix e nem submete valor nativo). O que a Regra 0 exige é que
 * a APARÊNCIA venha de token — e vem: nenhuma paleta crua abaixo.
 */
const campo = surface("solida", {
  elevation: "flat",
  radius: "control",
  className:
    "bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
});

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
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Gestão de Clínicas &amp; Assinaturas
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Total de {clinicas.length} clínica(s) encontrada(s).
          </p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <form
        method="GET"
        className={surface("solida", {
          radius: "control",
          className:
            "flex flex-col gap-3 bg-[var(--surface-card)] p-4 sm:flex-row sm:items-center sm:justify-between",
        })}
      >
        <div className="flex flex-1 items-center gap-2">
          <label htmlFor="q" className="sr-only">
            Buscar clínica
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome da clínica ou e-mail do responsável..."
            className={`${campo} min-h-11 w-full px-3.5 py-2 text-sm`}
          />
          <Button type="submit" tamanho="sm">
            Buscar
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="ordem"
            className="text-xs font-medium whitespace-nowrap text-[var(--text-secondary)]"
          >
            Ordenar por:
          </label>
          <select
            id="ordem"
            name="ordem"
            defaultValue={ordem}
            className={`${campo} min-h-11 px-3 py-2 text-xs`}
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

      {/* Tabela Principal — o <Table> do DS já traz moldura e rolagem própria. */}
      <Table>
        <caption className="sr-only">
          Clínicas da plataforma com status de assinatura, fichas na base e
          fatura estimada do ciclo.
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>Nome da Clínica</TableHead>
            <TableHead>Responsável / E-mail</TableHead>
            <TableHead>Cadastro</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Fichas na Base</TableHead>
            <TableHead className="text-right">Fatura Estimada</TableHead>
            <TableHead className="text-center">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clinicas.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-[var(--text-secondary)]"
              >
                Nenhuma clínica encontrada com os critérios informados.
              </TableCell>
            </TableRow>
          ) : (
            clinicas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <div>{c.nome}</div>
                  <div className="font-mono text-xs text-[var(--text-secondary)]">
                    {c.id}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <div>{c.donoNome || "Sem nome"}</div>
                  <div className="font-mono text-[var(--text-secondary)]">
                    {c.donoEmail || "Sem e-mail"}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-[var(--text-secondary)]">
                  {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusClinicaPill status={c.status} />
                    {c.status === "trial" && c.diasTrialRestantes !== null && (
                      <span className="font-mono text-xs text-[var(--status-warning-fg)]">
                        {c.diasTrialRestantes} dias rest.
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {c.fichasNaBaseCount}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold text-[var(--action-primary)]">
                  {formatarBRL(c.valorEstimadoCentavos)}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    type="button"
                    variante="secundaria"
                    tamanho="sm"
                    disabled
                    title="Ações administrativas (Fase 2: Conceder isenção, pausar conta, alterar trial)"
                  >
                    Ações (Fase 2)
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
