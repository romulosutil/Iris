import { codigoPg } from "@/db/pg-error";

/**
 * Copy de erro para a UI — fonte única (#531, achados U-01 e S-10).
 *
 * Tom literal e sem culpa (Regra 0 do design system): diz o que aconteceu e
 * o que fazer, nunca "você errou". O `{codigo}` é o `correlacaoId` que
 * `logarErroSemPII` devolveu — o usuário passa para a coordenação, o
 * operador procura no log. É o ÚNICO dado que atravessa da exceção para a
 * tela: a `message` de um erro de driver carrega SQL + params (a nota
 * clínica), e por isso `mensagemDeExcecao` nunca a devolve.
 */
export type CopyErro = { titulo: string; acao: string };

export const COPY_ERROS = {
  /** Sentinela das actions (`revisao`, `supervisao`, `validacao`, …). */
  CONCURRENCY_ERROR: {
    titulo: "Alguém alterou esta evidência antes de você.",
    acao: "Recarregue para ver a versão atual.",
  },
  ERRO_INTERNO: {
    titulo: "Não foi possível concluir.",
    acao: "Tente de novo; se repetir, avise a coordenação (código {codigo}).",
  },
  /** unique_violation */
  "23505": {
    titulo: "Já existe um registro igual a este.",
    acao: "Confira o que já está cadastrado antes de tentar de novo.",
  },
  /** foreign_key_violation */
  "23503": {
    titulo: "Este registro depende de outro que não existe mais.",
    acao: "Recarregue a página para ver o estado atual.",
  },
  /** exclusion_violation (agenda: horário sobreposto) */
  "23P01": {
    titulo: "Este horário conflita com outro já marcado.",
    acao: "Escolha outro horário ou ajuste o compromisso existente.",
  },
  /** insufficient_privilege */
  "42501": {
    titulo: "Seu papel não permite esta ação.",
    acao: "Se precisar dela, peça à coordenação.",
  },
  /** raise_exception — guard de função SECURITY DEFINER */
  P0001: {
    titulo: "Uma regra da clínica impediu esta ação.",
    acao: "Recarregue e confira o estado atual; se repetir, avise a coordenação (código {codigo}).",
  },
} as const satisfies Record<string, CopyErro>;

export type CodigoErro = keyof typeof COPY_ERROS;

function ehCodigoConhecido(codigo: string | undefined): codigo is CodigoErro {
  return codigo !== undefined && Object.hasOwn(COPY_ERROS, codigo);
}

/** Copy do código, ou `ERRO_INTERNO` quando não há mapeamento. */
export function copyDeErro(codigo: string | undefined): CopyErro {
  return ehCodigoConhecido(codigo)
    ? COPY_ERROS[codigo]
    : COPY_ERROS.ERRO_INTERNO;
}

/**
 * `titulo` + `acao` numa frase. Sem `correlacaoId`, o parêntese
 * "(código …)" sai inteiro — melhor do que mostrar "{codigo}" cru ou um
 * código que não existe no log.
 */
export function textoDeErro(
  codigo: string | undefined,
  correlacaoId?: string,
): string {
  const { titulo, acao } = copyDeErro(codigo);
  const acaoFinal = correlacaoId
    ? acao.replace("{codigo}", correlacaoId)
    : acao.replace(/ \(código \{codigo\}\)/, "");
  return `${titulo} ${acaoFinal}`;
}

export function textoErroInterno(correlacaoId: string): string {
  return textoDeErro("ERRO_INTERNO", correlacaoId);
}

/**
 * Fronteira da UI para `state.error`: traduz sentinela técnica
 * (`CONCURRENCY_ERROR`) para copy; texto já humano (zod, RoleError) passa
 * como está.
 */
export function mensagemDeErro(error: string | undefined): string | undefined {
  if (error === undefined) return undefined;
  return ehCodigoConhecido(error) ? textoDeErro(error) : error;
}

/**
 * Exceção cuja `message` É copy para o usuário, por construção — a única
 * classe que `mensagemDeExcecao` deixa atravessar. Use para regras de
 * negócio lançadas de dentro de uma transação (o throw garante o ROLLBACK).
 */
export class ErroComCopy extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroComCopy";
  }
}

/**
 * S-10: o que uma exceção capturada vira na tela. Nunca `e.message` de
 * driver — SQLSTATE conhecido vira a copy dele; o resto vira `ERRO_INTERNO`
 * com o `correlacaoId` do log.
 */
export function mensagemDeExcecao(err: unknown, correlacaoId: string): string {
  if (err instanceof ErroComCopy) return err.message;
  return textoDeErro(codigoPg(err), correlacaoId);
}
