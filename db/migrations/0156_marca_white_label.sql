-- #258 (D9) — Marca institucional (white-label) nos PDFs exportados.
--
-- Três colunas em `clinic`, todas NULLABLE: clínica sem marca configurada
-- continua exportando com o cabeçalho neutro do Iris (fallback é o estado
-- normal, não um erro).
--
-- POR QUE BYTES E NÃO `brand_logo_url` (como dizia a issue): o renderizador
-- dos relatórios de família/convênio roda o HTML dentro de um sandbox com
-- `Content-Security-Policy: default-src 'none'; img-src 'self' data:`
-- (src/lib/report/playwright-renderer.ts). Uma URL remota — MinIO inclusive —
-- é bloqueada pelo próprio Blink antes de virar requisição, e o PDF sairia sem
-- logotipo EM SILÊNCIO (o `page.route(abort)` sequer registraria erro visível
-- ao usuário). `data:` é o único esquema que atravessa esse sandbox, portanto a
-- fonte da verdade tem que ser o byte, não o endereço. Guardar o byte no
-- tenant também dispensa bucket novo, credencial nova e URL assinada para um
-- ativo que é, por definição, privado da clínica.
ALTER TABLE "clinic" ADD COLUMN "brand_logo" "bytea";--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "brand_logo_mime" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "brand_primary_color" text;--> statement-breakpoint

-- Teto de tamanho NO BANCO, não só na aplicação: a validação de 2 MB roda na
-- server action, mas a coluna é bytea e qualquer caminho futuro (script,
-- seed, `iris_auth`) escreveria sem passar por lá. 2 MB = 2097152 bytes,
-- mesmo número de TAMANHO_MAX_LOGO_BYTES em src/lib/branding/marca.ts.
ALTER TABLE "clinic" ADD CONSTRAINT "clinic_brand_logo_tamanho_check"
  CHECK ("brand_logo" IS NULL OR octet_length("brand_logo") <= 2097152);--> statement-breakpoint

-- Só PNG. SVG é markup executável (`<script>`, `<foreignObject>`) e não entra
-- no produto — ver o comentário de MIME_LOGO_ACEITO em marca.ts. O CHECK
-- também amarra a coerência do par: byte sem MIME (ou o contrário) produziria
-- um data URI quebrado no render.
ALTER TABLE "clinic" ADD CONSTRAINT "clinic_brand_logo_mime_check"
  CHECK (
    ("brand_logo" IS NULL AND "brand_logo_mime" IS NULL)
    OR ("brand_logo" IS NOT NULL AND "brand_logo_mime" = 'image/png')
  );--> statement-breakpoint

-- Formato da cor validado no banco também: `#rrggbb` minúsculo. O piso de
-- contraste WCAG (4.5:1 sobre branco) NÃO cabe num CHECK — exige a fórmula de
-- luminância relativa — e fica em `validarCorMarca` (marca.ts), exercitada
-- pela server action e pelo guard da função definer abaixo.
ALTER TABLE "clinic" ADD CONSTRAINT "clinic_brand_primary_color_check"
  CHECK ("brand_primary_color" IS NULL OR "brand_primary_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint

-- Grant de COLUNA faltando aparece como "permission denied for table clinic",
-- diagnóstico caro (memória do repo: postgres-column-grant-denies-table).
-- `clinic` teve UPDATE revogado por tabela e concedido coluna a coluna (0079);
-- coluna nova sem GRANT explícito quebra em runtime com CI verde.
--
-- Só SELECT para `app_role`: a escrita é a função SECURITY DEFINER abaixo, que
-- roda como dona e não depende destes grants. `iris_auth` recebe UPDATE porque
-- é o papel de provisionamento/seed (mesmo padrão de 0057/0064).
GRANT SELECT (brand_logo, brand_logo_mime, brand_primary_color)
  ON clinic TO app_role;--> statement-breakpoint
GRANT SELECT (brand_logo, brand_logo_mime, brand_primary_color),
      UPDATE (brand_logo, brand_logo_mime, brand_primary_color)
  ON clinic TO iris_auth;--> statement-breakpoint

-- ── Caminho de escrita ──────────────────────────────────────────────────────
--
-- POR QUE FUNÇÃO E NÃO POLICY NOVA:
-- `clinic` tem `FORCE ROW LEVEL SECURITY` e UMA policy para `app_role` —
-- `clinic_read`, `FOR SELECT` (0002, predicado reescrito pela 0085 para usar
-- `app_clinic_id_exigido()`). Não existe policy `FOR UPDATE`, e isso é
-- deliberado (a 0064 documenta: "clinic só tem policy de SELECT para app_role
-- (0002) — de propósito").
--
-- MEDIDO, não deduzido: para ESTAS colunas quem barra primeiro é o GRANT, não
-- a RLS. Como o `GRANT SELECT (...)` acima não inclui UPDATE para `app_role`,
-- um `UPDATE clinic SET brand_primary_color = …` sob `app_role` estoura
-- `42501 permission denied for table clinic` — não o `UPDATE 0` silencioso do
-- caso da 0081. É a mesma distinção da memória `app-user-nunca-teve-update-
-- revogado`: as duas barreiras existem, mas afirmar a errada leva o próximo
-- leitor a diagnosticar o sintoma errado. Verificado assim:
--   BEGIN;
--   INSERT INTO clinic (id, nome) VALUES ('2222…','Probe');
--   SET LOCAL ROLE app_role;
--   SELECT set_config('app.clinic_id','2222…',true);
--   UPDATE clinic SET brand_primary_color = '#000000' WHERE id='2222…';
--   -->  ERROR: permission denied for table clinic
--   ROLLBACK;
--
-- De todo modo a conclusão é a da doutrina do repo (CLAUDE.md regra 5;
-- precedentes 0048, 0064, 0067, 0081, 0095, 0133): escrita fora do que a RLS
-- permite vai de SECURITY DEFINER, com a superfície limitada às colunas em
-- questão. Uma policy `FOR UPDATE ON clinic` abriria de uma vez toda coluna que
-- algum GRANT já concedeu.
--
-- GUARD = FRONTEIRA DE AUTORIZAÇÃO:
-- Sendo DEFINER, a função bypassa RLS e o guard interno é a ÚNICA barreira.
--   1. A clínica NUNCA entra por parâmetro — é sempre `app_clinic_id_exigido()`
--      (0085), nunca `current_setting('app.clinic_id')::uuid` cru: o cast cru
--      estoura 42704/22P02 dentro da função sem nomear o tenant, e o guard de
--      auditoria varre `pg_proc` além de `pg_policies` (CLAUDE.md regra 6).
--      Sem parâmetro de tenant não existe caminho de forjar clínica.
--   2. Papel `coordenador` exigido aqui dentro. Hoje isso só existe no wrapper
--      (`requireRole` em actions.ts), que é barreira de aplicação, não de banco.
--
-- O QUE A FUNÇÃO NÃO FAZ: ela não valida contraste WCAG nem magic bytes de
-- PNG. Isso é deliberado — os CHECKs acima cobrem formato e MIME, e a régua
-- de contraste (luminância relativa) e a leitura do IHDR vivem em
-- `src/lib/branding/marca.ts`, exercitadas na server action. A função é o
-- caminho de escrita, não um segundo validador divergente.
--
-- `p_manter_logo` separa "não mexi no logotipo" de "quero remover o logotipo":
-- o formulário reenvia todos os campos a cada salvamento e, sem essa
-- distinção, reeditar só a cor apagaria o logotipo em silêncio (memória do
-- repo: form-repopulado-rebaixa-campo-omitido).
CREATE OR REPLACE FUNCTION app_salvar_marca_clinica(
  p_cor          text,
  p_manter_logo  boolean,
  p_logo         bytea,
  p_logo_mime    text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := app_clinic_id_exigido();
BEGIN
  IF current_setting('app.user_role', true) IS DISTINCT FROM 'coordenador' THEN
    RAISE EXCEPTION 'app_salvar_marca_clinica: exige papel coordenador (papel do chamador: %)',
      COALESCE(current_setting('app.user_role', true), '<ausente>');
  END IF;

  UPDATE clinic
     SET brand_primary_color = NULLIF(btrim(COALESCE(p_cor, '')), ''),
         brand_logo      = CASE WHEN p_manter_logo THEN brand_logo      ELSE p_logo      END,
         brand_logo_mime = CASE WHEN p_manter_logo THEN brand_logo_mime ELSE p_logo_mime END
   WHERE id = v_clinic;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_salvar_marca_clinica(text, boolean, bytea, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_salvar_marca_clinica(text, boolean, bytea, text) TO app_role;
