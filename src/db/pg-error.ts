/**
 * SQLSTATE do erro vindo do `postgres-js`.
 *
 * Os dois caminhos existem porque a posição do código depende de QUEM lançou:
 * o Drizzle embrulha o erro do driver em `DrizzleQueryError` e o original vai
 * para `.cause`, mas uma query executada direto pelo driver (ou uma versão que
 * não embrulhe) expõe `.code` na raiz. Ler só um dos dois faz o `catch`
 * silenciosamente não reconhecer a violação e devolver 500 opaco — e o lado
 * que quebra depende da camada de abstração, não do código de chamada.
 *
 * Vive em `src/db/` (e não junto de um caso de uso) porque é conhecimento do
 * driver: já havia dois consumidores em features distintas — a materialização
 * da Agenda 2.0 (`23P01`/`23505`) e o cadastro de paciente (`23505` do CPF,
 * #191).
 */
export function codigoPg(e: unknown): string | undefined {
  return (
    (e as { code?: string } | undefined)?.code ??
    (e as { cause?: { code?: string } } | undefined)?.cause?.code
  );
}

/**
 * A mensagem que o POSTGRES emitiu — tipicamente o texto de um `RAISE` de
 * função `SECURITY DEFINER`.
 *
 * Aqui a precedência é o INVERSO do `codigoPg`: `.cause` primeiro. O
 * `DrizzleQueryError` põe na própria `.message` o SQL que NÓS mandamos
 * (`SELECT app_assert_...($1, $2)`), não a exceção do banco — ler a raiz devolve
 * o texto errado sem falhar, que é o pior modo de falha possível para uma
 * mensagem de diagnóstico. Erro cru do driver (sem `.cause`) cai na raiz, que aí
 * é a mensagem certa.
 */
export function mensagemPg(e: unknown): string | undefined {
  const raiz = e as { message?: string; cause?: { message?: string } } | null;
  return raiz?.cause?.message ?? raiz?.message ?? undefined;
}

/**
 * Nome da constraint violada, quando o Postgres o reporta (23P01/23505/23503).
 * Mesma dualidade raiz/`.cause` do `codigoPg`, e pelos dois nomes de campo:
 * `constraint_name` (postgres-js) e `constraint` (node-postgres) — ler só um
 * faz o chamador cair no fallback e atribuir a violação ao eixo errado.
 */
export function constraintPg(e: unknown): string | undefined {
  const raiz = e as
    | { constraint_name?: string; constraint?: string; cause?: unknown }
    | undefined;
  const causa = raiz?.cause as
    { constraint_name?: string; constraint?: string } | undefined;
  return (
    raiz?.constraint_name ??
    raiz?.constraint ??
    causa?.constraint_name ??
    causa?.constraint
  );
}
