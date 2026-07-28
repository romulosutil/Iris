# Iris — Briefing de consulta profissional: duty to warn em risco clínico

> ## ✅ RESPONDIDO — issue #110 fechada
>
> Este briefing **já cumpriu sua função**. As respostas estão em
> **`parecer-juridico-duty-to-warn.md`** (advogado **Thiago Lyra Galvão**), e
> as decisões travadas estão em `docs/agente/regra-alerta-risco.md` §4.1,
> §4.2.1, §5 e §6, além da cláusula 10 de `termos-de-uso.md`.
>
> **Resumo do que voltou:** o levantamento do Anexo A foi confirmado
> integralmente — não há Tarasoff no Brasil, não há prazo legal para resposta
> clínica, e as citações do CFP estavam corretas. Pergunta 2 fechou na
> **Opção B** (escalonamento estritamente interno à clínica). O único eixo que
> muda comportamento do software é **idade do paciente + violência sofrida**,
> onde há dever legal do ECA e a copy precisa ser diferenciada.
>
> Mantido no repositório como registro do que foi perguntado e por quê —
> qualquer reabertura desse desenho deve partir daqui, não do zero.

**Para quem vai ler:** psicólogo(a) com experiência em ética profissional
e/ou advogado(a). Mesmo espírito de `docs/legal/briefing-para-advogado.md` —
é uma **checagem antes de escrever código**, não um pedido de parecer formal
pago. Cada ponto abaixo tem: a pergunta objetiva, o contexto mínimo para
responder, o que o produto já decidiu (e por quê), e espaço para a resposta.
Se algum ponto exigir mais profundidade do que cabe num favor informal, é só
marcar "precisa de parecer formal" — não tem problema deixar pendente.

**Por que este briefing existe:** o Iris especificou uma regra de alerta de
risco clínico (`docs/agente/regra-alerta-risco.md`). A spec fechou tudo que é
seguramente território de produto — **notificar rapidamente os humanos certos
dentro da ferramenta**. Ela deliberadamente **não** respondeu o que acontece
quando a resposta humana não vem, nem se o produto pode participar de
qualquer notificação que **saia** do produto. Isso é território de
responsabilidade profissional e jurídica. Nenhuma linha da spec vira código
antes das respostas abaixo (issue #110).

---

## O que é o Iris, em 3 frases

SaaS B2B para clínicas de terapia. Terapeutas escrevem um diário em texto
livre depois da sessão; uma IA sugere estruturação clínica — **nunca decide,
nunca diagnostica, nunca pontua sozinha**: toda sugestão exige aprovação
humana explícita antes de virar registro permanente. Origem no nicho de
terapia infantil em TEA (ABA, Fonoaudiologia, Terapia Ocupacional), em
expansão para Terapia Convencional e TCC com paciente adulto (issues #98/#99).
Ainda não lançado; piloto pago com 1-2 clínicas fundadoras é o próximo passo.

---

## O mecanismo, em detalhe (leia antes das perguntas)

Isto é o que o produto **já** faz no desenho fechado. As perguntas depois
tratam só do que fica além disso.

**1. Como o risco é identificado.** O terapeuta escreve o diário da sessão em
texto livre. A IA lê esse texto e **sinaliza** — não classifica com
autoridade — qualquer menção (direta, indireta, citação literal do paciente,
ou registro do terapeuta sobre o que o paciente descreveu) a: ideação
suicida, autolesão, violência sofrida pelo paciente, violência praticada pelo
paciente contra terceiro, risco a terceiro vulnerável no entorno do paciente,
ou item de risco de instrumento formal respondido positivamente (ex.: item 9
do PHQ-9).

**2. A IA erra deliberadamente para o lado de sinalizar demais.** Regra
travada: ambiguidade **nunca** suprime o alerta, e na dúvida entre dois níveis
de gravidade a IA sempre classifica no mais grave. Minimização do próprio
paciente ("já é assim há anos, não é nada de mais"; "não teria coragem") não
rebaixa o alerta. Perder um alerta real é considerado uma ordem de grandeza
pior que gerar um alerta espúrio.

**3. Quem é notificado.** Terapeuta responsável pela sessão **e** coordenador,
sempre os dois, simultaneamente, com notificação push imediata — não uma fila
que alguém abre quando lembra. Ambos são profissionais da clínica-cliente.
**Nenhuma notificação sai da clínica hoje.**

**4. Como o alerta é apresentado.** Sempre com linguagem hedged, nunca
"a IA detectou risco de suicídio". O trecho literal do diário que gerou a
sinalização fica sempre visível ao lado, para que o humano avalie a fonte, não
o veredito da máquina. A decisão de conduta é 100% humana. O produto não
sugere conduta, não classifica gravidade clínica com autoridade, não registra
diagnóstico.

**5. O que acontece se ninguém responder.** Aqui está o buraco. Proposta atual
de SLA de **reconhecimento** ("alguém com competência clínica está com os
olhos nisso" — não "o caso está resolvido"):

| Gravidade sinalizada | Prazo proposto |
| --- | --- |
| Ideação ativa com plano/meios; tentativa relatada | 15 minutos |
| Ideação ativa sem plano; autolesão recente | 1 hora |
| Ideação passiva; violência sofrida/praticada; risco a terceiro | 4 horas (mesmo dia útil) |

Se o prazo vence sem ninguém reconhecer, **estágio 1**: escala para todos os
coordenadores da clínica (não só o vinculado ao paciente), com a notificação
explicitamente marcada como "SLA de alerta de risco vencido". Se o dobro do
prazo vence e ainda ninguém reconheceu, **estágio 2**: o produto sabe que
precisa existir alguma coisa aqui e **não sabe o quê** — é exatamente o objeto
da pergunta 2 abaixo.

**6. Limitação técnica que precisa entrar na conta.** Notificação web não fura
o "Não perturbe" do sistema operacional do celular. O produto entrega
**notificação imediata e escalonamento verificável** — ele **não** entrega
"resposta humana em 15 minutos", e prometer o segundo em contrato ou em copy
comercial seria overclaim. Qualquer prazo que sair desta consulta será
implementado como prazo de *escalonamento e registro*, não como garantia de
atendimento.

---

## 1. Existe obrigação de notificar terceiro?

**Contexto:** o terapeuta que atende pelo Iris está sujeito ao Código de Ética
Profissional do Psicólogo (ou ao conselho da profissão dele) e à legislação
brasileira geral. O Anexo A resume o que o levantamento próprio do projeto
encontrou sobre sigilo e suas exceções — **não é interpretação em que o
produto confia**, é só ponto de partida para você corrigir.

**O que o produto decidiu fazer:** nada. Hoje o Iris notifica apenas
profissionais da própria clínica e para por aí.

**Pergunta objetiva:** o levantamento do Anexo A conclui que **a resposta
depende do tipo de risco**, e não é uniforme. Confirme ou derrube cada linha:

| Tipo de risco | Conclusão do levantamento | Confirma? |
| --- | --- | --- |
| (a) Ideação suicida em adulto, sem ato | Sem obrigação legal de avisar terceiro. Só a **faculdade** do art. 10 (quebra pelo menor prejuízo) | ☐ sim ☐ não |
| (b) Tentativa de suicídio / autolesão | Notificação compulsória existe, mas é do **estabelecimento** à **vigilância sanitária** — não do psicólogo à família | ☐ sim ☐ não |
| (c) Violência **sofrida** pelo paciente, sendo ele criança ou adolescente | **Dever legal** de comunicar ao Conselho Tutelar / autoridade, "imediatamente". Não há ponderação a fazer | ☐ sim ☐ não |
| (d) Violência sofrida por paciente mulher adulta, em serviço de saúde | Comunicação obrigatória à autoridade policial em 24h, pelo **serviço**, sem enviar prontuário | ☐ sim ☐ não |
| (e) Violência **praticada** pelo paciente / risco a terceiro | Sem obrigação legal — **não há Tarasoff no Brasil**. Só a faculdade do art. 10 | ☐ sim ☐ não |

**Se algo estiver errado:**

```



```

**Por que isto muda o produto:** se (c) se confirmar, o Iris atende hoje
majoritariamente **crianças e adolescentes** — ou seja, o caso com dever legal
mais claro é justamente o caso central do produto, e o alerta de
`violencia_sofrida` num paciente menor não é "sinal para o terapeuta avaliar",
é gatilho de uma obrigação que já existe independentemente do Iris. Isso
provavelmente muda a **copy** do alerta nesse recorte específico. Você
concorda?

☐ Concordo — a copy deve mudar nesse recorte &nbsp;&nbsp; ☐ Não, tratar igual &nbsp;&nbsp; ☐ Precisa de parecer formal

```
Espaço para detalhar (qual norma, qual artigo, qual recorte):



```

---

## 2. Se existe obrigação, ela é do terapeuta ou o produto herda responsabilidade?

**Por que esta é a pergunta que mais decide código:** ela define se o estágio 2
do escalonamento pode existir dentro do produto ou tem que ficar 100% fora
dele. As três saídas possíveis levam a produtos diferentes:

| Saída | O que o Iris implementa |
| --- | --- |
| **A — Só do terapeuta.** O Iris é ferramenta neutra; participar do aviso não cria responsabilidade nova. | Estágio 2 pode existir no produto. Ficaria em aberto se o Iris pode oferecer "notificar contato de emergência pelo app" como feature futura. |
| **B — Do terapeuta, mas intermediar cria responsabilidade para o Iris.** | Estágio 2 vira algo que **não notifica ninguém fora da clínica** — no máximo registra de forma inescapável e exibe o protocolo de crise que a própria clínica cadastrou. O produto nunca é o remetente do aviso externo. |
| **C — O Iris não deveria participar de escalonamento nenhum.** | Estágio 2 não existe. O produto notifica, registra e para. Precisa então de texto contratual muito explícito (pergunta 4). |

**O que o produto decidiu fazer:** nada, aguardando esta resposta. A spec
registra o estágio 2 como "precisa existir, mecanismo em branco".

**Pergunta objetiva:** qual das três saídas acima descreve corretamente a
situação? Especificamente: o fato de o Iris **intermediar, registrar e
armazenar** o alerta cria para ele responsabilidade que não existiria se o
terapeuta tivesse anotado no papel?

**Resposta:** ☐ A &nbsp;&nbsp; ☐ B &nbsp;&nbsp; ☐ C &nbsp;&nbsp; ☐ Outra: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

```
Espaço para detalhar:



```

---

## 3. Os prazos propostos fazem sentido?

**Contexto:** os números da tabela do mecanismo (15 min / 1 h / 4 h) foram
**inventados pelo produto**. Não vieram de protocolo clínico nenhum — foi o
primeiro conceito de SLA por tempo em qualquer fila do Iris, e o projeto tem
desconforto explícito em ter proposto número novo num domínio onde
provavelmente já existe referência. Lembrar a limitação técnica do item 6 do
mecanismo: o prazo governa escalonamento e registro, não garante atendimento.

**O que o levantamento encontrou (Anexo A.4):** **nenhum prazo de referência
para resposta clínica a risco de vida** em fonte oficial brasileira. Os prazos
de 24h que existem são de notificação epidemiológica ou policial — outra
coisa. Se isso se confirmar, o produto não tem o que espelhar: qualquer prazo
é decisão própria, e tem que ser declarado como tal em vez de apresentado
como "conforme protocolo oficial".

**O que o produto decidiu fazer:** tratar os números como proposta
descartável, e nunca alegar conformidade com protocolo oficial inexistente.

**Pergunta objetiva:** (a) confirma que não existe prazo de referência
oficial? (b) Se existir algum que o levantamento não achou, qual? (c) Não
existindo referência, é melhor o produto ter prazo próprio (e escalonar por
tempo) ou não ter prazo nenhum (e nunca escalar por tempo)? A opção "sem
prazo" é genuinamente aceitável do ponto de vista de diligência profissional?

**Resposta:** ☐ Prazos razoáveis &nbsp;&nbsp; ☐ Usar referência: ___________ &nbsp;&nbsp; ☐ Melhor não ter prazo &nbsp;&nbsp; ☐ Precisa de parecer formal

```
Espaço para detalhar:



```

---

## 4. Risco de falso senso de segurança para a clínica

**Contexto:** este é o risco que mais preocupa o produto, e ele é
independente das respostas 1-3. Mesmo uma automação que só sinaliza e
notifica, sem decidir nada, pode fazer a clínica-cliente **relaxar o próprio
protocolo de crise** achando que "o Iris cobre isso". O produto não cobre: ele
lê texto que o terapeuta escreveu **depois** da sessão, não monitora paciente,
não tem plantão, e não fura "Não perturbe".

**O que o produto decidiu fazer:** hoje, nada além de copy hedged na tela do
alerta. Não existe cláusula em `docs/legal/termos-de-uso.md` tratando disto —
a seção 5 (Limitação de responsabilidade) foi escrita antes desta feature
existir.

**Pergunta objetiva:** (a) esse risco é real a ponto de justificar cláusula
contratual própria, ou a limitação de responsabilidade genérica já cobre?
(b) Se justifica, qual redação você usaria? (c) Vale exigir que a clínica
**declare ter protocolo de crise próprio** como condição de contratação, e
que o Iris não substitui esse protocolo?

**Resposta:** ☐ Limitação genérica basta &nbsp;&nbsp; ☐ Precisa cláusula própria &nbsp;&nbsp; ☐ Precisa cláusula + declaração da clínica &nbsp;&nbsp; ☐ Precisa de parecer formal

```
Redação sugerida (ou "precisa de reunião"):



```

---

## 5. Isso muda por estado, vínculo profissional ou idade do paciente?

**Contexto:** três eixos de variação que o produto precisa saber se existem,
porque cada um deles vira configuração por clínica (custo alto) ou regra
única (custo baixo):

- **Estado:** conselhos regionais podem ter dispositivo próprio?
- **Vínculo:** muda se o terapeuta é CLT da clínica, autônomo com sala
  alugada, ou sócio da clínica-empresa? A responsabilidade pelo alerta não
  reconhecido é dele, da clínica, ou dos dois?
- **Idade:** o produto nasceu em terapia infantil (paciente sempre menor,
  sempre com responsável legal, consentimento dado pelo responsável) e está
  expandindo para adulto autoconsentindo. Muda a resposta das perguntas 1 e 2?

**O que o produto decidiu fazer:** a retenção de dados já é configurável por
clínica; se a resposta aqui exigir variação, o precedente existe. Mas o
produto prefere regra única se ela for defensável.

**Pergunta objetiva:** algum desses três eixos muda materialmente as respostas
1-4? Se sim, qual e como?

**Resposta:** ☐ Regra única serve &nbsp;&nbsp; ☐ Varia por: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

```
Espaço para detalhar:



```

---

## 6. Correção de citação normativa (pergunta menor, mas travada junto)

**Contexto:** a documentação do Iris vinha citando três números de Resolução
do CFP (001/2009, 06/2019, 010/2005) como se fossem alternativas para a mesma
coisa. O levantamento (Anexo A.1) concluiu que **as três estão vigentes e
regulam objetos diferentes** — não havia divergência, havia citação imprecisa.
A documentação interna já foi corrigida com base nisso; nenhum texto voltado
ao usuário final (terapeuta, coordenador, contrato) cita resolução até você
confirmar.

**Pergunta objetiva:** a tabela do Anexo A.1 está correta? Em especial:
(a) a Res. 001/2009 continua mesmo vigente e não foi revogada pela 06/2019?
(b) Não há Código de Ética novo substituindo a Res. 010/2005?

**Resposta:** ☐ Anexo A.1 correto &nbsp;&nbsp; ☐ Corrigir: ___________

---

## Resumo para quem só quer ler uma vez

O Anexo A já traz um levantamento próprio que responde parcialmente 1, 3 e 6 —
para essas, o pedido é **confirmar ou derrubar**, o que deve ser rápido. As
perguntas **2, 4 e 5** continuam genuinamente abertas.

As perguntas **1 e 2** são as que bloqueiam código — sem elas o escalonamento
por tempo não pode ser implementado, porque o produto não sabe para onde
escalar nem se pode escalar. A pergunta **4** é a que mais importa para o
contrato-piloto, e é útil mesmo que 1 e 2 fiquem pendentes: ela protege contra
o cenário em que o produto funciona exatamente como desenhado e ainda assim
contribui para um desfecho ruim, porque a clínica confiou nele demais. As
perguntas **3, 5 e 6** são de calibragem e precisão — importantes, não
bloqueantes.

---

## Anexo A — Levantamento próprio sobre a norma aplicável

> **Status: em confirmação. Este anexo não é parecer.** É levantamento feito
> pelo projeto em fontes primárias, com o nível de confiança declarado item a
> item. Existe para você **corrigir**, não para o produto se apoiar. Onde
> aparece "não confirmado", é literalmente isso: o projeto não conseguiu
> verificar em fonte primária.

### A.1 Qual resolução do CFP citar para o quê

O projeto vinha citando três números diferentes em pontos diferentes da
documentação, como se fossem alternativas para a mesma coisa. **Não são** —
regulam objetos distintos, e as três estão vigentes:

| Objeto | Norma correta | Status verificado |
| --- | --- | --- |
| Registro documental / prontuário psicológico | **Resolução CFP nº 001/2009**, alterada pela Res. CFP nº 05/2010 | Vigente. **Não** foi revogada pela 06/2019 — a própria 06/2019 remete a ela expressamente. *(001/2009: texto lido no PDF oficial do CFP; 05/2010: confirmação indireta)* |
| Documentos escritos emitidos (declaração, atestado, relatório, laudo, parecer) | **Resolução CFP nº 06/2019** | Vigente. Revogou as Res. 15/1996, 07/2003 e 04/2019 |
| Código de Ética Profissional do Psicólogo | **Resolução CFP nº 010/2005** | Vigente. Nenhum novo Código de Ética localizado. A "edição digital 2025" que circula é reedição do **mesmo texto** (comemorativa dos 20 anos, com linguagem inclusiva), não norma nova. A APAF/2026 alterou a Res. 011/2019 — Código de **Processamento Disciplinar**, norma processual, provável fonte da confusão |
| *Manual Orientativo de Registro e Elaboração de Documentos Psicológicos* (CFP, nov/2025) | Publicação orientativa | **Não é norma, não revoga nada.** Compila as duas resoluções com exemplos |

Detalhe a confirmar: o art. 5º, IV da Res. 001/2009 ainda remete à Res.
07/2003, já revogada pela 06/2019 — presumivelmente lê-se como remissão à
06/2019.

### A.2 O que o Código de Ética diz sobre sigilo (texto literal)

Transcrito do PDF oficial do CFP:

> **Art. 9º** – É dever do psicólogo respeitar o sigilo profissional a fim de
> proteger, por meio da confidencialidade, a intimidade das pessoas, grupos ou
> organizações, a que tenha acesso no exercício profissional.
>
> **Art. 10** – Nas situações em que se configure conflito entre as exigências
> decorrentes do disposto no Art. 9º e as afirmações dos princípios
> fundamentais deste Código, **excetuando-se os casos previstos em lei**, o
> psicólogo **poderá** decidir pela quebra de sigilo, baseando sua decisão na
> **busca do menor prejuízo**.
> *Parágrafo único* – Em caso de quebra do sigilo previsto no caput deste
> artigo, o psicólogo **deverá restringir-se a prestar as informações
> estritamente necessárias**.
>
> **Art. 8º, §1º** – No caso de não se apresentar um responsável legal [em
> atendimento não eventual de criança, adolescente ou interdito], o
> atendimento deverá ser efetuado e **comunicado às autoridades competentes**.
>
> **Art. 13** – No atendimento à criança, ao adolescente ou ao interdito, deve
> ser comunicado aos responsáveis o estritamente essencial para se promoverem
> medidas em seu benefício.

**Leitura literal do projeto (é o que a pergunta 1 pede para você confirmar ou
derrubar):**

1. O Código **não impõe obrigação** de notificar terceiro por risco de vida.
   O art. 10 diz "**poderá** decidir pela quebra" — faculdade, não dever.
2. **Não existe no Código artigo específico sobre suicídio, "mal maior" ou
   dever de proteção a terceiro** (nada equivalente à doutrina *Tarasoff*
   norte-americana). O art. 10 é a única válvula.
3. O critério é **"busca do menor prejuízo"** — teste de ponderação aberto,
   não gatilho binário de "risco de vida".
4. A quebra é facultativa, mas **o mínimo necessário é obrigatório** (par.
   único, imperativo).
5. **"Excetuando-se os casos previstos em lei"** — é por aqui que a lei pode
   transformar a faculdade em dever. Ver A.3.

### A.3 Onde a lei transforma faculdade em dever

> ⚠️ **Confiança menor nesta seção.** O portal do Planalto ficou inacessível
> durante o levantamento — **nenhum texto de lei federal foi lido em fonte
> primária**. Os textos abaixo vêm de fontes secundárias corroboradas (Senado,
> pareceres de conselho). É a parte do anexo que mais precisa da sua revisão.

| Situação | Existe dever legal? | Base levantada |
| --- | --- | --- |
| **Violência contra criança/adolescente** identificada em atendimento | **Sim, dever claro** | ECA art. 13 (Lei 13.010/2014): casos de suspeita ou confirmação de maus-tratos "serão **obrigatoriamente comunicados** ao Conselho Tutelar". Lei 13.431/2017 art. 13: "**qualquer pessoa**... tem o dever de comunicar o fato **imediatamente**" ao conselho tutelar, autoridade policial ou serviço de denúncias. Ressalva: o ECA art. 245 (sanção por omissão) nomeia "médico, professor ou responsável por estabelecimento de saúde/ensino" — **psicólogo autônomo em consultório não está literalmente nomeado**, embora alcançado pelo dever do art. 13 |
| **Tentativa de suicídio / violência autoprovocada** | **Sim, mas é outra coisa** | Lei 13.819/2019 art. 6º: notificação compulsória por **estabelecimentos de saúde** às **autoridades sanitárias** (SINAN), caráter sigiloso, prazo de 24h por portaria do MS. **O sujeito obrigado é o estabelecimento, não o psicólogo pessoa física**; o destinatário é a vigilância epidemiológica, **não a família nem a polícia** |
| **Ideação suicida em adulto, sem ato** | **Não confirmado** | O objeto das normas acima é violência autoprovocada/tentativa. Ideação pura, sem ato, não aparece claramente como objeto de notificação compulsória. Avisar a família de um adulto permanece **faculdade** do art. 10 |
| **Violência contra mulher atendida em serviço de saúde** | **Sim, mas é sobre violência já sofrida** | Lei 10.778/2003 + Lei 13.931/2019: comunicação obrigatória à autoridade policial em **24 horas**. Sujeito obrigado: o serviço de saúde. Parecer CRM-MG 128/2020 entende que se notifica o fato **sem enviar prontuário/dados clínicos** |
| **Risco de violência a terceiro** (paciente é o autor do risco) | **Não — não há Tarasoff no Brasil** | LCP art. 66, II obriga comunicar crime conhecido em profissão sanitária, **mas se autoexclui** quando a comunicação expuser o cliente a procedimento criminal — que é exatamente o caso. CP art. 154 pune violar segredo "sem justa causa"; a doutrina invoca estado de necessidade (CP art. 24) para risco iminente, mas isso é **construção doutrinária, não texto normativo** |
| **Lei Maria da Penha criando dever para o psicólogo** | **Não confirmado** | Nada localizado. O art. 12 trata de procedimento da autoridade policial |

### A.4 Prazo de referência para resposta a risco de vida

**Não foi localizado nenhum.** O levantamento não encontrou em fonte primária
brasileira (CFP, Ministério da Saúde, Política Nacional de Prevenção do
Suicídio, CVV, RAPS) prazo ou SLA para a **resposta clínica** a risco de vida
identificado. Notas técnicas de CRPs regionais (CRP-09 nº 002/2019, CRP-SC,
CRP-PR) orientam **conduta**, não fixam prazo.

Os únicos prazos duros que existem são de **notificação
epidemiológica/administrativa**, que é outra coisa: 24h para tentativa de
suicídio ao SINAN; 24h para violência contra mulher à autoridade policial;
"imediatamente" (sem número) para violência contra criança/adolescente.

**Consequência direta, se isto se confirmar:** qualquer prazo que o Iris usar
é **decisão de produto**, e precisa ser declarado como tal. O produto **não
pode** apresentar seu SLA como "conforme protocolo oficial brasileiro",
porque não existe protocolo oficial com prazo para espelhar.

### A.5 Fontes

Lidas em PDF oficial do CFP: [Res. CFP 010/05](https://site.cfp.org.br/wp-content/uploads/2005/07/resolucao2005_10.pdf) ·
[Código de Ética](https://site.cfp.org.br/wp-content/uploads/2012/07/codigo-de-etica-psicologia.pdf) ·
[Res. CFP 001/2009](https://site.cfp.org.br/wp-content/uploads/2009/04/resolucao2009_01.pdf) ·
[Res. CFP 06/2019 comentada](https://site.cfp.org.br/wp-content/uploads/2019/09/Resolu%C3%A7%C3%A3o-CFP-n-06-2019-comentada.pdf) ·
[Código de Ética — edição digital 2025](https://transparencia.cfp.org.br/wp-content/uploads/sites/29/2025/04/CodigoDeEtica_2025_Digital.pdf)

Consultadas: [Manual Orientativo 2025](https://site.cfp.org.br/publicacao/manual-orientativo-de-registro-e-elaboracao-de-documentos-psicologicos/) ·
[Nota Técnica CRP-09 nº 002/2019 — manejo e prevenção ao suicídio](https://transparencia.cfp.org.br/crp09/wp-content/uploads/sites/21/2019/10/Nota-T%C3%A9cnica-CRP-09-N%C2%BA-02.2019-%E2%80%93-Manejo-e-preven%C3%A7%C3%A3o-ao-suic%C3%ADdio.pdf) ·
[CRP-SC — atuação em situações de risco de suicídio](https://site.crpsc.org.br/atuacao-da-psicologa-em-situacoes-envolvendo-risco-de-suicidio/) ·
[Parecer CRM-MG 128/2020](https://sistemas.cfm.org.br/normas/arquivos/pareceres/MG/2020/128_2020.pdf) ·
[Senado — Lei 13.819/2019](https://www12.senado.leg.br/noticias/materias/2019/04/29/sancionada-lei-que-exige-notificacao-compulsoria-de-casos-de-automutilacao) ·
[Senado — Lei 13.931/2019](https://www12.senado.leg.br/noticias/materias/2019/12/11/vira-lei-obrigacao-de-notificar-casos-de-violencia-contra-a-mulher-em-24-horas)

---

## Documentos por trás deste briefing

- `docs/agente/regra-alerta-risco.md` — a spec completa da regra de alerta
  (gatilho, gravidade, canal, SLA, modelo de dado, casos de teste). As seções
  4.2 e 5 são exatamente o que esta consulta destrava.
- `docs/legal/briefing-para-advogado.md` — briefing jurídico geral (retenção,
  controlador/operador, SaMD/ANVISA, transferência internacional).
- `docs/legal/validacao-legal-prontuario.md` — pesquisa jurídica de base.
- `docs/legal/termos-de-uso.md` — onde a resposta da pergunta 4 aterrissa.
