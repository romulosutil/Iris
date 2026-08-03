# Política de Privacidade — Iris

**Versão `2026-07-30` — vigente desde 30/07/2026.**

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
cobrir o cadastro self-service.

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

## 3. Quem trata os dados (controlador e operador)

A **clínica-contratante é a controladora** dos dados do paciente. O **Iris é
operador**, tratando os dados por conta e ordem da clínica, exclusivamente
para prestar o serviço contratado — o Iris não usa dado de paciente para
finalidade própria fora do contrato (ex.: não vende dado, não usa para
publicidade; ver seção 6 sobre uso agregado/anonimizado).

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

> ⚠️ **Pendência aberta e deliberadamente não resolvida nesta versão.** A
> identidade do **provedor de IA** e o **país onde o processamento ocorre**
> ainda não estão definidos: ⟨PENDENTE: provedor de IA contratado, país de
> processamento e termos exatos do DPA — ver `BACKLOG.md`, seção B⟩. Enquanto
> essa definição não for feita e publicada aqui, **nenhum provedor é nomeado
> nesta Política**, porque nomear um provedor não contratado seria informação
> falsa ao titular. O tratamento de dado de paciente por IA só é ativado após
> essa definição e o consentimento específico correspondente.

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

⟨PENDENTE: indicação do encarregado pelo tratamento de dados pessoais (LGPD Art. 41) do operador — nome e canal de contato. A indicação ainda não foi feita.⟩

Cada clínica-contratante, na qualidade de controladora, deve indicar seu próprio
encarregado quando aplicável — obrigação dela, não do Iris.

## 11. Contato

Canal para exercício de direitos do titular e dúvidas sobre esta Política:
⟨PENDENTE: e-mail ou canal oficial de contato para assuntos de proteção de
dados⟩.

---

## Itens em aberto

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
2. **Provedor de IA, país de processamento e termos do DPA** (seção 4).
   Deliberadamente mantido em aberto: nomear um provedor não contratado seria
   informação falsa ao titular. Ver `BACKLOG.md`, seção B.
3. **País/região de processamento do provedor de e-mail transacional** e o
   instrumento de transferência internacional aplicável (seção 7).
4. **Indicação do encarregado (DPO)** do operador (seção 10).
5. **Canal oficial de contato** para assuntos de proteção de dados (seção 11).

Além destes, permanece pendente a **revisão jurídica completa** do documento,
em especial das seções 4 (DPA com provedor de IA) e 6 (uso agregado/anonimizado).
A publicação nesta versão foi autorizada pelo titular do negócio em 30/07/2026,
com ciência do advogado, que sinalizará o que precisar ser alterado.
