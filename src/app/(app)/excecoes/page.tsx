import { notFound } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { listarExcecoes } from "./queries";
import { ExcecoesList } from "./excecoes-list";

/**
 * Painel de exceções do coordenador (Fase 3 Plano 3): visibilidade das
 * extrações que falharam e das revisões represadas na clínica. Coordenador-only
 * — o RLS já isola o tenant, mas esta é uma visão de coordenação (o terapeuta
 * cuida das próprias pendências em /pendencias). Não há ação destrutiva aqui:
 * é uma tela de leitura que aponta para o diário / a revisão.
 */
export default async function ExcecoesPage() {
  const ctx = await getTenantContext();
  if (ctx.role !== "coordenador") notFound();

  const excecoes = await listarExcecoes(ctx);

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <h1 className="font-display text-ink-anchor text-3xl font-bold">Exceções</h1>
        <p className="text-ink text-lg">
          {excecoes.total === 0
            ? "Nada represado — clínica em dia."
            : `${excecoes.total} ${excecoes.total === 1 ? "item pede" : "itens pedem"} acompanhamento.`}
        </p>
      </Stack>

      <ExcecoesList {...excecoes} />
    </Stack>
  );
}
