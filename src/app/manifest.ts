import type { MetadataRoute } from "next";

/**
 * Manifesto PWA do Iris (#185, Etapa 2). Servido em `/manifest.webmanifest`;
 * o Next injeta a `<link rel="manifest">` no `<head>` sozinho.
 *
 * É também a fonte que o Bubblewrap lê na Etapa 3 para gerar o projeto Android
 * — `start_url`, `scope`, `theme_color` e os ícones viram configuração do TWA.
 * Mudar qualquer um deles depois do app publicado exige nova versão na loja.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Iris — Governança Clínica",
    short_name: "Iris",
    description:
      "Prontuário e governança clínica para clínicas de terapia infantil.",
    lang: "pt-BR",
    dir: "ltr",
    // `/` e não `/app`: quem tem sessão é redirecionado para `/agenda` pela
    // própria rota raiz; quem não tem vê a landing e o login.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Idêntico ao `viewport.themeColor` de `src/app/layout.tsx`.
    theme_color: "#f2b705",
    background_color: "#f8f9fa",
    categories: ["medical", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
