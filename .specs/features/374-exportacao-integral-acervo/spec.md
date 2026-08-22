# Spec — Exportação Integral do Acervo da Clínica (#374 ∪ #353)

> Status: **Design fechado** (22/08/2026). Unifica as issues #374 e #353.
> Âncora contratual: `docs/legal/termos-de-uso.md` §7.4 (b) — "exportar o conteúdo
> registrado integralmente e sem custo". Âncora legal: LGPD Art. 18, V (portabilidade).

## 1. Unificação das issues

| | #374 | #353 |
| --- | --- | --- |
| Título | Exportação Integral da Conta e Prontuários em Lote | exportação integral do acervo em modo somente-leitura |
| Âncora | ToS 7.4 (b) | ToS 7.4 (b) + LGPD Art. 18 |
| Entrega | job assíncrono + ZIP + link com expiração | endpoint/job + ZIP com manifesto SHA-256 |
| Permissão | "coordenação/responsável" | `clinic.responsavel_conta_id` |
| UI | não especificada | configurações da clínica + tela de bloqueio pós-trial |
| Auditoria | emissão + download em `audit_log` | `acao='exportacao_integral_acervo'` |

**Veredito: unificar.** É a mesma feature descrita duas vezes, sem conflito — só
complementos. A união é estritamente maior que qualquer uma das duas.

**Ação:** implementar em **#374** (mantém o job em lote e o link expirável, que é a
parte cara). Fechar **#353** como duplicata, migrando para #374 os três itens que só
ela tem: (a) gate por `responsavel_conta_id`, (b) botão na tela de bloqueio de
somente-leitura, (c) manifesto SHA-256.

## 2. Decisões fechadas (validadas com o Rômulo em 22/08/2026)

| # | Decisão | Escolha |
| --- | --- | --- |
| D1 | Entrega | Job assíncrono + link expirável (72 h) |
| D2 | Conteúdo | NDJSON estruturado + PDFs **já congelados** em `report_pdf` + `manifest.json` com SHA-256 por arquivo. **Sem re-render, sem chamada de IA.** |
| D3 | Permissão | Somente `clinic.responsavel_conta_id`. Coordenador comum não vê o botão nem passa na action. |
| D4 | Escopo | Todo o clínico, **incluindo arquivados**, mais `audit_log`. Fora: credenciais, outro tenant, linhas com erasure aplicado. |

Decisões derivadas, tomadas nesta spec (não delegar ao executor):

| # | Decisão | Razão |
| --- | --- | --- |
| D5 | Um arquivo `.ndjson` por tabela, não `.json` | 100 k linhas em `JSON.stringify` estouram a memória do VPS; NDJSON tem memória constante e é diffável. `README.txt` no ZIP explica o formato. |
| D6 | Bytes do bundle em `bytea`, tabela separada dos metadados | Espelha `report`/`report_pdf`: listar bundles não pode arrastar MB. MinIO **não** está provisionado para o app (`S3_*` está comentado no `.env.example`); introduzir storage de objeto aqui seria uma segunda feature. |
| D7 | Teto de 250 MiB por bundle | `bytea` do Postgres para em 1 GB, e o download materializa o blob inteiro em RAM. Acima do teto o bundle vai a `falhou` com motivo **nomeado** (`bundle_excede_limite`), nunca trunca em silêncio. Quando um cliente real bater no teto, aí sim migra-se para storage de objeto. |
| D8 | Dependência nova: `fflate` | ZIP puro-JS, sem deps transitivas. Só entra no app — o job continua sendo um `fetch` sem dependência (lição do #156). Alternativa recusada: ZIP `STORE`-only escrito à mão (~120 linhas de formato binário para economizar 8 KB). |
| D9 | A leitura roda **sob a RLS do solicitante**, não como owner | Um export que lê com `BYPASSRLS` é um bypass de RLS com nome bonito. O job resolve o tenant e reabre `withTenant(clinicId, solicitanteId)`; o bundle contém exatamente o que aquele usuário enxerga. |
| D10 | A tabela nova **não** recebe o trigger `app_barreira_somente_leitura` | Mesma razão pela qual `report`/`report_pdf`/`audit_log` já estão fora dele (0073, linhas 130-135): a promessa comercial é "pós-trial = somente-leitura **com exportação livre**". Se a tabela entrasse na lista, a feature quebraria exatamente no estado em que ela existe para servir. Isso vai escrito na migração. |

## 3. Critérios de aceite (DoD)

- [ ] Responsável da conta solicita exportação em `/clinica/exportacao`; ninguém mais consegue (nem pela action direta).
- [ ] Job assíncrono monta ZIP com NDJSON de todas as tabelas do escopo + PDFs congelados + `manifest.json` (SHA-256 por arquivo) + `README.txt`.
- [ ] Link de download exige sessão autenticada **e** ser o responsável atual **e** token válido **e** bundle `pronto` e não expirado.
- [ ] Cinco eventos em `audit_log`: `exportacao_integral_solicitada`, `_concluida`, `_falhou`, `_download`, `_expirada`.
- [ ] **A exportação funciona com a conta em somente-leitura** (trial expirado, cancelada) — teste de integração explícito, não inferência.
- [ ] Teste de RLS provando isolamento: clínica B não vê, não baixa e não aparece no bundle da clínica A.
- [ ] Nenhuma credencial no bundle: `auth_account`, `auth_session`, `auth_verification`, `two_factor`, `auth_throttle` e `patient.cpf_hash` ausentes — teste que varre o ZIP montado, não a lista de constantes.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` verdes. `pnpm format` rodado **só** nos arquivos tocados.

## 4. Fora de escopo (explícito)

- Importação / restauração do bundle.
- Re-render de PDF que ainda não existe (D2).
- Exportação por paciente individual (já existe em `/relatorios`).
- Expurgo do prontuário (#352) — feature irmã, issue separada.
- Storage de objeto (S3/MinIO) — só quando o teto de D7 for atingido por cliente real.
