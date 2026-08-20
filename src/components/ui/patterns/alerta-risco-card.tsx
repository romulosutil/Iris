import * as React from "react";
import { cn } from "@/lib/cn";
import { Cluster } from "@/components/ui/layout";
import { Pill } from "@/components/ui/primitives/pill";
import {
  MenuAcoes,
  type MenuAcaoItem,
} from "@/components/ui/primitives/menu-acoes";
import { ClinicalQuote } from "@/components/ui/clinical-quote";
import { DetalhesExpansiveis } from "@/components/ui/detalhes-expansivel";
import { ClockIcon, AlertTriangleIcon, CheckIcon } from "@/components/ui/icon";
import { DECLARACAO_PRAZOS } from "@/lib/risco/prazos";
import type { CategoriaRisco, StatusRisco } from "@/lib/risco/prazos";

export interface AlertaRiscoCardProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {
  como?: "article" | "li" | "div";
  /** Identificador do alerta */
  id?: string;
  /** Nome do paciente */
  pacienteNome?: string | null;
  /** Link para o prontuário do paciente (opcional) */
  pacienteHref?: string;
  /** Categoria do risco detectado */
  categoria: CategoriaRisco;
  /** Rótulo personalizado da categoria (opcional) */
  categoriaRotulo?: string;
  /** Status do ciclo de vida do alerta */
  status: StatusRisco;
  /** Trecho literal da sessão */
  trechoFonte: string;
  /** Detalhe ou evidência clínica extraída */
  detalhe?: string;
  /** Prazo de escalonamento formatado (ex: "01h 01m" ou "15m") */
  tempoRestanteFormatado?: string | null;
  /** Se o prazo de escalonamento já venceu */
  jaVenceu?: boolean;
  /** Se o texto foi classificado como ambíguo */
  ambiguo?: boolean;
  /** Nome do profissional que reconheceu o alerta */
  reconhecidoPorNome?: string | null;
  /** Aviso legal aplicável (ex: ECA para menores de idade) */
  avisoLegalTexto?: string | null;
  /** Conduta registrada no encerramento (quando resolvido) */
  condutaRegistrada?: string | null;
  /** Motivo do descarte registrado (quando descartado) */
  motivoDescarte?: string | null;
  /** CTA único e visível do card (ex: Reconhecer). */
  acaoPrimaria?: React.ReactNode;
  /** Ações de baixa ênfase, recolhidas no menu de reticências. */
  acoesSecundarias?: MenuAcaoItem[];
  /** Mensagem de erro de mutação (renderizada abaixo das ações). */
  erro?: React.ReactNode;
}

const ROTULO_CATEGORIA_TITULO: Record<CategoriaRisco, string> = {
  ideacao_suicida: "Ideação suicida",
  autolesao: "Autolesão",
  violencia_sofrida: "Violência sofrida",
  violencia_praticada: "Violência praticada",
  risco_a_terceiro: "Risco a terceiro",
};

const ROTULO_STATUS_SENTENCE: Record<StatusRisco, string> = {
  aberto: "Aguardando reconhecimento",
  reconhecido: "Reconhecido",
  escalado_estagio_1: "Escalado (1º estágio)",
  escalado_estagio_2: "Escalado (2º estágio)",
  resolvido: "Resolvido",
  descartado: "Descartado",
};

const STATUS_CONFIG: Record<
  StatusRisco,
  {
    variant: "solid" | "inset" | "outline";
    colorScheme: "menta" | "ouro" | "coral" | "azul" | "neutral";
    icon: React.ReactNode;
  }
> = {
  aberto: {
    variant: "solid",
    colorScheme: "ouro",
    icon: <ClockIcon size={12} />,
  },
  reconhecido: {
    variant: "inset",
    colorScheme: "azul",
    icon: <CheckIcon size={12} />,
  },
  escalado_estagio_1: {
    variant: "solid",
    colorScheme: "coral",
    icon: <AlertTriangleIcon size={12} />,
  },
  escalado_estagio_2: {
    variant: "solid",
    colorScheme: "coral",
    icon: <AlertTriangleIcon size={12} />,
  },
  resolvido: {
    variant: "solid",
    colorScheme: "menta",
    icon: <CheckIcon size={12} />,
  },
  descartado: {
    variant: "outline",
    colorScheme: "neutral",
    icon: null,
  },
};

const DISCLAIMER_IA =
  "Sinalização gerada automaticamente a partir de padrões no texto. Não constitui avaliação clínica de risco — a decisão de conduta é 100% humana.";

/**
 * AlertaRiscoCard — Cartão de alerta de risco clínico do Design System (Espectro Brutal).
 *
 * Hierarquia por revelação progressiva: a superfície do card carrega apenas a
 * história humana (categoria, paciente, relato literal), a pílula de estado
 * essencial e um único CTA. Respaldo regulatório, disclaimer de IA e a contagem
 * detalhada de prazo vivem dentro de "Ver respaldo regulatório"; as ações de
 * baixa ênfase vivem no menu de reticências. Nada é removido — tudo continua
 * alcançável por teclado e leitor de tela.
 */
export const AlertaRiscoCard = React.forwardRef<
  HTMLElement,
  AlertaRiscoCardProps
>(function AlertaRiscoCard(
  {
    como = "li",
    id,
    pacienteNome,
    pacienteHref,
    categoria,
    categoriaRotulo,
    status,
    trechoFonte,
    detalhe,
    tempoRestanteFormatado,
    jaVenceu = false,
    ambiguo = false,
    reconhecidoPorNome,
    avisoLegalTexto,
    condutaRegistrada,
    motivoDescarte,
    acaoPrimaria,
    acoesSecundarias,
    erro,
    className,
    ...props
  },
  ref,
) {
  const Component = como as React.ElementType;
  const terminal = status === "resolvido" || status === "descartado";
  const nomeCategoria =
    categoriaRotulo ?? ROTULO_CATEGORIA_TITULO[categoria] ?? categoria;
  const statusCfg = STATUS_CONFIG[status];

  return (
    <Component
      ref={ref}
      id={id}
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    >
      {/*
        Cabeçalho: só o estado essencial à esquerda e o menu de reticências à
        direita. O selo "vencido" e o marcador de dever legal permanecem
        visíveis porque mudam a decisão — o texto integral de ambos está na
        seção expansível.
      */}
      <div className="flex items-start justify-between gap-3">
        <Cluster gap="xs" className="items-center">
          <Pill
            variant={statusCfg.variant}
            colorScheme={statusCfg.colorScheme}
            size="sm"
            icon={statusCfg.icon}
          >
            {ROTULO_STATUS_SENTENCE[status]}
          </Pill>

          {!terminal && jaVenceu ? (
            <Pill variant="solid" colorScheme="coral" size="sm">
              Prazo vencido
            </Pill>
          ) : null}

          {avisoLegalTexto ? (
            <Pill variant="outline" colorScheme="coral" size="sm">
              Dever legal aplicável
            </Pill>
          ) : null}
        </Cluster>

        {acoesSecundarias && acoesSecundarias.length > 0 ? (
          <MenuAcoes
            itens={acoesSecundarias}
            rotulo={`Mais ações do alerta de ${nomeCategoria}`}
            className="-mt-1 -mr-1 shrink-0"
          />
        ) : null}
      </div>

      {/* História humana: categoria em título e paciente logo abaixo. */}
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
          {nomeCategoria}
        </h3>
        {pacienteNome ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Paciente:{" "}
            {pacienteHref ? (
              <a
                href={pacienteHref}
                className="focus-visible:outline-focus font-semibold text-[var(--text-primary)] hover:underline"
              >
                {pacienteNome}
              </a>
            ) : (
              <span className="font-semibold text-[var(--text-primary)]">
                {pacienteNome}
              </span>
            )}
          </p>
        ) : null}
      </div>

      {/* Relato literal da sessão — nunca recolhido. */}
      <ClinicalQuote
        rotulo="Trecho do relato"
        texto={trechoFonte}
        evidencia={detalhe}
      />

      {/* Desfecho registrado, em texto corrido em vez de mais uma caixa. */}
      {terminal ? (
        <div className="flex flex-col gap-1 border-l-2 border-[var(--border-brutal)]/30 pl-3">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">
            {status === "resolvido"
              ? "Conduta registrada"
              : "Motivo do descarte"}
          </span>
          <p className="text-sm text-[var(--text-primary)]">
            {status === "resolvido"
              ? (condutaRegistrada ?? "—")
              : (motivoDescarte ?? "—")}
          </p>
        </div>
      ) : null}

      {/* Revelação progressiva do respaldo regulatório e dos prazos. */}
      <DetalhesExpansiveis rotulo="Ver respaldo regulatório">
        <p>
          <span className="font-semibold text-[var(--text-primary)]">
            Identificado por IA: {nomeCategoria}.
          </span>{" "}
          {DISCLAIMER_IA}
        </p>

        {avisoLegalTexto ? (
          <p>
            <span className="font-semibold text-[var(--status-error-fg)]">
              Dever legal aplicável a este registro.
            </span>{" "}
            {avisoLegalTexto}
          </p>
        ) : null}

        {!terminal ? (
          <p>
            <span className="font-semibold text-[var(--text-primary)]">
              Escalonamento interno em:{" "}
              {jaVenceu ? "prazo vencido" : (tempoRestanteFormatado ?? "—")}.
            </span>{" "}
            {DECLARACAO_PRAZOS}
          </p>
        ) : null}

        {ambiguo ? <p>Texto ambíguo, citado literalmente.</p> : null}

        {reconhecidoPorNome ? (
          <p>Reconhecido por {reconhecidoPorNome}.</p>
        ) : null}
      </DetalhesExpansiveis>

      {/* CTA único. */}
      {acaoPrimaria || erro ? (
        <div className="flex flex-col gap-2">
          {acaoPrimaria ? (
            <div className="flex justify-end">{acaoPrimaria}</div>
          ) : null}
          {erro ? <div>{erro}</div> : null}
        </div>
      ) : null}
    </Component>
  );
});
