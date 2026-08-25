import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogoExpurgo } from "./dialogo-expurgo";
import type { LinhaFila } from "./queries";

/**
 * #352 — fila de prontuários com prazo de guarda vencido.
 *
 * **Server component de propósito** (sem `"use client"`): a lista inteira nunca
 * entra num payload RSC de cliente, então nenhum campo pode vazar por
 * serialização. O que atravessa a fronteira é apenas `{ pacienteId, nome }`,
 * por linha, para o diálogo — e os dois são desenhados na tela.
 *
 * O selo "avisado / não avisado" não é enfeite: o aviso prévio de 90 dias é o
 * que torna o expurgo NÃO-silencioso. Uma linha sem aviso é um prontuário que
 * venceu sem que a clínica tenha sido notificada — sinal de que o job de
 * varredura não rodou, e informação que o coordenador precisa ver antes de
 * apagar qualquer coisa.
 */
export function FilaTabela({ linhas }: { linhas: LinhaFila[] }) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        title="Nenhum prontuário com prazo vencido"
        description="Esta é a situação normal. Um prontuário só aparece aqui depois da alta clínica do paciente e do fim do prazo legal de guarda — e a clínica é avisada com 90 dias de antecedência."
      />
    );
  }

  return (
    <Table zebrada>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Paciente</TableHead>
          <TableHead scope="col">Alta clínica</TableHead>
          <TableHead scope="col">Prazo venceu em</TableHead>
          <TableHead scope="col">Aviso prévio</TableHead>
          <TableHead scope="col">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((linha) => (
          <TableRow key={linha.id}>
            <TableCell>{linha.nome}</TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {linha.altaEm}
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {linha.venceEm}
            </TableCell>
            <TableCell>
              {linha.avisadoEm ? (
                <StatusBadge variante="success">
                  Avisado em {linha.avisadoEm}
                </StatusBadge>
              ) : (
                <StatusBadge variante="warning">Sem aviso prévio</StatusBadge>
              )}
            </TableCell>
            <TableCell>
              <DialogoExpurgo pacienteId={linha.id} nome={linha.nome} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
