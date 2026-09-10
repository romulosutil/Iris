import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import type { PacienteListItem } from "./queries";

function formatarNascimento(nascimento: string): string {
  return new Date(nascimento + "T00:00:00").toLocaleDateString("pt-BR");
}

export function ListaPacientes({
  pacientes,
}: {
  pacientes: PacienteListItem[];
}) {
  if (pacientes.length === 0) {
    return <Alert severidade="info">Nenhum paciente cadastrado ainda.</Alert>;
  }
  return (
    <DataList como="ul" aria-label="Pacientes da clínica">
      {pacientes.map((p) => {
        // Convênio, contato e nascimento eram um "Ver convênio e contato"
        // recolhido por linha: um clique por paciente para ler três palavras.
        // Na linha densa cabem inline, na coluna de detalhe.
        const detalhes = [
          p.convenio ? `Convênio ${p.convenio}` : null,
          p.responsavelContato ? `Contato ${p.responsavelContato}` : null,
          p.nascimento ? `Nasc. ${formatarNascimento(p.nascimento)}` : null,
        ].filter((d): d is string => d !== null);

        return (
          <DataListRow
            key={p.id}
            titulo={p.nome}
            detalhe={detalhes.length > 0 ? detalhes.join(" · ") : undefined}
            estado={
              <span className="flex flex-wrap items-center gap-1.5">
                {/* #174 — o selo dizia "Ativo" para todo mundo, inclusive
                    para quem já tinha saído da contagem de pacientes ativos
                    da fatura (manualmente ou pela régua de 90 dias). Era a
                    única tela onde esse estado poderia aparecer, e mentia.
                    Arquivado NÃO some da lista: continua legível e
                    exportável, só sinalizado. */}
                <StatusBadge variante={p.arquivadoEm ? "neutral" : "success"}>
                  {p.arquivadoEm ? "Arquivado" : "Ativo"}
                </StatusBadge>
                {/* Handoff 1 (#203): sem prescrição vigente o paciente não
                    pode receber equipe. O selo existe para que esse estado
                    incompleto não fique invisível para quem cadastrou e saiu
                    da tela — o texto carrega o estado, a cor só reforça. */}
                {p.temPrescricao ? null : (
                  <span className="rounded-[var(--radius-pill)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--status-warning-fg)] uppercase">
                    Sem prescrição
                  </span>
                )}
                {/* Escada de prontidão (#512/#530): próximo degrau da fila
                    de admissão, visível sem abrir o prontuário. Some
                    sozinho quando `proximoPasso` é `null` — prontuário
                    pronto (nada a fazer) ou papel sem leitura clínica
                    (`montarProntidao` já devolve `proximo: null` para a
                    recepção). O texto carrega o estado, a cor só reforça —
                    mesma regra do selo vizinho. */}
                {p.proximoPasso ? (
                  <span
                    data-testid="pill-prontidao"
                    className="rounded-[var(--radius-pill)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--status-warning-fg)] uppercase"
                  >
                    {p.proximoPasso}
                  </span>
                ) : null}
              </span>
            }
            acoes={
              <Button variante="terciaria" tamanho="sm" asChild>
                <Link
                  href={`/pacientes/${p.id}`}
                  aria-label={`Ver prontuário de ${p.nome}`}
                >
                  Ver Prontuário &rarr;
                </Link>
              </Button>
            }
          />
        );
      })}
    </DataList>
  );
}
