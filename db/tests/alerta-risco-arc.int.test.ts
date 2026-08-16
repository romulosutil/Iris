/**
 * #122 — os cinco casos de teste da §8 da spec (`docs/agente/regra-alerta-risco.md`),
 * mais o motor de escalonamento em dois estágios, contra Postgres real.
 * Roda com `pnpm test:rls`. Auto-skip sem DB.
 *
 * ARC-1 ideação passiva ambígua · ARC-2 plano e meios · ARC-3 reconhecido no
 * prazo · ARC-4 escalonamento dispara · ARC-5 paciente multiprofissional.
 */
import { vi } from "vitest";
vi.mock("server-only", () => ({})); // padrão do repo p/ importar core server-only
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import {
  reconhecerAlertaRisco,
  resolverAlertaRisco,
  descartarAlertaRisco,
} from "../../src/app/(app)/alertas-risco/logic";
import {
  assertDestinatariosNoTenant,
  destinatariosCriacao,
  destinatariosEstagio1,
  destinatariosEstagio2,
} from "../../src/lib/risco/notificacao";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

const CLINIC = "00000000-0000-0000-0000-0000000013a0";
const CLINIC_X = "00000000-0000-0000-0000-0000000013b0";
const U_COORD = "00000000-0000-0000-0000-0000000013c1";
const U_COORD2 = "00000000-0000-0000-0000-0000000013c2";
const U_PSICO = "00000000-0000-0000-0000-0000000013a1"; // terapeuta das terças
const U_FONO = "00000000-0000-0000-0000-0000000013a2"; // terapeuta das quintas
const U_RT = "00000000-0000-0000-0000-0000000013a4"; // responsável técnico
const U_ESTRANHO = "00000000-0000-0000-0000-0000000013b1"; // outra clínica
const P = "00000000-0000-0000-0000-0000000013d1";
const S_TERCA = "00000000-0000-0000-0000-0000000013e1";
const S_QUINTA = "00000000-0000-0000-0000-0000000013e2";

const ctx = (role: string, userId: string, clinicId = CLINIC) =>
  ({ role, userId, clinicId }) as TenantContext;

async function semear() {
  await owner!`TRUNCATE alerta_risco_clinico, audit_log RESTART IDENTITY CASCADE`;
  await owner!`TRUNCATE clinic, app_user, user_role, patient, care_team_membership, session RESTART IDENTITY CASCADE`;
  await owner!`INSERT INTO clinic (id, nome) VALUES (${CLINIC}, 'Clínica ARC'), (${CLINIC_X}, 'Outra')`;
  await owner!`INSERT INTO app_user (id, name, email) VALUES
    (${U_COORD}, 'Coordenadora', 'coord@arc.test'),
    (${U_COORD2}, 'Coordenador 2', 'coord2@arc.test'),
    (${U_PSICO}, 'Psicóloga', 'psico@arc.test'),
    (${U_FONO}, 'Fonoaudiólogo', 'fono@arc.test'),
    (${U_RT}, 'Responsável Técnico', 'rt@arc.test'),
    (${U_ESTRANHO}, 'De fora', 'fora@arc.test')`;
  await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
    (${U_COORD}, ${CLINIC}, 'coordenador'),
    (${U_COORD2}, ${CLINIC}, 'coordenador'),
    (${U_PSICO}, ${CLINIC}, 'terapeuta'),
    (${U_FONO}, ${CLINIC}, 'terapeuta'),
    (${U_RT}, ${CLINIC}, 'coordenador'),
    (${U_ESTRANHO}, ${CLINIC_X}, 'coordenador')`;
  await owner!`UPDATE clinic SET responsavel_tecnico_id = ${U_RT} WHERE id = ${CLINIC}`;
  await owner!`INSERT INTO patient (id, clinic_id, nome, nascimento) VALUES
    (${P}, ${CLINIC}, 'Paciente adulto', '1991-06-02')`;
  await owner!`INSERT INTO care_team_membership (patient_id, user_id, disciplina, papel_na_equipe, vigencia_fim) VALUES
    (${P}, ${U_PSICO}, 'psicologia', 'terapeuta_referencia', NULL),
    (${P}, ${U_FONO}, 'fono', 'terapeuta_referencia', NULL)`;
  await owner!`INSERT INTO session (id, clinic_id, patient_id, terapeuta_id, agendada_para, disciplina) VALUES
    (${S_TERCA}, ${CLINIC}, ${P}, ${U_PSICO}, now() - interval '2 days', 'psicologia'),
    (${S_QUINTA}, ${CLINIC}, ${P}, ${U_FONO}, now(), 'fono')`;
}

type Linha = {
  id: string;
  categoria: string;
  severidade: string;
  certeza: string;
  status: string;
  prazo_minutos: number;
  trecho_fonte: string;
  prazo_reconhecimento: Date;
  escalado_em: Date | null;
  escalado_estagio_2_em: Date | null;
  reconhecido_por: string | null;
  canais_notificados: unknown;
};

async function criar(args: {
  autor: TenantContext;
  sessionId: string;
  categoria: string;
  severidade: string;
  certeza: string;
  trecho: string;
  detalhe: string;
}): Promise<string> {
  return withTenant(args.autor, async (tx) => {
    const r = (await tx.execute(sql`
      SELECT app_criar_alerta_risco(
        ${P}::uuid, ${args.sessionId}::uuid,
        ${args.categoria}::alerta_risco_categoria,
        ${args.severidade}::alerta_risco_severidade,
        ${args.certeza}::alerta_risco_certeza,
        ${args.trecho}, ${args.detalhe}
      ) AS id`)) as unknown as Array<{ id: string }>;
    return r[0]!.id;
  });
}

const ler = async (id: string): Promise<Linha> => {
  const [l] = await owner!<
    Linha[]
  >`SELECT * FROM alerta_risco_clinico WHERE id = ${id}`;
  return l!;
};

/** Empurra o alerta no tempo, para exercitar o vencimento sem esperar de verdade. */
async function envelhecer(id: string, minutos: number) {
  await owner!`UPDATE alerta_risco_clinico
     SET criado_em = criado_em - make_interval(mins => ${minutos}),
         prazo_reconhecimento = prazo_reconhecimento - make_interval(mins => ${minutos})
   WHERE id = ${id}`;
}

/** Varredura do job (roda como owner — a role do job não lê tabela nenhuma). */
async function varrer() {
  return owner!<
    { out_alerta_id: string; out_estagio: number }[]
  >`SELECT * FROM app_escalonar_risco_vencidos()`;
}

// Conexão única do arquivo: fechá-la no afterAll de um describe derrubaria os
// describes seguintes (vitest roda todos no mesmo módulo).
afterAll(async () => {
  await owner?.end();
});

describe.skipIf(!hasDb)("#122 §8 — casos ARC-1..ARC-5", () => {
  beforeAll(semear);

  test("ARC-1: ideação passiva com certeza ambígua — alerta mantido integralmente, prazo de 4 horas", async () => {
    await semear();
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA,
      categoria: "ideacao_suicida",
      severidade: "ideacao_passiva",
      certeza: "ambiguo_citado",
      trecho:
        "às vezes dá vontade de simplesmente sumir, de não ter que lidar com nada disso",
      detalhe:
        "Sem método, plano ou intenção declarada; mencionado de passagem no contexto de sobrecarga no trabalho.",
    });
    const l = await ler(id);
    expect(l.severidade).toBe("ideacao_passiva");
    expect(l.certeza).toBe("ambiguo_citado");
    expect(Number(l.prazo_minutos)).toBe(240);
    expect(l.status).toBe("aberto");
    // a ambiguidade NÃO suprime o alerta nem o esvazia
    expect(l.trecho_fonte).toContain("vontade de simplesmente sumir");
  });

  test("ARC-2: ideação ativa com plano e meios — prazo de 15 minutos, sem rebaixar por falta de data", async () => {
    await semear();
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA,
      categoria: "ideacao_suicida",
      severidade: "ideacao_ativa_com_plano",
      certeza: "explicito",
      trecho:
        "já separei os comprimidos, estão numa gaveta, se as coisas não melhorarem até o fim do mês",
      detalhe:
        "Plano e meios relatados, carta já escrita, dia não decidido. A ausência de data exata NÃO rebaixa a severidade.",
    });
    const l = await ler(id);
    expect(l.severidade).toBe("ideacao_ativa_com_plano");
    expect(Number(l.prazo_minutos)).toBe(15);
  });

  test("ARC-3: reconhecido dentro do prazo — sem escalonamento", async () => {
    await semear();
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA,
      categoria: "ideacao_suicida",
      severidade: "ideacao_passiva",
      certeza: "ambiguo_citado",
      trecho: "às vezes dá vontade de simplesmente sumir",
      detalhe: "Sem plano.",
    });

    const r = await reconhecerAlertaRisco(ctx("terapeuta", U_PSICO), {
      alertaId: id,
    });
    expect(r).toEqual({ ok: true });

    const l = await ler(id);
    expect(l.status).toBe("reconhecido");
    expect(l.reconhecido_por).toBe(U_PSICO);
    // prazo cumprido: o reconhecimento veio antes do vencimento
    expect(l.prazo_reconhecimento.getTime()).toBeGreaterThan(Date.now());

    // e o job não escala o que já foi reconhecido, mesmo depois de vencer
    await envelhecer(id, 300);
    const escalados = await varrer();
    expect(escalados.map((e) => e.out_alerta_id)).not.toContain(id);
    expect((await ler(id)).status).toBe("reconhecido");
  });

  test("ARC-4: não reconhecido — estágio 1 no vencimento, uma única vez", async () => {
    await semear();
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA,
      categoria: "autolesao",
      severidade: "autolesao_recente",
      certeza: "explicito",
      trecho:
        "marcas recentes de corte no antebraço, há dois dias, numa noite ruim",
      detalhe: "Nega intenção suicida; relata alívio de tensão.",
    });
    expect(Number((await ler(id)).prazo_minutos)).toBe(60);

    // antes do vencimento, nada acontece
    expect((await varrer()).map((e) => e.out_alerta_id)).not.toContain(id);
    expect((await ler(id)).status).toBe("aberto");

    // vencido (22h00 → 23h00): escala para todos os coordenadores da clínica
    await envelhecer(id, 61);
    const primeira = await varrer();
    expect(primeira.find((e) => e.out_alerta_id === id)?.out_estagio).toBe(1);
    const l1 = await ler(id);
    expect(l1.status).toBe("escalado_estagio_1");
    expect(l1.escalado_em).not.toBeNull();
    expect(JSON.stringify(l1.canais_notificados)).toContain(
      "todos_coordenadores_clinica",
    );

    // §4.3: dois estágios DISCRETOS. Varrer de novo não re-escala nem re-notifica.
    const segunda = await varrer();
    expect(segunda.map((e) => e.out_alerta_id)).not.toContain(id);
  });

  test("ARC-4b: estágio 2 no DOBRO do prazo — saturação interna, nunca canal externo", async () => {
    await semear();
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA,
      categoria: "autolesao",
      severidade: "autolesao_recente",
      certeza: "explicito",
      trecho: "trecho do ARC-4b",
      detalhe: "d",
    });

    // 1ª varredura, prazo vencido → estágio 1
    await envelhecer(id, 61);
    expect(
      (await varrer()).find((e) => e.out_alerta_id === id)?.out_estagio,
    ).toBe(1);

    // ainda NÃO atingiu o dobro → nada acontece (§4.3: estágios discretos)
    expect((await varrer()).map((e) => e.out_alerta_id)).not.toContain(id);
    expect((await ler(id)).status).toBe("escalado_estagio_1");

    // passado o dobro do prazo → estágio 2
    await envelhecer(id, 61);
    expect(
      (await varrer()).find((e) => e.out_alerta_id === id)?.out_estagio,
    ).toBe(2);

    const l = await ler(id);
    expect(l.status).toBe("escalado_estagio_2");
    expect(l.escalado_estagio_2_em).not.toBeNull();
    const canais = JSON.stringify(l.canais_notificados);
    // as três ações internas do estágio 2; nenhuma delas sai da clínica
    expect(canais).toContain("banner_clinica_wide");
    expect(canais).toContain("responsavel_tecnico");
    expect(canais).toContain("protocolo_emergencia_interno");
    expect(canais).not.toMatch(/familia|samu|policia|conselho/i);

    // log imutável do escalonamento (§4.2.1, ação 4), com ator NULO — ninguém
    // escalou, o prazo venceu.
    const trilha = await owner!<{ acao: string; ator_id: string | null }[]>`
      SELECT acao, ator_id FROM audit_log
       WHERE entidade = 'alerta_risco_clinico' AND entidade_id = ${id}
         AND acao = 'alerta_risco_escalado'`;
    expect(trilha).toHaveLength(2); // estágio 1 e estágio 2
    expect(trilha.every((t) => t.ator_id === null)).toBe(true);

    // o banner clínica-wide enxerga o estágio 2 — só a contagem, sem paciente
    // e sem categoria.
    const n = await withTenant(ctx("terapeuta", U_FONO), async (tx) => {
      const r = (await tx.execute(
        sql`SELECT app_risco_estagio2_ativo() AS n`,
      )) as unknown as Array<{ n: number }>;
      return Number(r[0]!.n);
    });
    expect(n).toBe(1);
  });

  test("ARC-5: paciente multiprofissional — o alerta segue a SESSÃO, nunca lateralmente (H4)", async () => {
    await semear();
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA, // sessão da psicóloga
      categoria: "ideacao_suicida",
      severidade: "ideacao_passiva",
      certeza: "explicito",
      trecho: "seria mais fácil não acordar",
      detalhe: "Pensamento recorrente, sem plano.",
    });
    expect(Number((await ler(id)).prazo_minutos)).toBe(240);

    const destinatarios = await withTenant(ctx("terapeuta", U_PSICO), (tx) =>
      destinatariosCriacao(tx, { clinicId: CLINIC, sessionId: S_TERCA }),
    );
    const ids = destinatarios.map((d) => d.userId);

    expect(ids).toContain(U_PSICO); // terapeuta da sessão de origem
    expect(ids).toContain(U_COORD); // coordenador, simultaneamente
    // o fonoaudiólogo do MESMO paciente NÃO é notificado: sem contexto sobre
    // risco em psicoterapia, e difundir violaria a minimização (LGPD art. 6º, III)
    expect(ids).not.toContain(U_FONO);
  });
});

describe.skipIf(!hasDb)(
  "#122 — regra de ouro: nenhum destinatário fora do tenant",
  () => {
    beforeAll(semear);

    test("todo destinatário de todo estágio pertence à clínica do alerta", async () => {
      const daClinica = new Set(
        (
          await owner!<{ user_id: string }[]>`
        SELECT user_id FROM user_role WHERE clinic_id = ${CLINIC}`
        ).map((r) => r.user_id),
      );

      const todos = await withTenant(
        ctx("coordenador", U_COORD),
        async (tx) => [
          ...(await destinatariosCriacao(tx, {
            clinicId: CLINIC,
            sessionId: S_TERCA,
          })),
          ...(await destinatariosEstagio1(tx, { clinicId: CLINIC })),
          ...(await destinatariosEstagio2(tx, { clinicId: CLINIC })),
        ],
      );

      expect(todos.length).toBeGreaterThan(0);
      for (const d of todos) expect(daClinica.has(d.userId)).toBe(true);
      // ninguém de fora, em nenhum estágio
      expect(todos.map((d) => d.userId)).not.toContain(U_ESTRANHO);
    });

    test("o guard quebra alto se alguém injetar destinatário de outra clínica", async () => {
      // #329 — a mensagem tem que NOMEAR o forasteiro, e ela vem do `RAISE` da
      // `app_assert_destinatarios_no_tenant`. É isso que prova que o TS delega
      // ao helper SQL e traduz o `P0001`: se ele deixasse o `DrizzleQueryError`
      // subir cru, `.message` seria o SQL emitido — sem o id e sem "fora do
      // tenant" — e este teste falharia.
      await expect(
        withTenant(ctx("coordenador", U_COORD), (tx) =>
          assertDestinatariosNoTenant(tx, {
            clinicId: CLINIC,
            destinatarios: [
              { userId: U_ESTRANHO, canal: "in_app_coordenador" as const },
            ],
          }),
        ),
      ).rejects.toThrow(new RegExp(`fora do tenant \\(${U_ESTRANHO}\\)`));
    });

    test("o guard quebra alto com múltiplos destinatários, alguns do tenant e um forasteiro (n≥2)", async () => {
      await expect(
        withTenant(ctx("coordenador", U_COORD), (tx) =>
          assertDestinatariosNoTenant(tx, {
            clinicId: CLINIC,
            destinatarios: [
              { userId: U_COORD, canal: "in_app_coordenador" as const },
              { userId: U_COORD2, canal: "in_app_coordenador" as const },
              { userId: U_ESTRANHO, canal: "in_app_coordenador" as const },
            ],
          }),
        ),
        // Só o forasteiro é nomeado: o `)` logo depois do id prova que os dois
        // que TÊM papel na clínica ficaram de fora da lista.
      ).rejects.toThrow(new RegExp(`fora do tenant \\(${U_ESTRANHO}\\)`));
    });

    test("nenhum canal declarado endereça destinatário externo à clínica", async () => {
      const canais = await withTenant(ctx("coordenador", U_COORD), async (tx) =>
        [
          ...(await destinatariosCriacao(tx, {
            clinicId: CLINIC,
            sessionId: S_TERCA,
          })),
          ...(await destinatariosEstagio1(tx, { clinicId: CLINIC })),
          ...(await destinatariosEstagio2(tx, { clinicId: CLINIC })),
        ].map((d) => d.canal),
      );
      // proíbe por construção qualquer canal que soe externo
      for (const c of canais) {
        expect(c).not.toMatch(
          /familia|emergencia_contato|samu|policia|conselho/i,
        );
      }
    });
  },
);

/**
 * #329 — o predicado de "destinatário no tenant" desceu para o SQL (migração
 * 0105) porque os dois caminhos que notificam não podem compartilhar código:
 * a criação roda em TypeScript, dentro do Next; o escalonamento roda em
 * `scripts/escalonamento-risco.mjs`, Node puro numa imagem que não copia `src/`.
 * Estes testes exercitam o predicado no ponto em que ele é único — o banco.
 */
describe.skipIf(!hasDb)(
  "#329 — predicado único de destinatário no tenant (0105)",
  () => {
    beforeAll(semear);

    /** Leva um alerta novo até `escalado_estagio_2` (mesmo caminho do ARC-4b). */
    async function alertaEmEstagio2(): Promise<string> {
      const id = await criar({
        autor: ctx("terapeuta", U_PSICO),
        sessionId: S_TERCA,
        categoria: "autolesao",
        severidade: "autolesao_recente",
        certeza: "explicito",
        trecho: "trecho do #329",
        detalhe: "d",
      });
      await envelhecer(id, 61);
      await varrer(); // → estágio 1
      await envelhecer(id, 61);
      await varrer(); // → estágio 2
      expect((await ler(id)).status).toBe("escalado_estagio_2");
      return id;
    }

    test("app_destinatarios_fora_do_tenant devolve só o forasteiro; array vazio quando todos pertencem", async () => {
      await semear();

      const [misto] = await owner!<{ forasteiros: string[] }[]>`
        SELECT app_destinatarios_fora_do_tenant(
          ${CLINIC}::uuid, ARRAY[${U_COORD}, ${U_COORD2}, ${U_ESTRANHO}]::uuid[]
        ) AS forasteiros`;
      expect(misto!.forasteiros).toEqual([U_ESTRANHO]);

      const [todosDentro] = await owner!<{ forasteiros: string[] }[]>`
        SELECT app_destinatarios_fora_do_tenant(
          ${CLINIC}::uuid, ARRAY[${U_COORD}, ${U_PSICO}, ${U_RT}]::uuid[]
        ) AS forasteiros`;
      expect(todosDentro!.forasteiros).toEqual([]);

      // Lista vazia é "nada a verificar", não erro — espelha o early-return do TS.
      const [vazio] = await owner!<{ forasteiros: string[] }[]>`
        SELECT app_destinatarios_fora_do_tenant(
          ${CLINIC}::uuid, ARRAY[]::uuid[]
        ) AS forasteiros`;
      expect(vazio!.forasteiros).toEqual([]);
    });

    test("app_assert_destinatarios_no_tenant estoura P0001 nomeando o forasteiro", async () => {
      await semear();

      const erro = await owner!`
        SELECT app_assert_destinatarios_no_tenant(
          ${CLINIC}::uuid, ARRAY[${U_COORD}, ${U_ESTRANHO}]::uuid[]
        )`.catch((e: unknown) => e as { code?: string; message?: string });

      expect((erro as { code?: string }).code).toBe("P0001");
      // O id do forasteiro tem que estar na mensagem: guard que só diz "algo
      // deu errado" não é diagnosticável no incidente.
      expect((erro as { message?: string }).message).toContain(U_ESTRANHO);
      expect((erro as { message?: string }).message).toContain(
        "fora do tenant",
      );

      // E o caminho feliz não estoura.
      await expect(
        owner!`SELECT app_assert_destinatarios_no_tenant(
          ${CLINIC}::uuid, ARRAY[${U_COORD}, ${U_RT}]::uuid[]
        )`,
      ).resolves.toBeDefined();
    });

    test("app_rt_do_alerta: RT com papel na clínica devolve e-mail e motivo_bloqueio NULL", async () => {
      await semear();
      const id = await alertaEmEstagio2();

      const linhas = await owner!<
        { rt_email: string | null; motivo_bloqueio: string | null }[]
      >`SELECT * FROM app_rt_do_alerta(${id})`;

      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.rt_email).toBe("rt@arc.test");
      expect(linhas[0]!.motivo_bloqueio).toBeNull();
    });

    test("app_rt_do_alerta: RT sem papel na clínica devolve motivo_bloqueio e NUNCA o e-mail", async () => {
      await semear();
      const id = await alertaEmEstagio2();

      // O RT da clínica passa a ser alguém que só tem papel em CLINIC_X. Antes
      // da 0105 isto sumia com a linha inteira e o job gravava "RT nao
      // encontrado" — indistinguível de clínica sem RT cadastrado.
      await owner!`UPDATE clinic SET responsavel_tecnico_id = ${U_ESTRANHO} WHERE id = ${CLINIC}`;

      const linhas = await owner!<
        { rt_email: string | null; motivo_bloqueio: string | null }[]
      >`SELECT * FROM app_rt_do_alerta(${id})`;

      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.motivo_bloqueio).toContain("fora do tenant");
      expect(linhas[0]!.motivo_bloqueio).toContain(U_ESTRANHO);
      // O e-mail do forasteiro não sai da função em hipótese alguma: quem
      // bloqueia não precisa do endereço para bloquear.
      expect(linhas[0]!.rt_email).toBeNull();

      // Volta o cadastro ao estado semeado (limpeza escopada — nada de tabela
      // nova no TRUNCATE, que colide com os int-tests paralelos).
      await owner!`UPDATE clinic SET responsavel_tecnico_id = ${U_RT} WHERE id = ${CLINIC}`;
    });

    test("app_rt_do_alerta: clínica sem RT segue devolvendo ZERO linhas (comportamento preservado)", async () => {
      await semear();
      const id = await alertaEmEstagio2();
      await owner!`UPDATE clinic SET responsavel_tecnico_id = NULL WHERE id = ${CLINIC}`;

      const linhas = await owner!`SELECT * FROM app_rt_do_alerta(${id})`;
      expect(linhas).toHaveLength(0);

      await owner!`UPDATE clinic SET responsavel_tecnico_id = ${U_RT} WHERE id = ${CLINIC}`;
    });
  },
);

describe.skipIf(!hasDb)("#122 — reconhecer ≠ resolver ≠ descartar", () => {
  beforeAll(semear);

  test("resolver exige conduta registrada; descartar exige motivo — nunca silencioso", async () => {
    const id = await criar({
      autor: ctx("terapeuta", U_PSICO),
      sessionId: S_TERCA,
      categoria: "ideacao_suicida",
      severidade: "ideacao_passiva",
      certeza: "explicito",
      trecho: "trecho para transições",
      detalhe: "d",
    });

    expect(
      await resolverAlertaRisco(ctx("terapeuta", U_PSICO), {
        alertaId: id,
        conduta: "curta",
      }),
    ).toHaveProperty("error");

    expect(
      await descartarAlertaRisco(ctx("terapeuta", U_PSICO), {
        alertaId: id,
        motivo: "não",
      }),
    ).toHaveProperty("error");

    expect(
      await resolverAlertaRisco(ctx("terapeuta", U_PSICO), {
        alertaId: id,
        conduta:
          "Contato telefônico realizado; sessão extra agendada para amanhã.",
      }),
    ).toEqual({ ok: true });

    const l = await ler(id);
    expect(l.status).toBe("resolvido");

    // terminal não volta atrás
    expect(
      await reconhecerAlertaRisco(ctx("terapeuta", U_PSICO), { alertaId: id }),
    ).toHaveProperty("error");
  });

  test("alerta de outra clínica: mesma mensagem opaca de inexistente (sem oráculo de UUID)", async () => {
    const r = await reconhecerAlertaRisco(
      ctx("coordenador", U_ESTRANHO, CLINIC_X),
      {
        alertaId: "00000000-0000-0000-0000-0000000099ff",
      },
    );
    expect(r).toEqual({ error: "Alerta inexistente ou sem permissão." });
  });
});
