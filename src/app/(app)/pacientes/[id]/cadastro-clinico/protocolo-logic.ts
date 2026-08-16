import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import { protocol, patientProtocol, patientAlvoDisciplina } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { formatarDisciplina } from "@/lib/disciplinas";
import type { ProtocoloCatalogo } from "./protocolo-agrupamento";

export type ProtocoloState = {
  ok?: boolean;
  error?: string;
  bloqueioConta?: BloqueioConta;
};

/**
 * Serializa ativações concorrentes do MESMO protocolo no MESMO paciente.
 *
 * Sem lock, duplo-clique no submit passa duas vezes pelo "já está ativo?" antes
 * de qualquer insert e cria dois vínculos vigentes — que a tela mostraria como
 * um cartão só (o agrupamento deduplica), deixando o segundo vivo e invisível.
 * Advisory de transação, mesmo mecanismo da prescrição (fatia 2): não depende
 * de privilégio de tabela e morre junto com a transação.
 */
async function travarProtocolo(
  tx: Tx,
  patientId: string,
  protocolId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${patientId} || ':' || ${protocolId}, 203))`,
  );
}

/**
 * Vincula um protocolo de referência ao paciente. Só coordenador. Vínculo é
 * append-only: desativar nunca deleta, só marca `desativadoEm` (histórico).
 *
 * #203 fatia 3 — o protocolo é **encaixe da prescrição**: só entra em
 * disciplina prescrita e vigente. A regra vive aqui, não no dropdown, porque o
 * dropdown some numa aba deixada aberta desde antes de a prescrição ser
 * encerrada, e Server Action é endpoint — quem chamar direto tem de bater na
 * mesma parede.
 */
async function ativarProtocoloCore(
  ctx: TenantContext,
  patientId: string,
  protocolId: string,
): Promise<ProtocoloState> {
  requireRole(ctx, "coordenador");
  if (!protocolId) return { error: "Selecione um protocolo." };

  return withTenant(ctx, async (tx) => {
    const [proto] = await tx
      .select({ nome: protocol.nome, disciplina: protocol.disciplina })
      .from(protocol)
      .where(
        and(eq(protocol.id, protocolId), eq(protocol.clinicId, ctx.clinicId)),
      );
    if (!proto) {
      return { error: "Protocolo não encontrado no catálogo desta clínica." };
    }

    // `lower(btrim(...))` dos dois lados pelo mesmo motivo do agrupamento: são
    // duas colunas de texto livre em tabelas diferentes, e um espaço sobrando
    // recusaria a vinculação de uma disciplina que ESTÁ prescrita.
    const [prescrita] = await tx
      .select({ id: patientAlvoDisciplina.id })
      .from(patientAlvoDisciplina)
      .where(
        and(
          eq(patientAlvoDisciplina.patientId, patientId),
          sql`lower(btrim(${patientAlvoDisciplina.disciplina})) = lower(btrim(${proto.disciplina}))`,
          isNull(patientAlvoDisciplina.vigenciaFim),
        ),
      );
    if (!prescrita) {
      return {
        error: `${proto.nome} é protocolo de ${formatarDisciplina(proto.disciplina)}, e essa disciplina não está prescrita para este paciente. Prescreva ${formatarDisciplina(proto.disciplina)} na seção de prescrição antes de encaixar o protocolo.`,
      };
    }

    await travarProtocolo(tx, patientId, protocolId);

    const [jaAtivo] = await tx
      .select({ id: patientProtocol.id })
      .from(patientProtocol)
      .where(
        and(
          eq(patientProtocol.patientId, patientId),
          eq(patientProtocol.protocolId, protocolId),
          isNull(patientProtocol.desativadoEm),
        ),
      );
    // Já ativo é sucesso, não erro: o estado desejado é o estado atual. Erro
    // aqui faria duplo-clique parecer falha e convidaria a desvincular.
    if (jaAtivo) return { ok: true };

    await tx.insert(patientProtocol).values({
      patientId,
      protocolId,
      ativadoPor: ctx.userId,
      // O default da coluna é `now()::date`, resolvido no fuso do SERVIDOR
      // (UTC em CI e em produção), enquanto `desativadoEm` abaixo grava a data
      // de America/Sao_Paulo. Entre 00:00 e 03:00 UTC as duas discordam em um
      // dia e o CHECK `patient_protocol_vigencia` (desativado_em >=
      // ativado_em) rejeita o desencaixe — o coordenador que encaixa às 22h de
      // Brasília não consegue desfazer no mesmo dia. As duas pontas têm de ler
      // o MESMO relógio; o relógio canônico é o de Brasília.
      ativadoEm: sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`,
    });
    await desarquivarPacienteSeArquivado(
      tx,
      ctx,
      patientId,
      "ativacao_protocolo",
    );
    return { ok: true };
  });
}

/** Conta em somente-leitura não encaixa protocolo (#163+#159). */
export const ativarProtocolo = comEscrita(ativarProtocoloCore);

async function desativarProtocoloCore(
  ctx: TenantContext,
  patientId: string,
  patientProtocolId: string,
): Promise<ProtocoloState> {
  requireRole(ctx, "coordenador");
  const linhas = await withTenant(ctx, (tx) =>
    tx
      .update(patientProtocol)
      // Data no fuso do Brasil, resolvida pelo Postgres — evita que uma ação à
      // noite (UTC-3) grave o dia seguinte por causa do UTC (Jules WARN).
      .set({
        desativadoEm: sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      })
      .where(
        and(
          eq(patientProtocol.id, patientProtocolId),
          // O paciente entra no predicado, e não só no `revalidatePath`: a RLS
          // enxerga a clínica inteira, então um id de vínculo de OUTRO paciente
          // desta clínica desativaria a linha e revalidaria a página errada.
          eq(patientProtocol.patientId, patientId),
          isNull(patientProtocol.desativadoEm),
        ),
      )
      .returning({ id: patientProtocol.id }),
  );

  // Zero linhas não é sucesso silencioso: ou outra aba já desvinculou, ou a RLS
  // barrou a escrita (UPDATE barrado por policy afeta 0 linhas SEM estourar).
  // Mesmo tratamento que `encerrarPrescricao` (fatia 2).
  if (linhas.length === 0) {
    return {
      error:
        "Este protocolo já não estava vinculado — recarregue a página para ver o estado atual.",
    };
  }
  return { ok: true };
}

export const desativarProtocolo = comEscrita(desativarProtocoloCore);

/**
 * O retorno é tipado como `ProtocoloCatalogo[]` porque desce direto para o
 * agrupamento e para a tela. Com o `any` anterior, mudar uma coluna do catálogo
 * não quebrava nada em tempo de compilação — quebrava na renderização.
 */
export async function obterOuInicializarProtocolosDaClinica(
  tx: Tx,
  clinicId: string,
): Promise<ProtocoloCatalogo[]> {
  let catalogo = await tx
    .select({
      id: protocol.id,
      nome: protocol.nome,
      disciplina: protocol.disciplina,
    })
    .from(protocol)
    .where(eq(protocol.clinicId, clinicId));

  const nomesExistentes = new Set(catalogo.map((p) => p.nome));

  const padroes = [
    {
      nome: "VB-MAPP",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    {
      nome: "Denver (ESDM)",
      disciplina: "Psicopedagogia",
      familia: "intervencao_naturalista",
    },
    {
      nome: "ABLLS-R",
      disciplina: "ABA",
      familia: "aba_marcos_desenvolvimento",
    },
    { nome: "AFLS", disciplina: "ABA", familia: "aba_marcos_desenvolvimento" },
    { nome: "PROC", disciplina: "Fonoaudiologia", familia: "fonoaudiologia" },
    { nome: "ABFW", disciplina: "Fonoaudiologia", familia: "fonoaudiologia" },
    { nome: "MBGR", disciplina: "Fonoaudiologia", familia: "fonoaudiologia" },
    {
      nome: "PEDI",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
    {
      nome: "Perfil Sensorial 2",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
    {
      nome: "DCDQ",
      disciplina: "Terapia Ocupacional",
      familia: "terapia_ocupacional",
    },
  ];

  const novosParaInserir = padroes.filter((p) => !nomesExistentes.has(p.nome));

  if (novosParaInserir.length > 0) {
    await tx.insert(protocol).values(
      novosParaInserir.map((p) => ({
        clinicId,
        ...p,
      })),
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
): Promise<ProtocoloState> {
  requireRole(ctx, "coordenador");
  await withTenant(ctx, async (tx) => {
    await obterOuInicializarProtocolosDaClinica(tx, ctx.clinicId);
  });
  return { ok: true };
}
