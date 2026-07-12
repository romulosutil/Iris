import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker enxuta para deploy no Easypanel (VPS). Desligado no build
  // local do Windows: o copy de symlinks do standalone falha com EPERM (o
  // Windows exige privilégio p/ symlink). CI (Linux) e o deploy mantêm o
  // standalone; só o build local de dev no Windows é afetado.
  output: process.platform === "win32" ? undefined : "standalone",
  // Trace do standalone a partir da raiz do projeto (evita inferir um pai
  // errado quando há outros lockfiles no sistema).
  outputFileTracingRoot: import.meta.dirname,
  reactStrictMode: true,
};

export default nextConfig;
