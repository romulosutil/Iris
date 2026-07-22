import Link from "next/link";
import { DataRow } from "@/components/ui/data-row";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Terapeuta = { id: string; name: string; email: string };

export function ListaTerapeutas({ terapeutas }: { terapeutas: Terapeuta[] }) {
  if (terapeutas.length === 0) {
    return <Alert severidade="info">Nenhum terapeuta cadastrado ainda.</Alert>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {terapeutas.map((t) => (
        <li key={t.id}>
          <DataRow
            title={t.name}
            subtitle={t.email}
            interactive
            trailing={
              <Link href={`/equipe/${t.id}`}>
                <Button variante="secundaria" tamanho="sm">
                  Visualizar perfil
                </Button>
              </Link>
            }
          />
        </li>
      ))}
    </ul>
  );
}
