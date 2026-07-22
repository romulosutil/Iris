import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
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
      <h1 className="font-display text-[var(--text-primary)] text-3xl font-bold">
        Convidar terapeuta
      </h1>
      <ConvidarForm />
    </div>
  );
}
