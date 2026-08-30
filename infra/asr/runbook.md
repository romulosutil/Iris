# Runbook — Serviço ASR self-hosted (Iris, #72)

> Escopo: serviço `iris-asr` (faster-whisper), container Python interno ao
> Swarm do Easypanel. Sem GPU, VPS Hostinger (4 vCPU / 16 GB).

## 0. Rotas

| Rota            | Método | Autenticação                    | Corpo                        |
| ---------------- | ------ | -------------------------------- | ----------------------------- |
| `/saude`          | GET    | nenhuma                          | —                              |
| `/transcrever`     | POST   | `Bearer ${ASR_SERVICE_TOKEN}`     | bytes crus do áudio (webm/opus) |

## 1. Variáveis de ambiente

| Variável             | Papel                                             | Obrigatória |
| --------------------- | -------------------------------------------------- | ----------- |
| `ASR_MODEL_SIZE`       | Tamanho do modelo carregado (tem que casar com o `ARG` do build) | sim |
| `ASR_LANGUAGE`         | Idioma forçado na transcrição, default `pt`         | não |
| `ASR_SERVICE_TOKEN`    | Bearer comparado em `/transcrever`                  | sim |
| `PORT`                 | Porta HTTP, default `8080`                          | não |

## 2. Benchmark — small vs medium (T06)

> **[x] CONFIRMADO — medido de verdade no serviço `iris-asr` implantado no
> Easypanel (VPS Hostinger, 4 vCPU / 16 GB, sem GPU), 30/08/2026.** Memória
> `verificar-fato-de-infra-com-medicao`. Clipe: 134,6s (~2min14s) de áudio
> PT-BR clínico sintético (TTS `pt-BR-FranciscaNeural`, texto de nota de
> sessão plausível — não gravação real; o número mede throughput de CPU, que
> independe do conteúdo). 3 execuções por modelo via `POST /transcrever`
> através do domínio público temporário do serviço, medindo o request
> completo (rede + fila + inferência).

| Modelo   | Tempo (mediana, 3 execuções) | Razão p/ duração do clipe | RAM observada (container) | Decisão |
| -------- | ----------------------------- | -------------------------- | --------------------------- | ------- |
| `small`  | 43,31s (43,17 / 43,31 / 46,13) | 0,32x                       | ~423 MB                      | **Escolhido** |
| `medium` | 104,29s (104,22 / 104,29 / 106,06) | 0,77x                   | ~1,2 GB                      | Descartado |

**Decisão: `small`.** Ambos processam mais rápido que a duração do áudio
(folga pra fila), mas `medium` usa 2,4x mais tempo de CPU por clipe — numa
VPS de 4 vCPU compartilhada com todos os outros serviços do Iris (billing,
escalonamento, retenção, app, Postgres...), essa folga desaparece rápido sob
concorrência real. `small` deixa margem pra processar múltiplos clipes em
fila sem competir por toda a CPU da VPS. **Proposta de arquitetura — validar
com Rômulo antes de fechar T08** (regra do CLAUDE.md: decisão nova de
arquitetura marca como pendente).

O tick do agendador (T08) e o teto de concorrência **citam este número**:
com small em 0,32x tempo real, um teto de concorrência de 2-3 clipes
simultâneos ainda deixa a fila drenar mais rápido que ela enche num fluxo
de ditado normal (clipes gravados em tempo real pelo terapeuta).

## 3. Prova de boot sem rede

`Dockerfile` tem uma camada `RUN --network=none` que recarrega o modelo do
cache da imagem sem acesso à rede. Se o build passar por essa camada, o boot
em produção não depende do HuggingFace Hub estar no ar.

Confirmar manualmente, se necessário:

```bash
docker build --network=none -f infra/asr/Dockerfile .
# Deve completar sem erro de rede — senão o cache do modelo não está na imagem.
```

## 4. Incidentes

| Sintoma                                  | Causa provável                                                   | Ação |
| ------------------------------------------ | ------------------------------------------------------------------ | ---- |
| `/saude` não responde                      | Container não subiu — checar log de boot, modelo pode ter falhado ao carregar | Reimplantar; se persistir, checar RAM disponível na VPS |
| `401` em todo `/transcrever`                | `ASR_SERVICE_TOKEN` ausente/divergente entre app e serviço          | Conferir env dos dois lados no Easypanel |
| `/transcrever` lento além do medido no §2  | VPS sob carga concorrente (outro serviço competindo por CPU)         | Checar uso de CPU da VPS; considerar reduzir teto de concorrência do agendador |
