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
const CLIPE_A_REVERSOES = "72a50000-0000-0000-0000-0000000000c7";
const CLIPE_A_PRESO = "72a50000-0000-0000-0000-0000000000c8";
const CLIPE_A_RESGATAVEL = "72a50000-0000-0000-0000-0000000000c9";
const CLIPE_A_RESGATE_VENCIDO = "72a50000-0000-0000-0000-0000000000ca";
const CLIPE_A_MIME = "72a50000-0000-0000-0000-0000000000cb";

/** Todo clipe que qualquer teste deste arquivo possa ter plantado. */
const TODOS_OS_CLIPES = [
  CLIPE_A1,
  CLIPE_B1,
  CLIPE_A_ANTIGO,
  CLIPE_A_NOVO,
  CLIPE_A_ESTOURADO,
  CLIPE_A_TETO,
  CLIPE_A_REVERSOES,
  CLIPE_A_PRESO,
  CLIPE_A_RESGATAVEL,
  CLIPE_A_RESGATE_VENCIDO,
  CLIPE_A_MIME,
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
  reversoes: number;
  objeto_ref: string | null;
  falhou_em: Date | null;
  transcricao_texto: string | null;
  transcrito_em: Date | null;
};

const ctx = (userId: string, clinicId: string): TenantContext =>
  ({ role: "coordenador", userId, clinicId }) as TenantContext;

const LOGIN_WORKER = "iris_asr_worker_login_72asr";
const SENHA_WORKER = "iris_asr_worker_login_teste_72asr";

/**
 * Conexão sob a role de APLICAÇÃO (`iris_app`, membro de `app_role`) — o papel
 * de toda requisição web logada. Depois da `0140` (#494/T18) ela NÃO pode mais
 * executar as três funções cross-tenant: é essa recusa que o teste (T18) prova.
 */
const conexaoApp = () => postgres(process.env.DATABASE_URL!, { max: 1 });

/**
 * Conexão sob o papel DEDICADO do worker (`iris_asr_worker`, migração 0140).
 * É por aqui que a fila é exercitada desde o T18 — a rota do worker usa
 * `ASR_WORKER_DATABASE_URL` (`asrWorkerDb` em `src/db/client.ts`).
 *
 * A role de LOGIN é criada pelo `beforeAll` porque, como `iris_alarme_login`
 * (0129) e `iris_retencao`, ela é provisionamento de AMBIENTE (tem senha), não
 * objeto versionado — e o CI não tem outro lugar que a crie.
 */
const conexaoWorker = () =>
  postgres(
    process.env.MIGRATION_DATABASE_URL!.replace(
      /:\/\/[^@]+@/,
      `://${LOGIN_WORKER}:${SENHA_WORKER}@`,
    ),
    { max: 1 },
  );

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
  reversoes?: number;
  falhouEm?: Date | null;
}) {
  await owner!`INSERT INTO audio_capture
      (id, session_id, clinic_id, status_upload, objeto_ref, criado_em,
       lote_id, ordem, asr_status, tentativas, reversoes, falhou_em)
    VALUES (
      ${opts.id}, ${opts.sessionId}, ${opts.clinicId}, 'confirmado',
      ${opts.objetoRef}, ${opts.criadoEm},
      ${opts.loteId ?? null}, ${opts.ordem ?? 0},
      ${opts.asrStatus}::asr_status, ${opts.tentativas}, ${opts.reversoes ?? 0},
      ${opts.falhouEm ?? null}
    )`;
}

/** Lê o estado bruto de um clipe pela role dona — leitura de VERIFICAÇÃO, não de produto. */
async function lerClipe(id: string): Promise<EstadoClipe> {
  const linhas = await owner!<EstadoClipe[]>`
    SELECT id, asr_status::text AS asr_status, tentativas, reversoes, objeto_ref,
           falhou_em, transcricao_texto, transcrito_em
      FROM audio_capture WHERE id = ${id}`;
  if (!linhas[0]) throw new Error(`clipe ${id} sumiu do banco`);
  return linhas[0];
}

const agora = Date.now();
const minutosAtras = (n: number) => new Date(agora - n * 60_000);

describe.skipIf(!hasDb)("#72 · fila de ASR (0136) — RLS e reserva", () => {
  beforeAll(async () => {
    await owner!.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_WORKER}') THEN
          CREATE ROLE ${LOGIN_WORKER} LOGIN PASSWORD '${SENHA_WORKER}' IN ROLE iris_asr_worker;
        END IF;
      END
      $$;
    `);

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

    const app = conexaoWorker();
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

    const tick1 = conexaoWorker();
    const tick2 = conexaoWorker();
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

    const app = conexaoWorker();
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

  test("(d) app_asr_falhar no teto marca `falhou` definitivo e PRESERVA objeto_ref (0155)", async () => {
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

    const app = conexaoWorker();
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
    expect(clipe.tentativas).toBe(3);
    // `0155` — O ÁUDIO SOBREVIVE AO TETO. Esta linha era `toBeNull()`: o teto
    // de tentativas zerava `objeto_ref`, `app_asr_objetos_em_uso` deixava de
    // reivindicar a chave e o `finally` do worker apagava o áudio do MinIO no
    // mesmo tick. Falha de IA destruía documento clínico. Agora a referência
    // fica e o carimbo abre a janela de resgate.
    expect(clipe.objeto_ref).toBe("asr/72asr/teto.webm");
    expect(clipe.falhou_em).not.toBeNull();
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

    const app = conexaoWorker();
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
  // ─────────────────────────────────────────────────────────────────────────
  // #494 / T18 — o EXECUTE das três cross-tenant saiu de `app_role` (0140).
  // ─────────────────────────────────────────────────────────────────────────
  test("(T18) app_role recebe 42501 nas funções cross-tenant de mutação", async () => {
    // ESTE É O TESTE QUE MORDE A MUTAÇÃO DE REPOR
    // `GRANT EXECUTE ... TO app_role`. Sem ele, um `CREATE OR REPLACE` numa
    // migração futura reabriria o furo com diff limpo — replace PRESERVA a ACL,
    // então nada no arquivo denunciaria (memória
    // `create-or-replace-torna-diff-enganoso`).
    //
    // `42501` (insufficient_privilege) e não "0 linhas": a diferença é o ponto
    // do T18. Recusa do BANCO é fronteira; ausência de chamador é promessa da
    // camada de app, que envelhece na primeira Server Action distraída.
    const app = conexaoApp();
    try {
      await expect(
        app`SELECT * FROM app_asr_reservar(1)`,
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        app`SELECT app_asr_concluir(${CLIPE_A1}::uuid, 'texto injetado')`,
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        app`SELECT app_asr_falhar(${CLIPE_A1}::uuid, true)`,
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        app`SELECT app_asr_expirar_presos('6 hours'::interval)`,
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await app.end();
    }
  });

  test("(T18) app_asr_objetos_em_uso CONTINUA executável por app_role", async () => {
    // Contraponto obrigatório do teste acima: um `REVOKE` largo demais (varrer
    // todas as `app_asr_*`) quebraria o sweeper (T15), cuja credencial é membro
    // de `app_role` — e quebraria em PRODUÇÃO, não aqui, porque o sweeper roda
    // em outro serviço. Esta função cumpre a régua do 1 bit por chave e FICA.
    const app = conexaoApp();
    try {
      const linhas =
        await app`SELECT ref FROM app_asr_objetos_em_uso(ARRAY['asr/72asr/inexistente']::text[], '30 days'::interval)`;
      expect(linhas).toHaveLength(0);
    } finally {
      await app.end();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // #494 / T19 — 503 sustentado tem fim, e linha presa tem backstop de idade.
  // ─────────────────────────────────────────────────────────────────────────
  test("(T19a) abaixo do teto, falhar(true) reverte E conta a reversão", async () => {
    await plantarClipe({
      id: CLIPE_A_REVERSOES,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "transcrevendo",
      tentativas: 1,
      reversoes: 0,
      objetoRef: "asr/72asr/reversoes.webm",
      criadoEm: minutosAtras(15),
    });

    const app = conexaoWorker();
    try {
      await app`SELECT app_asr_falhar(${CLIPE_A_REVERSOES}::uuid, true)`;
    } finally {
      await app.end();
    }

    const clipe = await lerClipe(CLIPE_A_REVERSOES);
    expect(clipe.asr_status).toBe("na_fila");
    expect(clipe.tentativas).toBe(0);
    // O contador é o que dá FIM ao laço: sem incrementá-lo, o teto do teste
    // seguinte nunca seria alcançado e a reversão voltaria a ser infinita.
    expect(clipe.reversoes).toBe(1);
    expect(clipe.objeto_ref).toBe("asr/72asr/reversoes.webm");
  });

  test("(T19a) NO teto de reversões, falhar(true) para de reverter e cobra a tentativa", async () => {
    // ESTE É O TESTE QUE MORDE A REMOÇÃO DO TETO. Com `reversoes = 10` e
    // `tentativas = 3`, o comportamento anterior devolveria o clipe a `na_fila`
    // com `tentativas = 2` — para sempre, a cada 503, mantendo o objeto vivo no
    // bucket por `app_asr_objetos_em_uso` e violando R11 sem limite. Com o
    // teto, o clipe cai no caminho normal e TERMINA.
    await plantarClipe({
      id: CLIPE_A_REVERSOES,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "transcrevendo",
      tentativas: 3,
      reversoes: 10,
      objetoRef: "asr/72asr/reversoes.webm",
      criadoEm: minutosAtras(15),
    });

    const app = conexaoWorker();
    try {
      const [linha] = await app<
        { app_asr_falhar: number }[]
      >`SELECT app_asr_falhar(${CLIPE_A_REVERSOES}::uuid, true) AS app_asr_falhar`;
      expect(linha!.app_asr_falhar).toBe(1);
    } finally {
      await app.end();
    }

    const clipe = await lerClipe(CLIPE_A_REVERSOES);
    expect(clipe.asr_status).toBe("falhou");
    expect(clipe.tentativas).toBe(3);
    expect(clipe.reversoes).toBe(10); // não incrementa quando não reverte
    // `0155`: o objeto NÃO é mais solto aqui. Saturação sustentada continua
    // tendo fim (o clipe termina em `falhou`, que é o ponto do teto), mas o
    // áudio entra na janela de resgate em vez de ser apagado — é a infra que
    // não deu conta, e o áudio segue sendo documento clínico.
    expect(clipe.objeto_ref).toBe("asr/72asr/reversoes.webm");
    expect(clipe.falhou_em).not.toBeNull();
  });

  test("(T19b) app_asr_expirar_presos solta o objeto de linha velha, e só dela", async () => {
    // O backstop de idade que faltava. Havia um para o OBJETO (sweeper, 6h) e
    // nenhum para a LINHA — e era a linha que isentava o objeto: enquanto ela
    // dissesse `na_fila`, `app_asr_objetos_em_uso` respondia "em uso" e o
    // sweeper PRESERVAVA o áudio indefinidamente.
    await plantarClipe({
      id: CLIPE_A_PRESO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 1,
      objetoRef: "asr/72asr/preso.webm",
      criadoEm: minutosAtras(60 * 9), // 9h — fora da janela de 6h
    });
    await plantarClipe({
      id: CLIPE_A_NOVO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "na_fila",
      tentativas: 0,
      objetoRef: "asr/72asr/novo.webm",
      criadoEm: minutosAtras(30), // dentro da janela — NÃO pode ser tocado
    });

    const app = conexaoWorker();
    try {
      const [linha] = await app<
        { app_asr_expirar_presos: number }[]
      >`SELECT app_asr_expirar_presos('6 hours'::interval) AS app_asr_expirar_presos`;
      expect(linha!.app_asr_expirar_presos).toBeGreaterThanOrEqual(1);
    } finally {
      await app.end();
    }

    const preso = await lerClipe(CLIPE_A_PRESO);
    expect(preso.asr_status).toBe("falhou");
    // `0155`: idem ao teto — a linha presa também entra na janela de resgate.
    // Uma linha que ficou 9h em `na_fila` é o caso em que o clipe NUNCA foi
    // transcrito; perder o áudio aí seria puni-lo por falha de infraestrutura.
    expect(preso.objeto_ref).toBe("asr/72asr/preso.webm");
    expect(preso.falhou_em).not.toBeNull();

    // A metade que prova que o predicado de idade EXISTE: sem `criado_em <=
    // now() - p_idade`, a função varreria a fila inteira e este clipe legítimo
    // morreria junto.
    const novo = await lerClipe(CLIPE_A_NOVO);
    expect(novo.asr_status).toBe("na_fila");
    expect(novo.objeto_ref).toBe("asr/72asr/novo.webm");
  });
  // ─────────────────────────────────────────────────────────────────────────
  // `0155` — janela de resgate do áudio clínico e mime real do clipe (D71).
  // ─────────────────────────────────────────────────────────────────────────

  test("(0155) clipe `falhou` DENTRO da janela ainda é 'em uso' — o áudio não é apagado", async () => {
    // ESTE É O TESTE QUE MORDE A REGRESSÃO. Se `app_asr_falhar` voltar a zerar
    // `objeto_ref`, ou se `app_asr_objetos_em_uso` perder o ramo de `falhou`,
    // esta asserção vira vermelha — e é exatamente essa combinação que fazia o
    // `finally` do worker (e o sweeper) apagarem áudio clínico do MinIO depois
    // de 3 falhas de IA.
    await plantarClipe({
      id: CLIPE_A_RESGATAVEL,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "falhou",
      tentativas: 3,
      objetoRef: "asr/72asr/resgatavel.webm",
      criadoEm: minutosAtras(60 * 24 * 5),
      falhouEm: minutosAtras(60 * 24 * 5), // falhou há 5 dias, janela de 30
    });

    const app = conexaoApp();
    try {
      const linhas = await app`
        SELECT ref FROM app_asr_objetos_em_uso(
          ARRAY['asr/72asr/resgatavel.webm']::text[], '30 days'::interval)`;
      expect(linhas).toHaveLength(1);
    } finally {
      await app.end();
    }
  });

  test("(0155) passada a janela, o objeto é SOLTO — a janela tem fim", async () => {
    // A outra metade, e a que impede a "correção" de virar retenção eterna: o
    // bucket de ASR não tem expurgo LGPD, então preservar para sempre seria
    // esconder áudio de paciente fora de todo wiring de retenção.
    await plantarClipe({
      id: CLIPE_A_RESGATE_VENCIDO,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "falhou",
      tentativas: 3,
      objetoRef: "asr/72asr/vencido.webm",
      criadoEm: minutosAtras(60 * 24 * 40),
      falhouEm: minutosAtras(60 * 24 * 40), // 40 dias > janela de 30
    });
    // Planta TAMBÉM o clipe ainda dentro da janela: o `beforeEach` limpa a
    // tabela entre testes, então o contraponto tem que nascer aqui — depender
    // da linha do teste anterior daria um verde que só existe pela ordem de
    // execução.
    await plantarClipe({
      id: CLIPE_A_RESGATAVEL,
      clinicId: CLINICA_A,
      sessionId: SESSAO_A,
      asrStatus: "falhou",
      tentativas: 3,
      objetoRef: "asr/72asr/resgatavel.webm",
      criadoEm: minutosAtras(60 * 24 * 5),
      falhouEm: minutosAtras(60 * 24 * 5),
    });

    const app = conexaoWorker();
    try {
      const [linha] = await app<
        { app_asr_expirar_resgate: number }[]
      >`SELECT app_asr_expirar_resgate('30 days'::interval) AS app_asr_expirar_resgate`;
      expect(linha!.app_asr_expirar_resgate).toBeGreaterThanOrEqual(1);
    } finally {
      await app.end();
    }

    const vencido = await lerClipe(CLIPE_A_RESGATE_VENCIDO);
    expect(vencido.objeto_ref).toBeNull();
    // `asr_status` NÃO muda: `falhou` já é o desfecho correto. O que o expurgo
    // altera é só a posse do objeto.
    expect(vencido.asr_status).toBe("falhou");

    // E o clipe AINDA dentro da janela não foi levado junto — sem o predicado
    // `falhou_em <= now() - p_janela`, o expurgo varreria os dois.
    const vivo = await lerClipe(CLIPE_A_RESGATAVEL);
    expect(vivo.objeto_ref).toBe("asr/72asr/resgatavel.webm");
  });

  test("(D71) app_asr_reservar devolve o mime real gravado no clipe", async () => {
    // Sem isto o worker manda `Content-Type: audio/webm` para um clipe de
    // iPhone (`audio/mp4` AAC). Hoje inerte porque `servidor.py` detecta por
    // magic bytes; quebra no dia em que ele olhar o header.
    await owner!`INSERT INTO audio_capture
        (id, session_id, clinic_id, status_upload, objeto_ref, criado_em,
         lote_id, ordem, asr_status, tentativas, mime_type)
      VALUES (${CLIPE_A_MIME}, ${SESSAO_A}, ${CLINICA_A}, 'confirmado',
              'asr/72asr/mime.mp4', ${minutosAtras(1)}, NULL, 0,
              'na_fila'::asr_status, 0, 'audio/mp4')`;

    const app = conexaoWorker();
    try {
      const linhas = await app<
        { id: string; mime_type: string | null }[]
      >`SELECT id, mime_type FROM app_asr_reservar(50)`;
      const meu = linhas.find((l) => l.id === CLIPE_A_MIME);
      expect(meu?.mime_type).toBe("audio/mp4");
    } finally {
      await app.end();
    }
  });
});
