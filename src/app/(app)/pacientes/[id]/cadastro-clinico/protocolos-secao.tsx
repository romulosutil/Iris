"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ativarProtocoloAction,
  desativarProtocoloAction,
} from "./protocolo-actions";

type Protocolo = { id: string; nome: string; disciplina: string };
type Vinculo = { id: string; protocolId: string; desativadoEm: string | null };

export function ProtocolosSecao({
  patientId,
  catalogo,
  vinculos,
}: {
  patientId: string;
  catalogo: Protocolo[];
  vinculos: Vinculo[];
}) {
  const ativos = new Set(
    vinculos.filter((v) => !v.desativadoEm).map((v) => v.protocolId),
  );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold">Protocolos</h2>
      <ul className="flex flex-col gap-3">
        {catalogo.map((p) => {
          const vinculo = vinculos.find(
            (v) => v.protocolId === p.id && !v.desativadoEm,
          );
          return (
            <li key={p.id}>
              <Card
                titulo={p.nome}
                estado={ativos.has(p.id) ? "conquistado" : "candidato"}
              >
                <p>{p.disciplina}</p>
                {vinculo ? (
                  <form action={desativarProtocoloAction.bind(null, vinculo.id)}>
                    <Button type="submit" risco="alto">
                      Desativar
                    </Button>
                  </form>
                ) : (
                  <form
                    action={ativarProtocoloAction.bind(null, patientId, p.id)}
                  >
                    <Button type="submit">Ativar</Button>
                  </form>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
