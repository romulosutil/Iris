import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import type { PacienteEstagnado } from "./estagnacao-queries";

export interface BlocoEstagnacaoProps {
  pacientesEstagnados: PacienteEstagnado[];
}

/**
 * T11 (#512) — bloco de estagnação no topo de `/pacientes` (C2,
 * `docs/ux/jornada-sessao-unificada.md:121-125`). Só o ponto de montagem:
 * quem decide QUAIS pacientes entram aqui é `listarPacientesEstagnados`
 * (issue separada, brief §7.3) — hoje sempre vazio, então este bloco nunca
 * aparece. Nada aqui deve depender de "o que é estagnação".
 *
 * Zero pacientes: não renderiza nada (nem estado colapsado), para ser seguro
 * de shipar antes do predicado real existir.
 */
export function BlocoEstagnacao({ pacientesEstagnados }: BlocoEstagnacaoProps) {
  if (pacientesEstagnados.length === 0) return null;

  const quantidade = pacientesEstagnados.length;
  const texto =
    quantidade === 1
      ? "1 paciente com sinal de estagnação"
      : `${quantidade} pacientes com sinal de estagnação`;

  return (
    <Alert severidade="info" titulo={texto}>
      <Link href="/supervisao" className="font-semibold underline">
        Ver em Supervisão & Estagnação
      </Link>
    </Alert>
  );
}
