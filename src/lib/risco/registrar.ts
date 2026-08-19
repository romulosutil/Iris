import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import type { AlertaRiscoAgente } from "@/lib/extraction/agent-output-schema";
import {
  assertDestinatariosNoTenant,
  canaisIndisponiveis,
  destinatariosCriacao,
  destinatariosCriacaoPorResponsavel,
} from "./notificacao";

/** Trecho literal + categoria/severidade/certeza — mesma forma de `AlertaRiscoAgente`,
 * mas produzido por regra determinística (#391), não pelo LLM. */
type SinalRiscoDeterministico = Pick<
  AlertaRiscoAgente,
  "categoria" | "severidade" | "certeza" | "trecho_fonte" | "detalhe"
>;

/**
 * #122 — cria o alerta de risco clínico a partir do sinal transversal do agente
 * (R20 / R5-TC) e dispara a notificação inicial.
 *
 * O INSERT não acontece aqui: `app_role` não tem INSERT nesta tabela. Quem
 * insere é `app_criar_alerta_risco` (SECURITY DEFINER, migração 0049), que
 * confere que sessão e paciente são do tenant corrente e resolve o prazo pela
 * §4.1 no próprio banco. O cliente não consegue forjar severidade nem prazo.
 */
export async function registrarAlertaRisco(
  ctx: TenantContext,
  args: {
    patientId: string;
    sessionId: string;
    risco: AlertaRiscoAgente;
  },
): Promise<{ alertaId: string } | { erro: string }> {
  try {
    return await withTenant(ctx, async (tx) => {
      const criado = (await tx.execute(sql`
        SELECT app_criar_alerta_risco(
          ${args.patientId}::uuid,
          ${args.sessionId}::uuid,
          ${args.risco.categoria}::alerta_risco_categoria,
          ${args.risco.severidade}::alerta_risco_severidade,
          ${args.risco.certeza}::alerta_risco_certeza,
          ${args.risco.trecho_fonte},
          ${args.risco.detalhe}
        ) AS id
      `)) as unknown as Array<{ id: string }>;
      const alertaId = criado[0]!.id;

      // Notificação dupla e SIMULTÂNEA (§4): terapeuta da sessão de origem e
      // coordenador ao mesmo tempo, não em cascata.
      const destinatarios = await destinatariosCriacao(tx, {
        clinicId: ctx.clinicId,
        sessionId: args.sessionId,
      });
      await assertDestinatariosNoTenant(tx, {
        clinicId: ctx.clinicId,
        destinatarios,
      });

      // Trilha de ENVIO. Canal indisponível entra na lista explicitamente — o
      // registro tem que distinguir "não notificou por push" de "não tentou".
      const canais = [
        ...new Set(destinatarios.map((d) => d.canal)),
        ...canaisIndisponiveis(0),
      ];
      await tx.execute(sql`
        UPDATE alerta_risco_clinico
           SET canais_notificados = ${JSON.stringify(canais)}::jsonb
         WHERE id = ${alertaId}::uuid
      `);

      return { alertaId };
    });
  } catch (err) {
    // Falha ao registrar risco NUNCA é silenciosa: quem chama decide o que
    // fazer, mas o erro sai no log com destaque. Um risco perdido em silêncio é
    // o pior modo de falha possível deste sistema.
    console.error("ALERTA DE RISCO NÃO REGISTRADO:", err);
    return { erro: "Não foi possível registrar o alerta de risco." };
  }
}

/**
 * #391 — cria alerta ancorado num RPD (sem sessão obrigatória). Chama
 * `app_criar_alerta_risco` com `p_origem='registro_pensamento'`; o guard
 * dentro da função confirma que `rpdEntryId` pertence a `patientId`+clínica
 * do chamador (anti-IDOR). Notificação: responsável (`responsavelId`, quem
 * criou o RPD) + coordenadores, simultâneo — mesma regra de §4, sem sessão.
 */
export async function registrarAlertaRiscoRPD(
  ctx: TenantContext,
  args: {
    patientId: string;
    rpdEntryId: string;
    responsavelId: string;
    sinal: SinalRiscoDeterministico;
  },
): Promise<{ alertaId: string } | { erro: string }> {
  try {
    return await withTenant(ctx, async (tx) => {
      const criado = (await tx.execute(sql`
        SELECT app_criar_alerta_risco(
          p_patient           := ${args.patientId}::uuid,
          p_session           := NULL,
          p_categoria         := ${args.sinal.categoria}::alerta_risco_categoria,
          p_severidade        := ${args.sinal.severidade}::alerta_risco_severidade,
          p_certeza           := ${args.sinal.certeza}::alerta_risco_certeza,
          p_trecho            := ${args.sinal.trecho_fonte},
          p_detalhe           := ${args.sinal.detalhe},
          p_origem            := 'registro_pensamento'::alerta_risco_origem,
          p_rpd_entry          := ${args.rpdEntryId}::uuid
        ) AS id
      `)) as unknown as Array<{ id: string }>;
      const alertaId = criado[0]!.id;

      const destinatarios = await destinatariosCriacaoPorResponsavel(tx, {
        clinicId: ctx.clinicId,
        responsavelId: args.responsavelId,
      });
      await assertDestinatariosNoTenant(tx, {
        clinicId: ctx.clinicId,
        destinatarios,
      });

      const canais = [
        ...new Set(destinatarios.map((d) => d.canal)),
        ...canaisIndisponiveis(0),
      ];
      await tx.execute(sql`
        UPDATE alerta_risco_clinico
           SET canais_notificados = ${JSON.stringify(canais)}::jsonb
         WHERE id = ${alertaId}::uuid
      `);

      return { alertaId };
    });
  } catch (err) {
    console.error("ALERTA DE RISCO (RPD) NÃO REGISTRADO:", err);
    return { erro: "Não foi possível registrar o alerta de risco." };
  }
}

/**
 * #392 — cria alerta ancorado numa extração `registro_pensamento` AINDA NÃO
 * aprovada (RPD sugerido, fila da aba TCC). Não existe `tcc_rpd_entry` neste
 * momento — a âncora é a própria extração (`origem_extraction_id`), mesma
 * forma que `registrarAlertaRiscoInstrumento` usa, mas com
 * `p_origem='registro_pensamento'`. O guard dentro de `app_criar_alerta_risco`
 * (0112) aceita essa combinação especificamente para esta origem. Quando a
 * sugestão for aprovada depois, este alerta NÃO é migrado nem recriado para
 * apontar pro `rpd_entry_id` novo — fica ancorado na extração para sempre
 * (mesmo princípio de #391: alerta é trilha imutável, não espelho do estado
 * atual do RPD). Assinatura (`patientId`/`extractionId`/`sinal`, sem
 * `sessionId`) espelha `design.md` §2 — `sessionId` é derivado aqui de
 * `extraction.session_id` (NOT NULL, extração sempre tem sessão), não exigido
 * do chamador, pra notificação via `destinatariosCriacao` normal.
 */
export async function registrarAlertaRiscoRPDSugerido(
  ctx: TenantContext,
  args: {
    patientId: string;
    extractionId: string;
    sinal: SinalRiscoDeterministico;
  },
): Promise<{ alertaId: string } | { erro: string }> {
  try {
    return await withTenant(ctx, async (tx) => {
      const criado = (await tx.execute(sql`
        SELECT app_criar_alerta_risco(
          p_patient           := ${args.patientId}::uuid,
          p_session           := NULL,
          p_categoria         := ${args.sinal.categoria}::alerta_risco_categoria,
          p_severidade        := ${args.sinal.severidade}::alerta_risco_severidade,
          p_certeza           := ${args.sinal.certeza}::alerta_risco_certeza,
          p_trecho            := ${args.sinal.trecho_fonte},
          p_detalhe           := ${args.sinal.detalhe},
          p_origem            := 'registro_pensamento'::alerta_risco_origem,
          p_origem_extraction := ${args.extractionId}::uuid
        ) AS id
      `)) as unknown as Array<{ id: string }>;
      const alertaId = criado[0]!.id;

      const extracaoRow = (await tx.execute(sql`
        SELECT session_id FROM extraction
         WHERE id = ${args.extractionId}::uuid
           AND clinic_id = ${ctx.clinicId}::uuid
      `)) as unknown as Array<{ session_id: string }>;
      const sessionId = extracaoRow[0]?.session_id;
      if (!sessionId) {
        throw new Error(
          "registrarAlertaRiscoRPDSugerido: extração sem sessão associada",
        );
      }

      const destinatarios = await destinatariosCriacao(tx, {
        clinicId: ctx.clinicId,
        sessionId,
      });
      await assertDestinatariosNoTenant(tx, {
        clinicId: ctx.clinicId,
        destinatarios,
      });

      const canais = [
        ...new Set(destinatarios.map((d) => d.canal)),
        ...canaisIndisponiveis(0),
      ];
      await tx.execute(sql`
        UPDATE alerta_risco_clinico
           SET canais_notificados = ${JSON.stringify(canais)}::jsonb
         WHERE id = ${alertaId}::uuid
      `);

      return { alertaId };
    });
  } catch (err) {
    console.error("ALERTA DE RISCO (RPD SUGERIDO) NÃO REGISTRADO:", err);
    return { erro: "Não foi possível registrar o alerta de risco." };
  }
}

/**
 * #393 — mapeia o valor bruto (0-3) do item 9 do PHQ-9 para a severidade real
 * do alerta. Regra confirmada em `design.md` §"3. Severidade por valor do
 * item 9" contra o enum real (`schema.ts:1591-1600`):
 *
 * - `undefined` (parâmetro omitido — chamador antigo, ex. Fase E de #391
 *   que ainda não tem este nível de granularidade): preserva o fallback
 *   (severidade que o chamador já calculou) — ZERO mudança de comportamento.
 * - `null` (paciente recusou responder o item): recusa NUNCA rebaixa
 *   severidade (regra-alerta-risco.md §1.4 — ambiguidade rebaixa `certeza`,
 *   nunca severidade) — também usa o fallback.
 * - `0`: item não indica risco. Retorna `null` (sentinela "não disparar") —
 *   quem chama com item9Valor=0 não deveria ter chegado até aqui (o form/
 *   Fase E já filtram por `item_risco_positivo !== false` antes de chamar),
 *   mas se acontecer, esta função vira no-op em vez de criar alerta falso.
 * - `1`: `ideacao_passiva`.
 * - `2` ou `3`: `ideacao_ativa_sem_plano` — NUNCA `ideacao_ativa_com_plano`.
 *   PHQ-9 item 9 mede FREQUÊNCIA (dias/semana), não presença de plano;
 *   inferir "com plano" só do número fabricaria evidência que não está no
 *   texto (R2 — proveniência literal). `ideacao_ativa_com_plano` só é
 *   atingível pelo caminho de texto livre (RPD/diário), nunca só pelo valor
 *   numérico do item 9.
 * - Qualquer outro valor (fora do domínio 0-3, defensivo): usa o fallback —
 *   não inventa severidade para um valor que não deveria existir.
 */
export function severidadePorItem9Valor(
  item9Valor: number | null | undefined,
  fallback: SinalRiscoDeterministico["severidade"],
): SinalRiscoDeterministico["severidade"] | null {
  if (item9Valor === undefined || item9Valor === null) return fallback;
  if (item9Valor === 0) return null;
  if (item9Valor === 1) return "ideacao_passiva";
  if (item9Valor === 2 || item9Valor === 3) return "ideacao_ativa_sem_plano";
  return fallback;
}

/**
 * #391 — cria alerta ancorado numa extração `aplicacao_escala_relatada` com
 * `item_risco_positivo !== false`. Determinístico: quem decide criar o
 * alerta é o chamador (leu o campo booleano estruturado), não um novo
 * julgamento de LLM. `sessionId` vem da própria extração (sempre tem
 * sessão) — notificação usa `destinatariosCriacao` normal, igual ao diário.
 *
 * #393 — ganhou `item9Valor` opcional: quando presente, refina
 * `args.sinal.severidade` via `severidadePorItem9Valor` antes de gravar
 * (ver doc da função acima). Omitido, o comportamento é IDÊNTICO ao de
 * #391 (usa `args.sinal.severidade` tal como veio do chamador) — Fase E
 * de #391 continua chamando sem este campo e não muda.
 */
export async function registrarAlertaRiscoInstrumento(
  ctx: TenantContext,
  args: {
    patientId: string;
    sessionId: string;
    extractionId: string;
    sinal: SinalRiscoDeterministico;
    item9Valor?: number | null;
  },
): Promise<{ alertaId: string } | { erro: string } | { naoDisparado: true }> {
  const severidade = severidadePorItem9Valor(
    args.item9Valor,
    args.sinal.severidade,
  );
  if (severidade === null) {
    // item9Valor === 0: sem risco, no-op deliberado (ver doc acima).
    return { naoDisparado: true };
  }
  try {
    return await withTenant(ctx, async (tx) => {
      const criado = (await tx.execute(sql`
        SELECT app_criar_alerta_risco(
          p_patient           := ${args.patientId}::uuid,
          p_session           := NULL,
          p_categoria         := ${args.sinal.categoria}::alerta_risco_categoria,
          p_severidade        := ${severidade}::alerta_risco_severidade,
          p_certeza           := ${args.sinal.certeza}::alerta_risco_certeza,
          p_trecho            := ${args.sinal.trecho_fonte},
          p_detalhe           := ${args.sinal.detalhe},
          p_origem            := 'instrumento_formal'::alerta_risco_origem,
          p_origem_extraction := ${args.extractionId}::uuid
        ) AS id
      `)) as unknown as Array<{ id: string }>;
      const alertaId = criado[0]!.id;

      const destinatarios = await destinatariosCriacao(tx, {
        clinicId: ctx.clinicId,
        sessionId: args.sessionId,
      });
      await assertDestinatariosNoTenant(tx, {
        clinicId: ctx.clinicId,
        destinatarios,
      });

      const canais = [
        ...new Set(destinatarios.map((d) => d.canal)),
        ...canaisIndisponiveis(0),
      ];
      await tx.execute(sql`
        UPDATE alerta_risco_clinico
           SET canais_notificados = ${JSON.stringify(canais)}::jsonb
         WHERE id = ${alertaId}::uuid
      `);

      return { alertaId };
    });
  } catch (err) {
    console.error("ALERTA DE RISCO (INSTRUMENTO) NÃO REGISTRADO:", err);
    return { erro: "Não foi possível registrar o alerta de risco." };
  }
}

/**
 * Gap fix #391→#393 (sessão 18/08/26) — cria alerta ancorado numa
 * `instrumento_aplicacao` MANUAL (sem `extraction` de origem, ver
 * `instrumento-logic.ts:salvarInstrumentoAplicacao`). Mesmo `p_origem =
 * 'instrumento_formal'`de `registrarAlertaRiscoInstrumento`, mas a âncora é
 * `p_instrumento_aplicacao_id` em vez de `p_origem_extraction` — o guard
 * dentro de `app_criar_alerta_risco` (migração 0114) aceita essa combinação
 * especificamente para este `origem`, confirmando `instrumentoAplicacaoId`
 * pertence a `patientId`+clínica do chamador (anti-IDOR, `instrumento_aplicacao`
 * tem `patient_id`/`clinic_id` diretos, sem precisar de JOIN via sessão).
 *
 * Sem sessão garantida (`instrumento_aplicacao.session_id` é nullable — form
 * manual pode ser preenchido fora do contexto de uma sessão específica):
 * notificação usa `destinatariosCriacaoPorResponsavel` (mesmo padrão de
 * `registrarAlertaRiscoRPD`), com `responsavelId` = quem salvou o instrumento
 * (`criadoPor`), não o terapeuta de uma sessão que pode nem existir.
 *
 * `item9Valor` reusa `severidadePorItem9Valor` — mesma regra de mapeamento
 * 0/1/2-3 do caminho via agente; item9Valor=0 é no-op aqui também (defensivo:
 * o chamador em `instrumento-logic.ts` já filtra por `itemRiscoPositivo ===
 * true` antes de chegar aqui, mas a função não presume isso).
 */
export async function registrarAlertaRiscoInstrumentoManual(
  ctx: TenantContext,
  args: {
    patientId: string;
    instrumentoAplicacaoId: string;
    responsavelId: string;
    sinal: SinalRiscoDeterministico;
    item9Valor?: number | null;
  },
): Promise<{ alertaId: string } | { erro: string } | { naoDisparado: true }> {
  const severidade = severidadePorItem9Valor(
    args.item9Valor,
    args.sinal.severidade,
  );
  if (severidade === null) {
    return { naoDisparado: true };
  }
  try {
    return await withTenant(ctx, async (tx) => {
      const criado = (await tx.execute(sql`
        SELECT app_criar_alerta_risco(
          p_patient                  := ${args.patientId}::uuid,
          p_session                  := NULL,
          p_categoria                := ${args.sinal.categoria}::alerta_risco_categoria,
          p_severidade                := ${severidade}::alerta_risco_severidade,
          p_certeza                  := ${args.sinal.certeza}::alerta_risco_certeza,
          p_trecho                   := ${args.sinal.trecho_fonte},
          p_detalhe                  := ${args.sinal.detalhe},
          p_origem                   := 'instrumento_formal'::alerta_risco_origem,
          p_instrumento_aplicacao_id := ${args.instrumentoAplicacaoId}::uuid
        ) AS id
      `)) as unknown as Array<{ id: string }>;
      const alertaId = criado[0]!.id;

      const destinatarios = await destinatariosCriacaoPorResponsavel(tx, {
        clinicId: ctx.clinicId,
        responsavelId: args.responsavelId,
      });
      await assertDestinatariosNoTenant(tx, {
        clinicId: ctx.clinicId,
        destinatarios,
      });

      const canais = [
        ...new Set(destinatarios.map((d) => d.canal)),
        ...canaisIndisponiveis(0),
      ];
      await tx.execute(sql`
        UPDATE alerta_risco_clinico
           SET canais_notificados = ${JSON.stringify(canais)}::jsonb
         WHERE id = ${alertaId}::uuid
      `);

      return { alertaId };
    });
  } catch (err) {
    console.error("ALERTA DE RISCO (INSTRUMENTO MANUAL) NÃO REGISTRADO:", err);
    return { erro: "Não foi possível registrar o alerta de risco." };
  }
}
