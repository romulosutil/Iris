import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker enxuta para deploy no Easypanel (VPS).
  output: "standalone",
  // Trace do standalone a partir da raiz do projeto (evita inferir um pai
  // errado quando há outros lockfiles no sistema).
  outputFileTracingRoot: import.meta.dirname,
  reactStrictMode: true,
};

export default nextConfig;
