# Termo de Consentimento para Tratamento de Dados — Adulto sob Curatela — Iris

**Versão `curatela-v1`.** Redigido em 29/07/2026 para a issue #134,
cumprindo a resposta **(c)** já ratificada em
`termo-consentimento-titular-adulto.md` §4: curatela tem **termo próprio**,
nunca adaptação do termo de menor.

Complementa `termo-consentimento-titular-adulto.md`,
`procedimento-revogacao-consentimento.md`, `politica-privacidade.md`,
`politica-retencao-dados.md` e `termos-de-uso.md`.

> **Escopo:** as seções 1 a 4 são **instruções para a clínica e para o
> produto** — não vão para o papel assinado. A partir da seção 5 está a
> **minuta do termo**, para ser impressa/exibida e assinada pelo curador,
> com participação do titular.

---

## 1. A quem este termo se aplica

Aplica-se ao **titular maior de 18 anos submetido a curatela**, cujo
consentimento para o tratamento de dados é manifestado pelo **curador**,
nos limites do instrumento judicial de curatela.

No sistema, corresponde ao registro `Consent` com
`tipo = 'representacao_curador'`, `responsavel_signatario` preenchido com a
identificação do curador, e `instrumento_representacao` preenchido com a
identificação do instrumento de curatela. As três coisas são exigidas
juntas por constraint de banco — não é possível gravar curatela sem
identificar o instrumento.

## 2. A quem este termo NÃO se aplica

1. **Paciente menor de 18 anos** — regime do **LGPD Art. 14, § 1º**,
   consentimento específico e destacado de pelo menos um dos pais ou
   responsável legal. Ver `politica-privacidade.md` §2.
2. **Adulto capaz** — usa `termo-consentimento-titular-adulto.md`
   (`adulto-v1`).
3. **Adolescente emancipado** — é juridicamente capaz e autoconsente. Usa
   `termo-consentimento-titular-emancipado.md` (`emancipado-v1`). Ver §4
   deste documento.
4. **Adulto com dificuldade de comunicação, mas sem curatela constituída.**
   Sem decisão judicial de curatela não há curador, e ninguém consente pelo
   titular. Nesse caso, o caminho é o termo de adulto capaz, com o apoio de
   comunicação necessário — a capacidade civil é a regra, e a deficiência,
   por si só, **não** afeta a plena capacidade civil (**Lei 13.146/2015,
   Art. 6º**).

> **O tipo de consentimento é sempre escolha explícita do operador, nunca
> derivada da data de nascimento.** Idade acima de 18 não é prova de
> capacidade civil, nem de incapacidade. Decisão D1 da issue #100, mantida.

## 3. Identificação de versão

Este termo é a versão **`curatela-v1`**, gravada em `Consent.versao_termo`
no ato da assinatura e **nunca sobrescrita** — a tabela `consent` é
append-only por privilégio de banco. Alteração de mérito exige
identificador novo (`curatela-v2`, …) e nova coleta de assinatura.

## 4. Curatela é medida extraordinária, e pode ser parcial

Ponto que o termo precisa refletir com precisão, sob pena de o consentimento
ser inválido por representação excessiva:

- A curatela é **medida extraordinária**, deve durar o menor tempo
  possível e **afeta apenas os atos de natureza patrimonial e negocial**
  (**Lei 13.146/2015 — Estatuto da Pessoa com Deficiência —, Art. 85 e
  § 1º**; **Código Civil, Art. 1.772** e **Arts. 1.767 e seguintes**).
- A definição do que o curador pode fazer está **no instrumento judicial**,
  e só nele. Por isso o instrumento é registrado no sistema: sem ele, não
  há como aferir o alcance da representação.
- O direito à saúde é **direito personalíssimo**, e a curatela não retira
  do titular a participação na decisão sobre o próprio cuidado. O termo diz
  isso expressamente na seção 13.

**Resposta proposta — participação do titular:** a assinatura é do curador,
mas o termo declara que o **conteúdo foi apresentado ao titular em
linguagem acessível** e que ele participou da decisão **na medida do seu
discernimento**. Se o titular tiver discernimento para tanto, assina
**também**, em campo próprio. Essa assinatura adicional não substitui a do
curador nem é condição de validade — ela documenta o respeito à autonomia
exigido pelo Estatuto.

**Resposta proposta — curatela parcial que não alcance dados de saúde:** se
o instrumento restringir a curatela a atos patrimoniais e nada disser sobre
saúde, o caminho correto **não** é presumir representação. É colher o
**termo de adulto capaz**, assinado pelo próprio titular, e registrar no
prontuário a leitura feita do instrumento. Presumir representação a partir
da existência de curatela contraria o Art. 85 do Estatuto.

## 5. Transição e revogação

- **Levantamento ou alteração da curatela:** o instrumento novo é fato
  novo. Colher consentimento novo — do próprio titular, se a curatela foi
  levantada; do novo curador, se houve substituição. Linha nova em
  `Consent`, nunca edição.
- **Revogação:** o curador pode revogar a qualquer tempo, por procedimento
  gratuito e facilitado (**Art. 8º, § 5º**). Revogado o consentimento de
  regime e não havendo outro vigente, o prontuário vai a **somente-leitura**
  — sem novas sessões, diário, extração por IA ou exportação; a leitura
  permanece, para fiscalização de conselho e transferência de prontuário. É
  o mesmo efeito do regime de menor, e pela mesma razão: aqui o
  consentimento **é** a base do tratamento. Procedimento completo em
  `procedimento-revogacao-consentimento.md`.

---

## 6. Minuta do termo — identificação

**TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS E DADOS
SENSÍVEIS DE SAÚDE — TITULAR SOB CURATELA**

Versão `curatela-v1`.

- **Controladora dos dados:** [Razão social da clínica, CNPJ, endereço — a
  clínica-contratante é a controladora.]
- **Operador:** Iris — **R Sutil Correa Ltda**, CNPJ
  nº **29.811.201/0001-50**, plataforma de prontuário e gestão clínica, que
  trata os dados por conta e ordem da clínica, exclusivamente para prestar
  o serviço contratado.
- **Titular:** [Nome completo], [CPF], [data de nascimento].
- **Curador(a):** [Nome completo], [CPF], [contato].
- **Instrumento de curatela:** [Número do processo, vara/comarca e data da
  decisão, ou identificação do termo de curatela.] **Sem este dado o
  consentimento não pode ser colhido nem registrado.**
- **Alcance da curatela conforme o instrumento:** [ ] abrange decisões
  sobre saúde e dados de saúde — [ ] não abrange (neste caso, não usar este
  termo; ver seção 4).
- **Provedor de inteligência artificial contratado:** [Nome do provedor e
  país onde o processamento ocorre — a preencher. Ver seções 9 e 10.]
- **Canal para exercício de direitos:** [A preencher pela clínica.]
- **Encarregado (DPO):** [Pendente — LGPD Art. 41.]

## 7. Que dados serão tratados

O curador declara estar ciente de que serão tratados os seguintes dados a
respeito do titular:

- **Dados de identificação e contato:** nome, data de nascimento, contato,
  convênio, quando aplicável, e a identificação do curador e do instrumento
  de curatela.
- **Dados sensíveis de saúde** (LGPD Art. 5º, II): hipótese diagnóstica e
  informações clínicas, registros das sessões em texto, evidências clínicas
  estruturadas a partir do relato do profissional, avaliações formais e
  relatórios gerados.
- **Registros de uso do sistema:** trilha de auditoria de quem acessou,
  alterou ou exportou informações do prontuário.

## 8. Para que os dados serão tratados, e com que base legal

Cada finalidade tem **uma** base legal própria. Só as finalidades das
seções 9, 10 e 11 dependem deste consentimento, e só elas podem ser
revogadas.

| Finalidade | Base legal | Depende deste consentimento? |
| :--- | :--- | :--- |
| Registro e condução do acompanhamento terapêutico — prontuário, evolução das sessões, planejamento clínico | **Tutela da saúde**, em procedimento realizado por profissionais e serviços de saúde (LGPD Art. 11, II, "f") | **Não.** É o tratamento que permite o atendimento, e o registro em prontuário é exigido do profissional pelo seu conselho. |
| Organização do atendimento — agenda, frequência, comunicação com a clínica | Execução de contrato (LGPD Art. 7º, V) e tutela da saúde (Art. 11, II, "f") | Não. |
| Guarda do prontuário depois do fim do acompanhamento | Cumprimento de obrigação legal e regulatória (LGPD Art. 16, I, e normas do conselho profissional) | Não. |
| Estruturação assistida por inteligência artificial (seção 9) | **Consentimento** (LGPD Art. 7º, I, e Art. 11, I) | **Sim.** |
| Transferência internacional para o provedor de IA (seção 10) | **Consentimento específico e destacado** (LGPD Art. 33, VIII), somado às garantias contratuais do Art. 33, II, "b" | **Sim.** |
| Exportação de relatórios para convênio ou terceiro indicado (seção 11) | **Consentimento** (LGPD Art. 7º, I, e Art. 11, I) | **Sim.** |

> **Nota de produto (não vai para o papel assinado):** a separação acima é
> o mesmo desenho do termo adulto, e pela mesma razão — empilhar bases
> legais tornaria o consentimento não-livre e a revogação ilusória. Cada
> finalidade consentida é um registro próprio de `Consent`, nunca um bloco
> único de "aceito tudo". Atenção específica da curatela: o registro
> clínico **não** se apoia neste consentimento, mas o consentimento de
> regime do curador é o que autoriza a admissão do titular no serviço — por
> isso sua revogação leva o prontuário a somente-leitura (seção 5).

## 9. Uso de inteligência artificial no processamento

O curador declara estar ciente de que a clínica utiliza, dentro do Iris, um
modelo de linguagem de terceiro para **sugerir** a estruturação das
informações registradas pelo profissional a partir do texto das sessões, e
de que:

- A inteligência artificial **não diagnostica, não pontua e não decide
  nada** a respeito do titular. Toda sugestão é revisada e aprovada por um
  profissional humano antes de virar registro permanente.
- O conteúdo do registro da sessão é enviado ao provedor de IA identificado
  na seção 6.
- Nenhuma decisão sobre o tratamento é tomada **unicamente** com base em
  tratamento automatizado; havendo decisão desse tipo no futuro, cabe
  pedido de revisão (**LGPD Art. 20**).

☐ **Consinto** com o uso de inteligência artificial, nos termos acima.
☐ **Não consinto.** (O acompanhamento continua normalmente; apenas a
estruturação assistida por IA não será usada.)

## 10. Transferência internacional de dados

Quando o provedor de inteligência artificial identificado na seção 6 não
mantém infraestrutura no Brasil, o envio do conteúdo dos registros a esse
provedor configura **transferência internacional de dado sensível de
saúde**, com destino ao país ali indicado. A operação se apoia nas
garantias contratuais do **LGPD Art. 33, II, "b"** (cláusulas-padrão
contratuais) e no **consentimento específico e destacado** do **Art. 33,
VIII** — dado aqui, de forma distinta das demais finalidades. O provedor
não retém o conteúdo além do necessário para gerar a resposta.

☐ **Consinto** com a transferência internacional descrita acima.
☐ **Não consinto.** (Se o provedor contratado não mantiver infraestrutura
no Brasil, esta recusa tem o mesmo efeito prático da recusa da seção 9. O
acompanhamento continua normalmente.)

## 11. Exportação e compartilhamento de relatórios

O curador declara estar ciente de que a clínica pode gerar e **exportar**
relatórios sobre o acompanhamento, e de que:

- Toda exportação é registrada na trilha de auditoria antes de ser
  liberada.
- O Iris fornece a ferramenta de exportação; não envia dado diretamente a
  convênio ou a terceiro por conta própria.
- Fora das hipóteses previstas em lei, nenhum dado é compartilhado com
  terceiros, e **nunca** para publicidade ou venda.

Autorizo, separadamente:

☐ **Exportação de relatório para a operadora de plano de saúde do titular**,
no contexto do atendimento.
☐ **Não autorizo.** (Sem esta autorização a clínica não poderá encaminhar
relatórios ao convênio, o que pode inviabilizar reembolso ou autorização de
sessões.)

☐ **Exportação para terceiro por mim indicado**, por escrito e caso a caso.
☐ **Não autorizo.**

## 12. Por quanto tempo os dados serão mantidos

Os dados serão mantidos pelo prazo de **10 (dez) anos contados do último
atendimento**, observados os prazos mínimos de guarda de prontuário
exigidos pelo conselho profissional. **A revogação dos consentimentos das
seções 9, 10 e 11 não apaga o prontuário** enquanto durar esse prazo legal
de guarda — ver seção 14.

## 13. Autonomia do titular

O titular sob curatela **não perde** o direito de participar das decisões
sobre o próprio cuidado. A curatela é medida extraordinária, restrita aos
atos de natureza patrimonial e negocial (**Lei 13.146/2015, Art. 85**;
**Código Civil, Arts. 1.767 e seguintes, e Art. 1.772**), e a deficiência
não afeta, por si só, a plena capacidade civil (**Lei 13.146/2015,
Art. 6º**).

Por isso:

- O conteúdo deste termo é apresentado ao titular **em linguagem
  acessível**, no formato que ele compreenda.
- O titular participa da decisão **na medida do seu discernimento**, e sua
  manifestação é registrada no prontuário.
- Havendo discernimento para tanto, o titular assina **também**, no campo
  próprio da seção 16.
- Manifestação contrária do titular quanto às finalidades facultativas das
  seções 9, 10 e 11 deve ser respeitada. Essas finalidades são dispensáveis
  ao cuidado; impô-las contra a vontade expressa do titular não se justifica.

## 14. Direitos, e como revogar os consentimentos deste termo

A qualquer momento, **por procedimento gratuito e facilitado** (**LGPD
Art. 8º, § 5º**), pelo canal indicado na seção 6: confirmar a existência de
tratamento, acessar os dados, corrigi-los, solicitar anonimização ou
eliminação, solicitar portabilidade, obter informação sobre
compartilhamentos, e **revogar os consentimentos das seções 9, 10 e 11**.
Cabe também petição à **ANPD** (**Art. 18, § 1º**).

A revogação vale **para o futuro**: ficam ratificados os tratamentos já
realizados enquanto o consentimento vigorava, ressalvado o direito de
requerer eliminação nos termos do **Art. 18, VI**, respeitado o prazo legal
de guarda da seção 12.

Revogado o consentimento de uma finalidade, cessa **aquela** finalidade.
Revogado o consentimento de **regime** desta curatela, e não havendo outro
consentimento de regime vigente, o prontuário passa a **somente-leitura**:
não se registram novas sessões nem diário, não há extração por IA nem
exportação. A **leitura permanece**, para fiscalização dos conselhos e
transferência de prontuário. O estado é reversível: novo consentimento de
regime destrava o prontuário.

## 15. Limites do sigilo

O sigilo profissional é a regra, e comporta duas ordens distintas de
exceção:

1. **Quebra por ponderação do profissional**, prevista na legislação e nos
   códigos de ética profissionais, restrita ao mínimo necessário e ao menor
   prejuízo — por exemplo, risco iminente à vida.
2. **Comunicação obrigatória do serviço de saúde a autoridade pública**,
   que independe de concordância e não comporta ponderação — notadamente o
   registro de tentativa de suicídio ou de autolesão, de notificação
   compulsória à vigilância epidemiológica (**Lei 13.819/2019**), e o
   registro de violência contra a mulher, de comunicação compulsória à
   autoridade competente (**Lei 10.778/2003** e **Lei 13.931/2019**).
   Comunica-se o **fato** à autoridade competente, preservando-se o
   conteúdo do prontuário que não seja estritamente necessário.

> **Nota de produto (não vai para o papel assinado):** o Iris **nunca**
> notifica família, curador, SAMU, Conselho Tutelar ou qualquer terceiro
> externo por conta própria — o alerta de risco é interno à equipe clínica,
> e as notificações compulsórias do item 2 são dever do profissional e do
> estabelecimento, executadas fora do sistema. Nenhuma frase deste termo
> pode sugerir notificação automática pelo software. Base:
> `parecer-juridico-duty-to-warn.md`.

## 16. Declaração e assinatura

O curador declara que leu e compreendeu este termo, que teve oportunidade
de esclarecer dúvidas, que recebeu uma via, que apresentou o conteúdo ao
titular em linguagem acessível, e que o consentimento é dado de forma livre
e informada, nos limites do instrumento de curatela identificado na
seção 6.

Declara ainda estar ciente de que **as autorizações das seções 9, 10 e 11
são facultativas**, podem ser dadas ou recusadas separadamente, podem ser
revogadas a qualquer tempo, e que **a recusa de qualquer delas não afeta o
acesso ao atendimento nem a qualidade do cuidado prestado** — ressalvado o
efeito prático informado em cada seção.

- **Nome do curador(a):** ____________________________________________
- **CPF:** ____________________
- **Instrumento de curatela:** _______________________________________
- **Data:** ____ / ____ / ________
- **Assinatura do curador(a):** ______________________________________

Participação do titular (preencher sempre):

- ☐ O titular manifestou concordância. ☐ O titular manifestou discordância
  quanto às finalidades facultativas. ☐ O titular não pôde manifestar-se.
- **Assinatura do titular, quando houver discernimento para tanto:**
  ______________________________________________

- **Profissional/recepção que colheu o consentimento:** _______________
- **Versão do termo:** `curatela-v1`

---

## Estado das pendências

### ⛔ Gates de impressão — por clínica, antes da primeira assinatura

- **Seção 6** — razão social, CNPJ e endereço da clínica-contratante;
  canal para exercício de direitos; encarregado (DPO).
- **Seção 6** — identificação do instrumento de curatela e leitura do seu
  alcance. Sem isso o termo não pode ser colhido nem gravado (constraint de
  banco).
- **Seções 6 e 10** — nome do provedor de IA efetivamente contratado e país
  onde o processamento ocorre. Sem esse dado o consentimento da seção 10
  **não é específico** e portanto não é válido.
- **Seção 10** — DPA com o provedor assinado; numeração e vigência da
  resolução da ANPD sobre cláusulas-padrão conferidas em fonte primária
  (DOU / site da ANPD); definição de quem figura como parte nas cláusulas —
  a clínica (controladora) ou o Iris (operador). Mesma pendência do termo
  adulto.

### Implementado

- Valor de enum `representacao_curador` e coluna
  `instrumento_representacao`, com constraint exigindo curador **e**
  instrumento juntos (migrações `0052`/`0053`).
- Revogação registrável e estado de somente-leitura reversível
  (`procedimento-revogacao-consentimento.md`;
  `docs/arquitetura/ciclo-de-vida-do-prontuario.md`).

---

## Método de validação deste documento

Este documento foi redigido para ser lido pelo advogado do projeto. Pelo
protocolo acordado com o responsável pelo produto, **texto lido sem
apontamentos até o fim da sessão é dado por alinhado**. Por isso toda
questão jurídica aparece aqui como **resposta afirmativa única**, com
fundamento e efeito no sistema — nunca como pergunta aberta, que silêncio
não ratifica.

Data desta versão: **29/07/2026**. Se vierem apontamentos, o texto passa a
`curatela-v2` e exige nova coleta de assinatura (seção 3).
