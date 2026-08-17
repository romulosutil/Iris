import "server-only";
import { withTenant, type TenantContext, type Tx } from "@/db/rls";
import {
  avaliarSituacaoConta,
  mensagemDeEstado,
  type EstadoConta,
} from "./estado-conta";

/**
 * Guard de escrita da camada de aplicação (#163+#159).
 *
 * Modelado sobre `src/auth/require-role.ts` — erro tipado, chamador decide —
 * mas **sem herdar de `RoleError`** de propósito: "acesso negado por papel" é
 * mensagem enganosa aqui (o papel está certo, a conta é que está em
 * somente-leitura), e a UI precisa distinguir os dois para oferecer o CTA de
 * ativação em vez de mandar a pessoa falar com a coordenação.
 *
 * **Este guard não é a fronteira de autorização.** Ele existe para dar a
 * mensagem boa; a barreira real é o trigger `app_barreira_somente_leitura`
 * (migração 0073), que transforma um caminho de escrita novo e esquecido em
 * erro barulhento em vez de escrita indevida silenciosa.
 */
export class ContaSomenteLeituraError extends Error {
  constructor(readonly estado: EstadoConta) {
    super(mensagemDeEstado(estado));
    this.name = "ContaSomenteLeituraError";
  }
}

/**
 * Versão para uso DENTRO de uma transação já aberta, quando a escrita e a
 * decisão precisam enxergar a mesma imagem do banco.
 */
export async function requireEscritaPermitida(
  tx: Tx,
  clinicId: string,
): Promise<void> {
  const situacao = await avaliarSituacaoConta(tx, clinicId);
  if (!situacao.podeEscrever) {
    throw new ContaSomenteLeituraError(situacao.estado);
  }
}

/**
 * Estado devolvido por qualquer core de escrita bloqueado.
 *
 * `bloqueioConta` existe separado de `error` porque a UI reage de forma
 * diferente: `error` é texto de validação, enquanto conta em somente-leitura
 * abre o fluxo de ativação da assinatura. Um único campo de string obrigaria a
 * tela a inferir a intenção pelo texto da mensagem.
 */
export type BloqueioConta = { estado: EstadoConta; mensagem: string };

export type EstadoComBloqueio = {
  error?: string;
  bloqueioConta?: BloqueioConta;
};

/**
 * Envolve um core `(ctx, ...args)` com a checagem de escrita.
 *
 * Aplicado na **exportação do `logic.ts`**, não do `actions.ts`: assim os
 * testes de integração existentes — que chamam o core direto, passando `ctx` —
 * exercitam o guard de verdade. Envolver no `actions.ts` deixaria a suíte
 * inteira cega para ele.
 *
 * A avaliação abre a própria transação de leitura, e não a mesma da escrita, de
 * propósito: fazê-la participar da transação do core exigiria mudar a
 * assinatura de todos os cores. A janela de corrida entre a leitura e a escrita
 * é irrelevante aqui (o estado muda por ativação de assinatura, não por
 * concorrência interna) e o trigger SQL fecha o caso residual.
 */
export function comEscrita<S extends EstadoComBloqueio, A extends unknown[]>(
  fn: (ctx: TenantContext, ...args: A) => Promise<S>,
): (ctx: TenantContext, ...args: A) => Promise<S> {
  return async (ctx: TenantContext, ...args: A): Promise<S> => {
    const situacao = await withTenant(ctx, (tx) =>
      avaliarSituacaoConta(tx, ctx.clinicId),
    );
    if (!situacao.podeEscrever) {
      const mensagem = mensagemDeEstado(situacao.estado);
      return {
        error: mensagem,
        bloqueioConta: { estado: situacao.estado, mensagem },
      } as S;
    }
    return fn(ctx, ...args);
  };
}
