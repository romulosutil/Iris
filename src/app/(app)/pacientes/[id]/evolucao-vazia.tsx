import type { Prontidao } from "@/lib/patient/prontidao";
import { CartaoProntidao } from "@/components/app/cartao-prontidao";

/**
 * Estado vazio da aba Evolução.
 *
 * Substitui o "Sem sessões registradas → Agendar Primeira Sessão" anterior,
 * que apontava para a ação que o operador JÁ podia fazer em vez da que
 * faltava. Agendar nunca foi o passo que travava o gráfico: sem meta ativa,
 * `materializar.ts` descarta a evidência, e a sessão agendada produziria outra
 * tela vazia igual a esta.
 */
export function EvolucaoVazia({ prontidao }: { prontidao: Prontidao }) {
  // "Não visível" nunca pode passar por "pronto". Sem este ramo, a escada
  // vazia de um papel sem leitura clínica cairia no `proximo === null` abaixo
  // e a tela afirmaria "O prontuário está pronto" sobre um prontuário que
  // ninguém conseguiu ler — a afirmação falsa que a §4a existe para matar.
  // Aqui, no PRONTUÁRIO, o estado honesto é ausência (D-A9: a recepção não
  // recebe selo clínico); quem mostra "Aguardando coordenação" é o passo
  // Documentar, a superfície onde a régua morde.
  if (prontidao.situacao === "fatos_nao_visiveis") return null;

  if (prontidao.proximo === null) {
    // Prontuário pronto: aqui a espera é real e a frase é verdadeira.
    return (
      <div className="mx-auto my-8 max-w-2xl rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-12 text-center">
        {/* Ícone de traço em currentColor, no mesmo estilo de
            `timeline/estado-de-erro.tsx`. Emoji tem leitura imprevisível em
            leitor de tela e não herda a cor do texto. */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="mx-auto mb-4 text-[var(--text-secondary)]"
        >
          <path
            d="M3 13h5l1.5 3h5L16 13h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <path
            d="M3 13l3-8h12l3 8v6H3v-6z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
        <h2 className="mb-2 text-2xl font-black text-[var(--text-primary)]">
          Sem sessões registradas
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          O prontuário está pronto. Assim que a primeira sessão for documentada
          e consolidada, a evolução aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <CartaoProntidao
      prontidao={prontidao}
      titulo="A evolução ainda não pode ser calculada"
    />
  );
}
