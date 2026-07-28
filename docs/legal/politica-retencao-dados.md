# Política de Retenção e Eliminação de Dados — Iris

**Status: CONSOLIDADO para o MVP — Alinhado com pareceres legais e especificações das issues #122, #116 e #89.**

---

## 1. Objetivo e escopo

Esta política define por quanto tempo o Iris mantém os dados pessoais e sensíveis (dado de saúde) tratados na plataforma, e o processo de eliminação ao fim do prazo. Aplica-se a todo dado de: `Patient`, `PatientClinicalProfile`, `SessionNote`, `AudioCapture`, `Extraction`, `Evidence`, `MilestoneAssessment`, `Report`, `Consent`, `AlertaRiscoClinico` e `AuditLog` (modelo completo em `docs/dados/modelo-de-dados.md`).

---

## 2. Quem é o controlador dos dados

**A clínica-cliente é a controladora dos dados** (LGPD, Art. 5º, VI) — detentora da relação com o paciente/família e responsável pelo prontuário perante seu conselho profissional (CFP/COFFITO/CFFa). **O Iris é operador** (processa os dados por conta e ordem da clínica, LGPD Art. 5º, VII).

Isso é consequência direta de o Iris ser classificado como produto de tecnologia, não estabelecimento de saúde (`docs/legal/validacao-legal-prontuario.md`, seção 6) — o Iris não tem, sozinho, a obrigação legal de guarda que os conselhos impõem; essa obrigação é da clínica. Por isso a retenção é **configurável por clínica**, não uma regra única rígida do produto.

---

## 3. Prazos de retenção por categoria de dado

| Categoria de Dado | Prazo de Retenção | Regulamentação / Fundamento Legal | Comportamento no Fim do Prazo |
| :--- | :--- | :--- | :--- |
| **Prontuário Multidisciplinar** (`Patient`, `Session`, `Extraction`, `Report`) | Default: `MAX(18 anos do menor, alta + 10 anos)` | CFP (Res. 01/2009 & 04/2020), CFFa, COFFITO. LGPD Art. 16, I (obrigação legal/regulatória). | Expurgo a pedido da clínica ou ao atingir o prazo via `app_purgar_paciente`. |
| **Alertas de Risco Clínico** (`AlertaRiscoClinico` — #122) | Acompanha o prontuário | Defesa de responsabilidade técnica da clínica / prova do software. | **Pseudonimização LGPD (`pseudonimizado_em IS NOT NULL`)**: ao expurgar o paciente, `patient_id` e `session_id` viram `NULL`. O registro anônimo e a trilha no `audit_log` permanecem imutáveis (LGPD Art. 12). |
| **Logs de Acesso à Aplicação** (`AuditLog` de autenticação — #116) | **6 meses (180 dias)** | Marco Civil da Internet (Lei 12.965/2014, Art. 15). | Expurgo automático dos registros de IP/sessão brutos ao completar 6 meses. |
| **Cópia de Segurança / Backups** (`MinIO` + `OCI S3` Off-site — #89) | **30 dias** | LGPD Art. 46 (Segurança e Recuperação). | Rotação automática via script de backup e Lifecycle Rule no Object Storage. |

---

## 4. Retenção de Alerta de Risco Clínico (#122) e Pseudonimização

Conforme especificado em `docs/agente/regra-alerta-risco.md` e na migração `0049_alerta_risco_clinico.sql`:
- O expurgo LGPD de um paciente **não deleta a linha** da tabela `alerta_risco_clinico`.
- Em vez disso, marca `pseudonimizado_em = NOW()` e ajusta `patient_id = NULL` e `session_id = NULL`.
- A invariante do banco (CHECK `alerta_risco_vinculo`) garante que alertas vivos exigem vínculo com paciente e sessão, enquanto alertas pseudonimizados proíbem esse vínculo.
- Isso assegura que métricas estatísticas e evidências de cumprimento dos prazos de notificação interna do software fiquem preservadas sem manter dados pessoais identificáveis.

---

## 5. Direitos do titular (LGPD Art. 18)

O responsável legal do paciente pode solicitar, a qualquer momento através da clínica (controladora): confirmação de tratamento, acesso aos dados, correção, anonimização/eliminação (respeitada a base legal de retenção da seção 3), portabilidade e revogação do consentimento. O Iris, como operador, executa a solicitação mediante comando da clínica através de `app_purgar_paciente`.

---

## 6. Encarregado (DPO)

A clínica-cliente, como controladora, é responsável por indicar seu encarregado (DPO) próprio (LGPD Art. 41). O Iris mantém contato institucional de privacidade em `privacidade@irisclinica.ia.br`.
