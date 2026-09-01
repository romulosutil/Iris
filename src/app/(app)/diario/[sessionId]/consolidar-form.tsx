"use client";
import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { consolidarSessaoAction, type ConsolidarState } from "./actions";

/**
 * Consolidação da sessão: nota final que dispara a extração de IA e (na
 * primeira consolidação) popula `numeroSequencialPaciente`. Reconsolidar
 * (ex.: corrigir um erro de digitação) não incrementa o número — só
 * regrava o texto e reprocessa a extração.
 */
export function ConsolidarForm({
  sessionId,
  /**
   * R-38: `Consolidar` só habilita quando existe captura. Default `true`
   * preserva o comportamento anterior (usado hoje só por `/diario/[id]`, que
   * não passa esta prop) — a página nova (`/sessoes/[id]`) é quem calcula o
   * valor real a partir da existência de `captura_rapida`.
   */
  podeConsolidar = true,
  motivoBloqueio,
  textoInicial,
  visibilityInicial = "multidisciplinary",
  rotuloSubmit = "Consolidar sessão",
}: {
  sessionId: string;
  podeConsolidar?: boolean;
  /** Texto explicando o que falta — nunca só cinza mudo (R-38). */
  motivoBloqueio?: string;
  /**
   * #513 — nota já consolidada, para corrigi-la sem redigitar. Ausente na
   * primeira consolidação (não há o que pré-popular).
   */
  textoInicial?: string;
  /**
   * #513 — sigilo atual da nota. `consolidarSessaoAction` sempre grava um
   * nível (checkbox ausente ⇒ `multidisciplinary`), então reenviar o form com
   * o checkbox desmarcado REBAIXARIA uma nota `discipline_only` sem avisar.
   * Pré-marcar é o que impede essa perda silenciosa de sigilo.
   */
  visibilityInicial?: "multidisciplinary" | "discipline_only";
  rotuloSubmit?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ConsolidarState,
    FormData
  >(consolidarSessaoAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Field
        label="Nota consolidada"
        htmlFor="texto-consolidado"
        error={state.error}
      >
        <textarea
          id="texto-consolidado"
          name="texto"
          required
          rows={6}
          defaultValue={textoInicial}
          aria-describedby={state.error ? "texto-consolidado-error" : undefined}
          className="font-body focus-visible:outline-focus min-h-32 w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-4 py-2.5 text-base text-[var(--text-primary)] outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
        />
      </Field>
      <label className="font-body flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          name="visibilityLevel"
          value="discipline_only"
          defaultChecked={visibilityInicial === "discipline_only"}
          className="size-4 rounded border-2 border-[var(--border-brutal)] accent-[var(--action-primary)]"
        />
        <span>
          Restringir visualização à minha disciplina (sigilo profissional)
        </span>
      </label>
      <Button type="submit" disabled={pending || !podeConsolidar}>
        {pending ? "Consolidando…" : rotuloSubmit}
      </Button>
      {/* R-38: desabilitado explica o que falta, não fica cinza mudo. */}
      {!podeConsolidar ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {motivoBloqueio ??
            "Registre uma captura (texto ou áudio) antes de consolidar."}
        </p>
      ) : null}
      {/* Sucesso PARCIAL não pode se passar por sucesso: quando a extração da
          IA falha, a nota foi salva mas nenhuma sugestão vai aparecer. Mostrar
          o verde aqui faria o terapeuta esperar por uma análise que nunca vem. */}
      {state.ok && state.aviso ? (
        <Alert severidade="warning" titulo="Nota salva, análise pendente">
          {state.aviso}
        </Alert>
      ) : state.ok ? (
        <Alert severidade="sucesso">
          {typeof state.numero === "number"
            ? `Sessão consolidada — sessão nº ${state.numero} deste paciente.`
            : "Sessão consolidada."}
        </Alert>
      ) : null}
    </form>
  );
}
