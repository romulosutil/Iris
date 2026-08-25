/**
 * #352 — Varredura de aviso prévio (`app_retencao_avisar`, migração 0128) e os
 * privilégios da role do job.
 *
 * O aviso de 90 dias é a promessa central de `docs/legal/politica-retencao-dados.md`
 * ("nenhuma eliminação automática silenciosa"), e até esta migração ela não
 * tinha mecanismo nenhum por trás.
 *
 * As quatro propriedades da varredura que são requisito, e não estilo:
 *  - janela FECHADA em cima: passado o vencimento quem age é a fila. Sem o
 *    limite superior o job reavisa a cada varredura, para sempre;
 *  - dedup ancorado na alta (`criado_em > alta_em`): alta corrigida REABRE o
 *    aviso, e a mesma alta nunca avisa duas vezes. Medido por patch inverso em
 *    25/08/2026: remover só `criado_em > p.alta_em` derruba o caso **20** (não
 *    o 19, como a tasks.md supunha — sem a âncora o dedup fica mais ESTRITO, e
 *    "não reavisar no mesmo dia" continua valendo). Remover o `NOT EXISTS`
 *    inteiro derruba 19 e 20;
 *  - `INSERT … SELECT` numa instrução só: o INSERT É o dedup, então não existe
 *    janela entre "avisei" e "gravei que avisei";
 *  - `ator_id = NULL`: não houve ator humano.
 *
 * E os dois casos negativos que existem porque são SURPREENDENTES: a role do
 * job recebe `42501` ao tentar purgar e ao tentar ler `patient`. Comportamento
 * surpreendente sem teste vira "bug" para o próximo leitor.
 *
 * Roda com `--config vitest.integration.config.ts`; sem ela coleta ZERO e sai
 * verde. Conferir a CONTAGEM.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC_A = "00000000-0000-0000-0000-0000003522aa";
const U_COORD_A = "00000000-0000-0000-0000-0000003522c1";

// Nascimento em 1980 põe o termo dos 18 anos em 1998, bem antes de qualquer
// alta usada aqui: nestes fixtures `vence_em` é exatamente `alta_em + 10 anos`,
// o que torna a fronteira da janela calculável na mão.
const P_EXATO_90 = "00000000-0000-0000-0000-000000352201"; // vence em 2026-06-01
const P_EM_91 = "00000000-0000-0000-0000-000000352202"; // vence em 2026-06-02
const P_JA_VENCIDO = "00000000-0000-0000-0000-000000352203"; // venceu em 2020-01-01
const P_SEM_ALTA = "00000000-0000-0000-0000-000000352204";

// 2026-06-01 menos 90 dias. 12:00Z fica no mesmo dia civil em America/Sao_Paulo
// (UTC-3), então a fronteira testada é a da REGRA, não a do fuso.
const REF_90 = "2026-03-03T12:00:00Z";
// Um dia antes: a janela de 90 dias passa a terminar em 2026-05-31.
const REF_VENCIDO = "2026-06-01T12:00:00Z";
// Depois da alta refeita (2026-04-01 → vence 2036-04-01), 90 dias antes.
const REF_REABERTURA = "2036-01-02T12:00:00Z";

const avisar = async (referencia: string, dias = 90, lote = 200) => {
  const r =
    await owner!`SELECT app_retencao_avisar(${referencia}::timestamptz, ${dias}::integer, ${lote}::integer) AS n`;
  return Number(r[0]!.n);
};

/** `SQLSTATE` da exceção, ou `null` se a promessa NÃO rejeitou. */
const codigoPg = (p: Promise<unknown>): Promise<string | null> =>
  p.then(
    () => null,
    (e: unknown) => (e as { code?: string }).code ?? null,
  );

const avisosDe = (p: string) =>
  owner!`SELECT ator_id, detalhe, criado_em FROM audit_log
           WHERE acao = 'expurgo_aviso_previo' AND entidade_id = ${p}
           ORDER BY criado_em`;

describe.skipIf(!hasDb)("#352 · aviso prévio de retenção", () => {
  beforeAll(async () => {
    await owner!`TRUNCATE audit_log, patient RESTART IDENTITY CASCADE`;
    await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
    await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica 352 aviso')`;
    await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_COORD_A}, 'Coord A', 'coord+352aviso@a.test')`;
    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD_A}, ${CLINIC_A}, 'coordenador')`;
    await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento, alta_em) VALUES
      (${P_EXATO_90},   ${CLINIC_A}, 'Vence em 90', '1980-01-01', '2016-06-01'),
      (${P_EM_91},      ${CLINIC_A}, 'Vence em 91', '1980-01-01', '2016-06-02'),
      (${P_JA_VENCIDO}, ${CLINIC_A}, 'Já vencido',  '1980-01-01', '2010-01-01'),
      (${P_SEM_ALTA},   ${CLINIC_A}, 'Sem alta',    '1980-01-01', NULL)`;
  });
  afterAll(async () => {
    await owner?.end();
  });

  test("16, 17 e 18 · avisa quem vence em exatamente 90 dias; não avisa em 91 nem já vencido", async () => {
    const n = await avisar(REF_90);
    expect(n).toBe(1);
    expect(await avisosDe(P_EXATO_90)).toHaveLength(1);
    expect(await avisosDe(P_EM_91)).toHaveLength(0);
    expect(await avisosDe(P_JA_VENCIDO)).toHaveLength(0);
    expect(await avisosDe(P_SEM_ALTA)).toHaveLength(0);
  });

  test("18b · a janela é fechada em cima: no dia do vencimento quem age é a fila, não o aviso", async () => {
    // No dia em que P_EXATO_90 vence, `vence_em > hoje` deixa de valer e ele
    // sai da varredura — sem esse limite superior o job reavisaria o mesmo
    // paciente a cada tick, para sempre. Quem ainda está DENTRO da janela
    // (P_EM_91, que vence no dia seguinte) é avisado na mesma passada, e é isso
    // que prova que a varredura rodou em vez de simplesmente não achar nada.
    await avisar(REF_VENCIDO);
    expect(await avisosDe(P_EXATO_90)).toHaveLength(1);
    expect(await avisosDe(P_EM_91)).toHaveLength(1);
  });

  test("19 · segunda varredura no mesmo dia avisa zero", async () => {
    const n = await avisar(REF_90);
    expect(n).toBe(0);
    expect(await avisosDe(P_EXATO_90)).toHaveLength(1);
  });

  test("20 · alta desfeita e refeita com data nova REABRE o aviso", async () => {
    // Dedup ancorado na alta, não em "existe algum aviso": a alta nova reinicia
    // o relógio de retenção, então um aviso posterior a ela é legítimo.
    await owner!`UPDATE patient SET alta_em = '2026-04-01' WHERE id = ${P_EXATO_90}`;
    const n = await avisar(REF_REABERTURA);
    expect(n).toBe(1);
    expect(await avisosDe(P_EXATO_90)).toHaveLength(2);
  });

  test("21 · a linha de aviso tem ator_id NULL e não carrega PII", async () => {
    const avisos = await avisosDe(P_EXATO_90);
    for (const a of avisos) {
      expect(a.ator_id).toBeNull();
      expect(a.detalhe).toMatchObject({ origem: "job" });
      expect(JSON.stringify(a.detalhe)).not.toContain("Vence em 90");
    }
  });

  test("22 · iris_retencao NÃO consegue chamar app_purgar_paciente (42501)", async () => {
    // O job nunca purga. A política proíbe eliminação automática silenciosa, e
    // a função exigiria `app.user_role`/`app.user_id` — que o job só
    // satisfaria FORJANDO GUC, gravando um ator falso numa operação
    // irreversível. Negativa afirmada por teste, nunca presumida.
    const codigo = await codigoPg(
      owner!.begin(async (tx) => {
        await tx`SET LOCAL ROLE iris_retencao`;
        await tx`SELECT app_purgar_paciente(${P_JA_VENCIDO}::uuid, 'x')`;
      }),
    );
    expect(codigo).toBe("42501");
    expect(
      await owner!`SELECT 1 FROM patient WHERE id = ${P_JA_VENCIDO}`,
    ).toHaveLength(1);
  });

  test("23 · iris_retencao NÃO consegue SELECT em patient (42501)", async () => {
    // Uma credencial de job vazada não lê nome de paciente, diário nem trilha:
    // a role tem EXECUTE em UMA função e SELECT em NENHUMA tabela.
    const codigo = await codigoPg(
      owner!.begin(async (tx) => {
        await tx`SET LOCAL ROLE iris_retencao`;
        await tx`SELECT id FROM patient LIMIT 1`;
      }),
    );
    expect(codigo).toBe("42501");
  });

  test("23b · iris_retencao CONSEGUE chamar a varredura — o privilégio positivo também é medido", async () => {
    const n = await owner!.begin(async (tx) => {
      await tx`SET LOCAL ROLE iris_retencao`;
      const r =
        await tx`SELECT app_retencao_avisar(${REF_90}::timestamptz, 90, 200) AS n`;
      return Number(r[0]!.n);
    });
    expect(n).toBe(0); // já avisado no caso 16; o que se mede aqui é não estourar 42501
  });
});
