# Indicadores de confiança na tela de login — evidência

Os dois selos no rodapé da caixa de login (`src/app/(auth)/login/page.tsx`) —
**LGPD Compliant** e **Conexão Criptografada TLS 1.3** — são afirmações factuais
sobre a infraestrutura, não copy de marketing. Este documento guarda a medição
que sustenta cada uma delas. Se a infraestrutura mudar e a medição deixar de
bater, a copy tem que sair da tela.

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

- Servidores Hostinger localizados fisicamente em São Paulo, Brasil (RTT ~33ms a
  partir do Brasil).
- Isolamento de banco de dados por tenant via Row Level Security (RLS).
- Expurgo imediato e política de descarte em backup rotativo de 30 dias
  (Art. 18 e Art. 46).

## Como revalidar

Repetir o `openssl s_client` acima após qualquer troca de proxy, CDN ou
certificado. Para a residência dos dados, medir de novo em vez de presumir —
RTT baixo não prova datacenter no Brasil por si só, e o domicílio societário do
provedor não é a localização do servidor.
