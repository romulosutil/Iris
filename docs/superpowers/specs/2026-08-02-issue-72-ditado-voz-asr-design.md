# Design Spec — Issue #72: Fase 6b - Ditado de Voz (Captura Local & Pipeline ASR)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#72](https://github.com/romulosutil/Iris/issues/72)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
A gravação de voz e transcrição automática (ASR) reduzem a dor diária do terapeuta no registro das sessões. No entanto, o envio de áudio bruto para provedores em nuvem possui alto risco regulatório de privacidade.

### 1.2 A Solução
Implementar a captura de áudio local com persistência resiliente em IndexedDB e abstração de pipeline ASR pt-BR, mantendo o provider real **desabilitado por feature flag** até a assinatura do DPA de áudio.

---

## 2. Especificação Técnica & Travas Legais

### 2.1 Gate Legal Inegociável
* Bloqueio por Feature Flag: `FEATURE_FLAG_ASR_ENABLED` inicia `false`.
* Utilização de `StubAsrProvider` em CI e testes.
* Ativação condicional à assinatura do DPA de áudio (`docs/legal/dpa-asr-audio.md`) com retenção máxima de 7 dias para o áudio bruto no provedor.

### 2.2 Captura & Persistência Local (Fatia 6.4)
* Componente `AudioCapture`: dual-codec (`webm;opus` em navegadores modernos, `mp4;aac` em iOS).
* Armazenamento em IndexedDB `audio_drafts` no cliente durante o registro. Purga garantida no logout e pós-confirmação de upload.

### 2.3 Pipeline ASR & Fallback (Fatia 6.5)
* Interface `AsrProvider`: desacopla a aplicação do provedor (OpenAI Whisper / Azure Speech).
* Fallback: Em caso de falha de conexão ASR, o áudio é preservado localmente e o terapeuta pode ouvir e digitar manualmente no editor.

---

## 3. Plano de Verificação

1. Teste unitário de `StubAsrProvider` simulando transcrição sem chamadas de rede.
2. Teste de purga do IndexedDB `audio_drafts` ao efetuar logout.
