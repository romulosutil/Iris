# Indicadores de confiança na tela de login — evidência

Os dois selos no rodapé da caixa de login (`src/app/(auth)/login/page.tsx`) —
**Conformidade LGPD** e **Conexão Criptografada TLS 1.3** — são afirmações
factuais sobre a infraestrutura, não copy de marketing. Este documento guarda a
medição que sustenta cada uma delas. Se a infraestrutura mudar e a medição
deixar de bater, a copy tem que sair da tela.

> Regra deste documento: só entra aqui item **verificado**, com o arquivo-fonte
> da verificação citado. Item planejado, parcial ou "a confirmar" não sustenta
> selo — vai para a seção "O que o selo não cobre". Um documento de evidência
> que afirma controle inexistente é pior que nenhum documento: vira o registro
> que a própria operação apresenta a um titular ou à ANPD.

## TLS 1.3 — medido contra o domínio de produção

Executado contra `irisclinica.ia.br`:

```bash
openssl s_client -connect irisclinica.ia.br:443 -tls1_3 -brief < /dev/null 2>&1
```

Saída:

```
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN = irisclinica.ia.br
Verification: OK
```

## LGPD — o que sustenta o selo

| Controle | Estado | Onde está a medição |
| :-- | :-- | :-- |
| Dado armazenado em território brasileiro | Verificado | `docs/arquitetura/plano-bootstrap-e-stack-vps.md` — `irisclinica.ia.br` → `31.97.170.105`, AS47583 Hostinger, **RTT 33 ms** contra baseline Europa de 231 ms (piso físico Brasil↔Europa ~210 ms), `tracert` saindo por backbone BR (`200.25.x`) |
| Isolamento de dados por clínica via Row Level Security | Verificado | `pnpm test:rls` no CI; guard de `app_clinic_id_exigido()` em `db/tests/clinic-id-helper-rls.int.test.ts` |
| Expurgo do `audit_log` após 6 meses (Marco Civil) | Verificado | `db/migrations/0070_expurgo_audit_log_marco_civil.sql` + `scripts/expurgo-audit-log.mjs`, agendado no Easypanel (#116) |
| Descarte de backup local em 30 dias | Verificado | `infra/backup/backup.sh` (`RETENTION_DAYS`, default 30) |

> ⚠️ O domicílio societário da *Hostinger International Ltd* é a UE
> (Chipre/Lituânia). O **dado** está em São Paulo; a **empresa** não é
> brasileira — são coisas distintas e só a primeira sustenta o selo.

## O que o selo não cobre

Itens que `docs/legal/politica-retencao-dados.md` §8 registra como **em aberto**
em 28/07/2026. Nenhum deles pode ser citado como evidência enquanto continuar
neste bloco:

- **Expurgo do prontuário ao vencer o prazo de retenção (Art. 18).** As funções
  `app_purgar_paciente` e `app_paciente_expurgavel` existem desde a `0045`, mas
  **nenhum código da aplicação as chama** — não há ação, tela nem job. O expurgo
  hoje só sai por SQL manual, e o aviso prévio de 90 dias não existe. Fecha na
  Fase 6.
- **Descarte do backup off-site (OCI S3) em 30 dias (Art. 46).** O bucket
  off-site **não é podado pelo script, de propósito** — depende de uma Lifecycle
  Rule configurada no provedor, que a própria política manda *"confirmar no
  console do bucket — não presumir pelo texto desta política"* (#89).

## Como revalidar

- **TLS:** repetir o `openssl s_client` acima após qualquer troca de proxy, CDN
  ou certificado.
- **Residência do dado:** repetir a medição de latência de
  `plano-bootstrap-e-stack-vps.md` — RTT contra baseline europeia é a única
  prova que geolocalização de IP não falsifica. Geolocalização sozinha e
  domicílio societário do provedor não servem.
- **Retenção:** reler `docs/legal/politica-retencao-dados.md` §8 antes de
  promover qualquer item de "não cobre" para a tabela de evidência, e confirmar
  no console/no código — não no texto da política.
