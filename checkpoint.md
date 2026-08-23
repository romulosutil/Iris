# Checkpoint — Review PR #422 (Exportação Integral do Acervo, #374 ∪ #353)

Sessão de 22/08/2026, papel de tech lead. Estado: **correções aplicadas e enviadas**.

## Feito

- Merge de `origin/main` na branch. Conflitos resolvidos:
  - `db/migrations/meta/_journal.json`: `0116` (main) + `0117` (branch).
  - `.specs/features/374-.../{spec,design,tasks}.md`: divergência era **só**
    padding de tabela do Prettier; adotada a versão de main (#421).
  - Verificado que nada de main se perdeu:
    `git diff origin/main HEAD -- src/lib/billing scripts docs/legal` = vazio.
- `pnpm-lock.yaml` restaurado ao formato nativo do pnpm e adicionado ao
  `.prettierignore` (o Prettier expandia os flow maps e inflava o arquivo em
  ~3,4 k linhas, produzindo diffs de 12 k linhas a cada branch).

## Achados da review (medidos, não presumidos)

### P0 — a feature não funciona de ponta a ponta

1. `download.ts` faz `SELECT ... criado_em FROM export_bundle`; a coluna **não
   existe** na `0117` nem no `schema.ts`. Todo download estoura.
2. O token de download nunca chega ao usuário. `processarProximo()` gera o
   token, grava só o hash e devolve o texto claro para a rota interna do job,
   que o descarta. A UI monta o link como
   `/api/export/acervo/{id}` **sem `?token=`**, e `baixarBundleAcervo` devolve
   404 já na primeira linha quando o token vem vazio.
3. Nada dispara o job: não existe `scripts/exportacao-acervo.mjs` (o design o
   nomeia) nem entrada de `EXPORT_JOB_TOKEN` no `.env.example`. Bundles ficam
   em `pendente` para sempre.

### P1 — segurança e corretude

4. `app_export_bundle_reservar` não tem guard de status: reservar um bundle já
   `pronto` o devolve a `processando`, invalidando o link vigente e podendo
   estourar `uq_export_bundle_ativo` dentro do DEFINER.
5. Os quatro `SECURITY DEFINER` têm `GRANT EXECUTE ... TO app_role` e aceitam
   qualquer `uuid` sem guard de tenant — contraria CLAUDE.md §5 ("guard interno
   é fronteira"). Quem chama é o job, sob `iris_auth`.
6. Gate D1 fail-open: `motor.ts` e `download.ts` liberam **qualquer** papel
   quando `clinic.responsavel_conta_id IS NULL`; `page.tsx` restringe a
   coordenador. Três leituras diferentes do mesmo gate.
7. `motor.ts` grava `err.message` cru em `export_bundle.erro` e em
   `audit_log.detalhe` — mensagem de terceiro pode carregar PII de linha.

### P2

8. Nenhum teste prova que `TABELAS_EXPORTADAS ∪ TABELAS_NEGADAS` cobre o
   `schema.ts` inteiro: tabela nova entra em silêncio em nenhum dos dois.
9. `expirarVencidos` ignora o boolean de `app_export_bundle_expirar` e audita
   expiração mesmo quando nenhuma linha mudou.
10. `design.md` §2 fala em "migração `0095`"; a entregue é a `0117`.

## Correções aplicadas (commit `fix(export): torna o download alcançável…`)

Os nove achados acima foram corrigidos. O que entrou de novo:

- `src/lib/export/acervo/gate.ts` — leitura única do gate D1.
- `app_export_bundle_token_definir` na `0117` (DEFINER com guard de tenant
  copiado da policy de leitura) + `gerarLinkDownload` + `gerarLinkDownloadAction`.
- `scripts/exportacao-acervo.mjs` (gatilho magro, sem dependência npm) e o
  bloco `EXPORT_JOB_URL`/`EXPORT_JOB_TOKEN` no `.env.example`.
- Teste de cobertura do catálogo (varre o `schema.ts`) e teste de integração do
  caminho do link (cunhar → baixar → cunhar de novo revoga o anterior →
  não-responsável é recusado).
- `FUNCOES_COM_HELPER` de 18 para 19 em `db/tests/clinic-id-helper-rls.int.test.ts`.

Medido: typecheck 0 erros, lint 0 erros, `pnpm vitest run` 253 arquivos /
1.805 testes com 0 falha. A suíte de integração/RLS roda no job `test-rls` do
CI — Docker local indisponível nesta sessão.

## Pendente para o go-live (não é código)

Agendar `scripts/exportacao-acervo.mjs` no Easypanel e publicar
`EXPORT_JOB_URL` / `EXPORT_JOB_TOKEN` no serviço do App. Sem isso a fila não
anda em produção.
