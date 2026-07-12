# Iris

SaaS para clínicas de terapia infantil (foco inicial: intervenção para TEA no
Brasil). O produto substitui o preenchimento manual de planilhas de protocolos
clínicos por um diário de sessão em linguagem natural, do qual uma IA extrai
evidências estruturadas que o terapeuta revisa e aprova.

**Proposta de valor:** "chegue na avaliação com o dossiê pronto" — a IA nunca
pontua protocolos; ela acumula evidências rastreáveis que abastecem a decisão
clínica humana.

## Princípios inegociáveis

1. O texto livre do diário é a fonte da verdade; dados estruturados são derivados
   e rastreáveis à frase de origem.
2. Governança em 3 camadas: IA sugere → terapeuta aprova → coordenador valida por
   exceção e pode reclassificar (versionado, com justificativa).
3. Evidência ≠ pontuação formal: marcos são pontuados por humanos em janelas de
   avaliação; o sistema sinaliza "candidatos".
4. A meta individualizada (PEI) é a unidade central; o protocolo é a régua.
5. Protocolo é dado, não código: o agente é genérico; VB-MAPP é só a primeira
   instância.
6. Linha do tempo reconstruível: evidências são eventos imutáveis — snapshot em
   qualquer sessão, delta por sessão, trajetória com evolução/estagnação/regressão.
7. Modelo organizacional é grafo M:N com vigência (coordenadores↔terapeutas↔pacientes).
8. LGPD para dados de menores: consentimento na admissão, auditoria imutável,
   métricas transparentes (anti-vigilância).

## Estrutura da documentação

| Caminho                                           | Conteúdo                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prompts/serie-de-prompts.md`                | Contexto do projeto (Bloco 0) + série de 4 prompts encadeados para gerar: modelo de dados, agente, UX flows e stack/plano. **Comece por aqui.**                                                                                           |
| `docs/agente/protocolos-e-agente.md`              | Documento completo: catálogo dos 10 protocolos, formato canônico de contexto, instruções, schema, golden example e validação                                                                                                              |
| `docs/agente/system-instructions.md`              | System prompt do agente de extração (R1-R19), pronto para uso                                                                                                                                                                             |
| `docs/agente/output-schema.json`                  | JSON Schema de saída (structured outputs)                                                                                                                                                                                                 |
| `docs/agente/contexto-exemplo.json`               | Exemplo do contexto por paciente que o backend monta para o agente                                                                                                                                                                        |
| `docs/agente/golden-example-output.json`          | Saída esperada do diário-exemplo (caso de teste nº 1)                                                                                                                                                                                     |
| `docs/agente/casos-de-teste.md`                   | Casos de teste 2-8 (cenários A-C formalizados em JSON + 4 casos novos: sem evidências, ambíguo, regressão, erro de transcrição) + pipeline de extração                                                                                    |
| `docs/agente/agente-2-relatorio-familia.md`       | Segundo agente: gerador do relatório para a família — regras de tom, schema, casos de teste                                                                                                                                               |
| `docs/dados/modelo-de-dados.md`                   | Modelo de domínio, diagrama ER, DDL PostgreSQL das tabelas críticas, RLS multi-tenant e event-sourcing da linha do tempo                                                                                                                  |
| `docs/legal/validacao-legal-prontuario.md`        | Pesquisa de requisitos legais (CFP/COFFITO/CFFa, LGPD, hospedagem): o que tem certeza documental vs. o que precisa de parecer jurídico                                                                                                    |
| `docs/governanca/validacao-coordenador.md`        | Regras V1-V5 de reclassificação + checklists de erro clássico por protocolo                                                                                                                                                               |
| `docs/pesquisa/pesquisa-simulada.md`              | Painel simulado (11 personas), 10 temas com confiança, roteiros para pesquisa real pós-MVP                                                                                                                                                |
| `docs/produto/mapa-jornadas-gaps.md`              | Cobertura do ciclo de vida completo, auditoria do dia terapêutico e gaps com destino                                                                                                                                                      |
| `docs/produto/modelo-de-negocio.md`               | Modelo de negócio: preço por paciente ativo, 3 tiers, concorrência real (jul/2026), GTM e métricas                                                                                                                                        |
| `docs/ux/fluxos-e-wireframes.md`                  | User flows (Mermaid), wireframes, estados de UI e microcopy pt-BR da jornada do terapeuta e do coordenador                                                                                                                                |
| `docs/arquitetura/stack-e-plano-de-construcao.md` | Stack justificada, o que não usar ainda, plano de construção (Fase 0.5 + Fases 1-6) e checklist de LGPD mínimo viável                                                                                                                     |
| `docs/arquitetura/plano-bootstrap-e-stack-vps.md` | Pivô de hospedagem para VPS Hostinger + Easypanel + **Postgres puro** (não Supabase); redefine deploy/Docker/LGPD, estrutura de pastas feature-first e a sequência de bootstrap até a Fase 0.5. **Ler antes de qualquer setup de infra.** |
| `docs/ux/design-system-espectro-brutal.md`        | Design system (codinome interno "Espectro Brutal"): tokens, princípios e os 3 componentes base — implementado na Fase 0.5, antes da Fase 1                                                                                                |
| `docs/ux/inventario-componentes.md`               | Componentes de UI previstos por fase (levantados de `fluxos-e-wireframes.md`) — consultar antes de estilizar algo novo em qualquer fase; regra de nunca hardcodear componente está em `HANDOFF-FASE1.md` seção 0                          |
| `BACKLOG.md`                                      | O que ainda falta ser feito                                                                                                                                                                                                               |
| `HANDOFF-FASE1.md`                                | Briefing de início de construção para a sessão de Claude Code CLI que vai codar a Fase 1                                                                                                                                                  |
| `docs/legal/briefing-para-advogado.md`            | Consolidado de pontos jurídicos em aberto, formatado para revisão informal por advogado                                                                                                                                                   |

## Como usar a série de prompts

Cole o Bloco 0 de `docs/prompts/serie-de-prompts.md` no início de cada sessão de
trabalho com o Claude, depois rode os Prompts 1→4 em ordem, encadeando os outputs.
O Prompt 2 já tem implementação de referência em `docs/agente/` — critique e
refine, não recomece.

> ⚠️ **Pivô de hospedagem em avaliação (09/07/2026):** a stack de deploy
> (Vercel + Supabase gerenciado) migra para **VPS Hostinger + Easypanel +
> Postgres puro** (não Supabase; auth in-app + MinIO) — ver
> `docs/arquitetura/plano-bootstrap-e-stack-vps.md`.
> Produto, modelo de dados, RLS e plano de fases não mudam.

## Estado atual (atualizado 11/07/2026)

O projeto está com a construção em andamento, com as fases de infraestrutura, auth, multi-tenancy e o cadastro clínico executadas com sucesso (até a Fase 1c):

* **Fase 0.5 (Design System)**: Componentes base (Botão, Card, Alerta) implementados no Storybook sob o conceito Espectro Brutal com testes de acessibilidade (axe) e temas.
* **Fase 1a & 1b (Fundação de Dados, Auth & Multi-tenancy)**: Isolamento multi-tenant robusto com duas conexões no Postgres (`iris_app` sob RLS e `iris_auth` para session bootstrap), login via Better-Auth, e políticas de RLS testadas contra recursão e vazamento de dados.
* **Fase 1c (Cadastro Clínico)**: Implementação da separação entre cadastro administrativo e clínico (coordenador-only, sob a nova action `criarPacienteEConsent` com LGPD atômico), vinculação de protocolos, equipe de cuidado (vigência histórica) e convite de equipe por senha temporária em tela.
* **Melhorias**: Enriquecimento do Design System com 12 novos componentes (Radix headless para WAI-ARIA) no branch `melhoria-design-system`.

**Próximo passo:** Fase 1d (Agenda Mínima + Check-in, sob a Issue #11).
