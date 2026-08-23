/**
 * Teste de integração da reaplicação de expurgos pós-restauração (issue #89).
 *
 * O QUE ESTÁ SOB TESTE: `infra/backup/reaplicar-tombstones.sql`, o bloco que o
 * `infra/backup/restore.sh` roda logo depois do `pg_restore`. O arquivo é LIDO
 * daqui e executado como está — reescrever a regra no teste faria os dois
 * divergirem em silêncio na primeira mudança, que é exatamente o defeito que
 * este teste existe para impedir.
 *
 * POR QUE ISTO IMPORTA: um dump é a fotografia de um instante. Se o titular
 * exerceu o direito ao esquecimento (Art. 18) DEPOIS da fotografia, o dump
 * ainda contém o prontuário dele e restaurá-lo desfaz o expurgo. O tombstone
 * dessa purga nasceu depois do dump e, por construção, não está dentro dele —
 * daí o ledger (`tombstones-<TS>.csv`) viajar fora do dump.
 *
 * Regras provadas:
 *  - o mecanismo de contexto do restore (set_config LOCAL de app.clinic_id /
 *    app.user_id / app.user_role + `app_purgar_paciente`, rodando pela role
 *    DONA, sem `withTenant`) de fato expurga. É este ponto que morre em
 *    silêncio se algum guard trocar a GUC por lookup em tabela;
 *  - titular já ausente do dump NÃO aborta o lote (a função levanta exceção
 *    para paciente inexistente — o guard `CONTINUE` não é cosmético);
 *  - ator original ausente do banco restaurado → um coordenador da clínica
 *    assina a re-eliminação;
 *  - nenhum ator elegível → EXCEÇÃO e nada é expurgado (fail-closed): expurgo
 *    sem trilha é o que a LGPD cobra de volta;
 *  - a projeção do ledger gerada pelo `backup.sh` não carrega texto livre —
 *    `detalhe.motivo` é campo preenchido por humano e pode conter PII de
 *    terceiro.
 *
 * Roda com `pnpm test:rls`. Auto-skip sem DB.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import postgres from "postgres";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const RAIZ = join(__dirname, "..", "..");
const SQL_REAPLICAR = join(RAIZ, "infra", "backup", "reaplicar-tombstones.sql");
const SH_BACKUP = join(RAIZ, "infra", "backup", "backup.sh");

/**
 * Extrai o bloco `DO $reaplicar$ ... $reaplicar$;` do arquivo de produção.
 * As metacomandos do psql (`BEGIN`, `\copy`, `COMMIT`) ficam de fora porque
 * não são SQL — a transação e a carga do CSV são responsabilidade do chamador
 * (o `restore.sh` lá, este teste aqui).
 */
function blocoReaplicar(): string {
  const conteudo = readFileSync(SQL_REAPLICAR, "utf8");
  // Âncora de início de linha, não `indexOf`: o cabeçalho do arquivo CITA
  // `DO $reaplicar$` em comentário, e um `indexOf` cru casaria com a citação e
  // extrairia um bloco decapitado — que é como este teste falhou da primeira vez.
  const inicio = conteudo.search(/^DO \$reaplicar\$$/m);
  const fim = conteudo.search(/^\$reaplicar\$;$/m);
  if (inicio === -1 || fim === -1) {
    throw new Error(
      `bloco DO $reaplicar$ não encontrado em ${SQL_REAPLICAR} — o arquivo de produção mudou de forma e este teste parou de testar o que dizia testar`,
    );
  }
  return conteudo.slice(inicio, fim + "$reaplicar$;".length);
}

/**
 * Extrai o SELECT que o `backup.sh` usa para materializar o ledger, para que o
 * teste rode a projeção REAL contra o banco em vez de uma cópia dela.
 */
function selectDoLedger(): string {
  const conteudo = readFileSync(SH_BACKUP, "utf8");
  const m = conteudo.match(/\\\\copy \((SELECT[\s\S]*?)\) TO /);
  if (!m?.[1]) {
    throw new Error(
      `SELECT do ledger não encontrado em ${SH_BACKUP} — o backup.sh mudou de forma`,
    );
  }
  return m[1];
}

const CLINIC = "00000000-0000-0000-0000-0000000000ca";
const U_COORD = "00000000-0000-0000-0000-0000000000cc";
const U_SUMIDO = "00000000-0000-0000-0000-0000000000cf"; // ator que não existe mais
const P_VIVO = "00000000-0000-0000-0000-0000000000e1"; // veio de volta no dump
const P_AUSENTE = "00000000-0000-0000-0000-0000000000e2"; // já não está no dump
const P_SEGUNDO = "00000000-0000-0000-0000-0000000000e3";

type Tombstone = {
  patient_id: string;
  clinic_id: string;
  ator_id: string | null;
};

/**
 * Roda o bloco de produção sobre um ledger em memória, dentro de UMA transação
 * — igual ao `restore.sh`, que abre `BEGIN`, carrega o CSV na temp table e
 * fecha em `COMMIT`.
 */
async function reaplicar(ledger: Tombstone[]): Promise<void> {
  await owner!.begin(async (tx) => {
    await tx.unsafe(`CREATE TEMP TABLE _tombstone (
      patient_id uuid, clinic_id uuid, ator_id uuid, criado_em timestamptz
    ) ON COMMIT DROP`);
    let i = 0;
    for (const t of ledger) {
      await tx`INSERT INTO _tombstone (patient_id, clinic_id, ator_id, criado_em)
        VALUES (${t.patient_id}, ${t.clinic_id}, ${t.ator_id}, ${new Date(Date.UTC(2026, 0, 1, 0, 0, i++)).toISOString()})`;
    }
    await tx.unsafe(blocoReaplicar());
  });
}

describe.skipIf(!hasDb)(
  "fase6 · reaplicação de expurgos pós-restore (#89)",
  () => {
    beforeEach(async () => {
      await owner!`TRUNCATE audit_log, consent, patient RESTART IDENTITY CASCADE`;
      await owner!`TRUNCATE clinic, app_user, user_role RESTART IDENTITY CASCADE`;
      await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica Restore')`;
      await owner!`INSERT INTO app_user (id, name, email) VALUES (${U_COORD}, 'Coord', 'coord@tombstone.test')`;
      await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_COORD}, ${CLINIC}, 'coordenador')`;
      await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${P_VIVO}, ${CLINIC}, 'Ressuscitado'),
      (${P_SEGUNDO}, ${CLINIC}, 'Segundo')`;
      // Subárvore bloqueante: sem o erasure em cascata da função, o DELETE da
      // raiz falharia por FK — é o que prova que a função foi mesmo chamada.
      await owner!`INSERT INTO consent (patient_id, tipo, responsavel_signatario, versao_termo)
      VALUES (${P_VIVO}, 'tratamento_dados_menor', 'Mãe do Ressuscitado', 'v1')`;
    });

    afterAll(async () => {
      await owner?.end();
    });

    test("titular que voltou no dump é re-eliminado, com trilha do ato", async () => {
      await reaplicar([
        { patient_id: P_VIVO, clinic_id: CLINIC, ator_id: U_COORD },
      ]);

      expect(
        await owner!`SELECT 1 FROM patient WHERE id = ${P_VIVO}`,
      ).toHaveLength(0);
      expect(
        await owner!`SELECT 1 FROM consent WHERE patient_id = ${P_VIVO}`,
      ).toHaveLength(0);

      const fato =
        await owner!`SELECT ator_id, patient_id, detalhe FROM audit_log
      WHERE acao = 'paciente_purgado' AND entidade_id = ${P_VIVO}`;
      expect(fato).toHaveLength(1);
      expect(fato[0]!.ator_id).toBe(U_COORD);
      // Continua pseudônima: a linha-fato nunca aponta para o titular.
      expect(fato[0]!.patient_id).toBeNull();
    });

    test("titular já ausente do dump não aborta o lote (o CONTINUE não é cosmético)", async () => {
      await reaplicar([
        { patient_id: P_AUSENTE, clinic_id: CLINIC, ator_id: U_COORD },
        { patient_id: P_SEGUNDO, clinic_id: CLINIC, ator_id: U_COORD },
      ]);

      // O segundo tem de ter sido expurgado APESAR de o primeiro não existir.
      expect(
        await owner!`SELECT 1 FROM patient WHERE id = ${P_SEGUNDO}`,
      ).toHaveLength(0);
    });

    test("ator original ausente do banco restaurado: coordenador da clínica assina", async () => {
      await reaplicar([
        { patient_id: P_VIVO, clinic_id: CLINIC, ator_id: U_SUMIDO },
      ]);

      const fato = await owner!`SELECT ator_id FROM audit_log
      WHERE acao = 'paciente_purgado' AND entidade_id = ${P_VIVO}`;
      expect(fato).toHaveLength(1);
      expect(fato[0]!.ator_id).toBe(U_COORD);
    });

    test("sem ator elegível: aborta e NÃO expurga (fail-closed)", async () => {
      // Clínica sem nenhum coordenador + ator do ledger inexistente.
      await owner!`DELETE FROM user_role WHERE user_id = ${U_COORD}`;

      await expect(
        reaplicar([
          { patient_id: P_VIVO, clinic_id: CLINIC, ator_id: U_SUMIDO },
        ]),
      ).rejects.toThrow(/ator para assinar a re-eliminacao/);

      // Fail-closed de verdade: a transação inteira voltou, o titular continua lá
      // e ninguém foi expurgado sem trilha.
      expect(
        await owner!`SELECT 1 FROM patient WHERE id = ${P_VIVO}`,
      ).toHaveLength(1);
      expect(
        await owner!`SELECT 1 FROM audit_log WHERE acao = 'paciente_purgado'`,
      ).toHaveLength(0);
    });

    test("o ledger gerado pelo backup.sh não carrega texto livre (PII de terceiro)", async () => {
      // Purga real, para existir um tombstone com `detalhe.motivo` preenchido por
      // humano — o campo que NÃO pode vazar para o ledger.
      await reaplicar([
        { patient_id: P_VIVO, clinic_id: CLINIC, ator_id: U_COORD },
      ]);
      await owner!`UPDATE audit_log
       SET detalhe = jsonb_build_object('motivo', 'pedido da mãe Fulana de Tal', 'pseudonimizado', true)
     WHERE acao = 'paciente_purgado'`;

      const linhas = await owner!.unsafe(selectDoLedger());
      expect(linhas.length).toBeGreaterThan(0);

      // A projeção real do backup.sh: só as quatro colunas, todas UUID/timestamp.
      expect(Object.keys(linhas[0]!).sort()).toEqual([
        "ator_id",
        "clinic_id",
        "criado_em",
        "patient_id",
      ]);
      expect(JSON.stringify(linhas)).not.toContain("Fulana");
      expect(JSON.stringify(linhas)).not.toContain("motivo");
    });
  },
);
