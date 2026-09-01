// Máquina de estados canônica da sessão (jornada-sessao-unificada.md §3.1, §3.3).
// Nenhum estado novo no banco: tudo aqui é derivado por leitura do que já
// existe em `session`, `session_note` e `extraction`. Função pura, zero I/O —
// quem chama busca as linhas e passa `agora` (R-04: determinismo do teste de
// janela de 24h depende de não instanciar a hora atual escondida aqui dentro).
import type { sessionEstado } from "@/db/schema";

type SessionEstado = (typeof sessionEstado.enumValues)[number];

export type EstadoSessao =
  | "agendada"
  | "realizada"
  | "documentada"
  | "revisada"
  | "no_acervo"
  | "falta"
  | "cancelada"
  | "precisa_atencao";

export type MotivoAtencao =
  "extracao_travada" | "sem_nota_apos_24h" | "na_fila_validacao";

export type GestoPrimario =
  | "registrar_sessao"
  | "documentar"
  | "revisar_evidencias"
  | "ver_no_acervo"
  | "reprocessar_extracao";

export type EntradaSessao = {
  estado: SessionEstado;
  agendadaPara: Date;
  temNotaConsolidada: boolean;
  extracoes: ReadonlyArray<{
    estado:
      | "sugerida"
      | "pendente_reprocessamento"
      | "aprovada"
      | "editada"
      | "descartada"
      | "erro_validacao";
  }>;
  itensNaFilaValidacao: number;
};

export type ResultadoEstado =
  | {
      estado: Exclude<EstadoSessao, "precisa_atencao">;
      motivo?: undefined;
      gesto: GestoPrimario | null;
    }
  | { estado: "precisa_atencao"; motivo: MotivoAtencao; gesto: GestoPrimario };

const VINTE_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

const ESTADOS_TERMINAIS_ATENDIMENTO: ReadonlySet<SessionEstado> = new Set([
  "falta_paciente",
  "falta_terapeuta",
  "cancelada",
]);

function todaExtracaoDecidida(entrada: EntradaSessao): boolean {
  return entrada.extracoes.every(
    (e) =>
      e.estado === "aprovada" ||
      e.estado === "editada" ||
      e.estado === "descartada",
  );
}

function motivoAtencao(
  entrada: EntradaSessao,
  agora: Date,
): MotivoAtencao | null {
  const extracaoTravada = entrada.extracoes.some(
    (e) =>
      e.estado === "pendente_reprocessamento" || e.estado === "erro_validacao",
  );
  if (extracaoTravada) return "extracao_travada";

  const semNotaApos24h =
    entrada.estado === "realizada" &&
    !entrada.temNotaConsolidada &&
    agora.getTime() - entrada.agendadaPara.getTime() > VINTE_QUATRO_HORAS_MS;
  if (semNotaApos24h) return "sem_nota_apos_24h";

  // "na_fila_validacao" é exceção só enquanto a sessão AINDA NÃO terminou a
  // revisão das extrações (doc: "a sessão trava e volta para a fila" — volta
  // de onde já tinha avançado). Uma vez revisada (toda extração decidida),
  // estar na fila é o caminho normal rumo a no_acervo, não uma pendência —
  // por isso este motivo não dispara depois de revisada (senão "revisada"
  // seria indistinguível de "no_acervo": ambas teriam a mesma condição de
  // entrada — extrações decididas + fila vazia — tornando "revisada" um
  // estado matematicamente inalcançável).
  if (entrada.itensNaFilaValidacao > 0 && !todaExtracaoDecidida(entrada)) {
    return "na_fila_validacao";
  }

  return null;
}

function gestoParaMotivo(motivo: MotivoAtencao): GestoPrimario {
  switch (motivo) {
    case "extracao_travada":
      return "reprocessar_extracao";
    case "sem_nota_apos_24h":
      return "documentar";
    case "na_fila_validacao":
      return "revisar_evidencias";
  }
}

export function deriveEstadoSessao(
  entrada: EntradaSessao,
  agora: Date,
): ResultadoEstado {
  // Terminais primeiro. Falta/cancelada são desfecho, não falha: não há mais
  // trabalho clínico a fazer numa sessão cancelada, então nenhum ramo de
  // exceção deve reabri-la como pendência — mesmo que sobre extração travada
  // ou item preso na fila. Por isso a ordem real de avaliação diverge da
  // tabela do doc (que lista precisa_atencao antes dos terminais): aqui os
  // terminais são checados antes, e só então o ramo de exceção.
  if (ESTADOS_TERMINAIS_ATENDIMENTO.has(entrada.estado)) {
    return {
      estado: entrada.estado === "cancelada" ? "cancelada" : "falta",
      gesto: null,
    };
  }

  // precisa_atencao é ramo de exceção, não posição na fila: vence qualquer
  // outro estado não-terminal, inclusive no_acervo.
  const motivo = motivoAtencao(entrada, agora);
  if (motivo !== null) {
    return {
      estado: "precisa_atencao",
      motivo,
      gesto: gestoParaMotivo(motivo),
    };
  }

  if (entrada.estado === "agendada") {
    return { estado: "agendada", gesto: "registrar_sessao" };
  }

  // A partir daqui, entrada.estado === "realizada".
  if (!entrada.temNotaConsolidada) {
    return { estado: "realizada", gesto: "documentar" };
  }

  const existeExtracaoSugerida = entrada.extracoes.some(
    (e) => e.estado === "sugerida",
  );
  if (existeExtracaoSugerida) {
    return { estado: "documentada", gesto: "revisar_evidencias" };
  }

  if (!todaExtracaoDecidida(entrada)) {
    // Estado transitório fora da tabela (ex.: sem extrações ainda geradas
    // após a nota consolidada). Trata como "documentada" por ser o passo em
    // aberto mais próximo — não há gesto de revisão útil sem extração.
    return { estado: "documentada", gesto: "revisar_evidencias" };
  }

  if (entrada.itensNaFilaValidacao === 0) {
    return { estado: "no_acervo", gesto: "ver_no_acervo" };
  }

  return { estado: "revisada", gesto: "ver_no_acervo" };
}
