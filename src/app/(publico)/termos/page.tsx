import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/legal/documento-legal";
import { DOCUMENTOS_LEGAIS, VERSAO_TERMO } from "@/lib/legal";

/**
 * Rota pública `/termos`.
 *
 * Fica fora do grupo `(app)` de propósito: o guard de sessão do produto está em
 * `src/app/(app)/layout.tsx` (`getTenantContext`), então tudo que mora no
 * grupo `(publico)` — como `sobre` — é acessível sem sessão. É requisito: a
 * tela de cadastro linka este documento para quem ainda não tem conta.
 *
 * `force-static` também é requisito de deploy, não otimização — ver o comentário
 * em `DocumentoLegal` sobre `docs/` não existir no estágio `runner` da imagem.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Termos de Uso (versão ${VERSAO_TERMO}) — Iris`,
  description: DOCUMENTOS_LEGAIS.termos.descricao,
};

export default function TermosPage() {
  return <DocumentoLegal slug="termos" />;
}
