// Polyfills de APIs de browser ausentes no jsdom, usadas por primitivas Radix
// (ex.: Slider mede o trilho via ResizeObserver). Só ambiente de teste.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
