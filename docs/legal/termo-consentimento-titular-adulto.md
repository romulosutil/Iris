# Termo de Consentimento para Tratamento de Dados — Titular Adulto — Iris

**Status: RASCUNHO de produto, pendente de revisão por advogado antes de
publicação.** Redigido em 28/07/2026 para fechar a issue #129. Preenche um
buraco real: todo o texto legal existente do projeto pressupõe responsável
legal assinando por paciente menor de idade (LGPD Art. 14), e não existia
termo para o titular adulto capaz que consente por si (LGPD Art. 7º, I e
Art. 11, I). Complementa `politica-privacidade.md`,
`politica-retencao-dados.md` e `termos-de-uso.md` — os quatro documentos
devem ser lidos e revisados juntos. Base técnica em
`.specs/features/consentimento-titular-adulto/spec.md` (issue #100) e demanda
de produto em #98 (Terapia Convencional) e #99 (TCC).

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
continua sendo o caminho de paciente menor com responsável legal
(`src/db/schema.ts`, migrações `0050`/`0051`).

## 2. A quem este termo NÃO se aplica

Três casos ficam **explicitamente fora** deste termo. Nenhum deles deve ser
cadastrado usando esta minuta:

1. **Paciente menor de 18 anos.** Continua sob o regime do Art. 14 da LGPD —
   consentimento específico e destacado de pelo menos um dos pais ou
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
- **Operador:** Iris, plataforma de prontuário e gestão clínica, que trata
  os dados por conta e ordem da clínica, exclusivamente para prestar o
  serviço contratado (`termos-de-uso.md`, `politica-privacidade.md` seção 3).
- **Titular:** [Nome completo], [CPF], [data de nascimento].
- **Canal para exercício de direitos:** [Pendente — e-mail/canal de contato
  da clínica, a definir antes da publicação.]
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

Consinto, de forma **livre, informada, específica e destacada**, com o
tratamento dos meus dados para as finalidades abaixo:

1. **Registro e condução do meu acompanhamento terapêutico** — prontuário,
   evolução das sessões, planejamento clínico.
2. **Organização do atendimento** — agenda, controle de frequência,
   comunicação com a clínica.
3. **Elaboração de relatórios clínicos** que eu ou a clínica venhamos a
   solicitar, inclusive para convênio, quando aplicável (seção 10).

Base legal: **consentimento do titular** (LGPD Art. 7º, I, para os dados
pessoais, e Art. 11, I, para os dados sensíveis de saúde). O tratamento
também se apoia, quando executado por profissional ou serviço de saúde, na
hipótese de **tutela da saúde** (LGPD Art. 11, II, "a"), e, para a guarda
do prontuário depois do fim do acompanhamento, no **cumprimento de
obrigação legal e regulatória** dos conselhos profissionais (LGPD Art. 16,
I) — ver seção 11.

> **Nota de produto (não vai para o papel assinado):** as seções 8, 9 e 10
> abaixo são finalidades que exigem consentimento **específico e separado**.
> No sistema, cada uma corresponde a um registro próprio de `Consent`
> (`uso_ia_processamento`, `exportacao_relatorios`), e não a um bloco único
> de "aceito tudo". O aceite em bloco descaracteriza o requisito de
> consentimento destacado do Art. 11, I.

## 8. Uso de inteligência artificial no processamento

Estou ciente de que a clínica utiliza, dentro do Iris, um modelo de
linguagem de terceiro para **sugerir** a estruturação das informações
registradas pelo profissional a partir do texto das sessões.

Declaro estar informado de que:

- A inteligência artificial **não diagnostica, não pontua e não decide
  nada** a meu respeito. Toda sugestão precisa ser revisada e aprovada por
  um profissional humano antes de virar registro permanente.
- O conteúdo do registro da sessão é enviado ao provedor de IA para esse
  processamento.
- Nenhuma decisão sobre o meu tratamento é tomada de forma exclusivamente
  automatizada. Tenho direito de solicitar revisão de decisões tomadas com
  apoio de tratamento automatizado (LGPD Art. 20).

☐ **Consinto** com o uso de inteligência artificial no processamento dos
meus registros, nos termos acima.
☐ **Não consinto.** (Estou ciente de que o acompanhamento continua
normalmente; apenas a estruturação assistida por IA não será usada nos meus
registros.)

## 9. Transferência internacional de dados

Estou ciente de que, quando o provedor de inteligência artificial não
mantém infraestrutura no Brasil, o envio do conteúdo dos meus registros a
esse provedor configura **transferência internacional de dado sensível de
saúde** (LGPD Art. 33), protegida por Cláusulas-Padrão Contratuais
(Resolução CD/ANPD nº 19/2024) e por acordo de processamento de dados com
o provedor, que não retém o conteúdo além do necessário para gerar a
resposta.

☐ **Consinto** com a transferência internacional descrita acima.
☐ **Não consinto.**

> **Pendência real:** confirmar os termos exatos do DPA com o provedor de
> IA efetivamente escolhido antes do piloto (`politica-privacidade.md`
> seção 4, `BACKLOG.md`). Enquanto o DPA não estiver assinado e conferido,
> esta seção não pode ser apresentada como fato consumado ao titular.

## 10. Exportação e compartilhamento de relatórios

Estou ciente de que a clínica pode gerar e **exportar** relatórios sobre o
meu acompanhamento, e de que:

- Toda exportação é registrada na trilha de auditoria antes de ser
  liberada.
- O compartilhamento com **operadora de plano de saúde/convênio** ocorre
  por decisão da clínica no contexto do meu atendimento; o Iris fornece a
  ferramenta de exportação, não envia dado diretamente ao convênio.
- Fora das hipóteses previstas em lei, nenhum dado meu é compartilhado com
  terceiros, e **nunca** para publicidade ou venda.

☐ **Consinto** com a exportação de relatórios para convênio/terceiros nas
condições acima.
☐ **Não consinto.**

## 11. Por quanto tempo os dados serão mantidos

Meus dados serão mantidos pelo prazo definido na política de retenção da
clínica, observados os prazos mínimos de guarda de prontuário exigidos
pelos conselhos profissionais. Estou ciente de que **a revogação do meu
consentimento não apaga imediatamente o prontuário** enquanto durar esse
prazo legal de guarda — ver seção 13 e `politica-retencao-dados.md`.

> **Pendência real:** `politica-retencao-dados.md` expressa o prazo default
> como `MAX(paciente completa 18 anos, alta + 10 anos)`, fórmula desenhada
> para paciente menor. Para titular que já é adulto na admissão, o primeiro
> termo da fórmula é inócuo e o prazo efetivo é `alta + 10 anos` — isso
> precisa ser dito de forma explícita na política de retenção, e o número
> confirmado com o advogado, antes deste termo ir para o papel.

## 12. Segurança

Estou ciente de que o acesso aos meus dados é controlado por papel
profissional, com isolamento entre clínicas no banco de dados, autenticação
com segundo fator e trilha de auditoria imutável de acessos, alterações e
exportações (`politica-privacidade.md`, seção 8).

## 13. Meus direitos, e como revogar este consentimento

Posso, a qualquer momento e sem custo, através da clínica: confirmar a
existência de tratamento, acessar meus dados, corrigi-los, solicitar
anonimização/eliminação (respeitado o prazo legal de guarda da seção 11),
solicitar portabilidade, obter informação sobre compartilhamentos, e
**revogar este consentimento**.

A revogação vale **para o futuro** — não invalida o tratamento já
realizado com base no consentimento enquanto ele vigorava (LGPD Art. 8º,
§5º e §6º). Revogado o consentimento, o prontuário deixa de receber novos
registros e passa a ser mantido apenas para cumprimento do prazo legal de
guarda.

> **Pendência real de implementação:** o estado "somente leitura, sem
> novos registros" após revogação (Read-Only Locked) está especificado em
> `aditivo-especificacoes-legais.md` e rastreado na issue #117, e **ainda
> não está implementado**. Este termo não deve ser apresentado a um titular
> real antes de a #117 estar fechada, sob pena de prometer um
> comportamento que o sistema não entrega.

## 14. Limites do sigilo

Estou ciente de que o sigilo profissional é a regra, e de que sua quebra
só ocorre nas hipóteses excepcionais previstas na legislação e nos códigos
de ética profissionais, mediante ponderação do profissional responsável —
nos termos da cláusula específica de alerta de risco do contrato de
prestação de serviço (`termos-de-uso.md`, cláusula 10, e
`parecer-juridico-duty-to-warn.md`).

> **Nota de produto:** o Iris **nunca** notifica família, SAMU, Conselho
> Tutelar ou qualquer terceiro externo por conta própria. O alerta de risco
> é interno à equipe clínica. Este termo não pode conter nenhuma frase que
> sugira notificação automática a terceiros.

## 15. Declaração e assinatura

Declaro que li e compreendi este termo, que tive oportunidade de esclarecer
dúvidas, que recebi uma via, e que meu consentimento é dado de forma livre
e informada.

- **Nome do titular:** ______________________________________________
- **CPF:** ____________________
- **Data:** ____ / ____ / ________
- **Assinatura:** ___________________________________________________

- **Profissional/recepção que colheu o consentimento:** _______________
- **Versão do termo:** `adulto-v1`

---

## Pendências antes deste documento valer como final

- **Revisão por advogado** — em especial das seções 7 (bases legais
  cumuladas: consentimento + tutela da saúde), 4 (transição menor→adulto,
  perguntas (a), (b) e (c)) e 13 (efeitos da revogação × prazo de guarda).
- **Seção 2, item 2 (curatela)** — decidir se vira termo próprio ou
  adaptação do termo de menor. Enquanto não decidido, adulto sob curatela
  não pode ser cadastrado por este caminho.
- **Seção 11** — explicitar em `politica-retencao-dados.md` o prazo
  aplicável ao titular já adulto na admissão, e confirmar o número.
- **Seção 9** — DPA com o provedor de IA assinado e conferido.
- **Seção 13** — issue #117 (Read-Only Locked) implementada.
- **Seções 5 e 15** — preencher razão social/CNPJ da clínica, canal de
  contato e encarregado.
- **`politica-privacidade.md`** — hoje descreve o público como "crianças e
  adolescentes" (seção 1) e a base legal apenas pelo Art. 14 (seção 2).
  Precisa de ajuste para cobrir titular adulto, senão os dois documentos se
  contradizem.

**Resposta do advogado:** ☐ Alinhado &nbsp;&nbsp; ☐ Ajustar: ___________
&nbsp;&nbsp; ☐ Precisa de parecer formal
