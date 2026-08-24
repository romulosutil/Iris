import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import type { LinhaTrilha } from "./queries";

/**
 * #453 — tabela da trilha. **Server component de propósito** (sem `"use client"`):
 * as linhas nunca entram num payload RSC de cliente, então nenhum campo pode
 * vazar por serialização. A interatividade da tela mora só em
 * `paginacao-trilha.tsx`, que recebe dois números.
 */
export function TrilhaTabela({ linhas }: { linhas: LinhaTrilha[] }) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        title="Nenhum registro nesta página"
        description="A trilha guarda os últimos 180 dias de atividade da clínica. Se você chegou aqui por um link antigo, volte para a primeira página."
      />
    );
  }

  return (
    <Table zebrada>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Quando</TableHead>
          <TableHead scope="col">Quem</TableHead>
          <TableHead scope="col">O que aconteceu</TableHead>
          <TableHead scope="col">Onde</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((linha) => (
          <TableRow key={linha.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {linha.quando}
            </TableCell>
            <TableCell>{linha.ator}</TableCell>
            <TableCell>{linha.acao}</TableCell>
            <TableCell>{linha.entidade}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
