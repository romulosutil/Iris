# 🏛️ Documentação Arquivada & Legada — Iris (`docs/archive/`)

> **Finalidade:** Este diretório armazena documentos históricos, especificações substituídas (*superseded*), propostas de design descontinuadas e memórias de cálculo de fases anteriores do projeto **Iris**.

---

## 🔒 Regras de Governança de Documentos Arquivados

1. **Blindagem contra Agentes de IA:**
   - Todo este diretório (`docs/archive/`) é explicitamente ignorado pelos agentes de IA (`.claudeignore`, `.geminiignore`, `.antigravityignore`, `.codexignore`, `.ignore`).
   - Isso impede que agentes consumam tokens com documentação morta ou alucinem convenções arquiteturais já revogadas (como chamadas diretas a `current_setting`, integração de Mercado Pago ou regras de trial desatualizadas).

2. **Isolamento de Build & Docker:**
   - Conforme configurado em `.dockerignore` e testado em `src/lib/legal.test.ts`, nenhum arquivo deste diretório entra na imagem de produção Docker.

3. **Imutabilidade & Formatação:**
   - Este diretório está listado em `.prettierignore` para evitar que rotinas automáticas de lint/formatação alterem arquivos históricos.

4. **Marcação Obrigatória de Arquivo Arquivado:**
   - Todo documento movido para cá deve conter o seguinte cabeçalho de aviso no topo:
   ```markdown
   > ⚠️ **DOCUMENTO ARQUIVADO / SUPERSEDED (DD/MM/AAAA)**  
   > **Motivo:** Substituído por [Nome do Documento / Issue / Migração].  
   > Este arquivo é mantido estritamente como registro histórico. Não utilizar para implementação ativa.
   ```

---

## 🗂️ Índice de Conteúdo Arquivado

| Arquivo / Subdiretório | Descrição | O que substituiu este documento |
| :--- | :--- | :--- |
| [`handoff-fase1.md`](handoff-fase1.md) | Briefing de início e handoff da Fase 1 (jul/2026). | Evolução natural do MVP (Fases 1 a 6). |
| [`historico-backlog.md`](historico-backlog.md) | Histórico de entregas e checkpoints de sessões anteriores. | [`BACKLOG.md`](../../BACKLOG.md) e [`docs/GO_LIVE.md`](../GO_LIVE.md). |
| [`specs/2026-08-03-issue-36-billing-mercadopago-legado.md`](specs/2026-08-03-issue-36-billing-mercadopago-legado.md) | Antiga spec de billing e checkout via Mercado Pago. | Migração `0091_drop_webhook_mercado_pago.sql`, Débito D24 e Asaas Pix Automático ([`docs/GO_LIVE.md`](../GO_LIVE.md)). |
