# Termo de Consentimento para Tratamento de Dados — Paciente Menor — Iris

**Status: RATIFICADO em 24/08/2026 — apto a ser colhido, ressalvados os
gates de impressão da seção "Estado das pendências".** Versão `v1`. Fecha o
débito **D59** do `BACKLOG.md` (achado ao tentar aplicar no regime de menor
a cláusula de assistente de voz/ASR da issue #72, já ratificada nos termos
de titular adulto §8.1 e curatela §9.1 — não havia onde aplicá-la porque
este documento não existia). Consolidada em 24/08/2026 após revisão técnica
contra o estado real do código e do `BACKLOG.md` (débito `D57`, pendências
de DPA/Gemini ainda abertas).

> **Como esta ratificação se deu, registrado de propósito:** a validação
> deste documento foi comunicada pelo Rômulo (responsável pelo produto) em
> 24/08/2026, e não houve apontamento a corrigir — mesmo protocolo já usado
> em `termo-consentimento-titular-adulto.md` e
> `termo-consentimento-curatela.md`. A validade deste termo se apoia nesse
> protocolo, não em parecer escrito autônomo, que não foi emitido. Se
> apontamentos vierem depois, o texto passa a `v2` e exige nova coleta de
> assinatura (seção 1.1). **Ratificação de mérito, não de fato técnico:** a
> pendência de provedor de IA (débito `D57`) segue aberta e continua
> bloqueando a impressão até ser fechada — ver "Estado das pendências".

**Base regulamentar:** LGPD (Lei 13.709/2018), Art. 14, *caput* e § 1º;
Código Civil, Arts. 1.630 e seguintes (poder familiar) e 1.728 e seguintes
(tutela); Estatuto da Criança e do Adolescente (Lei 8.069/1990).

> **Nota de propósito, sobre o que mudou na consolidação:** a minuta
> anterior citava "Enunciado CD/ANPD nº 1/2023" e afirmava que o Gemini API
> opera sob "regime de não-retenção de dados / Zero Data Retention" como
> fato estabelecido, e descrevia o áudio de sessão como "biometria vocal".
> As três coisas foram corrigidas — ver notas nas cláusulas 3ª e a lista de
> numeração regulatória abaixo — porque um termo assinado por um responsável
> legal, afirmando algo que o próprio `BACKLOG.md` (débito `D57`) registra
> como **não confirmado**, é prova documental contra o Operador/Controlador
> se a afirmação se revelar falsa. Preferir a lacuna sinalizada à afirmação
> categórica não verificada.

Complementa `politica-privacidade.md`, `politica-retencao-dados.md`,
`termos-de-uso.md`, `procedimento-revogacao-consentimento.md` e os termos
irmãos de titular adulto, curatela e emancipado.

---

## 1. Escopo e Aplicabilidade (instruções de produto/clínica — não vai para o papel assinado)

Aplica-se ao **paciente menor de 18 anos**, em observância ao princípio do
**melhor interesse da criança e do adolescente**, cujo consentimento é
firmado por **pelo menos um dos pais ou responsável legal** (LGPD, Art. 14,
§ 1º) — não é exigida a assinatura de ambos os pais quando há mais de um.

- **Banco de dados:** `Consent` com `tipo = 'tratamento_dados_menor'`,
  `responsavel_signatario` preenchido, `instrumento_representacao` **nulo**
  (ao contrário da curatela, a legitimidade decorre do poder familiar ou da
  tutela, não de decisão judicial identificada linha a linha no banco).
- **Validação de tutela/guarda:** a verificação de certidões judiciais de
  tutela ou guarda cabe exclusivamente à clínica-controladora no momento do
  acolhimento — o sistema não a exige como condição de gravação.

### 1.1. Identificador de versão `v1` — nota técnica obrigatória

Este termo é a versão **`v1`**, sem prefixo, ao contrário dos irmãos
(`adulto-v1`, `curatela-v1`, `emancipado-v1`). **Não é escolha de redação: é
o valor que o código já grava.** `VERSAO_TERMO_MENOR_ATUAL = "v1"`
(`src/app/(app)/pacientes/novo/logic.ts:44`) é a string gravada em
`Consent.versao_termo` em todo cadastro de paciente menor desde que o
formulário existe — inclusive antes deste documento existir. A tabela
`consent` é append-only por privilégio de banco
(`REVOKE UPDATE, DELETE ON consent FROM app_role`): linhas já gravadas com
`versao_termo = 'v1'` não podem ser reescritas, e ratificar este texto como
`v1` é o que torna essas linhas passadas auditáveis. **Qualquer alteração de
mérito futura exige `v2` no banco e no código simultaneamente** — os dois
têm que andar juntos, ou a trilha volta a apontar para texto errado.

### 1.2. Sobre numeração regulatória

Este texto **não cita** número de resolução ou enunciado específico da ANPD.
Apoia-se diretamente no texto consolidado da LGPD (Art. 14, *caput* e § 1º)
e no Código Civil. Havendo necessidade de citar ato normativo específico da
ANPD (ex.: sobre cláusulas-padrão de transferência internacional), a
numeração deve ser conferida em fonte primária (DOU / site da ANPD) antes de
entrar no texto assinado — mesma regra já aplicada nos termos irmãos.

---

## 2. Minuta do termo (para impressão / coleta digital)

### TERMO DE CONSENTIMENTO E CIÊNCIA PARA TRATAMENTO DE DADOS PESSOAIS E SENSÍVEIS (PACIENTE MENOR DE IDADE)

**Versão:** `v1`

- **Controladora dos dados:** [Razão social da clínica/consultório], CNPJ
  nº [____________________], com sede em [endereço completo].
- **Operadora da plataforma:** **R SUTIL CORREA LTDA**, CNPJ nº
  **29.811.201/0001-50** (plataforma Iris), que trata os dados por conta e
  ordem da clínica, exclusivamente para prestar o serviço contratado.
- **Paciente (menor):** [Nome completo], nascido(a) em [__/__/____].
- **Responsável legal:** [Nome completo], CPF nº
  [____________________], [grau de parentesco/relação legal: mãe / pai /
  tutor(a) / guardião(ã) — se tutor(a) ou guardião(ã), a comprovação fica
  registrada no prontuário].
- **Provedor de subprocessamento / IA:** **Google Cloud / Gemini API**,
  com processamento nos Estados Unidos e em outros países onde o Google
  mantém infraestrutura. ⚠️ **Modelo contratual pretendido, não
  confirmado:** a intenção é operar sob conta com faturamento pago e
  regime contratual de não retenção do conteúdo para treino de modelos de
  terceiros — mas isso **depende** de (a) confirmação de faturamento pago
  ativo na chave em uso (o tier gratuito usa o conteúdo para treinar
  modelos do Google e não tem DPA), (b) confirmação de que o Gemini API
  standalone está no escopo do Data Processing Addendum do Google Cloud, e
  (c) confirmação de que as cláusulas-padrão do Google satisfazem o Art. 33
  da LGPD. **Nenhuma das três está fechada** — débito `D57` do
  `BACKLOG.md`. Este termo não pode ser impresso enquanto a pendência
  seguir aberta (ver "Estado das pendências").
- **Canal de atendimento DPO / privacidade:** [confirmar
  `privacidade@irisclinica.ia.br` ou o canal próprio da clínica].
- **Encarregado (DPO):** [pendente — LGPD Art. 41].

---

### Cláusula 1ª — Dados coletados e tratados

Na qualidade de responsável legal, declaro ciência de que serão tratados os
seguintes dados do paciente menor, no seu melhor interesse:

1. **Identificação e contato:** nome civil, data de nascimento, gênero,
   filiação, contato do responsável e dados de convênio, quando aplicável.
2. **Dados sensíveis de saúde (LGPD Art. 5º, II):** histórico clínico,
   hipóteses diagnósticas, anotações de evolução de sessão, relatórios
   terapêuticos e, caso ativado o recurso de voz, o **conteúdo de áudio e
   fala gravada** captado de forma direta (ditado do profissional) ou
   incidental (gravação de sessão) — tratado como dado sensível de saúde
   pelo conteúdo que carrega, não como dado biométrico de identificação ou
   autenticação (o Iris não realiza reconhecimento nem verificação de
   locutor; o áudio é só insumo de transcrição e é descartado — ver
   Cláusula 3ª).
3. **Logs de auditoria:** registros de acessos, modificações e exportações
   no prontuário.

### Cláusula 2ª — Finalidades e bases legais de tratamento

| Finalidade | Base legal principal | Regime de autorização |
| :--- | :--- | :--- |
| Admissão e atendimento clínico do menor | LGPD Art. 14, § 1º c/c Art. 7º, V | **Consentimento de regime — obrigatório para o atendimento** |
| Evolução do prontuário e histórico terapêutico, enquanto o consentimento de regime estiver vigente | Tutela da saúde (LGPD Art. 11, II, "f") | Vinculado à vigência do consentimento de regime — ver Cláusula 6ª |
| Guarda do prontuário depois do fim do acompanhamento | Cumprimento de obrigação legal e regulatória (LGPD Art. 16, I, e normas do conselho profissional) | Não depende de consentimento |
| Estruturação de notas via inteligência artificial | Consentimento específico (LGPD Art. 11, I) | **Facultativo (opt-in)** |
| Uso de assistente de voz / transcrição (ASR) | Consentimento específico (LGPD Art. 11, I c/c Art. 14) | **Facultativo (opt-in)** |
| Transferência internacional para provedor de IA | LGPD Art. 33, II, "b" e VIII | **Facultativo (opt-in)** |
| Envio de relatórios para convênio / terceiro indicado | Consentimento específico (LGPD Art. 11, I) | **Facultativo (opt-in)** |

> **Nota de produto (não vai para o papel assinado):** a linha 1 é a que
> distingue este termo do de titular adulto. No termo de adulto, o registro
> clínico **não** depende do autoconsentimento — apoia-se sozinho na tutela
> da saúde. Aqui, o consentimento de regime do responsável é o que
> **autoriza a admissão do menor no serviço**; por isso, e só por isso, sua
> revogação afeta a continuidade do registro (Cláusula 6ª) — mesmo
> comportamento e mesma razão do regime de curatela
> (`procedimento-revogacao-consentimento.md` §4.4).

### Cláusula 3ª — Inteligência artificial e processamento de áudio

- **Apoio operacional:** o uso de IA serve exclusivamente como suporte de
  sugestão de estruturação para o profissional de saúde. A IA **não
  diagnostica, não pontua e não decide nada** a respeito do paciente — toda
  sugestão é revisada e aprovada por um profissional humano antes de virar
  registro permanente. Nenhuma decisão sobre o tratamento é tomada
  **unicamente** com base em tratamento automatizado (LGPD Art. 20).
- **Assistente de voz (ASR):** o áudio da sessão ou o ditado do profissional
  é transmitido exclusivamente para transcrição textual; o texto entra como
  **rascunho** e só se torna registro oficial após revisão e aprovação do
  profissional. O áudio bruto é descartado do armazenamento **imediatamente
  após a transcrição ser aceita**; em caso de falha, é mantido por no
  máximo **7 (sete) dias** só para nova tentativa, e então descartado.
- ⚠️ **Sobre retenção pelo provedor de IA, ver o aviso da seção "Provedor de
  subprocessamento / IA" acima:** a intenção contratual é de não retenção
  do conteúdo para treino de modelos de terceiros, mas essa condição
  **depende de confirmação ainda pendente** (débito `D57`). Este termo não
  afirma que a não retenção já está contratualmente garantida.

### Cláusula 4ª — Opções de consentimento específico

1. **Processamento e estruturação por inteligência artificial (LLM):**
   ☐ **AUTORIZO** ☐ **NÃO AUTORIZO**
2. **Assistente de voz / transcrição de áudio (ASR):**
   ☐ **AUTORIZO** ☐ **NÃO AUTORIZO**
3. **Transferência internacional de dados (provedor de IA identificado
   acima):**
   ☐ **AUTORIZO** ☐ **NÃO AUTORIZO**
4. **Compartilhamento de relatórios com convênio médico:**
   ☐ **AUTORIZO** ☐ **NÃO AUTORIZO**
5. **Compartilhamento de relatórios com terceiros indicados (ex.: escola,
   outro profissional de saúde):**
   ☐ **AUTORIZO** ☐ **NÃO AUTORIZO**

Declaro ciência de que as autorizações 1 a 5 são **facultativas**, podem ser
dadas ou recusadas separadamente, podem ser revogadas a qualquer tempo, e
que **a recusa de qualquer delas não afeta o acesso do paciente ao
atendimento nem a qualidade do cuidado prestado** (Cláusula 6ª).

### Cláusula 5ª — Retenção, sigilo e exceções legais

- **Guarda de prontuário:** mantida até que se verifique, **o que ocorrer
  por último**: (a) o paciente completar 18 anos; ou (b) transcorrerem
  **10 (dez) anos** contados do último atendimento — observados os prazos
  mínimos de guarda exigidos pelo conselho profissional (LGPD Art. 16, I).
- **Dever de notificação compulsória:** o responsável declara ciência de
  que o sigilo profissional é quebrado compulsoriamente nas hipóteses de
  risco iminente à vida, violência, ou **suspeita/confirmação de
  maus-tratos contra o menor**, com comunicação do **fato** ao Conselho
  Tutelar e às autoridades competentes (ECA, Lei 8.069/1990, Art. 13 e
  Art. 245), independentemente da concordância do responsável, preservando-
  -se o conteúdo do prontuário que não seja estritamente necessário.

> **Nota de produto (não vai para o papel assinado):** o Iris **nunca**
> notifica família, Conselho Tutelar, SAMU ou qualquer terceiro externo por
> conta própria — o alerta de risco é interno à equipe clínica, e a
> notificação compulsória é dever do profissional e do estabelecimento,
> executada fora do sistema. Nenhuma frase deste termo pode sugerir
> notificação automática pelo software. Base: `parecer-juridico-duty-to-warn.md`.

### Cláusula 6ª — Revogação e direitos do titular

A qualquer momento, por procedimento gratuito e facilitado (LGPD Art. 8º,
§ 5º), pelo canal indicado no cabeçalho: confirmar a existência de
tratamento, acessar os dados do paciente, corrigi-los, solicitar
anonimização ou eliminação, solicitar portabilidade, obter informação sobre
compartilhamentos, e revogar os consentimentos facultativos da Cláusula 4ª.
Cabe também petição à ANPD (LGPD Art. 18, § 1º).

- **Revogação de uma cláusula facultativa isolada** (IA, ASR, transferência
  internacional, convênio ou terceiro indicado) **não afeta** o registro de
  novas sessões nem a continuidade do cuidado — cessa só aquela finalidade.
- **Revogação do consentimento de admissão/regime geral** (o que autoriza o
  atendimento do menor pela clínica, Cláusula 2ª linha 1), e não havendo
  outro consentimento de regime vigente, coloca o prontuário em
  **somente-leitura**: cessam novas sessões, diário, extração por IA e
  exportação. **A leitura permanece** — resguardado o direito legal de
  guarda, a fiscalização dos conselhos profissionais e a transferência de
  prontuário. O estado é **reversível**: nova assinatura deste termo, ou o
  paciente completando 18 anos e passando a autoconsentir por si
  (`termo-consentimento-titular-adulto.md` §4), destrava o prontuário.

Procedimento completo: `procedimento-revogacao-consentimento.md`.

---

### Assinaturas

Local e data: ____________________________________, ___ / ___ / ______

______________________________________________________________________
**Assinatura do responsável legal**
Nome: [________________________________________________________]
CPF: [_________________________________________________________]
Grau de parentesco/relação legal: [___________________________]

______________________________________________________________________
**Anuência do adolescente** (recomendada para pacientes entre 16 e 18 anos
incompletos — **facultativa**, expressão de engajamento clínico e
autonomia progressiva; sua ausência **não invalida** o termo devidamente
assinado pelo responsável legal)
Nome do paciente: [____________________________________________]

- **Profissional/recepção que colheu o consentimento:** _______________
- **Versão do termo:** `v1`

---

## Estado das pendências

### ⛔ Gates de impressão — por clínica, antes de colher a primeira assinatura

- **Cabeçalho da minuta** — razão social, CNPJ e endereço da
  clínica-contratante; canal para exercício de direitos; encarregado (DPO).
- **Provedor de IA** — ⛔ **Aberto:** faturamento pago ativo confirmado na
  conta da chave em uso; escopo do Data Processing Addendum do Google
  Cloud para o Gemini API standalone; equivalência das cláusulas-padrão do
  Google ao Art. 33 da LGPD; definição de quem figura como parte nas
  cláusulas — clínica (controladora) ou Iris (operador). Débito `D57` do
  `BACKLOG.md`. **Este termo não deve ser colhido com titular real antes de
  fechar esta pendência**, dado que a Cláusula 4ª oferece opt-in de
  transferência internacional cujo lastro contratual ainda não está
  confirmado.
- **Validação de tutela/guarda** — quando o signatário não for pai/mãe, a
  clínica registra a comprovação no prontuário; o schema não a exige como
  condição de gravação (seção 1).

### Não fechado por este documento

- **Portabilidade** (exportação integral do prontuário em PDF/A) — mesma
  pendência de implementação registrada nos termos irmãos, não resolvida
  aqui.

### Histórico de consolidação

24/08/2026 — texto revisado contra o estado real do repositório antes da
leitura do advogado: retirada a afirmação categórica de "Zero Data
Retention" (substituída por indicação de modelo pretendido, sujeito à
pendência `D57`); removida a caracterização do áudio como "biometria
vocal"; removidas numerações regulatórias não conferidas em fonte primária;
reintegrada a nota técnica que vincula `v1` à constante
`VERSAO_TERMO_MENOR_ATUAL`; explicitado que revogar cláusula facultativa não
afeta continuidade do cuidado, e que a leitura permanece mesmo em
somente-leitura; definido que a anuência do adolescente de 16 a 18 anos é
facultativa e não invalidante.
