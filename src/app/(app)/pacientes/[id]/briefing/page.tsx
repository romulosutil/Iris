import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { control, surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "../../../agenda/fuso";
import { carregarBriefing } from "./queries";
import { UltimaSessaoSection } from "./ultima-sessao";
import { AlertaManejoBanner } from "./alerta-manejo";
import { ReforcadoresAtuaisSection } from "./reforcadores";

// CTA primário "Iniciar sessão" — mesma superfície do Button `primaria`
// (fill ouro, sombra que levanta), como <a> porque a ação é navegar para o
// diário da sessão, não disparar uma Server Action (mesmo padrão do
// `abrirSessaoClasses` da Agenda).
const iniciarSessaoClasses = cn(
  control("md"),
  surface("solida"),
  "inline-flex w-full items-center justify-center px-6 py-3 sm:w-auto",
  "bg-brand-primary text-brand-primary-text font-display text-lg font-semibold",
  "transition-[transform,box-shadow,background-color] duration-100 ease-out",
  "hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-hover",
  "active:translate-x-0 active:translate-y-0 active:shadow-none",
  "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
);

function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

function dataDaSessao(quando: Date): string {
  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_CLINICA }).format(new Date());
  const sessaoISO = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_CLINICA }).format(quando);
  if (sessaoISO === hojeISO) return `hoje ${horaDaSessao(quando)}`;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    day: "2-digit",
    month: "long",
  }).format(quando) + ` · ${horaDaSessao(quando)}`;
}

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();
  try {
    // Mesma barreira de `metas/page.tsx`: recepção não vê dado clínico — o
    // RLS já bloqueia a leitura, isto evita renderizar a casca da tela.
    requireRole(ctx, "coordenador", "terapeuta");
  } catch {
    notFound();
  }

  const dados = await carregarBriefing(ctx, id);
  if (!dados) notFound();

  const { paciente, proximaSessao, ultimaSessao, metasAtivas, alertasManejo, reforcadoresAtuais } =
    dados;

  return (
    <Stack gap="lg" className="pb-24">
      <header className="flex flex-col gap-1">
        <Link
          href="/agenda"
          className="text-text-body focus-visible:outline-focus outline-none w-fit text-sm hover:underline focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
        >
          ← Agenda
        </Link>
        <h1 className="font-display text-text-heading text-3xl font-bold">
          {proximaSessao?.numeroSequencial
            ? `Sessão ${proximaSessao.numeroSequencial}`
            : "Briefing"}{" "}
          · {paciente.nome}
        </h1>
        <p className="text-text-body text-sm">
          {proximaSessao
            ? dataDaSessao(proximaSessao.agendadaPara)
            : "Nenhuma sessão agendada para este paciente."}
        </p>
      </header>

      {/* Título de seção h2 sempre FORA do Card: `Card.titulo` já renderiza um
          h3 interno (rótulo do cartão) — colocar o h2 da página dentro dele
          aninharia heading em heading (classe de bug já corrigida em outras
          telas do repo, ver commit "resolve heading aninhado"). */}
      <section aria-labelledby="briefing-ultima-sessao">
        <h2 id="briefing-ultima-sessao" className="font-display text-text-heading mb-2 text-xl font-semibold">
          Última sessão{ultimaSessao ? ` (sessão ${ultimaSessao.sessionNumero})` : ""}
        </h2>
        <Card>
          <UltimaSessaoSection ultimaSessao={ultimaSessao} />
        </Card>
      </section>

      <section aria-labelledby="briefing-metas">
        <h2 id="briefing-metas" className="font-display text-text-heading mb-2 text-xl font-semibold">
          Metas de hoje {metasAtivas.length > 0 ? `(${metasAtivas.length} ativas)` : ""}
        </h2>
        <Card>
          {metasAtivas.length === 0 ? (
            <p className="text-text-body text-sm">Nenhuma meta ativa registrada.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {metasAtivas.map((m) => (
                <li key={m.id} className="text-text-body text-sm">
                  {m.descricao}
                  {m.disciplina ? ` · ${m.disciplina}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Alerta de manejo: isolado do resto (Banner, não Card) — não é
          histórico comum, é o que evita o pior desfecho da sessão. */}
      <AlertaManejoBanner alertas={alertasManejo} />

      <section aria-labelledby="briefing-reforcadores">
        <h2 id="briefing-reforcadores" className="font-display text-text-heading mb-2 text-xl font-semibold">
          Reforçadores atuais
        </h2>
        <Card>
          <ReforcadoresAtuaisSection itens={reforcadoresAtuais} />
        </Card>
      </section>

      <div className="flex justify-center pt-4">
        {proximaSessao ? (
          <Link href={`/diario/${proximaSessao.id}`} className={iniciarSessaoClasses}>
            Iniciar sessão
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={cn(iniciarSessaoClasses, "pointer-events-none opacity-50")}
          >
            Iniciar sessão
          </span>
        )}
      </div>
    </Stack>
  );
}
