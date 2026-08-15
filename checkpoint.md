# Checkpoint — Iris

> **Data:** 15/08/2026
> **Branch:** `feat/290-gate-debito-reativacao` (commit `838d5be`, sem push)
> **Status:** 🟢 Passo 1 da linha de billing (#321) executado e registrado. Cinco perguntas ficaram **não medidas por impossibilidade estrutural do sandbox** — resolvem-se só no ensaio em produção.

---

## 0. Ordem de leitura — comece aqui

> **Você está no passo 3 de 4.** Se abriu este arquivo primeiro, leia os dois anteriores antes de agir: eles dizem **o que** fazer e **em que ordem**; este diz apenas onde a última sessão parou.

| #     | Documento                                                                                                 | O que só existe aqui                                                                                                                                                                                           |
| :---- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | [**Ordem de conclusão**](https://claude.ai/code/artifact/59b6c2d8-ea6c-401a-b62f-9572ed26d243) (artifact) | A sequência dos 9 passos e **por que essa ordem** — irreversibilidade, não gravidade. Grafo de dependência, modelo indicado e prompt pronto de cada passo.                                                     |
| **2** | **A issue do passo corrente** (GitHub)                                                                    | Escopo exato, Definição de Pronto e os comentários com as medições já feitas. ⚠️ `gh issue view --comments` **retorna vazio neste ambiente** — usar `gh api repos/romulosutil/iris/issues/N` e `.../comments`. |
| **3** | `checkpoint.md` (este arquivo)                                                                            | Estado da última sessão: o que foi medido, o que ficou aberto **e por qual motivo**, e o próximo passo concreto.                                                                                               |
| **4** | [`BACKLOG.md`](BACKLOG.md)                                                                                | Débitos vivos (D1–D32) e log de sessões. Consulta, não leitura linear — venha buscar o histórico de uma decisão específica.                                                                                    |

### Instruções para o próximo

1. **Leia na ordem acima.** O artifact é o ponto de entrada — ele decide qual issue é a próxima, com qual modelo e com qual skill. Não escolha o passo por conta própria.
2. **Antes de planejar qualquer coisa, leia os comentários da issue.** Nas issues desta linha, os comentários **corrigem o corpo original** em pontos materiais. Planejar pelo corpo sozinho já produziu retrabalho.
3. **Não replaneje medição contra o sandbox do Asaas.** Autorização de Pix Automático não ativa lá (§1). Toda pergunta sobre o trilho headless só se responde no ensaio com clínica de teste **em produção**.
4. **"Não medido" é resultado, não pendência.** Propague com o motivo. Nunca converta em suposição pelo caminho — foi exatamente esse defeito que criou a #289.
5. **Antes de aplicar a label `jules`**, feche o checklist de handoff (`AGENTS.md` §5.2). A #289 está bloqueada nisso hoje: falta decidir o discriminador.
6. **Ao fechar um passo:** atualize este arquivo **e** acrescente a sessão no `BACKLOG.md`, nessa ordem. O artifact só muda quando a ordem dos passos mudar.
7. **Commits em inglês**, documentação e copy em pt-BR. Formate só os arquivos tocados (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`, que reformata o repo inteiro.

---

## 1. Resumo da Sessão (15/08/2026)

Executado o **passo 1 da ordem de conclusão do Pix Automático**: issue [#321](https://github.com/romulosutil/Iris/issues/321) — sessão de medição no sandbox do Asaas (`api-sandbox.asaas.com/v3`, chave de homologação `$aact_hmlg_`).

### Achado estrutural que muda o planejamento

**O sandbox do Asaas não permite ativar uma autorização de Pix Automático.** O único simulador de pagamento (`pix/qrCodes/pay`) trava em `AWAITING_CRITICAL_ACTION_AUTHORIZATION`; `/transfers/{id}/authorize` devolve 404; o token `000000` não move o estado nem em header nem em corpo. Só existem 3 endpoints de simulação — `myAccount/approve`, `payment/{id}/confirm`, `payment/{id}/overdue` — e nenhum toca autorização.

Consequência: **todo o trilho de débito headless é imensurável fora de produção**. Vale o que é criação de autorização (aceitação de campo/enum) e o trilho de cobrança **avulsa**.

### O que foi medido

| #   | Pergunta                                             | Veredito                                                                                                                                                                                       |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `minLimitValue: 39.00` sem `value` é aceito?         | **Medido — sim.** 200, persiste, `value: null`, `status: CREATED`. Recorrência com dois valores distintos: **não medido** (autorização nunca ativa)                                            |
| 2   | Pagador conclui sem preencher teto?                  | **Não medido** — exige app de banco. De lambuja: a API não expõe nem aceita teto, só `minLimitValue`                                                                                           |
| 3   | `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` é aceito? | **Medido — sim**, com eco na resposta. `NOT_ALLOWED` no código é escolha, não limitação da API                                                                                                 |
| 4   | Janela de 2 dias: úteis ou corridos?                 | **Não medido.** O 400 de autorização inativa dispara antes da checagem de janela — o controle _dentro_ da janela recebeu o mesmo 400, provando que a resposta não carrega informação de janela |
| 5   | `dueDate` em sábado/domingo/feriado é aceito?        | **Medido no trilho avulso — os três aceitos (200)**, data devolvida igual, sem empurrão para dia útil. Trilho automático: não medido                                                           |
| 6   | Menor `value` num PIX avulso?                        | **Medido — piso real R$ 5,00.** 0,01 / 0,50 / 1,00 / 3,00 → 400 nomeado; 5,00 → 200                                                                                                            |
| 7a  | `externalReference` na cobrança de ativação?         | **Medido que não serve.** `immediateQrCode` não tem o campo, e a cobrança de ativação não existe até o QR ser pago                                                                             |
| 7b  | Onde pousa o código de recusa?                       | **Medido — `paymentInstruction.refusalReason`**, via `GET /pix/automatic/paymentInstructions/{id}`. Payload do **webhook**: não medido                                                         |

### Armadilhas medidas (valem para quem vier depois)

- **Campo desconhecido passa 200 e some.** `maxLimitValue` inventado foi aceito e não voltou na resposta. **Eco na resposta é o único teste de que um campo existe** — status 200 não prova nada.
- **Forçar vencimento reescreve `dueDate`** e preserva `originalDueDate`. Comparar `dueDate` com a data planejada depois do vencimento lê a data errada.
- O piso de R$ 5,00 é sobre **`value − discount`** (líquido), não sobre `value`.
- Taxa Pix de R$ 0,99 sobre cobrança no piso → `netValue: 4,01`, ~20% do débito.
- O piso **não** se aplica ao QR de ativação: `originalValue: 0.01` foi aceito. `VALOR_ATIVACAO_PADRAO_CENTAVOS = 1` segue viável.

### Efeitos nas issues dependentes

- **#317** — `retryPolicy` é aceito na criação (destrava o escopo). A contradição úteis × corridos **continua aberta** e só se resolve no ensaio em produção.
- **#311** — `PISO_COBRANCA_CENTAVOS = 500` está **correto, mantém-se**. A entrega vira trocar o comentário de "escolha conservadora, NÃO medição" (`src/lib/billing/debito.ts:41-55`) por "medido em 15/08/2026", acrescentando a precisão do líquido de desconto. Não é mais candidata a remoção.
- **#289** — o discriminador **não pode ser `externalReference`**. Candidatos disponíveis antes do pagamento: `immediateQrCode.conciliationIdentifier` e `endToEndIdentifier` da autorização. **A escolha entre os dois segue decisão de produto em aberto** — a issue ainda não pode ir para o Jules.
- **#318** — o campo é `paymentInstruction.refusalReason`. Achado colateral: `consultarCobranca` (`src/lib/billing/provider/asaas.ts:799`, fallback em 818-821) procura em `pixTransaction.failureReason`, que **não existe** no recurso `payment` (medido num payment OVERDUE forçado: `pixTransaction: null`).

---

## 2. Estado do Repositório & Branch

- **Branch:** `feat/290-gate-debito-reativacao` — **sem push**, sem PR.
- **Commit:** `838d5be` — `docs(infra): log Asaas sandbox measurement (#321)` · 1 arquivo, 326 inserções, só `infra/README.md`.
- **Seção nova:** `infra/README.md:1921` — `### Runbook — sessão de medição no sandbox do Asaas (#321)`, no padrão do runbook vizinho da #286.
- **Não versionado (pendente de decisão do Rômulo):** `.mcp.json` (aponta para o MCP de docs do Asaas) e `docs/daily-summary/2026-08-14.md`.
- **Comentários postados:** #317, #311, #289, #318 e o de fechamento na #321.
- **Memória gravada:** `sandbox-asaas-nao-ativa-pix-automatico.md` + entrada no `MEMORY.md`.

---

## 3. Próximos Passos Sugeridos

1. **Fechar a #321** — as 5 caixas da Definição de Pronto estão cumpridas (o "não medido" documentado com motivo estrutural é resultado válido, não pendência).
2. **Push do `838d5be`** — decisão do Rômulo, a branch está local.
3. **Passo 2 — #317 (irreversível, urgente):** `/superpowers:writing-plans` com Opus 5. Escopo: `minLimitValue` + `retryPolicy` (só a flag) + cálculo do vencimento + rename de `PISO_COBRANCA_CENTAVOS`. ⚠️ A unidade da janela (úteis × corridos) entra no plano **como suposição declarada**, não como fato — não foi medida.
4. **Agendar o ensaio com clínica de teste em produção.** É o único caminho para as 5 perguntas remanescentes: unidade da janela, recorrência com dois valores diferentes, pagador concluir sem teto, identificador da cobrança de ativação e payload do webhook de recusa. Bloqueia o fechamento honesto de #317, #289 e #318. Contexto na memória `ensaio-fechamento-ciclo-clinica-teste`.
5. **Passo 3 — #319** (`past_due` terminal, a carência nunca corre): `/superpowers:brainstorming` antes de planejar — 5 decisões abertas.
