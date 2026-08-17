"use client";

import { Stack } from "@/components/ui/layout";
import type { AlvoValido } from "./alvos";

export function rotuloAlvo(alvo: AlvoValido): string {
  if (alvo.goal_id) return `Meta do paciente (${alvo.goal_id.slice(0, 8)})`;
  return `Protocolo ${alvo.protocol_id} · domínio ${alvo.dominio_id}`;
}

const rotuloNivelAjuda: Record<string, string> = {
  independente: "Independente",
  dica_gestual: "Dica gestual",
  dica_verbal: "Dica verbal",
  dica_fisica: "Dica física",
  modelagem: "Modelagem",
};

const rotuloPolaridade: Record<string, string> = {
  positivo: "Positivo",
  negativo: "Negativo",
};

/**
 * Renderiza `classificacaoAtual` de forma legível para o clínico — reusa a
 * mesma convenção de rótulo do picker de reclassificação (`rotuloAlvo`) para
 * o campo `alvo`, e traduz os demais campos conhecidos (`nivel_ajuda`,
 * `polaridade`, `funcao`) para pt-BR simples. MVP: sem JSON bruto na tela.
 * Compartilhado entre a fila de validação do coordenador e o card de dúvida
 * do terapeuta — ambos precisam mostrar a mesma classificação atual.
 */
export function ClassificacaoAtual({
  classificacao,
}: {
  classificacao: unknown;
}) {
  if (!classificacao || typeof classificacao !== "object") {
    return (
      <span className="text-sm text-[var(--text-secondary)]">
        Classificação não disponível.
      </span>
    );
  }

  const c = classificacao as Record<string, unknown>;
  const alvo =
    c.alvo && typeof c.alvo === "object" ? (c.alvo as AlvoValido) : null;
  const nivelAjuda = typeof c.nivel_ajuda === "string" ? c.nivel_ajuda : null;
  const polaridade = typeof c.polaridade === "string" ? c.polaridade : null;
  const funcao = typeof c.funcao === "string" ? c.funcao : null;

  return (
    <Stack gap="sm">
      <p className="text-sm text-[var(--text-secondary)]">
        Alvo:{" "}
        <span className="font-medium text-[var(--text-primary)]">
          {alvo ? rotuloAlvo(alvo) : "—"}
        </span>
      </p>
      {nivelAjuda ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Nível de ajuda:{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {rotuloNivelAjuda[nivelAjuda] ?? nivelAjuda}
          </span>
        </p>
      ) : null}
      {polaridade ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Polaridade:{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {rotuloPolaridade[polaridade] ?? polaridade}
          </span>
        </p>
      ) : null}
      {funcao ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Função:{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {funcao}
          </span>
        </p>
      ) : null}
    </Stack>
  );
}
