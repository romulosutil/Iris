# Jornada de admissão do paciente — prontidão do prontuário

> Spec de design. Ratificada por Rômulo em 01/09/2026.
> Escala para o objeto **paciente** o padrão que a #512 estabeleceu para o objeto
> **sessão**: o objeto sabe o próprio estado e nomeia o gesto seguinte.
>
> **Revisão 02/09/2026** — memo da auditoria 360 aplicado (R-1..R-8; fonte:
> `docs/produto/auditoria-360-revisao-admissao-2026-09-02.md`, issue #540).
> Cada edição está marcada `(auditoria 02/09, R-n)`. **D-A8, D-A9 e D-A10
> entraram depois da ratificação e estão pendentes de validação com o Rômulo.**

## 1. O problema

Hoje é possível cadastrar um paciente, agendar, atender, documentar e consolidar
uma sessão inteira — e o gráfico de evolução continuar vazio. Sem erro, sem
aviso, sem nada na tela que explique por quê.

### 1.1 A cadeia real até o gráfico

| #   | Artefato                                                | Onde se cadastra                     | Obrigatório hoje       |
| --- | ------------------------------------------------------- | ------------------------------------ | ---------------------- |
| 1   | `patient` (nome, nascimento, consentimento, modalidade) | `/pacientes/novo`                    | ✅ sim                 |
| 2   | `patient_clinical_profile` (Ficha Clínica)              | `[id]/cadastro-clinico`              | ❌ não                 |
| 3   | `patient_protocol` (prescrição vigente)                 | `[id]/cadastro-clinico` → Protocolos | ❌ **não**             |
| 4   | `goal` com `criterio_dominio`                           | `[id]/metas`                         | ❌ **não**             |
| 5   | Sessão agendada → diário → consolidada                  | Agenda / Sessões                     | ✅ (só exige o passo 1) |
| 6   | `evidence` → `session_snapshot` → timeline              | automático                           | —                      |

### 1.2 Os três defeitos estruturais

**D1 — a porta está aberta no lugar errado.** Criar sessão exige apenas o passo
1. Os passos 3 e 4 são os causais: `src/lib/evidence/materializar.ts` (julgamento
3 do cabeçalho) **descarta toda evidência sem `goal_id` resolvido**. Sem meta
ativa, sessão consolidada produz zero snapshot. A perda é silenciosa.

**D2 — o estado vazio mente.** `pacientes/[id]/page.tsx` renderiza "Sem sessões
registradas → **Agendar Primeira Sessão**". Aponta para a ação que o operador já
podia fazer, não para a que falta. É o mesmo defeito que a #512 fechou na
sessão: o sistema sabe o que falta e não diz.

**D3 — o onboarding abandona no meio.** `PASSOS_ONBOARDING` termina em
`paciente EXISTS`. Celebra o passo 1 e some exatamente onde a jornada endurece.

## 2. Decisões travadas

| #          | Decisão                                                                                                     | Racional                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-A1**   | A régua morde no **documentar**, não no agendar nem no consolidar.                                          | Agendar é ato da recepção, que não tem papel para resolver o bloqueio — travar ali produz beco sem saída. Consolidar é tarde: a sessão já foi gasta.                                            |
| **D-A2**   | Forma = **escada no próprio prontuário**, não wizard.                                                       | Wizard de admissão exigiria coordenador do começo ao fim; a recepção não conseguiria terminar. A escada atravessa papéis: quem não pode dar o passo vê "aguardando coordenação".                |
| **D-A3**   | Bloqueia **só o mínimo causal**. Ficha Clínica e Anamnese aparecem como recomendados, sem travar.            | Régua que mede o não-causal treina o operador a preencher lixo para destravar. Dado ruim é pior que dado nenhum.                                                                                |
| **D-A4**   | Prontidão é **derivada**, nunca coluna.                                                                     | Mesmo racional já documentado em `onboarding-queries.ts`: flag manual só é verdadeira enquanto alguém lembra de escrevê-la, e um degrau desfeito (última meta descontinuada) ficaria verde para sempre. |
| **D-A5**   | A escada sai de `capacidadesDaModalidade`.                                                                  | `modalidade.ts` já é fonte única do que cada modalidade tem. Uma segunda tabela de degraus divergiria no primeiro modo novo — foi exatamente o bug que `modalidade.ts` nasceu para fechar.       |
| **D-A6**   | Para `cognitive_behavioral`, o degrau bloqueante é **≥1 aplicação de instrumento padronizado** (marco zero). | Análogo clínico da meta no ABA. `EvolucaoTcc` lê `obterInstrumentoAplicacoes`; sem baseline o gráfico nasce com um ponto só.                                                                    |
| **D-A7**   | `conventional` **não tem degrau bloqueante**.                                                               | Acompanhamento narrativo, sem gráfico, por decisão de produto de 20/08/2026 (`modalidade.ts`). Inventar régua onde não há métrica seria certeza fabricada.                                      |
| **D-A8**   | A régua morde na **action**, não só na página. A UI apenas antecipa o que a action vai recusar.             | Gate que só existe no render não é gate: `capturarDiario` e `consolidarSessao` são server actions alcançáveis sem passar pela tela. Ver `ctx-forjavel-use-server`.                              |
| **D-A9**   | Os fatos só são lidos para `coordenador` e `terapeuta`. `admin_recepcao` nunca recebe escada nem selo. **⚠️ Pendente de validação com o Rômulo** _(auditoria 02/09, R-1)_. | `goal_select` (`0006_fase2_rls.sql:207`) exige `coordenador` OR `app_is_on_team`. Sob a RLS da recepção, `EXISTS` devolve `false` para linhas que existem — a escada afirmaria "falta meta" sobre um prontuário que ela nem pode ler. Ver §4a. |
| **D-A10**  | **Proposta** _(auditoria 02/09, R-1)_ — régua de visibilidade do terapeuta: **"é o profissional responsável pela sessão"**, não "está na equipe de cuidado". **⚠️ Pendente de validação com o Rômulo.** Enquanto não validada, vale o interino fail-closed da §4a: fato não visível → `null` → "Aguardando coordenação", nunca "Falta meta". | Terapeuta de cobertura fora da equipe é cenário suportado e testado (`diario/[sessionId]/actions.int.test.ts:321`); a agenda só valida `user_role` (`agenda/queries.ts:301-320`). Sob a régua "está na equipe", ele veria o passo Documentar **bloqueado** num prontuário que o coordenador vê pronto — bloqueio funcional novo, gerado por regra que não é sobre esse papel (mecanismo do `PR-01`; ver também `PR-05`, "quem é o terapeuta"). As duas saídas possíveis: (a) a agenda passa a **exigir equipe** ao agendar — e a régua "está na equipe" fica verdadeira por construção; (b) `obterFatosProntidao` ganha visibilidade para o terapeuta **da sessão** (`session.therapist_id = app_user_id()`), o que a RLS atual não dá e exigiria policy nova ou definer guardado (§7). A proposta é (b); a escolha é do Rômulo. |

## 3. A jornada nova

### 3.1 A escada, por modalidade

| Modalidade             | Degraus                                                                        | Bloqueia documentar |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------- |
| `protocol_driven`      | Admissão · Ficha Clínica · Anamnese · **Protocolo** · **Meta ativa** · 1ª sessão | Protocolo, Meta     |
| `cognitive_behavioral` | Admissão · Ficha Clínica · **Instrumento (marco zero)** · 1ª sessão             | Instrumento         |
| `conventional`         | Admissão · Ficha Clínica · 1ª sessão                                           | —                   |
| não resolvida          | **Definir modalidade**                                                         | Modalidade          |

`Admissão` nasce sempre concluído: é o próprio `patient` existir.

### 3.2 Módulos

| Módulo                                                | Responsabilidade                                                                                                       | Depende de           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `src/lib/patient/prontidao.ts`                        | **Puro.** `montarProntidao({ modalidade, fatos, role })` → `{ degraus[], proximo, podeDocumentar, quemResolve }`. Zero I/O. `fatos: null` (não visível) cai no ramo de `admin_recepcao` _(auditoria 02/09, R-1)_. | `modalidade.ts`      |
| `src/app/(app)/pacientes/[id]/prontidao-queries.ts`   | Lê os fatos numa transação `withTenant` só, em bloco de `EXISTS`. Devolve `FatosProntidao \| null` — `null` quando o paciente não existe/não é do tenant ou quando o papel não enxerga o prontuário clínico (§4a) _(auditoria 02/09, R-1)_. | `db/rls`             |
| `src/app/(app)/pacientes/[id]/modalidade.ts`          | Ganha `degrausProntidao` e `degrausBloqueantes` em `CapacidadesDaModalidade`.                                           | —                    |
| `src/components/app/cartao-prontidao.tsx`             | Um componente, três pontos de uso (§3.3).                                                                              | `prontidao.ts` (tipos) |

**Contrato de `montarProntidao`** — função pura, sem acesso a banco, rede ou
relógio. Recebe fatos já lidos; nunca decide o que ler. É esse limite que a
torna testável na matriz completa modalidade × fatos × papel sem I/O.

```ts
export interface FatosProntidao {
  temFichaClinica: boolean;
  temAnamnese: boolean;
  temProtocoloAtivo: boolean; // patient_protocol com desativado_em IS NULL
  temMetaAtiva: boolean; // goal.estado = 'ativa'
  temInstrumentoAplicado: boolean;
  temSessaoConsolidada: boolean;
}

export type EstadoDegrau = "concluido" | "pendente" | "bloqueante";

export interface Degrau {
  id: DegrauId;
  rotulo: string;
  estado: EstadoDegrau;
  rota: string | null; // null quando o papel atual não pode agir
  papelQueResolve: "coordenador" | "terapeuta" | "admin_recepcao";
}

export interface Prontidao {
  degraus: Degrau[];
  proximo: Degrau | null; // null = prontuário pronto; o cartão some
  podeDocumentar: boolean;
  quemResolve: string | null; // rótulo legível quando o papel atual não pode
}
```

### 3.3 Três superfícies, não onze

1. **Cartão de Prontidão no topo do prontuário** — montado em
   `pacientes/[id]/layout.tsx`, junto do selo de RLS. É o lugar que já roda uma
   vez por entrada no prontuário e não remonta a cada troca de aba.
2. **Lista `/pacientes`** — pill de estado por linha (`Pronto`, `Falta meta`,
   `Aguardando coordenação`). O coordenador enxerga a fila de admissão sem abrir
   vinte prontuários.
3. **Documentar (diário da sessão)** — onde a régua morde. Sem formulário: o
   mesmo cartão, em modo bloqueio, nomeando o que falta e quem resolve.

### 3.4 Um gesto primário por vez

O cartão mostra a escada inteira, mas **um** botão primário: o `proximo`. Os
demais degraus pendentes são texto com link secundário. Duas chamadas para ação
com o mesmo peso é a carga cognitiva que este redesenho existe para remover.

## 4. Estados de tela que precisam existir

| Estado                                | O que a tela mostra                                                        |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Prontuário pronto (`proximo === null`) | Cartão **some**. Nada a fazer não ocupa pixel.                             |
| Bloqueado, papel atual resolve        | Botão primário: `Prescrever protocolo →`                                   |
| Bloqueado, papel atual **não** resolve | `Aguardando coordenação` — sem botão morto                                 |
| Modalidade não resolvida              | Primeiro degrau é `Definir modalidade`                                     |
| Conta em somente-leitura              | Escada visível, gestos desabilitados pela razão que `layout.tsx` já exibe   |
| Evolução sem snapshot                 | Renderiza a **escada**, não mais `Agendar Primeira Sessão`                  |
| Falha de leitura dos fatos            | Cartão não renderiza; nunca derruba o prontuário — mas **não** finge "pronto" **nem finge "bloqueado"** _(auditoria 02/09, R-1)_ |
| Fatos **não visíveis** para o papel (recepção; terapeuta fora da equipe até D-A10) | `obterFatosProntidao` devolve `null` → escada vazia, sem degrau clínico nomeado; no Documentar, "Aguardando coordenação" fixo _(auditoria 02/09, R-1)_ |
| Paciente inexistente ou de outra clínica | `obterFatosProntidao` devolve `null`, **não** uma escada de `false`s _(auditoria 02/09, R-1)_ |

O último caso é a memória `erro-renderizado-como-empty-state`: `catch` que vira
estado vazio transforma falha de leitura em afirmação clínica falsa. Aqui o
fallback é ausência do cartão, nunca `podeDocumentar: true`.

### 4a. O cartão também não pode fingir BLOQUEADO (D-A9)

A §4 dizia que o cartão nunca finge "pronto". Falta a simétrica, e ela é a que
morde: as cinco tabelas lidas têm policy de **papel e equipe**, não só de
clínica. `goal_select` exige `coordenador` OR `app_is_on_team(patient_id)`.

Sob a RLS de `admin_recepcao`, portanto, todo `EXISTS` clínico devolve `false`
para linhas que existem. A escada diria "Falta meta" sobre um prontuário
completo — e diria isso ao papel que a política proíbe de ler dado clínico.
Uma afirmação falsa e um vazamento de estado clínico no mesmo selo.

A direção do erro é fail-closed (bloqueia, não vaza linha), que é o lado certo
de errar. Mas a resposta **não** é um `SECURITY DEFINER` que enxergue tudo:
seria reintroduzir a família de defeito de um definer que abre demais.

Regra: `obterFatosProntidao` só é chamada para `coordenador` e `terapeuta`.
Para `admin_recepcao`, `montarProntidao` devolve escada vazia,
`podeDocumentar: false` e `quemResolve: "Coordenação"` — sem nenhum degrau
clínico nomeado. Na lista `/pacientes`, ela não vê selo de prontidão.

**Regra simétrica _(auditoria 02/09, R-1)_: "não visível" ≠ "não existe".**
`obterFatosProntidao` devolve `FatosProntidao | null`. Na mesma transação dos
seis `EXISTS`, ela lê dois fatos de **visibilidade**, não de prontidão:

- `existe` — `EXISTS (SELECT 1 FROM patient WHERE id = $patientId)` sob a RLS
  do tenant. `false` cobre paciente inexistente **e** paciente de outra
  clínica: os dois devolvem `null`, nunca uma escada de `false`s.
- `visivel` — `user_role = 'coordenador' OR app_is_on_team($patientId)`, o
  predicado literal de `goal_select`. `false` devolve `null`.

`montarProntidao({ fatos: null })` cai no mesmo ramo de `admin_recepcao`:
escada vazia, `podeDocumentar: false`, `quemResolve: "Coordenação"`. O cartão
do prontuário some; o passo Documentar mostra "Aguardando coordenação" fixo,
sem nomear degrau clínico. É fail-closed **sem afirmação falsa** — e é o que
torna a regra "nunca finge bloqueado" verificável independentemente do
desfecho de D-A10.

Prova obrigatória, quatro contextos: `ctxCoordenador`, `ctxTerapeutaNaEquipe`,
`ctxTerapeutaForaDaEquipe`, `ctxRecepcao`, mais o caso "paciente inexistente
devolve `null`". O terceiro é o que revela se a régua da equipe é a certa —
hoje a agenda não exige equipe para agendar (D-A10).

## 5. O que muda fora da escada

- **`pacientes/[id]/page.tsx`** — estado vazio de Evolução passa a renderizar o
  `CartaoProntidao`. Fecha D2.
- **`src/lib/onboarding/passos.ts`** — 5º passo: _"Deixe o primeiro paciente
  pronto para atender"_. Fecha D3. O `EXISTS` correspondente entra em
  `obterProgressoOnboarding` na mesma transação dos outros quatro.

## 6. Prova

| Alvo                    | Tipo               | Critério                                                        |
| ----------------------- | ------------------ | --------------------------------------------------------------- |
| `prontidao.ts`          | unit puro          | matriz modalidade × fatos × papel; inclui modalidade `null`      |
| `prontidao-queries.ts`  | int-test (RLS)     | fatos corretos + **cross-tenant não vaza**                       |
| Bloqueio do documentar  | int-test           | **mutação**: reverter a guarda tem que deixar vermelho           |
| `CartaoProntidao`       | componente + a11y  | os 7 estados da §4; sem botão morto no estado "não resolvo"      |
| 5º passo do onboarding  | int-test           | passo desfeito (meta descontinuada) volta a pendente             |

O item de mutação não é formalidade: a memória `teste-verde-que-nao-testa-nada`
lista seis formas de um teste passar contra o código pré-fix.

## 7. Anti-padrões nomeados

- ❌ Coluna `prontidao_status` ou qualquer flag persistida (D-A4).
- ❌ Segunda tabela de degraus fora de `modalidade.ts` (D-A5).
- ❌ Botão primário para um passo que o papel atual não pode dar.
- ❌ `catch` que devolve prontidão vazia e destrava o documentar.
- ❌ Bloquear Ficha Clínica ou Anamnese (D-A3).
- ❌ Gate só no render, com a server action aceitando a escrita (D-A8).
- ❌ Nomear degrau clínico para `admin_recepcao` (D-A9).
- ❌ `SECURITY DEFINER` para ler fatos acima da RLS. Se algum dia for
  inevitável (ex.: D-A10 opção b), o guard interno copia o predicado EXATO da
  policy de leitura correspondente, exige `clinic_id = app_clinic_id_exigido()`
  **e** `app_patient_in_clinic(p_patient)`, entra na varredura de
  `FUNCOES_COM_HELPER` (`db/tests/clinic-id-helper-rls.int.test.ts`) e tem
  **caso negativo cross-tenant** próprio — a allowlist positiva não acusa a
  falta de guard sozinha (`Q-05`). Lembrete anti-`S-02`: o defeito daquele
  definer era abrir demais com parâmetro nulo; aqui o risco é o inverso
  (fechar demais), e a tentação de "resolver" com um definer que enxerga tudo
  recriaria o primeiro _(auditoria 02/09, R-1)_.
- ❌ Logar `err.message` de erro de driver: em `DrizzleQueryError` a `message`
  é o SQL inteiro com os `params`. Logar `name` + código do Postgres.

## 8. Fora de escopo

Sub-projetos irmãos, cada um com spec própria:

- **B — Shell:** remover a faixa de nav horizontal do `Header`, migrar troca de
  clínica, troca de papel e `Sair` para o rodapé do rail; substituir os
  monogramas de duas letras do rail por ícones. Achado que muda o plano:
  `Header` também monta a `BottomNav` do mobile — remover o menu ≠ deletar o
  componente.
- **C — Design system:** 57 componentes em `components/ui/` e 15 ícones em
  `icon.tsx`. Reduzir carga cognitiva do próprio sistema.
