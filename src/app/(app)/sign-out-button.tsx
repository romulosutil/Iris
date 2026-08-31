"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { purgarTudo } from "@/lib/audio/local-store";
import { Button } from "@/components/ui/button";

/** Encerra a sessão e volta ao login. Colocado no header do shell. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variante="neutra"
      className="text-sm"
      onClick={async () => {
        // Falha de IndexedDB nunca bloqueia o logout (R23) — purgarTudo já degrada por dentro.
        await purgarTudo();
        await signOut();
        router.push("/login");
      }}
    >
      Sair
    </Button>
  );
}
