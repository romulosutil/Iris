# Jornada unificada da sessão — brief de redesenho

> Status: **proposta pendente de validação com o Rômulo**. Nenhum código de produção
> escrito a partir deste documento sem ratificação explícita.
> Origem: issue #512 + investigação dos PRs #508/#509 (clínica solo confundindo papéis).
> Data: 01/09/2026.

## 1. O problema

O funil clínico do Iris é linear e sempre foi:

```
Crio agenda → Faço sessão → Documento sessão → Aprovo → Vira evidência
```

A interface não é. Cada etapa mora em uma superfície com forma, dono e navegação
diferentes, e duas árvores de navegação concorrem entre si. O resultado é que o
usuário nunca sabe em que passo está nem quanto falta.

### 1.1 Mapa do que existe hoje

| Etapa do funil          | Rota                         | Forma                                   | Quem alcança                    |
| ----------------------- | ---------------------------- | --------------------------------------- | ------------------------------- |
| Crio agenda             | `/agenda`                    | lista do dia + grade (`agenda-calendar-grid`) | todos                     |
| Crio agenda (semana)    | `/agenda/semana`             | grade semanal (`schedule-grid` → `ui/calendar`) | **coordenador-only**    |
| Disponibilidade         | `/equipe/[id]`               | terceira grade (`availability-grid` → `ui/calendar`) | coordenador        |
| Faço sessão             | —                            | **nenhuma tela**; só muda `session.estado` | —                            |
| Documento sessão        | `/diario/[sessionId]`        | dois formulários empilhados             | terapeuta dono + coordenador    |
| Aprovação 1 (terapeuta) | `/revisao/[sessionId]`       | lista de evidências                     | **sem link em nav nenhuma**     |
| Aprovação 2 (coord.)    | `/validacao`                 | fila por exceção                        | coordenador                     |
| Vira evidência          | `evidence` / `evidence_current` | —                                    | —                               |
| Filas paralelas         | `/pendencias`, `/excecoes`, `/supervisao`, `/alertas-risco` | 4 listas + `GovernancaNav` de 5 abas | varia |

### 1.2 Os quatro defeitos estruturais

**D-a · Duas árvores de navegação concorrentes.** A nav principal do `AppLayout` é
montada por papel; a [`GovernancaNav`](../../src/components/ui/governanca-nav.tsx)
é uma segunda árvore de 5 abas que só aparece dentro de 4 rotas. `/pendencias`
está nas duas para o terapeuta e em nenhuma para o coordenador — é a issue #512.
O badge de Validação apontando para a fila errada (corrigido em `a0e7563`) é o
mesmo defeito por outro ângulo: com duas árvores, contadores divergem em silêncio.

**D-b · Etapas não homogêneas.** Grade → dois formulários → lista → fila → outra
lista. Não existe um objeto "sessão" que o usuário siga do início ao fim, e não
existe indicador de progresso em lugar nenhum. Cada etapa reensina a própria
gramática.

**D-c · Aprovação duplicada onde não há segunda pessoa.** Em clínica solo, o
fundador recebe só o papel `coordenador` (`criarClinicaEVinculo`). Ele aprova a
evidência em `/revisao` como dono da sessão e valida o mesmo item em `/validacao`
como coordenador. Dois gestos, um humano, zero controle adicional: a segunda
aprovação não é governança, é teatro de governança. Foi exatamente isso que
confundiu no PR #509.

**D-d · Três superfícies de calendário sobre dois motores.**
`agenda-calendar-grid` (307 linhas) para o dia; `ui/calendar` (1.091 linhas)
atrás de `schedule-grid` (semana) e `availability-grid` (disponibilidade). A
semana é coordenador-only sem motivo de produto — o terapeuta também planeja a
semana dele.

## 2. Decisões travadas

Ratificadas pelo Rômulo em 01/09/2026:

1. **A sessão é o objeto central.** As filas viram atalhos que apontam para dentro
   da tela da sessão, não destinos autônomos.
2. **Em clínica solo, a aprovação colapsa em um gesto só.** A fricção continua,
   mas ligada ao risco do item, não ao organograma.
3. **Um motor de calendário, com escala Dia/Semana, para todos os papéis.**
4. **Entrega desta rodada:** brief + wireframes navegáveis. Sem código de produção.

## 3. A jornada nova

### 3.1 Máquina de estados canônica

Cinco estados visíveis, na ordem, sempre com o mesmo vocabulário visual em toda
superfície onde uma sessão aparece:

```
Agendada → Realizada → Documentada → Revisada → No acervo
```

Ramos terminais (não são falha, são desfecho): `Falta`, `Cancelada`.
Ramo de exceção (a sessão trava e volta para a fila): `Precisa de atenção`.

**Nenhum estado novo no banco.** Todos são derivados por leitura do que já existe:

| Estado exibido      | Derivação                                                                       |
| ------------------- | ------------------------------------------------------------------------------- |
| Agendada            | `session.estado = 'agendada'`                                                    |
| Realizada           | `session.estado = 'realizada'` e sem `session_note` do tipo `nota_consolidada`   |
| Documentada         | existe `session_note` `nota_consolidada` e existe `extraction` `sugerida`        |
| Revisada            | toda `extraction` da sessão em `aprovada` / `editada` / `descartada`             |
| No acervo           | Revisada **e** sem item da sessão pendente na fila de validação                  |
| Falta / Cancelada   | `session.estado` em `falta_paciente` / `falta_terapeuta` / `cancelada`           |
| Precisa de atenção  | `extraction.estado` em `pendente_reprocessamento` / `erro_validacao`, **ou** `nota_consolidada` ausente com sessão realizada há mais de 24h, **ou** item na fila de validação |

Consequência de projeto: a máquina de estados é uma função pura sobre linhas já
existentes. Ela mora em `src/lib/sessao/estado.ts` (novo, testável isolado), e
toda tela lê dela. Zero migração, zero coluna nova, zero risco de RLS.

### 3.2 Três superfícies, não onze

| Superfície                | Rota            | Papel                                                                 |
| ------------------------- | --------------- | --------------------------------------------------------------------- |
| **Agenda**                | `/agenda`       | Onde a sessão nasce e onde se registra o que aconteceu. Um motor, escala Dia/Semana, para todos os papéis. |
| **Sessões**               | `/sessoes`      | Fila única do que está travado. Substitui `/pendencias`, `/excecoes` e `/validacao` como destinos. |
| **Sessão**                | `/sessoes/[id]` | A tela da sessão: timeline dos 5 estados + o passo atual em foco. Absorve `/diario/[sessionId]` e `/revisao/[sessionId]`. |

O que **não** entra no objeto sessão, e por quê:

- **`/alertas-risco`** — escopo é paciente e clínica, não sessão; já tem faixa
  global no `AppLayout` e semiótica de cor exclusiva (terracota). Fica onde está.
- **Supervisão & Estagnação** — escopo é a trajetória do paciente ao longo de
  muitas sessões. Sai da governança, mas **continua empurrando**: vira um bloco
  no topo de `/pacientes` (a lista), com o formato *"3 pacientes com sinal de
  estagnação"* e link direto. Não vira aba, não vira busca ativa dentro de cada
  paciente. **(C2)**

Com isso, a `GovernancaNav` de 5 abas é **removida**, e a nav principal fica com a
mesma estrutura para os dois papéis clínicos — diferindo só no escopo que o RLS
já entrega. O menu diário passa a conter só o que tem alta frequência de uso:

```
Agenda · Sessões(badge) · Pacientes · Relatórios
```

**Administração da clínica sai do menu diário (C1).** `Dados da Clínica`,
`Exportar Acervo`, `Equipe`, `Assinatura`, `Dúvidas` e `Meu Perfil` passam para o
menu do usuário, no rodapé do menu lateral. São itens usados cerca de uma vez por
trimestre convivendo hoje, no mesmo nível, com itens usados oito vezes por dia —
ruído permanente na única navegação que o coordenador que atende possui.

**`admin_recepcao` não recebe `Sessões` (C4).** A fila é de trabalho clínico
(documentar, revisar), que a recepção não pode nem deve executar. Um badge que
ela nunca consegue zerar é ansiedade permanente e ruído puro. A nav dela fica
`Agenda · Pacientes` — menos itens que hoje, com a agenda inteira funcionando.

Isso atende diretamente ao princípio "Transparência sem vigilância" do
`PRODUCT.md`: o coordenador usa os mesmos componentes que o terapeuta, com
escopo maior, não uma variante "modo supervisor".

### 3.3 Um gesto primário por passo

O defeito D-b se resolve com uma regra, não com uma tela: **em qualquer momento,
uma sessão tem exatamente um gesto primário**, e ele é o mesmo em todo lugar onde
a sessão aparece (card da agenda, item da fila, tela da sessão).

| Estado             | Gesto primário         | Leva para                              |
| ------------------ | ---------------------- | -------------------------------------- |
| Agendada           | `Registrar sessão`     | folha de desfecho (realizada/falta/cancelada) |
| Realizada          | `Documentar`           | `/sessoes/[id]` no passo Documentar     |
| Documentada        | `Revisar N evidências` | `/sessoes/[id]` no passo Revisar        |
| Revisada           | `Ver no acervo`        | `/pacientes/[id]` na linha do tempo     |
| Precisa de atenção | rótulo literal do que travou (ex.: `Reprocessar extração`) | o ponto exato do problema |

O "Faço sessão" — hoje invisível — ganha corpo aqui: `Registrar sessão` é um passo
de um gesto que sai da agenda e cai direto na documentação, sem tela intermediária
vazia.

### 3.4 Documentar: um passo, não dois formulários

`/diario/[sessionId]` empilha "Captura rápida" e "Consolidar sessão" como duas
seções irmãs de mesmo peso, sem dizer que a segunda depende da primeira. Vira um
passo só com dois momentos declarados:

1. **Capturar** (texto ou áudio, várias vezes, mobile, uma mão). O estado
   "salvo localmente" continua sendo componente fixo, nunca toast — princípio
   "a informação nunca se perde implicitamente".
2. **Consolidar** (uma vez, fecha o passo e dispara a extração). Só habilita
   quando existe captura; até lá, explica o que falta em vez de ficar cinza mudo.

### 3.5 Aprovação: fricção pelo risco, não pelo papel

Regra única, substituindo os dois gates atuais:

- Toda evidência exige **uma** aprovação humana consciente. Nunca em lote quando
  a fricção é alta — `avaliarFriccao` continua sendo a fonte única.
- Item de **fricção alta** (baixa confiança **ou** inconsistente com o histórico)
  exige justificativa escrita, sempre.
- Se a clínica tem **coordenador ≠ terapeuta**, o item de fricção alta sobe para
  a fila do coordenador: aí a segunda aprovação é uma segunda pessoa, que é o
  controle que se queria desde o início.
- Se **coordenador = terapeuta da sessão** (clínica solo), ele resolve na hora,
  com a mesma justificativa e o mesmo registro em `evidence_revision`. Um carimbo,
  não dois.

Predicado, derivado, sem migração:

```
mesmaPessoa = ctx.role === 'coordenador' && ctx.userId === session.terapeutaId
```

> **Sinalização honesta:** isto remove um passo de aprovação da clínica solo. Não
> é perda de controle porque nunca houve controle ali — não existe segunda pessoa
> para revisar. A trilha de auditoria (`evidence_revision`, append-only, com
> autor, ação e justificativa) fica idêntica. O que muda é que ela deixa de
> registrar duas vezes o mesmo julgamento da mesma pessoa, que é justamente o que
> falseia a métrica de "aprovação sem edição".

### 3.6 Calendário: um motor, duas escalas

- `ui/calendar` (já é o motor compartilhado de `schedule-grid` e
  `availability-grid`) passa a ser o **único** motor.
- `agenda-calendar-grid` (307 linhas, exclusivo do dia) é **removido**; a escala
  "Dia" vira uma escala do motor único.
- `/agenda/semana` deixa de ser rota separada e coordenador-only: vira o toggle
  `Dia | Semana` dentro de `/agenda`, disponível para todo papel clínico.
- Disponibilidade da equipe continua no mesmo motor, como camada de fundo da
  grade, não como terceiro componente.

No mobile, a escala Dia é lista cronológica (não grade) — o terapeuta opera de
uma mão em corredor; grade de 7 colunas em 375px é ilegível por construção.

### 3.7 Menu lateral colapsável

A navegação sai do topo e vai para a lateral. O motivo é geométrico: o cabeçalho
atual empilha marca, nav e seletor de clínica na mesma faixa e **quebra em duas
linhas** em desktop estreito, roubando altura justamente do conteúdo clínico. O
eixo horizontal é onde sobra espaço; o vertical é onde falta.

- **Desktop (≥1024px):** rail lateral, 236px expandido ↔ 68px colapsado (só
  ícones). O estado é preferência do operador e persiste por navegador
  (`localStorage`, com `try/catch` — a leitura estoura em janela anônima e a UI
  precisa renderizar certo com valor ausente).
- **Faixa superior fina:** seletor de clínica + **papel ativo (C7)**. Deixa de
  existir cookie invisível decidindo o que os botões fazem.
- **Rodapé do rail:** bloco do usuário → `Meu Perfil`, administração da clínica
  **(C1)** e **`Sair`**. O sair deixa de ocupar espaço no cabeçalho.
- **Mobile:** barra inferior com os itens diários + avatar que abre uma folha.
  Barra inferior, não gaveta superior: o terapeuta opera de uma mão e o polegar
  alcança a base, não o topo.
- **Colapsado não degrada acessibilidade:** alvo permanece ≥44px, cada ícone
  carrega `aria-label` e tooltip, e o **badge continua visível** — ícone sozinho
  nunca é o único portador de significado.

### 3.8 Escopo, ordenação e esforço declarados na própria tela

Quatro ajustes pequenos que resolvem ambiguidades que a fila única cria:

- **Escopo por extenso (C6).** `/sessoes` abre com *"7 sessões da clínica"* ou
  *"7 sessões suas"*. Sem isso, o mesmo rótulo e o mesmo número significam coisas
  diferentes conforme a clínica ativa — e quem opera em mais de uma clínica não
  tem como saber qual.
- **Ordenação visível e trocável (C8).** O default difere por papel (coordenador:
  tempo travado; terapeuta: por dia), mas o controle é o mesmo e está à vista.
  Default implícito diferente por papel, sem controle, quebraria "os mesmos
  componentes".
- **Filtro por terapeuta persistente (C3).** Acima de ~4 terapeutas a fila vira
  ruído: N terapeutas × 3 naturezas de trabalho numa lista só. O filtro vale para
  a fila e para a grade semanal.
- **Custo declarado no item.** `Revisar 3 evidências · ~4 min` vs `Reprocessar ·
  instantâneo`. Sem isso, o usuário não responde "tenho 5 minutos, o que fecho?".
- **Estado nunca aparece sozinho.** `Documentada` e `Revisada` são vizinhos
  demais na palavra e distantes demais no significado. O selo diz o estado; a
  linha ao lado diz a dívida: *Documentada · 3 evidências esperando você*.
- **Aprovação é reversível.** Com um carimbo só, "1 gesto" não pode virar "1
  chance": a evidência aprovada oferece `Reabrir revisão`. `evidence_revision` é
  append-only — reabrir é natural no modelo de dados, não é exceção.

## 4. Estruturas de clínica e carga cognitiva

A análise por persona não basta: o que decide a experiência é a **estrutura da
clínica**, porque é ela que determina qual papel a pessoa recebe. Três regras do
código, verificadas, definem o campo:

- `criarClinicaEVinculo` dá ao fundador **apenas** `coordenador`.
- O convite (`convidar-form.tsx`) oferece **apenas** `terapeuta` e
  `admin_recepcao` — não existe caminho de UI para um segundo coordenador.
- `papelAtivo` trata coordenador como superset: se presente, **vence** qualquer
  combinação.

**Consequência que reordena as prioridades do produto:** "clínica solo" não é caso
de borda. Toda clínica cujo dono também atende roda o operador clínico principal
como `coordenador`. E1 e E2 abaixo são a mesma configuração de software.

| #      | Estrutura                          | Papéis presentes                          | Peso            |
| ------ | ---------------------------------- | ----------------------------------------- | --------------- |
| **E1** | Uma pessoa só                      | 1× `coordenador` que atende                | entrada do produto |
| **E2** | Dono atende + terapeutas           | 1× `coordenador` que atende + N× `terapeuta` | clínica pequena BR típica |
| **E3** | Coordenador não atende + terapeutas| 1× `coordenador` + N× `terapeuta`          | média           |
| **E4** | Qualquer uma + recepção            | + `admin_recepcao`                         | média           |
| **E5** | Pessoa em várias clínicas          | papel diferente por clínica                | baixa, existe   |
| **E6** | `admin_recepcao` + `terapeuta`     | combo disjunto → `/selecionar-papel`       | rara            |

### E1 / E2 — o caso-base

Hoje ele sustenta dois modelos mentais simultâneos ("escrevo o diário" /
"valido a clínica") com o vocabulário de apenas um deles, não alcança
`/pendencias` pelo menu (#512), e aprova a mesma evidência duas vezes sob dois
nomes. É carga extrínseca pura — esforço sobre o software, não sobre o paciente.
A jornada nova resolve por construção; **C1** remove o ruído que sobra.

### E3 — coordenador que não atende

É a única estrutura para a qual a nav atual foi desenhada. Ganha o contador único
e é quem **mais perderia** se Supervisão virasse busca ativa — daí **C2**. A fila
unificada exige **C3** para permanecer legível, e **C8** para não divergir em
silêncio da fila do terapeuta.

### E4 — `admin_recepcao`

`/agenda/semana` é `requireRole(ctx, "coordenador")` e as actions de criação de
sessão vivem atrás dessa tela. **A recepção não pode marcar sessão e não enxerga
a semana** — precisa manter a grade na memória de trabalho e pedir ao coordenador.
Isso não é carga de layout: é permissão no lugar errado.

Isso está aberto como decisão de produto na **issue #517 (C5)** e não entra no
redesenho sem ratificação, porque mexe em permissão e em exposição de PHI na
grade. O que a jornada nova entrega sem depender dessa decisão é **C4**.

### E5 — pessoa em várias clínicas

Hoje a forma do menu inteiro muda ao trocar de clínica. Na proposta a estrutura
passa a ser a mesma e só o escopo muda; **C6** elimina a ambiguidade que sobra.

### E6 — combo disjunto

`/selecionar-papel` existe e o cookie `activeRole` persiste a escolha, mas
`AppHeader` **não tem nenhuma referência a papel**: sem indicador, sem troca no
shell. A pessoa opera num papel invisível e o mesmo botão faz coisas diferentes.
Viola o princípio "a informação nunca se perde implicitamente". Resolvido por
**C7**.

### Consolidado

| #      | Correção                                             | Perfis   | Estado |
| ------ | ---------------------------------------------------- | -------- | ------ |
| **C1** | Administração sai do menu diário → menu do usuário    | E1, E2   | aplicada |
| **C2** | Supervisão volta a empurrar: bloco no topo de `/pacientes` | E3  | aplicada |
| **C3** | Filtro por terapeuta persistente na fila              | E3, E4   | aplicada |
| **C4** | `Sessões` fora da nav de `admin_recepcao`             | E4       | aplicada |
| **C5** | Recepção agenda / vê a semana                         | E4       | **issue #517 — decisão do Rômulo** |
| **C6** | Escopo do badge dito por extenso em `/sessoes`        | E5       | aplicada |
| **C7** | Papel ativo visível e trocável no header              | E6       | aplicada |
| **C8** | Ordenação visível e trocável, default por papel       | E3 × terapeuta | aplicada |

## 5. Estados de tela que precisam existir

Nenhuma tela entra sem os sete: `default`, `vazio`, `carregando` (skeleton, nunca
spinner no meio do conteúdo), `erro`, `primeira vez`, `volume alto`, `sem permissão`.

Dois casos que o produto já errou antes e que a nova jornada precisa acertar por
construção:

- **Falha de extração não pode ser renderizada como vazio.** `catch { setState(null) }`
  vira afirmação clínica falsa ("nada foi encontrado" quando na verdade nada foi
  processado). Todo estado derivado da IA distingue *não há* de *não deu certo*, e
  o segundo sempre oferece a saída (`Reprocessar`).
- **Fila com zero elegíveis é empty-state, não bug.** "Nada travado" é um desfecho
  legítimo e deve ser dito com essas palavras.

## 6. O que isso custa

**Remove:** `GovernancaNav` (5 abas), `agenda-calendar-grid` (307 linhas), a rota
`/agenda/semana`, e os destinos autônomos `/pendencias`, `/excecoes`, `/validacao`
(o conteúdo migra, as queries continuam).

**Cria:** `src/lib/sessao/estado.ts` (máquina derivada, pura, testável isolada),
`/sessoes` (fila única), `/sessoes/[id]` (tela da sessão), o toggle de escala em
`/agenda`.

**Não toca:** modelo de dados, RLS, policies, `docs/agente/output-schema.json`.
Toda a jornada nova é derivação por leitura sobre o schema atual. Isso é
deliberado: nenhuma migração significa que a mudança é reversível por `git revert`
e não precisa de plan mode por schema.

**Redireciona:** as rotas antigas viram `redirect()` permanente para o ponto
equivalente na jornada nova, para não quebrar link salvo nem teste E2E que navegue
por URL.

## 7. Riscos e questões abertas

1. **Volume da fila `/sessoes` em clínica grande.** Com 8 terapeutas × 7 sessões/dia,
   a fila do coordenador pode passar de 50 itens/dia. A ordenação precisa ser por
   *tempo travado*, não por data da sessão, e a paginação precisa ser real. O risco
   de rubber-stamping por cansaço é citado no `PRODUCT.md` e piora com fila longa.
2. **Migração de expectativa do usuário atual.** "Central de Validação" é o item
   primário do coordenador hoje. Sumir com o nome sem aviso é ruim; precisa de
   redirect + uma dica na primeira visita.
3. **Supervisão dentro de `/pacientes/[id]`** ainda precisa de desenho próprio —
   este brief só decide que ela sai da governança. Fica para uma issue separada.
4. **Contagem do badge único.** Um badge só em "Sessões" agrega o que hoje são
   cinco contadores. Ele precisa de uma função de contagem única (`contarTravadas`),
   com o mesmo predicado da fila — divergir contador de lista é exatamente o
   defeito da issue #511.

## 8. Próximos passos

1. Rômulo valida este brief e os wireframes navegáveis.
2. Atomizar em issues via `/tlc-spec-driven` — a máquina de estados e a fila única
   são fronteiras naturais de revisão independente.
3. Fechar o checklist de handoff (`AGENTS.md` §5.2) em cada issue **antes** da
   label `jules`.
