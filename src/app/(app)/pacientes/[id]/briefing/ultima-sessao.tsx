import { Stack } from "@/components/ui/layout";
import type { UltimaSessao } from "./queries";

/**
 * ÚLTIMA SESSÃO — 3 linhas escaneáveis (fluxos-e-wireframes.md §1.1). Lê o
 * `session_snapshot` já materializado (rótulo/métrica computados na
 * materialização); aqui só formata. 🆕 marca meta/marco em estado "candidata"
 * (is_candidata) — reforça visualmente "candidato ≠ conquistado" mesmo num
 * resumo de 3 linhas.
 */
export function UltimaSessaoSection({
  ultimaSessao,
}: {
  ultimaSessao: UltimaSessao | null;
}) {
  if (!ultimaSessao) {
    return (
      <p className="text-text-body text-sm">
        Nenhuma sessão anterior registrada ainda para este paciente.
      </p>
    );
  }
  const { linhas, episodiosAbc } = ultimaSessao;
  return (
    <Stack gap="sm" como="ul">
      {linhas.length === 0 ? (
        <li className="text-text-body text-sm">
          Sem itens registrados na última sessão.
        </li>
      ) : (
        linhas.map((l) => (
          <li key={l.chave} className="text-text-body text-sm">
            {l.rotulo} — {l.metrica}
            {l.isCandidata ? (
              <span
                aria-label="candidato — ainda não consolidado"
                className="ml-1"
              >
                🆕
              </span>
            ) : null}
          </li>
        ))
      )}
      {episodiosAbc > 0 ? (
        <li className="text-text-body text-sm">
          {episodiosAbc} episódio{episodiosAbc > 1 ? "s" : ""} ABC registrado
          {episodiosAbc > 1 ? "s" : ""}
        </li>
      ) : null}
    </Stack>
  );
}
