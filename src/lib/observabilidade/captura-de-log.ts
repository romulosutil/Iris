import {
  instalarSink,
  restaurarSinkPadrao,
  substituirNaoSerializavel,
  type RegistroLog,
} from "./logger";

/**
 * Captura de registros do logger, para teste (#560, fatia F2).
 *
 * ## Por que existe
 *
 * Antes da migração, um teste que quisesse provar "esta linha saiu, e sem a
 * `message`" espionava `console.warn` e lia `calls[0][1].grupo` — o objeto de
 * contexto como SEGUNDO argumento. Depois da migração o registro sai pelo
 * `sinkConsole`, que emite **uma string JSON** num argumento só. O espião
 * continuaria funcionando (o sink usa o `console`), mas o oráculo viraria
 * `JSON.parse(calls[0][0])` espalhado por seis arquivos de teste — e o
 * primeiro que esquecesse o `parse` passaria verde comparando `undefined` com
 * `undefined`.
 *
 * Aqui o teste lê o registro **antes do transporte**, já redigido por
 * {@link import("./redacao").redigirContexto}. Isso é o que interessa: a
 * garantia de PII é do núcleo, não do sink, e é ela que o teste precisa medir.
 *
 * Não é `server-only` e não é `.test.ts` de propósito: é importado tanto por
 * `*.test.ts` quanto por `*.int.test.ts`, em `src/lib` e em `src/app`.
 *
 * ```ts
 * const log = capturarLog();
 * try {
 *   await conciliarPagamentoDeCiclo(...);
 *   expect(log.evento("billing-recusa.cobranca-de-ciclo-recusada")?.grupo)
 *     .toBe("G0");
 * } finally {
 *   log.restaurar();
 * }
 * ```
 */
export type CapturaDeLog = {
  /** Todos os registros emitidos desde a instalação, em ordem. */
  registros: RegistroLog[];
  /** O primeiro registro com aquele `evento`, ou `undefined`. */
  evento: (nome: string) => RegistroLog | undefined;
  /** Houve algum registro com aquele `evento`? */
  houve: (nome: string) => boolean;
  /**
   * Tudo que foi capturado, serializado — para a asserção negativa ("o
   * destinatário NÃO aparece em lugar nenhum do log"). Usa o mesmo replacer do
   * `sinkConsole`: um `bigint` no contexto (o driver devolve
   * `acervo.bytes_tamanho` e afins assim) faria o `JSON.stringify` nativo
   * lançar `TypeError: Do not know how to serialize a BigInt` dentro da
   * asserção, derrubando o teste por um motivo que não é o que ele mede.
   */
  bruto: () => string;
  /** Devolve o sink padrão. Chamar sempre em `finally`. */
  restaurar: () => void;
};

export function capturarLog(): CapturaDeLog {
  const registros: RegistroLog[] = [];
  instalarSink((registro) => {
    registros.push(registro);
  });
  return {
    registros,
    evento: (nome) => registros.find((r) => r.evento === nome),
    houve: (nome) => registros.some((r) => r.evento === nome),
    bruto: () => JSON.stringify(registros, substituirNaoSerializavel),
    restaurar: () => restaurarSinkPadrao(),
  };
}
