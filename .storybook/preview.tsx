import type { Preview } from "@storybook/nextjs-vite";
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import "../src/styles/globals.css";

// Mesmas fontes do app (layout.tsx). Sem isto, o Storybook cai para system-ui
// e a tipografia diverge do site em produção (menos legível).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

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
        // Injeta as vars de fonte no <html> — espelha layout.tsx, faz o
        // globals.css (html { font-family: var(--font-body) }) resolver.
        document.documentElement.classList.add(
          spaceGrotesk.variable,
          jakarta.variable,
        );
      }
      return Story();
    },
  ],
};

export default preview;
