import type { MetadataRoute } from "next";

/**
 * Arquivo robots.txt dinâmico do Iris (/robots.txt).
 * Configura permissões para robôs de busca e aponta o sitemap oficial.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/validacao",
        "/agenda",
        "/pacientes",
        "/equipe",
        "/pendencias",
        "/revisao/",
        "/diario/",
        "/relatorios",
        "/supervisao",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
