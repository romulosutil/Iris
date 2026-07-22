import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveTenant, COOKIE_CLINICA, COOKIE_PAPEL } from "@/auth/tenant";
import { definirClinicaAtiva } from "@/auth/actions";
import { Button } from "@/components/ui/button";

/**
 * Seleção de clínica ativa (A1). Só renderiza quando o usuário tem papel em
 * mais de uma clínica; qualquer outro status volta para `/` (que re-resolve e
 * roteia sozinho). Cada opção é um `<form>` que dispara a server action —
 * o cookie é gravado no servidor, nunca no cliente.
 */
export default async function SelecionarClinicaPage() {
  const ck = await cookies();
  const r = await resolveTenant(await headers(), {
    activeClinic: ck.get(COOKIE_CLINICA)?.value,
    activeRole: ck.get(COOKIE_PAPEL)?.value,
  });

  if (r.status !== "needs_clinic_selection") redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold">
        Selecione a clínica
      </h1>
      <ul className="flex flex-col gap-3">
        {r.opcoes.map((o) => (
          <li key={o.clinicId}>
            <form action={definirClinicaAtiva.bind(null, o.clinicId)}>
              <Button type="submit" variante="neutra" className="w-full">
                {o.nome}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
