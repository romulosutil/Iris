"use client";

import { useEffect } from "react";

/**
 * Registra `public/sw.js` (#185, Etapa 2).
 *
 * Só em produção: em `next dev` o Service Worker serve bundle antigo do cache
 * e o desenvolvedor passa a depurar código que já mudou — o sintoma clássico é
 * "salvei o arquivo e a tela não muda".
 *
 * Falha em silêncio de propósito: navegador sem suporte, contexto não-seguro
 * (HTTP) ou usuário com SW bloqueado devem ver o app funcionando normalmente.
 * O PWA é progressivo; a ausência dele não é erro de aplicação.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((erro) => {
      // Sem PII: só a mensagem do erro de registro.
      console.warn(
        "[pwa] service worker não registrado:",
        erro instanceof Error ? erro.message : String(erro),
      );
    });
  }, []);

  return null;
}
