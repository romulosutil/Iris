/**
 * #212 — `salvarConfigEmergencia` era no-op silencioso.
 *
 * O `UPDATE clinic` rodava sob `app_role`, que só tem policy `FOR SELECT` em
 * `clinic` (0002). UPDATE barrado por RLS afeta 0 linhas EM SILÊNCIO: a tela
 * devolvia `{ ok: true }`, gravava `audit_log` e o banco não mudava. Não havia
 * teste cobrindo o caminho, então a suíte ficava verde com a função morta.
 *
 * O oráculo aqui é obrigatoriamente a role DONA relendo `clinic` depois da
 * chamada — asserir o retorno `{ ok: true }` é exatamente o que deixou o bug
 * passar. Rodado contra o código pré-fix, o primeiro teste falha.
 *
 * Roda com `pnpm test:rls`. Gate de env em `db/tests/integration-env.ts`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { hasDb } from "@tests/integration-env";

// Neutraliza o side-effect de `server-only` e importa só o núcleo
// ctx-accepting (o wrapper `"use server"` vive em ./actions).
vi.mock("server-only", () => ({}));
const { salvarConfigEmergencia, lerConfigEmergencia } = await import("./logic");
const { sql: appSql } = await import("@/db/client");

const CLINIC_A = "00000000-0000-0000-0000-0000000212aa";
const CLINIC_B = "00000000-0000-0000-0000-0000000212bb";
const U_COORD_A = "00000000-0000-0000-0000-0000000212c1";
const U_COORD_A2 = "00000000-0000-0000-0000-0000000212c3";
const U_TER_A = "00000000-0000-0000-0000-0000000212e1";
const U_COORD_B = "00000000-0000-0000-0000-0000000212c2";

const PROTOCOLO =
  "Em emergência, acionar o responsável técnico e seguir o fluxo interno da clínica.";

let owner: ReturnType<typeof postgres>;

const ctx = (role: string, userId: string, clinicId = CLINIC_A) =>
  ({ role, userId, clinicId }) as never;

/** Estado real da linha, lido pela role DONA (bypassa RLS) — o oráculo. */
async function estado(clinicId: string) {
  const [row] = await owner<
    {
      responsavel_tecnico_id: string | null;
      protocolo_emergencia_interno: string | null;
      protocolo_emergencia_declarado_em: Date | null;
      protocolo_emergencia_declarado_por: string | null;
    }[]
  >`SELECT responsavel_tecnico_id,
           protocolo_emergencia_interno,
           protocolo_emergencia_declarado_em,
           protocolo_emergencia_declarado_por
      FROM clinic WHERE id = ${clinicId}`;
  return row!;
}

/** Mensagem do erro do banco (o driver aninha o original em `cause`). */
async function erro(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return (
      ((e as Error).cause as Error | undefined)?.message ?? (e as Error).message
    );
  }
  throw new Error("a chamada devia ter estourado, mas passou");
}

describe.skipIf(!hasDb)(
  "#212 · salvarConfigEmergencia persiste de fato",
  () => {
    beforeAll(async () => {
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      await owner`TRUNCATE audit_log RESTART IDENTITY CASCADE`;
      await owner`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
      await owner`INSERT INTO clinic (id, nome) VALUES
      (${CLINIC_A}, 'Clínica A #212'), (${CLINIC_B}, 'Clínica B #212')`;
      await owner`INSERT INTO app_user (id, name, email) VALUES
      (${U_COORD_A},  'Coord A',  'coord-a@i212.test'),
      (${U_COORD_A2}, 'Coord A2', 'coord-a2@i212.test'),
      (${U_TER_A},    'Ter A',    'ter-a@i212.test'),
      (${U_COORD_B},  'Coord B',  'coord-b@i212.test')`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD_A},  ${CLINIC_A}, 'coordenador'),
      (${U_COORD_A2}, ${CLINIC_A}, 'coordenador'),
      (${U_TER_A},    ${CLINIC_A}, 'terapeuta'),
      (${U_COORD_B},  ${CLINIC_B}, 'coordenador')`;
    });
    afterAll(async () => {
      await owner?.end();
      await appSql.end();
    });

    test("coordenador salva e a LINHA muda no banco (era no-op)", async () => {
      const r = await salvarConfigEmergencia(ctx("coordenador", U_COORD_A), {
        responsavelTecnicoId: U_TER_A,
        protocoloInterno: PROTOCOLO,
        declarado: true,
      });
      expect(r).toEqual({ ok: true });

      const linha = await estado(CLINIC_A);
      expect(linha.responsavel_tecnico_id).toBe(U_TER_A);
      expect(linha.protocolo_emergencia_interno).toBe(PROTOCOLO);
      expect(linha.protocolo_emergencia_declarado_em).toBeInstanceOf(Date);
      expect(linha.protocolo_emergencia_declarado_por).toBe(U_COORD_A);
    });

    test("a leitura da tela devolve o que foi gravado", async () => {
      const cfg = await lerConfigEmergencia(ctx("coordenador", U_COORD_A));
      expect(cfg.responsavelTecnicoId).toBe(U_TER_A);
      expect(cfg.protocoloInterno).toBe(PROTOCOLO);
      expect(cfg.declaradoEm).not.toBeNull();
      expect(cfg.declaradoPorNome).toBe("Coord A");
    });

    test("reeditar preserva QUEM e QUANDO do aceite original", async () => {
      const antes = await estado(CLINIC_A);
      const novo = `${PROTOCOLO} Revisado pelo segundo coordenador.`;

      const r = await salvarConfigEmergencia(ctx("coordenador", U_COORD_A2), {
        responsavelTecnicoId: U_COORD_A,
        protocoloInterno: novo,
        declarado: true,
      });
      expect(r).toEqual({ ok: true });

      const depois = await estado(CLINIC_A);
      expect(depois.protocolo_emergencia_interno).toBe(novo);
      expect(depois.responsavel_tecnico_id).toBe(U_COORD_A);
      // Autoria e data do aceite são prova, não campo editável.
      expect(depois.protocolo_emergencia_declarado_por).toBe(U_COORD_A);
      expect(depois.protocolo_emergencia_declarado_em?.getTime()).toBe(
        antes.protocolo_emergencia_declarado_em?.getTime(),
      );
    });

    test("clínica vizinha não é tocada", async () => {
      const b = await estado(CLINIC_B);
      expect(b.responsavel_tecnico_id).toBeNull();
      expect(b.protocolo_emergencia_interno).toBeNull();
      expect(b.protocolo_emergencia_declarado_em).toBeNull();
      expect(b.protocolo_emergencia_declarado_por).toBeNull();
    });

    test("coordenador de B só escreve na própria clínica", async () => {
      await salvarConfigEmergencia(ctx("coordenador", U_COORD_B, CLINIC_B), {
        responsavelTecnicoId: U_COORD_B,
        protocoloInterno: `${PROTOCOLO} (B)`,
        declarado: true,
      });

      const b = await estado(CLINIC_B);
      expect(b.responsavel_tecnico_id).toBe(U_COORD_B);
      // A da clínica A continua com o texto da clínica A.
      const a = await estado(CLINIC_A);
      expect(a.protocolo_emergencia_interno).toContain("Revisado");
      expect(a.responsavel_tecnico_id).toBe(U_COORD_A);
    });

    test("terapeuta é barrado pelo BANCO, não só pelo wrapper", async () => {
      const msg = await erro(() =>
        salvarConfigEmergencia(ctx("terapeuta", U_TER_A), {
          responsavelTecnicoId: U_COORD_A,
          protocoloInterno: `${PROTOCOLO} Tentativa de terapeuta.`,
          declarado: true,
        }),
      );
      expect(msg).toContain("exige papel coordenador");

      // E nada mudou.
      const a = await estado(CLINIC_A);
      expect(a.protocolo_emergencia_interno).not.toContain("Tentativa");
    });

    test("responsável técnico de outra clínica é recusado", async () => {
      const r = await salvarConfigEmergencia(ctx("coordenador", U_COORD_A), {
        responsavelTecnicoId: U_COORD_B,
        protocoloInterno: `${PROTOCOLO} Responsável de fora.`,
        declarado: true,
      });
      expect(r).toEqual({
        error: "O responsável técnico precisa ser um usuário desta clínica.",
      });

      const a = await estado(CLINIC_A);
      expect(a.responsavel_tecnico_id).toBe(U_COORD_A);
      expect(a.protocolo_emergencia_interno).not.toContain(
        "Responsável de fora",
      );
    });

    test("audit_log registra a configuração", async () => {
      const linhas = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM audit_log
       WHERE clinic_id = ${CLINIC_A}
         AND acao = 'clinica_emergencia_configurada'`;
      expect(Number(linhas[0]!.n)).toBeGreaterThanOrEqual(2);
    });
  },
);
