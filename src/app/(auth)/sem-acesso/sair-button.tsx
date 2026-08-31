"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { purgarTudo } from "@/lib/audio/local-store";
import { Button } from "@/components/ui/button";

/**
 * Encerra a sessão e volta ao login. Extraído para client component porque
 * `/sem-acesso` virou Server Component (Task 10, precisa ler `searchParams`
 * para distinguir `no_access` de `cadastro_incompleto`).
 */
export function SairButton() {
  const router = useRouter();

  async function sair() {
    // Falha de IndexedDB nunca bloqueia o logout (R23) — purgarTudo já degrada por dentro.
    await purgarTudo();
    await signOut();
    router.push("/login");
  }

  return (
    <Button variante="neutra" onClick={sair}>
      Sair
    </Button>
  );
}
