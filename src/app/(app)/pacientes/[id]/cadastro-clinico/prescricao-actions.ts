"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { ancoraCobertura } from "../equipe/cobertura";
import {
  encerrarPrescricao,
  prescreverDisciplina,
  type PrescricaoState,
} from "./prescricao-logic";

/**
 * Únicos pontos de entrada invocáveis pelo cliente. Os núcleos que recebem
 * `ctx` vivem em `./prescricao-logic` (`server-only`, sem `"use server"`) e não
 * podem ser chamados direto — fecha a brecha de `ctx` forjável.
 *
 * A lista de pacientes também é revalidada: o selo `Sem prescrição` (handoff 1)
 * é derivado da existência de prescrição vigente, então sem isto o paciente
 * continuaria marcado como incompleto depois de prescrito.
 */
function revalidar(patientId: string): void {
  revalidatePath(`/pacientes/${patientId}/cadastro-clinico`);
  revalidatePath("/pacientes");
}

/**
 * O handoff de §MV4 é feito AQUI, no servidor, e não num efeito do cliente.
 *
 * Represcrever é SCD2: fecha a linha vigente e insere OUTRA, com id novo. O
 * `revalidar` logo abaixo re-renderiza a lista, a `key` da linha muda, e o
 * componente que fez o submit **desmonta** — levando junto o `useActionState` e
 * qualquer `useEffect` que fosse navegar. Era exatamente isso que acontecia: a
 * confirmação salvava e o coordenador ficava na tela onde não há o que fazer,
 * que é o "descobrir depois" que esta fatia existe para eliminar. Um `redirect`
 * de servidor não tem componente para perder.
 *
 * `ancoraCobertura` é a mesma função que a barra usa para montar o `id` — link
 * e âncora derivam da mesma normalização, nunca de duas concatenações.
 */
export async function prescreverDisciplinaAction(
  patientId: string,
  _prev: PrescricaoState,
  formData: FormData,
): Promise<PrescricaoState> {
  const ctx = await getTenantContext();
  const resultado = await prescreverDisciplina(ctx, patientId, formData);
  if (resultado.ok) revalidar(patientId);
  if (resultado.ok && resultado.disciplinaSobrealocada) {
    redirect(
      `/pacientes/${patientId}/equipe#${ancoraCobertura(resultado.disciplinaSobrealocada)}`,
    );
  }
  return resultado;
}

export async function encerrarPrescricaoAction(
  patientId: string,
  disciplina: string,
): Promise<void> {
  const ctx = await getTenantContext();
  await encerrarPrescricao(ctx, patientId, disciplina);
  revalidar(patientId);
}
