import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  careTeamMembership,
  patient,
  patientProtocol,
  protocol,
  session,
  sessionNote,
  extraction,
} from "@/db/schema";
import {
  deriveEstadoSessao,
  type EntradaSessao,
  type ResultadoEstado,
} from "@/lib/sessao/estado";
import { podeAutoValidar } from "@/lib/sessao/aprovacao";
import {
  montarProntidao,
  type FatosProntidao,
  type Prontidao,
} from "@/lib/patient/prontidao";
import { obterFatosProntidaoNaTx } from "@/lib/patient/prontidao-queries";

/**
 * `montarProntidao` descarta `fatos` sem olhar para qualquer papel fora de
 * {coordenador, terapeuta} (`PAPEIS_COM_LEITURA_CLINICA`, `prontidao.ts`) —
 * então nunca vale a pena LER de verdade para eles.
 *
 * Isso deixou de ser só otimização com a Task 7c (0144): `session_select`
 * (`db/migrations/0006_fase2_rls.sql`) deixa `admin_recepcao` enxergar
 * QUALQUER sessão da clínica — mas o guard de `app_fatos_prontidao` não a
 * autoriza (D-A11) e RAISE quando reprova (D-A13), em vez do `false`
 * silencioso que a leitura antiga devolvia. Chamar `obterFatosProntidaoNaTx`
 * para `admin_recepcao` aqui — sem o `.catch` que `layout.tsx`/`page.tsx` de
 * `pacientes/[id]` têm — derrubaria `/sessoes/[id]` inteira (exceção não
 * tratada) pra recepção, onde antes ela só recebia `notFound()` (`podeVer`).
 */
const FATOS_VAZIOS: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};
import { ehProfissionalResponsavel } from "@/lib/sessao/responsavel";

export type ProtocoloOpcao = { id: string; nome: string; disciplina: string };

export type DadosSessao = {
  sessionId: string;
  patientId: string;
  pacienteNome: string | null;
  terapeutaId: string;
  /** `true` para o terapeuta dono da sessão OU coordenação (defesa em profundidade). */
  podeVer: boolean;
  ehDono: boolean;
  /** T05 — `podeAutoValidar`: coordenador que É o terapeuta desta sessão. */
  podeColapsarAprovacao: boolean;
  resultado: ResultadoEstado;
  /** Existe `session_note` `captura_rapida` com texto não vazio (R-36/R-38). */
  temCaptura: boolean;
  /**
   * #513 — a `nota_consolidada` já gravada, quando existe. Alimenta a correção
   * da nota (`CorrigirNota`): sem o texto atual em mão, "corrigir" só poderia
   * ser redigitar tudo, e o upsert de `consolidarSessaoCore` sobrescreveria a
   * nota salva por um texto parcial. `visibilityLevel` vem junto pelo mesmo
   * motivo: `consolidarSessaoAction` deriva o nível do checkbox e SEMPRE grava
   * um valor (checkbox ausente ⇒ `multidisciplinary`), então um form sem o
   * estado atual rebaixaria o sigilo de uma nota `discipline_only` em silêncio.
   */
  notaConsolidada: {
    texto: string;
    visibilityLevel: "multidisciplinary" | "discipline_only";
  } | null;
  protocolos: ProtocoloOpcao[];
  protocolIdsPreSelecionados: string[];
  /**
   * T07 — mesma régua que já trava a aba central do paciente (Task 5,
   * `layout.tsx`): sem protocolo vigente E meta ativa, `materializar.ts`
   * descarta a evidência da sessão. `PassoEmFoco` lê `podeDocumentar` para
   * substituir `PassoDocumentar` pelo `CartaoProntidao` quando bloqueado.
   */
  prontidao: Prontidao;
};

/**
 * Carrega tudo que `/sessoes/[id]` precisa para derivar o estado (T01) e
 * montar o passo em foco (T06). Reusa a leitura de protocolos/disciplina de
 * `/diario/[sessionId]/page.tsx` e o predicado da fila de validação de uma
 * sessão (mesmo texto SQL de `src/lib/sessao/fila.ts` / spec A5 — reescrito
 * aqui porque aquele é interno ao módulo da fila de listagem, não porque a
 * regra diverge).
 */
export async function carregarSessao(
  ctx: TenantContext,
  sessionId: string,
  agora: Date,
): Promise<DadosSessao | null> {
  return withTenant(ctx, async (tx) => {
    const [sess] = await tx
      .select({
        id: session.id,
        patientId: session.patientId,
        terapeutaId: session.terapeutaId,
        atendidoPorId: session.atendidoPorId,
        estado: session.estado,
        agendadaPara: session.agendadaPara,
        numeroSequencialPaciente: session.numeroSequencialPaciente,
      })
      .from(session)
      .where(eq(session.id, sessionId));
    if (!sess) return null;

    // Só `nome`, dado de EXIBIÇÃO (e `undefined` para quem não passa por
    // `patient_select` — o cabeçalho fica sem nome, não quebra). Task 7c tirou
    // `clinicalModality` daqui: ela é entrada de RÉGUA e passou a sair de
    // `app_fatos_prontidao`, abaixo.
    const [pac] = await tx
      .select({ nome: patient.nome })
      .from(patient)
      .where(eq(patient.id, sess.patientId));

    const notas = await tx
      .select({
        tipo: sessionNote.tipo,
        texto: sessionNote.texto,
        visibilityLevel: sessionNote.visibilityLevel,
      })
      .from(sessionNote)
      .where(eq(sessionNote.sessionId, sessionId));
    const nota = notas.find((n) => n.tipo === "nota_consolidada") ?? null;
    const temNotaConsolidada = nota !== null;
    const temCaptura = notas.some(
      (n) => n.tipo === "captura_rapida" && n.texto.trim().length > 0,
    );

    const extracoes = await tx
      .select({ estado: extraction.estado })
      .from(extraction)
      .where(eq(extraction.sessionId, sessionId));

    // Itens na fila de validação DESTA sessão — texto idêntico ao predicado
    // canônico (spec A5 / validacao/queries.ts:17-19, espelhado também em
    // fila.ts). O casamento é por (patient_id, session_numero), não por
    // extraction_id — mesma razão documentada em fila.ts.
    let itensNaFilaValidacao = 0;
    if (sess.numeroSequencialPaciente != null) {
      const rows = (await tx.execute(sql`
        SELECT count(*)::int AS total
        FROM evidence_current ec
        JOIN extraction xf ON xf.id = ec.extraction_id
        WHERE ec.patient_id = ${sess.patientId}::uuid
          AND ec.session_numero = ${sess.numeroSequencialPaciente}
          AND ec.invalidada = false
          AND (xf.confianca = 'baixa' OR xf.inconsistente_com_historico = true)
          AND NOT EXISTS (SELECT 1 FROM evidence_revision r WHERE r.evidence_id = ec.id)
          AND NOT EXISTS (
            SELECT 1 FROM evidence_query q
            WHERE q.evidence_id = ec.id AND q.respondido_em IS NULL
          )
      `)) as unknown as Array<{ total: number }>;
      itensNaFilaValidacao = rows[0]?.total ?? 0;
    }

    const entrada: EntradaSessao = {
      estado: sess.estado,
      agendadaPara: sess.agendadaPara,
      temNotaConsolidada,
      extracoes,
      itensNaFilaValidacao,
    };
    const resultado = deriveEstadoSessao(entrada, agora);

    const [membro] = await tx
      .select({ disciplina: careTeamMembership.disciplina })
      .from(careTeamMembership)
      .where(
        and(
          eq(careTeamMembership.patientId, sess.patientId),
          eq(careTeamMembership.userId, sess.terapeutaId),
          isNull(careTeamMembership.vigenciaFim),
        ),
      );

    const protocolosAtivos = await tx
      .select({
        id: protocol.id,
        nome: protocol.nome,
        disciplina: protocol.disciplina,
      })
      .from(patientProtocol)
      .innerJoin(protocol, eq(protocol.id, patientProtocol.protocolId))
      .where(
        and(
          eq(patientProtocol.patientId, sess.patientId),
          isNull(patientProtocol.desativadoEm),
        ),
      );

    const daDisciplina = membro?.disciplina
      ? protocolosAtivos.filter((p) => p.disciplina === membro.disciplina)
      : [];
    const protocolIdsPreSelecionados = (
      daDisciplina.length > 0 ? daDisciplina : protocolosAtivos
    ).map((p) => p.id);

    // T07 — DELIBERADAMENTE sem `.catch` aqui, ao contrário de `layout.tsx`
    // (Task 5). Lá uma falha de leitura vira "cartão não renderiza" (a aba do
    // paciente continua útil sem ele). Aqui a mesma falha silenciosa
    // significaria "sem prontidão conhecida ⇒ deixa documentar" — exatamente o
    // resultado que essa régua existe para impedir. Uma leitura que falhou
    // nunca pode ler como "livre para documentar": deixa o erro propagar e
    // `SessaoPage` estoura como qualquer outra falha de carregamento.
    // `NaTx`, não a porta que abre `withTenant` própria: já estamos DENTRO da
    // transação aberta por este `withTenant` — chamar a porta de fora
    // aninharia uma segunda transação como SAVEPOINT do Drizzle (mesmo tenant
    // hoje, mas uma armadilha à espreita — ver @/lib/patient/prontidao-queries) e
    // pagaria uma viagem extra ao banco sem necessidade. Mesma imagem do
    // banco, uma transação só.
    //
    // O guard de papel (`FATOS_VAZIOS` acima) continua sem `.catch`: só evita
    // a chamada para quem `app_fatos_prontidao` nunca autoriza por desenho
    // (`admin_recepcao`, D-A11). Para {coordenador, terapeuta} — os únicos
    // papéis que `montarProntidao` de fato lê — uma exceção do definer
    // continua subindo crua, porque aí ELA é sinal real de guard quebrado.
    //
    // Task 7c — a `modalidade` vem do definer, não de `pac?.clinicalModality`:
    // `pac` é lido sob `patient_select` (RLS por equipe, sem recorte de
    // cobertura), e para um terapeuta de cobertura ele vem `undefined` — a
    // modalidade chegaria `null` e a régua recusaria por "modalidade ausente"
    // uma sessão que ele está clinicamente autorizado a documentar. O ramo
    // `FATOS_VAZIOS` fornece `modalidade: null` porque `montarProntidao`
    // descarta a escada para papéis fora de {coordenador, terapeuta} de
    // qualquer jeito. `pac.nome` continua saindo de `pac`: aquele é dado de
    // exibição, não entrada de régua.
    const prontidaoLida =
      ctx.role === "coordenador" || ctx.role === "terapeuta"
        ? await obterFatosProntidaoNaTx(tx, sess.patientId)
        : { fatos: FATOS_VAZIOS, modalidade: null };
    const prontidao = montarProntidao({
      modalidade: prontidaoLida.modalidade,
      fatos: prontidaoLida.fatos,
      role: ctx.role,
      patientId: sess.patientId,
    });

    return {
      sessionId,
      patientId: sess.patientId,
      pacienteNome: pac?.nome ?? null,
      terapeutaId: sess.terapeutaId,
      // #539 (D-AUD-7): "dono" = profissional responsável = titular OU
      // substituto designado na agenda. Mesma régua da RLS
      // (`app_session_profissional_responsavel`, 0143) e de `fila.ts` — se as
      // três divergirem, a tela nega o formulário a quem o banco deixa escrever.
      ehDono: ehProfissionalResponsavel(ctx.userId, sess),
      podeVer:
        ctx.role === "coordenador" ||
        ehProfissionalResponsavel(ctx.userId, sess),
      podeColapsarAprovacao: podeAutoValidar(ctx, {
        terapeutaId: sess.terapeutaId,
      }),
      resultado,
      temCaptura,
      notaConsolidada: nota
        ? { texto: nota.texto, visibilityLevel: nota.visibilityLevel }
        : null,
      protocolos: protocolosAtivos,
      protocolIdsPreSelecionados,
      prontidao,
    };
  });
}
