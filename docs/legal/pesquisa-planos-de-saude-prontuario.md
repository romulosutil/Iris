# Pesquisa — Requisitos de Planos de Saúde para Exportação de Prontuários e Dossiês Clínicos

**Data da Pesquisa:** 03/08/2026  
**Escopo:** Mapeamento de requisitos de auditabilidade, composição de prontuário e instrução de processos de reembolso/auditoria junto a operadoras de planos de saúde no Brasil (Bradesco Saúde, Amil, SulAmérica, Unimed, NotreDame Intermédica e Casssi).

---

## 1. Contexto e Desafio nas Terapias Multidisciplinares (ABA, Fonoaudiologia, T.O. e Psicologia)

Operadoras de saúde e planos de saúde suplementar impõem um nível elevado de exigência na comprovação factual das sessões prestadas para fins de **reembolso de despesas** e **auditoria de sinistros** (especialmente após o aumento de judicializações no tratamento de Transtorno do Espectro Autista - TEA).

Um mero recibo ou declaração simples é sistematicamente recusado pelas operadoras. A instrução do dossiê requer o **prontuário clínico integral com linha do tempo auditável**.

---

## 2. Matriz de Requisitos Exigidos pelas Operadoras de Saúde

| Operadora / Regulação | Documento Exigido | Exigências de Conteúdo | Validade Legal / Integridade |
| :--- | :--- | :--- | :--- |
| **ANS (RN 503/2022 e RN 465/2021)** | Dossiê de Atendimento Multidisciplinar | Frequência pontual, evoluções por sessão e objetivos terapêuticos mapeados | Carimbo de hora/data e identificação de autoria por atendimento |
| **Bradesco Saúde & SulAmérica** | Relatório Factual Detalhado + Evoluções | **Proibido síntese por IA sem fato**: exige o espelho de cada sessão com hora de entrada/saída, conduta e metas trabalhadas | Assinatura com registro profissional (CRP/CREFITO/CFFa) + Hash de auditoria SHA-256 |
| **Amil & NotreDame Intermédica** | Prontuário Clínico Integrado | Histórico de anamnese, registro de evolução contínua e identificação do Responsável Técnico (RT) | Trilha imutável de acesso e impedimento de adulteração posterior |
| **Unimed (Central e Federações)** | Dossiê Factual de Reembolso | Comprovação da presença, metas trabalhadas e justificativa da intensidade de horas (ex: 20h/semana ABA) | Identificador único de exportação com carimbo de marca d'água nominal do solicitante |

---

## 3. Diretrizes para a Composição do Prontuário no Iris (#120)

Com base nas exigências das operadoras, o formato de **Prontuário Integral Auditável** exportado em PDF pela plataforma Iris deve ser composto estruturadamente pelas seguintes seções:

1. **Capa & Identificação Nominal do Solicitante:**
   - Nome do paciente, CPF, ID do Paciente, Nome do Solicitante, CPF do Solicitante, Timestamp UTC de Emissão.
   - Fundamento Legal (LGPD Art. 18, II e V e Lei 13.787/2018).

2. **Resumo do Plano Terapêutico Singular (PTS):**
   - Diagnósticos primários, carga horária semanal pactuada e objetivos terapêuticos ativos.

3. **Registro do Responsável Técnico (RT) e Equipe Multidisciplinar:**
   - Identificação dos terapeutas de campo e do Responsável Técnico (ex: Psicólogo supervisor CRP para intervenções ABA).

4. **Histórico de Sessões e Evoluções Factuais:**
   - Registro cronológico de cada sessão com data, horário, profissional presente, resumo da evolução clínica e intercorrências.

5. **Matriz de Evolução de Metas e Marcos:**
   - Estatística de metas alcançadas, em manutenção ou candidatas a dominadas.

6. **Rodapé Auditável & Marca D'água:**
   - Carimbo de integridade SHA-256 no rodapé de todas as páginas + marca d'água antivazamento nominal do solicitante.

---

## 4. Conclusão e Encaminhamento de Produto

- **Composição Factual Confirmada:** O relatório de exportação não pode conter resumos subjetivos que ocultem os fatos da sessão. As operadoras exigem rastreabilidade 1:1 entre a cobrança/reembolso e o registro da evolução clínica.
- **RAG / Ativo de Dados da Empresa:** Todos os relatórios e evoluções gerados permanecem preservados e estruturados no banco de dados para tokenização e indexação RAG (Retrieval-Augmented Generation), alimentando os modelos de inteligência clínica da plataforma Iris.
