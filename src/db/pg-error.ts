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
