# Design — Débito na reativação (#290)

Cobre `DEB-01`…`DEB-08` da `spec.md`.

## Princípio de fundo

O débito **não ganha tabela nova**. Ele já está modelado: é a soma dos
`billing_cycle` em `devido` da assinatura. Criar uma entidade "débito" paralela
duplicaria a fonte da verdade do valor e do memorial (`pacientes_contados`,
`inicio`, `fim`), que é exatamente o que a `0097` acabou de consolidar na linha
do ciclo.

O que falta na modelagem é **uma cobrança que cobre N ciclos**. Hoje
`billing_cycle.provider_charge_id` é UNIQUE parcial (`0075`), então o mesmo id de
cobrança não cabe em duas linhas. Resolvido com **agrupamento por âncora**, e não
com tabela nova.

---

## 1. Schema — migração `0098`

```sql
ALTER TABLE billing_cycle
  ADD COLUMN IF NOT EXISTS debito_agrupado_em uuid
    REFERENCES billing_cycle(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS billing_cycle_debito_agrupado_idx
  ON billing_cycle (debito_agrupado_em)
  WHERE debito_agrupado_em IS NOT NULL;
```

- **Semântica**: "o débito desta linha foi cobrado junto com o da linha X". A
  âncora (o ciclo `devido` mais **antigo**) é quem carrega `provider_charge_id`
  com o id da cobrança consolidada; as demais apontam para ela.
- **Âncora = mais antiga**, e não a mais recente, por determinismo: a mesma
  entrada produz sempre a mesma âncora, então uma reexecução do gate encontra a
  cobrança já emitida em vez de eleger outra âncora e emitir uma segunda.
- **`ON DELETE SET NULL`** e não `CASCADE`: apagar um ciclo não pode apagar outro
  ciclo. (Na prática nada apaga `billing_cycle` — a FK de `clinic` é `restrict`.)
- **GRANT**: `billing_cycle` tem grant de TABELA para `iris_auth`
  (`0071:244`, `0075:67`), não coluna a coluna — a coluna nova já está coberta.
  `app_role` tem `SELECT` na tabela e a policy `billing_cycle_select` (`0071:207`,
  reescrita na `0085`) resolve o tenant pelo helper. Nada novo a conceder.
- `_journal.json`: **gerado**, não escrito à mão. A coluna, a FK, o índice e o
  CHECK moram em `schema.ts`, então o caminho obrigatório é
  `pnpm db:generate` (CLAUDE.md §Migrações-1) — o `when` sai correto e o
  snapshot acompanha. O arquivo gerado foi renomeado para tag descritiva e
  recebeu o comentário de racional + `COMMENT ON COLUMN`, sem tocar no snapshot.
  A armadilha do `when` (#165) só existe em migração 100% manual.

## 2. `src/lib/billing/debito.ts` (novo)

Módulo puro-ish (`server-only`, fala com `authDb`), dono de tudo que é débito:

```ts
export const PISO_COBRANCA_AVULSA_CENTAVOS = 500;

export interface DebitoLevantado {
  totalCentavos: number;
  ancoraId: string | null; // ciclo `devido` mais ANTIGO
  outrosIds: string[]; // os demais, que serão agrupados na âncora
  providerChargeId: string | null; // cobrança já emitida na âncora
}

export async function levantarDebito(
  subscriptionId: string,
): Promise<DebitoLevantado>;

/** A decisão pura, sem banco nem gateway — é o que o teste de unidade exercita. */
export function decidirGate(
  totalCentavos: number,
  piso?: number,
): "sem_debito" | "adiar" | "cobrar";

export type ResultadoGateDebito =
  | { tipo: "sem_debito" }
  | {
      tipo: "adiado";
      totalCentavos: number;
      motivo: "abaixo_do_piso" | "recusa_do_gateway";
    }
  | {
      tipo: "cobranca";
      totalCentavos: number;
      pagamento: FormaPagamentoDebito;
    };

export async function resolverGateDeDebito(
  clinicId: string,
): Promise<ResultadoGateDebito>;
```

`FormaPagamentoDebito` é própria, e não `AutorizacaoPendente`: aquela carrega
`valorAtivacaoCentavos` (o preço do QR que AUTORIZA o Pix Automático), e reusá-la
para uma cobrança de dívida repetiria a confusão do D21 num campo de tipo.

**Regra do gate** (`DEB-03`/`DEB-04`/`DEB-06`):

| total devido   | ação                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| `0`            | `sem_debito` → chamador segue para `iniciarAtivacao`                                   |
| `0 < t < PISO` | `adiado` (`abaixo_do_piso`) → segue para `iniciarAtivacao`, ciclos permanecem `devido` |
| `t >= PISO`    | `cobranca` → emite/reusa e **não** chama `iniciarAtivacao`                             |

**Idempotência** (`DEB-05`): **uma cobrança por âncora, para sempre.** A chave é
`externalReference = debito:<ancoraId>`, determinística, e quem a honra é o
adapter (`buscarCobrancaPorReferencia`, o mesmo mecanismo de
`emitirCobrancaDeCiclo`). Isso cobre inclusive a falha mais desagradável — o
processo morrer entre o `POST /payments` e o UPDATE local —, porque a busca
acontece no gateway, não no nosso estado.

O tratamento por status da cobrança devolvida:

- `paga` → concilia na hora e devolve `sem_debito` (o webhook pode ter atrasado);
- `pendente` → devolve a mesma forma de pagamento;
- `recusada` → **também devolve a mesma**. No Asaas ela vem de `OVERDUE`, e
  cobrança Pix vencida continua pagável;
- `estornada` → **lança**, com log `[billing-debito]`. É o único estado sem saída
  automática: estorno é decisão comercial humana, e reemitir por cima dela é
  exatamente o que nenhum job deve fazer sozinho. Barulhento é melhor que um
  gate congelado em silêncio.

Emitir uma segunda cobrança em qualquer desses ramos foi considerado e
descartado: a primeira continua paga­vel no gateway, e se a clínica pagar a
antiga o webhook chega com um `provider_charge_id` que já não está em ciclo
nenhum — dinheiro recebido, dívida não quitada.

**Falhar fechado** (`DEB-08`): sem `provider` ou sem `provider_customer_id` na
assinatura, o gate **lança**. Deixar passar seria abrir a conta sem cobrar o
débito — o modo de falha caro. A mensagem ao usuário é acionável e o detalhe vai
para o log (mesmo padrão de `logic.ts`).

**Degradação em recusa do gateway** (pre-mortem #2 e #5). Falhar fechado protege
a receita do ciclo passado e, se o piso estiver errado, destrói a de todos os
ciclos futuros: a clínica não conseguiria reativar **nunca**. Por isso o gate
distingue os dois erros, com a mesma régua que `reprocessarEventosPendentes` já
usa:

| erro na emissão                                      | ação                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `BillingProviderError` com `status` 4xx              | degrada para `adiado` (`recusa_do_gateway`): **deixa reativar e mantém `devido`** |
| rede, timeout, 5xx, ou 4xx transitório (401/408/429) | propaga o erro — a tela pede para tentar de novo                                  |

Degradar **nunca perdoa**: os ciclos continuam `devido` e são cobrados na volta
seguinte. E a degradação é exclusiva de recusa EXPLÍCITA do gateway — uma
instabilidade do Asaas não pode virar reativação grátis para quem estiver
tentando naquele minuto.

## 3. Porta do gateway — `emitirCobrancaAvulsa`

`emitirCobrancaDeCiclo` **não serve** para o débito: ela faz
`GET /pix/automatic/authorizations/{vinculoId}` e manda
`pixAutomaticAuthorizationId` no `POST /payments`. No cancelamento a autorização
foi revogada — é literalmente o ato que produziu o cancelamento. Cobrar por um
trilho morto é o D21 de novo (misturar autorização com cobrança).

Método novo, obrigatório na interface (só existe um adapter vivo, o Asaas):

```ts
emitirCobrancaAvulsa(dados: NovaCobrancaAvulsa): Promise<CobrancaEmitida>;

export interface NovaCobrancaAvulsa {
  /** Cliente no gateway (`subscription.provider_customer_id`). */
  clienteId: string;
  valorCentavos: number;
  /** `debito:${ancoraId}` — reconcilia webhook ↔ ciclo âncora. */
  referenciaExterna: string;
  descricao: string;
  vencimento: Date;
}
```

`CobrancaEmitida` ganha `pixCopiaECola?: string`. O Asaas devolve o BR Code em
`GET /payments/{id}/pixQrCode` (campo `payload`); `encodedImage` continua
ignorado — a UI já desenha o QR localmente a partir do payload (precedente da
ativação). Falha ao buscar o QR **não** derruba a emissão: a cobrança existe, e
`urlPagamento` (`invoiceUrl`) é a saída de contingência.

Idempotência do adapter: reusa `buscarCobrancaPorReferencia`, como
`emitirCobrancaDeCiclo` já faz.

## 4. Estado da conta — `estado-conta.ts` (`DEB-01`/`DEB-02`)

`SituacaoConta` ganha:

```ts
/** Soma dos ciclos `devido`, em centavos. `0` quando não há débito. */
debitoCentavos: number;
```

A soma entra na **mesma query** de `avaliarSituacaoConta` — mesma disciplina do
comentário de topo do módulo: status da assinatura e débito precisam enxergar o
mesmo instante do banco.

```sql
COALESCE((
  SELECT SUM(bc.valor_centavos)
  FROM billing_cycle bc
  WHERE bc.clinic_id = c.id AND bc.status = 'devido'
), 0)::int AS debito_centavos
```

Sob RLS (`app_role`), coberta por `billing_cycle_select`.

`mensagemDeEstado(estado, debitoCentavos = 0)`: parâmetro **opcional com default
zero** para não quebrar os call sites que não têm o número — e porque o texto sem
valor continua correto, só menos informativo.

`derivarSituacao` não muda de forma: `debitoCentavos` é carregado da linha e
propagado; nenhum estado novo é criado. Débito **não** altera `podeEscrever` —
`cancelada` já é somente-leitura.

## 5. UI

- `FaixaTrial` recebe `debitoCentavos` e, em `cancelada` com débito > 0, diz o
  valor e mantém o CTA "Ativar assinatura". `variant="info"` (regra do
  componente: `alerta` é do risco clínico).
- **Débito com a conta `ativa` também aparece** (pre-mortem #3). Reativação com
  débito abaixo do piso deixa uma dívida viva; se a tarja só existisse em
  `cancelada`, ela sumiria da tela justamente no intervalo em que a clínica
  poderia pagá-la, e reapareceria somada no cancelamento seguinte. `FaixaTrial`
  passa a renderizar uma linha discreta para `ativa` **quando há débito**, e
  `/assinatura` mostra o valor devido em **qualquer** estado.
- `/assinatura`: `FormularioAtivacao` recebe o débito e, quando > 0, mostra o
  valor **antes** do botão — a pessoa sabe o que vai pagar antes de clicar.
- Após submeter com débito ≥ piso, `AtivacaoState` volta com
  `debito: { valorCentavos, autorizacao }` e a tela renderiza o copia-e-cola do
  débito, reaproveitando o bloco de QR da ativação.

**O sinal observado é o DÉBITO, não o status da assinatura** (pre-mortem #1).
Pagar o débito não move `subscription.status` — ela continua `canceled` até a
clínica reativar de fato. Um polling herdado da ativação, que espera `active`,
ficaria girando para sempre sobre um QR já pago: a pessoa conclui que falhou e
paga de novo. A tela do débito observa `debitoCentavos` e, quando ele zera, troca
o QR por confirmação explícita e pelo botão de continuar a reativação.

## 6. Conciliação — `conciliarPagamentoDeCiclo`

No ramo `paga`, além de marcar a linha encontrada:

```ts
await authDb
  .update(billingCycle)
  .set({ status: "pago", cobradoEm: agora, erro: null })
  .where(eq(billingCycle.debitoAgrupadoEm, ciclo.id));
```

Idempotente por construção (reescrever `pago` com `pago` é no-op). A promoção de
`past_due` → `active` continua guardada por `eq(subscription.status,"past_due")`,
então **pagar débito não reativa** assinatura `canceled` (`DEB-03` item 4) — a
reativação continua sendo um ato explícito da clínica.

## 7. Ordem de implementação

1. Migração `0098` + `schema.ts` + journal.
2. `debito.ts` com testes de unidade da regra do gate (piso, zero, acumulação).
3. Porta + adapter Asaas (`emitirCobrancaAvulsa`), com teste de adapter.
4. `estado-conta.ts` + `mensagemDeEstado` + testes.
5. `conciliarPagamentoDeCiclo` (agrupamento) + teste de integração.
6. `logic.ts` (gate) + teste de integração do fluxo completo, incluindo o loop.
7. UI (`FaixaTrial`, `formulario-ativacao`) + testes de componente.

## Riscos conhecidos

- **RISCO-1 — piso não medido.** `PISO_COBRANCA_AVULSA_CENTAVOS` é escolha
  conservadora, não medição (ver `spec.md`). Erro para baixo é inofensivo; para
  cima o gate degrada em vez de trancar a clínica fora. Medição em #311.
  **Encerrado em 15/08/2026:** o piso real é R$ 5,00, medido no sandbox do Asaas
  (registro cru em `infra/README.md`, Medição 6) — a constante já estava certa.
- **RISCO-2 — ciclos `falhou` ficam de fora.** Assinatura que vai a `past_due`
  com cobrança recusada e depois é cancelada tem um ciclo `falhou` (cheio, não
  pro-rata) que o gate **não** cobra. Fora de escopo por risco de cobrança em
  dobro: já existe cobrança emitida no gateway para aquele período. Rastreado em
  **#310**.
- **RISCO-3 — `provider_customer_id` ausente em linhas antigas.** O gate falha
  fechado e a clínica não consegue reativar sem intervenção. Aceito: falso
  positivo aqui custa um suporte; falso negativo custa a receita e reabre o
  exploit.
