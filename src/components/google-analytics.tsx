"use client";

import { useEffect } from "react";
import Script from "next/script";

/**
 * Google Analytics (gtag). Monta SÓ em `src/app/(publico)/layout` (S-01,
 * #530). Nunca no prontuário: a URL de `/pacientes/<uuid>` iria no
 * `page_location` de cada hit.
 *
 * O `<Script>` carregado na landing sobrevive à navegação client-side até
 * `/login` → `/agenda`, e com "enhanced measurement" ligado no painel o gtag
 * dispara `page_view` a cada troca de rota. O desligamento oficial do Google
 * é a flag `window['ga-disable-<ID>']`: `true` faz o gtag descartar todo hit
 * daquela propriedade. Montar liga a coleta; desmontar (sair do grupo
 * público) desliga.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;

  useEffect(() => {
    if (!measurementId) return;
    const flag = `ga-disable-${measurementId}`;
    const janela = window as unknown as Record<string, unknown>;
    janela[flag] = false;
    return () => {
      janela[flag] = true;
    };
  }, [measurementId]);

  if (!measurementId) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[Google Analytics] NEXT_PUBLIC_GA_ID not defined in .env.local",
      );
    }
    return null;
  }

  return (
    <>
      <Script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
