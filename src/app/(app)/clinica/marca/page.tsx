import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { lerMarcaDaTela } from "./logic";
import { MarcaForm } from "./marca-form";

/**
 * #258 (D9) — marca institucional (white-label) dos PDFs exportados.
 * Coordenador-only: é configuração estrutural da clínica, no mesmo nível de
 * `/clinica/dados` e `/clinica/emergencia`.
 */
export default async function MarcaPage() {
  const ctx = await getTenantContext();
  try {
    requireRole(ctx, "coordenador");
  } catch {
    notFound();
  }

  const marca = await lerMarcaDaTela(ctx);

  return (
    <Stack gap="lg" como="main">
      <PageHeader
        title="Marca da clínica nos PDFs"
        description="Logotipo e cor institucional aplicados ao cabeçalho dos relatórios e da cópia de prontuário exportada."
      />
      <MarcaForm marca={marca} />
    </Stack>
  );
}
