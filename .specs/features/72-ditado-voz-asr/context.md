# Context — Issue #72: Ditado de Voz (ASR self-hosted)

> Decisões do Rômulo + fatos medidos no repo em 30/08/2026, antes do design de execução.
> Este arquivo existe porque o design doc (`docs/superpowers/specs/2026-08-02-issue-72-ditado-voz-asr-design.md`)
> foi escrito como se #72 fosse greenfield. **Não é.**

## 1. O que já existe em produção (medido, não presumido)

| Peça                                            | Onde                                                    | Estado                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Gravador **single-clipe** com persist-on-record | `src/app/(app)/diario/[sessionId]/audio-local.tsx`      | Funciona; aba "Áudio" do diário (`captura-form.tsx:127`)                                                                                |
| Store IndexedDB                                 | `src/lib/audio/local-store.ts`                          | DB `iris-audio`, store `iris-audio-rascunho`, ops `salvar/ler/apagar`                                                                   |
| Tabela `audio_capture`                          | `src/db/schema.ts:1140`                                 | RLS + FORCE, policies `audio_select/insert/update` (`0006`), gate de consentimento (`0053`), sigilo (`0123`), helper de tenant (`0085`) |
| Grants coluna-a-coluna                          | `db/migrations/0006_fase2_rls.sql:126`                  | `GRANT UPDATE (status_upload, objeto_ref, duracao_segundos)` — **coluna nova exige GRANT explícito**                                    |
| Expurgo LGPD                                    | `db/migrations/0128_retencao_expurgo_wiring.sql:162`    | `DELETE FROM audio_capture` já no expurgo por paciente                                                                                  |
| Export do acervo                                | `src/lib/export/acervo/coletor.ts:84`                   | `audio_capture` já entra na exportação integral                                                                                         |
| Action de registro                              | `diario/[sessionId]/logic.ts:222` `registrarAudioLocal` | insere `audio_capture` + desarquiva paciente; envolvida em `comEscrita`                                                                 |
| Enum `audio_status_upload`                      | `schema.ts`                                             | `rascunho_local \| pendente \| confirmado \| falhou`                                                                                    |

## 2. Conflitos do design doc com a realidade — resolvidos aqui

| Design doc diz                               | Realidade                                                                  | Resolução                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| criar `src/components/ui/gravador-audio.tsx` | existe `diario/[sessionId]/audio-local.tsx`                                | **Evoluir o existente** (D1)                                      |
| `src/app/(app)/sessoes/asr/logic.ts`         | rota `sessoes/` não existe; é `diario/[sessionId]/`                        | Ação mora em `diario/[sessionId]/`                                |
| IndexedDB store `audio_drafts`               | store real é `iris-audio-rascunho`                                         | Manter o nome real; não renomear store com dado de usuário dentro |
| `FEATURE_FLAG_ASR_ENABLED`                   | repo **não tem nenhum padrão de feature flag**; `.env.example` sem entrada | Criar o primeiro (D5)                                             |
| TTL 7 dias do áudio no servidor              | `objeto_ref` sempre `NULL` hoje; nenhum áudio no servidor                  | **Efêmero** (D3)                                                  |

## 3. Decisões travadas (Rômulo, 30/08/2026)

- **D1 — Componente:** evoluir `audio-local.tsx` para multi-clipe, no lugar onde já está. Não criar primitivo novo, não manter duas UIs.
- **D2 — Sincronia:** **fila assíncrona + polling**. O server action enfileira e devolve na hora; a UI faz polling e preenche parágrafos conforme chegam.
- **D3 — Storage do áudio bruto:** **efêmero, sem TTL de 7 dias**. O objeto vive só enquanto o clipe está em processamento e é apagado no `finally` — sucesso ou falha. Clipe que falha **não fica no servidor**: o blob ainda está no IndexedDB do terapeuta, que reenvia.
- **D4 — Modelo de dados:** **colunas novas em `audio_capture`**, não tabela nova. Herda RLS, gate de consentimento, sigilo, expurgo (`0128`) e export de acervo já existentes.
- **D5 — Feature flag:** criar `FEATURE_FLAG_ASR_ENABLED` como trava de **maturidade/qualidade**, não de DPA.

## 4. Fatos de infra medidos

- **VPS:** KVM 4 — **4 vCPU / 16 GB, sem GPU** (`docs/arquitetura/plano-bootstrap-e-stack-vps.md:251`).
  Confirma D2: `faster-whisper` em CPU pura não sustenta espera síncrona de lote.
  ⚠️ **A taxa real (× tempo real) não foi medida.** T6 tem um passo de benchmark obrigatório — o tamanho do modelo (`small` vs `medium`) e o tick do agendador saem dessa medição, não de estimativa.
- **Easypanel não tem cron** (`infra/retencao/agendador.sh` cabeçalho). Job = script versionado no repo + campo "Comando" do painel.
- **Host interno** de serviço no Swarm: `espectro-mvp_<servico>`.
- **Imagem de job não herda deps do app** — por isso a lógica mora numa rota do app e o job é POST magro (`api/internal/billing/fechar-ciclos/route.ts`, cabeçalho).
- **Precedente exato de fila:** `src/lib/export/acervo/motor.ts:141-170` — reserva atômica de item via `SECURITY DEFINER` com incremento de `tentativas`, justamente porque `FORCE RLS` + policy só `TO app_role` deixaria o worker vendo fila vazia.

## 5. Legal — verificado, sem pendência

- `docs/legal/termo-consentimento-titular-adulto.md:232` **§8.1 já existe** e discrimina "Ditado assíncrono — o profissional grava um ou mais áudios curtos (o titular não fala nesses áudios)".
- Linha 251-252: áudio bruto descartado "imediatamente após a transcrição ser aceita"; em falha, "no máximo **7 dias**".
  **D3 (efêmero) é mais restrito que o termo promete** → satisfaz a cláusula sem alterar `docs/legal/`. Nenhuma mudança legal nesta issue.
- `docs/legal/dpa-asr-audio.md` §2/§5 (DPA/SCC/ZDR) **fica sem objeto no V1**: motor self-hosted, áudio nunca sai da infra Iris → não há transferência internacional (LGPD Art. 33).

## 6. Corte de entrega recomendado

**T01→T03 (migração + fila cross-tenant + teste RLS) é entregável isolado**, sem depender do serviço ASR de pé: não toca UI, não toca storage, não toca provider. Roda como PR pequena e revisável enquanto **T06 (benchmark na VPS)** — o bloqueio real, ver §4 — está em aberto. T06 deve rodar **fora da ordem de dependência do `tasks.md`**, o quanto antes, porque o resultado pode mudar D2: se `medium` for lento demais em CPU pura e `small` não tiver precisão aceitável em PT-BR clínico, a decisão de self-hosted volta à mesa e o gate de DPA da Hostinger reabre — o que muda T05-T08 inteiros. Não vale montar a fila e o worker antes de saber se o motor performa.

## 7. Fora de escopo

- **Modo 3** (gravação da sessão inteira): adiado por decisão de produto. Design preservado em §4 do design doc.
- Provedor externo (Google/Gemini): só volta se o self-hosted não performar; aí o gate de DPA volta a valer.
