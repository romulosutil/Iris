# Spec — #387 seletor de modalidade clinica

Design de referencia: `docs/arquitetura/modalidades-clinicas-e-abordagens.md` §1, §4.1/§4.2. Depende de #388 (PR #397 aberta, ready-for-review, ainda NAO mergeada em main). Branch desta issue (`feat/387-clinical-modality-selector`) nasce empilhada sobre `feat/388-clinical-modality-cognitive-behavioral` — PR base sera a branch do #388, nao `main`, ate o #397 mergear.

## Correcao de premissa (achado da pesquisa, ler antes de implementar)

Issue original pede `SECURITY DEFINER` copiando predicado de leitura. **Nao se aplica**: `patient_update` (RLS, `db/migrations/0001_rls.sql:80-104`) ja permite `UPDATE` direto via `app_role` p/ `admin_recepcao`/`coordenador`, sem exigir `app_is_on_team`. Precedente real e `alternarArquivamento` (`src/app/(app)/pacientes/[id]/logic.ts`): `UPDATE` direto via `withTenant` + `INSERT` direto em `audit_log` (INSERT e aberto p/ `app_role`, so UPDATE/DELETE em audit_log exigem DEFINER). **Mirror esse padrao, sem migracao nova.**

## Requisitos

- R1 `novo-paciente-form.tsx`: radio group novo p/ `clinicalModality`, mesmo padrao ja usado em `tipoConsentimento` (linhas 137-183): `RadioCards` controlado + `<input type="hidden" name="clinicalModality" value={...} />` sincronizado (`RadioCards` renderiza `<button role="radio">`, nao input nativo — sem o hidden mirror o form nao submete o campo). 3 rotulos fixos (arch doc §4.1, copy exata):
  - "Protocolo estruturado (ABA / TEA)"
  - "Terapia Cognitivo-Comportamental (TCC)"
  - "Terapia convencional (psicodinâmica, humanista, sistêmica)"
  Subtitulo "o que muda na ficha" por opcao — autoria nova, curta, 1 linha cada. Sem pre-selecao. Foco em erro via `grupoRef`+`useEffect`, mesmo padrao de `tipoConsentimento`.
- R2 `novo/logic.ts`: `clinicalModality` vira **obrigatorio**, mesmo padrao de `tipoConsentimento` (linhas 84-96) — sem fallback silencioso pra `protocol_driven`. `formData` sem valor valido = rejeicao com mensagem pt-BR.
- R3 Gate de consentimento: paciente **adulto** (mesma derivacao de idade que ja alimenta `avisoDivergencia`, hoje so aviso nao-bloqueante) em modalidade `cognitive_behavioral` OU `conventional` **exige** `tipoConsentimento === "titular_adulto"` — bloqueia criacao se nao vier. `protocol_driven` mantem o aviso soft atual, sem block novo (fora do escopo da DoD original).
- R4 Edicao: Server Action nova em `cadastro-clinico/` (nome sugerido: `alterarModalidadeClinica` ou equivalente), mirror de `alternarArquivamento`: `requireRole(ctx, "coordenador", "admin_recepcao")`, `UPDATE patient SET clinical_modality=...` via `withTenant`, `INSERT audit_log` na mesma transacao. Trocar modalidade **nao apaga** RPD/dados do modelo anterior (nenhuma limpeza de dado nesta issue).
- R5 `tcc/page.tsx`: guard ausente hoje. Mirror da query de `layout.tsx` (pos-#388, linhas ~50-72) — busca `clinicalModality` do paciente, `notFound()` se != `cognitive_behavioral`.
- R6 Testes: integracao criacao assertando valor **no banco** (nao no retorno da action); teste do caminho de rejeicao (`formData` sem `clinicalModality`); teste RLS provando terapeuta de outra clinica nao alter a modalidade; teste do gate de consentimento (adulto+TCC/convencional sem `titular_adulto` rejeita); teste `tcc/page.tsx` 404 pra paciente nao-TCC via URL direta; teste a11y do radio group — sem `axe`/`jest-axe` no repo (grep confirmou zero uso), seguir convencao existente: `role`, `aria-*`, navegacao por teclado via testing-library (mesmo padrao usado pro grupo `tipoConsentimento`, se existir teste la — espelhar).

## Fora de escopo

Migracao nova (RLS/grant ja cobrem). Limpeza de dado ao trocar modalidade. `familia_abordagem` (#331).

## Verificacao manual obrigatoria (da issue original)

Criar paciente TCC pela UI, `SELECT clinical_modality FROM patient WHERE id=...` no Postgres — nao confiar em CI verde sozinho (repetiu #305/#306).
