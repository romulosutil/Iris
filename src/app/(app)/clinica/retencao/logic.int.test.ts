import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { hasDb } from "@tests/integration-env";
vi.mock("server-only", () => ({}));

/**
 * #352 — camada de aplicação do expurgo (T14).
 *
 * Contra Postgres, e não com dublê, porque tudo o que importa aqui é efeito de
 * banco: o gate de elegibilidade, o erasure em ~24 tabelas descendentes e o
 * desaparecimento da linha da fila são todos do SQL. Um dublê devolveria o
 * literal esperado e a suíte ficaria verde contra uma action que não purga
 * nada.
 *
 * O que esta suíte discrimina, e que a de `db/tests/retencao-expurgo` não
 * cobre (lá o alvo é a função SQL; aqui é o caminho da UI até ela):
 *
 *  - **o confirmador é conferido contra o nome lido DO BANCO.** Comparar o que
 *    o cliente mandou com o que o cliente mandou não confirma nada;
 *  - **caixa e acento contam.** Normalizar reduziria o atrito exatamente onde
 *    o atrito é o produto;
 *  - **conta em somente-leitura PURGA.** É a única escrita do repositório fora
 *    do `comEscrita`, e o comportamento é surpreendente o bastante para que
 *    alguém "corrija o esquecimento" adicionando o wrapper. Este é o teste que
 *    trava a decisão;
 *  - **o gate do banco chega até a UI como erro OPACO** — o texto do `RAISE`
 *    nomeia função e papel, e não é o que o coordenador deve ler.
 *
 * Roda com `--config vitest.integration.config.ts`. Sem ela, `*.int.test.ts`
 * está no `exclude` do `vitest.config.ts`: coleta ZERO e sai verde. Conferir a
 * CONTAGEM, nunca a cor.
 */

const CLINIC = "00000000-0000-0000-0000-0000003522aa";
const U_COORD = "00000000-0000-0000-0000-0000003522c1";
const U_TERA = "00000000-0000-0000-0000-0000003522d1";
const U_RECEP = "00000000-0000-0000-0000-0000003522e1";

const P_VENCIDO = "00000000-0000-0000-0000-000000352201";
const P_VENCIDO_2 = "00000000-0000-0000-0000-000000352202";
const P_SOB_GUARDA = "00000000-0000-0000-0000-000000352203";

const NOME_VENCIDO = "Ana Clara Ferrão";
const NOME_VENCIDO_2 = "Bruno Sampaio";
const NOME_SOB_GUARDA = "Caio Menezes";

const MOTIVO = "Prazo legal de guarda vencido, eliminação de rotina.";

const ctxCoord = {
  clinicId: CLINIC,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxTera = {
  clinicId: CLINIC,
  userId: U_TERA,
  role: "terapeuta",
} as const;
const ctxRecep = {
  clinicId: CLINIC,
  userId: U_RECEP,
  role: "admin_recepcao",
} as const;

let owner: ReturnType<typeof postgres>;
let L: typeof import("./logic");
let Q: typeof import("./queries");
let appSql: typeof import("@/db/client").sql;

async function existePaciente(id: string): Promise<boolean> {
  const linhas = await owner`SELECT 1 FROM patient WHERE id = ${id}`;
  return linhas.length > 0;
}

async function idsNaFila(): Promise<string[]> {
  const pagina = await Q.lerPaginaExpurgaveis(ctxCoord, 1);
  return pagina.linhas.map((l) => l.id);
}

async function semearPacientes(): Promise<void> {
  await owner`DELETE FROM audit_log WHERE clinic_id = ${CLINIC}`;
  await owner`DELETE FROM patient WHERE clinic_id = ${CLINIC}`;
  // Vencidos: nascidos em 1980 (18 anos completos em 1998) com alta em 2001 —
  // guarda de 10 anos venceu em 2011. Sob guarda: nascido em 2020, alta em
  // 2024 — a maioridade em 2038 domina, e é ela que o gate protege.
  await owner`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em) VALUES
    (${P_VENCIDO},    ${CLINIC}, ${NOME_VENCIDO},    '1980-01-01', '2001-01-01'),
    (${P_VENCIDO_2},  ${CLINIC}, ${NOME_VENCIDO_2},  '1980-01-01', '2002-01-01'),
    (${P_SOB_GUARDA}, ${CLINIC}, ${NOME_SOB_GUARDA}, '2020-01-01', '2024-01-01')`;
}

describe.skipIf(!hasDb)("#352 · expurgo pela camada de aplicação", () => {
  beforeAll(async () => {
    L = await import("./logic");
    Q = await import("./queries");
    ({ sql: appSql } = await import("@/db/client"));
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });

    // Limpeza ESCOPADA, sem TRUNCATE: um `TRUNCATE ... CASCADE` aqui apagaria a
    // fixture de outros arquivos de int-test rodando na mesma base e a cascata
    // se leria como defeito de RLS.
    await owner`DELETE FROM audit_log WHERE clinic_id = ${CLINIC}`;
    await owner`DELETE FROM patient WHERE clinic_id = ${CLINIC}`;
    await owner`DELETE FROM user_role WHERE clinic_id = ${CLINIC}`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD}, ${U_TERA}, ${U_RECEP})`;
    await owner`DELETE FROM clinic WHERE id = ${CLINIC}`;

    // `isento_trial` tira o guard de escrita da equação nos casos comuns — o
    // caso que mede a conta bloqueada liga o bloqueio explicitamente.
    await owner`INSERT INTO clinic (id, nome, isento_trial) VALUES (${CLINIC}, 'C352 expurgo', true)`;
    // Sufixo único por arquivo: `coord@a.test` aparece em 13+ arquivos e o
    // `UNIQUE(email)` derrubaria o setup inteiro.
    await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'coord+352expurgo@a.test', 'Coord'),
      (${U_TERA},  'tera+352expurgo@a.test',  'Tera'),
      (${U_RECEP}, 'recep+352expurgo@a.test', 'Recep')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD},  ${CLINIC}, 'coordenador'),
      (${U_TERA},   ${CLINIC}, 'terapeuta'),
      (${U_RECEP},  ${CLINIC}, 'admin_recepcao')`;
  });

  afterAll(async () => {
    await owner`DELETE FROM audit_log WHERE clinic_id = ${CLINIC}`;
    await owner`DELETE FROM patient WHERE clinic_id = ${CLINIC}`;
    await owner`DELETE FROM user_role WHERE clinic_id = ${CLINIC}`;
    await owner`DELETE FROM app_user WHERE id IN (${U_COORD}, ${U_TERA}, ${U_RECEP})`;
    await owner`DELETE FROM clinic WHERE id = ${CLINIC}`;
    await owner?.end();
    await appSql?.end();
  });

  beforeEach(semearPacientes);

  /* 1 */
  test("terapeuta e recepção são barrados — expurgar é ato de coordenador", async () => {
    for (const ctx of [ctxTera, ctxRecep]) {
      await expect(
        L.purgarPacienteCore(ctx, {
          pacienteId: P_VENCIDO,
          motivo: MOTIVO,
          confirmacao: NOME_VENCIDO,
        }),
      ).rejects.toThrow();
    }
    // Nada foi apagado por um caminho que "só" não avisou.
    expect(await existePaciente(P_VENCIDO)).toBe(true);
  });

  /* 2 */
  test("motivo com menos de 10 caracteres recusa e não apaga nada", async () => {
    for (const ruim of ["", "   ", "curto"]) {
      const r = await L.purgarPacienteCore(ctxCoord, {
        pacienteId: P_VENCIDO,
        motivo: ruim,
        confirmacao: NOME_VENCIDO,
      });
      expect(r.ok).toBeUndefined();
      expect(r.error).toBeTruthy();
    }
    expect(await existePaciente(P_VENCIDO)).toBe(true);
  });

  /* 3 — régua de mutação: remover a checagem de `confirmacao` derruba este caso. */
  test("confirmação diferente do nome recusa, inclusive por caixa e acento", async () => {
    const variantes = [
      "",
      "Ana Clara Ferrao", // sem acento
      "ana clara ferrão", // caixa diferente
      " Ana Clara Ferrão", // espaço à esquerda
      NOME_VENCIDO_2, // o nome do paciente da linha AO LADO
    ];
    for (const confirmacao of variantes) {
      const r = await L.purgarPacienteCore(ctxCoord, {
        pacienteId: P_VENCIDO,
        motivo: MOTIVO,
        confirmacao,
      });
      expect(r.ok).toBeUndefined();
      expect(r.error).toBe("A confirmação não confere com o nome do paciente.");
    }
    expect(await existePaciente(P_VENCIDO)).toBe(true);
  });

  /* 4 */
  test("paciente sob guarda é recusado, e o erro do banco chega opaco", async () => {
    const r = await L.purgarPacienteCore(ctxCoord, {
      pacienteId: P_SOB_GUARDA,
      motivo: MOTIVO,
      confirmacao: NOME_SOB_GUARDA,
    });
    expect(r.ok).toBeUndefined();
    // O texto do `RAISE` nomeia função e papel; nada disso pode aparecer na UI.
    expect(r.error).not.toMatch(/app_purgar_paciente|RAISE|coordenador/);
    expect(r.error).toBe(
      "Não foi possível expurgar este prontuário. Verifique se o prazo de guarda já venceu.",
    );
    expect(await existePaciente(P_SOB_GUARDA)).toBe(true);
  });

  /* 5 */
  test("paciente elegível é purgado e sai da fila", async () => {
    expect(await idsNaFila()).toContain(P_VENCIDO);

    const r = await L.purgarPacienteCore(ctxCoord, {
      pacienteId: P_VENCIDO,
      motivo: MOTIVO,
      confirmacao: NOME_VENCIDO,
    });
    expect(r.ok).toBe(true);

    expect(await existePaciente(P_VENCIDO)).toBe(false);
    const fila = await idsNaFila();
    expect(fila).not.toContain(P_VENCIDO);
    // O vizinho elegível continua lá: o expurgo é por linha, não por lote.
    expect(fila).toContain(P_VENCIDO_2);

    // A trilha guarda o ato, pseudonimizada: `patient_id` NULL, e o motivo é o
    // único conteúdo que sobrevive ao prontuário.
    const [linha] = (await owner`
      SELECT acao, ator_id, patient_id, detalhe FROM audit_log
       WHERE entidade_id = ${P_VENCIDO} AND acao = 'paciente_purgado'
    `) as unknown as {
      acao: string;
      ator_id: string | null;
      patient_id: string | null;
      detalhe: Record<string, unknown>;
    }[];
    expect(linha!.ator_id).toBe(U_COORD);
    expect(linha!.patient_id).toBeNull();
    expect(linha!.detalhe).toMatchObject({
      motivo: MOTIVO,
      pseudonimizado: true,
    });
  });

  /* 6 — o comportamento surpreendente que trava a decisão de NÃO usar `comEscrita`. */
  test("conta em somente-leitura PURGA", async () => {
    // Eliminar dado cujo prazo venceu é obrigação da clínica COMO CONTROLADORA
    // (LGPD Art. 16), e ela continua controladora quando está inadimplente
    // conosco. Bloquear por dívida converteria nossa cobrança em retenção
    // ilegal de dado pessoal de um terceiro que não é parte do contrato.
    //
    // Se alguém envolver `purgarPacienteCore` em `comEscrita()` "corrigindo um
    // esquecimento", é este caso que cai.
    await owner`UPDATE clinic SET isento_trial = false, trial_dias = 7,
      trial_comeco_em = now() - interval '60 days' WHERE id = ${CLINIC}`;
    try {
      const r = await L.purgarPacienteCore(ctxCoord, {
        pacienteId: P_VENCIDO,
        motivo: MOTIVO,
        confirmacao: NOME_VENCIDO,
      });
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(await existePaciente(P_VENCIDO)).toBe(false);
    } finally {
      await owner`UPDATE clinic SET isento_trial = true WHERE id = ${CLINIC}`;
    }
  });

  /* 7 */
  test("purgar o mesmo paciente duas vezes recusa a segunda, com mensagem opaca", async () => {
    expect(
      (
        await L.purgarPacienteCore(ctxCoord, {
          pacienteId: P_VENCIDO,
          motivo: MOTIVO,
          confirmacao: NOME_VENCIDO,
        })
      ).ok,
    ).toBe(true);

    // O expurgo APAGA a linha de `patient`. Na segunda vez não há nome contra o
    // que conferir, e a mensagem é a mesma de "não existe" e de "outra clínica"
    // de propósito: distinguir viraria oráculo de existência entre clínicas.
    const segunda = await L.purgarPacienteCore(ctxCoord, {
      pacienteId: P_VENCIDO,
      motivo: MOTIVO,
      confirmacao: NOME_VENCIDO,
    });
    expect(segunda.ok).toBeUndefined();
    expect(segunda.error).toBe("Paciente indisponível para expurgo.");
  });

  /* 8 — payload da fila: R352.C8. */
  test("a fila não devolve campo que a tela não desenha", async () => {
    const pagina = await Q.lerPaginaExpurgaveis(ctxCoord, 1);
    expect(pagina.total).toBe(2);
    const linha = pagina.linhas.find((l) => l.id === P_VENCIDO)!;
    expect(Object.keys(linha).sort()).toEqual([
      "altaEm",
      "avisadoEm",
      "id",
      "nome",
      "venceEm",
    ]);
    // Data civil formatada no Postgres: `date` não tem fuso, e um `Date` de JS
    // formatado depois faria o vencimento aparecer um dia antes.
    expect(linha.altaEm).toBe("01/01/2001");
    expect(linha.venceEm).toBe("01/01/2011");
  });

  /* 9 */
  test("pacienteId malformado recusa antes de chegar ao Postgres", async () => {
    const r = await L.purgarPacienteCore(ctxCoord, {
      pacienteId: "nao-e-uuid",
      motivo: MOTIVO,
      confirmacao: NOME_VENCIDO,
    });
    // Sem esta validação o valor chega ao banco como cast inválido (`22P02`) e
    // sobe como erro genérico de banco, não como recusa da aplicação.
    expect(r.error).toBe("Paciente não informado.");
  });
});
