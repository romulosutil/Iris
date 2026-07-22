import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack, Cluster } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DataRow } from "@/components/ui/data-row";
import { cn } from "@/lib/cn";
import { listarTerapeutas } from "@/app/(app)/equipe/[id]/queries";
import { listarSessoesDoDia, type SessaoDoDia } from "./actions";
import { pendentesDeConsolidacao, reposicoesPendentes } from "./queries";
import { EstadoBadge } from "./estado-badge";
import { CheckInButton } from "./checkin-button";
import { GerirSessao } from "./gerir-sessao";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "./fuso";

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
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display font-bold text-lg">
            {horaDaSessao(sessao.agendadaPara)}
          </span>
          <EstadoBadge estado={sessao.estado} />
        </Cluster>
      }
      subtitle={
        <span>
          {sessao.pacienteNome ?? "Paciente (acesso restrito)"}
          {sessao.terapeutaNome ? (
            <span className="text-[var(--text-secondary)]"> · {sessao.terapeutaNome}</span>
          ) : null}
        </span>
      }
      trailing={
        tipo === "consolidacao" ? (
          <GerirSessao sessionId={sessao.id} terapeutas={terapeutas} />
        ) : (
          <Link
            href={`/agenda/semana?repor=${sessao.id}&patientId=${sessao.patientId}&terapeutaId=${sessao.terapeutaId}&disciplina=${encodeURIComponent(sessao.disciplina)}`}
          >
            <Button variante="secundaria" tamanho="sm">
              Repor
            </Button>
          </Link>
        )
      }
    />
  );
}

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
      <h2 id={tituloId} className="font-display text-[var(--text-primary)] text-2xl font-bold">
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
    <Stack gap="lg" className="pt-2 md:pt-4">
      <PageHeader
        title="Agenda do dia"
        description={dataPorExtenso(dia)}
      />

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
            <DataRow
              key={s.id}
              como="li"
              className={cn(
                "animate-fade-in-up",
                index === 0 && "animate-delay-75",
                index === 1 && "animate-delay-150",
                index >= 2 && "animate-delay-225"
              )}
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display font-bold text-lg text-[var(--text-primary)]">
                    {horaDaSessao(s.agendadaPara)}
                  </span>
                  <EstadoBadge estado={s.estado} />
                </Cluster>
              }
              subtitle={
                <span>
                  {s.pacienteNome ?? "Paciente (acesso restrito)"}
                  {s.terapeutaNome ? (
                    <span className="text-[var(--text-secondary)]"> · {s.terapeutaNome}</span>
                  ) : null}
                </span>
              }
              trailing={
                <Cluster gap="sm">
                  {ctx.role === "coordenador" || s.terapeutaId === ctx.userId ? (
                    <Link href={`/diario/${s.id}`}>
                      <Button variante="secundaria" tamanho="sm">
                        Abrir sessão
                      </Button>
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
                    >
                      <Button variante="secundaria" tamanho="sm">
                        Repor
                      </Button>
                    </Link>
                  ) : null}
                </Cluster>
              }
            />
          ))}
        </Stack>
      )}

      {podeAgendar ? (
        <div className="animate-fade-in-up animate-delay-225 pt-6 border-t-2 border-dashed border-[var(--border-brutal)]">
          <Link href="/agenda/semana">
            <Button variante="secundaria">
              Agendar no calendário
            </Button>
          </Link>
        </div>
      ) : null}
    </Stack>
  );
}
