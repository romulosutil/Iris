import type { ReactNode } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Clarity } from "@/components/clarity";
import { WebMCPProvider } from "@/components/webmcp-provider";

/**
 * Layout do grupo PÚBLICO (S-01 / S-08, auditoria 360, #530).
 *
 * É o ÚNICO lugar onde os SDKs de terceiro montam: Microsoft Clarity (session
 * replay), Google Analytics e o `WebMCPProvider`. Antes eles viviam no root
 * layout — ou seja, em `/sessoes/[id]`, `/pacientes/[id]/timeline` e
 * `/alertas-risco`, gravando DOM com texto clínico de menor e mandando para
 * terceiro nos EUA, com `identify(userId)`, sem constar como operador na
 * política de privacidade.
 *
 * O que mora aqui: `/` (landing para visitante; quem tem sessão é
 * redirecionado em `page.tsx` ANTES de o HTML sair), `/landing`,
 * `/institucional`, `/sobre`, `/termos`, `/privacidade`. Nada de `(app)`,
 * `(admin)` nem `(auth)` — o `(auth)` fica de fora de propósito: a tela de
 * login já é a porta do dado clínico.
 *
 * A navegação do Next entre grupos é client-side, então o script injetado
 * sobrevive à troca de rota. Por isso `<Clarity/>` e `<GoogleAnalytics/>`
 * DESLIGAM a coleta no `unmount` (ver cada componente) — este layout
 * desmonta ao sair do grupo, e é esse desmonte que fecha a torneira.
 *
 * `src/app/(publico)/layout.test.tsx` varre todo `layout.tsx` de `src/app` e
 * exige que só este importe os três componentes.
 */
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return (
    <>
      <GoogleAnalytics />
      <Clarity />
      <WebMCPProvider />
      {children}
    </>
  );
}
