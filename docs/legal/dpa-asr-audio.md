# DPA & Gating de Áudio (ASR externo) — Iris

**Status: parecer jurídico recebido (ver §5) — pendente formalização (adesão
ao DPA/BAA Enterprise do provedor + ativação de endpoint Zero Data Retention +
atualização do termo de consentimento) antes de habilitar ASR real com dado de
paciente.** Este documento
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
3. **Transcrição por ASR externo = transferência internacional.** O
   provedor de ASR processa **fora do Brasil**. Enviar áudio a esse
   provedor é **transferência internacional de dado sensível** (LGPD Art.
   33), com o provedor de ASR atuando como **subprocessador** — uma parte a
   mais na cadeia que o §4 do briefing (que só menciona o LLM de texto) não
   enderaçava.

> **Nota sobre conteúdo do áudio (importante para classificação de risco):**
> nos 3 modos de captura (§6), o áudio registra **majoritariamente a voz do
> profissional** — narrando um resumo pós-sessão (modo 2) ou conduzindo a
> sessão com fone de ouvido e supressão de ruído priorizando o microfone do
> profissional (modo 3). Não é uma gravação deliberada da voz do paciente.
> Isso não elimina o risco (captação incidental do ambiente é fisicamente
> possível no modo 3), mas muda a classificação de "gravação biométrica do
> paciente/menor" para "nota de trabalho do profissional, com dado de saúde
> do paciente relatado nela" — mesma natureza do texto do diário já tratado
> hoje, só que em áudio. A base legal e a retenção seguem as mesmas do
> texto da sessão; o item novo é o subprocessador de ASR (transferência
> internacional).

## 2. Salvaguardas exigidas antes de habilitar ASR real

Espelha e estende a lógica já aceita para o LLM de texto (briefing §4), agora
para a cadeia de áudio:

- **Base de transferência (Art. 33).** Cláusulas-Padrão Contratuais
  (Resolução CD/ANPD nº 19/2024) OU consentimento específico do titular para a
  transferência do áudio. A transferência do áudio deve ser **citada
  explicitamente** no termo de consentimento (não herdar do consentimento do
  LLM de texto — é outra finalidade e outro subprocessador).
- **Adesão ao DPA/BAA Enterprise do provedor (não negociado).** Parecer
  jurídico (§5.1): não é necessário negociar DPA customizado com big techs
  (o próprio Google, entre outros, raramente aceita minuta de terceiro).
  Basta adesão formal ao DPA/BAA Enterprise do provedor com Cláusulas-Padrão
  Contratuais (SCCs) + ativação de endpoint com Zero Data Retention (tier
  pago, não gratuito). Equivalência das cláusulas do tier corporativo é
  defensável perante a ANPD (Res. 19/2024). Provedor escolhido: Google —
  ver §6.
- **Zero data retention / não-treino no provedor.** Exigir do subprocessador
  ASR: não retenção do áudio para treino, e retenção operacional mínima. Sem
  essa cláusula, o provedor está descartado.
- **Minimização.** Só o áudio da sessão vai ao ASR — nunca metadado de
  paciente identificável junto do payload de áudio.

## 3. Retenção do áudio bruto — 7 dias

O áudio bruto é a cópia mais sensível e tem valor efêmero (existe só para gerar
a `SessionNote`/transcrição, que é o artefato clínico durável). Parecer
jurídico (§5.2): janela de 7 dias é defensável, mas só como TTL estrito de
**falha** — não como regra geral. Regra atualizada:

- **Transcrição bem-sucedida → deleção imediata** do áudio bruto do storage
  assim que a transcrição é aceita pelo profissional. Não há janela de espera
  no caminho feliz. A transcrição (dado estruturado, revisável por humano)
  segue a política geral de retenção de prontuário
  (`politica-retencao-dados.md`).
- **Falha de transcrição → TTL estrito de 7 dias.** O áudio é preservado só
  pelo período de contingência operacional para reprocessamento manual
  (fallback R6.5.4: player + edição manual). Justificar no RIPD/DPA pela
  finalidade de contingência e auditoria de erro. O relógio começa a partir da
  falha e encerra na resolução (transcrição aceita ou descarte pelo
  profissional) ou aos 7 dias, o que ocorrer primeiro.
- Esta janela de 7 dias (só falha) deve constar no DPA e no termo de
  consentimento.

## 4. Gate de implementação (o que o código faz hoje)

- A abstração `AsrProvider` terá `StubAsrProvider` (destrava CI, sem
  transferência) + `GoogleAsrProvider` (real — ver §6 sobre escolha de
  provedor).
- **O provider real fica atrás de feature flag, DESABILITADO por default.**
  Habilitar exige: (a) este DPA assinado, (b) consentimento atualizado, (c)
  confirmação explícita do Rômulo. Enquanto isso, o produto opera com o stub /
  entrada manual de texto.
- Enquanto o gate não abre, 6.4 (captura + persistência local) pode existir
  como feature-flagged sem enviar nada a provedor externo.

## 6. Provedor de ASR: Google, não OpenAI/Azure

O LLM de texto do Iris já usa **Google (Gemini API)** — decisão registrada em
`politica-privacidade.md` §4 (21/08/2026). Para ASR, consolidar no mesmo
fornecedor em vez de introduzir OpenAI ou Azure como segundo subprocessador:

- **Menos subprocessadores = menos DPA para negociar/auditar.** Um único
  fornecedor (Google) cobre texto e áudio, em vez de dois.
- Duas opções técnicas dentro do Google: (a) **Gemini nativo** — o modelo
  aceita áudio como input multimodal e pode transcrever diretamente, sem API
  de ASR separada; (b) **Google Cloud Speech-to-Text**, se precisar de
  transcrição dedicada fora do fluxo do LLM. Escolha entre as duas é decisão
  de implementação (T3), não muda o gate legal.
- As mesmas 3 pendências já registradas para o LLM de texto (§4 da política
  de privacidade) valem para ASR: conta com faturamento pago ativo (tier
  gratuito treina modelo com o conteúdo enviado — incompatível com dado de
  saúde), confirmar que o serviço usado está no escopo do DPA do Google
  Cloud, e que as SCCs do Google satisfazem o Art. 33 da LGPD.

## 7. Três modos de captura (escopo de produto, issue #72)

O ditado por voz não é um modo único — são 3 caminhos que coexistem, cada um
com degradação garantida pro anterior caso o profissional (ou, no modo 3,
implicitamente o titular) não queira usar:

| Modo | Descrição | Consentimento | Risco |
| --- | --- | --- | --- |
| 1. Digitação | Terapeuta digita a nota, como hoje. | Nenhum extra (já MVP). | Nenhum. |
| 2. Ditado assíncrono | Terapeuta grava 1+ áudios curtos pós-sessão, narrando com a própria voz (estilo áudio de WhatsApp). Paciente não fala no áudio. | Cláusula ASR discriminada (ver termo, §8.1). | Baixo — é nota de trabalho do profissional. |
| 3. Gravação de sessão | Fone de ouvido com supressão de ruído durante o atendimento inteiro, priorizando a voz do profissional. Sempre permite complemento por texto (a gravação pode ficar incompleta). | Cláusula ASR discriminada + ciência de captação incidental de ambiente. | Médio — capta o ambiente, ainda que minimizado. |

Nenhum modo é obrigatório nem exclusivo: recusa do titular ao modo 3 (ou 2)
não bloqueia o registro da sessão — o profissional sempre pode cair para o
modo 1. O sistema nunca deve ser desenhado como ASR-only.

## 5. Parecer jurídico especializado

1. **Cláusulas-Padrão vs. DPA negociado.** Não é necessário negociar DPA
   customizado com big techs (raramente aceitam minuta de terceiro). Basta
   adesão formal ao DPA/BAA Enterprise com Standard
   Contractual Clauses (SCCs) e ativação de endpoint com Zero Data Retention.
   Para a ANPD (Res. 19/2024), a equivalência das cláusulas contratuais do
   tier corporativo é plenamente defensável.
2. **Janela de retenção do áudio.** Plenamente defensável — mas só como TTL de
   falha, não regra geral —, desde que justificada no RIPD/DPA pela finalidade
   de contingência operacional e auditoria de erro de transcrição. Blindagem
   extra: deleção imediata em caminho de sucesso, 7 dias como limite estrito
   de TTL de falha (aplicado em §3).
3. **Aceite unificado vs. separado.** O termo da clínica com os pais pode ser
   um único documento, desde que contenha destaque visual e finalidades
   explícitas discriminadas (uma cláusula para síntese clínica via LLM, outra
   para processamento e biometria de voz via ASR).

**Status:** ☑ Alinhado — pendente apenas formalização (adesão SCC/ZDR com
provedor escolhido + atualização do termo de consentimento com as duas
cláusulas discriminadas do item 3).

---

**Referências cruzadas:** `briefing-para-advogado.md` §4 (transferência do LLM
de texto), `politica-retencao-dados.md` (retenção de prontuário),
`.specs/features/fase6/spec.md` A6/A8, `docs/arquitetura/checklist-producao-mvp.md`.
