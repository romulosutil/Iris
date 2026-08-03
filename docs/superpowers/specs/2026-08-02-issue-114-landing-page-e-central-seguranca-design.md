# Design Spec — Issue #114: Landing Page Institucional (com Seção de Segurança Integrada)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#114](https://github.com/romulosutil/Iris/issues/114)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
Para converter clínicas no onboarding e transmitir confiança técnica aos tomadores de decisão (donos de clínica e coordenadores), o Iris necessita de uma presença pública institucional sólida que comprove suas salvaguardas regulatórias e técnicas de forma clara e transparente.

### 1.2 A Solução
Desenvolver a Landing Page principal em página única (`/` ou `/institucional`) seguindo o Design System Espectro Brutal, com Next.js App Router e Tailwind CSS v4, integrando a Seção de Segurança & Transparência (`#seguranca`) diretamente na própria landing page.

---

## 2. Estrutura de Telas & Conteúdo (Página Única)

### 2.1 Home Pública (`/`)
* **Hero:** Posicionamento de valor ("A Plataforma de Prontuário, Gestão e IA Clínica para Atendimento Neurodivergente").
* **4 Pilares:** Registro em <5 min, IA auxiliar com guardrails, relatórios auditáveis de convênio e família, Privacy by Design.
* **Badges Trust System:** `LGPD Compliant`, `AES-256 & TLS 1.3`, `PostgreSQL Multi-Tenant RLS`, `Zero-Training AI`.
* **Seção Integrada de Segurança (`#seguranca`):**
  * **Pilar 1 — Privacidade & LGPD:** Direitos do titular, papéis Operador/Controlador, retenção e expurgo.
  * **Pilar 2 — Infraestrutura & Criptografia:** Isolamento RLS por tenant, backups cifrados.
  * **Pilar 3 — IA Privada:** Garantia contratual de Zero Training (dados não alimentam LLMs públicos).
  * **Pilar 4 — Continuidade:** DRP, retenção legal Marco Civil.

---

## 3. Especificação Técnica & Critérios de Aceite

1. **Acessibilidade:** Conformidade WCAG 2.1 AA (0 violações axe).
2. **Desempenho:** Lighthouse Score $\ge 95$ em Performance, SEO e Acessibilidade.
3. **SEO:** Meta tags OpenGraph completas, HTML semântico e sitemap.xml.

