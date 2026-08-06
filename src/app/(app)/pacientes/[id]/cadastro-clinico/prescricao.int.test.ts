/**
 * #203 · Fatia 2 — prescrição pela ficha clínica (SCD2 + handoff 1).
 *
 * O que estes casos protegem, em ordem de custo se quebrar:
 *
 *   Represcrever NÃO reescreve. Fecha a vigência anterior e abre linha nova —
 *   o convênio audita o alvo DA ÉPOCA. Um UPDATE no lugar apagaria o histórico
 *   sem erro nenhum, e ninguém perceberia até a auditoria.
 *
 *   Fechada não conta. Toda leitura de saldo filtra `vigencia_fim IS NULL`. Se
 *   um dos lados esquecer o filtro, a soma inclui histórico encerrado e produz
 *   sobrealocação fantasma — só aparece em paciente com histórico, nunca em
 *   dado de teste novo (plano §4.5).
 *
 *   O selo `Sem prescrição` é derivado. Paciente cadastrado e não prescrito não
 *   pode sumir da vista de quem cadastrou e saiu.
 */
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
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));
const { prescreverDisciplina, encerrarPrescricao, listarPrescricoesVigentes } =
  await import("./prescricao-logic");
const { listarTodosPacientes } = await import("../../queries");
const { sql: appSql } = await import("@/db/client");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_COORD = "a0000000-0000-0000-0000-000000000001";
const U_TERA = "a0000000-0000-0000-0000-000000000002";
const PATIENT = "b0000000-0000-0000-0000-000000000030";
const PATIENT_SEM = "b0000000-0000-0000-0000-000000000031";
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

/** Todas as linhas da disciplina, vigentes ou não, da mais nova para a mais velha. */
function historico(disciplina: string) {
  return owner<
    {
      horas_alvo_semana: string;
      vigencia_inicio: string;
      vigencia_fim: string | null;
    }[]
  >`
    SELECT horas_alvo_semana, vigencia_inicio, vigencia_fim
      FROM patient_alvo_disciplina
     WHERE patient_id = ${PATIENT} AND disciplina = ${disciplina}
     ORDER BY criado_em DESC`;
}

describe.skipIf(!hasDb)("prescrição de disciplinas (fatia 2)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, patient_alvo_disciplina RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@a.test'), (${U_TERA}, 'Tera', 'tera@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC_A}, 'coordenador'), (${U_TERA}, ${CLINIC_A}, 'terapeuta')`;
    await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT}, ${CLINIC_A}, 'Com Prescricao'), (${PATIENT_SEM}, ${CLINIC_A}, 'Sem Prescricao')`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  test("prescreve disciplina nova e ela fica vigente", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Fonoaudiologia", horasAlvoSemana: "20" }),
    );
    expect(r.error).toBeUndefined();
    const vigentes = await listarPrescricoesVigentes(ctx, PATIENT);
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]!.disciplina).toBe("Fonoaudiologia");
    expect(Number(vigentes[0]!.horasAlvoSemana)).toBe(20);
  });

  test("represcrever fecha a linha anterior e abre outra (SCD2, não UPDATE)", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Fonoaudiologia", horasAlvoSemana: "10" }),
    );
    expect(r.error).toBeUndefined();

    const linhas = await historico("Fonoaudiologia");
    // DUAS linhas: a de 20h continua existindo, fechada. Um UPDATE no lugar
    // deixaria uma linha só e o alvo de 20h teria desaparecido do histórico.
    expect(linhas).toHaveLength(2);
    expect(Number(linhas[0]!.horas_alvo_semana)).toBe(10);
    expect(linhas[0]!.vigencia_fim).toBeNull();
    expect(Number(linhas[1]!.horas_alvo_semana)).toBe(20);
    expect(linhas[1]!.vigencia_fim).not.toBeNull();

    // E só uma conta: fechada não é vigente.
    const vigentes = await listarPrescricoesVigentes(ctx, PATIENT);
    expect(
      vigentes.filter((p) => p.disciplina === "Fonoaudiologia"),
    ).toHaveLength(1);
  });

  test("represcrever o MESMO valor não gera linha nova", async () => {
    const antes = await historico("Fonoaudiologia");
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Fonoaudiologia", horasAlvoSemana: "10" }),
    );
    expect(r.error).toBeUndefined();
    // Gravar assim mesmo encheria a trilha de linhas idênticas e faria o
    // convênio enxergar troca de prescrição onde não houve mudança clínica.
    expect(await historico("Fonoaudiologia")).toHaveLength(antes.length);
  });

  test("fecha e abre no MESMO dia sem deixar duas vigentes (fuso BR)", async () => {
    // Represcrição às 22h com fuso errado geraria duas linhas vigentes no mesmo
    // dia, e o teto da disciplina viraria sorteio. Como as duas datas saem do
    // mesmo `now() AT TIME ZONE 'America/Sao_Paulo'`, isso não acontece.
    const linhas = await historico("Fonoaudiologia");
    const vigentes = linhas.filter((l) => l.vigencia_fim === null);
    expect(vigentes).toHaveLength(1);
    const fechada = linhas.find((l) => l.vigencia_fim !== null)!;
    // `String(...)`: o driver devolve `date` como objeto Date, e duas Dates do
    // mesmo dia não são a mesma referência — `toBe` compararia identidade.
    expect(String(fechada.vigencia_fim)).toBe(
      String(vigentes[0]!.vigencia_inicio),
    );
  });

  test("carga fora do passo de 30 min é recusada com mensagem útil", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "0.3" }),
    );
    expect(r.error).toMatch(/30 em 30 minutos/);
    expect(await listarPrescricoesVigentes(ctx, PATIENT)).toHaveLength(1);
  });

  test("carga acima do teto de 60h é recusada (erro de digitação)", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "200" }),
    );
    expect(r.error).toMatch(/60h/);
  });

  test("carga vazia é recusada — nunca vira zero silencioso", async () => {
    // `Number("")` é 0, não NaN: sem guard, campo vazio viraria prescrição de
    // zero hora, que é um teto válido para o banco e mentira para a clínica.
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "" }),
    );
    expect(r.error).toMatch(/Informe a carga horária/);
  });

  test("aceita vírgula decimal como o coordenador digita (1,5 = 1h30)", async () => {
    const r = await prescreverDisciplina(
      ctx,
      PATIENT,
      form({ disciplina: "Psicologia", horasAlvoSemana: "1,5" }),
    );
    expect(r.error).toBeUndefined();
    const psi = (await listarPrescricoesVigentes(ctx, PATIENT)).find(
      (p) => p.disciplina === "Psicologia",
    );
    expect(Number(psi!.horasAlvoSemana)).toBe(1.5);
  });

  test("encerrar prescrição fecha a vigência sem apagar histórico", async () => {
    const r = await encerrarPrescricao(ctx, PATIENT, "Psicologia");
    expect(r.error).toBeUndefined();
    const vigentes = await listarPrescricoesVigentes(ctx, PATIENT);
    expect(vigentes.map((p) => p.disciplina)).not.toContain("Psicologia");
    const restou = await owner`
      SELECT 1 FROM patient_alvo_disciplina
       WHERE patient_id = ${PATIENT} AND disciplina = 'Psicologia'`;
    expect(restou.length).toBeGreaterThan(0);
  });

  test("encerrar de novo avisa em vez de dizer que deu certo", async () => {
    // Zero linhas afetadas não é sucesso: ou outra aba já encerrou, ou a RLS
    // barrou a escrita (UPDATE barrado por policy afeta 0 linhas SEM estourar).
    const r = await encerrarPrescricao(ctx, PATIENT, "Psicologia");
    expect(r.error).toMatch(/Nenhuma prescrição vigente/);
  });

  test("terapeuta não prescreve (ato clínico do coordenador)", async () => {
    await expect(
      prescreverDisciplina(
        { clinicId: CLINIC_A, userId: U_TERA, role: "terapeuta" },
        PATIENT,
        form({ disciplina: "Fisioterapia", horasAlvoSemana: "2" }),
      ),
    ).rejects.toThrow(/Acesso negado/);
  });

  test("lista de pacientes marca quem ainda não tem prescrição (handoff 1)", async () => {
    const lista = await listarTodosPacientes(ctx);
    const comPrescricao = lista.find((p) => p.id === PATIENT);
    const semPrescricao = lista.find((p) => p.id === PATIENT_SEM);
    expect(comPrescricao?.temPrescricao).toBe(true);
    expect(semPrescricao?.temPrescricao).toBe(false);
  });

  test("prescrição encerrada NÃO conta para o selo (vigência, não existência)", async () => {
    await encerrarPrescricao(ctx, PATIENT, "Fonoaudiologia");
    const lista = await listarTodosPacientes(ctx);
    expect(lista.find((p) => p.id === PATIENT)?.temPrescricao).toBe(false);
  });

  /**
   * §MV4 — represcrever para baixo com equipe montada (fatia 6).
   *
   * O caso mais caro de errar da feature. Reduzir o teto abaixo do que a equipe
   * já entrega é LEGÍTIMO (travar obrigaria a desmontar a equipe antes de
   * corrigir a prescrição, ordem que a clínica não segue) — o que não pode
   * acontecer é salvar em silêncio e o coordenador descobrir a sobrealocação
   * depois, numa tela que ele já deixou para trás.
   */
  describe("represcrição com equipe montada (§MV4)", () => {
    const PATIENT_MV4 = "b0000000-0000-0000-0000-000000000032";

    beforeAll(async () => {
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES (${PATIENT_MV4}, ${CLINIC_A}, 'Com Equipe')`;
    });

    beforeEach(async () => {
      await owner`DELETE FROM care_team_membership WHERE patient_id = ${PATIENT_MV4}`;
      await owner`DELETE FROM patient_alvo_disciplina WHERE patient_id = ${PATIENT_MV4}`;
    });

    /** Alocação é PRÉ-CONDIÇÃO aqui — a suíte da equipe é que a exercita. */
    async function alocar(
      horas: string | null,
      papel = "terapeuta_referencia",
      user = U_TERA,
    ) {
      await owner`
        INSERT INTO care_team_membership
          (patient_id, user_id, disciplina, papel_na_equipe, horas_semana, vigencia_inicio)
        VALUES (${PATIENT_MV4}, ${user}, 'Fonoaudiologia', ${papel}, ${horas}, CURRENT_DATE)`;
    }

    /**
     * `confirmar` carrega o teto que o coordenador VIU no diálogo. Não é
     * cerimônia: o advisory lock serializa a corrida, não a detecta — sem este
     * eco, confirmar sobrescreveria uma represcrição que outro coordenador fez
     * enquanto o diálogo estava aberto, sem ninguém ver.
     */
    async function prescrever(
      horas: string,
      confirmar?: { horasAtuaisEsperadas: string },
    ) {
      const campos: Record<string, string> = {
        disciplina: "Fonoaudiologia",
        horasAlvoSemana: horas,
      };
      if (confirmar) {
        campos.confirmarSobrealocacao = "1";
        campos.horasAtuaisEsperadas = confirmar.horasAtuaisEsperadas;
      }
      return prescreverDisciplina(ctx, PATIENT_MV4, form(campos));
    }

    async function horasVigentes(): Promise<number | null> {
      const [linha] = await owner<{ horas_alvo_semana: string }[]>`
        SELECT horas_alvo_semana FROM patient_alvo_disciplina
         WHERE patient_id = ${PATIENT_MV4} AND disciplina = 'Fonoaudiologia'
           AND vigencia_fim IS NULL`;
      return linha ? Number(linha.horas_alvo_semana) : null;
    }

    test("reduzir abaixo do alocado PEDE confirmação e não salva nada", async () => {
      await prescrever("15");
      await alocar("15");

      const r = await prescrever("10");
      expect(r.ok).toBeUndefined();
      expect(r.confirmacao?.horasAtuais).toBe(15);
      expect(r.confirmacao?.horasNovas).toBe(10);
      expect(r.confirmacao?.horasAlocadas).toBe(15);
      // A frase é a MESMA do estado sobrealocado da barra (§MV3): duas
      // paráfrases da mesma consequência divergem, e a que o coordenador lê ao
      // confirmar deixa de ser a que ele encontra na tela de destino.
      expect(r.confirmacao?.texto).toBe(
        "15h de 10h alocadas (150%) — sobrealocação de 5h. Reduza as horas de um membro ou aumente a prescrição.",
      );
      // Nada foi gravado: confirmação é NO LUGAR de salvar, não depois.
      expect(await horasVigentes()).toBe(15);
    });

    test("confirmar salva e aponta a disciplina que ficou sobrealocada", async () => {
      await prescrever("15");
      await alocar("15");

      const r = await prescrever("10", { horasAtuaisEsperadas: "15" });
      expect(r.ok).toBe(true);
      expect(await horasVigentes()).toBe(10);
      // O trabalho termina no ajuste das horas dos membros, não no salvar — a
      // tela usa este campo para levar o coordenador até a barra afetada.
      expect(r.disciplinaSobrealocada).toBe("Fonoaudiologia");
    });

    test("confirmar RECUSA quando o teto mudou durante o diálogo", async () => {
      await prescrever("15");
      await alocar("15");
      const pedido = await prescrever("10");
      expect(pedido.confirmacao?.horasAtuais).toBe(15);

      // Outro coordenador represcreve enquanto o diálogo está aberto. O lock
      // não ajuda aqui: ele impede que as duas transações rodem juntas, não que
      // a segunda apague a decisão da primeira.
      await owner`UPDATE patient_alvo_disciplina SET vigencia_fim = CURRENT_DATE
                   WHERE patient_id = ${PATIENT_MV4} AND vigencia_fim IS NULL`;
      await owner`
        INSERT INTO patient_alvo_disciplina
          (clinic_id, patient_id, disciplina, horas_alvo_semana, vigencia_inicio)
        VALUES (${CLINIC_A}, ${PATIENT_MV4}, 'Fonoaudiologia', 12.0, CURRENT_DATE)`;

      const r = await prescrever("10", { horasAtuaisEsperadas: "15" });
      expect(r.ok).toBeUndefined();
      expect(r.error).toContain("mudou enquanto você confirmava");
      // O 12h do outro coordenador continua de pé: recusar é o ponto.
      expect(await horasVigentes()).toBe(12);
    });

    test("confirmar SEM o teto lido é contrato quebrado, não corrida", async () => {
      await prescrever("15");
      await alocar("15");

      // Campo ausente é chamador que não cumpriu o contrato do confirm — e o
      // coordenador não pode receber isso como "a prescrição mudou enquanto
      // você confirmava", que manda recarregar a página para um problema que
      // recarregar não resolve.
      const r = await prescreverDisciplina(
        ctx,
        PATIENT_MV4,
        form({
          disciplina: "Fonoaudiologia",
          horasAlvoSemana: "10",
          confirmarSobrealocacao: "1",
        }),
      );
      expect(r.error).toBe(
        "Confirmação incompleta: recarregue a página e refaça a alteração.",
      );
      expect(await horasVigentes()).toBe(15);
    });

    test("prescrição NOVA sobre equipe legada não inventa teto anterior (§3.1)", async () => {
      // Disciplina com vínculo e SEM prescrição vigente é o legado de §3.1 — e
      // é alcançável de propósito: encerrar a prescrição mantém os vínculos.
      await alocar("15");

      const r = await prescrever("10");
      expect(r.confirmacao?.horasAlocadas).toBe(15);
      // Ausente, não zero: "passa de 0h para 10h" afirmaria uma prescrição
      // anterior que nunca existiu — o mesmo número inventado que o
      // encerramento de vínculo se recusa a citar.
      expect(r.confirmacao?.horasAtuais).toBeUndefined();
      expect(await horasVigentes()).toBeNull();
    });

    test("vínculo sem horas entra no AVISO, não no número (§4.2)", async () => {
      await prescrever("15");
      await alocar("15");
      await alocar(null, "terapeuta_referencia", U_COORD);

      const r = await prescrever("10");
      // O número não muda: `SUM` ignora NULL. O que mudaria sem isto é o
      // diálogo mostrar UMA frase e a barra de destino DUAS — divergência por
      // omissão, que custa a mesma confiança que parafrasear a primeira.
      expect(r.confirmacao?.texto).toBe(
        "15h de 10h alocadas (150%) — sobrealocação de 5h. Reduza as horas de um membro ou aumente a prescrição.",
      );
      expect(r.confirmacao?.avisoSemHoras).toBe(
        "1 vínculo sem horas definidas — a conta acima está incompleta até você defini-las.",
      );
    });

    test("substituto consome saldo como terapeuta (D-B)", async () => {
      await prescrever("15");
      await alocar("15", "substituto");

      // A soma filtra pela LISTA de quem consome, não por exclusão do
      // coordenador. Com os três papéis do CHECK atual as duas formas empatam;
      // este caso é o que impede `substituto` de sair da conta sem ninguém ver.
      const r = await prescrever("10");
      expect(r.confirmacao?.horasAlocadas).toBe(15);
    });

    test("reduzir SEM estourar o alocado salva direto, sem diálogo no caminho", async () => {
      await prescrever("20");
      await alocar("8");

      const r = await prescrever("10");
      expect(r.confirmacao).toBeUndefined();
      expect(r.ok).toBe(true);
      // Sem este caso, uma implementação que pedisse confirmação em toda redução
      // passaria nos outros dois e transformaria ajuste de rotina em fricção.
      expect(r.disciplinaSobrealocada).toBeUndefined();
      expect(await horasVigentes()).toBe(10);
    });

    test("vínculo ENCERRADO não conta na confirmação (§4.5)", async () => {
      await prescrever("15");
      await alocar("15");
      await owner`UPDATE care_team_membership SET vigencia_fim = CURRENT_DATE
                   WHERE patient_id = ${PATIENT_MV4}`;

      // Sem o filtro de vigência, histórico encerrado somaria e a redução
      // pediria confirmação de uma sobrealocação que não existe — o bug que só
      // aparece em paciente com histórico, nunca em dado de teste novo.
      const r = await prescrever("10");
      expect(r.confirmacao).toBeUndefined();
      expect(r.ok).toBe(true);
    });

    test("coordenador de referência não empurra a redução para confirmação (D-C)", async () => {
      await prescrever("10");
      // Gestão do caso não consome saldo, e entra sem horas — o CHECK
      // `ctm_gestao_sem_horas` proíbe carga nesse papel. Reduzir 10h → 2h com
      // um coordenador de referência no caso não sobrealoca nada: se a
      // confirmação aparecesse aqui, ela estaria contando supervisão como
      // entrega clínica, que é exatamente o que D-C separa.
      await alocar(null, "coordenador_referencia");

      const r = await prescrever("2");
      expect(r.confirmacao).toBeUndefined();
      expect(r.ok).toBe(true);
    });
  });
});
