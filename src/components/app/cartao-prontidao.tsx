import Link from "next/link";
import { Card } from "@/components/ui/card";
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
 */

const ROTULO_ESTADO: Record<EstadoDegrau, string> = {
  concluido: "Concluído",
  bloqueante: "Obrigatório",
  pendente: "Recomendado",
};

const COR_ESTADO: Record<EstadoDegrau, string> = {
  concluido: "text-[var(--status-success-fg)]",
  bloqueante: "text-[var(--status-error-fg)]",
  pendente: "text-[var(--text-secondary)]",
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
    <Card className="flex flex-col gap-4">
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
              className={`font-mono text-xs font-semibold tracking-wide uppercase ${COR_ESTADO[degrau.estado]}`}
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
    </Card>
  );
}
