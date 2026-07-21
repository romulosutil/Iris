// Storybook 10.3+: as annotations do preview são aplicadas automaticamente
// pelo @storybook/addon-vitest. Este arquivo pode conter setup customizado
// se necessário no futuro.

import { vi } from "vitest";

// Mock de ResizeObserver para testes em jsdom (ex: Radix UI Slider/Tabs)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
