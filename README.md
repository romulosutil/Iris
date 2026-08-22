# Iris

SaaS para clínicas de terapia, saúde mental e intervenção multidisciplinar (intervenção comportamental para TEA/desenvolvimento infantil, TCC para adolescentes e adultos, Fonoaudiologia e Terapia Ocupacional). O produto substitui o preenchimento manual de planilhas e formulários rígidos por um diário de sessão em linguagem natural, do qual uma IA extrai evidências estruturadas que o terapeuta revisa e aprova individualmente.

**Proposta de valor:** "chegue na avaliação com o dossiê pronto" — a IA nunca pontua protocolos nem decide; ela acumula evidências rastreáveis que abastecem a decisão clínica humana.

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

| Caminho                                                 | Conteúdo                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prompts/serie-de-prompts.md`                      | Contexto do projeto (Bloco 0) + série de 4 prompts encadeados para gerar: modelo de dados, agente, UX flows e stack/plano. **Comece por aqui.**                                                                                             |
| `docs/agente/protocolos-e-agente.md`                    | Documento completo: catálogo dos 10 protocolos, formato canônico de contexto, instruções, schema, golden example e validação                                                                                                                |
| `docs/agente/system-instructions.md`                    | System prompt do agente de extração (R1-R19), pronto para uso                                                                                                                                                                               |
| `docs/agente/output-schema.json`                        | JSON Schema de saída (structured outputs)                                                                                                                                                                                                   |
| `docs/agente/contexto-exemplo.json`                     | Exemplo do contexto por paciente que o backend monta para o agente                                                                                                                                                                          |
| `docs/agente/golden-example-output.json`                | Saída esperada do diário-exemplo (caso de teste nº 1)                                                                                                                                                                                       |
| `docs/agente/casos-de-teste.md`                         | Casos de teste 2-8 (cenários A-C formalizados em JSON + 4 casos novos: sem evidências, ambíguo, regressão, erro de transcrição) + pipeline de extração                                                                                      |
| `docs/agente/agente-2-relatorio-familia.md`             | Segundo agente: gerador do relatório para a família — regras de tom, schema, casos de teste                                                                                                                                                 |
| `docs/agente/protocolo-tcc.md`                          | Especificação clínica do nicho TCC: registro de pensamentos, PHQ-9/GAD-7, tarefa de casa, regra de alerta de risco, achados de validação                                                                                                    |
| `docs/agente/rpd-desenho-de-formulario.md`              | Formulário humano do registro de pensamentos: distorção cognitiva **opcional**, evidências a favor/contra como núcleo, regra de completude, taxonomia por clínica                                                                           |
| `docs/agente/protocolo-terapia-convencional.md`         | Nicho generalista (psicodinâmica, humanista-existencial, sistêmica): contrato próprio de saída e regras R1-TC..R9-TC                                                                                                                        |
| `docs/agente/regra-alerta-risco.md`                     | Ideação suicida/autolesão: gatilhos, prazos de notificação e escalonamento interno, fila dedicada, e a decisão de nunca notificar externo                                                                                                   |
| `docs/dados/modelo-de-dados.md`                         | Modelo de domínio, diagrama ER, DDL PostgreSQL das tabelas críticas, RLS multi-tenant e event-sourcing da linha do tempo                                                                                                                    |
| `docs/legal/validacao-legal-prontuario.md`              | Pesquisa de requisitos legais (CFP/COFFITO/CFFa, LGPD, hospedagem): o que tem certeza documental vs. o que precisa de parecer jurídico                                                                                                      |
| `docs/governanca/validacao-coordenador.md`              | Regras V1-V5 de reclassificação + checklists de erro clássico por protocolo                                                                                                                                                                 |
| `docs/pesquisa/pesquisa-simulada.md`                    | Painel simulado (11 personas), 10 temas com confiança, roteiros para pesquisa real pós-MVP                                                                                                                                                  |
| `docs/produto/mapa-jornadas-gaps.md`                    | Cobertura do ciclo de vida completo, auditoria do dia terapêutico e gaps com destino                                                                                                                                                        |
| `docs/produto/modelo-de-negocio.md`                     | Modelo de negócio: precificação marginal por ficha ativa, oferta unificada, concorrência real (jul/2026), GTM e métricas                                                                                                                    |
| `docs/ux/fluxos-e-wireframes.md`                        | User flows (Mermaid), wireframes, estados de UI e microcopy pt-BR da jornada do terapeuta e do coordenador                                                                                                                                  |
| `docs/arquitetura/stack-e-plano-de-construcao.md`       | Stack justificada, o que não usar ainda, plano de construção (Fase 0.5 + Fases 1-6) e checklist de LGPD mínimo viável                                                                                                                       |
| `docs/arquitetura/plano-bootstrap-e-stack-vps.md`       | Pivô de hospedagem para VPS Hostinger + Easypanel + **Postgres puro** (não Supabase); redefine deploy/Docker/LGPD, estrutura de pastas feature-first e a sequência de bootstrap até a Fase 0.5. **Ler antes de qualquer setup de infra.**   |
| `docs/arquitetura/modalidades-clinicas-e-abordagens.md` | Como o produto separa modelo de registro clínico (ABA / TCC / convencional) de protocolos ativos e de família de abordagem; roteamento de navegação e de prompt do agente                                                                   |
| `docs/arquitetura/checklist-producao-mvp.md`            | Checklist de aceite do MVP (Fase 6.6): critério verificável de "pronto para piloto", rastreia hardening/retenção/família + gates legais/infra. Áudio (6.4/6.5) é fast-follow gated por DPA.                                                 |
| `docs/ux/design-system-espectro-brutal.md`              | Design system (codinome interno "Espectro Brutal"): tokens, princípios e os 3 componentes base — implementado na Fase 0.5, antes da Fase 1                                                                                                  |
| `docs/ux/inventario-componentes.md`                     | Componentes de UI previstos por fase (levantados de `fluxos-e-wireframes.md`) — consultar antes de estilizar algo novo em qualquer fase; regra de nunca hardcodear componente está em `docs/archive/handoff-fase1.md` seção 0               |
| `BACKLOG.md`                                            | O que ainda falta ser feito                                                                                                                                                                                                                 |
| `docs/archive/handoff-fase1.md`                         | Registro histórico do briefing de início da Fase 1 (preservado para auditoria do handoff inicial)                                                                                                                                           |
| `docs/legal/briefing-para-advogado.md`                  | Consolidado de pontos jurídicos em aberto, formatado para revisão informal por advogado                                                                                                                                                     |
| `docs/legal/dpa-asr-audio.md`                           | DPA e gating de áudio (ASR externo): transferência internacional Art. 33 específica do áudio, retenção 7 dias do áudio bruto, feature flag que mantém ASR real desabilitado até DPA assinado. Predecessor legal de 6.4/6.5.                 |
| `docs/legal/termo-consentimento-titular-adulto.md`      | Termo de consentimento do **titular adulto capaz** que autoconsente (LGPD Art. 7º I e 11 I) — versão `adulto-v1`. Complementa o regime de menor (Art. 14) das políticas. Caminho crítico dos nichos Terapia Convencional (#98) e TCC (#99). |

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

## Estado atual (atualizado 21/08/2026)

O desenvolvimento do MVP do Iris está concluído (Fases 0.5 a 6.6) e a Fase 7 (Faturamento & Growth) está ativa com deploy em produção:

- **Fase 0.5 a Fase 6 (MVP Completo)**: Fundação de dados, auth multi-tenant (Better-Auth + RLS), cadastro clínico (LGPD atômico), agenda & check-in, metas & diário em texto livre, extração de evidências por IA, visualização de gráficos/trajetórias, relatórios para convênio/supervisão e hardening LGPD (arquivamento automático, auditoria e consentimento) concluídos com sucesso.
- **Fase 7 (Self-Service & Faturamento Asaas)**: Faturamento via Asaas (Fases A, B e C) totalmente implementado, testado e verificado com webhooks reais entregues em produção. Auto-arquivamento (90 dias) e desarquivamento automático unificado (#174) com cobertura por testes de integração e RLS.
- **Marco Zero & Anamnese (#407 / #409)**: Anamnese clínica validada gerando snapshot 0 e linha de base do protocolo na linha do tempo, com ponto de entrada no prontuário do paciente.
- **Navegação & Configurações da Clínica (#411)**: Sub-navegação via abas em `/clinica` (`/clinica/dados`, `/clinica/feriados`, `/clinica/emergencia`) e atalhos diretos para dashboards de protocolos e PEI.
- **Guardrail Ambiental no Seed (D52 / #412)**: Bloqueio fail-closed para proteção contra execução de scripts de seed em ambientes de staging/produção sem consentimento explícito.
- **E-mail Transacional**: Integração com Resend para envio de convites e notificações ativada (#126).

**Próximos passos:** Fase 6b (Iris Audio Companion / ASR - fast-follow gated por DPA) e Customização White-Label nos PDFs (#120).
