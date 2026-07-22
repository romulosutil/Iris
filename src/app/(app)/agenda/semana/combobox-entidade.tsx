"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";

/**
 * Combobox acessível de busca por nome (paciente|terapeuta). O DS ainda não
 * tem Combobox/Popover/Command — este é o primeiro, construído sobre
 * `Field` + `Input` (rótulo/caixa de texto) com um listbox hand-rolled por
 * cima, estilizado com `surface()` (mesma borda+sombra brutalista do
 * `SelectContent`) em vez de classes inventadas.
 */
export interface Opcao {
  id: string;
  nome: string;
}

export interface ComboboxEntidadeProps {
  label: string;
  opcoes: Opcao[];
  valor: string | null;
  aoSelecionar: (id: string) => void;
  aoBuscar?: (termo: string) => void;
}

export function ComboboxEntidade({
  label,
  opcoes,
  valor,
  aoSelecionar,
  aoBuscar,
}: ComboboxEntidadeProps) {
  const inputId = useId();
  const listId = useId();
  const selecionadaInicial = opcoes.find((o) => o.id === valor) ?? null;

  const [termo, setTermo] = useState(selecionadaInicial?.nome ?? "");
  const [aberto, setAberto] = useState(false);
  // -1 = nenhuma opção realçada ainda (abrir a lista não pré-seleciona a
  // primeira; só a navegação por seta o faz — comportamento padrão de
  // combobox ARIA 1.2).
  const [ativo, setAtivo] = useState(-1);
  const fechandoPorSelecaoRef = useRef(false);

  const filtradas = useMemo(
    () =>
      opcoes.filter((o) =>
        o.nome.toLowerCase().includes(termo.trim().toLowerCase()),
      ),
    [opcoes, termo],
  );

  const opcaoAtiva = aberto && ativo >= 0 ? filtradas[ativo] : undefined;

  function abrir() {
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setAtivo(-1);
  }

  function selecionar(o: Opcao) {
    aoSelecionar(o.id);
    setTermo(o.nome);
    fechandoPorSelecaoRef.current = true;
    fechar();
  }

  function aoMudarTexto(texto: string) {
    setTermo(texto);
    setAberto(true);
    setAtivo(-1);
    aoBuscar?.(texto);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!aberto) {
        abrir();
        setAtivo(0);
        return;
      }
      setAtivo((i) => (i < 0 ? 0 : Math.min(i + 1, filtradas.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!aberto) {
        abrir();
        setAtivo(0);
        return;
      }
      setAtivo((i) => (i < 0 ? 0 : Math.max(i - 1, 0)));
    } else if (e.key === "Enter") {
      if (aberto && ativo >= 0 && filtradas[ativo]) {
        e.preventDefault();
        selecionar(filtradas[ativo]);
      }
    } else if (e.key === "Escape") {
      if (aberto) {
        e.preventDefault();
        fechar();
      }
    }
  }

  return (
    <Field label={label} htmlFor={inputId}>
      <div className="relative">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={opcaoAtiva ? `${listId}-${opcaoAtiva.id}` : undefined}
          autoComplete="off"
          value={termo}
          onChange={(e) => aoMudarTexto(e.target.value)}
          onFocus={abrir}
          onBlur={() => {
            // dá tempo do onMouseDown da opção rodar antes de fechar por blur.
            if (!fechandoPorSelecaoRef.current) fechar();
            fechandoPorSelecaoRef.current = false;
          }}
          onKeyDown={aoTeclar}
        />
        {aberto && filtradas.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(
              surface("solida", "bg-surface"),
              "absolute z-10 mt-1 max-h-60 w-full overflow-auto",
            )}
          >
            {filtradas.map((o, i) => {
              const ehAtivo = i === ativo;
              return (
                <li
                  key={o.id}
                  id={`${listId}-${o.id}`}
                  role="option"
                  aria-selected={ehAtivo}
                  className={cn(
                    "font-body text-[var(--text-primary)] min-h-11 cursor-pointer px-4 py-2.5 text-base",
                    ehAtivo && "bg-[var(--color-gold)] text-[var(--text-primary)]",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selecionar(o);
                  }}
                  onMouseEnter={() => setAtivo(i)}
                >
                  {o.nome}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Field>
  );
}
