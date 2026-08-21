/**
 * Fonte única do que cada modalidade clínica tem dentro do prontuário.
 *
 * Existia espalhado: `layout.tsx` decidia a aba central por `switch`, `page.tsx`
 * não decidia nada, e a aba "Evolução" — que é 100% ABA/protocolo — era servida
 * igual para as três modalidades. Paciente de TCC via um hexágono VB-MAPP
 * zerado; paciente convencional, o mesmo.
 *
 * `conventional` não tem Evolução por decisão de produto (20/08/2026): o
 * acompanhamento é narrativo, em `Temas`. Métrica derivada de registro
 * empírico seria certeza fabricada.
 */
export type ModalidadeClinica =
  "protocol_driven" | "cognitive_behavioral" | "conventional";

export type LeituraDeEvolucao = "protocolo" | "tcc";

export interface CapacidadesDaModalidade {
  /** Aba central de REGISTRO (onde se escreve). `null` = modalidade não resolvida. */
  abaCentral: { slug: string; rotulo: string } | null;
  /** A aba "Evolução" (leitura) existe para esta modalidade. */
  temEvolucao: boolean;
  /** A aba "Anamnese" (marco zero) existe para esta modalidade. */
  temAnamnese: boolean;
  /** Qual leitura a aba Evolução renderiza. `null` quando não há aba. */
  leituraDeEvolucao: LeituraDeEvolucao | null;
  /** Para onde a rota base redireciona quando não há Evolução. */
  rotaDeEntrada: string | null;
}

export function capacidadesDaModalidade(
  modalidade: ModalidadeClinica | null | undefined,
): CapacidadesDaModalidade {
  switch (modalidade) {
    case "cognitive_behavioral":
      return {
        abaCentral: { slug: "tcc", rotulo: "TCC" },
        temEvolucao: true,
        temAnamnese: false,
        leituraDeEvolucao: "tcc",
        rotaDeEntrada: null,
      };
    case "conventional":
      return {
        abaCentral: { slug: "temas", rotulo: "Temas" },
        temEvolucao: false,
        temAnamnese: false,
        leituraDeEvolucao: null,
        rotaDeEntrada: "temas",
      };
    case "protocol_driven":
      return {
        abaCentral: { slug: "metas", rotulo: "PEI & Metas" },
        temEvolucao: true,
        temAnamnese: true,
        leituraDeEvolucao: "protocolo",
        rotaDeEntrada: null,
      };
    default:
      // Modalidade ainda não gravada na ficha. Sem aba central (não dá para
      // adivinhar qual instrumento o modo usa), mas COM Evolução: fechá-la
      // deixaria o prontuário sem porta de entrada e o `redirect` sem destino.
      return {
        abaCentral: null,
        temEvolucao: true,
        temAnamnese: false,
        leituraDeEvolucao: "protocolo",
        rotaDeEntrada: null,
      };
  }
}
