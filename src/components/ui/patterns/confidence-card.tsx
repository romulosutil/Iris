import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";
import { Pill } from "@/components/ui/primitives/pill";
import { Button } from "@/components/ui/button";
import { ClinicalQuote } from "@/components/ui/clinical-quote";
import {
  SparkleIcon,
  CheckIcon,
  PencilIcon,
  TrashIcon,
  AlertTriangleIcon,
} from "@/components/ui/icon";

type FriccaoNivel = "baixa" | "media" | "alta";

export interface ConfidenceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  titulo: React.ReactNode;
  protocolo?: string;
  metaCodigo?: string;
  trecho?: string;
  justificativa?: string;
  friccao?: FriccaoNivel;
  confianca?: number; // 0 a 100
  onAprovar?: () => void;
  onEditar?: () => void;
  onDescartar?: () => void;
  carregando?: boolean;
}

const friccaoConfig: Record<
  FriccaoNivel,
  {
    rotulo: string;
    pillVariant: "solid" | "inset" | "outline";
    pillColor: "menta" | "ouro" | "coral";
    icon: React.ReactNode;
    cardBorder: string;
  }
> = {
  baixa: {
    rotulo: "Baixa Fricção",
    pillVariant: "solid",
    pillColor: "menta",
    icon: <CheckIcon size={12} />,
    cardBorder: "border-l-[4px] border-l-status-success-border",
  },
  media: {
    rotulo: "Média Fricção",
    pillVariant: "inset",
    pillColor: "ouro",
    icon: <SparkleIcon size={12} />,
    cardBorder: "border-l-[4px] border-l-status-warning-border",
  },
  alta: {
    rotulo: "Alta Fricção — Atenção",
    pillVariant: "inset",
    pillColor: "coral",
    icon: <AlertTriangleIcon size={12} />,
    cardBorder: "border-l-[4px] border-l-status-error-border",
  },
};

/**
 * ConfidenceCard — Cartão de revisão de extrações por IA.
 * Organismo com indicação clara de confiança, evidência citada e ações de decisão clínica.
 */
export function ConfidenceCard({
  titulo,
  protocolo,
  metaCodigo,
  trecho,
  justificativa,
  friccao = "baixa",
  confianca,
  onAprovar,
  onEditar,
  onDescartar,
  carregando = false,
  className,
  ...props
}: ConfidenceCardProps) {
  const conf = friccaoConfig[friccao];

  return (
    <div
      data-friccao={friccao}
      className={cn(
        "text-text-primary flex flex-col gap-3 p-5",
        surface("sugerida", {
          radius: "control",
          className: cn("bg-surface-card", conf.cardBorder),
        }),
        className,
      )}
      {...props}
    >
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {protocolo && (
            <span className="text-text-secondary font-mono text-xs font-bold tracking-wider uppercase">
              [{protocolo}
              {metaCodigo ? ` · ${metaCodigo}` : ""}]
            </span>
          )}
          <h4 className="font-display text-text-primary text-base font-bold">
            {titulo}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          {typeof confianca === "number" && (
            <span className="text-text-secondary font-mono text-xs font-semibold">
              {confianca}% confiança
            </span>
          )}
          <Pill
            variant={conf.pillVariant}
            colorScheme={conf.pillColor}
            size="sm"
            icon={conf.icon}
          >
            {conf.rotulo}
          </Pill>
        </div>
      </div>

      {/* Citação / Evidência extraída do diário — ClinicalQuote é o único
          componente de trecho-fonte (DS-03); o blockquote com acento lateral
          ad hoc foi banido (D54). */}
      {trecho && <ClinicalQuote texto={trecho} />}

      {/* Justificativa clínica da IA */}
      {justificativa && (
        <p className="text-text-secondary text-xs">
          <span className="text-text-primary font-semibold">
            Raciocínio IA:{" "}
          </span>
          {justificativa}
        </p>
      )}

      {/* Ações inline */}
      <div className="border-border-brutal/20 mt-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {onDescartar && (
          <Button
            variante="terciaria"
            tamanho="sm"
            onClick={onDescartar}
            disabled={carregando}
            iconLeft={<TrashIcon size={14} />}
          >
            Descartar
          </Button>
        )}
        {onEditar && (
          <Button
            variante="secundaria"
            tamanho="sm"
            onClick={onEditar}
            disabled={carregando}
            iconLeft={<PencilIcon size={14} />}
          >
            Editar
          </Button>
        )}
        {onAprovar && (
          <Button
            variante="primaria"
            tamanho="sm"
            onClick={onAprovar}
            isLoading={carregando}
            iconLeft={<CheckIcon size={14} />}
          >
            Aprovar Evidência
          </Button>
        )}
      </div>
    </div>
  );
}
