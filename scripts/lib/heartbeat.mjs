/**
 * #536 (DA-03) — heartbeat dos jobs de infra no BANCO (`job_heartbeat`, 0146).
 *
 * Até aqui cada job gravava `.ultima-*` num volume que só o próprio container
 * enxerga: `scripts/alarme-jobs.mjs` cobria 3 de 8 jobs porque só conseguia
 * medir o que tinha efeito colateral visível no banco (ciclo vencido, alerta
 * vencido) ou num bucket (dump). Retenção, arquivamento, exportação, ASR,
 * expurgo do audit_log e conciliação paravam em silêncio. Com o heartbeat no
 * banco, o detector lê UMA tabela e cobre todos.
 *
 * `.mjs` puro, sem tsx: roda dentro das imagens magras de infra
 * (`infra/<serviço>/Dockerfile`), que copiam este arquivo à mão — um `import` novo
 * aqui precisa entrar no `COPY`/`npm install` de cada imagem (memória
 * `imagem-escalonamento-nao-herda-app`).
 *
 * REGRA DE OURO — NADA DE PII: o `detalhe` sai no e-mail de alarme e cruza
 * clínicas. `detalheSemPii` só deixa passar números e booleanos; `name` +
 * `code` do erro entram, `message` nunca (num `DrizzleQueryError`/`PostgresError`
 * a `message` carrega SQL + params).
 */

import { logarAviso } from "./log-estruturado.mjs";

/**
 * Serializa contagens como `chave=valor chave=valor`. Só NÚMEROS finitos e
 * BOOLEANOS passam; qualquer string — id, nome, trecho, mensagem de erro — é
 * descartada aqui, na origem, e não depende de quem chama lembrar de filtrar.
 */
export function detalheSemPii(contagens) {
  return Object.entries(contagens ?? {})
    .filter(
      ([, v]) =>
        typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)),
    )
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

/**
 * Categoria de um erro para o `detalhe` de heartbeat de FALHA: `name` + `code`,
 * nunca `message`.
 */
export function detalheDoErro(err) {
  // Os jobs embrulham o erro do driver (`new Error("falha no lote 3 …", {
  // cause })`): o `code` que interessa está na `cause`, não no embrulho.
  const alvo =
    err && typeof err === "object" && err.cause && typeof err.cause === "object"
      ? err.cause
      : err;
  const name =
    alvo && typeof alvo === "object" && "name" in alvo ? alvo.name : "";
  const code =
    alvo && typeof alvo === "object" && "code" in alvo ? alvo.code : "";
  return `erro=${name || "desconhecido"}${code ? ` code=${code}` : ""}`;
}

/**
 * Grava o heartbeat de `job` chamando a função definer da 0146.
 *
 * NUNCA lança: a varredura já aconteceu (ou já falhou) quando isto roda, e um
 * heartbeat que estoura não pode transformar `exit 0` em `exit 1` nem mascarar
 * o erro real do job. Se o heartbeat não gravou, o canal que acusa isso é o
 * próprio detector (ausência de heartbeat = alarme), não este laço.
 *
 * Devolve `true` se gravou, `false` se não — só para o log do chamador.
 */
export async function gravarHeartbeat(sql, job, { ok, detalhe = "" } = {}) {
  try {
    await sql`SELECT app_job_heartbeat_gravar(${job}, ${ok}, ${detalhe})`;
    return true;
  } catch (err) {
    // `logarAviso`, e não `log.warn`: o que se loga aqui É um erro do banco, e
    // a `message` do driver carrega a query com os params. O helper reduz ao
    // conjunto fechado (classe, SQLSTATE, constraint, hash) antes do registro.
    logarAviso("heartbeat.gravacao-falhou", err, { job });
    return false;
  }
}
