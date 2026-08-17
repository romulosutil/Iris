# Modelo de Negócio — Iris

Decisões de negócio derivadas da especificação, da pesquisa simulada e de
pesquisa de mercado real (jul/2026). O que aqui é DECISÃO estrutural pode ser
executado já; o que é HIPÓTESE tem número e vai para o Roteiro C da pesquisa real.

---

## 1. O analgésico: qual dor paga o produto

Três dores, três bolsos, um só dossiê de evidências:

| Dor                                                                                         | Quem sente                                  | Quem paga                                    | Intensidade                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Relatório de convênio (autorização de continuidade) consome dias do dono a cada trimestre   | Dono/coordenador de clínica pequena (Diego) | Ele mesmo — "têm meu cartão de crédito hoje" | Analgésico puro: sem relatório, a clínica não fatura |
| Supervisão sem visibilidade: descobrir estagnação tarde, montar pacote de supervisão na mão | Coordenador (Fernanda)                      | Clínica                                      | "Só isso já paga a assinatura"                       |
| 20 min/sessão de planilha, registro de memória no fim do dia                                | Terapeuta (Aline)                           | Não paga — mas decide a ADOÇÃO               | Dor diária; sem ela resolvida, ninguém renova        |

Lógica do funil de valor: **o terapeuta adota porque registra em <5 min; o
coordenador renova porque supervisiona por exceção; o dono paga porque o
convênio e a família recebem relatórios que hoje custam dias.** O produto é
vendido pela dor do dono, adotado pela dor do terapeuta.

## 2. Mercado e concorrência (pesquisa real, jul/2026)

O mercado brasileiro de software para clínica ABA/TEA **existe, é ativo e já
pratica preço por paciente**:

| Player                                           | Modelo                                                                                                           | Preço público               | Proposta                                                                                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ComportaTUDO](https://www.comportatudo.com.br/) | Por paciente ativo/mês, mín. 10 pacientes                                                                        | R$ 59,90 / 79,90 / 99,90    | Gestão completa + "relatórios com IA" + transcrição automática com IA (Whisper) + sugestões PIC automáticas + portal do familiar + módulo financeiro completo                                            |
| [Neoaba](https://www.neoaba.com.br/)             | Tiers por nº de pacientes ABA (20/40/100, custom acima); trial grátis 5 dias                                     | sob consulta                | PEI gerado por IA a partir das avaliações + analytics preditivo (paciente em risco) + import de protocolo via IA (upload de até 20 PDFs) + assinatura digital ICP-Brasil + faturamento com convênio      |
| [BlueSmiles](https://bluesmiles.com.br/)         | Planos flexíveis, "pague só pelo que usar"                                                                       | sob consulta (via WhatsApp) | Gerador de PEI com IA + gráficos automáticos + **relatórios para convênios e planos de saúde** (já anunciado, não fast-follow) + registro de sessão <2min + planilha digital com cálculo automático de % |
| [ABA Digital](https://abadigital.com.br/)        | Por Nº de terapeutas (não por paciente): R$ 147 (3 terap.) / 247 (5) / 387 (20), pacientes/avaliações ilimitados | R$ 147-387                  | 6 protocolos centralizados (ABLLS-R, M-CHAT-R/F, Portage, VB-MAPP, Denver II, PROC) + PEI gerado por IA + chat IA especialista via WhatsApp + relatórios PDF/DOCX automáticos                            |
| [ABA+](https://abamais.com/)                     | —                                                                                                                | —                           | Coleta e gráficos ABA                                                                                                                                                                                    |

**Investigação pública direta (09/07/2026)** — visitei os 4 sites (não é
trial/cadastro, só o que está público). Achado que muda o quadro: **"IA no
relatório/PEI" não é diferencial de NENHUM dos 4** — todos já anunciam geração
por IA (não só o ComportaTUDO). Achado mais sério: **BlueSmiles já anuncia
"relatórios para convênios e planos de saúde" na própria home** — não é mais
seguro assumir que o dossiê de convênio é território livre; a pergunta de
produto vira "o dossiê deles é bruto e auditável, ou é síntese de IA
opinativa?" (não deu pra confirmar sem cadastro — pendência de trial/demo).
Em compensação, **nenhum dos 4 menciona** proveniência frase-a-frase
(rastreamento até o texto original do terapeuta), a distinção evidência ≠
pontuação (aprovação humana obrigatória antes de um dado virar permanente),
ou qualquer mecanismo de reclassificação/auditoria de divergência — os sinais
públicos (planilha digital com % automático no BlueSmiles, protocolos
clicáveis no ABA Digital, import de PDF de protocolo na Neoaba) continuam
consistentes com "digitalizaram a coleta estruturada", não com "extração a
partir de linguagem natural livre". A tese de diferenciação (narrativa +
proveniência + governança) segue de pé, mas o argumento de venda precisa
migrar de "temos relatório de convênio" (não é mais exclusivo) para "nosso
relatório de convênio é o único rastreável frase a frase até a sessão de
origem" — mais defensável e harder to copy que só "ter" o relatório.

O que isso muda:

1. **O preço por ficha ativa (paciente ativo, no vocabulário do mercado) está validado** — 3 dos 4
   concorrentes cobram assim; ABA Digital é a exceção (por terapeuta), o que
   reforça que "por paciente" é a norma, não a exceção.
2. **"IA no relatório" deixou de ser diferencial declarável** — confirmado
   agora contra os 4, não só o ComportaTUDO. O diferencial do Iris precisa
   ser dito com precisão (ver §3) e reforçado pela auditabilidade, não pela
   presença de IA.
3. **Relatório de convênio também deixou de ser exclusividade** — BlueSmiles
   já anuncia isso publicamente. Reforça a recomendação de posicionar o
   dossiê BRUTO (sem síntese, com proveniência) como o ângulo defensável,
   não "ter relatório de convênio" como capacidade em si.
4. **Não competir em gestão** (financeiro, faturamento, repasse, agendamento
   completo): é o terreno deles, é commodity, e o Bloco 0 já cortou. A agenda
   mínima existe só para dar contexto ao diário.

### Posicionamento contra a categoria

Os concorrentes digitalizaram a planilha: formulários de coleta por tentativa,
protocolos clicáveis, relatório gerado por IA _no fim_. O Iris inverte a
captura: **linguagem natural primeiro, estrutura derivada e rastreável depois,
com governança clínica em 3 camadas**. A frase de posicionamento:

> "Eles digitalizaram a planilha. Nós eliminamos ela — e cada dado do prontuário
> aponta para a frase do terapeuta que o sustenta."

Sub-diferenciais defensáveis: proveniência frase-a-frase (auditável para
supervisor e convênio), evidência ≠ pontuação (credibilidade clínica —
**confirmado em 09/07/2026 que nenhum dos 4 concorrentes investigados
distingue isso publicamente**), metas/PEI como unidade (serve TO/Fono/Denver,
não só ABA), dataset de reclassificação (loop de melhoria proprietário — V5).

**Risco competitivo a validar cedo:** clínicas habituadas à coleta por
tentativa (trial-by-trial) podem considerar o diário narrativo "menos
científico", e convênios podem exigir folha de registro fria. Ver non-goal
consciente na auditoria de jornadas e pergunta no Roteiro A/C. **Achado real
(09/07/2026):** o risco é concreto, não hipotético — BlueSmiles e ABA Digital
já digitalizam planilha de % automático e protocolo clicável, o modelo que o
Iris deliberadamente não constrói (ver non-goal abaixo). Reforça que a
pergunta precisa mesmo entrar nos Roteiros A/C, não é só um risco de papel.

### Non-goal: coleta estruturada por tentativa (trial-by-trial) — DECISÃO (09/07/2026)

Formalmente pendente de pesquisa real (Roteiros A/C), mas tomando a decisão de
produto agora em vez de deixar em aberto indefinidamente — com o racional
evidência-first já existente e uma reversão explícita se a pesquisa real
contradisser:

**Decisão: o Iris NÃO constrói uma UI de coleta por tentativa estruturada
(campo por campo, tentativa a tentativa, dentro da sessão) como modo primário
de registro.** Isso reintroduziria exatamente a "planilha" que o produto
elimina (a dor diária da Aline, item que decide a ADOÇÃO — §1) e quebraria a
tese central de posicionamento ("eliminamos a planilha, não a digitalizamos").
Um concorrente com trial-by-trial nativo compete no terreno deles (protocolos
clicáveis), não no nosso.

**Reforço da decisão (confirmado por Rômulo, 10/07/2026):** este non-goal não
é uma concessão para "manter o produto simples" — é a aposta de inovação
central do Iris. Trial-by-trial estruturado é o padrão simplório/incumbente
(é o que ComportaTUDO, Neoaba, BlueSmiles e ABA Digital já fazem — seção 2
acima); o diário em linguagem natural com extração estruturada por trás é o
que torna o Iris diferente, não uma versão reduzida da categoria. Só revisitar
sob a condição de reversão explícita abaixo (sinal real de bloqueio de venda),
nunca por conforto de "voltar ao familiar".

**Por que isso não é "menos científico" na prática, e o meio-termo já existe no
schema:** o `output-schema.json` já tem um campo `tentativas` (`informado`,
`total`, `acertos`) dentro de `evidencia` — quando o terapeuta MENCIONA a
contagem na narrativa ("tentei 5 vezes, acertou 3"), o agente já captura o
número estruturado, sem exigir que o registro SEMPRE seja feito tentativa a
tentativa. Isso é o meio-termo: estrutura quando o dado espontaneamente existe
no relato, nunca like um formulário que EXIGE contagem para poder salvar.

**Mitigação do risco de convênio/supervisor "cético":** a proveniência
frase-a-frase (toda Evidence aponta para o trecho-fonte literal) e o dossiê
bruto de auditoria (Fase 5, seção 4 acima) já dão a um supervisor cético ou a
uma auditoria de convênio uma trilha auditável equivalente ou superior a uma
folha de tentativas fria — o argumento de venda é "você vê a frase original
que gerou cada dado", não "confie no software".

**Condição de reversão (o non-goal não é definitivo):** se os Roteiros A
(supervisores) e C (auditoria de convênio) da pesquisa real revelarem que
trial-by-trial é bloqueador de venda (não só preferência), a resposta não é
abandonar a narrativa — é adicionar um modo de entrada estruturada OPCIONAL
dentro da sessão (ex.: um widget de contagem rápida acoplado à nota, gerando
o mesmo payload `tentativas` do agente), nunca substituir o diário como fonte
primária. Revisitar esta decisão antes de travar as telas de captura da Fase 3,
não depois.

## 3. Métrica de valor: por ficha ativa/mês (DECISÃO)

**Cobrança por ficha ativa/mês, usuários ilimitados.** Rejeitado o preço por
terapeuta/assento, por quatro razões:

1. **Alinhamento com a receita da clínica** — clínica fatura por paciente×hora;
   o custo do software cresce junto com a receita, nunca antes dela.
2. **Não pune o grafo M:N** — a tese do produto é a equipe interdisciplinar
   inteira (ABA + Fono + TO) no prontuário do mesmo paciente. Preço por assento
   penalizaria exatamente o comportamento que o produto precisa induzir.
3. **Norma da categoria** — o comprador já entende e compara nessa unidade.
4. **Coincide com a unidade LGPD** — o titular dos dados é o paciente;
   contratos, consentimento e cobrança falam da mesma coisa.

**Termo público — DECISÃO 9 (04/08/2026, Rômulo):** a unidade se chama **ficha
ativa** ("R$ 39 por ficha ativa no mês"), não mais "paciente ativo". Motivo:
"paciente ativo" carregava três significados ao mesmo tempo — `arquivado_em IS
NULL`, a unidade faturável do ciclo, e a leitura clínica de "paciente em
tratamento". "Ficha ativa" nomeia o **registro consumido**, não a pessoa, e não
colide com a linguagem clínica de quem usa o produto.

**Critério de faturamento — DECISÃO 8 (04/08/2026, Rômulo), substitui a decisão
de 01/08:** fatura-se a ficha que foi **(a) cadastrada dentro do ciclo** OU
**(b) teve interação registrada nele** — sessão agendada, check-in, evolução em
prontuário ou evidência aprovada. O critério **(c) "cadastrada e não
arquivada"**, decidido em 01/08, **SAIU**.

Implementado em `db/migrations/0075_billing_pos_pago.sql`, na função
`billing_apurar_ciclo` (SECURITY DEFINER). Ela é a fonte única do "quem conta";
`src/lib/billing/calculator.ts` responde só "quanto custa essa quantidade".

**Consequência aceita conscientemente:** clínica em recesso paga **R$ 0,00**.
Um mês sem sessão, sem check-in, sem evolução e sem cadastro novo zera a fatura,
mesmo com 40 pacientes na base. É mais generoso que a regra publicada até 01/08,
e o texto público foi reescrito junto (landing, FAQ, tela de assinatura). A
justificativa de 01/08 para o critério (c) — "não punir recesso, férias e
paciente em avaliação" — ficou invertida na prática: com (a)+(b), recesso e
férias saem da conta em vez de entrarem nela.

**Nota de compatibilidade, inegociável:** o enum `billing_motivo_ativo` e o
valor `ativo_nao_arquivado` **não mudam**. `billing_cycle_patient.motivo` é
memorial de fatura emitida; renomear reescreveria retroativamente o registro de
por que alguém foi cobrado. A renomeação para "ficha ativa" vale na camada de
linguagem e nos símbolos TypeScript, nunca em coluna ou enum de banco.

Três guardas inegociáveis, porque a unidade de cobrança encosta em dever de
guarda de prontuário:

1. **Arquivado ≠ apagado.** Ficha arquivada continua legível e exportável, e
   deixa de aparecer na fatura naturalmente (sem movimento, não conta). Cobrar
   por dado que o profissional é obrigado a manter empurraria o cliente a apagar
   prontuário.
2. **Arquivamento é decisão organizacional** (`patient.arquivado_em`), distinta
   da alta clínica (`patient.alta_em`), que dispara o relógio de retenção LGPD.
   Alta arquiva; arquivar nunca dá alta.
3. **Auto-arquivamento após 90 dias sem atualização**, com aviso 7 dias antes.
   Com o critério (a)+(b) isso deixou de ser guarda contra fatura inflada — ficha
   esquecida já não é cobrada — e continua valendo como higiene de base: lista de
   pacientes que não reflete quem está em atendimento suja agenda, relatório e
   dossiê de convênio.

**Piso por assinatura: descartado no self-service** (D2 da spec de cadastro,
reafirmado em 01/08). Piso deixa o preço regressivo ao contrário — quem tem 3
pacientes pagaria mais por paciente que quem tem 15 — e afasta o autônomo
pequeno, que é exatamente o canal orgânico do §6. Em avaliação como substituto:
**plano de entrada** (base mensal que já inclui os primeiros pacientes),
protegendo o CAC sem punir o pequeno. Na venda assistida (#36) o piso continua
válido.

## 4. Empacotamento e Precificação (DECISÃO CONSOLIDADA)

O modelo de negócio evoluiu da hipótese inicial de três tiers isolados para uma **oferta completa unificada com precificação marginal regressiva por ficha ativa/mês**, com usuários e terapeutas ilimitados.

### 4.1 Por que o produto unificou a oferta no Self-Service?

1. **Dossiê e Relatório Narrativo no MVP (Fase 5):** O dossiê bruto de auditoria e o relatório de convênio narrativo com IA foram ambos integrados ao núcleo da Fase 5 para atender à dor analgésica das clínicas-piloto.
2. **Sem barreiras artificiais de governança:** A governança clínica em 3 camadas (terapeuta registra em linguagem natural, IA sugere evidências, coordenador supervisiona e valida) gera mais valor quando utilizada de ponta a ponta pela equipe interdisciplinar.
3. **Escala justa:** O cliente não precisa escolher planos complexos no momento do cadastro — o valor adapta-se organicamente ao tamanho da clínica através de faixas marginais.

### 4.2 Tabela de Precificação Marginal Oficial

Implementada em [`src/lib/billing/calculator.ts`](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/lib/billing/calculator.ts) como fonte única da verdade (`FAIXAS_PRECIFICACAO`):

| Faixa (Fichas Ativas no Mês) | Valor Unitário por Ficha (Mensal) | Valor em Centavos |
| :--------------------------- | :-------------------------------- | :---------------- |
| **1ª até a 15ª ficha**       | **R$ 39,00**                      | 3.900 centavos    |
| **16ª até a 40ª ficha**      | **R$ 32,00**                      | 3.200 centavos    |
| **41ª ficha em diante**      | **R$ 25,00**                      | 2.500 centavos    |

- **Regra Marginal Estrita:** O cadastro da 16ª ficha ativa não reprecifica as 15 anteriores — a clínica que cresce tem custo marginal decrescente e previsível, sem saltos regressivos.
- **Simulações de Mensalidade Real:**
  - **8 fichas ativas:** $8 \times 39 = \mathbf{R\$\ 312,00/mês}$
  - **30 fichas ativas:** $(15 \times 39) + (15 \times 32) = \mathbf{R\$\ 1.065,00/mês}$ (~40% abaixo da tabela pública do ComportaTUDO)
  - **80 fichas ativas:** $(15 \times 39) + (25 \times 32) + (40 \times 25) = \mathbf{R\$\ 2.385,00/mês}$

### 4.3 Mecânica Operacional de Faturamento & Pagamento

- **Pós-Pago com Apuração Automática:** O ciclo de 30 dias apura o total de fichas ativas via `billing_apurar_ciclo` (`db/migrations/0075_billing_pos_pago.sql`) e emite a cobrança no fechamento.
- **Trilho Principal de Cobrança:** **Pix Automático** (Bacen Jornada 3 via Asaas) com autorização via QR Code de ativação no onboarding e débito automático no fechamento.
- **Cancelamento Pro-Rata:** Em cancelamento antecipado, apura-se o débito pro-rata correspondente aos dias decorridos (`apurarDebitoProRata`), com o dia iniciado contando cheio e centavos truncados a favor do cliente.
- **Tolerância e Carência (Past Due):** Carência de 10 dias para regularização de falhas de pagamento sem suspensão imediata de prontuário, cobrindo o ciclo de 3 retentativas em 7 dias do Pix Automático.

---

## 5. Custo unitário e margem (estimativa de engenharia)

Por sessão processada: diário (~500 tokens) + contexto do paciente
(protocolo ativo, metas, últimas N sessões ≈ 4–8k tokens) + saída estruturada
(1–2k tokens). Com modelo de tier médio, R$ 0,05–0,20/sessão; briefing
pré-sessão é resumo curto sobre dados já estruturados (mais barato). Paciente
intensivo (20 sessões/mês) ≈ **R$ 2–5/mês de custo de IA por paciente** contra
R$ 25–39 de receita por ficha → margem de IA >90%. ASR para ditado (Fase 6) adiciona
centavos por minuto. Conclusão: **o custo de IA não pressiona o preço; o risco
econômico está em CAC e churn, não em COGS.** Medir custo real por sessão desde
o primeiro dia (item já no backlog D).

## 6. Go-to-market (validação Paul Graham)

Fazer coisas que não escalam, na ordem:

1. **1–2 clínicas fundadoras** (perfil Diego: dono-coordenador, convênios,
   6–10 terapeutas — ciclo de venda de uma conversa). Oferta: desconto de
   fundador vitalício (ex.: 50%) + influência no roadmap, em troca de diários
   reais anonimizados para medir concordância especialista×IA e estudo de caso
   com nome. **Cobrar desde o mês 1** — piloto grátis não valida disposição a
   pagar, que é a incerteza nº 1 do backlog.
2. **Onboarding feito à mão pelo fundador**: cadastrar protocolo, importar
   grade da recepção, treinar terapeutas presencialmente. Isso É a pesquisa
   real (Roteiros A–C) acontecendo dentro do piloto.
3. **A métrica que autoriza escalar**: ≥80% das sessões da clínica com diário
   registrado na semana 4+ (retenção do hábito depois da novidade — Tema 4) e
   ≥70% das extrações aprovadas sem edição. Sem isso, não contratar vendas,
   não fazer marketing.
4. **Canal de expansão**: o relatório (família via WhatsApp, convênio via
   operadora) circula fora do sistema com a marca — é o loop orgânico numa
   comunidade pequena e densa (coordenadores ABA se conhecem; grupos de
   WhatsApp de pais são apontados na pesquisa como canal real).

Sequência de receita: piloto pago com desconto → 5–10 clínicas por indicação
(preço cheio) → só então funil ativo.

## 7. Métricas de negócio

- **North star:** evidências aprovadas por semana (une adoção do terapeuta,
  confiança na IA e valor acumulado no dossiê).
- Ativação: clínica com ≥80% das sessões agendadas com diário em 14 dias.
- Qualidade da IA: % extrações aprovadas sem edição (meta ≥70%); taxa de
  reclassificação do coordenador (proxy IOA, V5).
- Retenção: % de terapeutas registrando na semana 4+ (teste do Tema 4).
- Economia: NRR (expansão por ficha ativa), churn de clínicas, custo de IA
  por sessão.

## 8. O que segue em aberto (vai para pesquisa real / piloto)

1. ~~Definição da métrica e tabela de precificação~~ — **DECIDIDO E IMPLEMENTADO:** Cobrança por ficha ativa/mês com régua marginal (R$ 39 / R$ 32 / R$ 25) consolidada em [`src/lib/billing/calculator.ts`](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/src/lib/billing/calculator.ts). Em aberto apenas a validação empírica da conversão nos pilotos e políticas de desconto de fundador.
2. ~~Inclusão do relatório de convênio~~ — **DECIDIDO E IMPLEMENTADO:** Dossiê Bruto de auditoria e Relatório Narrativo com IA integrados no MVP (Fase 5) e codificados no schema (`report.tipo`).
3. ~~Decidir o non-goal de coleta por tentativa~~ — **DECISÃO DE PRODUTO TOMADA (09/07/2026):** Mantém narrativa como modo primário, campo `tentativas` cobre menções espontâneas, sem UI rígida trial-by-trial.
4. ~~Nome/marca e domínio~~ — **DECIDIDO POR RÔMULO (10/07/2026):** Iris, domínio `irisclinica.ia.br`.
5. ~~Gateway de pagamento e trilho de cobrança~~ — **homologado em produção (11/08/2026, D24/D43/D44):** Faturamento ativo opera exclusivamente via **Asaas com Pix Automático** (`immediateQrCode` com autorização de R$ 0,01 + apuração mensal pós-paga por ficha ativa). Mercado Pago foi formalmente descontinuado (migração `0091_drop_webhook_mercado_pago.sql`).
