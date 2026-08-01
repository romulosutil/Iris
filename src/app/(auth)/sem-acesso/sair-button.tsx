"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { Button } from "@/components/ui/button";

/**
 * Encerra a sessão e volta ao login. Extraído para client component porque
 * `/sem-acesso` virou Server Component (Task 10, precisa ler `searchParams`
 * para distinguir `no_access` de `cadastro_incompleto`).
 */
export function SairButton() {
  const router = useRouter();

  async function sair() {
    await signOut();
    router.push("/login");
  }

  return (
    <Button variante="neutra" onClick={sair}>
      Sair
    </Button>
  );
}
