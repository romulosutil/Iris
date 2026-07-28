import postgres from "postgres";

/**
 * #122 — Script de Smoke Test de Escalonamento de Alerta de Risco Clínico.
 *
 * Valida de ponta a ponta as transições dos Estágios 1 e 2 do motor de
 * escalonamento (`alerta_risco_clinico`), além da gravação da trilha no `audit_log`.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node scripts/smoke-alerta-risco.mjs [--dry-run]
 */

const dbUrl =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.ESCALONAMENTO_DATABASE_URL;

if (!dbUrl) {
  console.error("❌ ERRO: Nenhuma URL de banco especificada (DATABASE_URL ou MIGRATION_DATABASE_URL).");
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");
const sql = postgres(dbUrl, { max: 1 });

async function runSmokeTest() {
  console.log(`[smoke-alerta-risco] Iniciando teste de fumaça (${isDryRun ? "DRY-RUN" : "EXECUÇÃO REAL"})...`);

  try {
    // 1. Localizar uma sessão válida no banco para vincular o alerta
    const sessoes = await sql`
      SELECT s.id, s.clinic_id, s.patient_id
        FROM session s
       WHERE s.deletado_em IS NULL
       LIMIT 1
    `;

    if (sessoes.length === 0) {
      console.warn("⚠️ Nenhuma sessão encontrada no banco. Crie dados sintéticos ou rode o seed antes do smoke test.");
      await sql.end();
      process.exit(0);
    }

    const { id: sessionId, clinic_id: clinicId, patient_id: patientId } = sessoes[0];

    // 2. Inserir alerta sintético já vencido
    console.log("-> 1/6 Inserindo alerta sintético em aberto (vencido há 1 min)...");
    const [alerta] = await sql`
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
      console.log("-> DRY-RUN: Limpando alerta de teste...");
      await sql`DELETE FROM alerta_risco_clinico WHERE id = ${alerta.id}`;
      console.log("✓ Smoke test em modo dry-run finalizado com sucesso.");
      await sql.end();
      return;
    }

    // 3. Executar o motor de escalonamento para o Estágio 1
    console.log("-> 2/6 Executando motor de escalonamento (Estágio 1 esperável)...");
    const [resEstagio1] = await sql`SELECT app_escalonar_risco_vencidos() AS escalados`;
    console.log(`   ✓ Motor executado. Alertas afetados: ${resEstagio1.escalados}`);

    const [alertaEstagio1] = await sql`
      SELECT id, status, escalado_em, escalado_estagio_2_em, canais_notificados
        FROM alerta_risco_clinico
       WHERE id = ${alerta.id}
    `;

    if (alertaEstagio1.status !== "escalado_estagio_1") {
      throw new Error(`Esperado status 'escalado_estagio_1', obtido: '${alertaEstagio1.status}'`);
    }
    console.log(`   ✓ Transição para Estágio 1 OK: status=${alertaEstagio1.status}, escalado_em=${alertaEstagio1.escalado_em}`);

    // 4. Simular vencimento para o Estágio 2 (2x o prazo_minutos = 30 min)
    console.log("-> 3/6 Forçando vencimento do prazo do Estágio 2 (vencido há 31 min)...");
    await sql`
      UPDATE alerta_risco_clinico
         SET prazo_reconhecimento = now() - interval '31 minutes'
       WHERE id = ${alerta.id}
    `;

    // 5. Executar o motor de escalonamento para o Estágio 2
    console.log("-> 4/6 Executando motor de escalonamento (Estágio 2 esperável)...");
    const [resEstagio2] = await sql`SELECT app_escalonar_risco_vencidos() AS escalados`;
    console.log(`   ✓ Motor executado. Alertas afetados: ${resEstagio2.escalados}`);

    const [alertaEstagio2] = await sql`
      SELECT id, status, escalado_em, escalado_estagio_2_em, canais_notificados
        FROM alerta_risco_clinico
       WHERE id = ${alerta.id}
    `;

    if (alertaEstagio2.status !== "escalado_estagio_2") {
      throw new Error(`Esperado status 'escalado_estagio_2', obtido: '${alertaEstagio2.status}'`);
    }
    console.log(`   ✓ Transição para Estágio 2 OK: status=${alertaEstagio2.status}, escalado_estagio_2_em=${alertaEstagio2.escalado_estagio_2_em}`);

    // 6. Verificar a trilha no audit_log
    console.log("-> 5/6 Verificando registros no audit_log...");
    const logs = await sql`
      SELECT acao, detalhe, criado_em
        FROM audit_log
       WHERE entidade = 'alerta_risco_clinico' AND entidade_id = ${alerta.id}
       ORDER BY criado_em ASC
    `;

    if (logs.length < 2) {
      throw new Error(`Esperado pelo menos 2 registros no audit_log, obtido: ${logs.length}`);
    }
    console.log(`   ✓ Trilha no audit_log OK (${logs.length} eventos registrados). Ações: ${logs.map(l => l.acao).join(", ")}`);

    // 7. Limpeza
    console.log("-> 6/6 Limpando dados do teste sintético...");
    await sql`DELETE FROM audit_log WHERE entidade = 'alerta_risco_clinico' AND entidade_id = ${alerta.id}`;
    await sql`DELETE FROM alerta_risco_clinico WHERE id = ${alerta.id}`;
    console.log("   ✓ Limpeza concluída.");

    console.log("✅ SMOKE TEST DO ESCALONAMENTO PASSOU COM SUCESSO!");
  } catch (err) {
    console.error("❌ FALHA NO SMOKE TEST:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

runSmokeTest();
