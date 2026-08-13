import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PaginaErro } from "@/components/ui/pagina-erro";

/**
 * 404 on-brand (espectro-brutal). Substitui o not-found padrão do Next (tela
 * preta, em inglês) por copy honesta em pt-BR e uma saída óbvia. Renderiza no
 * root layout — sem o header do shell autenticado — e é também a tela de
 * negação de acesso do app: ~15 páginas autenticadas chamam notFound() como
 * negação de RBAC, então o Logo e a saída própria não são redundância com o
 * header (não existe header aqui). O tom segue a personalidade do produto:
 * literal, sem culpa, calibrado para leitura sob pressão.
 */
export default function NotFound() {
  return (
    <PaginaErro
      codigo="Erro 404"
      titulo="Página não encontrada."
      descricao="O endereço mudou ou nunca existiu. Nada quebrou do seu lado — é só um link que não leva a lugar nenhum."
    >
      <Button variante="secundaria" asChild className="w-full sm:w-auto">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </PaginaErro>
  );
}
