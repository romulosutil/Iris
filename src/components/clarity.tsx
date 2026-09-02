"use client";

import { useEffect } from "react";
import ClaritySDK from "@microsoft/clarity";
import { useSession } from "@/auth/client";

/**
 * O pacote `@microsoft/clarity` (1.0.x) não expõe `start`/`stop`, mas o tag
 * injetado define `window.clarity(comando, ...)` — a API pública documentada
 * da Microsoft, e é nela que `stop`/`start` existem. Antes de o script
 * carregar, `window.clarity` é a fila do snippet: os comandos ficam
 * enfileirados e rodam em ordem.
 */
declare global {
  interface Window {
    clarity?: (comando: string, ...args: unknown[]) => void;
  }
}

// Estado de MÓDULO, não de instância: o layout público desmonta e remonta a
// cada saída/volta do grupo `(publico)`, e o script só pode ser injetado uma
// vez por documento (o snippet ignora um segundo `init`, mas o `consentV2`
// repetido não custa nada e o `identify` sim).
let sdkCarregado = false;

/**
 * Microsoft Clarity — session replay. Monta SÓ em `src/app/(publico)/layout`
 * (S-01, #530). Nunca no prontuário.
 *
 * Desmontar = PARAR de gravar. A navegação do Next entre `(publico)` e
 * `(auth)`/`(app)` é client-side: o script, uma vez injetado, sobrevive à
 * troca de rota e seguiria gravando `/login` → `/agenda` → `/sessoes/[id]`.
 * O `stop` no cleanup é o que fecha a torneira; `start` ao remontar reabre
 * quando o visitante volta para uma rota pública.
 */
export function Clarity() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  const { data: session } = useSession();

  useEffect(() => {
    if (!projectId) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Clarity] NEXT_PUBLIC_CLARITY_PROJECT_ID não definido em .env.local. Reinicie o pnpm dev após definir.",
        );
      }
      return;
    }

    if (!sdkCarregado) {
      sdkCarregado = true;
      ClaritySDK.init(projectId);
      // LGPD: staff (employee) — sem banner; o Clarity mascara texto por
      // padrão. ad_Storage: não usado (sem ads); analytics_Storage: telemetria
      // de UX da landing. Nomear Microsoft como operador em docs/legal é
      // pendência que exige confirmação do Rômulo (PR #530).
      ClaritySDK.consentV2({
        ad_Storage: "denied",
        analytics_Storage: "granted",
      });
    } else {
      window.clarity?.("start");
    }

    return () => {
      window.clarity?.("stop");
    };
  }, [projectId]);

  useEffect(() => {
    if (projectId && sdkCarregado && session?.user?.id) {
      ClaritySDK.identify(session.user.id);
    }
  }, [projectId, session?.user?.id]);

  return null;
}
