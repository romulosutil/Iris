# Design Spec — Issue #72: Fase 6b - Ditado de Voz (Captura Local & Pipeline ASR)

> **Status:** 🟢 Especificação Aprovada & Validada (produto/negócio) — ⚠️ ver nota de reconciliação técnica abaixo
> **Data:** 02/08/2026 (revisão 24/08/2026 — 3 modos de captura, provedor Google)
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)
> **Issue GitHub:** [#72](https://github.com/romulosutil/Iris/issues/72)

> ⚠️ **Nota de reconciliação (T17, 31/08/2026) — este documento é o rascunho ORIGINAL de produto, anterior à medição do repo.** A decisão de arquitetura e implementação real está em `.specs/features/72-ditado-voz-asr/` (`context.md`, `spec.md` R1-R27, `design.md`, `tasks.md` T01-T17) — leia aquele antes de tocar código. Divergências conhecidas entre este doc e a implementação:
>
> - **Escopo V1 = só Modo 2** (ditado assíncrono pós-sessão). Modo 3 (gravação da sessão inteira, §1.2/§2.2 abaixo) foi adiado por decisão de produto — não implementado nesta issue.
> - **Não é greenfield.** O gravador single-clipe (`src/app/(app)/diario/[sessionId]/audio-local.tsx`) e o store IndexedDB (`src/lib/audio/local-store.ts`, bancos `iris-audio`/`iris-audio-rascunho`) já existiam antes desta issue — o trabalho evolui o que existe, não cria `AudioCapture`/`audio_drafts` do zero como §2.2 descreve.
> - **Storage do áudio no servidor é EFÊMERO, não um TTL de 7 dias.** O objeto no bucket S3/MinIO dedicado (`src/lib/asr/storage.ts`, env `ASR_S3_*`) é apagado no `finally` do worker em **sucesso e em falha** (R11/D3) — mais restrito que a promessa de até 7 dias do termo de consentimento, nunca um prazo de retenção real.
> - **Provider ASR é self-hosted (faster-whisper na própria VPS), não Google/Gemini.** `src/lib/asr/provider.ts` resolve entre `SelfHostedAsrProvider` (produção, `ASR_PROVIDER=self-hosted`) e `StubAsrProvider` (default — CI, testes, demo, sem chamada de rede). Não há transferência internacional de áudio no V1 — o gate de DPA de §2.1 não se aplica.
> - **Fila é assíncrona via banco, não síncrona no request.** Clipe confirmado entra em `audio_capture.asr_status = 'na_fila'`; três funções `SECURITY DEFINER` (`db/migrations/0136_asr_fila.sql`: `app_asr_reservar`, `app_asr_concluir`, `app_asr_falhar`) processam a fila cross-tenant a partir de um agendador (`infra/asr/agendador.sh` + rota interna `src/app/api/internal/jobs/asr-transcrever/route.ts`), porque o worker roda sem `app.clinic_id` de sessão e a RLS de `audio_capture` esconderia a fila em silêncio sob um caller comum.
> - **Ainda não usável ponta a ponta pelo terapeuta.** T01-T10 e T13-T16 (backend/infra: fila, worker, storage, agendador, sweeper, flag, bateria de mutação) estão implementados; **T11 (UI multi-clipe: teto de 2min/clipe, lista de revisão, descartar/regravar) e T12 (renderização do parágrafo transcrito + polling de estado) não foram implementados** — `audio-local.tsx` continua a versão single-clipe pré-#72, sem gate em `asrHabilitado()` (`src/lib/flags.ts`) nem chamada às actions de lote (`enviarLoteAsrAction`/`obterEstadoLoteAction`/`obterLoteMaisRecenteAction`, `src/app/(app)/diario/[sessionId]/actions.ts`). Ver `BACKLOG.md` (débito D72) — decisão de produto pendente de validação com o Rômulo.

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

O registro manual da sessão é a maior dor diária do terapeuta. Digitação é
sempre disponível, mas lenta; um assistente de voz reduz o atrito — desde que
não vire ponto único de falha (nem técnico, nem de consentimento) que bloqueie
o registro.

### 1.2 A Solução — 3 modos de captura, sempre com fallback garantido

| Modo                      | Descrição                                                                                                                                                                        | Consentimento                                                             | Risco LGPD                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| **1. Digitação**          | Terapeuta digita a nota, como hoje.                                                                                                                                              | Nenhum extra (já MVP).                                                    | Nenhum.                                         |
| **2. Ditado assíncrono**  | Terapeuta grava 1+ áudios curtos pós-sessão, narrando com a própria voz (estilo áudio de WhatsApp). Paciente não fala no áudio.                                                  | Cláusula ASR discriminada (`termo-consentimento-titular-adulto.md` §8.1). | Baixo — nota de trabalho do profissional.       |
| **3. Gravação de sessão** | Fone de ouvido com supressão de ruído durante o atendimento inteiro, priorizando a voz do profissional. Sempre permite complemento por texto — a gravação pode ficar incompleta. | Cláusula ASR discriminada + ciência de captação incidental de ambiente.   | Médio — capta o ambiente, ainda que minimizado. |

**Regra de produto inegociável:** nenhum modo é obrigatório nem exclusivo.
Recusa do titular ao modo 2 ou 3 nunca bloqueia o registro da sessão — o
profissional sempre pode cair para o modo 1. O sistema nunca é desenhado
ASR-only. Ver `docs/legal/dpa-asr-audio.md` §7 para o detalhamento legal
completo dos 3 modos.

O áudio, nos modos 2 e 3, é **majoritariamente a voz do profissional** — não
uma gravação deliberada do paciente. Isso muda a classificação de risco de
"gravação biométrica do paciente/menor" para "nota de trabalho do profissional
com dado de saúde do paciente relatado nela" (mesma natureza do texto do
diário já tratado hoje).

---

## 2. Especificação Técnica & Travas Legais

### 2.1 Gate Legal Inegociável

- Bloqueio por Feature Flag: `FEATURE_FLAG_ASR_ENABLED` inicia `false`.
- Utilização de `StubAsrProvider` em CI e testes.
- Ativação condicional à assinatura do DPA de áudio (`docs/legal/dpa-asr-audio.md`):
  adesão ao DPA/BAA Enterprise + Zero Data Retention do provedor (não exige
  DPA negociado — parecer jurídico, ver `dpa-asr-audio.md` §5.1), retenção
  máxima de 7 dias só como TTL de falha (deleção imediata em sucesso), e
  atualização do termo de consentimento (feita — ver §8.1 do termo adulto).
  **Implementado no V1 (self-hosted, ver nota de reconciliação acima): nem o
  TTL de 7 dias nem o gate de DPA se aplicam — o motor roda na própria VPS,
  sem transferência internacional, e o objeto é apagado em sucesso E em
  falha (mais restrito que o texto acima, nunca um prazo de retenção real).**

### 2.2 Captura & Persistência Local (Fatia 6.4 — modos 2 e 3)

- Componente `AudioCapture`: dual-codec (`webm;opus` em navegadores modernos, `mp4;aac` em iOS).
- Armazenamento em IndexedDB `audio_drafts` no cliente durante o registro. Purga garantida no logout e pós-confirmação de upload.
- Modo 2: múltiplos áudios curtos por sessão (lista, não um único blob).
- Modo 3: captura contínua com supressão de ruído (Web Audio API / `noiseSuppression: true` no `getUserMedia`), priorizando o microfone do profissional.

### 2.3 Pipeline ASR & Fallback (Fatia 6.5)

- Interface `AsrProvider`: desacopla a aplicação do provedor. Implementação
  real: **Google** — mesmo fornecedor já usado pro LLM de texto
  (`politica-privacidade.md` §4), via Gemini nativo (input multimodal de
  áudio) ou Google Cloud Speech-to-Text dedicado (decisão de implementação em
  T3, não muda o gate legal). Não usar OpenAI/Azure — evita segundo
  subprocessador.
- Fallback: em caso de falha de conexão ASR, o áudio é preservado localmente
  e o terapeuta pode ouvir e digitar manualmente no editor (cai pro modo 1).
- Modo 3 sempre expõe campo de texto livre pro profissional complementar
  trechos que a transcrição/gravação não capturar por completo.

---

## 3. Plano de Verificação

1. Teste unitário de `StubAsrProvider` simulando transcrição sem chamadas de rede.
2. Teste de purga do IndexedDB `audio_drafts` ao efetuar logout.
3. Teste de que recusa de consentimento ASR (modo 2/3) não bloqueia salvar `SessionNote` via modo 1.
4. Teste de retenção: áudio deletado imediatamente pós-transcrição aceita; áudio de falha **também é apagado no `finally` do worker** (não expira em 7 dias — ver nota de reconciliação no topo).
