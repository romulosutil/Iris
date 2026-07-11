import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { withTenant } from "@/db/rls";
import { careTeamMembership } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { encerrarVinculoAction } from "./actions";
import { AdicionarMembroForm } from "./adicionar-membro-form";

export default async function EquipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getTenantContext();
  const equipe = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(careTeamMembership)
      .where(eq(careTeamMembership.patientId, id)),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-ink-anchor text-3xl font-bold">
        Equipe de cuidado
      </h1>
      <ul className="flex flex-col gap-3">
        {equipe.map((m) => (
          <li key={m.id}>
            <Card titulo={m.disciplina} estado="conquistado">
              <p>
                {m.papelNaEquipe} — vigência desde {m.vigenciaInicio}
                {m.vigenciaFim ? ` até ${m.vigenciaFim}` : ""}
              </p>
              {ctx.role === "coordenador" && !m.vigenciaFim ? (
                <form action={encerrarVinculoAction.bind(null, m.id)}>
                  <Button type="submit" risco="alto">
                    Encerrar vínculo
                  </Button>
                </form>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {ctx.role === "coordenador" ? <AdicionarMembroForm patientId={id} /> : null}
    </div>
  );
}
