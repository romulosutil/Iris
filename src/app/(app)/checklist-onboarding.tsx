"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PASSOS_ONBOARDING, type PassoId } from "@/lib/onboarding/passos";
import type { ProgressoOnboarding } from "./onboarding-queries";

function chave(clinicId: string): string {
  return `iris:onboarding-pulados:${clinicId}`;
}

/**
 * O "agora não" mora fora do React (`localStorage`), então quem o lê é
 * `useSyncExternalStore`: ele resolve sozinho o par servidor/cliente que um
 * `useState` + efeito não resolve — no servidor não existe `localStorage`, e
 * ler na primeira renderização do cliente faria o HTML divergir.
 */
const ouvintes = new Set<() => void>();

function assinar(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  // Outra aba da mesma clínica pulando um passo também conta.
  window.addEventListener("storage", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

/**
 * Devolve a STRING crua, e não o array parseado: `getSnapshot` tem de ser
 * referencialmente estável entre chamadas, e um `JSON.parse` novo a cada leitura
 * devolveria um objeto diferente e giraria em laço infinito.
 *
 * Em `try/catch` porque em janela privada ou com dados de site bloqueados o
 * próprio acessor LANÇA — e uma exceção aqui derrubaria a `/agenda` inteira por
 * causa de uma conveniência de leitura.
 */
function lerCru(clinicId: string): string | null {
  try {
    return localStorage.getItem(chave(clinicId));
  } catch {
    return null;
  }
}

function decodificar(cru: string | null): PassoId[] {
  if (!cru) return [];
  try {
    const lista: unknown = JSON.parse(cru);
    if (!Array.isArray(lista)) return [];
    return lista.filter((x): x is PassoId =>
      PASSOS_ONBOARDING.some((p) => p.id === x),
    );
  } catch {
    return [];
  }
}

function gravarPulados(clinicId: string, pulados: PassoId[]): void {
  try {
    localStorage.setItem(chave(clinicId), JSON.stringify(pulados));
  } catch {
    // Sem persistir, o item volta no próximo carregamento. Voltar é o
    // comportamento correto: o passo continua realmente pendente.
  }
  for (const aoMudar of ouvintes) aoMudar();
}

export interface ChecklistOnboardingProps {
  progresso: ProgressoOnboarding;
  /** Escopo do "agora não": o mesmo navegador atende mais de uma clínica. */
  clinicId: string;
}

/**
 * Checklist de onboarding (#36, blocos D3 e D4).
 *
 * Some quando não há nada pendente — seja porque tudo foi concluído de verdade,
 * seja porque o que sobrou foi pulado. Não é bloqueante: o guardrail 1 da #36
 * proíbe travar a app antes do fim do trial.
 */
export function ChecklistOnboarding({
  progresso,
  clinicId,
}: ChecklistOnboardingProps) {
  const cru = useSyncExternalStore(
    assinar,
    () => lerCru(clinicId),
    // Snapshot do servidor: lá não há navegador, e nada foi pulado.
    () => null,
  );
  const pulados = useMemo(() => decodificar(cru), [cru]);

  // Pulado some da lista; concluído FICA, marcado — é o que dá ao coordenador
  // a sensação de progresso em vez de uma lista que só encurta.
  const visiveis = PASSOS_ONBOARDING.filter((p) => !pulados.includes(p.id));

  const restaAlgo = visiveis.some((p) => !progresso[p.id]);
  if (!restaAlgo) return null;

  function pular(id: PassoId) {
    gravarPulados(clinicId, [...pulados, id]);
  }

  const concluidos = visiveis.filter((p) => progresso[p.id]).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          Primeiros passos
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {concluidos} de {visiveis.length} concluídos. Configurar a clínica, a
          equipe e a agenda é gratuito.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {visiveis.map((passo) => {
          const concluido = progresso[passo.id];
          return (
            <li
              key={passo.id}
              data-concluido={concluido ? "true" : "false"}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-brutal)]/40 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={passo.rota}
                  className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
                >
                  {passo.titulo}
                </Link>
                <span className="text-sm text-[var(--text-secondary)]">
                  {passo.descricao}
                </span>
              </div>
              {concluido ? (
                <span className="font-mono text-xs font-semibold tracking-wide text-[var(--status-success-fg)] uppercase">
                  Concluído
                </span>
              ) : (
                <Button
                  variante="terciaria"
                  onClick={() => pular(passo.id)}
                  aria-label={`Agora não: ${passo.titulo}`}
                >
                  Agora não
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
