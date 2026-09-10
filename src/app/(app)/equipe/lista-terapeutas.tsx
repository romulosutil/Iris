import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { StatusBadge } from "@/components/ui/patterns/status-badge";

type Terapeuta = { id: string; name: string; email: string };

export function ListaTerapeutas({ terapeutas }: { terapeutas: Terapeuta[] }) {
  if (terapeutas.length === 0) {
    return <Alert severidade="info">Nenhum terapeuta cadastrado ainda.</Alert>;
  }
  return (
    <DataList como="ul" aria-label="Terapeutas da clínica">
      {terapeutas.map((t) => (
        <DataListRow
          key={t.id}
          titulo={t.name}
          detalhe={t.email}
          estado={<StatusBadge variante="success">Ativo</StatusBadge>}
          acoes={
            /* `asChild`: `<a><button>` era interativo aninhado (HTML
               inválido, mismatch de hidratação) e o link ficava sem nome
               próprio na árvore de acessibilidade. Mesmo padrão de
               `/pacientes`. */
            <Button variante="terciaria" tamanho="sm" asChild>
              <Link
                href={`/equipe/${t.id}`}
                aria-label={`Ver perfil de ${t.name}`}
              >
                Ver Perfil &rarr;
              </Link>
            </Button>
          }
        />
      ))}
    </DataList>
  );
}
