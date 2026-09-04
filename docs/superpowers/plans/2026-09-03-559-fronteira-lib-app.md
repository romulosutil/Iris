# #559 · `A-02` — regra de negócio em `logic.ts` e rotas importando rotas

> Achado `A-02` da auditoria 360. **P3 · estrutural · esforço L.**
> Atomizado em 03/09/2026. Fronteira: onde um revisor rejeitaria uma fatia e aprovaria a vizinha.

## A decisão que governa a atomização

A própria recomendação da auditoria diz qual é o primeiro passo, e ele **não é** o refactor:

> "Regra de lint `no-restricted-imports` proibindo `@/app/**` a partir de `lib/` e `components/ui` — essa regra é o degrau barato e **para a sangria** antes do refactor grande."

Refactor de 15.249 linhas sem guard reintroduz o padrão pela porta dos fundos enquanto está em curso. Então: **guard primeiro, migração depois, uma fatia por PR.**

Vale o precedente da casa: quando o escopo não fecha em zero de imediato, a forma é **baseline que só pode cair** (`scripts/lint/ds-paleta-crua.baseline.json` + o teste que reprova se subir). Foi assim que o `(admin)` entrou no `ESCOPO_DS` na #566 sem virar CI vermelho.

## Fatias

```
F1 (guard)  ──>  F2 ──> F3 ──> F4   (migrações, uma PR cada, ordem por risco crescente)
            └──>  F5                (ciclo lib⇄lib, independente das rotas)
```

### F1 · Guard de fronteira — PR 1, e a única indispensável

- **O quê**: `no-restricted-imports` proibindo `@/app/**` a partir de `src/lib/**` e `src/components/ui/**`. Mais o caso simétrico já apontado: `src/lib/billing/rotulos-*` importando `@/app/(app)/assinatura/queries` é **lib dependendo de app** — a inversão mais grave da lista.
- **Forma**: se a varredura não fechar em zero, baseline decrescente. **Medir antes de escolher**: `grep -rn 'from "@/app/(app)/' src/lib src/components` dá o número.
- **Pronto quando**: import novo de `@/app/**` em `lib/` ou `components/ui/` reprova o lint; a contagem atual está congelada e só pode cair.
- **Prova de mutação**: acrescentar um import proibido num arquivo de `lib/` deixa o lint **vermelho**. Reverter com patch inverso.
- **Por que sozinha numa PR**: ela é útil mesmo que nenhuma outra fatia aconteça. As demais só são seguras depois dela.

### F2 · `prontidao-queries.ts` → `src/lib/patient/`

- **O quê**: mover a query de fatos de prontidão para `src/lib/patient/`, junto do núcleo puro `prontidao.ts` que já mora lá.
- **Por que primeiro entre as migrações**: é o exemplar **mais novo** do padrão (entrou com a #557), tem 3 consumidores em 3 rotas, e é a sugestão R-6 do memo de admissão — ou seja, já ratificada. Menor superfície, maior clareza de destino.
- **Pronto quando**: nenhum import rota→rota para `prontidao-queries`; comportamento idêntico; testes existentes verdes sem alteração de asserção.
- **Risco a vigiar**: `"use client"` é do **módulo** e propaga por importação — mover um módulo entre pastas pode mudar quem é client e quem é server. Conferir cada consumidor.

### F3 · Cadeia da agenda

- **O quê**: `clinica/feriados`, `equipe/[id]` e `pacientes/[id]/ausencias` deixam de importar `agenda/bloqueio-*` e `agenda/horas-queries`; o que eles usam vira módulo de `src/lib`.
- **Onde dói**: `agenda/queries.ts` tem 1.185 linhas.
- **Pronto quando**: os três consumidores importam de `lib/`; `agenda/queries.ts` encolhe pelo que saiu.

### F4 · `diario/[sessionId]/logic.ts` (entregue)

- **O quê**: 1.114 linhas, 8 ações + ASR + extração + risco. Promover a módulo de `src/lib/sessao/`, com actions finas na rota. Inclui `diario` ← `pacientes/[id]/tcc/deteccao-risco`.
- **Por que por último**: é o arquivo com mais regra clínica e mais int-tests apontados para ele. Fatia mais cara e mais arriscada.
- **Pronto quando**: a rota só orquestra; a regra é testável sem montar a rota.
- **Fronteira dura**: nesta fatia é proibido mudar comportamento. Refactor e correção de defeito não viajam na mesma PR.

**Medido em 04/09/2026, ao fechar a fatia.** O arquivo já estava em **1.201 linhas** (o plano media 1.114; a #560/F4 e a #558 mexeram nele desde então). A `actions.ts` da rota já era fina — resolve `ctx`, traduz `RoleError`/`ProntuarioIncompletoError` e revalida caminho —, então a fatia foi de fato só tirar o núcleo de dentro da pasta da rota.

Destino, por coesão, e não um módulo de 1.201 linhas em `src/lib` (o tamanho **é** o achado):

| Novo módulo                             | O que levou                                                                |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/sessao/diario-comum.ts`        | `mensagemDeConsentimento` + a nota do guard de escrita (`comEscrita`)      |
| `src/lib/sessao/diario-captura.ts`      | captura rápida, escopo de protocolo, áudio local                           |
| `src/lib/sessao/diario-asr.ts`          | envio do lote, estado dos clipes, lote mais recente, aceite da transcrição |
| `src/lib/sessao/diario-consolidacao.ts` | nota final, número sequencial, extração e as Fases D/E/F de risco          |
| `src/lib/risco/deteccao-risco.ts`       | `detectarSinaisDeRiscoRPD`, que vinha de `pacientes/[id]/tcc/`             |

- **`deteccao-risco` tinha de sair junto**, não por elegância: com a consolidação em `src/lib`, o import de `@/app/(app)/pacientes/[id]/tcc/` viraria uma violação NOVA do guard `fronteira/sem-import-de-app` da F1 — o baseline não teria como absorvê-la, porque ele só pode cair. A função é pura, sem import nenhum, e tem três consumidores em dois contextos.
- **Prova de que nada mudou de comportamento**: script que recorta o `logic.ts` de `HEAD` nas faixas de linha movidas e confere que **cada linha** reaparece nos módulos novos — zero ausências. As únicas exclusões deliberadas são duas linhas mortas: o `type Tx` importado e nunca usado, e o `export { POLLING_INTERVALO_MS, POLLING_TETO_MS }` reexportado de `@/lib/asr/polling` sem nenhum consumidor (`ditado-voz.tsx` sempre importou do módulo neutro, que é o certo — o `logic.ts` era `server-only`).
- **Testes**: `logic.asr-lote.test.ts` acompanhou o módulo (`src/lib/sessao/diario-asr.test.ts`), como a F3 fez com `horas-queries.int.test.ts`. Os dois int-tests grandes (`actions.int.test.ts`, 66 KB, e `gate-documentar.int.test.ts`) **ficaram na rota**: exercitam o par action+núcleo, e movê-los inflaria o diff sem provar nada a mais — só o especificador de import mudou. `db/tests/{profissional-responsavel,sessao-detalhe}.int.test.ts` também importavam o `logic.ts` por caminho relativo e foram atualizados (varrer só `src/` teria deixado os dois quebrados no CI).
- **Verificado**: typecheck 0, lint 0, unit 3160/3160, int 77/77 com banco real (nenhum `skipped`).
- **Ordem**: entrou depois da #560/F4 (PR #615), como o plano exigia — a assinatura de log dos mesmos arquivos mudou lá.

### F5 · Ciclo `lib/email ⇄ lib/billing`

- **O quê**: quebrar o ciclo entre `lib/email/templates.ts:5` e `lib/billing/notificacao-cancelamento.ts:6-7`.
- **Independente** das fatias de rota — pode ir em paralelo com F2/F3.

## Fora de escopo

| Item                                                                  | Razão                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Reescrever `consentimento/logic` ← `pacientes/novo/logic`             | Cabe numa fatia futura; não está entre os arquivos que racham primeiro.    |
| Unificar convenção de nome (`logic.ts` × `queries.ts` × `actions.ts`) | Renomeação em massa esconde mudança real no diff. Issue própria, se valer. |

## Riscos herdados

- **Merge sem conflito que apaga feature**: mover arquivo enquanto outra branch o edita resolve "a favor" de um lado sem o git reclamar. Rebasear antes de cada fatia e conferir o que **sumiu**, não só o que conflitou.
- **`use client` deslocado** (ver F2).
- **Colisão com #560**: as duas issues tocam os mesmos `logic.ts`. **#560 vai primeiro** — ela muda a assinatura de log nos mesmos arquivos que F4 move, e inverter obriga a reescrever duas vezes.
