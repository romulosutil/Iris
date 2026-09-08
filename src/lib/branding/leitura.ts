import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import type { MarcaClinica } from "./marca";

/**
 * #258 (D9) — leitura da marca institucional do tenant ATIVO.
 *
 * Recebe uma `Tx` já aberta por `withTenant` em vez de abrir a sua: quem
 * exporta um relatório já está dentro da transação do export (que segura o
 * `FOR UPDATE` do recheck de versão), e abrir uma segunda conexão só para
 * buscar um logotipo colocaria a marca fora do mesmo instante transacional
 * dos dados do relatório.
 *
 * A clínica NÃO entra por parâmetro: o predicado é `id = app_clinic_id_atual()`
 * — o mesmo GUC que a policy `clinic_read` (0002/0085) usa — então não existe
 * assinatura capaz de ler a marca de outro tenant. Aqui a versão leniente
 * (`_atual`, que devolve NULL) é a correta: fora de contexto de tenant a query
 * simplesmente não casa linha nenhuma e a marca sai vazia; `_exigido` é para
 * dentro de policy/definer, onde ocultar linha em silêncio seria o defeito.
 */
export async function lerMarcaClinica(tx: Tx): Promise<MarcaClinica> {
  const linhas = (await tx.execute(sql`
    SELECT nome, brand_logo, brand_logo_mime, brand_primary_color
      FROM clinic
     WHERE id = app_clinic_id_atual()
  `)) as unknown as Array<Record<string, unknown>>;

  const l = linhas[0];
  const logoBruto = l?.brand_logo ?? null;

  return {
    // `node-postgres` devolve bytea como Buffer; o driver serverless pode
    // devolver Uint8Array. Normaliza para Buffer, que é o que pdfkit
    // (`doc.image`) e `toString("base64")` esperam.
    logo:
      logoBruto instanceof Buffer
        ? logoBruto
        : logoBruto instanceof Uint8Array
          ? Buffer.from(logoBruto)
          : null,
    logoMime: (l?.brand_logo_mime as string | null) ?? null,
    corPrimaria: (l?.brand_primary_color as string | null) ?? null,
    nomeClinica: (l?.nome as string | null) ?? "",
  };
}

/** Marca vazia — fallback explícito para clínica sem white-label configurado. */
export function marcaVazia(nomeClinica = ""): MarcaClinica {
  return { logo: null, logoMime: null, corPrimaria: null, nomeClinica };
}
