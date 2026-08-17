import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { listarTerapeutas } from "./[id]/queries";
import { ListaTerapeutas } from "./lista-terapeutas";

export default async function EquipePage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }
  const terapeutas = await listarTerapeutas(ctx);
  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Equipe"
        description="Terapeutas e profissionais cadastrados na clínica."
        actions={
          <Link href="/equipe/convidar">
            <Button variante="primaria">+ Convidar Membro</Button>
          </Link>
        }
      />
      <ListaTerapeutas terapeutas={terapeutas} />
    </main>
  );
}
