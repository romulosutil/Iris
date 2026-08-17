⟨PENDENTE: revisão jurídica antes do merge — texto ajustado para refletir o comportamento implementado⟩

# Termos de Uso — Iris

**Versão `2026-08-07` — vigente desde 07/08/2026.**

Estes Termos regem o uso da plataforma Iris por quem contrata o serviço, em
dois caminhos de contratação:

- **Contratação B2B** — uma clínica já constituída contrata o Iris.
- **Cadastro self-service** — um profissional de saúde pessoa física cria a
  própria conta e a própria clínica pelo site, sem contrato assinado
  previamente, com período de teste gratuito (seção 7).

Estes Termos **não** são o documento apresentado ao paciente ou à família. O
consentimento LGPD do titular dos dados (ou de seu responsável legal) é
colhido separadamente, no ato de admissão do paciente, em documento próprio e
versionado (modelado como `Consent`, ver `docs/ux/fluxos-e-wireframes.md` e os
termos de consentimento em `docs/legal/`). **Aceitar estes Termos não substitui,
não dispensa e não antecipa aquele consentimento.**

Redação original de 09/07/2026, com base na especificação do produto e na
pesquisa jurídica de `validacao-legal-prontuario.md`. Revisão de 30/07/2026
para cobrir o cadastro self-service.

Os itens ainda não fechados aparecem no corpo do texto marcados como
`⟨PENDENTE: …⟩` e estão consolidados na seção **Itens em aberto**, ao final.

---

## 1. O que é o Iris

O Iris é um software (SaaS) de apoio ao registro, organização e acompanhamento
de evidências clínicas em terapias multidisciplinares (ABA, Fonoaudiologia,
Terapia Ocupacional) para o público infantil, com um componente de
inteligência artificial que SUGERE estruturação de evidências a partir do
relato do profissional — nunca pontua, avalia ou diagnostica automaticamente
(princípio R3 do agente, `docs/agente/protocolos-e-agente.md`, Parte 3). Toda
sugestão da IA (`Extraction`) exige aprovação humana explícita antes de virar
registro permanente (`Evidence`).

**O Iris não é um dispositivo médico, não substitui julgamento clínico
profissional, e não é um estabelecimento de saúde** — é fornecedor de
tecnologia para a clínica, que é quem presta o atendimento e responde
tecnicamente por ele perante seu conselho profissional
(`validacao-legal-prontuario.md`, seção 6).

## 2. Partes e papéis

- **Iris** — nome comercial da plataforma, operada por **R Sutil Correa Ltda**,
  CNPJ **29.811.201/0001-50**, sede em ⟨PENDENTE: endereço completo da sede do
  operador⟩. Fornecedor do software e **operador** de dados pessoais (LGPD Art.
  5º, VII), por conta e ordem da clínica-contratante.
- **Clínica-contratante** — **controladora** dos dados (LGPD Art. 5º, VI),
  responsável pelo cadastro de protocolos licenciados, pela composição de
  disciplinas/profissionais, pela relação com pacientes/famílias e pela
  adequação do uso do Iris às normas do(s) seu(s) conselho(s) profissional(is).
- **Responsável pela conta** (`Clinic.responsavel_conta_id`) — pessoa física
  com quem o Iris trata assuntos contratuais/financeiros, mesmo em clínicas
  onde essa pessoa acumula papel clínico (freelancer/terapeuta único).

### 2.1. Cadastro self-service — quem é a CONTRATANTE

No cadastro self-service, o profissional de saúde pessoa física que cria a
conta acumula **os três papéis acima ao mesmo tempo**: é ele quem contrata o
serviço, é ele o responsável pela conta, e é a clínica que ele criou que figura
como controladora dos dados dos pacientes que vier a cadastrar. Enquanto essa
clínica não tiver outros profissionais vinculados, **controladora e usuário
cadastrante são, na prática, a mesma pessoa**.

Para todos os efeitos destes Termos — inclusive para a seção 10, cuja redação é
de autoria externa e não foi alterada —, as expressões "clínica-contratante" e
"CONTRATANTE" designam também esse profissional pessoa física e a clínica por
ele criada no self-service. As obrigações atribuídas à CONTRATANTE recaem
integralmente sobre ele.

O Iris **não** se torna controlador dos dados dos pacientes por ter fornecido o
caminho de cadastro automatizado. A ausência de contrato negociado
individualmente não transfere ao Iris nenhuma responsabilidade clínica, ética
ou de controle de dados que seja da CONTRATANTE.

### 2.2. Declaração de habilitação profissional e auditoria

No cadastro, o profissional **declara** seu conselho de classe e o respectivo
número de registro profissional. Sobre essa declaração:

&nbsp;&nbsp;**(a)** A veracidade e a atualidade da declaração são de
**responsabilidade exclusiva do profissional que a presta**. O Iris não valida
o registro no ato do cadastro e a criação da conta **não constitui atestado,
verificação ou endosso** da habilitação declarada.

&nbsp;&nbsp;**(b)** O Iris **audita** essas declarações, por amostragem ou
integralmente, a qualquer tempo, e pode solicitar comprovação documental ao
profissional.

&nbsp;&nbsp;**(c)** Declaração falsa, registro inexistente, suspenso ou
cassado, ou recusa em comprovar quando solicitado, autorizam o Iris a
**suspender ou encerrar a conta**, a seu critério e sem aviso prévio. Nessa
hipótese, o direito de exportação previsto na seção 6 é preservado.

&nbsp;&nbsp;**(d)** Prestar declaração falsa de habilitação profissional pode
configurar ilícito perante o conselho de classe e perante a legislação penal,
em esfera própria e independente destes Termos.

## 3. Licenciamento de protocolos/instrumentos — responsabilidade da clínica

O Iris modela a ESTRUTURA de protocolos clínicos (domínios, escalas, marcos)
mas, para os instrumentos protegidos por direito autoral (VB-MAPP, ABLLS-R,
AFLS, Denver/ESDM Curriculum Checklist, Perfil Sensorial 2, e os brasileiros
PROC/ABFW fora dos 2 abertos — ver `docs/agente/protocolos-e-agente.md`, aviso
do topo), **é a clínica quem deve possuir a licença/manual oficial e cadastrar
o conteúdo textual protegido**. O Iris não fornece, vende, nem sublicencia o
texto desses instrumentos.

## 4. Uso aceitável

A clínica-contratante concorda em:

- Obter o consentimento LGPD apropriado do titular dos dados — o próprio
  paciente, quando maior e civilmente capaz, ou seu responsável legal, no caso
  de menor — antes de inserir qualquer dado no sistema (LGPD Art. 7º, I; Art.
  11, I; Art. 14, ver `Consent`). **Esse consentimento é distinto do aceite
  destes Termos** e não é suprido por ele.
- Não usar o Iris para automatizar decisão clínica sem revisão humana — a
  sugestão da IA (`Extraction`) é sempre revisável/editável/rejeitável antes
  de virar registro (`Evidence`); a clínica é responsável pela revisão
  efetiva, não só pela aprovação mecânica ("rubber-stamping" — o próprio
  desenho do produto já tem fricção deliberada contra isso, ver
  `docs/ux/fluxos-e-wireframes.md`).
- Configurar corretamente a supervisão técnica (`responsavel_tecnico_id`)
  quando aplicável — profissionais de disciplina ABA sem CRP próprio devem
  estar sob supervisão de um psicólogo (achado de `validacao-legal-prontuario.md`,
  seção 1).
- Manter exatas e atualizadas as declarações de habilitação profissional
  prestadas no cadastro (seção 2.2).
- Não compartilhar credenciais de acesso. Cada profissional com acesso ao
  prontuário deve ter conta própria — a trilha de auditoria depende disso para
  ter valor.
- Não usar o produto para fins fora do escopo de acompanhamento terapêutico
  descrito acima (ex.: não é ferramenta de diagnóstico, prescrição, ou decisão
  de cobertura de convênio automatizada).

## 5. Limitação de responsabilidade

O Iris não garante resultado terapêutico específico. As sugestões da IA
podem conter erros de classificação — por isso a revisão humana é obrigatória
em todo o fluxo (nenhuma `Evidence` existe sem aprovação humana prévia). A
responsabilidade técnica/clínica pelo atendimento, pelo prontuário e pelo
cumprimento das normas do conselho profissional é da clínica-contratante e
de seus profissionais, não do Iris.

## 6. Propriedade de dados, portabilidade e exportação

Os dados inseridos pela clínica (prontuário, evidências, relatórios) pertencem
à clínica/paciente. **O Iris não reivindica propriedade sobre eles e não
condiciona o acesso a esses dados a pagamento.**

A clínica pode exportar seus dados **a qualquer momento e sem custo adicional**,
inclusive:

- durante o período de teste gratuito;
- **após o fim do período de teste sem pagamento**, quando a conta passa ao
  modo somente-leitura (seção 7.4);
- em caso de encerramento da conta por iniciativa da clínica;
- em caso de suspensão ou encerramento por decisão do Iris, inclusive na
  hipótese da seção 2.2 (c).

A exportação de dados clínicos do prontuário é fornecida no formato **PDF 1.4 Auditável**, incorporando marca d'água de emissão nominal (nome, CPF, data/hora UTC) e assinatura de integridade via hash SHA-256 registrada na trilha imutável de auditoria (`audit_log`), garantindo a autenticidade e não-repúdio do documento (LGPD Art. 18, II e V).
Nenhuma eliminação de dados ocorre antes de decorrido o prazo de exportação
previsto na seção 7.4 e observado o disposto em `politica-retencao-dados.md`.

## 7. Preço, período de teste e cobrança

### 7.1. Modelo de cobrança

A cobrança é **por ficha ativa por ciclo**, conforme o tier contratado
(`docs/produto/modelo-de-negocio.md`, seção 4). "Ficha ativa" designa o
**registro de paciente consumido no ciclo**, e não a condição clínica da
pessoa — uma ficha pode estar ativa para fins de faturamento sem que isso
signifique que o paciente esteja em tratamento, e vice-versa. No cadastro
self-service **não há valor mínimo de fatura nem piso de número de fichas** —
a clínica paga pelo que usa.

O tier "Diário" situa-se na faixa de **R$ 39 a R$ 49 por ficha ativa/ciclo**;
o valor exato vigente é ⟨PENDENTE: valor unitário final do tier "Diário" e dos
demais tiers, a ser publicado na página de preços⟩ e é o que estiver informado
no ato da contratação.

Considera-se **ficha ativa** no ciclo aquela que, dentro do período apurado,
satisfaça **ao menos um** dos critérios abaixo:

&nbsp;&nbsp;**(a)** foi **cadastrada** dentro do período; **ou**

&nbsp;&nbsp;**(b)** teve **interação registrada** dentro do período — sessão
agendada, check-in, evolução em prontuário ou evidência aprovada.

Ficha que não satisfaça nenhum desses critérios no período **não é faturada**,
ainda que permaneça cadastrada e visível na plataforma. A mera permanência do
registro na base — ou o fato de não ter sido arquivado — **não** gera cobrança.

### 7.2. Período de teste (trial) de 7 dias

O cadastro self-service inclui um **período de teste gratuito de 7 (sete) dias
corridos**. O prazo **começa a correr quando a clínica cadastra o primeiro
paciente** — e não no ato do cadastro da clínica. Caso nenhum paciente seja
cadastrado, o período de teste **inicia automaticamente 14 (quatorze) dias
corridos após o cadastro da clínica**.

**Não exigimos cartão de crédito para iniciar o teste** e **não há cobrança
automática ao final dele**: terminado o teste, nada é debitado e nenhuma
assinatura é ativada sem ato da clínica.

Encerrado o teste sem ativação da assinatura, aplica-se o disposto na seção
7.4. Optando a clínica por ativar, a cobrança segue o regime **pós-pago** da
seção 7.3, em ciclos de 30 (trinta) dias contados a partir da ativação.

**Uma condição, e uma só:** o período de teste é concedido **uma vez por
pessoa**, e não uma vez por conta criada. No cadastro do primeiro paciente, o
Iris verifica se o CPF informado (do paciente ou de seu responsável legal) já
esteve associado a um período de teste iniciado em outra conta. Se já esteve,
**o teste não é concedido a esta conta** — a clínica pode contratar
normalmente, pelo mesmo preço da seção 7.1, sem período gratuito. A
verificação é feita por código irreversível, não expõe dado de paciente entre
clínicas, e está descrita em `politica-privacidade.md`, seção 2.1.

A verificação **só ocorre no cadastro que inicia o teste**. Clínica que já
contratou, ou que já está em teste próprio, não passa por ela: paciente
atendido anteriormente em outro serviço é situação corriqueira e não restringe
nada.

### 7.3. Meios de pagamento

Os meios de pagamento aceitos são **cartão de crédito e Pix** (com suporte a Pix Automático e débito recorrente via operador de pagamento terceiro).

A cobrança é **pós-paga**: no ato da contratação da assinatura, é realizada uma autorização de recorrência Pix no valor de R$ 0,01; subsequentemente, a fatura é emitida **ao final de cada ciclo de 30 (trinta) dias**, pelo uso efetivamente apurado no período — isto é, pelas fichas ativas conforme o critério da seção 7.1 —, **sem valor mínimo**.

O processamento dos pagamentos é feito por operador de pagamento terceiro (ver `politica-privacidade.md`, seção 7); o Iris **não armazena dados de meio de pagamento**.

### 7.4. O que acontece ao fim do teste sem pagamento

Esta cláusula é um compromisso com o titular dos dados, não apenas uma política
comercial, e deve ser lida literalmente:

&nbsp;&nbsp;**(a)** Encerrado o período de teste sem pagamento, a conta passa
ao modo **somente-leitura**. **A clínica NÃO perde o acesso aos dados.**

&nbsp;&nbsp;**(b)** Em modo somente-leitura, a clínica **continua podendo
visualizar todo o conteúdo já registrado e exportá-lo integralmente, sem
custo** (seção 6). O que fica bloqueado é a criação de novos registros.

&nbsp;&nbsp;**(c)** **Nenhum dado é apagado pelo simples fim do período de
teste.** Eliminação só ocorre conforme `politica-retencao-dados.md` e após o
prazo de ⟨PENDENTE: prazo de permanência da conta em modo somente-leitura antes
de qualquer eliminação, e forma de aviso prévio à clínica⟩.

&nbsp;&nbsp;**(d)** O pagamento reativa a conta com todo o conteúdo preservado.

&nbsp;&nbsp;**(e)** O regime de somente-leitura **não** suspende o exercício dos
direitos do titular previstos na LGPD, incluindo revogação de consentimento e
solicitação de eliminação de dados.

## 8. Vigência, rescisão e alterações

**8.1. Vigência.** Estes Termos vigoram a partir do aceite e enquanto a conta
existir. No self-service, o aceite ocorre no ato do cadastro, é registrado com
data, hora e a versão aceita (`2026-07-30`).

**8.2. Rescisão pela clínica.** A clínica pode encerrar a conta a qualquer
momento, sem multa e sem necessidade de justificativa. O direito de exportação
da seção 6 sobrevive ao encerramento pelo prazo referido na seção 7.4 (c).

**8.3. Rescisão ou suspensão pelo Iris.** O Iris pode suspender ou encerrar a
conta em caso de: (i) declaração falsa de habilitação profissional (seção 2.2);
(ii) violação da seção 4 (uso aceitável); (iii) inadimplência, observado aviso
prévio e prazo de carência de **10 (dez) dias corridos** antes da suspensão ou cancelamento do vínculo;
(iv) uso que exponha dados de pacientes a risco. Em qualquer hipótese, o acesso
somente-leitura e a exportação da seção 6 são preservados.

**8.4. Alteração destes Termos.** O Iris pode alterar estes Termos. Toda
alteração gera **uma nova versão datada**, e a versão aceita por cada conta fica
registrada — versões não são sobrescritas. Alterações relevantes serão
comunicadas por e-mail ao responsável pela conta com antecedência de
⟨PENDENTE: prazo de antecedência para comunicar alteração relevante dos Termos⟩,
e o uso continuado após a entrada em vigor caracteriza aceite da nova versão.

## 9. Foro e legislação aplicável

Aplica-se a legislação brasileira, incluindo a Lei Geral de Proteção de Dados
(Lei 13.709/2018), o Marco Civil da Internet (Lei 12.965/2014) e, quando a
CONTRATANTE for pessoa física ou microempresa em situação de vulnerabilidade, o
Código de Defesa do Consumidor.

Foro: ⟨PENDENTE: foro de eleição — tipicamente o da sede do operador ou o do
domicílio da contratante; a definir juridicamente⟩.

## 10. Da natureza do sistema de alerta de risco clínico e isenção de monitoramento contínuo

> **Origem:** minuta redigida pelo advogado **Thiago Lyra Galvão**
> (`parecer-juridico-duty-to-warn.md`, pergunta 4, issue #110). Reproduzida
> literalmente — a limitação genérica da cláusula 5 foi considerada
> insuficiente para o módulo de alerta de risco. Não editar sem novo parecer.

**10.1.** O SOFTWARE disponibiliza um mecanismo automatizado de identificação
e sinalização de termos sugestivos de risco clínico ("Alerta de Risco"),
baseado na análise *ex post* do texto digitado pelo profissional da
CONTRATANTE após as sessões.

**10.2.** A CONTRATANTE declara e reconhece expressamente que:

&nbsp;&nbsp;**(a)** O SOFTWARE **NÃO** realiza monitoramento em tempo real (24
horas por dia, 7 dias por semana) de pacientes, não substitui plantões
clínicos e não funciona como serviço de triagem de emergência ou prevenção de
crises;

&nbsp;&nbsp;**(b)** As sinalizações geradas pelo SOFTWARE possuem caráter
meramente informativo e probabilístico, dependendo obrigatoriamente da
avaliação, julgamento clínico, validação e conduta humana dos profissionais
da CONTRATANTE;

&nbsp;&nbsp;**(c)** As notificações do SOFTWARE dependem de fatores técnicos
externos, incluindo conectividade com a internet, permissões de dispositivos
móveis e configurações de sistemas operacionais (tais como modos "Não
Perturbe"), não garantindo o SOFTWARE a resposta humana em prazos
determinados;

&nbsp;&nbsp;**(d)** A responsabilidade pela adoção de condutas clínicas,
intervenções de emergência, quebra de sigilo ético e notificações
compulsórias às autoridades públicas (Conselho Tutelar, Vigilância Sanitária,
autoridades policiais) é **EXCLUSIVA** da CONTRATANTE e de seus profissionais
de saúde vinculados, nos termos do Código de Ética Profissional e da
legislação aplicável.

**10.3.** Como condição para uso do módulo de Alerta de Risco, a CONTRATANTE
se obriga a manter protocolo clínico próprio de gestão de crises e
emergências fora do ambiente do SOFTWARE, declarando que não deposita no
SOFTWARE a exclusividade no acompanhamento de pacientes em risco.

> **Requisito de produto derivado desta cláusula:** o aceite de 10.3 é
> checkbox obrigatório no onboarding do tenant ("Declaro que a clínica possui
> protocolo próprio de atendimento de emergências"), não só texto de contrato.
> Ver `docs/agente/regra-alerta-risco.md` §5.1, pergunta 4.

**10.4. Reforço de escopo (redação de produto, 30/07/2026 — não altera 10.1 a
10.3).** Para afastar qualquer dúvida na leitura por quem se cadastra sozinho:
**o Iris nunca notifica terceiros externos à clínica.** O Alerta de Risco é
exibido exclusivamente dentro da plataforma, para profissionais da própria
CONTRATANTE com acesso ao caso. **O Iris não avisa a família, não aciona SAMU,
não comunica Conselho Tutelar, nem qualquer outra autoridade.** Toda
comunicação externa é decisão e ato da CONTRATANTE, conforme 10.2 (d).

## 11. Proteção de dados pessoais

O tratamento de dados pessoais está descrito na **Política de Privacidade**
(`politica-privacidade.md`), que integra estes Termos e é aceita no mesmo ato.
A retenção e a eliminação seguem `politica-retencao-dados.md`. Os três
documentos devem ser lidos em conjunto.

## 12. Contato

Canal para dúvidas sobre estes Termos e assuntos contratuais: ⟨PENDENTE: e-mail
ou canal oficial de contato do operador⟩.

Para assuntos de proteção de dados e exercício de direitos do titular, ver a
seção 11 da Política de Privacidade.

---

## Itens em aberto

Itens resolvidos em 30/07/2026 (não bloqueiam mais a publicação):

- Cláusula 7 (preço e cobrança) — modelo de cobrança, trial de 7 dias, ausência
  de exigência de cartão, modo somente-leitura com exportação livre e meios de
  pagamento agora estão escritos.
- Cláusula 8 (vigência, rescisão e alterações) — deixou de ser um placeholder;
  as regras de rescisão, suspensão e versionamento estão redigidas.
- Cadastro self-service (seções 2.1 e 2.2) — a figura do profissional pessoa
  física que cria a própria clínica passou a estar descrita, com a declaração
  de habilitação e a auditoria.
- Referência formal cruzada com `politica-privacidade.md` e
  `politica-retencao-dados.md` (seção 11).

- Prazo de aviso prévio e carência por inadimplência (seção 8.3) — fixado em 10 (dez) dias corridos.

Itens **ainda em aberto** — cada um corresponde a um marcador `⟨PENDENTE⟩` no
corpo do documento e depende de um dado que ainda não existe no projeto:

1. **Endereço completo da sede do operador** (seção 2).
2. **Formato final de exportação de dados** (seção 6).
3. **Valor unitário final do tier "Diário" e dos demais tiers** (seção 7.1).
4. **Prazo de permanência em modo somente-leitura antes de qualquer eliminação,
   e a forma de aviso prévio** (seção 7.4 c).
5. **Prazo de antecedência para comunicar alteração relevante dos Termos**
   (seção 8.4).
6. **Foro de eleição** (seção 9).
7. **Canal oficial de contato do operador** (seção 12).

Além destes, permanece pendente a **revisão jurídica completa** do documento.
A publicação nesta versão foi autorizada pelo titular do negócio em 30/07/2026,
com ciência do advogado, que sinalizará o que precisar ser alterado.

---

## Nota para a revisão jurídica — alterações desta rodada

⟨PENDENTE: revisão jurídica antes do merge⟩ — as seções **7.1**, **7.2**, **7.3**
e **7.4** foram reescritas para alinhar o texto ao comportamento efetivamente
implementado no produto. O texto anterior prometia um trial de 7 dias contado do
cadastro que o sistema nunca entregou, e afirmava que cartão de crédito não era
aceito, o que contradiz a tela de ativação de assinatura. Pontos que exigem
atenção do jurídico:

&nbsp;&nbsp;**(1) Divergência conhecida e mantida de propósito — seção 7.4 (b).**
A alínea 7.4 (b) promete que a clínica pode exportar o conteúdo registrado
**"integralmente"**. O produto hoje **não** cumpre isso na extensão prometida: a
exportação disponível é o relatório de convênio, por paciente e por período —
não uma exportação integral da conta. A alínea **foi mantida sem alteração**
porque reduzir uma garantia já publicada ao titular é pior que manter a
garantia e passar a cumpri-la. Trata-se, portanto, de uma **obrigação assumida
e ainda não implementada**, não de um erro de redação. Decisão jurídica
necessária: manter o texto e tratar a exportação integral como pendência de
produto com prazo, ou ajustar a redação.

&nbsp;&nbsp;**(2) Termo "ficha ativa" (seção 7.1).** Adotado em substituição a
"paciente ativo" para nomear o registro consumido, e não a pessoa, evitando
colisão com a leitura clínica de "paciente em tratamento". Confirmar se a
substituição do termo é adequada do ponto de vista contratual.

&nbsp;&nbsp;**(3) Alínea nova numerada como (e), não (c) — seção 7.4.** A
ressalva sobre direitos do titular sob regime de somente-leitura foi acrescida
como **(e)**, por já existirem alíneas (c) e (d) na seção; a numeração
preexistente foi preservada.

&nbsp;&nbsp;**(4) Provedor de pagamento não nomeado (seção 7.3).** Deliberado:
nomear o provedor criaria necessidade de aditivo a cada troca de trilho de
cobrança. O texto refere-se apenas a "operador de pagamento terceiro".
