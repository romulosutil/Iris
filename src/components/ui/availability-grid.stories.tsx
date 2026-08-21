import type { Meta } from "@storybook/nextjs-vite";
import { AvailabilityGrid } from "./availability-grid";

const meta = {
  title: "05. PATTERNS/Clinical & Schedules/AvailabilityGrid",
  component: AvailabilityGrid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AvailabilityGrid>;

export default meta;

// Mock inicial de disponibilidade de Segunda a Sexta (08:00 às 12:00 e 13:00 às 17:00)
const mockCelulas = new Set<string>([
  "1:08:00",
  "1:08:30",
  "1:09:00",
  "1:09:30",
  "1:10:00",
  "1:10:30",
  "1:11:00",
  "1:11:30",
  "1:13:00",
  "1:13:30",
  "1:14:00",
  "1:14:30",
  "1:15:00",
  "1:15:30",
  "1:16:00",
  "1:16:30",
  "2:08:00",
  "2:08:30",
  "2:09:00",
  "2:09:30",
  "2:10:00",
  "2:10:30",
  "2:11:00",
  "2:11:30",
  "2:13:00",
  "2:13:30",
  "2:14:00",
  "2:14:30",
  "2:15:00",
  "2:15:30",
  "2:16:00",
  "2:16:30",
  "3:08:00",
  "3:08:30",
  "3:09:00",
  "3:09:30",
  "3:10:00",
  "3:10:30",
  "3:11:00",
  "3:11:30",
  "3:13:00",
  "3:13:30",
  "3:14:00",
  "3:14:30",
  "3:15:00",
  "3:15:30",
  "3:16:00",
  "3:16:30",
  "4:08:00",
  "4:08:30",
  "4:09:00",
  "4:09:30",
  "4:10:00",
  "4:10:30",
  "4:11:00",
  "4:11:30",
  "4:13:00",
  "4:13:30",
  "4:14:00",
  "4:14:30",
  "4:15:00",
  "4:15:30",
  "4:16:00",
  "4:16:30",
  "5:08:00",
  "5:08:30",
  "5:09:00",
  "5:09:30",
  "5:10:00",
  "5:10:30",
  "5:11:00",
  "5:11:30",
  "5:13:00",
  "5:13:30",
  "5:14:00",
  "5:14:30",
  "5:15:00",
  "5:15:30",
  "5:16:00",
  "5:16:30",
]);

export const Padrao = {
  render: () => (
    <div className="mx-auto max-w-6xl bg-[var(--bg-app)] p-4">
      <AvailabilityGrid
        celulasIniciais={mockCelulas}
        onSalvar={() => alert("Disponibilidade salva com sucesso!")}
      />
    </div>
  ),
};

export const Mobile = {
  globals: { viewport: { value: "terapeuta" } },
  render: () => (
    <div className="bg-[var(--bg-app)] p-2">
      <AvailabilityGrid celulasIniciais={mockCelulas} />
    </div>
  ),
};
