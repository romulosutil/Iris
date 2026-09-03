// @vitest-environment node
/**
 * S-07 (auditoria 360, #530) — a sessão do Better-Auth deixa de usar os
 * defaults (7 dias, renovação diária) num app clínico usado em desktop
 * compartilhado de clínica.
 *
 * O teste lê a config REAL (`auth.options.session`), não uma constante
 * paralela: se alguém apagar o bloco `session:` de `auth.ts`, o Better-Auth
 * volta ao default em silêncio e este arquivo é o único que enxerga.
 *
 * Os dublês abaixo existem só para importar `auth.ts` sem abrir conexão nem
 * disparar e-mail — nenhum deles participa da asserção.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ authDb: {}, db: {}, asrWorkerDb: {} }));
vi.mock("@/lib/email/transacional", () => ({
  enviarEmailTransacional: vi.fn(),
}));

const { auth } = await import("./auth");

describe("sessão do Better-Auth (S-07)", () => {
  it("expira em 12h absolutas e renova no máximo a cada 1h", () => {
    const sessao = auth.options.session;
    expect(sessao).toBeDefined();
    // 12h: um turno de clínica. Sessão esquecida numa máquina compartilhada
    // não sobrevive ao dia seguinte (antes: 7 dias).
    expect(sessao?.expiresIn).toBe(60 * 60 * 12);
    // Renovação a cada 1h de atividade, e não a cada dia: a janela de
    // deslize é curta o bastante para que "fechou o navegador e foi embora"
    // não vire uma sessão eterna por uso esporádico.
    expect(sessao?.updateAge).toBe(60 * 60);
  });

  it("não deixa a expiração absoluta maior que a renovação (config coerente)", () => {
    const sessao = auth.options.session;
    expect(sessao?.updateAge).toBeLessThan(sessao?.expiresIn ?? 0);
  });
});
