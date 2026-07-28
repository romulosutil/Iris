# **Parecer Jurídico e Regulatório — Duty to Warn e Alerta de Risco Clínico**

**Autor:** Thiago Lyra Galvão (advogado)

**Documento que originou a consulta:** `docs/legal/briefing-duty-to-warn.md`

**Onde as decisões deste parecer foram implantadas em spec:**
`docs/agente/regra-alerta-risco.md` §4.1 (nomenclatura dos prazos), §4.2.1
(estágio 2 — Opção B), §5 (respostas 1-5), §6 (copy diferenciada) ·
`docs/legal/termos-de-uso.md` cláusula 10 (minuta literal da seção 4 deste
parecer).

**Cliente / Produto:** Iris (SaaS B2B para Clínicas de Terapia)

**Objeto:** Validação jurídica do mecanismo de alerta de risco clínico, responsabilidade civil/ética do SaaS vs. clínica, e redação de salvaguardas contratuais (Issue \#110).

**Especialidade:** Direito Digital, SaaS B2B em Saúde, Regulação do CFP/ECA/LGPD e Responsabilidade Civil.

## **Executive Summary (Resumo Executivo para Produto e Engenharia)**

1. **Dever de Notificação Externa (Pergunta 1):** O levantamento do projeto está **100% correto**. Não existe no Brasil a doutrina do *Tarasoff* (dever do terapeuta de alertar ativamente a vítima potencial de terceiro), nem obrigação de quebra de sigilo para ideação suicida em adultos. Contudo, há **dever legal imperativo de notificação** para **violência/maus-tratos sofridos por criança ou adolescente** (ECA art. 13 e Lei 13.431/2017) e notificação compulsória sanitária/policial para violência contra a mulher e tentativas de suicídio (sob responsabilidade do *estabelecimento de saúde*).  
2. **Transferência de Responsabilidade para o SaaS (Pergunta 2):** **Opção B (Confirmada).** O Iris é mero **Operador de Dados / Provedor de Tecnologia**. Intermediar ou realizar automações de notificação externa a terceiros (família, polícia, SAMU) fora do ambiente da clínica criaria uma responsabilidade civil direta (*duty of care* ex-delicto e por defeito do serviço) imensa para o Iris. O **Estágio 2 de escalonamento deve ser estritamente interno à clínica-cliente**.  
3. **Prazos / SLAs (Pergunta 3):** Não existe no Brasil qualquer prazo de SLA legal para resposta clínica em crise. Os prazos de 15m, 1h e 4h são **excelentes parâmetros de software**, mas devem ser denominados estritamente como **"SLA de Escalonamento Interno do App"**, sob pena de responsabilidade por promessa não cumprida de atendimento de emergência.  
4. **Blindagem Contratual (Pergunta 4):** A limitação genérica de responsabilidade **não basta**. É indispensável uma **cláusula específica no Contrato B2B e Termos de Uso**, acompanhada de uma **Declaração de Existência de Protocolo de Crise Próprio** assinada pela clínica-cliente.  
5. **Eixos de Variação (Pergunta 5):** A regra de software pode ser **única nacionalmente**, mas o comportamento do alerta (copy) deve se adaptar ao eixo **Idade do Paciente** (Menor vs. Adulto).  
6. **Normativa CFP (Pergunta 6):** As citações das Resoluções CFP 001/2009, 06/2019 e 010/2005 estão **perfeitamente corrigidas e confirmadas**.

## **1\. Avaliação do Dever de Notificação de Terceiros**

### **Confirmação da Tabela de Risco (Análise Item a Item)**

| Tipo de Risco Sinalizado | Posição Legal no Brasil | Qualificação Jurídica e Fundamentação |
| :---- | :---- | :---- |
| **(a) Ideação suicida em adulto, sem ato** | **CONFIRMADO** (Sem obrigação legal de notificar terceiro) | **Faculdade Ética.** O Art. 10 do Código de Ética Profissional do Psicólogo (CEPP \- Res. CFP 010/2005) prevê a quebra de sigilo como *faculdade* pautada na "busca do menor prejuízo". Não há dever legal de avisar familiares de adultos capazes. |
| **(b) Tentativa de suicídio / autolesão** | **CONFIRMADO** (Notificação compulsória é do estabelecimento à vigilância sanitária) | **Obrigação Sanitária / Epidemiológica.** Lei 13.819/2019 (Art. 6º) e Portaria de Consolidação MS nº 4/2017. O dever é do *estabelecimento de saúde* para a autoridade sanitária (SINAN) em até 24h, sob sigilo. **Não é dever de notificação à família ou polícia** pelo psicólogo pessoa física. |
| **(c) Violência SOFRIDA por criança/adolescente** | **CONFIRMADO** (Dever legal imperativo de comunicação imediata) | **DEVER LEGAL IMPERATIVO.** Art. 13 do ECA (Lei 8.069/1990) e Art. 13 da Lei 13.431/2017. A comunicação ao Conselho Tutelar ou Autoridade Policial/Judiciária é obrigatória e imediata. A omissão constitui infração administrativa (Art. 245 ECA). |
| **(d) Violência sofrida por mulher adulta (em serviço de saúde)** | **CONFIRMADO** (Comunicação compulsória em 24h) | **Obrigação do Serviço de Saúde.** Lei 10.778/2003 e Lei 13.931/2019. Notificação à autoridade policial/sanitária em até 24h. Conforme Pareceres dos Conselhos de Medicina e Psicologia, notifica-se o *fato/ocorrência*, preservando-se os detalhes confidenciais do prontuário que não sejam estritamente necessários. |
| **(e) Violência PRATICADA pelo paciente / Risco a terceiro** | **CONFIRMADO** (Não há doutrina *Tarasoff* no Brasil) | **Inexistência de Dever de Alertar Vítima.** No Brasil, não há dever legal de alertar a potencial vítima. O psicólogo tem a *faculdade/justa causa* (Art. 10 CEPP c/c Art. 154 do Código Penal e Estado de Necessidade do Art. 24 CP) para quebrar o sigilo e evitar crime iminente, mas não há obrigação passível de responsabilização civil direta se optar por intervir clinicamente sem aviso externo. |

### **Impacto na Copy e UX do Alerta para Recortes Específicos**

Quando o sistema sinalizar o tipo **(c) Violência sofrida por criança/adolescente**, a interface do Iris **não deve usar a mesma linguagem genérica** de ideação suicida. Como neste caso existe um dever legal *ex lege* impostos aos profissionais e à clínica, a copy do alerta deve reforçar a norma:

* **Copy Recomendada para Risco (c):**⚠️ **Sinalização de Risco: Suspeita/Registro de Violência Contra Menor.**  
  *Este registro contém elementos que indicam possível violência ou maus-tratos contra criança/adolescente. Lembramos que, nos termos do Art. 13 do ECA e da Lei 13.431/2017, a comunicação ao Conselho Tutelar/Autoridade Competente é um dever legal do profissional e do estabelecimento de saúde. A avaliação clínica e a tomada de providências cabem exclusivamente à equipe responsável.*

## **2\. Enquadramento da Responsabilidade do SaaS (Opção B)**

### **Por que a Opção B é a única juridicamente sustentável?**

Na arquitetura da LGPD (Lei 13.709/2018), a **Clínica-Cliente é a Controladora dos Dados** e o **Iris é o Operador**. Na esfera da Responsabilidade Civil (Código Civil, Arts. 186 e 927; Código de Defesa do Consumidor, Art. 14):

1. **Inexistência de Dever Clínico (*Duty of Care*):** O Iris é uma empresa de software. Não é pessoa jurídica inscrita no CRP/CRM, não possui Responsável Técnico de saúde, não realiza triagem diagnóstica e não presta atendimento ao paciente.  
2. **O Risco da Notificação Externa Direta:** Se o Iris implementar um "Estágio 2" que dispara SMS, e-mail ou ligação automática para o pai da criança, para a polícia ou para o SAMU sem validação humana da clínica:  
   * **Em caso de Falso Positivo:** O Iris responderá por **violação ilícita de sigilo médico/psicológico**, danos morais por pânico injustificado e infração grave à LGPD (vazamento/compartilhamento indevido de dados sensíveis de menores).  
   * **Em caso de Falso Negativo ou Atraso (Falha de entrega/SMS):** A família ou clínica alegará que "confiou que o Iris notificaria os socorristas" e tentará responsabilizar o SaaS por omissão ou defeito no serviço (*perda de uma chance*).

### **Especificação do "Estágio 2" no Escalonamento de Software**

O **Estágio 2** de escalonamento (quando o SLA de reconhecimento interno vence sem ação) **DEVE ser estritamente interno e informativo**:

\[Alerta Gerado\]  
       │  
       ▼ (15m / 1h / 4h sem resposta)  
\[Estágio 1: Escalonamento Interno\]  
  └─► Notifica TODOS os coordenadores e diretores cadastrados na clínica.  
       │  
       ▼ (Dobro do prazo sem resposta)  
\[Estágio 2: Trava de Segurança e Protocolo Interno\]  
  ├─► Exibe Banner Crítico em destaque na tela de TODOS os usuários logados da clínica.  
  ├─► Envia e-mail/Push de Emergência para o e-mail institucional do Responsável Técnico (RT) da clínica.  
  ├─► Exibe na tela o "Protocolo de Emergência Interno" previamente cadastrado pela própria clínica.  
  └─► REGISTRA LOG IMUTÁVEL: "Alerta ID \#X não reconhecido pela equipe clínica no prazo Y."

* **Regra de Ouro:** O Iris **NUNCA** envia e-mails, SMS ou notificações para contatos externos (pais, SAMU, Polícia, Conselho Tutelar). Todo o fluxo encerra na notificação e responsabilização dos gestores da clínica.

## **3\. Calibragem dos Prazos de SLA**

### **Confirmação sobre Ausência de Prazos Oficiais**

Confirmamos que **não existe na legislação brasileira ou nas resoluções dos Conselhos Profissionais (CFP/CFM/COFFITO)** qualquer fixação numérica de SLA (ex: "15 minutos") para resposta clínica a urgências mentais.

### **Diretriz para Comunicação de Produto**

Os prazos propostos (15 min / 1 h / 4 h) são **excelentes do ponto de vista de usabilidade e governança de software**, mas requerem tratamento jurídico preciso:

1. **Denominação Correta:** Devem ser chamados na interface e no contrato de **"Prazos de Notificação e Escalonamento Interno do Software"** (nunca "SLA de Atendimento de Emergência").  
2. **Declaração Obrigatória na UI:** Ao lado do temporizador de SLA, deve constar o aviso:*"Estes prazos regem apenas o envio de alertas dentro do sistema Iris para os gestores da clínica. O Iris não realiza atendimento e não garante a presença de profissionais logados."*

## **4\. Proteção Contratual e Declaração da Clínica**

Para afastar a alegação de "falso senso de segurança" (teoria do dever de informação do CDC / Responsabilidade Civil), a contratação do Iris deve incluir uma **cláusula específica no Contrato B2B / Termos de Uso** e uma **Declaração de Aceite no Onboarding da Clínica**.

### **Minuta da Cláusula Contratual (Para inclusão em docs/legal/termos-de-uso.md)**

\#\#\# Cláusula X — Da Natureza do Sistema de Alerta de Risco Clínico e Isenção de Monitoramento Continuo

X.1. O SOFTWARE disponibiliza um mecanismo automatizado de identificação e sinalização de termos sugestivos de risco clínico ("Alerta de Risco"), baseado na análise ex post do texto digitado pelo profissional da CONTRATANTE após as sessões.

X.2. A CONTRATANTE declara e reconhece expressamente que:  
   (a) O SOFTWARE NÃO realiza monitoramento em tempo real (24 horas por dia, 7 dias por semana) de pacientes, não substitui plantões clínicos e não funciona como serviço de triagem de emergência ou prevenção de crises;  
   (b) As sinalizações geradas pelo SOFTWARE possuem caráter meramente informativo e probabilístico, dependendo obrigatoriamente da avaliação, julgamento clínico, validação e conduta humana dos profissionais da CONTRATANTE;  
   (c) As notificações do SOFTWARE dependem de fatores técnicos externos, incluindo conectividade com a internet, permissões de dispositivos móveis e configurações de sistemas operacionais (tais como modos "Não Perturbe"), não garantindo o SOFTWARE a resposta humana em prazos determinados;  
   (d) A responsabilidade pela adoção de condutas clínicas, intervenções de emergência, quebra de sigilo ético e notificações compulsórias às autoridades públicas (Conselho Tutelar, Vigilância Sanitária, Autoridades Policiais) é EXCLUSIVA da CONTRATANTE e de seus profissionais de saúde vinculados, nos termos do Código de Ética Profissional e da legislação aplicável.

X.3. Como condição para uso do módulo de Alerta de Risco, a CONTRATANTE se obriga a manter protocolo clínico próprio de gestão de crises e emergências fora do ambiente do SOFTWARE, declarando que não deposita no SOFTWARE a exclusividade no acompanhamento de pacientes em risco.

## **5\. Análise dos Eixos de Variação (Estado, Vínculo, Idade)**

### **1\. Estado (UF)**

* **Parecer:** **Sem necessidade de variação por software.** As normas de regulação de prontuário, Código de Ética do Psicólogo, ECA e Código Penal são estritamente **federais**. Recomendações pontuais de CRPs regionais não alteram a arquitetura do sistema.

### **2\. Vínculo Profissional (CLT, Autônomo, Sócio)**

* **Parecer:** **Sem necessidade de variação no software.** Para o Iris, o contrato é B2B com a **Clínica (Controladora)**. A responsabilidade por atribuir permissões aos usuários (CareTeamMembership) e definir quem atua como Supervisor Técnico é da própria Clínica. Perante o paciente e a Justiça, a Clínica responde solidariamente pelos atos de seus profissionais (Art. 932, III do Código Civil e Art. 14 do CDC).

### **3\. Idade do Paciente (Menor vs. Adulto) — EIXO CRÍTICO**

* **Parecer:** **REQUER DIFERENCIAÇÃO NO SISTEMA.**  
  * **Pacientes Menores de Idade (Crianças/Adolescentes):** Incidem as regras do ECA e a primazia do Superior Interesse da Criança. Diante de suspeita de violência sofrida, o dever de notificação externa é imperativo e legal.  
  * **Pacientes Adultos Capazes:** Incide com força total o sigilo do Art. 9º do CEPP. A quebra de sigilo para familiares é exceção/faculdade baseada na ponderação de risco à vida.

## **6\. Auditoria Normativa do CFP (Confirmação da Tabela A.1)**

Auditamos a legislação e as resoluções do Conselho Federal de Psicologia citadas no Anexo A do Briefing. **Todas as deduções do levantamento estão corretas**:

1. **Resolução CFP nº 001/2009 (com alt. Res. 05/2010):** **VIGENTE.** Regula a guarda e a obrigatoriedade do prontuário psicológico (mínimo de 5 anos). Não foi revogada pela Res. 06/2019.  
2. **Resolução CFP nº 06/2019:** **VIGENTE.** Regula exclusivamente a confecção de *documentos escritos produzidos pela psicóloga* (Atestados, Relatórios, Laudos, Pareceres).  
3. **Resolução CFP nº 010/2005:** **VIGENTE.** É o Código de Ética Profissional do Psicólogo (CEPP). A publicação do CFP de 2025 é meramente uma *edição comemorativa/digital de 20 anos*, mantendo o texto normativo inalterado.  
4. **Manual Orientativo de Registro e Elaboração de Documentos (CFP, Nov/2025):** **VIGENTE (Como Guia Orientativo).** Não possui status de Resolução e não revoga normas anteriores, servindo como fonte de consolidação doutrinária.

## **Matriz de Execução para Engenharia e Produto (Issue \#110)**

Esta tabela consolida os requisitos validados que devem governar o código do módulo de Alerta de Risco:

| Componente | Decisão de Produto Validada | Fundamento Legal / Ação no Código |
| :---- | :---- | :---- |
| **Gatilho de Alerta** | IA sinaliza texto com viés de inclusão (erram para o lado do alerta). | Aprovado. Mantém responsabilidade humana no julgamento. |
| **Escalonamento Nível 1** | Notificação Push imediata ao Terapeuta e Coordenador simultaneamente. | Aprovado. Notificação interna na organização da clínica. |
| **Escalonamento Nível 2 (SLA Vencido)** | Notificação a Diretores \+ Exibição de Banner Interno \+ Exibição do Protocolo de Crise da Clínica. | **Sem contatos externos ao app.** Limita o risco de responsabilização civil do Iris. |
| **Copy para Risco de Menor** | Alerta adaptado citando obrigatoriedade legal do Art. 13 do ECA. | Alteração de Copy para destacar dever legal imperativo da clínica. |
| **Termos de Uso / Contrato** | Inclusão da Cláusula X de Isenção de Monitoramento 24/7. | Atualização do documento docs/legal/termos-de-uso.md. |
| **Onboarding da Clínica** | Checkbox obrigatório: *"Declaro que a clínica possui protocolo próprio de atendimento de emergências."* | Requisito de UI/UX no Onboarding do Tenant. |

