import { describe, it, expect, vi } from "vitest";
import { comporRefs, mesclarPropsSlot } from "./slot";

describe("mesclarPropsSlot", () => {
  it("restaura o handler do slot quando o filho traz a chave com undefined", () => {
    const doSlot = vi.fn();
    const mescladas = mesclarPropsSlot(
      { onClick: doSlot },
      { onClick: undefined },
    );
    (mescladas.onClick as (evento: unknown) => void)({});
    expect(doSlot).toHaveBeenCalledTimes(1);
  });

  it("combina style dos dois lados (filho vence chave a chave)", () => {
    const mescladas = mesclarPropsSlot(
      { style: { color: "red", marginTop: 4 } },
      { style: { color: "blue" } },
    );
    expect(mescladas.style).toEqual({ color: "blue", marginTop: 4 });
  });
});

describe("comporRefs", () => {
  it("executa cleanup retornado por callback ref e detach com null nos demais", () => {
    const limpeza = vi.fn();
    const comCleanup = vi.fn(() => limpeza);
    const semCleanup = vi.fn();
    const refObjeto = { current: null as HTMLElement | null };

    const composto = comporRefs<HTMLElement>(comCleanup, semCleanup, refObjeto);
    const node = {} as HTMLElement;
    const retorno = composto(node);

    expect(refObjeto.current).toBe(node);
    expect(typeof retorno).toBe("function");

    (retorno as () => void)();
    expect(limpeza).toHaveBeenCalledTimes(1);
    expect(semCleanup).toHaveBeenLastCalledWith(null);
    expect(refObjeto.current).toBeNull();
  });
});
