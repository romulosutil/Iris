/**
 * #203 · Fatia 3 — protocolo como encaixe OPCIONAL da disciplina prescrita.
 *
 * O que estes casos protegem:
 *
 *   Encaixe fora da prescrição não entra. A prescrição é o pilar mestre; um
 *   protocolo em disciplina não prescrita monta acompanhamento estruturado que
 *   a equipe não pode atender (a prescrição é o teto da alocação, fatia 4). A
 *   regra tem de morar no núcleo: o dropdown some, mas a Server Action é
 *   endpoint, e a aba aberta desde antes do encerramento continua chamando.
 *
 *   Duplo-clique não duplica vínculo. Dois vínculos vigentes do mesmo protocolo
 *   viram um cartão só na tela (o agrupamento deduplica) — o segundo ficaria
 *   vivo e invisível.
 *
 *   Zero linhas afetadas não é sucesso. Mesmo tratamento da fatia 2: UPDATE
 *   barrado por RLS afeta 0 linhas SEM estourar.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { ativarProtocolo, desativarProtocolo } =
  await import("./protocolo-logic");
const { prescreverDisciplina, encerrarPrescricao } =
  await import("./prescricao-logic");
const { sql: appSql } = await import("@/db/client");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const PATIENT = "b0000000-0000-0000-0000-000000000040";
const P_VBMAPP = "c0000000-0000-0000-0000-000000000001";
const P_PROC = "c0000000-0000-0000-0000-000000000002";
const P_OUTRA_CLINICA = "c0000000-0000-0000-0000-000000000003";
let owner: ReturnType<typeof postgres>;

const ctx = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** Vínculos vigentes do paciente, direto pelo dono (sem passar pela RLS). */
function vinculosAtivos(protocolId: string) {
  return owner<{ id: string }[]>`
    SELECT id FROM patient_protocol
     WHERE patient_id = ${PATIENT}
       AND protocol_id = ${protocolId}
       AND desativado_em IS NULL`;
}

describe.skipIf(!hasDb)(
  "protocolo como encaixe da prescrição (fatia 3)",
  () => {
    beforeAll(async () => {
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      await owner`TRUNCATE clinic, app_user, user_role, patient, patient_alvo_disciplina, protocol, patient_protocol RESTART IDENTITY CASCADE`;
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')`;
      await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador')`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC_A}, 'Com Prescricao')`;
      await owner`
      INSERT INTO protocol (id, clinic_id, nome, disciplina, familia) VALUES
        (${P_VBMAPP}, ${CLINIC_A}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento'),
        (${P_PROC}, ${CLINIC_A}, 'PROC', 'Fonoaudiologia', 'fonoaudiologia'),
        (${P_OUTRA_CLINICA}, ${CLINIC_B}, 'VB-MAPP', 'ABA', 'aba_marcos_desenvolvimento')`;
      await prescreverDisciplina(
        ctx,
        PATIENT,
        form({ disciplina: "ABA", horasAlvoSemana: "10" }),
      );
    });
    afterAll(async () => {
      await owner?.end();
      await appSql.end();
    });

    test("encaixa protocolo de disciplina prescrita", async () => {
      const r = await ativarProtocolo(ctx, PATIENT, P_VBMAPP);
      expect(r.error).toBeUndefined();
      expect(await vinculosAtivos(P_VBMAPP)).toHaveLength(1);
    });

    test("recusa protocolo de disciplina NÃO prescrita, dizendo qual falta", async () => {
      // Fonoaudiologia não foi prescrita para este paciente: o PROC não tem carga
      // horária correspondente e ninguém pode ser alocado nela.
      const r = await ativarProtocolo(ctx, PATIENT, P_PROC);
      expect(r.error).toMatch(/Fonoaudiologia/);
      expect(r.error).toMatch(/não está prescrita/);
      expect(await vinculosAtivos(P_PROC)).toHaveLength(0);
    });

    test("encaixar duas vezes não cria segundo vínculo vigente", async () => {
      const r = await ativarProtocolo(ctx, PATIENT, P_VBMAPP);
      // Já ativo é sucesso, não erro: o estado desejado é o estado atual.
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(await vinculosAtivos(P_VBMAPP)).toHaveLength(1);
    });

    test("protocolo de outra clínica é recusado como inexistente", async () => {
      // A RLS já barra (o WITH CHECK de `pp_write` chama
      // `app_protocol_in_clinic`), mas barrada estoura exceção crua na tela; o
      // guard devolve mensagem antes de chegar lá.
      const r = await ativarProtocolo(ctx, PATIENT, P_OUTRA_CLINICA);
      expect(r.error).toMatch(/não encontrado/);
      expect(await vinculosAtivos(P_OUTRA_CLINICA)).toHaveLength(0);
    });

    test("encerrar a prescrição NÃO desencaixa o protocolo já vinculado", async () => {
      // Desencaixar sozinho seria efeito colateral clínico não pedido. O vínculo
      // segue vivo e a tela o mostra em "Fora da prescrição atual".
      await encerrarPrescricao(ctx, PATIENT, "ABA");
      expect(await vinculosAtivos(P_VBMAPP)).toHaveLength(1);
    });

    test("com a prescrição encerrada, encaixar de novo é recusado", async () => {
      // A aba aberta desde antes do encerramento ainda mostra o botão; é aqui que
      // o guard de núcleo (e não o dropdown) faz o trabalho.
      const r = await ativarProtocolo(ctx, PATIENT, P_VBMAPP);
      expect(r.error).toMatch(/não está prescrita/);
    });

    test("desencaixar fecha o vínculo sem apagar histórico", async () => {
      const [vinculo] = await vinculosAtivos(P_VBMAPP);
      const r = await desativarProtocolo(ctx, vinculo!.id);
      expect(r.error).toBeUndefined();
      expect(await vinculosAtivos(P_VBMAPP)).toHaveLength(0);
      const restou = await owner`
      SELECT 1 FROM patient_protocol WHERE id = ${vinculo!.id}`;
      expect(restou.length).toBe(1);
    });

    test("desencaixar de novo avisa em vez de dizer que deu certo", async () => {
      const [linha] = await owner<{ id: string }[]>`
      SELECT id FROM patient_protocol
       WHERE patient_id = ${PATIENT} AND protocol_id = ${P_VBMAPP}`;
      const r = await desativarProtocolo(ctx, linha!.id);
      expect(r.error).toMatch(/já não estava vinculado/);
    });
  },
);
