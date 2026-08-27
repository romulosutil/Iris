# Termo de Governança e Criptografia — Iris

> **Status:** Gate 3 da #454. Redação aprovada por Rômulo em 26/08/2026 (Gate 2), com base em medição direta — ver `docs/arquitetura/levantamento-controles-de-seguranca.md` para comando + saída de cada item.
>
> **Este documento descreve o estado real da infraestrutura.** Não é certificação de terceiro, não é auditoria externa, e não promete controle que ainda não existe. Cláusulas de terceiro (provedores de IA) estão marcadas como tal.

## 1. Objetivo

Documento entregável a convênios, auditorias e famílias descrevendo os controles de segurança e privacidade da plataforma Iris, na medida em que são medidos e verificáveis nesta versão.

## 2. Conexões e transporte

Conexões públicas usam TLS 1.2 ou superior (preferencialmente TLS 1.3).

## 3. Isolamento entre clínicas

Isolamento multi-tenant garantido por Row-Level Security (RLS) no Postgres, coberto por suíte automatizada (126 arquivos, 1103 testes) no CI. Toda leitura e escrita de dado de paciente passa por policy de banco que resolve a clínica do usuário autenticado — não é regra de aplicação, é regra de banco.

## 4. Backup e retenção

Backups diários, cifrados (`age`) antes do envio off-site. Retenção de 30 dias auditada diariamente pelo script (zero objetos vencidos observados em 33 dias de operação); regra de lifecycle do bucket não confirmada diretamente no console.

## 5. Provedores de inteligência artificial (garantia de terceiro)

Os provedores de IA usados (Anthropic, Google) mantêm política própria de não-treino em uso comercial, conforme contrato vigente com cada provedor. Esta é uma garantia contratual do provedor, não um controle implementado pela plataforma Iris.

## 6. Base legal LGPD

Bases legais dos Art. 11 e 14 identificadas e documentadas (consentimento do titular, tutela da saúde, consentimento de responsável para menor) — ver `politica-privacidade.md` e `politica-retencao-dados.md`.

## 7. O que este termo não afirma

- Não afirma cifragem em repouso (disco/volume) — não implementada nesta versão.
- Não afirma "conformidade LGPD" como certificação — afirma bases legais documentadas.
- Não afirma auditoria externa de nenhum item acima.

## 8. Histórico de aprovação

- Gate 1 (medição): `docs/arquitetura/levantamento-controles-de-seguranca.md`, 24–26/08/2026.
- Gate 2 (aprovação da redação): Rômulo, 26/08/2026.
- Gate 3 (este documento): criado 26/08/2026.
