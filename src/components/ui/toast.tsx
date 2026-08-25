"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Alert, type AlertProps } from "@/components/ui/alert";

export interface ToastItem {
  id: string;
  titulo?: React.ReactNode;
  mensagem: React.ReactNode;
  severidade?: AlertProps["severidade"];
  duracaoMs?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(
  undefined,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      const novoToast: ToastItem = { ...toast, id };

      setToasts((prev) => [...prev, novoToast]);

      const duracao = toast.duracaoMs ?? 5000;
      if (duracao > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duracao);
      }
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de um ToastProvider");
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-md flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-[var(--radius-control)] shadow-[var(--ds-shadow)]"
        >
          <Alert severidade={t.severidade ?? "info"} titulo={t.titulo}>
            <div className="flex items-center justify-between gap-4">
              <div>{t.mensagem}</div>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                aria-label="Fechar notificação"
                className="ml-auto shrink-0 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
          </Alert>
        </div>
      ))}
    </div>
  );
}
