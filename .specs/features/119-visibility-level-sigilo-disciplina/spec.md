# #119 — `visibility_level`: sigilo profissional por disciplina no prontuário multidisciplinar

> Spec fechada por Tech Lead em 24/08/2026. Nenhum item "a validar" — pré-requisito de
> handoff `AGENTS.md` §5.2. Decisões de produto travadas com o Rômulo nesta sessão.

## Contexto normativo já travado (não reabrir)

`docs/agente/protocolo-terapia-convencional.md` §8.5 (AV-6, decisão do dono de 29/07/2026)
aponta a implementação em RLS **para esta issue**:

- Camada 3 (coordenação/supervisão) vê por padrão **apenas** o `alerta_risco` e os
  **metadados da sessão** (data, terapeuta, existência ou não de alerta).
- **Não** vê o corpo do resumo/nota, nem temas, nem padrão de participação verbal.
- Acesso ao corpo só em duas hipóteses: **escalonamento pelo próprio psicólogo** que
  atende, ou **exigência legal**. Ambas **sempre auditadas**.
- Efeito colateral aceito e explícito: a auditoria de qualidade da Camada 3 fica mais
  dependente de `alerta_risco`. É troca consciente de auditabilidade por sigilo.

A issue original cita "Resolução CFP 009/2024". Esse número **não está verificado** neste
repo (`docs/legal/briefing-duty-to-warn.md` Anexo A.1 mapeia 001/2009, 06/2019, 010/2005).
Regra vigente da #110: **nenhuma copy user-facing cita número de resolução** até
confirmação profissional. Vale para toda a UI desta issue.

## Requisitos

| ID | Requisito |
|----|-----------|
| R1 | `session_note` ganha `visibility_level` ∈ {`multidisciplinary`, `discipline_only`}, NOT NULL, DEFAULT `multidisciplinary`. |
| R2 | Nota `discipline_only` é legível **só** por: (a) o terapeuta da sessão; (b) usuário com `care_team_membership` vigente naquele paciente cuja `disciplina` = `session.disciplina`. |
| R3 | Coordenador **perde** a visibilidade blanket sobre nota `discipline_only`. Não há break-glass nesta issue. |
| R4 | Quem não pode ler **não vê a linha** (RLS filtra a linha inteira). Data da sessão, terapeuta e presença seguem visíveis porque vivem em `session`, que não é tocada. |
| R5 | Todo artefato derivado do texto da nota herda a mesma barreira: `extraction` (linha inteira), `audio_capture` (linha inteira), `alerta_risco_clinico.trecho_fonte` (só a coluna). |
| R6 | Alerta de risco de sessão sigilosa **continua visível** ao coordenador/RT em categoria, severidade, certeza, prazo, detalhe e status — **sem** `trecho_fonte`. O trilho de escalonamento da #101 não pode quebrar. |
| R7 | Só o autor da nota escreve/alterna `visibility_level`, e só enquanto o prontuário da sessão não estiver em somente-leitura (`app_prontuario_somente_leitura_por_sessao`). |
| R8 | Toda transição de `visibility_level` emite 1 linha em `audit_log`. |
| R9 | A exportação do acervo (#374) declara no manifesto quantas linhas foram omitidas por sigilo — nunca omite em silêncio. |
| R10 | Nenhuma copy user-facing cita número de resolução do CFP (#110). |

## Fora de escopo (issue própria)

- **Escalonamento**: psicólogo libera nota X para supervisão, com prazo, revogação e
  auditoria. É a 1ª hipótese do §8.5 e é onde mora o `audit_log` de leitura autorizada.
- **Exigência legal**: quebra por `is_super_admin`, 2ª hipótese do §8.5.
- **Catálogo fechado de disciplina** (hoje `text` livre em 5 tabelas).
