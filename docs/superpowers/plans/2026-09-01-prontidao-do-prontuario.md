# Prontidão do prontuário — plano de implementação

> **Para executores autônomos:** SUB-SKILL OBRIGATÓRIA — usar
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`).

**Goal:** Fazer o prontuário do paciente saber o próprio estado e nomear o gesto
seguinte, bloqueando o passo "Documentar" da sessão enquanto faltar o que é
causalmente necessário para gerar dado (protocolo prescrito + meta ativa).

**Architecture:** Uma função pura (`montarProntidao`) decide tudo a partir de
fatos já lidos; uma query só lê os fatos numa transação `withTenant`; um
componente (`CartaoProntidao`) renderiza o resultado em três superfícies. A
escada por modalidade sai de `capacidadesDaModalidade` — fonte única já
existente. Nada é persistido: prontidão é sempre derivada.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Drizzle ORM, Postgres
com RLS, Vitest, Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`

**Convenções deste repo que o executor precisa saber:**

- Testes unitários/componente: `pnpm test` (vitest). Integração/RLS:
  `pnpm test:rls` (`--config vitest.integration.config.ts`) — arquivos
  `*.int.test.ts`. Rodar `vitest run` num `*.int.test.ts` **coleta zero** e
  passa verde enganando; conferir sempre a contagem.
- **Não existe `jest-dom`.** `toBeInTheDocument` estoura `Invalid Chai
  property`. Usar matcher nativo sobre o DOM cru:
  `expect(screen.queryByText(/x/i)).not.toBeNull()`.
- `pnpm format` reformata o repositório inteiro. Formatar só os arquivos
  tocados: `pnpm prettier --write <caminho>`.
- Commits em inglês, Conventional Commits.
- Cada tarefa termina em commit próprio.

---

### Task 1: Escada por modalidade em `modalidade.ts`

`capacidadesDaModalidade` já é a fonte única do que cada modalidade tem dentro
do prontuário. A escada nasce ali para não haver uma segunda tabela que
divirja no primeiro modo novo (decisão D-A5 da spec).

**Files:**

- Modify: `src/app/(app)/pacientes/[id]/modalidade.ts`
- Test: `src/app/(app)/pacientes/[id]/modalidade.test.ts` (já existe)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `src/app/(app)/pacientes/[id]/modalidade.test.ts`:

```ts
describe("degraus de prontidão", () => {
  it("protocol_driven exige protocolo e meta, e recomenda ficha e anamnese", () => {
    const c = capacidadesDaModalidade("protocol_driven");
    expect(c.degrausProntidao).toEqual([
      "admissao",
      "ficha_clinica",
      "anamnese",
      "protocolo",
      "meta",
      "primeira_sessao",
    ]);
    expect(c.degrausBloqueantes).toEqual(["protocolo", "meta"]);
  });

  it("cognitive_behavioral exige instrumento, não protocolo nem meta", () => {
    const c = capacidadesDaModalidade("cognitive_behavioral");
    expect(c.degrausProntidao).toEqual([
      "admissao",
      "ficha_clinica",
      "instrumento",
      "primeira_sessao",
    ]);
    expect(c.degrausBloqueantes).toEqual(["instrumento"]);
  });

  it("conventional não bloqueia nada — acompanhamento é narrativo", () => {
    const c = capacidadesDaModalidade("conventional");
    expect(c.degrausProntidao).toEqual([
      "admissao",
      "ficha_clinica",
      "primeira_sessao",
    ]);
    expect(c.degrausBloqueantes).toEqual([]);
  });

  it("modalidade não resolvida pede definir a modalidade primeiro", () => {
    const c = capacidadesDaModalidade(null);
    expect(c.degrausProntidao).toEqual(["admissao", "modalidade"]);
    expect(c.degrausBloqueantes).toEqual(["modalidade"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test src/app/(app)/pacientes/[id]/modalidade.test.ts`
Expected: FAIL — `degrausProntidao` é `undefined`.

- [ ] **Step 3: Implementar**

Em `src/app/(app)/pacientes/[id]/modalidade.ts`, acrescentar o tipo e os campos:

```ts
/**
 * Degraus da escada de prontidão do prontuário. A ORDEM do array é a ordem de
 * exibição e a ordem em que `montarProntidao` procura o próximo passo.
 *
 * `admissao` nasce sempre concluído (é o próprio `patient` existir) e existe
 * na lista só para o operador ver de onde veio — escada que começa no segundo
 * degrau esconde o progresso já feito.
 */
export type DegrauId =
  | "admissao"
  | "modalidade"
  | "ficha_clinica"
  | "anamnese"
  | "protocolo"
  | "meta"
  | "instrumento"
  | "primeira_sessao";
```

Acrescentar à interface `CapacidadesDaModalidade`:

```ts
  /** Degraus exibidos na escada, em ordem. */
  degrausProntidao: DegrauId[];
  /** Subconjunto de `degrausProntidao` que BLOQUEIA o passo "Documentar".
   * Só o mínimo causal (D-A3): régua que mede o não-causal treina o operador
   * a preencher lixo para destravar. */
  degrausBloqueantes: DegrauId[];
```

Preencher em cada `case` do `switch`:

```ts
    case "cognitive_behavioral":
      return {
        // ...campos já existentes...
        degrausProntidao: [
          "admissao",
          "ficha_clinica",
          "instrumento",
          "primeira_sessao",
        ],
        degrausBloqueantes: ["instrumento"],
      };
    case "conventional":
      return {
        // ...campos já existentes...
        degrausProntidao: ["admissao", "ficha_clinica", "primeira_sessao"],
        degrausBloqueantes: [],
      };
    case "protocol_driven":
      return {
        // ...campos já existentes...
        degrausProntidao: [
          "admissao",
          "ficha_clinica",
          "anamnese",
          "protocolo",
          "meta",
          "primeira_sessao",
        ],
        degrausBloqueantes: ["protocolo", "meta"],
      };
    default:
      return {
        // ...campos já existentes...
        // Sem modalidade não há como saber qual instrumento o modo usa. O
        // único degrau honesto é resolver a modalidade — e ele BLOQUEIA:
        // documentar aqui produziria evidência que nenhuma leitura consome.
        degrausProntidao: ["admissao", "modalidade"],
        degrausBloqueantes: ["modalidade"],
      };
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/app/(app)/pacientes/[id]/modalidade.test.ts`
Expected: PASS, incluindo os testes que já existiam no arquivo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/modalidade.ts" "src/app/(app)/pacientes/[id]/modalidade.test.ts"
git commit -m "feat(paciente): declare readiness ladder per clinical modality"
```

---

### Task 2: `montarProntidao` — o núcleo puro

**Files:**

- Create: `src/lib/patient/prontidao.ts`
- Test: `src/lib/patient/prontidao.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/patient/prontidao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { montarProntidao, type FatosProntidao } from "./prontidao";

const NADA: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};

const TUDO: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: true,
  temMetaAtiva: true,
  temInstrumentoAplicado: true,
  temSessaoConsolidada: true,
};

describe("montarProntidao", () => {
  it("bloqueia documentar quando falta protocolo em protocol_driven", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(false);
    expect(p.proximo?.id).toBe("ficha_clinica");
    expect(p.degraus.find((d) => d.id === "protocolo")?.estado).toBe(
      "bloqueante",
    );
  });

  it("NÃO bloqueia por ficha clínica nem anamnese — são recomendados", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: { ...NADA, temProtocoloAtivo: true, temMetaAtiva: true },
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(true);
    expect(p.degraus.find((d) => d.id === "ficha_clinica")?.estado).toBe(
      "pendente",
    );
  });

  it("some (proximo null) quando a escada inteira está concluída", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: TUDO,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.proximo).toBeNull();
    expect(p.podeDocumentar).toBe(true);
  });

  it("terapeuta não recebe rota para um degrau que é do coordenador", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: NADA,
      role: "terapeuta",
      patientId: "p1",
    });
    const protocolo = p.degraus.find((d) => d.id === "protocolo");
    expect(protocolo?.rota).toBeNull();
    expect(p.quemResolve).toBe("Coordenação");
  });

  it("coordenador recebe a rota real do degrau", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.degraus.find((d) => d.id === "protocolo")?.rota).toBe(
      "/pacientes/p1/cadastro-clinico",
    );
    expect(p.quemResolve).toBeNull();
  });

  it("cognitive_behavioral bloqueia por instrumento, não por meta", () => {
    const p = montarProntidao({
      modalidade: "cognitive_behavioral",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(false);
    expect(p.degraus.some((d) => d.id === "meta")).toBe(false);
  });

  it("conventional nunca bloqueia documentar", () => {
    const p = montarProntidao({
      modalidade: "conventional",
      fatos: NADA,
      role: "terapeuta",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(true);
  });

  it("modalidade nula bloqueia e pede a modalidade", () => {
    const p = montarProntidao({
      modalidade: null,
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(false);
    expect(p.proximo?.id).toBe("modalidade");
  });

  it("admissao nasce concluída — o paciente existe", () => {
    const p = montarProntidao({
      modalidade: "conventional",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.degraus[0]?.id).toBe("admissao");
    expect(p.degraus[0]?.estado).toBe("concluido");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/lib/patient/prontidao.test.ts`
Expected: FAIL — `Cannot find module './prontidao'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/patient/prontidao.ts`:

```ts
import {
  capacidadesDaModalidade,
  type DegrauId,
  type ModalidadeClinica,
} from "@/app/(app)/pacientes/[id]/modalidade";

/**
 * Prontidão do prontuário — o objeto paciente sabendo o próprio estado e
 * nomeando o gesto seguinte. Escala para o paciente o padrão que a #512
 * estabeleceu para a sessão.
 *
 * Função PURA de propósito: recebe fatos já lidos, nunca decide o que ler.
 * É esse limite que a torna testável na matriz completa modalidade × fatos ×
 * papel sem tocar banco. Quem lê os fatos é `prontidao-queries.ts`.
 *
 * Nada aqui é persistido (D-A4): prontidão derivada nunca mente sobre um
 * degrau desfeito — a última meta descontinuada devolve o paciente ao estado
 * bloqueado no mesmo instante. Uma coluna `prontidao_status` continuaria
 * verde para sempre.
 */

export interface FatosProntidao {
  temFichaClinica: boolean;
  temAnamnese: boolean;
  /** `patient_protocol` com `desativado_em IS NULL`. */
  temProtocoloAtivo: boolean;
  /** `goal.estado = 'ativa'`. Rascunho NÃO conta: `materializar.ts` resolve
   * evidência contra metas, e uma meta em rascunho não é alvo de nada. */
  temMetaAtiva: boolean;
  temInstrumentoAplicado: boolean;
  temSessaoConsolidada: boolean;
}

export type EstadoDegrau = "concluido" | "pendente" | "bloqueante";

export type PapelResolvedor = "coordenador" | "terapeuta" | "admin_recepcao";

export interface Degrau {
  id: DegrauId;
  rotulo: string;
  descricao: string;
  estado: EstadoDegrau;
  /** `null` quando o papel atual não pode agir — o cartão não renderiza botão
   * morto para um passo que a `requireRole` do destino recusaria. */
  rota: string | null;
  papelQueResolve: PapelResolvedor;
}

export interface Prontidao {
  degraus: Degrau[];
  /** Primeiro degrau não concluído, na ordem da escada. `null` = prontuário
   * pronto; o cartão some (nada a fazer não ocupa pixel). */
  proximo: Degrau | null;
  podeDocumentar: boolean;
  /** Rótulo legível de quem resolve o `proximo`, quando não é o papel atual. */
  quemResolve: string | null;
}

const ROTULO_PAPEL: Record<PapelResolvedor, string> = {
  coordenador: "Coordenação",
  terapeuta: "Terapeuta",
  admin_recepcao: "Recepção",
};

interface DefinicaoDegrau {
  rotulo: string;
  descricao: string;
  papelQueResolve: PapelResolvedor;
  /** `null` = o degrau não tem destino próprio (já concluído por construção). */
  rota: (patientId: string) => string | null;
  concluido: (f: FatosProntidao) => boolean;
}

const DEFINICOES: Record<DegrauId, DefinicaoDegrau> = {
  admissao: {
    rotulo: "Admissão",
    descricao: "Cadastro, consentimento e modalidade clínica.",
    papelQueResolve: "admin_recepcao",
    rota: () => null,
    // O paciente existe — senão esta função nem teria sido chamada.
    concluido: () => true,
  },
  modalidade: {
    rotulo: "Definir a modalidade clínica",
    descricao:
      "Sem modalidade não há instrumento: o prontuário não sabe o que registrar.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/cadastro-clinico`,
    // Alcançado só quando a modalidade é nula; nesse caso nunca está pronto.
    concluido: () => false,
  },
  ficha_clinica: {
    rotulo: "Preencher a ficha clínica",
    descricao: "Diagnóstico, medicações, alergias e contatos de emergência.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/cadastro-clinico`,
    concluido: (f) => f.temFichaClinica,
  },
  anamnese: {
    rotulo: "Registrar a anamnese",
    descricao: "Marco zero do repertório. Recomendado, não obrigatório.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/anamnese`,
    concluido: (f) => f.temAnamnese,
  },
  protocolo: {
    rotulo: "Prescrever um protocolo",
    descricao:
      "Sem protocolo vigente não há marcos para a sessão pontuar — o gráfico nasce vazio.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/cadastro-clinico`,
    concluido: (f) => f.temProtocoloAtivo,
  },
  meta: {
    rotulo: "Ativar ao menos uma meta",
    descricao:
      "Evidência sem meta resolvida é descartada na materialização: a sessão seria documentada e nada apareceria na evolução.",
    papelQueResolve: "coordenador",
    rota: (id) => `/pacientes/${id}/metas`,
    concluido: (f) => f.temMetaAtiva,
  },
  instrumento: {
    rotulo: "Aplicar o instrumento inicial",
    descricao:
      "PHQ-9 ou GAD-7 como marco zero. Sem ele o gráfico de evolução nasce com um ponto só.",
    papelQueResolve: "terapeuta",
    rota: (id) => `/pacientes/${id}/tcc`,
    concluido: (f) => f.temInstrumentoAplicado,
  },
  primeira_sessao: {
    rotulo: "Documentar a primeira sessão",
    descricao: "A partir daqui a evolução passa a existir.",
    papelQueResolve: "terapeuta",
    rota: () => "/sessoes",
    concluido: (f) => f.temSessaoConsolidada,
  },
};

export interface MontarProntidaoInput {
  modalidade: ModalidadeClinica | null | undefined;
  fatos: FatosProntidao;
  role: string;
  patientId: string;
}

export function montarProntidao({
  modalidade,
  fatos,
  role,
  patientId,
}: MontarProntidaoInput): Prontidao {
  const capacidades = capacidadesDaModalidade(modalidade);
  const bloqueantes = new Set(capacidades.degrausBloqueantes);

  const degraus: Degrau[] = capacidades.degrausProntidao.map((id) => {
    const def = DEFINICOES[id];
    const concluido = def.concluido(fatos);
    return {
      id,
      rotulo: def.rotulo,
      descricao: def.descricao,
      estado: concluido
        ? "concluido"
        : bloqueantes.has(id)
          ? "bloqueante"
          : "pendente",
      // Rota só para quem pode agir. Botão que leva a um `notFound()` de
      // `requireRole` é pior que a ausência do botão: gasta o clique e não
      // explica nada.
      rota: role === def.papelQueResolve ? def.rota(patientId) : null,
      papelQueResolve: def.papelQueResolve,
    };
  });

  const proximo = degraus.find((d) => d.estado !== "concluido") ?? null;
  const podeDocumentar = !degraus.some((d) => d.estado === "bloqueante");
  const quemResolve =
    proximo && proximo.rota === null
      ? ROTULO_PAPEL[proximo.papelQueResolve]
      : null;

  return { degraus, proximo, podeDocumentar, quemResolve };
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/lib/patient/prontidao.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/patient/prontidao.ts src/lib/patient/prontidao.test.ts
git commit -m "feat(paciente): add pure readiness resolver for the patient record"
```

---

### Task 3: Leitura dos fatos, escopada por RLS

**Files:**

- Create: `src/app/(app)/pacientes/[id]/prontidao-queries.ts`
- Test: `src/app/(app)/pacientes/[id]/prontidao.int.test.ts`

- [ ] **Step 1: Escrever o teste de integração que falha**

Criar `src/app/(app)/pacientes/[id]/prontidao.int.test.ts`. Copiar o arranjo de
conexão e o `beforeAll`/`afterAll` de
`src/app/(app)/pacientes/[id]/arquivamento.int.test.ts` (mesmo padrão: `postgres`
direto, `hasDb`, `vi.mock("server-only")`), trocando o corpo dos testes por:

```ts
describe("obterFatosProntidao", () => {
  test("reflete o estado real: sem protocolo e sem meta, ambos false", async () => {
    const fatos = await obterFatosProntidao(ctxCoord, PAC);
    expect(fatos.temProtocoloAtivo).toBe(false);
    expect(fatos.temMetaAtiva).toBe(false);
  });

  test("meta em rascunho NÃO conta como meta ativa", async () => {
    await inserirMeta(PAC, "rascunho");
    const fatos = await obterFatosProntidao(ctxCoord, PAC);
    expect(fatos.temMetaAtiva).toBe(false);
  });

  test("meta ativa conta", async () => {
    await inserirMeta(PAC, "ativa");
    const fatos = await obterFatosProntidao(ctxCoord, PAC);
    expect(fatos.temMetaAtiva).toBe(true);
  });

  test("protocolo desativado NÃO conta", async () => {
    await inserirProtocolo(PAC, { desativado: true });
    const fatos = await obterFatosProntidao(ctxCoord, PAC);
    expect(fatos.temProtocoloAtivo).toBe(false);
  });

  // O caro: a RLS é que isola, não um `WHERE clinic_id`. Um paciente de outra
  // clínica não pode devolver fatos verdadeiros — devolveria uma escada
  // "pronta" para um prontuário que este usuário nem enxerga.
  test("cross-tenant: paciente de outra clínica devolve tudo false", async () => {
    await inserirMeta(PAC_CLINICA_B, "ativa");
    const fatos = await obterFatosProntidao(ctxCoord, PAC_CLINICA_B);
    expect(fatos.temMetaAtiva).toBe(false);
    expect(fatos.temFichaClinica).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/pacientes/[id]/prontidao.int.test.ts`
Expected: FAIL — módulo inexistente. **Conferir a contagem de testes coletados
(5).** Zero coletado significa config errada, não sucesso.

- [ ] **Step 3: Implementar**

Criar `src/app/(app)/pacientes/[id]/prontidao-queries.ts`:

```ts
import "server-only";
import { sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/rls";
import {
  anamnese,
  goal,
  instrumentoAplicacao,
  patientClinicalProfile,
  patientProtocol,
  sessionSnapshot,
} from "@/db/schema";
import type { FatosProntidao } from "@/lib/patient/prontidao";

/**
 * Fatos da prontidão, numa transação só e num bloco de `EXISTS`.
 *
 * Mesmo formato de `obterProgressoOnboarding`: os seis precisam enxergar a
 * MESMA imagem do banco. Em seis idas, uma prescrição concorrente apareceria
 * para metade da resposta e a escada piscaria entre dois estados.
 *
 * Os subselects NÃO repetem filtro por clínica — quem filtra é a policy.
 * Acrescentá-lo aqui mascararia uma policy quebrada (mesma decisão, com a
 * mesma justificativa, de `onboarding-queries.ts`).
 */
export async function obterFatosProntidao(
  ctx: TenantContext,
  patientId: string,
): Promise<FatosProntidao> {
  return withTenant(ctx, async (tx) => {
    const [linha] = await tx
      .select({
        temFichaClinica: sql<boolean>`EXISTS (
          SELECT 1 FROM ${patientClinicalProfile}
          WHERE ${patientClinicalProfile.patientId} = ${patientId}
        )`,
        temAnamnese: sql<boolean>`EXISTS (
          SELECT 1 FROM ${anamnese}
          WHERE ${anamnese.patientId} = ${patientId}
        )`,
        // Vigência aberta: protocolo desativado não tem marcos a pontuar.
        temProtocoloAtivo: sql<boolean>`EXISTS (
          SELECT 1 FROM ${patientProtocol}
          WHERE ${patientProtocol.patientId} = ${patientId}
            AND ${patientProtocol.desativadoEm} IS NULL
        )`,
        // Só 'ativa'. Rascunho não é alvo de resolução em `materializar.ts`,
        // e contá-lo destravaria o documentar sem destravar o dado.
        temMetaAtiva: sql<boolean>`EXISTS (
          SELECT 1 FROM ${goal}
          WHERE ${goal.patientId} = ${patientId}
            AND ${goal.estado} = 'ativa'
        )`,
        temInstrumentoAplicado: sql<boolean>`EXISTS (
          SELECT 1 FROM ${instrumentoAplicacao}
          WHERE ${instrumentoAplicacao.patientId} = ${patientId}
        )`,
        // Snapshot, não sessão: é ele que prova que a documentação virou dado
        // legível na evolução. Sessão consolidada sem snapshot é exatamente o
        // caso que esta feature existe para tornar impossível.
        temSessaoConsolidada: sql<boolean>`EXISTS (
          SELECT 1 FROM ${sessionSnapshot}
          WHERE ${sessionSnapshot.patientId} = ${patientId}
        )`,
      })
      .from(sql`(SELECT 1) AS uma_linha`);

    return {
      temFichaClinica: Boolean(linha?.temFichaClinica),
      temAnamnese: Boolean(linha?.temAnamnese),
      temProtocoloAtivo: Boolean(linha?.temProtocoloAtivo),
      temMetaAtiva: Boolean(linha?.temMetaAtiva),
      temInstrumentoAplicado: Boolean(linha?.temInstrumentoAplicado),
      temSessaoConsolidada: Boolean(linha?.temSessaoConsolidada),
    };
  });
}
```

`sessionSnapshot.patientId` existe e é `notNull` (`src/db/schema.ts:1494`).

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test:rls src/app/(app)/pacientes/[id]/prontidao.int.test.ts`
Expected: PASS, 5 testes coletados.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/prontidao-queries.ts" "src/app/(app)/pacientes/[id]/prontidao.int.test.ts"
git commit -m "feat(paciente): read readiness facts in a single RLS-scoped transaction"
```

---

### Task 4: `CartaoProntidao`

**Files:**

- Create: `src/components/app/cartao-prontidao.tsx`
- Test: `src/components/app/cartao-prontidao.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/components/app/cartao-prontidao.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartaoProntidao } from "./cartao-prontidao";
import { montarProntidao, type FatosProntidao } from "@/lib/patient/prontidao";

const NADA: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};
const TUDO: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: true,
  temMetaAtiva: true,
  temInstrumentoAplicado: true,
  temSessaoConsolidada: true,
};

function prontidao(fatos: FatosProntidao, role: string) {
  return montarProntidao({
    modalidade: "protocol_driven",
    fatos,
    role,
    patientId: "p1",
  });
}

describe("CartaoProntidao", () => {
  it("não renderiza nada quando o prontuário está pronto", () => {
    const { container } = render(
      <CartaoProntidao prontidao={prontidao(TUDO, "coordenador")} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("mostra UM gesto primário: o próximo degrau", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    const primarios = screen.getAllByTestId("gesto-primario");
    expect(primarios).toHaveLength(1);
    expect(primarios[0]?.getAttribute("href")).toBe(
      "/pacientes/p1/cadastro-clinico",
    );
  });

  it("sem botão morto: terapeuta vê quem resolve, não um link", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "terapeuta")} />);
    expect(screen.queryByTestId("gesto-primario")).toBeNull();
    expect(screen.queryByText(/aguardando coordenação/i)).not.toBeNull();
  });

  it("marca o degrau bloqueante de forma redundante ao texto, não só por cor", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    expect(screen.queryByText(/obrigatório/i)).not.toBeNull();
  });

  it("lista a escada inteira, incluindo os degraus já concluídos", () => {
    render(<CartaoProntidao prontidao={prontidao(NADA, "coordenador")} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText(/admissão/i)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/components/app/cartao-prontidao.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `src/components/app/cartao-prontidao.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Prontidao } from "@/lib/patient/prontidao";

/**
 * Cartão de Prontidão — a escada do prontuário, em três superfícies (topo do
 * prontuário, estado vazio da Evolução, bloqueio do passo Documentar).
 *
 * Um gesto primário e só um: os demais degraus pendentes são texto com link
 * secundário. Duas chamadas para ação com o mesmo peso é a carga cognitiva
 * que este redesenho existe para remover.
 */
export function CartaoProntidao({
  prontidao,
  titulo = "Para este prontuário gerar dados",
}: {
  prontidao: Prontidao;
  titulo?: string;
}) {
  // Nada a fazer não ocupa pixel.
  if (prontidao.proximo === null) return null;

  const { degraus, proximo, quemResolve } = prontidao;
  const concluidos = degraus.filter((d) => d.estado === "concluido").length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          {titulo}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {concluidos} de {degraus.length} concluídos.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {degraus.map((degrau) => (
          <li
            key={degrau.id}
            data-estado={degrau.estado}
            className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-brutal)]/40 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold text-[var(--text-primary)]">
                {degrau.rotulo}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                {degrau.descricao}
              </span>
            </div>
            {/* Cor NUNCA é o único portador do estado: cada degrau carrega o
                rótulo textual correspondente. */}
            <span className="font-mono text-xs font-semibold tracking-wide uppercase">
              {degrau.estado === "concluido"
                ? "Concluído"
                : degrau.estado === "bloqueante"
                  ? "Obrigatório"
                  : "Recomendado"}
            </span>
          </li>
        ))}
      </ul>

      {proximo.rota ? (
        <div>
          <Button asChild variante="primaria">
            <Link href={proximo.rota} data-testid="gesto-primario">
              {proximo.rotulo} &rarr;
            </Link>
          </Button>
        </div>
      ) : (
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          Aguardando {quemResolve ?? "a equipe responsável"}: {proximo.rotulo}.
        </p>
      )}
    </Card>
  );
}
```

`Button` aceita `asChild` (`src/components/ui/button.tsx:33`) e nesse modo ignora
`iconLeft`/`iconRight` — o ícone, se houver, vai dentro do `Link`.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/components/app/cartao-prontidao.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/cartao-prontidao.tsx src/components/app/cartao-prontidao.test.tsx
git commit -m "feat(ui): add patient readiness card with a single primary gesture"
```

---

### Task 5: Montar o cartão no topo do prontuário

**Files:**

- Modify: `src/app/(app)/pacientes/[id]/layout.tsx`
- Test: `src/app/(app)/pacientes/[id]/layout.test.tsx` (já existe)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `layout.test.tsx` um caso que afirme que o layout renderiza o
cartão quando `obterFatosProntidao` devolve fatos incompletos. Seguir o padrão
de mocks já usado no arquivo (`vi.mock` das queries que o layout importa) e
acrescentar:

```ts
vi.mock("./prontidao-queries", () => ({
  obterFatosProntidao: vi.fn(async () => ({
    temFichaClinica: false,
    temAnamnese: false,
    temProtocoloAtivo: false,
    temMetaAtiva: false,
    temInstrumentoAplicado: false,
    temSessaoConsolidada: false,
  })),
}));
```

```tsx
it("mostra a escada de prontidão no topo do prontuário", async () => {
  render(await PacienteLayout({ children: <div />, params: paramsFake }));
  expect(screen.queryByText(/para este prontuário gerar dados/i)).not.toBeNull();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/app/(app)/pacientes/[id]/layout.test.tsx`
Expected: FAIL — texto ausente.

- [ ] **Step 3: Implementar**

Em `layout.tsx`, acrescentar aos imports:

```ts
import { montarProntidao } from "@/lib/patient/prontidao";
import { obterFatosProntidao } from "./prontidao-queries";
import { CartaoProntidao } from "@/components/app/cartao-prontidao";
```

Acrescentar a leitura ao `Promise.all` já existente:

```ts
  const [situacao, dadosPaciente, fatos] = await Promise.all([
    obterSituacaoConta(ctx),
    withTenant(ctx, async (tx) => {
      /* ...bloco existente, inalterado... */
    }),
    // Falha aqui NÃO derruba o prontuário nem finge "pronto": vira `null`, e
    // o cartão simplesmente não renderiza. `catch` que devolvesse fatos
    // zerados marcaria tudo como pendente; `catch` que devolvesse fatos
    // completos destravaria o documentar. Ambos mentem — a ausência, não.
    obterFatosProntidao(ctx, id).catch((erro: unknown) => {
      console.warn(
        `[prontidao] falha ao ler fatos (patientId=${id}):`,
        erro instanceof Error ? erro.message : String(erro),
      );
      return null;
    }),
  ]);
```

E, logo depois do bloco de `TabsNav` e antes do `Alert` de somente-leitura:

```tsx
      {fatos ? (
        <CartaoProntidao
          prontidao={montarProntidao({
            modalidade: dadosPaciente?.clinicalModality,
            fatos,
            role: ctx.role,
            patientId: id,
          })}
        />
      ) : null}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/app/(app)/pacientes/[id]/layout.test.tsx`
Expected: PASS, incluindo os testes já existentes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/layout.tsx" "src/app/(app)/pacientes/[id]/layout.test.tsx"
git commit -m "feat(paciente): surface the readiness ladder at the top of the record"
```

---

### Task 6: Consertar o estado vazio da Evolução

Fecha D2. Hoje a tela diz "Agendar Primeira Sessão" — aponta para a ação que o
operador já podia fazer, não para a que falta.

**Files:**

- Modify: `src/app/(app)/pacientes/[id]/page.tsx` (bloco `!temSnapshots`)
- Test: `src/app/(app)/pacientes/[id]/evolucao-vazia.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/(app)/pacientes/[id]/evolucao-vazia.test.tsx` — extrair o bloco
vazio para um componente próprio e testá-lo isolado (a `page.tsx` é um RSC com
seis dependências de banco; testar o componente é o corte certo):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvolucaoVazia } from "./evolucao-vazia";
import { montarProntidao } from "@/lib/patient/prontidao";

const SEM_META = montarProntidao({
  modalidade: "protocol_driven",
  fatos: {
    temFichaClinica: true,
    temAnamnese: true,
    temProtocoloAtivo: true,
    temMetaAtiva: false,
    temInstrumentoAplicado: false,
    temSessaoConsolidada: false,
  },
  role: "coordenador",
  patientId: "p1",
});

describe("EvolucaoVazia", () => {
  it("não manda mais agendar sessão quando falta meta", () => {
    render(<EvolucaoVazia prontidao={SEM_META} />);
    expect(screen.queryByText(/agendar primeira sessão/i)).toBeNull();
  });

  it("aponta o degrau que realmente falta", () => {
    render(<EvolucaoVazia prontidao={SEM_META} />);
    expect(
      screen.getByTestId("gesto-primario").getAttribute("href"),
    ).toBe("/pacientes/p1/metas");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/app/(app)/pacientes/[id]/evolucao-vazia.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `src/app/(app)/pacientes/[id]/evolucao-vazia.tsx`:

```tsx
import type { Prontidao } from "@/lib/patient/prontidao";
import { CartaoProntidao } from "@/components/app/cartao-prontidao";

/**
 * Estado vazio da aba Evolução.
 *
 * Substitui o "Sem sessões registradas → Agendar Primeira Sessão" anterior,
 * que apontava para a ação que o operador JÁ podia fazer em vez da que
 * faltava. Agendar nunca foi o passo que estava travando o gráfico: sem meta
 * ativa, `materializar.ts` descarta a evidência e a sessão agendada produziria
 * outra tela vazia.
 */
export function EvolucaoVazia({ prontidao }: { prontidao: Prontidao }) {
  if (prontidao.proximo === null) {
    return (
      <div className="mx-auto my-8 max-w-2xl rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-12 text-center">
        <h2 className="mb-2 text-2xl font-black text-[var(--text-primary)]">
          Sem sessões registradas
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          O prontuário está pronto. Assim que a primeira sessão for documentada
          e consolidada, a evolução aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <CartaoProntidao
      prontidao={prontidao}
      titulo="A evolução ainda não pode ser calculada"
    />
  );
}
```

Em `page.tsx`, trocar o bloco `!temSnapshots ? (...) : (...)` pelo componente,
passando a prontidão montada (ler os fatos no mesmo `Promise.all` de `avisos`).

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/app/(app)/pacientes/[id]/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/evolucao-vazia.tsx" "src/app/(app)/pacientes/[id]/evolucao-vazia.test.tsx" "src/app/(app)/pacientes/[id]/page.tsx"
git commit -m "fix(paciente): empty evolution state points at the missing step, not at scheduling"
```

---

### Task 7: A régua — bloquear o passo "Documentar"

O ponto onde a jornada passa a ser obrigatória. Insere-se em `PassoEmFoco`, no
`case "documentar"` de `src/app/(app)/sessoes/[id]/page.tsx`.

**Files:**

- Modify: `src/app/(app)/sessoes/[id]/page.tsx`
- Modify: `src/app/(app)/sessoes/[id]/queries.ts` (`carregarSessao` passa a
  devolver `prontidao`)
- Test: `src/app/(app)/sessoes/[id]/bloqueio-documentar.int.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/(app)/sessoes/[id]/bloqueio-documentar.int.test.ts`, no mesmo
arranjo de `arquivamento.int.test.ts`:

```ts
describe("bloqueio do passo Documentar", () => {
  test("paciente sem protocolo e sem meta: podeDocumentar false", async () => {
    const dados = await carregarSessao(ctxTerapeuta, SESSAO_SEM_PREPARO, agora);
    expect(dados?.prontidao.podeDocumentar).toBe(false);
  });

  test("com protocolo vigente E meta ativa: podeDocumentar true", async () => {
    await inserirProtocolo(PAC, { desativado: false });
    await inserirMeta(PAC, "ativa");
    const dados = await carregarSessao(ctxTerapeuta, SESSAO_SEM_PREPARO, agora);
    expect(dados?.prontidao.podeDocumentar).toBe(true);
  });

  // Mutação: com só o protocolo, ainda tem de bloquear. Sem este caso, uma
  // implementação que checasse apenas o protocolo passaria os dois testes
  // acima.
  test("só protocolo, sem meta: continua bloqueado", async () => {
    await inserirProtocolo(PAC, { desativado: false });
    const dados = await carregarSessao(ctxTerapeuta, SESSAO_SEM_PREPARO, agora);
    expect(dados?.prontidao.podeDocumentar).toBe(false);
  });

  test("conventional nunca bloqueia", async () => {
    const dados = await carregarSessao(ctxTerapeuta, SESSAO_CONVENCIONAL, agora);
    expect(dados?.prontidao.podeDocumentar).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test:rls src/app/(app)/sessoes/[id]/bloqueio-documentar.int.test.ts`
Expected: FAIL — `prontidao` não existe no retorno. **Conferir 4 testes
coletados.**

- [ ] **Step 3: Implementar**

Em `src/app/(app)/sessoes/[id]/queries.ts`, dentro de `carregarSessao`,
acrescentar a leitura da prontidão do paciente da sessão e devolvê-la no objeto:

```ts
import { montarProntidao } from "@/lib/patient/prontidao";
import { obterFatosProntidao } from "../../pacientes/[id]/prontidao-queries";

// ...dentro de carregarSessao, depois de já ter patientId e clinicalModality:
const fatos = await obterFatosProntidao(ctx, patientId);
const prontidao = montarProntidao({
  modalidade: clinicalModality,
  fatos,
  role: ctx.role,
  patientId,
});
```

Sem `.catch` aqui, ao contrário do layout do prontuário: se a leitura falhar, a
sessão não pode assumir que está liberada para documentar. Fail-closed.

Em `page.tsx`, no `case "documentar"`:

```tsx
    case "documentar":
      // A régua morde aqui (D-A1): agendar é livre, documentar não. Sem
      // protocolo vigente e meta ativa, `materializar.ts` descarta a
      // evidência — o terapeuta gastaria a sessão inteira preenchendo um
      // formulário cujo resultado nunca chega à evolução.
      if (!dados.prontidao.podeDocumentar) {
        return (
          <CartaoProntidao
            prontidao={dados.prontidao}
            titulo="Esta sessão ainda não pode ser documentada"
          />
        );
      }
      return (
        <PassoDocumentar
          sessionId={sessionId}
          protocolos={dados.protocolos}
          protocolIdsPreSelecionados={dados.protocolIdsPreSelecionados}
          asrHabilitado={asrHabilitado()}
          temCaptura={dados.temCaptura}
          ehDono={dados.ehDono}
        />
      );
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test:rls src/app/(app)/sessoes/[id]/bloqueio-documentar.int.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Provar a mutação**

Aplicar um patch inverso temporário que troque `!dados.prontidao.podeDocumentar`
por `false` e rodar o mesmo arquivo. **Não usar `git checkout` para reverter** —
o HEAD apagaria o código novo; reverter com o patch inverso.

Expected: vermelho. Se continuar verde, o teste não está exercitando a guarda.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/sessoes/[id]/page.tsx" "src/app/(app)/sessoes/[id]/queries.ts" "src/app/(app)/sessoes/[id]/bloqueio-documentar.int.test.ts"
git commit -m "feat(sessao): block the documenting step until the record can produce data"
```

---

### Task 8: Estado de prontidão na lista `/pacientes`

**Files:**

- Modify: `src/app/(app)/pacientes/queries.ts`
- Modify: `src/app/(app)/pacientes/lista-pacientes.tsx`
- Test: `src/app/(app)/pacientes/lista-pacientes.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/(app)/pacientes/lista-pacientes.test.tsx`. O shape é
`PacienteListItem` (`./queries.ts`) estendido com `proximoPasso`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListaPacientes } from "./lista-pacientes";
import type { PacienteListItem } from "./queries";

const BASE: PacienteListItem = {
  id: "p1",
  nome: "Ana",
  nascimento: null,
  responsavelContato: null,
  escola: null,
  convenio: null,
  criadoEm: new Date("2026-01-01"),
  arquivadoEm: null,
  temPrescricao: true,
  proximoPasso: null,
};

describe("ListaPacientes — estado de prontidão", () => {
  it("mostra o próximo passo do paciente que ainda não gera dados", () => {
    render(
      <ListaPacientes
        pacientes={[{ ...BASE, proximoPasso: "Ativar ao menos uma meta" }]}
      />,
    );
    expect(screen.queryByText(/ativar ao menos uma meta/i)).not.toBeNull();
  });

  it("não polui a linha do paciente que já está pronto", () => {
    render(<ListaPacientes pacientes={[BASE]} />);
    expect(screen.queryByTestId("pill-prontidao")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/app/(app)/pacientes/lista-pacientes.test.tsx`
Expected: FAIL — `proximoPasso` não existe em `PacienteListItem`.

- [ ] **Step 3: Implementar a leitura**

Em `src/app/(app)/pacientes/queries.ts`, acrescentar a `PacienteListItem`:

```ts
  /**
   * Rótulo do próximo degrau da escada de prontidão, ou `null` quando o
   * prontuário já está pronto. Derivado na leitura, como `temPrescricao` —
   * pelo mesmo motivo: flag persistida passa a mentir assim que alguém
   * descontinua a última meta por outro caminho.
   */
  proximoPasso: string | null;
```

No `select`, acrescentar a modalidade e os quatro `EXISTS` correlacionados. Um
`EXISTS` por fato, **nunca** uma chamada de `obterFatosProntidao` por linha:
a lista de uma clínica com 80 pacientes viraria 80 transações.

```ts
        clinicalModality: schema.patient.clinicalModality,
        temFichaClinica: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.patientClinicalProfile)
            .where(
              eq(schema.patientClinicalProfile.patientId, schema.patient.id),
            ),
        ).mapWith(Boolean),
        temAnamnese: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.anamnese)
            .where(eq(schema.anamnese.patientId, schema.patient.id)),
        ).mapWith(Boolean),
        temProtocoloAtivo: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.patientProtocol)
            .where(
              and(
                eq(schema.patientProtocol.patientId, schema.patient.id),
                isNull(schema.patientProtocol.desativadoEm),
              ),
            ),
        ).mapWith(Boolean),
        temMetaAtiva: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.goal)
            .where(
              and(
                eq(schema.goal.patientId, schema.patient.id),
                eq(schema.goal.estado, "ativa"),
              ),
            ),
        ).mapWith(Boolean),
        temInstrumentoAplicado: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.instrumentoAplicacao)
            .where(
              eq(schema.instrumentoAplicacao.patientId, schema.patient.id),
            ),
        ).mapWith(Boolean),
        temSessaoConsolidada: exists(
          tx
            .select({ um: sql`1` })
            .from(schema.sessionSnapshot)
            .where(eq(schema.sessionSnapshot.patientId, schema.patient.id)),
        ).mapWith(Boolean),
```

E mapear as linhas depois do `withTenant`, fora da transação (é cálculo puro):

```ts
  return linhas.map(({ clinicalModality, ...resto }) => {
    const prontidao = montarProntidao({
      modalidade: clinicalModality,
      fatos: {
        temFichaClinica: resto.temFichaClinica,
        temAnamnese: resto.temAnamnese,
        temProtocoloAtivo: resto.temProtocoloAtivo,
        temMetaAtiva: resto.temMetaAtiva,
        temInstrumentoAplicado: resto.temInstrumentoAplicado,
        temSessaoConsolidada: resto.temSessaoConsolidada,
      },
      role: ctx.role,
      patientId: resto.id,
    });
    return { ...resto, proximoPasso: prontidao.proximo?.rotulo ?? null };
  });
```

- [ ] **Step 4: Implementar o selo**

Em `lista-pacientes.tsx`, logo depois do selo `Sem prescrição` (mesmo cluster de
selos, mesma linha do nome):

```tsx
                  {p.proximoPasso ? (
                    <span
                      data-testid="pill-prontidao"
                      className="rounded-[var(--radius-pill)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--status-warning-fg)] uppercase"
                    >
                      {p.proximoPasso}
                    </span>
                  ) : null}
```

O texto carrega o estado; a cor só reforça — mesma regra já aplicada ao selo
`Sem prescrição` logo acima.

- [ ] **Step 5: Rodar e confirmar verde**

Run: `pnpm test src/app/(app)/pacientes/lista-pacientes.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/pacientes/queries.ts" "src/app/(app)/pacientes/lista-pacientes.tsx" "src/app/(app)/pacientes/lista-pacientes.test.tsx"
git commit -m "feat(pacientes): show per-patient readiness state in the list"
```

---

### Task 9: 5º passo do onboarding

Fecha D3. Hoje `PASSOS_ONBOARDING` termina em `paciente EXISTS` — celebra o
passo 1 e some onde a jornada endurece.

**Files:**

- Modify: `src/lib/onboarding/passos.ts`
- Modify: `src/app/(app)/onboarding-queries.ts`
- Test: `src/app/(app)/checklist-onboarding.test.tsx` (já existe)

- [ ] **Step 1: Escrever o teste que falha**

Em `checklist-onboarding.test.tsx`, estender `ZERADO` e `TUDO` com
`primeiroPacientePronto` e acrescentar:

```tsx
it("lista o quinto passo: deixar o primeiro paciente pronto", () => {
  render(<ChecklistOnboarding progresso={ZERADO} clinicId={CLINIC} />);
  expect(
    screen
      .getByRole("link", { name: /pronto para atender/i })
      .getAttribute("href"),
  ).toBe("/pacientes");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test src/app/(app)/checklist-onboarding.test.tsx`
Expected: FAIL — link ausente.

- [ ] **Step 3: Implementar**

Em `src/lib/onboarding/passos.ts`, estender `PassoId` com
`"primeiroPacientePronto"` e acrescentar ao array:

```ts
  {
    id: "primeiroPacientePronto",
    titulo: "Deixe o primeiro paciente pronto para atender",
    descricao:
      "Protocolo prescrito e meta ativa. Sem os dois, a sessão é documentada mas a evolução continua vazia.",
    rota: "/pacientes",
  },
```

Em `onboarding-queries.ts`, acrescentar ao mesmo `select` (mesma transação, para
os cinco verem a mesma imagem do banco):

```ts
        // Um paciente QUALQUER da clínica com protocolo vigente e meta ativa.
        // Derivado, como os outros quatro: a meta descontinuada devolve o
        // passo a pendente no mesmo instante.
        primeiroPacientePronto: sql<boolean>`EXISTS (
          SELECT 1 FROM ${patient} p
          WHERE EXISTS (
              SELECT 1 FROM ${patientProtocol} pp
              WHERE pp.patient_id = p.id AND pp.desativado_em IS NULL
            )
            AND EXISTS (
              SELECT 1 FROM ${goal} g
              WHERE g.patient_id = p.id AND g.estado = 'ativa'
            )
        )`,
```

E no retorno: `primeiroPacientePronto: Boolean(linha?.primeiroPacientePronto)`.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm test src/app/(app)/checklist-onboarding.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/passos.ts "src/app/(app)/onboarding-queries.ts" "src/app/(app)/checklist-onboarding.test.tsx"
git commit -m "feat(onboarding): add fifth step covering the gap up to a usable record"
```

---

### Task 10: Verificação final

- [ ] **Step 1: Suíte completa**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls
```

Expected: tudo verde. **Conferir a contagem de `test:rls`** — a memória
`suite-rls-rodando-como-superusuario` registra 64 de 68 pulados passando como
verde. "Skipped" em massa é vermelho disfarçado.

- [ ] **Step 2: Formatar só o que foi tocado**

```bash
pnpm prettier --write "src/lib/patient/**" "src/components/app/cartao-prontidao*" "src/app/(app)/pacientes/**" "src/app/(app)/sessoes/[id]/**" "src/app/(app)/onboarding-queries.ts" "src/lib/onboarding/passos.ts"
```

- [ ] **Step 3: Commit final se houver diff de formatação**

```bash
git add -A && git commit -m "style: format touched files"
```
