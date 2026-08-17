# Design Spec — Central de Super Admin & Backoffice Iris

> **Status:** 🟢 Especificação Inicial (Fase 1: Visão & Métricas · Extensível para Ações)  
> **Data:** 03/08/2026  
> **Autor:** Rômulo Sutil & Agente Antigravity

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Com o lançamento do modelo Self-Service (Fase 7) e a expansão de clínicas pagantes, a gestão do produto necessita de visão centralizada sobre a saúde financeira, crescimento da base, uso do sistema, trial de 14 dias e status de pagamento por clínica.

### 1.2 A Solução

Desenvolver o módulo `/super-admin` (Portal de Backoffice) com acesso restrito a Super Admins da plataforma Iris.

- **Fase 1 (Escopo Inicial - Visão & Métricas):** Dashboard consolidado de leitura com métricas de MRR (Receita Recorrente Mensal), clínicas ativas, total de pacientes cobráveis, clínicas em trial, clínicas isentas e status de webhooks/cobranças Asaas.
- **Fase 2 (Extensibilidade Pré-Arquitetada):** Painel preparado para receber ações administrativas diretas (conceder `isento_trial`, alterar dias de trial, pausar conta, simular apuração de fatura e visualizar logs de auditoria cross-tenant).

---

## 2. Arquitetura & Segurança

### 2.1 Controle de Acesso (RBAC Platform Level)

- **Role de Plataforma:** Distinta da `app_role` interna da clínica (coordenador/terapeuta/recepção). É definida pelo flag `is_super_admin` no perfil do usuário na tabela de auth (`app_user`).
- **Guarda de Rota:** Middleware/Server Action guard em `/super-admin/*` verifica se o usuário autenticado possui a role de Super Admin. Qualquer outro acesso resulta em `404 Not Found` ou `403 Forbidden`.
- **Cross-Tenant Access:** Consultas agregadas de plataforma rodam via conexão administrativa de sistema (`authDb` / funções `SECURITY DEFINER` agregadoras) **sempre desprovidas de dados sensíveis de pacientes (LGPD/Zero-Knowledge)**. Apenas metadados de clínica, contagem de pacientes, valores de faturamento e e-mails de contato do dono da clínica são expostos.

---

## 3. Estrutura de Telas & Dashboard (Fase 1)

### 3.1 Visão Geral (`/super-admin`)

1. **Cards KPI Principais:**
   - **MRR Estimado:** Soma dos valores de faturas projetadas (R$ por paciente ativo/mês).
   - **Clínicas Ativas:** Total de clínicas com assinatura ativa/adimplente.
   - **Pacientes Cobráveis Totais:** Soma de pacientes ativos (não arquivados) em todas as clínicas.
   - **Clínicas em Trial:** Contagem de clínicas no período de degustação de 14 dias (com contador de dias restantes).
   - **Clínicas Isentas:** Contagem de clínicas legadas com `isento_trial = true`.
2. **Tabela de Clínicas (`/super-admin/clinicas`):**
   - Nome da Clínica, Dono/E-mail, Data de Cadastro, Status (Trial / Ativa / Inadimplente / Isenta), Pacientes Ativos, Próxima Apuração, Valor Estimado.
   - Busca por nome/CNPJ/e-mail e ordenação por data ou receita.
3. **Status de Integrações & Health (`/super-admin/saude`):**
   - Status da integração Asaas (últimos webhooks recebidos, falhas de retentativa).
   - Status dos disparos de e-mail ao RT (Resend).

---

## 4. Extensibilidade (Fase 2 — Ações Administrativas)

A arquitetura do componente e da API deve ser construída modularmente:

- Componentes de tabela e modal preparados para encaixe de um menu de contexto ("Ações") por clínica.
- Endpoints de Server Actions criados com padrão command handler (`executarAcaoSuperAdmin(clinicaId, acao)`), facilitando a adição de mutações futuras sem reescrever a interface.

---

## 5. Critérios de Aceite

1. **Segurança:** Nenhuma rota sob `/super-admin` acessível por usuários normais da aplicação.
2. **LGPD / Isolamento:** O painel de Super Admin NUNCA exibe nomes de pacientes, prontuários ou diários clínicos. Apenas números agregados de contagem de pacientes ativos.
3. **Performance:** Carregamento de métricas agregadas otimizado via queries otimizadas em Postgres (índices em `clinic.trial_comeco_em`, `patient.arquivado_em`, `subscription.status`).
