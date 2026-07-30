"use client";

import { useEffect, useRef } from "react";
import ClaritySDK from "@microsoft/clarity";

export function Clarity() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  const initialized = useRef(false);

  useEffect(() => {
    if (projectId && !initialized.current) {
      initialized.current = true;
      ClaritySDK.init(projectId);
    } else if (!projectId && process.env.NODE_ENV === "development") {
      console.warn(
        "[Clarity] NEXT_PUBLIC_CLARITY_PROJECT_ID não definido em .env.local. Reinicie o pnpm dev após definir."
      );
    }
  }, [projectId]);

  return null;
}
