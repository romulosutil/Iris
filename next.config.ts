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
  // `/termos` e `/privacidade` leem o markdown de `docs/legal/` como fonte
  // única de verdade. Elas são `force-static`, então a leitura acontece no
  // build — mas o estágio `runner` da imagem (`infra/Dockerfile`) copia só
  // `.next/standalone`, `.next/static` e `public`: `docs/` não chega lá. Se
  // alguma dessas rotas deixar de ser estática, o `readFile` daria 500 em
  // produção passando verde em todo teste local. Declarar o include aqui é o
  // cinto que impede isso.
  outputFileTracingIncludes: {
    "/termos": ["./docs/legal/termos-de-uso.md"],
    "/privacidade": ["./docs/legal/politica-privacidade.md"],
  },
  reactStrictMode: true,
};

export default nextConfig;
