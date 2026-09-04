"use client";

import { Chip } from "@/components/ui/chip";
import { EstadoDeErro } from "./estado-de-erro";
import type { RotinaDaSessao } from "./queries";
import type { Papel } from "@/auth/papel-ativo";
import { surface } from "@/components/ui/primitives/surface";

/**
 * Bloco de rotinas da aba Evolução (#558 · T5 · G-4 (b)).
 *
 * Mostra a rotina COMO ROTINA — etapa a etapa, ao longo das sessões. É a
 * superfície que faltava: desde a T2 cada etapa de uma cadeia aprovada vira
 * uma linha de `evidence`, e desde a T3 uma etapa ancorada entra no
 * `session_snapshot`. Mas dentro do hexágono a rotina some na média do eixo, e
 * o coordenador não vê que houve rotina, nem qual etapa andou.
 *
 * O que este bloco NÃO faz: somar cadeia aos marcos. `renderGraficoProtocolo`
 * continua contando METAS (G-4 (b)) — misturar as duas unidades faria a barra
 * de marcos crescer por um dado que não é marco.
 *
 * Três decisões que este componente carrega:
 *
 * 1. **Falha de leitura nunca vira estado vazio** (R4.3). `rotinas === null` é
 *    "não sabemos" e renderiza `EstadoDeErro`; `[]` é "não há rotina
 *    registrada" e renderiza o vazio. Um `catch` que colapsasse os dois faria
 *    uma oscilação de rede afirmar que o paciente não tem rotina nenhuma.
 * 2. **Âncora dita em texto** (R4.2/US-2). Cadeia sem âncora é registro válido,
 *    mas fica fora da evolução — e a tela diz isso, em vez de deixar o
 *    coordenador supor que aprovou dado que o gráfico usa.
 * 3. **Nível fora da taxonomia aparece** (G-6 (a)). "Não classificado" é um
 *    rótulo textual visível, não um silêncio nem um `0` — `0` é o primeiro
 *    nível da taxonomia, o melhor resultado possível.
 *
 * Significado nunca depende só de cor: cada `Chip` carrega o texto que o
 * explica (§4C do design system).
 */
export interface BlocoRotinasProps {
  /** `null` = falha ao ler. `[]` = nenhuma rotina registrada. */
  rotinas: RotinaDaSessao[] | null;
  /** Papel ATIVO do leitor — decide se o bloco clínico existe para ele. */
  papel: Papel;
  onTentarDeNovo: () => void;
}

export function BlocoRotinas({
  rotinas,
  papel,
  onTentarDeNovo,
}: BlocoRotinasProps) {
  // D-A9: a recepção não recebe selo clínico. `requireRole` da rota já recusa
  // `admin_recepcao` antes daqui — este ramo é a mesma régua dita no
  // componente (precedente de `EvolucaoVazia`), para que o bloco não passe a
  // vazar conteúdo clínico se um dia for montado em outra rota.
  if (papel === "admin_recepcao") return null;

  return (
    <section
      aria-labelledby="rotinas-titulo"
      className={surface("solida", { radius: "control", className: "p-4" })}
    >
      <div className="mb-3 flex flex-col gap-1">
        <h3
          id="rotinas-titulo"
          className="font-display text-lg font-black text-[var(--text-primary)]"
        >
          Rotinas
        </h3>
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          Cadeias de suporte aprovadas, etapa a etapa, da sessão mais recente
          para trás.
        </p>
      </div>

      {rotinas === null ? (
        <EstadoDeErro
          titulo="Não foi possível carregar as rotinas"
          descricao="A leitura falhou. Nada aqui deve ser lido como ausência de rotina registrada."
          onTentarDeNovo={onTentarDeNovo}
        />
      ) : rotinas.length === 0 ? (
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Nenhuma rotina registrada até aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rotinas.map((rotina) => (
            <li key={rotina.extractionId}>
              <RotinaCartao rotina={rotina} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RotinaCartao({ rotina }: { rotina: RotinaDaSessao }) {
  return (
    <div className="rounded-[var(--radius-xs)] border-2 border-[var(--border-brutal)]/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-bold text-[var(--text-primary)]">
          {rotina.nome ?? "Rotina sem nome"}
        </span>
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Sessão {rotina.sessionNumero}
        </span>
      </div>

      {/* Procedência da âncora em TEXTO — US-2. */}
      {rotina.ancorada ? (
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
          <Chip variante="success">Na evolução</Chip>{" "}
          <span className="ml-1">
            Ancorada em {rotina.metaDescricao ?? "meta do paciente"}.
          </span>
        </p>
      ) : (
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
          <Chip variante="warning">Fora da evolução</Chip>{" "}
          <span className="ml-1">
            Sem meta ancorada: fica na trilha de auditoria e não entra no
            gráfico de evolução.
          </span>
        </p>
      )}

      {/* `<ol>`: a ordem das etapas É o dado (G-2 (a) — o índice do array). */}
      <ol className="flex flex-col gap-1">
        {rotina.etapas.map((etapa) => (
          <li
            key={etapa.ordinal}
            className="flex flex-wrap items-baseline gap-2 text-sm text-[var(--text-primary)]"
          >
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {etapa.ordinal + 1}.
            </span>
            <span className="font-medium">
              {etapa.descricao ?? "Etapa sem descrição"}
            </span>
            {etapa.naoClassificado ? (
              // Havia nível declarado e a taxonomia do protocolo não o conhece.
              // Dito, não convertido em progresso.
              <Chip variante="warning">
                Nível não classificado: {etapa.nivelAjuda}
              </Chip>
            ) : etapa.nivelAjuda ? (
              <Chip variante="neutral">{etapa.nivelAjuda}</Chip>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
