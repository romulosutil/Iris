import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// ReprocessarExtracao importa a action ("use server") → getTenantContext →
// @/db/client (conexão no load). Aqui só renderizamos.
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {}, sql: {}, authDb: {}, authSql: {} }));

import { ExcecoesList } from "./excecoes-list";
import type { ListaExcecoes } from "./queries";

afterEach(cleanup);

const DONO = "00000000-0000-0000-0000-0000000000aa";
const OUTRO = "00000000-0000-0000-0000-0000000000bb";

const lista: ListaExcecoes = {
  extracoesFalhas: [
    {
      sessionId: "00000000-0000-0000-0000-000000000001",
      pacienteNome: "Paciente A",
      terapeutaNome: "Terapeuta X",
      terapeutaId: DONO,
      desdeEm: new Date("2026-07-11T08:00:00Z"),
    },
  ],
  revisoesIncompletas: [],
  total: 1,
  agora: new Date("2026-07-12T12:00:00Z").getTime(),
};

/**
 * Bug da clínica de uma pessoa só: o fundador tem apenas papel `coordenador`,
 * então chega à extração que falhou pelo painel de exceções — onde a única
 * ação era "Abrir diário" (formulário de nota em branco). O botão que de fato
 * resolve mora em /pendencias, ausente da nav do coordenador. Item represado.
 */
test("dono da sessão (clínica solo) vê o botão Reprocessar", () => {
  render(<ExcecoesList {...lista} userId={DONO} />);
  expect(screen.queryByRole("button", { name: /Reprocessar/i })).not.toBeNull();
});

/**
 * Contrapartida: numa clínica com equipe, o coordenador que NÃO é o dono não
 * ganha um botão que a RLS (`app_session_terapeuta_id = app.user_id`) recusaria
 * — a tela continua sendo de visibilidade para ele.
 */
test("coordenador que não é o dono NÃO vê o botão Reprocessar", () => {
  render(<ExcecoesList {...lista} userId={OUTRO} />);
  expect(screen.queryByRole("button", { name: /Reprocessar/i })).toBeNull();
  // ...mas continua com o caminho de leitura.
  expect(screen.queryByRole("link", { name: /Abrir diário/i })).not.toBeNull();
});
