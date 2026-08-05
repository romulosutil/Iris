import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { careTeamMembership, appUser, userRole, patientAlvoDisciplina } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatarDisciplina } from "@/lib/disciplinas";
import { encerrarVinculoAction } from "./actions";
import { AdicionarMembroForm, type ProfissionalOpcao } from "./adicionar-membro-form";

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
    badgeStyle: "bg-[var(--action-primary)] text-black border-2 border-[var(--border-brutal)] font-bold",
  },
  terapeuta_referencia: {
    label: "Terapeuta de Referência",
    icon: "🩺",
    badgeStyle: "bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-brutal)] font-semibold",
  },
  substituto: {
    label: "Aplicador / Substituto",
    icon: "🔄",
    badgeStyle: "bg-muted text-[var(--text-secondary)] border border-[var(--border-brutal)]/40",
  },
};

export default async function EquipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();

  const { equipe, profissionaisClinica, alvosCarga } = await withTenant(ctx, async (tx) => {
    // Query membros ativos e históricos da equipe do paciente com dados de usuário
    const membros = await tx
      .select({
        id: careTeamMembership.id,
        patientId: careTeamMembership.patientId,
        userId: careTeamMembership.userId,
        disciplina: careTeamMembership.disciplina,
        papelNaEquipe: careTeamMembership.papelNaEquipe,
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

    // Query dos alvos de carga vigentes contratados para este paciente
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

    return { equipe: membros, profissionaisClinica: profissionaisRaw, alvosCarga: alvos };
  });

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

  return (
    <div className="flex flex-col gap-8">
      {/* Header da Página */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[var(--text-primary)] text-3xl font-bold">
          Equipe de Cuidado
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Profissionais da saúde vinculados ao acompanhamento clínico deste paciente.
        </p>
      </div>

      {/* Card de Cobertura de Carga Semanal Prescrita */}
      {alvosCarga.length > 0 ? (
        <div className="border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] rounded-[var(--radius-control)] p-5 shadow-[var(--ds-shadow-sm)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span>🎯</span> Prescrição & Cobertura de Disciplinas Contratadas
            </h2>
            <span className="text-xs text-[var(--text-secondary)]">
              {alvosCarga.length} disciplina(s) com alvo de carga
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {alvosCarga.map((alvo) => {
              const terapeutasNaDisciplina = membrosAtivos.filter(
                (m) => m.disciplina.toLowerCase() === alvo.disciplina.toLowerCase(),
              );
              const temCoordenador = terapeutasNaDisciplina.some(
                (m) => m.papelNaEquipe === "coordenador_referencia",
              );
              const temTerapeuta = terapeutasNaDisciplina.some(
                (m) => m.papelNaEquipe === "terapeuta_referencia" || m.papelNaEquipe === "substituto",
              );

              return (
                <div
                  key={alvo.id}
                  className="border border-[var(--border-brutal)]/30 rounded-[var(--radius-xs)] p-3 bg-[var(--surface-elevated)] flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-sm text-[var(--text-primary)]">
                      {formatarDisciplina(alvo.disciplina)}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--action-primary)] text-black">
                      {alvo.horasAlvoSemana}h/sem
                    </span>
                  </div>

                  <div className="text-xs flex items-center gap-1.5 mt-1">
                    {temTerapeuta ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        ✓ {terapeutasNaDisciplina.length} profissional(is)
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold flex items-center gap-1">
                        ⚠️ Sem terapeuta alocado
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Lista de Membros Ativos */}
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-[var(--text-primary)] text-lg font-bold flex items-center gap-2">
          <span>👥</span> Profissionais Ativos ({membrosAtivos.length})
        </h2>

        {membrosAtivos.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--border-brutal)]/40 rounded-[var(--radius-control)] p-8 text-center bg-[var(--surface-card)] flex flex-col items-center justify-center gap-2">
            <span className="text-3xl">📋</span>
            <p className="font-display text-base font-semibold text-[var(--text-primary)]">
              Nenhum profissional vinculado a este paciente ainda.
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md">
              Adicione o primeiro terapeuta ou coordenador abaixo para conceder acesso ao prontuário e liberar o diário de atendimento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {membrosAtivos.map((m) => {
              const papelInfo = PAPEL_CONFIG[m.papelNaEquipe] ?? {
                label: m.papelNaEquipe,
                icon: "👤",
                badgeStyle: "bg-muted text-[var(--text-primary)]",
              };
              const supervisorNome = m.responsavelTecnicoId
                ? usuariosMap.get(m.responsavelTecnicoId)
                : null;

              return (
                <div
                  key={m.id}
                  className="border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] rounded-[var(--radius-control)] p-5 shadow-[var(--ds-shadow-sm)] flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <Avatar className="size-12 border-2 border-[var(--border-brutal)] shrink-0">
                      <AvatarFallback>{obterIniciais(m.usuarioNome)}</AvatarFallback>
                    </Avatar>

                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-[var(--text-primary)] text-base font-bold truncate">
                          {m.usuarioNome}
                        </h3>
                        <span className={`px-2 py-0.5 text-xs rounded-[var(--radius-xs)] tracking-wide flex items-center gap-1 shrink-0 ${papelInfo.badgeStyle}`}>
                          <span>{papelInfo.icon}</span> {papelInfo.label}
                        </span>
                      </div>

                      <div className="text-xs text-[var(--text-secondary)] font-medium flex flex-wrap gap-x-3 gap-y-1">
                        <span><strong>Disciplina:</strong> {formatarDisciplina(m.disciplina)}</span>
                        {m.usuarioConselho && m.usuarioRegistroNumero ? (
                          <span>· <strong>{m.usuarioConselho}:</strong> {m.usuarioRegistroNumero}{m.usuarioRegistroUf ? `/${m.usuarioRegistroUf}` : ""}</span>
                        ) : null}
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        Vigência desde <strong>{m.vigenciaInicio}</strong>
                      </p>

                      {supervisorNome ? (
                        <p className="text-xs text-[var(--text-secondary)] bg-[var(--surface-elevated)] p-1.5 rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/20 mt-1">
                          👤 <strong>Supervisor Técnico:</strong> {supervisorNome}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border-brutal)]/20 gap-2">
                    <Button asChild variante="secundaria" tamanho="sm">
                      <Link
                        href={`/agenda/semana?patientId=${id}&terapeutaId=${m.userId}&disciplina=${encodeURIComponent(m.disciplina)}`}
                      >
                        📅 Agendar Sessões
                      </Link>
                    </Button>

                    {ctx.role === "coordenador" ? (
                      <form action={encerrarVinculoAction.bind(null, m.id)}>
                        <Button type="submit" risco="alto" tamanho="sm">
                          Encerrar vínculo
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Membros com Vínculo Encerrado (Histórico) */}
      {membrosEncerrados.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-[var(--text-secondary)] text-sm font-bold flex items-center gap-2">
            <span>📜</span> Histórico de Vínculos Encerrados ({membrosEncerrados.length})
          </h3>
          <div className="flex flex-col gap-2">
            {membrosEncerrados.map((m) => (
              <div
                key={m.id}
                className="border border-[var(--border-brutal)]/30 bg-muted/40 rounded-[var(--radius-control)] p-3 text-xs text-[var(--text-secondary)] flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">{m.usuarioNome}</span>
                  <span>({formatarDisciplina(m.disciplina)})</span>
                </div>
                <div>
                  Vigência: {m.vigenciaInicio} até <strong>{m.vigenciaFim}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Formulário de Adicionar Membro */}
      {ctx.role === "coordenador" ? (
        <AdicionarMembroForm
          patientId={id}
          profissionais={listaProfissionais}
          disciplinasPrescritas={alvosCarga.map((a) => a.disciplina)}
        />
      ) : null}
    </div>
  );
}
