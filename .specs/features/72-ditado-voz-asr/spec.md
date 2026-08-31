# Spec — Issue #72: Ditado de Voz pós-sessão (ASR self-hosted)

> **Escopo V1:** só Modo 2 (ditado assíncrono pós-sessão). Modo 3 fora.
> **Decisões e fatos medidos:** `context.md` (ler antes).
> **Design doc de produto:** `docs/superpowers/specs/2026-08-02-issue-72-ditado-voz-asr-design.md`

## Objetivo

O terapeuta grava, depois da sessão, um ou mais áudios curtos com a própria voz.
Cada áudio vira **um parágrafo** do rascunho do diário. Ele revisa a lista de
clipes, envia o lote de uma vez, e o texto transcrito chega ao editor como
**rascunho com indicador de IA**, exigindo revisão humana antes de virar nota
oficial. Digitação (Modo 1) nunca deixa de funcionar.

## Requisitos

### Captura (cliente)

- **R1** — Cada clipe tem teto de **2 minutos**. A gravação encerra sozinha ao bater o teto (não corta em silêncio) e o clipe fica disponível para revisão.
- **R2** — Não há teto na quantidade de clipes por lote.
- **R3** — Cada clipe é persistido no IndexedDB (`iris-audio` / `iris-audio-rascunho`) assim que a gravação termina (persist-on-record). Reload antes de enviar não perde clipe.
- **R4** — A lista de clipes é visível com **duração por item** e ações **descartar** e **regravar** por item. Descartar apaga o blob do IndexedDB de verdade.
- **R5** — Nenhum clipe sai para o ASR ao terminar de gravar. O lote só sobe no clique explícito em **"Enviar pra Iris analisar"**.
- **R6** — A **ordem de gravação é preservada** do cliente até o parágrafo no editor.
- **R7** — Codec dual: `audio/webm;codecs=opus` onde houver suporte, fallback `audio/mp4` (AAC) no iOS/Safari.
- **R8** — O IndexedDB é purgado no **logout**, e o clipe é apagado **após o lote ser aceito pelo terapeuta**. Falha de microfone ou de IndexedDB nunca bloqueia o texto do diário.

### Pipeline (servidor)

- **R9** — O envio do lote é **assíncrono**: o server action enfileira os clipes e retorna imediatamente com um `loteId`. Não há espera síncrona pela transcrição.
- **R10** — A UI acompanha o lote por **polling**, com limites explícitos definidos em R20.
- **R11** — O áudio bruto no servidor é **efêmero**: o objeto é apagado no `finally` do processamento do clipe — em sucesso **e** em falha. Não há retenção de 7 dias no servidor.
- **R12** — Falha isolada de 1 clipe **não derruba o lote**. Os demais transcrevem normalmente; o parágrafo do clipe falho volta marcado **"não transcrito"**.
- **R13** — Clipe falho é reenviável pelo terapeuta a partir do blob que continua no IndexedDB local; alternativamente ele digita aquele parágrafo à mão (Modo 1 só para o trecho afetado).
- **R14** — O motor ASR é **self-hosted** na VPS Iris. O áudio **nunca** sai da infra Iris. Nenhuma chamada a provedor externo no V1.
- **R15** — O worker reserva clipes da fila de forma **atômica e cross-tenant** via função `SECURITY DEFINER`, com incremento de `tentativas` — mesmo idioma de `src/lib/export/acervo/motor.ts`. Um clipe reservado nunca é reservado de novo por outro tick.
- **R16** — Teto de **3 tentativas** por clipe. Estourado o teto, o clipe vai a `falhou` em definitivo, o objeto é apagado, e ele nunca mais volta à fila.

### Revisão humana e dado clínico

- **R17** — O texto transcrito entra no editor como **rascunho com indicador visual de IA**. Nunca grava `session_note` direto.
- **R18** — Salvar a nota oficial continua sendo ato explícito do terapeuta, pelo caminho que já existe hoje.
- **R19** — A transcrição é dado clínico e **efêmera no servidor**, pela mesma régua do áudio bruto (R11): assim que o terapeuta aceita o texto no rascunho da nota, `audio_capture.transcricao_texto` é **limpa**. O registro que sobrevive é a `session_note`, que já entra na exportação integral do acervo. Enquanto a transcrição existe (janela entre transcrever e aceitar), ela entra no expurgo LGPD por paciente pelo wiring já existente de `audio_capture` (`0128`), e **não** entra na exportação — `audio_capture` está em `TABELAS_NEGADAS` (`src/lib/export/acervo/coletor.ts`) e continua lá de propósito.

  > **Decisão do Rômulo, 31/08/2026 (opção C da #494, Parte 4).** A redação anterior deste requisito afirmava que a transcrição entrava na exportação do acervo — era falso: `audio_capture` sempre esteve em `TABELAS_NEGADAS`, com teste travando em `coletor.test.ts`. O que decidiu a escolha foi a medição de que **nenhum caminho de produção limpava `transcricao_texto`**: o "rascunho intermediário" era permanente, e um dado clínico guardado indefinidamente sem ser devolvido no pedido de portabilidade (LGPD Art. 18) não se sustenta. As alternativas descartadas foram (A) exportar o texto bruto — entrega à paciente a versão que a máquina ouviu errado ao lado da corrigida — e (B) manter guardado e não exportar, assumindo o risco. A limpeza depende da UI (T11/T12) e é implementada junto com ela.

### Gate e limites

- **R20** — Polling: intervalo de 3s enquanto houver clipe em `na_fila`/`transcrevendo`; teto de **10 minutos** de polling contínuo. Estourado o teto, a UI para de pedir, informa que o lote segue processando e oferece **recarregar para verificar** — nunca fica pedindo para sempre nem afirma falha que não mediu.
- **R21** — `FEATURE_FLAG_ASR_ENABLED` (server-only) é trava de **maturidade/qualidade**, não de DPA. Desligada: a aba de áudio não oferece ditado e o server action recusa o lote. Ausente ou inválida = **desligada** (fail-closed).
- **R22** — Em CI e teste, o provedor é sempre `StubAsrProvider`, sem rede.
- **R23** — Recusa de consentimento ASR, flag desligada, motor fora do ar ou qualquer falha técnica **nunca** bloqueiam o registro da sessão por digitação.

### Casos de borda (fora do caminho feliz)

- **R24** — Clique duplo em **"Enviar pra Iris analisar"** nunca cria dois lotes. O botão desabilita no primeiro clique e só reabilita em erro de envio; o servidor idempotência por `loteId` gerado no cliente antes do envio — reenvio do mesmo `loteId` não duplica linhas em `audio_capture`.
- **R25** — Fechar a aba ou navegar para fora **durante a gravação** de um clipe descarta só aquele clipe em andamento (nunca persistido — R3 só persiste ao terminar). Os clipes já persistidos no IndexedDB sobrevivem.
- **R26** — Fechar a aba ou navegar para fora **durante o polling** não afeta o processamento no servidor — o lote segue e termina de qualquer forma. Ao reabrir o diário da sessão, a UI busca o estado do `loteId` mais recente e retoma o polling ou mostra o resultado já pronto, sem reenviar o lote.
- **R27** — "Regravar" sobre um clipe **já enviado e em processamento** não é permitido — o item que já subiu ao lote não é mais editável na lista local; regravar só se aplica a clipe ainda não enviado (`na_fila`/`transcrevendo` bloqueia edição, R4 vale só antes do envio).

## Definição de pronto

1. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` verdes — com **contagem** conferida, não só o verde (int-tests exigem `--config vitest.integration.config.ts`).
2. Migração gerada por `pnpm db:generate` (schema) + edição manual só para GRANT/policy/função, com `_journal.json` correto e `when` = anterior + 1000 quando escrita à mão.
3. Os 7 cenários do plano de verificação (§3 do design doc) cobertos por teste automatizado.
4. Benchmark do motor na VPS **medido e registrado** (T6) — tamanho de modelo e tick do agendador derivam dele.
5. Serviço ASR e agendador provisionados no Easypanel e **verificados no painel**, não só commitados.
6. `.env.example`, `infra/README.md` e o design doc atualizados.

## Rastreabilidade

| Req                | Tasks         |
| ------------------ | ------------- |
| R1, R2, R4, R5, R6 | T11           |
| R3, R7, R8         | T14           |
| R9, R10, R20       | T09, T10      |
| R11                | T04, T07, T15 |
| R12, R13           | T07, T12      |
| R14                | T05, T06      |
| R15, R16           | T02, T03      |
| R17, R18           | T12           |
| R19                | T01, T12, T16 |
| R21, R22           | T13, T05      |
| R23                | T16           |
| R24                | T09, T11      |
| R25, R26           | T10, T11, T14 |
| R27                | T11           |
