import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";
import { SairButton } from "./sair-button";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const cadastroIncompleto = motivo === "cadastro-incompleto";
  return {
    title: cadastroIncompleto ? "Cadastro incompleto — Iris" : "Sem acesso — Iris",
    description: cadastroIncompleto
      ? "Cadastro interrompido antes da clínica ser criada."
      : "Sem acesso a nenhuma clínica no Iris.",
  };
}

/**
 * ATENÇÃO — esta página é PÚBLICA (correção Task 10, review I-1: uma versão
 * anterior deste comentário afirmava o oposto, o que é falso e perigoso).
 *
 * `src/app/(auth)/layout.tsx` declara explicitamente "Sem guarda de sessão" —
 * esta rota é acessível por GET direto, sem cookie, sem sessão, a qualquer
 * visitante. `getTenantContext` só REDIRECIONA para cá depois de autenticar
 * (dois status: `no_access` e `cadastro_incompleto`), mas nada impede um
 * visitante anônimo de digitar `/sem-acesso?motivo=cadastro-incompleto` na
 * barra de endereço e renderizar esta página sem nunca ter feito login.
 *
 * REGRA PARA QUEM EDITAR ESTA PÁGINA: `motivo` só pode trocar COPY FIXA e
 * GENÉRICA. Nunca ler sessão, nunca consultar o banco, nunca ecoar e-mail,
 * nome de clínica, ou qualquer dado específico de conta — mesmo que
 * `TenantResolution` carregue um `userId` disponível em `getTenantContext`.
 * Personalizar esta tela reabre o oráculo de enumeração que a Task 7 levou
 * quatro rodadas para fechar, agora num `GET` sem sessão e sem rate limit.
 *
 * Os dois estados:
 * 1. `no_access` (default, sem `motivo`): conta sem NENHUM vínculo — sem
 *    explicação de por quê (pode ser cadastro nunca iniciado do jeito certo,
 *    ou vínculo revogado — ver `src/auth/tenant.ts`). Fala com o coordenador.
 * 2. `cadastro_incompleto` (`?motivo=cadastro-incompleto`): o provisionamento
 *    do cadastro self-service (`src/auth/cadastro.ts`) morreu entre criar a
 *    conta e criar a clínica (não é atômico), E o usuário nunca teve vínculo
 *    algum antes (distinção feita em `resolveTenant` via `professional_consent`
 *    — ver o comentário lá). É recuperável: a conta existe, falta concluir o
 *    cadastro da clínica.
 */
export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const cadastroIncompleto = motivo === "cadastro-incompleto";

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          {cadastroIncompleto ? "Cadastro incompleto" : "Sem acesso"}
        </h1>
      </div>

      <div
        className={surface("solida", {
          radius: "control",
          className: "bg-[var(--surface-card)] p-6",
        })}
      >
        {cadastroIncompleto ? (
          <div className="flex flex-col gap-4">
            <Alert severidade="info" titulo="Sua conta existe, mas a clínica não foi criada">
              O cadastro foi interrompido antes de concluir a criação da
              clínica. Isso não compromete sua conta — é só continuar de onde
              parou.
            </Alert>
            <Button variante="primaria" asChild>
              <Link href="/cadastro">Concluir cadastro</Link>
            </Button>
            {/* M-4 (review Task 10): sem isto, quem entrou com a conta errada
                num computador compartilhado não tem NENHUMA UI alcançável
                para sair — toda rota de (app) redireciona de volta para cá. */}
            <SairButton />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Alert severidade="info" titulo="Sem acesso ainda">
              Sua conta ainda não tem acesso a nenhuma clínica. Fale com o
              coordenador.
            </Alert>
            <SairButton />
          </div>
        )}
      </div>
    </div>
  );
}
