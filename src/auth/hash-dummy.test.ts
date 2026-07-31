/**
 * Memoização do hash dummy de simetria de tempo (Fatia A, #163, Task 7,
 * rodada de correção 3).
 *
 * O hash existe para o ramo "conta sem credencial de senha" gastar o mesmo
 * scrypt dos outros ramos (rodada 2). Ele é memoizado porque derivar é caro e
 * o valor é constante — mas memoizar a PROMISE em vez do valor resolvido cria
 * um modo de falha permanente: se a derivação rejeitar uma única vez, a
 * promise rejeitada fica guardada e TODA requisição seguinte para e-mail sem
 * credencial passa a lançar, pelo resto da vida do processo.
 *
 * Consequência, e vale registrar a ordem certa: ANTES do colapso uniforme de
 * desfechos do núcleo (mesma rodada), isso reabria o oráculo de enumeração
 * pelo corpo da resposta. DEPOIS do colapso, o corpo continua uniforme e o que
 * sobra é a perda da defesa de simetria de tempo — de defeito de
 * confidencialidade para regressão de defesa em profundidade. Continua errado,
 * e é barato de fechar.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashDeComparacaoDummy, __resetHashDummyParaTeste } =
  await import("./cadastro");

function contexto(hash: (s: string) => Promise<string>) {
  return { password: { hash } };
}

describe("hashDeComparacaoDummy", () => {
  it("não fica envenenado quando a primeira derivação rejeita", async () => {
    __resetHashDummyParaTeste();

    const falha = vi.fn(async () => {
      throw new Error("derivação indisponível");
    });
    await expect(hashDeComparacaoDummy(contexto(falha))).rejects.toThrow(
      "derivação indisponível",
    );

    // A tentativa seguinte tem de recomeçar limpa. Com memoização da promise,
    // esta linha rejeitaria com o MESMO erro da anterior, para sempre.
    const ok = vi.fn(async () => "hash-valido");
    await expect(hashDeComparacaoDummy(contexto(ok))).resolves.toBe(
      "hash-valido",
    );
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("memoiza o valor resolvido: deriva uma vez só", async () => {
    __resetHashDummyParaTeste();

    const ok = vi.fn(async () => "hash-valido");
    const a = await hashDeComparacaoDummy(contexto(ok));
    const b = await hashDeComparacaoDummy(contexto(ok));

    expect(a).toBe("hash-valido");
    expect(b).toBe("hash-valido");
    // Derivar a cada requisição dobraria o custo do ramo e quebraria a
    // simetria pelo lado oposto (ramo dummy mais LENTO que os outros).
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("compartilha a derivação em voo entre chamadas concorrentes", async () => {
    __resetHashDummyParaTeste();

    const ok = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return "hash-valido";
    });
    const rs = await Promise.all([
      hashDeComparacaoDummy(contexto(ok)),
      hashDeComparacaoDummy(contexto(ok)),
      hashDeComparacaoDummy(contexto(ok)),
    ]);

    expect(rs).toEqual(["hash-valido", "hash-valido", "hash-valido"]);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
