# Modalidades clínicas e abordagens terapêuticas — decisão de arquitetura

> Status: **proposta pendente de validação com o Rômulo**.
> Escopo: fecha as lacunas deixadas abertas pelas issues #98 (Terapia
> Convencional) e #99 (TCC), ambas fechadas em 16/08/2026 pelos PRs #305 e
> #306 sem que a feature ficasse alcançável em produção.
> Contexto lido: `docs/agente/protocolo-tcc.md`,
> `docs/agente/protocolo-terapia-convencional.md`, `BACKLOG.md` (decisão de
> 29/07/2026, linhas 3162-3259), `src/db/schema.ts`, `src/lib/extraction/`,
> `src/app/(app)/pacientes/`.

---

## 1. O problema medido

Auditoria de código de 18/08/2026 encontrou a fatia TCC/convencional
**construída e 100% inacessível**:

1. `src/app/(app)/pacientes/novo/logic.ts:149-153` lê
   `formData.get("clinicalModality")`, mas `novo-paciente-form.tsx` não
   renderiza nenhum controle com esse `name`. O ternário cai sempre no
   fallback `"protocol_driven"`.
2. Não existe rota de UPDATE de `clinical_modality` — nem em
   `cadastro-clinico/`, nem em action alguma. O
   `GRANT UPDATE (clinical_modality) ON patient` da `0096:3` nunca é
   exercido.
3. Logo: **todo paciente em produção é `protocol_driven`**. A aba TCC
   (`layout.tsx:79`) nunca aparece, e `CONVENTIONAL_SYSTEM_PROMPT`
   (`prompt.ts:5-38`) é inalcançável pelo produto.

Isto repete o padrão da memória `merge-sem-conflito-apaga-feature-mergeada`:
CI verde, testes verdes (`layout.test.tsx:44,51,76` cobre os dois ramos com
a modalidade mockada), issue fechada pelo diff — e a funcionalidade morta.

**Corolário de processo:** um teste que mocka o campo que a UI nunca grava
prova o gating, não a feature. A Definição de Pronto de #98/#99 não exigiu
nenhum caminho de escrita do campo. Ver `AGENTS.md` §5.2, ponto "dono do
dado".

---

## 2. Erro de modelagem: TCC não é sub-caso de "convencional"

`src/app/(app)/pacientes/[id]/layout.tsx:53-83` deriva a navegação de um
booleano `eConvencional`:

- `PEI & Metas` aparece quando **não** convencional;
- `TCC` aparece quando **é** convencional.

Isso contradiz a decisão registrada no `BACKLOG.md:3173-3174` (29/07/2026):
**TCC-sem-protocolo sai do nicho convencional** — falha em 2 dos 3 critérios
que definem o nicho. O nicho convencional foi definido como as 3 famílias
nomeadas em `protocolo-terapia-convencional.md` §1: psicodinâmica,
humanista-existencial, sistêmica.

TCC é o oposto de "convencional" no sentido daquele documento: é
**estruturada, manualizada, com instrumento formal e tarefa entre sessões**.
Modelá-la como ausência de protocolo é o mesmo erro de categoria que o
catálogo TEA quase cometeu ao tentar encaixar as Barreiras do VB-MAPP no
molde "evidência por domínio" (achado 1.1 de `protocolos-e-agente.md`).

Consequências práticas do modelo binário atual, todas hoje impossíveis:

- paciente TCC com protocolo ativo — e PHQ-9/GAD-7 **são**
  `protocolos_ativos[]`, conforme `protocolo-tcc.md` §2.5;
- paciente psicodinâmico sem nenhum RPD (hoje ganha a aba TCC à força);
- clínica que atende TEA e TCC e precisa distinguir os dois na navegação.

---

## 3. Decisão D-A: três eixos ortogonais, não um booleano

O produto tem **três perguntas independentes** hoje colapsadas numa coluna.

| Eixo                     | Pergunta                                      | Onde vive                                  | Cardinalidade  |
| ------------------------ | --------------------------------------------- | ------------------------------------------ | -------------- |
| **Modelo de registro**   | Que forma tem a ficha clínica deste paciente? | `patient.clinical_modality` (enum)         | 1 por paciente |
| **Protocolos ativos**    | Que instrumentos formais este paciente usa?   | contrato `protocolos_ativos[]` (já existe) | 0..N           |
| **Família de abordagem** | Sob qual escola o terapeuta conduz?           | `patient.familia_abordagem` (enum) [#331]  | 0..1           |

Só o primeiro eixo governa **navegação e prompt do agente**. Os outros dois
são conteúdo.

### 3.1 `clinical_modality` passa a ter três valores

```
protocol_driven      — ABA/TEA: domínios, marcos, evidência por sessão
cognitive_behavioral — TCC: RPD, escalas intervalares, tarefa de casa   [NOVO]
conventional         — psicodinâmica / humanista-existencial / transpessoal-integrativa
```

Semântica: **"qual é o modelo de registro clínico"**, não "qual é a escola".

Roteamento derivado — um único mapeamento, sem segunda fonte de verdade:

| `clinical_modality`    | abas             | `modo` do agente (`context-loader.ts:142-145`) | system prompt                  |
| ---------------------- | ---------------- | ---------------------------------------------- | ------------------------------ |
| `protocol_driven`      | PEI & Metas      | `protocolo` (default)                          | `SYSTEM_PROMPT`                |
| `cognitive_behavioral` | TCC              | `tcc` **[novo]**                               | `TCC_SYSTEM_PROMPT` **[novo]** |
| `conventional`         | Temas **[novo]** | `terapia_convencional`                         | `CONVENTIONAL_SYSTEM_PROMPT`   |

`claude-provider.ts:62-66` deixa de ser ternário e vira `switch` exaustivo
sobre `modo`, com `default` que **lança**, não que cai em ABA em silêncio.
Um `default` permissivo aqui produziria extração ABA para paciente TCC sem
nenhum sinal de erro — o mesmo tipo de falha silenciosa da memória
`carga-nao-cobre-import-dinamico`.

### 3.2 Restrição de migração — `ALTER TYPE ... ADD VALUE`

`ALTER TYPE clinical_modality ADD VALUE 'cognitive_behavioral'` precisa sair
**sozinha**, em migração própria, e **nenhuma DDL da mesma leva de
`pnpm db:migrate` pode usar o literal novo** (default, CHECK, policy, seed).

Motivo: memória `enum-novo-e-check-numa-migracao` — dividir em dois arquivos
`.sql` **não** separa a transação, porque o Drizzle agrupa as migrações
pendentes; e o Postgres proíbe usar um valor de enum na mesma transação em
que ele foi adicionado.

Regra operacional: o literal novo só pode ser consumido por **código de
aplicação**, nunca por DDL da mesma execução. O `default` da coluna
permanece `protocol_driven`, então nada quebra. Se uma DDL futura precisar do
literal, ela entra numa leva **posterior**, depois que a primeira já foi
aplicada no banco.

Verificação exigida (regra 3 de `CLAUDE.md` — medir, não ler): após
`pnpm db:migrate`, conferir em `pg_enum` que os três valores existem. `git
log` não prova execução.

### 3.3 `familia_abordagem` — implementado (#331)

Campo simples em `patient` (nullable, enum `psicodinamica |
humanista_existencial | transpessoal_integrativa`), obrigatório só no
cadastro novo com `clinical_modality = 'conventional'`. Não governa
navegação nem prompt — R9-TC exige que o agente seja school-agnostic, então
a família é contexto para o terapeuta ler, não eixo de ramificação.
Migração `0126_patient_familia_abordagem.sql`; consumido em
`context-assembler.ts`/`context-loader.ts` e exposto no cadastro
(`novo-paciente-form.tsx`). Detalhes em `protocolo-terapia-convencional.md`
§2.2.

---

## 4. Decisão D-B: o campo precisa de três caminhos, não de um

Um enum sem caminho de escrita é código morto. A feature só está pronta com
os três:

1. **Criação** — `novo-paciente-form.tsx` ganha o controle
   `name="clinicalModality"`. O parser (`novo/logic.ts:149-153`) e a escrita
   (`:192`) já existem.
2. **Edição** — action de UPDATE em `cadastro-clinico/`. O
   `GRANT UPDATE (clinical_modality)` já existe (`0096:3`), então não há
   migração de grant. Mudança de modalidade é decisão clínica: escrita via
   `SECURITY DEFINER` copiando o predicado **exato** da policy de leitura
   correspondente (regra 5 de `CLAUDE.md`), e registro em `audit_log`.
3. **Guard de rota** — `/pacientes/[id]/tcc/page.tsx` hoje **não valida a
   modalidade** e responde por URL direta a paciente `protocol_driven`. O
   gating de `layout.tsx:79` é só de navegação. Espelhar a checagem e
   `notFound()`.

### 4.1 UX de seleção

- Controle: **radio group**, não `<select>` — três opções, decisão clínica
  de peso, e o Espectro Brutal privilegia opção visível a menu escondido.
- Rótulos em linguagem de terapeuta, não de banco:
  - "Protocolo estruturado (ABA / TEA)"
  - "Terapia Cognitivo-Comportamental (TCC)"
  - "Terapia convencional (psicodinâmica, humanista, sistêmica)"
- Cada opção com uma linha de subtítulo dizendo **o que muda na ficha** — é
  isso que o terapeuta precisa decidir, não a taxonomia.
- **Obrigatório no cadastro, sem pré-seleção.** Um default silencioso é
  exatamente o que produziu a falha atual. Se o campo não vier,
  `novo/logic.ts` deve **rejeitar**, não cair em `protocol_driven`.
- Mudar a modalidade depois **não apaga** dado do modelo anterior; a ficha
  antiga fica visível em leitura. Nenhuma ação de produto destrói registro
  clínico.

### 4.2 O modo convencional precisa de uma tela própria

Hoje "convencional" é definido por **ausência** (esconde PEI & Metas) e não
tem superfície própria. `CONVENTIONAL_SYSTEM_PROMPT` promete uma saída
(`resumo_sessao` + `temas[]`, §3 do protocolo) que nenhuma tela mostra e
que — pior — nenhum schema valida (ver §5). A aba "Temas" é pré-requisito
para o nicho existir de fato, não enfeite.

---

## 5. Decisão D-C: `output-schema.json` valida o contrato errado

`docs/agente/output-schema.json` tem
`extracoes.items.tipo.enum = ["evidencia", "registro_abc",
"ausencia_comportamento", "cadeia", "preferencia_reforcador"]` — 100% ABA.

O mesmo `agentOutputSchema` é aplicado à saída do modo convencional em
`claude-provider.ts:73`. Ou seja: **o prompt pede uma coisa e o validador
exige outra.** Hoje isso não estourou em produção só porque o modo
convencional é inalcançável (§1). No dia em que o seletor for ligado, estoura.

Mesmo formato de defeito da memória `pipe-que-le-o-recurso-errado`: um
contrato lido de um recurso que não o tem.

Extensões necessárias — o desenho já está em `protocolo-tcc.md` §2.5/§3 e em
`protocolo-terapia-convencional.md` §3:

- `tipo`: + `registro_pensamento`, `aplicacao_escala_relatada`, `tarefa_casa`
- objeto `registro_pensamento`, com os ajustes da §6 abaixo
- objeto `aplicacao_escala_relatada` com
  `item_risco_positivo: boolean | null` — `null` = **recusou responder**,
  que clinicamente não é igual a "respondeu 0". Nunca defaultar para `false`.
- contrato do modo convencional: `resumo_sessao` + `temas[]`, sem
  `extracoes[]` / `dominio_id`
- `sinalizacoes[].tipo`: + `risco_seguranca` (§7)

O Zod espelho e o enum PG `extraction_subtipo` (`schema.ts:113-121`) mudam
junto — e o enum PG cai na mesma restrição de `ADD VALUE` da §3.2.

**Ordem obrigatória: schema antes de prompt.** Um prompt que promete campo
que o validador rejeita transforma toda extração em erro de parse.

---

## 6. Decisão D-D: o RPD segue o formato de Padesky, não o de Burns

Desenho detalhado em
[`docs/agente/rpd-desenho-de-formulario.md`](../agente/rpd-desenho-de-formulario.md).

Resumo: **distorção cognitiva vira opcional** e as **colunas de evidência a
favor / contra viram o núcleo do registro**. Não é concessão de usabilidade —
é a escolha entre duas variantes canônicas do Registro de Pensamentos, e a
variante de Padesky (sem coluna de distorção, com duas colunas de evidência)
é a que ensina o paciente a reestruturar.

---

## 7. Regra de Alerta de Risco: o motor existe, as superfícies de TCC não

### 7.1 Duas afirmações de `protocolo-tcc.md` §4 estão desatualizadas

Auditoria de 18/08/2026. Corrigir o documento de protocolo:

1. **"Duty to warn permanece explicitamente não decidido"** — **falso hoje.**
   Foi **fechado** pelo parecer Thiago Lyra (#110), Opção B, e está
   registrado em `regra-alerta-risco.md` §5 (l.332-408): o Iris **nunca**
   notifica família, SAMU, polícia ou Conselho Tutelar. Notificação externa
   é **descartada, não adiada** (§5.3). Único eixo que muda comportamento é
   **idade + violência sofrida**, que altera apenas a copy, citando ECA
   art. 13 e Lei 13.431/2017 (§5.2). Confere com a memória
   `alerta-risco-nunca-notifica-externo`.
2. **"Nenhuma implementação real deveria avançar antes dessa validação"** —
   **superado.** A implementação já aconteceu em #122 (fechada): migração
   `0049_alerta_risco_clinico.sql`, tabela `alerta_risco_clinico`
   (`schema.ts:1595-1690`), `src/lib/risco/`, fila `/alertas-risco`,
   escalonamento em 2 estágios com e-mail ao responsável técnico via
   `scripts/escalonamento-risco.mjs`.

Nomenclatura travada em `regra-alerta-risco.md` §4.1: os temporizadores são
**"prazos de notificação e escalonamento interno do software"**, nunca "SLA
de atendimento", com a declaração obrigatória na UI ao lado de todo
temporizador. Prazos: 15 min / 1 h / 4 h por severidade.

### 7.2 O que de fato falta para TCC

O motor não é o bloqueador. O bloqueador é que **TCC não tem como alimentá-lo**:

| #   | Lacuna                                                                                                                                                                                                                                                                                                                    | Onde                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| L1  | **Único gatilho é a consolidação do diário.** `registrarAlertaRisco` tem exatamente 1 chamador. Um RPD ou uma resposta de instrumento não conseguem criar alerta por construção.                                                                                                                                          | `diario/[sessionId]/logic.ts:475-491`                             |
| L2  | **`sessionId` é NOT NULL** pelo CHECK `alerta_risco_vinculo`. Um RPD ou instrumento preenchido fora de sessão consolidada **não tem onde ancorar** — exige coluna de origem nova, logo migração.                                                                                                                          | `schema.ts:1673`                                                  |
| L3  | **Não existe caminho determinístico não-LLM.** `app_criar_alerta_risco` (`0049:239`) já é o ponto de entrada certo e é chamável por `app_role`, mas hoje categoria e severidade só chegam do JSON do agente. Item 9 do PHQ-9 positivo tem que mapear **direto** para `categoria='ideacao_suicida'` sem passar por LLM.    | `src/lib/risco/registrar.ts:20`                                   |
| L4  | **O `SYSTEM_PROMPT` padrão não tem regra de risco.** R5-TC existe **só** em `CONVENTIONAL_SYSTEM_PROMPT` (`prompt.ts:31-34`). Os dois modos compartilham o mesmo tool schema, então no modo padrão o campo `alerta_risco` existe e nada instrui o modelo a preenchê-lo. Um `TCC_SYSTEM_PROMPT` novo herdaria esse buraco. | `prompt.ts:41+`                                                   |
| L5  | **`output-schema.json` não conhece risco.** `sinalizacoes[].tipo` lista só `inconsistencia_historico`, `possivel_erro_transcricao`, `texto_ambiguo` — sem `risco_seguranca`, que o **código já usa** em `levantarRiscoDeSinalizacoes`. Quem tomar o doc como contrato reintroduz o falso negativo.                        | `output-schema.json:147-163` vs. `agent-output-schema.ts:186-211` |
| L6  | **Não existe superfície de instrumento formal.** "PHQ-9" aparece só em `.md`; zero ocorrências em `src/**` e `db/migrations/**`. Sem tabela de resposta a escala, não há item 9 para disparar nada.                                                                                                                       | —                                                                 |

L5 é o mesmo defeito da memória `discriminador-cego-no-trilho-headless`: o
alarme cala no caminho principal porque o contrato consultado não descreve o
campo que o código emite.

### 7.3 Princípio a preservar

`regra-alerta-risco.md` §1.4: ambiguidade **nunca** suprime alerta — rebaixa
só a `certeza`. Empate de severidade resolve sempre pelo **mais grave**
(§1.3). Isso vale igualmente para o caminho determinístico de instrumento:
item de risco **recusado** (`item_risco_positivo: null`, §5 acima) é sinal,
não ausência de sinal.

---

## 8. O que fica fora e por quê

| Item                                                         | Decisão                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PHQ-9 / GAD-7 com texto dos itens em PT-BR                   | **Travado** até fonte primária: licenciamento formal da Pfizer + adaptação transcultural validada em amostra brasileira. `protocolo-tcc.md` §7.1 lista os 3 pendentes. A estrutura (9/7 itens, 0-3, totais, cortes) já está confirmada e pode ser modelada; o **texto** não pode ser inventado. |
| Conceituação cognitiva, agenda de sessão, escala de crença % | Fora desta rodada. Registrar em `BACKLOG.md`.                                                                                                                                                                                                                                                   |
| Lembrete de reaplicação de escala intervalar                 | `protocolo-tcc.md` §6 achado #4 e §7.4: bloqueante para a coordenação, mas depende de as escalas existirem primeiro.                                                                                                                                                                            |
| Portabilidade de histórico na troca de terapeuta             | Nice-to-have, caso de borda (§7.4).                                                                                                                                                                                                                                                             |
| `familia_abordagem`                                          | Junto com #331. Ver §3.3.                                                                                                                                                                                                                                                                       |
