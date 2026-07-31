import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";

export const metadata = {
  title: "Verifique seu e-mail — Iris",
  description: "Confirmação pós-cadastro do Iris.",
};

/**
 * Página estática pós-cadastro. `cadastrar` (Task 7) redireciona para cá em
 * TODOS os desfechos não-erro — e-mail novo, retomada de cadastro existente,
 * e-mail existente com senha errada — porque o núcleo colapsa os três na
 * mesma resposta para não expor um oráculo de enumeração de e-mail (ver
 * `src/app/(auth)/cadastro/logic.ts`, bloco RESPOSTA UNIFORME).
 *
 * CONSEQUÊNCIA PARA A COPY: esta tela é alcançada em casos onde nenhum
 * e-mail foi de fato enviado e nenhuma conta foi criada. O texto abaixo é
 * deliberadamente condicional ("se este e-mail puder criar uma conta") e
 * byte-idêntico para os sete desfechos possíveis — não afirma "enviamos um
 * e-mail para você" e não revela se o e-mail já existia. Não adicione nada
 * aqui (nome, e-mail digitado, "conta criada") que permita a um visitante
 * inferir em qual dos sete ramos ele caiu. Sem botão de reenvio (#168) e
 * sem links de navegação além do necessário — fix round 1 removeu os que
 * não estavam no brief.
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
          Confira a caixa de spam ou lixo eletrônico. Se ainda assim não
          encontrar, você pode tentar o cadastro novamente.
        </Alert>
      </div>
    </div>
  );
}
