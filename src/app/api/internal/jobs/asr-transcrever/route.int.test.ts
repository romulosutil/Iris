/**
 * #72 / T07 — rota interna do worker de transcrição.
 *
 * `.int.test.ts` (não unitário): a rota chama de verdade
 * `app_asr_reservar`/`app_asr_concluir`/`app_asr_falhar` (T02,
 * `db/migrations/0136_asr_fila.sql`) via `db` (`DATABASE_URL`), e o teto de
 * tentativas / reversão do 503 são invariantes do BANCO, não do código TS —
 * medir com um dublê de banco provaria a orquestração, não a garantia real
 * (mesmo raciocínio de `db/tests/asr-fila-rls.int.test.ts`, que já cobre as
 * três funções isoladamente; aqui o alvo é a ROTA por cima delas).
 *
 * Storage (T04) e provider (T05) são dublados: não há MinIO nem serviço ASR
 * real no ambiente de teste, e o objetivo aqui é a orquestração (R11/R12/
 * classificação de recusa), não a integração de rede desses dois módulos —
 * já cobertos em `storage.test.ts` e `self-hosted.test.ts`/`stub.test.ts`.
 *
 * Roda com `--config vitest.integration.config.ts`; sem ela o arquivo coleta
 * ZERO e sai verde (memória `vitest-int-test-coleta-zero`).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("@/lib/asr/storage", () => ({
  ler: vi.fn(),
  guardar: vi.fn(),
  apagar: vi.fn(),
}));

vi.mock("@/lib/asr/provider", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/asr/provider")>();
  return { ...real, getAsrProvider: vi.fn() };
});

const storage = await import("@/lib/asr/storage");
const provider = await import("@/lib/asr/provider");
const { POST } = await import("./route");

const TOKEN = "token-do-job-asr-72-t07";
const URL_ROTA = "http://localhost/api/internal/jobs/asr-transcrever";

function requisicao(authorization?: string | null): Request {
  const headers = new Headers();
  if (authorization !== null) {
    headers.set("authorization", authorization ?? `Bearer ${TOKEN}`);
  }
  return new Request(URL_ROTA, { method: "POST", headers });
}

// ─── fixture: role dona (BYPASSRLS), só arranjo — nunca asserção de produto ──
const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

// Role de login do worker para este arquivo. Sufixo próprio para não colidir
// com a de `db/tests/asr-fila-rls.int.test.ts`, que roda na mesma suíte.
const LOGIN_WORKER = "iris_asr_worker_login_72a7t07";
const SENHA_WORKER = "iris_asr_worker_login_teste_72a7t07";

const CLINICA = "72a70000-0000-0000-0000-0000000000a1";
const TERAPEUTA = "72a70000-0000-0000-0000-0000000000a2";
const PACIENTE = "72a70000-0000-0000-0000-0000000000a3";
const SESSAO = "72a70000-0000-0000-0000-0000000000a4";

type EstadoClipe = {
  id: string;
  asr_status: string;
  tentativas: number;
  objeto_ref: string | null;
  transcricao_texto: string | null;
};

async function plantarClipe(opts: {
  id: string;
  asrStatus: string;
  tentativas: number;
  objetoRef: string | null;
  criadoEm: Date;
}) {
  await owner!`INSERT INTO audio_capture
      (id, session_id, clinic_id, status_upload, objeto_ref, criado_em,
       asr_status, tentativas)
    VALUES (
      ${opts.id}, ${SESSAO}, ${CLINICA}, 'confirmado',
      ${opts.objetoRef}, ${opts.criadoEm},
      ${opts.asrStatus}::asr_status, ${opts.tentativas}
    )`;
}

async function lerClipe(id: string): Promise<EstadoClipe> {
  const linhas = await owner!<EstadoClipe[]>`
    SELECT id, asr_status::text AS asr_status, tentativas, objeto_ref,
           transcricao_texto
      FROM audio_capture WHERE id = ${id}`;
  if (!linhas[0]) throw new Error(`clipe ${id} sumiu do banco`);
  return linhas[0];
}

const agora = Date.now();
const minutosAtras = (n: number) => new Date(agora - n * 60_000);

describe.skipIf(!hasDb)(
  "POST /api/internal/jobs/asr-transcrever (T07 #72)",
  () => {
    const idsPlantados = new Set<string>();

    beforeAll(async () => {
      // A rota usa `asrWorkerDb` (#494/T18), que é FAIL-CLOSED: sem
      // `ASR_WORKER_DATABASE_URL` ela lança e todo request vira 500. A role de
      // LOGIN é provisionamento de AMBIENTE (tem senha), não objeto versionado
      // — a migração `0140` cria só a role NOLOGIN `iris_asr_worker`. Ninguém
      // mais cria esta no CI, então ela nasce aqui, como `iris_asr_worker_login`
      // nasce em `db/tests/asr-fila-rls.int.test.ts`.
      //
      // O env é definido ANTES do primeiro request de propósito: o pool é lazy,
      // então definir depois deixaria a primeira chamada com a conexão errada.
      await owner!.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_WORKER}') THEN
            CREATE ROLE ${LOGIN_WORKER} LOGIN PASSWORD '${SENHA_WORKER}' IN ROLE iris_asr_worker;
          END IF;
        END
        $$;
      `);
      process.env.ASR_WORKER_DATABASE_URL =
        process.env.MIGRATION_DATABASE_URL!.replace(
          /:\/\/[^@]+@/,
          `://${LOGIN_WORKER}:${SENHA_WORKER}@`,
        );

      await owner!`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINICA}, 'Clínica ASR 72a7 T07', false)`;
      await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${TERAPEUTA}, 'Terapeuta 72a7', 'terapeuta.72a7t07@iris.test')`;
      await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${TERAPEUTA}, ${CLINICA}, 'coordenador')`;
      await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PACIENTE}, ${CLINICA}, 'Paciente 72a7')`;
      await owner!`INSERT INTO session
        (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
      VALUES
        (${SESSAO}, ${CLINICA}, ${PACIENTE}, ${TERAPEUTA}, now(), 'realizada', 'desconhecida')`;
    });

    beforeEach(() => {
      process.env.ASR_JOB_TOKEN = TOKEN;
      vi.mocked(storage.ler).mockReset();
      vi.mocked(storage.apagar).mockReset();
      vi.mocked(storage.ler).mockResolvedValue(new Uint8Array([1, 2, 3]));
      vi.mocked(storage.apagar).mockResolvedValue(undefined);
      vi.mocked(provider.getAsrProvider).mockReset();
    });

    afterEach(async () => {
      // Fila zerada entre testes: `app_asr_reservar` varre a fila INTEIRA, sem
      // predicado de escopo — um clipe esquecido contaminaria o teste seguinte.
      if (idsPlantados.size > 0) {
        await owner!`DELETE FROM audio_capture WHERE id = ANY(${[...idsPlantados]}::uuid[])`;
        idsPlantados.clear();
      }
    });

    afterAll(async () => {
      await owner!`DELETE FROM session WHERE id = ${SESSAO}`;
      await owner!`DELETE FROM patient WHERE id = ${PACIENTE}`;
      await owner!`DELETE FROM user_role WHERE user_id = ${TERAPEUTA}`;
      await owner!`DELETE FROM app_user WHERE id = ${TERAPEUTA}`;
      await owner!`DELETE FROM clinic WHERE id = ${CLINICA}`;
      await owner?.end();
    });

    test("token ausente recusa tudo (401), sem tocar a fila", async () => {
      const id = "72a70000-0000-0000-0000-0000000000b1";
      idsPlantados.add(id);
      await plantarClipe({
        id,
        asrStatus: "na_fila",
        tentativas: 0,
        objetoRef: "asr/72a7/b1",
        criadoEm: minutosAtras(1),
      });

      const res = await POST(requisicao(null));
      expect(res.status).toBe(401);

      const clipe = await lerClipe(id);
      expect(clipe.asr_status).toBe("na_fila"); // nada foi reservado
      expect(vi.mocked(storage.ler)).not.toHaveBeenCalled();
    });

    test("token inválido recusa (401)", async () => {
      const res = await POST(requisicao("Bearer token-errado"));
      expect(res.status).toBe(401);
    });

    test("lote de 3 com o do meio falhando: 2 transcrito, 1 de volta à fila, SÓ 2 objetos apagados", async () => {
      const idOk1 = "72a70000-0000-0000-0000-0000000000c1";
      const idFalha = "72a70000-0000-0000-0000-0000000000c2";
      const idOk2 = "72a70000-0000-0000-0000-0000000000c3";
      [idOk1, idFalha, idOk2].forEach((id) => idsPlantados.add(id));

      await plantarClipe({
        id: idOk1,
        asrStatus: "na_fila",
        tentativas: 0,
        objetoRef: "asr/72a7/c1",
        criadoEm: minutosAtras(30),
      });
      await plantarClipe({
        id: idFalha,
        asrStatus: "na_fila",
        tentativas: 0,
        objetoRef: "asr/72a7/c2",
        criadoEm: minutosAtras(20),
      });
      await plantarClipe({
        id: idOk2,
        asrStatus: "na_fila",
        tentativas: 0,
        objetoRef: "asr/72a7/c3",
        criadoEm: minutosAtras(10),
      });

      // Dublês por CHAVE, não por ordem de chamada: uma linha `na_fila` órfã
      // deixada por outro arquivo entraria na janela do LIMIT e deslocaria a
      // sequência de `mockResolvedValueOnce`, atribuindo o texto do clipe A ao
      // clipe B — o teste falharia dizendo algo que não é sobre o código.
      vi.mocked(storage.ler).mockImplementation(async (chave: string) =>
        new TextEncoder().encode(chave),
      );
      const transcrever = vi.fn(async (audio: Uint8Array) => {
        const chave = new TextDecoder().decode(audio);
        if (chave === "asr/72a7/c2") {
          throw new provider.AsrProviderError(
            "falha definitiva",
            "definitiva",
            {
              status: 400,
            },
          );
        }
        return { texto: `transcrito ${chave}` };
      });
      vi.mocked(provider.getAsrProvider).mockReturnValue({ transcrever });

      const res = await POST(requisicao());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.transcritos).toBe(2);
      expect(body.falhas).toBe(1);
      expect(body.processados).toBe(3);

      const clipe1 = await lerClipe(idOk1);
      expect(clipe1.asr_status).toBe("transcrito");
      expect(clipe1.transcricao_texto).toBe("transcrito asr/72a7/c1");
      expect(clipe1.objeto_ref).toBeNull();

      const clipe2 = await lerClipe(idFalha);
      expect(clipe2.asr_status).toBe("na_fila"); // volta à fila (abaixo do teto)
      expect(clipe2.tentativas).toBe(1); // cobrado UMA vez na reserva
      expect(clipe2.objeto_ref).toBe("asr/72a7/c2"); // referência preservada

      const clipe3 = await lerClipe(idOk2);
      expect(clipe3.asr_status).toBe("transcrito");

      // R11 só vale para desfecho DEFINITIVO (revisão final de integração
      // #72): os dois transcritos têm o objeto apagado; o que voltou à fila
      // MANTÉM o objeto, senão a próxima reserva o encontraria elegível e
      // sem áudio, queimando as tentativas restantes.
      expect(vi.mocked(storage.apagar)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(storage.apagar)).toHaveBeenCalledWith("asr/72a7/c1");
      expect(vi.mocked(storage.apagar)).toHaveBeenCalledWith("asr/72a7/c3");
      expect(vi.mocked(storage.apagar)).not.toHaveBeenCalledWith("asr/72a7/c2");
    });

    test("503 (saturação) volta a na_fila com tentativas IGUAL ao valor de antes do tick", async () => {
      // Mutação-alvo: trocar `falharClipe(id, true)` por `falharClipe(id, false)`
      // no route.ts precisa derrubar este teste. Antes do tick: tentativas = 1.
      // A reserva incrementa para 2; `app_asr_falhar(id, true)` reverte para
      // `greatest(2-1, 0) = 1` — o valor ANTES do tick. Se a rota chamasse
      // `falharClipe(id, false)`, o clipe voltaria com tentativas = 2 (a
      // reserva NÃO é revertida), o que este teste mede diretamente.
      const id = "72a70000-0000-0000-0000-0000000000d1";
      idsPlantados.add(id);
      await plantarClipe({
        id,
        asrStatus: "na_fila",
        tentativas: 1,
        objetoRef: "asr/72a7/d1",
        criadoEm: minutosAtras(5),
      });

      const transcrever = vi.fn().mockRejectedValueOnce(
        new provider.AsrProviderError("saturação do serviço", "saturacao", {
          status: 503,
        }),
      );
      vi.mocked(provider.getAsrProvider).mockReturnValue({ transcrever });

      const res = await POST(requisicao());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.revertidos).toBe(1);
      expect(body.falhas).toBe(0);

      const clipe = await lerClipe(id);
      expect(clipe.asr_status).toBe("na_fila");
      expect(clipe.tentativas).toBe(1); // igual ao valor de ANTES do tick
      expect(clipe.objeto_ref).toBe("asr/72a7/d1"); // não zera nesse ramo

      // E o objeto TAMBÉM não é apagado: o clipe vai ser relido na próxima
      // reserva. Apagar aqui era o bug da revisão final de integração #72.
      expect(vi.mocked(storage.apagar)).not.toHaveBeenCalled();
    });

    test("teto de 3 tentativas: falha definitiva marca `falhou`", async () => {
      // tentativas = 2 antes do tick; a reserva incrementa para 3 (teto),
      // e uma falha "definitiva" (não-503) no teto marca `falhou` de vez.
      const id = "72a70000-0000-0000-0000-0000000000e1";
      idsPlantados.add(id);
      await plantarClipe({
        id,
        asrStatus: "na_fila",
        tentativas: 2,
        objetoRef: "asr/72a7/e1",
        criadoEm: minutosAtras(5),
      });

      const transcrever = vi.fn().mockRejectedValueOnce(
        new provider.AsrProviderError("corpo malformado", "definitiva", {
          status: 400,
        }),
      );
      vi.mocked(provider.getAsrProvider).mockReturnValue({ transcrever });

      const res = await POST(requisicao());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.falhas).toBe(1);

      const clipe = await lerClipe(id);
      expect(clipe.asr_status).toBe("falhou");
      expect(clipe.tentativas).toBe(3);
      expect(clipe.objeto_ref).toBeNull(); // desfecho definitivo zera a referência

      // Desfecho definitivo: aí SIM o objeto some do bucket (R11).
      expect(vi.mocked(storage.apagar)).toHaveBeenCalledWith("asr/72a7/e1");
    });

    test("duas chamadas concorrentes à rota não processam o mesmo clipe duas vezes", async () => {
      const ids = [
        "72a70000-0000-0000-0000-0000000000f1",
        "72a70000-0000-0000-0000-0000000000f2",
        "72a70000-0000-0000-0000-0000000000f3",
        "72a70000-0000-0000-0000-0000000000f4",
        "72a70000-0000-0000-0000-0000000000f5",
        "72a70000-0000-0000-0000-0000000000f6",
      ];
      ids.forEach((id) => idsPlantados.add(id));
      for (const [i, id] of ids.entries()) {
        await plantarClipe({
          id,
          asrStatus: "na_fila",
          tentativas: 0,
          objetoRef: `asr/72a7/f${i}`,
          criadoEm: minutosAtras(60 - i),
        });
      }

      vi.mocked(provider.getAsrProvider).mockReturnValue({
        transcrever: vi.fn().mockResolvedValue({ texto: "ok" }),
      });

      // A idempotência de fato vem do `FOR UPDATE SKIP LOCKED` de T02
      // (`db/tests/asr-fila-rls.int.test.ts`, teste b2). Aqui só se confirma
      // pelo lado HTTP: duas chamadas concorrentes à rota não processam o
      // mesmo clipe duas vezes, e a soma bate com o total plantado.
      const [res1, res2] = await Promise.all([
        POST(requisicao()),
        POST(requisicao()),
      ]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      const body1 = await res1.json();
      const body2 = await res2.json();

      const idsProcessados = [
        ...body1.resultados.map((r: { id: string }) => r.id),
        ...body2.resultados.map((r: { id: string }) => r.id),
      ];
      expect(idsProcessados).toHaveLength(6);
      expect(new Set(idsProcessados).size).toBe(6); // nenhum id duplicado
      expect(new Set(idsProcessados)).toEqual(new Set(ids));

      for (const id of ids) {
        const clipe = await lerClipe(id);
        expect(clipe.asr_status).toBe("transcrito");
      }
    });
  },
);
