import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { listarTerapeutas } from "./[id]/actions";
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
      <h1 className="font-display text-ink-anchor text-2xl font-black">Equipe</h1>
      <ListaTerapeutas terapeutas={terapeutas} />
    </main>
  );
}
