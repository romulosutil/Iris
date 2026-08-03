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

1. **O preço por paciente ativo está validado pelo mercado** — 3 dos 4
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

## 3. Métrica de valor: por paciente ativo/mês (DECISÃO)

**Cobrança por paciente ativo/mês, usuários ilimitados.** Rejeitado o preço por
terapeuta/assento, por quatro razões:

1. **Alinhamento com a receita da clínica** — clínica fatura por paciente×hora;
   o custo do software cresce junto com a receita, nunca antes dela.
2. **Não pune o grafo M:N** — a tese do produto é a equipe interdisciplinar
   inteira (ABA + Fono + TO) no prontuário do mesmo paciente. Preço por assento
   penalizaria exatamente o comportamento que o produto precisa induzir.
3. **Norma da categoria** — o comprador já entende e compara nessa unidade.
4. **Coincide com a unidade LGPD** — o titular dos dados é o paciente;
   contratos, consentimento e cobrança falam da mesma coisa.

**Definição de "paciente ativo" — DECISÃO (01/08/2026, Rômulo):** paciente
**cadastrado e não arquivado**, apurado por snapshot no ciclo. Não é "≥1 sessão
no mês" (hipótese anterior, e a alternativa Neoaba de >3 sessões/mês fica
descartada): contagem por sessão obrigaria a apurar uso retroativo e puniria
recesso, férias e paciente em avaliação.

Três guardas inegociáveis, porque a unidade de cobrança encosta em dever de
guarda de prontuário:

1. **Arquivado ≠ apagado.** Paciente arquivado sai da fatura mas continua
   legível e exportável. Cobrar por dado que o profissional é obrigado a manter
   empurraria o cliente a apagar prontuário.
2. **Arquivamento é decisão organizacional** (`patient.arquivado_em`), distinta
   da alta clínica (`patient.alta_em`), que dispara o relógio de retenção LGPD.
   Alta arquiva; arquivar nunca dá alta.
3. **Auto-arquivamento após 90 dias sem atualização**, com aviso 7 dias antes —
   fatura inflada por cadastro esquecido é o caminho mais curto para o cliente
   mutilar o prontuário e o dossiê de convênio sair furado.

**Piso por assinatura: descartado no self-service** (D2 da spec de cadastro,
reafirmado em 01/08). Piso deixa o preço regressivo ao contrário — quem tem 3
pacientes pagaria mais por paciente que quem tem 15 — e afasta o autônomo
pequeno, que é exatamente o canal orgânico do §6. Em avaliação como substituto:
**plano de entrada** (base mensal que já inclui os primeiros pacientes),
protegendo o CAC sem punir o pequeno. Na venda assistida (#36) o piso continua
válido.

## 4. Empacotamento: 3 tiers mapeados às fases do MVP

| Tier         | Para quem                                     | O que entrega                                                                                                                                                                                                                                                                                   | Fases                                    | Preço (HIPÓTESE)    |
| ------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------- |
| **Diário**   | Terapeuta autônomo / clínica que quer começar | Ficha+consentimento, agenda mínima, diário 2 tempos, extração+revisão, metas/PEI, linha do tempo, briefing pré-sessão, perfil de reforçadores, **dossiê bruto de auditoria de convênio** (escopado aos próprios pacientes do profissional)                                                      | 1–4                                      | R$ 39–49 /paciente  |
| **Clínica**  | Clínica com supervisão                        | + módulo coordenador: exceções, pacote de supervisão, fila de validação/reclassificação, revisão de ciclo de metas, relatório da família (PDF), métricas transparentes                                                                                                                          | 5                                        | R$ 69–79 /paciente  |
| **Convênio** | Clínica que vive de operadora                 | + relatório de convênio NARRATIVO (síntese com IA + revisão do coordenador, pronto para autorização de continuidade) — **agora Fase 5 (MVP)**; avaliação formal assistida (janela de pontuação com dossiê), série de reavaliações, relatório avaliativo interdisciplinar continuam fast-follows | **5** (narrativo) + fast-follows (resto) | R$ 99–119 /paciente |

**Decisão confirmada por Rômulo (09/07/2026):** o dossiê bruto de auditoria
entra no MVP (Fase 5), não fica preso ao tier Convênio. Motivo: risco de
auditoria de operadora não é exclusivo de quem já vive de convênio — qualquer
profissional/clínica dos tiers Diário/Clínica com paciente de convênio pode
ser auditada e precisa produzir documentação sob demanda. É tecnicamente
barato (reaproveita o pipeline de export/`audit_log` já construído para o
relatório da família — `Report.tipo='convenio_bruto'`, distinto de
`convenio_narrativo`, seção 1.6 de `modelo-de-dados.md`) e ataca a mesma dor
"analgésica" já validada (linha 15 da tabela de validação acima), reforçada
por sinal de campo: uma terapeuta, ao ver o protótipo, perguntou primeiro se
dava para exportar relatório de convênio. O que permanece exclusivo do tier
Convênio é a versão NARRATIVA (síntese com IA + revisão do coordenador,
pronta para justificar autorização de continuidade) — essa sim exige o
pipeline de geração de texto e a curadoria do coordenador, diferenciação real
de valor que sustenta o preço mais alto do tier.

**Revisão da decisão (09/07/2026) — dossiê bruto também no tier Diário:** o
empacotamento original prendia o dossiê bruto ao tier Clínica (dentro do
módulo coordenador), o que contradizia o próprio motivo acima — um terapeuta
autônomo no tier Diário que fatura convênio direto (persona plausível: Aline
ou Diego antes de crescer) ficava sem a proteção que justificou trazer o
dossiê pro MVP. Rômulo confirmou a correção: destravar a tela de exportação
do dossiê bruto (seção 4.6 de `fluxos-e-wireframes.md`) também no tier
Diário, escopada aos próprios pacientes do profissional, SEM o resto do
módulo coordenador. Custo técnico é baixo — é uma regra de acesso sobre uma
tela e um pipeline já construídos, não um módulo novo. O tier Clínica não
perde diferenciação: continua exclusivo dele o módulo coordenador inteiro
(exceções, pacote de supervisão, fila de validação/reclassificação, revisão
de ciclo de metas, relatório da família, métricas transparentes) — o dossiê
bruto sozinho nunca foi o que sustentava o salto de preço Diário→Clínica.

**Relatório de convênio NARRATIVO promovido de fast-follow para MVP (09/07/2026)
— atuando como Especialista de Produto + Especialista de Vendas, a pedido de
Rômulo:** Rômulo já encontrou clínicas-piloto interessadas, mas para elas
relatório não pode ser um "fast-follow" — precisa estar no produto que
assinam. Revisão completa da seção F do backlog (10 itens pós-MVP) contra dois
critérios — (1) reaproveita infraestrutura JÁ prevista na Fase 5? (2) é a dor
que já valida pagamento, com sinal de cliente real, não só hipótese? — só o
relatório narrativo de convênio bate os dois ao mesmo tempo: o "segundo
agente" (gerar rascunho com IA → coordenador edita/aprova → exporta PDF) já
está desenhado para o relatório da família e o `Report.tipo='convenio_narrativo'`
já tem DDL própria (split de `convenio_bruto`, seção A do backlog) — o custo
marginal de trazer para a Fase 5 é essencialmente um novo conjunto de regras/
prompt (o que o relatório precisa dizer para justificar continuidade de
tratamento a uma operadora, não "como apoiar em casa") e um template de PDF,
não uma arquitetura nova. Sem isso, o tier Convênio — o mais caro — ficava sem
o artefato que sustenta o preço até um fast-follow sem data, o que é
inaceitável com cliente concreto pedindo agora. **O que NÃO foi promovido, e
por quê:** avaliação formal assistida e relatório avaliativo interdisciplinar
exigem UI/lógica nova (janela de pontuação, síntese cross-protocolo) sem sinal
de cliente pedindo isso especificamente — promovê-los junto diluiria o foco da
Fase 5 sem receita adicional comprovada; ficam como próxima leva se as
clínicas-piloto sinalizarem que também são bloqueadores de venda (decisão
revisável, não definitiva). Os outros 8 itens da seção F (2º protocolo,
anamnese, relatório escolar, transição/alta, reunião interdisciplinar, treino
parental, dataset de divergência) não têm pedido de cliente nem urgência de
receita identificados nesta rodada — continuam pós-MVP sem mudança.

**Revisão 01/08/2026 — régua marginal para o self-service (PROPOSTA, não
fechada).** O preço linear por paciente explode na conta média: 30 pacientes a
R$ 39 dá R$ 1.170/mês, contra ~R$ 387 do ABA Digital (que cobra por terapeuta,
pacientes ilimitados) — o piso de preço da categoria. Proposta em avaliação:
desconto **marginal** por degrau, sem salto ao cadastrar mais um paciente —
R$ 39 até 15 pacientes, R$ 32 de 16 a 40, R$ 25 de 41 em diante. Resultado:
8 pacientes = R$ 312 · 30 = R$ 1.065 · 80 = R$ 2.385, ~40–50% abaixo da tabela
pública do ComportaTUDO.

**O que impede fechar o número:** ele está ancorado na única tabela pública do
mercado, e os outros três concorrentes praticam "sob consulta" — preço de tabela
não é preço praticado. Nenhum real foi faturado até hoje. Até haver cliente
pagante, o valor vive em coluna versionada por assinatura (nunca em constante no
código) e as primeiras clínicas entram com **preço de fundador**. Medição
proposta: cobrar as duas primeiras clínicas com valores diferentes e observar
aceitação — a única evidência real disponível antes do Van Westendorp do
Roteiro C.

Racional dos números: ancorados na régua pública do ComportaTUDO (59,90–99,90),
com o tier de entrada ABAIXO deles (escopo menor — não temos financeiro/agenda
completa) e o tier Convênio ACIMA (o relatório de operadora vale dias de
trabalho do dono; valor econômico direto). Números finais só após Roteiro C
(usar Van Westendorp; perguntar preço SÓ depois de mostrar o pacote de
supervisão e o relatório de convênio).

Conta de padaria do comprador: clínica do Diego (6 terapeutas, ~30 pacientes)
no tier Convênio ≈ R$ 3.000/mês contra dias de trabalho dele por trimestre +
risco de glosa. Clínica da Fernanda (80 pacientes) no Clínica ≈ R$ 5.600/mês —
menos que meio salário de auxiliar administrativo.

## 5. Custo unitário e margem (estimativa de engenharia)

Por sessão processada: diário (~500 tokens) + contexto do paciente
(protocolo ativo, metas, últimas N sessões ≈ 4–8k tokens) + saída estruturada
(1–2k tokens). Com modelo de tier médio, R$ 0,05–0,20/sessão; briefing
pré-sessão é resumo curto sobre dados já estruturados (mais barato). Paciente
intensivo (20 sessões/mês) ≈ **R$ 2–5/mês de custo de IA por paciente** contra
R$ 39–119 de receita → margem de IA >90%. ASR para ditado (Fase 6) adiciona
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
- Economia: NRR (expansão por paciente ativo), churn de clínicas, custo de IA
  por sessão.

## 8. O que segue em aberto (vai para pesquisa real / piloto)

1. Números finais de preço e a definição exata de "paciente ativo" (Roteiro C).
2. Peso real do relatório de convênio na decisão de compra (Tema 6) — se
   confirmado, ele pode ANTECIPAR: cobrar caro pelo tier Convênio desde o
   fast-follow em vez de tratá-lo como expansão.
3. ~~Decidir o non-goal de coleta por tentativa~~ — **decisão de produto tomada
   em 09/07/2026** (ver §2 acima: mantém narrativa como modo primário, campo
   `tentativas` já cobre o meio-termo, condição de reversão documentada). O que
   segue em aberto é só a VALIDAÇÃO real nos Roteiros A/C — se supervisores ou
   operadoras exigirem trial-by-trial como bloqueador (não preferência), a
   reversão já está desenhada (registro estruturado opcional dentro da sessão,
   sem trair a tese narrativa).
4. ~~Nome/marca e domínio~~ — **decidido por Rômulo em 10/07/2026: Iris,
   domínio `irisclinica.ia.br`.** Rebranding já aplicado em toda a
   documentação (este documento incluído).
