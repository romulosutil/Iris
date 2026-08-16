# Verificação pós-deploy — medir, não ler o `git log`

Scripts de **leitura pura** (nenhum `INSERT`/`UPDATE`/DDL) para provar, contra o
Postgres de produção, que uma migração não só foi commitada como **rodou e faz o
que promete**.

Existem por causa da `0055`: ela ficou fora do `_journal.json`, nunca rodou, e a
issue (#128) foi fechada olhando o diff — a falha de isolamento cross-tenant
seguiu viva em produção até o #165 medir. `Está no git log` não é prova.

## Como rodar

No terminal do container do Postgres (Easypanel → serviço `iris-postgres` →
Terminal):

```bash
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

O prompt muda de `root@...:/#` para `iris=#`. Se as variáveis não existirem,
descubra os nomes com `psql -U postgres -c "\du"` e `psql -U postgres -c "\l"`
e conecte com `psql -U iris -d iris` (sem acento — role é `iris`).

Depois cole o conteúdo do `.sql` desejado no prompt. Cada linha da saída traz
`item · esperado · encontrado · veredito`; qualquer `>>> FALHOU <<<` significa
que a migração correspondente **não produziu o objeto**, e o deploy precisa ser
tratado como incompleto mesmo que o job de migração tenha saído com `exit 0`.

## Scripts

| Arquivo                    | Cobre                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0076-0077-pos-deploy.sql` | #203 fatias 1 e 2 (PR #204): coluna `horas_semana`, os três CHECKs, os dois índices únicos parciais, o drop do índice antigo, e os grants dos dois lados — incluindo as **negativas** (`UPDATE` de tabela e `DELETE` revogados, policy de delete derrubada), que são a parte que um grant esquecido não denuncia                   |
| `0097-ciclos-orfaos.sql`   | #287 Problema 1: a 0097 rodou (valor `devido` no enum) **e** o diagnóstico dos ciclos que já ficaram órfãos antes do fix (`billing_cycle` em `aberto`/`apurado` com `subscription.status = 'canceled'`). Zero linha na segunda consulta = nada a tratar; qualquer linha é receita sem fatura, e o destino dela é decisão do Rômulo |

Os CHECKs em si são exercitados por `BEGIN … ROLLBACK` na suíte de integração
local (`pnpm test:rls`); aqui só se mede DDL e privilégio, porque escrever em
produção — mesmo revertendo — não é preço a pagar por uma verificação.
