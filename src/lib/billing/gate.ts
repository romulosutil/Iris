import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";

/**
 * Gate de ativação do 1º paciente (#36).
 *
 * Modelo comercial: o onboarding da clínica é gratuito — painel, equipe e
 * configurações sem pedir cartão. A cobrança nasce no cadastro do 1º paciente.
 * Este módulo é quem decide, dentro da transação de tenant, se o cadastro pode
 * prosseguir.
 *
 * Por que o gate mora numa consulta SQL única e não em duas idas ao banco:
 * "conta pacientes" e "lê status da assinatura" precisam enxergar o mesmo
 * instante. Separados, dois cadastros simultâneos na clínica virgem passariam
 * ambos pelo `count = 0` e criariam dois pacientes com uma cobrança só.
 * A barreira final contra isso é o gate no banco (`app_assinatura_bloqueia_
 * cadastro`, migração 0071) mais o UNIQUE de `subscription.clinic_id`.
 */

export type MotivoBloqueio =
  | "ativacao_requerida"
  | "pagamento_pendente"
  | "assinatura_cancelada"
  | "inadimplente";

export type DecisaoGate =
  | { permitido: true }
  | { permitido: false; motivo: MotivoBloqueio; statusAssinatura: string };

type LinhaGate = {
  status: string | null;
  isento: boolean;
  pacientes_ativos: number;
};

/**
 * Avalia o gate DENTRO da transação de tenant já aberta. Recebe `tx` em vez de
 * abrir a própria conexão de propósito: chamado de dentro do `withTenant` do
 * cadastro, ele enxerga a mesma imagem do banco que o INSERT que vem a seguir,
 * e um rollback do cadastro reverte a decisão junto.
 *
 * "Paciente ativo" aqui é o critério comercial simples — `arquivado_em IS NULL`.
 * Não é a apuração de faturamento do ciclo (essa é `billing_apurar_ciclo`, que
 * também conta interação no período): para decidir "esta clínica já saiu do
 * zero?", arquivamento basta e é barato (usa `patient_clinic_arquivado_idx`).
 */
export async function avaliarGateCadastroPaciente(
  tx: Tx,
  clinicId: string,
): Promise<DecisaoGate> {
  const resultado = await tx.execute<LinhaGate>(sql`
    SELECT
      (SELECT s.status::text FROM subscription s WHERE s.clinic_id = ${clinicId}) AS status,
      COALESCE((SELECT c.isento_trial FROM clinic c WHERE c.id = ${clinicId}), false) AS isento,
      (SELECT count(*)::int FROM patient p
        WHERE p.clinic_id = ${clinicId} AND p.arquivado_em IS NULL) AS pacientes_ativos
  `);

  const linha = (resultado as unknown as LinhaGate[])[0];
  // Sem linha nenhuma a clínica não existe para este tenant — deixar passar
  // aqui seria decidir por ausência de evidência. O INSERT seguinte falha na
  // FK de qualquer modo; bloquear é o lado seguro.
  if (!linha) {
    return {
      permitido: false,
      motivo: "ativacao_requerida",
      statusAssinatura: "desconhecido",
    };
  }

  // Legado pré-cobrança (0064): fora do relógio de trial E fora do gate.
  // Cobrar retroativamente quem entrou antes do modelo comercial existir seria
  // mudar o contrato unilateralmente.
  if (linha.isento) return { permitido: true };

  const status = linha.status ?? "free_tier";

  switch (status) {
    case "active":
      return { permitido: true };

    // Renovação falhou. Não bloqueia de imediato: a carência
    // (`subscription.carencia_dias`) é aplicada pelo job de cobrança, que é
    // quem transiciona para `canceled` quando ela vence. Enquanto está só
    // `past_due`, cadastrar continua liberado — falha de Pix/cartão costuma
    // ser do banco do cliente, e travar cadastro de paciente por isso pune o
    // paciente, não o inadimplente.
    case "past_due":
      return { permitido: true };

    case "setup_pending":
      return {
        permitido: false,
        motivo: "pagamento_pendente",
        statusAssinatura: status,
      };

    case "canceled":
      return {
        permitido: false,
        motivo: "assinatura_cancelada",
        statusAssinatura: status,
      };

    case "free_tier":
    default:
      // O 1º paciente é o gatilho. Do 2º em diante em `free_tier` seria estado
      // inconsistente (paciente existe sem assinatura ativa) — bloquear
      // também, para que a inconsistência apareça em vez de faturar de graça.
      return {
        permitido: false,
        motivo: "ativacao_requerida",
        statusAssinatura: status,
      };
  }
}

/** Copy do bloqueio, em pt-BR, por motivo. */
export function mensagemDeBloqueio(motivo: MotivoBloqueio): string {
  switch (motivo) {
    case "ativacao_requerida":
      return "Para cadastrar o primeiro paciente, configure o pagamento da assinatura.";
    case "pagamento_pendente":
      return "Estamos aguardando a confirmação do seu pagamento. Assim que o banco confirmar, o cadastro é liberado automaticamente.";
    case "assinatura_cancelada":
      return "Sua assinatura está cancelada. Reative para voltar a cadastrar pacientes.";
    case "inadimplente":
      return "Há uma cobrança em aberto. Regularize o pagamento para continuar.";
  }
}
