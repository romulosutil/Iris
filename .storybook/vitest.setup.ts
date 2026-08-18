// Storybook 10.3+: as annotations do preview são aplicadas automaticamente
// pelo @storybook/addon-vitest. Este arquivo pode conter setup customizado
// se necessário no futuro.

import Module from "node:module";

// Corrige vazamento de separador de caminho do Windows (\) em module-alias /
// vite-plugin-storybook-nextjs (Issue #341).
type ResolveFilename = (this: unknown, ...args: unknown[]) => string;
const moduleInterno = Module as unknown as {
  _resolveFilename?: ResolveFilename;
};

const origResolveFilename = moduleInterno._resolveFilename;
if (origResolveFilename) {
  // `_resolveFilename` é API interna do Node: a lista de parâmetros não é
  // pública e já mudou entre versões. Reescrevemos só `args[0]` (o request) e
  // repassamos o resto intacto via `apply`, para não descartar em silêncio um
  // argumento que o motor passe hoje ou venha a passar depois.
  moduleInterno._resolveFilename = function (
    this: unknown,
    ...args: unknown[]
  ) {
    const request = args[0];
    if (
      typeof request === "string" &&
      request.includes("next\\dist\\compiled")
    ) {
      args[0] = request.replace(/\\/g, "/");
    }
    return origResolveFilename.apply(this, args);
  };
}

// Mock de ResizeObserver para testes em jsdom (ex: Radix UI Slider/Tabs)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
