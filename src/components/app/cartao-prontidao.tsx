import Link from "next/link";
import { surface } from "@/components/ui/primitives/surface";
import { Button } from "@/components/ui/button";
import type { EstadoDegrau, Prontidao } from "@/lib/patient/prontidao";

/**
 * Cartão da escada de prontidão (#512-família — mesmo padrão que a sessão já
 * aplica: o registro sabe o próprio estado e nomeia o gesto seguinte).
 *
 * UM gesto primário, nunca dois: a escada inteira aparece como texto, mas só
 * `proximo` vira `Button`. Dois botões de mesmo peso devolveriam ao usuário a
 * carga cognitiva que esta escada existe para tirar — "qual eu clico
 * primeiro?" é a pergunta que o cartão teria que responder de novo.
 *
 * Some inteiro quando não há nada a fazer: `proximo === null` quer dizer
 * prontuário pronto, e um cartão vazio ainda ocupa altura de scroll e atenção
 * — "nada a fazer" tem de ocupar zero pixels, não uma caixa dizendo isso.
 *
 * NÃO USAR `<Card>` AQUI — e não "consertar" de volta. `Card` monta o
 * `badgeNode` numa cadeia if/else SEM ramo "sem selo": tudo que não é
 * `suggestion`/`sugerida`/`candidato`/`candidata` cai no `else` final e ganha um
 * `Pill` menta sólido escrito "Conquistado ✓", renderizado incondicionalmente
 * (independe de `titulo`). Num cartão cuja mensagem inteira é "falta protocolo
 * prescrito e meta ativa", esse selo afirma o oposto do conteúdo — exatamente a
 * classe de defeito (tela afirmando o que não é verdade) que esta escada existe
 * para eliminar. Por isso o contêiner é montado aqui, compondo `surface()` — a
 * mesma fonte única de borda/elevação/raio que o `Card` usa por dentro.
 * Coberto pelo teste "não estampa selo de conquista sobre um prontuário
 * incompleto".
 */

const ROTULO_ESTADO: Record<EstadoDegrau, string> = {
  concluido: "Concluído",
  bloqueante: "Obrigatório",
  pendente: "Recomendado",
};

/**
 * Trio bg/fg/border por estado, exatamente como a spec §3.2 fixa
 * (`docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`).
 *
 * `bloqueante` é WARNING, nunca ERROR — e não é preciosismo de paleta: um
 * degrau bloqueante é AUSÊNCIA DE DADO, não erro do operador. Pintar de
 * `error` treinaria a ler a escada inteira como falha de quem está olhando,
 * quando a escada existe para dizer "falta isto, e é assim que se resolve".
 *
 * `concluido` é o único estado que afirma algo feito, e por isso é o único que
 * pode usar o verde do DS. `pendente` é neutro de propósito: ausência não
 * causal não disputa atenção com o degrau que bloqueia.
 */
const TOKENS_ESTADO: Record<EstadoDegrau, string> = {
  concluido:
    "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  bloqueante:
    "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  // `pendente` NÃO pinta fundo, e isso é medição, não gosto: a spec §3.2 fixa
  // `--surface-muted`, mas `--text-secondary` (#71717a) sobre `--surface-muted`
  // (#f1efe9) dá 4.20:1 no tema claro — abaixo do piso AA de 4.5:1, porque o
  // selo é 12px semibold e não conta como texto grande. Sobre o fundo do
  // cartão o MESMO par dá 4.83:1 e passa. O `axe` sob jsdom não checa
  // contraste, então essa reprovação não apareceria em CI. Mantida a intenção
  // da spec (neutro, não disputa atenção); trocado só o portador do neutro.
  pendente: "border-[var(--border-brutal)] text-[var(--text-secondary)]",
};

export interface CartaoProntidaoProps {
  prontidao: Prontidao;
  titulo?: string;
}

export function CartaoProntidao({
  prontidao,
  titulo = "Para este prontuário gerar dados",
}: CartaoProntidaoProps) {
  const { degraus, proximo, quemResolve } = prontidao;

  // Nada a fazer não ocupa pixel: um card vazio ainda cobra scroll e atenção
  // de quem já concluiu a escada.
  if (proximo === null) return null;

  const concluidos = degraus.filter((d) => d.estado === "concluido").length;

  return (
    <div
      className={surface("solida", {
        radius: "control",
        className:
          "flex flex-col gap-4 bg-[var(--surface-card)] p-5 text-[var(--text-primary)]",
      })}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          {titulo}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {concluidos} de {degraus.length} concluídos.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {degraus.map((degrau) => (
          <li
            key={degrau.id}
            data-estado={degrau.estado}
            className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-brutal)]/40 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold text-[var(--text-primary)]">
                {degrau.rotulo}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                {degrau.descricao}
              </span>
            </div>
            {/* Palavra, não só cor: quem não distingue matiz ainda lê o
                estado — regra 3 do redesenho. */}
            <span
              className={`inline-flex shrink-0 items-center rounded-[var(--radius-pill)] border px-2 py-0.5 font-mono text-xs font-semibold tracking-wide uppercase ${TOKENS_ESTADO[degrau.estado]}`}
            >
              {ROTULO_ESTADO[degrau.estado]}
            </span>
          </li>
        ))}
      </ul>

      {proximo.rota ? (
        <Button variante="primaria" asChild>
          <Link href={proximo.rota} data-testid="gesto-primario">
            {proximo.rotulo} →
          </Link>
        </Button>
      ) : (
        // Sem rota, o papel atual não pode agir — nada de link morto que
        // esbarraria no `notFound()` do `requireRole` do destino (regra 2).
        <p className="text-sm text-[var(--text-secondary)]">
          Aguardando {quemResolve}: {proximo.rotulo}.
        </p>
      )}
    </div>
  );
}
