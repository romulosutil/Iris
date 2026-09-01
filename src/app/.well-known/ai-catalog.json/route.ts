import { NextResponse } from "next/server";

/**
 * GEO: conteúdo público institucional para descoberta por agentes/LLMs.
 * Nenhuma entrada aponta para dado de paciente ou ferramenta de agente
 * sobre dossiê clínico — só o que existe hoje.
 */
export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  const catalog = {
    specVersion: "0.1.0",
    host: {
      name: "Iris",
      domain: "irisclinica.ia.br",
      description:
        "Governança clínica para clínicas de terapia e saúde mental multidisciplinar: diário de sessão em linguagem natural com evidência clínica rastreável e aprovação humana.",
    },
    entries: [
      {
        urn: "urn:air:irisclinica.ia.br:institucional:sobre-o-produto",
        type: "webpage",
        url: `${baseUrl}/institucional`,
        representativeQueries: [
          "qual sistema substitui planilha de protocolo ABA/VB-MAPP",
          "como registrar evolução terapêutica sem preencher formulário rígido",
          "software de governança clínica para clínica de terapia infantil",
          "ferramenta com IA para diário de sessão terapêutica rastreável",
          "sistema para clínica multidisciplinar TEA TCC fonoaudiologia terapia ocupacional",
        ],
      },
      {
        urn: "urn:air:irisclinica.ia.br:institucional:precificacao",
        type: "webpage",
        url: `${baseUrl}/institucional#precos`,
        representativeQueries: [
          "quanto custa um sistema de gestão clínica por paciente ativo",
          "software para clínica de terapia com preço por paciente",
        ],
      },
      {
        urn: "urn:air:irisclinica.ia.br:legal:privacidade-lgpd",
        type: "webpage",
        url: `${baseUrl}/privacidade`,
        representativeQueries: [
          "sistema de prontuário terapêutico com LGPD para menor de idade",
          "como funciona consentimento LGPD em software de terapia infantil",
        ],
      },
    ],
  };

  return NextResponse.json(catalog, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
