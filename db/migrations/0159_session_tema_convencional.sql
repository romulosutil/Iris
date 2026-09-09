CREATE TYPE "public"."session_tema_estado" AS ENUM('sugerido', 'aprovado');--> statement-breakpoint
CREATE TABLE "session_tema" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"tema" text NOT NULL,
	"tema_chave" text NOT NULL,
	"estado" "session_tema_estado" DEFAULT 'sugerido' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revisado_em" timestamp with time zone,
	CONSTRAINT "uq_session_tema_chave" UNIQUE("session_id","tema_chave")
);
--> statement-breakpoint
ALTER TABLE "session_tema" ADD CONSTRAINT "session_tema_clinic_id_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tema" ADD CONSTRAINT "session_tema_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tema" ADD CONSTRAINT "session_tema_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_session_tema_patient_aprovado" ON "session_tema" USING btree ("patient_id") WHERE estado = 'aprovado';--> statement-breakpoint
CREATE INDEX "idx_session_tema_session" ON "session_tema" USING btree ("session_id");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────
-- A partir daqui é escrito à mão (#645). Nada abaixo mexe no snapshot.
--
-- `session_tema` guarda tema clínico derivado por IA da nota consolidada do
-- modo `terapia_convencional` — é PRONTUÁRIO, e recebe o mesmo tratamento de
-- tenant/equipe que `instrumento_aplicacao` (0113:29-72), de onde os
-- predicados abaixo foram copiados LITERAIS.
--
-- GRANT direto para `app_role`: não há `SECURITY DEFINER` no caminho de
-- escrita (a consolidação insere `sugerido` e a revisão promove a `aprovado`,
-- ambas dentro de `withTenant`, sob RLS). Se um dia a escrita sair da RLS, o
-- caminho é um definer com o predicado da leitura copiado — nunca policy nova.
GRANT SELECT, INSERT, UPDATE, DELETE ON "session_tema" TO app_role;--> statement-breakpoint

ALTER TABLE "session_tema" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_tema" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Tenant resolvido por `app_clinic_id_exigido()` (D16/#229): o cast cru de
-- `current_setting('app.clinic_id')` estoura 42704/22P02 DENTRO da policy sem
-- nomear o tenant; `app_clinic_id_atual()` devolveria NULL e ocultaria a linha
-- em silêncio, que é pior. O helper levanta P0001 diagnosticável.
CREATE POLICY session_tema_select ON session_tema FOR SELECT TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY session_tema_insert ON session_tema FOR INSERT TO app_role WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

CREATE POLICY session_tema_update ON session_tema FOR UPDATE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
) WITH CHECK (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);--> statement-breakpoint

-- DELETE existe para a regravação das linhas `sugerido` a cada reconsolidação
-- (`diario-consolidacao.ts`), que roda como o terapeuta da sessão — por isso
-- NÃO é restrito a coordenador como em `instrumento_aplicacao`. Linha
-- `aprovado` está protegida pelo predicado do próprio DELETE da aplicação
-- (`WHERE estado = 'sugerido'`), não por policy: quem apaga é sempre a
-- consolidação, e ela nunca toca registro aprovado.
CREATE POLICY session_tema_delete ON session_tema FOR DELETE TO app_role USING (
  (clinic_id = app_clinic_id_exigido()) AND app_patient_in_clinic(patient_id) AND (
    (current_setting('app.user_role', true) = 'coordenador') OR app_is_on_team(patient_id)
  )
);
