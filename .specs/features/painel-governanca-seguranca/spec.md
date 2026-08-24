# Spec — Painel de Governança e Segurança da Clínica

> **Status**: Spec aprovada.
> **Origem**: Proposta §5 (Issue de UI 3) de `docs/ux/landing-conteudo-e-trust-center.md`.
> **Rota**: `/(app)/configuracoes/seguranca`

## 1. Problema & Motivação

O coordenador da clínica é responsável pela postura de segurança, privacidade e governança dos dados clínicos. Atualmente, a plataforma não oferece uma interface consolidada para que o coordenador possa:
1. Verificar a adesão da equipe ao Segundo Fator de Autenticação (MFA / 2FA).
2. Consultar os logs de auditoria de acesso e modificações clínicas da sua própria clínica (`audit_log`).
3. Gerar e baixar uma evidência oficial de governança e criptografia (Termo de Governança e Criptografia) para apresentar a convênios, auditorias ou famílias de pacientes.

## 2. Decisões de Projeto

### D1. Granularidade do Status de MFA
- **Decisão**: **Nominal** (lista nominal com Nome, E-mail, Papel e indicador de MFA Ativado/Pendente).
- **Justificativa**: O coordenador precisa identificar com precisão quais membros da equipe ainda não ativaram o 2FA para realizar a cobrança direta e manter o enquadramento da clínica no protocolo de segurança.

### D2. Modelo de Acesso e Leitura de Dados Sensíveis de Usuário (RLS & Security Definer)
- **Decisão**: A leitura do estado de 2FA dos usuários de uma mesma clínica será realizada através da função Postgres `SECURITY DEFINER` `app_obter_status_mfa_equipe()`.
- **Guards de Segurança**:
  - `app_clinic_id_exigido()`: Garante o isolamento estrito de tenant (somente membros com vínculo em `user_role` para a clínica ativa).
  - `app_user_role_exigido() = 'coordenador'`: Garante restrição absoluta ao papel de coordenador. Chamadas feitas por terapeutas ou outros papéis levantarão erro `P0001`.

### D3. Trilha de Auditoria da Clínica (`audit_log`)
- **Decisão**: Exibir visualmente os eventos de auditoria da clínica ativa ordenados por data decrescente.
- **Acesso**: A tabela `audit_log` já possui isolamento RLS por clínica (`clinic_id = app_clinic_id_exigido()`) restrito a coordenadores. A consulta em `queries.ts` buscará os eventos da clínica com paginação/limite.

### D4. Termo de Governança e Criptografia
- **Decisão**: Disponibilizar botão para baixar/visualizar o Termo de Governança e Criptografia da clínica em formato legível e auditável (Markdown/Texto/PDF).
- **Conteúdo**: Declaração contendo identificação da clínica, CNPJ/Razão Social, data de geração e detalhamento das camadas ativas: AES-256 em repouso, TLS 1.3 em trânsito, RLS Multi-tenant no Postgres, ciclo de backup cifrado off-site com retenção de 30 dias, política zero-treinamento de LLMs com dados de prontuário, e conformidade LGPD (Art. 11 e 14).

## 3. Critérios de Aceite

- [ ] Spec aprovada e registrada em `.specs/features/painel-governanca-seguranca/`.
- [ ] Acesso à página `/(app)/configuracoes/seguranca` restrito estritamente a coordenadores via `requireRole(ctx, "coordenador")`.
- [ ] Função `SECURITY DEFINER` `app_obter_status_mfa_equipe()` criada na migração SQL com guards `app_clinic_id_exigido()` e `app_user_role_exigido() = 'coordenador'`.
- [ ] Status de MFA listado de forma nominal para o coordenador.
- [ ] Atalho para o painel de governança e segurança adicionado na navegação principal (`AppLayout` / `AppHeader`).
- [ ] Visualização transparente dos logs de auditoria da clínica (`audit_log`).
- [ ] Geração e download do Termo de Governança e Criptografia funcionando.
- [ ] Teste de RLS e integração validando restrição de acesso e isolamento multi-tenant (`pnpm test:rls`).
