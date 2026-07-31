import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";
import { RedefinirSenhaForm } from "./redefinir-senha-form";

export const metadata = {
  title: "Redefinir senha — Iris",
  description: "Redefinição de senha do Iris.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Tela de redefinição de senha (Fatia A, Task 9). Lê `token` da query — é o
 * valor que `/esqueci-senha` -> Better-Auth (`sendResetPassword` em
 * `src/auth/auth.ts`) manda por e-mail, via `redirectTo: "/redefinir-senha"`
 * (ver `../esqueci-senha/logic.ts`). Server Component só para extrair o
 * parâmetro (mesmo padrão de `src/app/(app)/agenda/semana/page.tsx`) — o
 * formulário em si é client (`./redefinir-senha-form.tsx`), porque
 * `authClient.resetPassword` é chamado direto do navegador.
 *
 * SEM TOKEN (ausente/vazio na query): não renderiza formulário nenhum — só
 * o aviso genérico + link para pedir um novo. Isto NÃO é um oráculo de
 * enumeração de e-mail: o token é opaco e não carrega nenhuma informação
 * sobre qual e-mail ele representa, então a mensagem não distingue nada
 * sobre contas — só sobre o link em si (presente/ausente).
 */
export default async function RedefinirSenhaPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const token = primeiro(sp.token);

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
        {token ? (
          <RedefinirSenhaForm token={token} />
        ) : (
          <div className="flex flex-col gap-4">
            <Alert severidade="erro" titulo="Link inválido ou expirado">
              Este link de redefinição de senha é inválido ou já expirou.
              Solicite um novo.
            </Alert>
            <Link
              href="/esqueci-senha"
              className="text-[var(--text-primary)] text-center text-sm font-semibold underline underline-offset-2"
            >
              Solicitar novo link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
