// Storybook 10.3+: as annotations do preview são aplicadas automaticamente
// pelo @storybook/addon-vitest. Este arquivo pode conter setup customizado
// se necessário no futuro.

import Module from "node:module";
import { vi } from "vitest";

// Corrige vazamento de separador de caminho do Windows (\) em module-alias /
// vite-plugin-storybook-nextjs (Issue #341).
const origResolveFilename = (Module as any)._resolveFilename;
if (origResolveFilename) {
  (Module as any)._resolveFilename = function (
    request: string,
    parentModule: any,
    isMain: boolean,
    options: any,
  ) {
    if (
      typeof request === "string" &&
      request.includes("next\\dist\\compiled")
    ) {
      request = request.replace(/\\/g, "/");
    }
    return origResolveFilename.call(
      this,
      request,
      parentModule,
      isMain,
      options,
    );
  };
}

// Mock de ResizeObserver para testes em jsdom (ex: Radix UI Slider/Tabs)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
