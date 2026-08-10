ALTER TABLE "subscription" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN "cpf_cnpj" text;