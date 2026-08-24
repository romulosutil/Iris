import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { TabsNav, type TabsNavItem } from "@/components/ui/tabs-nav";

const abas: TabsNavItem[] = [
  { href: "/clinica/dados", rotulo: "Dados da Clínica" },
  { href: "/clinica/feriados", rotulo: "Feriados & Recessos" },
  { href: "/clinica/emergencia", rotulo: "Emergência & Protocolo" },
  { href: "/clinica/seguranca", rotulo: "Segurança" },
  { href: "/clinica/auditoria", rotulo: "Trilha de Auditoria" },
];

/**
 * Layout unificado de configurações da clínica.
 * Coordenador-only: todas as seções tratam de dados fiscais, operacionais e
 * de governança da clínica.
 */
export default async function ClinicaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  return (
    <Stack gap="lg" como="div">
      <TabsNav itens={abas} ariaLabel="Seções de configuração da clínica" />
      {children}
    </Stack>
  );
}
