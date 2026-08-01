import * as React from "react";

/**
 * Espelha o decorator de `.storybook/preview.tsx` para os previews do
 * /design-sync: o Storybook seta `data-mode` / `data-theme` no <html>, e o
 * globals.css resolve os tokens a partir desses atributos. Sem isto os cards
 * renderizam com os tokens no estado default do CSS, que não é o mesmo que o
 * Storybook mostra.
 */
export function IrisPreviewProvider({
  modo = "clinico",
  tema = "claro",
  children,
}: {
  modo?: "clinico" | "familia";
  tema?: "claro" | "escuro";
  children?: React.ReactNode;
}) {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-mode", modo);
    root.setAttribute("data-theme", tema);
    root.classList.toggle("dark", tema === "escuro");
  }
  return <>{children}</>;
}
