# **Aditivo de Especificações Legais e Requisitos de Software — Iris**

**Autor:** Thiago Lyra Galvão (advogado)

**Documento complementar a:** validacao-legal-prontuario.md

> **Escopo:** este aditivo **não** é da issue #110 (duty to warn) — veio junto
> da mesma consulta, mas trata de requisitos independentes. Cada item da
> matriz da seção 4 virou issue própria; ver `BACKLOG.md`.

**Objetivo:** Traduzir lacunas normativas e refinamentos regulatórios em especificações funcionais, regras de negócio e requisitos de arquitetura de software para o sistema Iris.

> ⚠️ **Nota de verificação de implementação — 21/08/2026, `revisao-juridica-2026-08-21.md`.**
> Não altera nenhuma especificação do advogado abaixo; registra apenas o que
> foi conferido em `src/db/schema.ts` (arquivo completo) nesta data:
>
> - **§2.1 (`visibility_level`) — NÃO implementado nesta data.** Nenhuma
>   coluna, enum ou equivalente encontrado. Hoje o prontuário
>   multidisciplinar não restringe visibilidade por disciplina — uma nota de
>   psicólogo sobre dinâmica familiar é visível a qualquer profissional
>   vinculado ao caso. Tratar como bloqueador de piloto, não como débito
>   técnico genérico: enquanto o campo não existir, orientar psicólogos a não
>   registrar no Iris informação que dependeria dessa restrição.
> - **§1.3 (`e_psi_verified` / `e_psi_number`) — NÃO implementado nesta
>   data.** Mesma busca, mesmo resultado.
> - **§1.1 (retenção de `AuditLog`) e §1.2 (revogação → somente-leitura) —
>   implementados.** Confirmado por `politica-retencao-dados.md` §5/§8 e
>   `procedimento-revogacao-consentimento.md`.
>
> Abrir issue própria para §2.1 e §1.3 em `BACKLOG.md`, citando esta seção
> como origem do requisito — não foi feito nesta revisão (arquivo de 384 KB,
> fora do escopo de uma edição de documento legal).
>
> **Atualização — 26/08/2026, D67.** Ambos os campos foram implementados
> depois desta revisão:
>
> - **§2.1 (`visibility_level`) — implementado (D55, issue #119, commit
>   `d3a0a17`).** `session_note_visibility_level` (enum), coluna
>   `visibility_level` e índice `idx_session_note_sigilo` existem em
>   `src/db/schema.ts` (conferido por grep em 24/08/2026).
> - **§1.3 (`e_psi_verified` / `e_psi_number`) — implementado (D56, PR #482,
>   draft).** `app_user.e_psi_verified` / `e_psi_number` /
>   `e_psi_declarado_em` (`db/migrations/0132_app_user_e_psi.sql`), escrita
>   via `app_declarar_e_psi(boolean, text)` (`0133`, `SECURITY DEFINER`),
>   autodeclarada em `/perfil`. **Divergência deliberada:** o texto acima
>   fala em `CareTeamMembership`; a implementação mora em `User`
>   (`app_user`), seguindo a matriz §4 deste mesmo documento — cadastro
>   e-Psi é um por profissional, não por vínculo.
>
> Ver `BACKLOG.md` D55, D56, D67.

## **1\. Refinamentos Normativos e Regulatórios**

### **1.1. Retenção de Logs de Aplicação (Marco Civil da Internet)**

* **Fundamento Legal:** Lei nº 12.965/2014 (Marco Civil da Internet), Artigo 15\.  
* **Regra:** Provedores de aplicação devem manter os registros de acesso a aplicações de internet em ambiente controlado e de segurança, pelo prazo mínimo de **6 meses**.  
* **Implicação para o Produto:** Existe uma distinção clara entre o **prontuário clínico** (com prazo de guarda de 10 a 20 anos) e os **logs de acesso/autenticação ao sistema** (IP, timestamp, ID do usuário).  
* **Especificação:** Mesmo se uma clínica rescindir o contrato ou solicitar exclusão de conta, a tabela AuditLog com os eventos de autenticação e acessos precisa permanecer retida por no mínimo 6 meses antes do expurgo definitivo, respaldada pelo cumprimento de obrigação legal.

### **1.2. Gestão do Consentimento: Revogação vs. Retenção Regulada**

* **Fundamento Legal:** LGPD (Lei nº 13.709/2018), Artigos 15, 16 (I) e 18\.  
* **Regra:** O consentimento para tratamento de dados de menores pode ser revogado pelos pais ou responsáveis legais a qualquer momento. Contudo, a revogação **não impõe a eliminação do prontuário já existente**, pois a retenção é autorizada por obrigação regulatória dos conselhos de classe (CFP/CFFa/COFFITO).  
* **Especificação:**  
  * Quando o consentimento for revogado via entidade Consent:  
    1. O estado da conta da criança no Iris transiciona imediatamente para Read-Only Locked (Arquivado/Bloqueado).  
    2. Bloqueia-se qualquer novo processamento de dados (novas entradas no diário, extrações por IA e chamadas de modelos LLM).  
    3. Os dados históricos permanecem acessíveis apenas em modo leitura restrito para fiscalização dos conselhos ou transferência de prontuário, até o término do prazo de retenção estipulado.

### **1.3. Exercício de Telepsicologia e Supervisão Remota**

* **Fundamento Legal:** Resolução CFP nº 009/2024 (Regulamenta a prestação de serviços psicológicos realizados por meios de tecnologia da informação e comunicação).  
* **Regra:** O psicólogo que presta serviços ou realiza supervisões clínicas mediadas por TIC deve manter cadastro ativo no **e-Psi**.  
* **Especificação:**  
  * O sistema não necessita consultar APIs governamentais, mas incluirá uma declaração formal de conformidade no cadastro dos profissionais:  
  * No perfil do CareTeamMembership do Psicólogo Responsável, incluir a *flag*: e\_psi\_verified: boolean e campo declaratório do nº do e-Psi, garantindo respaldo preventivo em auditorias de fiscalização do CRP.

## **2\. Requisitos de Proteção ao Sigilo Profissional (Prontuário Único)**

### **2.1. Níveis de Acesso e "Anotações Pessoais" da Psicologia**

* **Fundamento Legal:** Código de Ética Profissional do Psicólogo (CEPP \- Resolução CFP nº 010/2005, Art. 9º) e Resolução CFP nº 001/2009 (Art. 1º, §2º).  
* **Regra:** Em prontuários multidisciplinares (equipe com Fono, TO, Psicologia), o psicólogo deve registrar apenas as informações estritamente necessárias para o trabalho da equipe. Informações confidenciais da dinâmica familiar ou segredos relatados durante a anamnese/atendimento devem manter acesso restrito ao profissional da Psicologia.  
* **Especificação:**  
  * O modelo de dados de Evidence e notas de evolução deve suportar o atributo de visibilidade visibility\_level:  
    * Multidisciplinary: Visível para toda a equipe de cuidado vinculada à criança.  
    * Restricted\_To\_Discipline: Visível apenas para os profissionais daquela categoria específica (ex: apenas Psicólogos/ATs com supervisão).

## **3\. Requisitos de Portabilidade e Auditoria**

### **3.1. Exportação Integrativa e Auditável de Prontuário**

* **Fundamento Legal:** LGPD, Artigo 18, II e V (Direito de Acesso e Portabilidade dos Dados).  
* **Regra:** O titular ou representante legal tem o direito de solicitar cópia integral e inteligível de seus dados clínicos.  
* **Especificação:**  
  * O Iris deve dispor de função para exportar o prontuário em lote no formato PDF/A.  
  * O documento gerado deve conter:  
    1. Marca d'água de rastreabilidade (identificando quem solicitou e a data/hora da emissão).  
    2. Tabela de hash SHA-256 no rodapé para verificação de integridade e não-adulteração após a exportação.

## **4\. Matriz de Rastreabilidade (Requisito Legal x Software)**

A tabela a seguir consolida as diretrizes jurídicas/regulatórias e mapeia a implementação direta nos módulos e entidades do sistema Iris:

| Requisito Legal / Norma | Origem da Norma | Mecanismo de Software no Iris | Atributo / Módulo Afetado |
| :---- | :---- | :---- | :---- |
| **Supervisão Técnica da ABA** | Indireta (CFP/CEPP) | Registro de dupla autoria (Quem fez x Quem aprovou) | created\_by\_user\_id \+ supervised\_by\_user\_id em CareTeamMembership |
| **Retenção de Logs de Aplicação** | Marco Civil (Art. 15\) | Política de retenção diferenciada para logs de sistema (min. 6 meses) | Tabela AuditLog (expurgo desatrelado da exclusão do perfil do usuário) |
| **Revogação do Consentimento** | LGPD (Art. 16, I) | Transição do prontuário para leitura restrita sem exclusão física imediata | Status Read-Only Locked no PatientRecord ao revogar Consent |
| **Segurança e Não-Repúdio** | CFP 001/2009 | Autenticação forte (MFA) e histórico de alterações com versionamento imutável | Tabela EvidenceRevision \+ login com MFA |
| **Regulação da IA (Não-SaMD)** | ANVISA RDC 657/2022 | Workflow *Human-in-the-Loop* (Aprovação humana obrigatória) | Status Suggested nas extrações de IA, convertendo a Evidence só pós-aceite |
| **Sigilo Multidisciplinar** | CEPP / CFP 001/2009 | Controle de visibilidade granular em registros de evolução | Campo visibility\_level (Multidisciplinary vs. Restricted\_To\_Discipline) |
| **Declaração de Atuação Remota** | Resolução CFP 009/2024 | Campo declaratório de registro ativo na plataforma e-Psi | Atributos e\_psi\_number e e\_psi\_verified na entidade User |
| **Portabilidade Garantida** | LGPD (Art. 18\) | Módulo de exportação de prontuário auditável com assinatura/hash de integridade | Serviço de geração de relatórios PDF/A com marca d'água e hash SHA-256 |

