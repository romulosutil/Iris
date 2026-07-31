import "server-only";
import { headers } from "next/headers";
import { auth } from "@/auth/auth";
import { registrarTentativa } from "@/lib/throttle";
import { mensagemUniforme } from "./mensagem";

export type EstadoEsqueciSenha = { error?: string; mensagem?: string };

// ─── Dimensionamento do throttle ─────────────────────────────────────────────
// Números do brief (task-9-brief.md): 10/h por IP, 3/h por e-mail. A
// MECÂNICA é a persistente (migração 0061/0062, `src/lib/throttle.ts`),
// não o `consumirTentativa` em memória de `src/lib/rate-limit.ts` — resolução
// de controlador da Task 9, não do brief original.
//
// POR QUÊ: `/esqueci-senha` é exatamente a mesma forma de rota que
// `/cadastro` — pública, não autenticada, na internet — e a Task 7 já
// concluiu (ver o comentário "DIMENSIONAMENTO DO THROTTLE" em
// `../cadastro/logic.ts`) que um contador em `Map` por processo falha aberto
// silenciosamente sob deploy com múltiplas réplicas ou containers reciclados:
// cada instância nova começa com o mapa vazio, então o limite é por
// INSTÂNCIA, não por rota. Não é uma contradição do brief — o brief não
// tratou esse caso porque o throttle persistente ainda não existia quando
// a Task 6 foi escrita.
//
// Janela = teto (1h): ao contrário de `../cadastro/logic.ts` (que usa backoff
// exponencial ancorado no início da janela para não travar uma vítima
// indefinidamente), aqui NÃO há tuning de escalonamento novo especificado —
// os números do brief já são o valor final por hora. `janelaSegundos ===
// tetoSegundos` faz `LEAST(janela * 2^excesso, teto)` saturar imediatamente
// em `teto === janela`, ou seja, o backoff se comporta como uma janela fixa
// simples de 1h — sem inventar uma política de escalonamento que o brief
// não pediu.
const LIMITE_EMAIL = 3;
const JANELA_EMAIL_S = 60 * 60;
const TETO_EMAIL_S = 60 * 60;
const LIMITE_IP = 10;
const JANELA_IP_S = 60 * 60;
const TETO_IP_S = 60 * 60;

/**
 * Aceita só o que é IP plausível. Mesma checagem de `../cadastro/logic.ts`
 * (não importada de lá de propósito — Task 9 não depende de internals de
 * uma fatia fechada; a lógica é pequena o bastante para duplicar em vez de
 * acoplar dois recortes independentes do backlog).
 */
function ipValido(valor: string): boolean {
  if (valor.length === 0 || valor.length > 45) return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(valor) || (valor.includes(":") && ipv6.test(valor));
}

/** Resolve o IP do cliente, ou `null` quando não dá para saber (ver nota acima). */
export function resolverIp(h: { get(nome: string): string | null }): string | null {
  const encaminhados = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(ipValido);
  if (encaminhados.length > 0) return encaminhados[encaminhados.length - 1]!;

  const real = (h.get("x-real-ip") ?? "").trim();
  return ipValido(real) ? real : null;
}

/**
 * Validação PRÉ-NÚCLEO: só formato, sem I/O e sem olhar o banco. Por isso
 * pode ter mensagem própria — não depende de o e-mail existir (mesma regra
 * de `../cadastro/logic.ts`, bloco RESPOSTA UNIFORME).
 */
export function validarEsqueciSenha(
  formData: FormData,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Informe um e-mail válido." };
  }
  return { ok: true, email };
}

function descreverErro(err: unknown): string {
  const nome = err instanceof Error ? err.name : typeof err;
  const codigo = (err as { code?: unknown })?.code;
  return typeof codigo === "string" || typeof codigo === "number"
    ? `${nome}(code=${codigo})`
    : nome;
}

/**
 * Núcleo público (`server-only`, sem `"use server"`) da recuperação de senha.
 * A superfície invocável pelo cliente é só `./actions.ts` (Issue #55).
 *
 * RESPOSTA UNIFORME. `mensagemUniforme()` é o ÚNICO texto de sucesso deste
 * módulo, para QUALQUER desfecho pós-validação de formato: e-mail existente,
 * e-mail inexistente (o próprio `auth.api.requestPasswordReset` do
 * Better-Auth já devolve `{ status: true }` nesse caso — ver
 * `node_modules/better-auth/dist/api/routes/password.mjs`, ramo `!user`,
 * que inclusive simula a geração de token e a consulta de verificação para
 * mitigar canal de tempo), falha do provedor de e-mail (`sendResetPassword`
 * dispara o envio fora do caminho da requisição via `dispararEmail` em
 * `src/auth/auth.ts`, que tem contrato de NUNCA lançar), falha de banco, e
 * throttle acionado.
 *
 * REGRA DE CLASSE, não lista de casos: o `try/catch` ao redor da chamada ao
 * Better-Auth colapsa QUALQUER exceção (rede, banco, `APIError` interna que
 * ainda não existe) no mesmo retorno de sucesso — só loga o diagnóstico
 * (nome + código, nunca o objeto cru, pelo mesmo motivo do achado M1 da
 * Task 7: erro de driver carrega parâmetros de query, ou seja e-mail do
 * titular). Igual para o throttle: quando `permitido` é `false`, a função
 * simplesmente PULA a chamada ao Better-Auth (sem gastar um token de
 * verificação real nem acordar o provedor de e-mail) e devolve a MESMA
 * mensagem — nunca um erro "muitas tentativas" próprio, porque isso
 * distinguiria esta chamada das demais para quem estiver cronometrando
 * requisições repetidas contra o mesmo e-mail.
 */
export async function executarEsqueciSenha(
  formData: FormData,
): Promise<EstadoEsqueciSenha> {
  const validado = validarEsqueciSenha(formData);
  if (!validado.ok) return { error: validado.error };

  const h = await headers();
  const ip = resolverIp(h);

  // Tentativa é contada ANTES de qualquer chamada ao Better-Auth e sempre
  // (nunca só em "falha") — mesma regra de `../cadastro/logic.ts`: contar
  // só uma classe de desfecho tornaria o contador, ele mesmo, um oráculo.
  let permitido: boolean;
  try {
    const contadores = [
      registrarTentativa(
        `esqueci-senha:email:${validado.email}`,
        LIMITE_EMAIL,
        JANELA_EMAIL_S,
        TETO_EMAIL_S,
      ),
    ];
    if (ip !== null) {
      contadores.push(
        registrarTentativa(
          `esqueci-senha:ip:${ip}`,
          LIMITE_IP,
          JANELA_IP_S,
          TETO_IP_S,
        ),
      );
    }
    const resultados = await Promise.all(contadores);
    permitido = resultados.every((r) => r.permitido);
  } catch {
    // FAIL-CLOSED: store indisponível bloqueia a tentativa (mesma regra do
    // `ThrottleIndisponivel` de `src/lib/throttle.ts`). Não muda a resposta
    // devolvida ao cliente — só evita chamar o Better-Auth sem proteção.
    permitido = false;
  }

  if (permitido) {
    try {
      await auth.api.requestPasswordReset({
        body: { email: validado.email, redirectTo: "/redefinir-senha" },
      });
    } catch (err) {
      console.error(
        "executarEsqueciSenha: falha ao solicitar redefinição:",
        descreverErro(err),
      );
    }
  }

  return { mensagem: mensagemUniforme() };
}
