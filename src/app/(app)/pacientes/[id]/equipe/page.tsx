import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import {
  careTeamMembership,
  appUser,
  userRole,
  patientAlvoDisciplina,
} from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras, papelConsomeSaldo } from "@/lib/horas";
import { encerrarVinculoAction } from "./actions";
import { calcularCobertura, chaveDisciplina } from "./cobertura";
import {
  AdicionarMembroForm,
  type DisciplinaComSaldo,
  type ProfissionalOpcao,
} from "./adicionar-membro-form";
import { EditarMembroForm } from "./editar-membro-form";

function obterIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "??";
  const p1 = partes[0] ?? "";
  const p2 = partes[partes.length - 1] ?? "";
  if (partes.length === 1) return p1.substring(0, 2).toUpperCase();
  return (p1.charAt(0) + p2.charAt(0)).toUpperCase();
}

const PAPEL_CONFIG: Record<
  string,
  { label: string; icon: string; badgeStyle: string }
> = {
  coordenador_referencia: {
    label: "Coordenador de Referência",
    icon: "👑",
    badgeStyle:
      "bg-[var(--action-primary)] text-black border-2 border-[var(--border-brutal)] font-bold",
  },
  terapeuta_referencia: {
    label: "Terapeuta de Referência",
    icon: "🩺",
    badgeStyle:
      "bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-brutal)] font-semibold",
  },
  substituto: {
    label: "Aplicador / Substituto",
    icon: "🔄",
    badgeStyle:
      "bg-muted text-[var(--text-secondary)] border border-[var(--border-brutal)]/40",
  },
};

export default async function EquipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();

  const { equipe, profissionaisClinica, alvosCarga } = await withTenant(
    ctx,
    async (tx) => {
      // Query membros ativos e históricos da equipe do paciente com dados de usuário
      const membros = await tx
        .select({
          id: careTeamMembership.id,
          patientId: careTeamMembership.patientId,
          userId: careTeamMembership.userId,
          disciplina: careTeamMembership.disciplina,
          papelNaEquipe: careTeamMembership.papelNaEquipe,
          horasSemana: careTeamMembership.horasSemana,
          vigenciaInicio: careTeamMembership.vigenciaInicio,
          vigenciaFim: careTeamMembership.vigenciaFim,
          responsavelTecnicoId: careTeamMembership.responsavelTecnicoId,
          usuarioNome: appUser.name,
          usuarioEmail: appUser.email,
          usuarioConselho: appUser.conselho,
          usuarioRegistroNumero: appUser.registroNumero,
          usuarioRegistroUf: appUser.registroUf,
        })
        .from(careTeamMembership)
        .innerJoin(appUser, eq(careTeamMembership.userId, appUser.id))
        .where(eq(careTeamMembership.patientId, id));

      // Query de todos os profissionais cadastrados na clínica para montar o seletor
      const profissionaisRaw = await tx
        .select({
          id: appUser.id,
          nome: appUser.name,
          email: appUser.email,
          conselho: appUser.conselho,
          registroNumero: appUser.registroNumero,
          papel: userRole.papel,
        })
        .from(userRole)
        .innerJoin(appUser, eq(userRole.userId, appUser.id))
        .where(eq(userRole.clinicId, ctx.clinicId));

      // Prescrições VIGENTES — o teto que a equipe consome. O filtro
      // `vigencia_fim IS NULL` é obrigatório nos dois lados da conta (plano §4.5):
      // somar prescrição encerrada infla o teto e esconde sobrealocação real.
      const alvos = await tx
        .select({
          id: patientAlvoDisciplina.id,
          disciplina: patientAlvoDisciplina.disciplina,
          horasAlvoSemana: patientAlvoDisciplina.horasAlvoSemana,
        })
        .from(patientAlvoDisciplina)
        .where(
          and(
            eq(patientAlvoDisciplina.patientId, id),
            isNull(patientAlvoDisciplina.vigenciaFim),
          ),
        );

      return {
        equipe: membros,
        profissionaisClinica: profissionaisRaw,
        alvosCarga: alvos,
      };
    },
  );

  // Mapear responsáveis técnicos por ID para busca rápida na lista de membros
  const usuariosMap = new Map<string, string>();
  profissionaisClinica.forEach((p) => usuariosMap.set(p.id, p.nome));

  // Deduplicar lista de profissionais para o formulário
  const profissionaisUnicosMap = new Map<string, ProfissionalOpcao>();
  profissionaisClinica.forEach((p) => {
    if (!profissionaisUnicosMap.has(p.id)) {
      profissionaisUnicosMap.set(p.id, {
        id: p.id,
        nome: p.nome,
        email: p.email,
        conselho: p.conselho ?? undefined,
        registroNumero: p.registroNumero ?? undefined,
        papel: p.papel,
      });
    }
  });
  const listaProfissionais = Array.from(profissionaisUnicosMap.values());

  const membrosAtivos = equipe.filter((m) => !m.vigenciaFim);
  const membrosEncerrados = equipe.filter((m) => !!m.vigenciaFim);

  // Cobertura calculada só sobre VIGENTES — sobrealocação é estado derivado,
  // nunca coluna persistida (plano §MV4).
  const cobertura = calcularCobertura(alvosCarga, membrosAtivos);
  const disciplinasComSaldo: DisciplinaComSaldo[] = cobertura.map((c) => ({
    disciplina: c.disciplina,
    horasAlvo: c.horasAlvo,
    horasRestantes: c.horasRestantes,
  }));

  const temPrescricao = alvosCarga.length > 0;
  const prescritas = new Set(
    alvosCarga.map((a) => chaveDisciplina(a.disciplina)),
  );

  // Três blocos, porque três coisas diferentes: quem entrega a carga, quem faz
  // gestão do caso (D-C, fora da conta), e o legado alocado numa disciplina que
  // não está prescrita hoje — que sem bloco próprio aparece no meio dos outros,
  // não soma em barra nenhuma, e o coordenador não entende por quê (§3.1).
  const gestaoDoCaso = membrosAtivos.filter(
    (m) => !papelConsomeSaldo(m.papelNaEquipe),
  );
  const consomem = membrosAtivos.filter((m) =>
    papelConsomeSaldo(m.papelNaEquipe),
  );
  const dentroDaPrescricao = consomem.filter((m) =>
    prescritas.has(chaveDisciplina(m.disciplina)),
  );
  const foraDaPrescricao = consomem.filter(
    (m) => !prescritas.has(chaveDisciplina(m.disciplina)),
  );

  const podeEditar = ctx.role === "coordenador";

  function CartaoMembro({
    m,
    mostrarHoras = true,
  }: {
    m: (typeof membrosAtivos)[number];
    mostrarHoras?: boolean;
  }) {
    const papelInfo = PAPEL_CONFIG[m.papelNaEquipe] ?? {
      label: m.papelNaEquipe,
      icon: "👤",
      badgeStyle: "bg-muted text-[var(--text-primary)]",
    };
    const supervisorNome = m.responsavelTecnicoId
      ? usuariosMap.get(m.responsavelTecnicoId)
      : null;
    // Vínculo legado sem carga registrada é DÍVIDA VISÍVEL, não linha
    // silenciosa: sem este chip, a barra mostraria 8h/20h enquanto cinco
    // terapeutas atendem, e o número mentiria sem que ninguém percebesse.
    const semHoras = mostrarHoras && m.horasSemana === null;

    return (
      <div className="flex flex-col justify-between gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow-sm)]">
        <div className="flex items-start gap-3.5">
          <Avatar className="size-12 shrink-0 border-2 border-[var(--border-brutal)]">
            <AvatarFallback>{obterIniciais(m.usuarioNome)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display truncate text-base font-bold text-[var(--text-primary)]">
                {m.usuarioNome}
              </h3>
              <span
                className={`flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-0.5 text-xs tracking-wide ${papelInfo.badgeStyle}`}
              >
                <span>{papelInfo.icon}</span> {papelInfo.label}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>
                <strong>Disciplina:</strong> {formatarDisciplina(m.disciplina)}
              </span>
              {mostrarHoras ? (
                semHoras ? (
                  <span className="rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/40 bg-amber-100 px-1.5 font-bold text-[var(--text-primary)]">
                    ⚠️ Horas não definidas
                  </span>
                ) : (
                  <span>
                    · <strong>Carga:</strong> {formatarHoras(m.horasSemana)}
                    /semana
                  </span>
                )
              ) : null}
              {m.usuarioConselho && m.usuarioRegistroNumero ? (
                <span>
                  · <strong>{m.usuarioConselho}:</strong>{" "}
                  {m.usuarioRegistroNumero}
                  {m.usuarioRegistroUf ? `/${m.usuarioRegistroUf}` : ""}
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Vigência desde <strong>{m.vigenciaInicio}</strong>
            </p>

            {supervisorNome ? (
              <p className="mt-1 rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/20 bg-[var(--surface-elevated)] p-1.5 text-xs text-[var(--text-secondary)]">
                👤 <strong>Supervisor Técnico:</strong> {supervisorNome}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-brutal)]/20 pt-3">
          <Button asChild variante="secundaria" tamanho="sm">
            <Link
              href={`/agenda/semana?patientId=${id}&terapeutaId=${m.userId}&disciplina=${encodeURIComponent(m.disciplina)}`}
            >
              📅 Agendar Sessões
            </Link>
          </Button>

          {podeEditar ? (
            <div className="flex items-center gap-2">
              <EditarMembroForm
                patientId={id}
                membershipId={m.id}
                nomeProfissional={m.usuarioNome}
                disciplinaAtual={m.disciplina}
                papelAtual={m.papelNaEquipe}
                horasAtuais={m.horasSemana}
                disciplinasPrescritas={disciplinasComSaldo}
              />
              <form action={encerrarVinculoAction.bind(null, m.id)}>
                <Button type="submit" risco="alto" tamanho="sm">
                  Encerrar vínculo
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header da Página */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
          Equipe de Cuidado
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Profissionais da saúde vinculados ao acompanhamento clínico deste
          paciente.
        </p>
      </div>

      {/* MV2 — sem prescrição não há teto, então não há o que alocar. Estado
          vazio DIRECIONADO: o formulário fica OCULTO, não desabilitado.
          Formulário desabilitado sem explicação é o pior dos dois mundos —
          ocupa espaço e não diz o que fazer. */}
      {!temPrescricao ? (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-control)] border-2 border-dashed border-[var(--border-brutal)] bg-[var(--surface-card)] p-8">
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            Nenhuma disciplina prescrita ainda.
          </h2>
          <p className="max-w-xl text-sm text-[var(--text-secondary)]">
            A equipe é montada dentro da carga horária prescrita para cada
            disciplina. Prescreva Disciplina + horas semanais na ficha clínica
            para poder vincular profissionais.
          </p>
          <Button asChild>
            <Link href={`/pacientes/${id}/cadastro-clinico#prescricao`}>
              Ir para a prescrição →
            </Link>
          </Button>
        </div>
      ) : (
        /* Resumo de consumo por disciplina. A barra de cobertura com os 4
           estados, a11y e copy final é a fatia 5 — aqui já se lê o número certo,
           calculado pelo MESMO `calcularCobertura` que a fatia 5 vai renderizar,
           para tela e validação nunca discordarem sobre o mesmo saldo. */
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <span>🎯</span> Carga prescrita e cobertura
            </h2>
            <span className="text-xs text-[var(--text-secondary)]">
              {cobertura.length} disciplina(s) prescrita(s)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {cobertura.map((c) => (
              <div
                key={c.disciplina}
                className="flex flex-col gap-1.5 rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/30 bg-[var(--surface-elevated)] p-3"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {formatarDisciplina(c.disciplina)}
                  </span>
                  <span className="rounded bg-[var(--action-primary)] px-2 py-0.5 text-xs font-semibold text-black">
                    {formatarHoras(c.horasAlvo)}/sem
                  </span>
                </div>

                {/* Estado sempre por extenso, nunca só por cor (a11y é
                    requisito do produto, não polimento). */}
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  {c.estado === "vazio"
                    ? `${formatarHoras(0)} de ${formatarHoras(c.horasAlvo)} alocadas — nenhum terapeuta vinculado`
                    : c.estado === "completa"
                      ? `${formatarHoras(c.horasAlocadas)} de ${formatarHoras(c.horasAlvo)} alocadas — cobertura completa`
                      : c.estado === "sobrealocada"
                        ? `${formatarHoras(c.horasAlocadas)} de ${formatarHoras(c.horasAlvo)} alocadas (${c.percentual}%) — sobrealocação de ${formatarHoras(c.horasExcedentes)}`
                        : `${formatarHoras(c.horasAlocadas)} de ${formatarHoras(c.horasAlvo)} alocadas (${c.percentual}%) — restam ${formatarHoras(c.horasRestantes)}`}
                </p>

                {c.vinculosSemHoras > 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {c.vinculosSemHoras} vínculo(s) sem horas definidas — a
                    conta acima está incompleta até você defini-las.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profissionais que ENTREGAM a carga prescrita */}
      <div className="flex flex-col gap-4">
        <h2 className="font-display flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
          <span>👥</span> Profissionais Ativos ({dentroDaPrescricao.length})
        </h2>

        {dentroDaPrescricao.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-dashed border-[var(--border-brutal)]/40 bg-[var(--surface-card)] p-8 text-center">
            <span className="text-3xl">📋</span>
            <p className="font-display text-base font-semibold text-[var(--text-primary)]">
              Nenhum profissional vinculado a este paciente ainda.
            </p>
            <p className="max-w-md text-xs text-[var(--text-secondary)]">
              {temPrescricao
                ? "Adicione o primeiro terapeuta abaixo para consumir a carga prescrita e conceder acesso ao prontuário."
                : "Prescreva as disciplinas antes de montar a equipe."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {dentroDaPrescricao.map((m) => (
              <CartaoMembro key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>

      {/* D-C: gestão do caso fica FORA da conta de cobertura. Bloco próprio, e
          nunca uma linha "0h" no meio dos terapeutas, que pareceria erro. */}
      {gestaoDoCaso.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
              <span>👑</span> Gestão do caso ({gestaoDoCaso.length})
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Supervisão do caso não é carga clínica prescrita e não entra na
              conta de cobertura. Quem também atende tem um segundo vínculo como
              terapeuta de referência.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {gestaoDoCaso.map((m) => (
              <CartaoMembro key={m.id} m={m} mostrarHoras={false} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Legado: vínculo vigente numa disciplina que não está prescrita hoje. */}
      {foraDaPrescricao.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
              <span>⚠️</span> Fora da prescrição atual (
              {foraDaPrescricao.length})
            </h2>
            <p className="max-w-2xl text-xs text-[var(--text-secondary)]">
              Estes vínculos não consomem carga prescrita e não aparecem em
              nenhuma barra de cobertura. Prescreva a disciplina para incluí-los
              no cálculo, ou encerre o vínculo.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {foraDaPrescricao.map((m) => (
              <CartaoMembro key={m.id} m={m} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Membros com Vínculo Encerrado (Histórico) */}
      {membrosEncerrados.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-display flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
            <span>📜</span> Histórico de Vínculos Encerrados (
            {membrosEncerrados.length})
          </h3>
          <div className="flex flex-col gap-2">
            {membrosEncerrados.map((m) => (
              <div
                key={m.id}
                className="bg-muted/40 flex items-center justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--border-brutal)]/30 p-3 text-xs text-[var(--text-secondary)]"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {m.usuarioNome}
                  </span>
                  <span>({formatarDisciplina(m.disciplina)})</span>
                </div>
                <div>
                  Vigência: {m.vigenciaInicio} até{" "}
                  <strong>{m.vigenciaFim}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Formulário só existe quando há teto para consumir (MV2). */}
      {podeEditar && temPrescricao ? (
        <AdicionarMembroForm
          patientId={id}
          profissionais={listaProfissionais}
          disciplinasPrescritas={disciplinasComSaldo}
        />
      ) : null}
    </div>
  );
}
