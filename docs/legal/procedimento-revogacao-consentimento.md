# Procedimento de Revogação de Consentimento — Iris

**Versão `revogacao-v1`.** Redigido em 29/07/2026 para a issue #133,
junto com a implementação do evento de revogação (migrações `0052`/`0053`).

> **Este identificador vai para o banco.** Toda linha de revogação gravada
> na tabela `consent` leva `versao_termo = 'revogacao-v1'`. Existe uma
> constraint no banco (`consent_versao_termo_por_tipo`) que só aceita
> `versao_termo` começando por `revogacao-` quando o tipo é
> `revogacao_consentimento`, e o proíbe nos demais tipos. Mudança de mérito
> neste procedimento exige identificador novo (`revogacao-v2`, …) — nunca
> edição silenciosa deste texto.

Complementa `termo-consentimento-titular-adulto.md` (§13),
`termo-consentimento-curatela.md`, `politica-privacidade.md` e
`politica-retencao-dados.md`. Descreve o comportamento real implementado —
não uma intenção.

- **Operador:** Iris — **R Sutil Correa Ltda**, CNPJ **29.811.201/0001-50**.
- **Controladora:** a clínica-contratante.

---

## 1. Quem pode revogar

| Regime do paciente | Quem assina a revogação |
| :--- | :--- |
| Menor de 18 anos | O pai, a mãe ou o responsável legal que consta como signatário — ou outro responsável legal do menor |
| Adulto sob curatela | O curador, mediante o mesmo instrumento de curatela registrado na concessão |
| Adulto capaz | O próprio titular |
| Adolescente emancipado | O próprio titular |

O pedido pode ser feito à clínica por qualquer meio — presencialmente, por
escrito, pelo canal de exercício de direitos indicado no termo assinado. A
clínica registra o evento no Iris.

## 2. É gratuito e facilitado

A revogação é feita **por procedimento gratuito e facilitado**, como exige
o **Art. 8º, § 5º, da LGPD**. Não há cobrança, não há formulário próprio
obrigatório, não há exigência de comparecimento presencial, e não se pode
condicionar a revogação à justificativa de motivo. Pedir o motivo é
admissível como registro; **exigir** o motivo como condição não é.

## 3. O que a revogação faz — e o que ela não faz

A revogação vale **para o futuro**. Ficam **ratificados** os tratamentos
realizados enquanto o consentimento vigorava (**Art. 8º, § 5º**). A
revogação não torna ilícito, retroativamente, nada do que foi feito antes.

**Revogação não é eliminação.** São dois direitos distintos:

- **Revogar** (Art. 8º, § 5º) faz cessar o tratamento que dependia daquele
  consentimento, dali para frente.
- **Eliminar** (Art. 18, VI) é pedido separado, e **não alcança** os dados
  cuja guarda é exigida por obrigação legal ou regulatória — **Art. 16, I**
  da LGPD. O prontuário clínico está exatamente nessa hipótese: sua guarda
  é dever do profissional perante o seu conselho de classe (CFP, CFFa,
  COFFITO). Por isso o prontuário **permanece** durante o prazo de guarda
  informado no termo assinado (10 anos contados do último atendimento) e
  **não é apagado** por efeito da revogação.

Também permanecem, e pelo mesmo motivo, os registros de acesso ao sistema
(**Marco Civil da Internet, Lei 12.965/2014, Art. 15** — mínimo de 6 meses)
e a trilha de auditoria.

## 4. Efeito por regime — o que cessa e o que continua

O efeito da revogação depende de **qual consentimento** foi revogado, e de
**qual base legal** sustentava o registro clínico daquele paciente.

### 4.1 Revogação de uma finalidade específica

Revogar a finalidade de **uso de IA** (`uso_ia_processamento`) ou de
**exportação de relatórios** (`exportacao_relatorios`) faz cessar **apenas
aquela finalidade**. O prontuário continua ativo, as sessões continuam
sendo registradas, o acompanhamento continua normalmente.

Isso é consequência direta do desenho: a revogação aponta para **um**
consentimento concreto, e o seu escopo é exatamente o consentimento
apontado. Revogar a IA não derruba o prontuário.

### 4.2 Revogação do consentimento de regime — paciente menor ou sob curatela

Aqui o consentimento do responsável legal ou do curador é o que sustenta o
tratamento. Revogado esse consentimento, e **não havendo nenhum outro
consentimento de regime vigente** para o paciente, o prontuário passa a
**somente-leitura**:

- **Cessam:** registro de novas sessões e de diário, extração assistida por
  IA, geração e exportação de relatórios, e qualquer novo processamento
  clínico.
- **Continua:** a **leitura** integral do prontuário. Isso é deliberado —
  a leitura precisa permanecer para fiscalização dos conselhos de classe e
  para transferência de prontuário a outro profissional. Bloquear a leitura
  criaria descumprimento de outro dever.

Fundamento: `aditivo-especificacoes-legais.md` §1.2, e LGPD Arts. 15, 16, I
e 18.

### 4.3 Revogação do consentimento de regime — adulto capaz ou emancipado

Diferente, e por uma razão de base legal. Para o adulto, o registro clínico
do atendimento **não se apoia no consentimento** — apoia-se na **tutela da
saúde, em procedimento realizado por profissionais e serviços de saúde
(LGPD Art. 11, II, "f")**, e o registro em prontuário é exigido do
profissional pelo seu conselho. Consentimento sustenta só as finalidades
das seções 8, 9 e 10 do termo adulto.

Portanto, revogado o autoconsentimento do adulto:

- **Cessam:** estruturação assistida por IA (§8), transferência
  internacional ao provedor de IA (§9) e exportação de relatórios (§10).
- **Continua:** o registro clínico do atendimento em curso — sessões e
  diário seguem sendo registrados —, e continua a leitura.

Aplicar ao adulto o mesmo bloqueio do menor seria erro jurídico: negaria ao
paciente o atendimento que ele continua tendo direito de receber, com base
numa hipótese legal que ele não pode revogar porque nunca foi a dele.

### 4.4 Matriz resumida

| Regime | Sessão / diário | Extração por IA | Exportação de relatório | Leitura |
| :--- | :--- | :--- | :--- | :--- |
| Menor (regime revogado, sem outro vigente) | cessa | cessa | cessa | **continua** |
| Curatelado (regime revogado, sem outro vigente) | cessa | cessa | cessa | **continua** |
| Adulto capaz (autoconsentimento revogado) | **continua** | cessa | cessa | **continua** |
| Emancipado (autoconsentimento revogado) | **continua** | cessa | cessa | **continua** |
| Qualquer regime, revogada só a finalidade de IA | continua | cessa | continua | continua |
| Qualquer regime, revogada só a exportação | continua | continua | cessa | continua |

## 5. A revogação é reversível

Somente-leitura **não é estado terminal**. Basta um **novo consentimento de
regime** — linha nova em `consent`, assinada por quem tem legitimidade —
para o prontuário voltar a aceitar registro. Casos práticos:

- A família reconsidera e reassina o termo de menor: destrava.
- O paciente completa 18 anos e passa a autoconsentir por si: destrava.
  É o desfecho normal da transição descrita em
  `termo-consentimento-titular-adulto.md` §4.
- Nova curatela é constituída ou o curador reassina: destrava.

Nada disso é edição do registro antigo. É sempre linha nova.

## 6. O que fica registrado

A revogação é gravada como uma **linha nova** na tabela `consent`:

- `tipo = 'revogacao_consentimento'`;
- `consent_revogado_id` apontando para **o consentimento revogado** — é
  este ponteiro que define o escopo da revogação;
- `versao_termo = 'revogacao-v1'`;
- data/hora do evento e quem registrou.

**O consentimento original nunca é editado nem apagado.** A tabela
`consent` é append-only por privilégio de banco
(`REVOKE UPDATE, DELETE ON consent FROM app_role`). O histórico completo —
o que foi consentido, quando, por quem, e quando foi revogado — permanece
íntegro e auditável. Isso é o que permite provar, mais tarde, que o
tratamento realizado no período anterior estava respaldado.

Garantias adicionais do banco, para que o registro não possa afirmar coisa
falsa:

- uma revogação **precisa** apontar um consentimento; uma concessão **não
  pode** apontar nenhum;
- o consentimento apontado tem que ser **do mesmo paciente** (chave
  composta `UNIQUE (id, patient_id)` e auto-FK composta);
- não se revoga uma revogação, e nenhuma linha aponta para si mesma.

## 7. Direitos que continuam disponíveis após a revogação

Revogar não consome os demais direitos do **Art. 18** da LGPD:
confirmação da existência de tratamento, acesso, correção, anonimização ou
bloqueio de dados desnecessários ou excessivos, portabilidade, informação
sobre compartilhamentos, e eliminação (Art. 18, VI) — esta última nos
limites do Art. 16, I, explicados na seção 3. O titular pode também
peticionar à **ANPD** (Art. 18, § 1º).

## 8. Onde o efeito é aplicado

O bloqueio de escrita do prontuário em somente-leitura é aplicado **no
banco de dados** — políticas de RLS e funções `SECURITY DEFINER` —, não na
camada de aplicação. A camada TypeScript espelha a regra apenas para
produzir mensagem de erro compreensível. Detalhe em
`docs/arquitetura/ciclo-de-vida-do-prontuario.md`.

⚠️ **EM ABERTO:** o Iris não envia comunicação automática ao provedor de IA
informando a revogação. A cessação se dá porque o Iris para de enviar
conteúdo. O provedor não retém o conteúdo além do necessário para gerar a
resposta, conforme o DPA a ser assinado — cuja verificação continua como
gate anterior à primeira coleta com titular real (`termo-consentimento-titular-adulto.md`,
"Gates de impressão").

---

## Método de validação deste documento

Este documento foi redigido para ser lido pelo advogado do projeto. Pelo
protocolo acordado com o responsável pelo produto, **texto lido sem
apontamentos até o fim da sessão é dado por alinhado**. Por isso toda
questão jurídica aqui aparece como **resposta afirmativa única**, com
fundamento e efeito no sistema — nunca como pergunta aberta, que silêncio
não ratifica.

Data desta versão: **29/07/2026**. Se vierem apontamentos, o texto passa a
`revogacao-v2` e o novo identificador é gravado nas revogações seguintes;
as linhas já gravadas com `revogacao-v1` permanecem como estão, porque
descrevem o procedimento vigente no momento em que o evento ocorreu.
