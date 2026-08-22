# Política de Privacidade — Iris

**Versão `2026-08-07` — vigente desde 07/08/2026.**

Esta Política descreve como o Iris — plataforma operada por **R Sutil Correa
Ltda**, CNPJ **29.811.201/0001-50** — trata dados pessoais. Ela integra e
complementa `termos-de-uso.md` e `politica-retencao-dados.md`; os três
documentos devem ser lidos em conjunto.

Ela cobre **dois grupos distintos de titulares**:

- **o profissional de saúde que cria uma conta** no Iris (seção 1.1) — inclusive
  quem se cadastra sozinho pelo site, no fluxo self-service;
- **o paciente em acompanhamento terapêutico** (seção 1.2), cujos dados são
  inseridos pela clínica.

**Aceitar esta Política não é o consentimento do paciente.** O consentimento
LGPD do titular dos dados de saúde — ou de seu responsável legal — é colhido em
documento próprio, no ato de admissão do paciente, e é versionado
separadamente. Quem aceita esta Política no cadastro é o profissional, por si
mesmo e pela clínica que representa.

Redação original de 09/07/2026, com base em `validacao-legal-prontuario.md` e no
modelo de dados (`docs/dados/modelo-de-dados.md`). Revisão de 30/07/2026 para
cobrir o cadastro self-service. Revisão de 07/08/2026 para cobrir a coleta do
**CPF do paciente ou do responsável** e a **prevenção a fraude no período de
teste** — que é a primeira finalidade em que o Iris trata dado originado do
paciente **como controlador**, e não como operador da clínica (seções 1.2, 2.1
e 3).

Os itens ainda não fechados aparecem marcados como `⟨PENDENTE: …⟩` no corpo do
texto e estão consolidados na seção **Itens em aberto**, ao final.

---

## 1. Que dados o Iris trata

### 1.1. Dados do profissional que se cadastra

Ao criar uma conta, o profissional é **ele próprio titular de dados pessoais**.
São coletados:

| Dado                                                                                          | Para quê                                                                                        | Base legal                                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Nome completo                                                                                 | Identificar o autor de cada registro clínico e assinar a trilha de auditoria                    | Execução de contrato (Art. 7º, V)                                             |
| E-mail                                                                                        | Autenticação, verificação de conta, recuperação de senha, comunicações sobre a conta e cobrança | Execução de contrato (Art. 7º, V)                                             |
| Senha                                                                                         | Autenticação. **Armazenada apenas como hash**, nunca em texto legível                           | Execução de contrato (Art. 7º, V)                                             |
| Conselho de classe e número de registro profissional                                          | Verificar habilitação, aplicar as regras de supervisão técnica do produto e auditar contas      | Execução de contrato e cumprimento de obrigação regulatória (Art. 7º, II e V) |
| Nome e dados da clínica criada                                                                | Constituir o tenant e emitir cobrança                                                           | Execução de contrato (Art. 7º, V)                                             |
| Dados de faturamento (inclusive CPF ou CNPJ, quando exigido para emissão de documento fiscal) | Cobrança e obrigação fiscal                                                                     | Cumprimento de obrigação legal (Art. 7º, II)                                  |
| Registros de acesso e trilha de auditoria (data, hora, ação, identificador do usuário)        | Segurança, rastreabilidade do prontuário e cumprimento do Marco Civil                           | Cumprimento de obrigação legal e legítimo interesse (Art. 7º, II e IX)        |
| Data, hora e versão dos Termos e desta Política aceitos                                       | Comprovar o aceite                                                                              | Execução de contrato (Art. 7º, V)                                             |

**O que o Iris NÃO coleta do profissional:** dados de cartão de crédito (o
produto não aceita cartão) e dados sensíveis do próprio profissional.

**Por quanto tempo:** os dados de conta são mantidos enquanto a conta existir e,
após o encerramento, pelo prazo de ⟨PENDENTE: prazo de retenção dos dados
cadastrais do profissional após o encerramento da conta⟩. Os registros de
acesso seguem o mínimo legal do Marco Civil da Internet (Art. 15 — 6 meses) e os
documentos fiscais, os prazos da legislação tributária. A trilha de auditoria
vinculada a prontuário **não é apagada com a conta**: ela é pseudonimizada, para
que o registro clínico continue íntegro sem manter o profissional identificado
(ver `politica-retencao-dados.md`).

### 1.2. Dados de paciente

Dados pessoais e dados sensíveis (dado de saúde, LGPD Art. 5º, II) de
pacientes em acompanhamento terapêutico — tanto menores de 18 anos quanto
titulares adultos e civilmente capazes —, incluindo: identificação e contato
do paciente ou do responsável, quando aplicável (`Patient`),
diagnóstico/hipótese e informações de saúde (`PatientClinicalProfile`), notas
de sessão em texto e áudio (`SessionNote`, `AudioCapture`), evidências
clínicas estruturadas derivadas do relato do profissional (`Evidence`),
avaliações formais (`MilestoneAssessment`) e relatórios gerados (`Report`).

#### CPF do paciente ou do responsável legal

Desde 07/08/2026 o cadastro de paciente exige **um** CPF, conforme quem assina
o consentimento — nunca os dois:

| Dado                             | De quem                                                 | Para quê                                                                                                              |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `patient.cpf`                    | do **próprio paciente**, quando titular adulto           | Identificar o paciente com precisão e impedir cadastro duplicado da mesma pessoa dentro da clínica                     |
| `patient.responsavel_cpf`        | do **responsável legal**, quando o paciente é menor      | Identificar quem consente pelo paciente. **Não é único por clínica**: um mesmo responsável pode ter mais de um filho em acompanhamento |
| `patient.cpf_hash`               | derivado do CPF acima                                    | Prevenção a fraude no período de teste gratuito — ver seção 2.1                                                        |

O `cpf_hash` **não é o CPF**: é um código irreversível calculado a partir dele
(HMAC-SHA256 com chave secreta mantida fora do código). Ele não permite
recuperar o CPF nem descobrir o número a partir do código. Ainda assim é
tratado como dado pessoal, e por isso está descrito aqui.

O CPF em texto legível **nunca sai da clínica que o cadastrou** — o isolamento
entre clínicas vale para ele como para qualquer outro dado do prontuário.

## 2. Base legal do tratamento (dados de paciente)

O Iris opera dois regimes de consentimento coexistentes, nunca derivados da
data de nascimento (`patient.nascimento` é campo opcional) — a escolha do
regime é sempre decisão explícita do operador no cadastro:

- **Paciente menor de 18 anos**: **consentimento específico e destacado** de
  pelo menos um dos pais/responsável legal (LGPD Art. 14, §1º) — coletado no
  ato de admissão do paciente na clínica, versionado e nunca sobrescrito
  (`Consent`, `tipo = 'tratamento_dados_menor'`).
- **Titular maior de 18 anos e civilmente capaz**: **consentimento do próprio
  titular** (LGPD Art. 7º, I, e Art. 11, I), registrado como
  `Consent`, `tipo = 'autoconsentimento_titular_adulto'`. Adulto sob curatela
  ou com capacidade civil reduzida e adolescente emancipado ficam, por ora,
  fora deste caminho de autoconsentimento — ver
  `termo-consentimento-titular-adulto.md` (versão `adulto-v1`), seção 2.
- **Tutela da saúde**, quando o tratamento é realizado por profissionais/
  serviços de saúde (LGPD Art. 11, II, "f" — a alínea "a" é cumprimento de
  obrigação legal ou regulatória, citada abaixo, e estava trocada aqui até
  28/07/2026) — base do registro clínico em si, tanto para o menor quanto
  para o titular adulto, complementar ao consentimento de admissão de cada
  regime.
- **Cumprimento de obrigação legal/regulatória** para a retenção além do
  período de tratamento ativo (LGPD Art. 15/16 — ver seção 5 abaixo e
  `politica-retencao-dados.md`).

As bases legais aplicáveis aos dados do **profissional** estão na tabela da
seção 1.1 — são outras, e não se confundem com estas.

### 2.1. Prevenção a fraude no período de teste gratuito

Esta finalidade é **distinta de todas as acima** e merece leitura separada,
porque é a única em que o Iris trata dado originado do paciente **por conta
própria**, e não por ordem da clínica.

**O problema.** O Iris oferece um período de teste gratuito que começa no
cadastro do primeiro paciente. Sem nenhuma verificação, a mesma pessoa poderia
abrir contas de clínica sucessivas e renovar o teste indefinidamente, ou
inflar a contagem de pacientes cobrados com cadastros repetidos.

**O que é feito.** No cadastro do **primeiro** paciente de uma clínica nova, o
Iris verifica se o código irreversível (`cpf_hash`) daquele CPF já esteve
associado a um teste gratuito iniciado em outra conta. Se já esteve, o teste
não é concedido — a clínica pode contratar normalmente, sem período de teste.

**O que essa verificação revela, e o que não revela.** A consulta devolve
**uma única resposta de sim ou não**. Ela não retorna, nem torna acessível a
quem consulta, o nome do paciente, a clínica de origem, a data, a quantidade
de ocorrências ou qualquer outro dado. Nenhuma clínica passa a enxergar
paciente de outra clínica por causa deste mecanismo, e o CPF em texto legível
não participa da consulta.

**Quando NÃO é feita.** A verificação só ocorre no cadastro que inicia o
relógio do teste. Clínica que já contratou, ou que já está em teste próprio,
não passa por ela — paciente atendido anteriormente em outro serviço é
situação comum e legítima, não indício de fraude.

**Base legal: legítimo interesse** (LGPD Art. 7º, IX), do Iris, para prevenir
uso abusivo do próprio período de teste. Não é consentimento — não seria
honesto pedir ao titular autorização para uma verificação antifraude que o
Iris faria de qualquer modo —, nem cumprimento de obrigação legal, e não se
confunde com a finalidade fiscal do CPF/CNPJ da clínica (seção 1.1).

**Quem é o controlador aqui: o Iris**, e não a clínica — porque é o Iris quem
define esta finalidade, em interesse próprio. É a exceção declarada à regra
geral da seção 3.

✅ **Resolvido em 21/08/2026.** O teste de proporcionalidade do legítimo
interesse (finalidade, necessidade e salvaguardas — LGPD Art. 10) está
registrado em `teste-proporcionalidade-legitimo-interesse-antifraude.md`.
Recomendação também registrada ali: o `cpf_hash` é mantido por prazo
indeterminado, vinculado à existência do mecanismo de teste gratuito no
produto (não à conta da clínica que o originou) — pendente de confirmação
pelo advogado de registro do projeto antes de tratar como definitivo, mesmo
protocolo usado nos demais documentos.

## 3. Quem trata os dados (controlador e operador)

A **clínica-contratante é a controladora** dos dados do paciente. O **Iris é
operador**, tratando os dados por conta e ordem da clínica, exclusivamente
para prestar o serviço contratado — o Iris não vende dado de paciente nem o
usa para publicidade (ver seção 6 sobre uso agregado/anonimizado).

**Uma exceção, declarada:** a verificação antifraude do período de teste
(seção 2.1) é finalidade **do próprio Iris**, e naquele recorte — e somente
nele — o Iris atua como **controlador**, com base em legítimo interesse. A
exceção é limitada ao código irreversível `cpf_hash` e a uma resposta de sim
ou não; ela não alcança o prontuário, o CPF legível, nem qualquer outro dado
de paciente, que seguem integralmente sob a regra de operador acima.

### 3.1. No cadastro self-service

Quando o profissional cria a própria clínica pelo site, **controladora e usuário
cadastrante são a mesma pessoa física** enquanto não houver outros
profissionais vinculados. Isso não muda a divisão de papéis: **o profissional/
clínica continua sendo o controlador** dos dados dos pacientes e **o Iris
continua sendo apenas operador**.

Em particular, o fato de o cadastro ser automatizado e sem contrato negociado
**não transfere ao Iris** o dever de obter o consentimento do paciente, de
definir finalidades de tratamento clínico, ou de responder pelo prontuário.
Esses deveres são do controlador — isto é, do profissional que se cadastrou.

Quanto aos dados do **próprio profissional** listados na seção 1.1, a relação é
outra: ali **o Iris é o controlador**, porque é ele quem decide as finalidades
(autenticar, faturar, auditar habilitação) e o profissional é o titular.

## 4. Papel da inteligência artificial

O Iris usa um modelo de linguagem (LLM) de terceiro para gerar SUGESTÕES de
estruturação de evidências a partir do texto do diário de sessão — nunca para
pontuar, diagnosticar ou decidir automaticamente (princípio R3,
`docs/agente/protocolos-e-agente.md`). Toda sugestão exige aprovação humana
antes de virar registro permanente. O texto da sessão é enviado ao provedor
de IA para processamento; **isso configura transferência internacional de
dado sensível de saúde quando o provedor não tem infraestrutura no Brasil**
(LGPD Art. 33) — protegida por Cláusulas-Padrão Contratuais (Resolução
CD/ANPD nº 19/2024) e por acordo de processamento de dados (DPA) com o
provedor, que não retém o conteúdo além do necessário para gerar a resposta.
No regime de paciente menor, o consentimento específico e destacado para
essa transferência é dado pelo responsável legal (`Consent`, tipo
`uso_ia_processamento`); no regime de titular adulto, é dado pelo próprio
titular, e está materializado na seção 9 do termo
`termo-consentimento-titular-adulto.md` (versão `adulto-v1`).

> ✅ **Provedor definido em 21/08/2026: Google (Gemini API).** Processamento
> nos Estados Unidos e em outros países onde o Google mantém infraestrutura —
> os termos do provedor não garantem residência exclusiva no Brasil, o que
> mantém a transferência internacional descrita acima.
>
> ⚠️ **Ainda pendente, e é o que continua bloqueando a ativação real (não só
> a nomeação):** (a) confirmar que a chave de API em uso está numa conta com
> faturamento pago ativo — o tier gratuito do Gemini API usa o conteúdo
> enviado para treinar modelos do Google e não tem DPA, o que é incompatível
> com dado de saúde de paciente; (b) confirmar que o Gemini API standalone
> (não só Vertex AI) está no escopo do Data Processing Addendum do Google
> Cloud; (c) confirmar que as cláusulas-padrão do próprio Google — redigidas
> para o GDPR — satisfazem o Art. 33 da LGPD com a mesma força que a
> Resolução CD/ANPD nº 19/2024 exige. O tratamento de dado de paciente por IA
> só é ativado (`EXTRACTION_LLM_ENABLED=true`) depois que as três acima
> fecharem, além do consentimento específico correspondente. Ver débito `D57`
> do `BACKLOG.md` e `docs/legal/revisao-juridica-2026-08-21.md`.

## 5. Por quanto tempo os dados são mantidos

Ver `politica-retencao-dados.md` para o detalhamento completo. Resumo: prazo
configurável pela clínica, com default sugerido de `MAX(paciente completa 18
anos, alta + 10 anos)` — cobre os prazos mínimos dos conselhos profissionais
(CFP, COFFITO, CFFa) pesquisados.

Os prazos aplicáveis aos dados do profissional estão na seção 1.1.

**Fim do período de teste não é motivo de eliminação.** Se o teste gratuito
terminar sem pagamento, a conta passa a somente-leitura com exportação livre e
os dados permanecem acessíveis — ver `termos-de-uso.md`, seção 7.4.

## 6. Uso agregado/anonimizado para melhoria do produto

O Iris pode, no futuro, usar dados verdadeiramente anonimizados (sem
possibilidade de reidentificação) de reclassificações do coordenador
(divergência IA × revisão humana) para melhorar a precisão do agente de
extração (`modelo-de-negocio.md`, dataset de reclassificação, V5). Isso só
ocorre mediante consentimento específico e separado do consentimento de
tratamento clínico original, e nunca envolve dado identificável do paciente.
Este uso NÃO está ativo no MVP/piloto — registrado aqui para transparência
futura.

## 7. Compartilhamento com terceiros

O Iris compartilha dados apenas com os operadores necessários para prestar o
serviço, e apenas o mínimo que cada um precisa:

- **Provedor de IA** (extração de evidências) — recebe o texto do diário de
  sessão. Ver seção 4, inclusive a pendência aberta sobre provedor e país.
- **Provedor de hospedagem/infraestrutura** (banco de dados, armazenamento de
  áudio) — hospedado em região Brasil (ver `stack-e-plano-de-construcao.md`).
- **Provedor de e-mail transacional — Resend.** Recebe o **e-mail e o nome do
  profissional** para entregar as mensagens operacionais da conta: verificação
  de e-mail no cadastro, recuperação de senha, convites de equipe e avisos de
  cobrança. **Nenhum dado de paciente é enviado nesses e-mails.** O
  processamento ocorre em infraestrutura do provedor, ⟨PENDENTE: país/região de
  processamento do provedor de e-mail transacional e instrumento de
  transferência internacional aplicável⟩.
- **Operador de pagamento — Asaas.** Processa a cobrança por Pix e boleto e
  recebe os **dados de faturamento do profissional/clínica** (nome, documento,
  e-mail, valor e vencimento). **Nenhum dado de paciente é enviado ao operador
  de pagamento** — a quantidade de pacientes ativos é enviada como número, sem
  identificação. O Iris não armazena dados de meio de pagamento. Esta cobrança
  entra em operação junto com a primeira fatura (`termos-de-uso.md`, seção 7).
- **Operadoras de plano de saúde/convênio** — apenas quando a clínica
  EXPORTA um relatório (narrativo ou dossiê bruto de auditoria) por decisão
  própria da clínica; o Iris não compartilha dado diretamente com convênios,
  só fornece a ferramenta de exportação usada pela clínica. Toda exportação é
  registrada em `AuditLog` antes de ser liberada.
- **Autoridades públicas** — somente mediante ordem judicial ou requisição
  legal válida. **O Iris não notifica espontaneamente terceiros externos à
  clínica**: não comunica família, SAMU, Conselho Tutelar ou qualquer
  autoridade por conta própria, nem mesmo diante de um alerta de risco — ver
  `termos-de-uso.md`, seção 10.
- Nenhum compartilhamento com terceiros para fins de publicidade ou venda de
  dado agregado de saúde (vedado pelo Art. 11 da LGPD "com objetivo de obter
  vantagem econômica" entre controladores).

## 8. Segurança

Controle de acesso por papel (`UserRole`: terapeuta/coordenador/admin_recepcao)
com isolamento entre clínicas via Row-Level Security no banco de dados
(impossível de esquecer um filtro de tenant numa query), trilha de auditoria
imutável de toda reclassificação/exportação/mudança de vínculo
(`AuditLog`), e imutabilidade de `Evidence` (sem UPDATE/DELETE em nível de
privilégio de banco, não só convenção). Senhas são armazenadas apenas como
hash. Nenhum conselho profissional pesquisado exige certificação ICP-Brasil —
login+senha (idealmente MFA) + trilha de auditoria é o piso de segurança adotado
(`validacao-legal-prontuario.md`, seção 3).

## 9. Direitos do titular

**Titular paciente:** ver seção 6 de `politica-retencao-dados.md` — confirmação
de tratamento, acesso, correção, anonimização/eliminação (respeitada a retenção
legal), portabilidade e revogação de consentimento, exercidos através da
clínica-contratante (controladora).

**Titular profissional:** quanto aos dados da seção 1.1, o profissional exerce
os mesmos direitos (LGPD Art. 18) diretamente com o Iris, pelo canal da seção 11. Ressalva: a eliminação de dados cadastrais **não apaga a trilha de auditoria
vinculada a prontuário**, que é pseudonimizada em vez de excluída — a
integridade do registro clínico é obrigação legal do controlador e prevalece
sobre a eliminação (LGPD Art. 16, I).

## 10. Encarregado (DPO)

O encarregado pelo tratamento de dados pessoais (LGPD Art. 41) do Iris,
enquanto operador, é **Rômulo Sutil Corrêa**, responsável pelo produto —
indicação informal, decidida em 21/08/2026 para o estágio de piloto (1-2
clínicas), a formalizar quando o negócio crescer. Contato:
`privacidade@irisclinica.ia.br` (seção 11).

Cada clínica-contratante, na qualidade de controladora, deve indicar seu próprio
encarregado quando aplicável — obrigação dela, não do Iris.

## 11. Contato

Canal para exercício de direitos do titular e dúvidas sobre esta Política:
**`privacidade@irisclinica.ia.br`** — mesmo endereço já usado como contato
institucional de privacidade em `politica-retencao-dados.md` §10 e referido
em `termo-consentimento-titular-adulto.md` §5. Preenchido em 21/08/2026 por
consistência interna; **confirmar antes de publicar que a caixa está
efetivamente ativa e monitorada** — isso não foi verificado nesta revisão.

---

## Itens em aberto

Itens resolvidos em 21/08/2026 (não bloqueiam mais a publicação):

- **Teste de proporcionalidade do legítimo interesse** da verificação
  antifraude (seção 2.1) e **prazo de conservação do `cpf_hash`** —
  registrados em `teste-proporcionalidade-legitimo-interesse-antifraude.md`,
  pendente apenas de confirmação pelo advogado de registro.
- **Canal oficial de contato** (seção 11) — preenchido com
  `privacidade@irisclinica.ia.br`, por consistência com os demais documentos
  do corpus; falta só confirmar que a caixa está ativa.

Itens resolvidos em 07/08/2026 (não bloqueiam mais a publicação):

- **CPF do paciente ou do responsável** passou a estar descrito, com finalidade
  e alcance (seção 1.2).
- **Prevenção a fraude no teste gratuito** ganhou seção própria (2.1), com base
  legal de legítimo interesse, o que a verificação revela e o que não revela, e
  os casos em que ela não é executada.
- **Divisão de papéis corrigida** (seção 3): a afirmação de que o Iris não usa
  dado de paciente para finalidade própria passou a conviver com a exceção
  declarada da seção 2.1, em que o Iris é controlador. Antes desta revisão a
  frase seria inexata.

Itens resolvidos em 30/07/2026 (não bloqueiam mais a publicação):

- Dados do **profissional** como titular passaram a estar descritos, com
  finalidade, base legal e prazo (seção 1.1).
- Divisão de papéis controlador/operador no **cadastro self-service** (seção 3.1),
  incluindo o caso em que controlador e usuário cadastrante são a mesma pessoa.
- **E-mail transacional** (Resend) e **operador de pagamento** (Asaas) passaram a
  constar expressamente na seção 7.
- Reforço explícito de que o Iris **não notifica terceiros externos** (seção 7).

Itens **ainda em aberto** — cada um corresponde a um marcador `⟨PENDENTE⟩` no
corpo do documento:

1. **Prazo de retenção dos dados cadastrais do profissional** após o
   encerramento da conta (seção 1.1).
2. **Termos exatos do DPA do provedor de IA** (seção 4). O provedor
   (Google/Gemini API) e o país de processamento já estão nomeados; falta
   confirmar faturamento pago ativo, escopo do DPA para o Gemini API
   standalone, e equivalência das cláusulas-padrão do Google ao Art. 33 da
   LGPD. Ver débito `D57` do `BACKLOG.md`.
3. **País/região de processamento do provedor de e-mail transacional** e o
   instrumento de transferência internacional aplicável (seção 7).
4. **Indicação do encarregado (DPO)** do operador (seção 10).

Além destes, permanece pendente a **revisão jurídica completa** do documento,
em especial das seções 4 (DPA com provedor de IA) e 6 (uso agregado/anonimizado).
A publicação nesta versão foi autorizada pelo titular do negócio em 30/07/2026,
com ciência do advogado, que sinalizará o que precisar ser alterado.

A revisão de 07/08/2026 (CPF e antifraude do teste) segue o mesmo método: o
advogado validou a coleta de CPF, e o texto das seções 1.2, 2.1 e 3 foi
redigido depois dessa validação, sem passar por ela palavra por palavra. Vale
a ressalva do parágrafo acima — o advogado sinalizará o que precisar mudar. O
ponto que mais merece o olhar dele é o **enquadramento como legítimo interesse
com o Iris na posição de controlador** (seção 2.1): é a primeira vez que o
produto assume esse papel sobre dado originado do paciente.
