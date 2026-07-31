import "server-only";
import { headers } from "next/headers";
import { CredencialInvalida, criarContaEClinica } from "@/auth/cadastro";
import { SemaforoSaturado, criarSemaforo } from "@/lib/semaforo";
import { registrarTentativa } from "@/lib/throttle";

export type EstadoCadastro = { error?: string };

/**
 * Versão do termo aceita neste cadastro. VEM DAQUI, DO SERVIDOR — nunca do
 * formulário. `professional_consent` é append-only (migração 0058: `iris_auth`
 * só tem SELECT/INSERT, ninguém tem DELETE), então toda linha gravada é
 * permanente. Se o cliente controlasse este valor, o índice único
 * `(user_id, clinic_id, versao_termo)` (migração 0060) deixaria de conter
 * duplicatas — bastaria variar a string para inserir linhas irremovíveis à
 * vontade, transformando a tabela de evidência jurídica num vetor de poluição
 * sem limite.
 */
export const VERSAO_TERMO = "2026-07-30";

const CONSELHOS = ["crp", "crfa", "crefito", "crm", "outro"] as const;

// ─── Dimensionamento do throttle ─────────────────────────────────────────────
// DIMENSIONADO PARA LOGIN, NÃO PARA CADASTRO. Esta rota verifica senha de
// e-mails já existentes (`verificarPossePorSenha`, src/auth/cadastro.ts) por
// `auth.$context`, caminho que não passa por `auth.handler` — então rate
// limiting, contador de falha e lockout do Better-Auth NÃO rodam. Na prática é
// um endpoint de verificação de credencial, e um limite "de cadastro" (ex.:
// 10/hora/IP) ainda permitiria milhares de tentativas por dia contra um alvo.
//
// REBALANCEADO no fix round 1 (finding 5 do review). Os números antigos
// (5/15 min, teto de 24 h) davam a QUALQUER anônimo uma arma de negação
// dirigida: ~6 POSTs travavam o cadastro de um e-mail conhecido por um dia.
// Duas mudanças, uma no número e outra na mecânica:
//   1. O teto caiu de 24 h para 30 min — o dano de um lockout dirigido passou
//      a ser medido em minutos, não em dias.
//   2. O backoff passou a ser ancorado no INÍCIO da janela (migração 0062), e
//      essa é a mudança que realmente importa: antes, uma requisição a cada
//      teto mantinha a vítima travada indefinidamente, de graça. Agora o
//      bloqueio termina na hora marcada e re-travar custa `limite + 1`
//      requisições novas.
// O limite subiu de 5 para 8 para não punir quem erra a própria senha algumas
// vezes. A força bruta continua morta: com teto de 30 min o atacante sustenta
// no máximo ~8 tentativas a cada 30 min (~384/dia) contra scrypt com mínimo de
// 12 caracteres — irrelevante para adivinhar senha, e mais barato de encarar
// que a alternativa de dar a todo mundo um botão de negar cadastro alheio.
const LIMITE_EMAIL = 8;
const JANELA_EMAIL_S = 15 * 60;
const TETO_EMAIL_S = 30 * 60;
// Teto por IP, independente do de e-mail: cobre a varredura de MUITOS e-mails
// distintos a partir de uma origem (cada e-mail sozinho ficaria dentro do
// próprio limite).
const LIMITE_IP = 30;
const JANELA_IP_S = 15 * 60;
const TETO_IP_S = 30 * 60;

/**
 * Piso de tempo de resposta. A resposta uniforme (mesmo corpo, mesmo status)
 * só é anti-enumeração de verdade se o TEMPO também for indistinguível: o ramo
 * "e-mail existente" faz verificação de scrypt, o ramo "e-mail novo" faz
 * criação de conta+clínica. Sem piso, a diferença entre eles é medível e
 * responde à pergunta "esse e-mail tem conta aqui?".
 *
 * QUAL É O RAMO CARO (corrigido no fix round 1, finding 2): não é a
 * verificação de scrypt do e-mail existente — é o **e-mail novo**, que faz
 * derivação de scrypt + três inserts. Era pior ainda antes deste round: o
 * `sendOnSignUp` do Better-Auth deixava um round-trip de rede até o Resend
 * DENTRO do caminho síncrono desse ramo, e só dele. Isso invertia o oráculo em
 * relação à intuição (e-mail desconhecido lento, conhecido rápido) e estourava
 * qualquer piso num dia de rede ruim. O envio saiu do caminho da requisição
 * (`dispararEmail` em src/auth/auth.ts) exatamente por isso.
 *
 * ESTE VALOR NÃO É UMA APOSTA NO CUSTO DO SCRYPT. `respeitarPiso` não pisa,
 * QUANTIZA: a resposta sai sempre num múltiplo desta constante, então a
 * uniformidade não depende de o ramo caro caber embaixo dela — que era
 * exatamente a dependência frágil apontada na rodada de correção 1 (achado
 * I1), já que ninguém mediu o custo real no container de produção. Estourar um
 * quantum piora a latência e gera aviso; NÃO reabre o canal de tempo.
 */
export const PISO_RESPOSTA_MS = 1_200;

/**
 * Teto de derivações/verificações de senha simultâneas (scrypt = CPU), com
 * fila LIMITADA e com timeout — fila infinita só mudaria o DoS de CPU para
 * memória/latência (finding 4 do review).
 */
const MAX_CADASTROS_SIMULTANEOS = 4;
const CAP_FILA = 32;
const TIMEOUT_FILA_MS = 3_000;
const comLimiteDeCpu = criarSemaforo(MAX_CADASTROS_SIMULTANEOS, {
  capFila: CAP_FILA,
  timeoutMs: TIMEOUT_FILA_MS,
});

/**
 * Aceita só o que é IP plausível. Chave de throttle vinda de header é entrada
 * hostil: sem isto, um atacante escreve lixo arbitrário em `x-forwarded-for` e
 * enche `auth_throttle` de linhas (as chaves são o que ele quiser).
 */
function ipValido(valor: string): boolean {
  if (valor.length === 0 || valor.length > 45) return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(valor) || (valor.includes(":") && ipv6.test(valor));
}

/**
 * Resolve o IP do cliente, ou `null` quando não dá para saber.
 *
 * `null` É UM RESULTADO DE PRIMEIRA CLASSE (finding 3 do review). A versão
 * anterior colapsava o desconhecido em `"desconhecido"` — uma chave global
 * única. Bastava o proxy não mandar o header e o cadastro inteiro se
 * autonegava: ~30 pessoas em 15 minutos e todo mundo caía no backoff, para
 * sempre na prática. É a mesma forma de falha do DoS fail-closed já corrigido
 * na PR #166, e o limitador em memória que este substituiu não tinha. Sem IP
 * confiável, a rota simplesmente NÃO consome contador de IP e fica só com o
 * contador por e-mail — que é o que protege um alvo específico de qualquer
 * jeito.
 *
 * Toma a ÚLTIMA entrada válida de `x-forwarded-for`, não a primeira: numa
 * cadeia com proxy confiável, é o proxy que APENDA o IP real do cliente no
 * fim, e o começo da lista é justamente a parte que o cliente consegue forjar.
 */
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

export type EntradaCadastroForm = {
  email: string;
  senha: string;
  nome: string;
  nomeClinica: string;
  conselho: string;
  registroNumero: string;
  registroUf: string;
};

export function validarCadastro(
  formData: FormData,
): { ok: true; dados: EntradaCadastroForm } | { ok: false; error: string } {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const dados = {
    email: texto("email").toLowerCase(),
    senha: String(formData.get("senha") ?? ""),
    nome: texto("nome"),
    nomeClinica: texto("nomeClinica"),
    conselho: texto("conselho"),
    registroNumero: texto("registroNumero"),
    registroUf: texto("registroUf").toUpperCase(),
  };

  if (!dados.email.includes("@"))
    return { ok: false, error: "Informe um e-mail válido." };
  if (dados.senha.length < 12)
    return { ok: false, error: "A senha precisa ter ao menos 12 caracteres." };
  if (!dados.nome) return { ok: false, error: "Informe seu nome completo." };
  if (!dados.nomeClinica)
    return { ok: false, error: "Informe o nome da clínica." };
  if (!(CONSELHOS as readonly string[]).includes(dados.conselho))
    return { ok: false, error: "Selecione seu conselho profissional." };
  if (!dados.registroNumero)
    return { ok: false, error: "Informe o número do seu registro." };
  if (dados.registroUf.length !== 2)
    return { ok: false, error: "Informe a UF do seu registro." };
  if (formData.get("termos") !== "on")
    return {
      ok: false,
      error: "É preciso aceitar os termos de uso para criar a conta.",
    };

  return { ok: true, dados };
}

/**
 * Reduz um erro desconhecido a uma string diagnosticável e sem dado pessoal:
 * nome da classe + `code` quando houver (SQLSTATE do Postgres, por exemplo).
 * A `message` fica de fora de propósito — é onde o driver costuma colar o SQL
 * com os valores.
 */
function descreverErro(err: unknown): string {
  const nome = err instanceof Error ? err.name : typeof err;
  const codigo = (err as { code?: unknown })?.code;
  return typeof codigo === "string" || typeof codigo === "number"
    ? `${nome}(code=${codigo})`
    : nome;
}

/**
 * Segura a resposta até o próximo MÚLTIPLO de `PISO_RESPOSTA_MS` desde
 * `iniciadoEm`. Não é só um piso: é quantização.
 *
 * Por que quantizar e não só pisar (rodada de correção 1, achado I1): um piso
 * puro protege enquanto os dois ramos couberem embaixo dele — e no instante em
 * que um estoura, o tempo de resposta volta a ser o tempo BRUTO daquele ramo,
 * com resolução de milissegundo. Ou seja, a proteção some exatamente na
 * condição em que ela mais importa (ramo de e-mail novo caro, sob carga, em
 * hardware que ninguém mediu). Depender de "o ramo caro cabe no piso" é
 * depender de uma calibração que não temos.
 *
 * Quantizado, o tempo observável é sempre `n * PISO_RESPOSTA_MS`. Dois ramos
 * que gastam 1,3 s e 1,7 s saem os dois em 2,4 s e continuam indistinguíveis
 * sem ninguém ter ajustado constante nenhuma. O que resta de canal é a
 * fronteira do quantum, e ela some ao aumentar o quantum — não ao adivinhar o
 * custo do scrypt.
 *
 * O aviso continua: cruzar um quantum não quebra a uniformidade, mas é o sinal
 * de que o custo do caminho síncrono cresceu (alguém pôs I/O de volta na rota,
 * por exemplo — foi o caso do `sendOnSignUp`). Degradar em silêncio aqui seria
 * perder esse sinal.
 */
async function respeitarPiso(iniciadoEm: number): Promise<void> {
  const decorrido = Date.now() - iniciadoEm;
  const quanta = Math.max(1, Math.ceil(decorrido / PISO_RESPOSTA_MS));
  const alvo = quanta * PISO_RESPOSTA_MS;

  if (quanta > 1) {
    console.warn(
      `executarCadastro: PISO DE TEMPO ESTOURADO (${decorrido}ms > ${PISO_RESPOSTA_MS}ms) — ` +
        `a resposta foi quantizada para ${alvo}ms e segue uniforme, mas o custo do ` +
        "caminho síncrono cresceu: investigar antes que o quantum vire latência visível.",
    );
  }

  const restante = alvo - decorrido;
  if (restante > 0) await new Promise((r) => setTimeout(r, restante));
}

/**
 * Endpoint público de cadastro (núcleo). `server-only` e SEM `"use server"` —
 * a superfície invocável pelo cliente é só `./actions.ts` (Issue #55).
 *
 * RESPOSTA UNIFORME (a metade que a Task 6 não entregou). Os três casos que o
 * núcleo produz — e-mail novo, e-mail existente + senha certa (retomada), e
 * e-mail existente + senha errada (`CredencialInvalida`) — colapsam aqui numa
 * ÚNICA resposta: `{}`, seguida de redirect para a mesma tela. Mesmo corpo,
 * mesmo status, mesmo tempo (ver `respeitarPiso`). Se `CredencialInvalida`
 * virasse uma mensagem de erro própria, a tela responderia "esse e-mail já tem
 * conta" para quem soubesse ler — que é exatamente o oráculo de enumeração que
 * a Task 5 fechou no núcleo e que não pode reabrir aqui.
 *
 * SESSÃO: os dois ramos terminam DESLOGADOS, então nem o cookie diferencia um
 * do outro. `provisionUser` chama `auth.api.signUpEmail` sem `asResponse` e
 * descarta os headers da resposta do Better-Auth, e o projeto não usa o plugin
 * `nextCookies` (src/auth/auth.ts) — nada chega ao cookie store do Next. Além
 * disso `requireEmailVerification: true` já impede auto sign-in no cadastro.
 * Um `Set-Cookie` que aparecesse só no ramo "e-mail novo" seria um oráculo
 * perfeito, imune à uniformidade de corpo e de tempo.
 */
export async function executarCadastro(
  formData: FormData,
): Promise<EstadoCadastro> {
  const validado = validarCadastro(formData);
  // Erro de validação sai ANTES do piso e do contador de propósito: ele depende
  // só do que o cliente digitou, nunca do estado do banco — não diz nada sobre
  // a existência do e-mail e não é tentativa contra uma conta.
  if (!validado.ok) return { error: validado.error };

  const iniciadoEm = Date.now();

  const h = await headers();
  // ip/userAgent SEMPRE do servidor. São gravados em `professional_consent`,
  // que é imutável: aceitar esses valores do formulário deixaria o atacante
  // escolher o que fica registrado permanentemente como prova do aceite.
  const ip = resolverIp(h);
  const userAgent = h.get("user-agent") ?? undefined;

  // A tentativa é contada ANTES do núcleo e sem NUNCA olhar o resultado dele.
  // Contar só "falhas" faria o contador subir apenas para e-mails existentes
  // (e-mail novo nem chega no caminho de senha) — o bloqueio após N tentativas
  // viraria a resposta "esse e-mail existe". As chaves são consumidas de forma
  // idêntica nos dois ramos, e SEMPRE (sem short-circuit, para que o estado do
  // contador de IP não dependa do estado do de e-mail).
  //
  // O contador de IP só entra quando há IP confiável. Sem ele a rota fica só
  // com o de e-mail — nunca com uma chave global compartilhada, que seria
  // autonegação de serviço (ver `resolverIp`).
  let permitido: boolean;
  try {
    const contadores = [
      registrarTentativa(
        `cadastro:email:${validado.dados.email}`,
        LIMITE_EMAIL,
        JANELA_EMAIL_S,
        TETO_EMAIL_S,
      ),
    ];
    if (ip !== null) {
      contadores.push(
        registrarTentativa(
          `cadastro:ip:${ip}`,
          LIMITE_IP,
          JANELA_IP_S,
          TETO_IP_S,
        ),
      );
    }
    const resultados = await Promise.all(contadores);
    permitido = resultados.every((r) => r.permitido);
  } catch {
    // FAIL-CLOSED: store fora do ar bloqueia. O contrário transformaria uma
    // indisponibilidade do Postgres numa rota de verificação de credencial sem
    // limite algum — e o atacante controla quando derrubar o store (ele mesmo
    // pode provocar a carga).
    permitido = false;
  }

  if (!permitido) {
    await respeitarPiso(iniciadoEm);
    return {
      error:
        "Muitas tentativas a partir deste dispositivo ou para este e-mail. Aguarde alguns minutos e tente de novo.",
    };
  }

  try {
    await comLimiteDeCpu(() =>
      criarContaEClinica({
        ...validado.dados,
        versaoTermo: VERSAO_TERMO,
        ip: ip ?? undefined,
        userAgent,
      }),
    );
  } catch (err) {
    if (err instanceof SemaforoSaturado) {
      // Servidor sem vaga de CPU para scrypt agora. A decisão é tomada ANTES de
      // qualquer consulta ao banco e não depende do e-mail submetido — logo é
      // idêntica para e-mail cadastrado e para e-mail livre, e não distingue os
      // dois. Mensagem genérica, mesmo piso de tempo.
      console.warn(
        "executarCadastro: recusado por saturação de CPU:",
        err.message,
      );
      await respeitarPiso(iniciadoEm);
      return {
        error:
          "Não foi possível concluir o cadastro agora. Tente novamente em instantes.",
      };
    }
    if (!(err instanceof CredencialInvalida)) {
      // Falha genuína de infraestrutura. Não vaza nada sobre o e-mail: acontece
      // igualmente nos dois ramos.
      // Só nome + código, NUNCA o objeto cru (rodada de correção 1, achado
      // M1): erro de driver do Postgres carrega os parâmetros da query, ou
      // seja e-mail do titular e potencialmente hash de senha. Log de servidor
      // não é destino legítimo de dado pessoal (LGPD), e um objeto de erro
      // serializado inteiro também expõe estrutura interna a quem lê o log.
      console.error(
        "executarCadastro: falha ao criar conta/clínica:",
        descreverErro(err),
      );
      await respeitarPiso(iniciadoEm);
      return {
        error:
          "Não foi possível concluir o cadastro agora. Tente novamente em instantes.",
      };
    }
    // `CredencialInvalida` (e-mail já existe e a senha não confere) cai no
    // MESMO retorno do sucesso — ver o bloco RESPOSTA UNIFORME acima. O núcleo
    // não escreveu nada (Task 5 garante zero escrita antes desse gate).
  }

  await respeitarPiso(iniciadoEm);
  return {};
}
