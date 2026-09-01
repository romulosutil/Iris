import { NextResponse } from "next/server";

/**
 * Sem ferramenta de agente autônomo hoje (D57 em aberto — sem base legal
 * para agente de terceiro acessar dado clínico). Índice vazio de propósito:
 * publicar `clinical-dossier-query` sem backend real reativa o risco de
 * governança que este arquivo existia justamente para evitar.
 */
export function GET() {
  const skillsIndex = {
    $schema: "https://agentskills.io/schemas/v0.2.0/skills-index.json",
    version: "0.2.0",
    skills: [],
  };

  return NextResponse.json(skillsIndex, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
