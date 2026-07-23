# DPA & Gating de Áudio (ASR externo) — Iris

**Status: RASCUNHO de produto, pendente de revisão/assinatura por advogado e
provedor antes de habilitar ASR real com dado de paciente.** Este documento
recorta o tema que `briefing-para-advogado.md` §4 **não** cobre — aquele texto
trata só do LLM de **texto** (Claude/Gemini); aqui tratamos do **áudio bruto**
e da transcrição por ASR. É o predecessor legal explícito das fatias 6.4/6.5
(ver `.specs/features/fase6/spec.md` A6/A8 e requisitos R6.5.2/R6.6.2).

> **Regra de fechamento do MVP:** este DPA **não bloqueia o aceite do MVP**. O
> MVP fecha por 6.1–6.3 + 6.6 (hardening LGPD + polimento família). O ditado de
> voz (6.4/6.5) é **fast-follow**, com o provider ASR real **desabilitado por
> feature flag até este DPA estar assinado**. Ver `checklist-producao-mvp.md`.

---

## 1. Por que áudio é uma fronteira de confiança nova

O texto do diário já é dado sensível de saúde de menor. O **áudio de sessão**
agrava o risco em três pontos que o pipeline de texto não tinha:

1. **Persistência local em device compartilhado.** A captura vai para
   IndexedDB (`audio_drafts`) antes do upload. Devices de recepção/clínica são
   frequentemente compartilhados entre profissionais. Rascunho de voz de um
   paciente **não pode sobreviver à troca de usuário** no mesmo device.
   → Mitigação de produto (R6.4.3): purgar `audio_drafts` no **logout** e
   **após confirmação de upload**, além do flush em `window.online`.
2. **Armazenamento do áudio bruto.** O `.webm/.mp4` cru fica em storage
   (MinIO self-hosted na VPS BR) sob RLS até ser transcrito. É a cópia mais
   sensível e menos estruturada do dado.
3. **Transcrição por ASR externo = transferência internacional.** OpenAI
   Whisper / Azure Speech processam **fora do Brasil**. Enviar áudio de saúde
   de menor a esses provedores é **transferência internacional de dado
   sensível** (LGPD Art. 33), com o provedor de ASR atuando como
   **subprocessador** — uma parte a mais na cadeia que o §4 do briefing (que só
   menciona o LLM de texto) não enderaçava.

## 2. Salvaguardas exigidas antes de habilitar ASR real

Espelha e estende a lógica já aceita para o LLM de texto (briefing §4), agora
para a cadeia de áudio:

- **Base de transferência (Art. 33).** Cláusulas-Padrão Contratuais
  (Resolução CD/ANPD nº 19/2024) OU consentimento específico do titular para a
  transferência do áudio. A transferência do áudio deve ser **citada
  explicitamente** no termo de consentimento (não herdar do consentimento do
  LLM de texto — é outra finalidade e outro subprocessador).
- **DPA formal com o provedor de ASR escolhido.** Aceitar os termos padrão do
  provedor pode não bastar (mesma pergunta em aberto do briefing §4). Confirmar
  com o advogado se o Iris precisa de DPA próprio negociado antes de processar
  áudio real.
- **Zero data retention / não-treino no provedor.** Exigir do subprocessador
  ASR: não retenção do áudio para treino, e retenção operacional mínima. Sem
  essa cláusula, o provedor está descartado.
- **Minimização.** Só o áudio da sessão vai ao ASR — nunca metadado de
  paciente identificável junto do payload de áudio.

## 3. Retenção do áudio bruto — 7 dias

O áudio bruto é a cópia mais sensível e tem valor efêmero (existe só para gerar
a `SessionNote`/transcrição, que é o artefato clínico durável). Regra:

- **Áudio bruto retido no máximo 7 dias** após a transcrição bem-sucedida,
  então eliminado do storage. A transcrição (dado estruturado, revisável por
  humano) segue a política geral de retenção de prontuário
  (`politica-retencao-dados.md`), **não** os 7 dias.
- Em caso de falha de transcrição, o áudio é preservado para reprocessamento
  manual (fallback R6.5.4: player + edição manual) — o relógio de 7 dias começa
  a partir da resolução (transcrição aceita ou descarte pelo profissional).
- Esta janela de 7 dias deve constar no DPA e no termo de consentimento.

## 4. Gate de implementação (o que o código faz hoje)

- A abstração `AsrProvider` terá `StubAsrProvider` (destrava CI, sem
  transferência) + `OpenAiAsrProvider`/`AzureAsrProvider` (real).
- **O provider real fica atrás de feature flag, DESABILITADO por default.**
  Habilitar exige: (a) este DPA assinado, (b) consentimento atualizado, (c)
  confirmação explícita do Rômulo. Enquanto isso, o produto opera com o stub /
  entrada manual de texto.
- Enquanto o gate não abre, 6.4 (captura + persistência local) pode existir
  como feature-flagged sem enviar nada a provedor externo.

## 5. Perguntas objetivas para o advogado

1. Para a transferência internacional do **áudio** ao ASR, Cláusulas-Padrão do
   provedor + consentimento específico bastam, ou o Iris precisa de DPA próprio
   negociado (como a mesma dúvida do briefing §4 para o LLM de texto)?
2. A janela de **7 dias** de retenção do áudio bruto é defensável, ou o áudio
   deve ser eliminado imediatamente após a transcrição?
3. O consentimento do áudio precisa ser um aceite **separado** do consentimento
   do LLM de texto, ou pode ser um único termo cobrindo ambas as transferências?

**Resposta do advogado:** ☐ Alinhado &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

**Referências cruzadas:** `briefing-para-advogado.md` §4 (transferência do LLM
de texto), `politica-retencao-dados.md` (retenção de prontuário),
`.specs/features/fase6/spec.md` A6/A8, `docs/arquitetura/checklist-producao-mvp.md`.
