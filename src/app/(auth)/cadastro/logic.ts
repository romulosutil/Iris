import "server-only";
import { headers } from "next/headers";
import { CredencialInvalida, criarContaEClinica } from "@/auth/cadastro";
import { criarSemaforo } from "@/lib/semaforo";
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
const LIMITE_EMAIL = 5;
const JANELA_EMAIL_S = 15 * 60;
const TETO_EMAIL_S = 24 * 60 * 60;
// Teto por IP, independente do de e-mail: cobre a varredura de MUITOS e-mails
// distintos a partir de uma origem (cada e-mail sozinho ficaria dentro do
// próprio limite).
const LIMITE_IP = 20;
const JANELA_IP_S = 15 * 60;
const TETO_IP_S = 24 * 60 * 60;

/**
 * Piso de tempo de resposta. A resposta uniforme (mesmo corpo, mesmo status)
 * só é anti-enumeração de verdade se o TEMPO também for indistinguível: o ramo
 * "e-mail existente" faz verificação de scrypt, o ramo "e-mail novo" faz
 * criação de conta+clínica. Sem piso, a diferença entre eles é medível e
 * responde à pergunta "esse e-mail tem conta aqui?".
 */
export const PISO_RESPOSTA_MS = 1_200;

/** Teto de verificações/derivações de senha simultâneas (scrypt = CPU). */
const MAX_CADASTROS_SIMULTANEOS = 4;
const comLimiteDeCpu = criarSemaforo(MAX_CADASTROS_SIMULTANEOS);

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

  if (!dados.email.includes("@")) return { ok: false, error: "Informe um e-mail válido." };
  if (dados.senha.length < 12)
    return { ok: false, error: "A senha precisa ter ao menos 12 caracteres." };
  if (!dados.nome) return { ok: false, error: "Informe seu nome completo." };
  if (!dados.nomeClinica) return { ok: false, error: "Informe o nome da clínica." };
  if (!(CONSELHOS as readonly string[]).includes(dados.conselho))
    return { ok: false, error: "Selecione seu conselho profissional." };
  if (!dados.registroNumero) return { ok: false, error: "Informe o número do seu registro." };
  if (dados.registroUf.length !== 2) return { ok: false, error: "Informe a UF do seu registro." };
  if (formData.get("termos") !== "on")
    return { ok: false, error: "É preciso aceitar os termos de uso para criar a conta." };

  return { ok: true, dados };
}

/** Espera o que faltar para fechar `PISO_RESPOSTA_MS` desde `iniciadoEm`. */
async function respeitarPiso(iniciadoEm: number): Promise<void> {
  const restante = PISO_RESPOSTA_MS - (Date.now() - iniciadoEm);
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
export async function executarCadastro(formData: FormData): Promise<EstadoCadastro> {
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
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const userAgent = h.get("user-agent") ?? undefined;

  // A tentativa é contada ANTES do núcleo e sem NUNCA olhar o resultado dele.
  // Contar só "falhas" faria o contador subir apenas para e-mails existentes
  // (e-mail novo nem chega no caminho de senha) — o bloqueio após N tentativas
  // viraria a resposta "esse e-mail existe". Aqui as duas chaves são
  // consumidas de forma idêntica nos dois ramos, e as duas SEMPRE (sem
  // short-circuit, para que o estado do contador de IP também não dependa do
  // do e-mail).
  let permitido: boolean;
  try {
    const [porEmail, porIp] = await Promise.all([
      registrarTentativa(
        `cadastro:email:${validado.dados.email}`,
        LIMITE_EMAIL,
        JANELA_EMAIL_S,
        TETO_EMAIL_S,
      ),
      registrarTentativa(`cadastro:ip:${ip}`, LIMITE_IP, JANELA_IP_S, TETO_IP_S),
    ]);
    permitido = porEmail.permitido && porIp.permitido;
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
        ip,
        userAgent,
      }),
    );
  } catch (err) {
    if (!(err instanceof CredencialInvalida)) {
      // Falha genuína de infraestrutura. Não vaza nada sobre o e-mail: acontece
      // igualmente nos dois ramos.
      console.error("executarCadastro: falha ao criar conta/clínica:", err);
      await respeitarPiso(iniciadoEm);
      return {
        error: "Não foi possível concluir o cadastro agora. Tente novamente em instantes.",
      };
    }
    // `CredencialInvalida` (e-mail já existe e a senha não confere) cai no
    // MESMO retorno do sucesso — ver o bloco RESPOSTA UNIFORME acima. O núcleo
    // não escreveu nada (Task 5 garante zero escrita antes desse gate).
  }

  await respeitarPiso(iniciadoEm);
  return {};
}
