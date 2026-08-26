#!/usr/bin/env node
/**
 * Detector de alarme automático de parada de job de infra (#294).
 *
 * UMA varredura e SAI — o laço é responsabilidade de infra/alarme/agendador.sh
 * (mesmo desenho de escalonamento/arquivamento/retencao).
 *
 * Dedup: cada checagem que falha só dispara e-mail UMA VEZ POR DIA UTC —
 * marcador `.alertado-<motivo>-YYYY-MM-DD` em ALARME_HEARTBEAT_DIR, mesmo
 * padrão do `.ultimo-backup-YYYY-MM-DD` do serviço de backup. Sem isso, um
 * problema persistente vira um e-mail por hora para sempre.
 *
 * LIMITE CONHECIDO E ACEITO: a janela é o dia UTC, não 24h corridas. Um
 * problema que alerta às 23h50 alerta de novo às 00h10. Preferido a uma
 * janela deslizante porque o marcador é legível a olho no Console do
 * Easypanel e some sozinho com o dia — e um e-mail a mais na virada é falha
 * na direção certa para um alarme.
 *
 * O marcador só é gravado depois de um envio BEM-SUCEDIDO: falha de envio
 * tem que reentrar no tick seguinte, senão o dedup silencia o alarme que
 * nunca chegou.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import postgres from "postgres";

export function hojeUTC() {
  return new Date().toISOString().slice(0, 10);
}

export async function deveAlertar(heartbeatDir, motivo, hoje) {
  const arquivos = await readdir(heartbeatDir).catch(() => []);
  return !arquivos.includes(`.alertado-${motivo}-${hoje}`);
}

export async function marcarAlertado(heartbeatDir, motivo, hoje) {
  await mkdir(heartbeatDir, { recursive: true });
  await writeFile(
    `${heartbeatDir}/.alertado-${motivo}-${hoje}`,
    new Date().toISOString(),
  );
}

const LIMITE_BILLING = "2 hours";
const LIMITE_ESCALONAMENTO = "10 minutes";

/**
 * Ciclo de faturamento vencido e ainda `aberto` = iris-billing parado.
 * A folga de 2h é a mesma da consulta manual documentada em infra/README.md
 * (#288) — tempo de sobra para um restart normal do serviço.
 *
 * ATENÇÃO ao ler o resultado: `fecharCiclosVencendo` abre o ciclo N+1 na mesma
 * passada em que fecha o N, então um `billing_cycle` com status `aberto` e
 * `fim` NO FUTURO é o estado normal. Só o `fim` VENCIDO acusa parada — é por
 * isso que o predicado vive na função da 0129 e não é reinventado aqui.
 */
export async function verificarBilling(sql) {
  try {
    const [linha] =
      await sql`SELECT * FROM app_alarme_billing_atrasado(${LIMITE_BILLING}::interval)`;
    if (!linha || linha.total === 0) {
      return { estado: "ok", motivo: "billing", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "billing",
      detalhe: `${linha.total} ciclo(s) de faturamento vencido(s) há mais de ${LIMITE_BILLING} sem fechar. Mais antigo: clínica ${linha.primeira_clinic_id}, venceu em ${new Date(linha.primeiro_vencimento).toISOString()}.`,
    };
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "billing",
      detalhe: `não foi possível checar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Alerta de risco com prazo de reconhecimento vencido e ainda `aberto` =
 * iris-escalonamento parado. 10min = 10x o tick de 60s do motor: folga para
 * restart normal, curto o bastante para o prazo clínico não passar batido.
 *
 * O `detalhe` NUNCA carrega paciente, categoria ou trecho — a função da 0129
 * não devolve isso, por desenho.
 */
export async function verificarEscalonamento(sql) {
  try {
    const [linha] =
      await sql`SELECT * FROM app_alarme_escalonamento_atrasado(${LIMITE_ESCALONAMENTO}::interval)`;
    if (!linha || linha.total === 0) {
      return { estado: "ok", motivo: "escalonamento", detalhe: "" };
    }
    return {
      estado: "problema",
      motivo: "escalonamento",
      detalhe: `${linha.total} alerta(s) de risco com prazo de reconhecimento vencido há mais de ${LIMITE_ESCALONAMENTO} sem escalar. Mais antigo: clínica ${linha.primeira_clinic_id}, venceu em ${new Date(linha.primeiro_vencimento).toISOString()}.`,
    };
  } catch (err) {
    return {
      estado: "indeterminado",
      motivo: "escalonamento",
      detalhe: `não foi possível checar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function abrirConexao(databaseUrl) {
  return postgres(databaseUrl, { max: 1 });
}
