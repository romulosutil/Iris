# AGENTS.md — Iris

> Contrato operacional para qualquer agente de codificação (Claude Code ou
> outro) que trabalhe neste repositório. Intencionalmente agnóstico de
> ferramenta — o que é específico de sessões Claude Code está em
> `CLAUDE.md`, que referencia este arquivo em vez de duplicá-lo.

> ⚠️ **Pivô de hospedagem em avaliação (09/07/2026, não travado):** referências
> a Vercel/Supabase gerenciado e ao checklist LGPD dependente deles (§8) podem
> mudar para **VPS Hostinger + Easypanel + Postgres puro** (decidido: não
> Supabase; auth in-app + MinIO). Fonte única
> da proposta: `docs/arquitetura/plano-bootstrap-e-stack-vps.md`. Modelo de
> dados, RLS e plano de fases não mudam.

## 1. O produto em 3 frases

Iris é um SaaS B2B para clínicas de terapia infantil (ABA, Fonoaudiologia,
Terapia Ocupacional) focado em intervenção para TEA no Brasil. O terapeuta
escreve um diário de sessão em texto livre; uma IA sugere estruturação
clínica — **nunca pontua nem decide sozinha**, toda sugestão exige
aprovação humana antes de virar registro permanente. Os 8 princípios
inegociáveis completos estão em `README.md` — não repetidos aqui para não
divergir.

## 2. A regra que nenhum código pode violar

```
Camada 1 — IA:          sugere extrações (nunca decide, nunca pontua)
Camada 2 — Terapeuta:   aprova/edita/rejeita → vira evidência oficial
Camada 3 — Coordenador: valida POR EXCEÇÃO, pode reclassificar → nova
                        versão (nunca sobrescreve)
```

Isso não é só princípio de produto — é restrição técnica. Antes de
implementar qualquer parte do agente de IA, do schema, ou de uma tela,
confira que ela obedece isso. Onde isso já virou decisão de código
específica:

- O schema de saída do Agent 1 (`docs/agente/output-schema.json`) **não
  tem campo de nota/pontuação**. Nunca adicionar um.
- `Evidence` é imutável no nível de privilégio do banco (`REVOKE UPDATE,
DELETE`) — correções são sempre novas linhas em `EvidenceRevision`,
  nunca `UPDATE` em `Evidence`.
- `MilestoneAssessment` completo nunca é alterado — dispara nova
  reavaliação em vez de editar.
- Reclassificação do coordenador sempre exige justificativa (regra V2 em
  `docs/governanca/validacao-coordenador.md`) e cria nova versão (V3);
  quando o texto do diário não permite desambiguar, a ação correta é
  DEVOLVER ao terapeuta, nunca adivinhar.
- Extrações do Agent 1 nascem em estado `sugerida` numa tabela própria
  (`extraction`) — a IA nunca escreve direto em `evidence`.

## 3. Estado atual (10/07/2026)

- Especificação (4 documentos-base) e validações essencialmente fechadas —
  ver `BACKLOG.md` seções A e B. **Nenhuma linha de código de produto foi
  escrita ainda.** A pasta do projeto ainda não é um repositório git.
- Plano de fases completo: **Fase 0.5** (design system, próximo passo) →
  **Fase 1** (cadastro de paciente + agenda mínima, depois da 0.5) → Fase 2
  (metas + diário) → Fase 3 (extração via IA) → Fase 4 (evidência
  acumulada + timeline) → Fase 5 (coordenador + exportações) → Fase 6
  (voz + hardening LGPD).
- Não pular fases nem antecipar escopo de fase futura "porque é rápido" —
  cada fase existe para eliminar um risco específico. Ver detalhamento em
  `docs/arquitetura/stack-e-plano-de-construcao.md` §3 e o racional de
  sequenciamento em `HANDOFF-FASE1.md`.
- Escopo exato da fase em construção agora está sempre em
  `HANDOFF-FASE1.md` — é o documento vivo de "o que codar hoje", este
  arquivo é o contrato de "como codar", eles não competem.

## 4. Antes da primeira linha de código (checklist de setup)

Espelha `HANDOFF-FASE1.md` §5 — nenhum item feito ainda no momento em que
este arquivo foi escrito:

- [ ] Decidir se renomeia a pasta `xpect` → `iris` (marca já decidida:
      **Iris**, domínio `irisclinica.ia.br`) antes de criar os projetos
      Supabase/Vercel, para não ter que renomear depois com serviços já
      apontando para o nome antigo.
- [ ] `git init`.
- [ ] Projeto Supabase em região `sa-east-1` (São Paulo).
- [ ] Projeto Vercel com região de função `gru1` (São Paulo).
- [ ] Rodar a DDL das tabelas necessárias para a Fase 1
      (`docs/dados/modelo-de-dados.md`): pelo menos `clinic`, `app_user`,
      `user_role`, `patient`, `patient_clinical_profile`, `consent`,
      `protocol`, `protocol_familia_catalogo`, `patient_protocol`,
      `care_team_membership`.
- [ ] Variáveis de ambiente (ver `.env.example` na raiz). **Ainda não**
      precisa de `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY` — só entram na Fase 3,
      por decisão deliberada de timing (`BACKLOG.md` seção D), não por
      falta de chave.
- [ ] Habilitar RLS nas tabelas assim que criadas — mesmo sem cobertura de
      teste completa ainda (o teste automatizado de RLS é exigido antes de
      dado REAL de paciente entrar, não antes da Fase 1 em si, mas não
      deixar para depois "por preguiça").

## 5. Setup e comandos

Convenções completas e racional em `docs/arquitetura/convencoes-de-codigo.md`
— **proposta pendente de confirmação do Rômulo**, nenhuma dessas decisões
existia em nenhum documento de especificação anterior. Resumo:

| O quê                         | Escolha proposta                                                             |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Gerenciador de pacotes        | pnpm                                                                         |
| Linguagem                     | TypeScript, modo strict                                                      |
| Lint / format                 | ESLint (`eslint-config-next`) + Prettier, pre-commit via Husky + lint-staged |
| Testes unitários / componente | Vitest                                                                       |
| Testes E2E                    | Playwright                                                                   |
| Testes de RLS                 | pgTAP via `supabase test db`                                                 |
| Commits                       | Conventional Commits em inglês                                               |
| Deploy                        | `git push` → Vercel (automático); migrations via Supabase CLI                |

Comandos esperados uma vez o projeto inicializado (ajustar ao `package.json`
real quando existir):

```
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm build
npx storybook@latest init      # Fase 0.5, uma vez
pnpm storybook                  # Fase 0.5 em diante
supabase test db                # testes de RLS
```

## 6. Definição de pronto por fase

Não existe "terminei" sem isso — cada fase tem critério de aceite
explícito, não é opinião de quem está codando:

- **Fase 0.5:** os 3 componentes base (Botão, Card, Alerta) com matriz
  completa de estados, 2 modos (Clínico/Família), 2 viewports, zero
  violação séria em `addon-a11y`, build publicado no Vercel. Critérios
  completos em `docs/ux/design-system-espectro-brutal.md` §5.
- **Fase 1:** um coordenador cadastra um paciente real de ponta a ponta
  (administrativo → clínico → protocolo de referência) e um terapeuta vê a
  sessão aparecer na grade do dia. RLS **testado**, não só habilitado, para
  os papéis `admin_recepcao`, `terapeuta`, `coordenador`.
- Fases seguintes: usar sempre o critério vigente em
  `docs/arquitetura/stack-e-plano-de-construcao.md` §3 quando chegar a vez
  delas — não antecipar aqui para não divergir do documento fonte.

## 7. Guardrails inegociáveis

Coisas que o código nunca deve fazer, independente do que pareça
conveniente no momento:

1. Nunca dar a `admin_recepcao` acesso a tabela clínica
   (`patient_clinical_profile`, `evidence`, `patient_protocol` etc.) — é
   minimização LGPD, não conveniência de RLS. Escrever teste automatizado
   que tenta o acesso e confirma que falha.
2. Nunca fazer `UPDATE`/`DELETE` em `evidence` — só `INSERT` em
   `evidence_revision`.
3. Nunca fazer a IA escrever direto em `evidence` — saída do Agent 1 vai
   para `extraction` (estado `sugerida`); só aprovação do terapeuta cria
   `evidence`.
4. Nunca colocar lógica específica de protocolo no código do agente —
   protocolo é dado (`Protocol.familia`), não código. Se surgir a
   tentação de escrever `if protocolo == 'vb-mapp'`, é sinal de que a
   modelagem está errada.
5. Nunca hardcodar prazo de retenção — é `clinic.politica_retencao_meses`,
   configurável por clínica.
6. Nunca chamar API da Anthropic/Google em código de produto antes da Fase
   3 — decisão deliberada de timing, não falta de chave (`BACKLOG.md`
   seção D).
7. Nunca tratar os documentos de `docs/legal/` como finais — são rascunhos
   de produto pendentes de revisão por advogado
   (`docs/legal/briefing-para-advogado.md`). Não bloqueiam código, bloqueiam
   publicação/assinatura como estão.
8. Nunca expor o codinome "Espectro Brutal" (nem a palavra "espectro") em
   copy voltada ao usuário final — é nome interno do design system; usá-lo
   externamente sugeriria uma alegação de acessibilidade para autismo que
   o produto não faz.
9. Nunca processar dado REAL de paciente antes de: os dois pontos jurídicos
   abertos serem confirmados (prazo de retenção; granularidade de
   `responsavel_tecnico_id`) e o DPA com a Anthropic estar assinado — ver
   `docs/legal/briefing-para-advogado.md`.
10. No agente de extração, nunca inferir ou completar o que o texto do
    diário não afirma — fidelidade ao texto (regra R1) é obrigatória, não
    preferência de estilo. `extracoes` vazio é resultado de sucesso válido.

## 8. Checklist LGPD mínimo viável (antes de dado real de paciente)

Fonte completa: `docs/arquitetura/stack-e-plano-de-construcao.md` §4.
Resumo operacional — tratar como definição de pronto de segurança, não como
nice-to-have:

- [ ] RLS habilitado **e testado** (não só policies existindo) em todas as
      tabelas clínicas, para cada papel.
- [ ] Teste automatizado confirmando que `admin_recepcao` não acessa
      `patient_clinical_profile`, `evidence`, `patient_protocol` nem
      qualquer outra tabela clínica.
- [ ] Login com senha + MFA habilitado por padrão para `coordenador` e
      `terapeuta`.
- [ ] `AuditLog` registra toda exportação de `Report` **antes** do
      download ser liberado.
- [ ] `Consent` versionado coletado antes de qualquer insert de dado
      clínico — 3 tipos: tratamento de dados de menor, uso de IA no
      processamento, exportação de relatórios.
- [ ] Retenção configurável por clínica
      (`clinic.politica_retencao_meses`), mesmo que só o default do
      produto esteja ativo por enquanto.
- [ ] DPA assinado com a Anthropic cobrindo processamento de dado sensível
      de menor via API.
- [ ] Hospedagem confirmada em região do Brasil (Supabase `sa-east-1`,
      Vercel `gru1`) antes do primeiro dado real.
- [ ] Backup automático habilitado **e testado** (um restore real, não só
      a existência do backup).

## 9. Quando parar e perguntar ao Rômulo vs. seguir sozinho

**Seguir sozinho:** implementação técnica dentro do escopo já travado da
fase atual; ajustes de UI dentro dos tokens do design system; correção de
bug; escrita de teste; refatoração que não muda contrato de dado ou API.

**Parar e perguntar:** qualquer coisa que mude uma decisão listada como
"travada" em `HANDOFF-FASE1.md` §3; qualquer mudança de wording em
documento jurídico (`docs/legal/`); qualquer decisão que dependeria de dado
real de paciente; qualquer ideia de pular fase ou adiantar escopo de fase
futura; confirmação final das convenções de código propostas em
`docs/arquitetura/convencoes-de-codigo.md` (estão propostas, não
travadas).

## 10. Manutenção do BACKLOG.md

Regra permanente do projeto: toda sessão que gerar decisão nova, gap
encontrado, ou item concluído deve atualizar `BACKLOG.md` **antes de
encerrar** — marcar `[x]` o que fechou, adicionar o que foi descoberto,
mover de seção se o escopo mudou. O histórico de decisões vive no
repositório, não só na conversa com o Rômulo.
