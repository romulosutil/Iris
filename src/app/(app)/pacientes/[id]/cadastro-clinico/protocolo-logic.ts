import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { protocol, patientProtocol } from "@/db/schema";

/**
 * Ativa um protocolo de referência para o paciente. Só coordenador. Vínculo é
 * append-only: desativar nunca deleta, só marca `desativadoEm` (histórico).
 */
export async function ativarProtocolo(
  ctx: TenantContext,
  patientId: string,
  protocolId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  if (!protocolId) return { error: "Selecione um protocolo." };
  await withTenant(ctx, (tx) =>
    tx
      .insert(patientProtocol)
      .values({ patientId, protocolId, ativadoPor: ctx.userId }),
  );
  return {};
}

export async function desativarProtocolo(
  ctx: TenantContext,
  patientProtocolId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  await withTenant(ctx, (tx) =>
    tx
      .update(patientProtocol)
      // Data no fuso do Brasil, resolvida pelo Postgres — evita que uma ação à
      // noite (UTC-3) grave o dia seguinte por causa do UTC (Jules WARN).
      .set({ desativadoEm: sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date` })
      .where(eq(patientProtocol.id, patientProtocolId)),
  );
  return {};
}

export async function obterOuInicializarProtocolosDaClinica(
  tx: any,
  clinicId: string,
) {
  await tx.execute(sql`
    INSERT INTO protocol_familia_catalogo (id, nome, descricao) VALUES
      ('aba_marcos_desenvolvimento', 'ABA — marcos de desenvolvimento', 'Protocolos de marcos (ex.: VB-MAPP, ABLLS-R, AFLS)'),
      ('intervencao_naturalista', 'Intervenção naturalista', 'Modelos naturalistas (ex.: Denver/ESDM)'),
      ('fonoaudiologia', 'Fonoaudiologia', 'Protocolos de linguagem e comunicação (ex.: PROC, ABFW, MBGR)'),
      ('terapia_ocupacional', 'Terapia ocupacional', 'Protocolos de integração sensorial e AVDs (ex.: PEDI, Perfil Sensorial 2, DCDQ)')
    ON CONFLICT (id) DO NOTHING;
  `);

  let catalogo = await tx
    .select()
    .from(protocol)
    .where(eq(protocol.clinicId, clinicId));

  const nomesExistentes = new Set(catalogo.map((p: any) => p.nome));

  const padroes = [
    { nome: "VB-MAPP", disciplina: "ABA", familia: "aba_marcos_desenvolvimento" },
    { nome: "Denver (ESDM)", disciplina: "Psicopedagogia", familia: "intervencao_naturalista" },
    { nome: "ABLLS-R", disciplina: "ABA", familia: "aba_marcos_desenvolvimento" },
    { nome: "AFLS", disciplina: "ABA", familia: "aba_marcos_desenvolvimento" },
    { nome: "PROC", disciplina: "Fonoaudiologia", familia: "fonoaudiologia" },
    { nome: "ABFW", disciplina: "Fonoaudiologia", familia: "fonoaudiologia" },
    { nome: "MBGR", disciplina: "Fonoaudiologia", familia: "fonoaudiologia" },
    { nome: "PEDI", disciplina: "Terapia Ocupacional", familia: "terapia_ocupacional" },
    { nome: "Perfil Sensorial 2", disciplina: "Terapia Ocupacional", familia: "terapia_ocupacional" },
    { nome: "DCDQ", disciplina: "Terapia Ocupacional", familia: "terapia_ocupacional" },
  ];

  const novosParaInserir = padroes.filter((p) => !nomesExistentes.has(p.nome));

  if (novosParaInserir.length > 0) {
    await tx.insert(protocol).values(
      novosParaInserir.map((p) => ({
        clinicId,
        ...p,
      }))
    );

    catalogo = await tx
      .select()
      .from(protocol)
      .where(eq(protocol.clinicId, clinicId));
  }

  // Deduplicação por nome (garante exatamente 10 protocolos únicos sem duplicações)
  const vistos = new Set<string>();
  return catalogo.filter((p: any) => {
    if (vistos.has(p.nome)) return false;
    vistos.add(p.nome);
    return true;
  });
}

export async function inicializarProtocolosDaClinica(
  ctx: TenantContext,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  await withTenant(ctx, async (tx) => {
    await obterOuInicializarProtocolosDaClinica(tx, ctx.clinicId);
  });
  return {};
}
