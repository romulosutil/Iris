import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { adicionarMembroEquipe, editarMembroEquipe, encerrarVinculoEquipe } =
  await import("./logic");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { careTeamMembership } = await import("@/db/schema");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002";
const U_TERA2 = "a0000000-0000-0000-0000-000000000003";
const PATIENT = "b0000000-0000-0000-0000-000000000020";
let owner: ReturnType<typeof postgres>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Prescreve direto pelo owner: o alvo é PRÉ-CONDIÇÃO destes testes, não o que
 *  eles exercitam (a prescrição tem suíte própria em `prescricao.int.test.ts`). */
async function prescrever(disciplina: string, horas: string) {
  await owner`
    INSERT INTO patient_alvo_disciplina (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
    VALUES (${CLINIC_A}, ${PATIENT}, ${disciplina}, ${horas}, CURRENT_DATE)`;
}

describe.skipIf(!hasDb)("equipe actions", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, patient_alvo_disciplina RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test'), (${U_TERA}, 'Tera', 'tera@a.test'), (${U_TERA2}, 'Tera2', 'tera2@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_TERA}, ${CLINIC_A}, 'terapeuta'), (${U_TERA2}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC_A}, 'P')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  // Cada teste parte de paciente sem equipe e sem prescrição: saldo é estado
  // acumulado, e vazamento entre casos faria um teste passar pelo motivo errado.
  beforeEach(async () => {
    await owner`TRUNCATE care_team_membership, patient_alvo_disciplina RESTART IDENTITY CASCADE`;
  });

  const ctx = {
    clinicId: CLINIC_A,
    userId: U_COORD,
    role: "coordenador",
  } as const;

  async function membros() {
    return withTenant(ctx, (db) =>
      db
        .select()
        .from(careTeamMembership)
        .where(eq(careTeamMembership.patientId, PATIENT)),
    );
  }

  test("papel na equipe inválido retorna erro sem gravar", async () => {
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "chefe_supremo",
      }),
    );
    expect(result.error).toMatch(/Papel na equipe inválido/);
    expect(await membros()).toHaveLength(0);
  });

  test("recusa alocação em disciplina não prescrita", async () => {
    // Antes da fatia 4 isto gravava: a disciplina era texto livre e não havia
    // relação nenhuma com a prescrição.
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "4",
      }),
    );
    expect(result.error).toMatch(/não está prescrita/);
    expect(await membros()).toHaveLength(0);
  });

  test("horas são obrigatórias em papel que consome (D-D)", async () => {
    await prescrever("ABA", "10.0");
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
      }),
    );
    expect(result.error).toMatch(/Informe as horas semanais/);
    expect(await membros()).toHaveLength(0);
  });

  test("carga fora do passo de 30 minutos é recusada com instrução", async () => {
    await prescrever("ABA", "10.0");
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "1.3",
      }),
    );
    expect(result.error).toMatch(/30 em 30 minutos/);
  });

  test("aloca dentro do saldo e recusa o que estoura, citando o restante real", async () => {
    await prescrever("Fonoaudiologia", "20.0");

    const ok = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "Fonoaudiologia",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "12",
      }),
    );
    expect(ok.error).toBeUndefined();

    const estouro = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA2,
        disciplina: "Fonoaudiologia",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "10",
      }),
    );
    // A mensagem carrega o saldo real na notação de tempo do produto — "erro ao
    // salvar" não diria ao coordenador o que fazer em seguida.
    expect(estouro.error).toMatch(/restam 8h em Fonoaudiologia/);
    expect(await membros()).toHaveLength(1);
  });

  test("saldo exato passa: 8h contra 8h restantes", async () => {
    await prescrever("ABA", "8.0");
    const result = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "8",
      }),
    );
    expect(result.error).toBeUndefined();
  });

  test("substituto consome saldo (D-B)", async () => {
    await prescrever("ABA", "6.0");
    await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "substituto",
        horasSemana: "4",
      }),
    );
    const estouro = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA2,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "4",
      }),
    );
    expect(estouro.error).toMatch(/restam 2h/);
  });

  test("coordenador de referência não consome e recusa horas (D-C)", async () => {
    await prescrever("ABA", "4.0");
    const comHoras = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_COORD,
        disciplina: "ABA",
        papelNaEquipe: "coordenador_referencia",
        horasSemana: "4",
      }),
    );
    expect(comHoras.error).toMatch(/gestão do caso/i);

    const semHoras = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_COORD,
        disciplina: "ABA",
        papelNaEquipe: "coordenador_referencia",
      }),
    );
    expect(semHoras.error).toBeUndefined();

    // Gestão não ocupa saldo nenhum: as 4h prescritas continuam inteiras.
    const terapeuta = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "4",
      }),
    );
    expect(terapeuta.error).toBeUndefined();
  });

  test("mesma pessoa pode ser gestora E terapeuta na mesma disciplina (D-C)", async () => {
    await prescrever("ABA", "4.0");
    await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_COORD,
        disciplina: "ABA",
        papelNaEquipe: "coordenador_referencia",
      }),
    );
    const segundoVinculo = await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_COORD,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "2",
      }),
    );
    expect(segundoVinculo.error).toBeUndefined();
    expect(await membros()).toHaveLength(2);
  });

  test("duplo-clique não vira dupla contagem — unique parcial vira erro amigável", async () => {
    await prescrever("ABA", "10.0");
    const payload = () =>
      form({
        userId: U_TERA,
        disciplina: "ABA",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "2",
      });
    await adicionarMembroEquipe(ctx, PATIENT, payload());
    const repetido = await adicionarMembroEquipe(ctx, PATIENT, payload());
    expect(repetido.error).toMatch(/já está na equipe nesta disciplina/);
    expect(await membros()).toHaveLength(1);
  });

  test("grava a grafia PRESCRITA, não a que veio do formulário", async () => {
    // Sem isto, "fonoaudiologia" alocado contra "Fonoaudiologia" prescrito faria
    // a barra e a validação divergirem sobre a mesma disciplina.
    await prescrever("Fonoaudiologia", "10.0");
    await adicionarMembroEquipe(
      ctx,
      PATIENT,
      form({
        userId: U_TERA,
        disciplina: "fonoaudiologia",
        papelNaEquipe: "terapeuta_referencia",
        horasSemana: "2",
      }),
    );
    const [m] = await membros();
    expect(m?.disciplina).toBe("Fonoaudiologia");
  });

  describe("edição", () => {
    test("edição que resulta em duplo vínculo vira erro amigável", async () => {
      await prescrever("ABA", "10.0");

      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "4",
        }),
      );

      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "substituto",
          horasSemana: "2",
        }),
      );

      const todos = await membros();
      const substituto = todos.find((m) => m.papelNaEquipe === "substituto")!;

      const result = await editarMembroEquipe(
        ctx,
        PATIENT,
        substituto.id,
        form({
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "4",
        }),
      );

      expect(result.error).toMatch(/já está na equipe nesta disciplina/);
    });

    test("editar as próprias horas não conta a alocação atual duas vezes", async () => {
      await prescrever("ABA", "10.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "8",
        }),
      );
      const [m] = await membros();
      // 8h → 10h só cabe se as 8h atuais saírem da soma. Sem
      // `ignorarMembershipId`, a conta viraria 8 + 10 = 18 contra 10 e recusaria.
      const result = await editarMembroEquipe(
        ctx,
        PATIENT,
        m!.id,
        form({
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "10",
        }),
      );
      expect(result.error).toBeUndefined();
      const [depois] = await membros();
      expect(Number(depois?.horasSemana)).toBe(10);
    });

    test("editar aplica a MESMA validação de saldo da inserção", async () => {
      await prescrever("ABA", "10.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "6",
        }),
      );
      const [m] = await membros();
      const result = await editarMembroEquipe(
        ctx,
        PATIENT,
        m!.id,
        form({
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "12",
        }),
      );
      expect(result.error).toMatch(/restam 10h/);
      const [inalterado] = await membros();
      expect(Number(inalterado?.horasSemana)).toBe(6);
    });

    test("trocar de disciplina move a carga entre os dois saldos", async () => {
      await prescrever("ABA", "10.0");
      await prescrever("Fonoaudiologia", "4.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "4",
        }),
      );
      const [m] = await membros();
      const result = await editarMembroEquipe(
        ctx,
        PATIENT,
        m!.id,
        form({
          disciplina: "Fonoaudiologia",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "4",
        }),
      );
      expect(result.error).toBeUndefined();

      // ABA voltou a ter as 10h inteiras livres.
      const reocupaAba = await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA2,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "10",
        }),
      );
      expect(reocupaAba.error).toBeUndefined();
    });

    test("vínculo encerrado não pode ser editado", async () => {
      await prescrever("ABA", "10.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "4",
        }),
      );
      const [m] = await membros();
      await encerrarVinculoEquipe(ctx, m!.id);
      const result = await editarMembroEquipe(
        ctx,
        PATIENT,
        m!.id,
        form({
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "6",
        }),
      );
      // Editar histórico mudaria retroativamente a carga de uma semana já
      // entregue — o que o convênio audita.
      expect(result.error).toMatch(/já foi encerrado/);
    });
  });

  describe("encerramento", () => {
    test("encerra mantendo histórico e devolve o saldo na hora", async () => {
      await prescrever("ABA", "10.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "10",
        }),
      );
      const [m] = await membros();
      const encerrado = await encerrarVinculoEquipe(ctx, m!.id);
      expect(encerrado.disciplina).toBe("ABA");
      expect(encerrado.horasDevolvidas).toBe(10);

      const [linha] = await membros();
      expect(linha?.vigenciaFim).not.toBeNull();

      // O saldo devolvido é real: as 10h inteiras cabem de novo. Se a soma não
      // filtrasse `vigencia_fim IS NULL`, esta alocação seria recusada.
      const outro = await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA2,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "10",
        }),
      );
      expect(outro.error).toBeUndefined();
    });

    test("devolve a FRASE do saldo pós-encerramento, não só o número (§3.3)", async () => {
      // Sem esta frase o toast não consegue nomear o número que mudou na tela,
      // e o coordenador não relaciona "encerrei o vínculo" a "a barra caiu".
      await prescrever("ABA", "20.0");
      for (const [user, horas] of [
        [U_TERA, "12"],
        [U_TERA2, "8"],
      ] as const) {
        await adicionarMembroEquipe(
          ctx,
          PATIENT,
          form({
            userId: user,
            disciplina: "ABA",
            papelNaEquipe: "terapeuta_referencia",
            horasSemana: horas,
          }),
        );
      }
      const alvo = (await membros()).find((m) => m.userId === U_TERA)!;
      const encerrado = await encerrarVinculoEquipe(ctx, alvo.id);

      // 8h de 20h é o estado DEPOIS do encerramento. Ler antes do UPDATE — ou
      // fora da transação, sem o filtro de vigência — devolveria 20h de 20h e o
      // toast anunciaria uma devolução que a barra desmente no mesmo segundo.
      expect(encerrado.horasDevolvidas).toBe(12);
      expect(encerrado.saldoTexto).toBe(
        "8h de 20h alocadas (40%) — restam 12h",
      );
    });

    test("gestão do caso encerra sem prometer devolução de hora (D-C)", async () => {
      await prescrever("ABA", "20.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "coordenador_referencia",
        }),
      );
      const [m] = await membros();
      const encerrado = await encerrarVinculoEquipe(ctx, m!.id);
      expect(encerrado.horasDevolvidas).toBe(0);
      // A disciplina segue como estava: supervisão nunca esteve na conta.
      expect(encerrado.saldoTexto).toBe(
        "0h de 20h alocadas — nenhum terapeuta vinculado",
      );
    });

    test("vínculo fora da prescrição não inventa saldo (§3.1)", async () => {
      await prescrever("ABA", "10.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "4",
        }),
      );
      const [m] = await membros();
      // A prescrição sai de cena antes do encerramento (legado de §3.1): sem
      // teto vigente não há saldo a nomear, e "0h de 0h" seria número inventado.
      await owner`UPDATE patient_alvo_disciplina SET vigencia_fim = CURRENT_DATE
                   WHERE patient_id = ${PATIENT} AND disciplina = 'ABA'`;
      const encerrado = await encerrarVinculoEquipe(ctx, m!.id);
      expect(encerrado.ok).toBe(true);
      expect(encerrado.saldoTexto).toBeUndefined();
    });

    test("encerrar duas vezes não reescreve a data de saída", async () => {
      await prescrever("ABA", "10.0");
      await adicionarMembroEquipe(
        ctx,
        PATIENT,
        form({
          userId: U_TERA,
          disciplina: "ABA",
          papelNaEquipe: "terapeuta_referencia",
          horasSemana: "2",
        }),
      );
      const [m] = await membros();
      await encerrarVinculoEquipe(ctx, m!.id);
      const segunda = await encerrarVinculoEquipe(ctx, m!.id);
      expect(segunda.error).toMatch(/Nenhum vínculo vigente/);
    });
  });
});
