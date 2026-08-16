# Plano de Implementação — D11 (Issue #120): Pipeline RAG, Tokenização e Treinamento

> **Status:** 🟢 Pronto para Execução TDD  
> **Data:** 16/08/2026  
> **Objetivo:** Implementar o pipeline completo de tokenização, de-identificação LGPD, indexação vetorial multi-tenant, recuperação híbrida com RRF/MMR e geração de datasets SFT/DPO sobre históricos clínicos exportados.

---

## Mapeamento de Arquivos

### Módulos a Criar (`src/lib/rag/`):

- `src/lib/rag/types.ts`: Definições canônicas de tipos TypeScript.
- `src/lib/rag/sanitizer.ts` & `src/lib/rag/sanitizer.test.ts`: De-identificação e higienização LGPD de históricos clínicos.
- `src/lib/rag/tokenizer.ts` & `src/lib/rag/tokenizer.test.ts`: Estimativa de tokens pt-BR e controle de janela de contexto.
- `src/lib/rag/chunker.ts` & `src/lib/rag/chunker.test.ts`: Segmentação hierárquica e semântica com injeção de metadados.
- `src/lib/rag/embedding.ts` & `src/lib/rag/embedding.test.ts`: Provedor e normalizador de vetores de embedding.
- `src/lib/rag/vector-store.ts` & `src/lib/rag/vector-store.test.ts`: Store vetorial multi-tenant em memória com guardrail de clinicId.
- `src/lib/rag/retriever.ts` & `src/lib/rag/retriever.test.ts`: Busca híbrida (Vetorial + BM25) com RRF, MMR e projeção de `historico_relevante`.
- `src/lib/rag/training-pipeline.ts` & `src/lib/rag/training-pipeline.test.ts`: Gerador de datasets SFT/DPO com split anti-leakage por paciente.
- `src/lib/rag/dossier-loader.ts` & `src/lib/rag/dossier-loader.test.ts`: Ingestor de prontuários e dossiês exportados.
- `src/lib/rag/index.ts`: Ponto de entrada público do pacote.

### Documentação a Atualizar:

- `BACKLOG.md`: Atualizar status do débito D11 / Issue #120.

---

## Passos de Execução (TDD)

- [x] **Etapa 1:** Criar `src/lib/rag/types.ts` com interfaces para documentos clínicos, chunks, metadados, embeddings, buscas e datasets de treino.
- [ ] **Etapa 2:** Implementar `src/lib/rag/sanitizer.ts` com testes unitários cobrindo remoção de CPF, nomes e preservação de termos clínicos (VB-MAPP, ajuda, metas).
- [ ] **Etapa 3:** Implementar `src/lib/rag/tokenizer.ts` com testes unitários para contagem de tokens e cálculo de orçamento de contexto.
- [ ] **Etapa 4:** Implementar `src/lib/rag/chunker.ts` com testes unitários para segmentação por sessões, metas e metadados contextuais.
- [ ] **Etapa 5:** Implementar `src/lib/rag/embedding.ts` com provedores de embedding e testes unitários.
- [ ] **Etapa 6:** Implementar `src/lib/rag/vector-store.ts` com isolamento estrito de `clinicId` e testes unitários.
- [ ] **Etapa 7:** Implementar `src/lib/rag/retriever.ts` com BM25, RRF, MMR e projeção para o formato de `historico_relevante` com testes.
- [ ] **Etapa 8:** Implementar `src/lib/rag/training-pipeline.ts` com particionamento anti-leakage por hash de paciente e exportação JSONL.
- [ ] **Etapa 9:** Implementar `src/lib/rag/dossier-loader.ts` conectando os dossiês exportados ao pipeline RAG.
- [ ] **Etapa 10:** Criar `src/lib/rag/index.ts` exportando as APIs públicas do módulo.
- [ ] **Etapa 11:** Executar suite completa (`pnpm test --project=unit`, `pnpm typecheck`, `pnpm lint`), atualizar `BACKLOG.md` e abrir Pull Request.
