# 🗺️ IRIS — Roadmap Canônico de Operação & Evolução Contínua

> **Documento Mestre de Governança, Lançamento & Roadmap Pós-Go-Live**  
> **Status:** Ativo / Em Produção  
> **Última Atualização:** 17/08/2026  
> **Ordem de Prioridade Inegociável:** `Segurança & Compliance` $\rightarrow$ `Features de Produto` $\rightarrow$ `Saúde & Performance` $\rightarrow$ `Expansão & Escala`

---

## 🎯 1. Visão Geral & Estado do Produto

O **Iris** é um SaaS especializado para clínicas de terapia infantil (intervenção comportamental para TEA / ABA) baseado na **Governança Clínica em 3 Camadas**:

1. **IA Sugere:** Derivação estruturada a partir do diário de sessão em linguagem natural (rastreabilidade frase-a-frase).
2. **Terapeuta Aprova:** Revisão humana obrigatória na interface (_Human-in-the-Loop_).
3. **Coordenadora Valida por Exceção:** Reclassificação auditada e versionada.

### Estado de Homologação em Produção:

- ✅ **Isolamento Multi-tenant (RLS):** 100% das policies utilizam `app_clinic_id_exigido()`.
- ✅ **Infraestrutura Easypanel:** Containers `iris-app`, `iris-billing`, `iris-escalonamento`, `iris-backup`, `iris-postgres`, `iris-redis` ativos e operacionais.
- ✅ **Faturamento Real:** Ativação de Pix Automático (`immediateQrCode`) e débito de mensalidade homologados com clínica real no Asaas em produção (fechando **D43** e **D44**).
- 🟢 **Status Go-Live:** **Sinal Verde** para captação e admissão de novas clínicas.

---

## 🧭 2. Matriz de Priorização do Roadmap

A evolução contínua do Iris obedece a 4 pilares sequenciais:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. SEGURANÇA, GOVERNANÇA & COMPLIANCE (Prioridade P1 — Risco Zero)       │
├─────────────────────────────────────────────────────────────────────────┤
│ 2. FEATURES DE PRODUTO & EXPERIÊNCIA DA CLÍNICA (Prioridade P2)        │
├─────────────────────────────────────────────────────────────────────────┤
│ 3. SAÚDE OPERACIONAL, PERFORMANCE & OTIMIZAÇÃO (Prioridade P3)          │
├─────────────────────────────────────────────────────────────────────────┤
│ 4. EXPANSÃO & RECURSOS AVANÇADOS / PÓS-PILOTO (Prioridade P4)           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ PILAR 1 — Segurança, Governança & Compliance (P1)

_Foco: Garantir sigilo absoluto de menores (LGPD), blindagem contra vazamento de dados entre clínicas (RLS) e auditoria imutável de atos irreversíveis._

| Item / Issue                                               | Título & Escopo                                         | Por que importa                                                                                                                                                                                                           | Responsável / Ação                         |
| :--------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------- |
| **D34**                                                    | **Auditoria no Corte por Inadimplência**                | O corte após 10 dias de carência é ato irreversível (revoga Pix no Asaas). Deve emitir `audit_log` atômico (`assinatura_cancelada_por_inadimplencia`) e fazer o job noturno falhar com `exit 1` em caso de erros em lote. | **Claude / Antigravity** (Sessão síncrona) |
| **[#343](https://github.com/romulosutil/Iris/issues/343)** | **Verificação de Grants RLS em `tcc_rpd_entry`**        | Garantir que o papel `app_role` tem permissões estritas sob RLS na tabela de RPD do TCC.                                                                                                                                  | Operacional (`psql` produção)              |
| **[#89](https://github.com/romulosutil/Iris/issues/89)**   | **Retenção de Backup (30d) vs. Expurgo LGPD**           | Harmonizar política de descarte definitivo de dados expirados nos backups cifrados off-site da Oracle Cloud.                                                                                                              | Engenharia & Jurídico                      |
| **[#119](https://github.com/romulosutil/Iris/issues/119)** | **Sigilo da Psicologia no Prontuário Multidisciplinar** | Níveis de visibilidade estritos para notas confidenciais de psicólogos dentro da clínica multidisciplinar.                                                                                                                | Spec de Produto & RLS                      |
| **Hardening**                                              | **Defesa contra Prompt Injection em Diários**           | Sanitização rigorosa do texto livre digitado por terapeutas antes do envio ao pipeline de extração da LLM.                                                                                                                | Engenharia de IA                           |

---

## 🚀 PILAR 2 — Features de Produto & Experiência da Clínica (P2)

_Foco: Entregar clareza máxima na interface, reduzir atrito no dia a dia dos terapeutas e evitar bloqueios operacionais surpresa._

| Item / Issue                                                   | Título & Escopo                                                 | Por que importa                                                                                                                                                      | Responsável / Ação                  |
| :------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- |
| **D36**                                                        | **Faixa de Alerta Urgente de Recusa na UI (`faixa-trial.tsx`)** | Se o Pix Automático da clínica falhar por falta de saldo, exibir faixa no topo do app alertando o prazo de carência restante e instruindo ajuste de limite bancário. | **Claude / Antigravity** (Frontend) |
| **D39**                                                        | **Persistência do Código Cru de Recusa G6**                     | Gravar `recusa_codigo` mesmo para erros internos G6, permitindo ao backstop de D+7 identificar defeito nosso e não penalizar a clínica.                              | **Claude / Antigravity** (Billing)  |
| **[#277](https://github.com/romulosutil/Iris/issues/277)**     | **Painel de Governança e Segurança da Clínica**                 | Central administrativa para a gestora da clínica visualizar logs de acesso, consentimentos LGPD e auditoria de laudos.                                               | Produto & Frontend                  |
| **D31 / [#36](https://github.com/romulosutil/Iris/issues/36)** | **Página "Dados da Clínica" (`/clinica/dados`)**                | Centralizar razão social, CNPJ, endereço e contatos fiscais fora da tela de assinatura.                                                                              | Spec de Produto                     |
| **[#283](https://github.com/romulosutil/Iris/issues/283)**     | **Layout Mobile da Visão Matriz na Agenda**                     | Ajuste do grid de agendamentos para visualização fluida em telas < 375px (smartphones de terapeutas em campo).                                                       | Frontend / Jules                    |
| **[#72](https://github.com/romulosutil/Iris/issues/72)**       | **Fase 6b — Ditado por Voz (Áudio + ASR)**                      | Transcrição automática de áudio de sessão via modelo com DPA médico assinado.                                                                                        | Roadmap / Pós-Piloto                |

---

## ⚙️ PILAR 3 — Saúde Operacional, Performance & Otimização (P3)

_Foco: Alta performance de banco, zero overhead em queries e observabilidade contínua de jobs de segundo plano._

| Item / Issue                                                                                                            | Título & Escopo                                       | Por que importa                                                                                                       | Responsável / Ação         |
| :---------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------- |
| **D40 / [#330](https://github.com/romulosutil/Iris/issues/330)**                                                        | **Eliminação de 3 N+1 em `materializarSnapshot`**     | Converter buscas sequenciais em `materializar.ts:319-320, 386-414, 418-428` para consultas em lote com `= ANY($ids)`. | **Jules (Autônomo)**       |
| **[#293](https://github.com/romulosutil/Iris/issues/293)**                                                              | **Job de Auto-Arquivamento (`iris-arquivamento`)**    | Provisionar container do cron no Easypanel para arquivar automaticamente fichas sem sessões há mais de 90 dias.       | Painel Easypanel (Mês 1-2) |
| **[#294](https://github.com/romulosutil/Iris/issues/294)**                                                              | **Alarmes Automáticos de Falha de Jobs**              | Disparo de alertas (webhook/e-mail) caso qualquer cron (`billing`, `escalonamento`, `backup`) falhe.                  | Infraestrutura & Sentry    |
| **[#327](https://github.com/romulosutil/Iris/issues/327)** / **[#328](https://github.com/romulosutil/Iris/issues/328)** | **Cobertura de Testes de Rate-Limit e Proxy Matcher** | Garantir oráculos rígidos de testes para throttle de redefinição de senha e matchers do middleware.                   | **Jules (Autônomo)**       |
| **[#332](https://github.com/romulosutil/Iris/issues/332)** / **[#341](https://github.com/romulosutil/Iris/issues/341)** | **Estabilização de Suíte A11y & Storybook Windows**   | Eliminar flakes sob concorrência e corrigir glob de stories em ambiente Windows.                                      | Tooling / Jules            |

---

## 🌟 PILAR 4 — Expansão & Recursos Avançados (P4 / Pós-Piloto)

_Foco: Diferenciação de mercado, enterprise features e escala da base de clientes._

| Item / Issue                                                     | Título & Escopo                                 | Por que importa                                                                                        | Status          |
| :--------------------------------------------------------------- | :---------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :-------------- |
| **D9 / [#258](https://github.com/romulosutil/Iris/issues/258)**  | **Customização White-Label nos Laudos e PDFs**  | Personalização com logotipo, cores e cabeçalho oficial da clínica nos relatórios auditáveis.           | Aguardando Spec |
| **D10 / [#259](https://github.com/romulosutil/Iris/issues/259)** | **Assinatura Digital ICP-Brasil A1/A3**         | Integração com certificados ICP-Brasil para relatórios de intervenção com exigência judicial/pericial. | Aguardando Spec |
| **D11 / [#260](https://github.com/romulosutil/Iris/issues/260)** | **Indexação RAG em Prontuários Históricos**     | Busca semântica e síntese longitudinal da evolução do paciente ao longo de múltiplos anos.             | Aguardando Spec |
| **[#185](https://github.com/romulosutil/Iris/issues/185)**       | **Empacotamento PWA & TWA (Google Play Store)** | Disponibilização do app na loja para tablets clínicos e uso offline com sincronização.                 | Pós-MVP         |

---

## 🤖 3. Matriz de Atuação: Sessões Síncronas vs. Jules

Para garantir eficiência e máxima qualidade de código conforme `AGENTS.md` §4 e §5:

### 🔹 Claude Code / Antigravity (Sessões Síncronas / Arquitetura)

- Regras de negócio de Billing & Governança (D36, D34, D39).
- Modificações de Schema Drizzle / Migrações PostgreSQL.
- Definição de Specs e fechamento de decisões antes de delegar.

### 🔹 Jules (Braço Executor Autônomo via GitHub Issues)

- **Critério:** Issues com escopo 100% delimitado, padrões de código pré-existentes e zero ambiguidade técnica.
- **Backlog Ativo para o Jules:**
  - `perf(evidence): três N+1 restantes em materializar.ts` ([#330](https://github.com/romulosutil/Iris/issues/330))
  - `test(redefinir-senha): chave e limites do throttle` ([#327](https://github.com/romulosutil/Iris/issues/327))
  - `test(proxy): config.matcher cobertura comportamental` ([#328](https://github.com/romulosutil/Iris/issues/328)) — ✅ Concluído
  - `test(storybook): runner em instalação limpa Windows` ([#341](https://github.com/romulosutil/Iris/issues/341))

---

## 🔒 4. Quadro Geral de Decisões Fechadas

| #     | Decisão de Produto & Engenharia             | Decisão Homologada pelo Rômulo           | Impacto Arquitetural                                                                                                |
| :---- | :------------------------------------------ | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **1** | **Cobrança Deletada no Painel Asaas (D41)** | **Manter Bloqueio Seguro**               | Se cobrança for apagada no gateway, o app exibe "fale com o suporte" para não ressuscitar cobrança indevida.        |
| **2** | **Reativação de Conta (#310)**              | **Pagamento Único (Valor Total)**        | Na reativação (inclusive pós-inadimplência), o QR Code do Pix assume o valor consolidado da dívida em um único ato. |
| **3** | **Auditoria de Corte por Carência (D34)**   | **Aprovado (`audit_log` + `exit 1`)**    | Cancelamento por inadimplência emite evento formal em `audit_log` e o job noturno alerta falhas no exit code.       |
| **4** | **Erros Internos no Backstop (D39)**        | **Persistir Código G6**                  | Gravar o código cru de recusas G6 para que o backstop de D+7 não penalize a clínica por falhas internas.            |
| **5** | **Escopo da UI de Faturamento (D36)**       | **Opção B (Separar)**                    | D36 foca na faixa de alerta urgente de recusa na UI; histórico detalhado de retentativas vira issue dedicada.       |
| **6** | **Discriminador de Webhook (#289)**         | **Por Presença de `paymentInstruction`** | Discriminar mensalidade vs. ativação inicial de R$ 0,01 fail-closed pela presença da instrução.                     |
| **7** | **Retentativas Extradias (#322)**           | **Excluir G7 (Apenas Saldo / G2)**       | Retentativas automáticas em dias posteriores reservadas exclusivamente para recusa por falta de saldo.              |
