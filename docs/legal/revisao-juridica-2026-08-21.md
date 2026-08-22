# Revisão Jurídica — `docs/legal/` (Iris)

**Data:** 21/08/2026
**Escopo:** os 14 documentos de `docs/legal/` — `aditivo-especificacoes-legais.md`, `briefing-duty-to-warn.md`, `briefing-para-advogado.md`, `dpa-asr-audio.md`, `parecer-juridico-duty-to-warn.md`, `pesquisa-planos-de-saude-prontuario.md`, `politica-privacidade.md`, `politica-retencao-dados.md`, `procedimento-revogacao-consentimento.md`, `termo-consentimento-curatela.md`, `termo-consentimento-titular-adulto.md`, `termo-consentimento-titular-emancipado.md`, `termos-de-uso.md`, `validacao-legal-prontuario.md` — lidos na íntegra, mais `AGENTS.md`, `README.md`, `.env.example` e uma checagem pontual em `src/db/schema.ts` para confirmar o que está de fato implementado.

**Natureza deste documento.** Escrevo como advogado revisando o arcabouço com foco em LGPD aplicada a psicologia/terapia. Não sou o advogado de registro do projeto (Thiago Lyra Galvão, autor do `aditivo-especificacoes-legais.md` e do `parecer-juridico-duty-to-warn.md`) e não substituo o protocolo de ratificação já em uso. Uso a mesma régua que o próprio projeto já usa consigo mesmo (`validacao-legal-prontuario.md`, linha 10-20): distingo o que é certeza documental do que é leitura minha, e sinalizo achados novos que não vi apontados em lugar nenhum do corpus. Onde discordo de uma conclusão já ratificada pelo advogado de registro, digo isso explicitamente — não é para ser lido como reversão automática, é para ser levado a ele.

**Conclusão geral, antes do detalhe.** O arcabouço é incomumente maduro para o estágio do produto: a divisão controlador/operador é consistente entre os onze documentos que a mencionam, os quatro regimes de consentimento (menor, adulto, curatela, emancipado) mais a revogação formam um conjunto coerente e tecnicamente amarrado ao banco (constraints, append-only, versionamento), e o parecer de duty-to-warn é sólido e foi corretamente implantado na cláusula 10 dos Termos de Uso. O risco real não está na arquitetura jurídica — está em (i) um achado novo de uso de dado de prontuário para treinar/alimentar modelo próprio, que contradiz a política de privacidade vigente e não passou por nenhuma consulta jurídica; (ii) uma lacuna de implementação de sigilo profissional dentro do prontuário multidisciplinar; e (iii) o método de validação jurídica adotado para os documentos mais recentes, que é frágil como prova em caso de disputa. Detalho os três abaixo, seguidos do restante.

---

## 1. Achado crítico não sinalizado: uso de dado de prontuário para RAG/treinamento de modelo próprio

`pesquisa-planos-de-saude-prontuario.md`, seção 4, encerra assim: *"Todos os relatórios e evoluções gerados permanecem preservados e estruturados no banco de dados para tokenização e indexação RAG (Retrieval-Augmented Generation), alimentando os modelos de inteligência clínica da plataforma Iris."*

Essa frase não é compatível com o restante do arcabouço, e por três motivos independentes:

Primeiro, contradiz `politica-privacidade.md` seção 6, que trata exatamente deste tema — uso agregado de dado clínico para melhorar o produto — e diz que ele "só ocorre mediante consentimento específico e separado do consentimento de tratamento clínico original, e nunca envolve dado identificável do paciente", e que "este uso NÃO está ativo no MVP/piloto". A frase da seção 4 do documento de pesquisa descreve o oposto: dado identificável (relatórios e evoluções, não anonimizados), sem menção a consentimento específico, e apresentado como algo que já "permanece preservado e estruturado" para essa finalidade — não como intenção futura condicionada.

Segundo, colide com a divisão controlador/operador que sustenta todo o resto do arcabouço. Usar o conteúdo do prontuário para "alimentar os modelos de inteligência clínica da plataforma" é uma finalidade do próprio Iris, definida por ele, em proveito próprio — exatamente o traço que a seção 2.1 da política de privacidade usa para justificar a única exceção em que o Iris assume o papel de controlador (a verificação antifraude por `cpf_hash`). Ali, a exceção foi expressamente delimitada a um código irreversível e a uma resposta sim/não, com teste de proporcionalidade pendente de registro. Alimentar um índice RAG com "relatórios e evoluções" é ordem de grandeza mais invasivo — é dado de saúde estruturado e identificável, não um hash — e não tem nenhuma das salvaguardas que a própria seção 2.1 exige para uma exceção desse tipo.

Terceiro, esbarra no Art. 11 da LGPD, que veda o compartilhamento ou uso de dado sensível de saúde entre controladores "com objetivo de obter vantagem econômica". Um índice RAG que "alimenta os modelos de inteligência clínica da plataforma" — plataforma que é vendida por assinatura — é, na leitura mais direta, uso de dado de saúde de paciente (frequentemente menor) para gerar vantagem econômica ao Iris. Mesmo que o objetivo real seja melhorar a qualidade da extração para o benefício de todos os clientes, isso não dispensa base legal própria: o Art. 11 exige consentimento específico ou anonimização verdadeira, não intenção benigna.

**O que recomendo:** tratar este parágrafo como o documento de pesquisa já avisa que ele mesmo deveria ser tratado — como levantamento técnico sobre exigências de operadoras de saúde, não como política de dado firmada. A seção 4 extrapola esse escopo e precisa ser removida ou reescrita para remeter à seção 6 da política de privacidade (uso futuro, anonimizado, com consentimento específico, hoje inativo) antes que alguém — inclusive um agente de engenharia lendo este arquivo como fonte de verdade, que é exatamente o padrão de uso deste repositório — implemente algo a partir dela. Não encontrei nenhuma issue de `BACKLOG.md`, nenhuma seção do `Consent`, nem qualquer registro correspondente a "consentimento para uso em RAG" — ou seja, mesmo como intenção futura, esta frase específica nunca foi submetida ao mesmo processo de validação que os quatro termos de consentimento passaram. Isso não bloqueia o piloto (nada indica que o RAG está de fato ativo — `EXTRACTION_LLM_ENABLED=false` no `.env.example`, e não há tabela de índice vetorial em `schema.ts`), mas é o item de maior risco reputacional e regulatório deste corpus, precisamente por estar solto num documento que ninguém trataria como "documento legal".

---

## 2. Sigilo profissional no prontuário multidisciplinar: especificado, não implementado

`aditivo-especificacoes-legais.md`, seção 2.1 (autoria do advogado Thiago Lyra Galvão), especifica um campo `visibility_level` em `Evidence`/notas de evolução, com os valores `Multidisciplinary` e `Restricted_To_Discipline`, fundamentado no Art. 9º do Código de Ética do Psicólogo e no Art. 1º, §2º, da Resolução CFP nº 001/2009 — a regra de que, em equipe multidisciplinar, o psicólogo só registra o estritamente necessário ao trabalho da equipe, e informação confidencial da dinâmica familiar fica restrita à Psicologia.

Busquei `visibility_level`, `visibilityLevel` e variações em `src/db/schema.ts` (107 KB, arquivo completo) e não há ocorrência. Nenhuma coluna, nenhum enum, nada equivalente. Isso é uma lacuna concreta, e da mesma espécie que `politica-retencao-dados.md` seção 8 já documenta para o expurgo do prontuário — mas, diferentemente daquele caso, **esta lacuna não está registrada em nenhum lugar do corpus legal como pendência conhecida.** O `aditivo-especificacoes-legais.md` apresenta a seção 4 (matriz de rastreabilidade) como se "Sigilo Multidisciplinar" já tivesse mecanismo de software correspondente, sem ressalva de estado de implementação — na verdade, uma leitura séria da tabela sugeriria que a coluna já existe.

O risco jurídico concreto: hoje, no modelo que examinei, uma nota registrada por um psicólogo sobre a dinâmica familiar do paciente é, por padrão, visível a qualquer profissional vinculado ao caso — inclusive um técnico ABA sem CRP, um fonoaudiólogo ou um terapeuta ocupacional. Isso é o inverso do que o Código de Ética exige, e o Iris é, por desenho, um prontuário único multidisciplinar — o cenário que a regra do CEPP endereça é o cenário normal de uso do produto, não uma exceção.

**Recomendo tratar isso como bloqueador de piloto, não como debt genérico.** Diferente de outras pendências deste corpus (endereço da sede, foro de eleição), esta não é uma lacuna de redação contratual — é uma lacuna de controle de acesso sobre dado sensível, do tipo que a Resolução CFP e o CEPP tratam como dever profissional do psicólogo, não como opção de produto. Enquanto o campo não existir, a orientação de produto documentada em `docs/ux/fluxos-e-wireframes.md`/treinamento de equipe deveria, no mínimo, instruir psicólogos a não registrar no Iris nenhuma informação que dependa de restrição de acesso por disciplina — o que na prática esvazia parte do valor do prontuário unificado, mas é a única forma de não descumprir o Art. 9º do CEPP com o software como está hoje. Vale abrir issue própria e citar esta seção do aditivo como origem, para não se perder — o mesmo padrão que `politica-retencao-dados.md` seção 8 já usa para outras lacunas.

---

## 3. Método de validação jurídica: "leitura sem apontamento" como prova frágil

Cinco dos documentos mais sensíveis deste corpus — `termo-consentimento-titular-adulto.md`, `termo-consentimento-curatela.md`, `termo-consentimento-titular-emancipado.md`, `procedimento-revogacao-consentimento.md` e a emenda de `politica-privacidade.md`/`politica-retencao-dados.md` — foram "ratificados" pelo mesmo protocolo: o advogado leu o texto numa sessão, não fez apontamento, e o silêncio até o fim da sessão foi tratado como aprovação. O próprio texto reconhece, em cada um deles, que isso **não é** parecer escrito autônomo.

Entendo a lógica de produto — reduzir o custo de cada rodada de validação com um advogado que presta favor informal, não serviço pago (`briefing-para-advogado.md`, linha 3-4) — e não estou dizendo que o conteúdo esteja errado; pelo contrário, o conteúdo é tecnicamente muito bem construído. O ponto é evidenciário: se um destes termos for questionado por um titular, pela ANPD ou em juízo, "o advogado leu e não comentou" é uma defesa muito mais fraca do que um parecer datado com a análise, ainda que breve. Aprovação por ausência de objeção não deixa rastro do raciocínio jurídico por trás de decisões como "curatela parcial que não alcance saúde não presume representação" (`termo-consentimento-curatela.md` §4) — que são exatamente o tipo de decisão que se quer poder mostrar como fundamentada, não apenas como não-contestada.

**Recomendo**, antes da primeira coleta de assinatura real (que é justamente o gate que cada um destes documentos já lista como pendente), pedir ao Dr. Thiago um parágrafo curto e datado por documento — não um parecer extenso, só o suficiente para que "ratificado" vire "ratificado, porque X" com uma frase de fundamento. Isso protege o próprio produto tanto quanto protege o advogado.

> **Atualização de 21/08/2026 — decisão tomada, não mais pendência em aberto.** Perguntado, o Rômulo respondeu que o Dr. Thiago se comprometeu a **ler** os documentos jurídicos, mas **não a assinar parecer escrito por ora**. Isso é uma decisão de negócio legítima, e o registro deste risco continua valendo como o que é — um risco evidenciário aceito conscientemente, não uma omissão. O protocolo de ratificação por leitura sem apontamento, já em uso desde 29/07/2026, permanece sendo o método de validação do projeto para estes cinco documentos. Não vou insistir nisso a cada rodada; registrado aqui para que, se um dia a ausência de parecer escrito pesar contra o produto (ANPD, disputa judicial, due diligence de investidor), a decisão apareça como o que foi — deliberada e datada, não esquecida.

---

## 4. Controlador/operador e bases legais — estrutura correta, dois pontos a fechar

A divisão controladora (clínica) / operadora (Iris) está bem fundamentada e é usada de forma consistente em todos os documentos que a invocam, incluindo a extensão para o cadastro self-service (`termos-de-uso.md` §2.1, `politica-privacidade.md` §3.1) — o ponto mais delicado de qualquer modelo self-service, porque é onde controlador e usuário cadastrante colapsam na mesma pessoa, e o texto trata isso corretamente sem transferir ao Iris nenhum dever que seja da clínica.

A exceção declarada da seção 2.1 da política de privacidade — Iris como controlador só para o `cpf_hash` antifraude, com legítimo interesse (Art. 7º, IX) — está bem delimitada e é a exceção mais defensável de todo o corpus: escopo mínimo (um hash irreversível), resposta binária, finalidade legítima e proporcional. O único ponto pendente que concordo ser necessário fechar antes do piloto é o próprio documento já sinalizado: o teste de proporcionalidade do Art. 10 da LGPD precisa existir como registro escrito, não só como frase no texto público — é isso que sustenta a base de legítimo interesse numa eventual fiscalização, e hoje ele é referido, não produzido.

Quanto à pergunta 2 do `briefing-para-advogado.md` ("a divisão está certa?") — ainda sem resposta marcada no próprio documento —, do ponto de vista técnico a resposta é sim, com a ressalva de que o achado da seção 1 deste parecer (RAG) é exatamente o tipo de cenário que a própria pergunta antecipava ("existe algum cenário [...] que faria o Iris ser controlador em algum recorte específico?"). A resposta a essa pergunta não deveria ficar em aberto — ela já tem resposta prática (sim, no recorte do `cpf_hash`, e não deveria ter no recorte do RAG).

---

## 5. Regimes de consentimento — o conjunto mais forte do corpus

Os quatro termos (menor, via `politica-privacidade.md` §2; adulto capaz; curatela; emancipado) mais o procedimento de revogação formam, na minha leitura, o melhor trabalho jurídico do projeto. Pontos que valem destaque, positivos e um residual:

A separação por finalidade dentro de cada termo — tratamento clínico nunca depende de consentimento (apoia-se em tutela da saúde, Art. 11, II, "f"), enquanto IA, transferência internacional e exportação dependem de consentimento específico e são revogáveis isoladamente — é o desenho correto. Evita o erro clássico de "consentimento guarda-chuva", que tornaria a revogação ilusória, e o próprio texto explica por que isso importa (`termo-consentimento-titular-adulto.md`, nota após a tabela da seção 7). A matriz de efeitos por regime em `procedimento-revogacao-consentimento.md` §4.4 é precisa e juridicamente correta: bloquear o registro clínico do adulto ao revogar o autoconsentimento seria, como o texto diz, negar atendimento com base numa hipótese legal que nunca foi a dele — a distinção entre o regime de representação (menor/curatela, onde o consentimento é a base) e o regime de autoconsentimento (adulto/emancipado, onde não é) está certa.

A curatela merece nota à parte: o tratamento da curatela como medida extraordinária e potencialmente parcial (`termo-consentimento-curatela.md` §4), com a orientação de nunca presumir representação sobre dado de saúde a partir da mera existência de curatela patrimonial, está alinhado ao Art. 85 do Estatuto da Pessoa com Deficiência e evita o erro mais comum nesse tipo de termo, que é tratar curatela como incapacidade civil geral.

Ponto residual, ainda pendente no próprio corpus e que concordo ser bloqueador de coleta (não de código): nenhum dos quatro termos pode ser impresso e assinado hoje, porque a seção do provedor de IA está em branco por decisão deliberada (`politica-privacidade.md` §4) — e um consentimento para "transferência internacional a um provedor não identificado" não é consentimento específico, é em branco. Está corretamente reconhecido como gate de impressão em todos os quatro termos; só reforço que ele bloqueia literalmente qualquer coleta de consentimento válida, incluindo a do paciente **menor** (`Consent` tipo `uso_ia_processamento`), que usa o mesmo mecanismo. Antes de contratar o provedor de IA, não há como colher consentimento válido de IA para nenhum regime — vale deixar isso explícito como pré-requisito do piloto, e não só do módulo de IA.

---

## 6. Retenção e eliminação — prazo default defensável, mecanismo ainda não existe

O default `MAX(paciente completa 18 anos, alta + 10 anos)` é uma síntese de risco razoável diante dos três prazos regulatórios em conflito (CFP 5 anos, COFFITO 5 anos, CFFa 10 anos da alta) e do teto de 20 anos da Lei 13.787/2018, e a decisão de tornar o prazo configurável por clínica — em vez de embutir uma resposta única — é a escolha correta dado que `validacao-legal-prontuario.md` §6 estabelece corretamente que o Iris não é estabelecimento de saúde e portanto não carrega, ele mesmo, a obrigação regulatória de guarda; quem carrega é a clínica. Concordo com essa síntese como ponto de partida razoável, com a ressalva de que "razoável" aqui é avaliação de risco, não certeza normativa — não existe, e o próprio corpus já reconhece isso, nenhuma norma tratando de prontuário unificado multidisciplinar.

O ponto que merece prioridade real é outro: `politica-retencao-dados.md` §8 já admite que `app_purgar_paciente` e `app_paciente_expurgavel` existem no banco desde a migração `0045`, mas nenhum código de aplicação as chama — o expurgo ao fim do prazo só sai por SQL manual, e o aviso prévio de 90 dias descrito na seção 6 não existe. Isso significa que, tecnicamente, hoje a política de retenção descreve um comportamento de eliminação automática que o produto não executa. Isso não é grave por si só enquanto o documento continuar rotulado como rascunho (como está) e não for entregue à clínica-controladora como descrição do que o Iris de fato faz — mas passa a ser um problema de responsabilidade direta no dia em que uma clínica, apoiada neste texto, disser a um titular ou à ANPD que "os dados são eliminados automaticamente após o prazo". Como o Iris é operador, e a obrigação de eliminação é da clínica-controladora, um gap deste tipo transfere para a clínica um descumprimento que ela nem sabe que existe. Antes do piloto, recomendo que o texto entregue à clínica seja explícito sobre o que é automático hoje (nada) e o que depende de pedido manual — a seção 8 já existe internamente; falta ela aparecer, resumida, na política pública, não só no rascunho interno.

---

## 7. IA e transferência internacional — bem contido, um item novo a monitorar

O gating é consistente e bem feito: nenhum provedor de IA é nomeado enquanto não houver contrato e DPA (`politica-privacidade.md` §4), `EXTRACTION_LLM_ENABLED=false` por padrão no ambiente, e a arquitetura já migrou para hospedagem em território brasileiro (VPS Hostinger São Paulo) especificamente para reduzir a superfície de transferência internacional à chamada de IA em si — exatamente a recomendação de produto que `validacao-legal-prontuario.md` §5 já apontava como mais simples de defender do que lidar com cláusulas-padrão para toda a base. A mesma disciplina foi estendida ao áudio (`dpa-asr-audio.md`), inclusive isolando a retenção do áudio bruto (7 dias) da retenção do prontuário — correto, porque são riscos de naturezas diferentes.

Um ponto novo, que não está em nenhum dos documentos porque é desenvolvimento posterior a eles: o Marco Legal da IA (PL 2338/2023) já foi aprovado pelo Senado e, em agosto de 2026, segue em tramitação na Câmara dos Deputados — ainda não é lei. Meu levantamento de hoje não encontrou data de sanção prevista, mas a cobertura corrente já identifica saúde como um dos setores explicitamente tratados como sensíveis para fins de classificação de risco do sistema de IA. O Iris processa dado de saúde de criança/adolescente através de um modelo de IA de terceiro para gerar sugestões clínicas — é uma combinação (saúde + menor + IA) que tende a atrair classificação de risco mais alta quando a lei for promulgada. Isso não é um bloqueador hoje, e não vale a pena travar o piloto por uma lei que ainda não existe, mas o desenho atual do Iris já entrega boa parte do que costuma ser exigido de sistemas de alto risco — supervisão humana obrigatória, rastreabilidade frase-a-frase, registro imutável de decisão — o que é uma vantagem real de ter side-by-side com decisões de produto tomadas por outros motivos. Vale um item de backlog para revisitar quando o texto for a sanção, não antes.

*Fontes consultadas: [Senado aprova marco regulatório da inteligência artificial](https://fastcompanybrasil.com/ia/senado-aprova-marco-regulatorio-da-inteligencia-artificial-entenda/), [Marco Legal da Inteligência Artificial (PL 2338): o que muda para empresas — Exame](https://exame.com/inteligencia-artificial/marco-legal-da-inteligencia-artificial-pl-2338-o-que-muda-para-empresas-com-a-nova-lei/), [PL 2338/2023 — Senado Federal](https://www25.senado.leg.br/web/atividade/materias/-/materia/157233).*

### 7.1. Atualização de 21/08/2026 — provedor definido (Gemini), e o que é um DPA

Você definiu o provedor: **Gemini, da Google.** Um DPA (Data Processing Agreement, "Acordo/Adendo de Processamento de Dados") é o contrato entre quem decide o que fazer com o dado pessoal — controlador (a clínica) ou operador (o Iris) — e quem processa esse dado por conta de outrem, um subprocessador (aqui, o Google). Ele fixa, por escrito: que o Google só usa o dado para prestar o serviço contratado, nunca para finalidade própria; que medidas de segurança e confidencialidade se aplicam; se e como o Google pode subcontratar outros fornecedores; por quanto tempo o dado é retido e como é eliminado; o que acontece em caso de incidente de segurança; e — o ponto que mais importa aqui — as salvaguardas de transferência internacional (Art. 33 da LGPD) quando o processamento acontece fora do Brasil, normalmente via cláusulas-padrão contratuais.

Pesquisei os termos atuais do Gemini API (agosto de 2026) para dar uma resposta concreta, não genérica:

O **tier gratuito** do Gemini API (chave de API sem faturamento ativo) permite ao Google usar o conteúdo enviado — prompts e respostas — para melhorar seus próprios produtos, retém esse conteúdo por prazo indefinido para essa finalidade, tem revisão humana de conteúdo, e **não tem DPA algum**. Isso é categoricamente incompatível com dado de saúde de paciente, ainda mais de criança — nunca deve ser usado com dado real, nem em teste com dado que pareça real.

O **tier pago** (chave de API numa conta Google Cloud com faturamento ativo) inverte isso: o Google declara não usar prompts nem respostas para melhorar produtos (é automático, não precisa de configuração extra), retém o conteúdo por cerca de 30 dias só para monitorar abuso/segurança, e um **DPA existe e é incorporado automaticamente** ao ativar o faturamento — não é um contrato que se assina à parte, é uma cláusula que passa a valer junto com os Termos de Serviço do Google Cloud a partir do momento em que a conta tem billing. Esse DPA inclui cláusulas-padrão contratuais para transferência internacional (Appendix 3 do documento do Google), pensadas primariamente para o GDPR europeu.

Três coisas eu não consegui confirmar de fonte primária, e por isso continuam como pendência (débito `D57`, `BACKLOG.md`) em vez de resolvidas:

1. **Se a chave `GOOGLE_API_KEY` que o Iris vai usar está de fato numa conta com faturamento pago ativo.** Isso é um estado de configuração no Google Cloud Console, não algo que um documento possa afirmar — precisa ser conferido por você antes de ligar `EXTRACTION_LLM_ENABLED`.
2. **Se o Gemini API "puro" (por chave, sem passar pelo Vertex AI) está no escopo dos serviços cobertos pelo DPA do Google Cloud** — a documentação do Google trata isso por uma lista de "Audited Services" que muda, e o Vertex AI está claramente coberto, mas o Gemini API standalone precisa ser conferido em `cloud.google.com/security/compliance/services-in-scope`. Se não estiver, a alternativa mais segura é migrar para Vertex AI, que já nasce coberto e ainda permite fixar a região de processamento.
3. **Se as cláusulas-padrão do Google — escritas para satisfazer o GDPR — valem, com a mesma força, como a salvaguarda que o Art. 33 da LGPD exige.** Isso não é uma pergunta que eu deva responder sozinho: é exatamente o tipo de equivalência entre regimes jurídicos diferentes que o Dr. Thiago já vinha sinalizando como pendência desde `termo-consentimento-titular-adulto.md` §9, antes mesmo de o provedor ser escolhido. Vale ser a primeira pergunta a levar a ele, já que ele topou continuar lendo os documentos.

Enquanto essas três não fecharem, `EXTRACTION_LLM_ENABLED` deve continuar `false`, e nenhum dos termos de consentimento pode ser impresso e assinado por um titular real — já deixei isso registrado nos próprios termos (seção 9 do termo adulto, seção 10 do termo de curatela).

---

## 8. Alerta de risco / duty-to-warn — bem resolvido

O par `briefing-duty-to-warn.md` + `parecer-juridico-duty-to-warn.md` é o processo de consulta mais rigoroso do corpus: pergunta objetiva, levantamento próprio com nível de confiança declarado por item, e parecer que confirma ou corrige cada ponto nomeadamente. A conclusão central — não existe doutrina Tarasoff no Brasil, o Iris nunca deve ser o remetente de notificação externa, e o Estágio 2 de escalonamento deve ficar estritamente interno à clínica — está juridicamente correta e foi implantada literalmente na cláusula 10 de `termos-de-uso.md`, com nota expressa de que a cláusula não deve ser editada sem novo parecer. É o padrão que os demais documentos deveriam seguir mais de perto (ver seção 3 acima).

Um detalhe de manutenção, não de mérito: a cláusula 10.1–10.3 é dirigida à CONTRATANTE do contrato B2B — faz sentido nos Termos de Uso, mas os quatro termos de consentimento assinados pelo titular/família já tomam o cuidado de não remeter a essa cláusula (`termo-consentimento-titular-adulto.md` §14, nota de produto) porque o titular não é parte do contrato B2B. Isso está certo e vale preservar exatamente assim quando qualquer um dos textos for revisado no futuro.

---

## 9. Termos de Uso — lacunas remanescentes, todas de baixo risco jurídico individual

As pendências marcadas `⟨PENDENTE⟩` em `termos-de-uso.md` (endereço da sede, foro de eleição, prazo de antecedência para alteração relevante, prazo de permanência em somente-leitura antes de expurgo, canal de contato) são boilerplate contratual padrão — nenhuma tem complexidade jurídica própria, e a recomendação de `briefing-para-advogado.md` §8 (pedir ao advogado uma redação pronta numa conversa rápida) é o caminho certo. O único que teria mais peso é o prazo de permanência em somente-leitura antes do expurgo — porque interage com a retenção do prontuário, não é puramente contratual —, e deveria ser decidido junto com o item da seção 6 deste parecer (mecanismo de expurgo), não isoladamente.

Vale registrar a nota "1" da seção "Nota para a revisão jurídica" do próprio `termos-de-uso.md`: a cláusula 7.4(b) promete exportação "integral" que o produto hoje não cumpre (só exporta relatório de convênio por paciente/período, não o prontuário inteiro). O documento trata isso corretamente como obrigação assumida e ainda não implementada, não como erro de redação — concordo com a recomendação implícita de manter a garantia e correr para cumpri-la, em vez de reduzi-la depois de já publicada. Registro aqui porque é o mesmo padrão de risco da seção 6 deste parecer (política descrevendo mais controle do que o software executa) e merece o mesmo tratamento de prazo.

---

## 10. Encarregado (DPO) — pendência real, sem solução formal ainda

Nenhum dos dois papéis — o encarregado do Iris como operador, e o encarregado de cada clínica-controladora — está preenchido; ambos aparecem como `⟨PENDENTE⟩` recorrente em quatro documentos diferentes. Para o estágio de piloto (1-2 clínicas), a pergunta objetiva de `briefing-para-advogado.md` §9 — se é aceitável o próprio responsável pelo produto figurar como contato informal até o negócio crescer — tem resposta prática sim, contanto que (a) haja um canal de contato público e monitorado (item também pendente em `politica-privacidade.md` §11) e (b) a indicação conste do texto assim que decidida, porque hoje o Art. 41 da LGPD não está sendo cumprido literalmente — está sendo adiado conscientemente, o que é diferente e deve ficar registrado como tal. Isso é baixo risco para o piloto restrito, mas não deveria sobreviver ao primeiro contrato-piloto sem pelo menos o nome do responsável constando no documento público, ainda que informal.

---

## 11. Pesquisa de planos de saúde — reclassificar a natureza do documento

Independentemente do achado da seção 1, o documento inteiro (`pesquisa-planos-de-saude-prontuario.md`) tem título e corpo de pesquisa de mercado/produto (requisitos de operadoras para reembolso), não de documento jurídico-normativo — mas vive em `docs/legal/` ao lado de termos assinados por titulares e políticas publicadas. Recomendo um cabeçalho de status como os que `politica-retencao-dados.md` e `validacao-legal-prontuario.md` já usam ("pesquisa de produto, não substitui parecer jurídico") — o que teria, sozinho, provavelmente evitado o achado da seção 1: quem escreveu a seção 4 muito provavelmente não pretendia fixar uma política de uso de dado sensível, só estava justificando por que armazenar histórico completo é valioso para o produto, e a frase escorregou para um registro que parece afirmação de política. É o tipo de risco que rotular a natureza do documento resolve de graça.

---

## Tabela consolidada — pendências antes do piloto com dado real de paciente

| # | Achado | Documento(s) | Prioridade | Ação recomendada |
|---|---|---|---|---|
| 1 | Frase sobre uso de prontuário para RAG/treinamento de modelo próprio, sem base legal, sem consentimento, contradizendo a política de privacidade | `pesquisa-planos-de-saude-prontuario.md` §4 | **Crítica** | Remover ou reescrever remetendo à seção 6 da política de privacidade; nunca implementar a partir do texto atual |
| 2 | `visibility_level` (sigilo multidisciplinar) especificado pelo advogado, ausente do schema | `aditivo-especificacoes-legais.md` §2.1; `src/db/schema.ts` | **Alta** | Abrir issue própria; até existir, orientar psicólogos a não registrar informação restrita no prontuário compartilhado |
| 3 | Mecanismo de expurgo automático do prontuário não implementado, mas descrito como comportamento do produto na política pública | `politica-retencao-dados.md` §8 | **Alta** | Deixar explícito no texto público o que é manual hoje, antes de entregar a política a uma clínica-controladora |
| 4 | Nenhum termo de consentimento pode ser validamente colhido enquanto o provedor de IA não estiver identificado | `politica-privacidade.md` §4; os 4 termos, "gates de impressão" | **Alta** (pré-requisito de piloto) | Fechar contratação/DPA do provedor de IA antes de qualquer coleta de assinatura, inclusive de menor |
| 5 | Teste de proporcionalidade do legítimo interesse (antifraude `cpf_hash`) referido, não produzido | `politica-privacidade.md` §2.1 | Média | Produzir documento próprio de teste de proporcionalidade (Art. 10 LGPD) |
| 6 | Validação jurídica de 5 documentos sensíveis apoiada em "leitura sem apontamento", sem parecer escrito | `termo-consentimento-titular-adulto.md`, `curatela`, `emancipado`, `procedimento-revogacao-consentimento.md` | Média | **Decidido em 21/08/2026: Dr. Thiago lê, não assina por ora — risco aceito conscientemente, ver seção 3** |
| 7 | Encarregado (DPO) do Iris e das clínicas não indicado | `politica-privacidade.md` §10, `politica-retencao-dados.md` §10 | Média | Indicar nome/canal informal antes do primeiro contrato-piloto |
| 8 | Cláusulas boilerplate em aberto (endereço, foro, prazos de aviso) | `termos-de-uso.md` | Baixa | Resolver em conversa rápida com o advogado, conforme já planejado |
| 9 | Documento de pesquisa de mercado sem rótulo de "não é política jurídica" | `pesquisa-planos-de-saude-prontuario.md` | Baixa | Acrescentar cabeçalho de status, no padrão dos demais documentos |
| 10 | Marco Legal da IA (PL 2338) ainda não sancionado, mas classifica saúde como setor sensível | — (regulação emergente) | Observação | Item de backlog para revisitar após sanção; nenhuma ação agora |

---

## Estado das pendências — atualizado em 21/08/2026 (mesmo dia, segunda passada)

Depois de entregar a revisão acima, apliquei os ajustes que dependiam só de edição de documento. O que ficou de fora depende de fatos ou decisões que só o Rômulo (ou o advogado de registro, Dr. Thiago) pode fornecer — listados na segunda tabela.

### Fechado nesta passada

| # | Achado | O que foi feito |
|---|---|---|
| 1 | Frase de RAG/treinamento sem base legal | Removida de `pesquisa-planos-de-saude-prontuario.md` §4 e substituída por nota datada explicando o motivo; documento ganhou cabeçalho de status ("pesquisa de produto, não é política de dado") |
| 2 | `visibility_level`/`e_psi` especificados, não implementados | `aditivo-especificacoes-legais.md` ganhou nota de verificação datada, sem alterar o texto original do advogado, confirmando por grep em `src/db/schema.ts` que nenhum dos dois existe hoje |
| 5 | Teste de proporcionalidade do legítimo interesse (antifraude) | Produzido em `teste-proporcionalidade-legitimo-interesse-antifraude.md` (finalidade, necessidade, balanceamento, e recomendação de prazo indeterminado para o `cpf_hash`, vinculado à existência do mecanismo de teste, não à conta da clínica). `politica-privacidade.md` §2.1 e "Itens em aberto" atualizados para apontar para ele |
| 9 | Documento de pesquisa sem rótulo de natureza | Cabeçalho de status adicionado (mesmo ajuste do achado 1) |
| — (achado durante o ajuste, não estava na tabela original) | `politica-privacidade.md` §11 tinha canal de contato `⟨PENDENTE⟩`, mas o mesmo endereço já era usado como contato institucional de privacidade em `politica-retencao-dados.md` §10 | Preenchido com `privacidade@irisclinica.ia.br` por consistência interna; falta só você confirmar que a caixa está ativa |

Também reforcei a visibilidade da seção 8 de `politica-retencao-dados.md` (lacunas de implementação) com um aviso no topo do documento, para que ninguém entregue essa política a uma clínica sem ler antes o que ainda não roda em produção — o conteúdo da seção 8 já existia e estava correto, só não estava visível o suficiente.

Todos os quatro arquivos ajustados e o documento novo foram salvos em `docs/legal/` e enviados nesta conversa.

### Fechado na segunda rodada (21/08/2026, mesmo dia)

| # | O que estava faltando | O que aconteceu |
|---|---|---|
| 3 | Parágrafo de fundamento datado do Dr. Thiago | **Decisão, não pendência:** ele lê, não assina por ora. Registrado na seção 3 como risco aceito conscientemente. |
| 4 (parcial) | Escolha do provedor de IA | **Google (Gemini API)**, definido por você. Nomeado em `politica-privacidade.md` §4, nos termos de consentimento adulto/curatela, e abriu o débito `D57` no `BACKLOG.md` — três confirmações técnicas ainda faltam antes de ativar (ver seção 7 deste parecer e a resposta sobre "o que é DPA" no corpo da conversa). |
| 6 | Issues no `BACKLOG.md` | Abertas como débitos `D55` (`visibility_level`) e `D56` (`e_psi`), mais `D57` (gate do Gemini) — não como GitHub Issues formais, mas na mesma tabela de débitos técnicos que o projeto já usa como fonte de verdade. |
| 7 | Nome do encarregado (DPO) | **Rômulo Sutil Corrêa**, informal, por ora. Preenchido em `politica-privacidade.md` §10. |
| 8c | Prazo de aviso de alteração dos Termos | **30 dias corridos.** Preenchido em `termos-de-uso.md` §8.4. |
| 8e | Canal de contato contratual | **`notificacoes@irisclinica.ia.br`.** Preenchido em `termos-de-uso.md` §12, com nota de que esse endereço hoje está configurado só como remetente de e-mail transacional — confirmar que também recebe e é monitorado. |

### Fechado na terceira rodada (21/08/2026, mesmo dia)

| # | O que estava faltando | O que aconteceu |
|---|---|---|
| 8a | Endereço completo da sede do operador | **Rua Horácio Santana, 342, Ap 101.** Preenchido em `termos-de-uso.md` §2 — mas o dado ficou incompleto: faltam bairro, cidade, UF e CEP, sem os quais o endereço não serve para citação judicial nem identificação formal do operador. Marcado como `⟨PENDENTE⟩` residual na mesma seção. |
| 8b | Foro de eleição | **Comarca de Guarapari, Estado do Espírito Santo.** Definido por você e validado pelo Dr. Thiago Lyra Galvão, por aderência legal e segurança em caso de litígio. Preenchido em `termos-de-uso.md` §9. |

### Ainda depende de você (ou do Dr. Thiago)

| # | O que falta | Por quê não fechei sozinho | Onde entra |
|---|---|---|---|
| 4 (técnico) | Confirmar billing pago ativo, escopo do DPA do Google para o Gemini API standalone, e equivalência das cláusulas-padrão do Google ao Art. 33 LGPD | São verificações operacionais (console do Google Cloud) e uma leitura jurídica (Dr. Thiago) — não algo que eu possa confirmar de dentro dos documentos | `politica-privacidade.md` §4; débito `D57`; bloqueia toda coleta de consentimento de IA, inclusive de menor |
| 8a (residual) | Bairro, cidade, UF e CEP da sede do operador | Só o logradouro, número e complemento vieram nesta rodada | `termos-de-uso.md` §2 |
| 8d | Prazo de permanência em somente-leitura antes do expurgo, e forma de aviso | Interage com o mecanismo de expurgo ainda não implementado (achado 3 original) — decidir os dois juntos | `termos-de-uso.md` §7.4(c) |

---

## Nota final

O trabalho já feito neste diretório está bem acima do que normalmente se vê num produto neste estágio — a disciplina de versionar termos, nunca editar consentimento já colhido, e registrar cada pendência explicitamente como `⟨PENDENTE⟩` em vez de deixá-la implícita é exatamente o tipo de rastro que se quer poder mostrar numa fiscalização. Os três achados das seções 1 a 3 não desfazem isso — são, na verdade, o tipo de coisa que só aparece quando se lê o corpus inteiro de uma vez, de fora, com a pergunta "isso ainda bate com tudo o mais que já foi decidido?". Recomendo levar os achados 1 e 2 da tabela acima ao Dr. Thiago com prioridade, porque são os dois únicos que tocam diretamente dado de paciente já no desenho atual — os demais são de calibragem e podem seguir o ritmo que o projeto já vem usando.
