import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";
import { SairButton } from "./sair-button";

export const metadata = {
  title: "Sem acesso — Iris",
  description: "Sem acesso a nenhuma clínica no Iris.",
};

/**
 * Duas situações completamente distintas chegam aqui, ambas exigindo sessão
 * autenticada válida (Task 10):
 *
 * 1. `no_access` (default, sem `motivo`): conta autenticada sem NENHUM vínculo
 *    e sem explicação — fala com o coordenador.
 * 2. `cadastro_incompleto` (`?motivo=cadastro-incompleto`): o provisionamento
 *    do cadastro self-service (`src/auth/cadastro.ts`) morreu entre criar a
 *    conta e criar a clínica (não é atômico). É recuperável: a conta existe,
 *    falta concluir o cadastro da clínica.
 *
 * `motivo` só troca COPY — nunca concede acesso. Quem chega sem sessão válida
 * é redirecionado para `/login` por `getTenantContext` antes de esta página
 * renderizar; um visitante não-autenticado que force `?motivo=` na URL não
 * aprende nada (nem sobre a própria conta, nem sobre outras).
 */
export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const cadastroIncompleto = motivo === "cadastro-incompleto";

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          {cadastroIncompleto ? "Cadastro incompleto" : "Sem acesso"}
        </h1>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] p-6",
        })}
      >
        {cadastroIncompleto ? (
          <div className="flex flex-col gap-4">
            <Alert severidade="info" titulo="Sua conta existe, mas a clínica não foi criada">
              O cadastro foi interrompido antes de concluir a criação da
              clínica. Isso não compromete sua conta — é só continuar de onde
              parou.
            </Alert>
            <Button variante="primaria" asChild>
              <Link href="/cadastro">Concluir cadastro</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Alert severidade="info" titulo="Sem acesso ainda">
              Sua conta ainda não tem acesso a nenhuma clínica. Fale com o
              coordenador.
            </Alert>
            <SairButton />
          </div>
        )}
      </div>
    </div>
  );
}
