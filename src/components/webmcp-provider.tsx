"use client";

import { useEffect } from "react";
import { registerWebMCPTools, type WebMCPTool } from "@/lib/webmcp";

export function WebMCPProvider() {
  useEffect(() => {
    const irisTools: WebMCPTool[] = [
      {
        name: "search_clinical_evidence",
        description:
          "Busca critérios clínicos e marcadores comportamentais na base de conhecimento do Iris.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Termo de busca ou condição comportamental/clínica",
            },
          },
          required: ["query"],
        },
        execute: async ({ query }) => {
          return {
            results: [
              {
                id: "ev-001",
                topic: `Evidências para ${query}`,
                summary:
                  "Indicadores comportamentais compilados de acordo com os critérios clínicos.",
              },
            ],
          };
        },
      },
      {
        name: "get_iris_overview",
        description:
          "Retorna a descrição geral do sistema Iris e fluxo de dossiê clínico.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          return {
            name: "Iris",
            tagline: "Chegue na avaliação com o dossiê pronto.",
            features: [
              "Trilhas comportamentais e anamnese",
              "Relatórios estruturados com evidências rastreáveis",
              "Conformidade total LGPD e segurança de dados clínicos",
            ],
          };
        },
      },
    ];

    registerWebMCPTools(irisTools);
  }, []);

  return null;
}
