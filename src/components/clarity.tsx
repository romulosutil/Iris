"use client";

import { useEffect } from "react";
import ClaritySDK from "@microsoft/clarity";

export function Clarity() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

  useEffect(() => {
    if (projectId) {
      ClaritySDK.init(projectId);
    } else if (process.env.NODE_ENV === "development") {
      console.warn(
        "[Clarity] NEXT_PUBLIC_CLARITY_PROJECT_ID não definido em .env.local. Reinicie o pnpm dev após definir."
      );
    }
  }, [projectId]);

  return null;
}
