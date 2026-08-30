# syntax=docker/dockerfile:1
# Imagem do serviço ASR self-hosted (Iris, #72).
#
# Container Python separado, molde infra/billing/. NÃO herda nada do app
# Next.js (memória `imagem-escalonamento-nao-herda-app`): toda dependência
# listada à mão abaixo. Se faltar algo aqui, o boot morre em produção com CI
# verde — igual ao #156 do motor de escalonamento.
#
FROM python:3.12-slim

# ffmpeg: faster-whisper decodifica o áudio via ffmpeg no PATH, não embutido
# no wheel. build-essential: alguns wheels de ctranslate2/faster-whisper não
# têm binário pronto para todas as arquiteturas e caem para compilar.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg build-essential \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Versões fixadas — nada de range aberto: uma minor nova de faster-whisper ou
# ctranslate2 muda output binário do modelo baixado no build seguinte.
COPY infra/asr/requirements.txt ./requirements.txt
COPY infra/asr/clear_execstack.py ./clear_execstack.py
RUN pip install --no-cache-dir -r requirements.txt \
	# ctranslate2 embarca .so com flag PT_GNU_STACK executável; kernels com
	# proteção de exec-shield/PaX recusam mapear isso ("cannot enable
	# executable stack"). Pacote `execstack` saiu dos repos do Debian
	# trixie e `objcopy` não tem flag equivalente — script Python zera o
	# bit direto no ELF (clear_execstack.py).
	&& find /usr/local/lib/python3.12/site-packages -name '*.so*' -exec python3 clear_execstack.py {} +

# ARG, não ENV: entra só no build, decide qual modelo baixar agora. Em
# runtime o container lê ASR_MODEL_SIZE (env real, setado no Easypanel) para
# saber qual instanciar — as duas variáveis têm que casar, ou o servidor.py
# tenta carregar um modelo que não está no cache da imagem e cai para baixar
# em runtime, quebrando a garantia de --network=none abaixo.
ARG ASR_MODEL_SIZE=small
ENV ASR_MODEL_SIZE=${ASR_MODEL_SIZE}

# Modelo baixado NA BUILD, não em runtime (memória
# `build-docker-depende-de-rede-externa`) — senão o primeiro boot em produção
# depende de rede externa (HuggingFace Hub) e uma falha de rede lá vira
# incidente de disponibilidade do Iris. HF_HOME fixo para o cache cair num
# caminho estável e conhecido, que o RUN --network=none abaixo confirma.
ENV HF_HOME=/app/.cache/huggingface
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${ASR_MODEL_SIZE}', device='cpu', compute_type='int8')"

# HF_HUB_OFFLINE=1 DEPOIS do download acima, nunca antes — senão o próprio
# download que baixa o modelo falha (LocalEntryNotFoundError). É o que faz a
# garantia de "sem rede" valer em RUNTIME, não só no build: sem ela,
# huggingface_hub tenta um GET de metadata a cada boot mesmo com o modelo já
# em cache (visto em produção — log do container mostrando "HTTP Request:
# GET https://huggingface.co/..." mesmo com o RUN --network=none abaixo
# provando o cache completo no build). Com rede real disponível o GET passa,
# mas o serviço fica dependendo de rede externa pra subir sempre que ela
# estiver fora — exatamente o incidente que este Dockerfile existe pra evitar.
ENV HF_HUB_OFFLINE=1

COPY infra/asr/servidor.py ./servidor.py

# PROVA que o boot não depende de rede externa: se o modelo não estivesse no
# cache da imagem, carregar aqui tentaria baixar e falharia sem rede. Camada
# de build dedicada, sem efeito no runtime — existe só para o gate do T06.
RUN --network=none python -c "from faster_whisper import WhisperModel; import os; WhisperModel(os.environ['ASR_MODEL_SIZE'], device='cpu', compute_type='int8')"

EXPOSE 8080

CMD ["python", "servidor.py"]
