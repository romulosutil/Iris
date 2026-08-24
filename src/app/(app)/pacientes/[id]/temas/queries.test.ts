import { describe, expect, it, vi } from "vitest";

const { requireRole, withTenant } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock("@/auth/require-role", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/auth/require-role")>();
  return { ...mod, requireRole };
});

vi.mock("@/db/rls", () => ({ withTenant }));

vi.mock("@/db/schema", () => ({
  session: {
    id: "session.id",
    patientId: "session.patient_id",
    numeroSequencialPaciente: "session.numero_sequencial_paciente",
    agendadaPara: "session.agendada_para",
    disciplina: "session.disciplina",
  },
  sessionNote: {
    sessionId: "session_note.session_id",
    tipo: "session_note.tipo",
    texto: "session_note.texto",
    atualizadoEm: "session_note.atualizado_em",
  },
}));

import { obterNotasDeSessao } from "./queries";
import { RoleError } from "@/auth/require-role";

const ctx = {
  tenantId: "tenant_1",
  clinicId: "clinic_1",
  userId: "user_1",
  role: "terapeuta",
} as const;

describe("obterNotasDeSessao", () => {
  it("exige papel coordenador/terapeuta/admin_recepcao", async () => {
    requireRole.mockImplementationOnce(() => {
      throw new RoleError("sem permissão");
    });

    await expect(obterNotasDeSessao(ctx as never, "pac_1")).rejects.toThrow(
      RoleError,
    );
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("lê as notas consolidadas do paciente via withTenant", async () => {
    const linhas = [
      {
        sessionId: "sess_1",
        numeroSequencial: 3,
        agendadaPara: new Date("2026-08-01T10:00:00Z"),
        disciplina: "psicologia",
        texto: "Sessão sobre ansiedade no trabalho.",
        atualizadoEm: new Date("2026-08-01T11:00:00Z"),
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(linhas);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    const select = vi.fn().mockReturnValue({ from });
    const tx = { select };
    withTenant.mockImplementation(async (_ctx, fn) => fn(tx));

    const r = await obterNotasDeSessao(ctx as never, "pac_1");

    expect(requireRole).toHaveBeenCalledWith(
      ctx,
      "coordenador",
      "terapeuta",
      "admin_recepcao",
    );
    expect(r).toEqual(linhas);
  });
});
