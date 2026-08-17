import "server-only";
import { headers } from "next/headers";
import { CredencialInvalida, criarContaEClinica } from "@/auth/cadastro";
import { criarSemaforo } from "@/lib/semaforo";
import { registrarTentativa } from "@/lib/throttle";
import { enviarEmailTransacional } from "@/lib/email/transacional";
import { getAppBaseUrl } from "@/lib/app-url";
import { criarTemplateTentativaCadastroExistente } from "@/lib/email/templates";
import { VERSAO_TERMO } from "@/lib/legal";

export type EstadoCadastro = { error?: string };

/**
 * Versão do termo aceita neste cadastro. VEM DO SERVIDOR — nunca do
 * formulário. `professional_consent` é append-only (migração 0058: `iris_auth`
 * só tem SELECT/INSERT, ninguém tem DELETE), então toda linha gravada é
 * permanente. Se o cliente controlasse este valor, o índice único
 * `(user_id, clinic_id, versao_termo)` (migração 0060) deixaria de conter
 * duplicatas — bastaria variar a string para inserir linhas irremovíveis à
 * vontade, transformando a tabela de evidência jurídica num vetor de poluição
 * sem limite.
 *
 * REEXPORTADO, não redeclarado (#191). Até 07/08/2026 esta era uma segunda
 * cópia literal da string, apesar de `@/lib/legal` se declarar fonte única. A
 * divergência era invisível: `legal.test.ts` compara a constante DE LÁ com os
 * markdown, e nunca olhava para esta — então subir a versão num lado só faria
 * o aceite gravar uma versão que nenhum documento publicado tem, de forma
 * permanente e irremovível na tabela de evidência jurídica.
 */
export { VERSAO_TERMO };

const CONSELHOS = ["crp", "crfa", "crefito", "crm", "outro"] as const;

/**
 * Espelha `maxPasswordLength` do Better-Auth (128). Não é preferência nossa: é
 * o valor a partir do qual o sign-up lança e a verificação de senha não lança,
 * que foi o que reabriu o oráculo de enumeração pelo corpo da resposta na
 * rodada de correção 3. Se o Better-Auth mudar esse teto, este número muda
 * junto — e o teste de classe de `logic.test.ts` continua valendo de qualquer
 * jeito, porque ele não depende deste número.
 */
const MAX_SENHA = 128;

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
 * O VALOR É DERIVADO DE MEDIÇÃO, não de chute (rodada de correção 2). Medido
 * contra Postgres real + Better-Auth real, 12 amostras interleaved por ramo,
 * em `criarContaEClinica`:
 *
 *     ramo NOVO (caro)      min=89  p50=98  p99=105  max=105 ms
 *     ramo SENHA-ERRADA     min=57  p50=60  p99=67   max=67  ms
 *     ramo RETOMADA         min=63  p50=66  p99=77   max=77  ms
 *
 * Ou seja: o pior ramo tem p99 de ~105 ms e o piso é ~11x isso. Os ramos já
 * são quase simétricos por construção — cada um faz EXATAMENTE um scrypt (o
 * novo deriva no sign-up, o existente verifica) — e os 38 ms de diferença são
 * os três inserts do ramo novo.
 *
 * POR QUE PISO SIMPLES E NÃO QUANTIZAÇÃO (a rodada 1 tentou quantizar e foi
 * revertida): quantizar amplifica em vez de normalizar quando os dois ramos
 * caem em degraus diferentes (straddle) — o vazamento passa a ser de até um
 * quantum INTEIRO (1200 ms) em vez do delta real de trabalho (38 ms). Piso
 * simples degrada no pior caso para o delta do trabalho; quantização degrada
 * para o tamanho do degrau. Com trabalho simétrico, piso simples é
 * estritamente melhor nos dois regimes.
 *
 * A DEFESA DE VERDADE É O TRABALHO SIMÉTRICO (`verificarPossePorSenha` faz uma
 * verificação dummy quando não há credencial, para não existir ramo que sai
 * antes do scrypt). O piso é curativo para jitter, não a barreira.
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
function resolverIp(h: { get(nome: string): string | null }): string | null {
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
  // TETO, do lado de cá (rodada de correção 3). O Better-Auth aplica
  // `maxPasswordLength = 128` no sign-up e NÃO no `password.verify`, então sem
  // este teto os dois ramos divergiam ANTES de qualquer scrypt e a divergência
  // saía no corpo da resposta. O colapso pós-núcleo já fecha o vazamento; isto
  // aqui é para o usuário legítimo receber mensagem útil em vez de silêncio.
  // Pode ser específico porque é validação PRÉ-NÚCLEO: não olha o banco e não
  // depende de o e-mail existir.
  if (dados.senha.length > MAX_SENHA)
    return {
      ok: false,
      error: `A senha pode ter no máximo ${MAX_SENHA} caracteres.`,
    };
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
  if (!err) return "null/undefined";
  if (err instanceof Error) {
    const code =
      (err as any).code ||
      (err as any).body?.code ||
      (err as any).statusCode ||
      (err as any).status;
    const msg = err.message || (err as any).body?.message || "";
    const parts = [err.name];
    if (code) parts.push(`code=${code}`);
    if (msg) parts.push(`msg="${msg}"`);
    if ((err as any).cause) {
      parts.push(`cause=${descreverErro((err as any).cause)}`);
    }
    return parts.join(" ");
  }
  if (typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Espera o que faltar para fechar `PISO_RESPOSTA_MS` desde `iniciadoEm`.
 *
 * PISO SIMPLES, de novo (a rodada de correção 1 trocou por quantização e a
 * rodada 2 reverteu). Motivo medido, não estético: quando os dois ramos caem
 * em degraus diferentes do quantum, o degrau AMPLIFICA — o observável vira a
 * distância entre degraus (1200 ms) em vez da distância entre os trabalhos
 * (38 ms medidos). Piso simples nunca amplifica: no pior caso ele degrada
 * exatamente para o delta de trabalho, que é a grandeza que a simetria de
 * `verificarPossePorSenha` mantém pequena.
 *
 * `iniciadoEm` DEVE ser tomado depois da aquisição da vaga do semáforo. A
 * espera na fila é a parte do relógio que o atacante controla (basta carregar
 * o endpoint); dentro da janela medida, ela deixaria ele empurrar o total para
 * além do piso sob demanda e voltar a ler o tempo do trabalho. Fora da janela,
 * a espera é somada igualmente aos dois ramos e não distingue nada.
 *
 * NÃO LOGA nada aqui. O aviso de "piso estourado" que existiu na rodada 1 era
 * ele próprio um canal: disparava só no ramo que estourava, ou seja a linha de
 * log correlacionava 1:1 com "o e-mail era novo", e o custo do log caía fora
 * da janela normalizada. Estouro de piso se observa por métrica genérica de
 * duração de requisição, que não distingue ramo.
 */
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

  // JANELA NORMALIZADA — começa na AQUISIÇÃO DA VAGA, não na chegada da
  // requisição (rodada de correção 2). A espera na fila do semáforo pode ir a
  // TIMEOUT_FILA_MS e é o atacante quem a controla, carregando o endpoint: se
  // ela entrar em `decorrido`, ele empurra o total para além do piso quando
  // quiser e o tempo volta a refletir qual ramo rodou. Fora da janela, a
  // espera é somada igualmente aos dois ramos e não distingue nada — custa
  // latência sob carga, não confidencialidade.
  let iniciadoNucleo = iniciadoEm;
  // A FRONTEIRA (rodada de correção 3). Não é "que erro foi esse", é "o núcleo
  // chegou a rodar". Ver o bloco DESFECHO DO NÚCLEO abaixo.
  let nucleoEntrou = false;
  try {
    await comLimiteDeCpu(() => {
      nucleoEntrou = true;
      iniciadoNucleo = Date.now();
      return criarContaEClinica({
        ...validado.dados,
        versaoTermo: VERSAO_TERMO,
        ip: ip ?? undefined,
        userAgent,
        headers: h,
      });
    });
  } catch (err) {
    if (!nucleoEntrou) {
      // NÃO CHEGOU AO NÚCLEO. Só o semáforo recusa aqui (fila cheia ou timeout
      // de espera), e essa decisão sai do estado de carga do processo, antes de
      // qualquer consulta ao banco — não do e-mail submetido. Logo é idêntica
      // para e-mail cadastrado e para e-mail livre, e pode ter corpo próprio
      // sem distinguir os dois.
      //
      // O teste é `nucleoEntrou`, e NÃO `err instanceof SemaforoSaturado`, de
      // propósito: se um dia algo mais passar a lançar antes do núcleo, ele cai
      // aqui por ser pré-núcleo, não por alguém ter lembrado de atualizar uma
      // lista.
      console.warn(
        "executarCadastro: recusado antes do núcleo:",
        descreverErro(err),
      );
      await respeitarPiso(iniciadoEm);
      return {
        error:
          "Não foi possível concluir o cadastro agora. Tente novamente em instantes.",
      };
    }

    // ── DESFECHO DO NÚCLEO — UNIFORME, SEM EXCEÇÃO ──────────────────────────
    //
    // TUDO que sai de `criarContaEClinica` colapsa no MESMO retorno do
    // sucesso: `CredencialInvalida`, `APIError` do Better-Auth, erro de driver
    // do Postgres, `throw` de string, e o erro que ainda não existe.
    //
    // Regra de CLASSE, não lista de casos conhecidos — a lista já falhou três
    // vezes nesta fatia. O mesmo Critical fechou em "conta completa" e
    // reapareceu em "conta incompleta"; fechou lá e virou canal de tempo;
    // fechou o tempo e voltou pelo CORPO. A instância que fechou a terceira
    // vez: senha com mais de 128 caracteres faz o Better-Auth lançar `APIError`
    // no sign-up (`maxPasswordLength`), mas o `password.verify` do ramo de
    // e-mail existente NÃO aplica esse teto — então e-mail novo devolvia corpo
    // de erro e e-mail existente devolvia corpo de sucesso. Um POST, um bit,
    // determinístico, imune ao piso de tempo e ao trabalho simétrico porque
    // nem chega a tocar scrypt.
    //
    // A linha que separa o que PODE ter corpo próprio: validação PRÉ-NÚCLEO
    // (`validarCadastro`) não olha o banco e não depende de o e-mail existir,
    // então reporta erro específico e útil. Qualquer desfecho DEPOIS do núcleo
    // depende, direta ou indiretamente, de o e-mail existir.
    //
    // CUSTO ACEITO, DECLARADO: uma falha real de infraestrutura passa a
    // responder "verifique seu e-mail" sem ter criado conta nenhuma — silêncio
    // para o usuário legítimo. A alternativa é devolver o oráculo. O
    // diagnóstico vai para o log do servidor, que é onde ele pertence.
    //
    // Só nome + código, NUNCA o objeto cru (rodada 1, achado M1): erro de
    // driver do Postgres carrega os parâmetros da query, ou seja e-mail do
    // titular e potencialmente hash de senha.
    if (err instanceof CredencialInvalida) {
      // #168: Notifica por e-mail transacional o titular da conta existente de que houve uma tentativa de cadastro.
      // O disparo roda em background (void ... catch) para preservar o piso de tempo e a resposta anti-enumeração.
      const baseUrl = getAppBaseUrl();
      const loginUrl = `${baseUrl}/login`;
      const esqueciSenhaUrl = `${baseUrl}/esqueci-senha`;
      const emailDestinatario = validado.dados.email.toLowerCase();
      const template = criarTemplateTentativaCadastroExistente({
        loginUrl,
        esqueciSenhaUrl,
      });

      void enviarEmailTransacional({
        para: emailDestinatario,
        assunto: template.assunto,
        texto: template.texto,
        html: template.html,
      }).catch((e) => {
        console.error(
          "executarCadastro: falha ao notificar conta existente:",
          e,
        );
      });
    } else {
      console.error(
        "executarCadastro: falha ao criar conta/clínica:",
        descreverErro(err),
      );
    }
  }

  await respeitarPiso(iniciadoNucleo);
  return {};
}
