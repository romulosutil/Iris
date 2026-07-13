import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack, Split, Cluster } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { control, surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import { listarSessoesDoDia } from "./actions";
import { EstadoBadge } from "./estado-badge";
import { CheckInButton } from "./checkin-button";
import { AgendarForm } from "./agendar-form";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "./fuso";
 
// Link de navegação para o diário da sessão — mesma superfície visual do
// `Button` neutro, mas como `<a>` (a ação é ir para a tela, não disparar uma
// Server Action). Espelha o `acaoClasses` da Fila de Pendências.
const abrirSessaoClasses = cn(
  control("sm"),
  surface("solida"),
  "inline-flex shrink-0 items-center justify-center px-5 py-2.5",
  "bg-surface text-ink-anchor font-display text-base font-semibold",
  "transition-[transform,box-shadow,background-color] duration-100 ease-out",
  "hover:-translate-x-px hover:-translate-y-px",
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
);
 
// Data de hoje (YYYY-MM-DD) no fuso da clínica — base da grade do dia.
function hojeNaClinica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_CLINICA }).format(
    new Date(),
  );
}
 
function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}
 
function dataPorExtenso(diaISO: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${diaISO}T12:00:00${FUSO_CLINICA_OFFSET}`));
}
 
export default async function AgendaPage() {
  const ctx = await getTenantContext();
  const dia = hojeNaClinica();
  const sessoes = await listarSessoesDoDia(ctx, dia);
  const podeAgendar = ctx.role === "coordenador" || ctx.role === "admin_recepcao";
 
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">
          Agenda do dia
        </h1>
        <p className="text-ink text-lg first-letter:uppercase">
          {dataPorExtenso(dia)}
        </p>
      </Stack>
 
      {sessoes.length === 0 ? (
        <Alert severidade="info">Nenhuma sessão na grade de hoje.</Alert>
      ) : (
        <Stack gap="md" como="ul">
          {sessoes.map((s) => (
            <Split
              key={s.id}
              como="li"
              alinha="center"
              className={cn("bg-surface border-2 p-4", surface("solida"))}
            >
              <Stack gap="sm">
                <Cluster gap="sm">
                  <span className="font-display text-ink-anchor text-xl font-bold">
                    {horaDaSessao(s.agendadaPara)}
                  </span>
                  <EstadoBadge estado={s.estado} />
                </Cluster>
                <span className="text-ink text-base">
                  {s.pacienteNome ?? "Paciente (acesso restrito)"}
                  {s.terapeutaNome ? (
                    <span className="text-graphite"> · {s.terapeutaNome}</span>
                  ) : null}
                </span>
              </Stack>
              <Cluster gap="sm">
                {ctx.role === "coordenador" || s.terapeutaId === ctx.userId ? (
                  <Link href={`/diario/${s.id}`} className={abrirSessaoClasses}>
                    Abrir sessão
                  </Link>
                ) : null}
                {s.estado === "agendada" ? (
                  <CheckInButton sessionId={s.id} />
                ) : null}
              </Cluster>
            </Split>
          ))}
        </Stack>
      )}
 
      {podeAgendar ? (
        <Stack gap="md" como="section" aria-labelledby="agendar-titulo">
          <h2
            id="agendar-titulo"
            className="font-display text-ink-anchor text-2xl font-bold"
          >
            Agendar sessão
          </h2>
          <AgendarForm />
        </Stack>
      ) : null}
    </Stack>
  );
}
