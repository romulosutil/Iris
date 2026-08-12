import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "../card";
import { Pill } from "../primitives/pill";
import { Button } from "../button";
import { CheckIcon, PencilIcon, SparkleIcon } from "../icon";

export type ConfidenceLevel = "alta" | "media" | "baixa";

export interface ConfidenceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  titulo: string;
  sugestao: string;
  confianca: ConfidenceLevel;
  origem?: string;
  onAprovar?: () => void;
  onEditar?: () => void;
  onRejeitar?: () => void;
  isLoading?: boolean;
}

export const ConfidenceCard = React.forwardRef<HTMLDivElement, ConfidenceCardProps>(
  function ConfidenceCard(
    {
      className,
      titulo,
      sugestao,
      confianca,
      origem,
      onAprovar,
      onEditar,
      onRejeitar,
      isLoading = false,
      ...props
    },
    ref
  ) {
    // Configurações baseadas na confiança e fricção
    const config = {
      alta: {
        corBorder: "border-[var(--status-success-border)]",
        corTexto: "text-[var(--status-success-fg)]",
        corBg: "bg-[var(--status-success-bg)]",
        label: "Confiança Alta",
        friccao: "Fricção Baixa",
      },
      media: {
        corBorder: "border-[var(--status-warning-border)]",
        corTexto: "text-[var(--status-warning-fg)]",
        corBg: "bg-[var(--status-warning-bg)]",
        label: "Confiança Média",
        friccao: "Fricção Média",
      },
      baixa: {
        corBorder: "border-[var(--status-error-border)]",
        corTexto: "text-[var(--status-error-fg)]",
        corBg: "bg-[var(--status-error-bg)]",
        label: "Confiança Baixa",
        friccao: "Fricção Alta",
      },
    }[confianca];

    return (
      <Card
        ref={ref}
        epistemicState="suggestion"
        titulo={
          <div className="flex items-center gap-2">
            <SparkleIcon className="h-4 w-4 text-violet-600 shrink-0" />
            <span className="font-semibold">{titulo}</span>
          </div>
        }
        className={cn("p-5 border-l-4 border-l-violet-500", className)}
        {...props}
      >
        <div className="flex flex-col gap-4 mt-2">
          {/* Corpo da Sugestão */}
          <div className="p-3 bg-[var(--surface-elevated)] border border-[var(--border-brutal)] rounded-[var(--radius-sm)]">
            <p className="font-mono text-sm text-[var(--text-primary)] break-words">
              &ldquo;{sugestao}&rdquo;
            </p>
            {origem && (
              <span className="block mt-1.5 text-xs text-[var(--text-secondary)]">
                Origem: {origem}
              </span>
            )}
          </div>

          {/* Indicadores de Confiança e Fricção */}
          <div className="flex flex-wrap gap-2">
            <Pill className={cn("border-2", config.corBorder, config.corBg, config.corTexto)}>
              {config.label}
            </Pill>
            <Pill className="border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-secondary)]">
              {config.friccao}
            </Pill>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-dashed border-gray-300">
            {onRejeitar && (
              <Button
                variante="terciaria"
                tamanho="sm"
                onClick={onRejeitar}
                disabled={isLoading}
              >
                Rejeitar
              </Button>
            )}
            {onEditar && (
              <Button
                variante="secundaria"
                tamanho="sm"
                iconLeft={<PencilIcon className="h-4 w-4" />}
                onClick={onEditar}
                disabled={isLoading}
              >
                Editar
              </Button>
            )}
            {onAprovar && (
              <Button
                variante="primaria"
                tamanho="sm"
                iconLeft={<CheckIcon className="h-4 w-4" />}
                onClick={onAprovar}
                disabled={isLoading}
                isLoading={isLoading}
              >
                Aprovar
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }
);
