/**
 * Dado de REFERÊNCIA da suíte de integração — #222.
 *
 * `protocol_familia_catalogo` não é fixture: é dado de referência semeado pela
 * migração `db/migrations/0001_rls.sql`. Dois arquivos de teste o incluíam no
 * `TRUNCATE ... CASCADE` do próprio `beforeAll` e repunham só a família
 * sintética que eles mesmos usavam (`vbmapp-d` / `vbmapp-e`). Efeito: as 4
 * famílias do seed sumiam do banco local PERMANENTEMENTE — nada as repõe —, e
 * qualquer arquivo que dependesse delas passava a falhar no setup com
 *
 *   PostgresError: insert or update on table "protocol" violates foreign key
 *   constraint "protocol_familia_protocol_familia_catalogo_id_fk"
 *
 * Uma FK não diz QUEM sujou o catálogo, e a suíte passava ou falhava conforme a
 * ORDEM dos arquivos: verde deixava de ser evidência.
 *
 * Duas defesas, deliberadamente redundantes:
 *
 *  1. Nenhum teste trunca tabela de referência (garantido pelo guard em
 *     `db/tests/no-truncate-reference-data.test.ts`).
 *  2. O `globalSetup` repõe o seed antes de qualquer arquivo rodar — cura banco
 *     local já sujo por execução anterior, sem exigir re-migrar.
 *
 * A (2) sozinha não basta: um truncate no meio da rodada quebraria os arquivos
 * seguintes. A (1) sozinha não basta: não conserta o banco que já está sujo.
 */
import type postgres from "postgres";

/**
 * Espelha `db/migrations/0001_rls.sql:244-249`. Mantenha em sincronia: divergir
 * aqui é pior que não ter, porque o teste passaria com dado que produção não tem.
 */
const PROTOCOL_FAMILIA_SEED = [
  {
    id: "aba_marcos_desenvolvimento",
    nome: "ABA — marcos de desenvolvimento",
    descricao: "Protocolos de marcos (ex.: VB-MAPP, ABLLS-R)",
  },
  {
    id: "intervencao_naturalista",
    nome: "Intervenção naturalista",
    descricao: "Modelos naturalistas (ex.: Denver/ESDM)",
  },
  {
    id: "fonoaudiologia",
    nome: "Fonoaudiologia",
    descricao: "Protocolos de linguagem e comunicação",
  },
  {
    id: "terapia_ocupacional",
    nome: "Terapia ocupacional",
    descricao: "Protocolos de integração sensorial e AVDs",
  },
] as const;

/** Tabelas que NUNCA podem entrar num TRUNCATE de teste (ver guard). */
export const REFERENCE_TABLES = ["protocol_familia_catalogo"] as const;

/**
 * Repõe o catálogo de famílias, idempotente. Precisa da conexão da role DONA
 * (`MIGRATION_DATABASE_URL`) — a role de app não tem INSERT nessa tabela.
 *
 * `ON CONFLICT DO NOTHING` de propósito: se a linha existe, o valor que vale é
 * o da migração, não o desta constante.
 */
export async function seedProtocolFamiliaCatalogo(
  owner: postgres.Sql,
): Promise<void> {
  for (const f of PROTOCOL_FAMILIA_SEED) {
    await owner`
      INSERT INTO protocol_familia_catalogo (id, nome, descricao)
      VALUES (${f.id}, ${f.nome}, ${f.descricao})
      ON CONFLICT (id) DO NOTHING`;
  }
}
