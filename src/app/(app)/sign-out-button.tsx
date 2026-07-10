"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { Button } from "@/components/ui/button";

/** Encerra a sessão e volta ao login. Colocado no header do shell. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variante="neutra"
      className="text-sm"
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      Sair
    </Button>
  );
}
