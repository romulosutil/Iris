import { ReactNode } from "react";
import { exigirSuperAdmin } from "@/auth/super-admin";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata = {
  title: "Super Admin Backoffice — Iris",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { email } = await exigirSuperAdmin();

  return (
    /*
      `data-mode="admin"` escopa os tokens do backoffice (globals.css) neste
      subárvore. O modo NÃO vai no <html> — lá mora `data-mode="clinico"` do
      layout raiz, que vale para o app inteiro; o backoffice é escuro por
      natureza e não segue o tema escolhido pelo usuário.
    */
    <div
      data-mode="admin"
      className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] antialiased"
    >
      <AdminNav userEmail={email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
