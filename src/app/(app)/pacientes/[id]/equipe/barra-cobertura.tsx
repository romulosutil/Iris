import { Progress, type ProgressVariante } from "@/components/ui/progress";
import {
  StatusBadge,
  type BadgesVariantes,
} from "@/components/ui/patterns/status-badge";
import { formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras } from "@/lib/horas";
import {
  ancoraCobertura,
  ROTULO_ESTADO,
  textoCobertura,
  textoVinculosSemHoras,
  type CoberturaDisciplina,
  type EstadoCobertura,
} from "./cobertura";

/**
 * Barra de cobertura de uma disciplina prescrita (#203, fatia 5).
 *
 * É o objeto de leitura PRIMÁRIA da tela de equipe (plano §MV3): a lista de
 * membros responde "quem está no caso"; a barra responde "a prescrição está
 * sendo entregue?".
 *
 * Três regras que o desenho carrega e que não são estéticas:
 *
 *   1. **Não recalcula nada.** Recebe a saída de `calcularCobertura` pronta. A
 *      MESMA função alimenta a validação de saldo do servidor — se a barra
 *      fizesse a própria conta, a tela diria "restam 8h" e o servidor recusaria
 *      alocar 8h.
 *   2. **Cor nunca sozinha.** O estado aparece três vezes por caminhos
 *      independentes: no selo (texto + ícone), na frase por extenso, e no
 *      `aria-valuetext` de quem usa leitor de tela. A cor da barra é a quarta,
 *      redundante de propósito.
 *   3. **Sobrealocação grita, mas não trava.** >100% é estado legítimo e
 *      transitório (a prescrição caiu antes de a equipe ser ajustada). A barra
 *      satura em 100% porque a régua vai até o teto — o excedente é dito em
 *      número na frase, junto com a instrução de saída.
 */

/** Cada estado tem UMA leitura, e ela é a mesma no selo e na barra. */
const VARIANTE_SELO: Record<EstadoCobertura, BadgesVariantes> = {
  vazio: "neutral",
  parcial: "warning",
  completa: "success",
  sobrealocada: "error",
};

const VARIANTE_BARRA: Record<EstadoCobertura, ProgressVariante> = {
  vazio: "neutro",
  parcial: "atencao",
  completa: "sucesso",
  sobrealocada: "erro",
};

export function BarraCobertura({
  cobertura,
}: {
  cobertura: CoberturaDisciplina;
}) {
  const nome = formatarDisciplina(cobertura.disciplina);
  const frase = textoCobertura(cobertura);
  const avisoSemHoras = textoVinculosSemHoras(cobertura);

  return (
    <div
      // Alvo do handoff da represcrição (§MV4): quem confirma uma redução que
      // sobrealoca cai direto NESTA barra, não no topo de uma tela com dez
      // disciplinas. `scroll-mt` compensa o cabeçalho fixo.
      id={ancoraCobertura(cobertura.disciplina)}
      // `tabIndex={-1}` + região rotulada porque o handoff move SCROLL, e scroll
      // não é foco: sem um alvo focável, quem navega por teclado ou leitor de
      // tela confirma a redução e continua no contexto antigo, que é
      // exatamente o "descobrir depois" que a fatia existe para eliminar.
      tabIndex={-1}
      role="group"
      aria-label={`Cobertura de ${nome}`}
      data-estado={cobertura.estado}
      className="focus-visible:outline-focus flex scroll-mt-24 flex-col gap-2 rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/30 bg-[var(--surface-elevated)] p-3 focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {nome}
        </span>
        <StatusBadge variante={VARIANTE_SELO[cobertura.estado]}>
          {ROTULO_ESTADO[cobertura.estado]}
        </StatusBadge>
      </div>

      {/*
        `aria-valuetext` leva a frase inteira — sem ele, o leitor de tela
        anunciaria só "60%", que não diz de quantas horas nem quantas faltam.
        O valor satura em 100 porque `aria-valuemax` é 100: no estado
        sobrealocado quem enxerga vê a barra cheia e quem ouve recebe "125% —
        sobrealocação de 5h" pelo texto.
      */}
      <Progress
        value={Math.min(100, cobertura.percentual)}
        variante={VARIANTE_BARRA[cobertura.estado]}
        aria-label={`Cobertura de ${nome}`}
        aria-valuetext={frase}
      />

      <p className="text-xs font-semibold text-[var(--text-primary)]">
        {frase}
      </p>

      <p className="text-xs text-[var(--text-secondary)]">
        Prescrição vigente:{" "}
        <strong>{formatarHoras(cobertura.horasAlvo)}</strong> por semana
      </p>

      {avisoSemHoras ? (
        <p className="text-xs text-[var(--text-secondary)]">{avisoSemHoras}</p>
      ) : null}
    </div>
  );
}
