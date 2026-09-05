import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDiario } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic, extraction, goal, session, sessionNote } from "@/db/schema";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import {
  assertPodeDocumentar,
  ProntuarioIncompletoError,
} from "@/lib/patient/assert-pode-documentar";
import { META_SEM_MODELO, resolveProvider } from "@/lib/extraction/provider";
import type {
  ExtractionDraft,
  ExtractionMeta,
} from "@/lib/extraction/provider";
import { statusHttpDoErro } from "@/lib/extraction/resiliencia";
import type { AlertaRiscoAgente } from "@/lib/extraction/agent-output-schema";
import {
  registrarAlertaRisco,
  registrarAlertaRiscoInstrumento,
  registrarAlertaRiscoRPDSugerido,
} from "@/lib/risco/registrar";
import { detectarSinaisDeRiscoRPD } from "@/lib/risco/deteccao-risco";
import { loadCanonicalContext } from "@/lib/extraction/context-loader";
import { deveReextrair } from "@/lib/extraction/reextraction-policy";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";
import { mensagemDeConsentimento } from "./diario-comum";
import { enqueueJob } from "@/lib/queue/client";

/**
 * Consolidação da sessão: nota final, número sequencial, extração pelo agente
 * e os três sinais de risco que saem dela (#559, F4 — extraído de
 * `diario/[sessionId]/logic.ts`).
 *
 * `detectarSinaisDeRiscoRPD` vinha de `pacientes/[id]/tcc/deteccao-risco` —
 * uma rota importando outra, que é o achado `A-02`. A função é pura e sem
 * dependência nenhuma; mudou para `@/lib/risco/`, ao lado de `registrar.ts`,
 * e os dois consumidores de `tcc/` passaram a importá-la de lá.
 */

// Draft de fallback quando a extração (LLM) falha: mantém a nota salva e marca
// pendente de reprocessamento (flow 2.4 dos wireframes) — nunca perde o diário.
// Texto do aviso quando a Fase B (LLM) falha. É AVISO, não erro: a nota
// consolidada FOI gravada — devolver `error` seria a segunda mentira, depois
// de o `ok: true` silencioso já ter sido a primeira. O terapeuta precisa saber
// que a IA não rodou, senão fica esperando sugestões que nunca vêm e o item
// represa em /excecoes ("Extrações que falharam") sem ninguém entender por quê.
export const AVISO_EXTRACAO_FALHOU =
  "Nota salva, mas a análise da IA não rodou (falha no serviço). A sessão ficou marcada como pendente de reprocessamento — consolide de novo mais tarde para tentar outra vez.";

const PENDENTE_DRAFT: ExtractionDraft = {
  subtipo: "pendente",
  trechoFonte: "",
  confianca: "baixa",
  inconsistenteComHistorico: false,
  parContrasteId: null,
  payload: { motivo: "extracao_falhou_retry" },
  estado: "pendente_reprocessamento",
};

const consolidarSchema = z.object({
  sessionId: z.string().uuid(),
  texto: z.string().trim().min(1, "A nota consolidada não pode ficar vazia."),
  visibilityLevel: z.enum(["multidisciplinary", "discipline_only"]).optional(),
});

/**
 * Consolida a sessão: grava a nota final, popula `numero_sequencial_paciente`
 * (só na primeira consolidação — reconsolidar não incrementa) e dispara a
 * costura de extração (`ExtractionProvider`: stub demo gera 'sugerida',
 * produção fica 'pendente_reprocessamento' até a Fase 3 ligar o LLM real).
 *
 * Roda no contexto do profissional responsável pela sessão (titular OU
 * substituto, #539) — `extraction_insert` e `extraction_delete` (RLS) exigem
 * `app_session_profissional_responsavel(session_id)`, então `requireDiario`
 * sozinho não bastaria sem essa condição.
 */
async function consolidarSessaoCore(
  ctx: TenantContext,
  input: {
    sessionId: string;
    texto: string;
    visibilityLevel?: "multidisciplinary" | "discipline_only";
  },
): Promise<{
  error?: string;
  /** Sucesso PARCIAL: nota gravada, mas a extração da IA não rodou. */
  aviso?: string;
  numeroSequencial?: number;
  bloqueioConta?: BloqueioConta;
}> {
  requireDiario(ctx);
  const parsed = consolidarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const novoTexto = parsed.data.texto;
  const sid = parsed.data.sessionId;

  try {
    // ── Fase A (transação): grava nota + número, coleta o estado necessário
    //    para decidir a re-extração e monta o contexto canônico do agente.
    const prep = await withTenant(ctx, async (tx) => {
      // T07/T07b — a MESMA leitura que o passo 2) abaixo já fazia (patientId
      // + numero), adiantada para ANTES de qualquer escrita: a régua
      // (`assertPodeDocumentar`) precisa correr aqui dentro, na mesma
      // transação da nota, para que uma meta descontinuada entre a checagem e
      // o INSERT não passe pela régua.
      //
      // Task 7c — mesmo movimento de `capturarDiarioCore` acima: o `leftJoin`
      // em `patient` (que só existia para trazer `clinicalModality`) foi
      // embora, e a ambiguidade que ele criava foi junto. Sob
      // `patient_select` (RLS por equipe, sem recorte de cobertura) o
      // terapeuta de cobertura não lê a linha `patient`; a modalidade chegava
      // `null` e a régua recusava por "modalidade ausente" o que é cobertura
      // clínica legítima. Agora ela sai de `app_fatos_prontidao` (`0149`),
      // pela mesma porta e sob o mesmo guard dos seis fatos. O que sobra aqui
      // são só colunas de `session` — sempre legíveis a quem pode gravar a
      // nota, que é o motivo de o `sess!` abaixo continuar seguro.
      const [sess] = await tx
        .select({
          patientId: session.patientId,
          numero: session.numeroSequencialPaciente,
        })
        .from(session)
        .where(eq(session.id, sid));
      await assertPodeDocumentar(ctx, tx, sess!.patientId);

      // texto anterior (antes do upsert) → sabemos se o diário mudou
      const [notaAntiga] = await tx
        .select({ texto: sessionNote.texto })
        .from(sessionNote)
        .where(
          and(
            eq(sessionNote.sessionId, sid),
            eq(sessionNote.tipo, "nota_consolidada"),
          ),
        );
      const textoMudou = (notaAntiga?.texto ?? null) !== novoTexto;

      // 1) grava/atualiza a nota consolidada (upsert na chave única sessão+tipo)
      await tx
        .insert(sessionNote)
        .values({
          sessionId: sid,
          clinicId: ctx.clinicId,
          tipo: "nota_consolidada",
          texto: novoTexto,
          autorId: ctx.userId,
          visibilityLevel: parsed.data.visibilityLevel ?? "multidisciplinary",
        })
        .onConflictDoUpdate({
          target: [sessionNote.sessionId, sessionNote.tipo],
          set: {
            texto: novoTexto,
            atualizadoEm: new Date(),
            ...(parsed.data.visibilityLevel
              ? { visibilityLevel: parsed.data.visibilityLevel }
              : {}),
          },
        });

      // 2) popula numero_sequencial_paciente só se ainda nulo (idempotente):
      //    `app_session_definir_numero_sequencial` (0143, #539) é SECURITY
      //    DEFINER com guard interno — tenant + `app_session_profissional_
      //    responsavel` (titular OU substituto). Sai daqui o UPDATE direto em
      //    `session`: sob `session_update` o substituto afetava 0 linhas em
      //    silêncio, e a alternativa (estender a policy) deixaria ele
      //    remarcar/cancelar/reatribuir a sessão. O DEFINER também enxerga
      //    TODAS as sessões do paciente para o MAX() (cobertura fora da equipe
      //    subestimaria sob a própria RLS) e resolve a corrida de duas
      //    consolidações concorrentes (23505 em `uq_session_numero_por_paciente`)
      //    relendo o número já gravado, na subtransação certa.
      //
      //    MERGE (T07b + #539): a leitura de `sess` que ficava AQUI subiu para
      //    antes da primeira escrita — a régua (`assertPodeDocumentar`) tem de
      //    correr na mesma transação e ANTES do upsert da nota, senão uma meta
      //    descontinuada entre a checagem e o INSERT passaria por ela. É a
      //    MESMA leitura (`patientId` + `numero`), só adiantada; reusada aqui.
      let numero = sess!.numero ?? null;
      if (numero === null) {
        const upd = await tx.execute(sql`
          SELECT app_session_definir_numero_sequencial(${sid}::uuid) AS numero`);
        const row = (upd as unknown as Array<{ numero: number | null }>)[0];
        numero = row?.numero ?? null;
      }

      // 3) #174 regra 6: a nota consolidada é registro clínico — se o paciente
      //    estava arquivado (comercialmente), ele volta a contar na fatura.
      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        sess!.patientId,
        "registro_clinico",
      );

      // 4) política de re-extração (P0): não re-chama o LLM nem apaga extrações
      //    já revisadas quando o texto não mudou (e não há pendência).
      const exEstados = await tx
        .select({ estado: extraction.estado })
        .from(extraction)
        .where(eq(extraction.sessionId, sid));
      const reextrair = deveReextrair({
        textoMudou,
        temExtracoes: exEstados.length > 0,
        temPendente: exEstados.some(
          (e) => e.estado === "pendente_reprocessamento",
        ),
      });

      const [cl] = await tx
        .select({ isDemo: clinic.isDemo })
        .from(clinic)
        .where(eq(clinic.id, ctx.clinicId));
      const metas = await tx
        .select({ id: goal.id, descricao: goal.descricao })
        .from(goal)
        .where(
          and(
            eq(goal.clinicId, ctx.clinicId),
            eq(goal.patientId, sess!.patientId),
            eq(goal.estado, "ativa"),
          ),
        );

      // Monta o contrato canônico do agente só se formos re-extrair.
      const contexto = reextrair
        ? await loadCanonicalContext(tx, {
            sessionId: sid,
            patientId: sess!.patientId,
            clinicId: ctx.clinicId,
          })
        : null;

      if (reextrair) {
        await enqueueJob(
          "llm-extracao",
          { sessionId: sid, clinicId: ctx.clinicId },
          { singletonKey: sid, tx },
        );
      }

      return {
        numero,
        reextrair,
        isDemo: cl!.isDemo,
        metas,
        contexto,
        patientId: sess!.patientId,
      };
    });

    // Texto inalterado (e sem pendência) → não chama LLM, não apaga nada.
    if (!prep.reextrair) {
      return { numeroSequencial: prep.numero ?? undefined };
    }

    // ── Fase B: chama o provider (LLM) FORA da transação — não segura conexão
    //    nem locks durante a chamada de vários segundos.
    //    A-03 (#535): timeout de 45 s + 1 retry vivem DENTRO do provider real
    //    (LlmExtractionProvider → resiliencia.ts); aqui só se mede o tempo de
    //    parede e se grava o resultado — inclusive na falha.
    const provider = resolveProvider({ isDemo: prep.isDemo });
    let drafts: ExtractionDraft[];
    let alertaRisco: AlertaRiscoAgente | null = null;
    let avisoExtracao: string | undefined;
    // DA-02 (#535): meta da chamada. Começa com o que se sabe ANTES de chamar
    // (o modelo que o provider usa) para a linha `pendente_reprocessamento`
    // da falha também dizer qual modelo falhou e quanto tempo levou.
    let metaExtracao: ExtractionMeta = {
      ...META_SEM_MODELO,
      modelo: provider.modelo ?? null,
    };
    const inicioExtracao = Date.now();
    try {
      const saida = await provider.extrair({
        sessionId: sid,
        clinicId: ctx.clinicId,
        notaConsolidada: novoTexto,
        metasAtivas: prep.metas,
        contextoCanonico: prep.contexto,
      });
      drafts = saida.drafts;
      alertaRisco = saida.alertaRisco;
      metaExtracao = {
        ...metaExtracao,
        ...saida.meta,
        latenciaMs: saida.meta?.latenciaMs ?? Date.now() - inicioExtracao,
      };
    } catch (err) {
      metaExtracao.latenciaMs = Date.now() - inicioExtracao;
      // #531 (S-03): nada da `message` entra no log — o helper reduz o erro a
      // nome/SQLSTATE/hash. `status`, `modelo` e `latenciaMs` são o rastreio
      // da chamada de IA (#555), conjunto fechado e sem PII.
      logarErroSemPII("extração falhou (marcando pendente):", err, {
        status: statusHttpDoErro(err),
        modelo: metaExtracao.modelo,
        latenciaMs: metaExtracao.latenciaMs,
      });
      drafts = [PENDENTE_DRAFT];
      avisoExtracao = AVISO_EXTRACAO_FALHOU;
    }

    // ── Fase C: regrava só sugestões/pendências; PRESERVA linhas já revisadas
    //    (aprovada/editada/descartada, quando existirem — Plano 2).
    //    `extractionIds` sai do RETURNING de um INSERT ... VALUES simples, que
    //    preserva a ordem da lista de valores (sem JOIN/trigger a reordenar) —
    //    o zip por índice com `drafts` na Fase E abaixo é seguro.
    const extractionIds = await withTenant(ctx, async (tx) => {
      await tx
        .delete(extraction)
        .where(
          and(
            eq(extraction.sessionId, sid),
            inArray(extraction.estado, [
              "sugerida",
              "pendente_reprocessamento",
            ]),
          ),
        );
      if (drafts.length === 0) return [];
      const inseridos = await tx
        .insert(extraction)
        .values(
          drafts.map((d) => ({
            sessionId: sid,
            clinicId: ctx.clinicId,
            estado: d.estado,
            subtipo: d.subtipo,
            trechoFonte: d.trechoFonte,
            confianca: d.confianca,
            justificativaConfianca: d.justificativaConfianca,
            inconsistenteComHistorico: d.inconsistenteComHistorico,
            parContrasteId: d.parContrasteId,
            payload: d.payload as object,
            // DA-02 (#535): mesma meta para todas as linhas da chamada — a
            // chamada é uma só; a linha de falha (pendente) leva modelo +
            // latência e fica sem prompt/tokens (não houve resposta).
            modelo: metaExtracao.modelo,
            promptVersao: metaExtracao.promptVersao,
            latenciaMs: metaExtracao.latenciaMs,
            tokensEntrada: metaExtracao.tokensEntrada,
            tokensSaida: metaExtracao.tokensSaida,
          })),
        )
        .returning({ id: extraction.id });
      return inseridos.map((r) => r.id);
    });

    // Acumula erros de registro de alerta das Fases D e E — nenhuma das duas
    // derruba a consolidação (o texto/as extrações já estão salvos), mas o
    // erro tem que ser visível na UI: o terapeuta precisa saber que o alerta
    // não subiu, senão presume que a clínica foi avisada e não foi. Uma fase
    // que falha NÃO pode engolir o erro da outra — por isso não há retorno
    // antecipado aqui, as duas sempre rodam.
    const errosAlerta: string[] = [];

    // ── Fase D: sinal de risco transversal do diário (#122, R20 / R5-TC).
    //    FORA da fila de validação por exceção do coordenador (V1) e depois da
    //    gravação das extrações, mas em transação própria: um erro ao gravar
    //    extração não pode engolir um alerta de risco, e vice-versa.
    if (alertaRisco) {
      const r = await registrarAlertaRisco(ctx, {
        patientId: prep.patientId,
        sessionId: sid,
        risco: alertaRisco,
      });
      if ("erro" in r) errosAlerta.push(r.erro);
    }

    // ── Fase E: sinal de risco de INSTRUMENTO FORMAL (#391 R3, doc §1.2 item
    //    6). Determinístico: lê `item_risco_positivo` do payload EM MEMÓRIA
    //    (o mesmo objeto que acabou de ser gravado na Fase C) — nenhum LLM
    //    roda nesta decisão, o modelo já rodou na Fase B para produzir a
    //    extração. Regra restrita a `subtipo = 'aplicacao_escala_relatada'`:
    //    qualquer outro subtipo é ignorado, mesmo com campo parecido no
    //    payload. `!== false` dispara em `true` (positivo) OU `null` (recusa
    //    de resposta — sinal, não ausência, agent-output-schema.ts); payload
    //    sem o campo (`undefined`) NÃO dispara.
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (d.subtipo !== "aplicacao_escala_relatada") continue;
      const payload = d.payload as
        { item_risco_positivo?: boolean | null } | null | undefined;
      const itemRiscoPositivo = payload?.item_risco_positivo;
      if (itemRiscoPositivo === false || itemRiscoPositivo === undefined) {
        continue;
      }
      const extractionId = extractionIds[i];
      if (!extractionId) continue; // guarda defensiva; não deveria faltar

      const r = await registrarAlertaRiscoInstrumento(ctx, {
        patientId: prep.patientId,
        sessionId: sid,
        extractionId,
        sinal: {
          // Única categoria de instrumento hoje (doc §1.2 item 6) — se outro
          // instrumento vier depois com item de risco fora de ideação, revisar.
          categoria: "ideacao_suicida",
          // Nível intermediário, não o mínimo `ideacao_passiva`: não suaviza
          // por falta de contexto estruturado, mesma lógica do RPD (spec §
          // "detecção de risco no RPD").
          severidade: "ideacao_ativa_sem_plano",
          certeza: itemRiscoPositivo === true ? "explicito" : "ambiguo_citado",
          trecho_fonte: d.trechoFonte,
          detalhe:
            itemRiscoPositivo === true
              ? "Item de risco de instrumento formal respondido positivamente (true)."
              : "Item de risco de instrumento formal recusado pelo paciente (null).",
        },
      });
      if ("erro" in r) errosAlerta.push(r.erro);
    }

    // ── Fase F: sinal de risco em RPD SUGERIDO (#392, spec §"Decisão de
    //    design: alerta de risco antes da aprovação"). Mesmo padrão da Fase
    //    E: para cada draft `subtipo === 'registro_pensamento'` recém-
    //    persistido, varre os campos de texto livre do payload com a mesma
    //    varredura determinística de #391 (`detectarSinaisDeRiscoRPD`,
    //    reaproveitada direto — a função aceita todos os campos como
    //    opcionais, então passar só o subconjunto que o payload da extração
    //    tem não exige adaptador nem duplica a lista de termos). A sugestão
    //    ainda não tem linha em `tcc_rpd_entry` (só existe pós-aprovação),
    //    então o alerta é ancorado na própria extração
    //    (`origem_extraction_id`), mesma forma de ancoragem da Fase E. Alerta
    //    dispara na CRIAÇÃO da sugestão, não espera aprovação humana — mesmo
    //    princípio de #391 generalizado (ideação em texto pendente de
    //    aprovação ainda é ideação). Try/catch por item: uma falha aqui não
    //    pode derrubar a extração já persistida com sucesso.
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (d.subtipo !== "registro_pensamento") continue;
      const extractionId = extractionIds[i];
      if (!extractionId) continue; // guarda defensiva; não deveria faltar

      try {
        const payload = d.payload as
          | {
              evidencias_favor?: string | null;
              evidencias_contra?: string | null;
              comportamento_resultante?: string | null;
            }
          | null
          | undefined;

        const sinais = detectarSinaisDeRiscoRPD({
          pensamentoAutomatico: d.trechoFonte,
          evidenciasFavor: payload?.evidencias_favor,
          evidenciasContra: payload?.evidencias_contra,
          comportamentoResultante: payload?.comportamento_resultante,
        });

        for (const sinal of sinais) {
          const r = await registrarAlertaRiscoRPDSugerido(ctx, {
            patientId: prep.patientId,
            extractionId,
            sinal: {
              categoria: sinal.categoria,
              severidade: sinal.severidade,
              certeza: sinal.certeza,
              trecho_fonte: sinal.trechoFonte,
              detalhe: sinal.detalhe,
            },
          });
          if ("erro" in r) errosAlerta.push(r.erro);
        }
      } catch (err) {
        logarErroSemPII(
          "deteccao/registro de risco (RPD sugerido) falhou:",
          err,
        );
        errosAlerta.push("Não foi possível avaliar o risco do RPD sugerido.");
      }
    }

    if (errosAlerta.length > 0) {
      return {
        numeroSequencial: prep.numero ?? undefined,
        error: errosAlerta.join(" "),
        aviso: avisoExtracao,
      };
    }
    return { numeroSequencial: prep.numero ?? undefined, aviso: avisoExtracao };
  } catch (err) {
    // Ver capturarDiarioCore: recusa de regra de negócio, repassada intacta.
    if (err instanceof ProntuarioIncompletoError) throw err;
    const msg = await mensagemDeConsentimento(ctx, err, { sessionId: sid });
    if (msg) return { error: msg };
    logarErroSemPII("consolidarSessao:", err);
    return { error: "Não foi possível consolidar a sessão." };
  }
}

// Barrado ANTES da Fase A, então a chamada ao LLM (Fase B) e o alerta de risco
// (Fase D) sequer acontecem — conta em somente-leitura não gasta provider nem
// gera sinal que ninguém poderia tratar.
export const consolidarSessao = comEscrita(consolidarSessaoCore);
