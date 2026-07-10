# Stack e Plano de Construção Incremental (Prompt 4)

Resultado da execução do Prompt 4 (`docs/prompts/serie-de-prompts.md`), com os
ajustes já incorporados ao texto do prompt antes de rodar (ver `BACKLOG.md`,
seção A): cadastro clínico + `PatientProtocol` na Fase 1, dossiê bruto de
auditoria de convênio na Fase 5. Otimizado para um desenvolvedor solo
construindo com Claude Code: poucas peças móveis, serviços gerenciados, custo
baixo em fase de validação. Sem código — decisões e justificativas.

Duas escolhas de hospedagem (Supabase região São Paulo, Vercel região São
Paulo/gru1) foram verificadas por busca antes de entrar na tabela — ver Fontes
ao final.

---

## 1. Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Framework web | **Next.js** (App Router) | Um único codebase cobre a UI mobile-first do terapeuta, as telas desktop do coordenador e as rotas de API — evita separar front e back em serviços distintos, o que importa muito pra uma pessoa só operando. |
| Banco de dados | **Postgres gerenciado via Supabase** | O modelo de dados (Prompt 1) já foi desenhado em cima de RLS nativo do Postgres — Supabase entrega Postgres + RLS + Auth + Storage como um único serviço gerenciado, eliminando 3 peças móveis que, separadas, exigiriam integração manual. |
| Autenticação | **Supabase Auth** | Vem embutido no mesmo provedor do banco; suporta e-mail/senha com MFA, que é o piso que a validação legal (`docs/legal/validacao-legal-prontuario.md`, seção 3) já confirmou ser suficiente — nenhum conselho (CFP/COFFITO/CFFa) exige certificado ICP-Brasil. |
| Storage de áudio | **Supabase Storage** | Mesmo provedor do banco — upload do `AudioCapture` com retry simples no cliente cobre a fila de reenvio exigida pela NFR "o diário nunca se perde", sem CDN ou serviço externo dedicado. |
| Processamento da extração | **Job assíncrono simples**: Database Webhook disparado na inserção da `SessionNote` consolidada, chamando uma função serverless que roda a extração | A revisão é imediata mas não instantânea (o terapeuta consolida no fim do turno e revisa minutos depois) — não há requisito de latência que justifique fila dedicada. Um webhook com retry/backoff cobre o caso real com muito menos operação que SQS/RabbitMQ. |
| API do LLM (extração) | **Claude API (Anthropic) como baseline de partida**, forçando o `output-schema.json` via structured output/tool use — **decisão final condicionada ao bake-off** (ver item pendente da seção B do backlog) | O agente de referência (Prompt 2) foi desenhado nesse padrão de schema, então Claude é o ponto de partida natural. Mas revisado em 09/07/2026: no Artificial Analysis Intelligence Index (jul/2026), Gemini 3.1 Pro (46) fica abaixo do Claude Sonnet 5 (53) a preço quase igual — não é claramente melhor nem pior o bastante pra decidir sem dado próprio. Custo de qualquer um dos dois é irrelevante no volume do piloto (~R$ 0,05–0,20/sessão, `modelo-de-negocio.md`). Antes de fixar o provedor em código, rodar o golden example + 8 casos de teste (`docs/agente/casos-de-teste.md`) contra Claude Sonnet 5 E Gemini (3.1 Pro/3.5 Flash) e escolher pela taxa de aprovação sem edição — nenhum benchmark público mede aderência ao schema clínico específico deste produto. |
| Transcrição de voz (ASR pt-BR) | **Pesquisa de opções feita (09/07/2026, ver seção 5)** — shortlist: OpenAI gpt-4o-transcribe ou Azure AI Speech (`brazilsouth`). Decisão final ainda adiada pra Fase 6, agora com dado concreto em vez de placeholder | Qualidade em português já documentada por opção (seção 5); como só entra na Fase 6, não vale travar o provedor exato agora — mas a shortlist já elimina a pesquisa de zero quando chegar a hora. |
| Hospedagem | **Vercel** (Next.js) + **Supabase**, ambos em região **São Paulo** (Supabase `sa-east-1`, Vercel `gru1`) | Confirmado que ambos oferecem região Brasil nativamente. Não é exigência legal (a validação legal confirmou que transferência internacional é permitida via Art. 33 da LGPD), mas elimina a complexidade de cláusulas-padrão e simplifica a conversa de compliance com clínicas — recomendação de produto já registrada em `modelo-de-dados.md` seção 6. |
| Observabilidade mínima | Log estruturado da própria tabela `Extraction` (estado, confiança, timestamp — já modelada) + **Sentry** (managed, free tier) para exceção de aplicação | A métrica de sucesso do MVP (≥70% de extrações aprovadas sem edição) é uma QUERY sobre dado que já existe no schema, não uma ferramenta de observabilidade dedicada. Sentry cobre erro não tratado sem operação extra — Datadog/New Relic ficam para quando houver time de plantão, não uma pessoa. |
| Design system / vitrine de componentes | **Storybook** (`@storybook/nextjs`, framework do próprio Next.js/Tailwind já usado no app) + addons `essentials` (controls, docs, viewport) e `a11y` (axe-core embutido) | Entrega o design system como catálogo revisável — cada componente com suas variantes/estados isolados, sem precisar navegar o app inteiro para inspecionar um botão. `@storybook/nextjs` reaproveita o mesmo `tailwind.config.ts`/mesmos componentes React do app, sem projeto/build separado. O addon `a11y` roda os critérios de aceite de contraste/foco do design system (`docs/ux/design-system-espectro-brutal.md` seção 5) automaticamente a cada story, em vez de checagem manual. |

---

## 2. O que NÃO usar nesta fase e por quê

- **Kubernetes / containers orquestrados** — Vercel e Supabase já são serverless gerenciados; não há múltiplos serviços para orquestrar, e K8s adicionaria operação sem necessidade real na escala de 1-2 clínicas fundadoras.
- **Microsserviços** — um monólito Next.js modular (rotas de API bem separadas por domínio) já isola responsabilidades sem o custo de rede/deploy de múltiplos serviços. Uma pessoa não tem capacidade de operar N deploys independentes.
- **Vector DB dedicado (Pinecone, pgvector como componente central etc.)** — o agente de extração não faz busca semântica/RAG sobre embeddings; o contexto do paciente é montado por queries relacionais diretas (metas ativas, últimas N sessões, protocolo de referência), já modeladas no Prompt 1. Não há caso de uso para similarity search no MVP.
- **Filas distribuídas (SQS, RabbitMQ, Kafka)** — o volume de sessões processadas por dia numa clínica piloto (dezenas, não milhares) não justifica infraestrutura de fila dedicada. Webhook + retry simples resolve com muito menos peças operáveis por uma pessoa só.
- **Multi-região / réplicas de leitura** — uma única região (São Paulo) atende bem 1-2 clínicas fundadoras concentradas no Brasil; multi-região é otimização para uma escala que ainda não existe.
- **CI/CD elaborado, feature flags, infra-as-code** — fora de escopo por instrução explícita desta rodada. Deploy direto via `git push` (Vercel) e migrations via CLI do Supabase bastam; feature flags fazem sentido quando há usuários segmentados o bastante para justificar rollout gradual, o que não é o caso com 1-2 clínicas.
- **Chromatic (ou qualquer regressão visual automatizada paga)** — Storybook por si só já cobre o critério de pronto da Fase 0.5 (catálogo revisável + `addon-a11y`); com só 3 componentes no MVP, revisão visual manual no próprio Storybook é suficiente. Revisitar quando o catálogo crescer o bastante (dezena(s) de componentes) para que regressão visual manual vire ponto de erro real — nesse momento, alternativa mais barata é screenshot testing via Playwright (já disponível no projeto) antes de assinar Chromatic.
- **Style Dictionary / pipeline de tokens multi-plataforma** — os tokens do design system têm hoje um único consumidor (Tailwind config do próprio Next.js). Um pipeline de tokens (JSON canônico → Tailwind/iOS/Android/etc.) só se paga quando existe um segundo consumidor de verdade (ex.: app mobile nativo), o que não está no roadmap. `tailwind.config.ts` é a fonte única da verdade por enquanto — sem a indireção.
- **OpenRouter (ou qualquer roteador multi-modelo) como API de extração em produção** — avaliado em 09/07/2026 (a pedido de Rômulo), decisão: NÃO agora. Três motivos: (1) o OpenRouter não tem markup sobre o preço do provedor, mas cobra 5,5% de taxa em conta pay-as-you-go (só dispensada com BYOK, que exige manter a chave direta do provedor mesmo assim) — a economia real só existe se TROCAR de modelo, não por usar o roteador; (2) no estágio atual (1-2 clínicas, margem de IA já >90% segundo `modelo-de-negocio.md`), o custo de IA é irrelevante para a economia unitária — a variável que realmente importa é a métrica de ativação (≥70% de extrações aprovadas sem edição), que ainda nem foi validada contra NENHUM modelo real (item pendente da seção B do backlog); trocar de modelo antes dessa validação existir arrisca o número que autoriza vender, para economizar um valor que não move o negócio; (3) o OpenRouter não garante retenção zero por padrão — cada provedor roteado tem política própria, exigindo configuração manual de filtro — o que adiciona um processador de dado sensível de saúde de menor à cadeia, fora do escopo do DPA já desenhado com a Anthropic (`validacao-legal-prontuario.md`). **Revisitar quando:** a validação dos 8 casos de teste contra o Claude estabelecer o baseline de aprovação sem edição — a partir daí, OpenRouter vira uma ferramenta legítima de EXPERIMENTAÇÃO (testar modelos mais baratos contra o mesmo golden example, promover só o que bater a mesma barra), nunca uma troca direta sem essa barra existir primeiro.

---

## 3. Plano de construção em fatias verticais

Cada fase termina com algo testável com um terapeuta ou coordenador real —
nenhuma fase é "só backend" ou "só infra".

### Fase 0.5 — Design system (Espectro Brutal), entregue em Storybook

**Escopo — em ordem de execução:**

1. **Setup:** `npx storybook@latest init` dentro do projeto Next.js existente
   (detecta o framework e usa `@storybook/nextjs`, reaproveitando o
   `tailwind.config.ts` e os componentes React do próprio app — sem projeto
   separado). Addons: `essentials` (controls, docs, viewport) e `a11y`
   (axe-core, roda contraste/foco automaticamente em cada story). Configurar
   2 presets de viewport no toolbar — `Terapeuta (375px)` e `Coordenador
   (1280px)` — porque os dois públicos usam breakpoints muito diferentes
   (`fluxos-e-wireframes.md`: mobile-first terapeuta, desktop coordenador) e
   toda story deve ser checada nos dois.
2. **Tokens como código, fonte única:** estender `tailwind.config.ts` com
   os tokens de `docs/ux/design-system-espectro-brutal.md` seção 3 — paleta
   (canvas, hierarquia de borda grafite/preto, os 3 acentos), tipografia
   (display/body, tamanho mínimo do display), sombra dura por modo
   (`4px`/`2px`), e os dois modos (Clínico/Família) como CSS custom
   properties selecionáveis por atributo (`data-mode="clinico|familia"`),
   trocáveis no toolbar do Storybook via `addon-themes` sem rebuild. Uma
   story/página MDX (`Tokens.mdx`) renderiza paleta, escala tipográfica e
   sombra direto do objeto de tema do Tailwind — nunca duplicar valor
   manualmente numa segunda tabela, senão os dois divergem com o tempo.
3. **Os 3 componentes base, cada um com matriz de stories cobrindo TODOS os
   estados definidos no briefing** (não só Default/Hover — isso é o que
   torna o catálogo "de qualidade" em vez de decorativo):
   - **Botão Primário** — stories: Default, Pressed (deslocamento
     leve/risco baixo), Pressed (deslocamento longo/risco alto —
     aprovação em lote vs. revisão unitária, princípio 2 do briefing),
     Focus-visible (anel ortogonal, nunca fundido com Pressed), Disabled.
   - **Content Card** — stories: Conquistado (preenchimento sólido) vs.
     Candidato (contorno + hachura) lado a lado — a story existe
     justamente para tornar impossível confundir os dois no code review.
   - **Alerta de Erro Redundante** — stories por severidade, sempre
     ícone+texto (nunca variante só-cor), copy literal sem culpa
     (`docs/ux/design-system-espectro-brutal.md` seção 4.C).
   Cada story roda limpo no painel do `addon-a11y` (sem violação séria) nos
   dois viewports e nos dois modos antes de ser considerada pronta.
4. **Publicação:** build estático do Storybook (`storybook build`)
   publicado como projeto Vercel separado (ou rota protegida do mesmo
   projeto, com Vercel Password Protection) — o Rômulo revisa o catálogo de
   qualquer dispositivo sem rodar nada localmente, mesmo padrão de preview
   que o resto do stack já usa.

**Critério de pronto:** os 3 componentes com a matriz de estados completa
publicados no Storybook (link acessível), zero violação séria no
`addon-a11y` em nenhuma story, `Tokens.mdx` renderizando a partir do tema
real (não hardcoded), e `tailwind.config.ts` importável sem alteração pelas
telas da Fase 1.

**Risco que elimina:** sem isso, a Fase 1 (que já constrói UI real — cadastro
administrativo/clínico, agenda) nasce com estilo ad hoc e alguém paga
retrabalho depois para aplicar o design system em cima do que já existe —
decisão de sequenciamento tomada com Rômulo em 10/07/2026 (ver `BACKLOG.md`
seção C) exatamente para evitar isso. A publicação no Storybook elimina um
segundo risco: revisão de design feita só lendo código/rodando local não
escala nem para uma pessoa só, porque cada ajuste de token exigiria pedir
para alguém subir o projeto — com o catálogo publicado, é um link.

**Decisão de escopo:** esta fase é deliberadamente pequena (tokens + 3
componentes com matriz de estados completa, não um catálogo extenso) —
novos componentes nascem sob demanda a partir da Fase 1 em diante, sempre
herdando os tokens já travados aqui e seguindo o mesmo padrão de story
(todos os estados, `addon-a11y` limpo, 2 viewports, 2 modos), em vez de
tentar prever todo o catálogo antes de existir uma tela real que precise
dele. Chromatic e Style Dictionary ficam deliberadamente fora — ver seção 2
(o que não usar) para o racional e a condição de revisitar.

### Fase 1 — Pacientes + agenda mínima

**Escopo:** cadastro ADMINISTRATIVO (recepção: contato, convênio, consentimento
LGPD) + cadastro CLÍNICO (coordenador: perfil clínico, protocolo(s) de
referência via `PatientProtocol`, equipe de cuidado inicial) + agenda semanal
mínima + check-in.

**Critério de pronto:** um coordenador cadastra um paciente real de ponta a
ponta (administrativo → clínico → protocolo) e um terapeuta vê a sessão
aparecer na grade do dia.

**Risco que elimina:** sem isso não existe base legal (consentimento) nem de
dado (protocolo de referência) para qualquer fase seguinte — é o alicerce, não
uma tela burocrática.

### Fase 2 — Metas + diário (sem IA)

**Escopo:** ciclo de vida da `Goal`, critério de domínio estruturado (N acertos
em M sessões, via formulário), diário por texto ligado à sessão, fila de
pendências do dia.

**Critério de pronto:** um terapeuta registra um diário de sessão real
vinculado a uma meta, sem nenhum processamento de IA envolvido.

**Risco que elimina:** valida que o REGISTRO manual — a funcionalidade mínima
que já substitui a planilha — é usável e sustentável no dia a dia antes de
investir em IA em cima dele.

### Fase 3 — Extração + revisão

**Escopo:** pipeline de extração (Claude API + `output-schema.json`), tela de
Revisão, metas individualizadas mapeando marcos do(s) protocolo(s) de
referência do paciente (via `PatientProtocol`) como camada
adicional.

**Critério de pronto:** uma sessão real de um paciente real gera sugestões e o
terapeuta aprova pelo menos uma delas em produção (não só nos casos de teste
sintéticos do Prompt 2).

**Risco que elimina:** valida a proposta de valor central do produto
("chegue na avaliação com o dossiê pronto") com dado real e imprevisível, que
é onde diários de terapeutas reais divergem dos cenários A-C desenhados.

### Fase 4 — Evidências acumuladas + linha do tempo

**Escopo:** gráfico do protocolo com "candidatos a avaliação", `SessionSnapshot`
materializado, linha do tempo (scrubber, delta por sessão, trajetória com
evolução/estagnação/regressão), briefing pré-sessão, perfil de reforçadores.

**Critério de pronto:** um coordenador abre a "sessão 10" de um paciente com
15+ sessões reais e vê o snapshot correto daquele ponto no tempo.

**Risco que elimina:** valida que o event-sourcing leve (decisão 2.5 do modelo
de dados) se sustenta com volume real de sessões antes de depender dele para
decisões de supervisão.

### Fase 5 — Coordenador + exportação

**Escopo:** lista de exceções (estagnação, assiduidade, incidentes graves),
pacote de supervisão, fila de validação/reclassificação, revisão de ciclo de
metas, exportação do relatório da família (narrativo, PDF), dossiê BRUTO de
auditoria de convênio (PDF factual, sem síntese de IA — decisão confirmada em
09/07/2026) **e relatório de convênio NARRATIVO (PDF, IA + revisão do
coordenador, pronto para autorização de continuidade)** — este último
promovido de fast-follow para MVP em 09/07/2026 (decisão de Produto+Vendas,
`modelo-de-negocio.md` seção 4 e `BACKLOG.md` seção D): clínicas-piloto já
identificadas exigem relatório como parte do MVP, não como fast-follow, e o
custo marginal é baixo porque reaproveita o mesmo pipeline (gerar rascunho com
IA → coordenador edita/aprova → exporta PDF) já previsto para o relatório da
família — o que muda é o conjunto de regras/prompt (justificar continuidade de
tratamento para a operadora, não "como apoiar em casa") e o template do PDF.

**Critério de pronto:** um coordenador completa uma reclassificação real com
justificativa e exporta os TRÊS tipos de documento (família, dossiê bruto de
convênio e relatório narrativo de convênio) de um paciente do piloto.

**Risco que elimina:** valida a segunda persona pagante (coordenador/dono de
clínica) e entrega os artefatos que sustentam faturamento de convênio — tanto
o bruto/auditável quanto o narrativo que justifica autorização de continuidade
— sem depender de um fast-follow sem data para fechar as clínicas-piloto que já
pedem isso como condição de MVP.

### Fase 6 — Ditado por voz + polish + hardening LGPD

**Escopo:** captura por áudio com persistência local antes do upload
confirmado (fila de reenvio), ASR pt-BR, e aplicação integral do checklist de
segurança/LGPD abaixo.

**Critério de pronto:** um terapeuta grava um áudio em conexão instável (ex.:
modo avião ligado propositalmente no teste) e o diário não se perde; todos os
itens do checklist de LGPD marcados.

**Risco que elimina:** fecha a lacuna operacional (corredor, mãos ocupadas,
privacidade do ditado) e a lacuna de compliance antes de operar com dado real
de paciente em escala — é a fase que autoriza o piloto de verdade, não só o
teste interno.

**Fast-follow pós-MVP (não construir agora):** avaliação formal assistida
(janela de pontuação com dossiê), anamnese estruturada — o relatório de
convênio NARRATIVO saiu desta lista em 09/07/2026 e entrou na Fase 5 (ver
acima), junto com o dossiê bruto.

**Backlog nomeado (mais adiante ainda):** relatório escolar, transição/alta,
reunião interdisciplinar, treino parental/portal da família.

---

## 4. Checklist de segurança/LGPD mínimo viável antes de dado real de paciente

- [ ] RLS habilitado E TESTADO nas tabelas com dado clínico — testado com um
      usuário de cada papel tentando acessar dado fora do próprio escopo, não
      só a policy criada.
- [ ] Confirmado por teste automatizado que `admin_recepcao` não acessa
      `PatientClinicalProfile`, `Evidence`, `PatientProtocol` nem qualquer
      outra tabela clínica.
- [ ] Login com senha + MFA disponível e ativado por padrão para papéis
      `coordenador`/`terapeuta` (piso legal confirmado — nenhum conselho exige
      ICP-Brasil).
- [ ] `AuditLog` gravando toda exportação de `Report` ANTES de liberar o
      download (família e convênio).
- [ ] `Consent` versionado coletado antes de qualquer dado clínico ser
      inserido — os 3 tipos: `tratamento_dados_menor`, `uso_ia_processamento`,
      `exportacao_relatorios`.
- [ ] Retenção configurável por clínica implementada
      (`clinic.politica_retencao_meses`), mesmo que só com o default sugerido
      pelo produto ativo.
- [ ] DPA (Data Processing Agreement) assinado com a Anthropic cobrindo
      processamento de dado sensível de saúde de menor via API.
- [ ] Hospedagem confirmada em região Brasil (Supabase `sa-east-1`, Vercel
      `gru1`) antes do primeiro dado real entrar no sistema.
- [ ] Backup automático do banco habilitado E TESTADO (um restore real, não
      só a existência do backup).
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

Pesquisa feita a pedido de Rômulo, fechando o item que ficava só como
placeholder ("API gerenciada, decisão adiada"). O uso real é **captura
assíncrona** (o terapeuta grava um áudio curto no fim da sessão, que é
persistido localmente e enviado para processamento em segundo plano — Tema 4
da pesquisa, `AudioCapture`) — isso significa que o preço relevante é o de
**transcrição em lote (batch/pré-gravado)**, não o de streaming em tempo real
(mais caro em todos os provedores pesquisados), já que não há requisito de
transcrição ao vivo durante a sessão.

| Provedor | Preço (lote/pré-gravado) | Região Brasil confirmada | Acurácia em pt-BR |
|---|---|---|---|
| **OpenAI Whisper API** | US$ 0,006/min | Não (endpoint só nos EUA) | WER 5-7% (Whisper large-v3, "Tier 1 forte" — comparável a alemão/italiano, atrás só de espanhol/francês) |
| **OpenAI gpt-4o-transcribe** | US$ 0,006/min (mesmo preço do Whisper) | Não (endpoint só nos EUA) | Não publicado separado por idioma, mas o provedor recomenda especificamente para "áudio difícil, sotaques, ruído de fundo" — cenário real de sala de terapia |
| **Azure AI Speech (Standard batch)** | US$ 0,006/min | **Sim — `brazilsouth`, dados processados só naquela região** | Não encontrei WER publicado especificamente para pt-BR nesta pesquisa |
| **Google Cloud Speech-to-Text (Chirp, standard)** | US$ 0,016/min (ou US$ 0,003/min em Dynamic Batch, fila de menor prioridade) | Não confirmado (documentação não lista região BR explicitamente) | Não encontrei WER publicado especificamente para pt-BR nesta pesquisa |
| **Deepgram Nova-3** | US$ 0,0048–0,0077/min (pré-gravado) | Não | Declara suporte a 45+ idiomas, sem WER público por idioma nesta pesquisa |

**Leitura dos dados:** três provedores empatam em ~US$ 0,006/min para lote
(Whisper, gpt-4o-transcribe, Azure Standard batch) — a preços de piloto
(dezenas de sessões/dia), a diferença entre eles é irrelevante em R$, o mesmo
padrão já observado na escolha do LLM de extração (`modelo-de-negocio.md`
seção 5: custo de IA não pressiona o preço). A decisão real está em DOIS
outros eixos:

1. **Região de hospedagem** — só o Azure AI Speech confirma região
   `brazilsouth` com processamento de dado só ali, o mesmo padrão já adotado
   para Supabase (`sa-east-1`) e Vercel (`gru1`). Isso é um ponto real a favor
   do Azure: evita adicionar mais um provedor fora do Brasil à cadeia de
   transferência internacional de dado sensível de saúde de menor (que já
   existe para a Claude API de extração — `validacao-legal-prontuario.md`
   seção 5), simplificando a conversa de compliance com clínicas.
2. **Acurácia documentada em português** — só o Whisper/large-v3 tem WER
   publicado especificamente por idioma (5-7% em português, nesta pesquisa);
   Azure e Google não têm esse número facilmente disponível publicamente, o
   que não significa que sejam piores, só que a comparação exigiria teste
   próprio (mesmo padrão do bake-off de LLM: nenhum benchmark público mede o
   que importa aqui — voz real de terapeuta em sala clínica, com ruído de
   fundo e sotaque regional brasileiro).

**Recomendação (não é decisão travada — Fase 6 ainda está longe):** shortlist
de 2 candidatos para o teste real quando a Fase 6 chegar — **gpt-4o-transcribe**
(acurácia declarada para áudio difícil/sotaque/ruído, preço igual ao Whisper)
e **Azure AI Speech** (única opção com região Brasil confirmada). Mesmo
padrão do bake-off do LLM de extração: gravar 5-10 áudios reais de diário
(idealmente já em ambiente de clínica, com ruído de fundo real) e comparar
transcrição literal contra os dois antes de travar o provedor — não decidir só
por preço de tabela ou WER de benchmark genérico, já que nenhum dos dois foi
medido contra o caso de uso real do Iris (voz de terapeuta ditando observação
clínica, não leitura de texto em estúdio).

---

## Fontes

- [Available regions | Supabase Docs](https://supabase.com/docs/guides/platform/regions) — confirma região `sa-east-1` (São Paulo, Brasil) disponível para projetos Supabase.
- [São Paulo, Brazil (gru1) pricing | Vercel Docs](https://vercel.com/docs/pricing/regional-pricing/gru1) — confirma região `gru1` (São Paulo) disponível para Vercel Functions.
- [Pricing | OpenRouter](https://openrouter.ai/pricing) — confirma que não há markup sobre o preço do provedor, mas há taxa de 5,5% em conta pay-as-you-go (dispensada só com BYOK).
- [Provider Logging - Provider Data Retention Policies | OpenRouter Docs](https://openrouter.ai/docs/guides/privacy/provider-logging) — confirma que a política de retenção varia por provedor roteado, sem garantia de retenção zero por padrão.
- [LLM Leaderboard | Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) — Intelligence Index e preço/1M tokens (jul/2026): Claude Sonnet 5 (53, US$ 1,54) vs Gemini 3.1 Pro (46, US$ 1,74) vs Gemini 3.5 Flash (50, US$ 1,31).
- [Claude API Models and Pricing | Claude Docs](https://platform.claude.com/docs/en/about-claude/pricing) — preços oficiais por modelo (Sonnet 5, Opus, Haiku) e caching.
- [Gemini API Pricing | Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing) — preços oficiais por modelo (3.1 Pro, 3.5 Flash, 3.1 Flash-Lite).
- [OpenAI Transcribe & Whisper API Pricing (Jul 2026) | Costgoat](https://costgoat.com/pricing/openai-transcription) — confirma US$ 0,006/min para Whisper API e gpt-4o-transcribe (mesmo preço), e que o gpt-4o-transcribe é recomendado para áudio difícil/sotaques/ruído de fundo.
- [How Accurate Is Whisper? 2026 WER Data by Language | VexaScribe](https://vexascribe.com/how-accurate-is-whisper) — WER de 5-7% em português para Whisper large-v3, classificado como "Tier 1 forte".
- [Deepgram Pricing](https://deepgram.com/pricing) — confirma US$ 0,0048-0,0077/min para Nova-3 pré-gravado (monolingual), suporte a 45+ idiomas sem detalhar acurácia por idioma na página de preços.
- [Speech-to-Text API Pricing | Google Cloud](https://cloud.google.com/speech-to-text/pricing) — confirma US$ 0,016/min (padrão) e US$ 0,003/min (Dynamic Batch) para o modelo Chirp.
- [Regional availability | Cloud Speech-to-Text | Google Cloud Docs](https://docs.cloud.google.com/speech-to-text/docs/locations) — não lista explicitamente região Brasil/América do Sul entre os exemplos verificados.
- [Azure Speech Services Pricing 2025 | BrassTranscripts](https://brasstranscripts.com/blog/azure-speech-services-pricing-2025-microsoft-ecosystem-costs) — confirma US$ 1,00/hora (real-time) e US$ 0,36/hora = US$ 0,006/min (batch) para o Azure Speech Standard.
- [Supported regions for Azure Speech | Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions) — confirma região `brazilsouth` disponível para Azure Speech, com dados processados só naquela região quando o recurso é criado nela.
