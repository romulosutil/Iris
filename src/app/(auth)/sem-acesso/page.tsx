"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * Conta autenticada mas sem vínculo em nenhuma clínica (`no_access`). Copy sem
 * culpa e com a saída óbvia (falar com o coordenador). Botão de sair encerra a
 * sessão e volta ao login.
 */
export default function SemAcessoPage() {
  const router = useRouter();

  async function sair() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert severidade="info" titulo="Sem acesso ainda">
        Sua conta ainda não tem acesso a nenhuma clínica. Fale com o
        coordenador.
      </Alert>
      <Button variante="neutra" onClick={sair}>
        Sair
      </Button>
    </div>
  );
}
