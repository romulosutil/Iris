import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
import { ID_PROVEDOR_FAKE, ProvedorFake } from "@tests/provedor-fake";

vi.mock("server-only", () => ({}));

const mockEnviarEmailTransacional = vi.fn();
vi.mock("@/lib/email/transacional", () => ({
  enviarEmailTransacional: (...args: unknown[]) =>
    mockEnviarEmailTransacional(...args),
}));

vi.mock("./provider", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("./provider")>();
  return {
    ...real,
    getProviderPorId: (id: string) =>
      id === ID_PROVEDOR_FAKE ? new ProvedorFake() : real.getProviderPorId(id),
  };
});

const { aplicarStatusProvider, cancelarAssinaturasComCarenciaVencida } =
  await import("./subscription");

const CLINICA_CANCELAMENTO = "00000000-0000-0000-0000-000000312001";
const USUARIO_RESPONSAVEL = "00000000-0000-0000-0000-000000312002";
const ID_VINCULO = "sub_teste_312";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

describe.skipIf(!hasDb)(
  "Disparo de aviso por e-mail no cancelamento da assinatura (#312)",
  () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      mockEnviarEmailTransacional.mockResolvedValue({ enviado: true });
      if (!owner) return;

      // Limpa estado anterior
      await owner`DELETE FROM billing_cycle WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM user_role WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM clinic WHERE id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM app_user WHERE id = ${USUARIO_RESPONSAVEL}`;

      // Cria usuário responsável
      await owner`
        INSERT INTO app_user (id, name, email, email_verified)
        VALUES (${USUARIO_RESPONSAVEL}, 'Dr. Renato', 'renato@clinica312.com', true)
      `;

      // Cria clínica com responsavel_conta_id
      await owner`
        INSERT INTO clinic (id, nome, responsavel_conta_id)
        VALUES (${CLINICA_CANCELAMENTO}, 'Clínica Superar 312', ${USUARIO_RESPONSAVEL})
      `;

      // Cria assinatura active com vínculo
      await owner`
        INSERT INTO subscription (
          clinic_id,
          status,
          provider,
          provider_subscription_id,
          ciclo_dias,
          carencia_dias,
          ciclo_atual_inicio,
          ciclo_atual_fim
        ) VALUES (
          ${CLINICA_CANCELAMENTO},
          'active',
          ${ID_PROVEDOR_FAKE},
          ${ID_VINCULO},
          30,
          10,
          NOW() - interval '10 days',
          NOW() + interval '20 days'
        )
      `;

      // Abre ciclo vigente
      const [sub] =
        await owner`SELECT id FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(sub).toBeDefined();
      await owner`
        INSERT INTO billing_cycle (subscription_id, clinic_id, inicio, fim, status)
        VALUES (
          ${sub!.id},
          ${CLINICA_CANCELAMENTO},
          NOW() - interval '10 days',
          NOW() + interval '20 days',
          'aberto'
        )
      `;
    });

    afterEach(async () => {
      if (!owner) return;
      await owner`DELETE FROM billing_cycle WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM user_role WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM clinic WHERE id = ${CLINICA_CANCELAMENTO}`;
      await owner`DELETE FROM app_user WHERE id = ${USUARIO_RESPONSAVEL}`;
    });

    afterAll(async () => {
      if (owner) await owner.end();
    });

    it("envia e-mail de aviso no cancelamento via aplicarStatusProvider", async () => {
      const mudou = await aplicarStatusProvider(ID_VINCULO, "cancelada");
      expect(mudou).toBe(true);

      // Verifica que o status virou canceled
      const [sub] =
        await owner!`SELECT status FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(sub?.status).toBe("canceled");

      // Verifica que o ciclo virou devido
      const [ciclo] =
        await owner!`SELECT status FROM billing_cycle WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(ciclo?.status).toBe("devido");

      // Verifica que enviarEmailTransacional foi disparado para o responsável
      expect(mockEnviarEmailTransacional).toHaveBeenCalledTimes(1);
      expect(mockEnviarEmailTransacional).toHaveBeenCalledWith(
        expect.objectContaining({
          para: "renato@clinica312.com",
          assunto: expect.stringContaining("cancelada"),
          texto: expect.stringContaining("Clínica Superar 312"),
          html: expect.stringContaining("somente-leitura"),
        }),
      );
    });

    it("é idempotente: reentrega de webhook com status canceled NÃO envia segundo e-mail", async () => {
      // 1ª entrega: active -> canceled (envia e-mail)
      await aplicarStatusProvider(ID_VINCULO, "cancelada");
      expect(mockEnviarEmailTransacional).toHaveBeenCalledTimes(1);

      // 2ª entrega: webhook reenviado pelo gateway quando já está canceled
      await aplicarStatusProvider(ID_VINCULO, "cancelada");

      // Continua com exatamente 1 envio
      expect(mockEnviarEmailTransacional).toHaveBeenCalledTimes(1);
    });

    it("falha no envio de e-mail não reverte o congelamento do ciclo nem o cancelamento", async () => {
      mockEnviarEmailTransacional.mockRejectedValueOnce(
        new Error("Serviço de e-mail temporariamente fora do ar"),
      );

      const mudou = await aplicarStatusProvider(ID_VINCULO, "cancelada");
      expect(mudou).toBe(true);

      // O banco deve ter commitado status canceled e ciclo devido
      const [sub] =
        await owner!`SELECT status FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(sub?.status).toBe("canceled");

      const [ciclo] =
        await owner!`SELECT status FROM billing_cycle WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(ciclo?.status).toBe("devido");
    });
  },
);
