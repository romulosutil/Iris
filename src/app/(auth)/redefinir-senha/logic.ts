import "server-only";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth/auth";
import { registrarTentativa } from "@/lib/throttle";
import { resolverIp } from "../esqueci-senha/logic";
import { NOME_COOKIE_TOKEN, CAMINHO_COOKIE } from "./cookie";

export type EstadoRedefinirSenha =
  | { ok: true }
  | { ok: false; error: string };

const SENHA_MIN = 12;
const SENHA_MAX = 128;

// Fix round 1 (finding M7 do review): sem throttle nenhum neste endpoint, um
// atacante pode tentar tokens forjados (cookie é gravável por quem quer que
// escreva o header `Cookie`) contra `/redefinir-senha` sem limite. Números
// por IP apenas (não há e-mail conhecido neste ponto do fluxo — só o
// possuidor do token sabe a que conta ele pertence). Mesma ordem de grandeza
// do limite de IP de `../esqueci-senha/logic.ts` (10/h): não é um segredo de
// altíssima entropia adicional sendo protegido (o cookie e o token já são o
// segredo de posse), então não precisa de número diferente.
const LIMITE_IP = 10;
const JANELA_IP_S = 60 * 60;
const TETO_IP_S = 60 * 60;

/**
 * Mensagem ÚNICA para qualquer motivo de falha: cookie/token ausente,
 * token inválido/expirado no Better-Auth, throttle acionado, ou exceção de
 * infra. Fix round 1 (finding M5 do review): a versão anterior desta rota
 * afirmava "Este link de redefinição de senha é inválido ou já expirou" mesmo
 * quando a causa real podia ser "nunca houve token nesta requisição" (ex.:
 * usuário chegou aqui sem clicar em link nenhum) — uma causa que o servidor
 * não tem como saber com certeza. Mesmo padrão de honestidade de
 * `../cadastro/verifique-email/page.tsx`: descreve o que É observável (não
 * há um link ativo agora), não uma causa específica que não dá pra
 * confirmar.
 */
export const MENSAGEM_SEM_LINK_ATIVO =
  "Não há um link de redefinição ativo. Solicite um novo para continuar.";

/**
 * Validação PRÉ-NÚCLEO de FORMATO da senha nova — não depende de cookie,
 * token, nem banco. Mesma regra de `../cadastro/logic.ts`/`../esqueci-senha/logic.ts`:
 * erro de formato pode ter mensagem própria porque não vaza nada sobre conta
 * ou token.
 */
export function validarNovaSenha(formData: FormData): {
  ok: true;
  novaSenha: string;
} | { ok: false; error: string } {
  const novaSenha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (novaSenha.length < SENHA_MIN) {
    return { ok: false, error: `A senha precisa ter ao menos ${SENHA_MIN} caracteres.` };
  }
  if (novaSenha.length > SENHA_MAX) {
    return { ok: false, error: `A senha pode ter no máximo ${SENHA_MAX} caracteres.` };
  }
  if (novaSenha !== confirmacao) {
    return { ok: false, error: "As senhas não conferem." };
  }
  return { ok: true, novaSenha };
}

function descreverErro(err: unknown): string {
  const nome = err instanceof Error ? err.name : typeof err;
  const codigo = (err as { code?: unknown })?.code;
  return typeof codigo === "string" || typeof codigo === "number"
    ? `${nome}(code=${codigo})`
    : nome;
}

/**
 * Lê o token do cookie httpOnly (gravado por `src/middleware.ts` — ver
 * `./cookie.ts`). NUNCA lê de `searchParams`: é exatamente o que o fix de C1
 * elimina.
 */
async function lerTokenDoCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(NOME_COOKIE_TOKEN)?.value;
}

/** Apaga o cookie (mesmo `path` do gravado, senão o browser cria um 2º cookie). */
async function apagarCookieToken(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: NOME_COOKIE_TOKEN, path: CAMINHO_COOKIE });
}

/**
 * Núcleo público (`server-only`, sem `"use server"`) da redefinição de
 * senha. Superfície invocável pelo cliente é só `./actions.ts` (Issue #55).
 *
 * Fix round 1 (finding C1 do review): o token nunca sai do servidor — chega
 * aqui via cookie httpOnly, é usado direto na chamada server-side ao
 * Better-Auth (`auth.api.resetPassword`), e nunca passa pelo cliente (nem em
 * prop de componente, nem em corpo de fetch do navegador — diferente da
 * versão anterior, que chamava `authClient.resetPassword` do lado do
 * cliente e por isso precisava do token como prop React).
 *
 * RESPOSTA COLAPSADA (não é o mesmo tipo de "uniforme" de `/esqueci-senha` —
 * ali a preocupação é enumeração de e-mail; aqui não há e-mail neste ponto,
 * só posse de token. Mas o PRINCÍPIO é o mesmo: motivo de falha (token
 * ausente, token inválido, token expirado, throttle) não deve ser
 * distinguível, porque um atacante testando tokens forjados usaria a
 * distinção para confirmar quando um palpite "quase" bate).
 */
export async function executarRedefinirSenha(
  formData: FormData,
): Promise<EstadoRedefinirSenha> {
  const validado = validarNovaSenha(formData);
  if (!validado.ok) return { ok: false, error: validado.error };

  const token = await lerTokenDoCookie();
  if (!token) {
    // Pré-núcleo (nenhum I/O de token/Better-Auth feito ainda) — mesma razão
    // de `../esqueci-senha/logic.ts` não aplicar piso em falha de formato:
    // ausência de cookie não é um canal sobre CONTA nenhuma (é sobre
    // presença de link, que já não é tratado como segredo — ver page.tsx).
    return { ok: false, error: MENSAGEM_SEM_LINK_ATIVO };
  }

  const iniciadoEm = Date.now();
  const h = await headers();
  const ip = resolverIp(h);

  let permitido: boolean;
  try {
    permitido =
      ip !== null
        ? (
            await registrarTentativa(
              `redefinir-senha:ip:${ip}`,
              LIMITE_IP,
              JANELA_IP_S,
              TETO_IP_S,
            )
          ).permitido
        : true;
  } catch (err) {
    // FAIL-CLOSED: store indisponível bloqueia a tentativa. Fix round 1
    // (finding M4 do review): mesmo cuidado de `../esqueci-senha/logic.ts` —
    // loga nome+código do erro (nunca o objeto cru) para o outage não passar
    // em silêncio total, sem arriscar vazar token/IP em detalhe de driver.
    console.error(
      "executarRedefinirSenha: throttle indisponível, bloqueando (fail-closed):",
      descreverErro(err),
    );
    permitido = false;
  }

  let sucesso = false;
  if (permitido) {
    try {
      await auth.api.resetPassword({ body: { token, newPassword: validado.novaSenha } });
      sucesso = true;
    } catch (err) {
      console.error(
        "executarRedefinirSenha: falha ao redefinir senha:",
        descreverErro(err),
      );
    }
    // Cookie só é apagado quando de fato houve tentativa contra o
    // Better-Auth (sucesso ou não) — nunca no throttle, senão um IP
    // temporariamente estourado (NAT compartilhado, etc.) queimaria o link
    // de uso único de uma vítima legítima sem ela nunca ter tentado nada.
    await apagarCookieToken();
  }

  // Piso de tempo: mesma lógica de `../esqueci-senha/logic.ts` — normaliza o
  // atalho do throttle (pula toda a chamada ao Better-Auth) contra o custo
  // real de validar/consumir um token. Reaproveita a mesma ordem de
  // grandeza (300ms): a operação em si (bcrypt/scrypt de senha nova +
  // update) já teria seu próprio piso implícito de custo de hash; o que
  // precisa ser normalizado é o desvio do THROTTLE, não da conta.
  const restante = 300 - (Date.now() - iniciadoEm);
  if (restante > 0) await new Promise((r) => setTimeout(r, restante));

  if (!sucesso) return { ok: false, error: MENSAGEM_SEM_LINK_ATIVO };
  return { ok: true };
}
