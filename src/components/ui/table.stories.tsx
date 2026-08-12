import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./table";
import { StatusBadge } from "./status-badge";

const meta = {
  title: "ORGANISMS/Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FilaSupervisao: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paciente</TableHead>
          <TableHead>Terapeuta</TableHead>
          <TableHead>Data da Sessão</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-semibold">Lucas Santos</TableCell>
          <TableCell>Dra. Mariana Costa</TableCell>
          <TableCell>21/07/2026</TableCell>
          <TableCell>
            <StatusBadge estado="aprovada" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-semibold">Beatriz Oliveira</TableCell>
          <TableCell>Dr. Roberto Alves</TableCell>
          <TableCell>21/07/2026</TableCell>
          <TableCell>
            <StatusBadge estado="sugerida" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-semibold">Gabriel Lima</TableCell>
          <TableCell>Dra. Mariana Costa</TableCell>
          <TableCell>20/07/2026</TableCell>
          <TableCell>
            <StatusBadge estado="editada" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
