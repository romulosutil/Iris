"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { purgarTudo } from "@/lib/audio/local-store";
import { Button } from "@/components/ui/button";
import { LogOutIcon } from "@/components/ui/icon";

/** Encerra a sessão e volta ao login. Colocado no header do shell. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variante="neutra"
      className="text-sm"
      iconLeft={
        <LogOutIcon
          size={16}
          aria-hidden
          focusable="false"
          className="h-4 w-4"
        />
      }
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
