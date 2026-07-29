import { NextResponse } from "next/server";

export function GET() {
  const content = `# robots.txt for Iris AI Platform
User-agent: *
Allow: /
Allow: /sobre
Disallow: /api/
Disallow: /app/
Disallow: /pacientes/
Disallow: /relatorios/
Disallow: /diario/
Disallow: /excecoes/

# AI Crawlers Specific Rules
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: Claude-Web
User-agent: Google-Extended
User-agent: PerplexityBot
User-agent: AnthropicAI
User-agent: Bytespider
Allow: /
Allow: /sobre
Allow: /.well-known/
Disallow: /api/
Disallow: /app/
Disallow: /pacientes/
Disallow: /relatorios/

# Content Signals Declaration (draft-romm-aipref-contentsignals)
Content-Signal: ai-train=no, search=yes, ai-input=no

# Sitemap
Sitemap: https://iris.app/sitemap.xml
`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
