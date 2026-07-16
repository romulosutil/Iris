-- Agenda 2.0 (Etapa A) — recreate de session_estado com migração de dados.
-- Corpo trocado à mão: o recreate naïve do drizzle-kit (USING estado::text::
-- session_estado) falharia nas linhas legadas 'presente'/'falta' (ausentes no
-- novo enum). Mapeamento: presente→realizada, falta→falta_paciente.
ALTER TABLE "session" ALTER COLUMN "estado" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "public"."session_estado" RENAME TO "session_estado_old";
--> statement-breakpoint
CREATE TYPE "public"."session_estado" AS ENUM('agendada', 'realizada', 'falta_paciente', 'falta_terapeuta', 'cancelada');
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "estado" TYPE "public"."session_estado" USING (
  CASE "estado"::text
    WHEN 'presente' THEN 'realizada'
    WHEN 'falta'    THEN 'falta_paciente'
    ELSE "estado"::text
  END::"public"."session_estado"
);
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "estado" SET DEFAULT 'agendada';
--> statement-breakpoint
DROP TYPE "public"."session_estado_old";
