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

> ⚠️ **PENDENTE DE MEDIÇÃO NA VPS REAL.** Memória
> `verificar-fato-de-infra-com-medicao`: `[x] CONFIRMADO` sem prova custa mais
> que `[ ]`. As linhas abaixo são o **procedimento**, não o resultado — não
> marcar como feito até rodar de verdade no Easypanel (4 vCPU / 16 GB, sem
> GPU) com um clipe de 2 min de áudio PT-BR clínico real.

Procedimento:

1. Build local da imagem com `--build-arg ASR_MODEL_SIZE=small` e depois
   `medium`, publicar as duas no Easypanel (ou trocar o build-arg e
   reimplantar).
2. No console do container (Easypanel → serviço `iris-asr` → Console):
   ```bash
   time curl -s -X POST http://localhost:8080/transcrever \
     -H "Authorization: Bearer ${ASR_SERVICE_TOKEN}" \
     --data-binary @clipe-2min-ptbr.webm -o /dev/null
   ```
3. Repetir 3x por tamanho de modelo, registrar a mediana abaixo.

| Modelo   | Tempo (mediana, 3 execuções) | RAM observada | Decisão |
| -------- | ----------------------------- | -------------- | ------- |
| `small`  | _a medir_                     | _a medir_      | —       |
| `medium` | _a medir_                     | _a medir_      | —       |

O tick do agendador (T08) e o teto de concorrência **citam este número** —
não escolher antes de medir.

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
