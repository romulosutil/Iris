import "server-only";
import { montarProntidao } from "./prontidao";
import { obterFatosProntidaoNaTx } from "./prontidao-queries";
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
 *
 * Task 7c — a modalidade DEIXOU de ser parâmetro. Enquanto ela vinha de fora
 * (do `leftJoin` em `patient` que `logic.ts` fazia, sob `patient_select`), o
 * terapeuta de cobertura não lia a linha `patient` e a modalidade chegava
 * `null`: "não vejo" e "não está definida" eram indistinguíveis aqui dentro,
 * e a régua tratava o primeiro como o segundo — recusando por modalidade
 * ausente uma cobertura clínica legítima (D8/#174). Lida pela MESMA porta
 * autorizada dos seis fatos (`app_fatos_prontidao`, migração `0144`), `null`
 * volta a significar só "não está definida" — que é exatamente o que o
 * degrau bloqueante "modalidade" existe para dizer.
 */
export async function assertPodeDocumentar(
  ctx: TenantContext,
  tx: Tx,
  patientId: string,
): Promise<void> {
  const { fatos, modalidade } = await obterFatosProntidaoNaTx(tx, patientId);
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
