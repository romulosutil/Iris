/**
 * Integração — criarContaEClinica (Fatia A, #163, Task 5).
 *
 * Núcleo do cadastro self-service: idempotente e retomável. Reentrar com o
 * mesmo e-mail conclui o que faltou em vez de duplicar ou travar — ver
 * docstring de src/auth/cadastro.ts para o porquê (provisionUser roda fora de
 * qualquer transação nossa).
 *
 * Isolamento (review round 1, item 5): nada de TRUNCATE de tabela
 * compartilhada — cada teste registra os e-mails que criou e o afterEach
 * limpa só essas contas (professional_consent -> user_role -> clinic ->
 * auth_account -> app_user), pela conexão `owner` quando o grant de
 * `iris_auth` não permite (professional_consent é INSERT/SELECT-only).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// cadastro.ts (e provisioning.ts, que ele importa) usam "server-only" — pacote
// inexistente fora do bundler do Next. Stub, mesmo padrão de provisioning.int.test.ts.
vi.mock("server-only", () => ({}));

const {
  criarContaEClinica,
  garantirVinculoParaConsentimento,
  CredencialInvalida,
} = await import("./cadastro");
const { provisionUser } = await import("@/auth/provisioning");
const { authDb, authSql, sql: appSql } = await import("@/db/client");
const { appUser, clinic, professionalConsent, userRole } =
  await import("@/db/schema");

let owner: ReturnType<typeof postgres>;

const base = {
  senha: "Senha Forte 123",
  nome: "Aline Teste",
  nomeClinica: "Clínica Teste",
  conselho: "crp",
  registroNumero: "06/123456",
  registroUf: "SP",
  versaoTermo: "2026-07-30",
};

let emailsCriados: string[] = [];
let clinicsAvulsas: string[] = [];

function emailUnico(sufixo: string): string {
  const email = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}${sufixo}@exemplo.com.br`;
  emailsCriados.push(email);
  return email;
}

async function limparContaPorEmail(email: string): Promise<void> {
  const [u] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!u) return;

  // Junta clínicas alcançáveis por dois caminhos: vínculo ativo (user_role) e
  // clínicas ÓRFÃS que a própria retomada às vezes cria (docstring de
  // cadastro.ts, item 1 — o vínculo antigo pode ter sido apagado pelo teste
  // simulando um crash, mas clinic.responsavel_conta_id ainda aponta pro
  // usuário). Sem os dois, sobra clínica presa por FK e o delete de
  // app_user falha.
  const clinicIds = new Set<string>();
  const viaVinculo = await authDb
    .select({ clinicId: userRole.clinicId })
    .from(userRole)
    .where(eq(userRole.userId, u.id));
  for (const v of viaVinculo) clinicIds.add(v.clinicId);

  const viaResponsavel = await authDb
    .select({ id: clinic.id })
    .from(clinic)
    .where(eq(clinic.responsavelContaId, u.id));
  for (const c of viaResponsavel) clinicIds.add(c.id);

  // professional_consent é imutável para iris_auth (só SELECT/INSERT,
  // migração 0058) — a limpeza de teste precisa da conexão dona.
  await owner`DELETE FROM professional_consent WHERE user_id = ${u.id}`;

  for (const id of clinicIds) {
    await owner`UPDATE clinic SET responsavel_conta_id = NULL WHERE id = ${id}`;
  }
  await authDb.delete(userRole).where(eq(userRole.userId, u.id));
  for (const id of clinicIds) {
    await owner`DELETE FROM clinic WHERE id = ${id}`;
  }

  await owner`DELETE FROM auth_account WHERE user_id = ${u.id}`;
  await authDb.delete(appUser).where(eq(appUser.id, u.id));
}

describe.skipIf(!hasDb)(
  "criarContaEClinica — núcleo do cadastro self-service",
  () => {
    beforeAll(() => {
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    });

    afterAll(async () => {
      await owner?.end();
      await authSql.end();
      await appSql.end();
    });

    afterEach(async () => {
      for (const email of emailsCriados) {
        await limparContaPorEmail(email);
      }
      emailsCriados = [];

      for (const clinicId of clinicsAvulsas) {
        await owner`DELETE FROM clinic WHERE id = ${clinicId}`;
      }
      clinicsAvulsas = [];
    });

    it("cria usuário coordenador da clínica nova, com aceite registrado", async () => {
      const email = emailUnico("a");
      const { userId, clinicId } = await criarContaEClinica({ ...base, email });

      const papeis = await authDb
        .select()
        .from(userRole)
        .where(eq(userRole.userId, userId));
      expect(papeis).toHaveLength(1);
      expect(papeis[0]!.papel).toBe("coordenador");
      expect(papeis[0]!.clinicId).toBe(clinicId);

      const aceites = await authDb
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.userId, userId));
      expect(aceites).toHaveLength(1);
      expect(aceites[0]!.versaoTermo).toBe("2026-07-30");
      expect(aceites[0]!.clinicId).toBe(clinicId);

      const [user] = await authDb
        .select()
        .from(appUser)
        .where(eq(appUser.id, userId));
      expect(user!.conselho).toBe("crp");
      expect(user!.registroNumero).toBe("06/123456");
      expect(user!.registroUf).toBe("SP");

      const [c] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, clinicId));
      expect(c!.responsavelContaId).toBe(userId);
    });

    it("é retomável: reentrar com o mesmo e-mail não duplica clínica nem vínculo", async () => {
      const email = emailUnico("b");
      const a = await criarContaEClinica({ ...base, email });
      const b = await criarContaEClinica({ ...base, email });

      expect(b.userId).toBe(a.userId);
      expect(b.clinicId).toBe(a.clinicId);

      const papeis = await authDb
        .select()
        .from(userRole)
        .where(eq(userRole.userId, a.userId));
      expect(papeis).toHaveLength(1);

      const clinicas = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, a.clinicId));
      expect(clinicas).toHaveLength(1);

      // Reentrar também não duplica o aceite (mesma versão do termo).
      const aceites = await authDb
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.userId, a.userId));
      expect(aceites).toHaveLength(1);
    });

    it("é normalizado por e-mail: maiúsculas/espaços não abrem cadastro duplicado", async () => {
      const email = emailUnico("norm");
      const a = await criarContaEClinica({ ...base, email });
      const b = await criarContaEClinica({
        ...base,
        email: `  ${email.toUpperCase()}  `,
      });

      expect(b.userId).toBe(a.userId);
      expect(b.clinicId).toBe(a.clinicId);

      const contas = await authDb
        .select()
        .from(appUser)
        .where(eq(appUser.email, email));
      expect(contas).toHaveLength(1);
    });

    it("NÃO inicia o trial no cadastro — o relógio só dispara no 1º paciente", async () => {
      // #175: antes, `trial_comeco_em` era `NOT NULL DEFAULT now()` e o trial
      // começava a correr no signup, contra quem ainda estava configurando a
      // clínica. Agora nasce `NULL` ("cadastrou, ainda sem 1º paciente") e é
      // `app_iniciar_trial()`, no cadastro do primeiro paciente, quem grava.
      const email = emailUnico("c");
      const { clinicId } = await criarContaEClinica({ ...base, email });
      const [c] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, clinicId));
      expect(c!.trialDias).toBe(7);
      expect(c!.trialComecoEm).toBeNull();
      // Conta nova nunca é legado isento: ela entra no relógio, só não começou.
      expect(c!.isentoTrial).toBe(false);
    });

    it("retomada completa o que faltou: conta criada mas aceite/dados pendentes é concluído no retry", async () => {
      const email = emailUnico("d");
      const primeira = await criarContaEClinica({ ...base, email });

      // Simula um crash ENTRE o vínculo (user_role) e a conclusão (aceite +
      // dados profissionais): apaga o aceite e limpa os campos declarados,
      // como se o processo tivesse morrido logo após provisionUser().
      await authDb
        .update(appUser)
        .set({ conselho: null, registroNumero: null, registroUf: null })
        .where(eq(appUser.id, primeira.userId));
      // professional_consent é imutável para iris_auth (só SELECT/INSERT,
      // migração 0058) — a exclusão simulando o crash só é possível via a
      // conexão dona (owner), fora do caminho que a aplicação usa.
      await owner`DELETE FROM professional_consent WHERE user_id = ${primeira.userId}`;

      const retry = await criarContaEClinica({ ...base, email });
      expect(retry.userId).toBe(primeira.userId);
      expect(retry.clinicId).toBe(primeira.clinicId);

      const [user] = await authDb
        .select()
        .from(appUser)
        .where(eq(appUser.id, primeira.userId));
      expect(user!.conselho).toBe("crp");
      expect(user!.registroNumero).toBe("06/123456");
      expect(user!.registroUf).toBe("SP");

      const aceites = await authDb
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.userId, primeira.userId));
      expect(aceites).toHaveLength(1);
    });

    it("cria uma clínica nova (e deixa a anterior órfã) quando o e-mail já existe mas ainda não tem vínculo — janela entre signUpEmail e user_role", async () => {
      const email = emailUnico("e");
      const primeira = await criarContaEClinica({ ...base, email });

      // Simula crash ANTES do user_role ter sido gravado (janela dentro de
      // provisionUser, entre signUpEmail e o insert de user_role): o app_user
      // existe, mas o vínculo não.
      await authDb.delete(userRole).where(eq(userRole.userId, primeira.userId));

      const retry = await criarContaEClinica({ ...base, email });
      expect(retry.userId).toBe(primeira.userId);

      const papeis = await authDb
        .select()
        .from(userRole)
        .where(eq(userRole.userId, primeira.userId));
      expect(papeis).toHaveLength(1);

      // A retomada de fato cria uma clínica NOVA nesta janela (documentado na
      // docstring de cadastro.ts, item 1 — a clínica da tentativa anterior fica
      // órfã, não reaproveitada). Escopado às duas clínicas que este teste
      // conhece (não a contagem global de `clinic` — review round 2, regressão:
      // contar a tabela inteira só era verde porque test:rls roda serial).
      expect(retry.clinicId).not.toBe(primeira.clinicId);
      const [clinicaOrfa] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, primeira.clinicId));
      expect(clinicaOrfa).toBeDefined();
      const [clinicaNova] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, retry.clinicId));
      expect(clinicaNova).toBeDefined();

      const clinicasComVinculo = await authDb
        .select({ clinicId: userRole.clinicId })
        .from(userRole)
        .where(eq(userRole.userId, primeira.userId));
      expect(clinicasComVinculo).toHaveLength(1);
      expect(clinicasComVinculo[0]!.clinicId).toBe(retry.clinicId);
    });

    it("recusa gravar aceite apontando para clínica sem vínculo com o usuário (professional_consent WITH CHECK(true) não valida isso — a aplicação precisa)", async () => {
      const email = emailUnico("f");
      const { userId } = await criarContaEClinica({ ...base, email });

      const [outra] = await authDb
        .insert(clinic)
        .values({ nome: "Clínica Alheia" })
        .returning({ id: clinic.id });
      clinicsAvulsas.push(outra!.id);

      await expect(
        garantirVinculoParaConsentimento(userId, outra!.id),
      ).rejects.toThrow();

      // Confere que a clínica alheia realmente não tem vínculo com o usuário.
      const vinculo = await authDb
        .select()
        .from(userRole)
        .where(
          and(eq(userRole.userId, userId), eq(userRole.clinicId, outra!.id)),
        );
      expect(vinculo).toHaveLength(0);
    });

    it("CRÍTICO: conta já completa não é sobrescrita por reenvio hostil com dados/versão de termo diferentes", async () => {
      const email = emailUnico("g");
      const primeira = await criarContaEClinica({ ...base, email });

      // "Reenvio hostil": o próprio dono da conta (ou alguém que sabe a senha
      // certa — `base.senha`, reaproveitada aqui) reenvia o formulário com
      // dados profissionais diferentes e uma versão de termo diferente. Mesmo
      // comprovando posse da senha (review round 2 — gate de
      // `verificarPossePorSenha`), o gate de completude por estado gravado
      // (round 1) segue impedindo a sobrescrita: conta já completa não sofre
      // NENHUMA escrita, senha certa ou não. O caso de senha ERRADA contra
      // conta INCOMPLETA (o ataque que não exige senha nenhuma) está coberto
      // no teste "CRÍTICO" seguinte.
      const hostil = await criarContaEClinica({
        ...base,
        email,
        conselho: "crm",
        registroNumero: "FORJADO-999",
        registroUf: "RJ",
        versaoTermo: "2099-01-01-versao-forjada",
        ip: "203.0.113.66",
        userAgent: "forjado",
      });

      expect(hostil.userId).toBe(primeira.userId);
      expect(hostil.clinicId).toBe(primeira.clinicId);

      const [user] = await authDb
        .select()
        .from(appUser)
        .where(eq(appUser.id, primeira.userId));
      // Dado profissional original deve permanecer intacto — nada sobrescrito.
      expect(user!.conselho).toBe("crp");
      expect(user!.registroNumero).toBe("06/123456");
      expect(user!.registroUf).toBe("SP");

      const aceites = await authDb
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.userId, primeira.userId));
      // Nenhum aceite novo (forjado) deve ter sido gravado — continua só o
      // original, com a versão de termo original.
      expect(aceites).toHaveLength(1);
      expect(aceites[0]!.versaoTermo).toBe("2026-07-30");
      expect(aceites[0]!.ip).not.toBe("203.0.113.66");

      // Round 3, item 4: reenvio hostil também não cria clínica nova nenhuma —
      // o usuário continua com exatamente um vínculo, na mesma clínica.
      const vinculos = await authDb
        .select()
        .from(userRole)
        .where(eq(userRole.userId, primeira.userId));
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0]!.clinicId).toBe(primeira.clinicId);
    });

    it("CRÍTICO: e-mail de conta LEGADA (incompleta, sem aceite) + senha errada não escreve nada", async () => {
      // Conta "legada": provisionada fora do cadastro self-service (mesmo
      // caminho de seed:clinic/convite — provisionUser direto), sem passar
      // por criarContaEClinica. conselho/registroNumero/registroUf ficam NULL
      // e não existe professional_consent — exatamente o estado que o review
      // round 2 apontou como o alvo real do Crítico: `contaEstaCompleta`
      // devolve false pra qualquer conta assim, legada ou não.
      const email = emailUnico("h");
      const senhaDaConta = "Senha Legado 123";
      const [clinicaLegado] = await authDb
        .insert(clinic)
        .values({ nome: "Clínica Legado" })
        .returning({ id: clinic.id });

      const { userId } = await provisionUser({
        email,
        nome: "Legado Teste",
        senha: senhaDaConta,
        clinicId: clinicaLegado!.id,
        papel: "coordenador",
      });

      // Anônimo: sabe o e-mail (não é segredo) mas NÃO sabe a senha da conta.
      await expect(
        criarContaEClinica({
          ...base,
          email,
          senha: "senha-do-atacante-errada",
          conselho: "crm",
          registroNumero: "FORJADO-999",
          registroUf: "RJ",
          versaoTermo: "2099-01-01-versao-forjada",
          ip: "203.0.113.66",
          userAgent: "forjado",
        }),
      ).rejects.toBeInstanceOf(CredencialInvalida);

      // Nenhum dado profissional forjado foi gravado — os campos continuam
      // exatamente como a conta legada os deixou: NULL.
      const [user] = await authDb
        .select()
        .from(appUser)
        .where(eq(appUser.id, userId));
      expect(user!.conselho).toBeNull();
      expect(user!.registroNumero).toBeNull();
      expect(user!.registroUf).toBeNull();

      // Nenhum aceite (professional_consent é imutável — se tivesse sido
      // gravado, seria permanente) foi criado.
      const aceites = await authDb
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.userId, userId));
      expect(aceites).toHaveLength(0);

      // A clínica legada não ganhou responsável forjado.
      const [c] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, clinicaLegado!.id));
      expect(c!.responsavelContaId).toBeNull();
    });

    it("retomada com senha CERTA contra conta legada completa de fato o cadastro (caminho feliz, antes descoberto sem teste)", async () => {
      // Round 3, item 4: até esta rodada, nenhum teste comprovava o caminho
      // feliz inteiro do gate de senha — só o caminho de rejeição
      // (CredencialInvalida). Este teste prova que uma conta legada,
      // legitimamente dona da sua própria clínica (coordenador, clínica ainda
      // sem responsável), retomada com a senha CERTA, é de fato completada.
      const email = emailUnico("i1");
      const senhaDaConta = "Senha Legado Certa 123";
      const [clinicaLegado] = await authDb
        .insert(clinic)
        .values({ nome: "Clínica Legado Certa" })
        .returning({ id: clinic.id });

      const { userId } = await provisionUser({
        email,
        nome: "Legado Certa Teste",
        senha: senhaDaConta,
        clinicId: clinicaLegado!.id,
        papel: "coordenador",
      });

      const resultado = await criarContaEClinica({
        ...base,
        email,
        senha: senhaDaConta,
      });

      expect(resultado.userId).toBe(userId);
      expect(resultado.clinicId).toBe(clinicaLegado!.id);

      const [user] = await authDb
        .select()
        .from(appUser)
        .where(eq(appUser.id, userId));
      expect(user!.conselho).toBe(base.conselho);
      expect(user!.registroNumero).toBe(base.registroNumero);
      expect(user!.registroUf).toBe(base.registroUf);

      const aceites = await authDb
        .select()
        .from(professionalConsent)
        .where(eq(professionalConsent.userId, userId));
      expect(aceites).toHaveLength(1);
      expect(aceites[0]!.clinicId).toBe(clinicaLegado!.id);

      const [c] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, clinicaLegado!.id));
      expect(c!.responsavelContaId).toBe(userId);
    });

    it("CRÍTICO: usuário com mais de um vínculo coordenador-e-próprio resolve deterministicamente para a clínica JÁ REIVINDICADA (review round 3, item 1 do fix anterior sem proteção de mutação — item 4 desta rodada)", async () => {
      // Constrói dois vínculos coordenador+próprio qualificados para o mesmo
      // usuário: clínica A pendente (responsavel_conta_id NULL, criada
      // PRIMEIRO) e clínica B já reivindicada (responsavel_conta_id = o
      // próprio usuário, criada DEPOIS). Sem o `orderBy` que prioriza
      // "responsavel_conta_id = eu mesmo", a varredura sem ordenação explícita
      // tende a devolver a linha inserida primeiro (clínica A) — o oposto do
      // que a regra de ownership do item 2 exige. É essa a garantia que este
      // teste prova por mutação (ver task-5-report.md, round 4, para a saída
      // RED capturada ao remover o `.orderBy(...)` e restaurada em seguida).
      const email = emailUnico("i2");
      const senha = "Senha MultiClinica 123";

      const [clinicaA] = await authDb
        .insert(clinic)
        .values({ nome: "Clínica A (pendente)" })
        .returning({ id: clinic.id });
      const { userId } = await provisionUser({
        email,
        nome: "Multi Clínica",
        senha,
        clinicId: clinicaA!.id,
        papel: "coordenador",
      });

      const [clinicaB] = await authDb
        .insert(clinic)
        .values({ nome: "Clínica B (reivindicada)" })
        .returning({ id: clinic.id });
      await provisionUser({
        email,
        nome: "Multi Clínica",
        senha,
        clinicId: clinicaB!.id,
        papel: "coordenador",
      });
      // Simula que B já foi reivindicada (completada por outro caminho antes
      // desta retomada) — é a clínica que a retomada DEVE escolher.
      await authDb
        .update(clinic)
        .set({ responsavelContaId: userId })
        .where(eq(clinic.id, clinicaB!.id));

      const retomada = await criarContaEClinica({
        ...base,
        email,
        senha,
        nomeClinica: "ignorado nesta retomada",
      });

      expect(retomada.userId).toBe(userId);
      expect(retomada.clinicId).toBe(clinicaB!.id);

      // Clínica A pendente não foi tocada — sem aceite, sem responsável.
      const [aInalterada] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, clinicaA!.id));
      expect(aInalterada!.responsavelContaId).toBeNull();
      const aceitesA = await authDb
        .select()
        .from(professionalConsent)
        .where(
          and(
            eq(professionalConsent.userId, userId),
            eq(professionalConsent.clinicId, clinicaA!.id),
          ),
        );
      expect(aceitesA).toHaveLength(0);
    });

    it("CRÍTICO: vínculo NÃO-coordenador em clínica alheia nunca é retomado — cadastro self-service ganha clínica NOVA (review round 3, item 2, ramo 1/2)", async () => {
      // Estado de toda conta legada pré-Fatia-A que atua como terapeuta (não
      // coordenador) na clínica de outra pessoa. Antes do fix, este era
      // exatamente o vínculo que `criarContaEClinica` resolvia por engano —
      // com senha própria e correta, o gate de posse passava legitimamente, e
      // a função escrevia dados profissionais + aceite + responsavel_conta_id
      // na clínica ALHEIA.
      const email = emailUnico("j");
      const senha = "Senha Terapeuta 123";

      const [clinicaAlheia] = await authDb
        .insert(clinic)
        .values({ nome: "Clínica Alheia (terapeuta convidado)" })
        .returning({ id: clinic.id });
      const { userId } = await provisionUser({
        email,
        nome: "Terapeuta Convidado",
        senha,
        clinicId: clinicaAlheia!.id,
        papel: "terapeuta",
      });

      const resultado = await criarContaEClinica({ ...base, email, senha });

      expect(resultado.userId).toBe(userId);
      expect(resultado.clinicId).not.toBe(clinicaAlheia!.id);

      // Clínica alheia jamais ganha responsável nem aceite forjado.
      const [alheiaInalterada] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, clinicaAlheia!.id));
      expect(alheiaInalterada!.responsavelContaId).toBeNull();
      const aceitesAlheia = await authDb
        .select()
        .from(professionalConsent)
        .where(
          and(
            eq(professionalConsent.userId, userId),
            eq(professionalConsent.clinicId, clinicaAlheia!.id),
          ),
        );
      expect(aceitesAlheia).toHaveLength(0);

      // O vínculo terapeuta original continua intacto (não removido nem
      // alterado) — só um vínculo coordenador NOVO foi adicionado.
      const vinculos = await authDb
        .select()
        .from(userRole)
        .where(eq(userRole.userId, userId));
      expect(vinculos).toHaveLength(2);
      const vinculoAlheio = vinculos.find(
        (v) => v.clinicId === clinicaAlheia!.id,
      );
      expect(vinculoAlheio?.papel).toBe("terapeuta");
      const vinculoNovo = vinculos.find(
        (v) => v.clinicId === resultado.clinicId,
      );
      expect(vinculoNovo?.papel).toBe("coordenador");
    });

    it("CRÍTICO: vínculo coordenador em clínica já reivindicada por OUTRO usuário nunca reatribui responsavel_conta_id — ganha clínica NOVA (review round 3, item 2, ramo 2/2)", async () => {
      // Estado corrompido/de arestas: usuário tem papel "coordenador" numa
      // clínica cujo responsavel_conta_id já é OUTRO usuário (não deveria
      // acontecer no fluxo normal, mas a regra de ownership precisa recusar
      // mesmo este caso, não só o de responsavel_conta_id NULL de outrem).
      const emailDono = emailUnico("k-dono");
      const senhaDono = "Senha Dono Real 123";
      const donoResultado = await criarContaEClinica({
        ...base,
        email: emailDono,
        senha: senhaDono,
        nomeClinica: "Clínica do Dono Real",
      });

      const email = emailUnico("k");
      const senha = "Senha Coordenador Fantasma 123";
      // Mesma clínica do dono real, mas com um SEGUNDO "coordenador" —
      // inserido direto (fora de provisionUser) para simular o estado
      // corrompido sem depender de uma regra de negócio que hoje o impede.
      const { userId } = await provisionUser({
        email,
        nome: "Coordenador Fantasma",
        senha,
        clinicId: donoResultado.clinicId,
        papel: "coordenador",
      });

      const resultado = await criarContaEClinica({ ...base, email, senha });

      expect(resultado.userId).toBe(userId);
      expect(resultado.clinicId).not.toBe(donoResultado.clinicId);

      // A clínica do dono real continua com o dono real — não reatribuída.
      const [clinicaDoDono] = await authDb
        .select()
        .from(clinic)
        .where(eq(clinic.id, donoResultado.clinicId));
      expect(clinicaDoDono!.responsavelContaId).toBe(donoResultado.userId);
    });
  },
);
