# Handoff — início da construção (Fase 1) em Claude Code CLI

Este documento existe porque a especificação (Prompts 1-4) e as validações
(seção B do `BACKLOG.md`) foram fechadas numa sessão de Cowork, mas a
CONSTRUÇÃO de código vai acontecer numa sessão de Claude Code CLI, separada
desta. Objetivo: uma sessão nova de Claude Code CLI, sem nenhuma memória desta
conversa, consegue começar a codar a Fase 1 só lendo este arquivo + os
documentos que ele referencia — sem precisar que o Rômulo reexplique nada.

> ⚠️ **Pivô de infra em avaliação (09/07/2026):** o setup de infra deste
> handoff (criar projetos Supabase/Vercel gerenciados) está sob revisão — nova
> premissa é **VPS Hostinger + Easypanel + Postgres puro** (não Supabase). Antes de
> executar o checklist de setup abaixo, ler
> [`docs/arquitetura/plano-bootstrap-e-stack-vps.md`](docs/arquitetura/plano-bootstrap-e-stack-vps.md).
> A Fase 0.5 (design system) **não é afetada** — não depende de banco e pode
> ser construída local em paralelo ao provisionamento do VPS.

**Pré-requisito adicionado em 10/07/2026 — rodar a Fase 0.5 antes desta.**
Antes de codar qualquer tela da Fase 1 (cadastro, agenda), implementar os
tokens (`tailwind.config.ts`, fonte única, 2 modos Clínico/Família) e os 3
componentes base (Botão, Card, Alerta) de
`docs/ux/design-system-espectro-brutal.md`, entregues como catálogo
Storybook publicado (`@storybook/nextjs` + `addon-a11y`, matriz completa de
estados por componente, build no Vercel) — escopo e ordem de execução
completos em `stack-e-plano-de-construcao.md`, seção "Fase 0.5". É
propositalmente pequeno (3 componentes, não uma biblioteca completa) para
não atrasar a Fase 1, só para que ela não nasça com estilo ad hoc.

**Como usar:** cole este arquivo (ou peça para o Claude Code ler
`HANDOFF-FASE1.md`) no início da primeira sessão de construção.

---

## 0. Regra de engenharia não-negociável: nunca hardcode componente de UI

Adicionada em 10/07/2026, a pedido de Rômulo. Vale para toda sessão de
construção, da Fase 0.5 em diante, sem exceção:

1. **Nunca estilizar um elemento direto na tela** (classe Tailwind solta
   criando a aparência de um botão/card/alerta/badge do zero). Toda peça de
   UI visível consome um componente do design system "Espectro Brutal".
2. Antes de criar algo novo, nessa ordem: (a) existe um componente pronto no
   Storybook que já cobre o caso? Use-o. (b) Existe um componente parecido
   que dá para estender (nova prop, nova variante) em vez de duplicar? Prefira
   estender. (c) Só se nenhum dos dois cobrir o caso, criar um componente
   novo — formalmente, no design system (token-driven, com os estados
   exigidos, story no Storybook, `addon-a11y` limpo), **antes** de usar na
   tela real. Nunca o caminho inverso (construir na tela primeiro, "depois
   formaliza").
3. `docs/ux/inventario-componentes.md` lista os componentes já previstos por
   fase, levantados a partir de `fluxos-e-wireframes.md` — comece por lá
   antes de estilizar algo novo; é provável que o componente já esteja
   mapeado, só ainda não construído.

**Por quê:** é o mesmo motivo por trás de "protocolo é dado, não código"
(princípio 5 do README) aplicado à UI — sem esta regra, o catálogo do
Storybook vira decoração enquanto a Fase 1 em diante acumula estilo
divergente tela a tela, e o design system perde a função de ser a única
fonte da verdade visual do produto.

---

## 1. O produto em 3 frases

Iris é um SaaS B2B para clínicas de terapia infantil (ABA, Fonoaudiologia,
Terapia Ocupacional) focado em TEA/autismo no Brasil. O terapeuta escreve um
diário de sessão em texto livre; uma IA sugere estruturação clínica (nunca
pontua nem decide sozinha — toda sugestão exige aprovação humana antes de
virar registro permanente). Ver os 8 princípios inegociáveis em `README.md` —
não repetidos aqui para não divergir; leia o README primeiro.

## 2. Estado no momento deste handoff (09/07/2026)

- **Especificação (seção A do BACKLOG):** concluída. Modelo de dados, agente
  de extração, UX flows e stack estão todos escritos e revisados mais de uma
  vez.
- **Validações (seção B do BACKLOG):** essencialmente fechadas. Os únicos
  itens formalmente `[ ]` que sobram são: (1) confirmação jurídica de dois
  pontos específicos (prazo de guarda, granularidade de
  `responsavel_tecnico_id`) — não bloqueiam começar a codar, só bloqueiam
  processar dado REAL de paciente; (2) rodar o bake-off pago (Claude vs.
  Gemini) — **decisão deliberada de só rodar isso quando a Fase 3 (pipeline de
  extração) começar** (ver `BACKLOG.md` seção D — não é falta de chave de API,
  é escolha de timing, ambos os modelos são de ponta).
- **Decisões de produto/negócio (seção D):** fechadas para efeito de começar a
  codar — preço por paciente ativo, 3 tiers, GTM, non-goal de trial-by-trial,
  e a promoção do relatório de convênio NARRATIVO de fast-follow para MVP
  (Fase 5) — ver `docs/produto/modelo-de-negocio.md`.
- **Documentos jurídicos (retenção, termos de uso, privacidade):** são
  RASCUNHOS DE PRODUTO, pendentes de revisão por advogado
  (`docs/legal/briefing-para-advogado.md` já foi preparado para essa revisão
  informal). **Não bloqueiam começar a codar a Fase 1** — só não devem virar
  contrato/política publicada antes da revisão.
- **Nenhuma linha de código de produto foi escrita ainda.** Este handoff é
  literalmente o ponto de partida do Prompt/Fase 1.

## 3. Decisões de arquitetura já travadas (não redebater)

| Decisão                   | Escolha                                                                                                                                                                                                      | Onde está detalhado                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Framework web             | Next.js (App Router), monólito modular                                                                                                                                                                       | `docs/arquitetura/stack-e-plano-de-construcao.md` §1-2                                        |
| Banco de dados            | Postgres via Supabase (RLS nativo + Auth + Storage)                                                                                                                                                          | idem, e DDL completa em `docs/dados/modelo-de-dados.md`                                       |
| Hospedagem                | Vercel `gru1` + Supabase `sa-east-1` (região São Paulo)                                                                                                                                                      | idem §1                                                                                       |
| Processamento de extração | Job assíncrono simples (webhook + retry), sem fila dedicada                                                                                                                                                  | idem §1                                                                                       |
| API de LLM (extração)     | Claude API como baseline; escolha final Claude vs. Gemini só na Fase 3 (bake-off)                                                                                                                            | `BACKLOG.md` seção D                                                                          |
| O que NÃO usar agora      | Kubernetes, microsserviços, vector DB dedicado, filas distribuídas, multi-região, OpenRouter em produção                                                                                                     | `stack-e-plano-de-construcao.md` §2                                                           |
| Modelo de dados           | 25 entidades, RLS por papel, `Evidence` imutável + `EvidenceRevision`, `Protocol`/`Milestone` heterogêneo via JSONB (protocolo é dado, não código), `PatientProtocol` M:N com vigência                       | `docs/dados/modelo-de-dados.md` (documento inteiro)                                           |
| Agente de extração        | Regras R1-R19, `output-schema.json`, testado 8/8 e 10/10 em validação cega + especialista                                                                                                                    | `docs/agente/protocolos-e-agente.md`, `docs/agente/system-instructions.md`                    |
| Design system             | Tokens + 3 componentes base (Botão, Card, Alerta), codinome interno "Espectro Brutal", entregue em Storybook (`@storybook/nextjs` + `addon-a11y`) publicado no Vercel — implementar na Fase 0.5, antes desta | `docs/ux/design-system-espectro-brutal.md`, `stack-e-plano-de-construcao.md` seção "Fase 0.5" |

## 4. Escopo exato da Fase 1 (o que codar agora)

Fonte completa: `docs/arquitetura/stack-e-plano-de-construcao.md` §3 (Fase 1).

**Escopo:** cadastro ADMINISTRATIVO de paciente (recepção: contato, convênio,
consentimento LGPD) + cadastro CLÍNICO (coordenador: perfil clínico,
protocolo(s) de referência via `PatientProtocol`, equipe de cuidado inicial) +
agenda semanal mínima + check-in.

**Critério de pronto:** um coordenador cadastra um paciente real de ponta a
ponta (administrativo → clínico → protocolo) e um terapeuta vê a sessão
aparecer na grade do dia.

**Risco que elimina:** sem isso não existe base legal (consentimento) nem de
dado (protocolo de referência) para qualquer fase seguinte.

**Não fazer na Fase 1** (é de fases posteriores, não adiantar): diário de
sessão (Fase 2), qualquer chamada de IA/extração (Fase 3), gráfico do
protocolo/linha do tempo (Fase 4), telas de coordenador/exceções/relatórios
(Fase 5), ditado por voz (Fase 6).

**Wireframes/telas de referência:** `docs/ux/fluxos-e-wireframes.md` seção
4.1 (cadastro administrativo vs. clínico).

## 5. Checklist de setup antes da primeira linha de código

Nenhum destes itens foi feito ainda — a pasta do projeto no computador do
Rômulo **não é um repositório git** no momento deste handoff.

- [ ] **Marca decidida (10/07/2026): Iris, domínio `irisclinica.ia.br`.** A
      pasta do projeto no disco ainda se chama `xpect`
      (`C:\Users\sutil\Documents\dev\PESSOAL\apps\xpect`) — avaliar renomear a
      pasta (e o nome do repositório, quando criado) para `iris` antes de
      abrir o primeiro projeto Supabase/Vercel, para não ter que renomear
      depois com serviços já apontando para o nome antigo.
- [ ] `git init` na pasta do projeto (Claude Code CLI normalmente espera um
      repo git; sem isso, funcionalidades de diff/commit do próprio Code CLI
      não funcionam direito).
- [ ] Criar projeto Supabase em região `sa-east-1` (São Paulo) — ver
      confirmação de disponibilidade em `stack-e-plano-de-construcao.md`,
      seção Fontes.
- [ ] Criar projeto Vercel com região de função `gru1` (São Paulo).
- [ ] Rodar a DDL das tabelas necessárias para Fase 1 a partir de
      `docs/dados/modelo-de-dados.md` (pelo menos: `clinic`, `app_user`,
      `user_role`, `patient`, `patient_clinical_profile`, `consent`,
      `protocol`, `protocol_familia_catalogo`, `patient_protocol`,
      `care_team_membership`) — não precisa rodar a DDL de `report`,
      `evidence`, `extraction` etc. ainda (só entram nas Fases 3-5).
- [ ] Variáveis de ambiente: chaves do Supabase (URL + anon/service key).
      **Ainda NÃO precisa** de `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY` — isso só
      entra na Fase 3 (extração), por decisão deliberada de timing (seção 2
      acima).
- [ ] Habilitar RLS nas tabelas assim que criadas, mesmo que ainda sem
      cobertura de teste completa (o checklist de LGPD mínimo viável, seção 4
      de `stack-e-plano-de-construcao.md`, cobra teste automatizado de RLS
      antes de dado REAL de paciente entrar — não antes da Fase 1 em si, mas
      não deixar para depois "por preguiça").

## 6. O que NÃO precisa decidir agora (fica para quando chegar a fase relevante)

- Escolha final Claude vs. Gemini — Fase 3.
- Provedor de ASR (shortlist: gpt-4o-transcribe vs. Azure AI Speech) — Fase 6.
- Números finais de preço — depende de pesquisa real (Roteiro C), pós-piloto.
- Revisão jurídica formal dos rascunhos de termos/privacidade/retenção — em
  andamento por fora (`docs/legal/briefing-para-advogado.md`); não bloqueia
  código, só bloqueia publicar/assinar os documentos como estão.

## 7. Mapa de documentos (mesmo do README, para referência rápida)

Ver a tabela completa em `README.md` — não duplicada aqui para não divergir.
Os mais usados durante a Fase 1 especificamente: `docs/dados/modelo-de-dados.md`
(DDL), `docs/ux/fluxos-e-wireframes.md` §4.1 (telas), e
`docs/arquitetura/stack-e-plano-de-construcao.md` (stack e critério de
pronto).
