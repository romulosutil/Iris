# Teto de valor no Pix Automático (#286) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que a clínica autorize o Pix Automático com um teto de R$ 0,01 (que quebraria toda cobrança futura em silêncio) e, quando a recusa acontecer mesmo assim, gravar um diagnóstico que nomeie a causa provável em vez de "recusada".

**Architecture:** Duas frentes independentes. (1) Copy preventiva dentro do `<Alert>` já existente da `/assinatura`, antes do QR Code — é a única barreira preventiva disponível, porque a medição provou que o teto **não** é legível pela API. (2) O caminho da recusa (`INSTRUCTION_REFUSED` → `cobranca.recusada` → `billing_cycle.erro`) passa a carregar um motivo: o motivo bruto do gateway quando ele existir, e um diagnóstico com as hipóteses ranqueadas quando não existir. Nenhuma das duas inventa dado do gateway.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest + Testing Library, Drizzle/Postgres.

**Spec:** GitHub issue #286 (corpo + comentário de correção de premissa do Rômulo de 13/08/2026 + comentário de medição de 13/08/2026). Medição de referência: `GET /pix/automatic/authorizations` no sandbox — nenhum campo de teto no objeto `authorization`; `INSTRUCTION_REFUSED` sem motivo discriminado observável.

## Global Constraints

- **Copy em pt-BR**; commits em inglês (`docs/arquitetura/convencoes-de-codigo.md`).
- **Nenhum valor em reais hardcoded na tela.** O valor da ativação vem sempre de `autorizacao.valorAtivacaoCentavos` via `formatarBRL()` (D22). Já existe teste que falha se aparecer `R$` literal no bloco de cima: `formulario-ativacao.test.tsx:74`.
- **A copy nova fica DENTRO do `<Alert severidade="info" titulo="Falta pagar para concluir">`** (aberto em `formulario-ativacao.tsx:139`) e **ANTES** do `<QrCode>` (linha 179-184). Fora do Alert o leitor de tela recebe o aviso como parágrafo solto; depois do QR a pessoa já está no app do banco.
- **Sem componente novo.** O `Alert` (`src/components/ui/alert.tsx`) aceita `severidade`, `titulo` e `children` livre; o ramo Pix hoje é uma sequência de `<p>`/`<div>` dentro de um Fragment. Seguir isso — nada de `<ul>` novo.
- **Nada que dependa só de cor ou ícone para significar** (a11y é compromisso de 1ª classe).
- **Proibido presumir campo de motivo de recusa do Asaas.** A leitura é defensiva: se o campo existir no payload, usa; se não existir, `null` — e o diagnóstico diz explicitamente que o gateway não informou.
- **Proibido consultar a documentação de Pix Automático do Asaas** (prompt injection conhecido, registro da #36). Fonte é o código do repo e resposta real da API.
- `R$ 40` na copy é **conta de folga**, não preço: a faixa marginal real é R$ 25–39 por paciente ativo. Não pode virar promessa de preço.

---

### Task 1: Copy preventiva do teto na `/assinatura`

**Files:**

- Modify: `src/app/(app)/assinatura/formulario-ativacao.tsx:178-179` (entre o `</p>` do "Abra o app do seu banco…" e a `<div>` do `QrCode`)
- Test: `src/app/(app)/assinatura/formulario-ativacao.test.tsx`

**Interfaces:**

- Consumes: `autorizacao.valorAtivacaoCentavos` (number, centavos) e `formatarBRL(centavos: number): string` — ambos já em escopo no mesmo bloco (uso existente em `formulario-ativacao.tsx:167`).
- Produces: nada consumido por outras tasks. Alteração isolada de UI.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `src/app/(app)/assinatura/formulario-ativacao.test.tsx`, dentro do mesmo `describe` que já renderiza o ramo Pix:

```tsx
it("avisa sobre o teto do banco dentro do mesmo Alert e ANTES do QR Code", async () => {
  const user = userEvent.setup();
  const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";
  render(
    <FormularioAtivacao
      acao={acaoQueDevolve({
        autorizacao: {
          forma: "pix_copia_e_cola",
          brCode,
          valorAtivacaoCentavos: 1,
        },
      })}
      navegar={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: /ativar assinatura/i }));

  // O aviso existe e nomeia as duas coisas que o leitor precisa fazer:
  // não aceitar o valor da ativação como teto, e usar a conta de folga.
  const aviso = await screen.findByText(/valor máximo/i);
  expect(aviso.textContent).toMatch(/R\$ 40/);

  // Está DENTRO do mesmo Alert do QR Code — não é parágrafo solto ao lado.
  const qr = screen.getByRole("img", {
    name: /QR Code do Pix para autorizar a assinatura/i,
  });
  const alerta = qr.closest("[role='status'], [role='alert'], div");
  expect(alerta?.contains(aviso)).toBe(true);

  // E vem ANTES do QR na ordem do DOM: depois de ler o código a pessoa já
  // está no app do banco e não volta para ler aviso nenhum.
  // DOCUMENT_POSITION_FOLLOWING = 4 → `qr` vem depois de `aviso`.
  expect(
    aviso.compareDocumentPosition(qr) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
```

- [ ] **Step 2: Rodar o teste e conferir que ele falha**

Run: `pnpm test -- src/app/\(app\)/assinatura/formulario-ativacao.test.tsx -t "teto do banco"`
Expected: FAIL — `Unable to find an element with the text: /valor máximo/i`

- [ ] **Step 3: Inserir a copy**

Em `src/app/(app)/assinatura/formulario-ativacao.tsx`, logo depois do `</p>` da linha 178 e **antes** da `<div className="mt-3 flex justify-center">` da linha 179:

```tsx
{
  /* #286 — o teto de valor é diretriz do BACEN: TODO app de banco
                  pergunta, em TODA ativação, e sugere o valor em tela (o da
                  ativação). Aceitar a sugestão faz toda mensalidade futura ser
                  recusada meses depois, em silêncio. Medido em 13/08/2026: o
                  teto NÃO é legível pela API do Asaas (nenhum campo de máximo
                  no objeto `authorization`), então não há detecção possível —
                  esta copy é a única barreira preventiva. Fica antes do QR de
                  propósito: depois de ler o código a pessoa já está no app do
                  banco. `R$ 40` é conta de folga sobre a faixa marginal real
                  (R$ 25 a R$ 39 por paciente ativo), não promessa de preço. */
}
<p className="mt-2">
  <strong>
    O banco vai pedir um valor máximo de cobrança — não aceite os{" "}
    {formatarBRL(autorizacao.valorAtivacaoCentavos)} sugeridos
  </strong>
  , isso é só a ativação. Use um teto com folga: pacientes esperados no mês ×{" "}
  <strong>R$ 40</strong>.
</p>;
```

- [ ] **Step 4: Rodar o teste e conferir que passa, junto com o arquivo inteiro**

Run: `pnpm test -- src/app/\(app\)/assinatura/formulario-ativacao.test.tsx`
Expected: PASS em todos — inclusive o teste existente `declara o trilho de pagamento real (Pix Automático) sem citar valor` (`:64`), que continua verde porque a copy nova está no ramo do QR, não no bloco de cima onde `R$` é proibido.

- [ ] **Step 5: Formatar só o que foi tocado, e conferir tipos e lint**

```bash
pnpm prettier --write "src/app/(app)/assinatura/formulario-ativacao.tsx" "src/app/(app)/assinatura/formulario-ativacao.test.tsx"
pnpm typecheck
pnpm lint
```

`pnpm format` sem argumento reformata o repo inteiro (incluindo `.agents/` e o worktree aninhado) — não usar.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/assinatura/formulario-ativacao.tsx" "src/app/(app)/assinatura/formulario-ativacao.test.tsx"
git commit -m "feat(billing): warn about the bank's value ceiling before the Pix QR code"
```

---

### Task 2: Adapter passa a devolver o motivo da recusa (quando existir)

**Files:**

- Modify: `src/lib/billing/provider/types.ts:268-271` (retorno de `consultarCobranca` na porta)
- Modify: `src/lib/billing/provider/asaas.ts:706-723` (`AsaasProvider.consultarCobranca`)
- Test: `src/lib/billing/provider/asaas.test.ts` (bloco `describe("consultarCobranca")`, a partir de `:477`)

**Interfaces:**

- Consumes: helpers já existentes em `asaas.ts` — `comoRegistro(v: unknown): Record<string, unknown>`, `comoTexto(v: unknown): string | null`, `mapearStatusCobranca`, `reaisParaCentavos`.
- Produces: `consultarCobranca(providerChargeId: string): Promise<{ status: StatusCobranca; valorCentavos: number; motivoRecusa: string | null }>` — a Task 3 consome `motivoRecusa`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar dentro do `describe("consultarCobranca")` em `src/lib/billing/provider/asaas.test.ts`:

> ⚠️ **Superado pelo débito D35 (15/08/2026).** A premissa deste passo — "o
> motivo pode vir no corpo de `GET /payments/{id}`" — foi medida contra o
> OpenAPI e é falsa: o `PaymentGetResponseDTO` não declara `refusalReason`,
> `failureReason` nem um `pixTransaction` objeto. O dono do motivo é
> `GET /v3/pix/automatic/paymentInstructions/{id}`. Os códigos abaixo foram
> migrados para os REAIS do catálogo do Asaas (inglês); o código do adapter
> está em `asaas.ts:motivoDaRecusa`.

```ts
it("devolve o motivo da recusa quando o gateway informa algum", async () => {
  // Leitura defensiva, não contrato: medido em 13/08/2026, o objeto `payment`
  // do Asaas NÃO trouxe campo de motivo em nenhuma das cobranças reais do
  // sandbox. Se um dia trouxer, o motivo tem que chegar ao ciclo — e o teste
  // documenta os nomes que o adapter aceita.
  respostaFalsa({
    id: "pay_1",
    status: "REFUSED",
    value: 390,
    refusalReason: "MAXIMUM_AMOUNT_EXCEEDED",
  });
  const r = await new AsaasProvider().consultarCobranca("pay_1");
  expect(r.motivoRecusa).toBe("MAXIMUM_AMOUNT_EXCEEDED");
});

it("devolve motivoRecusa null quando o gateway não informa nada", async () => {
  // É este o caso REAL medido. `null` aqui é o que dispara o diagnóstico com
  // hipóteses ranqueadas na Task 3 — inventar um motivo aqui seria o erro que
  // a #286 existe para evitar.
  respostaFalsa({ id: "pay_2", status: "REFUSED", value: 390 });
  const r = await new AsaasProvider().consultarCobranca("pay_2");
  expect(r.motivoRecusa).toBeNull();
});
```

`respostaFalsa` é o nome do dublê de `fetch` já usado neste arquivo — abrir `asaas.test.ts:477-495` e reusar o helper existente com o nome que ele tiver ali. **Não criar um segundo dublê.**

- [ ] **Step 2: Rodar e conferir que falha**

Run: `pnpm test -- src/lib/billing/provider/asaas.test.ts -t "motivo da recusa"`
Expected: FAIL — `motivoRecusa` é `undefined` (a propriedade não existe no retorno).

- [ ] **Step 3: Ampliar o tipo da porta**

Em `src/lib/billing/provider/types.ts`, substituir a assinatura de `consultarCobranca` (`:268-271`) por:

```ts
  consultarCobranca(providerChargeId: string): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
    /**
     * Motivo bruto da recusa, do jeito que o gateway mandou, ou `null` quando
     * ele não informa. Medido em 13/08/2026 contra o Asaas: NENHUM campo de
     * motivo apareceu no objeto `payment`, e as autorizações recusadas vieram
     * com `cancellationReason: null`. Por isso `null` é o caso esperado, não a
     * exceção — quem consome tem que ter um caminho para "não informado".
     */
    motivoRecusa: string | null;
  }>;
```

- [ ] **Step 4: Implementar no adapter**

Em `src/lib/billing/provider/asaas.ts`, substituir o corpo de `consultarCobranca` (`:706-723`):

```ts
  async consultarCobranca(providerChargeId: string): Promise<{
    status: StatusCobranca;
    valorCentavos: number;
    motivoRecusa: string | null;
  }> {
    const resposta = comoRegistro(
      await chamar("GET", `/payments/${encodeURIComponent(providerChargeId)}`),
    );
    const valor = resposta.value;

    /**
     * Leitura defensiva: nenhum destes campos foi observado numa resposta real
     * (medição de 13/08/2026 — o `payment` recusado não trouxe motivo algum, e
     * `pixTransaction` veio `null`). Tentamos os nomes plausíveis e aceitamos
     * `null`; o diagnóstico com hipóteses ranqueadas fica em
     * `conciliarPagamentoDeCiclo`, não aqui. O adapter não adivinha causa.
     */
    const motivoRecusa =
      comoTexto(resposta.refusalReason) ??
      comoTexto(resposta.failureReason) ??
      comoTexto(comoRegistro(resposta.pixTransaction).failureReason) ??
      null;

    return {
      status: mapearStatusCobranca(resposta.status),
      // Volta ao inteiro na entrada do sistema: nenhum decimal atravessa a porta.
      valorCentavos:
        typeof valor === "number" && Number.isFinite(valor)
          ? reaisParaCentavos(valor)
          : 0,
      motivoRecusa,
    };
  }
```

- [ ] **Step 5: Rodar os testes do adapter inteiro**

Run: `pnpm test -- src/lib/billing/provider/asaas.test.ts`
Expected: PASS. Se algum outro dublê de `BillingProvider` (fake/mock em teste) quebrar por não devolver `motivoRecusa`, corrigir o dublê para devolver `null` — nunca afrouxar o tipo da porta.

Run: `pnpm typecheck`
Expected: 0 erros. `typecheck` é o que revela todos os implementadores e dublês da porta.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/provider/types.ts src/lib/billing/provider/asaas.ts src/lib/billing/provider/asaas.test.ts
git commit -m "feat(billing): surface the gateway refusal reason through the provider port"
```

---

### Task 3: `billing_cycle.erro` nomeia a causa provável da recusa

**Files:**

- Modify: `src/lib/billing/subscription.ts:603-660` (`conciliarPagamentoDeCiclo`, ramo `status === "recusada"`, `:642-646`)
- Modify: `src/app/api/hooks/asaas/route.ts:160-171` (a rota passa o motivo adiante)
- Modify: `src/lib/billing/subscription.ts:726-732` (a varredura `reprocessarEventosPendentes` passa o motivo adiante também)
- Test: `src/lib/billing/fechamento-provedor-por-linha.int.test.ts`

**Interfaces:**

- Consumes: `consultarCobranca(...) => { status, valorCentavos, motivoRecusa }` (Task 2).
- Produces: `conciliarPagamentoDeCiclo(providerChargeId: string, status: StatusCobranca, motivoRecusa?: string | null): Promise<boolean>` — terceiro parâmetro **opcional**, default `null`, para não quebrar chamada existente nenhuma.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `src/lib/billing/fechamento-provedor-por-linha.int.test.ts`, seguindo o padrão de setup de ciclo já usado no arquivo (reusar os helpers existentes de criação de clínica/assinatura/ciclo — **não** escrever um setup novo):

```ts
it("recusa sem motivo do gateway grava diagnóstico que nomeia o teto como causa provável", async () => {
  // O modo de falha mais provável da cobrança recorrente, agora que se sabe
  // que o teto é obrigatório por diretriz do BACEN (#286): a clínica autorizou
  // com teto de R$ 0,01 e a fatura real não passa. Sem nomear a hipótese, o
  // ciclo só dizia "cobrança recusada pelo gateway" e quem fosse diagnosticar
  // olharia o adapter e o job antes de olhar a configuração no banco do cliente.
  const { cicloId } = await cicloAguardandoPagamento();

  await conciliarPagamentoDeCiclo("pay_recusada", "recusada", null);

  const [ciclo] = await authDb
    .select()
    .from(billingCycle)
    .where(eq(billingCycle.id, cicloId));
  expect(ciclo!.status).toBe("falhou");
  expect(ciclo!.erro).toMatch(/teto/i);
  expect(ciclo!.erro).toMatch(/sem motivo informado/i);
});

it("recusa COM motivo do gateway grava o motivo bruto, sem inventar hipótese", async () => {
  const { cicloId } = await cicloAguardandoPagamento();

  await conciliarPagamentoDeCiclo(
    "pay_recusada_2",
    "recusada",
    "PAYMENT_OVERDUE",
  );

  const [ciclo] = await authDb
    .select()
    .from(billingCycle)
    .where(eq(billingCycle.id, cicloId));
  // Quando o gateway diz a causa, ela manda — o diagnóstico do Iris não pode
  // sobrepor "provavelmente é o teto" a um "saldo insuficiente" explícito: a
  // orientação ao cliente é oposta nos dois casos.
  expect(ciclo!.erro).toContain("PAYMENT_OVERDUE");
  expect(ciclo!.erro).not.toMatch(/teto/i);
});
```

`cicloAguardandoPagamento()` é o helper de setup já existente no arquivo — usar o nome real que estiver lá, e o `providerChargeId` que ele carimba no ciclo.

- [ ] **Step 2: Rodar e conferir que falha**

Run: `pnpm test -- src/lib/billing/fechamento-provedor-por-linha.int.test.ts -t "teto como causa provável"`
Expected: FAIL — `erro` é `"cobrança recusada pelo gateway"`, sem `teto`.

- [ ] **Step 3: Implementar o diagnóstico**

Em `src/lib/billing/subscription.ts`, mudar a assinatura (`:603-606`) para aceitar o motivo:

```ts
export async function conciliarPagamentoDeCiclo(
  providerChargeId: string,
  status: StatusCobranca,
  motivoRecusa: string | null = null,
): Promise<boolean> {
```

E substituir o `set` do ramo de recusa (`:642-646`) por:

```ts
  if (status === "recusada") {
    /**
     * #286 — "recusada" sozinho manda quem diagnostica para o lugar errado.
     * O teto de valor do Pix Automático é OBRIGATÓRIO por diretriz do BACEN:
     * todo app de banco pergunta, em toda ativação, sugerindo o valor da
     * cobrança em tela (a ativação, não a mensalidade). Um teto aceito com
     * essa sugestão recusa toda fatura real — e é o modo de falha mais
     * provável da cobrança recorrente, não uma hipótese remota.
     *
     * Quando o gateway informa a causa, ela MANDA: "avise o cliente para
     * ajustar o limite no banco" e "avise o cliente para pôr dinheiro na
     * conta" são orientações opostas, e sobrepor a nossa hipótese a um motivo
     * explícito do gateway trocaria uma por outra. Medido em 13/08/2026: o
     * Asaas não informou motivo em nenhuma recusa observável, então o ramo
     * `null` é o esperado — e ele diz que a causa é HIPÓTESE, não fato.
     */
    const erro = motivoRecusa
      ? `cobrança recusada pelo gateway: ${motivoRecusa}`
      : "cobrança recusada pelo gateway, sem motivo informado — causa mais provável: teto de valor do Pix Automático definido no app do banco abaixo do valor da fatura (#286); segunda hipótese: saldo insuficiente";

    // Log com tag fixa e greppável: é por ele que a primeira recusa real de
    // produção vira sinal em vez de linha morta na tabela.
    console.warn("[billing-recusa] cobrança de ciclo recusada", {
      providerChargeId,
      motivoRecusa,
    });

    await authDb
      .update(billingCycle)
      .set({ status: "falhou", erro })
      .where(eq(billingCycle.id, ciclo.id));
```

O restante do ramo (`past_due` + `pastDueDesde` na entrada) fica **exatamente** como está.

- [ ] **Step 4: Repassar o motivo nos dois chamadores**

Em `src/app/api/hooks/asaas/route.ts`, no ramo `if (normalizado.providerChargeId)` (`:160-167`):

```ts
const aplicou = await conciliarPagamentoDeCiclo(
  normalizado.providerChargeId,
  atual.status,
  atual.motivoRecusa,
);
```

Em `src/lib/billing/subscription.ts:729-732` (varredura de pendentes):

```ts
await conciliarPagamentoDeCiclo(
  normalizado.providerChargeId,
  atual.status,
  atual.motivoRecusa,
);
```

- [ ] **Step 5: Rodar a suíte que cobre este caminho**

```bash
pnpm test -- src/lib/billing/fechamento-provedor-por-linha.int.test.ts
pnpm test -- src/app/api/hooks/asaas/route.int.test.ts
pnpm test -- src/lib/billing/reprocessamento-provedor.int.test.ts
pnpm typecheck
pnpm lint
```

Expected: PASS em todos. Se o teste da rota tiver um dublê de provider, ele precisa devolver `motivoRecusa` — devolver `null` é a forma certa (é o que produção faz hoje).

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/subscription.ts src/app/api/hooks/asaas/route.ts src/lib/billing/fechamento-provedor-por-linha.int.test.ts
git commit -m "feat(billing): name the likely cause when a cycle charge is refused"
```

---

### Task 4: Medição de produção que fecha o ponto aberto (ação de campo, sem código)

**Files:**

- Modify: `docs/infra/` — acrescentar o passo ao runbook de faturamento existente (o mesmo arquivo onde está o procedimento do job de fechamento). Se não houver seção adequada, criar `docs/infra/medicao-teto-pix-automatico.md`.

**Interfaces:**

- Consumes: nada. Produces: a resposta definitiva de P1, a ser colada como comentário na #286.

Esta task não tem ciclo de teste porque não tem código: é medição contra produção, e só o Rômulo tem acesso ao painel (`infra/README.md:26`).

- [ ] **Step 1: Documentar o procedimento**

A autorização real está em produção e a chave de produção só existe no Easypanel — mas o payload bruto de todo evento entregue já está no banco de produção, em `asaas_webhook_event.payload` (`src/db/schema.ts:1696-1710`). Registrar:

```sql
-- Console Bash do serviço `iris-postgres` no Easypanel → psql -U iris
-- Objetivo: ver se o objeto `authorization` REAL, já em ACTIVE, traz algum
-- campo de teto que o sandbox (todas REFUSED) não mostrou.
SELECT evento,
       jsonb_pretty(payload)
  FROM asaas_webhook_event
 WHERE evento LIKE 'PIX_AUTOMATIC_RECURRING_AUTHORIZATION%'
 ORDER BY criado_em DESC
 LIMIT 5;
```

O que procurar no JSON: qualquer chave de máximo (`maximumValue`, `maxValue`, `limit`, `maxLimitValue`) dentro de `authorization`. Se existir → abrir issue de follow-up para o Iris **detectar** teto insuficiente na ativação, que é a solução real (a copy da Task 1 vira rede de segurança, como estava previsto no corpo da #286). Se não existir → a copy é o teto do que dá para fazer, e a #286 fecha com o que este plano entrega.

- [ ] **Step 2: Colar o resultado na #286 e marcar o checkbox**

Colar o JSON (redigindo ids e CPF) como comentário na issue. **Resposta negativa também vale e também precisa ser colada** — a DoD da issue pede a resposta registrada "mesmo que negativa".

- [ ] **Step 3: Commit da documentação**

```bash
git add docs/infra/
git commit -m "docs(infra): record how to measure the real Pix Automático ceiling in production"
```

---

## Fora de escopo (decidido, não esquecido)

- **Item 3 do corpo original da #286** ("verificar e corrigir o teto já gravado do Rômulo") está **resolvido/sem ação** pelo comentário de correção de premissa: não é anomalia da conta dele, é o fluxo normal de toda ativação.
- **Detecção automática de teto insuficiente** não entra: a medição provou que não há campo legível. Só volta à mesa se a Task 4 encontrar o campo no payload de produção.
- **Notificar a clínica sobre a recusa** (e-mail/alerta na UI) é trabalho maior e depende do canal de comunicação de cobrança — issue separada. Este plano entrega o diagnóstico gravado e logado, que é o que a DoD da #286 pede.
