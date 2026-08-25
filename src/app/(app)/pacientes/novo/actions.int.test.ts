import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { hasDb } from "@tests/integration-env";

// O núcleo testável vive em ./logic (server-only, sem "use server"). Neutraliza
// o side-effect de server-only e importa dinamicamente só o núcleo.
vi.mock("server-only", () => ({}));
const { criarPacienteEConsent } = await import("./logic");
const { withTenant } = await import("@/db/rls");
const { sql: appSql } = await import("@/db/client");
const { patient, consent } = await import("@/db/schema");

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const U_ADMIN = "a0000000-0000-0000-0000-000000000004";
let owner: ReturnType<typeof postgres>;

// #191 — CPF passou a ser obrigatório. Cada teste abaixo precisa do SEU
// PRÓPRIO CPF matematicamente válido (Módulo 11): a clínica tem
// `uq_patient_clinic_cpf`, então dois cadastros de TITULAR ADULTO com o mesmo
// CPF na mesma clínica colidiriam e o teste falharia por unique_violation, não
// pelo motivo que ele afirma testar. Lista gerada e conferida contra o
// algoritmo de `validarEMaterializarCPF` — não são CPFs "de exemplo"
// reaproveitados de um único valor.
//
// `responsavel_cpf` NÃO tem unique (ver o teste dos irmãos lá embaixo), então
// ali repetir é legítimo e proposital.
const CPFS = [
  "10000000019",
  "10000013773",
  "10000027480",
  "10000041122",
  "10000054887",
  "10000068594",
  "10000082236",
  "10000095990",
  "10000109614",
  "10000123366",
  "10000137073",
  "10000150762",
  "10000164470",
  "10000178187",
  "10000191876",
  "10000205508",
  "10000219207",
  "10000232904",
  "10000246603",
  "10000260355",
  "10000274062",
  "10000287717",
  "10000301485",
  "10000315192",
  "10000328847",
  "10000342599",
  "10000356204",
  "10000369950",
  "10000383600",
  "10000397300",
] as const;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe.skipIf(!hasDb)("criarPacienteEConsent", () => {
  beforeAll(async () => {
    owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
    await owner`TRUNCATE clinic, app_user, user_role, patient, consent RESTART IDENTITY CASCADE`;
    await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'Clínica A')`;
    await owner`INSERT INTO app_user (id, name, email) VALUES (${U_ADMIN}, 'Admin', 'admin@a.test')`;
    await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES (${U_ADMIN}, ${CLINIC_A}, 'admin_recepcao')`;
    // Gate de cobrança (#36): a partir da migração 0071, cadastrar paciente
    // exige assinatura ativa. Estes testes são sobre cadastro + consent, não
    // sobre billing, então a clínica entra já paga. A cobertura do gate em si
    // (bloqueio em free_tier/setup_pending) fica no bloco no fim do arquivo.
    await owner`INSERT INTO subscription (clinic_id, status, provider) VALUES (${CLINIC_A}, 'active', 'asaas')
                ON CONFLICT (clinic_id) DO UPDATE SET status = 'active'`;
  });
  afterAll(async () => {
    await owner?.end();
    await appSql.end();
  });

  const ctx = {
    clinicId: CLINIC_A,
    userId: U_ADMIN,
    role: "admin_recepcao",
  } as const;

  test("admin_recepcao cadastra paciente + consent na mesma transação", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Paciente Teste",
        tipoConsentimento: "responsavel_legal",
        responsavelSignatario: "Mãe do Paciente",
        responsavelCpf: CPFS[0],
        clinicalModality: "protocol_driven",
      }),
    );
    expect(result.error).toBeUndefined();
    const [p] = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.id, result.id!)),
    );
    expect(p).toBeDefined();
    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, result.id!)),
    );
    expect(consentimentos).toHaveLength(1);
    expect(consentimentos[0]!.tipo).toBe("tratamento_dados_menor");
    expect(consentimentos[0]!.responsavelSignatario).toBe("Mãe do Paciente");
    expect(consentimentos[0]!.versaoTermo).toBe("v1");
  });

  test("nome vazio retorna erro sem gravar nada", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "  ",
        tipoConsentimento: "responsavel_legal",
        responsavelSignatario: "Mãe",
      }),
    );
    expect(result.error).toMatch(/Nome/);
  });

  test("responsavel_legal sem responsavelSignatario retorna erro (consent obrigatório antes do paciente)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Outro Paciente",
        tipoConsentimento: "responsavel_legal",
        responsavelCpf: CPFS[1],
      }),
    );
    expect(result.error).toMatch(/responsável/i);
    const encontrados = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.nome, "Outro Paciente")),
    );
    expect(encontrados).toHaveLength(0);
  });

  // ─── #100 — titular adulto autoconsentindo ────────────────────────────────

  test("titular_adulto grava tipo novo com responsavelSignatario NULL", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Adulto Autoconsente",
        tipoConsentimento: "titular_adulto",
        cpf: CPFS[2],
        clinicalModality: "protocol_driven",
      }),
    );
    expect(result.error).toBeUndefined();
    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, result.id!)),
    );
    expect(consentimentos).toHaveLength(1);
    expect(consentimentos[0]!.tipo).toBe("autoconsentimento_titular_adulto");
    expect(consentimentos[0]!.responsavelSignatario).toBeNull();
    expect(consentimentos[0]!.versaoTermo).toBe("adulto-v1");
  });

  test("titular_adulto COM responsável preenchido retorna erro e não grava nada", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Adulto Com Responsavel",
        tipoConsentimento: "titular_adulto",
        responsavelSignatario: "Mãe Indevida",
        cpf: CPFS[3],
      }),
    );
    expect(result.error).toMatch(
      /titular adulto não deve informar responsável/i,
    );
    const encontrados = await withTenant(ctx, (db) =>
      db
        .select()
        .from(patient)
        .where(eq(patient.nome, "Adulto Com Responsavel")),
    );
    expect(encontrados).toHaveLength(0);
  });

  test("tipoConsentimento ausente retorna erro (sem default silencioso)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "Sem Tipo", responsavelSignatario: "Mãe" }),
    );
    expect(result.error).toMatch(/quem assina o consentimento/i);
    const encontrados = await withTenant(ctx, (db) =>
      db.select().from(patient).where(eq(patient.nome, "Sem Tipo")),
    );
    expect(encontrados).toHaveLength(0);
  });

  test("tipoConsentimento inválido retorna erro", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({ nome: "Tipo Invalido", tipoConsentimento: "curatela" }),
    );
    expect(result.error).toMatch(/quem assina o consentimento/i);
  });

  test("nascimento de menor com titular_adulto NÃO bloqueia (emancipação existe)", async () => {
    const result = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Menor Emancipado",
        nascimento: "2012-05-10",
        tipoConsentimento: "titular_adulto",
        cpf: CPFS[4],
        clinicalModality: "protocol_driven",
      }),
    );
    expect(result.error).toBeUndefined();
    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, result.id!)),
    );
    expect(consentimentos[0]!.tipo).toBe("autoconsentimento_titular_adulto");
  });

  // #203, fatia 2: o cadastro deixou de prescrever. Disciplina e carga foram
  // para a ficha clínica, onde nascem com vigência própria (SCD2) e são o teto
  // que a equipe consome. Os casos abaixo substituem os três que exercitavam a
  // gravação de alvo aqui — e falham contra o código anterior, que gravava.
  test("cadastro NÃO grava prescrição (é ato clínico, não cadastral)", async () => {
    const res = await criarPacienteEConsent(
      ctx,
      form({
        nome: "Bruna",
        tipoConsentimento: "responsavel_legal",
        responsavelSignatario: "Mãe da Bruna",
        responsavelCpf: CPFS[5],
        clinicalModality: "protocol_driven",
      }),
    );
    expect(res.error).toBeUndefined();
    expect(res.id).toBeTruthy();
    const alvos = await owner`
      SELECT 1 FROM patient_alvo_disciplina WHERE patient_id = ${res.id!}`;
    expect(alvos).toHaveLength(0);
  });

  test("campo de alvo em formulário antigo é IGNORADO, não gravado", async () => {
    // Um formulário em cache ainda pode mandar `alvoDisciplina`. Aceitar criaria
    // prescrição pelo caminho velho, sem histórico — e a divergência só
    // apareceria na barra de cobertura semanas depois.
    const fd = new FormData();
    fd.set("nome", "Form Antigo");
    fd.set("tipoConsentimento", "responsavel_legal");
    fd.set("responsavelSignatario", "Pai");
    fd.set("responsavelCpf", CPFS[6]);
    fd.set("clinicalModality", "protocol_driven");
    fd.append("alvoDisciplina", "aba");
    fd.append("alvoHorasSemana", "12.0");
    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();
    const alvos = await owner`
      SELECT 1 FROM patient_alvo_disciplina WHERE patient_id = ${res.id!}`;
    expect(alvos).toHaveLength(0);
  });

  test("horas inválidas no formulário antigo não bloqueiam o cadastro", async () => {
    // Antes, `alvoHorasSemana: "abc"` derrubava a transação inteira e o
    // paciente não era criado. Agora o cadastro é 100% cadastral: um campo
    // órfão de uma versão antiga da tela não pode impedir a recepção de
    // cadastrar quem já está na porta.
    const fd = new FormData();
    fd.set("nome", "Horas Orfas");
    fd.set("tipoConsentimento", "responsavel_legal");
    fd.set("responsavelSignatario", "Mãe");
    fd.set("responsavelCpf", CPFS[7]);
    fd.set("clinicalModality", "protocol_driven");
    fd.append("alvoDisciplina", "aba");
    fd.append("alvoHorasSemana", "abc");
    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();
    const encontrados = await owner`
      SELECT 1 FROM patient WHERE nome = 'Horas Orfas'`;
    expect(encontrados).toHaveLength(1);
  });

  // ─── #140 — consentimento por finalidade (IA e exportação) ─────────────────

  test("grava consentimentos de finalidade (uso_ia_processamento e exportacao_relatorios) na mesma transação quando marcados", async () => {
    const fd = new FormData();
    fd.set("nome", "Paciente Com IA e Exportacao");
    fd.set("tipoConsentimento", "titular_adulto");
    fd.set("cpf", CPFS[8]);
    fd.set("consentimentoIa", "on");
    fd.set("consentimentoExportacao", "on");
    fd.set("clinicalModality", "protocol_driven");

    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();
    expect(res.id).toBeTruthy();

    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, res.id!)),
    );
    expect(consentimentos).toHaveLength(3);

    const tipos = consentimentos.map((c) => c.tipo);
    expect(tipos).toContain("autoconsentimento_titular_adulto");
    expect(tipos).toContain("uso_ia_processamento");
    expect(tipos).toContain("exportacao_relatorios");

    // Para titular adulto, responsavelSignatario é NULL nas finalidades também
    const ia = consentimentos.find((c) => c.tipo === "uso_ia_processamento")!;
    expect(ia.responsavelSignatario).toBeNull();
    expect(ia.versaoTermo).toBe("adulto-v1");

    const exp = consentimentos.find((c) => c.tipo === "exportacao_relatorios")!;
    expect(exp.responsavelSignatario).toBeNull();
    expect(exp.versaoTermo).toBe("adulto-v1");
  });

  test("grava consentimentos de finalidade com responsável legal quando menor", async () => {
    const fd = new FormData();
    fd.set("nome", "Menor Com IA");
    fd.set("tipoConsentimento", "responsavel_legal");
    fd.set("responsavelSignatario", "Pai do Menor");
    fd.set("responsavelCpf", CPFS[9]);
    fd.set("consentimentoIa", "on");
    fd.set("clinicalModality", "protocol_driven");

    const res = await criarPacienteEConsent(ctx, fd);
    expect(res.error).toBeUndefined();

    const consentimentos = await withTenant(ctx, (db) =>
      db.select().from(consent).where(eq(consent.patientId, res.id!)),
    );
    expect(consentimentos).toHaveLength(2);

    const ia = consentimentos.find((c) => c.tipo === "uso_ia_processamento")!;
    expect(ia.responsavelSignatario).toBe("Pai do Menor");
    expect(ia.versaoTermo).toBe("v1");
  });
  // ── Situação da conta (#163+#159) ───────────────────────────────────────
  // O cadastro do 1º paciente é o gatilho do RELÓGIO, não da cobrança: ele
  // passa sem cartão e dispara o trial. Quem bloqueia é o fim do teste — e o
  // bloqueio é somente-leitura, não "assine para começar".
  //
  // Estes casos são a inversão explícita dos que existiam aqui antes, quando
  // `free_tier` e `setup_pending` recusavam o cadastro. Aquela recusa era o
  // deadlock: o gate rodava ANTES de `app_iniciar_trial()`, então o trial nunca
  // começava para ninguém.
  describe("situação da conta", () => {
    async function porStatus(status: string) {
      await owner`UPDATE subscription SET status = ${status}::subscription_status WHERE clinic_id = ${CLINIC_A}`;
    }
    /** Empurra o relógio para trás o bastante para o trial ter vencido. */
    async function expirarTrial() {
      await owner`UPDATE clinic SET trial_comeco_em = now() - interval '90 days' WHERE id = ${CLINIC_A}`;
    }
    async function reiniciarTrial() {
      await owner`UPDATE clinic SET trial_comeco_em = now() WHERE id = ${CLINIC_A}`;
    }

    afterAll(async () => {
      await porStatus("active");
      await reiniciarTrial();
    });

    test("free_tier com trial vigente CADASTRA e grava trial_comeco_em", async () => {
      await porStatus("free_tier");
      await owner`UPDATE clinic SET trial_comeco_em = NULL WHERE id = ${CLINIC_A}`;

      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Do Trial",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[10],
          clinicalModality: "protocol_driven",
        }),
      );

      expect(res.bloqueioConta).toBeUndefined();
      expect(res.id).toBeTruthy();
      // O relógio disparou na MESMA transação do cadastro.
      const clinica =
        await owner`SELECT trial_comeco_em FROM clinic WHERE id = ${CLINIC_A}`;
      expect(clinica[0]!.trial_comeco_em).not.toBeNull();
    });

    test("2º paciente ainda em free_tier também passa", async () => {
      await porStatus("free_tier");
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Segundo Paciente",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[11],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.bloqueioConta).toBeUndefined();
      expect(res.id).toBeTruthy();
    });

    test("setup_pending durante o trial passa — ativar não pode piorar a situação", async () => {
      await porStatus("setup_pending");
      await reiniciarTrial();
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Ativando",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[12],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.bloqueioConta).toBeUndefined();
      expect(res.id).toBeTruthy();
    });

    test("trial expirado em free_tier bloqueia e NÃO grava paciente nenhum", async () => {
      await porStatus("free_tier");
      await expirarTrial();
      const antes =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;

      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Pos Trial",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[13],
          clinicalModality: "protocol_driven",
        }),
      );

      expect(res.id).toBeUndefined();
      expect(res.bloqueioConta?.estado).toBe("trial_expirado");
      // A transação inteira reverteu: nem paciente, nem consent.
      const depois =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
      expect(depois[0]!.n).toBe(antes[0]!.n);
    });

    test("trial expirado em setup_pending vira pagamento_em_processamento", async () => {
      await porStatus("setup_pending");
      await expirarTrial();
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Pagando",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[14],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.id).toBeUndefined();
      expect(res.bloqueioConta?.estado).toBe("pagamento_em_processamento");
    });

    test("canceled bloqueia mesmo com trial nominalmente vigente", async () => {
      await porStatus("canceled");
      await reiniciarTrial();
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Cancelado",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[15],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.id).toBeUndefined();
      expect(res.bloqueioConta?.estado).toBe("cancelada");
    });

    test("past_due NÃO bloqueia — inadimplência não tranca prontuário", async () => {
      await porStatus("past_due");
      await expirarTrial();
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Em Atraso",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPFS[16],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.bloqueioConta).toBeUndefined();
      expect(res.id).toBeTruthy();
    });

    test("clínica isenta (legado pré-cobrança) passa mesmo com trial vencido", async () => {
      await porStatus("free_tier");
      await expirarTrial();
      await owner`UPDATE clinic SET isento_trial = true WHERE id = ${CLINIC_A}`;
      try {
        const res = await criarPacienteEConsent(
          ctx,
          form({
            nome: "Paciente Legado",
            tipoConsentimento: "responsavel_legal",
            responsavelSignatario: "Mãe",
            responsavelCpf: CPFS[17],
            clinicalModality: "protocol_driven",
          }),
        );
        expect(res.bloqueioConta).toBeUndefined();
        expect(res.id).toBeTruthy();
      } finally {
        await owner`UPDATE clinic SET isento_trial = false WHERE id = ${CLINIC_A}`;
      }
    });
  });

  // ─── #191 — CPF obrigatório + antifraude de trial ──────────────────────────
  // Oráculo é o BANCO lido pela role dona (`owner`), nunca só `res.error`/
  // `res.id`: um retorno "amigável" e um banco que não bate são exatamente o
  // tipo de teste verde que não testa nada (ver histórico do projeto).
  describe("#191 — CPF obrigatório e antifraude de trial", () => {
    async function contarPacientes(clinicId: string) {
      const linhas =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${clinicId}`;
      return linhas[0]!.n as number;
    }

    test("CPF com dígito verificador errado: erro menciona CPF e nada é gravado", async () => {
      const antes = await contarPacientes(CLINIC_A);
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "CPF Invalido",
          tipoConsentimento: "titular_adulto",
          // 52998224725 é válido (Módulo 11); troquei o último dígito.
          cpf: "52998224724",
        }),
      );
      expect(res.error).toMatch(/CPF/i);
      expect(res.id).toBeUndefined();
      expect(await contarPacientes(CLINIC_A)).toBe(antes);
    });

    test("titular_adulto sem CPF retorna erro", async () => {
      const antes = await contarPacientes(CLINIC_A);
      const res = await criarPacienteEConsent(
        ctx,
        form({ nome: "Adulto Sem CPF", tipoConsentimento: "titular_adulto" }),
      );
      expect(res.error).toMatch(/CPF/i);
      expect(res.id).toBeUndefined();
      expect(await contarPacientes(CLINIC_A)).toBe(antes);
    });

    test("responsavel_legal sem responsavelCpf retorna erro", async () => {
      const antes = await contarPacientes(CLINIC_A);
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Menor Sem CPF Do Responsavel",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
        }),
      );
      expect(res.error).toMatch(/CPF/i);
      expect(res.id).toBeUndefined();
      expect(await contarPacientes(CLINIC_A)).toBe(antes);
    });

    test("CPF com máscara é aceito e gravado sanitizado (sem pontuação)", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "CPF Mascarado",
          tipoConsentimento: "titular_adulto",
          cpf: "529.982.247-25",
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`SELECT cpf FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.cpf).toBe("52998224725");
    });

    test("titular_adulto grava cpf e deixa responsavel_cpf NULL", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Titular Coluna Certa",
          tipoConsentimento: "titular_adulto",
          cpf: CPFS[18],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT cpf, responsavel_cpf FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.cpf).toBe(CPFS[18]);
      expect(linhas[0]!.responsavel_cpf).toBeNull();
    });

    test("responsavel_legal grava responsavel_cpf e deixa cpf NULL", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Responsavel Coluna Certa",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Pai",
          responsavelCpf: CPFS[19],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT cpf, responsavel_cpf FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.responsavel_cpf).toBe(CPFS[19]);
      expect(linhas[0]!.cpf).toBeNull();
    });

    /**
     * Trava de regressão da assimetria entre as duas colunas.
     *
     * A spec da issue pedia `UNIQUE(clinic_id, cpf)` "(ou `responsavel_cpf`)",
     * e a primeira implementação criou os dois. Isso quebra um caso comum e
     * legítimo: irmãos em terapia na mesma clínica compartilham o CPF do
     * responsável, então o cadastro do 2º filho batia em unique_violation e
     * era rejeitado como "CPF já cadastrado". Em TEA irmãos são frequentes
     * (herdabilidade alta) — não é borda.
     *
     * A regra: unicidade só vale onde o CPF identifica o PACIENTE (titular
     * adulto). No menor o CPF é de OUTRA pessoa e se repete por natureza.
     *
     * Sem este teste, restaurar o `unique()` em `responsavel_cpf` no
     * `schema.ts` passa despercebido — o resto da suíte fica verde.
     */
    test("irmãos: mesmo responsável cadastra 2 filhos na mesma clínica", async () => {
      const cpfDoResponsavel = CPFS[24];

      const primeiro = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Irmão Mais Velho",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe Dos Dois",
          responsavelCpf: cpfDoResponsavel,
          clinicalModality: "protocol_driven",
        }),
      );
      expect(primeiro.error).toBeUndefined();
      expect(primeiro.id).toBeTruthy();

      const segundo = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Irmão Mais Novo",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe Dos Dois",
          responsavelCpf: cpfDoResponsavel,
          clinicalModality: "protocol_driven",
        }),
      );
      expect(segundo.error).toBeUndefined();
      expect(segundo.id).toBeTruthy();

      // Oráculo no banco, não no retorno: as DUAS linhas existem, com o mesmo
      // CPF de responsável.
      const linhas = await owner`
        SELECT count(*)::int AS n FROM patient
         WHERE clinic_id = ${CLINIC_A} AND responsavel_cpf = ${cpfDoResponsavel}`;
      expect(linhas[0]!.n).toBe(2);
    });

    test("CPF duplicado na mesma clínica retorna erro amigável (23505 traduzido)", async () => {
      const primeiro = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Primeiro Com Este CPF",
          tipoConsentimento: "titular_adulto",
          cpf: CPFS[20],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(primeiro.error).toBeUndefined();

      const segundo = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Segundo Com Mesmo CPF",
          tipoConsentimento: "titular_adulto",
          cpf: CPFS[20],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(segundo.error).toBe("Este CPF já está cadastrado nesta clínica.");
      expect(segundo.id).toBeUndefined();

      const linhas = await owner`
        SELECT count(*)::int AS n FROM patient
        WHERE clinic_id = ${CLINIC_A} AND cpf = ${CPFS[20]}`;
      expect(linhas[0]!.n).toBe(1);
    });

    // ── Caso central da issue: fraude de trial via hash cego de CPF ──────────
    describe("antifraude de trial entre clínicas", () => {
      const CLINIC_COM_TRIAL = "22222222-2222-2222-2222-222222222222";
      const CLINIC_SEM_TRIAL = "33333333-3333-3333-3333-333333333333";
      const CLINIC_ALVO_AGUARDANDO = "44444444-4444-4444-4444-444444444444";
      const CLINIC_ALVO_ATIVA = "55555555-5555-5555-5555-555555555555";
      const CPF_JA_USADO_EM_TRIAL = CPFS[21];
      const CPF_NUNCA_USADO_EM_TRIAL = CPFS[22];
      const CPF_PARA_ALVO_ATIVA = CPFS[23];

      function ctxPara(clinicId: string) {
        return { clinicId, userId: U_ADMIN, role: "admin_recepcao" } as const;
      }

      beforeAll(async () => {
        const { gerarCpfHash } = await import("@/lib/security/cpf-hash");

        // Clínica que JÁ iniciou o trial (`trial_comeco_em` NOT NULL) com um
        // paciente cujo CPF vai ser reaproveitado nos testes abaixo. Trial
        // "consumido" é exatamente o que `app_cpf_hash_usado_em_outro_trial`
        // enxerga — não importa se o cadastro passou pelo fluxo normal ou foi
        // inserido direto pela role dona, a função só olha `patient.cpf_hash`
        // + `clinic.trial_comeco_em`.
        await owner`INSERT INTO clinic (id, nome, trial_comeco_em)
          VALUES (${CLINIC_COM_TRIAL}, 'Clínica Com Trial Iniciado', now())`;
        await owner`INSERT INTO patient (clinic_id, nome, cpf, cpf_hash)
          VALUES (${CLINIC_COM_TRIAL}, 'Titular Origem', ${CPF_JA_USADO_EM_TRIAL},
                  ${gerarCpfHash(CPF_JA_USADO_EM_TRIAL)})`;
        await owner`INSERT INTO patient (clinic_id, nome, cpf, cpf_hash)
          VALUES (${CLINIC_COM_TRIAL}, 'Titular Origem Ativa', ${CPF_PARA_ALVO_ATIVA},
                  ${gerarCpfHash(CPF_PARA_ALVO_ATIVA)})`;

        // Contraprova (g): clínica que NUNCA iniciou o trial
        // (`trial_comeco_em IS NULL`) — o CPF dela não pode contar como fraude.
        await owner`INSERT INTO clinic (id, nome)
          VALUES (${CLINIC_SEM_TRIAL}, 'Clínica Sem Trial Iniciado')`;
        await owner`INSERT INTO patient (clinic_id, nome, cpf, cpf_hash)
          VALUES (${CLINIC_SEM_TRIAL}, 'Titular Sem Trial', ${CPF_NUNCA_USADO_EM_TRIAL},
                  ${gerarCpfHash(CPF_NUNCA_USADO_EM_TRIAL)})`;

        // Clínica nova, 1º cadastro pendente (`trial_aguardando`): alvo dos
        // testes (f) e (g).
        await owner`INSERT INTO clinic (id, nome)
          VALUES (${CLINIC_ALVO_AGUARDANDO}, 'Clínica Alvo Aguardando')`;

        // Clínica nova, mas já FORA de `trial_aguardando` (assinatura ativa):
        // alvo do teste (h) — a checagem só roda no cadastro que inicia o
        // relógio, então esta clínica passa mesmo usando o CPF "usado".
        await owner`INSERT INTO clinic (id, nome)
          VALUES (${CLINIC_ALVO_ATIVA}, 'Clínica Alvo Ativa')`;
        await owner`INSERT INTO subscription (clinic_id, status, provider)
          VALUES (${CLINIC_ALVO_ATIVA}, 'active', 'asaas')`;
      });

      test("(f) clínica em trial_aguardando bloqueada por CPF já usado em trial de OUTRA clínica — nada é gravado", async () => {
        const antes = await contarPacientes(CLINIC_ALVO_AGUARDANDO);
        const res = await criarPacienteEConsent(
          ctxPara(CLINIC_ALVO_AGUARDANDO),
          form({
            nome: "Fraude De Trial",
            tipoConsentimento: "titular_adulto",
            cpf: CPF_JA_USADO_EM_TRIAL,
            clinicalModality: "protocol_driven",
          }),
        );
        expect(res.id).toBeUndefined();
        expect(res.bloqueioConta?.estado).toBe("trial_bloqueado_fraude");
        // O rollback é PARTE da regra: um cadastro bloqueado não pode deixar
        // rastro parcial (nem paciente, nem consent).
        expect(await contarPacientes(CLINIC_ALVO_AGUARDANDO)).toBe(antes);
      });

      test("(g) contraprova: CPF de clínica que NUNCA iniciou trial não bloqueia", async () => {
        const res = await criarPacienteEConsent(
          ctxPara(CLINIC_ALVO_AGUARDANDO),
          form({
            nome: "Sem Fraude De Trial",
            tipoConsentimento: "titular_adulto",
            cpf: CPF_NUNCA_USADO_EM_TRIAL,
            clinicalModality: "protocol_driven",
          }),
        );
        expect(res.bloqueioConta).toBeUndefined();
        expect(res.id).toBeTruthy();
      });

      test("(h) contraprova: clínica já fora de trial_aguardando (assinatura ativa) passa mesmo com CPF usado em trial alheio", async () => {
        const res = await criarPacienteEConsent(
          ctxPara(CLINIC_ALVO_ATIVA),
          form({
            nome: "Ativa Sem Checagem De Trial",
            tipoConsentimento: "titular_adulto",
            cpf: CPF_PARA_ALVO_ATIVA,
            clinicalModality: "protocol_driven",
          }),
        );
        expect(res.bloqueioConta).toBeUndefined();
        expect(res.id).toBeTruthy();
      });
    });
  });

  // ─── #387 — modalidade clínica ─────────────────────────────────────────────
  // Espectro Brutal: novos CPFs isolados dos usados acima (`CPFS`), gerados
  // com seed própria (Módulo 11 conferido) para não colidir com
  // `uq_patient_clinic_cpf`.
  describe("#387 — modalidade clínica", () => {
    const CPF_MODALIDADE = [
      "98765000153",
      "98765000404",
      "98765000749",
      "98765001044",
      "98765001397",
      "98765001630",
      "98765001982",
      "98765002288",
    ] as const;

    test("clinicalModality protocol_driven grava no banco (oráculo é o SELECT, não o retorno)", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Protocolo",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPF_MODALIDADE[0],
          clinicalModality: "protocol_driven",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT clinical_modality FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.clinical_modality).toBe("protocol_driven");
    });

    test("clinicalModality cognitive_behavioral (TCC) grava no banco", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente TCC",
          tipoConsentimento: "titular_adulto",
          cpf: CPF_MODALIDADE[1],
          clinicalModality: "cognitive_behavioral",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT clinical_modality FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.clinical_modality).toBe("cognitive_behavioral");
    });

    test("clinicalModality conventional grava no banco", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Convencional",
          tipoConsentimento: "titular_adulto",
          cpf: CPF_MODALIDADE[2],
          clinicalModality: "conventional",
          familiaAbordagem: "psicodinamica",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT clinical_modality FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.clinical_modality).toBe("conventional");
    });

    test("clinicalModality ausente retorna erro (sem default silencioso) e não grava nada", async () => {
      const antes =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Sem Modalidade",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPF_MODALIDADE[3],
        }),
      );
      expect(res.error).toMatch(/modalidade clínica/i);
      expect(res.id).toBeUndefined();
      const depois =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
      expect(depois[0]!.n).toBe(antes[0]!.n);
    });

    test("clinicalModality vazio retorna erro", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Modalidade Vazia",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPF_MODALIDADE[4],
          clinicalModality: "",
        }),
      );
      expect(res.error).toMatch(/modalidade clínica/i);
      expect(res.id).toBeUndefined();
    });

    test("clinicalModality inválido (fora do enum) retorna erro", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Modalidade Invalida",
          tipoConsentimento: "responsavel_legal",
          responsavelSignatario: "Mãe",
          responsavelCpf: CPF_MODALIDADE[5],
          clinicalModality: "aba_avulsa",
        }),
      );
      expect(res.error).toMatch(/modalidade clínica/i);
      expect(res.id).toBeUndefined();
    });

    // ── R3 — gate de consentimento por modalidade (paciente adulto) ──────────
    // Mesma derivação de idade que já alimenta `avisoDivergencia` no
    // formulário (hoje só aviso não-bloqueante). Regra NOVA: adulto em TCC ou
    // convencional SEM `titular_adulto` bloqueia a criação — defesa em
    // profundidade, o client já desabilita o submit no mesmo caso.
    describe("R3 — gate de consentimento (paciente adulto)", () => {
      test("adulto + cognitive_behavioral (TCC) sem titular_adulto REJEITA e não grava nada", async () => {
        const antes =
          await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
        const res = await criarPacienteEConsent(
          ctx,
          form({
            nome: "Adulto TCC Sem Titular",
            nascimento: "1990-01-01",
            tipoConsentimento: "responsavel_legal",
            responsavelSignatario: "Curador",
            responsavelCpf: CPF_MODALIDADE[6],
            clinicalModality: "cognitive_behavioral",
          }),
        );
        expect(res.error).toMatch(
          /adulto em tcc ou terapia convencional exige consentimento do próprio titular/i,
        );
        expect(res.id).toBeUndefined();
        const depois =
          await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
        expect(depois[0]!.n).toBe(antes[0]!.n);
      });

      test("adulto + conventional sem titular_adulto REJEITA e não grava nada", async () => {
        const antes =
          await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
        const res = await criarPacienteEConsent(
          ctx,
          form({
            nome: "Adulto Convencional Sem Titular",
            nascimento: "1985-06-15",
            tipoConsentimento: "responsavel_legal",
            responsavelSignatario: "Curador",
            responsavelCpf: CPF_MODALIDADE[7],
            clinicalModality: "conventional",
            // #331 — preenchido para isolar o gate R3 (este teste é sobre
            // ele, não sobre a validação de familia_abordagem).
            familiaAbordagem: "psicodinamica",
          }),
        );
        expect(res.error).toMatch(
          /adulto em tcc ou terapia convencional exige consentimento do próprio titular/i,
        );
        expect(res.id).toBeUndefined();
        const depois =
          await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
        expect(depois[0]!.n).toBe(antes[0]!.n);
      });

      test("adulto + protocol_driven sem titular_adulto NÃO bloqueia (só aviso, fora do escopo do gate)", async () => {
        const res = await criarPacienteEConsent(
          ctx,
          form({
            nome: "Adulto Protocolo Sem Titular",
            nascimento: "1992-03-20",
            tipoConsentimento: "responsavel_legal",
            responsavelSignatario: "Curador",
            responsavelCpf: CPF_MODALIDADE[7],
            clinicalModality: "protocol_driven",
          }),
        );
        expect(res.error).toBeUndefined();
        expect(res.id).toBeTruthy();
        const linhas = await owner`
          SELECT clinical_modality FROM patient WHERE id = ${res.id!}`;
        expect(linhas[0]!.clinical_modality).toBe("protocol_driven");
      });
    });
  });

  // ─── #331 — família de abordagem ────────────────────────────────────────
  describe("#331 — família de abordagem", () => {
    const CPF_FAMILIA = [
      "11144477735",
      "22255588846",
      "33366699957",
      "44477700083",
    ] as const;

    test("familiaAbordagem grava no banco quando clinicalModality = conventional", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Paciente Familia Abordagem",
          tipoConsentimento: "titular_adulto",
          cpf: CPF_FAMILIA[0],
          clinicalModality: "conventional",
          familiaAbordagem: "humanista_existencial",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT familia_abordagem FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.familia_abordagem).toBe("humanista_existencial");
    });

    test("familiaAbordagem ausente com clinicalModality = conventional retorna erro e não grava nada", async () => {
      const antes =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Convencional Sem Familia",
          tipoConsentimento: "titular_adulto",
          cpf: CPF_FAMILIA[1],
          clinicalModality: "conventional",
        }),
      );
      expect(res.error).toMatch(/família de abordagem/i);
      expect(res.id).toBeUndefined();
      const depois =
        await owner`SELECT count(*)::int AS n FROM patient WHERE clinic_id = ${CLINIC_A}`;
      expect(depois[0]!.n).toBe(antes[0]!.n);
    });

    test("familiaAbordagem inválida (fora do enum) com clinicalModality = conventional retorna erro", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Convencional Familia Invalida",
          tipoConsentimento: "titular_adulto",
          cpf: CPF_FAMILIA[2],
          clinicalModality: "conventional",
          familiaAbordagem: "aba_avulsa",
        }),
      );
      expect(res.error).toMatch(/família de abordagem/i);
      expect(res.id).toBeUndefined();
    });

    test("familiaAbordagem é ignorada (fica NULL) quando clinicalModality != conventional", async () => {
      const res = await criarPacienteEConsent(
        ctx,
        form({
          nome: "Protocolo Com Familia Enviada",
          tipoConsentimento: "titular_adulto",
          cpf: CPF_FAMILIA[3],
          clinicalModality: "protocol_driven",
          familiaAbordagem: "psicodinamica",
        }),
      );
      expect(res.error).toBeUndefined();
      const linhas = await owner`
        SELECT familia_abordagem FROM patient WHERE id = ${res.id!}`;
      expect(linhas[0]!.familia_abordagem).toBeNull();
    });
  });
});
