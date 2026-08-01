import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { authDb } from "@/db/client";
import { appUser, clinic, professionalConsent, userRole } from "@/db/schema";
import { provisionUser } from "@/auth/provisioning";

/**
 * Lançado quando o e-mail já pertence a uma conta existente e a senha
 * enviada não comprova posse dela (review round 2, item Crítico). Zero
 * escrita acontece antes desta checagem. Contrato para quem chama (Task 7):
 * este erro e o "sucesso silencioso" de um e-mail novo/senha correta são os
 * únicos dois formatos que este módulo produz para o caminho de cadastro —
 * ver o comentário de `verificarPossePorSenha` para a tabela completa dos
 * três casos (e-mail novo / existente+senha certa / existente+senha errada)
 * e o que cada um devolve.
 */
export class CredencialInvalida extends Error {
  constructor() {
    super("cadastro: e-mail já cadastrado e a senha enviada não confere");
    this.name = "CredencialInvalida";
  }
}

export type EntradaCadastro = {
  email: string;
  senha: string;
  nome: string;
  nomeClinica: string;
  conselho: string;
  registroNumero: string;
  registroUf: string;
  versaoTermo: string;
  ip?: string;
  userAgent?: string;
};

export type ResultadoCadastro = { userId: string; clinicId: string };

/**
 * Cria conta + clínica no cadastro self-service (#163).
 *
 * NÃO É ATÔMICO, e isso é por limitação real: `provisionUser` chama
 * `auth.api.signUpEmail`, que roda no adapter do Better-Auth, fora de qualquer
 * transação nossa. Em vez de fingir atomicidade, a função é IDEMPOTENTE E
 * RETOMÁVEL: reentrar com o mesmo e-mail conclui o que faltou. Sem isso, uma
 * falha no meio deixaria o usuário sem clínica — beco sem saída em /sem-acesso,
 * com o e-mail do interessado já queimado.
 *
 * SEGURANÇA (review round 1, item Crítico): a definição de "falta completar"
 * NUNCA vem do que o chamador mandou — vem só do estado gravado. Uma conta já
 * completa (dados profissionais preenchidos + algum aceite registrado) não
 * sofre NENHUMA escrita nesta chamada, mesmo que o payload traga
 * conselho/registroNumero/registroUf/versaoTermo diferentes. Sem isso, alguém
 * que soubesse o e-mail de um profissional já cadastrado (e-mail não é
 * segredo) reenviaria o formulário com dados forjados e sobrescreveria o
 * registro dele, incluindo inserir um aceite de termos com IP/user-agent
 * arbitrários — que depois é IMUTÁVEL (professional_consent só aceita
 * SELECT/INSERT de iris_auth, ver migração 0058). Contrato para quem chama
 * (Task 7): se a conta já está completa, esta função devolve os ids
 * existentes e não sinaliza erro — decisão registrada no relatório da
 * task-5, não inventar aqui uma forma de erro "já existe" (isso é
 * responsabilidade da resposta anti-enumeração do Task 7).
 *
 * Quando a conta existe mas está INCOMPLETA (dados parciais ou nenhum
 * aceite), os campos já preenchidos NUNCA são sobrescritos — só o que está
 * `NULL` é completado (preencher é concluir um cadastro pendente; substituir
 * valor já gravado é edição sem autenticação, e esta função não autentica
 * ninguém no caminho de retomada — ver `provisionUser`, que para e-mail já
 * existente devolve o id sem checar senha).
 *
 * Estados parciais alcançáveis e como o retry resolve cada um (ver
 * task-5-report.md para o detalhe dos testes que cobrem cada caso):
 *
 * 1. Crash ANTES de `provisionUser` gravar `user_role` (app_user já existe —
 *    signUpEmail é side-effect do Better-Auth fora da nossa transação — mas o
 *    vínculo ainda não foi gravado): o retry NÃO encontra `vinculo`, então
 *    tenta criar uma clínica NOVA e chama `provisionUser` de novo — que
 *    reconhece o e-mail existente e só grava o `user_role` que faltava. Se
 *    `provisionUser` falhar depois de criada a clínica nova,
 *    `criarClinicaEVinculo` apaga a clínica órfã antes de propagar o erro
 *    (item 3 do review). Uma clínica órfã só sobrevive a um crash de
 *    processo real (kill no meio do `try`), não a um erro tratável — esse
 *    resíduo raro está registrado no BACKLOG.md (sessão desta rodada).
 * 2. Crash DEPOIS de `user_role` gravado mas ANTES de completar os dados
 *    declarados (conselho/registro) ou o aceite: o retry ENCONTRA o vínculo,
 *    então NÃO cria clínica nem usuário novos; `contaEstaCompleta` detecta o
 *    estado incompleto e `completarCadastro` preenche só os campos `NULL` e
 *    grava o aceite que faltava.
 * 3. Reentrada dupla (retry do cliente, ou duplo-clique) com tudo já
 *    completo: `contaEstaCompleta` devolve `true` e a função retorna sem
 *    escrever nada.
 * 4. Duas requisições CONCORRENTES para o mesmo e-mail nunca visto antes: a
 *    unicidade de `app_user.email` decide uma corrida — uma delas pode
 *    receber erro de violação de unicidade do Better-Auth em vez de sucesso.
 *    Não é resolvido por esta função (não há lock); o cliente que recebeu erro
 *    deve reenviar, e o reenvio cai no caminho normal de retomada (item 3).
 *    Duas requisições concorrentes de retomada (ambas encontram `vinculo`,
 *    ambas tentam gravar o aceite) são resolvidas pelo índice único da
 *    migração 0060 + `onConflictDoNothing`.
 */
export async function criarContaEClinica(
  entrada: EntradaCadastro,
): Promise<ResultadoCadastro> {
  // Normaliza como o Better-Auth normaliza ao gravar (sign-up.mjs:164,
  // `email.toLowerCase()`) — sem isso, "Foo@x.com" e "foo@x.com" não seriam
  // reconhecidos como o mesmo cadastro na retomada.
  const e: EntradaCadastro = { ...entrada, email: entrada.email.trim().toLowerCase() };

  const [existente] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, e.email))
    .limit(1);

  let userId: string;
  let clinicId: string;

  if (existente) {
    // SEGURANÇA (review round 2, item Crítico): o gate de "conta completa"
    // só protege contas já completas. Qualquer conta LEGADA (seed:clinic,
    // convite, ou qualquer coisa anterior à Fatia A) está incompleta por
    // definição — sem isso, um POST anônimo com o e-mail de alguém e
    // QUALQUER senha passava por `provisionUser` (que devolve o id sem
    // checar senha para e-mail existente), falhava o gate de completude e
    // gravava dados profissionais forjados + um aceite permanente. Fechado
    // aqui: nenhuma escrita no ramo `existente` acontece sem comprovar posse
    // da senha primeiro (ver `verificarPossePorSenha` — troca de mecanismo
    // no review round 3, item 1).
    await verificarPossePorSenha(existente.id, e.senha);

    // OWNERSHIP (review round 3, item 2 — defeito introduzido pelo próprio
    // fix do round 2): "o usuário tem ALGUM user_role" não é a mesma coisa
    // que "o usuário tem uma clínica para retomar". Antes deste fix, um
    // profissional pré-Fatia-A com papel NÃO-coordenador na clínica de
    // OUTRA pessoa (estado de toda conta legada: app_user incompleto,
    // clinic.responsavel_conta_id NULL) podia se auto-cadastrar no
    // formulário público com o próprio e-mail/senha (gate de senha passa
    // legitimamente), resolver `vinculo` para a clínica alheia, falhar o
    // gate de completude, e `completarCadastro` setava
    // `clinic.responsavel_conta_id` (dono de faturamento, schema.ts:239)
    // para ele numa clínica que não é dele — mais um `professional_consent`
    // IRREMOVÍVEL preso àquela clínica alheia.
    //
    // REGRA (decidida nesta rodada, cobre cada ramo com teste em
    // cadastro.int.test.ts): a retomada só pode mirar uma clínica que o
    // usuário JÁ é `coordenador` E que OU não tem dono ainda
    // (`responsavel_conta_id IS NULL` — clínica própria em cadastro
    // incompleto) OU o dono já é ele mesmo (retomada de verdade). Um vínculo
    // não-coordenador em clínica alheia NUNCA qualifica — mesmo que seja o
    // único vínculo que o usuário tem. `responsavel_conta_id` de uma clínica
    // que já tem OUTRO dono nunca é reatribuído por este caminho. Usuário
    // cujos únicos vínculos são papéis não-coordenador em clínicas de
    // terceiros cai no `else` abaixo e ganha uma clínica NOVA — que é
    // exatamente o que pedir cadastro self-service significa: virar
    // coordenador da PRÓPRIA clínica, não completar a clínica de outro.
    // Desempate determinístico (regressão do round 2) entre múltiplas
    // clínicas próprias qualificadas: prioriza a que já tem
    // `responsavel_conta_id = existente.id` (retomada real) sobre a que
    // ainda está `NULL` (cadastro solto pendente), depois `clinicId` como
    // critério estável.
    // NULL-SAFETY (achado durante esta rodada, não no review original):
    // `eq(clinic.responsavelContaId, existente.id)` avalia para SQL `NULL`
    // (não `false`) quando `responsavel_conta_id IS NULL` — comparação com
    // NULL nunca é `false` em SQL, é "desconhecido". Isso quebrava
    // silenciosamente o desempate: `ORDER BY ... DESC` do Postgres usa
    // `NULLS FIRST` por padrão, então a clínica NULL (pendente) vinha ANTES
    // da clínica realmente reivindicada (`= true`) — o oposto do que a regra
    // de ownership exige. `coalesce(..., false)` força um booleano de
    // verdade (nunca NULL), eliminando a ambiguidade de ordenação de NULL.
    // Descoberto pelo primeiro teste com dois vínculos coordenador-e-próprio
    // reais (item 4 desta rodada) — sem ele, este bug ficaria invisível.
    const [vinculo] = await authDb
      .select({ clinicId: userRole.clinicId })
      .from(userRole)
      .innerJoin(clinic, eq(clinic.id, userRole.clinicId))
      .where(
        and(
          eq(userRole.userId, existente.id),
          eq(userRole.papel, "coordenador"),
          or(
            isNull(clinic.responsavelContaId),
            eq(clinic.responsavelContaId, existente.id),
          ),
        ),
      )
      .orderBy(
        desc(sql`coalesce(${clinic.responsavelContaId} = ${existente.id}, false)`),
        asc(userRole.clinicId),
      )
      .limit(1);
    if (vinculo) {
      userId = existente.id;
      clinicId = vinculo.clinicId;
    } else {
      // Sem clínica própria qualificada: cria uma clínica NOVA e provisiona
      // (ou reaproveita, se app_user já existe) o vínculo de coordenador
      // nela. provisionUser é idempotente por e-mail: reconhece o app_user
      // existente e devolve o mesmo id, sem chamar signUpEmail de novo. Isto
      // também cobre a janela de crash original (item 1 da docstring acima
      // de `criarContaEClinica`): app_user existe, mas nenhum vínculo
      // coordenador-e-próprio foi gravado ainda.
      const criado = await criarClinicaEVinculo(e);
      userId = criado.userId;
      clinicId = criado.clinicId;
    }
  } else {
    const criado = await criarClinicaEVinculo(e);
    userId = criado.userId;
    clinicId = criado.clinicId;
  }

  // Gate de segurança: conta já completa não sofre NENHUMA escrita, mesmo
  // que o payload atual traga valores diferentes dos já gravados.
  if (await contaEstaCompleta(userId, clinicId)) {
    return { userId, clinicId };
  }

  await completarCadastro(userId, clinicId, e);

  return { userId, clinicId };
}

/**
 * Comprova posse da senha de um e-mail já existente ANTES de qualquer
 * escrita no ramo `existente` de `criarContaEClinica` (review round 2, item
 * Crítico; troca de mecanismo no review round 3, item 1).
 *
 * ROUND 2 usava `auth.api.signInEmail` — funcionava, mas tinha um problema
 * que só apareceu no review round 3: `auth.api.*` roda o handler do
 * endpoint DIRETO, pulando `auth.handler` (o dispatcher HTTP do
 * Better-Auth). Rate limiting, contador de falha, lockout e log de
 * tentativa do Better-Auth vivem no `auth.handler`, não no endpoint em si —
 * então nenhum deles rodava. Pior: em caso de senha certa, `signInEmail`
 * cria uma sessão real (`internalAdapter.createSession`) e, se a conta tem
 * 2FA habilitado, grava linha de verificação `2fa-*` — nenhum dos dois é
 * revogado, então cada retomada bem-sucedida deixava resíduo (sessão de 7
 * dias sem uso, linha de verificação órfã).
 *
 * ROUND 3 tentou `auth.api.verifyPassword` (sugestão do review) e
 * DESCARTOU: lendo `password.mjs` do Better-Auth, esse endpoint usa
 * `sensitiveSessionMiddleware` e só aceita `{ password }` no corpo — ele
 * verifica a senha do usuário JÁ AUTENTICADO na sessão atual
 * (`ctx.context.session.user.id`), não aceita e-mail, e portanto não serve
 * para provar posse de credencial de um e-mail anônimo/não autenticado.
 * Confirmado lendo o código-fonte do pacote instalado, não a partir de
 * memória.
 *
 * SOLUÇÃO ROUND 3: verificar a senha diretamente pelo mesmo primitivo que o
 * Better-Auth usa internamente (`context.password.verify`, contra o hash
 * gravado em `auth_account`, via `context.internalAdapter.findAccounts`),
 * acessado por `auth.$context` — a MESMA função que `validatePassword` (o
 * util interno que `verifyPassword` chama) usa, só que sem exigir uma
 * sessão prévia. Confirmado em `context/create-context.mjs`:
 * `context.password.verify` e `context.internalAdapter` existem
 * diretamente no objeto que `auth.$context` resolve — é o mesmo `ctx.context`
 * que qualquer endpoint do Better-Auth recebe. Isso:
 * - NÃO cria sessão (não chama `internalAdapter.createSession`);
 * - NÃO grava linha de verificação 2FA (não entra no fluxo de sign-in, que é
 *   o único lugar que aciona o plugin de 2FA);
 * - continua SEM passar por `auth.handler` — então a ressalva de rate
 *   limiting do Better-Auth do parágrafo acima PERSISTE: nem `signInEmail`
 *   nem este `context.password.verify` acionam o limitador do handler. A
 *   única proteção contra força bruta neste caminho é o que Task 6/7
 *   colocar no endpoint HTTP de cadastro — throttling dimensionado para
 *   cadastro (anti-enumeração), não para login (anti-força-bruta). Registrado
 *   como preocupação explícita no relatório desta rodada, não escondido
 *   como resolvido.
 *
 * Contrato para quem chama esta função (Task 5, este módulo) e para quem
 * consome o resultado de `criarContaEClinica` (Task 7, resposta HTTP
 * uniforme anti-enumeração) — os TRÊS casos que existem:
 *
 * 1. E-MAIL NOVO: nunca passa por aqui (este gate só roda dentro do `if
 *    (existente)`). `criarContaEClinica` cria conta+clínica e devolve
 *    `{ userId, clinicId }` normalmente — sem erro.
 * 2. E-MAIL EXISTENTE + SENHA CERTA: existe conta de credencial
 *    (`auth_account.provider_id === "credential"`) e o hash confere. Esta
 *    função retorna normalmente (sem lançar); `criarContaEClinica` segue
 *    para completar/retomar o cadastro, devolvendo `{ userId, clinicId }` —
 *    sem erro. (Diferente do round 2: `email_verified` não importa mais
 *    aqui — verificação direta de hash não depende dessa checagem, que só
 *    existe no fluxo de sign-in.)
 * 3. E-MAIL EXISTENTE + SENHA ERRADA (inclui conta sem credencial local —
 *    ex.: só OAuth — mesmo resultado): hash não confere ou não existe conta
 *    de credencial. Esta função lança `CredencialInvalida`, e NENHUMA
 *    escrita acontece — nem dados profissionais, nem `professional_consent`.
 *
 * Só os casos 1/2 (sucesso) e o caso 3 (`CredencialInvalida`) existem na
 * saída deste módulo. Task 7 só precisa mapear `CredencialInvalida` para a
 * mesma resposta genérica usada para qualquer outra falha (ex.: e-mail
 * inválido, rate limit) — sem mencionar que o e-mail já existe.
 */
/**
 * Hash fixo usado só para gastar o mesmo scrypt no ramo que não tem credencial
 * para conferir. Derivado sob demanda e memoizado por processo — a senha de
 * origem é irrelevante e nunca é comparada com nada de verdade; o valor existe
 * exclusivamente para dar trabalho equivalente a `password.verify`.
 */
let hashDummy: string | null = null;
let hashDummyEmVoo: Promise<string> | null = null;
/** Só para teste: descarta a memoização entre casos. */
export function __resetHashDummyParaTeste(): void {
  hashDummy = null;
  hashDummyEmVoo = null;
}
// Exportada para teste direto: a memoização é estado de MÓDULO e o modo de
// falha que interessa (envenenamento por rejeição) não é alcançável de fora
// sem derrubar o Better-Auth de propósito. `context` já é injetado, então a
// função é testável sem tocar em banco. Não é `"use server"` e não recebe
// `ctx` — fora do alcance da issue #55.
export async function hashDeComparacaoDummy(context: {
  password: { hash: (s: string) => Promise<string> };
}): Promise<string> {
  if (hashDummy !== null) return hashDummy;
  // MEMOIZA O VALOR RESOLVIDO, NÃO A PROMISE (rodada de correção 3). Memoizar
  // a promise envenena o processo inteiro se ela rejeitar uma única vez: toda
  // requisição seguinte para e-mail sem credencial passaria a lançar, o erro
  // subiria para `executarCadastro` e o corpo da resposta divergiria — ou seja,
  // exatamente o mesmo oráculo de enumeração, por outra porta. A promise em voo
  // ainda é compartilhada para não derivar N hashes sob concorrência, mas é
  // limpa no catch, então a próxima tentativa recomeça limpa.
  hashDummyEmVoo ??= context.password
    .hash("hash-de-comparacao-sem-uso-real-apenas-para-simetria-de-tempo")
    .catch((err: unknown) => {
      hashDummyEmVoo = null;
      throw err;
    });
  hashDummy = await hashDummyEmVoo;
  return hashDummy;
}

async function verificarPossePorSenha(
  userId: string,
  senha: string,
): Promise<void> {
  const context = await auth.$context;
  const contas = await context.internalAdapter.findAccounts(userId);
  const credencial = contas?.find((c) => c.providerId === "credential");

  if (!credencial?.password) {
    // TRABALHO SIMÉTRICO (rodada de correção 2 da Task 7, achado I1). Sem
    // isto, uma conta SEM credencial de senha — o estado de toda conta criada
    // por convite ou por seed — saía daqui antes de qualquer scrypt. Medido
    // contra Postgres real: 3 ms de p50, contra 60 ms do ramo "senha errada" e
    // 98 ms do ramo "e-mail novo". Um ramo 20x mais rápido que os outros é um
    // oráculo de "esta conta existe e nunca definiu senha", e nenhum piso de
    // tempo conserta isso — piso é curativo, trabalho igual é a defesa.
    // Verificação dummy contra um hash fixo, que é a técnica padrão de
    // endpoint de autenticação. O hash é derivado UMA vez por processo e
    // reaproveitado (a derivação em si é cara; a verificação é o que precisa
    // acontecer toda vez).
    await context.password.verify({
      hash: await hashDeComparacaoDummy(context),
      password: senha,
    });
    throw new CredencialInvalida();
  }

  const senhaConfere = await context.password.verify({
    hash: credencial.password,
    password: senha,
  });

  if (!senhaConfere) {
    throw new CredencialInvalida();
  }
}

/**
 * ESCOPOS MISTURADOS DE PROPÓSITO (esclarecido no review round 3, item 3 —
 * a versão anterior deste comentário simplificava demais dizendo "clínica
 * já completa não sofre escrita", o que ocultava que são dois escopos
 * diferentes combinados por AND):
 *
 * - `conselho`/`registroNumero`/`registroUf` são escopo GLOBAL DO USUÁRIO
 *   (`app_user`, sem `clinic_id`) — uma vez preenchidos, nunca são
 *   perguntados de novo em nenhuma clínica.
 * - o aceite de termos é escopo POR VÍNCULO (`professional_consent`, chave
 *   `(userId, clinicId)`) — cada clínica exige seu próprio aceite.
 *
 * `contaEstaCompleta` só devolve `true` quando AMBOS os escopos estão
 * satisfeitos PARA O `clinicId` resolvido. Consequência real, não teórica:
 * um usuário com dado profissional já preenchido (de uma clínica anterior)
 * que resolve, por `verificarPossePorSenha` + a regra de ownership do item
 * 2 acima, para OUTRA clínica seguramente sua (ex.: usuário legitimamente
 * dono de mais de uma clínica) onde ainda não existe aceite, PASSA pelo gate
 * (`contaEstaCompleta` devolve `false` porque falta o aceite NAQUELA
 * clínica) e `completarCadastro` roda — mas grava só o aceite que falta;
 * `conselho`/`registroNumero`/`registroUf` já preenchidos NÃO são
 * sobrescritos (ver o `patch` condicional em `completarCadastro`, abaixo).
 * Isso é coerente com a regra de ownership do item 2: só existe write path
 * para uma clínica que o usuário legitimamente possui, então misturar os
 * dois escopos aqui nunca abre uma escrita em clínica alheia — só decide
 * SE falta algo a completar na clínica própria já selecionada.
 * Deliberadamente NÃO depende de `versaoTermo` do payload atual — o
 * objetivo é impedir que um reenvio hostil (mesmo com uma versão de termo
 * diferente) grave um aceite novo ou sobrescreva dado já gravado; renovar
 * aceite para uma versão de termo nova é fluxo de outra tela (fora do
 * escopo desta função de cadastro).
 */
async function contaEstaCompleta(userId: string, clinicId: string): Promise<boolean> {
  const [user] = await authDb
    .select({
      conselho: appUser.conselho,
      registroNumero: appUser.registroNumero,
      registroUf: appUser.registroUf,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  if (
    !user ||
    user.conselho === null ||
    user.registroNumero === null ||
    user.registroUf === null
  ) {
    return false;
  }

  const [aceite] = await authDb
    .select({ id: professionalConsent.id })
    .from(professionalConsent)
    .where(
      and(
        eq(professionalConsent.userId, userId),
        eq(professionalConsent.clinicId, clinicId),
      ),
    )
    .limit(1);

  return !!aceite;
}

/**
 * Completa um cadastro incompleto: preenche só os campos `NULL` de
 * `app_user`/`clinic.responsavel_conta_id` (nunca sobrescreve valor já
 * gravado) e grava o aceite de termos que faltar, pelo único caminho que
 * escreve em `professional_consent` (`gravarAceite`, abaixo).
 */
async function completarCadastro(
  userId: string,
  clinicId: string,
  e: EntradaCadastro,
): Promise<void> {
  const [user] = await authDb
    .select({
      conselho: appUser.conselho,
      registroNumero: appUser.registroNumero,
      registroUf: appUser.registroUf,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  const patch: Partial<{
    conselho: string;
    registroNumero: string;
    registroUf: string;
  }> = {};
  if (user?.conselho === null) patch.conselho = e.conselho;
  if (user?.registroNumero === null) patch.registroNumero = e.registroNumero;
  if (user?.registroUf === null) patch.registroUf = e.registroUf;

  if (Object.keys(patch).length > 0) {
    await authDb.update(appUser).set(patch).where(eq(appUser.id, userId));
  }

  const [c] = await authDb
    .select({ responsavelContaId: clinic.responsavelContaId })
    .from(clinic)
    .where(eq(clinic.id, clinicId))
    .limit(1);

  if (c && c.responsavelContaId === null) {
    await authDb
      .update(clinic)
      .set({ responsavelContaId: userId })
      .where(eq(clinic.id, clinicId));
  }

  await gravarAceite(userId, clinicId, e);
}

/** Cria a clínica e provisiona (ou reaproveita) o usuário coordenador dela. */
async function criarClinicaEVinculo(
  e: EntradaCadastro,
): Promise<ResultadoCadastro> {
  const [nova] = await authDb
    .insert(clinic)
    .values({ nome: e.nomeClinica })
    .returning({ id: clinic.id });
  const clinicId = nova!.id;

  try {
    const { userId } = await provisionUser({
      email: e.email,
      nome: e.nome,
      senha: e.senha,
      clinicId,
      papel: "coordenador",
    });

    return { userId, clinicId };
  } catch (err) {
    // provisionUser falhou (ex.: signUpEmail recusou a senha) — a clínica
    // recém-criada não tem dono nem vínculo; apaga para não deixar órfã
    // (item 3 do review). Se o processo morrer aqui dentro do try em vez de
    // lançar (kill real), a clínica sobrevive órfã — resíduo raro, registrado
    // no BACKLOG.md.
    try {
      await authDb.delete(clinic).where(eq(clinic.id, clinicId));
    } catch {
      // best-effort: se a exclusão também falhar, a clínica fica órfã —
      // mesmo resíduo raro documentado acima.
    }
    throw err;
  }
}

/**
 * Confere que existe vínculo (`user_role`) entre `userId` e `clinicId` antes
 * de permitir a gravação do aceite (`professional_consent`).
 *
 * Necessário porque a policy de INSERT de `professional_consent` para
 * `iris_auth` é `WITH CHECK (true)` (migração 0058, de propósito — ver
 * comentário lá): o banco NÃO valida que `clinic_id`/`user_id` são coerentes
 * entre si. Essa validação é responsabilidade da aplicação — é o que esta
 * função faz, e falha ruidosamente (em vez de gravar um aceite apontando
 * para uma clínica sem relação com o usuário) se a coerência não se sustenta.
 */
export async function garantirVinculoParaConsentimento(
  userId: string,
  clinicId: string,
): Promise<void> {
  const [vinculo] = await authDb
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(and(eq(userRole.userId, userId), eq(userRole.clinicId, clinicId)))
    .limit(1);

  if (!vinculo) {
    throw new Error(
      `cadastro: usuário ${userId} não tem vínculo (user_role) com a clínica ${clinicId} — recusando gravar aceite de termos (professional_consent) para evitar registro incoerente.`,
    );
  }
}

/**
 * Único caminho que grava em `professional_consent` (review round 1, item
 * 7): a checagem de vínculo deixa de ser um passo separado e opcional para
 * virar parte estrutural do único jeito de inserir um aceite. `select`
 * prévio + `onConflictDoNothing` contra o índice único da migração 0060
 * cobrem tanto retomada serial (não duplica) quanto duas retomadas
 * concorrentes (o índice decide, a segunda não lança).
 */
async function gravarAceite(
  userId: string,
  clinicId: string,
  e: EntradaCadastro,
): Promise<void> {
  await garantirVinculoParaConsentimento(userId, clinicId);

  const [aceiteExistente] = await authDb
    .select({ id: professionalConsent.id })
    .from(professionalConsent)
    .where(
      and(
        eq(professionalConsent.userId, userId),
        eq(professionalConsent.clinicId, clinicId),
        eq(professionalConsent.versaoTermo, e.versaoTermo),
      ),
    )
    .limit(1);

  if (!aceiteExistente) {
    await authDb
      .insert(professionalConsent)
      .values({
        userId,
        clinicId,
        versaoTermo: e.versaoTermo,
        ip: e.ip,
        userAgent: e.userAgent,
      })
      .onConflictDoNothing();
  }
}
