/**
 * #72 / T03 — rede de proteção das três funções `SECURITY DEFINER` da fila de
 * ASR (`db/migrations/0136_asr_fila.sql`).
 *
 * POR QUE ESTE ARQUIVO EXISTE:
 * a `0136` é cross-tenant POR DESENHO — o worker de transcrição roda sem
 * usuário logado e sem `app.clinic_id`, então nenhuma policy roda por baixo
 * dela. Isso significa que TODA a contenção está no corpo das funções, e o
 * corpo de uma função `CREATE OR REPLACE` não aparece no diff de forma
 * confiável (memória `create-or-replace-torna-diff-enganoso`). Sem este
 * arquivo, a migração sai verde tanto certa quanto errada.
 *
 * AS MUTAÇÕES QUE ESTE ARQUIVO MATA, uma por comportamento:
 *  - mover `AND c.tentativas < 3` da SUBQUERY do `LIMIT` para o `WHERE`
 *    externo → cai o teste (c). É o defeito de `varredura-filtro-depois-do-
 *    limit`: os clipes queimados continuariam sendo ESCOLHIDOS pela subquery
 *    (são os mais antigos), o filtro externo os descartaria depois, e a fila
 *    inteira travaria em silêncio, sem erro nenhum.
 *  - remover o `FOR UPDATE SKIP LOCKED` → cai o teste (b2): dois ticks
 *    sobrepostos passariam a disputar (ou a devolver) a mesma linha.
 *  - trocar `greatest(tentativas - 1, 0)` por `tentativas` no ramo de
 *    `p_reverter_tentativa = true` → cai o teste do 503. Esse caminho é a
 *    decisão de arquitetura nova da T02 e não tem outra prova.
 *  - remover o `objeto_ref = NULL` do desfecho definitivo de `app_asr_falhar`
 *    → cai o teste (d): o banco passaria a apontar para uma chave que o
 *    `finally` do worker já apagou.
 *
 * POR QUE A ASSERÇÃO DE TENANT (a) NÃO RODA COMO A ROLE DONA:
 * `MIGRATION_DATABASE_URL` é a role dona, com BYPASSRLS — uma leitura feita
 * por ela passaria verde mesmo com a RLS de `audio_capture` derrubada
 * (memória `suite-rls-rodando-como-superusuario`). A role dona aqui só PLANTA
 * fixture; quem lê é `withTenant`, sobre `DATABASE_URL` (`iris_app`, membro de
 * `app_role`), com os GUCs de sessão.
 *
 * Sufixo de fixture `72asr` nos e-mails e prefixo `72a5` nos UUIDs: evita
 * colisão de `UNIQUE(email)` e de chave primária com os outros ~68 arquivos
 * `*.int.test.ts` (memória `email-de-fixture-colide-entre-int-tests`).
 *
 * Limpeza por `DELETE` escopado pelos ids inseridos, na ordem inversa das FKs
 * — nunca `TRUNCATE` (memória `truncate-extra-colide-com-int-test-paralelo`).
 * Os clipes são apagados a cada teste porque `app_asr_reservar` varre a fila
 * INTEIRA: um clipe deixado `na_fila` por um teste entraria na janela do
 * `LIMIT` do teste seguinte.
 *
 * Roda com `--config vitest.integration.config.ts`; sem ela o arquivo coleta
 * ZERO e sai verde (memória `vitest-int-test-coleta-zero`). Conferir a
 * CONTAGEM, não a cor.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../../src/db/rls";
import { hasDb } from "./integration-env";

const owner = hasDb
  ? postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 })
  : null;

// ─── identificadores fixos, prefixo 72a5 para não colidir com outros arquivos ──
const CLINICA_A = "72a50000-0000-0000-0000-0000000000a1";
const CLINICA_B = "72a50000-0000-0000-0000-0000000000b1";
const TERAPEUTA_A = "72a50000-0000-0000-0000-0000000000a2";
const TERAPEUTA_B = "72a50000-0000-0000-0000-0000000000b2";
const PACIENTE_A = "72a50000-0000-0000-0000-0000000000a3";
const PACIENTE_B = "72a50000-0000-0000-0000-0000000000b3";
const SESSAO_A = "72a50000-0000-0000-0000-0000000000a4";
const SESSAO_B = "72a50000-0000-0000-0000-0000000000b4";

const CLIPE_A1 = "72a50000-0000-0000-0000-0000000000c1";
const CLIPE_B1 = "72a50000-0000-0000-0000-0000000000c2";
const CLIPE_A_ANTIGO = "72a50000-0000-0000-0000-0000000000c3";
const CLIPE_A_NOVO = "72a50000-0000-0000-0000-0000000000c4";
const CLIPE_A_ESTOURADO = "72a50000-0000-0000-0000-0000000000c5";
const CLIPE_A_TETO = "72a50000-0000-0000-0000-0000000000c6";

/** Todo clipe que qualquer teste deste arquivo possa ter plantado. */
const TODOS_OS_CLIPES = [
  CLIPE_A1,
  CLIPE_B1,
  CLIPE_A_ANTIGO,
  CLIPE_A_NOVO,
  CLIPE_A_ESTOURADO,
  CLIPE_A_TETO,
];

type LinhaReservada = {
  id: string;
  clinic_id: string;
  objeto_ref: string | null;
  lote_id: string | null;
  ordem: number | null;
};

type EstadoClipe = {
  id: string;
  asr_status: string;
  tentativas: number;
  objeto_ref: string | null;
  transcricao_texto: string | null;
  transcrito_em: Date | null;
};

const ctx = (userId: string, clinicId: string): TenantContext =>
  ({ role: "coordenador", userId, clinicId }) as TenantContext;

/**
 * Conexão sob a role de APLICAÇÃO (`iris_app`, membro de `app_role`). É ela
 * que exercita o `GRANT EXECUTE ... TO app_role` das três funções: se o grant
 * sumisse, a chamada estouraria `42501` em vez de passar despercebida.
 */
const conexaoApp = () => postgres(process.env.DATABASE_URL!, { max: 1 });

/** Planta um clipe de `audio_capture` pela role DONA (só arranjo, nunca asserção). */
async function plantarClipe(opts: {
  id: string;
  clinicId: string;
  sessionId: string;
  asrStatus: string;
  tentativas: number;
  objetoRef: string | null;
  criadoEm: Date;
  ordem?: number;
  loteId?: string | null;
}) {
  await owner!`INSERT INTO audio_capture
      (id, session_id, clinic_id, status_upload, objeto_ref, criado_em,
       lote_id, ordem, asr_status, tentativas)
    VALUES (
      ${opts.id}, ${opts.sessionId}, ${opts.clinicId}, 'confirmado',
      ${opts.objetoRef}, ${opts.criadoEm},
      ${opts.loteId ?? null}, ${opts.ordem ?? 0},
      ${opts.asrStatus}::asr_status, ${opts.tentativas}
    )`;
}

/** Lê o estado bruto de um clipe pela role dona — leitura de VERIFICAÇÃO, não de produto. */
async function lerClipe(id: string): Promise<EstadoClipe> {
  const linhas = await owner!<EstadoClipe[]>`
    SELECT id, asr_status::text AS asr_status, tentativas, objeto_ref,
           transcricao_texto, transcrito_em
      FROM audio_capture WHERE id = ${id}`;
  if (!linhas[0]) throw new Error(`clipe ${id} sumiu do banco`);
  return linhas[0];
}

const agora = Date.now();
const minutosAtras = (n: number) => new Date(agora - n * 60_000);

describe.skipIf(!hasDb)("#72 · fila de ASR (0136) — RLS e reserva", () => {
  beforeAll(async () => {
    await owner!`INSERT INTO clinic (id, nome, is_demo) VALUES
      (${CLINICA_A}, 'Clínica ASR 72asr A', false),
      (${CLINICA_B}, 'Clínica ASR 72asr B', false)`;

    await owner!`INSERT INTO app_user (id, name, email) VALUES
      (${TERAPEUTA_A}, 'Terapeuta 72asr A', 'terapeuta.a.72asr@iris.test'),
      (${TERAPEUTA_B}, 'Terapeuta 72asr B', 'terapeuta.b.72asr@iris.test')`;

    await owner!`INSERT INTO user_role (user_id, clinic_id, papel) VALUES
      (${TERAPEUTA_A}, ${CLINICA_A}, 'coordenador'),
      (${TERAPEUTA_B}, ${CLINICA_B}, 'coordenador')`;

    await owner!`INSERT INTO patient (id, clinic_id, nome) VALUES
      (${PACIENTE_A}, ${CLINICA_A}, 'Paciente 72asr A'),
      (${PACIENTE_B}, ${CLINICA_B}, 'Paciente 72asr B')`;

    await owner!`INSERT INTO session
        (id, clinic_id, patient_id, terapeuta_id, agendada_para, estado, disciplina)
      VALUES
        (${SESSAO_A}, ${CLINICA_A}, ${PACIENTE_A}, ${TERAPEUTA_A}, now(), 'realizada', 'desconhecida'),
        (${SESSAO_B}, ${CLINICA_B}, ${PACIENTE_B}, ${TERAPEUTA_B}, now(), 'realizada', 'desconhecida')`;
  });

  afterEach(async () => {
    // Fila zerada entre testes: `app_asr_reservar` não tem predicado de
    // escopo, então um clipe esquecido `na_fila` contaminaria a janela do
    // `LIMIT` do teste seguinte.
    await owner!`DELETE FROM audio_capture WHERE id = ANY(${TODOS_OS_CLIPES}::uuid[])`;
  });

  afterAll(async () => {
    // DELETE escopado, ordem inversa das FKs — nunca TRUNCATE.
    await owner!`DELETE FROM audio_capture WHERE id = ANY(${TODOS_OS_CLIPES}::uuid[])`;
    await owner!`DELETE FROM session WHERE id IN (${SESSAO_A}, ${SESSAO_B})`;
    await owner!`DELETE FROM patient WHERE id IN (${PACIENTE_A}, ${PACIENTE_B})`;
    await owner!`DELETE FROM user_role WHERE user_id IN (${TERAPEUTA_A}, ${TERAPEUTA_B})`;
    await owner!`DELETE FROM app_user WHERE id IN (${TERAPEUTA_A}, ${TERAPEUTA_B})`;
    await owner!`DELETE FROM clinic WHERE id IN (${CLINICA_A}, ${CLINICA_B})`;
    await owner?.end();
  });

  test("(a) app_role da clínica A não enxerga clipe de audio_capture da clínica B", async () => {
    await plantarClipe({
      id: CLIPE_A1,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/a1.webm",
      criadoEm: minutosAtras(10),
    });
    await plantarClipe({
      id: CLIPE_B1,
      clinicId: CLINICA_B,
      sessionId: SESSAO_B,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/b1.webm",
      criadoEm: minutosAtras(10),
    });

    // A leitura vai por `withTenant` (role de app + GUCs), não pela role dona:
    // é a policy `audio_select` que precisa estar de pé, e ela não se aplica a
    // quem tem BYPASSRLS.
    const visiveisDeA = (await withTenant(ctx(TERAPEUTA_A, CLINICA_A), (db) =>
      db.execute(
        sql`SELECT id FROM audio_capture WHERE id IN (${CLIPE_A1}, ${CLIPE_B1})`,
      ),
    )) as unknown as { id: string }[];

    const visiveisDeB = (await withTenant(ctx(TERAPEUTA_B, CLINICA_B), (db) =>
      db.execute(
        sql`SELECT id FROM audio_capture WHERE id IN (${CLIPE_A1}, ${CLIPE_B1})`,
      ),
    )) as unknown as { id: string }[];

    expect(visiveisDeA.map((l) => l.id)).toEqual([CLIPE_A1]);
    expect(visiveisDeB.map((l) => l.id)).toEqual([CLIPE_B1]);
  });

  test("(b1) app_asr_reservar atravessa tenants num tick só", async () => {
    // O worker é global: se a reserva respeitasse tenant, ela veria FILA VAZIA
    // (nenhum `app.clinic_id` na sessão do job) e o job reportaria "nada a
    // fazer" para sempre, sem erro.
    await plantarClipe({
      id: CLIPE_A1,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/a1.webm",
      criadoEm: minutosAtras(10),
    });
    await plantarClipe({
      id: CLIPE_B1,
      clinicId: CLINICA_B,
      sessionId: SESSAO_B,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/b1.webm",
      criadoEm: minutosAtras(9),
    });

    const app = conexaoApp();
    try {
      const reservados = await app<
        LinhaReservada[]
      >`SELECT * FROM app_asr_reservar(10)`;
      const meus = reservados.filter((l) => TODOS_OS_CLIPES.includes(l.id));

      expect(meus.map((l) => l.id).sort()).toEqual([CLIPE_A1, CLIPE_B1].sort());
      // Duas clínicas distintas no MESMO tick — é isso que "cross-tenant" quer
      // dizer aqui, e é o que o `clinic_id` de saída serve para provar.
      expect(new Set(meus.map((l) => l.clinic_id)).size).toBe(2);
      // O `objeto_ref` sai na reserva porque é o que o worker vai baixar.
      expect(meus.every((l) => l.objeto_ref !== null)).toBe(true);
    } finally {
      await app.end();
    }

    // A reserva marca `transcrevendo` e cobra a tentativa NA RESERVA — worker
    // morto no meio do processamento não volta ao conjunto elegível com o
    // mesmo contador.
    for (const id of [CLIPE_A1, CLIPE_B1]) {
      const clipe = await lerClipe(id);
      expect(clipe.asr_status).toBe("transcrevendo");
      expect(clipe.tentativas).toBe(1);
    }
  });

  test("(b2) dois ticks concorrentes não reservam a mesma linha (SKIP LOCKED)", async () => {
    await plantarClipe({
      id: CLIPE_A_ANTIGO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/antigo.webm",
      criadoEm: minutosAtras(30),
    });
    await plantarClipe({
      id: CLIPE_A_NOVO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/novo.webm",
      criadoEm: minutosAtras(20),
    });

    const tick1 = conexaoApp();
    const tick2 = conexaoApp();
    let idsTick1: string[] = [];
    let idsTick2: string[] = [];
    try {
      // A transação do tick 1 fica ABERTA enquanto o tick 2 chama: é a única
      // forma de o lock do primeiro ainda existir quando o segundo escolhe.
      // Sem `SKIP LOCKED` o tick 2 bloquearia até o commit e devolveria a
      // MESMA linha — clipe transcrito duas vezes, tentativa cobrada em dobro.
      await tick1.begin(async (tx) => {
        const r1 = await tx<
          LinhaReservada[]
        >`SELECT * FROM app_asr_reservar(1)`;
        idsTick1 = r1.map((l) => l.id);

        const r2 = await tick2<
          LinhaReservada[]
        >`SELECT * FROM app_asr_reservar(1)`;
        idsTick2 = r2.map((l) => l.id);
      });
    } finally {
      await tick1.end();
      await tick2.end();
    }

    expect(idsTick1).toEqual([CLIPE_A_ANTIGO]); // ORDER BY criado_em ASC
    expect(idsTick2).toEqual([CLIPE_A_NOVO]); // pulou o que o tick 1 travou
    expect(idsTick2).not.toContain(CLIPE_A_ANTIGO);
  });

  test("(c) clipe no teto de tentativas não ocupa a janela do LIMIT", async () => {
    // ESTE É O TESTE QUE MORDE A MUTAÇÃO DE MOVER `AND c.tentativas < 3` DA
    // SUBQUERY DO `LIMIT` PARA O `WHERE` EXTERNO.
    // O clipe estourado é o MAIS ANTIGO de propósito: com o teto no WHERE de
    // fora, a subquery ainda o escolheria (é o primeiro do `ORDER BY
    // criado_em ASC`), o filtro externo o descartaria depois, e
    // `app_asr_reservar(1)` devolveria ZERO linhas — a fila travaria para
    // sempre, sem erro nenhum (memória `varredura-filtro-depois-do-limit`).
    // Com o teto DENTRO da subquery, o estourado nem é escolhido e o elegível
    // mais novo sobe.
    await plantarClipe({
      id: CLIPE_A_ESTOURADO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 3,
      objetoRef: "asr/72asr/estourado.webm",
      criadoEm: minutosAtras(60),
    });
    await plantarClipe({
      id: CLIPE_A_NOVO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/novo.webm",
      criadoEm: minutosAtras(5),
    });

    const app = conexaoApp();
    try {
      const reservados = await app<
        LinhaReservada[]
      >`SELECT * FROM app_asr_reservar(1)`;
      expect(reservados.map((l) => l.id)).toEqual([CLIPE_A_NOVO]);
    } finally {
      await app.end();
    }

    // O estourado continua intocado na fila — não foi reservado nem teve
    // tentativa cobrada.
    const estourado = await lerClipe(CLIPE_A_ESTOURADO);
    expect(estourado.asr_status).toBe("na_fila");
    expect(estourado.tentativas).toBe(3);
  });

  test("(d) app_asr_falhar no teto marca `falhou` definitivo e zera objeto_ref", async () => {
    // `objeto_ref = NULL` não é cosmético: o objeto efêmero já foi apagado
    // pelo `finally` do worker (R11). Deixar a referência faria toda leitura
    // futura (exportação, expurgo, suporte) tratar como "áudio disponível".
    await plantarClipe({
      id: CLIPE_A_TETO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "transcrevendo",
      tentativas: 3,
      objetoRef: "asr/72asr/teto.webm",
      criadoEm: minutosAtras(15),
    });

    const app = conexaoApp();
    try {
      const [linha] = await app<
        { app_asr_falhar: number }[]
      >`SELECT app_asr_falhar(${CLIPE_A_TETO}::uuid) AS app_asr_falhar`;
      expect(linha!.app_asr_falhar).toBe(1);
    } finally {
      await app.end();
    }

    const clipe = await lerClipe(CLIPE_A_TETO);
    expect(clipe.asr_status).toBe("falhou");
    expect(clipe.objeto_ref).toBeNull();
    expect(clipe.tentativas).toBe(3);
  });

  test("(503) app_asr_falhar(id, true) no teto devolve à fila com tentativas = 2", async () => {
    // Caminho do `503` do serviço ASR — SATURAÇÃO DA VPS, não defeito do
    // clipe: o áudio nunca chegou a ser processado. Como a reserva já cobrou a
    // tentativa, deixar como está condenaria a `falhou` um clipe que nunca foi
    // transcrito. Mutação que precisa derrubar este teste: trocar
    // `greatest(tentativas - 1, 0)` por `tentativas` — o clipe voltaria a
    // `na_fila` com 3 e o teto o barraria no tick seguinte, para sempre.
    await plantarClipe({
      id: CLIPE_A_TETO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "transcrevendo",
      tentativas: 3,
      objetoRef: "asr/72asr/teto.webm",
      criadoEm: minutosAtras(15),
    });

    const app = conexaoApp();
    try {
      const [linha] = await app<
        { app_asr_falhar: number }[]
      >`SELECT app_asr_falhar(${CLIPE_A_TETO}::uuid, true) AS app_asr_falhar`;
      expect(linha!.app_asr_falhar).toBe(1);
    } finally {
      await app.end();
    }

    const clipe = await lerClipe(CLIPE_A_TETO);
    expect(clipe.asr_status).toBe("na_fila");
    expect(clipe.tentativas).toBe(2);
    // O objeto NÃO é zerado neste ramo: quem reescreve `objeto_ref` no retorno
    // à fila é o reenvio, não esta função.
    expect(clipe.objeto_ref).toBe("asr/72asr/teto.webm");
  });
});
