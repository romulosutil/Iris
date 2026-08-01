import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";
import { ReenvioForm } from "./reenvio-form";

export const metadata = {
  title: "Verifique seu e-mail — Iris",
  description: "Confirmação pós-cadastro do Iris.",
};

/**
 * Página estática pós-cadastro com formulário de reenvio (#168).
 * `cadastrar` (Task 7) redireciona para cá em TODOS os desfechos não-erro.
 */
export default function VerifiqueEmailPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Verifique seu e-mail
        </h1>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] flex flex-col gap-4 p-6",
        })}
      >
        <p className="text-[var(--text-primary)] font-body text-base">
          Se este e-mail puder criar uma conta, você receberá uma mensagem
          com o link de confirmação em instantes. O link vale por tempo
          limitado.
        </p>

        <Alert severidade="info" titulo="Não chegou nenhuma mensagem?">
          Confira a caixa de spam ou lixo eletrônico. Se não encontrar, informe seu
          e-mail abaixo para solicitar um novo envio.
        </Alert>

        <ReenvioForm />
      </div>
    </div>
  );
}
