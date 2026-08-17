# Stack e Plano de Construção Incremental (Prompt 4)

> ⚠️ **PIVÔ DE HOSPEDAGEM EM AVALIAÇÃO (09/07/2026) — NÃO TRAVADO.** Camada
> **hospedagem/deploy** deste doc (Vercel `gru1` + Supabase gerenciado
> `sa-east-1`, "sem containers") sob revisão. Nova premissa:
> **VPS Hostinger + Easypanel (Docker), Postgres puro** (não Supabase). Enquanto não
> confirmado, trate tabela §1 (linhas Host/Deploy) e "não usar
> containers" (§2) como **candidatos a substituição** — proposta detalhada +
> decisões tech lead em
> [`plano-bootstrap-e-stack-vps.md`](plano-bootstrap-e-stack-vps.md). **Resto
> deste doc (framework, modelo de dados, RLS, plano fases 0.5→6,
> definição de pronto) permanece válido, intacto.**

Resultado execução Prompt 4 (`docs/prompts/serie-de-prompts.md`), com
ajustes já incorporados ao prompt antes de rodar (ver `BACKLOG.md`,
seção A): cadastro clínico + `PatientProtocol` na Fase 1, dossiê bruto
auditoria convênio na Fase 5. Otimizado p/ dev solo
construindo com Claude Code: poucas peças móveis, serviços gerenciados, custo
baixo em validação. Sem código — decisões + justificativas.

Duas escolhas hospedagem (Supabase São Paulo, Vercel São
Paulo/gru1) verificadas por busca antes de entrar na tabela — ver Fontes
ao final.

---

## 1. Stack

| Camada                                 | Escolha                                                                                                                                                                                                              | Justificativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework web                          | **Next.js** (App Router)                                                                                                                                                                                             | Único codebase cobre UI mobile-first terapeuta, telas desktop coordenador, rotas API — evita separar front/back em serviços distintos, importa muito p/ pessoa só operando.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Banco de dados                         | **Postgres gerenciado via Supabase**                                                                                                                                                                                 | Modelo de dados (Prompt 1) já desenhado sobre RLS nativo Postgres — Supabase entrega Postgres + RLS + Auth + Storage como único serviço gerenciado, elimina 3 peças móveis que, separadas, exigiriam integração manual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Autenticação                           | **Supabase Auth**                                                                                                                                                                                                    | Embutido no mesmo provedor do banco; suporta e-mail/senha com MFA, piso que validação legal (`docs/legal/validacao-legal-prontuario.md`, seção 3) já confirmou suficiente — nenhum conselho (CFP/COFFITO/CFFa) exige certificado ICP-Brasil.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Storage de áudio                       | **Supabase Storage**                                                                                                                                                                                                 | Mesmo provedor do banco — upload `AudioCapture` com retry simples no cliente cobre fila de reenvio exigida pela NFR "diário nunca se perde", sem CDN/serviço externo dedicado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Processamento da extração              | **Job assíncrono simples**: Database Webhook disparado na inserção da `SessionNote` consolidada, chamando função serverless que roda extração                                                                        | Revisão imediata mas não instantânea (terapeuta consolida fim do turno, revisa minutos depois) — sem requisito de latência justificando fila dedicada. Webhook com retry/backoff cobre caso real com muito menos operação que SQS/RabbitMQ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| API do LLM (extração)                  | **Claude API (Anthropic) como baseline de partida**, forçando `output-schema.json` via structured output/tool use — **decisão final condicionada ao bake-off** (ver item pendente seção B do backlog)                | Agente referência (Prompt 2) desenhado nesse padrão de schema, Claude é ponto de partida natural. Revisado 09/07/2026: no Artificial Analysis Intelligence Index (jul/2026), Gemini 3.1 Pro (46) fica abaixo Claude Sonnet 5 (53) a preço quase igual — nem melhor nem pior o bastante p/ decidir sem dado próprio. Custo de qualquer um irrelevante no volume do piloto (~R$ 0,05–0,20/sessão, `modelo-de-negocio.md`). Antes de fixar provedor em código, rodar golden example + 8 casos de teste (`docs/agente/casos-de-teste.md`) contra Claude Sonnet 5 E Gemini (3.1 Pro/3.5 Flash), escolher pela taxa de aprovação sem edição — nenhum benchmark público mede aderência ao schema clínico específico deste produto. |
| Transcrição de voz (ASR pt-BR)         | **Pesquisa de opções feita (09/07/2026, ver seção 5)** — shortlist: OpenAI gpt-4o-transcribe ou Azure AI Speech (`brazilsouth`). Decisão final ainda adiada p/ Fase 6, agora com dado concreto em vez de placeholder | Qualidade em português já documentada por opção (seção 5); só entra na Fase 6, não vale travar provedor exato agora — mas shortlist já elimina pesquisa do zero quando chegar a hora.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Hospedagem                             | **Vercel** (Next.js) + **Supabase**, ambos região **São Paulo** (Supabase `sa-east-1`, Vercel `gru1`)                                                                                                                | Confirmado ambos oferecem região Brasil nativamente. Não é exigência legal (validação legal confirmou transferência internacional permitida via Art. 33 LGPD), mas elimina complexidade de cláusulas-padrão, simplifica conversa de compliance com clínicas — recomendação de produto já registrada em `modelo-de-dados.md` seção 6.                                                                                                                                                                                                                                                                                                                                                                                        |
| Observabilidade mínima                 | Log estruturado da própria tabela `Extraction` (estado, confiança, timestamp — já modelada) + **Sentry** (managed, free tier) p/ exceção de aplicação                                                                | Métrica de sucesso do MVP (≥70% extrações aprovadas sem edição) é QUERY sobre dado que já existe no schema, não ferramenta de observabilidade dedicada. Sentry cobre erro não tratado sem operação extra — Datadog/New Relic ficam p/ quando houver time de plantão, não uma pessoa.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Design system / vitrine de componentes | **Storybook** (`@storybook/nextjs`, framework do próprio Next.js/Tailwind já usado no app) + addons `essentials` (controls, docs, viewport) e `a11y` (axe-core embutido)                                             | Entrega design system como catálogo revisável — cada componente com variantes/estados isolados, sem navegar app inteiro p/ inspecionar botão. `@storybook/nextjs` reaproveita mesmo `tailwind.config.ts`/mesmos componentes React do app, sem projeto/build separado. Addon `a11y` roda critérios de aceite de contraste/foco do design system (`docs/ux/design-system-espectro-brutal.md` seção 5) automaticamente a cada story, em vez de checagem manual.                                                                                                                                                                                                                                                                |

---

## 2. O que NÃO usar nesta fase e por quê

- **Kubernetes / containers orquestrados** — Vercel e Supabase já serverless gerenciados; sem múltiplos serviços p/ orquestrar, K8s adicionaria operação sem necessidade real na escala de 1-2 clínicas fundadoras.
- **Microsserviços** — monólito Next.js modular (rotas API bem separadas por domínio) já isola responsabilidades sem custo de rede/deploy de múltiplos serviços. Uma pessoa não opera N deploys independentes.
- **Vector DB dedicado (Pinecone, pgvector como componente central etc.)** — agente de extração não faz busca semântica/RAG sobre embeddings; contexto do paciente montado por queries relacionais diretas (metas ativas, últimas N sessões, protocolo de referência), já modeladas no Prompt 1. Sem caso de uso p/ similarity search no MVP.
- **Filas distribuídas (SQS, RabbitMQ, Kafka)** — volume de sessões/dia numa clínica piloto (dezenas, não milhares) não justifica infra de fila dedicada. Webhook + retry simples resolve com muito menos peças operáveis por uma pessoa.
- **Multi-região / réplicas de leitura** — única região (São Paulo) atende bem 1-2 clínicas fundadoras concentradas no Brasil; multi-região é otimização p/ escala que não existe ainda.
- **CI/CD elaborado, feature flags, infra-as-code** — fora de escopo por instrução explícita desta rodada. Deploy direto via `git push` (Vercel) e migrations via CLI Supabase bastam; feature flags fazem sentido quando há usuários segmentados o bastante p/ justificar rollout gradual, não é o caso com 1-2 clínicas.
- **Chromatic (ou qualquer regressão visual automatizada paga)** — Storybook só já cobre critério de pronto da Fase 0.5 (catálogo revisável + `addon-a11y`); com só 3 componentes no MVP, revisão visual manual no próprio Storybook basta. Revisitar quando catálogo crescer o bastante (dezena(s) de componentes) p/ regressão visual manual virar ponto de erro real — nesse momento, alternativa mais barata é screenshot testing via Playwright (já disponível no projeto) antes de assinar Chromatic.
- **Style Dictionary / pipeline de tokens multi-plataforma** — tokens do design system têm hoje único consumidor (Tailwind config do próprio Next.js). Pipeline de tokens (JSON canônico → Tailwind/iOS/Android/etc.) só se paga quando existe segundo consumidor de verdade (ex.: app mobile nativo), fora do roadmap. `tailwind.config.ts` é fonte única da verdade por enquanto — sem indireção.
- **OpenRouter (ou qualquer roteador multi-modelo) como API de extração em produção** — avaliado 09/07/2026 (a pedido de Rômulo), decisão: NÃO agora. Três motivos: (1) OpenRouter não tem markup sobre preço do provedor, mas cobra 5,5% de taxa em conta pay-as-you-go (só dispensada com BYOK, que exige manter chave direta do provedor mesmo assim) — economia real só existe se TROCAR de modelo, não por usar o roteador; (2) no estágio atual (1-2 clínicas, margem de IA já >90% segundo `modelo-de-negocio.md`), custo de IA é irrelevante p/ economia unitária — variável que importa é métrica de ativação (≥70% extrações aprovadas sem edição), que nem foi validada contra NENHUM modelo real (item pendente seção B do backlog); trocar de modelo antes dessa validação existir arrisca o número que autoriza vender, p/ economizar valor que não move o negócio; (3) OpenRouter não garante retenção zero por padrão — cada provedor roteado tem política própria, exige configuração manual de filtro — adiciona processador de dado sensível de saúde de menor à cadeia, fora do escopo do DPA já desenhado com Anthropic (`validacao-legal-prontuario.md`). **Revisitar quando:** validação dos 8 casos de teste contra Claude estabelecer baseline de aprovação sem edição — a partir daí, OpenRouter vira ferramenta legítima de EXPERIMENTAÇÃO (testar modelos mais baratos contra mesmo golden example, promover só o que bater a mesma barra), nunca troca direta sem essa barra existir primeiro.

---

## 3. Plano de construção em fatias verticais

Cada fase termina com algo testável com terapeuta ou coordenador real —
nenhuma fase é "só backend" ou "só infra".

### Fase 0.5 — Design system (Espectro Brutal), entregue em Storybook

**Escopo — em ordem de execução:**

1. **Setup:** `npx storybook@latest init` dentro do projeto Next.js existente
   (detecta framework e usa `@storybook/nextjs`, reaproveitando
   `tailwind.config.ts` e componentes React do próprio app — sem projeto
   separado). Addons: `essentials` (controls, docs, viewport) e `a11y`
   (axe-core, roda contraste/foco automaticamente em cada story). Configurar
   2 presets de viewport no toolbar — `Terapeuta (375px)` e `Coordenador
(1280px)` — porque os dois públicos usam breakpoints muito diferentes
   (`fluxos-e-wireframes.md`: mobile-first terapeuta, desktop coordenador) e
   toda story deve ser checada nos dois.
2. **Tokens como código, fonte única:** estender `tailwind.config.ts` com
   tokens de `docs/ux/design-system-espectro-brutal.md` seção 3 — paleta
   (canvas, hierarquia de borda grafite/preto, os 3 acentos), tipografia
   (display/body, tamanho mínimo do display), sombra dura por modo
   (`4px`/`2px`), e os dois modos (Clínico/Família) como CSS custom
   properties selecionáveis por atributo (`data-mode="clinico|familia"`),
   trocáveis no toolbar do Storybook via `addon-themes` sem rebuild. Uma
   story/página MDX (`Tokens.mdx`) renderiza paleta, escala tipográfica e
   sombra direto do objeto de tema do Tailwind — nunca duplicar valor
   manualmente numa segunda tabela, senão os dois divergem com o tempo.
3. **Os 3 componentes base, cada um com matriz de stories cobrindo TODOS os
   estados definidos no briefing** (não só Default/Hover — é o que
   torna catálogo "de qualidade" em vez de decorativo):
   - **Botão Primário** — stories: Default, Pressed (deslocamento
     leve/risco baixo), Pressed (deslocamento longo/risco alto —
     aprovação em lote vs. revisão unitária, princípio 2 do briefing),
     Focus-visible (anel ortogonal, nunca fundido com Pressed), Disabled.
   - **Content Card** — stories: Conquistado (preenchimento sólido) vs.
     Candidato (contorno + hachura) lado a lado — story existe
     justamente p/ tornar impossível confundir os dois no code review.
   - **Alerta de Erro Redundante** — stories por severidade, sempre
     ícone+texto (nunca variante só-cor), copy literal sem culpa
     (`docs/ux/design-system-espectro-brutal.md` seção 4.C).
     Cada story roda limpo no painel do `addon-a11y` (sem violação séria) nos
     dois viewports e nos dois modos antes de ser considerada pronta.
4. **Publicação:** build estático do Storybook (`storybook build`)
   publicado como projeto Vercel separado (ou rota protegida do mesmo
   projeto, com Vercel Password Protection) — Rômulo revisa catálogo de
   qualquer dispositivo sem rodar nada localmente, mesmo padrão de preview
   que resto do stack já usa.

**Critério de pronto:** os 3 componentes com matriz de estados completa
publicados no Storybook (link acessível), zero violação séria no
`addon-a11y` em nenhuma story, `Tokens.mdx` renderizando a partir do tema
real (não hardcoded), e `tailwind.config.ts` importável sem alteração pelas
telas da Fase 1.

**Risco que elimina:** sem isso, Fase 1 (que já constrói UI real — cadastro
administrativo/clínico, agenda) nasce com estilo ad hoc e alguém paga
retrabalho depois p/ aplicar design system sobre o que já existe —
decisão de sequenciamento tomada com Rômulo 10/07/2026 (ver `BACKLOG.md`
seção C) exatamente p/ evitar isso. Publicação no Storybook elimina
segundo risco: revisão de design feita só lendo código/rodando local não
escala nem p/ uma pessoa, porque cada ajuste de token exigiria pedir
alguém subir o projeto — com catálogo publicado, é um link.

**Decisão de escopo:** esta fase é deliberadamente pequena (tokens + 3
componentes com matriz de estados completa, não catálogo extenso) —
novos componentes nascem sob demanda a partir da Fase 1 em diante, sempre
herdando tokens já travados aqui e seguindo mesmo padrão de story
(todos os estados, `addon-a11y` limpo, 2 viewports, 2 modos), em vez de
tentar prever todo catálogo antes de existir tela real que precise
dele. Chromatic e Style Dictionary ficam deliberadamente fora — ver seção 2
(o que não usar) p/ o racional e condição de revisitar.

### Fase 1 — Pacientes + agenda mínima

**Escopo:** cadastro ADMINISTRATIVO (recepção: contato, convênio, consentimento
LGPD) + cadastro CLÍNICO (coordenador: perfil clínico, protocolo(s) de
referência via `PatientProtocol`, equipe de cuidado inicial) + agenda semanal
mínima + check-in.

**Critério de pronto:** coordenador cadastra paciente real de ponta a
ponta (administrativo → clínico → protocolo) e terapeuta vê sessão
aparecer na grade do dia.

**Risco que elimina:** sem isso não existe base legal (consentimento) nem de
dado (protocolo de referência) p/ qualquer fase seguinte — é o alicerce, não
tela burocrática.

### Fase 2 — Metas + diário (sem IA)

**Escopo:** ciclo de vida da `Goal`, critério de domínio estruturado (N acertos
em M sessões, via formulário), diário por texto ligado à sessão, fila de
pendências do dia.

**Critério de pronto:** terapeuta registra diário de sessão real
vinculado a meta, sem nenhum processamento de IA envolvido.

**Risco que elimina:** valida que REGISTRO manual — funcionalidade mínima
que já substitui planilha — é usável e sustentável no dia a dia antes de
investir em IA sobre ele.

### Fase 3 — Extração + revisão

**Escopo:** pipeline de extração (Claude API + `output-schema.json`), tela de
Revisão, metas individualizadas mapeando marcos do(s) protocolo(s) de
referência do paciente (via `PatientProtocol`) como camada
adicional.

**Critério de pronto:** sessão real de paciente real gera sugestões e
terapeuta aprova pelo menos uma em produção (não só nos casos de teste
sintéticos do Prompt 2).

**Risco que elimina:** valida proposta de valor central do produto
("chegue na avaliação com dossiê pronto") com dado real e imprevisível, onde
diários de terapeutas reais divergem dos cenários A-C desenhados.

### Fase 4 — Evidências acumuladas + linha do tempo

**Escopo:** gráfico do protocolo com "candidatos a avaliação", `SessionSnapshot`
materializado, linha do tempo (scrubber, delta por sessão, trajetória com
evolução/estagnação/regressão), briefing pré-sessão, perfil de reforçadores.

**Critério de pronto:** coordenador abre "sessão 10" de paciente com
15+ sessões reais e vê snapshot correto daquele ponto no tempo.

**Risco que elimina:** valida que event-sourcing leve (decisão 2.5 do modelo
de dados) se sustenta com volume real de sessões antes de depender dele p/
decisões de supervisão.

### Fase 5 — Coordenador + exportação

**Escopo:** lista de exceções (estagnação, assiduidade, incidentes graves),
pacote de supervisão, fila de validação/reclassificação, revisão de ciclo de
metas, exportação do relatório da família (narrativo, PDF), dossiê BRUTO de
auditoria de convênio (PDF factual, sem síntese de IA — decisão confirmada
09/07/2026) **e relatório de convênio NARRATIVO (PDF, IA + revisão do
coordenador, pronto p/ autorização de continuidade)** — este último
promovido de fast-follow p/ MVP 09/07/2026 (decisão Produto+Vendas,
`modelo-de-negocio.md` seção 4 e `BACKLOG.md` seção D): clínicas-piloto já
identificadas exigem relatório como parte do MVP, não como fast-follow, e
custo marginal é baixo porque reaproveita mesmo pipeline (gerar rascunho com
IA → coordenador edita/aprova → exporta PDF) já previsto p/ relatório da
família — o que muda é conjunto de regras/prompt (justificar continuidade de
tratamento p/ operadora, não "como apoiar em casa") e template do PDF.

**Critério de pronto:** coordenador completa reclassificação real com
justificativa e exporta os TRÊS tipos de documento (família, dossiê bruto de
convênio e relatório narrativo de convênio) de paciente do piloto.

**Risco que elimina:** valida segunda persona pagante (coordenador/dono de
clínica) e entrega artefatos que sustentam faturamento de convênio — tanto
o bruto/auditável quanto o narrativo que justifica autorização de continuidade
— sem depender de fast-follow sem data p/ fechar clínicas-piloto que já
pedem isso como condição de MVP.

### Fase 6 — Ditado por voz + polish + hardening LGPD

**Escopo:** captura por áudio com persistência local antes do upload
confirmado (fila de reenvio), ASR pt-BR, e aplicação integral do checklist de
segurança/LGPD abaixo.

**Critério de pronto:** terapeuta grava áudio em conexão instável (ex.:
modo avião ligado propositalmente no teste) e diário não se perde; todos os
itens do checklist LGPD marcados.

**Risco que elimina:** fecha lacuna operacional (corredor, mãos ocupadas,
privacidade do ditado) e lacuna de compliance antes de operar com dado real
de paciente em escala — é a fase que autoriza piloto de verdade, não só
teste interno.

**Fast-follow pós-MVP (não construir agora):** avaliação formal assistida
(janela de pontuação com dossiê), anamnese estruturada — relatório de
convênio NARRATIVO saiu desta lista 09/07/2026 e entrou na Fase 5 (ver
acima), junto com dossiê bruto.

**Backlog nomeado (mais adiante ainda):** relatório escolar, transição/alta,
reunião interdisciplinar, treino parental/portal da família.

---

## 4. Checklist de segurança/LGPD mínimo viável antes de dado real de paciente

- [ ] RLS habilitado E TESTADO nas tabelas com dado clínico — testado com
      usuário de cada papel tentando acessar dado fora do próprio escopo, não
      só a policy criada.
- [ ] Confirmado por teste automatizado que `admin_recepcao` não acessa
      `PatientClinicalProfile`, `Evidence`, `PatientProtocol` nem qualquer
      outra tabela clínica.
- [ ] Login com senha + MFA disponível e ativado por padrão p/ papéis
      `coordenador`/`terapeuta` (piso legal confirmado — nenhum conselho exige
      ICP-Brasil).
- [ ] `AuditLog` gravando toda exportação de `Report` ANTES de liberar
      download (família e convênio).
- [ ] `Consent` versionado coletado antes de qualquer dado clínico ser
      inserido — os 3 tipos: `tratamento_dados_menor`, `uso_ia_processamento`,
      `exportacao_relatorios`.
- [ ] Retenção configurável por clínica implementada
      (`clinic.politica_retencao_meses`), mesmo que só com default sugerido
      pelo produto ativo.
- [ ] DPA (Data Processing Agreement) assinado com Anthropic cobrindo
      processamento de dado sensível de saúde de menor via API.
- [ ] Hospedagem confirmada em região Brasil (Supabase `sa-east-1`, Vercel
      `gru1`) antes do primeiro dado real entrar no sistema.
- [ ] Backup automático do banco habilitado E TESTADO (um restore real, não
      só existência do backup).
- [ ] Termo de responsabilidade da clínica assinado no onboarding, deixando
      claro que retenção e protocolo(s) configurados são escolha da clínica,
      não do Iris (Iris é produto de tecnologia, não estabelecimento de
      saúde — `docs/legal/validacao-legal-prontuario.md` seção 6).
- [ ] `responsavel_tecnico_id` já tem DDL fechada em `care_team_membership`
      (09/07/2026, `modelo-de-dados.md` seção 5) — falta só confirmar
      jurídico da granularidade "por vínculo" antes do piloto; não bloqueia,
      mas não esquecer de coletar o dado no onboarding clínico da Fase 1.

---

## 5. ASR pt-BR para ditado (Fase 6) — pesquisa de opções (09/07/2026)

Pesquisa feita a pedido de Rômulo, fechando item que ficava só como
placeholder ("API gerenciada, decisão adiada"). Uso real é **captura
assíncrona** (terapeuta grava áudio curto no fim da sessão, persistido
localmente e enviado p/ processamento em segundo plano — Tema 4
da pesquisa, `AudioCapture`) — significa que preço relevante é
**transcrição em lote (batch/pré-gravado)**, não streaming em tempo real
(mais caro em todos os provedores pesquisados), já que não há requisito de
transcrição ao vivo durante a sessão.

| Provedor                                          | Preço (lote/pré-gravado)                                                    | Região Brasil confirmada                                         | Acurácia em pt-BR                                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI Whisper API**                            | US$ 0,006/min                                                               | Não (endpoint só nos EUA)                                        | WER 5-7% (Whisper large-v3, "Tier 1 forte" — comparável a alemão/italiano, atrás só de espanhol/francês)                                                 |
| **OpenAI gpt-4o-transcribe**                      | US$ 0,006/min (mesmo preço do Whisper)                                      | Não (endpoint só nos EUA)                                        | Não publicado separado por idioma, mas provedor recomenda especificamente p/ "áudio difícil, sotaques, ruído de fundo" — cenário real de sala de terapia |
| **Azure AI Speech (Standard batch)**              | US$ 0,006/min                                                               | **Sim — `brazilsouth`, dados processados só naquela região**     | Não encontrei WER publicado especificamente p/ pt-BR nesta pesquisa                                                                                      |
| **Google Cloud Speech-to-Text (Chirp, standard)** | US$ 0,016/min (ou US$ 0,003/min em Dynamic Batch, fila de menor prioridade) | Não confirmado (documentação não lista região BR explicitamente) | Não encontrei WER publicado especificamente p/ pt-BR nesta pesquisa                                                                                      |
| **Deepgram Nova-3**                               | US$ 0,0048–0,0077/min (pré-gravado)                                         | Não                                                              | Declara suporte a 45+ idiomas, sem WER público por idioma nesta pesquisa                                                                                 |

**Leitura dos dados:** três provedores empatam em ~US$ 0,006/min p/ lote
(Whisper, gpt-4o-transcribe, Azure Standard batch) — a preços de piloto
(dezenas de sessões/dia), diferença entre eles é irrelevante em R$, mesmo
padrão já observado na escolha do LLM de extração (`modelo-de-negocio.md`
seção 5: custo de IA não pressiona o preço). Decisão real está em DOIS
outros eixos:

1. **Região de hospedagem** — só Azure AI Speech confirma região
   `brazilsouth` com processamento de dado só ali, mesmo padrão já adotado
   p/ Supabase (`sa-east-1`) e Vercel (`gru1`). É ponto real a favor
   do Azure: evita adicionar mais um provedor fora do Brasil à cadeia de
   transferência internacional de dado sensível de saúde de menor (que já
   existe p/ Claude API de extração — `validacao-legal-prontuario.md`
   seção 5), simplifica conversa de compliance com clínicas.
2. **Acurácia documentada em português** — só Whisper/large-v3 tem WER
   publicado especificamente por idioma (5-7% em português, nesta pesquisa);
   Azure e Google não têm esse número facilmente disponível publicamente,
   não significa que sejam piores, só que comparação exigiria teste
   próprio (mesmo padrão do bake-off de LLM: nenhum benchmark público mede o
   que importa aqui — voz real de terapeuta em sala clínica, com ruído de
   fundo e sotaque regional brasileiro).

**Recomendação (não é decisão travada — Fase 6 ainda está longe):** shortlist
de 2 candidatos p/ teste real quando Fase 6 chegar — **gpt-4o-transcribe**
(acurácia declarada p/ áudio difícil/sotaque/ruído, preço igual ao Whisper)
e **Azure AI Speech** (única opção com região Brasil confirmada). Mesmo
padrão do bake-off do LLM de extração: gravar 5-10 áudios reais de diário
(idealmente já em ambiente de clínica, com ruído de fundo real) e comparar
transcrição literal contra os dois antes de travar provedor — não decidir só
por preço de tabela ou WER de benchmark genérico, já que nenhum dos dois foi
medido contra caso de uso real do Iris (voz de terapeuta ditando observação
clínica, não leitura de texto em estúdio).

---

## Fontes

- [Available regions | Supabase Docs](https://supabase.com/docs/guides/platform/regions) — confirma região `sa-east-1` (São Paulo, Brasil) disponível p/ projetos Supabase.
- [São Paulo, Brazil (gru1) pricing | Vercel Docs](https://vercel.com/docs/pricing/regional-pricing/gru1) — confirma região `gru1` (São Paulo) disponível p/ Vercel Functions.
- [Pricing | OpenRouter](https://openrouter.ai/pricing) — confirma sem markup sobre preço do provedor, mas há taxa de 5,5% em conta pay-as-you-go (dispensada só com BYOK).
- [Provider Logging - Provider Data Retention Policies | OpenRouter Docs](https://openrouter.ai/docs/guides/privacy/provider-logging) — confirma política de retenção varia por provedor roteado, sem garantia de retenção zero por padrão.
- [LLM Leaderboard | Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) — Intelligence Index e preço/1M tokens (jul/2026): Claude Sonnet 5 (53, US$ 1,54) vs Gemini 3.1 Pro (46, US$ 1,74) vs Gemini 3.5 Flash (50, US$ 1,31).
- [Claude API Models and Pricing | Claude Docs](https://platform.claude.com/docs/en/about-claude/pricing) — preços oficiais por modelo (Sonnet 5, Opus, Haiku) e caching.
- [Gemini API Pricing | Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing) — preços oficiais por modelo (3.1 Pro, 3.5 Flash, 3.1 Flash-Lite).
- [OpenAI Transcribe & Whisper API Pricing (Jul 2026) | Costgoat](https://costgoat.com/pricing/openai-transcription) — confirma US$ 0,006/min p/ Whisper API e gpt-4o-transcribe (mesmo preço), e que gpt-4o-transcribe é recomendado p/ áudio difícil/sotaques/ruído de fundo.
- [How Accurate Is Whisper? 2026 WER Data by Language | VexaScribe](https://vexascribe.com/how-accurate-is-whisper) — WER de 5-7% em português p/ Whisper large-v3, classificado como "Tier 1 forte".
- [Deepgram Pricing](https://deepgram.com/pricing) — confirma US$ 0,0048-0,0077/min p/ Nova-3 pré-gravado (monolingual), suporte a 45+ idiomas sem detalhar acurácia por idioma na página de preços.
- [Speech-to-Text API Pricing | Google Cloud](https://cloud.google.com/speech-to-text/pricing) — confirma US$ 0,016/min (padrão) e US$ 0,003/min (Dynamic Batch) p/ modelo Chirp.
- [Regional availability | Cloud Speech-to-Text | Google Cloud Docs](https://docs.cloud.google.com/speech-to-text/docs/locations) — não lista explicitamente região Brasil/América do Sul entre exemplos verificados.
- [Azure Speech Services Pricing 2025 | BrassTranscripts](https://brasstranscripts.com/blog/azure-speech-services-pricing-2025-microsoft-ecosystem-costs) — confirma US$ 1,00/hora (real-time) e US$ 0,36/hora = US$ 0,006/min (batch) p/ Azure Speech Standard.
- [Supported regions for Azure Speech | Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions) — confirma região `brazilsouth` disponível p/ Azure Speech, com dados processados só naquela região quando recurso é criado nela.
