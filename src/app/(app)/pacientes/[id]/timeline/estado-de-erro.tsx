"use client";

import { Button } from "@/components/ui/button";

/**
 * Falha de carregamento na aba Evolução, dita como falha.
 *
 * Existe porque os três `catch` desta superfície caíam no `setState(null/[])` e
 * a tela então renderizava o EMPTY STATE correspondente — "Nenhuma alteração
 * clínica registrada nesta sessão", "Nenhuma evidência registrada para este
 * trecho". Uma oscilação de rede no corredor da clínica virava uma afirmação
 * clínica de que o paciente não evoluiu, e o coordenador que valida por exceção
 * passava direto por um trecho que nunca chegou a carregar.
 *
 * Regra que este componente carrega: **ausência de dado e ausência de resposta
 * nunca compartilham o mesmo componente.** Empty state afirma um fato ("não há
 * nada registrado"); este afirma o oposto ("não sabemos, e por isso não vamos
 * dizer nada sobre o paciente").
 *
 * `role="status"` (não `role="alert"`): neste produto a semântica que
 * interrompe o leitor de tela é reservada ao risco clínico — mesma decisão do
 * aviso de conta em somente-leitura em `../layout.tsx` e da `FaixaTrial`. Falha
 * de carregamento precisa ser anunciada, não precisa interromper.
 */
export function EstadoDeErro({
  titulo,
  descricao,
  onTentarDeNovo,
}: {
  titulo: string;
  descricao: string;
  onTentarDeNovo: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-[var(--status-error-fg)] shadow-[var(--ds-shadow)]"
    >
      <div className="flex items-start gap-3">
        {/* Ícone estático + texto: o significado nunca depende só da cor. */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="mt-0.5 shrink-0"
        >
          <path
            d="M10 4v8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="square"
          />
          <circle cx="10" cy="15.5" r="1.5" fill="currentColor" />
        </svg>
        <div className="flex flex-col gap-1">
          <p className="font-display text-sm font-bold">{titulo}</p>
          <p className="text-xs font-medium">{descricao}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variante="secundaria" tamanho="sm" onClick={onTentarDeNovo}>
          Tentar de novo
        </Button>
      </div>
    </div>
  );
}
