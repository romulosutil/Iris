"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";

/**
 * Estados de tela adicionais de `/sessoes` (#512 · T04 · R-31): "primeira
 * vez", "volume alto" e "sem permissão". Os outros quatro dos sete estados
 * do R-31 vivem em: `default`/`vazio` (`./fila-item.tsx`, `FilaLista`),
 * `carregando` (`./loading.tsx`), `erro` (`./error.tsx`).
 */

const CHAVE_VISITA = "iris_sessoes_visitado";

/**
 * Aviso "primeira vez" (R-31).
 *
 * T03 não expõe nenhum sinal de banco que distinga "fila zerada depois de
 * trabalho" de "nunca existiu nada aqui" — os dois casos chegam como
 * `itens: []`. Sem uma leitura nova (fora do escopo desta task, que é só UI),
 * a distinção possível sem tocar `queries.ts` é por VISITA do navegador: na
 * primeira vez que este navegador abre `/sessoes` com a fila vazia, mostra
 * uma linha de boas-vindas além do empty-state padrão; da segunda visita em
 * diante, só "Nada travado" (R-33), sem o texto extra.
 *
 * `localStorage` sempre dentro de `try/catch` — janela anônima ou bloqueio de
 * cookies de terceiros pode estourar a leitura/escrita (mesma régua de
 * `src/components/ui/*sidebar*` para R-25). Falha aqui nunca impede o
 * empty-state real de renderizar: ela só suprime o aviso extra.
 */
export function AvisoPrimeiraVisita({ ativo }: { ativo: boolean }) {
  // Leitura pura no inicializador preguiçoso do `useState` (roda uma vez, sem
  // `setState` dentro de efeito — mantém `react-hooks/set-state-in-effect`
  // quieto, mesma régua de `encerrar-vinculo-form.tsx`). A ESCRITA (marcar
  // como visitado) é o único efeito colateral, e não muda estado.
  const [primeiraVisita] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(CHAVE_VISITA) === null;
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_VISITA, "1");
    } catch {
      // Sem storage disponível (janela anônima, bloqueio): nada a persistir,
      // sem quebrar a tela.
    }
  }, []);

  if (!primeiraVisita || !ativo) return null;

  return (
    <Alert severidade="info" titulo="Bem-vindo à fila de sessões">
      Aqui aparecem só as sessões que precisam de você agora — extração travada,
      nota sem consolidar há mais de 24h ou evidência esperando revisão. O resto
      do histórico mora no acervo do paciente.
    </Alert>
  );
}

/**
 * Limiar de "volume alto" (R-31). Decisão desta task, documentada por não
 * haver medição de "fila confortável" no repo: 20 sessões no escopo — acima
 * do tamanho de página default (10, `queries.ts`), sem disparar em clínica
 * pequena com uma dúzia de sessões esparsas. Se a medição real divergir, o
 * limiar é local, uma constante.
 */
const LIMIAR_VOLUME_ALTO = 20;

export function volumeAlto(totalNoEscopo: number): boolean {
  return totalNoEscopo > LIMIAR_VOLUME_ALTO;
}

export function AvisoVolumeAlto({ totalNoEscopo }: { totalNoEscopo: number }) {
  if (!volumeAlto(totalNoEscopo)) return null;
  return (
    <Alert severidade="info" titulo="Fila grande">
      {totalNoEscopo} sessões travadas no escopo. A ordenação “Tempo travado”
      prioriza as mais antigas primeiro.
    </Alert>
  );
}

// #533 — `AvisoCentralValidacao` ("A Central de Validação virou Sessões",
// #512 · T14 · R-35) saiu: `/validacao` voltou a ser a fila por evidência
// (PR-01) e não redireciona mais com `?de=validacao`. A dica nunca dispararia
// e, se disparasse, mentiria.

/**
 * "Sem permissão" (R-31): `admin_recepcao` não tem fila própria (R-23,
 * `@/lib/sessao/fila` já devolve `[]` sem tocar o banco). Mostrar "Nada
 * travado" para este papel afirmaria "está tudo em dia" para quem nunca teve
 * acesso a essa leitura — uma mentira por omissão. Este componente diz por
 * extenso que a tela não é deste papel.
 */
export function SemPermissaoSessoes() {
  return (
    <Alert
      severidade="info"
      titulo="Sessões não faz parte deste papel"
      destacado
    >
      A fila de sessões é para quem atende ou coordena. Fale com o coordenador
      da clínica se precisar acompanhar alguma sessão específica.
    </Alert>
  );
}
