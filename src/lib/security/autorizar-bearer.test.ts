// @vitest-environment node
/**
 * A-05 (auditoria 360, #530) — a comparação de bearer das rotas internas de
 * job, medida UMA vez, no único lugar em que ela mora.
 *
 * Antes havia quatro cópias (`billing/fechar-ciclos`, `billing/conciliar`,
 * `jobs/asr-transcrever`, `jobs/exportacao-integral`), e a revisão T22 do ASR
 * achou um defeito numa delas (curto-circuito de comprimento). Cada cópia era
 * um lugar para o mesmo bug; este arquivo é o oráculo do lugar que sobrou.
 *
 * Todo token errado aqui é construído com o MESMO número de bytes do certo
 * quando o caso quer chegar ao comparador: é o único formato que atravessa o
 * filtro de comprimento. E há um caso de PREFIXO de propósito — é ele que
 * mata o mutante "troca `timingSafeEqual` por `startsWith`".
 */
import { describe, expect, it } from "vitest";
import { autorizarBearer } from "./autorizar-bearer";

const SEGREDO = "segredo-do-job-a05-2026";

describe("autorizarBearer", () => {
  it("aceita o token exato com o esquema `Bearer `", () => {
    expect(autorizarBearer(`Bearer ${SEGREDO}`, SEGREDO)).toBe(true);
  });

  it("recusa header ausente (null/undefined) e header vazio", () => {
    expect(autorizarBearer(null, SEGREDO)).toBe(false);
    expect(autorizarBearer(undefined, SEGREDO)).toBe(false);
    expect(autorizarBearer("", SEGREDO)).toBe(false);
  });

  it("recusa TUDO quando o segredo esperado está ausente ou em branco (fail-closed)", () => {
    // Deploy sem o segredo recusa, nunca "libera porque não configurou".
    expect(autorizarBearer(`Bearer ${SEGREDO}`, undefined)).toBe(false);
    expect(autorizarBearer(`Bearer ${SEGREDO}`, "")).toBe(false);
    // Par vazio × vazio: `Bearer ` sem nada depois contra esperado em branco
    // teria comprimento igual (0) e `timingSafeEqual` casaria — o guard de
    // esperado vazio tem de vir ANTES da comparação.
    expect(autorizarBearer("Bearer ", "")).toBe(false);
  });

  it("recusa o token cru, sem o esquema `Bearer `", () => {
    expect(autorizarBearer(SEGREDO, SEGREDO)).toBe(false);
  });

  it("recusa esquema em caixa diferente (`bearer `) — só o esquema exato dos nossos scripts", () => {
    expect(autorizarBearer(`bearer ${SEGREDO}`, SEGREDO)).toBe(false);
  });

  it("recusa token de MESMO comprimento e conteúdo diferente", () => {
    // Este é o caso que mata `return true` depois do filtro de comprimento.
    const falso = "x".repeat(SEGREDO.length);
    expect(falso).toHaveLength(SEGREDO.length);
    expect(autorizarBearer(`Bearer ${falso}`, SEGREDO)).toBe(false);
  });

  it("recusa token que difere em UM byte no fim", () => {
    const quaseIgual = `${SEGREDO.slice(0, -1)}!`;
    expect(quaseIgual).toHaveLength(SEGREDO.length);
    expect(autorizarBearer(`Bearer ${quaseIgual}`, SEGREDO)).toBe(false);
  });

  it("recusa PREFIXO do segredo (mata o mutante `startsWith`)", () => {
    // Um comparador por prefixo aceitaria "segredo" contra "segredo-do-job…".
    const prefixo = SEGREDO.slice(0, 7);
    expect(SEGREDO.startsWith(prefixo)).toBe(true);
    expect(autorizarBearer(`Bearer ${prefixo}`, SEGREDO)).toBe(false);
  });

  it("recusa token com sobra no fim (segredo é prefixo do recebido)", () => {
    expect(autorizarBearer(`Bearer ${SEGREDO}-sobra`, SEGREDO)).toBe(false);
  });

  it("compara em BYTES, não em caracteres (multi-byte de mesmo tamanho em chars)", () => {
    // "é" tem 2 bytes em UTF-8; "e" tem 1. Mesmo número de caracteres, bytes
    // diferentes: o filtro de comprimento em bytes já separa, e nenhum
    // `timingSafeEqual` pode receber buffers de tamanhos distintos (lança).
    expect(autorizarBearer("Bearer café", "cafe")).toBe(false);
    expect(autorizarBearer("Bearer café", "café")).toBe(true);
  });
});
