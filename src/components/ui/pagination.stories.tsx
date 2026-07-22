import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Pagination } from "./pagination";

const meta = {
  title: "Molecules/Pagination",
  component: Pagination,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Pagination>;

export default meta;

export const Padrao = {
  render: () => {
    const [page, setPage] = useState(1);
    return (
      <div className="w-[500px]">
        <Pagination
          paginaAtual={page}
          totalPaginas={12}
          onPaginaChange={setPage}
          sumario={`Exibindo ${(page - 1) * 10 + 1}–${page * 10} de 118 registros`}
        />
      </div>
    );
  },
};
