import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ConvidarForm } from "./convidar-form";

export default async function ConvidarPage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            itens={[
              { rotulo: "Equipe", href: "/equipe" },
              { rotulo: "Convidar terapeuta", atual: true },
            ]}
          />
        }
        title="Convidar terapeuta"
        description="Envie um convite de acesso para novos membros da equipe"
      />
      <ConvidarForm />
    </div>
  );
}
