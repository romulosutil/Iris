# 🗺️ IRIS — Roadmap Canônico de Operação & Evolução Contínua

> **Documento Mestre de Governança, Lançamento & Roadmap Pós-Go-Live**  
> **Status:** Ativo / Em Produção  
> **Última Atualização:** 21/08/2026  
> **Ordem de Prioridade Inegociável:** `Segurança & Compliance` $\rightarrow$ `Features de Produto` $\rightarrow$ `Saúde & Performance` $\rightarrow$ `Expansão & Escala`

---

## 🎯 1. Visão Geral & Estado do Produto

O **Iris** é um SaaS especializado para clínicas de terapia infantil (intervenção comportamental para TEA / ABA / TCC) baseado na **Governança Clínica em 3 Camadas**:

1. **IA Sugere:** Derivação estruturada a partir do diário de sessão em linguagem natural (rastreabilidade frase-a-frase).
2. **Terapeuta Aprova:** Revisão humana obrigatória na interface (_Human-in-the-Loop_).
3. **Coordenadora Valida por Exceção:** Reclassificação auditada e versionada.

### Estado de Homologação em Produção:

- ✅ **Isolamento Multi-tenant (RLS):** 100% das policies utilizam `app_clinic_id_exigido()`.
- ✅ **Infraestrutura Easypanel:** Containers `iris-app`, `iris-billing`, `iris-escalonamento`, `iris-backup`, `iris-postgres`, `iris-redis` ativos e operacionais.
- ✅ **Faturamento Real:** Ativação de Pix Automático (`immediateQrCode`) e débito de mensalidade homologados com clínica real no Asaas em produção (fechando **D43** e **D44**).
- ✅ **Linha de Base & Anamnese:** Marco zero entregue e integrado à linha do tempo (fechando **Feature #407 / PR #408**).
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

| Item / Issue                                                     | Título & Escopo                                         | Por que importa                                                                                                                                                                                                           | Responsável / Ação            | Status                                                                    |
| :--------------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------- | :------------------------------------------------------------------------ |
| **D34**                                                          | **Auditoria no Corte por Inadimplência**                | O corte após 10 dias de carência é ato irreversível (revoga Pix no Asaas). Deve emitir `audit_log` atômico (`assinatura_cancelada_por_inadimplencia`) e fazer o job noturno falhar com `exit 1` em caso de erros em lote. | **Claude / Antigravity**      | Aberto (Decisão homologada)                                               |
| **D52**                                                          | **Guardrail de Ambiente nos Seeds**                     | Impede execução acidental de scripts de seed (`scripts/seed.ts` e `seed-demo-account.ts`) contra ambientes de staging/produção sem flag explícita `ALLOW_SEED_REMOTE=true`.                                               | **Claude / Antigravity**      | ✅ **Entregue ([PR #412](https://github.com/romulosutil/Iris/pull/412))** |
| **D53**                                                          | **Guardrail contra Injeção de Scripts em `layout.tsx`** | Teste de regressão de CI (`src/app/layout.guard.test.ts`) para impedir commits contendo scripts de desenvolvimento local (`localhost:8400/live.js`).                                                                      | **Claude / Antigravity**      | ✅ **Entregue ([PR #413](https://github.com/romulosutil/Iris/pull/413))** |
| **Arcabouço Legal (docs/legal/)**                                | **Revisão Jurídica LGPD / Termos & Privacidade**        | Remoção de menções a RAG/treinamento de modelo com prontuário; produção do teste de proporcionalidade do legítimo interesse (Art. 10 LGPD) para `cpf_hash`; nomeação do Google Gemini sob DPA do Google Cloud.            | **Jurídico & Produto**        | ✅ **Concluído em 21/08/2026**                                            |
| **D55 / [#119](https://github.com/romulosutil/Iris/issues/119)** | **Sigilo da Psicologia no Prontuário Multidisciplinar** | Implementar `visibility_level` (`Multidisciplinary`/`Restricted_To_Discipline`) para notas confidenciais de psicólogos (Art. 9º CEPP e Res. CFP 001/2009).                                                                | Spec de Produto & RLS         | Aberto (Prioridade Alta)                                                  |
| **D57**                                                          | **Gating Operacional de IA (Gemini)**                   | Manter `EXTRACTION_LLM_ENABLED=false` até validação de billing pago ativo no Google Cloud e confirmação de enquadramento DPA standalone.                                                                                  | Engenharia & Operações        | Aberto (Pré-requisito IA real)                                            |
| **[#343](https://github.com/romulosutil/Iris/issues/343)**       | **Verificação de Grants RLS em `tcc_rpd_entry`**        | Garantir que o papel `app_role` tem permissões estritas sob RLS na tabela de RPD do TCC.                                                                                                                                  | Operacional (`psql` produção) | Aberto                                                                    |
| **[#89](https://github.com/romulosutil/Iris/issues/89)**         | **Retenção de Backup (30d) vs. Expurgo LGPD**           | Harmonizar política de descarte definitivo de dados expirados nos backups cifrados off-site da Oracle Cloud.                                                                                                              | Engenharia & Jurídico         | Aberto                                                                    |

---

## 🚀 PILAR 2 — Features de Produto & Experiência da Clínica (P2)

_Foco: Entregar clareza máxima na interface, reduzir atrito no dia a dia dos terapeutas e evitar bloqueios operacionais surpresa._

| Item / Issue                                                   | Título & Escopo                                                  | Por que importa                                                                                                                                                      | Responsável / Ação                  | Status                                                                                                                           |
| :------------------------------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **#407 / #409**                                                | **Anamnese Estruturada como Marco Zero**                         | Formulário de anamnese nos 6 eixos que gera linha de base do protocolo (snapshot 0) e alvos iniciais do PEI, sem cobrança indevida em `billing_apurar_ciclo`.        | **Claude / Antigravity**            | ✅ **Entregue ([PR #408](https://github.com/romulosutil/Iris/pull/408) & [#410](https://github.com/romulosutil/Iris/pull/410))** |
| **D31 / [#36](https://github.com/romulosutil/Iris/issues/36)** | **Página "Dados da Clínica" (`/clinica/dados`) e Sub-navegação** | Centralizar razão social, CNPJ, endereço e contatos fiscais fora da tela de assinatura com sub-navegação em abas (`TabsNav`).                                        | **Claude / Antigravity**            | ✅ **Entregue ([PR #411](https://github.com/romulosutil/Iris/pull/411))**                                                        |
| **D47**                                                        | **Sincronização de Fixtures e Contrato Convencional**            | Alinhamento do documento de protocolo e fixtures de teste para a estrutura unificada de `alerta_risco` e `temas: string[]`.                                          | **Claude / Antigravity**            | ✅ **Entregue ([PR #414](https://github.com/romulosutil/Iris/pull/414))**                                                        |
| **D36**                                                        | **Faixa de Alerta Urgente de Recusa na UI (`faixa-trial.tsx`)**  | Se o Pix Automático da clínica falhar por falta de saldo, exibir faixa no topo do app alertando o prazo de carência restante e instruindo ajuste de limite bancário. | **Claude / Antigravity** (Frontend) | Aberto                                                                                                                           |
| **D39**                                                        | **Persistência do Código Cru de Recusa G6**                      | Gravar `recusa_codigo` mesmo para erros internos G6, permitindo ao backstop de D+7 identificar defeito nosso e não penalizar a clínica.                              | **Claude / Antigravity** (Billing)  | Aberto                                                                                                                           |
| **D54**                                                        | **Remover side-stripe banida do componente `Alert`**             | Eliminar classe `border-l-[4px]` e propriedade `bordaEsquerda` de `src/components/ui/alert.tsx`, alinhando todos os alertas ao Design System.                        | **Claude / Antigravity**            | ✅ **Entregue**                                                                                                                  |
| **[#283](https://github.com/romulosutil/Iris/issues/283)**     | **Layout Mobile da Visão Matriz na Agenda**                      | Ajuste do grid de agendamentos para visualização fluida em telas < 375px (smartphones de terapeutas em campo).                                                       | Frontend / Jules                    | Aberto                                                                                                                           |
| **[#72](https://github.com/romulosutil/Iris/issues/72)**       | **Fase 6b — Ditado por Voz (Áudio + ASR)**                       | Transcrição automática de áudio de sessão via modelo com DPA médico assinado.                                                                                        | Roadmap / Pós-Piloto                | Gated por DPA                                                                                                                    |

---

## ⚙️ PILAR 3 — Saúde Operacional, Performance & Otimização (P3)

_Foco: Alta performance de banco, zero overhead em queries e observabilidade contínua de jobs de segundo plano._

| Item / Issue                                                     | Título & Escopo                                          | Por que importa                                                                                                               | Responsável / Ação      | Status                                                                    |
| :--------------------------------------------------------------- | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------------------------------------------------------------------------ |
| **[#328](https://github.com/romulosutil/Iris/issues/328)**       | **Cobertura de Testes Comportamentais do Proxy Matcher** | Suíte de testes em `src/middleware.test.ts` cobrindo rotas públicas, estáticas, webhooks e rotas protegidas sob autenticação. | **Claude / Jules**      | ✅ **Entregue ([PR #415](https://github.com/romulosutil/Iris/pull/415))** |
| **D40 / [#330](https://github.com/romulosutil/Iris/issues/330)** | **Eliminação de 3 N+1 em `materializarSnapshot`**        | Converter buscas sequenciais em `materializar.ts:319-320, 386-414, 418-428` para consultas em lote com `inArray()`.           | **Jules (Autônomo)**    | Aberto                                                                    |
| **[#383](https://github.com/romulosutil/Iris/issues/383)**       | **Webhook Resend de Bounce/Complaint**                   | Rota `src/app/api/webhooks/resend/route.ts` para capturar eventos de entrega de e-mails transacionais.                        | **Jules (Autônomo)**    | Aberto                                                                    |
| **[#293](https://github.com/romulosutil/Iris/issues/293)**       | **Job de Auto-Arquivamento (`iris-arquivamento`)**       | Provisionar container do cron no Easypanel para arquivar automaticamente fichas sem sessões há mais de 90 dias.               | Painel Easypanel        | Aberto                                                                    |
| **[#294](https://github.com/romulosutil/Iris/issues/294)**       | **Alarmes Automáticos de Falha de Jobs**                 | Disparo de alertas (webhook/e-mail) caso qualquer cron (`billing`, `escalonamento`, `backup`) falhe.                          | Infraestrutura & Sentry | Aberto                                                                    |
| **[#327](https://github.com/romulosutil/Iris/issues/327)**       | **Cobertura de Testes de Rate-Limit no Redefinir Senha** | Garantir oráculos rígidos de testes para throttle de redefinição de senha.                                                    | **Jules (Autônomo)**    | Aberto                                                                    |

---

## 🌟 PILAR 4 — Expansão & Recursos Avançados (P4 / Pós-Piloto)

_Foco: Diferenciação de mercado, enterprise features e escala da base de clientes._

| Item / Issue                                                     | Título & Escopo                                 | Por que importa                                                                                                                                          | Status          |
| :--------------------------------------------------------------- | :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- |
| **D9 / [#258](https://github.com/romulosutil/Iris/issues/258)**  | **Customização White-Label nos Laudos e PDFs**  | Personalização com logotipo, cores e cabeçalho oficial da clínica nos relatórios auditáveis.                                                             | Aguardando Spec |
| **D10 / [#259](https://github.com/romulosutil/Iris/issues/259)** | **Assinatura Digital ICP-Brasil A1/A3**         | Integração com certificados ICP-Brasil para relatórios de intervenção com exigência judicial/pericial.                                                   | Aguardando Spec |
| **D11 / [#260](https://github.com/romulosutil/Iris/issues/260)** | **Indexação RAG em Prontuários Históricos**     | Busca semântica e síntese longitudinal da evolução do paciente ao longo de múltiplos anos (condicionada a consentimento específico e anonimização LGPD). | Aguardando Spec |
| **[#185](https://github.com/romulosutil/Iris/issues/185)**       | **Empacotamento PWA & TWA (Google Play Store)** | Disponibilização do app na loja para tablets clínicos e uso offline com sincronização.                                                                   | Pós-MVP         |

---

## 🤖 3. Matriz de Atuação: Sessões Síncronas vs. Jules

Para garantir eficiência e máxima qualidade de código conforme `AGENTS.md` §4 e §5:

### 🔹 Claude Code / Antigravity (Sessões Síncronas / Arquitetura)

- Regras de negócio de Billing, RLS & Governança (D36, D34, D39, D55).
- Modificações de Schema Drizzle / Migrações PostgreSQL.
- Definição de Specs e fechamento de decisões antes de delegar.

### 🔹 Jules (Braço Executor Autônomo via GitHub Issues)

- **Critério:** Issues com escopo 100% delimitado, padrões de código pré-existentes e zero ambiguidade técnica.
- **Backlog Ativo para o Jules:**
  - `perf(evidence): três N+1 restantes em materializar.ts` ([#330](https://github.com/romulosutil/Iris/issues/330))
  - `feat(webhooks): webhook do Resend para log de bounces/complaints` ([#383](https://github.com/romulosutil/Iris/issues/383))
  - `test(redefinir-senha): chave e limites do throttle` ([#327](https://github.com/romulosutil/Iris/issues/327))
  - `fix(ui): remover border-l-[4px] no componente Alert (D54)`

---

## 🔒 4. Quadro Geral de Decisões Fechadas

| #      | Decisão de Produto & Engenharia             | Decisão Homologada pelo Rômulo           | Impacto Arquitetural                                                                                                 |
| :----- | :------------------------------------------ | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Cobrança Deletada no Painel Asaas (D41)** | **Manter Bloqueio Seguro**               | Se cobrança for apagada no gateway, o app exibe "fale com o suporte" para não ressuscitar cobrança indevida.         |
| **2**  | **Reativação de Conta (#310)**              | **Pagamento Único (Valor Total)**        | Na reativação (inclusive pós-inadimplência), o QR Code do Pix assume o valor consolidado da dívida em um único ato.  |
| **3**  | **Auditoria de Corte por Carência (D34)**   | **Aprovado (`audit_log` + `exit 1`)**    | Cancelamento por inadimplência emite evento formal em `audit_log` e o job noturno alerta falhas no exit code.        |
| **4**  | **Erros Internos no Backstop (D39)**        | **Persistir Código G6**                  | Gravar o código cru de recusas G6 para que o backstop de D+7 não penalize a clínica por falhas internas.             |
| **5**  | **Escopo da UI de Faturamento (D36)**       | **Opção B (Separar)**                    | D36 foca na faixa de alerta urgente de recusa na UI; histórico detalhado de retentativas vira issue dedicada.        |
| **6**  | **Discriminador de Webhook (#289)**         | **Por Presença de `paymentInstruction`** | Discriminar mensalidade vs. ativação inicial de R$ 0,01 fail-closed pela presença da instrução.                      |
| **7**  | **Retentativas Extradias (#322)**           | **Excluir G7 (Apenas Saldo / G2)**       | Retentativas automáticas em dias posteriores reservadas exclusivamente para recusa por falta de saldo.               |
| **8**  | **Provedor de IA de Extração (21/08/2026)** | **Google Gemini (Gemini API)**           | Nomeado formalmente nos termos e políticas; DPA do Google Cloud incorporado; gating até confirmações de D57.         |
| **9**  | **Foro de Eleição & Contrato (21/08/2026)** | **Guarapari / ES**                       | Fixado nos Termos de Uso §9, com prazo de aviso prévio de 30 dias (§8.4) e contato `notificacoes@irisclinica.ia.br`. |
| **10** | **Validação Jurídica (21/08/2026)**         | **Protocolo de Ratificação Mantido**     | Dr. Thiago Lyra lê os documentos e valida por ausência de apontamento, sem emissão de parecer formal avulso.         |
