import Link from "next/link";
import { cookies } from "next/headers";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FilaLista } from "./fila-item";
import {
  AvisoPrimeiraVisita,
  AvisoVolumeAlto,
  SemPermissaoSessoes,
} from "./estado-tela";
import {
  carregarFilaSessoes,
  ordenacaoDefaultPorPapel,
  COOKIE_FILTRO_TERAPEUTA,
  type Ordenacao,
} from "./queries";
import { definirFiltroTerapeuta } from "./actions";

/**
 * `/sessoes` — fila única de sessões travadas (#512 · T03 + T04).
 *
 * T03 fechou escopo/paginação/filtro (`./queries.ts`) — este arquivo não
 * reimplementa nada disso. T04 (aqui) fecha os 7 estados de tela (R-31): o
 * "default"/"vazio" e a decisão de nunca colapsar falha em vazio (R-32) vivem
 * em `FilaLista` (`./fila-item.tsx`); "carregando" é `./loading.tsx`; "erro"
 * é `./error.tsx`; "primeira vez", "volume alto" e "sem permissão" são
 * `./estado-tela.tsx`. Item declara custo (R-17, `custoItemFila`) e nunca
 * mostra o estado sem a dívida ao lado (R-18, `dividaItemFila`) — ambos em
 * `./fila-item.tsx`.
 */
export default async function SessoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();

  // Estado de tela "sem permissão" (R-31): `admin_recepcao` não tem fila
  // (R-23) — nem vale a pena ler `searchParams`/`cookies` para uma tela que
  // não vai consultar o banco. `SemPermissaoSessoes` diz por extenso que a
  // tela não é deste papel, em vez de fingir "Nada travado" (que afirmaria
  // "está tudo em dia" para quem nunca teve acesso a essa leitura).
  if (ctx.role === "admin_recepcao") {
    return (
      <Stack gap="lg">
        <PageHeader title="Sessões" description="Sem acesso para este papel" />
        <SemPermissaoSessoes />
      </Stack>
    );
  }

  const sp = await searchParams;
  const ck = await cookies();

  const ordenacaoParam =
    typeof sp.ordenacao === "string" ? sp.ordenacao : undefined;
  const ordenacao: Ordenacao =
    ordenacaoParam === "tempo_travado" || ordenacaoParam === "dia"
      ? ordenacaoParam
      : ordenacaoDefaultPorPapel(ctx.role);

  const paginaParam = typeof sp.pagina === "string" ? Number(sp.pagina) : NaN;
  const pagina =
    Number.isFinite(paginaParam) && paginaParam > 0 ? paginaParam : 1;

  // R-16: filtro por terapeuta é uma pergunta só para quem enxerga mais de
  // uma pessoa na fila. Terapeuta puro já só vê as próprias sessões (R-09) —
  // aplicar o filtro nele seria redundante, então o cookie nem é lido.
  const terapeutaFiltro =
    ctx.role === "coordenador"
      ? (ck.get(COOKIE_FILTRO_TERAPEUTA)?.value ?? null)
      : null;

  const fila = await carregarFilaSessoes(ctx, {
    ordenacao,
    pagina,
    terapeutaId: terapeutaFiltro,
  });

  return (
    <Stack gap="lg">
      <PageHeader title="Sessões" description={fila.escopoTexto} />

      {ctx.role === "coordenador" && fila.terapeutas.length > 1 ? (
        <form
          action={definirFiltroTerapeuta}
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor="terapeutaId" className="text-sm font-medium">
            Terapeuta
          </label>
          <select
            id="terapeutaId"
            name="terapeutaId"
            defaultValue={terapeutaFiltro ?? ""}
            className="rounded-[var(--radius-control)] border-2 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            {fila.terapeutas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <Button type="submit" variante="secundaria" tamanho="sm">
            Filtrar
          </Button>
        </form>
      ) : null}

      <nav aria-label="Ordenação" className="flex items-center gap-3 text-sm">
        <span className="text-[var(--text-secondary)]">Ordenar por</span>
        <Link
          href="/sessoes?ordenacao=tempo_travado"
          aria-current={ordenacao === "tempo_travado" ? "true" : undefined}
          className={
            "flex min-h-11 items-center underline " +
            (ordenacao === "tempo_travado"
              ? "font-bold"
              : "text-[var(--text-secondary)]")
          }
        >
          Tempo travado
        </Link>
        <Link
          href="/sessoes?ordenacao=dia"
          aria-current={ordenacao === "dia" ? "true" : undefined}
          className={
            "flex min-h-11 items-center underline " +
            (ordenacao === "dia" ? "font-bold" : "text-[var(--text-secondary)]")
          }
        >
          Por dia
        </Link>
      </nav>

      <AvisoVolumeAlto totalNoEscopo={fila.totalNoEscopo} />

      <FilaLista itens={fila.itens} vazioTexto={fila.vazioTexto} />

      <AvisoPrimeiraVisita ativo={fila.itens.length === 0} />

      {fila.totalPaginas > 1 ? (
        <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
          {fila.pagina > 1 ? (
            <Link
              href={`/sessoes?ordenacao=${ordenacao}&pagina=${fila.pagina - 1}`}
            >
              Anterior
            </Link>
          ) : null}
          <span className="text-[var(--text-secondary)]">
            Página {fila.pagina} de {fila.totalPaginas}
          </span>
          {fila.pagina < fila.totalPaginas ? (
            <Link
              href={`/sessoes?ordenacao=${ordenacao}&pagina=${fila.pagina + 1}`}
            >
              Próxima
            </Link>
          ) : null}
        </nav>
      ) : null}
    </Stack>
  );
}
