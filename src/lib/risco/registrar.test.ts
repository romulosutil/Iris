import { describe, expect, test } from "vitest";
import {
  registrarAlertaRiscoInstrumento,
  severidadePorItem9Valor,
} from "./registrar";
import type { TenantContext } from "@/db/rls";

// #393 T5 — mapeamento de item9Valor -> severidade (design.md §"3. Severidade
// por valor do item 9"). Unit puro: sem banco, sem withTenant.

describe("severidadePorItem9Valor", () => {
  const FALLBACK = "ideacao_ativa_sem_plano" as const;

  test("item9Valor=0 retorna null (sentinela de não disparar)", () => {
    expect(severidadePorItem9Valor(0, FALLBACK)).toBeNull();
  });

  test("item9Valor=1 é sempre ideacao_passiva", () => {
    expect(severidadePorItem9Valor(1, FALLBACK)).toBe("ideacao_passiva");
  });

  test("item9Valor=2 é ideacao_ativa_sem_plano, nunca com_plano", () => {
    expect(severidadePorItem9Valor(2, FALLBACK)).toBe(
      "ideacao_ativa_sem_plano",
    );
  });

  test("item9Valor=3 é ideacao_ativa_sem_plano, nunca com_plano (frequência máxima não é plano)", () => {
    expect(severidadePorItem9Valor(3, FALLBACK)).toBe(
      "ideacao_ativa_sem_plano",
    );
  });

  test("item9Valor=null (recusa) preserva o fallback — recusa não rebaixa severidade (§1.4)", () => {
    expect(severidadePorItem9Valor(null, FALLBACK)).toBe(FALLBACK);
    expect(severidadePorItem9Valor(null, "ideacao_ativa_com_plano")).toBe(
      "ideacao_ativa_com_plano",
    );
  });

  test("item9Valor=undefined (chamador antigo, ex. Fase E de #391) preserva o fallback — zero mudança de comportamento", () => {
    expect(severidadePorItem9Valor(undefined, FALLBACK)).toBe(FALLBACK);
  });

  test("valor fora do domínio 0-3 (defensivo) preserva o fallback em vez de inventar severidade", () => {
    expect(severidadePorItem9Valor(4, FALLBACK)).toBe(FALLBACK);
    expect(severidadePorItem9Valor(-1, FALLBACK)).toBe(FALLBACK);
  });
});

describe("registrarAlertaRiscoInstrumento — item9Valor=0 é no-op sem tocar banco", () => {
  test("retorna naoDisparado:true sem chamar withTenant (ctx inválido não estoura)", async () => {
    // ctx propositalmente incompleto: se a função tentasse abrir transação,
    // `withTenant` estouraria por campos faltando. Chegar em `naoDisparado`
    // prova que o retorno precoce acontece ANTES de qualquer acesso a banco.
    const ctxInvalido = {} as TenantContext;
    const r = await registrarAlertaRiscoInstrumento(ctxInvalido, {
      patientId: "pac-1",
      sessionId: "sess-1",
      extractionId: "ext-1",
      sinal: {
        categoria: "ideacao_suicida",
        severidade: "ideacao_ativa_sem_plano",
        certeza: "explicito",
        trecho_fonte: "trecho qualquer",
        detalhe: "detalhe qualquer",
      },
      item9Valor: 0,
    });
    expect(r).toEqual({ naoDisparado: true });
  });
});
