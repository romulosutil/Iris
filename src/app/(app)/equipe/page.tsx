import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { UserPlusIcon } from "@/components/ui/icon";
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
          // `asChild`: o Button EMPRESTA a classe ao `<Link>` em vez de
          // renderizar um `<button>` próprio. Envolver o Button no Link (como
          // estava) produz `<a><button>` — conteúdo interativo aninhado, HTML
          // inválido, e mismatch de hidratação no React. Mesmo padrão de
          // /agenda e /pacientes. Com `asChild` o `iconLeft` é ignorado de
          // propósito: o elemento renderizado é o filho, então o ícone mora
          // dentro dele.
          <Button variante="primaria" asChild>
            <Link href="/equipe/convidar">
              <UserPlusIcon
                size={18}
                aria-hidden
                focusable="false"
                className="h-[18px] w-[18px] shrink-0"
              />
              Convidar Membro
            </Link>
          </Button>
        }
      />
      <ListaTerapeutas terapeutas={terapeutas} />
    </main>
  );
}
