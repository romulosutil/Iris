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
import {
  BASE_URL_FAKE,
  ID_PROVEDOR_FAKE,
  ProvedorFake,
} from "@tests/provedor-fake";

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

/**
 * Valor do ciclo interrompido — e o oráculo do e-mail.
 *
 * O ciclo da fixture nasce `apurado` COM `provider_charge_id` porque é assim que
 * `congelarCiclosComoDebito` PRESERVA um valor: onde há cobrança emitida, o
 * valor dela é o piso (`Math.max`). Sem esse piso, o pro-rata de uma clínica sem
 * fichas devolve 0 — que é exatamente o valor que o e-mail mostraria se fosse
 * despachado ANTES do congelamento. Com 0 nas duas ordens, o caso não distingue
 * uma da outra: medido, o mutante "notifica antes de congelar" sobrevivia à
 * suíte inteira (158 unitários + 3 de integração, todos verdes).
 *
 * `levantarDebito` só soma ciclos em `devido`. Asserir o VALOR no corpo do
 * e-mail é, portanto, a única forma de provar que o congelamento veio primeiro.
 */
const VALOR_CICLO_CENTAVOS = 3900;
const VALOR_CICLO_FORMATADO = /R\$[\s ]*39,00/;
const COBRANCA_EMITIDA = "chg-fake-312";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 })
  : null;

/**
 * Dublê HTTP do gateway fake. `ProvedorFake` chama `fetch` de verdade contra um
 * host próprio, então "o vínculo foi revogado no gateway" vira observação — é o
 * oráculo do caminho de carência, onde a revogação precisa acontecer ANTES da
 * escrita para não deixar autorização de Pix Automático viva.
 */
let chamadasGateway: string[] = [];

function instalarGateway(): void {
  chamadasGateway = [];
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    chamadasGateway.push(url);
    if (url.endsWith("/cancelamento")) {
      return Response.json({ estado: "CANCELADO" });
    }
    throw new Error(`fetch inesperado para ${url}`);
  });
}

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
          provider_customer_id,
          ciclo_dias,
          carencia_dias,
          ciclo_atual_inicio,
          ciclo_atual_fim
        ) VALUES (
          ${CLINICA_CANCELAMENTO},
          'active',
          ${ID_PROVEDOR_FAKE},
          ${ID_VINCULO},
          'cli-fake-312',
          30,
          10,
          NOW() - interval '10 days',
          NOW() + interval '20 days'
        )
      `;

      // Ciclo vigente COM cobrança emitida — ver VALOR_CICLO_CENTAVOS.
      const [sub] =
        await owner`SELECT id FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(sub).toBeDefined();
      await owner`
        INSERT INTO billing_cycle (
          subscription_id,
          clinic_id,
          inicio,
          fim,
          status,
          valor_centavos,
          provider_charge_id
        ) VALUES (
          ${sub!.id},
          ${CLINICA_CANCELAMENTO},
          NOW() - interval '10 days',
          NOW() + interval '20 days',
          'apurado',
          ${VALOR_CICLO_CENTAVOS},
          ${COBRANCA_EMITIDA}
        )
      `;
    });

    afterEach(async () => {
      vi.unstubAllGlobals();
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

      // Verifica que o ciclo virou devido, com o valor da cobrança preservado
      const [ciclo] =
        await owner!`SELECT status, valor_centavos FROM billing_cycle WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(ciclo?.status).toBe("devido");
      expect(ciclo?.valor_centavos).toBe(VALOR_CICLO_CENTAVOS);

      // Verifica que enviarEmailTransacional foi disparado para o responsável.
      //
      // O VALOR é a asserção que importa: ele só existe no corpo do e-mail se o
      // congelamento tiver rodado ANTES do disparo — `levantarDebito` lê ciclos
      // em `devido`, e antes do congelamento não há nenhum.
      expect(mockEnviarEmailTransacional).toHaveBeenCalledTimes(1);
      expect(mockEnviarEmailTransacional).toHaveBeenCalledWith(
        expect.objectContaining({
          para: "renato@clinica312.com",
          assunto: expect.stringContaining("cancelada"),
          texto: expect.stringContaining("Clínica Superar 312"),
          html: expect.stringContaining("somente-leitura"),
        }),
      );
      const [{ texto, html }] = mockEnviarEmailTransacional.mock.calls.at(
        -1,
      ) as [{ texto: string; html: string }];
      expect(texto).toMatch(VALOR_CICLO_FORMATADO);
      expect(html).toMatch(VALOR_CICLO_FORMATADO);
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

    /**
     * O OUTRO caminho de cancelamento (#319 / #318).
     *
     * `aplicarStatusProvider` cobre a revogação feita pela clínica no app do
     * banco. Este cobre o corte que o Iris inicia: carência vencida e backstop de
     * D+7 passam por `revogarECortarAssinatura`, que escreve `canceled` direto,
     * sem webhook nenhum. Sem este caso, metade da entrega da #312 não tinha
     * cobertura — e o e-mail podia deixar de sair no corte por inadimplência sem
     * nenhum teste ficar vermelho.
     */
    it("envia e-mail no corte por carência vencida (revogarECortarAssinatura)", async () => {
      instalarGateway();

      // Joga a assinatura para past_due com a carência de 10 dias já vencida.
      await owner!`
        UPDATE subscription
           SET status = 'past_due',
               past_due_desde = NOW() - interval '30 days'
         WHERE clinic_id = ${CLINICA_CANCELAMENTO}
      `;

      const resultados = await cancelarAssinaturasComCarenciaVencida();

      const desta = resultados.filter(
        (r) => r.clinicId === CLINICA_CANCELAMENTO,
      );
      expect(desta).toHaveLength(1);
      expect(desta[0]!.cortada).toBe(true);

      // O vínculo foi revogado no gateway ANTES da escrita.
      expect(chamadasGateway).toContain(
        `${BASE_URL_FAKE}/vinculos/${ID_VINCULO}/cancelamento`,
      );

      // O oráculo é o banco relido, não o retorno.
      const [sub] =
        await owner!`SELECT status FROM subscription WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(sub?.status).toBe("canceled");

      const [ciclo] =
        await owner!`SELECT status, valor_centavos FROM billing_cycle WHERE clinic_id = ${CLINICA_CANCELAMENTO}`;
      expect(ciclo?.status).toBe("devido");
      expect(ciclo?.valor_centavos).toBe(VALOR_CICLO_CENTAVOS);

      // E o e-mail saiu, com o valor congelado dentro.
      expect(mockEnviarEmailTransacional).toHaveBeenCalledTimes(1);
      const [{ para, texto }] = mockEnviarEmailTransacional.mock.calls.at(
        -1,
      ) as [{ para: string; texto: string }];
      expect(para).toBe("renato@clinica312.com");
      expect(texto).toMatch(VALOR_CICLO_FORMATADO);
    });
  },
);
