import postgres from "postgres";

/**
 * #122 — Smoke test do motor de escalonamento de alerta de risco clínico.
 *
 * Valida de ponta a ponta as transições dos Estágios 1 e 2
 * (`app_escalonar_risco_vencidos`) e a gravação da trilha no `audit_log`.
 *
 * ── POR QUE PRECISA DA ROLE DONA ──────────────────────────────────────────
 * O script NÃO roda com a URL da aplicação. A migração 0049 fecha três portas
 * para `app_role` de propósito:
 *   1. `alerta_risco_clinico` não tem GRANT de INSERT (criar alerta é
 *      privilégio do caminho do agente, via `app_criar_alerta_risco`);
 *   2. a tabela é `FORCE ROW LEVEL SECURITY` e a policy exige contexto de
 *      tenant (`app.clinic_id`, `app.user_role`), que um script não tem;
 *   3. `app_escalonar_risco_vencidos()` só tem EXECUTE para
 *      `iris_escalonamento`.
 * Por isso o script exige `SMOKE_DATABASE_URL` ou `MIGRATION_DATABASE_URL`
 * (role dona). `DATABASE_URL` é ignorada de propósito: além de ser a role
 * errada, é a variável que aponta para produção em `.env.local`.
 *
 * ── POR QUE NÃO SOBRA LIXO ────────────────────────────────────────────────
 * Tudo roda dentro de UMA transação que SEMPRE termina em ROLLBACK. Nada é
 * commitado: nem o alerta sintético, nem as linhas de `audit_log`. Assim o
 * teste não precisa deletar do `audit_log` — que é a trilha imutável do
 * projeto — para se limpar.
 *
 * Uso:
 *   SMOKE_AMBIENTE_TESTE=1 \
 *   SMOKE_DATABASE_URL=postgres://iris:...@localhost:5433/iris \
 *   node scripts/smoke-alerta-risco.mjs [--dry-run]
 *
 * `--dry-run` para logo após inserir o alerta sintético (valida conexão,
 * permissões e schema sem exercitar o motor). O rollback vale para os dois modos.
 */

const dbUrl = process.env.SMOKE_DATABASE_URL || process.env.MIGRATION_DATABASE_URL;

if (!dbUrl) {
  console.error(
    "❌ ERRO: defina SMOKE_DATABASE_URL (ou MIGRATION_DATABASE_URL) com a role DONA do banco.\n" +
      "   DATABASE_URL não serve: é a role da aplicação, que não tem INSERT em alerta_risco_clinico\n" +
      "   nem EXECUTE em app_escalonar_risco_vencidos().",
  );
  process.exit(1);
}

// O script escreve alerta sintético e trilha de escalonamento. Mesmo com o
// rollback garantido, exigir o aceite explícito evita apontá-lo para produção
// por descuido (a `.env.local` do projeto tem a URL de produção).
if (process.env.SMOKE_AMBIENTE_TESTE !== "1") {
  console.error(
    "❌ ERRO: rode SOMENTE em ambiente de teste. Confirme com SMOKE_AMBIENTE_TESTE=1.",
  );
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");
const sql = postgres(dbUrl, { max: 1 });

// Sentinela: força o ROLLBACK da transação sem sinalizar falha do teste.
const ROLLBACK_OK = Symbol("rollback-ok");

async function runSmokeTest() {
  console.log(
    `[smoke-alerta-risco] Iniciando teste de fumaça (${isDryRun ? "DRY-RUN" : "EXECUÇÃO COMPLETA"}). ` +
      "Tudo roda em transação com ROLLBACK ao final.",
  );

  await sql.begin(async (tx) => {
    // 1. Localizar uma sessão válida no banco para vincular o alerta.
    //    `session` não tem soft-delete (0003) — não há `deletado_em` a filtrar.
    const sessoes = await tx`
      SELECT s.id, s.clinic_id, s.patient_id
        FROM session s
       LIMIT 1
    `;

    if (sessoes.length === 0) {
      // Falha, não sucesso: um smoke test que não tem o que testar não passou.
      throw new Error(
        "Nenhuma sessão encontrada no banco. Rode o seed (pnpm seed:clinic) antes do smoke test.",
      );
    }

    const { id: sessionId, clinic_id: clinicId, patient_id: patientId } = sessoes[0];

    // 2. Inserir alerta sintético já vencido. `prazo_minutos = 15` é o prazo
    //    real de `ideacao_ativa_com_plano` em `app_prazo_risco_minutos` (0049).
    console.log("-> 1/5 Inserindo alerta sintético em aberto (vencido há 1 min)...");
    const [alerta] = await tx`
      INSERT INTO alerta_risco_clinico (
        clinic_id, patient_id, session_id,
        categoria, severidade, certeza, trecho_fonte, detalhe,
        prazo_minutos, prazo_reconhecimento
      ) VALUES (
        ${clinicId}, ${patientId}, ${sessionId},
        'ideacao_suicida', 'ideacao_ativa_com_plano', 'explicito',
        '[smoke-test-sintetico-122]', '[teste de fumaca automatizado]',
        15, now() - interval '1 minute'
      )
      RETURNING id, status;
    `;

    console.log(`   ✓ Alerta criado: id=${alerta.id}, status=${alerta.status}`);

    if (isDryRun) {
      console.log("✓ DRY-RUN concluído (conexão, permissões e schema OK). Revertendo...");
      throw ROLLBACK_OK;
    }

    // 3. Executar o motor para o Estágio 1.
    //    `app_escalonar_risco_vencidos()` RETURNS TABLE — é função de conjunto,
    //    então tem que ir no FROM. Chamada na lista do SELECT devolveria uma
    //    linha composta por alerta escalado (e nenhuma linha quando não há
    //    nenhum), não a contagem.
    console.log("-> 2/5 Executando motor de escalonamento (Estágio 1 esperado)...");
    const [resEstagio1] = await tx`
      SELECT count(*)::int AS escalados FROM app_escalonar_risco_vencidos()
    `;
    console.log(`   ✓ Motor executado. Alertas escalados nesta varredura: ${resEstagio1.escalados}`);

    const [alertaEstagio1] = await tx`
      SELECT id, status, escalado_em, canais_notificados
        FROM alerta_risco_clinico
       WHERE id = ${alerta.id}
    `;

    if (alertaEstagio1.status !== "escalado_estagio_1") {
      throw new Error(`Esperado status 'escalado_estagio_1', obtido: '${alertaEstagio1.status}'`);
    }
    console.log(
      `   ✓ Transição para Estágio 1 OK: escalado_em=${alertaEstagio1.escalado_em}, ` +
        `canais=${JSON.stringify(alertaEstagio1.canais_notificados)}`,
    );

    // 4. Forçar o vencimento do 2º prazo. O motor compara
    //    `now() >= prazo_reconhecimento + prazo_minutos`, ou seja, 2× o prazo
    //    original contado do mesmo marco — por isso mexemos em
    //    `prazo_reconhecimento`, não em `escalado_em`.
    console.log("-> 3/5 Forçando vencimento do prazo do Estágio 2 (vencido há 31 min)...");
    await tx`
      UPDATE alerta_risco_clinico
         SET prazo_reconhecimento = now() - interval '31 minutes'
       WHERE id = ${alerta.id}
    `;

    console.log("-> 4/5 Executando motor de escalonamento (Estágio 2 esperado)...");
    const [resEstagio2] = await tx`
      SELECT count(*)::int AS escalados FROM app_escalonar_risco_vencidos()
    `;
    console.log(`   ✓ Motor executado. Alertas escalados nesta varredura: ${resEstagio2.escalados}`);

    const [alertaEstagio2] = await tx`
      SELECT id, status, escalado_estagio_2_em, canais_notificados
        FROM alerta_risco_clinico
       WHERE id = ${alerta.id}
    `;

    if (alertaEstagio2.status !== "escalado_estagio_2") {
      throw new Error(`Esperado status 'escalado_estagio_2', obtido: '${alertaEstagio2.status}'`);
    }
    console.log(
      `   ✓ Transição para Estágio 2 OK: escalado_estagio_2_em=${alertaEstagio2.escalado_estagio_2_em}, ` +
        `canais=${JSON.stringify(alertaEstagio2.canais_notificados)}`,
    );

    // 5. Trilha imutável (§4.2.1, ação 4): um evento por escalonamento, com
    //    `ator_id` nulo (ação automática, sem humano).
    console.log("-> 5/5 Verificando registros no audit_log...");
    // Ordena pelo estágio, não por `criado_em`: os dois eventos nascem na MESMA
    // transação, e `now()` é constante dentro dela — os timestamps são iguais.
    const logs = await tx`
      SELECT acao, ator_id, detalhe, criado_em
        FROM audit_log
       WHERE entidade = 'alerta_risco_clinico' AND entidade_id = ${alerta.id}
       ORDER BY (detalhe->>'estagio')::int ASC NULLS FIRST
    `;

    const escalonamentos = logs.filter((l) => l.acao === "alerta_risco_escalado");
    if (escalonamentos.length !== 2) {
      throw new Error(
        `Esperados 2 eventos 'alerta_risco_escalado' no audit_log, obtidos: ${escalonamentos.length} ` +
          `(ações registradas: ${logs.map((l) => l.acao).join(", ") || "nenhuma"})`,
      );
    }

    const estagios = escalonamentos.map((l) => l.detalhe?.estagio);
    if (estagios[0] !== 1 || estagios[1] !== 2) {
      throw new Error(`Esperados estágios [1, 2] na trilha, obtidos: [${estagios.join(", ")}]`);
    }
    if (escalonamentos.some((l) => l.ator_id !== null)) {
      throw new Error("Trilha de escalonamento deveria ter ator_id NULL (ação automática do sistema).");
    }
    console.log("   ✓ Trilha no audit_log OK: 2 eventos, estágios [1, 2], ator_id nulo.");

    console.log("✅ SMOKE TEST DO ESCALONAMENTO PASSOU. Revertendo a transação...");
    throw ROLLBACK_OK;
  });
}

try {
  await runSmokeTest();
} catch (err) {
  if (err === ROLLBACK_OK) {
    console.log("↩️  Rollback concluído — nenhum dado sintético foi commitado.");
  } else {
    console.error("❌ FALHA NO SMOKE TEST:", err);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
