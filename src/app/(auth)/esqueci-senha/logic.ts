import "server-only";
import { headers } from "next/headers";
import { auth } from "@/auth/auth";
import { registrarTentativa } from "@/lib/throttle";
import { consumirTentativa } from "@/lib/rate-limit";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
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
 * Fix round 1 (finding I4 do review): o brief manda `consumirTentativa`
 * (`src/lib/rate-limit.ts`, em memória) por IP (10/h) e por e-mail (3/h) — a
 * Task 9 tinha TROCADO esse mecanismo pelo throttle persistente em vez de
 * espelhar ADICIONALMENTE, que era a instrução original do orquestrador. Os
 * dois agora rodam em conjunto, com os MESMOS números (não há por que os
 * dois limitadores terem tetos diferentes): o persistente continua sendo a
 * defesa de verdade (sobrevive a réplica/deploy, ver comentário acima), o em
 * memória é defesa-em-profundidade barata — não gasta uma linha de
 * `auth_throttle` nem uma consulta ao Postgres para recusar um IP/e-mail que
 * já está claramente estourado na instância atual, reduzindo a superfície de
 * DoS contra o próprio banco.
 *
 * `consumirTentativa` usa milissegundos na janela (`JANELA_EMAIL_S * 1000`),
 * não segundos como `registrarTentativa` — assinaturas diferentes por serem
 * módulos de fatias diferentes (Task 6 vs Task 7), não um erro de conversão.
 *
 * SEMPRE CHAMADO, nunca pulado por causa do resultado do outro limitador —
 * pela mesma razão que os contadores de e-mail e IP do throttle persistente
 * sempre rodam os dois: se um serví-se de curto-circuito no outro, a ORDEM
 * de avaliação viraria ela própria um canal de tempo (ver I2 abaixo).
 */
const LIMITE_EMAIL_MEM = LIMITE_EMAIL;
const LIMITE_IP_MEM = LIMITE_IP;
const JANELA_EMAIL_MEM_MS = JANELA_EMAIL_S * 1000;
const JANELA_IP_MEM_MS = JANELA_IP_S * 1000;

/**
 * Piso de tempo de resposta (fix round 1, finding I2 do review).
 *
 * MEDIDO, não chutado: `auth.api.requestPasswordReset` real contra Postgres
 * real (script de medição, 15 amostras interleaved e-mail existente vs.
 * inexistente — ver task-9-report.md para o transcript completo):
 *
 *     ramo EXISTENTE   min=4.7  p50=5.1  p99=7.4  max=10.3 ms
 *     ramo INEXISTENTE min=4.0  p50=4.7  p99=5.6  max=8.6  ms
 *     delta p50 ≈ 0.47 ms
 *
 * O delta é pequeno porque o próprio Better-Auth já simula o trabalho do
 * ramo "e-mail desconhecido" (`generateId` + um SELECT dummy — ver
 * `password.mjs`, ramo `!user`) — mas "pequeno" não é "zero", e o SEGUNDO
 * canal (`permitido === false` pula TODA a chamada ao Better-Auth) é maior:
 * não faz nem o SELECT/INSERT do Postgres nem o `generateId`. Um piso ÚNICO,
 * acima do pior caso medido dos dois canais, resolve ambos — não há
 * variação suficiente para justificar quantização (mesma lição da Task 7:
 * quantizar amplifica quando os ramos caem em degraus diferentes do
 * quantum; piso simples nunca amplifica).
 *
 * O valor (300 ms) é ~30x o pior caso medido (max=10.3 ms), a mesma ordem de
 * grandeza de margem que `cadastro/logic.ts` usa sobre o delta medido lá
 * (`PISO_RESPOSTA_MS = 1_200` para um delta de 38 ms, ~30x) — não é preciso
 * um piso tão alto quanto o do cadastro porque o delta aqui é praticamente
 * todo absorvido pela própria mitigação do Better-Auth; o piso aqui é
 * majoritariamente para cobrir jitter de rede/GC, não trabalho assimétrico.
 */
export const PISO_RESPOSTA_MS = 300;

/**
 * Espera o que faltar para fechar `PISO_RESPOSTA_MS` desde `iniciadoEm`.
 * Mesmo desenho de `respeitarPiso` em `../cadastro/logic.ts` — não loga nada
 * (um aviso de "estouro" só dispararia no ramo mais caro, o que seria, ele
 * próprio, um canal).
 */
async function respeitarPiso(iniciadoEm: number): Promise<void> {
  const restante = PISO_RESPOSTA_MS - (Date.now() - iniciadoEm);
  if (restante > 0) await new Promise((r) => setTimeout(r, restante));
}

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
export function resolverIp(h: {
  get(nome: string): string | null;
}): string | null {
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
// Fix round 1 (finding M3 do review): `formData.get("email")` não tem limite
// de tamanho — um cliente hostil pode mandar um "e-mail" de megabytes só
// para inflar a chave de throttle (`esqueci-senha:email:${...}`) em memória
// (`consumirTentativa`, Map por processo) e no Postgres (`registrarTentativa`,
// coluna de chave). 254 é o teto de e-mail do RFC 5321 (linha "MAIL FROM" +
// domínio); qualquer coisa além disso já não é um e-mail válido de qualquer
// forma, então truncar aqui não perde nenhum caso legítimo.
const TAMANHO_MAX_EMAIL = 254;

function validarEsqueciSenha(
  formData: FormData,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, TAMANHO_MAX_EMAIL);
  if (!email.includes("@")) {
    return { ok: false, error: "Informe um e-mail válido." };
  }
  return { ok: true, email };
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

  // Piso de tempo começa aqui — DEPOIS da validação de formato (que não
  // depende de banco nem de e-mail existir, então pode ser rápida) e ANTES
  // de qualquer coisa que toque throttle ou Better-Auth (ver PISO_RESPOSTA_MS
  // acima).
  const iniciadoEm = Date.now();

  const h = await headers();
  const ip = resolverIp(h);

  // Tentativa é contada ANTES de qualquer chamada ao Better-Auth e sempre
  // (nunca só em "falha") — mesma regra de `../cadastro/logic.ts`: contar
  // só uma classe de desfecho tornaria o contador, ele mesmo, um oráculo.
  //
  // Os DOIS limitadores (memória + persistente, finding I4) são chamados
  // sempre, incondicionalmente um do outro — nenhum curto-circuita o outro.
  let permitido: boolean;
  try {
    const memEmail = consumirTentativa(
      `esqueci-senha:email:${validado.email}`,
      LIMITE_EMAIL_MEM,
      JANELA_EMAIL_MEM_MS,
    );
    const memIp =
      ip !== null
        ? consumirTentativa(
            `esqueci-senha:ip:${ip}`,
            LIMITE_IP_MEM,
            JANELA_IP_MEM_MS,
          )
        : { permitido: true };

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
    permitido =
      memEmail.permitido &&
      memIp.permitido &&
      resultados.every((r) => r.permitido);
  } catch (err) {
    // FAIL-CLOSED: store indisponível bloqueia a tentativa (mesma regra do
    // `ThrottleIndisponivel` de `src/lib/throttle.ts`). Não muda a resposta
    // devolvida ao cliente — só evita chamar o Better-Auth sem proteção.
    //
    // Fix round 1 (finding M4 do review): antes este catch falhava em
    // silêncio total — um outage de throttle (Postgres ou processo) virava
    // "todo mundo bloqueado" sem NENHUM sinal em log para o operador
    // perceber. O registro nunca leva o objeto cru — que poderia carregar
    // parâmetros de query com o e-mail do titular (mesmo cuidado do achado
    // M1 da Task 7).
    //
    // #560 (F4): o `descreverErro` local daqui montava `nome(code=…)`.
    // `logarErroSemPII` produz um SUPERCONJUNTO disso em campos separados
    // (`erroNome`, `codigo`, `constraint`, `causaNome`, `httpStatus`,
    // `hashMensagem`, `correlacaoId`) e passa pela redaction por chave, que
    // um `console.error` com string pronta contornava.
    logarErroSemPII("esqueci-senha.throttle-indisponivel-fail-closed", err);
    permitido = false;
  }

  if (permitido) {
    try {
      await auth.api.requestPasswordReset({
        body: { email: validado.email, redirectTo: "/redefinir-senha" },
      });
    } catch (err) {
      logarErroSemPII("esqueci-senha.falha-ao-solicitar-redefinicao", err);
    }
  }

  // Piso cobre os DOIS canais de tempo (finding I2): o delta residual entre
  // e-mail existente/inexistente dentro do Better-Auth, E o atalho muito
  // maior de quando `permitido` é `false` (que pula a chamada inteira). Um
  // piso só, sempre aplicado no fim, normaliza os dois.
  await respeitarPiso(iniciadoEm);

  return { mensagem: mensagemUniforme() };
}
