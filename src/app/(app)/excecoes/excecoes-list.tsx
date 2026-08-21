import Link from "next/link";
import { Stack, Split, Cluster } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewClinicalIllustration } from "@/components/ui/illustrations";
import { cn } from "@/lib/cn";
import type {
  ExtracaoFalha,
  ListaExcecoes,
  RevisaoIncompleta,
} from "./queries";

const linkClasses = cn(
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-5 py-2.5",
  "font-display text-base font-semibold",
  "border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)] border-2 shadow-[var(--ds-shadow)]",
  "transition-[transform,box-shadow] duration-100 ease-out",
  "hover:-translate-x-px hover:-translate-y-px",
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
);

// Idade humana relativa ("há X"). Server-render (sem risco de hydration): a
// página é dinâmica. Referência = agora.
function desde(data: Date | null, agora: number): string {
  if (!data) return "sem data";
  const ms = agora - data.getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "há menos de 1 hora";
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

function LinhaFalha({ item, agora }: { item: ExtracaoFalha; agora: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]">
      <Split alinha="start">
        <Stack gap="sm">
          <span className="inline-flex w-fit items-center border-2 border-[var(--border-brutal)] bg-[var(--color-gold)] px-2 py-0.5 text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase">
            Extração falhou · {desde(item.desdeEm, agora)}
          </span>
          <span className="text-ink text-base">
            {item.pacienteNome ?? "Paciente (acesso restrito)"}
            {item.terapeutaNome ? ` · ${item.terapeutaNome}` : ""}
          </span>
        </Stack>
        <Link href={`/diario/${item.sessionId}`} className={linkClasses}>
          Abrir diário
        </Link>
      </Split>
    </div>
  );
}

function LinhaIncompleta({
  item,
  agora,
}: {
  item: RevisaoIncompleta;
  agora: number;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]">
      <Split alinha="start">
        <Stack gap="sm">
          <Cluster gap="sm">
            <span className="inline-flex items-center border-2 border-[var(--border-brutal)] bg-[var(--color-blue)] px-2 py-0.5 text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase">
              {item.quantidade}{" "}
              {item.quantidade === 1
                ? "sugestão a revisar"
                : "sugestões a revisar"}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              mais antiga {desde(item.maisAntigaEm, agora)}
            </span>
          </Cluster>
          <span className="text-ink text-base">
            {item.pacienteNome ?? "Paciente (acesso restrito)"}
            {item.terapeutaNome ? ` · ${item.terapeutaNome}` : ""}
          </span>
        </Stack>
        <Link href={`/revisao/${item.sessionId}`} className={linkClasses}>
          Ver revisão
        </Link>
      </Split>
    </div>
  );
}

/**
 * Painel de exceções — presentacional. Recebe os dados prontos + o instante de
 * referência (para as idades relativas). O coordenador não revisa nem reprocessa
 * daqui (as ações são do terapeuta dono); esta tela é de VISIBILIDADE: onde a
 * cobrança está represada e há quanto tempo.
 */
export function ExcecoesList({
  extracoesFalhas,
  revisoesIncompletas,
  total,
  agora,
}: ListaExcecoes) {
  if (total === 0) {
    return (
      <EmptyState
        illustration={<ReviewClinicalIllustration size={100} />}
        title="Nenhuma exceção clínica pendente no momento."
        description="Todos os fluxos clínicos e revisões estão em dia na clínica."
        variant="celebration"
      />
    );
  }

  return (
    <>
      {extracoesFalhas.length > 0 ? (
        <Stack gap="md" como="section" aria-labelledby="falhas-titulo">
          <h2
            id="falhas-titulo"
            className="font-display text-2xl font-bold text-[var(--text-primary)]"
          >
            Extrações que falharam
          </h2>
          <Stack gap="md" como="ul">
            {extracoesFalhas.map((item) => (
              <li key={item.sessionId}>
                <LinhaFalha item={item} agora={agora} />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}

      {revisoesIncompletas.length > 0 ? (
        <Stack gap="md" como="section" aria-labelledby="incompletas-titulo">
          <h2
            id="incompletas-titulo"
            className="font-display text-2xl font-bold text-[var(--text-primary)]"
          >
            Revisões represadas
          </h2>
          <Stack gap="md" como="ul">
            {revisoesIncompletas.map((item) => (
              <li key={item.sessionId}>
                <LinhaIncompleta item={item} agora={agora} />
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </>
  );
}
