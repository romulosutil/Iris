# Prompt estruturado: Iris pronto para agentes de IA e SEO técnico (AIO/GEO)

> Adaptado do prompt genérico de "Engenheiro Sênior + Especialista em SEO
> Técnico/AIO-GEO" enviado pelo Rômulo em 01/09/2026, substituindo os
> placeholders por dados reais do Iris e corrigindo o que já existe no
> repositório (levantado via leitura direta do código, não suposição).

---

## 0. Diagnóstico antes de gerar qualquer arquivo novo

O prompt original assume que se está partindo do zero. Não é o caso: uma
sessão anterior já implementou boa parte do pedido (commit
`5f087d04 feat(agent): implement Is It Agent Ready capabilities`). Rodar o
prompt original de novo, do zero, sobrescreveria isso sem resolver os
problemas reais que ele tem hoje.

### O que já existe e funciona

- `src/app/robots.ts` e `src/app/sitemap.ts` — robots.txt e sitemap.xml
  dinâmicos (Next.js `MetadataRoute`), servidos de verdade. O sitemap só tem
  5 URLs (home, `/login`, `/cadastro`, `/termos`, `/privacidade`) porque é
  basicamente tudo que existe de página pública hoje.
- `src/app/layout.tsx` e `src/app/institucional/page.tsx` — `metadata`,
  `openGraph` e `twitter:card` reais, com `og-image.png`, `metadataBase` e
  `locale: pt_BR`.
- Analytics real: `GoogleAnalytics` e `Clarity` (Microsoft Clarity) já
  instalados no `layout.tsx` raiz.
- `public/auth.md` já é servido com `Content-Type: text/markdown` via
  `next.config.ts` (`headers()`) — o pedido do item 4 do prompt original já
  tem infraestrutura pronta, só falta o conteúdo estar correto.

### O que já existe mas é decorativo (os endpoints não existem)

Os seis arquivos abaixo publicam metadados de OAuth/OIDC/MCP apontando para
rotas que **não existem** no código (só existe `src/app/api/auth/[...all]`,
o catch-all do Better-Auth para login humano normal de terapeuta/clínica):

- `src/app/.well-known/oauth-authorization-server/route.ts`
- `src/app/.well-known/oauth-protected-resource/route.ts`
- `src/app/.well-known/openid-configuration/route.ts`
- `src/app/.well-known/mcp/server-card.json/route.ts`
- `src/app/.well-known/agent-skills/index.json/route.ts`
- `src/app/.well-known/api-catalog/route.ts`

Um agente real que seguisse esse discovery hoje bateria em 404 em
`/api/auth/authorize`, `/api/auth/token`, `/api/auth/register`,
`/api/auth/jwks`, `/api/auth/revoke`, `/api/auth/register/agent`,
`/api/mcp/sse`, `/api/mcp/messages` e `/api/v1/openapi.json`. Isso não é só
"incompleto": é pior do que não ter o arquivo, porque um crawler/agente que
tenta usar esses links credencia o domínio como não confiável.

### O que existe e é risco real, não só bug

`public/auth.md` e `.well-known/oauth-authorization-server` anunciam
publicamente o escopo `read:patients` e uma ferramenta MCP
`get_patient_dossier_summary`, como se um agente de terceiro pudesse
autenticar e puxar dossiê de paciente via bearer token. Isso contradiz
frontalmente:

1. O princípio de governança do próprio produto ("a IA nunca pontua nem
   decide, evidência é revisada item a item por humano" — `README.md`,
   princípio 2 e 3);
2. O estado real da extração por IA: `EXTRACTION_LLM_ENABLED` está com
   feature flag desligada até o débito **D57** fechar (billing pago
   confirmado, escopo do DPA do Google Cloud para a Gemini API, e parecer do
   Dr. Thiago Lyra Galvão sobre equivalência das SCCs com o Art. 33 LGPD —
   ver `legal-lgpd-revisao.md`);
3. O fato de que dado de paciente é de criança/adolescente em terapia (TEA,
   saúde mental) — a superfície mais sensível possível para LGPD.

Hoje esse risco é mitigado só porque os endpoints por trás são 404. Não é
uma proteção em que vale a pena confiar: qualquer PR futuro que implemente
"só mais um endpoint" seguindo esse manifesto sem revisar o contexto reativa
uma promessa pública de acesso de agente a dado de paciente sem base legal
alguma.

**Recomendação:** antes de tocar em qualquer coisa deste prompt, decidir
entre (A) remover os seis arquivos `.well-known/*` de OAuth/MCP e o
`auth.md` atual até existir uma API pública real para descrever, ou (B)
reescrevê-los para descrever só o que existe hoje (nenhuma API pública de
dado clínico) e vincular `scopes_supported` a algo genuinamente ofertável no
futuro próximo (ex.: agendamento público, FAQ institucional) — nunca dado de
paciente sem o D57 fechado e sem tela de consentimento de agente. O prompt
abaixo assume a opção (B), mas isso precisa ser uma decisão sua, não uma
inferência minha.

### Inconsistência de domínio (bug pequeno, fácil de corrigir)

`robots.ts`, `sitemap.ts` e `layout.tsx` usam fallback
`https://irisclinica.ia.br` quando `NEXT_PUBLIC_APP_URL` não está setada;
todos os seis `route.ts` de `.well-known/*` usam fallback
`https://iris.app` (domínio genérico, não o real). Se a env var faltar em
algum ambiente (staging, preview), os manifests de agente apontam para um
domínio que não existe. Padronizar todos os fallbacks para
`https://irisclinica.ia.br`.

### Arquivo órfão

`public/landing.html` (854 linhas, HTML estático solto) não é referenciado
por nenhuma rota do Next — parece um rascunho anterior à página real
`/institucional`. Como tudo em `public/` é servido literalmente, ele
provavelmente ainda responde em `/landing.html` com meta tags e mensagem
desatualizadas, conteúdo duplicado sem estar no sitemap. Ou apagar, ou
mover para fora de `public/`.

### Sua pergunta: "ele também atua no SEO?"

Parcialmente. Tem a base técnica (robots, sitemap, metadata, OG, analytics)
mas com dois problemas de conteúdo, não de infraestrutura:

1. **Título e descrição desatualizados.** `layout.tsx` e
   `institucional/page.tsx` usam
   `"Iris — Prontuário para clínicas de terapia infantil (TEA)"`. Isso
   quebra em dois pontos: (a) usa a palavra "Prontuário", que o seu próprio
   guia de copy marca como anti-referência do produto ("Evitar enquadrar
   como 'prontuário eletrônico'... são os dois anti-references do
   produto" — `feedback_marketing-copy.md`); (b) restringe a "terapia
   infantil (TEA)" quando o escopo do produto já ampliou para clínica
   multidisciplinar (TCC adulto/adolescente, Fono, TO) desde 17/08/2026
   (`lead-stimular.md`). O SEO está otimizando para uma frase que o dono do
   produto já vetou e para um público menor do que o real.
2. **Não há superfície de conteúdo para ranquear.** 5 URLs no sitemap, zero
   páginas de blog/recursos/glossário. SEO orgânico depende de ter páginas
   respondendo a intenção de busca (ex. "como registrar evolução VB-MAPP",
   "modelo de relatório para convênio ABA"); hoje não existe onde esse
   tráfego aterrissaria.

Dito isso, dado o estágio real do Iris (venda direta por WhatsApp a leads
específicos, ver `lead-stimular.md`; sem site institucional divulgado
amplamente ainda), SEO orgânico tradicional provavelmente não é o gargalo de
crescimento agora — é um investimento de médio prazo. Os itens de AIO/GEO do
prompt original (SVCB/HTTPS em DNS para `_agents`, manifests MCP) são ainda
mais especulativos: não há evidência pública de que Google, ChatGPT, Claude
ou Gemini usem esse padrão específico de descoberta por DNS para indexar ou
recomendar produtos hoje. Vale implementar como aposta de baixo custo (não
atrapalha, pode ajudar), não como plano de tráfego.

---

## 1. Dados reais do projeto (substituindo os placeholders)

- **Domínio principal:** `irisclinica.ia.br`
- **Nicho/produto:** SaaS de governança clínica para clínicas de terapia e
  saúde mental multidisciplinar — intervenção comportamental para TEA e
  desenvolvimento infantil (protocolos VB-MAPP, PROC, ABLLS-R/AFLS), TCC
  para adolescentes e adultos, Fonoaudiologia e Terapia Ocupacional. O
  terapeuta escreve o diário de sessão em linguagem natural; uma IA extrai
  evidências estruturadas rastreáveis até a frase de origem; o terapeuta
  aprova item a item; o coordenador valida por exceção.
- **Palavras-chave (propostas, para sua validação, não copy final):**
  - `software para clínica de terapia infantil TEA`
  - `sistema de gestão para clínica multidisciplinar`
  - `protocolo VB-MAPP software` / `software ABA Brasil`
  - `diário de sessão terapêutico com IA`
  - `relatório de evolução terapêutica automatizado`
  - `software para fonoaudiologia e terapia ocupacional`
  - `registro de pensamentos TCC online`
  - `evidência clínica rastreável LGPD`

  Tensão a decidir, não resolvida aqui: termos como `prontuário eletrônico
  para psicólogo` são o que a pessoa realmente digita no Google, mas é o
  termo que a copy do Iris deliberadamente evita usar como
  autodescrição. Dá pra usar como palavra-chave de metadados/conteúdo de
  captação sem usar como título de marca, mas isso é uma decisão de
  posicionamento sua, não técnica.

---

## 2. SEO tradicional: consertos antes de qualquer coisa de AIO/GEO

Isto não estava no prompt original — é a resposta direta à sua pergunta.

### 2.1 Corrigir `title`/`description`/OpenGraph

Trocar em `src/app/layout.tsx` e `src/app/institucional/page.tsx`:

```ts
// Antes
title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
description:
  "Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.",

// Depois (ajustar a frase exata com você — isto é ponto de partida)
title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
description:
  "Diário de sessão em linguagem natural, evidência clínica rastreável e aprovação humana item a item. Para TEA, TCC, Fonoaudiologia e Terapia Ocupacional.",
```

### 2.2 Dados estruturados (JSON-LD)

Não há nenhum `schema.org` no projeto hoje. Adicionar `SoftwareApplication`
(ou `Product`) na página institucional ajuda tanto o Google quanto os
resumos que LLMs geram a partir de busca:

```tsx
// src/app/institucional/page.tsx — dentro do componente, antes do JSX de retorno
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Iris",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description:
    "Software de governança clínica para clínicas de terapia e saúde mental multidisciplinar: diário de sessão em linguagem natural com extração de evidência clínica rastreável.",
  offers: {
    "@type": "Offer",
    priceCurrency: "BRL",
    price: "39.00",
    description: "Precificação marginal regressiva por paciente ativo/mês",
  },
};

// no JSX:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>;
```

Confirme o valor de `price` com você antes de publicar — hoje o
`FAIXAS_PRECIFICACAO` real é R$39 (1ª-15ª ficha)/R$32/R$25, então
`price: "39.00"` como "a partir de" é o mais correto, não um preço fixo
único.

### 2.3 Ampliar o sitemap conforme novas páginas públicas nascerem

`sitemap.ts` já está pronto para receber entradas novas — é só uma questão
de ter mais páginas públicas (ex. `/sobre`, que existe mas não está no
sitemap) e adicioná-las.

### 2.4 Resolver o arquivo órfão

Decidir: apagar `public/landing.html` ou movê-lo para fora de `public/`
(ex. `scratch/` ou um repo de referência), para não haver uma segunda
página institucional divergente respondendo publicamente.

---

## 3. DNS-AID (SVCB/HTTPS para `_agents`)

Baixa prioridade e especulativo (ver diagnóstico acima), mas segue o
registro de zona caso você queira publicar de qualquer forma como aposta de
baixo custo. Ajuste `<IP-OU-HOST-DO-ENDPOINT>` para onde o discovery de
agente realmente resolve (hoje, `irisclinica.ia.br` mesmo, já que os
manifests estão no próprio domínio da aplicação):

```dns
; Zona: irisclinica.ia.br — registro SVCB para descoberta de agentes de IA
; Requer DNSSEC assinado na zona pai para ser confiável por verificadores
; automatizados (Google/LLMs tendem a ignorar registros em zonas sem DNSSEC).
_agents.irisclinica.ia.br.  3600  IN  HTTPS  1 irisclinica.ia.br. (
    alpn="h2,h3"
    endpoint="https://irisclinica.ia.br/.well-known/api-catalog"
)

; Alias opcional para compatibilidade com verificadores que buscam
; especificamente "_a2a" (Agent-to-Agent) em vez de "_index":
_a2a._agents.irisclinica.ia.br.  3600  IN  HTTPS  1 irisclinica.ia.br. (
    alpn="h2,h3"
    endpoint="https://irisclinica.ia.br/.well-known/api-catalog"
)
```

**Onde implantar:** no provedor de DNS que hospeda a zona `irisclinica.ia.br`
(confirme qual — Registro.br, Cloudflare, etc., não está nos arquivos do
repo). Ativar DNSSEC na zona é um passo separado no mesmo painel; sem isso o
registro SVCB fica publicado mas sem a assinatura que dá confiança extra a
verificadores automatizados.

---

## 4. Negociação de conteúdo (HTML → Markdown)

O prompt original pede um Cloudflare Worker. Isso não bate com a infra real:
o Iris roda em **VPS Hostinger + Easypanel + Docker** (Next.js standalone,
`infra/Dockerfile`), não atrás de Cloudflare Worker/Vercel Edge (confirme se
o DNS passa por Cloudflare como proxy — se sim, dá pra usar Worker também;
se não, a opção abaixo funciona em qualquer hospedagem porque roda dentro do
próprio Next.js). Não existe `src/middleware.ts` no projeto hoje.

```ts
// src/middleware.ts (novo arquivo)
import { NextRequest, NextResponse } from "next/server";

// Só intercepta as rotas institucionais públicas — nunca /diario, /revisao,
// /pacientes etc. (mesma lista de disallow do robots.ts).
const ROTAS_PUBLICAS_MARKDOWN = ["/", "/institucional", "/sobre"];

export function middleware(request: NextRequest) {
  const aceitaMarkdown = request.headers
    .get("accept")
    ?.includes("text/markdown");
  const rotaElegivel = ROTAS_PUBLICAS_MARKDOWN.includes(
    request.nextUrl.pathname,
  );

  if (aceitaMarkdown && rotaElegivel) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/markdown${request.nextUrl.pathname === "/" ? "/institucional" : request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/institucional", "/sobre"],
};
```

```ts
// src/app/api/markdown/[slug]/route.ts (novo arquivo)
// Espelha a hierarquia semântica real da página institucional em Markdown,
// a partir da MESMA fonte de conteúdo usada para renderizar o HTML (não
// reescrever o texto à mão em dois lugares — isso diverge com o tempo).
import { NextResponse } from "next/server";
import { conteudoInstitucional } from "@/lib/institucional/conteudo"; // extrair o conteúdo da página para um módulo compartilhado antes disto funcionar

export function GET(
  _request: Request,
  { params }: { params: { slug: string } },
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";
  const pagina = conteudoInstitucional[params.slug];

  if (!pagina) {
    return new NextResponse("Not found", { status: 404 });
  }

  const markdown = [
    `# ${pagina.h1}`,
    "",
    pagina.paragrafoAbertura,
    "",
    ...pagina.secoes.flatMap((s) => [
      `## ${s.titulo}`,
      "",
      s.corpo,
      ...(s.lista ? s.lista.map((item) => `- ${item}`) : []),
      "",
    ]),
    `[Ver versão original](${baseUrl}/${params.slug})`,
  ].join("\n");

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${baseUrl}/${params.slug}>; rel="canonical"`,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
```

Isto exige extrair o conteúdo real de `institucional/page.tsx` e `sobre/
page.tsx` para um módulo de dados compartilhado (`conteudoInstitucional`)
antes de funcionar de verdade — hoje o texto está direto no JSX. Vale a pena
só se você realmente quer servir Markdown a agentes (ChatGPT browsing,
Claude, Perplexity); o ganho de SEO tradicional disso é zero (Google não lê
`Accept: text/markdown`), é puramente GEO.

---

## 5. OAuth Protected Resource Metadata — reescrito para a realidade

Assumindo a opção (B) do diagnóstico: descrever só o que existe, sem
prometer acesso a dado de paciente.

```ts
// src/app/.well-known/oauth-protected-resource/route.ts
import { NextResponse } from "next/server";

export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  const protectedResourceMetadata = {
    resource: `${baseUrl}/api/v1`,
    authorization_servers: [baseUrl],
    // Nenhum escopo de dado clínico até existir consentimento de agente e
    // o débito D57 (parecer jurídico sobre acesso de terceiro a dado de
    // paciente) estar fechado. Hoje só há login humano via Better-Auth.
    scopes_supported: ["public:institutional-content"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/auth.md`,
  };

  return NextResponse.json(protectedResourceMetadata, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // X-Robots-Tag aqui é sobre o PRÓPRIO endpoint JSON, não sobre o site;
      // manter indexável ajuda ferramentas de descoberta técnica a achar o
      // manifest, sem risco porque não há dado sensível nele.
      "X-Robots-Tag": "index, follow",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
```

**Não implementar** `authorization_endpoint`/`token_endpoint`/
`registration_endpoint` reais até haver uma necessidade de produto concreta
(ex. uma integração B2B que peça isso). Publicar o manifesto sem o backend
por trás é o problema atual — a correção é parar de prometer, não construir
um servidor OAuth inteiro só para o manifest ficar "completo".

---

## 6. `auth.md` — reescrito para não anunciar acesso a dado de paciente

```md
# Iris — Acesso programático (auth.md)

Este documento descreve como sistemas automatizados podem interagir com o
conteúdo público do Iris. **Não há, hoje, API pública de leitura de dado de
paciente ou de dossiê clínico** — todo dado clínico do Iris é protegido por
autenticação humana (login de terapeuta/coordenador da clínica) e pela
governança em 3 camadas descrita em [irisclinica.ia.br](https://irisclinica.ia.br):
IA sugere evidência, terapeuta aprova, coordenador valida por exceção.

## Conteúdo disponível para agentes e crawlers

- Página institucional e conteúdo de marketing: `/`, `/institucional`, `/sobre`
- Versão em Markdown das páginas públicas via `Accept: text/markdown`
- Termos de uso e política de privacidade: `/termos`, `/privacidade`

## Descoberta técnica

- Catálogo de recursos: [/.well-known/api-catalog](/.well-known/api-catalog)
- Metadados do recurso protegido: [/.well-known/oauth-protected-resource](/.well-known/oauth-protected-resource)

## Login humano

O acesso ao produto (agenda, pacientes, diário, relatórios) exige
autenticação humana de um usuário da clínica. Não há fluxo de registro de
agente autônomo neste momento.
```

Isto some com as seções de "Agent Registration" e a tabela de scopes
(`read:patients`, `write:evaluations`) do `auth.md` atual — de propósito.

---

## 7. `ai-catalog.json` — GEO com conteúdo real, não clínico

```json
{
  "specVersion": "0.1.0",
  "host": {
    "name": "Iris",
    "domain": "irisclinica.ia.br",
    "description": "Governança clínica para clínicas de terapia e saúde mental multidisciplinar: diário de sessão em linguagem natural com evidência clínica rastreável e aprovação humana."
  },
  "entries": [
    {
      "urn": "urn:air:irisclinica.ia.br:institucional:sobre-o-produto",
      "type": "webpage",
      "url": "https://irisclinica.ia.br/institucional",
      "representativeQueries": [
        "qual sistema substitui planilha de protocolo ABA/VB-MAPP",
        "como registrar evolução terapêutica sem preencher formulário rígido",
        "software de governança clínica para clínica de terapia infantil",
        "ferramenta com IA para diário de sessão terapêutica rastreável",
        "sistema para clínica multidisciplinar TEA TCC fonoaudiologia terapia ocupacional"
      ]
    },
    {
      "urn": "urn:air:irisclinica.ia.br:institucional:precificacao",
      "type": "webpage",
      "url": "https://irisclinica.ia.br/institucional#precos",
      "representativeQueries": [
        "quanto custa um sistema de gestão clínica por paciente ativo",
        "software para clínica de terapia com preço por paciente"
      ]
    },
    {
      "urn": "urn:air:irisclinica.ia.br:legal:privacidade-lgpd",
      "type": "webpage",
      "url": "https://irisclinica.ia.br/privacidade",
      "representativeQueries": [
        "sistema de prontuário terapêutico com LGPD para menor de idade",
        "como funciona consentimento LGPD em software de terapia infantil"
      ]
    }
  ]
}
```

Servido como `src/app/.well-known/ai-catalog.json/route.ts`, no mesmo padrão
dos outros arquivos de `.well-known/`. Nenhuma entrada aponta para dado de
paciente ou ferramenta de agente sobre dossiê clínico — só conteúdo
institucional público, que é o que realmente existe.

---

## 8. Onde implantar cada coisa (resumo)

| Item | Onde | Prioridade |
|---|---|---|
| Corrigir `title`/`description`/OG (§2.1) | `layout.tsx`, `institucional/page.tsx` | **Alta** — grátis, corrige mensagem já errada |
| Resolver `public/landing.html` órfão (§2.4) | `public/` | **Alta** — risco de conteúdo duplicado |
| Decidir opção A/B para `.well-known` de OAuth/MCP (§0) | decisão do Rômulo | **Alta** — risco de governança, não só SEO |
| Padronizar fallback de domínio | todos os `route.ts` de `.well-known/` | Média |
| JSON-LD `SoftwareApplication` (§2.2) | `institucional/page.tsx` | Média |
| `ai-catalog.json` com conteúdo real (§7) | novo `route.ts` | Baixa/média — GEO, não SEO tradicional |
| `auth.md` reescrito (§6) | `public/auth.md` | Baixa/média — junto com a decisão do §0 |
| `oauth-protected-resource` reescrito (§5) | `route.ts` existente | Baixa/média — idem |
| Negociação HTML→Markdown (§4) | novo `middleware.ts` + `api/markdown/` | Baixa — só se quiser servir agentes de propósito, exige extrair conteúdo pro módulo compartilhado primeiro |
| DNS-AID/SVCB (§3) | painel de DNS da zona `irisclinica.ia.br` | Baixa — especulativo, sem adoção confirmada por Google/LLMs |

Sequência sugerida: §2.1 e §2.4 primeiro (grátis, corrigem erro real),
depois a decisão do §0 (governança, não técnica), só então o resto.
