"use client";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { celulasParaFaixas } from "@/lib/agenda/grade";
import { GradeDisponibilidade } from "./grade-disponibilidade";
import { salvarJanelasAction, type SalvarJanelasState } from "./actions";

export function DisponibilidadeEditor({
  terapeutaId,
  passoMin,
  celulasIniciais,
}: {
  terapeutaId: string;
  passoMin: number;
  celulasIniciais: Set<string>;
}) {
  const [state, formAction] = useActionState<SalvarJanelasState, FormData>(
    salvarJanelasAction,
    {},
  );
  const [celulas, setCelulas] = useState<Set<string>>(new Set(celulasIniciais));
  const faixasRef = useRef<HTMLInputElement>(null);

  function aoSubmeter(e: React.FormEvent<HTMLFormElement>) {
    if (faixasRef.current)
      faixasRef.current.value = JSON.stringify(
        celulasParaFaixas(celulas, passoMin),
      );
  }

  const formRef = useRef<HTMLFormElement>(null);

  function handleSalvar() {
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={aoSubmeter}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="terapeutaId" value={terapeutaId} />
      <input type="hidden" name="faixas" ref={faixasRef} defaultValue="[]" />
      {state.error ? (
        <Alert severidade="erro" titulo="Não foi possível salvar">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert severidade="sucesso" titulo="Disponibilidade salva">
          Janelas atualizadas.
        </Alert>
      ) : null}
      <GradeDisponibilidade
        passoMin={passoMin}
        celulasIniciais={celulasIniciais}
        onChange={setCelulas}
      />
      <div className="flex justify-end">
        <Button type="submit" variante="primaria">
          Salvar disponibilidade
        </Button>
      </div>
    </form>
  );
}
