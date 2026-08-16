# Parâmetros da autorização Pix Automático (#317) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar `minLimitValue` e `retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS"` na criação da autorização de Pix Automático — parâmetros irreversíveis, só definíveis na criação — e ajustar o cálculo do vencimento da cobrança de ciclo para satisfazer a leitura **mais restritiva** da janela do Asaas, que a medição do sandbox (#321) provou não ser mensurável fora de produção.

**Architecture:** Três mudanças pequenas e independentes em módulos existentes, mais um módulo novo de calendário bancário brasileiro (não existe lib de data no repo). Nada toca schema, RLS ou o schema do agente de extração.

**Tech Stack:** TypeScript, `Date` nativo + `Intl.DateTimeFormat` (sem `date-fns`/`dayjs`), Vitest.

**Spec:** issue [#317](https://github.com/romulosutil/Iris/issues/317) — corpo **e os três comentários**, que corrigem o corpo em pontos materiais. Ordem dos passos: artifact "Ordem de conclusão" (passo 2 de 9). Medições: `infra/README.md` §"Runbook — sessão de medição no sandbox do Asaas (#321)".

---

## Global Constraints

- Documentação, comentários e copy em **pt-BR**. Commits em **inglês**.
- Formatar **só os arquivos tocados** (`pnpm prettier --write <arquivo>`) — nunca `pnpm format`.
- Nenhum número mágico: `minLimitValue` deriva da tabela de preços.
- Disciplina de `asaas.test.ts` (topo do arquivo): **o teste assere o literal do gateway**, não a constante — derivar do código faria o teste seguir a constante em vez de vigiá-la.
- "Não medido" é resultado, não pendência: onde a medição foi impossível, o comentário no código diz o que está suposto e por quê.
- Verde exigido ao final: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

---

## Decisões de produto tomadas nesta sessão (arquiteto)

| # | Decisão | Por quê |
| :- | :------ | :------ |
| **D-A** | `minLimitValue` deriva de `FAIXAS_PRECIFICACAO[0].valorCentavos` (R$ 39,00), **não** de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` | O corpo da issue manda derivar da segunda, mas `calculator.ts:65-72` a declara **LEGADO** — "nenhum caminho de produção deve voltar a usá-la". Ressuscitá-la em produção contradiz o próprio docblock. A faixa marginal mais alta carrega a mesma verdade (o preço de uma ficha ativa) e já é a fonte que a copy do teto usa (#286). |
| **D-B** | Entra **só a flag** `retryPolicy`. A orquestração extradia fica na **#322** | Comentário 2 da issue: a flag sozinha é inerte; quem comanda cada retentativa é o recebedor via `POST /pix/automatic/paymentInstructions/{id}/retries`. A flag é irreversível, a orquestração não — separar é o que torna esta entrega urgente e pequena. |
| **C-C** | Janela: postura **conservadora sem medição** — satisfazer o mais restritivo das duas leituras | A doc do Asaas se contradiz (Implementação diz "2 a 10 dias **úteis**"; Motivos de Recusa dizem "10 dias"/"2 dias" sem qualificar; BACEN diz corridos). #321 provou que **não é mensurável no sandbox** (autorização nunca ativa). Esperar o ensaio em produção deixaria o bug sazonal vivo; a postura conservadora é correta sob qualquer das leituras. |
| **D-D** | `subscription.carencia_dias` **fica em 7** | A carência só seria pressionada pela retentativa se a orquestração existisse. Com 2a sozinha o comportamento não muda. Redimensionar entra na #319, que já tem a pergunta na pauta. |
| **D-E** | `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS` | Sem o rename passam a existir dois "piso" opostos no mesmo domínio: o piso do que **nós cobramos** (gate de reativação, #290/#311) e o piso do **teto que o pagador autoriza** (`minLimitValue`). O valor e o docblock de medição continuam sendo escopo da #311. |

**Risco aceito e registrado:** com 2a em produção sem 2b, nenhuma retentativa extradia é comandada por nós, logo os campos novos de webhook (`purpose`, `retryAttempt`) não chegam a existir num evento nosso. O risco de carimbar `past_due` três vezes pelo mesmo ciclo nasce junto com a #322, e é lá que os campos devem ser lidos.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
| :------ | :--------------- | :--- |
| `src/lib/billing/calculator.ts` | Fonte única da precificação | Modificar — exportar `PISO_TETO_AUTORIZACAO_CENTAVOS` derivado de `FAIXAS_PRECIFICACAO[0]` |
| `src/lib/billing/provider/asaas.ts` | Adapter do gateway | Modificar — payload da autorização (`:512-533`), docblock do método (`:470-481`), comentários da janela (`:46-50`, `:143`) |
| `src/lib/billing/provider/asaas.test.ts` | Vigia o corpo cru das requisições | Modificar — `:335` e `:339` invertem |
| `src/lib/billing/calendario-bancario.ts` | **Novo** — feriados bancários BR e aritmética de dia útil em data civil de São Paulo | Criar |
| `src/lib/billing/calendario-bancario.test.ts` | **Novo** — Páscoa móvel, feriados fixos, contagem de dias úteis | Criar |
| `src/lib/billing/vencimento.ts` | **Novo** — regra de vencimento da cobrança de ciclo dentro da janela do Pix Automático | Criar |
| `src/lib/billing/vencimento.test.ts` | **Novo** — janela sob fim de semana, Carnaval, guarda do teto | Criar |
| `src/lib/billing/subscription.ts` | Fechamento de ciclo | Modificar — `:626` passa a chamar `vencimentoCobrancaDeCiclo` |
| `src/lib/billing/debito.ts` | Gate de débito (#290) | Modificar — rename da constante |
| `src/lib/billing/debito.test.ts`, `src/app/(app)/assinatura/gate-debito.int.test.ts` | Testes do gate | Modificar — rename |

---

### Task 1: Payload da autorização — `minLimitValue` + `retryPolicy`

**Files:**
- Modify: `src/lib/billing/calculator.ts` (após a linha 73)
- Modify: `src/lib/billing/provider/asaas.ts:470-481, 512-533`
- Test: `src/lib/billing/provider/asaas.test.ts:326-352`

**Interfaces:**
- Produces: `PISO_TETO_AUTORIZACAO_CENTAVOS: number` exportado de `src/lib/billing/calculator.ts`.
- Consumes: `centavosParaReais` (`asaas.ts:128`), já no arquivo.

- [ ] **Step 1: Inverter as duas asserções do teste**

Em `asaas.test.ts`, trocar `:335` e `:339` por:

```ts
      // #317: piso do teto que o pagador autoriza no app do banco. Literal de
      // propósito (disciplina 2 do topo): 39 é o que sai NA REQUISIÇÃO. Derivar
      // de `PISO_TETO_AUTORIZACAO_CENTAVOS` faria o teste seguir a constante em
      // vez de vigiá-la. Medido em 15/08/2026 (#321): aceito com 200 e eco na
      // resposta, sem `value` — a Jornada 3 de valor variável continua de pé.
      expect(corpo.minLimitValue).toBe(39);
      // #317: irreversível. O Asaas não permite habilitar retentativa depois da
      // criação; autorização criada sem isto fica permanentemente sem direito a
      // retentativa, e o conserto é novo QR + novo consentimento do cliente.
      expect(corpo.retryPolicy).toBe("ALLOW_THREE_IN_SEVEN_DAYS");
```

- [ ] **Step 2: Rodar e ver vermelho**

Run: `pnpm vitest run src/lib/billing/provider/asaas.test.ts -t "vínculo"`
Expected: FAIL — `minLimitValue` undefined e `retryPolicy` = `"NOT_ALLOWED"`.

- [ ] **Step 3: Exportar o piso derivado**

Em `calculator.ts`, logo **após** o bloco de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS` (linha 73):

```ts
/**
 * Piso do teto (`minLimitValue`) enviado na criação da autorização de Pix
 * Automático (#317). É o menor valor máximo que o pagador pode definir no app
 * do banco — quem escolhe abaixo do preço de uma ficha ativa recusaria a
 * primeira mensalidade que existe.
 *
 * Deriva da faixa marginal mais alta, não de `VALOR_PRIMEIRO_PACIENTE_CENTAVOS`
 * (legado, fora de produção). É a mesma verdade — o preço de uma ficha — vinda
 * da fonte que ainda é cobrada.
 *
 * Medido em 15/08/2026 (#321): a API **não expõe nem aceita** o teto escolhido
 * pelo pagador; `minLimitValue` é a única alavanca do recebedor, e a copy da
 * tela de ativação (#286) é a única barreira restante.
 */
export const PISO_TETO_AUTORIZACAO_CENTAVOS = FAIXAS_PRECIFICACAO[0]!.valorCentavos;
```

- [ ] **Step 4: Trocar o payload**

Em `asaas.ts:523`, `retryPolicy: "NOT_ALLOWED"` vira:

```ts
          retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
```

E o comentário do `value` omitido (`:528-531`) passa a:

```ts
          // `value` OMITIDO de propósito: é o que caracteriza a Jornada 3 de
          // valor variável. Preenchê-lo travaria o débito mensal no valor de
          // hoje — a origem exata do subfaturamento descrito em `types.ts`.
          //
          // `minLimitValue` só é incompatível com autorização de valor FIXO
          // (com `value`). Sem `value`, convivem: medido em 15/08/2026 (#321),
          // HTTP 200 com `"minLimitValue":39` e `"value":null` na resposta.
          minLimitValue: centavosParaReais(PISO_TETO_AUTORIZACAO_CENTAVOS),
```

Importar `PISO_TETO_AUTORIZACAO_CENTAVOS` de `../calculator` no topo do arquivo (seguir o estilo de import já usado lá).

- [ ] **Step 5: Reescrever o docblock do método (`asaas.ts:478-480`)**

O trecho "`retryPolicy: NOT_ALLOWED` porque a retentativa de débito é decisão de cobrança do Iris, não do gateway — quem decide o que acontece com um ciclo recusado é `conciliarPagamentoDeCiclo`." sai inteiro e vira:

```
   * `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS` **não pode ser mudado depois**: o
   * Asaas só aceita a configuração na criação da autorização. Autorização
   * criada sem ela fica permanentemente sem direito a retentativa, e não há
   * migração — só recriar, o que significa novo QR e novo consentimento do
   * cliente, um a um. Por isso a flag entrou antes da orquestração: ela é
   * inerte sozinha (quem comanda cada retentativa extradia é o recebedor, via
   * `POST /pix/automatic/paymentInstructions/{id}/retries` — issue #322), mas
   * a ausência dela é irreparável. NÃO REMOVER achando que dá para religar.
```

- [ ] **Step 6: Verde**

Run: `pnpm vitest run src/lib/billing/provider/asaas.test.ts src/lib/billing/calculator.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/calculator.ts src/lib/billing/provider/asaas.ts src/lib/billing/provider/asaas.test.ts
git commit -m "feat(billing): set minLimitValue and retry policy on Pix authorization (#317)"
```

---

### Task 2: Rename `PISO_COBRANCA_CENTAVOS` → `PISO_COBRANCA_AVULSA_CENTAVOS`

**Files:**
- Modify: `src/lib/billing/debito.ts:38-55, 109`
- Test: `src/lib/billing/debito.test.ts:2, 42, 46, 61`; `src/app/(app)/assinatura/gate-debito.int.test.ts:44, 377, 381`

**Interfaces:**
- Produces: `PISO_COBRANCA_AVULSA_CENTAVOS` (mesmo valor, `500`). O nome antigo deixa de existir — **sem alias de compatibilidade**, o repo é fechado.

- [ ] **Step 1: Renomear a definição e acrescentar a primeira linha do docblock**

Em `debito.ts`, o docblock ganha uma abertura que separa os dois "piso":

```ts
/**
 * Piso da cobrança AVULSA que o Iris emite (gate de reativação, #290). Não
 * confundir com `PISO_TETO_AUTORIZACAO_CENTAVOS`, que é o piso do teto que o
 * PAGADOR autoriza no banco (#317) — sentidos opostos, mesmo domínio.
 *
 * Abaixo dele o débito ACUMULA — não é perdoado, não caduca e não trava a
 * reativação.
 *
 [resto do docblock atual, intacto — o valor e a troca de "escolha
  conservadora" por "medido" continuam sendo escopo da #311]
 */
export const PISO_COBRANCA_AVULSA_CENTAVOS = 500;
```

- [ ] **Step 2: Atualizar todas as referências**

Substituir o identificador em `debito.ts:109`, `debito.test.ts` (linhas 2, 42, 46, 61) e `gate-debito.int.test.ts` (44, 377, 381). Verificar que não sobrou nenhuma:

Run: `rg -n "PISO_COBRANCA_CENTAVOS" src/`
Expected: nenhum resultado.

- [ ] **Step 3: Verde**

Run: `pnpm vitest run src/lib/billing/debito.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/lib/billing/debito.ts src/lib/billing/debito.test.ts "src/app/(app)/assinatura/gate-debito.int.test.ts"
git commit -m "refactor(billing): rename charge floor to avoid collision with authorization cap (#317)"
```

---

### Task 3: Janela do vencimento — calendário bancário + regra conservadora

**Files:**
- Create: `src/lib/billing/calendario-bancario.ts`, `src/lib/billing/calendario-bancario.test.ts`
- Create: `src/lib/billing/vencimento.ts`, `src/lib/billing/vencimento.test.ts`
- Modify: `src/lib/billing/subscription.ts:55-60, 626`
- Modify: `src/lib/billing/provider/asaas.ts:46-50, 141-145` (comentários da janela)

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces:
  - `ehDiaUtilBancario(data: Date): boolean`
  - `proximoDiaUtilBancario(data: Date): Date`
  - `diasUteisEntre(inicio: Date, fim: Date): number` — conta os dias úteis **estritamente entre** as duas datas civis (leitura mais restritiva)
  - `vencimentoCobrancaDeCiclo(base: Date): Date`
  - Todas raciocinam em data civil de `America/Sao_Paulo` e devolvem instantes ao **meio-dia UTC**, mesma disciplina de `somarDiasCivis` (`src/lib/trial.ts:87`).

- [ ] **Step 1: Teste do calendário (vermelho)**

`src/lib/billing/calendario-bancario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  diasUteisEntre,
  ehDiaUtilBancario,
  proximoDiaUtilBancario,
} from "./calendario-bancario";

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("calendário bancário brasileiro", () => {
  it("reconhece fim de semana", () => {
    expect(ehDiaUtilBancario(dia("2026-08-22"))).toBe(false); // sábado
    expect(ehDiaUtilBancario(dia("2026-08-23"))).toBe(false); // domingo
    expect(ehDiaUtilBancario(dia("2026-08-24"))).toBe(true); // segunda
  });

  it("reconhece feriados fixos, incluindo 20/11", () => {
    expect(ehDiaUtilBancario(dia("2026-09-07"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-11-20"))).toBe(false); // Lei 14.759/2023
    expect(ehDiaUtilBancario(dia("2026-12-25"))).toBe(false);
  });

  it("deriva os feriados móveis da Páscoa", () => {
    // Páscoa 2026: 05/04. Carnaval 16-17/02, Sexta-Feira Santa 03/04,
    // Corpus Christi 04/06.
    expect(ehDiaUtilBancario(dia("2026-02-16"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-02-17"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-04-03"))).toBe(false);
    expect(ehDiaUtilBancario(dia("2026-06-04"))).toBe(false);
    // Páscoa 2027: 28/03 — ano diferente, para não passar por tabela chumbada.
    expect(ehDiaUtilBancario(dia("2027-02-08"))).toBe(false); // Carnaval
    expect(ehDiaUtilBancario(dia("2027-03-26"))).toBe(false); // Sexta Santa
  });

  it("empurra para o próximo dia útil e é idempotente em dia útil", () => {
    expect(proximoDiaUtilBancario(dia("2026-08-22"))).toEqual(dia("2026-08-24"));
    expect(proximoDiaUtilBancario(dia("2026-08-24"))).toEqual(dia("2026-08-24"));
  });

  it("conta dias úteis estritamente entre as datas", () => {
    // seg 24 → sex 28: ter, qua, qui = 3
    expect(diasUteisEntre(dia("2026-08-24"), dia("2026-08-28"))).toBe(3);
    // sex 21 → seg 24: nada no meio (sáb/dom)
    expect(diasUteisEntre(dia("2026-08-21"), dia("2026-08-24"))).toBe(0);
    // ordem invertida ou mesma data: 0, nunca negativo
    expect(diasUteisEntre(dia("2026-08-28"), dia("2026-08-24"))).toBe(0);
  });
});
```

Run: `pnpm vitest run src/lib/billing/calendario-bancario.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar o calendário**

`src/lib/billing/calendario-bancario.ts`:

```ts
/**
 * Calendário bancário brasileiro para a janela do Pix Automático (#317).
 *
 * Existe porque o repo não tem nenhuma biblioteca de data (`date-fns`,
 * `dayjs`, `luxon`) nem tabela de feriados nacionais — o único "feriado" do
 * sistema é o bloqueio de agenda por clínica, alimentado à mão pelo
 * coordenador, tenant-scoped e inútil para cobrança.
 *
 * Cobre **feriado bancário**, não feriado civil: Carnaval e Corpus Christi são
 * ponto facultativo na lei e mesmo assim o banco não liquida. Tratar um dia a
 * mais como não-útil só aumenta a antecedência do vencimento — erra para o
 * lado seguro da janela, e o teto de dias corridos é guardado em
 * `vencimento.ts`.
 *
 * Toda a aritmética acontece em **data civil de São Paulo**, com o instante
 * devolvido ao meio-dia UTC: é o horário que preserva a data civil em qualquer
 * offset do Brasil, a mesma disciplina de `somarDiasCivis` (`src/lib/trial.ts`).
 */

const TIMEZONE = "America/Sao_Paulo";

/** `01-01` … `12-25`. Feriados nacionais de data fixa. */
const FERIADOS_FIXOS = new Set([
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra (nacional desde a Lei 14.759/2023)
  "12-25", // Natal
]);

/** Data civil de São Paulo, normalizada ao meio-dia UTC. */
function civilSp(data: Date): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-");
  return new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
}

function somarDiasCivis(data: Date, dias: number): Date {
  const d = new Date(civilSp(data));
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Domingo de Páscoa do ano, algoritmo gregoriano anônimo (Meeus/Jones/Butcher).
 * Calculado em vez de tabelado porque tabela chumbada vence em silêncio — e o
 * modo de falhar seria justamente o bug sazonal que esta issue conserta.
 */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(
    `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T12:00:00Z`,
  );
}

const movveisPorAno = new Map<number, Set<string>>();

/** `MM-DD` dos feriados bancários móveis do ano. */
function feriadosMoveis(ano: number): Set<string> {
  const cache = movveisPorAno.get(ano);
  if (cache) return cache;
  const base = pascoa(ano);
  const chave = (deslocamento: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + deslocamento);
    return d.toISOString().slice(5, 10);
  };
  const conjunto = new Set([
    chave(-48), // Carnaval (segunda)
    chave(-47), // Carnaval (terça)
    chave(-2), // Sexta-Feira Santa
    chave(60), // Corpus Christi
  ]);
  movveisPorAno.set(ano, conjunto);
  return conjunto;
}

export function ehDiaUtilBancario(data: Date): boolean {
  const civil = civilSp(data);
  const semana = civil.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  const mmdd = civil.toISOString().slice(5, 10);
  if (FERIADOS_FIXOS.has(mmdd)) return false;
  return !feriadosMoveis(civil.getUTCFullYear()).has(mmdd);
}

export function proximoDiaUtilBancario(data: Date): Date {
  let candidato = civilSp(data);
  // Teto de segurança: nenhuma sequência de não-úteis no Brasil chega perto
  // disso. Estourar significa calendário corrompido, e travar é melhor que
  // laçar para sempre dentro do job de fechamento.
  for (let i = 0; i < 30; i += 1) {
    if (ehDiaUtilBancario(candidato)) return candidato;
    candidato = somarDiasCivis(candidato, 1);
  }
  throw new RangeError(
    `Nenhum dia útil bancário encontrado em 30 dias a partir de ${civilSp(data).toISOString().slice(0, 10)}`,
  );
}

/**
 * Dias úteis **estritamente entre** as duas datas civis — nem o início nem o
 * fim contam. É a leitura mais restritiva de "criada entre 2 e 10 dias úteis
 * antes do vencimento": exigir mais antecedência erra para o lado que o Asaas
 * aceita sob qualquer interpretação. Nunca negativo.
 */
export function diasUteisEntre(inicio: Date, fim: Date): number {
  const a = civilSp(inicio);
  const b = civilSp(fim);
  if (b <= a) return 0;
  let total = 0;
  let cursor = somarDiasCivis(a, 1);
  while (cursor < b) {
    if (ehDiaUtilBancario(cursor)) total += 1;
    cursor = somarDiasCivis(cursor, 1);
  }
  return total;
}

/** Dias corridos entre as duas datas civis. Nunca negativo. */
export function diasCorridosEntre(inicio: Date, fim: Date): number {
  const a = civilSp(inicio).getTime();
  const b = civilSp(fim).getTime();
  if (b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}
```

- [ ] **Step 3: Verde do calendário**

Run: `pnpm vitest run src/lib/billing/calendario-bancario.test.ts`
Expected: PASS.

- [ ] **Step 4: Teste do vencimento (vermelho)**

`src/lib/billing/vencimento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diasUteisEntre } from "./calendario-bancario";
import {
  ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS,
  ANTECEDENCIA_MINIMA_DIAS_UTEIS,
  vencimentoCobrancaDeCiclo,
} from "./vencimento";

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("vencimento da cobrança de ciclo", () => {
  it("mantém os 5 dias corridos quando eles já satisfazem a janela", () => {
    // sexta 2026-08-14 + 5 = quarta 2026-08-19; seg/ter úteis no meio = 2
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-08-14")))).toBe("2026-08-19");
  });

  it("nunca vence em sábado, domingo ou feriado", () => {
    // segunda 2026-08-17 + 5 = sábado 2026-08-22 → empurra para segunda 24
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-08-17")))).toBe("2026-08-24");
    // 2026-09-02 + 5 = 2026-09-07 (Independência) → 2026-09-08
    expect(ymd(vencimentoCobrancaDeCiclo(dia("2026-09-02")))).toBe("2026-09-08");
  });

  it("estica a antecedência quando o Carnaval come os dias úteis", () => {
    // Carnaval 2026: 16 e 17/02. Fechamento em 2026-02-13 (sexta):
    // +5 = 18/02 (quarta), com 0 dias úteis no meio → precisa esticar.
    const vencimento = vencimentoCobrancaDeCiclo(dia("2026-02-13"));
    expect(diasUteisEntre(dia("2026-02-13"), vencimento)).toBeGreaterThanOrEqual(
      ANTECEDENCIA_MINIMA_DIAS_UTEIS,
    );
    expect(ymd(vencimento)).toBe("2026-02-20");
  });

  it("garante a janela em todo dia de dois anos, sem estourar o teto", () => {
    // O bug que esta issue conserta é sazonal: passa o ano inteiro verde e
    // falha em janeiro. Varrer o calendário é o único teste que o pega.
    for (let i = 0; i < 730; i += 1) {
      const base = new Date(dia("2026-01-01"));
      base.setUTCDate(base.getUTCDate() + i);
      const vencimento = vencimentoCobrancaDeCiclo(base);
      expect(diasUteisEntre(base, vencimento)).toBeGreaterThanOrEqual(
        ANTECEDENCIA_MINIMA_DIAS_UTEIS,
      );
      const corridos = Math.round(
        (vencimento.getTime() - Number(dia(ymd(base)))) / 86_400_000,
      );
      expect(corridos).toBeLessThanOrEqual(ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS);
    }
  });
});
```

Run: `pnpm vitest run src/lib/billing/vencimento.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 5: Implementar a regra**

`src/lib/billing/vencimento.ts`:

```ts
import {
  diasCorridosEntre,
  diasUteisEntre,
  proximoDiaUtilBancario,
} from "./calendario-bancario";

/**
 * Vencimento da cobrança do ciclo, dentro da janela que o Pix Automático
 * exige (#317).
 *
 * **A janela não pôde ser medida.** A doc do Asaas se contradiz: a página de
 * Implementação diz "entre 2 e 10 dias **úteis** antes do vencimento", os
 * Motivos de Recusa dizem "menos de 2 dias" / "superior a 10 dias" sem
 * qualificar a unidade, e o guia BACEN fala em dias corridos. A sessão de
 * medição no sandbox (#321, 15/08/2026) NÃO resolveu: nenhuma autorização de
 * Pix Automático chega a `ACTIVE` no sandbox, então todo `POST /payments` com
 * `pixAutomaticAuthorizationId` devolve o mesmo 400 de autorização inativa —
 * inclusive um controle DENTRO da janela. A resposta não carrega informação
 * nenhuma sobre janela. Só o ensaio com clínica de teste em produção decide.
 *
 * Enquanto isso, a regra satisfaz o **mais restritivo** das duas leituras:
 * piso em dias ÚTEIS, teto em dias CORRIDOS. Sob qualquer interpretação da
 * doc, a data resultante está dentro. O que se paga por isso é uma
 * antecedência um pouco maior em semanas com feriado.
 *
 * O que havia antes era `somarDias(agora, 5)` em dias corridos: passa o ano
 * inteiro verde e falha em janeiro, no Carnaval e no fim de semana prolongado
 * — bug sazonal, invisível em teste que usa a data de hoje.
 */

/** Piso, em dias úteis bancários. Leitura restritiva da doc de Implementação. */
export const ANTECEDENCIA_MINIMA_DIAS_UTEIS = 2;

/**
 * Teto, em dias CORRIDOS. 10 corridos é sempre ≤ 10 úteis, então respeita as
 * duas leituras de uma vez.
 */
export const ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS = 10;

/** Antecedência desejada quando o calendário não atrapalha. Era o valor único. */
export const ANTECEDENCIA_PADRAO_DIAS_CORRIDOS = 5;

export function vencimentoCobrancaDeCiclo(base: Date): Date {
  let candidato = proximoDiaUtilBancario(
    somarCorridos(base, ANTECEDENCIA_PADRAO_DIAS_CORRIDOS),
  );

  while (diasUteisEntre(base, candidato) < ANTECEDENCIA_MINIMA_DIAS_UTEIS) {
    candidato = proximoDiaUtilBancario(somarCorridos(candidato, 1));
  }

  const corridos = diasCorridosEntre(base, candidato);
  if (corridos > ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS) {
    // Estado impossível no calendário brasileiro (a maior sequência de
    // não-úteis é o Carnaval). Se acontecer, o gateway recusaria com
    // `RECEIVED_TOO_EARLY` e o ciclo iria a `falhou` sem ninguém entender —
    // falhar aqui, nomeando a causa, é mais barato. Degradar em silêncio já
    // custou caro neste repo (#157).
    throw new RangeError(
      `Vencimento calculado a ${corridos} dias corridos da emissão excede o teto de ${ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS} da janela do Pix Automático`,
    );
  }
  return candidato;
}

function somarCorridos(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}
```

- [ ] **Step 6: Verde do vencimento**

Run: `pnpm vitest run src/lib/billing/vencimento.test.ts`
Expected: PASS. Se a varredura de 730 dias acusar violação, é bug da regra — não afrouxar o teste.

- [ ] **Step 7: Ligar no fechamento de ciclo**

Em `subscription.ts`, importar `vencimentoCobrancaDeCiclo` de `./vencimento` e trocar `:626`:

```ts
            vencimento: vencimentoCobrancaDeCiclo(agora),
```

E o docblock de `DIAS_VENCIMENTO_COBRANCA` (`:55-60`) passa a apontar para a nova regra, mantendo a constante só se ela ainda for referenciada — se não for mais, removê-la junto com o docblock e explicar no commit:

```ts
/**
 * O prazo de vencimento da cobrança do ciclo agora vem de
 * `vencimentoCobrancaDeCiclo` (#317): 5 dias corridos continuam sendo o alvo,
 * mas a data é empurrada até satisfazer a janela do Pix Automático em dias
 * úteis bancários. Esgotado sem pagamento, o ciclo vai a `falhou` e a
 * assinatura a `past_due`, onde a carência (`subscription.carencia_dias`)
 * começa a correr — dimensionamento da carência é escopo da #319.
 */
```

- [ ] **Step 8: Corrigir os dois comentários da janela em `asaas.ts`**

`:46-50` vira:

```
 * 2. **A cobrança do ciclo só é aceita dentro de uma janela antes do
 *    vencimento** — e a unidade da janela é indeterminada: a doc de
 *    Implementação do Asaas diz "entre 2 e 10 dias **úteis**", os Motivos de
 *    Recusa dizem "menos de 2 dias" / "superior a 10 dias" sem qualificar, e o
 *    BACEN fala em dias corridos. A medição no sandbox (#321, 15/08/2026) não
 *    resolveu: autorização não ativa lá, e todo `POST /payments` devolve o
 *    mesmo 400 de autorização inativa, inclusive dentro da janela. Fora dela o
 *    Asaas recusa com 400. Quem escolhe o vencimento é
 *    `vencimentoCobrancaDeCiclo` (`../vencimento.ts`), que satisfaz a leitura
 *    mais restritiva das duas; aqui a data só é formatada, e a recusa sobe
 *    como `BillingProviderError` 4xx.
```

`:141-145` (docblock de `dataAsaas`): trocar "a janela de 2 a 10 dias úteis que o Pix Automático exige" por "a janela que o Pix Automático exige (unidade indeterminada — ver o topo do arquivo)".

- [ ] **Step 9: Suíte inteira**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS nos três.

- [ ] **Step 10: Commit**

```bash
git add src/lib/billing/calendario-bancario.ts src/lib/billing/calendario-bancario.test.ts src/lib/billing/vencimento.ts src/lib/billing/vencimento.test.ts src/lib/billing/subscription.ts src/lib/billing/provider/asaas.ts
git commit -m "fix(billing): keep cycle due date inside the Pix Automático window (#317)"
```

---

## Self-Review

**Cobertura da spec (DoD consolidada):** `minLimitValue` derivado ✔ (T1) · `retryPolicy` ligada com teste de payload ✔ (T1) · irreversibilidade registrada no código ✔ (T1 step 5) · orquestração movida para issue própria ✔ (#322, referenciada no docblock) · cálculo do vencimento ajustado ✔ (T3) · comentário da janela reescrito com a contradição e a data ✔ (T3 step 8) · decisão sobre `carencia_dias` ✔ (D-D, registrada aqui e no docblock de T3 step 7) · rename do piso ✔ (T2) · verde nos três comandos ✔ (T3 step 9).

**Fora de alcance, declarado:** "medir no sandbox que o pagador conclui sem preencher teto" e "recorrência com dois valores distintos" são **impossíveis no sandbox** (#321) — vão para o ensaio em produção, não para esta entrega.

**Consistência de tipos:** `PISO_TETO_AUTORIZACAO_CENTAVOS` (centavos, `number`) → `centavosParaReais` → `39` no payload. `vencimentoCobrancaDeCiclo(base: Date): Date` → `NovaCobrancaDeCiclo.vencimento: Date` → `dataAsaas` → `YYYY-MM-DD`. Sem placeholders.
