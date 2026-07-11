import { getTenantContext } from "@/auth/tenant";
import type { Papel } from "@/auth/papel-ativo";

const rotuloPapel: Record<Papel, string> = {
  coordenador: "Coordenação",
  terapeuta: "Terapeuta",
  admin_recepcao: "Recepção",
};

/**
 * Home do shell — placeholder que confirma o tenant resolvido (clínica + papel
 * ativos). O painel real chega nas fases 1c+.
 */
export default async function AppHome() {
  const ctx = await getTenantContext();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-display text-ink-anchor text-3xl font-bold">
        Tudo pronto.
      </h1>
      <p className="text-ink max-w-[60ch] text-lg">
        Você entrou como <strong>{rotuloPapel[ctx.role]}</strong>. O painel de
        trabalho chega nas próximas fases — por enquanto, a fundação de acesso e
        tenant está no lugar.
      </p>
    </section>
  );
}
