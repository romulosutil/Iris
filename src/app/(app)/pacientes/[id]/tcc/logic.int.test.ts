import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { hasDb } from "@tests/integration-env";

vi.mock("server-only", () => ({}));

const CLINIC_A = "00000000-0000-0000-0000-0000000000a1";
const CLINIC_B = "00000000-0000-0000-0000-0000000000b1";
// #389 — clínica DEDICADA a este arquivo (nunca reutiliza CLINIC_A/CLINIC_B,
// que são fixture compartilhada com outros `*.int.test.ts`) para testar
// taxonomia customizada sem mutar estado que outros arquivos possam ler
// (memória `truncate-extra-colide-com-int-test-paralelo`: escrita extra em
// fixture compartilhada é a mesma classe de risco de colisão em paralelo).
// UUID namespaced com o nº da issue (389) — sufixo genérico "...c1" colide
// com fixtures de outros arquivos (`supervisao`, `validacao`, `report/*`)
// que reusam o mesmo id para outra clínica com taxonomia default, mascarando
// a rejeição de slug (achado ao rodar: taxonomia_distorcoes veio default
// porque o INSERT bateu em ON CONFLICT DO NOTHING contra a linha alheia).
const CLINIC_C = "00000000-0000-0000-0000-000000389c01";
const U_COORD = "00000000-0000-0000-0000-0000000c01a1";
const U_T1 = "00000000-0000-0000-0000-0000000071a1"; // na equipe de PAC
const U_T2 = "00000000-0000-0000-0000-0000000072a1"; // NÃO na equipe de PAC
const PAC = "00000000-0000-0000-0000-0000000ac1a1";
const PAC_B = "00000000-0000-0000-0000-0000000ac1b1"; // outra clínica
const PAC_C = "00000000-0000-0000-0000-0000000ac1c1"; // clínica com taxonomia customizada

const ctxCoord = {
  clinicId: CLINIC_A,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxT1 = { clinicId: CLINIC_A, userId: U_T1, role: "terapeuta" } as const;
const ctxT2 = { clinicId: CLINIC_A, userId: U_T2, role: "terapeuta" } as const;
const ctxCoordB = {
  clinicId: CLINIC_B,
  userId: U_COORD,
  role: "coordenador",
} as const;
const ctxCoordC = {
  clinicId: CLINIC_C,
  userId: U_COORD,
  role: "coordenador",
} as const;

let owner: ReturnType<typeof postgres>;
let L: typeof import("./logic");
let appSql: typeof import("@/db/client").sql;

describe.skipIf(!hasDb)(
  "TCC · Registro de Pensamentos Distorcidos (RPD)",
  () => {
    beforeAll(async () => {
      L = await import("./logic");
      ({ sql: appSql } = await import("@/db/client"));
      owner = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
      // Limpeza ESCOPADA (nunca `TRUNCATE ... CASCADE`): as tabelas de base
      // (`clinic`, `app_user`, `patient`) são compartilhadas com outros arquivos
      // de integração que rodam contra o mesmo Postgres. Truncar aqui derruba a
      // fixture do vizinho — na prática dá deadlock e violação de FK em arquivos
      // que nada têm a ver com TCC. Apagamos só as linhas DESTE arquivo, na ordem
      // das FKs, e reinserimos com `ON CONFLICT DO NOTHING` para o caso de a
      // fixture já existir de uma execução anterior (reexecutabilidade).
      // Só as linhas que ESTE arquivo escreve são apagadas. `patient`, `clinic` e
      // `app_user` ficam de pé e são reinseridos com `ON CONFLICT DO NOTHING`:
      // apagar paciente esbarra na FK de `audit_log` (a trilha de auditoria da
      // 1ª execução aponta para ele) e derrubaria o teste na 2ª rodada.
      // #391 — `alerta_risco_clinico.rpd_entry_id` referencia `tcc_rpd_entry`
      // sem CASCADE: apagar `tcc_rpd_entry` primeiro estoura FK numa 2ª
      // execução se os alertas da varredura de risco não forem limpos antes.
      await owner`DELETE FROM alerta_risco_clinico WHERE patient_id IN (${PAC}, ${PAC_B}, ${PAC_C})`;
      await owner`DELETE FROM tcc_rpd_entry WHERE patient_id IN (${PAC}, ${PAC_B}, ${PAC_C})`;
      await owner`DELETE FROM care_team_membership WHERE patient_id IN (${PAC}, ${PAC_B}, ${PAC_C})`;
      await owner`INSERT INTO clinic (id, nome) VALUES (${CLINIC_A}, 'A'), (${CLINIC_B}, 'B')
      ON CONFLICT (id) DO NOTHING`;
      // #389 — taxonomia customizada (só 2 slugs, um deles fora dos 12
      // default) definida na CRIAÇÃO da linha, nunca por UPDATE em cima de
      // fixture compartilhada.
      await owner`INSERT INTO clinic (id, nome, taxonomia_distorcoes) VALUES
      (${CLINIC_C}, 'C', '["catastrofizacao","slug_customizado_c"]'::jsonb)
      ON CONFLICT (id) DO NOTHING`;
      await owner`INSERT INTO app_user (id, email, name) VALUES
      (${U_COORD}, 'c@x.com', 'Coord'), (${U_T1}, 't1@x.com', 'T1'), (${U_T2}, 't2@x.com', 'T2')
      ON CONFLICT (id) DO NOTHING`;
      await owner`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${U_COORD}, ${CLINIC_A}, 'coordenador'),
      (${U_T1}, ${CLINIC_A}, 'terapeuta'),
      (${U_T2}, ${CLINIC_A}, 'terapeuta'),
      (${U_COORD}, ${CLINIC_B}, 'coordenador'),
      (${U_COORD}, ${CLINIC_C}, 'coordenador')
      ON CONFLICT (user_id, clinic_id, papel) DO NOTHING`;
      await owner`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PAC}, ${CLINIC_A}, 'Paciente A'), (${PAC_B}, ${CLINIC_B}, 'Paciente B'),
      (${PAC_C}, ${CLINIC_C}, 'Paciente C')
      ON CONFLICT (id) DO NOTHING`;
      // T1 está na equipe de PAC; T2 não.
      await owner`INSERT INTO care_team_membership (patient_id, user_id, papel_na_equipe, disciplina)
      VALUES (${PAC}, ${U_T1}, 'terapeuta_referencia', 'Psicologia')`;
    });

    afterAll(async () => {
      await owner?.end();
      await appSql?.end();
    });

    test("terapeuta da equipe salva RPD com sucesso e obtém entradas", async () => {
      const res = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Reunião de trabalho",
        pensamentoAutomatico: "Vou cometer um erro grave e ser demitido",
        emocao: "Ansiedade",
        intensidade: 85,
        respostaRacional:
          "Mesmo que eu erre algo, posso corrigir. Tenho bom histórico profissional.",
        intensidadePos: 35,
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const entries = await L.obterRPDEntries(ctxT1, PAC);
      expect(entries.length).toBeGreaterThan(0);
      const item = entries.find((e) => e.id === res.id);
      expect(item).toBeTruthy();
      expect(item?.situacao).toBe("Reunião de trabalho");
      expect(item?.intensidade).toBe(85);
      expect(item?.intensidadePos).toBe(35);
    });

    test("validação rejeita intensidade fora da faixa 0-100%", async () => {
      const resInvalido = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Gatilho",
        pensamentoAutomatico: "Pensamento",
        emocao: "Medo",
        intensidade: 150, // Inválido
        respostaRacional: "Resposta",
      });

      expect(resInvalido.error).toBeTruthy();
      expect(resInvalido.id).toBeUndefined();
    });

    test("terapeuta FORA da equipe é barrado ao tentar salvar RPD", async () => {
      const res = await L.salvarRPD(ctxT2, {
        patientId: PAC,
        situacao: "Apresentação",
        pensamentoAutomatico: "Ninguém vai gostar",
        emocao: "Vergonha",
        intensidade: 70,
        respostaRacional: "Não posso prever a reação de todos.",
      });

      expect(res.error).toBeTruthy();
    });

    test("isolamento multi-tenant: clínica B não enxerga nem salva RPD de paciente da clínica A", async () => {
      // Tenta salvar RPD para paciente da clínica A usando contexto da clínica B
      const resSalvar = await L.salvarRPD(ctxCoordB, {
        patientId: PAC,
        situacao: "Invasão cross-tenant",
        pensamentoAutomatico: "Cross-tenant",
        emocao: "Raiva",
        intensidade: 90,
        respostaRacional: "Invasão bloqueada",
      });

      expect(resSalvar.error).toBeTruthy();

      // Consulta do coordenador B não retorna dados do paciente A
      const entriesB = await L.obterRPDEntries(ctxCoordB, PAC);
      expect(entriesB.length).toBe(0);
    });

    test("desarquiva automaticamente paciente arquivado ao registrar RPD", async () => {
      await owner`UPDATE patient SET arquivado_em = now() WHERE id = ${PAC}`;

      const res = await L.salvarRPD(ctxCoord, {
        patientId: PAC,
        situacao: "Situação pós-arquivamento",
        pensamentoAutomatico: "Pensamento",
        emocao: "Tristeza",
        intensidade: 60,
        respostaRacional: "Resposta",
      });

      expect(res.error).toBeUndefined();

      const [paciente] =
        await owner`SELECT arquivado_em FROM patient WHERE id = ${PAC}`;
      expect(paciente!.arquivado_em).toBeNull();
    });

    // #389 — formato Padesky: campos 2ª metade viram opcionais e a taxonomia
    // de distorções é config por clínica (não enum/CHECK).
    test("RPD salva com distorcoesCognitivas ausente ou vazio: sem erro, coluna fica NULL", async () => {
      const resAusente = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Situação sem distorção informada",
        pensamentoAutomatico: "Pensamento automático",
        emocao: "Ansiedade",
        intensidade: 40,
      });
      expect(resAusente.error).toBeUndefined();
      expect(resAusente.id).toBeTruthy();
      const [rowAusente] = await owner`
        SELECT distorcoes_cognitivas FROM tcc_rpd_entry WHERE id = ${resAusente.id!}
      `;
      expect(rowAusente!.distorcoes_cognitivas).toBeNull();

      const resVazio = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Situação com array vazio",
        pensamentoAutomatico: "Pensamento automático",
        emocao: "Ansiedade",
        intensidade: 40,
        distorcoesCognitivas: [],
      });
      expect(resVazio.error).toBeUndefined();
      const [rowVazio] = await owner`
        SELECT distorcoes_cognitivas FROM tcc_rpd_entry WHERE id = ${resVazio.id!}
      `;
      expect(rowVazio!.distorcoes_cognitivas).toBeNull();
    });

    test("RPD salva só com campos 1-3 (situação/pensamento automático/emoção+intensidade): sem erro, demais campos ficam NULL", async () => {
      const res = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Só o registro inicial",
        pensamentoAutomatico: "Pensamento automático mínimo",
        emocao: "Tristeza",
        intensidade: 55,
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const [row] = await owner`
        SELECT credibilidade_inicial, evidencias_favor, evidencias_contra,
               resposta_racional, credibilidade_alternativa, distorcoes_cognitivas,
               comportamento_resultante, intensidade_pos
        FROM tcc_rpd_entry WHERE id = ${res.id!}
      `;
      expect(row!.credibilidade_inicial).toBeNull();
      expect(row!.evidencias_favor).toBeNull();
      expect(row!.evidencias_contra).toBeNull();
      expect(row!.resposta_racional).toBeNull();
      expect(row!.credibilidade_alternativa).toBeNull();
      expect(row!.distorcoes_cognitivas).toBeNull();
      expect(row!.comportamento_resultante).toBeNull();
      expect(row!.intensidade_pos).toBeNull();
    });

    test("slug fora da taxonomia da clínica é rejeitado e não insere linha", async () => {
      const [contagemAntes] = await owner`
        SELECT count(*)::int AS n FROM tcc_rpd_entry WHERE patient_id = ${PAC_C}
      `;

      // "leitura_mental" é um dos 12 slugs default, mas a clínica C tem
      // taxonomia customizada (só "catastrofizacao" e "slug_customizado_c").
      const res = await L.salvarRPD(ctxCoordC, {
        patientId: PAC_C,
        situacao: "Situação",
        pensamentoAutomatico: "Pensamento",
        emocao: "Raiva",
        intensidade: 60,
        distorcoesCognitivas: ["leitura_mental"],
      });

      expect(res.error).toBeTruthy();
      expect(res.id).toBeUndefined();

      const [contagemDepois] = await owner`
        SELECT count(*)::int AS n FROM tcc_rpd_entry WHERE patient_id = ${PAC_C}
      `;
      expect(contagemDepois!.n).toBe(contagemAntes!.n);
    });

    // #391 — varredura determinística de risco no RPD.
    test("RPD com termo de ideação suicida cria alerta com origem='registro_pensamento'", async () => {
      const res = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Situação de crise",
        pensamentoAutomatico: "Às vezes eu só quero morrer e sumir de vez",
        emocao: "Desespero",
        intensidade: 95,
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const alertas = await owner`
        SELECT origem, rpd_entry_id, categoria, certeza, patient_id
          FROM alerta_risco_clinico
         WHERE rpd_entry_id = ${res.id!}
      `;
      expect(alertas.length).toBe(1);
      expect(alertas[0]!.origem).toBe("registro_pensamento");
      expect(alertas[0]!.rpd_entry_id).toBe(res.id);
      expect(alertas[0]!.categoria).toBe("ideacao_suicida");
      expect(alertas[0]!.certeza).toBe("ambiguo_citado");
      expect(alertas[0]!.patient_id).toBe(PAC);
    });

    test("RPD com termo de autolesão cria alerta com categoria='autolesao'", async () => {
      const res = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Situação",
        pensamentoAutomatico: "Pensamento automático comum",
        emocao: "Raiva",
        intensidade: 70,
        evidenciasFavor: "Cheguei a me cortar de novo na semana passada",
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const alertas = await owner`
        SELECT origem, rpd_entry_id, categoria
          FROM alerta_risco_clinico
         WHERE rpd_entry_id = ${res.id!}
      `;
      expect(alertas.length).toBe(1);
      expect(alertas[0]!.categoria).toBe("autolesao");
      expect(alertas[0]!.origem).toBe("registro_pensamento");
    });

    test("RPD sem nenhum termo de risco NÃO cria alerta", async () => {
      const res = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Conversa comum de trabalho",
        pensamentoAutomatico: "Vou cometer um erro e ser demitido",
        emocao: "Ansiedade",
        intensidade: 50,
        respostaRacional: "Já errei antes e sempre corrigi.",
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const [contagem] = await owner`
        SELECT count(*)::int AS n FROM alerta_risco_clinico WHERE rpd_entry_id = ${res.id!}
      `;
      expect(contagem!.n).toBe(0);
    });

    test("RPD com termos das DUAS listas (ideação + autolesão) cria DOIS alertas", async () => {
      const res = await L.salvarRPD(ctxT1, {
        patientId: PAC,
        situacao: "Situação grave",
        pensamentoAutomatico: "Penso em me matar quando fico assim",
        emocao: "Desespero",
        intensidade: 100,
        evidenciasFavor: "Cheguei a me machucar de propósito ontem",
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const alertas = await owner`
        SELECT categoria FROM alerta_risco_clinico WHERE rpd_entry_id = ${res.id!}
      `;
      expect(alertas.length).toBe(2);
      const categorias = alertas.map((a) => a.categoria).sort();
      expect(categorias).toEqual(["autolesao", "ideacao_suicida"]);
    });

    test("slug dentro da taxonomia da clínica é aceito normalmente", async () => {
      const res = await L.salvarRPD(ctxCoordC, {
        patientId: PAC_C,
        situacao: "Situação",
        pensamentoAutomatico: "Pensamento",
        emocao: "Raiva",
        intensidade: 60,
        distorcoesCognitivas: ["catastrofizacao"],
      });

      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();

      const [row] = await owner`
        SELECT distorcoes_cognitivas FROM tcc_rpd_entry WHERE id = ${res.id!}
      `;
      expect(row!.distorcoes_cognitivas).toEqual(["catastrofizacao"]);
    });
  },
);
