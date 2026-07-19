import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack, Split, Cluster } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { control, surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import { listarTerapeutas } from "@/app/(app)/equipe/[id]/queries";
import { listarSessoesDoDia, type SessaoDoDia } from "./actions";
import { pendentesDeConsolidacao, reposicoesPendentes } from "./queries";
import { EstadoBadge } from "./estado-badge";
import { CheckInButton } from "./checkin-button";
import { GerirSessao } from "./gerir-sessao";
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
  "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-hover",
  "active:translate-x-0 active:translate-y-0 active:shadow-none",
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

type TipoPendencia = "consolidacao" | "reposicao";

// Card de item de uma lista de pendências — mesma superfície visual do item
// da grade do dia (Split + surface("solida")), só troca a ação conforme o
// tipo: consolidação abre o `GerirSessao`, reposição vai pro prefill de
// `/agenda/semana`. Exportado (não default) só para o teste de a11y
// exercitar isoladamente — segue local a este arquivo por decisão do Task 9.
export function ItemPendencia({
  sessao,
  tipo,
  terapeutas,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
}) {
  return (
    <Split
      como="li"
      alinha="center"
      className={cn("bg-surface p-4", surface("solida"))}
    >
      <Stack gap="sm">
        <Cluster gap="sm">
          <span className="font-display text-ink-anchor text-xl font-bold">
            {horaDaSessao(sessao.agendadaPara)}
          </span>
          <EstadoBadge estado={sessao.estado} />
        </Cluster>
        <span className="text-ink text-base">
          {sessao.pacienteNome ?? "Paciente (acesso restrito)"}
          {sessao.terapeutaNome ? (
            <span className="text-graphite"> · {sessao.terapeutaNome}</span>
          ) : null}
        </span>
      </Stack>
      <Cluster gap="sm">
        {tipo === "consolidacao" ? (
          <GerirSessao sessionId={sessao.id} terapeutas={terapeutas} />
        ) : (
          <Link
            href={`/agenda/semana?repor=${sessao.id}&patientId=${sessao.patientId}&terapeutaId=${sessao.terapeutaId}&disciplina=${encodeURIComponent(sessao.disciplina)}`}
            className={abrirSessaoClasses}
          >
            Repor
          </Link>
        )}
      </Cluster>
    </Split>
  );
}

// Vazio → nada renderizado (sem Alert de "lista vazia" — polui uma grade que
// já tem seu próprio estado vazio para "Agenda do dia").
export function SecaoPendencias({
  tituloId,
  titulo,
  itens,
  tipo,
  terapeutas,
}: {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
}) {
  if (itens.length === 0) return null;
  return (
    <Stack como="section" gap="sm" aria-labelledby={tituloId} className="animate-fade-in-up">
      <h2 id={tituloId} className="font-display text-ink-anchor text-2xl font-bold">
        {titulo}
      </h2>
      <Stack gap="md" como="ul">
        {itens.map((s) => (
          <ItemPendencia key={s.id} sessao={s} tipo={tipo} terapeutas={terapeutas} />
        ))}
      </Stack>
    </Stack>
  );
}

export default async function AgendaPage() {
  const ctx = await getTenantContext();
  const dia = hojeNaClinica();
  const podeAgendar = ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const podeGerir = ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const [sessoes, terapeutasRaw, pendentesConsolidacao, pendentesReposicao] =
    await Promise.all([
      listarSessoesDoDia(ctx, dia),
      listarTerapeutas(ctx),
      podeGerir ? pendentesDeConsolidacao(ctx) : Promise.resolve([]),
      podeGerir ? reposicoesPendentes(ctx) : Promise.resolve([]),
    ]);
  const terapeutas = terapeutasRaw.map((t) => ({ id: t.id, nome: t.name ?? "—" }));

  return (
    <Stack gap="lg" className="pt-4 md:pt-8">
      <Stack gap="sm" className="animate-fade-in-up pb-2 md:pb-4">
        <h1 className="font-display text-ink-anchor text-4xl font-bold tracking-tight md:text-5xl">
          Agenda do dia
        </h1>
        <p className="text-ink text-lg first-letter:uppercase">
          {dataPorExtenso(dia)}
        </p>
      </Stack>

      <SecaoPendencias
        tituloId="pendentes-consolidacao-titulo"
        titulo="Pendentes de consolidação"
        itens={pendentesConsolidacao}
        tipo="consolidacao"
        terapeutas={terapeutas}
      />

      <SecaoPendencias
        tituloId="reposicoes-pendentes-titulo"
        titulo="Reposições pendentes"
        itens={pendentesReposicao}
        tipo="reposicao"
        terapeutas={terapeutas}
      />

      {sessoes.length === 0 ? (
        <Stack className="animate-fade-in-up animate-delay-75 py-4 md:py-8">
          <Alert severidade="info" destacado>
            Nenhuma sessão na grade de hoje.
          </Alert>
        </Stack>
      ) : (
        <Stack gap="md" como="ul">
          {sessoes.map((s, index) => (
            <Split
              key={s.id}
              como="li"
              alinha="center"
              className={cn(
                "bg-surface p-4 animate-fade-in-up",
                surface("solida"),
                index === 0 && "animate-delay-75",
                index === 1 && "animate-delay-150",
                index >= 2 && "animate-delay-225"
              )}
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
                {s.estado === "agendada" &&
                (podeGerir || s.terapeutaId === ctx.userId) ? (
                  <GerirSessao sessionId={s.id} terapeutas={terapeutas} />
                ) : null}
                {(s.estado === "falta_paciente" || s.estado === "falta_terapeuta") &&
                podeGerir ? (
                  <Link
                    href={`/agenda/semana?repor=${s.id}&patientId=${s.patientId}&terapeutaId=${s.terapeutaId}&disciplina=${encodeURIComponent(s.disciplina)}`}
                    className={abrirSessaoClasses}
                  >
                    Repor
                  </Link>
                ) : null}
              </Cluster>
            </Split>
          ))}
        </Stack>
      )}
 
      {podeAgendar ? (
        <div className="animate-fade-in-up animate-delay-225 pt-6 border-t-2 border-dashed border-graphite">
          <Link href="/agenda/semana" className={abrirSessaoClasses}>
            Agendar no calendário
          </Link>
        </div>
      ) : null}
    </Stack>
  );
}
