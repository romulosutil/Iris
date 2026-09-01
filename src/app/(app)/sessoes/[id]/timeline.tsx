import { cn } from "@/lib/cn";
import type {
  EstadoSessao,
  GestoPrimario,
  MotivoAtencao,
  ResultadoEstado,
} from "@/lib/sessao/estado";

/**
 * Timeline dos 5 estados canônicos (brief §3.1) + o passo em foco (T06).
 *
 * R-05: o rótulo do gesto vem SEMPRE de `resultado.gesto`/`resultado.motivo`
 * — nenhum switch aqui redecide "o que fazer nesta sessão". Esta tela só
 * traduz o vocabulário que `deriveEstadoSessao` (T01) já decidiu em texto e
 * posição visual.
 */

const ESCADA: ReadonlyArray<
  Exclude<EstadoSessao, "falta" | "cancelada" | "precisa_atencao">
> = ["agendada", "realizada", "documentada", "revisada", "no_acervo"];

export const ROTULO_ESTADO: Record<EstadoSessao, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  documentada: "Documentada",
  revisada: "Revisada",
  no_acervo: "No acervo",
  falta: "Falta",
  cancelada: "Cancelada",
  precisa_atencao: "Precisa de atenção",
};

export const ROTULO_GESTO: Record<GestoPrimario, string> = {
  registrar_sessao: "Registrar sessão",
  documentar: "Documentar",
  revisar_evidencias: "Revisar evidências",
  ver_no_acervo: "Ver no acervo",
  reprocessar_extracao: "Reprocessar extração",
};

export const ROTULO_MOTIVO: Record<MotivoAtencao, string> = {
  extracao_travada: "Extração travada — precisa reprocessar",
  sem_nota_apos_24h: "Sem nota consolidada há mais de 24h",
  na_fila_validacao: "Evidência esperando revisão",
};

/** Posição da escada que corresponde ao passo em foco, mesmo em `precisa_atencao`. */
function posicaoEmFoco(resultado: ResultadoEstado): number {
  if (resultado.estado === "precisa_atencao") {
    switch (resultado.motivo) {
      case "sem_nota_apos_24h":
        return ESCADA.indexOf("realizada");
      case "na_fila_validacao":
        return ESCADA.indexOf("documentada");
      case "extracao_travada":
        return ESCADA.indexOf("documentada");
    }
  }
  if (resultado.estado === "falta" || resultado.estado === "cancelada") {
    return -1;
  }
  return ESCADA.indexOf(resultado.estado);
}

export function Timeline({ resultado }: { resultado: ResultadoEstado }) {
  if (resultado.estado === "falta" || resultado.estado === "cancelada") {
    return (
      <div
        className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-4"
        role="status"
      >
        <p className="font-display text-lg font-bold text-[var(--text-primary)]">
          {ROTULO_ESTADO[resultado.estado]}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Desfecho da sessão — nenhum passo pendente.
        </p>
      </div>
    );
  }

  const emFoco = posicaoEmFoco(resultado);
  const travada = resultado.estado === "precisa_atencao";

  return (
    <nav aria-label="Progresso da sessão">
      <ol className="flex flex-wrap items-center gap-2">
        {ESCADA.map((estado, i) => {
          const atual = i === emFoco;
          const concluido = i < emFoco;
          return (
            <li key={estado} className="flex items-center gap-2">
              <span
                aria-current={atual ? "step" : undefined}
                className={cn(
                  "font-display rounded-[var(--radius-xs)] border-2 px-3 py-1.5 text-sm font-semibold",
                  atual && travada
                    ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                    : atual
                      ? "border-[var(--action-primary)] bg-[var(--action-primary)] text-[var(--action-primary-fg)]"
                      : concluido
                        ? "border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
                        : "border-dashed border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-secondary)]",
                )}
              >
                {ROTULO_ESTADO[estado]}
              </span>
              {i < ESCADA.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="text-[var(--text-secondary)]"
                >
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {travada ? (
        <p
          role="status"
          className="font-body mt-3 rounded-[var(--radius-xs)] border-2 border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-fg)]"
        >
          ⚠ {ROTULO_ESTADO["precisa_atencao"]} —{" "}
          {ROTULO_MOTIVO[resultado.motivo]}
        </p>
      ) : null}
    </nav>
  );
}
