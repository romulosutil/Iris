CREATE TYPE "public"."assinatura_certificado_tipo" AS ENUM('a1_arquivo', 'a3_nuvem');--> statement-breakpoint
CREATE TABLE "assinatura_credencial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"tipo" "assinatura_certificado_tipo" NOT NULL,
	"provedor" text NOT NULL,
	"chave_envelope_ref" text NOT NULL,
	"chave_envelope_alg" text DEFAULT 'AES-256-GCM' NOT NULL,
	"dek_cifrada" "bytea" NOT NULL,
	"dek_nonce" "bytea" NOT NULL,
	"pfx_cifrado" "bytea",
	"pfx_nonce" "bytea",
	"senha_cifrada" "bytea",
	"senha_nonce" "bytea",
	"certificado_numero_serie" text NOT NULL,
	"certificado_titular" text NOT NULL,
	"certificado_emissor" text NOT NULL,
	"valido_de" timestamp with time zone NOT NULL,
	"valido_ate" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid NOT NULL,
	"revogado_em" timestamp with time zone,
	"revogado_por" uuid,
	CONSTRAINT "assinatura_credencial_validade" CHECK ("assinatura_credencial"."valido_ate" > "assinatura_credencial"."valido_de"),
	CONSTRAINT "assinatura_credencial_a1_material" CHECK ("assinatura_credencial"."tipo"::text <> 'a1_arquivo' OR ("assinatura_credencial"."pfx_cifrado" IS NOT NULL AND "assinatura_credencial"."pfx_nonce" IS NOT NULL AND "assinatura_credencial"."senha_cifrada" IS NOT NULL AND "assinatura_credencial"."senha_nonce" IS NOT NULL)),
	CONSTRAINT "assinatura_credencial_a3_sem_material" CHECK ("assinatura_credencial"."tipo"::text <> 'a3_nuvem' OR ("assinatura_credencial"."pfx_cifrado" IS NULL AND "assinatura_credencial"."pfx_nonce" IS NULL AND "assinatura_credencial"."senha_cifrada" IS NULL AND "assinatura_credencial"."senha_nonce" IS NULL)),
	CONSTRAINT "assinatura_credencial_revogacao_completa" CHECK (("assinatura_credencial"."revogado_em" IS NULL) = ("assinatura_credencial"."revogado_por" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "assinatura_credencial" ADD CONSTRAINT "assinatura_credencial_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_credencial" ADD CONSTRAINT "assinatura_credencial_criado_por_app_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_credencial" ADD CONSTRAINT "assinatura_credencial_revogado_por_app_user_id_fk" FOREIGN KEY ("revogado_por") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinatura_credencial_vigente" ON "assinatura_credencial" USING btree ("clinic_id") WHERE "assinatura_credencial"."revogado_em" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_assinatura_credencial_clinic" ON "assinatura_credencial" USING btree ("clinic_id","valido_ate" DESC NULLS LAST);
-- ============================================================================
-- #259 (D10 / T3) — Custódia da credencial de assinatura ICP-Brasil.
--
-- O DDL acima veio de `pnpm db:generate` (a tabela está em `src/db/schema.ts`).
-- Daqui para baixo é escrito à mão: RLS, GRANTs por coluna, barreira de conta
-- somente-leitura e a função SECURITY DEFINER que devolve o material cifrado.
-- O snapshot do Drizzle NÃO é tocado por este bloco.
--
-- ┌─ LACUNA DECLARADA: NÃO EXISTE KMS NESTE REPOSITÓRIO ──────────────────────┐
-- │ O esquema modela envelope encryption de dois níveis (KEK → DEK → material),│
-- │ mas o custodiante da KEK não existe: `chave_envelope_ref` é hoje uma       │
-- │ referência OPACA, sem implementação por trás. Nenhum código deste PR       │
-- │ escreve nesta tabela — não há caminho de escrita (T5, a UI de upload, está │
-- │ fora de escopo por não haver provedor PKI contratado). Enquanto a KEK não  │
-- │ tiver custodiante real, gravar credencial de PRODUÇÃO aqui é proibido.     │
-- │ O que a tabela garante desde já: o `.pfx` e a senha só cabem nela em forma │
-- │ cifrada — não existe coluna onde escrevê-los em texto plano.               │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER TABLE assinatura_credencial ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE assinatura_credencial FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- POLICY DE LEITURA — é ela que o guard do DEFINER abaixo copia LITERALMENTE
-- (CLAUDE.md §Migrações, item 5). Tenant resolvido por `app_clinic_id_exigido()`,
-- nunca por cast cru de `current_setting('app.clinic_id')` (D16/#229).
CREATE POLICY assinatura_credencial_select ON assinatura_credencial FOR SELECT TO app_role USING (
  clinic_id = app_clinic_id_exigido()
);--> statement-breakpoint

-- Instalar certificado é ato do responsável pela clínica: papel `coordenador`
-- (em clínica solo o dono-que-atende já é coordenador — ver o caso-base do
-- produto). `criado_por` é carimbado pelo próprio banco a partir da sessão, não
-- pelo payload do cliente. `revogado_em IS NULL` proíbe nascer já revogada, o
-- que furaria o índice parcial de vigência sem erro visível.
CREATE POLICY assinatura_credencial_insert ON assinatura_credencial FOR INSERT TO app_role WITH CHECK (
  clinic_id = app_clinic_id_exigido()
  AND criado_por = app_user_id_exigido()
  AND app_user_role_exigido() = 'coordenador'
  AND revogado_em IS NULL
);--> statement-breakpoint

-- A ÚNICA mutação permitida é a revogação, e ela é de mão única: sai de
-- vigente para revogada e nunca volta (`USING revogado_em IS NULL` +
-- `WITH CHECK revogado_em IS NOT NULL`). Sem o `WITH CHECK`, um UPDATE que
-- deixasse `revogado_em` como estava passaria — e o par de colunas de
-- revogação viraria campo livre.
CREATE POLICY assinatura_credencial_revogar ON assinatura_credencial FOR UPDATE TO app_role
  USING (
    clinic_id = app_clinic_id_exigido()
    AND app_user_role_exigido() = 'coordenador'
    AND revogado_em IS NULL
  )
  WITH CHECK (
    clinic_id = app_clinic_id_exigido()
    AND revogado_em IS NOT NULL
    AND revogado_por = app_user_id_exigido()
  );--> statement-breakpoint

-- GRANTs. Sem `DELETE`: o histórico de certificados é prova de quem assinou o
-- quê e com qual série — apagá-lo destruiria a contraprova da trilha.
REVOKE ALL ON assinatura_credencial FROM PUBLIC;--> statement-breakpoint

-- SELECT é COLUNA A COLUNA e as colunas de material cifrado ficam de fora
-- (CLAUDE.md §Migrações, item 4). Consequência a conhecer antes de debugar:
-- `SELECT *` nesta tabela sob `app_role` devolve "permission denied for table
-- assinatura_credencial" — a negação é de coluna, a mensagem fala da tabela
-- (memória `postgres-column-grant-denies-table`). Liste as colunas.
GRANT SELECT (
  id, clinic_id, tipo, provedor, chave_envelope_ref, chave_envelope_alg,
  certificado_numero_serie, certificado_titular, certificado_emissor,
  valido_de, valido_ate, criado_em, criado_por, revogado_em, revogado_por
) ON assinatura_credencial TO app_role;--> statement-breakpoint

-- INSERT precisa da linha inteira (é o upload da credencial já cifrada).
-- Assimetria deliberada: `app_role` ESCREVE o material cifrado e não o lê de
-- volta pela tabela — a releitura passa obrigatoriamente pelo DEFINER abaixo.
GRANT INSERT ON assinatura_credencial TO app_role;--> statement-breakpoint

-- UPDATE só nas duas colunas da revogação. Um `GRANT UPDATE` de tabela inteira
-- deixaria a policy sozinha barrando a troca do certificado por outro.
GRANT UPDATE (revogado_em, revogado_por) ON assinatura_credencial TO app_role;--> statement-breakpoint

-- Barreira de conta somente-leitura (0073/0074): só no INSERT. Instalar um
-- certificado novo é configuração de produto e para junto com a assinatura;
-- REVOGAR não para — se o certificado vazou, a clínica precisa poder cortá-lo
-- mesmo com a mensalidade em atraso (mesmo espírito de `alerta_risco_clinico`,
-- que ficou fora da barreira porque segurança vence cobrança).
DROP TRIGGER IF EXISTS assinatura_credencial_somente_leitura ON assinatura_credencial;--> statement-breakpoint
CREATE TRIGGER assinatura_credencial_somente_leitura
  BEFORE INSERT ON assinatura_credencial
  FOR EACH ROW EXECUTE FUNCTION app_barreira_somente_leitura();--> statement-breakpoint

-- ==================== MATERIAL CIFRADO (SECURITY DEFINER) ====================
--
-- Por que DEFINER: `app_role` não tem SELECT nas colunas de material. O
-- caminho de assinatura precisa lê-las, e a alternativa (dar a coluna ao
-- `app_role`) tornaria o `.pfx` cifrado legível por qualquer query da app,
-- inclusive um `SELECT *` acidental num log ou numa tela de suporte.
--
-- GUARD INTERNO = FRONTEIRA. O predicado de tenant é cópia LITERAL da
-- `assinatura_credencial_select` acima (`clinic_id = app_clinic_id_exigido()`).
-- Os dois predicados extras (`revogado_em IS NULL`, janela de validade) só
-- ESTREITAM: uma credencial revogada ou fora da validade não devolve material,
-- então um certificado vencido não consegue nem começar a assinar — falha no
-- banco, antes de qualquer chamada ao provedor.
--
-- Fail-closed sem tenant: `app_clinic_id_exigido()` levanta `P0001` nomeando a
-- falta do GUC em vez de devolver NULL e "não achar" a linha em silêncio.
--
-- O que sai daqui é CIFRADO. A decifragem exige a KEK, que hoje não tem
-- custodiante (ver a lacuna declarada no topo). Enquanto for assim, esta função
-- devolve bytes inúteis para quem não tiver a KEK — que é exatamente a
-- propriedade que se quer manter quando o KMS existir.
CREATE OR REPLACE FUNCTION public.app_assinatura_credencial_material(p_credencial uuid)
RETURNS TABLE (
  id                       uuid,
  tipo                     assinatura_certificado_tipo,
  provedor                 text,
  chave_envelope_ref       text,
  chave_envelope_alg       text,
  dek_cifrada              bytea,
  dek_nonce                bytea,
  pfx_cifrado              bytea,
  pfx_nonce                bytea,
  senha_cifrada            bytea,
  senha_nonce              bytea,
  certificado_numero_serie text,
  valido_de                timestamptz,
  valido_ate               timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.tipo, c.provedor, c.chave_envelope_ref, c.chave_envelope_alg,
         c.dek_cifrada, c.dek_nonce, c.pfx_cifrado, c.pfx_nonce,
         c.senha_cifrada, c.senha_nonce, c.certificado_numero_serie,
         c.valido_de, c.valido_ate
    FROM assinatura_credencial c
   WHERE c.id = p_credencial
     AND c.clinic_id = app_clinic_id_exigido()
     AND c.revogado_em IS NULL
     AND now() BETWEEN c.valido_de AND c.valido_ate;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.app_assinatura_credencial_material(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_assinatura_credencial_material(uuid) TO app_role;