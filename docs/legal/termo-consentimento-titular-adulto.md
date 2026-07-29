# Termo de Consentimento para Tratamento de Dados — Titular Adulto — Iris

**Status: RASCUNHO de produto, pendente de revisão por advogado antes de
publicação.** Redigido em 28/07/2026 para fechar a issue #129, e revisado no
mesmo dia contra parecer adversarial interno (achados aplicados: base legal
por finalidade, dispositivo da tutela da saúde, notificações compulsórias do
regime adulto). Preenche um buraco real: todo o texto legal existente do
projeto pressupõe responsável legal assinando por paciente menor de idade
(LGPD Art. 14, §1º), e não existia termo para o titular adulto capaz.
Complementa `politica-privacidade.md`, `politica-retencao-dados.md` e
`termos-de-uso.md` — os quatro documentos devem ser lidos e revisados
juntos. Base técnica em `.specs/features/consentimento-titular-adulto/spec.md`
(issue #100) e demanda de produto em #98 (Terapia Convencional) e #99 (TCC).

> **Escopo:** este documento tem duas partes. As seções 1 a 4 são
> **instruções para a clínica e para o produto** — não vão para o papel que
> o paciente assina. A partir da seção 5 está a **minuta do termo em si**,
> escrita em primeira pessoa, para ser impressa/exibida e assinada pelo
> titular.

---

## 1. A quem este termo se aplica

Aplica-se ao **titular maior de 18 anos, civilmente capaz**, que consente
por si próprio o tratamento dos seus dados pessoais e dados sensíveis de
saúde na clínica.

No sistema, corresponde ao registro `Consent` com
`tipo = 'autoconsentimento_titular_adulto'` e `responsavel_signatario`
nulo — o par mutuamente exclusivo do `tipo = 'tratamento_dados_menor'`, que
continua sendo o caminho de paciente menor com responsável legal.

> ⚠️ **Isso ainda NÃO existe no banco.** Hoje o enum `consent_tipo` tem
> apenas `tratamento_dados_menor`, `uso_ia_processamento` e
> `exportacao_relatorios`, e `consent.responsavel_signatario` é `NOT NULL`
> (`db/migrations/0000_fase1_tabelas.sql`, `src/db/schema.ts`). O valor novo
> de enum e a nulidade da coluna são entregues pela **issue #100**
> (migrações `0050` e `0051`). **Enquanto essa migração não estiver
> aplicada, este termo não pode ser colhido** — não há onde gravar o
> consentimento que ele documenta.

## 2. A quem este termo NÃO se aplica

Três casos ficam **explicitamente fora** deste termo. Nenhum deles deve ser
cadastrado usando esta minuta:

1. **Paciente menor de 18 anos.** Continua sob o regime do Art. 14, §1º, da
   LGPD — consentimento específico e destacado de pelo menos um dos pais ou
   responsável legal. Ver `politica-privacidade.md`, seção 2.
2. **Adulto sob curatela ou com capacidade civil reduzida.** Precisa de
   representação/assistência do curador, e o termo correspondente ainda não
   existe. Idade maior que 18 **não** é prova de capacidade civil, e o
   sistema hoje não modela esse caso — ver seção 4, pendência (c).
3. **Adolescente emancipado** (Art. 5º, parágrafo único, do Código Civil).
   Juridicamente é capaz, mas a emancipação precisa ser comprovada
   documentalmente pela clínica e não há hoje campo para registrar essa
   comprovação. Até que exista, tratar caso a caso com o advogado da clínica.

> **Por isso o tipo de consentimento é escolha explícita do operador, nunca
> derivada da data de nascimento.** Derivar por idade erraria nos dois
> sentidos: classificaria o adulto sob curatela como capaz e o adolescente
> emancipado como incapaz. Além disso `patient.nascimento` é campo opcional
> no cadastro — ausência de data não significa "adulto". Decisão D1 da
> issue #100.

## 3. Identificação de versão

Este termo é a versão **`adulto-v1`**. O identificador é gravado em
`Consent.versao_termo` no ato da assinatura e **nunca é sobrescrito**: a
tabela `consent` é append-only por privilégio de banco
(`REVOKE UPDATE, DELETE ON consent FROM app_role`,
`db/migrations/0001_rls.sql`). Qualquer alteração de mérito neste texto
exige um identificador novo (`adulto-v2`, …) e uma nova coleta de
assinatura — nunca a edição silenciosa do termo já assinado.

O termo de paciente menor permanece na versão `v1`, inalterado.

## 4. Transição menor → maioridade

Paciente que entra na clínica menor de idade e completa 18 anos durante o
acompanhamento **passa a ser titular capaz dos próprios dados**. O
consentimento anteriormente dado pelo responsável legal permanece válido e
registrado quanto ao tratamento já realizado no período em que o paciente
era menor — não é apagado, não é invalidado retroativamente, e continua na
trilha. Para o tratamento a partir da maioridade, a orientação de produto é
**colher um consentimento novo, assinado pelo próprio titular**, gravado
como uma linha nova de `Consent` (renovação nunca é edição — decisões D2 e
D3 da issue #100).

> **Pendências reais desta seção, a confirmar com o advogado:**
> (a) o consentimento do responsável continua sustentando o tratamento
> entre a data do aniversário de 18 anos e a data da nova assinatura, ou há
> uma janela de descoberto que exige interrupção do tratamento de dados?
> (b) qual o prazo razoável para colher a renovação?
> (c) o caso de curatela (seção 2, item 2) precisa de termo próprio ou é
> coberto por adaptação do termo de menor?
> Enquanto (a) e (b) não estiverem respondidos, o sistema não implementa
> detecção automática de maioridade — a clínica é responsável por
> identificar e renovar.

---

## 5. Minuta do termo — identificação

**TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS E DADOS
SENSÍVEIS DE SAÚDE**

Versão `adulto-v1`.

- **Controladora dos dados:** [Razão social da clínica, CNPJ, endereço — a
  clínica-contratante é a controladora.]
- **Operador:** Iris — [razão social e CNPJ do Iris, a preencher],
  plataforma de prontuário e gestão clínica, que trata os dados por conta e
  ordem da clínica, exclusivamente para prestar o serviço contratado.
- **Titular:** [Nome completo], [CPF], [data de nascimento].
- **Provedor de inteligência artificial contratado:** [Nome do provedor e
  país onde o processamento ocorre — a preencher. Ver seções 8 e 9: sem
  esse dado, o consentimento da seção 9 não é específico.]
- **Canal para exercício de direitos:** [Confirmar
  `privacidade@irisclinica.ia.br`, já indicado em
  `politica-retencao-dados.md`, ou substituir pelo canal próprio da
  clínica.]
- **Encarregado (DPO):** [Pendente — LGPD Art. 41; ver
  `politica-privacidade.md` seção 10.]

## 6. Que dados serão tratados

Declaro estar ciente de que serão tratados os seguintes dados a meu
respeito:

- **Dados de identificação e contato:** nome, data de nascimento, contato,
  convênio, quando aplicável.
- **Dados sensíveis de saúde** (LGPD Art. 5º, II): hipótese diagnóstica e
  informações clínicas, registros das sessões em texto, evidências clínicas
  estruturadas a partir do relato do profissional, avaliações formais e
  relatórios gerados.
- **Registros de uso do sistema:** trilha de auditoria de quem acessou,
  alterou ou exportou informações do meu prontuário.

## 7. Para que os dados serão tratados, e com que base legal

Cada finalidade abaixo tem **uma** base legal própria. Isso importa para
mim: só as finalidades das seções 8, 9 e 10 dependem do meu consentimento,
e só elas podem ser revogadas por mim.

| Finalidade | Base legal | Depende do meu consentimento? |
| :--- | :--- | :--- |
| Registro e condução do meu acompanhamento terapêutico — prontuário, evolução das sessões, planejamento clínico | **Tutela da saúde**, em procedimento realizado por profissionais e serviços de saúde (LGPD Art. 11, II, "f") | **Não.** É o tratamento que permite que eu seja atendido, e o registro em prontuário é exigido do profissional pelo seu conselho. |
| Organização do atendimento — agenda, frequência, comunicação com a clínica | Execução de contrato do qual sou parte (LGPD Art. 7º, V) e tutela da saúde (Art. 11, II, "f") | Não. |
| Guarda do prontuário depois do fim do acompanhamento | Cumprimento de obrigação legal e regulatória (LGPD Art. 16, I, e normas do conselho profissional) | Não. |
| Estruturação assistida por inteligência artificial (seção 8) | **Consentimento** (LGPD Art. 7º, I, e Art. 11, I) | **Sim.** |
| Transferência internacional para o provedor de IA (seção 9) | **Consentimento específico e destacado** (LGPD Art. 33, VIII), somado às garantias contratuais do Art. 33, II, "b" | **Sim.** |
| Exportação de relatórios para convênio ou terceiro por mim indicado (seção 10) | **Consentimento** (LGPD Art. 7º, I, e Art. 11, I) | **Sim.** |

> **Nota de produto (não vai para o papel assinado):** a separação acima é
> o ponto mais importante deste termo. Empilhar bases legais — dizer que o
> mesmo tratamento se apoia em consentimento **e** em tutela da saúde **e**
> em obrigação legal — tornaria o consentimento não-livre e a revogação
> ilusória: o titular revogaria e nada aconteceria, porque a clínica
> declararia já se apoiar em outra hipótese. No sistema, cada finalidade
> consentida corresponde a um registro próprio de `Consent`
> (`uso_ia_processamento`, `exportacao_relatorios`), nunca a um bloco único
> de "aceito tudo".

## 8. Uso de inteligência artificial no processamento

Estou ciente de que a clínica utiliza, dentro do Iris, um modelo de
linguagem de terceiro para **sugerir** a estruturação das informações
registradas pelo profissional a partir do texto das sessões.

Declaro estar informado de que:

- A inteligência artificial **não diagnostica, não pontua e não decide
  nada** a meu respeito. Toda sugestão precisa ser revisada e aprovada por
  um profissional humano antes de virar registro permanente.
- O conteúdo do registro da sessão é enviado ao provedor de IA identificado
  na seção 5 para esse processamento.
- Nenhuma decisão sobre o meu tratamento é tomada **unicamente** com base
  em tratamento automatizado. Caso, no futuro, alguma decisão que afete
  meus interesses passe a ser tomada dessa forma, tenho direito a solicitar
  sua revisão (LGPD Art. 20).

☐ **Consinto** com o uso de inteligência artificial no processamento dos
meus registros, nos termos acima.
☐ **Não consinto.** (Estou ciente de que o acompanhamento continua
normalmente; apenas a estruturação assistida por IA não será usada nos meus
registros.)

## 9. Transferência internacional de dados

Estou ciente de que, quando o provedor de inteligência artificial
identificado na seção 5 não mantém infraestrutura no Brasil, o envio do
conteúdo dos meus registros a esse provedor configura **transferência
internacional de dado sensível de saúde**, com destino ao país ali
indicado. A operação se apoia nas garantias contratuais do **LGPD Art. 33,
II, "b"** (cláusulas-padrão contratuais) e, quanto a mim, no meu
**consentimento específico e destacado** (LGPD Art. 33, VIII) — que é dado
aqui, de forma distinta das demais finalidades deste termo. O provedor não
retém o conteúdo além do necessário para gerar a resposta.

☐ **Consinto** com a transferência internacional descrita acima.
☐ **Não consinto.** (Estou ciente de que, se o provedor de IA contratado
pela clínica não mantiver infraestrutura no Brasil, esta recusa tem o mesmo
efeito prático da recusa da seção 8: a estruturação assistida por IA não
será usada nos meus registros. O acompanhamento continua normalmente.)

> **Pendências reais:** (a) confirmar os termos exatos do acordo de
> processamento de dados com o provedor de IA efetivamente escolhido antes
> do piloto; (b) confirmar, em fonte primária (DOU / site da ANPD), a
> numeração e a vigência da resolução da ANPD que aprova o modelo de
> cláusulas-padrão contratuais — `politica-privacidade.md` seção 4 cita
> "Resolução CD/ANPD nº 19/2024", e esse número não pode ir para um
> documento assinado por titular sem conferência; (c) esclarecer **quem
> figura como parte** nas cláusulas-padrão — a clínica, que é a
> controladora, ou o Iris, que é operador.

## 10. Exportação e compartilhamento de relatórios

Estou ciente de que a clínica pode gerar e **exportar** relatórios sobre o
meu acompanhamento, e de que:

- Toda exportação é registrada na trilha de auditoria antes de ser
  liberada.
- O Iris fornece a ferramenta de exportação; não envia dado diretamente a
  convênio ou a qualquer terceiro por conta própria.
- Fora das hipóteses previstas em lei, nenhum dado meu é compartilhado com
  terceiros, e **nunca** para publicidade ou venda.

Autorizo, separadamente:

☐ **Exportação de relatório para a minha operadora de plano de saúde**, no
contexto do meu atendimento.
☐ **Não autorizo.** (Estou ciente de que, sem esta autorização, a clínica
não poderá encaminhar relatórios ao meu convênio, o que pode inviabilizar
reembolso ou autorização de sessões.)

☐ **Exportação para terceiro por mim indicado**, por escrito e caso a caso.
☐ **Não autorizo.**

## 11. Por quanto tempo os dados serão mantidos

Meus dados serão mantidos pelo prazo de **[preencher com o número de anos]**
após a alta, observados os prazos mínimos de guarda de prontuário exigidos
pelo conselho profissional. Estou ciente de que **a revogação dos
consentimentos das seções 8, 9 e 10 não apaga o prontuário** enquanto durar
esse prazo legal de guarda — ver seção 13.

> **Pendência real:** `politica-retencao-dados.md` expressa o prazo default
> como `MAX(paciente completa 18 anos, alta + 10 anos)`, fórmula desenhada
> para paciente menor. Para titular que já é adulto na admissão, o primeiro
> termo da fórmula é inócuo e o prazo efetivo é `alta + 10 anos`. O número
> precisa ser confirmado com o advogado e **escrito por extenso nesta
> seção** antes da impressão — remissão a uma política que o titular não
> recebe não satisfaz o dever de informar o prazo (LGPD Art. 9º, II).

## 12. Segurança

Estou ciente de que o acesso aos meus dados é controlado por papel
profissional, com isolamento entre clínicas no banco de dados, autenticação
com segundo fator e trilha de auditoria imutável de acessos, alterações e
exportações.

## 13. Meus direitos, e como revogar os consentimentos deste termo

Posso, a qualquer momento, **por procedimento gratuito e facilitado**,
através do canal indicado na seção 5: confirmar a existência de tratamento,
acessar meus dados, corrigi-los, solicitar anonimização ou eliminação,
solicitar portabilidade, obter informação sobre compartilhamentos, e
**revogar os consentimentos das seções 8, 9 e 10**. Posso também peticionar
à Autoridade Nacional de Proteção de Dados (ANPD) em relação aos meus dados
(LGPD Art. 18, § 1º).

A revogação vale **para o futuro**: ficam ratificados os tratamentos já
realizados enquanto o consentimento vigorava, ressalvado o meu direito de
requerer a eliminação nos termos do Art. 18, VI, respeitado o prazo legal
de guarda da seção 11 (LGPD Art. 8º, § 5º).

Revogado o consentimento, **cessam as finalidades das seções 8, 9 e 10** —
estruturação assistida por IA, transferência internacional e exportação de
relatórios. O **registro clínico do meu atendimento em curso continua**,
porque não depende do meu consentimento e é exigido do profissional pelo
seu conselho (seção 7); encerrado o acompanhamento, o prontuário passa a
ser mantido apenas para cumprimento do prazo legal de guarda.

> **Pendências reais de implementação, todas anteriores à primeira coleta
> com titular real:**
> (a) **Não há hoje como registrar uma revogação.** A tabela `consent` é
> append-only por privilégio de banco e o enum `consent_tipo` não tem
> nenhum valor de evento de revogação — a promessa "posso revogar a
> qualquer momento" não é apenas não-implementada, é não-registrável. O
> evento de revogação precisa de modelagem própria.
> (b) O estado "somente leitura, sem novos registros" após revogação
> (Read-Only Locked) está especificado em `aditivo-especificacoes-legais.md`
> e rastreado na issue **#117**, e ainda não está implementado. Além disso,
> ele foi desenhado para paciente **menor**, cujo tratamento tinha o
> consentimento do responsável como base — **não transporta automaticamente
> para o adulto**, cujo registro clínico se apoia em tutela da saúde.
> Confirmar com o advogado antes de aplicar o mesmo comportamento aos dois.
> (c) **Portabilidade** (Art. 18, V): o aditivo especifica exportação
> integral do prontuário em PDF/A, e não foi localizado módulo
> correspondente no código — existe exportação de relatório, não do
> prontuário completo. Confirmar antes de prometer no termo.

## 14. Limites do sigilo

Estou ciente de que o sigilo profissional é a regra, e de que ele comporta
duas ordens distintas de exceção:

1. **Hipóteses de quebra por ponderação do profissional**, previstas na
   legislação e nos códigos de ética profissionais, restritas ao mínimo
   necessário e ao menor prejuízo — por exemplo, risco iminente à vida.
2. **Hipóteses de comunicação obrigatória do serviço de saúde a autoridade
   pública**, que independem da minha concordância e não comportam
   ponderação — notadamente o registro de tentativa de suicídio ou de
   autolesão, de notificação compulsória à vigilância epidemiológica
   (Lei 13.819/2019), e o registro de violência contra a mulher, de
   comunicação compulsória à autoridade competente (Lei 10.778/2003 e
   Lei 13.931/2019). Nessas hipóteses comunica-se o **fato** à autoridade
   competente, preservando-se o conteúdo do prontuário que não seja
   estritamente necessário.

> **Nota de produto (não vai para o papel assinado):** o Iris **nunca**
> notifica família, SAMU, Conselho Tutelar ou qualquer terceiro externo por
> conta própria — o alerta de risco é interno à equipe clínica, e as
> notificações compulsórias do item 2 são dever do profissional e do
> estabelecimento, executadas fora do sistema. Este termo não pode conter
> nenhuma frase que sugira notificação automática pelo software. Base:
> `parecer-juridico-duty-to-warn.md` e a cláusula 10 de `termos-de-uso.md`
> — que é contrato B2B entre Iris e clínica e **não** pode ser citada como
> remissão no texto assinado pelo titular, que não é parte dele e não tem
> acesso a ele.

## 15. Declaração e assinatura

Declaro que li e compreendi este termo, que tive oportunidade de esclarecer
dúvidas, que recebi uma via, e que meu consentimento é dado de forma livre
e informada.

Declaro estar ciente de que **as autorizações das seções 8, 9 e 10 são
facultativas**, podem ser dadas ou recusadas separadamente, podem ser
revogadas a qualquer tempo, e que **a recusa de qualquer delas não afeta
meu acesso ao atendimento nem a qualidade do cuidado prestado** — ressalvado
o efeito prático informado em cada seção.

- **Nome do titular:** ______________________________________________
- **CPF:** ____________________
- **Data:** ____ / ____ / ________
- **Assinatura:** ___________________________________________________

- **Profissional/recepção que colheu o consentimento:** _______________
- **Versão do termo:** `adulto-v1`

---

## Pendências antes deste documento valer como final

**Jurídicas**

- **Revisão por advogado** — em especial da seção 7 (atribuição de base
  legal por finalidade, e o enquadramento do registro clínico do adulto em
  tutela da saúde), da seção 4 (transição menor→adulto, perguntas (a), (b)
  e (c)), da seção 13 (efeitos da revogação × prazo de guarda × aplicação
  do Read-Only Locked ao adulto) e da seção 14 (redação das notificações
  compulsórias).
- **Seção 2, item 2 (curatela)** — decidir se vira termo próprio ou
  adaptação do termo de menor. Enquanto não decidido, adulto sob curatela
  não pode ser cadastrado por este caminho.
- **Seção 9** — DPA com o provedor de IA assinado e conferido; numeração e
  vigência da resolução da ANPD conferidas em fonte primária; definição de
  quem é parte nas cláusulas-padrão.

**De preenchimento, antes da impressão**

- **Seção 5** — razão social/CNPJ da clínica e do Iris, nome do provedor de
  IA e país de destino, canal de contato, encarregado.
- **Seção 11** — prazo de guarda escrito por extenso, em número de anos.

**De implementação**

- **Issue #100** — migrações `0050`/`0051`. Sem elas o tipo de
  consentimento deste termo não pode ser gravado (seção 1).
- **Evento de revogação** — não existe modelagem para registrá-lo
  (seção 13, pendência (a)).
- **Issue #117** — Read-Only Locked, com a ressalva de que foi desenhado
  para o regime de menor.
- **Portabilidade** — exportação integral do prontuário em PDF/A
  (seção 13, pendência (c)).

**Correções necessárias em outros documentos deste repositório**

- **`politica-privacidade.md` seção 2** — cita "LGPD Art. 11, II, 'a'" para
  tutela da saúde; a alínea correta é **"f"**. Corrigido nesta mesma
  entrega.
- **`politica-privacidade.md` seções 1 e 2** — descrevem o público como
  "crianças e adolescentes" e a base legal apenas pelo Art. 14; sem ajuste,
  contradizem este termo.
- **`politica-retencao-dados.md` seção 9** — redigida como se só o
  responsável legal pudesse solicitar; não contempla o titular adulto
  exercendo direitos por si.
- **`politica-retencao-dados.md` seção 3** — o prazo default
  `MAX(18 anos, alta + 10 anos)` precisa dizer explicitamente qual é o
  prazo do titular já adulto na admissão.

**Resposta do advogado:** ☐ Alinhado &nbsp;&nbsp; ☐ Ajustar: ___________
&nbsp;&nbsp; ☐ Precisa de parecer formal
