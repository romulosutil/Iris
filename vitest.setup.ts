// Polyfills de APIs de browser ausentes no jsdom, usadas por primitivas Radix
// (ex.: Slider mede o trilho via ResizeObserver). Só ambiente de teste.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

process.env.DATABASE_URL ||= "postgres://iris_app:iris@localhost:5433/iris";
process.env.AUTH_DATABASE_URL ||=
  "postgres://iris_auth_login:iris@localhost:5433/iris";
process.env.MIGRATION_DATABASE_URL ||=
  "postgres://iris:iris@localhost:5433/iris";
