import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Sem conexão — Iris",
  robots: { index: false, follow: false },
};

/**
 * Página servida pelo Service Worker quando a navegação falha por falta de
 * rede (#185, Etapa 2).
 *
 * Estritamente estática e SEM NENHUM DADO: ela vive no cache do navegador, do
 * lado do dispositivo, fora de qualquer controle de sessão ou de RLS. Qualquer
 * conteúdo dinâmico aqui vira dado clínico persistido em claro no aparelho.
 * Nada de nome de clínica, contagem de fila ou último paciente aberto.
 *
 * `force-static` é trava, não otimização: impede que alguém acrescente uma
 * leitura de banco aqui sem perceber — o build quebra.
 */
export const dynamic = "force-static";

export default function PaginaOffline() {
  return (
    <Container largura="sm" className="py-16">
      <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
        Sem conexão
      </h1>
      <p className="font-body mt-4 text-base text-[var(--text-secondary)]">
        O Iris precisa de internet para mostrar dados clínicos. Nenhuma
        informação de paciente fica guardada neste aparelho.
      </p>
      <p className="font-body mt-3 text-base text-[var(--text-secondary)]">
        Assim que a conexão voltar, toque em continuar.
      </p>
      <Link
        href="/"
        className="font-display mt-8 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--brand-tint)] px-5 font-bold text-[var(--text-primary)]"
      >
        Tentar de novo
      </Link>
    </Container>
  );
}
