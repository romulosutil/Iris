import { timingSafeEqual } from "node:crypto";

/**
 * Relay GlitchTip → GitHub Issues.
 *
 * GlitchTip (self-host em logs.irisclinica.ia.br) dispara um **webhook genérico**
 * quando uma issue nova/regressão aparece. GlitchTip não sabe criar issue no
 * GitHub nem manda header de auth customizado, então este endpoint faz a ponte:
 * recebe o POST do GlitchTip, autentica por segredo na querystring e abre (ou
 * atualiza) uma issue no repositório via API REST do GitHub.
 *
 * Idempotência sem estado local: cada issue leva um marcador `glitchtip-id:<id>`
 * no corpo; antes de criar, buscamos por ele (Search API). Se já existe uma issue
 * aberta pro mesmo id do GlitchTip, comentamos "voltou a ocorrer" em vez de
 * duplicar.
 *
 * Roda em Node (não edge) por causa de `node:crypto` e chamadas externas.
 * Env necessário (secrets no Easypanel — nunca versionar):
 *   GLITCHTIP_WEBHOOK_SECRET  segredo compartilhado; vai na URL do webhook (?token=)
 *   GITHUB_TOKEN              PAT fine-grained com Issues: read+write no repo
 *   GITHUB_REPO               "owner/repo" (default romulosutil/Iris)
 */

export const runtime = "nodejs";
// Sem cache: é um webhook, cada POST é um efeito colateral.
export const dynamic = "force-dynamic";

const GITHUB_API = "https://api.github.com";
const DEFAULT_REPO = "romulosutil/Iris";
const ISSUE_LABELS = ["glitchtip", "bug"];

/** Comparação de segredo em tempo constante (evita vazamento por timing). */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Campos que conseguimos extrair de forma tolerante do payload do GlitchTip. */
interface ParsedAlert {
  title: string;
  url: string | null;
  body: string;
  /** id da issue no GlitchTip, derivado da URL (`/issues/<id>`). */
  glitchtipId: string | null;
}

/** GlitchTip varia o formato entre versões; lemos defensivamente. */
function parseGlitchtip(payload: unknown): ParsedAlert {
  const p = (payload ?? {}) as Record<string, unknown>;
  const attachments = Array.isArray(p.attachments)
    ? (p.attachments as Array<Record<string, unknown>>)
    : [];
  const first = attachments[0] ?? {};

  const title =
    (typeof first.title === "string" && first.title) ||
    (typeof p.text === "string" && p.text) ||
    "Alerta do GlitchTip";

  const url =
    (typeof first.title_link === "string" && first.title_link) ||
    (typeof p.title_link === "string" && p.title_link) ||
    null;

  const extra =
    (typeof first.text === "string" && first.text) ||
    (typeof p.text === "string" && p.text) ||
    "";

  const glitchtipId = url
    ? (url.match(/issues\/(\d+)/)?.[1] ?? null)
    : null;

  return { title: title.slice(0, 240), url, body: extra, glitchtipId };
}

interface GithubCtx {
  token: string;
  repo: string;
}

async function githubFetch(
  ctx: GithubCtx,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "iris-glitchtip-relay",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

/** Procura issue aberta já criada para este id do GlitchTip. Retorna o number ou null. */
async function findExistingIssue(
  ctx: GithubCtx,
  marker: string,
): Promise<number | null> {
  const q = encodeURIComponent(`repo:${ctx.repo} in:body state:open "${marker}"`);
  const res = await githubFetch(ctx, `/search/issues?q=${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Array<{ number: number }> };
  return data.items?.[0]?.number ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.GLITCHTIP_WEBHOOK_SECRET;
  const token = process.env.GITHUB_TOKEN;
  if (!secret || !token) {
    // Não configurado ainda: 503 explícito em vez de 500 silencioso.
    return Response.json(
      { error: "relay não configurado (faltam GLITCHTIP_WEBHOOK_SECRET/GITHUB_TOKEN)" },
      { status: 503 },
    );
  }

  const provided = new URL(request.url).searchParams.get("token");
  if (!secretMatches(provided, secret)) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "corpo inválido (JSON esperado)" }, { status: 400 });
  }

  const alert = parseGlitchtip(payload);
  const ctx: GithubCtx = { token, repo: process.env.GITHUB_REPO || DEFAULT_REPO };
  const marker = alert.glitchtipId
    ? `glitchtip-id:${alert.glitchtipId}`
    : null;

  const bodyLines = [
    alert.body || "_(sem detalhes no payload do GlitchTip)_",
    "",
    alert.url ? `🔗 **Ver no GlitchTip:** ${alert.url}` : "",
    "",
    "---",
    marker
      ? `<sub>Aberta automaticamente pelo relay GlitchTip→GitHub · \`${marker}\`</sub>`
      : "<sub>Aberta automaticamente pelo relay GlitchTip→GitHub</sub>",
  ].filter(Boolean);

  // Dedup: se já há issue aberta pro mesmo erro, comenta em vez de duplicar.
  if (marker) {
    const existing = await findExistingIssue(ctx, marker);
    if (existing) {
      await githubFetch(ctx, `/repos/${ctx.repo}/issues/${existing}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body: `🔁 GlitchTip disparou de novo para este erro.${
            alert.url ? ` ${alert.url}` : ""
          }`,
        }),
      });
      return Response.json({ ok: true, action: "commented", issue: existing });
    }
  }

  const res = await githubFetch(ctx, `/repos/${ctx.repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: `[GlitchTip] ${alert.title}`,
      body: bodyLines.join("\n"),
      labels: ISSUE_LABELS,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: "falha ao criar issue no GitHub", status: res.status, detail: detail.slice(0, 500) },
      { status: 502 },
    );
  }

  const created = (await res.json()) as { number: number; html_url: string };
  return Response.json({
    ok: true,
    action: "created",
    issue: created.number,
    url: created.html_url,
  });
}
