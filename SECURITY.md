# Política de Segurança — Iris

A segurança dos dados clínicos e o sigilo de menores no espectro autista (TEA) são prioridades inegociáveis do Iris. Agradecemos o apoio da comunidade e de pesquisadores de segurança na identificação e comunicação responsável de vulnerabilidades.

---

## 1. Versões Suportadas

Apenas a versão ativa em produção na branch `main` recebe correções de segurança.

| Versão                         | Suportada          |
| :----------------------------- | :----------------- |
| `main` (Produção)              | :white_check_mark: |
| Outras branches / tags legadas | :x:                |

---

## 2. Como Reportar uma Vulnerabilidade (Divulgação Responsável)

Se você identificou uma vulnerabilidade de segurança, **NÃO abra uma GitHub Issue pública** nem divulgue detalhes em fóruns públicos.

Utilize um dos seguintes canais privados de divulgação coordenada:

1. **GitHub Private Vulnerability Reporting (Recomendado):**
   - Acesse a aba **[Security / Advisories](https://github.com/romulosutil/Iris/security/advisories)** deste repositório e clique no botão **"Report a vulnerability"**.
2. **E-mail Direto da Engenharia:**
   - Envie um relatório técnico detalhado para: `seguranca@irisclinica.ia.br` (ou contato direto com o mantenedor no GitHub).

### Informações essenciais no relatório:

- **Classificação:** Tipo de vulnerabilidade (ex: RLS bypass, XSS, SSRF, Autenticação/Sessão, Escalação de privilégios).
- **Reprodução:** Passo a passo detalhado ou prova de conceito (PoC).
- **Impacto:** Avaliação do risco potencial a tenants ou dados de pacientes.
- **Remediação:** Sugestão de correção (se houver).

---

## 3. Prazos e Compromisso de Resposta

- **Confirmação de recebimento:** Até 48 horas úteis.
- **Avaliação de impacto e triagem:** Até 5 dias úteis.
- **Correção (Patch):** Prioridade máxima (P1), com publicação do fix antes de qualquer fechamento público do advisory.
