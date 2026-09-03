"use client";

import { useEffect } from "react";
import {
  limparWebMCPTools,
  registerWebMCPTools,
  type WebMCPTool,
} from "@/lib/webmcp";

/**
 * Registra em `navigator.modelContext` a descrição institucional do Iris para
 * agentes de navegador. Monta SÓ em `src/app/(publico)/layout` (S-08, #530).
 *
 * O que saiu e por quê: havia uma tool `search_clinical_evidence` cujo
 * `execute` devolvia `{results:[{id:"ev-001", summary:"Indicadores
 * comportamentais compilados…"}]}` — texto INVENTADO, com ar clínico, em todas
 * as páginas, inclusive no prontuário. Um agente que perguntasse "autolesão"
 * recebia uma resposta fabricada de dentro do produto que promete "IA nunca
 * decide, nada é maquiado como fato". Não existe MCP real hoje
 * (`/.well-known/mcp/server-card.json` diz isso); a única tool que sobra
 * descreve o produto, não dado.
 *
 * Ao desmontar (sair do grupo público) o contexto é zerado: a navegação do
 * Next é client-side e o registro sobreviveria à troca de rota.
 */
export function WebMCPProvider() {
  useEffect(() => {
    const irisTools: WebMCPTool[] = [
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
    return () => {
      limparWebMCPTools();
    };
  }, []);

  return null;
}
