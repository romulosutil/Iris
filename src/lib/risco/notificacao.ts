import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import { codigoPg, mensagemPg } from "@/db/pg-error";

/**
 * #122 — despacho de notificação do alerta de risco clínico.
 *
 * REGRA DE OURO (§4.2.1 da spec, travada pelo parecer duty-to-warn): o Iris
 * NUNCA notifica destinatário externo à clínica — não família, não contato de
 * emergência, não SAMU, não polícia, não Conselho Tutelar. Todo o fluxo encerra
 * na notificação e responsabilização dos gestores da própria clínica.
 *
 * Este módulo resolve "para quem" um alerta de risco é notificado NO CAMINHO DE
 * CRIAÇÃO (in-app, dentro do processo Next). Ele é deliberadamente estreito: só
 * devolve `userId` de usuários com papel ATIVO na clínica do alerta. Não existe
 * caminho aqui para um endereço, telefone ou destinatário arbitrário — não é uma
 * política que alguém precise lembrar de respeitar, é a única coisa que o tipo
 * permite expressar.
 *
 * #329 — o caminho de ESCALONAMENTO (e-mail ao RT no estágio 2) resolve
 * destinatário em outro processo, `scripts/escalonamento-risco.mjs`, que não
 * importa este módulo e nem pode. O que os dois têm em comum é o predicado de
 * tenant, que vive em SQL (`app_destinatarios_fora_do_tenant`, migração 0105) —
 * ver `assertDestinatariosNoTenant` no fim deste arquivo.
 */

/** Estágio do escalonamento. 0 = notificação inicial, na criação do alerta. */
export type EstagioRisco = 0 | 1 | 2;

/**
 * Canais. `in_app` é o piso da §4: fila persistente + badge + banner, entregue
 * pela própria aplicação. `push` e `email` ainda não têm infraestrutura no
 * projeto (sem VAPID/service worker, sem provedor de e-mail).
 *
 * Quando um canal não está configurado, ele é registrado como INDISPONÍVEL em
 * `canais_notificados` — nunca omitido. Canal que some do registro é canal que
 * falhou em silêncio, que é o modo de falha da #108.
 */
export type CanalRisco =
  | "in_app_terapeuta_da_sessao"
  | "in_app_coordenador"
  | "in_app_todos_coordenadores_clinica"
  | "in_app_responsavel_tecnico"
  | "banner_clinica_wide"
  | "protocolo_emergencia_interno"
  | "push_indisponivel"
  | "email_responsavel_tecnico_indisponivel";

export type Destinatario = {
  userId: string;
  canal: CanalRisco;
};

function pushConfigurado(): boolean {
  // Sem chaves VAPID não há web push. Lido em tempo de chamada (não no módulo)
  // para que ligar a variável não exija redeploy do processo em teste.
  return !!process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
}

function emailConfigurado(): boolean {
  return !!process.env.EMAIL_PROVIDER_API_KEY;
}

/**
 * Canais indisponíveis no ambiente atual, para registro explícito na trilha.
 * H3 registra a limitação de origem: notificação web não fura o "Não perturbe"
 * do sistema operacional. O buraco é coberto pelo ESCALONAMENTO, não pela
 * tecnologia de entrega — por isso a ausência de push não bloqueia o alerta,
 * mas também não pode ficar invisível.
 */
export function canaisIndisponiveis(estagio: EstagioRisco): CanalRisco[] {
  const fora: CanalRisco[] = [];
  if (!pushConfigurado()) fora.push("push_indisponivel");
  if (estagio === 2 && !emailConfigurado()) {
    fora.push("email_responsavel_tecnico_indisponivel");
  }
  return fora;
}

/**
 * Destinatários do estágio 0 (criação): terapeuta da sessão de origem +
 * coordenadores da clínica, simultaneamente (§4).
 *
 * H4 — o alerta segue a SESSÃO, não o paciente: notifica-se o terapeuta que
 * conduziu aquela sessão, nunca lateralmente os outros profissionais do mesmo
 * paciente. Um fonoaudiólogo do mesmo paciente não tem contexto nem competência
 * sobre risco em psicoterapia, e difundir o dado violaria a minimização do
 * art. 6º, III da LGPD. A cobertura contra indisponibilidade vem do coordenador
 * e do escalonamento hierárquico, não da difusão lateral.
 */
export async function destinatariosCriacao(
  tx: Tx,
  args: { clinicId: string; sessionId: string },
): Promise<Destinatario[]> {
  const linhas = (await tx.execute(sql`
    SELECT s.terapeuta_id AS user_id
      FROM session s
     WHERE s.id = ${args.sessionId}
       AND s.clinic_id = ${args.clinicId}
    UNION
    SELECT ur.user_id
      FROM user_role ur
     WHERE ur.clinic_id = ${args.clinicId}
       AND ur.papel = 'coordenador'
  `)) as unknown as Array<{ user_id: string }>;

  const terapeuta = (await tx.execute(sql`
    SELECT s.terapeuta_id AS user_id FROM session s
     WHERE s.id = ${args.sessionId} AND s.clinic_id = ${args.clinicId}
  `)) as unknown as Array<{ user_id: string }>;
  const idTerapeuta = terapeuta[0]?.user_id ?? null;

  return linhas.map((l) => ({
    userId: l.user_id,
    canal:
      l.user_id === idTerapeuta
        ? ("in_app_terapeuta_da_sessao" as const)
        : ("in_app_coordenador" as const),
  }));
}

/**
 * #391 — mesma regra de `destinatariosCriacao` (responsável direto +
 * coordenadores, simultâneo), para origens sem sessão (RPD, instrumento sem
 * sessão associada). `responsavelId` é quem criou o registro que disparou o
 * alerta — RPD: `criado_por`; instrumento: o profissional da extração.
 * Função NOVA em vez de tornar `sessionId` opcional na existente: o caminho
 * do diário (H4, §4) já está testado e não deve mudar de forma nenhuma aqui.
 */
export async function destinatariosCriacaoPorResponsavel(
  tx: Tx,
  args: { clinicId: string; responsavelId: string },
): Promise<Destinatario[]> {
  const coordenadores = (await tx.execute(sql`
    SELECT ur.user_id FROM user_role ur
     WHERE ur.clinic_id = ${args.clinicId} AND ur.papel = 'coordenador'
  `)) as unknown as Array<{ user_id: string }>;

  const ids = new Set(coordenadores.map((c) => c.user_id));
  ids.add(args.responsavelId);

  // Paridade com `destinatariosCriacao`: se o responsável também for coordenador,
  // recebe a notificação priorizando o canal do autor responsável direto
  // (`in_app_terapeuta_da_sessao`), evitando duplicação e garantindo foco clínico.
  return [...ids].map((userId) => ({
    userId,
    canal:
      userId === args.responsavelId
        ? ("in_app_terapeuta_da_sessao" as const)
        : ("in_app_coordenador" as const),
  }));
}

/** Estágio 1: TODOS os coordenadores da clínica. Nunca silencioso (V4). */
export async function destinatariosEstagio1(
  tx: Tx,
  args: { clinicId: string },
): Promise<Destinatario[]> {
  const linhas = (await tx.execute(sql`
    SELECT ur.user_id FROM user_role ur
     WHERE ur.clinic_id = ${args.clinicId} AND ur.papel = 'coordenador'
  `)) as unknown as Array<{ user_id: string }>;
  return linhas.map((l) => ({
    userId: l.user_id,
    canal: "in_app_todos_coordenadores_clinica" as const,
  }));
}

/**
 * Estágio 2: responsável técnico da clínica. As outras três ações do estágio 2
 * (banner clínica-wide, exibição do Protocolo de Emergência Interno e log
 * imutável) não têm destinatário individual — são estado da clínica, resolvidos
 * na renderização e na trilha de auditoria.
 *
 * Se a clínica não cadastrou responsável técnico, a lista vem VAZIA e quem
 * chama registra isso. Não há fallback para nenhum contato de fora do tenant.
 */
export async function destinatariosEstagio2(
  tx: Tx,
  args: { clinicId: string },
): Promise<Destinatario[]> {
  const linhas = (await tx.execute(sql`
    SELECT c.responsavel_tecnico_id AS user_id FROM clinic c
     WHERE c.id = ${args.clinicId} AND c.responsavel_tecnico_id IS NOT NULL
  `)) as unknown as Array<{ user_id: string }>;
  return linhas.map((l) => ({
    userId: l.user_id,
    canal: "in_app_responsavel_tecnico" as const,
  }));
}

/**
 * Guarda de tenant do despacho. Confirma no banco que TODO destinatário tem
 * papel vigente na clínica do alerta.
 *
 * Existe para tornar o item 4 da definição de pronto da #122 verificável por
 * teste e não por leitura: "nenhum caminho de código capaz de emitir
 * notificação para destinatário fora do tenant". As funções acima já só
 * produzem usuários do tenant; esta é a rede de segurança que quebra alto se
 * alguém introduzir um caminho novo que não passe por elas.
 *
 * #329 — ESCOPO REAL DESTA FUNÇÃO, sem promessa a mais. Ela cobre o caminho de
 * CRIAÇÃO do alerta, que roda dentro do app Next. Ela NÃO cobre o motor de
 * escalonamento (`scripts/escalonamento-risco.mjs`): aquilo é Node `.mjs` puro,
 * sem TS e sem build, e a imagem `infra/escalonamento/Dockerfile` não copia
 * `src/` — importar este módulo de lá é impossível, não é descuido.
 *
 * O que os dois caminhos compartilham é o PREDICADO, não o código: ele mora em
 * SQL, em `app_destinatarios_fora_do_tenant` (migração 0105). O caminho do
 * escalonamento consome o mesmo predicado através de `app_rt_do_alerta`, que
 * passou a devolver `motivo_bloqueio` em vez de filtrar o RT forasteiro em
 * silêncio. Um predicado só, duas portas de entrada — reimplementar a regra aqui
 * em TypeScript era o jeito de ela divergir sem ninguém notar.
 *
 * E não só o predicado: a DECISÃO DE ESTOURAR e a mensagem também moram lá, em
 * `app_assert_destinatarios_no_tenant`. Esta função chama a asserção e traduz o
 * `P0001` de volta para `Error` — o `throw` continua sendo `Error` com o mesmo
 * texto de sempre, mas quem decide "isto é forasteiro, morra" é o banco. Manter
 * o `RAISE` no SQL e um `if` equivalente em TS deixava a regra em dois lugares:
 * o helper SQL viraria código morto e os dois divergiriam sem ninguém notar,
 * repetindo em miniatura o problema que a #329 fechou.
 *
 * Efeito colateral desejado: o `RAISE` aborta a transação. Todo chamador já
 * trata a falha como fatal (`registrar.ts` deixa o `withTenant` inteiro fazer
 * rollback), então o alerta não é criado — que é o comportamento que já existia
 * quando o `throw` era do lado do TypeScript.
 */
export async function assertDestinatariosNoTenant(
  tx: Tx,
  args: { clinicId: string; destinatarios: Destinatario[] },
): Promise<void> {
  if (args.destinatarios.length === 0) return;
  const ids = args.destinatarios.map((d) => d.userId);
  try {
    await tx.execute(sql`
      SELECT app_assert_destinatarios_no_tenant(
        ${args.clinicId}::uuid, ${sql.param(ids)}::uuid[]
      )
    `);
  } catch (e) {
    // Só o P0001 do guard é traduzido. Qualquer outro erro (conexão, permissão,
    // uuid inválido) sobe cru: engolir e reetiquetar como "fora do tenant" seria
    // afirmar uma causa que não foi medida.
    if (codigoPg(e) !== "P0001") throw e;
    throw new Error(
      mensagemPg(e) ??
        `notificacao de risco: destinatário fora do tenant (${ids.join(", ")}) — ` +
          "o Iris nunca notifica fora da clínica (regra de ouro §4.2.1).",
      { cause: e },
    );
  }
}
