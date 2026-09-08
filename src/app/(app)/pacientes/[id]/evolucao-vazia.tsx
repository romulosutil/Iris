import type { ReactNode } from "react";
import type { Prontidao } from "@/lib/patient/prontidao";
import { TITULO_CARTAO_PRONTIDAO } from "@/components/app/cartao-prontidao";

/**
 * Estado vazio da aba Evolução.
 *
 * Substitui o "Sem sessões registradas → Agendar Primeira Sessão" anterior,
 * que apontava para a ação que o operador JÁ podia fazer em vez da que
 * faltava. Agendar nunca foi o passo que travava o gráfico: sem meta ativa,
 * `materializar.ts` descarta a evidência, e a sessão agendada produziria outra
 * tela vazia igual a esta.
 *
 * **Aqui NÃO se desenha a escada.** Ela mora em `layout.tsx` (spec §3.3,
 * superfície 1) e o layout do App Router envolve esta página: renderizar
 * `CartaoProntidao` aqui também punha a MESMA escada duas vezes na mesma tela
 * — mesmos seis degraus, mesma contagem, e dois botões primários idênticos
 * ("Prescrever um protocolo →" em cima e embaixo). Dois gestos primários de
 * mesmo peso são exatamente a carga cognitiva que a §3.4 existe para remover;
 * duplicá-los dentro de uma rolagem só é a versão pior dela, porque parecem
 * dois passos diferentes até serem lidos até o fim.
 *
 * O que sobra para esta tela é o que só ela sabe: **por que o gráfico está
 * vazio**. O gesto continua com o cartão do topo, e o texto aponta para lá.
 */
function Painel({ titulo, children }: { titulo: string; children: ReactNode }) {
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
        {titulo}
      </h2>
      <p className="text-sm text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

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
    // Prontuário pronto: aqui a espera é real e a frase é verdadeira. Este é
    // também o único estado em que o cartão do topo NÃO está na tela
    // (`CartaoProntidao` some quando `proximo === null`), então esta é a única
    // coisa que o operador tem para ler — e ela não pode apontar para um
    // cartão ausente.
    return (
      <Painel titulo="Sem sessões registradas">
        O prontuário está pronto. Assim que a primeira sessão for documentada e
        consolidada, a evolução aparece aqui.
      </Painel>
    );
  }

  const { degraus, proximo } = prontidao;

  // Só o degrau BLOQUEANTE trava o gráfico. Contar todo degrau não concluído
  // faria a tela afirmar que anamnese pendente impede a evolução de existir —
  // e ela não impede: `materializar.ts` descarta evidência sem meta resolvida,
  // não sem anamnese. A frase precisa distinguir "falta o que trava" de "falta
  // o que é recomendado", senão manda o operador resolver o degrau errado.
  const bloqueantes = degraus.filter((d) => d.estado === "bloqueante").length;

  if (bloqueantes === 0) {
    return (
      <Painel titulo="A evolução ainda não pode ser calculada">
        Nenhum passo obrigatório falta. A evolução aparece assim que a primeira
        sessão for documentada e consolidada. O cartão “
        {TITULO_CARTAO_PRONTIDAO}”, no topo desta página, mostra o que ainda é
        recomendado.
      </Painel>
    );
  }

  return (
    <Painel titulo="A evolução ainda não pode ser calculada">
      {bloqueantes === 1
        ? "Falta 1 passo obrigatório"
        : `Faltam ${bloqueantes} passos obrigatórios`}{" "}
      para a sessão gerar dado — o próximo é <strong>{proximo.rotulo}</strong>.
      O cartão “{TITULO_CARTAO_PRONTIDAO}”, no topo desta página, lista todos e
      leva ao próximo.
    </Painel>
  );
}
