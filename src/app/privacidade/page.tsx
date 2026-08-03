import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/legal/documento-legal";
import { DOCUMENTOS_LEGAIS, VERSAO_TERMO } from "@/lib/legal";

/**
 * Rota pública `/privacidade`. Mesmas razões de posicionamento e de
 * `force-static` descritas em `src/app/termos/page.tsx`.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Política de Privacidade (versão ${VERSAO_TERMO}) — Iris`,
  description: DOCUMENTOS_LEGAIS.privacidade.descricao,
};

export default function PrivacidadePage() {
  return <DocumentoLegal slug="privacidade" />;
}
