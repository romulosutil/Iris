"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { StatusBadge, type BadgesVariantes, type EstadoDado } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

export interface AppointmentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  horario: string;
  pacienteNome: string;
  terapeutaNome?: string;
  estado?: EstadoDado;
  variante?: BadgesVariantes;
  statusTexto?: string;
  onAbrir?: () => void;
  onCheckIn?: () => void;
  onGerir?: () => void;
}

export const AppointmentCard = React.forwardRef<HTMLDivElement, AppointmentCardProps>(
  function AppointmentCard(
    {
      className,
      horario,
      pacienteNome,
      terapeutaNome,
      estado,
      variante,
      statusTexto,
      onAbrir,
      onCheckIn,
      onGerir,
      ...props
    },
    ref,
  ) {
    const [dropdownOpen, setDropdownOpen] = React.useState(false);

    return (
      <article
        ref={ref}
        className={cn(
          "flex flex-col gap-3 p-4 rounded-[var(--radius-card)] bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] shadow-[var(--ds-shadow)] transition-all",
          className,
        )}
        {...props}
      >
        {/* Header do Card: Horário + Status */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-brutal)]/20 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg text-[var(--text-primary)]">
              {horario}
            </span>
          </div>
          <StatusBadge estado={estado} variante={variante}>
            {statusTexto}
          </StatusBadge>
        </div>

        {/* Corpo do Card: Informações do Paciente */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="font-display font-semibold text-base text-[var(--text-primary)] truncate" title={pacienteNome}>
            {pacienteNome}
          </h3>
          {terapeutaNome ? (
            <p className="text-xs text-[var(--text-secondary)] truncate">
              {terapeutaNome}
            </p>
          ) : null}
        </div>

        {/* Footer de Ações Responsivo & Acessível */}
        <div className="pt-1 mt-auto">
          {/* Visualização Desktop (≥768px): Botões Inline */}
          <div className="hidden md:flex items-center justify-end gap-2">
            {onAbrir ? (
              <Button
                variante="neutra"
                tamanho="sm"
                onClick={onAbrir}
                aria-label={`Abrir agendamento de ${pacienteNome} às ${horario}`}
              >
                Abrir
              </Button>
            ) : null}
            {onCheckIn ? (
              <Button
                variante="primaria"
                tamanho="sm"
                onClick={onCheckIn}
                aria-label={`Fazer check-in para ${pacienteNome} às ${horario}`}
              >
                Fazer check-in
              </Button>
            ) : null}
            {onGerir ? (
              <Button
                variante="secundaria"
                tamanho="sm"
                onClick={onGerir}
                aria-label={`Gerir agendamento de ${pacienteNome} às ${horario}`}
              >
                Gerir
              </Button>
            ) : null}
          </div>

          {/* Visualização Mobile (<768px): Touch Target de 44px+ com Ação Principal Destacada + Dropdown */}
          <div className="flex md:hidden items-center gap-2 w-full">
            {onCheckIn ? (
              <Button
                variante="primaria"
                tamanho="md"
                className="flex-1 min-h-[44px] justify-center"
                onClick={onCheckIn}
                aria-label={`Fazer check-in para ${pacienteNome} às ${horario}`}
              >
                Fazer check-in
              </Button>
            ) : onAbrir ? (
              <Button
                variante="primaria"
                tamanho="md"
                className="flex-1 min-h-[44px] justify-center"
                onClick={onAbrir}
                aria-label={`Abrir agendamento de ${pacienteNome} às ${horario}`}
              >
                Abrir
              </Button>
            ) : null}

            {/* Trigger de Ações Secundárias */}
            {(onAbrir && onCheckIn) || onGerir ? (
              <div className="relative">
                <Button
                  variante="neutra"
                  tamanho="md"
                  className="min-h-[44px] min-w-[44px] px-3 justify-center"
                  aria-label={`Mais ações para agendamento de ${pacienteNome}`}
                  aria-expanded={dropdownOpen}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  •••
                </Button>
                {dropdownOpen ? (
                  <div className="absolute right-0 bottom-full mb-2 w-48 rounded-[var(--radius-control)] bg-[var(--surface-elevated)] border-2 border-[var(--border-brutal)] shadow-[var(--ds-shadow)] z-50 py-1 flex flex-col">
                    {onAbrir && onCheckIn ? (
                      <button
                        type="button"
                        className="px-4 py-2 text-left text-sm font-semibold hover:bg-[var(--surface-card)] transition-colors min-h-[44px] flex items-center"
                        onClick={() => {
                          setDropdownOpen(false);
                          onAbrir();
                        }}
                      >
                        Abrir agendamento
                      </button>
                    ) : null}
                    {onGerir ? (
                      <button
                        type="button"
                        className="px-4 py-2 text-left text-sm font-semibold hover:bg-[var(--surface-card)] transition-colors min-h-[44px] flex items-center border-t border-[var(--border-brutal)]/20"
                        onClick={() => {
                          setDropdownOpen(false);
                          onGerir();
                        }}
                      >
                        Gerir atendimento
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  },
);
