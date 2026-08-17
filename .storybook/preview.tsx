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
        canvas: { name: "Canvas Claro", value: "#F8F9FA" },
        canvasDark: { name: "Canvas Escuro", value: "#09090B" },
        surface: { name: "Surface Claro", value: "#FFFFFF" },
        surfaceDark: { name: "Surface Escuro", value: "#18181B" },
      },
      grid: {
        disable: true,
      },
    },
    viewport: { options: viewports },
    a11y: { test: "error" },
    options: {
      storySort: {
        method: "alphabetical",
        order: [
          "01. INTRO",
          ["Welcome"],
          "02. FOUNDATIONS",
          [
            "Overview",
            "Logo",
            "Colors",
            "Typography",
            "Spacing & Borders",
            "Icons",
            "Accessibility",
          ],
          "03. PRIMITIVES",
          [
            "Overview",
            "Surface",
            "Button",
            "Input",
            "Checkbox",
            "Slider",
            "Pill",
            "Avatar",
            "Indicator",
            "Progress",
            "VisuallyHidden",
          ],
          "04. UI COMPONENTS",
          [
            "Layout",
            ["Header", "Drawer", "Dialog", "Layout"],
            "Data Display & Feedback",
            [
              "Card",
              "Table",
              "Accordion",
              "Alert",
              "Banner",
              "Toast",
              "Tooltip",
            ],
            "Navigation & Form Controls",
            [
              "Tabs",
              "Breadcrumb",
              "Pagination",
              "Select",
              "SegmentedControl",
              "RadioCards",
              "SearchInput",
              "Field",
              "Stat",
              "MetricCard",
            ],
          ],
          "05. PATTERNS",
          [
            "Epistemics & AI",
            ["ConfidenceCard", "CompareRow", "BatchBar"],
            "Clinical & Schedules",
            [
              "AgendaCalendarGrid",
              "ProtocolDashboardCharts",
              "BarraCobertura",
              "EvidenceTimeline",
            ],
            "System States & Badges",
            ["StatusBadge", "MicroConquistaBadge", "CopyButton", "EmptyState"],
          ],
          "06. PAGES",
          ["Overview", "Agenda", "Pendências", "Supervisão", "Validação"],
        ],
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: "canvas" },
  },
  // Controles Globais do Design System: Modo (Clínico / Família) e Tema (Claro / Escuro)
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
    tema: {
      description: "Tema de cor (Claro / Escuro)",
      defaultValue: "claro",
      toolbar: {
        title: "Tema",
        icon: "sun",
        items: [
          { value: "claro", icon: "sun", title: "Claro" },
          { value: "escuro", icon: "moon", title: "Escuro" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      if (typeof document !== "undefined") {
        const modo = context.globals.modo ?? "clinico";
        const tema = context.globals.tema ?? "claro";
        const isDark = tema === "escuro";

        document.documentElement.setAttribute("data-mode", modo);
        document.documentElement.setAttribute("data-theme", tema);
        document.documentElement.classList.toggle("dark", isDark);

        // Atualiza a cor de fundo e texto da lona do Storybook para espelhar o tema
        document.body.style.backgroundColor = isDark
          ? "#09090B"
          : "var(--bg-app)";
        document.body.style.color = isDark ? "#FAFAFA" : "var(--text-primary)";

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
