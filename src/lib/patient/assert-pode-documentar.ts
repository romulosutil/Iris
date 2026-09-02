import "server-only";
import { montarProntidao } from "./prontidao";
import { obterFatosProntidaoNaTx } from "@/app/(app)/pacientes/[id]/prontidao-queries";
import type { ModalidadeClinica } from "@/app/(app)/pacientes/[id]/modalidade";
import type { Tx, TenantContext } from "@/db/rls";

/** Erro de regra de negócio, não de infraestrutura: o chamador traduz em
 * `{ error }` para o formulário, nunca em 500. */
export class ProntuarioIncompletoError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = "ProntuarioIncompletoError";
  }
}

/**
 * Fonte ÚNICA da régua de documentação. A UI apenas ANTECIPA o que esta
 * função vai recusar — se as duas divergirem, quem manda é esta, porque é ela
 * que está no caminho da escrita.
 *
 * Recebe a `tx` já aberta pelo core: os fatos precisam ser lidos na MESMA
 * transação da escrita. Numa transação à parte, uma meta descontinuada entre
 * a checagem e o INSERT passaria pela régua.
 */
export async function assertPodeDocumentar(
  ctx: TenantContext,
  tx: Tx,
  patientId: string,
  modalidade: ModalidadeClinica | null,
): Promise<void> {
  const fatos = await obterFatosProntidaoNaTx(tx, patientId);
  const prontidao = montarProntidao({
    modalidade,
    fatos,
    role: ctx.role,
    patientId,
  });
  if (prontidao.podeDocumentar) return;

  const faltando = prontidao.degraus
    .filter((d) => d.estado === "bloqueante")
    .map((d) => d.rotulo.toLowerCase())
    .join(" e ");
  throw new ProntuarioIncompletoError(
    `Esta sessão não pode ser documentada: falta ${faltando}. Quem resolve: coordenação.`,
  );
}
