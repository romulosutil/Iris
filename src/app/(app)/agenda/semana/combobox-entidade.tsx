"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

function ChevronBaixo({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" aria-hidden focusable="false" className={className}>
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

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
  placeholder?: string;
}

export function ComboboxEntidade({
  label,
  opcoes,
  valor,
  aoSelecionar,
  aoBuscar,
  placeholder,
}: ComboboxEntidadeProps) {
  const inputId = useId();
  const listId = useId();
  const selecionadaInicial = opcoes.find((o) => o.id === valor) ?? null;

  const [termo, setTermo] = useState(selecionadaInicial?.nome ?? "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const fechandoPorSelecaoRef = useRef(false);

  const [prev, setPrev] = useState({ valor, opcoes, aberto });
  if (prev.valor !== valor || prev.opcoes !== opcoes || prev.aberto !== aberto) {
    setPrev({ valor, opcoes, aberto });
    if (!aberto) {
      const selecionada = opcoes.find((o) => o.id === valor);
      if (selecionada) {
        setTermo(selecionada.nome);
      } else if (!valor) {
        setTermo("");
      }
    }
  }

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
    aoBuscar?.(termo);
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
        <div className="relative flex items-center">
          <Input
            id={inputId}
            role="combobox"
            aria-expanded={aberto}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={opcaoAtiva ? `${listId}-${opcaoAtiva.id}` : undefined}
            autoComplete="off"
            placeholder={placeholder ?? `Selecione ou busque ${label.toLowerCase()}...`}
            value={termo}
            onChange={(e) => aoMudarTexto(e.target.value)}
            onFocus={abrir}
            onBlur={() => {
              if (!fechandoPorSelecaoRef.current) fechar();
              fechandoPorSelecaoRef.current = false;
            }}
            onKeyDown={aoTeclar}
            className="pr-9"
          />
          <ChevronBaixo
            className={cn(
              "w-4 h-4 text-[var(--text-secondary)] absolute right-3 pointer-events-none transition-transform duration-200",
              aberto && "rotate-180 text-[var(--text-primary)]"
            )}
          />
        </div>

        {aberto && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(
              "absolute top-full left-0 right-0 z-50 mt-1.5 max-h-60 overflow-y-auto rounded-[var(--radius-control)] bg-[var(--surface-elevated)] border-2 border-[var(--border-brutal)] shadow-[var(--ds-shadow-hover)] p-1",
            )}
          >
            {filtradas.length === 0 ? (
              <li className="font-body text-[var(--text-secondary)] px-4 py-3 text-sm italic">
                Nenhum {label.toLowerCase()} encontrado...
              </li>
            ) : (
              filtradas.map((o, i) => {
                const ehAtivo = i === ativo;
                const ehSelecionado = o.id === valor;
                return (
                  <li
                    key={o.id}
                    id={`${listId}-${o.id}`}
                    role="option"
                    aria-selected={ehAtivo || ehSelecionado}
                    className={cn(
                      "font-body text-[var(--text-primary)] rounded-[var(--radius-xs)] min-h-10 cursor-pointer px-3.5 py-2 text-sm flex items-center justify-between transition-colors",
                      ehSelecionado && "font-bold bg-[var(--color-gold)]/20",
                      ehAtivo && "bg-[var(--action-primary)] text-[var(--text-primary)] font-semibold",
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selecionar(o);
                    }}
                    onMouseEnter={() => setAtivo(i)}
                  >
                    <span>{o.nome}</span>
                    {ehSelecionado && (
                      <span className="text-xs font-mono bg-[var(--border-brutal)] text-white px-1.5 py-0.5 rounded">
                        Atual
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}
