import type { Meta } from "@storybook/nextjs-vite";
import { ToastProvider, useToast } from "./toast";
import { Button } from "./button";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/Toast",
  component: ToastProvider,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ToastProvider>;

export default meta;

function ExemploBotoes() {
  const { addToast } = useToast();

  return (
    <div className="flex gap-3">
      <Button
        variante="primaria"
        onClick={() =>
          addToast({
            titulo: "Sessão Salva",
            mensagem:
              "Os dados da sessão foram gravados com sucesso no prontuário.",
            severidade: "sucesso",
          })
        }
      >
        Disparar Toast Sucesso
      </Button>

      <Button
        variante="secundaria"
        onClick={() =>
          addToast({
            titulo: "Aviso de Conexão",
            mensagem: "Registrando sessão em modo offline.",
            severidade: "info",
          })
        }
      >
        Disparar Toast Info
      </Button>
    </div>
  );
}

export const Padrao = {
  render: () => (
    <ToastProvider>
      <ExemploBotoes />
    </ToastProvider>
  ),
};
