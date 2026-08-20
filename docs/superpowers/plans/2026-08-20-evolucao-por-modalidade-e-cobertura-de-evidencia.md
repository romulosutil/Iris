# Aba Evolução: por modalidade, em duas perguntas, com cobertura honesta — Plano de Implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Transformar a aba "Evolução" do prontuário — hoje um painel único, protocol-driven, que responde seis perguntas ao mesmo tempo — em uma leitura clínica que existe só onde faz sentido, responde uma pergunta por vez e nunca apresenta uma média normalizada como se fosse fato.

**Architecture:** Três mudanças independentes e sequenciáveis. (1) A modalidade clínica passa a decidir se a aba existe e o que ela mostra: `conventional` não tem Evolução, `cognitive_behavioral` ganha a leitura temporal que hoje mora dentro da aba TCC, `protocol_driven` mantém a atual. (2) A aba se divide em duas vistas deep-linkáveis via `?vista=` — "Esta sessão" (o delta, entrada padrão, sem relógio) e "No tempo" (scrubber, trajetória, comparador). (3) O hexágono do Espectro deixa de plotar `%` de progresso agregado e passa a plotar **contagem de evidências por eixo** — o dado que ele já carrega em `contagemEvidencias` e nunca mostrou.

**Tech Stack:** Next.js 16 App Router (Server Components + `searchParams`), React 19, TypeScript, Tailwind v4 (`@theme` em `src/styles/globals.css`), Drizzle + Postgres com RLS via `withTenant`, Vitest + Testing Library, axe-core.

---

## Contexto que o executor precisa antes de começar

**Leia primeiro:** `AGENTS.md`, `CLAUDE.md`, `docs/ux/design-system-espectro-brutal.md`.

**Duas regras do produto que este plano inteiro serve:**

1. **Honestidade epistêmica.** A interface nunca pode fazer parecer certo o que é incerto, nem afirmar um fato clínico que ninguém mediu. É a razão de existir de todas as tarefas aqui.
2. **`role="alert"` é reservado ao risco clínico.** Aviso de carregamento, de estado de conta ou de modalidade usa `role="status"`. Ver `src/app/(app)/pacientes/[id]/layout.tsx` e `src/app/(app)/pacientes/[id]/timeline/estado-de-erro.tsx`.

**Estado atual da superfície (ponto de partida real):**

- `src/app/(app)/pacientes/[id]/page.tsx` — aba "Evolução", rota base. Carrega timeline e renderiza `TimelineClient` ou um empty state.
- `src/app/(app)/pacientes/[id]/layout.tsx` — casca comum. Monta a lista de abas e já lê `patient.clinicalModality` para trocar a aba central (`PEI & Metas` / `TCC` / `Temas`).
- `src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx` — 1000+ linhas, seis regiões interativas.
- `src/app/(app)/pacientes/[id]/timeline/estado-de-erro.tsx` — **já existe**, criado no fix do P0. Reuse; não crie outro.

**Modalidades** (enum `clinicalModality` em `src/db/schema.ts`): `protocol_driven`, `cognitive_behavioral`, `conventional`.

**Comandos:**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Para um arquivo só: `npx vitest run <caminho>`.

**Aviso sobre `pnpm format`:** reformata o repositório inteiro, inclusive worktrees aninhados. Formate só os arquivos que você tocou: `npx prettier --write <arquivo>`.

---

## File Structure

| Arquivo                                                   | Responsabilidade                                                                       | Tarefa  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| `.../[id]/layout.tsx`                                     | Monta abas; passa a omitir "Evolução" em `conventional`                                | 1       |
| `.../[id]/modalidade.ts` (novo)                           | Fonte única do que cada modalidade tem: aba central, existe Evolução, rota de fallback | 1       |
| `.../[id]/modalidade.test.ts` (novo)                      | Tabela modalidade → capacidades                                                        | 1       |
| `.../[id]/page.tsx`                                       | Redireciona `conventional`; lê `?vista=`; escolhe a leitura por modalidade             | 1, 3, 4 |
| `.../timeline/espectro-cobertura.tsx` (novo)              | Hexágono de contagem de evidências por eixo                                            | 2       |
| `.../timeline/espectro-cobertura.test.tsx` (novo)         | Cobertura: normalização, zero, rótulo, tabela acessível                                | 2       |
| `.../timeline/timeline-client.tsx`                        | Passa a receber `vista` e renderizar só a metade correspondente                        | 2, 3    |
| `.../timeline/vista-nav.tsx` (novo)                       | Segmented control "Esta sessão" / "No tempo", deep-linkável                            | 3       |
| `.../timeline/evolucao-tcc.tsx` (novo)                    | Leitura de evolução do paciente TCC (escore no tempo + crenças)                        | 4       |
| `.../timeline/grafico-escore-instrumento.tsx` (novo)      | Série temporal de escore PHQ-9/GAD-7 com faixas de corte                               | 4       |
| `.../timeline/grafico-escore-instrumento.test.tsx` (novo) | Escala, faixas, ponto único, escore nulo                                               | 4       |

---

## Task 1: `conventional` não tem aba Evolução

**Por quê:** hoje a rota base é idêntica para as três modalidades e o conteúdo dela é 100% ABA/protocolo. Um paciente de psicologia convencional abre o prontuário e cai num hexágono VB-MAPP zerado. A decisão do produto (Rômulo, 20/08/2026) é que **convencional não tem métrica** — o acompanhamento é narrativo, na aba `Temas`. Inventar um gráfico ali seria exatamente o que o produto promete não fazer.

**Files:**

- Create: `src/app/(app)/pacientes/[id]/modalidade.ts`
- Create: `src/app/(app)/pacientes/[id]/modalidade.test.ts`
- Modify: `src/app/(app)/pacientes/[id]/layout.tsx`
- Modify: `src/app/(app)/pacientes/[id]/page.tsx`

- [x] **Step 1: Escreva o teste que falha**

Crie `src/app/(app)/pacientes/[id]/modalidade.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { capacidadesDaModalidade } from "./modalidade";

describe("capacidadesDaModalidade", () => {
  it("protocol_driven: Evolução existe, aba central é PEI & Metas", () => {
    const c = capacidadesDaModalidade("protocol_driven");
    expect(c.temEvolucao).toBe(true);
    expect(c.leituraDeEvolucao).toBe("protocolo");
    expect(c.abaCentral).toEqual({ slug: "metas", rotulo: "PEI & Metas" });
  });

  it("cognitive_behavioral: Evolução existe, com leitura própria", () => {
    const c = capacidadesDaModalidade("cognitive_behavioral");
    expect(c.temEvolucao).toBe(true);
    expect(c.leituraDeEvolucao).toBe("tcc");
    expect(c.abaCentral).toEqual({ slug: "tcc", rotulo: "TCC" });
  });

  it("conventional: NÃO tem Evolução — acompanhamento é narrativo", () => {
    const c = capacidadesDaModalidade("conventional");
    expect(c.temEvolucao).toBe(false);
    expect(c.leituraDeEvolucao).toBeNull();
    expect(c.rotaDeEntrada).toBe("temas");
  });

  it("modalidade não resolvida: sem aba central, mas Evolução continua acessível", () => {
    // Paciente cuja ficha ainda não tem modalidade gravada precisa navegar.
    // Fechar a Evolução aqui deixaria o prontuário sem porta de entrada.
    const c = capacidadesDaModalidade(null);
    expect(c.abaCentral).toBeNull();
    expect(c.temEvolucao).toBe(true);
    expect(c.leituraDeEvolucao).toBe("protocolo");
    expect(c.rotaDeEntrada).toBeNull();
  });
});
```

- [x] **Step 2: Rode o teste e confirme que falha**

Rode: `npx vitest run "src/app/(app)/pacientes/[id]/modalidade.test.ts"`
Esperado: FAIL — `Failed to resolve import "./modalidade"`.

- [x] **Step 3: Implemente `modalidade.ts`**

Crie `src/app/(app)/pacientes/[id]/modalidade.ts`:

```ts
/**
 * Fonte única do que cada modalidade clínica tem dentro do prontuário.
 *
 * Existia espalhado: `layout.tsx` decidia a aba central por `switch`, `page.tsx`
 * não decidia nada, e a aba "Evolução" — que é 100% ABA/protocolo — era servida
 * igual para as três modalidades. Paciente de TCC via um hexágono VB-MAPP
 * zerado; paciente convencional, o mesmo.
 *
 * `conventional` não tem Evolução por decisão de produto (20/08/2026): o
 * acompanhamento é narrativo, em `Temas`. Métrica derivada de registro
 * empírico seria certeza fabricada.
 */
export type ModalidadeClinica =
  "protocol_driven" | "cognitive_behavioral" | "conventional";

export type LeituraDeEvolucao = "protocolo" | "tcc";

export interface CapacidadesDaModalidade {
  /** Aba central de REGISTRO (onde se escreve). `null` = modalidade não resolvida. */
  abaCentral: { slug: string; rotulo: string } | null;
  /** A aba "Evolução" (leitura) existe para esta modalidade. */
  temEvolucao: boolean;
  /** Qual leitura a aba Evolução renderiza. `null` quando não há aba. */
  leituraDeEvolucao: LeituraDeEvolucao | null;
  /** Para onde a rota base redireciona quando não há Evolução. */
  rotaDeEntrada: string | null;
}

export function capacidadesDaModalidade(
  modalidade: ModalidadeClinica | null | undefined,
): CapacidadesDaModalidade {
  switch (modalidade) {
    case "cognitive_behavioral":
      return {
        abaCentral: { slug: "tcc", rotulo: "TCC" },
        temEvolucao: true,
        leituraDeEvolucao: "tcc",
        rotaDeEntrada: null,
      };
    case "conventional":
      return {
        abaCentral: { slug: "temas", rotulo: "Temas" },
        temEvolucao: false,
        leituraDeEvolucao: null,
        rotaDeEntrada: "temas",
      };
    case "protocol_driven":
      return {
        abaCentral: { slug: "metas", rotulo: "PEI & Metas" },
        temEvolucao: true,
        leituraDeEvolucao: "protocolo",
        rotaDeEntrada: null,
      };
    default:
      // Modalidade ainda não gravada na ficha. Sem aba central (não dá para
      // adivinhar qual instrumento o modo usa), mas COM Evolução: fechá-la
      // deixaria o prontuário sem porta de entrada e o `redirect` sem destino.
      return {
        abaCentral: null,
        temEvolucao: true,
        leituraDeEvolucao: "protocolo",
        rotaDeEntrada: null,
      };
  }
}
```

- [x] **Step 4: Rode o teste e confirme que passa**

Rode: `npx vitest run "src/app/(app)/pacientes/[id]/modalidade.test.ts"`
Esperado: PASS (4).

- [x] **Step 5: Faça `layout.tsx` consumir o helper**

Em `src/app/(app)/pacientes/[id]/layout.tsx`, adicione o import:

```ts
import { capacidadesDaModalidade } from "./modalidade";
```

Substitua o bloco `let abaModalidade: TabsNavItem[]; switch (dadosPaciente?.clinicalModality) { ... }` inteiro por:

```ts
// A aba clínica central troca por modalidade: cada uma tem exatamente UM
// registro estruturado que faz sentido para o modo de tratamento. Nunca duas
// ao mesmo tempo: a aba errada levaria o terapeuta a preencher um instrumento
// que o modo não usa. Ver `./modalidade.ts`.
const capacidades = capacidadesDaModalidade(dadosPaciente?.clinicalModality);

const abaModalidade: TabsNavItem[] = capacidades.abaCentral
  ? [
      {
        href: `${base}/${capacidades.abaCentral.slug}`,
        rotulo: capacidades.abaCentral.rotulo,
      },
    ]
  : [];
```

Depois, substitua a montagem de `abas` por:

```ts
// Todas as rotas irmãs que de fato existem sob `[id]/` (as que têm
// `page.tsx`). `consentimento/` e `timeline/` são pastas de lógica sem tela
// própria — a timeline é renderizada dentro da aba Evolução — e por isso não
// entram aqui: aba que leva a 404 é pior que aba ausente.
//
// "Evolução" some em `conventional`: a rota base redireciona para `Temas`
// (ver `./page.tsx`), e aba que só redireciona é aba que mente sobre existir.
const abas: TabsNavItem[] = [
  ...(capacidades.temEvolucao
    ? [{ href: base, rotulo: "Evolução", exato: true } as TabsNavItem]
    : []),
  { href: `${base}/briefing`, rotulo: "Briefing" },
  { href: `${base}/cadastro-clinico`, rotulo: "Ficha Clínica" },
  ...abaModalidade,
  { href: `${base}/equipe`, rotulo: "Equipe" },
  { href: `${base}/horas`, rotulo: "Horas" },
  { href: `${base}/ausencias`, rotulo: "Ausências" },
];
```

- [x] **Step 6: Faça `page.tsx` redirecionar em `conventional`**

Em `src/app/(app)/pacientes/[id]/page.tsx`, some `clinicalModality` ao `select` da query do paciente:

```ts
      .select({
        id: patient.id,
        nome: patient.nome,
        // #174: o estado de arquivamento comercial precisa ser visível aqui —
        // sem ele a única pista de que o paciente saiu da contagem de ativos
        // seria a fatura no fechamento do ciclo.
        arquivadoEm: patient.arquivadoEm,
        clinicalModality: patient.clinicalModality,
      })
```

Adicione os imports:

```ts
import { notFound, redirect } from "next/navigation";
import { capacidadesDaModalidade } from "./modalidade";
```

(`notFound` já é importado — troque a linha existente por esta, não adicione uma segunda.)

Logo depois do `if (!paciente) { notFound(); }`, antes de `carregarTimeline`:

```ts
const capacidades = capacidadesDaModalidade(paciente.clinicalModality);

// Sai ANTES de `carregarTimeline`: em `conventional` a timeline não seria
// usada, e a consulta custa uma varredura de snapshots por entrada no
// prontuário. `redirect` lança — nada abaixo executa.
if (!capacidades.temEvolucao && capacidades.rotaDeEntrada) {
  redirect(`/pacientes/${id}/${capacidades.rotaDeEntrada}`);
}
```

- [x] **Step 7: Verifique que nada quebrou**

Rode:

```bash
pnpm typecheck && npx vitest run "src/app/(app)/pacientes"
```

Esperado: typecheck sem saída de erro; suíte de `pacientes` verde. Se `a11y.test.tsx` falhar, é porque o dublê de `withTenant` devolve `{ clinicalModality: "protocol_driven" }` — modalidade com Evolução, então a aba continua presente e o teste deve passar sem mudança. Se falhar por outro motivo, leia a mensagem antes de mexer no dublê.

- [x] **Step 8: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/modalidade.ts" "src/app/(app)/pacientes/[id]/modalidade.test.ts" "src/app/(app)/pacientes/[id]/layout.tsx" "src/app/(app)/pacientes/[id]/page.tsx"
git commit -m "feat(prontuario): hide Evolução tab for conventional modality"
```

---

## Task 2: O hexágono passa a mostrar cobertura de evidência, não progresso

> **[x] ENTREGUE 20/08/2026 — com direção diferente da planejada aqui.** Decisão do Rômulo na execução: o hexágono continua sendo leitura de **progresso**, não contagem. O problema real nunca foi plotar progresso — era plotar um progresso desonesto (eixo sem dado virando 0, meta com 3 evidências de qualquer polaridade virando 100%, toda meta sem marco caindo em Cognição). O que foi entregue: `valor` passa a ser **independência documentada** (média do nível de ajuda registrado em evidência validada, por alvo do PEI do eixo), `null` para eixo não medido, eixo resolvido pelo marco mapeado à meta (`goal_milestone_mapping`) e alvo sem eixo contado à parte. `contagemEvidencias` continua no dado e aparece na tabela, não no raio. Ver `src/lib/evidence/espectro.ts` e `timeline/grafico-espectro.tsx`. O texto abaixo fica como registro da hipótese anterior.

**Por quê (hipótese original, não executada):** `computarDadosEspectro` devolve, por eixo, um `valor` (0-100) que é `média(progresso) × 100` e uma `contagemEvidencias`. A tela plota o `valor` — uma média normalizada de seis eixos heterogêneos, que é exatamente a síntese que o produto se recusa a fazer em todo o resto ("a IA nunca pontua protocolos"). A `contagemEvidencias` nunca foi mostrada, e é o número honesto: **quantas evidências aprovadas existem naquele eixo**. O hexágono continua sendo a assinatura visual do Iris; só para de afirmar progresso e passa a responder "onde estamos olhando, e onde não temos dado nenhum".

**Files:**

- Create: `src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.tsx`
- Create: `src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.test.tsx`
- Modify: `src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx` (remove `renderEspectroRadar`, passa a usar o componente novo)

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { EspectroCobertura, raioNormalizado } from "./espectro-cobertura";
import type { DadosEixoRadar } from "@/lib/evidence/espectro";

const eixo = (
  nome: string,
  rotulo: string,
  contagem: number,
): DadosEixoRadar => ({
  eixo: nome as DadosEixoRadar["eixo"],
  rotulo,
  // `valor` continua vindo da query e é DELIBERADAMENTE ignorado por este
  // componente: é média normalizada, não fato. Os testes fixam 99 para que
  // qualquer regressão que volte a plotá-lo apareça.
  valor: 99,
  contagemEvidencias: contagem,
});

const SEIS_EIXOS: DadosEixoRadar[] = [
  eixo("comunicacao_expressiva", "Comunicação Expressiva", 12),
  eixo("comunicacao_receptiva", "Comunicação Receptiva", 6),
  eixo("social_brincar", "Social & Brincar", 0),
  eixo("cognicao_aprendizado", "Cognição & Aprendizado", 3),
  eixo("autonomia_motor", "Autonomia & Motor", 1),
  eixo("regulacao_barreiras", "Regulação & Barreiras", 0),
];

describe("raioNormalizado", () => {
  it("o eixo com mais evidências ocupa o raio cheio", () => {
    expect(raioNormalizado(12, 12)).toBe(1);
  });

  it("normaliza pelo maior do conjunto, não por 100", () => {
    expect(raioNormalizado(6, 12)).toBe(0.5);
    expect(raioNormalizado(3, 12)).toBe(0.25);
  });

  it("zero evidências é zero raio — o vértice encosta no centro", () => {
    expect(raioNormalizado(0, 12)).toBe(0);
  });

  it("máximo zero não estoura em divisão por zero", () => {
    expect(raioNormalizado(0, 0)).toBe(0);
  });
});

describe("EspectroCobertura", () => {
  it("rotula cada eixo com a CONTAGEM, nunca com porcentagem", () => {
    render(<EspectroCobertura eixos={SEIS_EIXOS} sessaoAtiva={7} />);

    // `getAllByText`, não `getByText`: cada rótulo aparece duas vezes de
    // propósito — na grade visível e na tabela `sr-only`, que é a leitura
    // canônica para leitor de tela. `getByText` lançaria por múltiplos nós.
    expect(screen.getAllByText("Comunicação Expressiva").length).toBe(2);
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    // A asserção que mata o mutante: `valor` é 99 em todos os eixos. Se alguém
    // religar a plotagem de progresso, "99%" aparece.
    expect(screen.queryByText(/99\s*%/)).toBeNull();
  });

  it("nomeia os eixos sem dado, em vez de escondê-los", () => {
    render(<EspectroCobertura eixos={SEIS_EIXOS} sessaoAtiva={7} />);

    // Eixo zerado precisa continuar visível e legível: "não temos dado aqui"
    // é a informação mais útil do gráfico.
    expect(screen.getAllByText("Social & Brincar").length).toBe(2);
    expect(screen.getAllByText("Regulação & Barreiras").length).toBe(2);
  });

  it("sem nenhuma evidência em nenhum eixo: estado vazio, não polígono degenerado", () => {
    const zerados = SEIS_EIXOS.map((e) => ({ ...e, contagemEvidencias: 0 }));
    const { container } = render(
      <EspectroCobertura eixos={zerados} sessaoAtiva={1} />,
    );

    expect(
      screen.getByText(/Nenhuma evidência aprovada até esta sessão/),
    ).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Rode: `npx vitest run "src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.test.tsx"`
Esperado: FAIL — `Failed to resolve import "./espectro-cobertura"`.

- [ ] **Step 3: Implemente o componente**

Crie `src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.tsx`:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DadosEixoRadar } from "@/lib/evidence/espectro";

/**
 * Hexágono do Espectro — assinatura visual do Iris, agora dizendo a verdade.
 *
 * Plotava `DadosEixoRadar.valor`: média do progresso dos alvos daquele eixo,
 * normalizada em 0-100. Era a única síntese do produto — a mesma operação que
 * a regra "a IA nunca pontua protocolos" proíbe em todo o resto — e nada na
 * tela dizia que aquilo era uma média.
 *
 * Passa a plotar `contagemEvidencias`: quantas evidências aprovadas existem
 * naquele eixo, acumuladas até a sessão selecionada. É contagem, não juízo.
 * O gráfico responde "onde estamos olhando e onde não há dado nenhum" — que
 * é uma pergunta clínica real, e um localizador de lacuna.
 *
 * `valor` continua no tipo (outros consumidores podem existir) e é
 * deliberadamente ignorado aqui.
 */

const CENTRO = 150;
const RAIO_MAX = 100;
const NIVEIS_TEIA = [0.25, 0.5, 0.75, 1];

/**
 * Raio relativo de um eixo. Normaliza pelo MAIOR eixo do conjunto, não por um
 * teto fixo: não existe "número certo de evidências", só proporção entre os
 * eixos. Máximo zero devolve zero em vez de `NaN`.
 */
export function raioNormalizado(contagem: number, maximo: number): number {
  if (maximo <= 0) return 0;
  return contagem / maximo;
}

function pontoNoEixo(indice: number, raioRelativo: number) {
  const angulo = ((indice * 60 - 90) * Math.PI) / 180;
  return {
    x: CENTRO + RAIO_MAX * raioRelativo * Math.cos(angulo),
    y: CENTRO + RAIO_MAX * raioRelativo * Math.sin(angulo),
    angulo,
  };
}

export function EspectroCobertura({
  eixos,
  sessaoAtiva,
}: {
  eixos: DadosEixoRadar[];
  sessaoAtiva: number;
}) {
  const maximo = Math.max(0, ...eixos.map((e) => e.contagemEvidencias));
  const total = eixos.reduce((soma, e) => soma + e.contagemEvidencias, 0);

  const cabecalho = (
    <div className="flex flex-col gap-1">
      <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
        Cobertura de Evidência por Eixo
      </h3>
      <p className="text-sm text-[var(--text-secondary)]">
        Quantas evidências aprovadas existem em cada eixo, acumuladas até a
        Sessão {sessaoAtiva}. Não é progresso — é onde há e onde falta dado.
      </p>
    </div>
  );

  // Sem nenhuma evidência, o polígono colapsaria num ponto no centro: uma
  // figura que parece um dado ("está tudo no mínimo") sendo, na verdade,
  // ausência de dado. Estado vazio nomeado, não hexágono degenerado.
  if (total === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]">
        {cabecalho}
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Nenhuma evidência aprovada até esta sessão. O gráfico aparece assim
          que a primeira evidência for aprovada na revisão.
        </p>
      </div>
    );
  }

  const vertices = eixos.map((e, i) => ({
    ...e,
    ponto: pontoNoEixo(i, raioNormalizado(e.contagemEvidencias, maximo)),
    extremo: pontoNoEixo(i, 1),
  }));

  const poligono = vertices.map((v) => `${v.ponto.x},${v.ponto.y}`).join(" ");

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]">
      {cabecalho}

      {/*
        `aria-hidden` no wrapper + tabela `sr-only` abaixo: o leitor de tela lê
        os números, não a geometria. `max-w-full` + `viewBox` fazem o SVG
        encolher no mobile — a versão anterior era `w-[300px]` fixo com rótulos
        projetados a 1.2 × raio, e estourava a lateral em telas de 360px.
      */}
      <div className="mx-auto w-full max-w-[340px]" aria-hidden="true">
        <svg viewBox="0 0 300 300" className="h-auto w-full">
          {NIVEIS_TEIA.map((nivel) => (
            <polygon
              key={nivel}
              points={eixos
                .map((_, i) => {
                  const p = pontoNoEixo(i, nivel);
                  return `${p.x},${p.y}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--border-muted)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          ))}

          {vertices.map((v, i) => (
            <line
              key={`eixo-${i}`}
              x1={CENTRO}
              y1={CENTRO}
              x2={v.extremo.x}
              y2={v.extremo.y}
              stroke="var(--border-muted)"
              strokeWidth="1"
            />
          ))}

          <polygon
            points={poligono}
            fill="var(--brand-tint)"
            fillOpacity="0.85"
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />

          {vertices.map((v, i) => (
            <circle
              key={`vertice-${i}`}
              cx={v.ponto.x}
              cy={v.ponto.y}
              r="4"
              fill="var(--action-primary)"
              stroke="var(--border-brutal)"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>

      {/*
        Rótulos fora do SVG, em grade: dentro do SVG eles precisavam de 9px
        para caber, abaixo de qualquer piso de legibilidade — e a tela é lida
        sob luz de corredor. Aqui herdam a escala tipográfica normal.
      */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {vertices.map((v) => (
          <li
            key={v.eixo}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <span className="text-[var(--text-primary)]">{v.rotulo}</span>
            <span className="font-mono font-bold text-[var(--text-primary)]">
              {v.contagemEvidencias}
            </span>
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>
          Cobertura de evidência por eixo, acumulada até a Sessão {sessaoAtiva}
        </caption>
        <thead>
          <tr>
            <th scope="col">Eixo</th>
            <th scope="col">Evidências aprovadas</th>
          </tr>
        </thead>
        <tbody>
          {eixos.map((e) => (
            <tr key={e.eixo}>
              <td>{e.rotulo}</td>
              <td>{e.contagemEvidencias}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variante="secundaria" tamanho="sm">
              Ver em tabela
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogTitle>Cobertura de evidência</DialogTitle>
            <DialogDescription>
              Sessão {sessaoAtiva}: evidências aprovadas por eixo do espectro.
            </DialogDescription>
            <div className="mt-4 max-h-[60vh] overflow-auto">
              <table className="w-full border-collapse border border-[var(--border-brutal)] text-left text-sm">
                <thead>
                  <tr className="bg-[var(--surface-elevated)]">
                    <th
                      scope="col"
                      className="border border-[var(--border-brutal)] p-2 font-bold"
                    >
                      Eixo
                    </th>
                    <th
                      scope="col"
                      className="border border-[var(--border-brutal)] p-2 font-bold"
                    >
                      Evidências aprovadas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eixos.map((e) => (
                    <tr key={e.eixo}>
                      <td className="border border-[var(--border-brutal)] p-2">
                        {e.rotulo}
                      </td>
                      <td className="border border-[var(--border-brutal)] p-2 font-mono">
                        {e.contagemEvidencias}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rode o teste e confirme que passa**

Rode: `npx vitest run "src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.test.tsx"`
Esperado: PASS (7).

- [ ] **Step 5: Verifique que o teste mata o mutante**

Troque, em `espectro-cobertura.tsx`, `raioNormalizado(e.contagemEvidencias, maximo)` por `e.valor / 100` e rode o teste de novo.
Esperado: FAIL.
Depois **desfaça a troca editando de volta** — não use `git checkout`, que apagaria o arquivo inteiro (ele é novo).
Rode o teste mais uma vez: PASS (7).

- [ ] **Step 6: Troque o render antigo no `timeline-client.tsx`**

Adicione o import:

```ts
import { EspectroCobertura } from "./espectro-cobertura";
```

Apague a função `renderEspectroRadar` inteira (da linha `const renderEspectroRadar = () => {` até o `};` que a fecha) e, no JSX, troque `{renderEspectroRadar()}` por:

```tsx
{
  snapSelecionado ? (
    <EspectroCobertura
      eixos={snapSelecionado.espectro}
      sessaoAtiva={sessaoAtiva}
    />
  ) : null;
}
```

- [ ] **Step 7: Verifique**

```bash
pnpm typecheck && npx eslint "src/app/(app)/pacientes/[id]/timeline/" && npx vitest run "src/app/(app)/pacientes"
```

Esperado: typecheck limpo; ESLint sem `errors` (1 warning pré-existente de `react-hooks/exhaustive-deps` em `timeline-client.tsx` é aceitável — já existia em `main`); suíte verde.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.tsx" "src/app/(app)/pacientes/[id]/timeline/espectro-cobertura.test.tsx" "src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx"
git commit -m "feat(evolucao): plot evidence coverage instead of normalized progress"
```

---

## Task 3: A aba se divide em "Esta sessão" e "No tempo"

**Por quê:** a aba renderiza seis regiões interativas de peso visual idêntico e três seletores de tempo concorrentes (sessão ativa no scrubber, sessão B no comparador, trecho no drilldown). Não há entrada. No mobile é pior: o grid é `md:grid-cols-3` com o delta na segunda coluna, então abaixo de 768px "o que mudou nesta sessão" — a única coisa que o terapeuta quer — fica **abaixo** de três painéis analíticos. A divisão em duas vistas dá uma pergunta por tela e, de quebra, torna a leitura compartilhável por URL.

**Files:**

- Create: `src/app/(app)/pacientes/[id]/timeline/vista-nav.tsx`
- Modify: `src/app/(app)/pacientes/[id]/page.tsx`
- Modify: `src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx`

- [x] **Step 1: Crie o seletor de vista**

> **Correção na execução (20/08/2026): NÃO ponha `"use client"` neste arquivo.**
> `vistaValida` é chamado de `page.tsx`, que é Server Component. Com a
> diretiva, os exports viram referências de cliente e a chamada no servidor
> estoura em runtime — `Attempted to call vistaValida() from the server but
vistaValida is on the client` — derrubando a aba inteira com HTTP 500.
> Typecheck, lint e a suíte passam mesmo assim; só o navegador pega. O
> componente não usa hook nenhum (só `<Link>`), então o módulo fica sem
> diretiva. Ver commit `fix(evolucao): drop 'use client' from vista-nav`.
>
> A superfície também foi alinhada ao `SegmentedControl` do DS (borda âncora +
> sombra dura sobre `--surface-card`, item ativo em `--action-primary`), com
> `<Link>` no lugar de `<button>` para preservar href real.

Crie `src/app/(app)/pacientes/[id]/timeline/vista-nav.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/cn";

export type VistaEvolucao = "sessao" | "tempo";

/**
 * Aceita qualquer coisa vinda de `searchParams` e devolve uma vista válida.
 * Valor desconhecido cai em "sessao": a entrada padrão é sempre a pergunta do
 * terapeuta ("o que mudou agora?"), nunca a superfície analítica.
 */
export function vistaValida(
  bruto: string | string[] | undefined,
): VistaEvolucao {
  return bruto === "tempo" ? "tempo" : "sessao";
}

const OPCOES: Array<{ vista: VistaEvolucao; rotulo: string }> = [
  { vista: "sessao", rotulo: "Esta sessão" },
  { vista: "tempo", rotulo: "No tempo" },
];

/**
 * A vista vive na URL (`?vista=`), não em `useState`, por dois motivos: o
 * coordenador precisa conseguir mandar uma leitura para o supervisor, e o
 * botão "voltar" do navegador precisa desfazer a troca de vista.
 *
 * Piso de 44px (`--control-sm`) porque esta é a primeira decisão da tela e o
 * terapeuta a toca com o polegar, em pé.
 */
export function VistaNav({
  basePath,
  vistaAtual,
}: {
  basePath: string;
  vistaAtual: VistaEvolucao;
}) {
  return (
    <nav aria-label="Vista da evolução">
      <ul className="flex flex-wrap gap-2">
        {OPCOES.map(({ vista, rotulo }) => {
          const ativo = vista === vistaAtual;
          return (
            <li key={vista}>
              <Link
                href={`${basePath}?vista=${vista}`}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[var(--control-sm)] items-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] px-4 text-sm font-bold",
                  "focus-visible:outline-focus focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
                  ativo
                    ? "bg-[var(--action-primary)] text-[var(--action-primary-fg)] shadow-[var(--ds-shadow)]"
                    : "bg-[var(--surface-card)] text-[var(--text-primary)]",
                )}
              >
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [x] **Step 2: Leia a vista em `page.tsx`**

Em `src/app/(app)/pacientes/[id]/page.tsx`, mude a interface de props e a assinatura:

```ts
interface PacientePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PacientePage({
  params,
  searchParams,
}: PacientePageProps) {
  const { id } = await params;
  const { vista: vistaBruta } = await searchParams;
```

Adicione o import:

```ts
import { vistaValida } from "./timeline/vista-nav";
```

E, antes do `return`:

```ts
const vista = vistaValida(vistaBruta);
```

Passe para o cliente:

```tsx
<TimelineClient
  patientId={paciente.id}
  pacienteNome={paciente.nome}
  initialData={timeline}
  vista={vista}
/>
```

- [x] **Step 3: Faça `TimelineClient` renderizar só a vista pedida**

Em `timeline-client.tsx`, adicione ao import de componentes:

```ts
import { VistaNav, type VistaEvolucao } from "./vista-nav";
```

Some a prop à interface:

```ts
interface TimelineClientProps {
  patientId: string;
  pacienteNome: string;
  initialData: TimelineData;
  vista: VistaEvolucao;
}
```

E ao destructuring do componente: `vista,`.

Substitua o `return (...)` final por:

```tsx
return (
  <div className="flex w-full flex-col gap-6">
    <VistaNav basePath={`/pacientes/${patientId}`} vistaAtual={vista} />

    {vista === "sessao" ? (
      /*
          "Esta sessão" não tem relógio: é sempre a sessão mais recente. O
          scrubber (e, com ele, o conceito de "estou olhando o passado") vive
          só na vista "No tempo". Uma pergunta, uma tela.
        */
      <div className="flex flex-col gap-6">
        <DeltaSessaoLateral
          delta={deltaSessao}
          metas={deltaMetas}
          milestones={deltaMilestones}
          carregando={carregandoDelta}
          erro={erroDelta}
          onTentarDeNovo={() => setTentativaDelta((n) => n + 1)}
        />
        {snapSelecionado ? (
          <EspectroCobertura
            eixos={snapSelecionado.espectro}
            sessaoAtiva={sessaoAtiva}
          />
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col gap-6">
        <Scrubber
          sessoesDisponiveis={sessoesDisponiveis}
          sessaoSelecionada={sessaoAtiva}
          dataSessaoSelecionada={snapSelecionado?.geradoEm}
          onSelecionarSessao={handleSelecionarSessao}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            {renderTrajetoriaMetas()}
            {renderGraficoProtocolo()}
          </div>
          <div className="flex flex-col gap-6">{renderComparador()}</div>
        </div>
      </div>
    )}

    {renderDrilldown()}
  </div>
);
```

Extraia o bloco JSX do comparador (de `{podeComparar && (` até o `)}` correspondente) para uma função `renderComparador` declarada junto das outras `render*`, e o `<Dialog open={drilldownOpen} ...>` inteiro para `renderDrilldown`. Não mude o conteúdo dos dois — só mova.

- [x] **Step 4: Verifique**

```bash
pnpm typecheck && npx eslint "src/app/(app)/pacientes/[id]/timeline/" && npx vitest run "src/app/(app)/pacientes"
```

Esperado: typecheck limpo, 0 erros de ESLint, suíte verde.

Resultado (20/08/2026): typecheck limpo, 0 erros de ESLint (1 warning pré-existente de `react-hooks/exhaustive-deps`), 203/203 verdes. **Os três passaram com a aba dando HTTP 500 em runtime** — nenhum deles executa a fronteira servidor/cliente. Ver a correção no Step 1.

- [~] **Step 5: Verifique no navegador**

Suba o preview com `preview_start` e visite, autenticado, `/pacientes/<id>` e `/pacientes/<id>?vista=tempo`.
Confirme: (a) a entrada cai em "Esta sessão" com o delta no topo; (b) o scrubber não aparece em "Esta sessão"; (c) a URL muda ao trocar de vista e o "voltar" do navegador desfaz; (d) em largura de 360px nada estoura na horizontal.

Resultado (20/08/2026), em Chrome autenticado: (a) ✅, (b) ✅, (c) ✅ — a URL vira `?vista=tempo` e o "voltar" devolve para "Esta sessão". **(d) NÃO verificado:** o Chrome do Windows tem largura mínima de janela e `resize_window` não reduziu o viewport abaixo de ~1849px CSS; o truque de `zoom` não reavaliou as media queries. Continua aberto — medir em DevTools device toolbar ou em aparelho real antes de fechar a task.

- [x] **Step 6: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/timeline/vista-nav.tsx" "src/app/(app)/pacientes/[id]/page.tsx" "src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx"
git commit -m "feat(evolucao): split tab into 'this session' and 'over time' views"
```

---

## Task 4: Evolução do paciente TCC

**Por quê:** o paciente de TCC hoje vê, na aba Evolução, um hexágono de eixos VB-MAPP (mando, tato, ecoico) — vocabulário de intervenção ABA que não descreve nada do tratamento dele. Enquanto isso, a leitura de evolução dele **já existe e está na aba errada**: `GraficoEvolucaoCrencas` (intensidade emocional antes × depois da reestruturação) mora dentro da aba TCC, junto do formulário de registro. Falta a série que a literatura de TCC usa como medida de desfecho: **escore PHQ-9/GAD-7 ao longo do tempo**. Os dados já estão em `instrumento_aplicacao` (`escoreTotal`, `tipoInstrumento`, `criadoEm`).

**Files:**

- Create: `src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.tsx`
- Create: `src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.test.tsx`
- Create: `src/app/(app)/pacientes/[id]/timeline/evolucao-tcc.tsx`
- Modify: `src/app/(app)/pacientes/[id]/page.tsx`

- [x] **Step 1: Escreva o teste que falha**

Crie `src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import {
  GraficoEscoreInstrumento,
  ESCALA_MAXIMA,
} from "./grafico-escore-instrumento";

const aplicacao = (escore: number | null, dia: number) => ({
  id: `a${dia}`,
  tipoInstrumento: "phq9" as const,
  escoreTotal: escore,
  criadoEm: new Date(`2026-0${dia}-10T12:00:00Z`),
});

describe("ESCALA_MAXIMA", () => {
  it("PHQ-9 vai a 27 e GAD-7 a 21 — escalas diferentes, nunca a mesma", () => {
    expect(ESCALA_MAXIMA.phq9).toBe(27);
    expect(ESCALA_MAXIMA.gad7).toBe(21);
  });
});

describe("GraficoEscoreInstrumento", () => {
  it("plota a série e nomeia a faixa de corte de cada aplicação", () => {
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="phq9"
        aplicacoes={[aplicacao(18, 1), aplicacao(11, 2), aplicacao(4, 3)]}
      />,
    );

    // Faixas oficiais do PHQ-9 (`../tcc/instrumento-lista.tsx`): 18 =
    // "moderadamente grave", 11 = "moderado", 4 = "mínimo".
    //
    // Matcher ANCORADO (`^...$`), não `/moderado/`: a substring "moderado"
    // também casa com "moderadamente grave", e a asserção passaria mesmo se o
    // componente derivasse a faixa errada para os dois pontos.
    expect(screen.getByText(/^moderadamente grave$/)).toBeTruthy();
    expect(screen.getByText(/^moderado$/)).toBeTruthy();
    expect(screen.getByText(/^mínimo$/)).toBeTruthy();
  });

  it("aplicação sem escore não vira ponto no gráfico nem zero", () => {
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="phq9"
        aplicacoes={[aplicacao(18, 1), aplicacao(null, 2)]}
      />,
    );

    // Escore ausente é ausência de medida, não medida zero: plotá-lo como 0
    // desenharia uma queda de 18 para 0 — uma melhora clínica inexistente.
    expect(screen.getByText(/1 aplicação sem escore registrado/)).toBeTruthy();
  });

  it("uma única aplicação: mostra o valor, não desenha tendência", () => {
    render(
      <GraficoEscoreInstrumento
        tipoInstrumento="gad7"
        aplicacoes={[{ ...aplicacao(9, 1), tipoInstrumento: "gad7" as const }]}
      />,
    );

    expect(
      screen.getByText(/Uma única aplicação — ainda não há série/),
    ).toBeTruthy();
  });

  it("nenhuma aplicação: estado vazio nomeado", () => {
    render(<GraficoEscoreInstrumento tipoInstrumento="gad7" aplicacoes={[]} />);

    expect(
      screen.getByText(/Nenhuma aplicação de GAD-7 registrada/),
    ).toBeTruthy();
  });
});
```

- [x] **Step 2: Rode e confirme a falha**

Rode: `npx vitest run "src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.test.tsx"`
Esperado: FAIL — módulo não encontrado.

- [x] **Step 3: Implemente o gráfico**

Crie `src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  derivarFaixaDeCorte,
  type InstrumentoAplicacaoLinha,
} from "../tcc/instrumento-lista";

/**
 * Série temporal de escore de instrumento padronizado (PHQ-9 / GAD-7) — a
 * medida de desfecho que a prática de TCC usa, e que a aba Evolução do
 * paciente TCC não tinha.
 *
 * O gráfico NÃO interpreta: plota o escore que o instrumento produziu e nomeia
 * a faixa de corte pública correspondente. Nenhuma linha de tendência, nenhuma
 * projeção, nenhum "melhorou X%" — a leitura clínica é do terapeuta.
 */

/** Tetos oficiais. PHQ-9 tem 9 itens 0-3; GAD-7 tem 7 itens 0-3. */
export const ESCALA_MAXIMA = { phq9: 27, gad7: 21 } as const;

const ROTULO_TIPO = { phq9: "PHQ-9", gad7: "GAD-7" } as const;

const LARGURA = 640;
const ALTURA = 220;
const MARGEM = { topo: 16, direita: 16, base: 32, esquerda: 36 };

export function GraficoEscoreInstrumento({
  tipoInstrumento,
  aplicacoes,
}: {
  tipoInstrumento: InstrumentoAplicacaoLinha["tipoInstrumento"];
  aplicacoes: InstrumentoAplicacaoLinha[];
}) {
  const rotulo = ROTULO_TIPO[tipoInstrumento];
  const maximo = ESCALA_MAXIMA[tipoInstrumento];

  const daSerie = aplicacoes
    .filter((a) => a.tipoInstrumento === tipoInstrumento)
    .sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    );

  // Escore ausente é ausência de medida, nunca zero: plotado como 0 o gráfico
  // desenharia uma queda que representa melhora clínica que não aconteceu.
  const pontos = daSerie.filter(
    (a): a is InstrumentoAplicacaoLinha & { escoreTotal: number } =>
      a.escoreTotal !== null,
  );
  const semEscore = daSerie.length - pontos.length;

  const moldura = (conteudo: React.ReactNode) => (
    <section className="flex flex-col gap-3 rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]">
      <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
        {rotulo} ao longo do tempo
      </h3>
      {conteudo}
      {semEscore > 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {semEscore}{" "}
          {semEscore === 1
            ? "aplicação sem escore registrado — fora do gráfico"
            : "aplicações sem escore registrado — fora do gráfico"}
          .
        </p>
      ) : null}
    </section>
  );

  if (pontos.length === 0) {
    return moldura(
      <p className="text-sm text-[var(--text-secondary)]">
        Nenhuma aplicação de {rotulo} registrada com escore para este paciente.
      </p>,
    );
  }

  if (pontos.length === 1) {
    const unico = pontos[0]!;
    return moldura(
      <div className="flex flex-col gap-1">
        <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
          {unico.escoreTotal}
          <span className="text-base font-medium text-[var(--text-secondary)]">
            {" "}
            / {maximo}
          </span>
        </p>
        <p className="text-sm text-[var(--text-primary)]">
          {derivarFaixaDeCorte(tipoInstrumento, unico.escoreTotal)} ·{" "}
          {new Date(unico.criadoEm).toLocaleDateString("pt-BR")}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Uma única aplicação — ainda não há série para comparar.
        </p>
      </div>,
    );
  }

  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;

  const coords = pontos.map((a, i) => ({
    ...a,
    x: MARGEM.esquerda + (larguraUtil * i) / (pontos.length - 1),
    y: MARGEM.topo + alturaUtil * (1 - a.escoreTotal / maximo),
  }));

  return moldura(
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto" aria-hidden="true">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="h-auto w-full min-w-[320px]"
        >
          <line
            x1={MARGEM.esquerda}
            y1={MARGEM.topo}
            x2={MARGEM.esquerda}
            y2={ALTURA - MARGEM.base}
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />
          <line
            x1={MARGEM.esquerda}
            y1={ALTURA - MARGEM.base}
            x2={LARGURA - MARGEM.direita}
            y2={ALTURA - MARGEM.base}
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />
          <polyline
            points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
            fill="none"
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />
          {coords.map((c) => (
            <circle
              key={c.id}
              cx={c.x}
              cy={c.y}
              r="5"
              fill="var(--action-primary)"
              stroke="var(--border-brutal)"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      {/*
        A tabela é a leitura canônica: visível, não `sr-only`. Ela carrega o
        que o SVG não consegue dizer sem rótulo de 9px — data, escore e faixa
        de corte de cada aplicação.
      */}
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Aplicações de {rotulo} com escore e faixa de corte
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pb-1 font-bold">
              Data
            </th>
            <th scope="col" className="pb-1 font-bold">
              Escore
            </th>
            <th scope="col" className="pb-1 font-bold">
              Faixa
            </th>
          </tr>
        </thead>
        <tbody>
          {coords.map((c) => (
            <tr key={c.id} className="border-t border-[var(--border-muted)]">
              <td className="py-1.5">
                {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
              </td>
              <td className="py-1.5 font-mono font-bold">
                {c.escoreTotal} / {maximo}
              </td>
              <td className="py-1.5">
                {derivarFaixaDeCorte(tipoInstrumento, c.escoreTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}
```

- [x] **Step 4: Rode e confirme que passa**

Rode: `npx vitest run "src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.test.tsx"`
Esperado: PASS (5).

- [x] **Step 5: Componha a leitura TCC**

Crie `src/app/(app)/pacientes/[id]/timeline/evolucao-tcc.tsx`:

```tsx
import { GraficoEscoreInstrumento } from "./grafico-escore-instrumento";
import { GraficoEvolucaoCrencas } from "../tcc/grafico-evolucao-crencas";
import type { InstrumentoAplicacaoLinha } from "../tcc/instrumento-lista";
import type { RpdGraficoEntry } from "../tcc/grafico-evolucao-crencas";

/**
 * Aba Evolução de um paciente `cognitive_behavioral`.
 *
 * A regra que este arquivo materializa: **a aba da modalidade é onde se
 * ESCREVE, a aba Evolução é onde se LÊ.** O gráfico de crenças estava dentro
 * de `../tcc/page.tsx`, junto do formulário de RPD — leitura misturada com
 * registro, e ao lado de uma aba "Evolução" que mostrava eixos VB-MAPP para
 * um paciente que não tem nenhum marco ABA.
 */
export function EvolucaoTcc({
  aplicacoes,
  entriesRpd,
}: {
  aplicacoes: InstrumentoAplicacaoLinha[];
  entriesRpd: RpdGraficoEntry[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <GraficoEscoreInstrumento
        tipoInstrumento="phq9"
        aplicacoes={aplicacoes}
      />
      <GraficoEscoreInstrumento
        tipoInstrumento="gad7"
        aplicacoes={aplicacoes}
      />
      <GraficoEvolucaoCrencas entries={entriesRpd} />
    </div>
  );
}
```

- [x] **Step 6: Ligue em `page.tsx`**

Em `src/app/(app)/pacientes/[id]/page.tsx`, adicione:

```ts
import { EvolucaoTcc } from "./timeline/evolucao-tcc";
import { obterRPDEntries } from "./tcc/logic";
import { obterInstrumentoAplicacoes } from "./tcc/instrumento-logic";
```

**Antes de ramificar, mova o carregamento dos avisos para cima.** Hoje `const avisos = await carregarAvisosArquivamento(ctx, id);` fica depois de `carregarTimeline`; o ramo TCC precisa dele e sai antes. Recorte essa linha e cole-a logo após o bloco de `redirect` da Task 1 — ela não depende da timeline.

Em seguida ramifique, ainda **antes** de `carregarTimeline` (a timeline é protocol-driven e não seria usada por um paciente de TCC):

```ts
  if (capacidades.leituraDeEvolucao === "tcc") {
    const [aplicacoes, entriesRpd] = await Promise.all([
      obterInstrumentoAplicacoes(ctx, id),
      obterRPDEntries(ctx, id),
    ]);

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Stack gap="lg">
          <PageHeader
            breadcrumb={
              <Breadcrumb
                itens={[
                  { rotulo: "Pacientes", href: "/pacientes" },
                  { rotulo: paciente.nome, atual: true },
                ]}
              />
            }
            title={paciente.nome}
            badge={
              paciente.arquivadoEm ? (
                <StatusBadge variante="neutral">Arquivado</StatusBadge>
              ) : undefined
            }
            description="Evolução clínica em Terapia Cognitivo-Comportamental"
          />
          <AvisosArquivamento {...avisos} />
          <EvolucaoTcc
            aplicacoes={aplicacoes}
            entriesRpd={entriesRpd.map((e) => ({
              ...e,
              distorcoesCognitivas: e.distorcoesCognitivas as
                | string[]
                | null,
            }))}
          />
        </Stack>
      </div>
    );
  }
```

- [x] **Step 7: Remova a duplicata da aba TCC**

Em `src/app/(app)/pacientes/[id]/tcc/page.tsx`, apague o bloco `<GraficoEvolucaoCrencas entries={...} />` e o import correspondente. Substitua por um ponteiro para a leitura:

```tsx
<p className="text-sm text-[var(--text-secondary)]">
  O acompanhamento gráfico da reestruturação e dos escores de PHQ-9 e GAD-7 fica
  na aba{" "}
  <Link
    href={`/pacientes/${patientId}`}
    className="font-semibold underline underline-offset-4"
  >
    Evolução
  </Link>
  . Esta aba é o registro.
</p>
```

Adicione `import Link from "next/link";` ao topo. Ajuste a `<p>` de descrição do cabeçalho para não prometer mais gráfico: troque "e acompanhamento gráfico de reestruturação cognitiva" por "e Registro de Pensamentos Distorcidos (RPD)".

- [x] **Step 8: Verifique**

```bash
pnpm typecheck && npx eslint "src/app/(app)/pacientes/[id]" && npx vitest run "src/app/(app)/pacientes"
```

Esperado: typecheck limpo, 0 erros de ESLint, suíte verde. Se `tcc/page.test.tsx` afirmar a presença do gráfico de crenças, atualize a asserção para o novo ponteiro — a mudança de lugar é intencional.

- [x] **Step 9: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.tsx" "src/app/(app)/pacientes/[id]/timeline/grafico-escore-instrumento.test.tsx" "src/app/(app)/pacientes/[id]/timeline/evolucao-tcc.tsx" "src/app/(app)/pacientes/[id]/page.tsx" "src/app/(app)/pacientes/[id]/tcc/page.tsx"
git commit -m "feat(evolucao): give CBT patients their own evolution reading"
```

---

## Task 5: Acessibilidade e tokens — o que foi medido no código

**Por quê:** cada item abaixo foi verificado, não suposto. Nenhum é opinião de estilo.

**Files:**

- Modify: `src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx`
- Modify: `src/app/(app)/pacientes/[id]/timeline/scrubber.tsx`
- Modify: `src/app/(app)/pacientes/[id]/timeline/delta-sessao.tsx`
- Modify: `src/app/(app)/pacientes/[id]/page.tsx`

- [ ] **Step 1: Devolva o anel de foco (WCAG 2.4.7)**

`focus:outline-none` aparece em 4 controles sem substituto, e `grep focus-visible` na aba devolve zero. Em cada um — os dois `<select>` de `timeline-client.tsx`, o botão de trecho da trajetória, e o link do empty state em `page.tsx` — remova `focus:outline-none` e acrescente:

```
focus-visible:outline-focus focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]
```

Confira depois: `grep -c "focus:outline-none" "src/app/(app)/pacientes/[id]/timeline/timeline-client.tsx"` deve devolver `0`.

- [ ] **Step 2: Alvos de toque a 44px (`--control-sm`)**

Medidos abaixo do piso: `<select>` da trajetória ≈38px (`p-2 text-sm`), `<select>` do comparador ≈32px (`p-1.5 text-sm`), checkbox `size-4` = 16px.

Nos dois `<select>`, troque o padding por `min-h-[var(--control-sm)] px-3`. No checkbox, troque `size-4` por `size-5` e envolva rótulo e input num `<label>` com `min-h-[var(--control-sm)] flex items-center gap-3 cursor-pointer`, de modo que a área clicável inteira alcance o piso.

- [ ] **Step 3: Barra de progresso visível (WCAG 1.4.11)**

Hoje a faixa "conquistados" é `bg-status-success-bg` (`#b2dfdb`) sobre `bg-gray-200` (`#e5e7eb`) — **1,17:1** — e a de "candidatos" é `#eff6ff` sobre o mesmo cinza — **1,19:1**. As duas são invisíveis e indistinguíveis entre si. Mínimo exigido para objeto gráfico: 3:1.

Troque os preenchimentos pelas cores de acento, não pelos tints:

```tsx
{
  percConquistados > 0 && (
    <div
      style={{ width: `${percConquistados}%` }}
      className="h-full border-r-2 border-[var(--border-brutal)] bg-[var(--status-success-border)]"
      title={`${percConquistados.toFixed(0)}% Conquistados`}
    />
  );
}
{
  percCandidatos > 0 && (
    <div
      style={{ width: `${percCandidatos}%` }}
      className="h-full border-r-2 border-[var(--border-brutal)] bg-[var(--status-ia-border)]"
      title={`${percCandidatos.toFixed(0)}% Candidatos`}
    />
  );
}
```

E troque a trilha `bg-gray-200` por `bg-[var(--surface-muted)]`.

- [ ] **Step 4: "Candidato" é violeta, não azul (The Epistemic Honesty Rule)**

`grep status-ia` na aba devolve zero: o estado "candidato" — que é a saída da IA — usa `--status-info-*`, que o Design System reserva para notificação. Pior, `delta-sessao.tsx` usa o mesmo azul para "Introduzidos na Sessão", então azul significa duas coisas na mesma tela.

Em `timeline-client.tsx`, no chip de estatística e no indicador `status === "candidato"` do grid de marcos, troque `bg-status-info-bg` por `bg-[var(--status-ia-bg)]`, `text-status-info-text` por `text-[var(--status-ia-fg)]` e a borda por `border-[var(--status-ia-border)]`. Mantenha a geometria distinta que já existe (losango tracejado): cor e forma juntas, nunca cor sozinha.

- [ ] **Step 5: Classes mortas**

`text-xxs` (3 ocorrências) e `text-muted` (6) não existem: nem `--text-xxs` nem `--color-muted` estão declarados em `@theme` (`src/styles/globals.css`). O texto herda tamanho e cor do pai.

Troque `text-xxs` por `text-[10px]` e `text-muted` por `text-[var(--text-secondary)]`. **Não** crie os tokens: `--text-secondary` já é o papel semântico correto, e um token novo só para estes seis usos aumenta a superfície do DS sem necessidade.

- [ ] **Step 6: Painéis voltam para a superfície de card**

Quatro painéis usam `bg-canvas`, que resolve para `--bg-app` (`#f8f9fa`) — a cor **da página** —, enquanto o scrubber e o delta usam `--surface-card` (`#ffffff`). Emenda visível, e os painéis não descolam do fundo.

Troque `bg-canvas` por `bg-[var(--surface-card)]` e `bg-bg-canvas` por `bg-[var(--surface-elevated)]` nos containers de painel. Mantenha `border-ink-anchor` (esse alias existe).

- [ ] **Step 7: Side-stripe e emoji**

Nos cards de evidência do drilldown, remova `border-l-4 border-l-[...]` — acento lateral é banido no DS e já foi retirado dos cards de paciente. A polaridade já é comunicada pela pílula "Evolução"/"Dificuldade" logo abaixo; nenhuma informação se perde.

Troque os emoji usados como ícone por SVG inline, no mesmo estilo do ícone de `estado-de-erro.tsx` (traço, `aria-hidden`, `currentColor`): `📭` (empty state de `page.tsx`), `⚠️` (banner do scrubber e alerta de protocolo), `🚀 📈 📉` (`delta-sessao.tsx`).

No `scrubber.tsx`, troque também o fundo do banner: `bg-[var(--color-gold)]` usa a cor de ação primária como fundo de aviso. Use `bg-[var(--status-warning-bg)]` com texto `text-[var(--status-warning-fg)]`.

- [ ] **Step 8: Copy sem vocabulário de engenharia**

Troque o texto do aviso de mudança de protocolo. De:

> **Guard G7 Ativado:** Houve mudança nos protocolos ativos entre a Sessão X e a Sessão Y. Os deltas de nível de ajuda foram suspensos devido a desalinhamento de escalas clínicas.

Para:

> **Comparação suspensa.** Os protocolos ativos mudaram entre a Sessão X e a Sessão Y, e as escalas de nível de ajuda das duas não são equivalentes. Comparar os números daria uma diferença que não existe clinicamente.

No empty state de `page.tsx`, troque "sessões registradas ou snapshots de repertório materializados" por "sessões registradas". Em `delta-sessao.tsx`, troque o fallback `Meta/Marco (${id.substring(0, 8)})` por `"Alvo removido do plano"` — UUID truncado na tela não ajuda ninguém e expõe implementação.

- [ ] **Step 9: Verifique**

```bash
pnpm typecheck && npx eslint "src/app/(app)/pacientes/[id]" && npx vitest run "src/app/(app)/pacientes"
```

Depois, no navegador: navegue a aba inteira **só pelo teclado** (Tab / Shift+Tab) e confirme que todo controle mostra anel de foco visível. Redimensione para 360px e confirme que nada estoura na horizontal.

Nota: o `a11y.test.tsx` roda axe sob jsdom, que **não avalia contraste** — os itens de contraste desta tarefa não têm guarda automática. A verificação é a medição manual registrada aqui.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/pacientes/[id]"
git commit -m "fix(evolucao): restore focus rings, touch targets, contrast and DS tokens"
```

---

## Task 6 (fora deste plano, bloqueante para o valor dele): marco 0 vindo da anamnese — issue [#407](https://github.com/romulosutil/Iris/issues/407)

**Prioridade:** `P1 · antes de dado real`. **Não executar aqui** — toca modelo de dados, então entra por `/tlc-spec-driven` antes da label `jules`.

**Por quê agora:** as Tasks 1 a 5 deste plano fazem o gráfico parar de mentir. Elas não fazem o gráfico ter **origem**. Depois da Task 2, o hexágono de um paciente novo é honestamente vazio nos seis eixos até a primeira evidência aprovada — o que é correto e continua inútil para o coordenador, porque não existe estado inicial contra o qual comparar. O primeiro ponto da linha do tempo é hoje a primeira sessão realizada; deveria ser a anamnese.

**O que a #407 resolve:** anamnese estruturada e validada pelo coordenador, cobrindo os seis eixos, que produz (a) sugestão de protocolo e nível de entrada — ex.: VB-MAPP Nível 1 —, (b) os alvos iniciais do PEI com nível de ajuda de partida, e (c) um `session_snapshot` de `session_numero = 0`. Todo gráfico da linha do tempo passa a nascer nesse ponto.

**Achados de modelagem já medidos e registrados na issue** (evitam re-investigação):

- `session_snapshot.session_numero` é `integer` **sem CHECK `> 0`** → o número 0 está livre.
- `db/migrations/0007_session_numero_seq.sql` numera com `COALESCE(MAX(...), 0) + 1` → um marco 0 **não desloca** a numeração das sessões reais.
- `evidence.session_id` é **NOT NULL** → a linha de base não pode ser `evidence` sem uma sessão associada. É a restrição que amarra a decisão de Design nº 1 da issue.
- Não existe tabela `milestone_assessment` no `schema.ts`, apesar de a documentação de jornadas citá-la.
- `computarDadosEspectro` monta os eixos a partir de `goal` — **sem meta cadastrada não há hexágono nenhum**, nem de base. Por isso a anamnese precisa gerar alvos, não só um snapshot.

**Ordem sugerida:** fechar as Tasks 3 e 5 deste plano primeiro (são refinamentos de uma tela que já funciona), e abrir a spec da #407 em seguida — cada paciente onboardado antes dela é um paciente cujo gráfico nunca terá origem sem retroagir data.

---

## Fora de escopo (registrar como dívida, não fazer aqui)

- **`Alert` tem `border-l-[4px]` embutido** (`src/components/ui/alert.tsx`) — o mesmo side-stripe banido, em todo uso do componente no produto. Corrigir ali afeta o app inteiro e merece issue própria.
- **Ações duplicadas no `PageHeader`** de `page.tsx` ("Ficha Clínica" e "PEI & Metas" repetem abas logo abaixo, e o botão de PEI aparece mesmo para paciente TCC). Some naturalmente se o header for revisto; não misture com este plano.
- **CTA do empty state** manda para `/agenda`, mas o próximo passo real de um paciente novo é prescrição → equipe (a lista de pacientes já marca "Sem prescrição"). Precisa da decisão de produto sobre qual é a ordem canônica de onboarding do paciente.
- **`useState<any[]>` e `ev: any`** no drilldown de evidências — tipar exige extrair o tipo de retorno de `carregarEvidenciasAction`.
