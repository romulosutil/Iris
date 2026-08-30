# #36 A3/A4 — Link da fatura no histórico de cobranças

> Spec-driven (`/tlc-spec-driven`), porte **Large** (toca modelo de dados + `GRANT`).
> Fases aplicadas: Specify + Design (inline) + Tasks.
> Plano irmão, sem migração: `docs/superpowers/plans/2026-08-29-36-blocos-a-c-d-portal-assinatura-cancelamento-onboarding.md` (A1, A2, C, D).
> Handoff `AGENTS.md` §5.2: os 7 pontos estão fechados no fim deste documento.

## 0. A3 — a medição, e a decisão que ela fecha

A issue #36 registra A3 como **task de medição**: _"`billing_cycle` tem `provider_charge_id`, **não tem** URL de fatura. Decidir entre persistir `invoiceUrl` na emissão (migração + `GRANT` de coluna) ou resolver sob demanda pelo `provider_charge_id`. Task de medição contra a API do Asaas — **não presumir**; fecha com decisão registrada, não com código."_

Esta seção **é** o fechamento de A3. Quatro fatos, todos medidos em 29/08/2026, nenhum presumido.

### F1 — a URL já chega até nós, e é jogada fora

`AsaasProvider.emitirCobrancaDeCiclo` já lê `invoiceUrl` da resposta do Asaas e o devolve pela porta:

```ts
// src/lib/billing/provider/asaas.ts:975
const urlPagamento = comoTexto(resposta.invoiceUrl) ?? undefined;
```

O campo existe na porta desde sempre — `CobrancaEmitida.urlPagamento` (`src/lib/billing/provider/types.ts:216`).

O call site do fechamento de ciclo **ignora esse campo**. Em `src/lib/billing/subscription.ts:753-772`, a resposta é desestruturada só para `providerChargeId` e `status`; o `UPDATE` de `billing_cycle` grava `provider_charge_id`, `cobranca_emitida_em`, `vencimento_cobranca`, `status` e `cobrado_em` — e nada mais. A URL morre no escopo da função.

**Consequência:** persistir não exige chamada nova a gateway nenhum. É gravar um valor que já está na mão, no `UPDATE` que já acontece.

### F2 — resolver sob demanda também é possível, e é o caminho caro

`GET /v3/payments/{id}` devolve `invoiceUrl` no corpo, sem depender do status da cobrança (medido na spec OpenAPI oficial via MCP `asaas-docs`, 29/08/2026 — `PaymentGetResponseDTO.invoiceUrl`, `"Invoice URL"`, exemplo `https://www.asaas.com/i/080225913252`). O mesmo DTO traz `transactionReceiptUrl` ("URL of proof of confirmation, receipt, reversal or removal"), que é o comprovante e não a fatura.

Então a resolução sob demanda **funciona**. O que ela custa:

- **N chamadas HTTP por renderização da tabela.** O histórico mostra até 12 ciclos; são até 12 idas sequenciais ao Asaas dentro de um Server Component, antes do primeiro byte.
- **Um método novo na porta.** `consultarCobranca` devolve `StatusCobranca` e mais nada — não tem URL. `consultarCobrancaParaReuso` tem `FormaPagamentoCobranca` (que carrega `urlPagamento`), mas é o gate de reuso da #310: faz chamadas extras de QR e de instrução e decide por allow-list de status cru. Usá-lo para desenhar um link seria pagar o gate inteiro para obter uma string.
- **Gateway fora do ar vira tabela sem link, em silêncio.** É a família de defeito que já mordeu esta base: `catch { setState(null) }` transformando falha de rede em afirmação sobre o dado.
- **Cobrança removida no gateway perde o link para sempre.** A fatura de um ciclo pago há oito meses é registro contábil da clínica; deixá-la dependendo de um `GET` que pode 404 é perder histórico por causa de retenção do fornecedor.

### F3 — a coluna nova já nasce legível por `app_role`

`billing_cycle` recebeu `GRANT SELECT ON billing_cycle TO app_role` na `0071:237`. É privilégio de **tabela**, e privilégio de tabela cobre todas as colunas, inclusive as criadas depois. Nenhum `REVOKE` jamais tocou a tabela — as migrações `0100:24`, `0101:38` e `0106:38` afirmam isso explicitamente, cada uma ao adicionar uma coluna.

Ainda assim, esta spec exige o `GRANT` de coluna (R4). Não por necessidade técnica: por **convenção viva** do repo. As três migrações citadas emitem o grant redundante, e uma coluna nova sem ele quebraria o padrão que faz a auditoria de privilégio ser legível por leitura do arquivo. O comentário da migração precisa dizer que é redundante, senão o próximo leitor conclui que a tabela tinha `REVOKE`.

### F4 — não há nada para backfill

Nenhuma cobrança de ciclo jamais foi emitida em produção. A única clínica ativa tem um ciclo, `aberto`, de 13/08 a 12/09/2026, sem `provider_charge_id`. O primeiro fechamento real é o E1 da própria #36, marcado para **12/09/2026**.

Logo: **zero linhas para preencher retroativamente**. A tarefa T6 confirma isso com uma query antes de a migração subir; se, contra a expectativa, aparecer ciclo com `provider_charge_id`, o backfill entra como task própria e **não** de carona nesta.

### Decisão (ratificada pelo Rômulo, 29/08/2026)

**Persistir `invoice_url` em `billing_cycle`, gravada no mesmo `UPDATE` que já grava `provider_charge_id`.** Sob demanda foi rejeitado por F2: paga N round-trips por render, precisa de método novo na porta e perde o link quando o gateway não responde ou remove a cobrança.

A opção "persistir + backfill" foi considerada e é desnecessária por F4.

---

## 1. Requisitos

### R1 — `billing_cycle` guarda a URL da fatura emitida

Coluna `invoice_url text` (nullable), na tabela `billing_cycle`.

**Nullable, e nunca `NOT NULL`.** Três classes de linha legítima não têm fatura e nunca terão:

1. ciclos fechados **antes** desta migração (nenhum em produção hoje, por F4, mas os int-tests e o banco local têm);
2. ciclos em `devido` — o cancelamento congela o ciclo como débito **sem emitir cobrança**, porque a autorização de Pix Automático acabou de ser revogada (`0097`, #287/#290);
3. ciclos em que a emissão respondeu sem `invoiceUrl` — o campo é opcional na porta (`urlPagamento?`), e um gateway que não o forneça não pode derrubar o fechamento de ciclo.

### R2 — a URL gravada é a que SAIU do gateway naquela emissão

O valor persistido é o `urlPagamento` devolvido por `emitirCobrancaDeCiclo` **naquela** chamada, gravado no mesmo `UPDATE` que grava `provider_charge_id` e `vencimento_cobranca`.

Não é recalculado, não é montado por template a partir do `provider_charge_id`, e não é reconsultado depois. Montar `https://www.asaas.com/i/${id}` à mão seria inventar um contrato de URL que o Asaas não nos deu por escrito, e que difere entre sandbox e produção.

### R3 — a escrita da URL nunca derruba o fechamento de ciclo

`urlPagamento` ausente grava `NULL` e o ciclo fecha normalmente. Nenhum `throw`, nenhum log de erro — é caso previsto, não anomalia. O guardrail 2 da #36 (_"Falha aberta, nunca conta travada"_) vale aqui na direção oposta: um link de conveniência não pode impedir uma cobrança de sair.

### R4 — `GRANT` de coluna explícito

`GRANT SELECT ("invoice_url") ON "billing_cycle" TO app_role;` e
`GRANT SELECT ("invoice_url"), INSERT ("invoice_url"), UPDATE ("invoice_url") ON "billing_cycle" TO iris_auth;`

Redundantes com os grants de tabela existentes (F3), e emitidos mesmo assim por convenção — com comentário na migração dizendo que são redundantes e por quê.

### R5 — a migração passa por `pnpm db:generate`

A coluna está em `src/db/schema.ts`, então a DDL sai do gerador, com `.sql` e `meta/NNNN_snapshot.json` commitados juntos. Os `GRANT` de R4 são acrescentados **à mão no `.sql` gerado**, sem tocar o snapshot — Drizzle não modela privilégio.

Escrever a DDL da coluna à mão está proibido: foi assim que o snapshot dessincronizou entre a `0042` e a `0077`.

### R6 — o histórico expõe a URL

`CicloDoHistorico` (criado em A1) ganha `invoiceUrl: string | null`, lido pelo `select` tipado de `listarCiclosDaClinica`.

### R7 — link "ver fatura" por linha, e ausência é ausência

A tabela do histórico ganha uma coluna de ação:

- com `invoiceUrl`: link para a fatura hospedada, `target="_blank"` + `rel="noopener noreferrer"`, com nome acessível que identifica **qual** ciclo (`Ver fatura do ciclo de 01/06/2026 a 01/07/2026`) — quatro links chamados "Ver fatura" numa tabela são quatro destinos indistinguíveis para quem navega por lista de links;
- sem `invoiceUrl`: um traço (`—`), igual às outras células vazias da tabela. **Nunca** um link quebrado, um botão desabilitado sem explicação, ou texto que sugira erro: para um ciclo em `devido` a ausência de fatura é o comportamento correto, não uma falha.

### R8 — a URL não é confiada cegamente na renderização

Só é renderizada como link se começar com `https://`. Um valor que não seja HTTPS é renderizado como ausência (`—`).

O valor vem de resposta HTTP de terceiro e vai para o atributo `href` de um link que o usuário clica. Hoje o Asaas devolve `https://`; a checagem existe para que uma mudança lá — ou uma linha corrompida — não vire um destino inesperado a partir de dentro do produto.

### R9 — a coluna nova não muda contagem, valor nem estado de ciclo

Nenhuma consulta de faturamento, apuração, backstop ou retentativa passa a ler ou escrever `invoice_url`. O único escritor é o `UPDATE` de emissão (R2); o único leitor é o histórico (R6).

---

## 2. Design

### 2.1 Componentes tocados

| Arquivo | Mudança |
| --- | --- |
| `src/db/schema.ts` | `invoiceUrl: text("invoice_url")` em `billingCycle`, com docblock explicando por que é nullable e por que não é derivado do `provider_charge_id` |
| `db/migrations/0134_billing_cycle_invoice_url.sql` | Gerada por `db:generate`; `GRANT`s de R4 acrescentados à mão |
| `db/migrations/meta/0134_snapshot.json` + `_journal.json` | Escritos pelo gerador; commitados junto |
| `src/lib/billing/subscription.ts:753-772` | `invoiceUrl: cobranca.urlPagamento ?? null` no `.set({...})` da emissão |
| `src/app/(app)/assinatura/queries.ts` | `invoiceUrl` no `select` e em `CicloDoHistorico` |
| `src/app/(app)/assinatura/historico-cobrancas.tsx` | Coluna "Fatura" |

### 2.2 Ordem, e por que ela importa

`schema.ts` → `db:generate` → grants à mão → aplicar → **medir no Postgres** → gravar na emissão → ler na query → renderizar.

A medição fica **no meio**, não no fim: `git log` não prova que a migração rodou, e uma coluna que não existe faria a escrita da emissão falhar dentro do fechamento de ciclo — o trilho que não pode quebrar.

### 2.3 Armadilhas nomeadas

- **`when` do `_journal.json`.** Esta migração sai do gerador, então o journal é escrito por ele. Não editar à mão. (A regra do `+ 1000` vale para migração escrita à mão, que não é este caso.)
- **Não renumerar.** Se outra branch entregar uma `0134` antes, **não** renumere esta: o guard D17 casa `created_at` com a tag pelo `when`. Regere.
- **`db:generate` responde "No schema changes"?** Então o `schema.ts` não foi salvo, ou a coluna foi escrita fora do objeto `billingCycle`. Não contorne escrevendo o `.sql` à mão.
- **`0134` já existe no `_journal.json` mas o `.sql` não roda.** Editar uma migração já aplicada não a reaplica — Drizzle aplica por tag. Em banco local já migrado, dropar a coluna e rodar de novo, ou recriar o banco.

---

## 3. Tasks

Ver `tasks.md` neste diretório.

---

## 4. Definição de pronto

- [ ] `information_schema.columns` mostra `billing_cycle.invoice_url` no banco local **e** em produção
- [ ] `has_column_privilege('app_role','billing_cycle','invoice_url','SELECT')` = `true`, medido
- [ ] Int-test prova que a emissão grava a URL devolvida pelo gateway, e grava `NULL` quando o gateway não devolve
- [ ] Int-test prova que `listarCiclosDaClinica` traz `invoiceUrl` sem vazar tenant
- [ ] Teste de componente prova link com nome acessível por ciclo, `—` na ausência e `—` em URL não-HTTPS
- [ ] `pnpm test && pnpm typecheck && pnpm lint && pnpm test:rls` verdes, com contagem conferida
- [ ] `src/db/migrations.test.ts` verde (journal íntegro)
- [ ] A3 fechada na issue #36 com a decisão registrada (seção 0 deste documento, colada no comentário)

---

## 5. Handoff `AGENTS.md` §5.2 — os 7 pontos

1. **Problema e evidência.** Quem já paga não consegue abrir a fatura de nenhum ciclo: `billing_cycle` não guarda URL. Medido: o `UPDATE` de emissão (`subscription.ts:753-772`) descarta o `urlPagamento` que a porta já devolve.
2. **Decisão de design, fechada.** Persistir na emissão. Alternativa (sob demanda) medida e rejeitada — seção 0, F2. **Não é "a validar".**
3. **Limites e escala.** Até 12 linhas por render (`LIMITE_PADRAO_HISTORICO`), zero chamada a gateway na renderização. Nenhum job novo, nenhum polling.
4. **Dono da leitura e da escrita.** Escrita: só o `UPDATE` de emissão em `fecharCiclosVencendo`, sob `iris_auth`. Leitura: só `listarCiclosDaClinica`, sob `app_role` com RLS. Nada mais toca a coluna (R9).
5. **Decisão de UI, fechada.** Coluna "Fatura" na tabela existente; link com nome acessível por ciclo; `—` quando não há URL ou quando ela não é HTTPS. Sem botão desabilitado, sem tooltip de erro.
6. **Régua de mutação.** O teste de emissão tem de ficar **vermelho** se `invoiceUrl: cobranca.urlPagamento ?? null` for removido do `.set({...})`. Verificar com patch inverso, nunca `git checkout`.
7. **Fora de escopo.** Backfill (desnecessário por F4, e reavaliado por T6); `transactionReceiptUrl` do comprovante; fatura da cobrança avulsa de débito (`emitirCobrancaAvulsa`), que já expõe URL pelo caminho do gate de reativação; blocos B e E da #36.
