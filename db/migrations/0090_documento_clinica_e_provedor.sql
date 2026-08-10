-- #36 — ativação de assinatura via Asaas: documento da clínica e provedor
-- sem default.
--
-- Bloco 1 (linhas abaixo até o primeiro separador) é o que o `db:generate`
-- emitiu a partir do `schema.ts`. Do separador em diante é DDL escrita à mão —
-- função SECURITY DEFINER, GRANT e CHECK — que o Drizzle não modela e que
-- portanto NÃO dessincroniza o snapshot.

ALTER TABLE "subscription" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "cpf_cnpj" text;--> statement-breakpoint

-- ═══════════════════ DDL à mão (fora do schema.ts) ═══════════════════

-- ==================== app_salvar_cpf_cnpj_clinica ====================
--
-- POR QUE FUNÇÃO E NÃO UPDATE DIRETO:
-- `clinic` tem UMA policy para `app_role` — `clinic_read`, `FOR SELECT`
-- (0002) — e isso é deliberado; não existe policy `FOR UPDATE`. UPDATE
-- barrado por RLS afeta 0 linhas EM SILÊNCIO: a tela salvaria, o usuário veria
-- sucesso e o documento nunca chegaria ao banco. Foi exatamente o modo de
-- falha do #212, resolvido pela 0081 com este mesmo padrão.
--
-- Uma policy `FOR UPDATE ON clinic` abriria de uma vez todas as colunas que a
-- 0079 concedeu a `app_role`. A função mantém a superfície em UMA coluna.
--
-- GUARD = FRONTEIRA DE AUTORIZAÇÃO:
-- Sendo DEFINER, a função bypassa RLS e o guard interno é a única barreira.
-- Ele espelha o predicado de `clinic_read` — `id = <tenant do GUC>` — e
-- acrescenta a exigência de papel coordenador (quem contrata a assinatura),
-- que hoje só existe no wrapper da aplicação e portanto não é barreira de
-- banco. A clínica NUNCA entra por parâmetro: assim não existe caminho de
-- forjar tenant.
--
-- TENANT VIA `app_clinic_id_exigido()` E NUNCA CAST CRU (D16, 0085/0087):
-- `current_setting('app.clinic_id')::uuid` estoura 42704 (GUC ausente) ou
-- 22P02 (GUC presente e não-uuid) com mensagem que não nomeia o tenant. O
-- helper levanta um P0001 único e diagnosticável. `app_clinic_id_atual()`
-- (que devolve NULL) seria errado aqui: sem tenant o UPDATE casaria 0 linhas
-- em silêncio, que é o modo de falha pior.
--
-- POR QUE **NÃO** CHAMA `app_conta_somente_leitura()`:
-- Gravar o documento é passo da ATIVAÇÃO da assinatura — é justamente a saída
-- da conta bloqueada. Barrar aqui trancaria a conta em deadlock: sem pagar não
-- pode gravar, sem gravar não pode pagar (o Asaas exige o cpfCnpj para criar o
-- cliente do Pix Automático).
--
-- FORMATO VALIDADO AQUI, NÃO SÓ NA APLICAÇÃO:
-- A aplicação valida os dígitos verificadores (mod-11) e é ela que dá a
-- mensagem boa ao usuário. O banco valida o COMPRIMENTO — 11 (CPF) ou 14
-- (CNPJ) dígitos, sem máscara — porque a função é DEFINER e um chamador
-- futuro que pule a camada TS não pode gravar lixo numa coluna que vira
-- payload de gateway de pagamento.
CREATE OR REPLACE FUNCTION app_salvar_cpf_cnpj_clinica(p_cpf_cnpj text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
  v_digitos text := regexp_replace(COALESCE(p_cpf_cnpj, ''), '\D', '', 'g');
BEGIN
  IF current_setting('app.user_role') <> 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_cpf_cnpj_clinica: exige papel coordenador (papel do chamador: %)', current_setting('app.user_role');
  END IF;

  IF length(v_digitos) NOT IN (11, 14) THEN
    RAISE EXCEPTION 'app_salvar_cpf_cnpj_clinica: documento deve ter 11 dígitos (CPF) ou 14 (CNPJ); recebeu % dígito(s)', length(v_digitos);
  END IF;

  UPDATE clinic
     SET cpf_cnpj = v_digitos
   WHERE id = v_clinic;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_salvar_cpf_cnpj_clinica(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_salvar_cpf_cnpj_clinica(text) TO app_role;
--> statement-breakpoint

-- LEITURA da coluna nova: a 0079 revogou INSERT/UPDATE/DELETE em `clinic` para
-- `app_role`, mas NÃO o SELECT — que segue no nível de TABELA (0001) e por
-- isso alcança colunas criadas depois. O grant abaixo é redundante de
-- propósito: torna a intenção explícita e sobrevive a um futuro REVOKE de
-- SELECT de tabela seguido de grants coluna a coluna. Medido na T4 por
-- `has_column_privilege('app_role','clinic','cpf_cnpj','SELECT')`.
--
-- NÃO existe GRANT UPDATE (cpf_cnpj): a escrita é exclusivamente pela função
-- DEFINER acima, que roda como dona. Conceder UPDATE aqui abriria um segundo
-- caminho de escrita sem o guard de papel.
GRANT SELECT (cpf_cnpj) ON clinic TO app_role;
--> statement-breakpoint

-- ==================== CHECK de provedor ====================
--
-- O invariante que o `NOT NULL DEFAULT 'mercado_pago'` fingia garantir, agora
-- dito de verdade: uma assinatura VINCULADA a um gateway tem provedor; uma
-- `free_tier` (sem vínculo de cobrança) não precisa ter. O default antigo
-- fazia toda linha nova nascer apontando para um gateway que a clínica nunca
-- escolheu — inclusive as free_tier — e foi a raiz do D29.
--
-- Nomeado no padrão do Drizzle (`_check`): constraint criada sem nome recebe o
-- nome do Postgres e reintroduz a divergência que a 0078 reconciliou.
--
-- Vem DEPOIS do backfill (T3, abaixo): com as linhas velhas ainda apontando
-- para um provedor fantasma, o ADD CONSTRAINT falharia na validação.
ALTER TABLE subscription
  ADD CONSTRAINT subscription_provider_quando_vinculado_check
  CHECK (status = 'free_tier' OR provider IS NOT NULL);
