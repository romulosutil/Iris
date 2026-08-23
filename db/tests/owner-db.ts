/**
 * Handle da role DONA (`MIGRATION_DATABASE_URL`) para ARRANJO e VERIFICAÇÃO de
 * teste de integração — nunca para exercitar o comportamento sob teste.
 *
 * Por que existe: os testes de `src/lib/export/acervo/` montavam fixture com
 * `authDb` ("seed básico em authDb (dona)"), e `authDb` não é a dona — é
 * `iris_auth`, que por desenho **não tem GRANT** em `patient`/`audit_log` e só
 * escreve em `export_bundle` através das funções `SECURITY DEFINER` (com a GUC
 * de tenant no escopo). O arranjo estourava `42501` — `permission denied for
 * table patient` / `new row violates row-level security policy for table
 * "export_bundle"` — antes de chegar em qualquer asserção. Ver o aviso em
 * `src/db/client.ts`: "authDb NUNCA toca dado de paciente".
 *
 * A regra continua a de sempre (`integration-env.ts`): o que prova isolamento
 * multi-tenant roda pelos clientes de app/auth, via `withTenant` e as funções
 * sob teste. A role dona é BYPASSRLS e mascararia todo caso se aparecesse no
 * caminho medido — aqui ela só monta e confere o cenário.
 *
 * Conexão preguiçosa: o módulo importa sem exigir env (o `describe.skipIf`
 * decide se algo roda). Feche com `fecharOwnerDb()` num `afterAll`, senão o
 * pool de 1 conexão segura o processo do vitest aberto.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

type OwnerSql = ReturnType<typeof postgres>;
type OwnerDb = ReturnType<typeof drizzle<typeof schema>>;

let sqlOwner: OwnerSql | undefined;
let dbOwner: OwnerDb | undefined;

/** Drizzle sob a role dona. Abre a conexão no primeiro uso. */
export function ownerDb(): OwnerDb {
  if (!dbOwner) {
    const url = process.env.MIGRATION_DATABASE_URL;
    if (!url) {
      throw new Error(
        "MIGRATION_DATABASE_URL não definida — arranjo de teste não tem role dona",
      );
    }
    sqlOwner = postgres(url, { max: 1 });
    dbOwner = drizzle(sqlOwner, { schema, casing: "snake_case" });
  }
  return dbOwner;
}

/** Encerra a conexão da role dona (chamar em `afterAll`). */
export async function fecharOwnerDb(): Promise<void> {
  await sqlOwner?.end();
  sqlOwner = undefined;
  dbOwner = undefined;
}
