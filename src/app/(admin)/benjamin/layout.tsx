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
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
      <AdminNav userEmail={email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
