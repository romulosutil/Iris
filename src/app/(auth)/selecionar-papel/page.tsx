import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveTenant, COOKIE_CLINICA, COOKIE_PAPEL } from "@/auth/tenant";
import { definirPapelAtivo } from "@/auth/actions";
import type { Papel } from "@/auth/papel-ativo";
import { Button } from "@/components/ui/button";

const rotulo: Record<Papel, string> = {
  coordenador: "Coordenação",
  terapeuta: "Terapeuta",
  admin_recepcao: "Recepção",
};

/**
 * Seleção de papel ativo (A2), quando o usuário tem papéis disjuntos na
 * clínica ativa (ex.: recepção + terapeuta). Coordenador nunca chega aqui
 * (vence sozinho em `papelAtivo`). Fora do status esperado → volta para `/`.
 */
export default async function SelecionarPapelPage() {
  const ck = await cookies();
  const r = await resolveTenant(await headers(), {
    activeClinic: ck.get(COOKIE_CLINICA)?.value,
    activeRole: ck.get(COOKIE_PAPEL)?.value,
  });

  if (r.status !== "needs_role_selection") redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-ink-anchor text-2xl font-bold">
        Como você quer entrar?
      </h1>
      <ul className="flex flex-col gap-3">
        {r.papeis.map((p) => (
          <li key={p}>
            <form action={definirPapelAtivo.bind(null, p)}>
              <Button type="submit" variante="neutra" className="w-full">
                {rotulo[p]}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
