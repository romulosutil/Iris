import { count, desc, eq, min } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, extraction, patient, session } from "@/db/schema";

// Painel de exceções do coordenador (Fase 3 Plano 3). Duas categorias que
// pedem atenção de coordenação, ambas derivadas por LEITURA (sem coluna nova):
//   1. Extrações que FALHARAM (pendente_reprocessamento) — flow 2.4.
//   2. Revisões INCOMPLETAS acumuladas — sessões com sugestões `sugerida` que o
//      terapeuta ainda não revisou (flow 2.3). Escala ao coordenador quando se
//      acumulam.
// O RLS já escopa por clínica: o coordenador vê a clínica inteira; um terapeuta
// (se acessar) veria só o próprio recorte — mas a página é coordenador-only.

export type ExtracaoFalha = {
  sessionId: string;
  pacienteNome: string | null;
  terapeutaNome: string | null;
  /** Dono da sessão. Numa clínica solo é o próprio coordenador que está vendo
   *  esta tela — e só nesse caso a linha pode oferecer "Reprocessar" (a RLS
   *  exige `app_session_terapeuta_id(session_id) = app.user_id` para escrever). */
  terapeutaId: string;
  desdeEm: Date;
};

export type RevisaoIncompleta = {
  sessionId: string;
  pacienteNome: string | null;
  terapeutaNome: string | null;
  quantidade: number;
  maisAntigaEm: Date | null;
};

export type ListaExcecoes = {
  extracoesFalhas: ExtracaoFalha[];
  revisoesIncompletas: RevisaoIncompleta[];
  total: number;
  /** Instante de referência p/ as idades relativas ("há X") — capturado aqui
   *  (fora do render, que não pode chamar Date.now — regra do compilador). */
  agora: number;
};

export async function listarExcecoes(
  ctx: TenantContext,
): Promise<ListaExcecoes> {
  const extracoesFalhas = await withTenant(ctx, (tx) =>
    tx
      .select({
        sessionId: extraction.sessionId,
        pacienteNome: patient.nome,
        terapeutaNome: appUser.name,
        terapeutaId: session.terapeutaId,
        desdeEm: extraction.criadoEm,
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .leftJoin(patient, eq(patient.id, session.patientId))
      .leftJoin(appUser, eq(appUser.id, session.terapeutaId))
      .where(eq(extraction.estado, "pendente_reprocessamento"))
      .orderBy(desc(extraction.criadoEm)),
  );

  // Uma linha por sessão com sugestões ainda não revisadas + quantidade + a mais
  // antiga (quanto tempo o terapeuta está devendo a revisão).
  const revisoesIncompletas = await withTenant(ctx, (tx) =>
    tx
      .select({
        sessionId: extraction.sessionId,
        pacienteNome: patient.nome,
        terapeutaNome: appUser.name,
        quantidade: count(extraction.id),
        maisAntigaEm: min(extraction.criadoEm),
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .leftJoin(patient, eq(patient.id, session.patientId))
      .leftJoin(appUser, eq(appUser.id, session.terapeutaId))
      .where(eq(extraction.estado, "sugerida"))
      .groupBy(extraction.sessionId, patient.nome, appUser.name),
  );

  // `min()` de timestamp pode voltar como string do driver — normaliza p/ Date.
  const incompletas: RevisaoIncompleta[] = revisoesIncompletas
    .map((r) => ({
      ...r,
      maisAntigaEm: r.maisAntigaEm ? new Date(r.maisAntigaEm) : null,
    }))
    .sort(
      (a, b) =>
        (a.maisAntigaEm?.getTime() ?? 0) - (b.maisAntigaEm?.getTime() ?? 0),
    );

  return {
    extracoesFalhas,
    revisoesIncompletas: incompletas,
    total: extracoesFalhas.length + incompletas.length,
    agora: Date.now(),
  };
}
