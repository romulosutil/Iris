import Link from "next/link";
import { cookies } from "next/headers";
import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";
import { RedefinirSenhaForm } from "./redefinir-senha-form";
import { NOME_COOKIE_TOKEN } from "./cookie";
import { MENSAGEM_SEM_LINK_ATIVO } from "./logic";

export const metadata = {
  title: "Redefinir senha — Iris",
  description: "Redefinição de senha do Iris.",
};

/**
 * Fix round 1, Task 9 (finding C1 do review). Antes esta página lia `token`
 * de `searchParams` e passava para o formulário client — o token ficava na
 * URL (visível a `document.location`, a scripts de terceiro montados por
 * `src/app/layout.tsx`, e ao header `Referer` de qualquer recurso externo
 * carregado pela página). Agora `src/middleware.ts` já interceptou
 * `?token=...` ANTES desta página renderizar, moveu o valor para um cookie
 * httpOnly e redirecionou para a URL limpa — então esta página nunca vê o
 * token, só a PRESENÇA do cookie (`cookies()` pode ser lido em Server
 * Component; só não pode ser gravado/apagado aqui — isso é `./logic.ts`,
 * chamado a partir de uma Server Action).
 *
 * Fix round 1 (finding M5 do review): a mensagem de "sem link" não afirma
 * mais uma causa específica ("inválido ou expirado") que o servidor não tem
 * como confirmar neste ponto — só descreve o fato observável (não há cookie
 * de link ativo agora). Ver `MENSAGEM_SEM_LINK_ATIVO` em `./logic.ts`.
 */
export default async function RedefinirSenhaPage() {
  const jar = await cookies();
  const temLinkAtivo = jar.has(NOME_COOKIE_TOKEN);

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Redefinir senha
        </h1>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] p-6",
        })}
      >
        {temLinkAtivo ? (
          <RedefinirSenhaForm />
        ) : (
          <div className="flex flex-col gap-4">
            <Alert severidade="erro" titulo="Sem link ativo">
              {MENSAGEM_SEM_LINK_ATIVO}
            </Alert>
            <Link
              href="/esqueci-senha"
              className="text-center text-sm font-semibold text-[var(--text-primary)] underline underline-offset-2"
            >
              Solicitar novo link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
