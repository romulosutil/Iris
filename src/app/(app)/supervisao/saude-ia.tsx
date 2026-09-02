import { Stack } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatarDuracaoSegundos,
  formatarInteiro,
  formatarLatenciaMs,
  formatarSemana,
  taxaAprovacaoSemEdicao,
} from "@/lib/supervisao/saude-ia";
import { SAUDE_IA_SEMANAS_PADRAO, type SaudeIaLinha } from "./queries";

/**
 * DA-01 (#535) — bloco "Saúde da IA" do /supervisao. **Server component de
 * propósito** (sem `"use client"`): as linhas vêm da view
 * `metricas_extracao_por_clinica_semana` (só agregados, sem PII) e não há
 * interatividade — nada entra em payload RSC de cliente.
 *
 * Tabela simples com componentes do DS, sem gráfico novo (decisão da issue).
 */
export function SaudeIa({
  linhas,
  semanas = SAUDE_IA_SEMANAS_PADRAO,
}: {
  linhas: SaudeIaLinha[];
  semanas?: number;
}) {
  return (
    <Stack como="section" gap="sm" aria-labelledby="saude-ia-titulo">
      <div className="flex flex-col gap-1">
        <h2
          id="saude-ia-titulo"
          className="font-display text-xl font-semibold text-[var(--text-primary)]"
        >
          Saúde da IA
        </h2>
        <p className="max-w-[68ch] text-sm text-[var(--text-secondary)]">
          O que a extração automática sugeriu nas últimas {semanas} semanas e
          como a equipe revisou. A meta do produto é 70% ou mais de sugestões
          aprovadas sem edição; a taxa conta só o que já foi revisado.
        </p>
      </div>
      {linhas.length === 0 ? (
        <EmptyState
          variant="compact"
          title="Nenhuma extração nas últimas semanas"
          description="Assim que uma sessão for consolidada com a análise da IA ligada, a semana aparece aqui."
        />
      ) : (
        <Table zebrada>
          <TableCaption>
            Uma linha por semana ISO (no fuso da clínica), modelo e versão do
            prompt. Falhas de validação são decisões de revisão que não gravaram
            (erro de validação); falhas são chamadas que não responderam (sessão
            marcada como pendente de reprocessamento). Latência e tempo até
            revisão são medianas.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Semana</TableHead>
              <TableHead scope="col">Modelo</TableHead>
              <TableHead scope="col">Prompt</TableHead>
              <TableHead scope="col" className="text-right">
                Sugeridas
              </TableHead>
              <TableHead scope="col" className="text-right">
                Aprovadas sem edição
              </TableHead>
              <TableHead scope="col" className="text-right">
                Editadas
              </TableHead>
              <TableHead scope="col" className="text-right">
                Descartadas
              </TableHead>
              <TableHead scope="col" className="text-right">
                Falhas de validação
              </TableHead>
              <TableHead scope="col" className="text-right">
                Falhas
              </TableHead>
              <TableHead scope="col" className="text-right">
                Até revisão
              </TableHead>
              <TableHead scope="col" className="text-right">
                Latência
              </TableHead>
              <TableHead scope="col" className="text-right">
                Tokens (entrada / saída)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => {
              const { revisadas, taxa } = taxaAprovacaoSemEdicao(l);
              return (
                <TableRow
                  key={`${l.semanaIso}|${l.modelo ?? ""}|${l.promptVersao ?? ""}`}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatarSemana(l.semanaIso, l.semanaInicio)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.modelo ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.promptVersao ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarInteiro(l.totalSugeridas)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {taxa === null
                      ? `${formatarInteiro(l.aprovadasSemEdicao)} (sem revisão)`
                      : `${formatarInteiro(l.aprovadasSemEdicao)} de ${formatarInteiro(revisadas)} (${taxa}%)`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarInteiro(l.editadas)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarInteiro(l.descartadas)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarInteiro(l.erroValidacao)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarInteiro(l.pendentes)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarDuracaoSegundos(l.medianaSegundosAteRevisao)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarLatenciaMs(l.medianaLatenciaMs)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarInteiro(l.tokensEntrada)} /{" "}
                    {formatarInteiro(l.tokensSaida)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
}
