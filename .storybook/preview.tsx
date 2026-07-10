import type { Preview } from "@storybook/nextjs-vite";
import "../src/styles/globals.css";

// Dois viewports canônicos: Terapeuta (mobile, corredor) e Coordenador (desktop).
const viewports = {
  terapeuta: {
    name: "Terapeuta (375px)",
    styles: { width: "375px", height: "812px" },
    type: "mobile" as const,
  },
  coordenador: {
    name: "Coordenador (1280px)",
    styles: { width: "1280px", height: "800px" },
    type: "desktop" as const,
  },
};

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      options: {
        canvas: { name: "Canvas", value: "#F8F9FA" },
        surface: { name: "Surface", value: "#FFFFFF" },
      },
    },
    viewport: { options: viewports },
    a11y: { test: "error" },
  },
  initialGlobals: {
    backgrounds: { value: "canvas" },
  },
  // Modo Clínico / Família — troca [data-mode] sem rebuild.
  globalTypes: {
    modo: {
      description: "Modo do design system",
      defaultValue: "clinico",
      toolbar: {
        title: "Modo",
        icon: "contrast",
        items: [
          { value: "clinico", title: "Clínico" },
          { value: "familia", title: "Família" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute(
          "data-mode",
          context.globals.modo ?? "clinico",
        );
      }
      return Story();
    },
  ],
};

export default preview;
