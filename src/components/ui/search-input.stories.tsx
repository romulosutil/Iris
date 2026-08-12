import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { SearchInput } from "./search-input";

const meta = {
  title: "04. UI COMPONENTS/Navigation & Form Controls/SearchInput",
  component: SearchInput,
  parameters: { layout: "centered" },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  render: () => {
    const [val, setVal] = useState("");
    return (
      <div className="w-80">
        <SearchInput
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onClear={() => setVal("")}
          shortcutHint="Ctrl+K"
          placeholder="Buscar paciente ou protocolo..."
        />
      </div>
    );
  },
};
