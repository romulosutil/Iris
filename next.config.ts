import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker enxuta para deploy no Easypanel (VPS).
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
