# Design Spec — Issue #105: Infra - Prova de Decifração e Restauração de Réplica Off-Site

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#105](https://github.com/romulosutil/Iris/issues/105)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
O serviço de backup (`iris-backup`) envia diariamente dumps cifrados para um bucket off-site na Oracle Cloud (OCI). Embora o upload retorne `exit 0`, existia a pendência de provar que a chave privada `age` mantida pelo operador consegue decifrar e restaurar o artefato do bucket remoto.

### 1.2 A Solução
Executar o procedimento de validação `infra/backup/verify-offsite.sh` com injeção da chave privada via STDIN, validando que o arquivo cifrado é lido, decifrado e seu hash SHA-256 coincide exatamente com o emitido na geração pelo VPS.

---

## 2. Especificação do Procedimento de Teste

### 2.1 Ajuste de Credencial Oracle S3 (OCI)
* Conceder permissão de leitura de objetos (`OBJECT_READ`) para a credencial utilizada no script de validação fora do VPS.

### 2.2 Execução do Runbook (`infra/README.md`)
```bash
export OFFSITE_S3_ENDPOINT="https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com"
export OFFSITE_S3_ACCESS_KEY="<credencial_leitura>"
export OFFSITE_S3_SECRET_KEY="<credencial_leitura>"
export OFFSITE_S3_BUCKET="iris-backups-offsite"

docker compose -f infra/docker-compose.yml --profile backup run --rm --no-deps -T backup ./verify-offsite.sh < /caminho/chave-privada-age.txt
```

### 2.3 Critério de Aceite Inegociável
1. Saída oficial: `RÉPLICA OFF-SITE VERIFICADA: iris-<timestamp> é restaurável.`
2. Confirmação de que o `sha256` extraído bate com o log gravado pelo `backup.sh`.
