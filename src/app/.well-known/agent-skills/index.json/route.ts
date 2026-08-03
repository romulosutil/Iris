import { NextResponse } from "next/server";

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://iris.app";

  const skillsIndex = {
    $schema: "https://agentskills.io/schemas/v0.2.0/skills-index.json",
    version: "0.2.0",
    skills: [
      {
        name: "clinical-dossier-query",
        type: "api",
        description:
          "Query patient dossier evidence and clinical summary metrics with trace provenance.",
        url: `${baseUrl}/.well-known/agent-skills/clinical-dossier-query/SKILL.md`,
        sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      {
        name: "patient-evaluation-triage",
        type: "workflow",
        description:
          "Guide autonomous pre-evaluation questionnaire compilation and triage workflow.",
        url: `${baseUrl}/.well-known/agent-skills/patient-evaluation-triage/SKILL.md`,
        sha256:
          "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
      },
    ],
  };

  return NextResponse.json(skillsIndex, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
