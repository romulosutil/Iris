/**
 * Integração — o CHECK `consent_responsavel_por_tipo` (#100, migração 0051)
 * vive no BANCO, não só na validação da server action.
 *
 * Por que testar no banco e não só em `criarPacienteEConsent`: a action é UM
 * caminho de escrita. Script admin, migração de dados e qualquer formulário
 * futuro escrevem direto na tabela. O CHECK é a última linha de defesa contra
 * um estado semanticamente inválido — "consentimento de menor sem responsável"
 * ou "titular adulto com responsável fantasma".
 *
 * Roda como superuser (`MIGRATION_DATABASE_URL`): o objetivo é provar que nem
 * quem bypassa RLS consegue gravar o estado inválido. Auto-skip sem DB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import postgres from "postgres";

const hasDb = !!process.env.MIGRATION_DATABASE_URL;

const CLINIC = "11111111-1111-1111-1111-111111111111";
const P_CHECK = "b0000000-0000-0000-0000-0000000000c1";

let owner: ReturnType<typeof postgres>;

describe.skipIf(!hasDb)("consent_responsavel_por_tipo (CHECK de banco)", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica CHECK')
      ON CONFLICT (id) DO NOTHING`;
    await owner`DELETE FROM consent WHERE patient_id = ${P_CHECK}`;
    await owner`DELETE FROM patient WHERE id = ${P_CHECK}`;
    await owner`INSERT INTO patient (id, clinic_id, nome)
      VALUES (${P_CHECK}, ${CLINIC}, 'Paciente do CHECK')`;
  });

  // Limpeza por teste, não por suíte: sem isto um teste que insere linhas
  // válidas contamina a contagem do seguinte, e a suíte só passa na ordem em
  // que foi escrita (quebra com --shuffle).
  beforeEach(async () => {
    await owner`DELETE FROM consent WHERE patient_id = ${P_CHECK}`;
  });

  afterAll(async () => {
    await owner`DELETE FROM consent WHERE patient_id = ${P_CHECK}`;
    await owner`DELETE FROM patient WHERE id = ${P_CHECK}`;
    await owner?.end();
  });

  test("autoconsentimento_titular_adulto COM responsável é rejeitado pelo banco", async () => {
    await expect(
      owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
        VALUES (${P_CHECK}, 'autoconsentimento_titular_adulto', 'Mãe Fantasma', 'adulto-v1')`,
    ).rejects.toThrow(/consent_responsavel_por_tipo/);
  });

  test("tratamento_dados_menor com responsável NULL é rejeitado pelo banco", async () => {
    await expect(
      owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
        VALUES (${P_CHECK}, 'tratamento_dados_menor', NULL, 'v1')`,
    ).rejects.toThrow(/consent_responsavel_por_tipo/);
  });

  test("tratamento_dados_menor com responsável string VAZIA é rejeitado", async () => {
    // `IS NOT NULL` sozinho aceitaria '' — é exatamente a sentinela falsa que
    // a constraint existe para impedir. Daí o btrim SOMADO ao NULL-check.
    await expect(
      owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
        VALUES (${P_CHECK}, 'tratamento_dados_menor', '', 'v1')`,
    ).rejects.toThrow(/consent_responsavel_por_tipo/);
  });

  test("tratamento_dados_menor com responsável só de espaços é rejeitado", async () => {
    await expect(
      owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
        VALUES (${P_CHECK}, 'tratamento_dados_menor', '   ', 'v1')`,
    ).rejects.toThrow(/consent_responsavel_por_tipo/);
  });

  test("os dois estados VÁLIDOS passam (o CHECK não é um bloqueio geral)", async () => {
    await owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P_CHECK}, 'tratamento_dados_menor', 'Mãe Legítima', 'v1')`;
    await owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P_CHECK}, 'autoconsentimento_titular_adulto', NULL, 'adulto-v1')`;
    // ORDER BY tipo::text — sem o cast a ordem seria a ORDINAL do enum (ordem
    // em que os valores foram adicionados), não a alfabética.
    const linhas = await owner`
      SELECT tipo, responsavel_signatario FROM consent
      WHERE patient_id = ${P_CHECK}
        AND tipo IN ('tratamento_dados_menor', 'autoconsentimento_titular_adulto')
      ORDER BY tipo::text`;
    expect(linhas).toHaveLength(2);
    // D2: renovação/coexistência é LINHA NOVA — não há UNIQUE em patient_id.
    expect(linhas[0]!.responsavel_signatario).toBeNull();
    expect(linhas[1]!.responsavel_signatario).toBe("Mãe Legítima");
  });

  test("tipos legados (uso_ia_processamento) passam com e sem responsável", async () => {
    // Compatibilidade retroativa: o CHECK não inventa regra para os dois
    // valores de enum que ainda não têm uso em código.
    await owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P_CHECK}, 'uso_ia_processamento', NULL, 'v1')`;
    await owner`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P_CHECK}, 'exportacao_relatorios', 'Alguém', 'v1')`;
    const linhas = await owner`
      SELECT tipo FROM consent
      WHERE patient_id = ${P_CHECK}
        AND tipo IN ('uso_ia_processamento', 'exportacao_relatorios')`;
    expect(linhas).toHaveLength(2);
  });
});
