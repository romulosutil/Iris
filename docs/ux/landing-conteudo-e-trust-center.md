# Conteúdo Base e Diretrizes para Landing Page & Trust Center — Iris

> 📄 **Objetivo do Documento**: Servir como artefato centralizador e evolutivo de copy, posicionamento, comunicação de segurança (Trust & Safety), selos e conformidade LGPD para a Landing Page e interfaces do produto **Iris**.

---

## 1. Posicionamento e Proposta de Valor

### Hero Section (Cabeçalho de Impacto)

- **Título Principal**: A Plataforma de Prontuário, Gestão e IA Clínica Feita para Atendimento Neurodivergente.
- **Subtítulo**: Consolidação de evidências, acompanhamento de PEI, relatórios automatizados para convênios e famílias — tudo sob o mais rigoroso padrão de proteção de dados (LGPD).
- **CTAs Primários**:
  - `[Agendar Demonstração]`
  - `[Conhecer a Segurança dos Dados]` (Link direto para a seção/página de segurança)

### Os 4 Pilares do Produto

1. **Registro Clínico Estruturado**: Agenda, presenças, evoluções e metas de PEI em uma interface brutalista, rápida e acessível.
2. **IA Auxiliar com Guardrails**: Extração automática de evidências com zero alucinação e validação obrigatória pelo coordenador clínico.
3. **Relatórios Automáticos & Honestos**: Dossiês para convênios (bruto e narrativo) e relatórios de progresso em linguagem acessível para as famílias.
4. **Privacidade e Proteção de Dados por Design (Privacy by Design)**: Arquitetura multi-tenant com isolamento estrito no banco de dados e criptografia de ponta a ponta.

---

## 2. Comunicação de Segurança, Privacidade & LGPD (Trust & Safety)

### 2.1. Níveis de Segurança do Iris (Status Transparente)

Para gerar confiança real em clínicas e famílias sem promessas irrealistas, a segurança do Iris é comunicada através de um **Roadmap Transparente de Segurança**:

#### 🟢 Níveis Concluídos e Ativos (Implementados em Produção)

- **Isolamento de Dados Multi-tenant (Row Level Security - RLS)**:
  - Políticas no banco de dados PostgreSQL que garantem que uma clínica jamais acesse dados de outra clínica.
- **Criptografia em Trânsito e em Repouso**:
  - **Em trânsito**: HTTPS / TLS 1.3 obrigatório para todas as conexões.
  - **Em repouso**: Criptografia AES-256 no banco de dados e armazenamento de arquivos.
- **Autenticação Forte & Enforce de MFA (Dois Fatores)**:
  - Autenticação via TOTP (App Autenticador) para papéis clínicos (Coordenadores e Terapeutas) com códigos de backup.
- **Trilha de Auditoria Imutável (Audit Log)**:
  - Registro imutável de acessos, visualizações, alterações e exportações de dados clínicos e cadastrais.
- **IA Ética e Privada (Zero Training Policy)**:
  - Os dados dos prontuários e pacientes **nunca são utilizados para treinamento** de modelos públicos de inteligência artificial (Anthropic / OpenAI).
- **Backup Cifrado Off-site & Resiliência (DRP)**:
  - Réplica diária off-site cifrada com chave assimétrica (`age`), retenção auditada e testes de restauração verificados.

#### 🟡 Níveis em Andamento & Roadmap Futuro

- **Certificação ISO 27001 / SOC 2 Type II** (Planejado para fase pós-piloto).
- **Penetration Test (Pentest) Anual por Consultoria Independente**.
- **Relatório Dinâmico de Impacto à Proteção de Dados (RIPD)** baixável pelo administrador da clínica.

---

## 3. Matriz de Selos e Badges Autorais (Iris Trust System)

Evitamos selos genéricos "comprados" de terceiros. Utilizamos **selos autorais alinhados ao Design System Espectro Brutal**:

| Badge / Selo                     | Descrição / Copy                                              | Aplicação                                    |
| :------------------------------- | :------------------------------------------------------------ | :------------------------------------------- |
| 🛡️ **LGPD Compliant**            | Adequado à LGPD (Art. 11 e 14 — Dados Sensíveis e de Menores) | Landing Page (Hero e Footer), Modal de Login |
| 🔒 **AES-256 & TLS 1.3**         | Criptografia ativa de ponta a ponta                           | Rodapé, Telas de Prontuário                  |
| 👁️‍🗨️ **RLS Multi-tenant Isolated** | Isolamento de dados no banco de dados                         | Página `/seguranca`, Apresentações B2B       |
| 🤖 **Privacy-First AI**          | IA auxiliar sem retenção ou treinamento com dados do paciente | Seção de Recursos de IA                      |
| 🔑 **MFA Enforced**              | Proteção reforçada por autenticação de 2 fatores              | Tela de Login, Configurações de Perfil       |

---

## 4. Especificação da Página Dedicada: `/seguranca` (Trust Center)

A ser criada em `src/app/(public)/seguranca/page.tsx` com 4 seções principais:

1. **Privacidade e Direitos do Titular**: Como o Iris lida com dados de menores, o papel de Controlador vs Operador, e como solicitar exportação/expurgo de dados.
2. **Arquitetura Técnica de Segurança**: Detalhes sobre o Row Level Security (RLS), isolamento por tenant e criptografia.
3. **Governança de Inteligência Artificial**: Como a IA auxilia o terapeuta mantendo o controle humano (_Human-in-the-loop_) e a privacidade dos dados.
4. **Infraestrutura e Continuidade**: Política de backups, retenção legal de prontuários (regra 18 anos / alta + 10 anos) e desastre recovery.

---

## 5. Propostas de Melhoria de UI/UX (Backlog de Interface)

Identificamos a oportunidade de integrar indicadores visuais de segurança nas telas do sistema:

### 💡 Issue de UI 1: Trust Indicators na Tela de Login (`/(auth)/login`)

- **Descrição**: Adicionar badges sutis de segurança no rodapé da caixa de login.
- **Elementos**:
  - Badge `LGPD Compliant`.
  - Badge `Conexão Criptografada TLS 1.3`.
  - Micro-copy: _"Dados clínicos protegidos por criptografia e isolamento multi-tenant."_

### 💡 Issue de UI 2: Indicador de Proteção no Cabeçalho do Prontuário (`/(app)/pacientes/[id]`)

- **Descrição**: Inserir uma pílula/badge de status de segurança no topo de prontuários e sessões.
- **Elementos**:
  - Ícone de cadeado + texto discreto: `🔒 Dados Criptografados (RLS Ativo)`.
  - Tooltip explicativo ao passar o mouse: _"Este prontuário está visível apenas para a equipe autorizada desta clínica."_

### 💡 Issue de UI 3: Painel de Governança & Segurança da Clínica (`/(app)/configuracoes/seguranca`)

- **Descrição**: Criar um painel para o Coordenador visualizar o status de segurança da clínica.
- **Elementos**:
  - Status da Autenticação MFA da equipe (quantos terapeutas ativaram 2FA).
  - Atalho para visualizar os Logs de Auditoria de Acesso da clínica.
  - Download do Termo de Governança e Criptografia.

---

_Documento criado para aprofundamento e iteração contínua do conteúdo da Landing Page e sinalizadores de confiança do Iris._
