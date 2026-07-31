import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
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
    // da senha primeiro, pelo caminho de sign-in do Better-Auth (não
    // comparamos hash nós mesmos).
    await verificarPossePorSenha(e.email, e.senha);

    // Determinístico (review round 2, regressão): antes escolhia com
    // `limit(1)` sem `order by` — não determinístico para usuário com mais
    // de um `user_role`, podia selecionar a clínica errada e reabrir o gate
    // de completude para uma conta já completa (na OUTRA clínica). Critério:
    // prioriza o vínculo em que o usuário é "coordenador" (papel do
    // cadastro self-service), com `clinicId` como desempate estável. Para um
    // usuário genuinamente multi-clínica (estado real do produto — ex.:
    // profissional que atua em duas clínicas), esta função sempre resolve
    // para o MESMO vínculo em toda retomada, mas não necessariamente para a
    // clínica que o cadastro atual pretendia completar; isso é aceitável
    // porque o gate de completude abaixo é por (userId, clinicId) — se a
    // clínica escolhida já está completa, nada é escrito, e a clínica
    // "outra" continua exigindo seu próprio fluxo de completude (não coberto
    // por este endpoint, que é de cadastro inicial, não de vínculo
    // adicional).
    const [vinculo] = await authDb
      .select({ clinicId: userRole.clinicId })
      .from(userRole)
      .where(eq(userRole.userId, existente.id))
      .orderBy(desc(eq(userRole.papel, "coordenador")), asc(userRole.clinicId))
      .limit(1);

    if (vinculo) {
      userId = existente.id;
      clinicId = vinculo.clinicId;
    } else {
      // app_user existe (signUpEmail já rodou numa tentativa anterior) mas o
      // vínculo não foi gravado — retoma criando o vínculo que faltou.
      // provisionUser é idempotente por e-mail: reconhece o app_user
      // existente e devolve o mesmo id, sem chamar signUpEmail de novo.
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
 * Crítico). Usa `auth.api.signInEmail` — o caminho de sign-in do próprio
 * Better-Auth — em vez de comparar hash de senha aqui (instrução explícita
 * do review: "não tocar hash você mesmo").
 *
 * Contrato para quem chama esta função (Task 5, este módulo) e para quem
 * consome o resultado de `criarContaEClinica` (Task 7, resposta HTTP
 * uniforme anti-enumeração) — os TRÊS casos que existem:
 *
 * 1. E-MAIL NOVO: nunca passa por aqui (este gate só roda dentro do `if
 *    (existente)`). `criarContaEClinica` cria conta+clínica e devolve
 *    `{ userId, clinicId }` normalmente — sem erro.
 * 2. E-MAIL EXISTENTE + SENHA CERTA: `auth.api.signInEmail` ou resolve (senha
 *    certa, e-mail já verificado) ou lança `APIError` com
 *    `body.code === "EMAIL_NOT_VERIFIED"` — a verificação de senha, no
 *    Better-Auth, roda ANTES da checagem de e-mail verificado (confirmado em
 *    `sign-in.mjs`), então esse erro específico já significa posse
 *    comprovada. Em ambos os sub-casos, esta função retorna normalmente
 *    (sem lançar) e `criarContaEClinica` segue para completar/retomar o
 *    cadastro, devolvendo `{ userId, clinicId }` — sem erro.
 * 3. E-MAIL EXISTENTE + SENHA ERRADA (inclui e-mail desconhecido para o
 *    Better-Auth ou conta sem credencial local — mesmo código de erro):
 *    `auth.api.signInEmail` lança `APIError` com
 *    `body.code === "INVALID_EMAIL_OR_PASSWORD"`. Esta função relança como
 *    `CredencialInvalida`, e NENHUMA escrita acontece — nem dados
 *    profissionais, nem `professional_consent`.
 *
 * Só os casos 1/2 (sucesso) e o caso 3 (`CredencialInvalida`) existem na
 * saída deste módulo. Task 7 só precisa mapear `CredencialInvalida` para a
 * mesma resposta genérica usada para qualquer outra falha (ex.: e-mail
 * inválido, rate limit) — sem mencionar que o e-mail já existe. Este módulo
 * não decide o formato HTTP; só garante que os dois casos são
 * distinguíveis (sucesso vs. erro) sem depender de qual dos três motivos
 * originou o erro.
 *
 * Efeito colateral aceito: uma chamada bem-sucedida a `signInEmail` cria uma
 * sessão real no Better-Auth (via `internalAdapter.createSession`) — não é
 * revogada aqui. Documentado, não tratado como bug: é sessão do próprio
 * dono da conta, criada só quando a senha confere.
 */
async function verificarPossePorSenha(
  email: string,
  senha: string,
): Promise<void> {
  try {
    await auth.api.signInEmail({ body: { email, password: senha } });
  } catch (err) {
    if (err instanceof APIError && err.body?.code === "EMAIL_NOT_VERIFIED") {
      return;
    }
    throw err instanceof APIError && err.body?.code === "INVALID_EMAIL_OR_PASSWORD"
      ? new CredencialInvalida()
      : err;
  }
}

/**
 * Uma conta é "completa" quando os dados profissionais declarados estão
 * todos preenchidos E já existe pelo menos um aceite de termos registrado
 * para o vínculo usuário/clínica. Deliberadamente NÃO depende de
 * `versaoTermo` do payload atual — o objetivo é impedir que um reenvio
 * hostil (mesmo com uma versão de termo diferente) grave um aceite novo ou
 * sobrescreva dado já gravado; renovar aceite para uma versão de termo nova
 * é fluxo de outra tela (fora do escopo desta função de cadastro).
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
