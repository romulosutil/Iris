# Provisionamento do job de fechamento de ciclo de faturamento — Plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** Fazer o job `scripts/fechamento-ciclo-billing.mjs` rodar de verdade em produção e provar — medindo no banco, não lendo `git log` — que um ciclo de faturamento fecha, antes que o ciclo real do primeiro cliente pago vença em **12/09/2026**.

**Architecture:** O código todo já existe e está commitado: script `.mjs` sem dependência npm, `infra/billing/agendador.sh` (laço, porque o Easypanel v2.31 não tem cron para serviço de app), `infra/billing/Dockerfile` (imagem sem `npm install`, de propósito) e a rota `src/app/api/internal/billing/fechar-ciclos/route.ts` que faz apuração + preço + gateway dentro do app. **Não há código de produto a escrever.** O que falta é: (1) provar que a imagem carrega, (2) documentar o provisionamento clique-a-clique, (3) o Rômulo criar o serviço no painel, (4) exercitar um fechamento medido antes do vencimento real.

**Tech Stack:** Node 22 (`.mjs`, `fetch` nativo), bash, Docker, Easypanel v2.31, Postgres 16, Asaas (gateway de produção), Next.js 16 (rota interna).

**Spec:** GitHub issue [#288](https://github.com/romulosutil/Iris/issues/288) — "Job de fechamento de ciclo não provisionado: cliente ativo não será faturado em 12/09". Contexto de origem: issue #36 (billing self-service), medida em produção em 13/08/2026.

## Global Constraints

- **Prazo duro: 12/09/2026.** É a data de `billing_cycle.fim` de um ciclo real de um cliente real. Depois dela, cada dia sem job é receita não faturada.
- **Guardrail de desenho — falhar aberto.** Job morto = ninguém cobrado. Nunca cliente cobrado errado. Nenhuma tarefa deste plano pode introduzir cobrança automática com valor herdado de ciclo anterior (foi por isso que o produto "Assinaturas" do gateway foi descartado, #36 em 03/08/2026).
- **O job é um gatilho magro.** Zero dependência npm no `.mjs`, zero lógica de preço, zero acesso ao Postgres. Toda a lógica vive na rota do Next, onde `calculator.ts` é a única fonte do preço. Um `npm install` em `infra/billing/Dockerfile` reabre a classe de bug da #156 — desta vez gerando cobrança errada em vez de processo morto.
- **`BILLING_JOB_TOKEN` vai em DOIS serviços com o MESMO valor:** no serviço `App` (a rota valida o header) e no serviço `Billing` (o job envia). Só num dos dois = 401 em 100% dos ticks, para sempre. Gerar com `openssl rand -hex 32`. Nunca colar em chat, nunca imprimir em log.
- **Envs de gateway NÃO vão no serviço do job.** `BILLING_PROVIDER`, `BILLING_PROVIDER_API_KEY`, `ASAAS_BASE_URL` e `ASAAS_WEBHOOK_TOKEN` pertencem ao serviço do **App** (já estão lá — a ativação de 13/08 funcionou). A issue #288 lista essas três no serviço do job; **está errado** e este plano corrige: a imagem do job não fala com o gateway, e copiar a chave da API para lá só espalha segredo sem ganho. Confirmado em `infra/billing/Dockerfile:16-28` e `.env.example:235-245`.
- **Verificar medindo, não lendo.** Serviço criado no painel não é job executado. Job executado não é ciclo fechado. A prova é `SELECT` no Postgres e cobrança visível no painel do Asaas.
- **Idioma:** documentação e copy em pt-BR; mensagens de commit em inglês (`docs/arquitetura/convencoes-de-codigo.md`).
- **Formatação:** nunca rodar `pnpm format` no repo inteiro (reformata `.agents/`, `CLAUDE.md` e o worktree aninhado). Formatar só os arquivos tocados: `pnpm exec prettier --write <arquivo>`.

## Mapa de arquivos

| Arquivo                                                         | Responsabilidade                                                                                                                                          | Tarefa |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `scripts/ci/carga-imagens-infra.sh`                             | Prova que toda a imagem de infra carrega e que todo `import` resolve dentro dela. Hoje cobre `escalonamento` e `backup`; **não cobre `billing`**.         | 1      |
| `infra/README.md` §"Teste de carga das imagens de infra (#157)" | Lista de alvos do teste de carga.                                                                                                                         | 1      |
| `infra/README.md` — nova seção final                            | Runbook de provisionamento do job de billing: passo a passo do painel, como saber que deu certo, o que fazer se der errado, detector de falha silenciosa. | 2      |
| Easypanel (fora do repo)                                        | Serviço `iris-billing` rodando `/app/agendador.sh`.                                                                                                       | 3      |
| Postgres de produção (fora do repo)                             | Evidência: `billing_cycle` saindo de `aberto`.                                                                                                            | 4, 5   |

**Nada em `src/` é modificado.** Se uma tarefa levar você a editar `src/lib/billing/` ou a rota, pare — isso é outro escopo (ver issues #287, #289) e este plano não o cobre.

---

### Task 1: Teste de carga da imagem de billing

A imagem de billing nunca foi carregada por CI nem por script. O precedente é literal: `infra/escalonamento/Dockerfile` lista `COPY` e instala dependências à mão, um import novo não chegou na imagem, e o motor morreu em produção com `ERR_MODULE_NOT_FOUND` — `pnpm test`, `pnpm typecheck` e `pnpm lint` todos verdes (#156, PR #161). A imagem de billing não tem dependências, o que remove _essa_ classe de falha, mas não remove: `COPY` com caminho errado, `apk add bash` sumindo do Dockerfile, e a guarda de execução do `.mjs` não disparando na forma relativa de invocação (defeito #153).

**Files:**

- Modify: `scripts/ci/carga-imagens-infra.sh` (linha 54: constantes de tag; linha 237: nova função depois de `carga_backup`; linhas 240-252: `case` do `main`)
- Modify: `infra/README.md:186-233` (seção "Teste de carga das imagens de infra (#157)")

**Interfaces:**

- Consumes: helpers já existentes no script — `esperar_falha_com <rótulo> <trecho-esperado> -- <cmd...>`, `esperar_sucesso <rótulo> -- <cmd...>`, `log_info`, o array `PADROES_PROIBIDOS` e o contador `FALHAS`.
- Produces: alvo `billing` no CLI — `scripts/ci/carga-imagens-infra.sh billing` — e sua inclusão no alvo `todos`.

- [ ] **Passo 1: escrever o teste que falha (o alvo ainda não existe)**

Rodar, da raiz do repo, no Git Bash:

```bash
bash scripts/ci/carga-imagens-infra.sh billing
```

Esperado: **FALHA** com exit 2 e a linha

```
[carga-imagens] ERRO: alvo desconhecido: billing — use 'escalonamento', 'backup' ou nenhum (todos).
```

Esse é o "vermelho" desta tarefa: hoje não existe cobertura nenhuma para a imagem que vai faturar cliente.

- [ ] **Passo 2: declarar a tag da imagem**

Em `scripts/ci/carga-imagens-infra.sh`, logo abaixo da linha 54 (`readonly TAG_BACKUP=...`), acrescentar:

```bash
readonly TAG_BILLING="iris-billing-ci:local"
```

- [ ] **Passo 3: escrever a função de carga**

Inserir depois do fecho de `carga_backup()` (linha 237) e antes do bloco `# --- main ---`:

```bash
# --- billing -----------------------------------------------------------------
# Ponto cego DIFERENTE do escalonamento e do backup: esta imagem não instala
# NADA de propósito (infra/billing/Dockerfile), então ERR_MODULE_NOT_FOUND por
# dependência ausente não é o risco. O risco aqui é COPY com caminho errado
# (o contexto de build é a raiz do repo, não infra/billing/), `apk add bash`
# sumindo, e a guarda de execução do .mjs não disparando na forma relativa —
# que foi exatamente o defeito da #153 no escalonamento: o processo saía 0 sem
# fazer nada, e "saiu 0" é indistinguível de "faturou".
carga_billing() {
	log_info "buildando ${TAG_BILLING}..."
	docker build -f infra/billing/Dockerfile -t "${TAG_BILLING}" .

	# Sem env, o script para na guarda ANTES de qualquer fetch — nenhuma rota de
	# produção é tocada por este teste. O texto esperado é o do próprio script
	# (scripts/fechamento-ciclo-billing.mjs:118), que nomeia as variáveis
	# ausentes: mensagem genérica aqui viraria caçada no painel.
	esperar_falha_com \
		"billing: carga por caminho ABSOLUTO" \
		"variável(is) de ambiente ausente(s): BILLING_JOB_URL, BILLING_JOB_TOKEN" \
		-- docker run --rm "${TAG_BILLING}" \
		node /app/scripts/fechamento-ciclo-billing.mjs --once

	# Forma RELATIVA: é a documentada em infra/docker-compose.yml e a que a #153
	# quebrou no gêmeo. Se a guarda `import.meta.url === process.argv[1]`
	# regredir, o processo sai 0 sem disparar nada — e esta asserção pega o
	# exit 0, porque esperar_falha_com trata exit 0 como falha do teste.
	esperar_falha_com \
		"billing: carga por caminho RELATIVO (forma do compose)" \
		"variável(is) de ambiente ausente(s): BILLING_JOB_URL, BILLING_JOB_TOKEN" \
		-- docker run --rm -w /app "${TAG_BILLING}" \
		node scripts/fechamento-ciclo-billing.mjs --once

	# Resolve TODO specifier dos arquivos copiados, dinâmico incluído. Hoje o
	# script importa só `node:url`, e é justamente por isso que este passo entra
	# agora: ele é o guarda-corpo do dia em que alguém acrescentar um import
	# aqui. O verificador entra por stdin para não virar arquivo na imagem.
	esperar_sucesso \
		"billing: todo import resolve na imagem (inclusive os dinâmicos)" \
		-- bash -c "docker run --rm -i -w /app -e ALVO=/app/scripts '${TAG_BILLING}' node --input-type=module < scripts/ci/verificar-deps-imagem.mjs"

	# O agendador usa `set -Eeuo pipefail` e `[[ ]]`: sem o `apk add bash` do
	# Dockerfile a imagem sobe e o laço morre na primeira linha.
	esperar_sucesso \
		"billing: sintaxe do agendador.sh (bash presente)" \
		-- docker run --rm "${TAG_BILLING}" bash -n /app/agendador.sh

	# O CMD do Dockerfile aponta /app/agendador.sh por caminho absoluto fixo. Se
	# o COPY mudar de lugar, o container só falha em produção.
	esperar_sucesso \
		"billing: /app/agendador.sh executável (caminho fixo do CMD)" \
		-- docker run --rm "${TAG_BILLING}" test -x /app/agendador.sh

	# O agendador valida env ANTES do laço e sai 1. Rodar sem env prova que ele
	# não entra em laço infinito no CI e que a guarda nomeia a variável.
	esperar_falha_com \
		"billing: agendador para na guarda de env (não entra em laço)" \
		"variável(is) de ambiente ausente(s)" \
		-- docker run --rm "${TAG_BILLING}" /app/agendador.sh
}
```

- [ ] **Passo 4: ligar o alvo no `main`**

Substituir o bloco `case` (linhas ~241-252) por:

```bash
case "${alvo}" in
escalonamento) carga_escalonamento ;;
backup) carga_backup ;;
billing) carga_billing ;;
todos)
	carga_escalonamento
	carga_backup
	carga_billing
	;;
*)
	log_error "alvo desconhecido: ${alvo} — use 'escalonamento', 'backup', 'billing' ou nenhum (todos)."
	exit 2
	;;
esac
```

- [ ] **Passo 5: rodar e ver passar**

```bash
bash scripts/ci/carga-imagens-infra.sh billing
```

Esperado: exit 0 e sete linhas `[carga-imagens] OK: billing: ...`.

Se `billing: agendador para na guarda de env` **travar** em vez de sair: o agendador entrou no laço, a validação de env não rodou. Não "consertar" com timeout — ler `infra/billing/agendador.sh:53-59` e achar por que a guarda não disparou.

- [ ] **Passo 6: provar que o teste testa (mutação)**

Um teste de carga que passa contra uma imagem quebrada não vale nada. Quebre a imagem de propósito e confirme o vermelho:

```bash
# 1. Comente a linha `COPY scripts/fechamento-ciclo-billing.mjs ...` do
#    infra/billing/Dockerfile (linha 35) e rode de novo:
bash scripts/ci/carga-imagens-infra.sh billing
```

Esperado: **FALHA**, com `billing: carga por caminho ABSOLUTO` acusando `Cannot find module` (padrão proibido).

```bash
# 2. Restaure a linha, comente `RUN apk add --no-cache bash` (linha 12), rode:
bash scripts/ci/carga-imagens-infra.sh billing
```

Esperado: **FALHA** em `billing: sintaxe do agendador.sh (bash presente)`.

Restaure o `Dockerfile` ao original (`git checkout -- infra/billing/Dockerfile`) e rode uma última vez para confirmar verde. Se qualquer uma das duas mutações passar verde, o teste está inerte — conserte antes de seguir.

- [ ] **Passo 7: atualizar a lista de alvos no `infra/README.md`**

Em `infra/README.md`, na seção "Teste de carga das imagens de infra (#157)" (linha 186), o bloco de comandos por volta da linha 204 hoje lista só `escalonamento`. Acrescentar a linha do novo alvo:

```bash
scripts/ci/carga-imagens-infra.sh billing          # só a imagem do job de faturamento
```

E, no parágrafo que explica quais imagens são cobertas, incluir `infra/billing/Dockerfile` — dizendo o que muda: essa imagem não instala dependência nenhuma, então o que se prova nela é `COPY`, `bash` e a guarda de execução, não resolução de pacote.

- [ ] **Passo 8: formatar só o que foi tocado e commitar**

```bash
pnpm exec prettier --write infra/README.md
git add scripts/ci/carga-imagens-infra.sh infra/README.md
git commit -m "test(infra): cover billing job image in the infra load test

The billing image had no load coverage at all. Its failure mode differs
from the escalation image (#156): it installs nothing on purpose, so the
risk is a wrong COPY path, a missing bash, or the .mjs execution guard
not firing on the relative invocation form (#153) — a process that exits
0 without firing anything, which is indistinguishable from success.

Refs #288"
```

---

### Task 2: Runbook de provisionamento no `infra/README.md`

O Rômulo é designer de produto, não infra. Um passo a passo que ele executa vai clique a clique, com "como saber que deu certo" e "se der errado" — e não inventa a UI do painel: os nomes de aba abaixo são os que as seções de backup e escalonamento deste mesmo arquivo já usam e que já foram executados com sucesso. Sem esta seção, o provisionamento vira conhecimento tribal fora do repo, que é exatamente o que o `agendador.sh` versionado existe para evitar.

**Files:**

- Modify: `infra/README.md` — nova seção `## Job de fechamento de ciclo de faturamento (#36, #288)`, inserida **depois** da seção "Auto-arquivamento por inatividade (#174)" (começa na linha 1302), no fim do arquivo.

**Interfaces:**

- Consumes: nada de código. Consome os fatos já verificados: `infra/billing/agendador.sh` (envs `INTERVALO_S`, `BILLING_JOB_URL`, `BILLING_JOB_TOKEN`, `BILLING_HEARTBEAT_DIR`, heartbeat em `/heartbeat/.ultimo-fechamento`), `scripts/fechamento-ciclo-billing.mjs` (flags `--once`, `--dry-run`; linha JSON de log), `src/app/api/internal/billing/fechar-ciclos/route.ts` (bearer fixo; 401 se `BILLING_JOB_TOKEN` faltar no App).
- Produces: o texto que a Task 3 executa passo a passo, e as consultas SQL que as Tasks 4 e 5 usam como medição.

- [ ] **Passo 1: escrever a seção**

Acrescentar ao fim de `infra/README.md`:

````markdown
## Job de fechamento de ciclo de faturamento (#36, #288)

Quem transforma "cliente usou o produto" em "cliente foi cobrado" é este
serviço. Ele **não** apura consumo, **não** calcula preço e **não** fala com o
Asaas: faz um POST autenticado em `/api/internal/billing/fechar-ciclos`, e é
essa rota, dentro do app, que faz as três coisas. A razão está em
`infra/billing/Dockerfile:16-28` — a imagem de job não herda o `node_modules`
do app, e duplicar a tabela de preços num `.mjs` paralelo geraria **cobrança
errada em silêncio**.

> **Por que isto é P1.** Sem este serviço no ar, um ciclo vencido simplesmente
> não fecha: `pacientes_contados` fica em 0, nenhuma cobrança é emitida e o
> cliente ativo nunca é faturado — **sem erro em lugar nenhum**, porque o job
> que falharia é o job que não existe. Medido em produção em 13/08/2026: existe
> um ciclo real vencendo em **12/09/2026**.

### Passo 1 — o segredo do disparo, nos DOIS serviços

Gere o token (no seu terminal, não em chat):

```bash
openssl rand -hex 32
```

Esse valor vai, **idêntico**, em dois lugares:

| Serviço no painel    | Variável            | Papel                          |
| -------------------- | ------------------- | ------------------------------ |
| `App` (o Next)       | `BILLING_JOB_TOKEN` | **valida** o header do disparo |
| `Billing` (este job) | `BILLING_JOB_TOKEN` | **envia** o header             |

Configurar só um dos dois dá 401 em 100% dos ticks, para sempre — e o log do
job vai dizer `HTTP 401`, não "faltou token no App". Antes de criar o serviço,
abra `App` → aba `Ambiente` e **olhe** se `BILLING_JOB_TOKEN` já está lá; se
estiver, use o mesmo valor em vez de gerar outro.

> ⚠️ A aba `Ambiente` do Easypanel mostra todos os segredos em texto claro, e o
> painel roda em HTTP sem TLS. Não tire screenshot dessa tela.

> Alterar env **não aplica sozinho**: é preciso clicar em `Implantar`, e isso
> reconstrói o serviço a partir do HEAD de `main`.

### Passo 2 — criar o serviço

1. **Novo serviço** → tipo **Aplicativo** → nome `billing` → Code Source
   `romulosutil/Iris` → Builder **Dockerfile**, path
   `infra/billing/Dockerfile`, build context na **raiz**, branch `main`.
2. **Volume persistente** (aba `Armazenamento`) montado em **`/heartbeat`**.
   Sem ele o heartbeat some a cada restart, e "heartbeat parado" passa a
   significar "o container reiniciou" — ruído que apaga o sinal.
3. **Env vars** (aba `Ambiente`) — estas quatro, e **só** estas:

   ```
   BILLING_JOB_URL=https://irisclinica.ia.br/api/internal/billing/fechar-ciclos
   BILLING_JOB_TOKEN=<o mesmo valor do serviço App>
   INTERVALO_S=3600
   BILLING_HEARTBEAT_DIR=/heartbeat
   ```

   **`BILLING_PROVIDER`, `BILLING_PROVIDER_API_KEY`, `ASAAS_BASE_URL` e
   `ASAAS_WEBHOOK_TOKEN` NÃO entram aqui.** Elas pertencem ao serviço `App`,
   que é quem fala com o gateway. Copiar a chave da API do Asaas para este
   container espalha o segredo por mais um lugar sem que nada a use.

4. **Comando** (aba `Avançado` → campo **Comando**):

   ```
   /app/agendador.sh
   ```

   **Este Easypanel (v2.31.0) não tem cron para serviço de app** — não existe
   campo "Schedule" nem tipo de serviço "Cron". O laço é o `agendador.sh` do
   repo: o container fica de pé dormindo e acorda a cada `INTERVALO_S`.

5. **`Réplicas` = 1.** Não é opcional: duas réplicas disparam dois POST no
   mesmo instante. O `UNIQUE (clinic_id, inicio)` de `billing_cycle` e a guarda
   de idempotência da emissão protegem contra cobrança duplicada, mas duas
   réplicas transformam essa proteção em corrida de rotina em vez de barreira
   de última instância. Não ligar `Tempo de inatividade zero` (não é serviço
   web).

**Por que 3600s e não 60s como o escalonamento:** aqui não há prazo clínico. A
apuração roda depois do fim do ciclo, e o ciclo é de 30 dias — até uma hora de
atraso não muda nada para o cliente. Mas **não aumente** esse intervalo: a
folga entre o fim do ciclo e a apuração é a janela do defeito da #216 (a
varredura de auto-arquivamento caindo nessa fresta tira do ciclo um paciente
que ficou ativo o ciclo inteiro). Aumentar aqui aumenta a janela.

### Como saber que deu certo

Logo depois do primeiro deploy, **Logs** do serviço. Primeira linha esperada:

```
[agendador-billing] 2026-08-13T20:00:00Z ativo. intervalo=3600s · heartbeat=/heartbeat/.ultimo-fechamento
```

E, a cada hora, uma linha JSON única do disparo:

```json
{
  "job": "fechamento-ciclo-billing",
  "quando": "2026-08-13T20:00:01.123Z",
  "dryRun": false,
  "ok": true,
  "status": 200,
  "falha": null,
  "erro": null,
  "corpo": "{\"ok\":true,\"dryRun\":false,\"eventosReprocessados\":0,\"ciclosProcessados\":0,\"falhas\":[],\"resultados\":[]}"
}
```

`"ciclosProcessados":0` é o resultado normal e saudável quando nenhum ciclo
venceu ainda. **Cuidado com a leitura:** `ok:true` com `ciclosProcessados:0`
prova que o disparo chegou na rota e foi autorizado — **não** prova que a
apuração funciona, porque com zero ciclos vencidos ela não roda. A prova da
apuração é o ensaio da seção seguinte.

Confirme o **heartbeat**. Easypanel → serviço `billing` → Console:

```bash
cat /heartbeat/.ultimo-fechamento
```

Timestamp ISO de menos de uma hora atrás. Rode de novo depois do tick seguinte:
o valor tem que avançar.

### O detector de falha — e por que o heartbeat não basta

O heartbeat só avança em disparo bem-sucedido, então ele pega "o job está
falhando". Ele **não** pega o modo de falha que originou a #288: **o serviço
não existir**. Um serviço que nunca foi criado não tem heartbeat para parar, e
não tem log para ficar vazio.

O detector que pega os dois casos olha o efeito, não o processo — rode no
Postgres de produção:

```sql
-- Qualquer linha aqui = faturamento parado. Zero linhas = saudável.
SELECT bc.id, bc.clinic_id, bc.status, bc.fim, now() - bc.fim AS atraso, bc.erro
  FROM billing_cycle bc
 WHERE bc.status = 'aberto'
   AND bc.fim <= now() - interval '2 hours'
 ORDER BY bc.fim;
```

Duas horas de folga = dois ticks perdidos, suficiente para um redeploy normal
e curto o bastante para não deixar um mês passar. **Uma linha retornada é
incidente**, não manutenção: significa que um ciclo venceu e ninguém foi
cobrado.

> **Não existe alarme automático para isto hoje.** Não há monitor externo em
> nenhum serviço deste projeto (backup, escalonamento e arquivamento têm o
> mesmo buraco). Enquanto não houver, a consulta acima é responsabilidade
> humana, com cadência mínima **mensal, na semana do vencimento do ciclo**.
> Dizer "o job avisa se falhar" seria falso: ele avisa no log de um painel que
> ninguém abre por hábito.

### Ensaio manual (o que fecha o checkbox da #288)

Não espere o vencimento real. No Console do serviço `billing`:

```bash
# 1. Ensaio SEM emitir cobrança: apura, calcula preço, NÃO chama o gateway
#    e NÃO avança o ciclo.
node /app/scripts/fechamento-ciclo-billing.mjs --once --dry-run

# 2. Disparo real (só depois de o dry-run sair ok:true)
node /app/scripts/fechamento-ciclo-billing.mjs --once
```

> **`--dry-run` não é read-only.** Ele pula a emissão e o avanço do ciclo, mas
> a apuração (`billing_apurar_ciclo`) apaga e reinsere `billing_cycle_patient`
> do ciclo. É recomputação idempotente, não mutação de estado de cobrança — mas
> não o chame de "consulta".

Depois do disparo real, **meça no banco** (`git log` não prova execução):

```sql
SELECT bc.status,
       bc.pacientes_contados,
       bc.valor_centavos,
       bc.provider_charge_id IS NOT NULL AS tem_charge,
       bc.apurado_em, bc.cobranca_emitida_em, bc.cobrado_em, bc.erro,
       bc.inicio, bc.fim
  FROM billing_cycle bc
 ORDER BY bc.fim DESC
 LIMIT 5;
```

O que caracteriza um fechamento bem-sucedido:

| Coluna                         | Antes        | Depois                                                      |
| ------------------------------ | ------------ | ----------------------------------------------------------- |
| `status`                       | `aberto`     | `aguardando_pagamento` (ou `pago`, se `valor_centavos = 0`) |
| `pacientes_contados`           | `0`          | a contagem real de fichas ativas                            |
| `valor_centavos`               | `0`          | o preço da faixa correspondente                             |
| `provider_charge_id`           | `NULL`       | preenchido — **só** se `valor_centavos > 0`                 |
| `subscription.ciclo_atual_fim` | data vencida | +30 dias                                                    |

**Caso de borda que engana:** com `pacientes_contados = 0`, o preço é 0, o
ciclo é marcado `pago` na hora e **nenhuma cobrança é emitida**. Isso é
correto, mas um fechamento assim **não exercita o caminho do gateway**. Se o
objetivo do ensaio é provar a emissão, o ciclo precisa ter pelo menos uma
ficha ativa.

### O que fazer se der errado

1. **`HTTP 401` na linha JSON.** O `BILLING_JOB_TOKEN` do serviço `App` está
   ausente ou diferente do deste serviço. Abra as duas abas `Ambiente` e
   **olhe** os valores — não confie em "eu já configurei". Depois de corrigir,
   clique em `Implantar` no serviço alterado.
2. **`falha: "rede"`.** O container não alcança `BILLING_JOB_URL`. Confira a
   URL (é a pública, com `https://`, não host interno).
3. **`falha: "timeout"`.** Sem resposta em 30s. **Não conclua que o fechamento
   não rodou** — a rota pode ter concluído do outro lado. Meça no banco antes
   de disparar de novo; o disparo é idempotente por ciclo, mas o diagnóstico
   não pode afirmar uma causa que a evidência não distingue.
4. **`HTTP 500`.** O corpo da resposta vem inteiro na linha JSON — leia-o. É a
   rota do app que falhou, não o job.
5. **`ok:true` mas com `falhas` não vazio no corpo.** Uma clínica falhou e as
   outras seguiram (por desenho). O `clinicId` e o erro estão no corpo, e
   `billing_cycle.erro` guarda o texto.
6. **Enquanto o job está parado, ninguém é cobrado — e nada é perdido.** O
   trilho falha aberto de propósito: a varredura olha o estado atual, não um
   cursor, então quando o serviço voltar ele pega tudo que venceu. Falta de
   cobrança é recuperável; cobrança errada não.
````

- [ ] **Passo 2: conferir os fatos citados contra os arquivos**

Antes de commitar, abra e confirme, um por um — documentação de infra escrita
de memória é como se erra:

```bash
grep -n "INTERVALO_S\|ultimo-fechamento\|BILLING_HEARTBEAT_DIR" infra/billing/agendador.sh
grep -n "BILLING_JOB_URL\|BILLING_JOB_TOKEN" scripts/fechamento-ciclo-billing.mjs
grep -n "cobranca_emitida_em\|apurado_em\|provider_charge_id" src/db/schema.ts
```

Se algum nome divergir do que você escreveu, o arquivo está certo e o texto
está errado.

- [ ] **Passo 3: formatar e commitar**

```bash
pnpm exec prettier --write infra/README.md
git add infra/README.md
git commit -m "docs(infra): add provisioning runbook for the billing cycle job

The job service was never provisioned and the panel steps lived nowhere.
Corrects the env list from issue #288: the gateway credentials belong to
the App service, not to the job image, which never talks to Asaas.

Also documents the failure detector: the heartbeat cannot catch the
failure mode that caused #288 (a service that does not exist has no
heartbeat to stall), so the detector queries billing_cycle instead.

Refs #288"
```

---

### Task 3: Provisionar o serviço no Easypanel — **o Rômulo executa**

Esta tarefa não tem código. Um agente **não** pode executá-la: exige o painel do Easypanel, que só o Rômulo acessa (`infra/README.md:26` — "via única do Rômulo"), e manipula o segredo que autoriza cobrança nos clientes.

**Files:** nenhum no repo. O artefato é o serviço `billing` rodando no Easypanel.

**Interfaces:**

- Consumes: o runbook escrito na Task 2 (§"Passo 1" e §"Passo 2"), já mergeado em `main` — o Easypanel builda do HEAD de `main`.
- Produces: serviço no ar, com log e heartbeat, para as Tasks 4 e 5 medirem.

- [ ] **Passo 1: garantir que a Task 1 e a Task 2 estão em `main`**

O Easypanel builda `main`, não a branch. Se o runbook e o teste de carga ainda estiverem em branch, mergeie antes — provisionar a partir de um `main` que não tem o `Dockerfile` testado é provisionar às cegas.

```bash
git log --oneline -3 origin/main -- infra/billing/ scripts/ci/carga-imagens-infra.sh
```

- [ ] **Passo 2: Rômulo segue o runbook**

`infra/README.md` → §"Job de fechamento de ciclo de faturamento (#36, #288)" → Passo 1 e Passo 2. Não repetir os passos aqui: duplicar procedimento de painel em dois lugares garante que um dos dois fique velho.

- [ ] **Passo 3: medir que o serviço está vivo (não "criado")**

Três evidências, nesta ordem — a primeira que falhar interrompe:

1. **Log do serviço** contém a linha `[agendador-billing] ... ativo. intervalo=3600s`.
2. **Console do serviço:** `cat /heartbeat/.ultimo-fechamento` devolve um timestamp ISO.
3. **Uma linha JSON de disparo** com `"ok":true` e `"status":200`.

Se a (3) trouxer `"status":401`, pare e volte ao §"O que fazer se der errado", item 1 — não é problema deste serviço, é o `BILLING_JOB_TOKEN` do `App`.

- [ ] **Passo 4: registrar a evidência na issue**

Colar na #288 as três evidências, com a linha JSON **inteira** (ela não contém segredo — o token vai em header e nunca é impresso). Marcar o checkbox "Serviço provisionado no Easypanel com as envs de cobrança e `BILLING_JOB_TOKEN`", anotando a correção: as envs de gateway ficaram no `App`, não no job.

---

### Task 4: Fechamento medido antes de 12/09 — o ensaio que fecha a issue

O checkbox "um fechamento de ciclo executado e **medido no banco**, antes de 12/09" é o coração da #288. Os passos 1 e 2 abaixo são obrigatórios e sem risco. O passo 3 exige uma decisão do Rômulo, porque o único ciclo vivo em produção hoje é de um cliente real.

**Files:** nenhum no repo. O artefato é uma linha de `billing_cycle` fora de `aberto`, com evidência colada na issue.

**Interfaces:**

- Consumes: o serviço da Task 3 no ar; as consultas SQL do runbook da Task 2.
- Produces: a evidência que fecha os checkboxes 3 e 4 da #288.

- [ ] **Passo 1: dry-run em produção**

Console do serviço `billing`:

```bash
node /app/scripts/fechamento-ciclo-billing.mjs --once --dry-run
```

Esperado hoje (13/08/2026): `"ok":true`, `"status":200`, e no corpo
`"ciclosProcessados":0` — porque o único ciclo vivo vence em 12/09 e ainda não
está vencido.

**O que isso prova:** a imagem sobe, o script roda, o token autentica, a rota
responde. **O que isso NÃO prova:** que a apuração conta certo, que o preço sai
certo, ou que a cobrança é emitida. Com zero ciclos vencidos, nada disso
executou. Não marque nenhum checkbox de fechamento com base neste passo.

- [ ] **Passo 2: registrar o estado ANTES do ensaio**

Rodar e **guardar a saída** — sem o "antes", o "depois" não prova mudança:

```sql
SELECT s.id AS subscription_id, s.clinic_id, s.status, s.provider,
       s.provider_subscription_id IS NOT NULL AS tem_vinculo,
       s.ciclo_atual_inicio, s.ciclo_atual_fim, s.ciclo_dias
  FROM subscription s
 ORDER BY s.ciclo_atual_fim;

SELECT bc.id, bc.clinic_id, bc.status, bc.pacientes_contados,
       bc.valor_centavos, bc.provider_charge_id, bc.inicio, bc.fim
  FROM billing_cycle bc
 ORDER BY bc.fim;
```

- [ ] **Passo 3: escolher o ensaio — DECISÃO DO RÔMULO, não do executor**

Para exercitar apuração + preço + emissão, é preciso um ciclo com `fim <= now()`. Hoje não existe nenhum. Três caminhos, com o preço de cada:

**(a) Clínica de teste em produção, com assinatura de teste e autorização Pix própria — recomendado.**
Criar uma clínica de teste com **pelo menos 1 ficha ativa** (senão `valor_centavos = 0`, o ciclo é marcado `pago` na hora e o gateway nunca é chamado — o ensaio passaria verde sem exercitar nada), ativar uma assinatura com uma autorização de Pix do próprio Rômulo, e ajustar `subscription.ciclo_atual_fim` dessa assinatura de teste para o passado. O job fecha no tick seguinte.
_Prova:_ o caminho inteiro contra o gateway de **produção**, incluindo a cobrança aparecendo no painel do Asaas e o webhook de pagamento.
_Custo:_ uma cobrança real de R$ 39 (faixa de 1 ficha), que o Rômulo paga a si mesmo — perde só a taxa do Asaas. Ao configurar a autorização, **atenção ao teto de valor**: o banco pergunta o valor máximo, e um teto baixo demais recusa a cobrança (#286).
_Risco:_ toca uma linha de `subscription` no banco de produção. É de uma clínica de teste, nunca da clínica do cliente real.

**(b) Ensaio contra o Asaas em sandbox, fora de produção.**
Subir o app local apontando `ASAAS_BASE_URL` para o sandbox e repetir o ensaio contra um banco local com dado semeado.
_Prova:_ apuração, preço e o dialeto da API do Asaas. _Não prova:_ a credencial de produção, a autorização de Pix real, nem a rota interna atrás do proxy.
_Custo:_ zero em dinheiro; algumas horas de setup.
_Risco:_ nenhum em produção — mas verde aqui é uma promessa, não uma medição do que vai acontecer em 12/09.

**(c) Forçar o fechamento do ciclo do cliente real antes da hora — rejeitado.**
Fecharia um ciclo de 30 dias com ~10 dias corridos, avançaria `ciclo_atual_fim` para +30 dias a partir de agora e desalinharia o calendário de cobrança do único cliente pago. Não faça isso.

**Recomendação: (a), com (b) como plano B se a segunda autorização de Pix não sair a tempo.** (a) é o único caminho que mede o que a #288 diz que nunca rodou: a emissão contra o gateway de produção.

- [ ] **Passo 4: executar o ensaio escolhido e medir DEPOIS**

Rodar de novo as duas consultas do Passo 2 e comparar com o "antes". Confirmar,
para o ciclo de ensaio:

- `status` saiu de `aberto` → `aguardando_pagamento`
- `pacientes_contados` = número de fichas ativas semeadas (não 0)
- `valor_centavos` = o valor da faixa correspondente (1 ficha = 3900)
- `provider_charge_id` preenchido
- `subscription.ciclo_atual_fim` avançou 30 dias
- a cobrança aparece no painel do Asaas com a referência externa `cycle:<id>`

**Se `pacientes_contados` vier 0 com fichas semeadas**, não "conserte" o número:
leia `billing_apurar_ciclo` (`db/migrations/0071_billing_assinatura_e_ciclo.sql:274`)
e confira se as fichas caem dentro da janela `[inicio, fim)` do ciclo. Ficha
criada depois do `fim` do ciclo não conta — e nesse caso o job está certo e o
dado de ensaio é que está errado.

- [ ] **Passo 5: fechar a issue com a evidência**

Colar na #288: as duas consultas antes/depois, a linha JSON do disparo, e o
print (ou o id) da cobrança no painel do Asaas. Marcar os quatro checkboxes da
Definição de Pronto, anotando explicitamente **como** o quarto foi fechado — a
falha é detectável pela consulta de `billing_cycle` documentada no runbook e
pelo heartbeat, **não** por alarme automático, que não existe em nenhum serviço
deste projeto.

- [ ] **Passo 6: abrir a issue de seguimento do alarme**

```bash
gh issue create --label "fase-7" --title "Nenhum job de infra tem alarme automático de parada" --body "..."
```

Corpo: o `billing`, o `escalonamento`, o `backup` e o `arquivamento` têm todos o
mesmo buraco — o sinal de parada existe (heartbeat, e no caso do billing uma
consulta que detecta o efeito), mas ninguém o observa sem ação humana. Citar
que a #288 fechou com detecção humana documentada e cadência mensal, e que isso
é o piso, não o alvo.

---

## Autorrevisão

**Cobertura da spec (#288).** Os quatro checkboxes da Definição de Pronto:

| Checkbox da #288                                                    | Tarefa                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Serviço provisionado no Easypanel com as envs e `BILLING_JOB_TOKEN` | Task 2 (runbook) + Task 3 (execução e medição)                                     |
| Todo specifier importado pelo script resolve dentro da imagem       | Task 1, passo 3 (`verificar-deps-imagem.mjs`) e passo 6 (mutação prova o teste)    |
| Um fechamento executado e medido antes de 12/09                     | Task 4, passos 3 e 4                                                               |
| Falha do job é observável (não silenciosa)                          | Task 2 (§detector) + Task 4, passos 5 e 6 — fechado com honestidade sobre o limite |

Os quatro itens de "O que precisa acontecer" da issue também estão cobertos, com
uma **correção explícita** ao item 1: as envs de gateway não vão no serviço do
job.

**Placeholders.** Nenhum "TBD"/"implementar depois". A única decisão em aberto é
o Passo 3 da Task 4, que é deliberadamente do Rômulo (envolve dinheiro real e
banco de produção) e vem com recomendação, alternativa e o caminho rejeitado
com o motivo.

**Consistência de nomes.** `TAG_BILLING`/`carga_billing`/alvo `billing`
consistentes entre os passos 2, 3 e 4 da Task 1. Colunas conferidas contra
`db/migrations/0071_billing_assinatura_e_ciclo.sql:94-111` e
`src/db/schema.ts:1847` (`cobranca_emitida_em` não está na 0071 — foi
acrescentada depois; por isso o Passo 2 da Task 2 manda conferir no `schema.ts`,
não na migração).
