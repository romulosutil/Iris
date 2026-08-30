import { classificarRecusa, type GrupoRecusa } from "./classificacao-recusa";
import { frasePrazoCarencia } from "./carencia-ui";

/**
 * D36 — transforma a política já classificada pela #318 no que a clínica vê.
 *
 * **Puro de propósito, e sem `server-only`:** é consumido por componente e por
 * teste de componente. A #318 parou de propósito antes da tela ("não renderiza
 * nada; `copy` é o texto que a clínica deve ver quando a #312/D36 existir") —
 * este módulo é esse fechamento, e nada mais: nenhuma decisão de cobrança mora
 * aqui, só a redação.
 *
 * Duas regras herdadas do cabeçalho de `classificacao-recusa.ts` valem para
 * todo texto produzido aqui: **nunca o código cru do gateway** e **nunca
 * valor** (o teto do Pix Automático é ilegível por regulação).
 */

export interface EntradaAvisoRecusa {
  /** `billing_cycle.recusa_codigo` do ciclo mais recente, cru. */
  recusaCodigo: string | null;
  /** `subscription.status`. Só `past_due` faz o relógio de carência existir. */
  statusAssinatura: string;
  pastDueDesde: Date | null;
  carenciaDias: number;
  /** IANA da clínica: o prazo é contado em dias CIVIS, não em 24h. */
  timezone: string;
  /**
   * Achado da revisão de branch (I1): `/clinica/dados` é `requireRole(ctx,
   * "coordenador")` + `notFound()` — a faixa é global no layout e NÃO é
   * gated por papel, então o CTA de G4 dava 404 para terapeuta. `false`
   * troca o destino para `/assinatura` (que já explica, para quem não pode
   * contratar, quem pode); `true` mantém `/clinica/dados`.
   */
  podeEditarDadosDaClinica: boolean;
  /** Injetável para teste. */
  agora?: Date;
}

export interface AvisoRecusa {
  grupo: GrupoRecusa;
  titulo: string;
  texto: string;
  /** Frase do relógio de carência, ou `null` quando não há carência correndo. */
  prazo: string | null;
  ctaHref: string | null;
  ctaLabel: string | null;
}

const TITULO = "Cobrança recusada";

/**
 * G0, G6 e G7 têm `copy: null` no catálogo — e G0 é justamente onde cai o ciclo
 * que o backstop de D+7 levou a `falhou` sem `recusa_codigo`. Sem este texto, o
 * caminho MAIS silencioso do produto continuaria carimbando `past_due`,
 * deixando a carência correr e cortando a assinatura sem uma linha na tela: o
 * D36 inteiro.
 *
 * Ele não afirma causa que não conhecemos (M2 — achado da revisão de branch:
 * "ainda não identificamos o motivo junto ao seu banco" afirmava uma diligência
 * que não houve; o caminho do backstop de D+7 não pergunta nada a banco
 * nenhum, o prazo só venceu) e não promete retentativa (só G2 tem retentativa
 * automática — prometê-la aqui seria falso para G0/G6/G7).
 */
const COPY_FALLBACK =
  "Não recebemos a confirmação do débito automático desta mensalidade. Verifique a autorização de Pix Automático do Iris no app do seu banco.";

/**
 * G8 (`conciliaComoPago`) também tem `copy: null` — mas por um motivo OPOSTO
 * ao de G0/G6/G7: a cobrança **foi liquidada**, não recusada. `COPY_FALLBACK`
 * afirmaria o contrário para uma clínica adimplente (M1 — achado da revisão de
 * branch). Hoje `recusa-ativa.ts` filtra `ciclo_status !== "falhou"` e G8 nunca
 * chega aqui pelo caminho real (a conciliação leva o ciclo a `pago`, não
 * `falhou`) — mas `montarAvisoRecusa` é pura e exportada, e nada além deste
 * `if` garante que ela nunca produza o texto errado para quem já pagou.
 */
const COPY_G8 =
  "Identificamos que esta mensalidade já foi paga. Se a tarja continuar aparecendo depois de recarregar a página, fale com o suporte.";

/**
 * CTA por grupo. `null` não é omissão: em G1 (teto) e G2 (saldo) a ação mora no
 * app do banco, e um botão para dentro do Iris mandaria a clínica para uma tela
 * onde não há nada a fazer.
 */
const CTA_POR_GRUPO: Readonly<
  Record<GrupoRecusa, { href: string; label: string } | null>
> = {
  G0: { href: "/assinatura", label: "Ver assinatura" },
  G1: null,
  G2: null,
  G3: { href: "/assinatura", label: "Ver assinatura" },
  G4: { href: "/clinica/dados", label: "Corrigir dados da clínica" },
  G5: { href: "/assinatura", label: "Ver assinatura" },
  G6: { href: "/assinatura", label: "Ver assinatura" },
  G7: { href: "/assinatura", label: "Ver assinatura" },
  G8: { href: "/assinatura", label: "Ver assinatura" },
};

export function montarAvisoRecusa(entrada: EntradaAvisoRecusa): AvisoRecusa {
  const politica = classificarRecusa(entrada.recusaCodigo);
  // G4 é o único CTA que aponta para uma tela gated por papel
  // (`/clinica/dados`, coordenador-only). Sem `podeEditarDadosDaClinica`, cai
  // para `/assinatura` — que renderiza para todo papel e já explica, a quem
  // não pode contratar, que a mudança depende do coordenador (I1).
  const cta =
    politica.grupo === "G4" && !entrada.podeEditarDadosDaClinica
      ? CTA_POR_GRUPO.G3
      : CTA_POR_GRUPO[politica.grupo];

  return {
    grupo: politica.grupo,
    titulo: TITULO,
    texto: politica.copy ?? (politica.grupo === "G8" ? COPY_G8 : COPY_FALLBACK),
    prazo: frasePrazoCarencia(entrada),
    ctaHref: cta?.href ?? null,
    ctaLabel: cta?.label ?? null,
  };
}
