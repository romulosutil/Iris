import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { auditLog, patient } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
import {
  dataAltaSchema,
  motivoAltaSchema,
  motivoArquivamentoSchema,
} from "./schemas";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

export type ArquivamentoState = {
  error?: string;
  ok?: boolean;
  bloqueioConta?: BloqueioConta;
};

/**
 * #174 — arquivamento COMERCIAL manual do paciente.
 *
 * `arquivado_em` tira o paciente da contagem de ativos da fatura e NADA MAIS:
 * não é alta clínica (regra 3 — `alta_em` não é tocado aqui, nem por engano),
 * não esconde o prontuário (regra 4 — nenhuma política de RLS olha para esta
 * coluna; arquivado continua legível e exportável). A recíproca existe e mora
 * no banco: dar alta arquiva, via trigger `patient_alta_arquiva_trg` (0065).
 *
 * Papéis: `coordenador` e `admin_recepcao`. Não é escolha desta camada — é o
 * que a política `patient_update` (0001) permite. Um `terapeuta` aqui não
 * receberia erro do banco, só 0 linhas afetadas (RLS filtra, não estoura), e a
 * UI diria "arquivado" sobre um paciente que continua faturando. `requireRole`
 * transforma esse silêncio em recusa explícita.
 */
async function arquivarPacienteCore(
  ctx: TenantContext,
  patientId: string,
  motivo: string,
): Promise<ArquivamentoState> {
  return alternarArquivamento(ctx, patientId, "arquivar", motivo);
}

/**
 * Conta em somente-leitura não arquiva nem desarquiva (#163+#159). Arquivar
 * *reduz* a fatura, então a tentação é isentá-lo — mas a apuração é por
 * snapshot de ciclo, e deixar a única escrita permitida ser a que muda o valor
 * a cobrar abriria uma porta para mexer na base de faturamento de uma conta que
 * está justamente inadimplente ou fora do trial. Reativar a assinatura é o
 * caminho, e é o que a mensagem do bloqueio oferece.
 */
export const arquivarPaciente = comEscrita(arquivarPacienteCore);

/**
 * Desarquiva: o paciente volta a contar na fatura já do ciclo em andamento
 * (critério (c) de `billing_apurar_ciclo`, 0071 — o ciclo é apurado inteiro,
 * não a partir da data do desarquivamento).
 *
 * Continua permitido para quem já teve alta clínica: o trigger do banco só age
 * na transição NULL → NOT NULL de `alta_em`, então desarquivar não é desfeito
 * na sequência. Quem desarquiva está afirmando que houve retorno — e o
 * registro de alta é histórico clínico, que não se reescreve por ato
 * administrativo.
 */
async function desarquivarPacienteCore(
  ctx: TenantContext,
  patientId: string,
  motivo: string,
): Promise<ArquivamentoState> {
  return alternarArquivamento(ctx, patientId, "desarquivar", motivo);
}

export const desarquivarPaciente = comEscrita(desarquivarPacienteCore);

async function alternarArquivamento(
  ctx: TenantContext,
  patientId: string,
  operacao: "arquivar" | "desarquivar",
  motivo: string,
): Promise<ArquivamentoState> {
  requireRole(ctx, "coordenador", "admin_recepcao");
  if (!patientId) return { error: "Paciente não informado." };

  // A validação do motivo é repetida AQUI, e não só na action, porque este core
  // é chamado direto pelos testes de integração e por qualquer caminho futuro
  // que não passe por `FormData`. Gravar trilha com motivo vazio é o mesmo que
  // não ter motivo — e o buraco só apareceria meses depois, na hora de
  // explicar uma linha da fatura.
  const motivoValidado = motivoArquivamentoSchema.safeParse(motivo);
  if (!motivoValidado.success) {
    return {
      error: motivoValidado.error.issues[0]?.message ?? "Motivo inválido.",
    };
  }

  const arquivando = operacao === "arquivar";

  try {
    return await withTenant(ctx, async (tx) => {
      // A guarda no WHERE (`IS NULL` / `IS NOT NULL`) faz a operação
      // idempotente: repetir o clique não regrava `arquivado_em` com um `now()`
      // novo. Isso importa porque a apuração da fatura é por snapshot de
      // ciclo — reescrever a data moveria o paciente de mês.
      const linhas = await tx
        .update(patient)
        .set({ arquivadoEm: arquivando ? new Date() : null })
        .where(
          and(
            eq(patient.id, patientId),
            arquivando
              ? isNull(patient.arquivadoEm)
              : isNotNull(patient.arquivadoEm),
          ),
        )
        .returning({ id: patient.id, arquivadoEm: patient.arquivadoEm });

      if (linhas.length === 0) {
        // Duas causas indistinguíveis daqui, ambas benignas: já estava no
        // estado pedido, ou o RLS não deixa este usuário ver o paciente. Não
        // vale gravar trilha de um não-evento, então saímos ok e sem linha.
        return { ok: true };
      }

      // Trilha append-only (`audit_log` só aceita INSERT para `app_role`): o
      // arquivamento mexe no que a clínica paga, então precisa de ator e
      // carimbo de tempo audíveis.
      await tx.insert(auditLog).values({
        clinicId: ctx.clinicId,
        atorId: ctx.userId,
        acao: arquivando ? "paciente_arquivado" : "paciente_desarquivado",
        entidade: "patient",
        entidadeId: patientId,
        patientId,
        // `motivo` entra no jsonb, não em coluna nova: a trilha é append-only
        // e genérica por ação, e o que muda a fatura precisa carregar o porquê
        // junto do quando. Sem ele, seis meses depois a linha do audit responde
        // "quem" e "quando" e deixa a pergunta cara ("por que este paciente
        // parou de ser cobrado?") sem resposta.
        detalhe: { origem: "manual", motivo: motivoValidado.data },
      });

      return { ok: true };
    });
  } catch (err) {
    logarErroSemPII(`${operacao}Paciente:`, err);
    return {
      error: arquivando
        ? "Não foi possível arquivar o paciente."
        : "Não foi possível desarquivar o paciente.",
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * #352 — ALTA CLÍNICA.
 * ──────────────────────────────────────────────────────────────────────────── */

export type AltaState = {
  error?: string;
  ok?: boolean;
  bloqueioConta?: BloqueioConta;
};

/**
 * #352 — registrar alta clínica.
 *
 * `alta_em` não tinha caminho de escrita nenhum no app: a coluna existia desde
 * o modelo de dados, a fórmula de retenção dependia dela, e o resultado era uma
 * fila de expurgo permanentemente vazia em produção — não porque nada vencia,
 * mas porque nada nunca recebia alta (defeito C2 da spec).
 *
 * Só `coordenador`, ao contrário do arquivamento (que a recepção também faz).
 * Não é escolha de UI: alta é ato clínico e ABRE o relógio de retenção — a
 * partir dela conta o prazo legal de guarda e, no fim dele, a eliminação
 * definitiva do prontuário. Quem dispara esse relógio é quem responde pelo
 * prontuário.
 *
 * **O app NÃO arquiva aqui** (R352.A6). O trigger `patient_alta_arquiva_trg`
 * (`0065`) já arquiva, e só na transição `NULL → NOT NULL`. Repetir o efeito
 * neste core criaria duas fontes de verdade para o mesmo fato — e a do banco
 * continuaria valendo para qualquer escrita que não passe por aqui.
 */
async function registrarAltaCore(
  ctx: TenantContext,
  patientId: string,
  dataAlta: string,
  motivo: string,
): Promise<AltaState> {
  return alternarAlta(ctx, patientId, "registrar", motivo, dataAlta);
}

/**
 * Conta em somente-leitura NÃO registra alta (R352.A5): é escrita clínica
 * ordinária, e o guard de escrita vale para ela como para qualquer outra.
 *
 * Isto é o oposto do expurgo (`clinica/retencao/logic.ts`), que roda **sem**
 * `comEscrita` — e a diferença é deliberada: eliminar dado cujo prazo venceu é
 * obrigação legal da clínica como controladora; registrar alta é operação
 * corrente do produto.
 */
export const registrarAlta = comEscrita(registrarAltaCore);

/**
 * Desfazer alta: `alta_em` volta a `NULL`.
 *
 * Existe porque alta é data digitada à mão e digitar 2025 no lugar de 2026 é o
 * erro mais provável do formulário — e essa data governa o vencimento do prazo
 * de guarda. Sem a volta, um erro de digitação só teria correção por SQL.
 *
 * **Desfazer NÃO desarquiva** (R352.A7). O trigger do banco só age na transição
 * `NULL → NOT NULL`, então zerar `alta_em` não é desfeito na sequência; e
 * desarquivar é ato administrativo próprio, com motivo próprio na trilha. Quem
 * corrige a data da alta não está afirmando que o paciente voltou a ser ativo
 * na fatura.
 */
async function desfazerAltaCore(
  ctx: TenantContext,
  patientId: string,
  motivo: string,
): Promise<AltaState> {
  return alternarAlta(ctx, patientId, "desfazer", motivo);
}

export const desfazerAlta = comEscrita(desfazerAltaCore);

async function alternarAlta(
  ctx: TenantContext,
  patientId: string,
  operacao: "registrar" | "desfazer",
  motivo: string,
  dataAlta?: string,
): Promise<AltaState> {
  requireRole(ctx, "coordenador");
  if (!patientId) return { error: "Paciente não informado." };

  // Validação DENTRO do core, como no arquivamento: este caminho é chamado
  // direto pelos testes de integração e por qualquer futuro que não passe por
  // `FormData`. A data em particular não pode depender do `max` do input —
  // um POST direto na action chega aqui sem passar por HTML nenhum.
  const motivoValidado = motivoAltaSchema.safeParse(motivo);
  if (!motivoValidado.success) {
    return {
      error: motivoValidado.error.issues[0]?.message ?? "Motivo inválido.",
    };
  }

  const registrando = operacao === "registrar";

  let data: string | null = null;
  if (registrando) {
    const fuso = await fusoDaClinicaAtual(ctx);
    const dataValidada = dataAltaSchema(fuso).safeParse(dataAlta ?? "");
    if (!dataValidada.success) {
      return {
        error: dataValidada.error.issues[0]?.message ?? "Data inválida.",
      };
    }
    data = dataValidada.data;
  }

  try {
    return await withTenant(ctx, async (tx) => {
      // Idempotência no WHERE, como no arquivamento: `IS NULL` para registrar,
      // `IS NOT NULL` para desfazer. Repetir o clique não regrava a data — e
      // aqui isso importa mais do que lá, porque regravar `alta_em` moveria o
      // vencimento do prazo de guarda e reabriria o aviso prévio (o dedup é
      // ancorado em `criado_em > alta_em`, R352.D3).
      const linhas = await tx
        .update(patient)
        .set({ altaEm: data })
        .where(
          and(
            eq(patient.id, patientId),
            registrando ? isNull(patient.altaEm) : isNotNull(patient.altaEm),
          ),
        )
        .returning({ id: patient.id, altaEm: patient.altaEm });

      if (linhas.length === 0) {
        // Mesmas duas causas benignas e indistinguíveis do arquivamento: já
        // estava no estado pedido, ou o RLS não deixa este usuário ver o
        // paciente. Não vale trilha de não-evento.
        return { ok: true };
      }

      await tx.insert(auditLog).values({
        clinicId: ctx.clinicId,
        atorId: ctx.userId,
        acao: registrando ? "alta_registrada" : "alta_desfeita",
        entidade: "patient",
        entidadeId: patientId,
        patientId,
        detalhe: { origem: "manual", motivo: motivoValidado.data },
      });

      return { ok: true };
    });
  } catch (err) {
    logarErroSemPII(`${operacao}Alta:`, err);
    return {
      error: registrando
        ? "Não foi possível registrar a alta."
        : "Não foi possível desfazer a alta.",
    };
  }
}
