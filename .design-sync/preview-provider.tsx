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
  // `useLayoutEffect`, não `useEffect`: os atributos precisam estar no <html>
  // ANTES da pintura, senão o primeiro frame sai com os tokens no default do
  // CSS — que é exatamente o estado errado que este provider existe para
  // evitar, e o que um screenshot de preview capturaria.
  //
  // Mutar o DOM no corpo do render (como estava) é side-effect em tempo de
  // renderização: sob StrictMode o componente renderiza duas vezes e a ordem
  // de aplicação deixa de ser garantida quando há mais de um preview na tela.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-mode", modo);
    root.setAttribute("data-theme", tema);
    root.classList.toggle("dark", tema === "escuro");
  }, [modo, tema]);

  return <>{children}</>;
}
