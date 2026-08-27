# Levantamento de controles de segurança — o que é medível hoje

> **Status:** levantamento (Gate 1 da #454). **Não é o Termo de Governança e Criptografia.**
> Nada aqui vira texto entregável a convênio, auditoria ou família antes da aprovação explícita do Rômulo (Gate 2).

## Por que este documento existe

A #277 pediu um "download do termo de governança e criptografia". A tentativa no PR #448 (removida do escopo) emitia um artefato que se descrevia como _"evidência oficial de postura de segurança"_ e cujo corpo dizia que a plataforma **"declara e certifica"** seis controles — todos hardcoded como string literal em componente React, **nenhum medido**.

Documento que a clínica entrega a um convênio assume garantia contratual. Se a alegação for falsa, **a clínica** responde por ela, não o Iris. Precedente do repo: fato de infra se verifica **medindo**, não lendo — `[x] CONFIRMADO` sem prova custa mais que `[ ]`.

Este arquivo registra, por alegação: o comando, a saída e o veredito.

**Data das medições:** 24/08/2026.

---

## Placar

| #   | Alegação original                                           | Veredito                                                                                                      |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | "AES-256 em repouso (Postgres e S3)"                        | ❌ **Não sustentável.** Nenhuma cifragem em repouso configurada no repo; VPS medida em 26/08/2026, sem cifragem de volume |
| 2   | "TLS 1.3 obrigatório para todas as conexões"                | ❌ **Falsa como escrita.** TLS 1.3 disponível na borda, mas 1.2 é aceito e a conexão app↔Postgres é em claro  |
| 3   | "Backup diário off-site cifrado, retenção auditada 30 dias" | ⚠️ **Parcial.** Cifragem off-site confirmada; retenção com evidência indireta (33d operação, 0 objetos vencidos) mas sem leitura direta da regra no console OCI |
| 4   | "Isolamento multi-tenant por RLS"                           | ✅ **Sustentável.** Única alegação coberta por medição automatizada e repetível                               |
| 5   | "Zero Training Policy"                                      | ⚠️ **Garantia de terceiro.** Não é controle da plataforma; a redação tem que dizer de quem é                  |
| 6   | "Conformidade LGPD Art. 11 e 14"                            | ⚠️ **Reformular.** As bases legais existem e estão documentadas; "conformidade" como carimbo não              |

---

## 1 — AES-256 em repouso (Postgres e S3)

### O que foi medido

Postgres **não** cifra dados em repouso por padrão — não há TDE nativo. A cifragem, quando existe, é do volume/disco abaixo dele.

```console
$ grep -rniE 'sse|encrypt|server-side' infra/README.md infra/docker-compose.yml
(sem ocorrência de configuração de cifragem)

$ sed -n '29,40p' infra/docker-compose.yml
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: iris
      MINIO_ROOT_PASSWORD: iris123456
```

MinIO sobe **sem** `MINIO_KMS_*` e sem SSE-S3/SSE-KMS default no bucket. Objetos de áudio ficam em claro no volume.

### Cifragem de disco da VPS Hostinger — medido em 26/08/2026

Console do serviço `iris-postgres` no Easypanel (`31.97.170.105:3000`), Bash como root. `lsblk` lê `/sys/block`, que não é namespaced por container — a saída reflete o disco real do host, não uma visão isolada do container:

```console
$ lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINT
NAME    TYPE FSTYPE MOUNTPOINT
sda     disk
├─sda1  part        /var/lib/postgresql/data
├─sda14 part
├─sda15 part
└─sda16 part
sr0     rom

$ cryptsetup status sda1
bash: cryptsetup: command not found   # não instalado na imagem; irrelevante — critério já decidido abaixo
```

Layout `sda1/14/15/16` é o padrão GRUB-BIOS + ESP de VPS cloud-init — confirma que é o disco de boot real, não um volume secundário. **Nenhuma linha tem `TYPE=crypt` nem `FSTYPE=crypto_LUKS`.** Pelo critério definido abaixo, isso fecha a pergunta: não há cifragem em repouso no host.

### Veredito

A alegação **não pode entrar no termo** no estado atual. Ou o controle é implementado (cifragem de volume + SSE no MinIO), ou a linha é removida. Escrever "AES-256 em repouso" hoje é afirmar controle inexistente.

---

## 2 — TLS 1.3 obrigatório para todas as conexões

### Borda pública (`irisclinica.ia.br`)

```console
$ echo | openssl s_client -connect irisclinica.ia.br:443 -servername irisclinica.ia.br -tls1_3
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Protocol: TLSv1.3
Verify return code: 0 (ok)

$ echo | openssl s_client -connect irisclinica.ia.br:443 -servername irisclinica.ia.br -tls1_2
New, TLSv1.2, Cipher is ECDHE-ECDSA-CHACHA20-POLY1305
Protocol: TLSv1.2
Verify return code: 0 (ok)
```

TLS 1.3 **está disponível** e negocia AES-256-GCM. Mas **TLS 1.2 também é aceito** — logo 1.3 não é _obrigatório_, é _preferido_. A palavra "obrigatório" é falsa.

> TLS 1.1 e 1.0 não foram medidos de forma conclusiva: o `openssl` local recusa a versão antes de abrir o socket (`no protocols available`), então o erro é do cliente, não resposta do servidor. Medir de fora, com ferramenta que ainda ofereça os protocolos antigos, fica em aberto.

### Conexão aplicação ↔ Postgres

```console
$ grep -rn 'sslmode' --include=*.ts --include=*.example .
(nenhuma ocorrência em todo o repositório)

$ sed -n '47p' src/db/client.ts
  const instance = postgres(url, { max: 10 });

$ docker exec infra-postgres-1 psql -U iris -d iris -tAc "show ssl;"
off
```

O cliente `postgres.js` **só negocia TLS quando `ssl` é passado explicitamente** — na opção ou como `?sslmode=` na URL. Nenhum dos dois existe no repo. O servidor local de paridade responde `ssl = off`. A conversa app↔banco trafega **em claro** na rede interna do Docker.

### Veredito

"TLS 1.3 obrigatório para **todas** as conexões" é falsa em duas frentes. Redação sustentável descreveria só a borda pública, e sem "obrigatório" — ou o controle é apertado (recusar < 1.3 no proxy; ligar TLS no par app↔Postgres) e aí a frase passa a valer.

---

## 3 — Backup diário off-site cifrado, retenção auditada de 30 dias

### Cifragem: confirmada

```console
$ grep -n 'age -r' infra/backup/backup.sh
588: if ! age -r "${OFFSITE_AGE_RECIPIENT}" -o "${OFFSITE_TMP_DIR}/${OFFSITE_NAME}" "${FINAL_PATH}" \
589:  || ! age -r "${OFFSITE_AGE_RECIPIENT}" -o "${OFFSITE_TMP_DIR}/${OFFSITE_GLOBALS_NAME}" "${GLOBALS_PATH}" \
590:  || ! age -r "${OFFSITE_AGE_RECIPIENT}" -o "${OFFSITE_TMP_DIR}/${OFFSITE_TOMBSTONES_NAME}" "${TOMBSTONES_PATH}"; then
```

Dump, globals e tombstones são cifrados com `age` para a chave **pública** antes de subir. O VPS não tem a chave privada — quem tem o bucket não lê o conteúdo. Isso sustenta a palavra "cifrado".

### "Retenção auditada de 30 dias": a parte que não é o que parece

```console
$ grep -n 'RETENTION_DAYS:-30' infra/backup/backup.sh infra/backup/expurgo-offsite.sh
backup.sh:208:          readonly RETENTION_DAYS="${RETENTION_DAYS:-30}"
expurgo-offsite.sh:106:  readonly RETENTION_DAYS="${RETENTION_DAYS:-30}"

$ grep -n 'prune off-site' infra/backup/backup.sh
708: log_info "prune off-site: NÃO executado pelo script (por design) — retenção é regra de lifecycle do bucket ${OFFSITE_S3_BUCKET}"
```

Três coisas que a frase original esconde:

1. **O expurgo off-site audita por padrão; não apaga.** `--expurgar` é opt-in manual. O rodar normal reporta conformidade e sai — a exclusão depende da regra de lifecycle do bucket, configuração de fora do repo.
2. **A poda mede `mtime`, não a data no nome.** Objeto de nome antigo subido hoje não vence. Auditar por nome e apagar por mtime são coisas diferentes.
3. **A chave `age` do off-site já foi perdida e regerada uma vez.** Backup cifrado com chave indisponível é backup irrecuperável — e `exit 0` + header `age` + tamanho certo são compatíveis com esse estado.

### Evidência indireta da lifecycle rule — medido em 26/08/2026

Sem acesso ao console OCI, mas o log de produção do serviço `iris-backup` (Easypanel) já roda a própria auditoria do `expurgo-offsite.sh` diariamente:

```console
[expurgo-offsite] bucket=iris-backups-offsite · retenção=30d · modo=AUDITORIA (padrão: NÃO apaga nada)
[expurgo-offsite] objetos com idade > 30d encontrados: 0
[expurgo-offsite] CONFORMIDADE LGPD ART. 46 VERIFICADA: o bucket iris-backups-offsite não contém nenhum objeto com idade > 30 dias.
```

Isso só é evidência de verdade se o bucket for velho o bastante para ter objeto vencido caso a regra não exista:

```console
$ git log --diff-filter=A --format="%ad %s" --date=short -- infra/backup/backup.sh
2026-07-24 feat(infra): backup pg_dump agendado + restore testado (#75 Etapa 5)
```

`backup.sh` roda desde 24/07/2026 — **33 dias** antes desta medição (26/08/2026), passando a janela de 30 dias. Zero objetos vencidos com essa idade de bucket é sinal real de que algo está podando (regra de lifecycle ou expurgo manual já rodado), não coincidência de bucket jovem.

Não medido diretamente: a regra de lifecycle em si (nome, janela exata) no console OCI — sem credencial nesta sessão. O `env | grep -i offsite` no console do serviço foi bloqueado pelo classificador de permissão do Claude Code por poder expor a credencial em texto — corretamente; não contornado.

### Veredito

"Backup diário off-site cifrado" ✅. "Retenção auditada de 30 dias" ⚠️ **parcial, revisado**: o comportamento observado (33 dias de operação, zero objetos vencidos) é consistente com uma lifecycle rule funcionando, mas não é a mesma prova que ler a regra no console OCI — poderia também ser expurgo manual esporádico. Redação sustentável: _retenção de 30 dias nos volumes locais e no MinIO, executada pelo script; no off-site, auditada diariamente pelo script (zero objetos vencidos observados após 33 dias de operação) e aplicada por regra de lifecycle do bucket, não confirmada diretamente no console_.

---

## 4 — Isolamento multi-tenant por RLS

Única alegação coberta por medição automatizada, repetível e verde no CI.

```console
$ pnpm test:rls
$ vitest run --config vitest.integration.config.ts

[int] app=iris_app(norls) auth=iris_auth_login(norls) owner=iris(owner) schema=ok

 Test Files  126 passed (126)
      Tests  1103 passed (1103)
   Duration  245.96s
```

Duas leituras que a contagem sustenta e o "verde" sozinho não sustentaria:

- **A suíte rodou.** `vitest run` em `*.int.test.ts` sem `--config vitest.integration.config.ts` coleta **zero** arquivos e sai verde sem testar nada. A linha de configuração no comando e a contagem de 126 arquivos são o que distingue cobertura de coleta-zero.
- **Rodou sem privilégio que mascare RLS.** O carimbo `app=iris_app(norls) auth=iris_auth_login(norls)` prova que as conexões de teste **não** são a role dona (que tem `BYPASSRLS`). Suíte RLS rodando como superusuário já passou verde neste repo sem exercer uma policy sequer.

O isolamento não é convenção de código: é policy no banco, com `app_clinic_id_exigido()` levantando `P0001` diagnosticável quando o tenant não está resolvido — em vez de esconder linha em silêncio.

### Veredito

✅ Sustentável. É a alegação que carrega o termo. Redação honesta descreve o mecanismo (RLS no Postgres, cobertura por suíte automatizada no CI) em vez de adjetivar.

---

## 5 — Zero Training Policy

```console
$ grep -rniE 'zero.?training|não.?treino|no.?training' docs/legal/ docs/arquitetura/
docs/legal/dpa-asr-audio.md:52:- **Zero data retention / não-treino no provedor.** Exigir do subprocessador
docs/legal/dpa-asr-audio.md:53:  ASR: não retenção do áudio para treino, e retenção operacional mínima.
```

O único registro é uma **exigência a negociar com subprocessador**, em documento de DPA — não um controle implementado nem cláusula assinada. Os provedores em uso (`src/lib/extraction/claude-provider.ts`, Anthropic; `src/lib/extraction/gemini-test-invoker.ts`, Google) têm política própria de não-treino em uso comercial, mas isso é **contrato de terceiro**.

### Veredito

⚠️ Não é controle da plataforma. Se entrar no termo, a frase tem que nomear de quem é a garantia e sob qual contrato — jamais apresentada como controle próprio do Iris. Precedente: garantia de terceiro apresentada como controle próprio é exatamente o problema do DPA da Hostinger, aceito via ToS e sem residência BR.

---

## 6 — Conformidade LGPD Art. 11 e 14

```console
$ grep -niE 'art\.? ?11|art\.? ?14' docs/legal/politica-privacidade.md
103: pelo menos um dos pais/responsável legal (LGPD Art. 14, §1º) — coletado no
107: titular** (LGPD Art. 7º, I, e Art. 11, I), registrado como
113: serviços de saúde (LGPD Art. 11, II, "f")
308: dado agregado de saúde (vedado pelo Art. 11 da LGPD)
```

As bases legais **estão** identificadas e documentadas: consentimento do titular (Art. 11, I), tutela da saúde por profissional (Art. 11, II, "f"), consentimento de responsável para menor (Art. 14, §1º). `docs/legal/` tem 16 documentos, incluindo política de privacidade, política de retenção e revisão jurídica.

O que **não** existe é auditoria externa que ateste conformidade.

### Veredito

⚠️ Reformular. "Bases legais dos Art. 11 e 14 identificadas e documentadas, com política de privacidade e de retenção publicadas" é verdadeiro e verificável. "Conformidade LGPD" como carimbo é afirmação que ninguém aqui pode emitir.

---

## O que este levantamento fecha e o que deixa em aberto

**Fechado (medido neste documento):**

- TLS da borda pública — versões aceitas
- TLS app↔Postgres — inexistente
- Cifragem em repouso configurada no repo — inexistente (Postgres e MinIO)
- Cifragem do off-site — confirmada (`age`)
- Comportamento real do expurgo off-site
- Cobertura de RLS
- Origem real da "Zero Training Policy"
- Bases legais LGPD documentadas

**Fechado em 26/08/2026 (via console Easypanel):**

- Cifragem de disco da VPS Hostinger — `lsblk` no serviço `iris-postgres`, sem `TYPE=crypt`/`crypto_LUKS`. **Não há cifragem em repouso.**
- Comportamento real do expurgo off-site com idade de bucket suficiente (33 dias) para o teste valer — log de produção do `iris-backup`, zero objetos vencidos. Evidência indireta, não substitui ler a regra no console OCI.

**Aberto (exige acesso que este console não deu):**

1. Regra de lifecycle do bucket off-site na OCI, lida diretamente — console OCI, credencial não disponível nesta sessão. Tentativa de ler `OFFSITE_S3_*` via `env` no console do serviço foi bloqueada pelo classificador de permissão (exposição de credencial em texto) — não contornada.
2. TLS 1.1/1.0 na borda — `openssl` 3.5.x recusa protocolo antes de abrir socket, tanto local quanto na própria VPS (mesma limitação client-side); exige `testssl.sh` ou cliente com provider legacy habilitado

**Fechado (Gate 2 — aprovado por Rômulo em 26/08/2026):**

4. Redação aprovada, por alegação:
   - **AES-256 em repouso** — removida. Sem cifragem implementada, sem alegação.
   - **TLS** — reformulada: "Conexões públicas usam TLS 1.2 ou superior (preferencialmente TLS 1.3)." Sem "obrigatório para todas as conexões".
   - **Backup off-site** — mantida como parcial, com ressalva: "Backups diários, cifrados (age) antes do envio off-site. Retenção de 30 dias auditada diariamente pelo script (zero objetos vencidos observados em 33 dias de operação); regra de lifecycle do bucket não confirmada diretamente no console."
   - **RLS** — mantida como sustentável, descrevendo mecanismo: "Isolamento multi-tenant garantido por Row-Level Security no Postgres, coberto por suíte automatizada (126 arquivos, 1103 testes) no CI."
   - **Zero Training Policy** — reformulada como garantia de terceiro: "Os provedores de IA usados (Anthropic, Google) mantêm política própria de não-treino em uso comercial, conforme contrato vigente com cada provedor."
   - **LGPD Art. 11/14** — reformulada como "conforme documentado": "Bases legais dos Art. 11 e 14 identificadas e documentadas (consentimento do titular, tutela da saúde, consentimento de responsável para menor) — ver política de privacidade e retenção." Sem carimbo de "conformidade".
5. Nenhum controle ausente vira trabalho de implementação antes do termo — termo descreve o estado real, não promete o que falta.

**Aberto (Gate 3):**

Documento formal em `docs/legal/` com a redação acima, e decisão se cabe superfície de download.
