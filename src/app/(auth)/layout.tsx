import type { ReactNode } from "react";

/**
 * Layout da área pública (auth): centraliza o cartão de login na viewport.
 * Sem guarda de sessão — é a única área acessível a quem ainda não entrou.
 * Régua-espectro de marca no topo (assinatura, aria-hidden).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <div
        aria-hidden
        className="fixed inset-x-0 top-0 h-1.5"
        style={{
          background:
            "linear-gradient(90deg, var(--color-spectrum-red), var(--color-spectrum-orange), var(--color-spectrum-yellow), var(--color-spectrum-green), var(--color-spectrum-blue), var(--color-spectrum-violet))",
        }}
      />
      <div className="flex w-full justify-center">{children}</div>
    </main>
  );
}
