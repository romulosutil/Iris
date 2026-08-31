-- 0140_asr_worker_role.sql
-- Issue #494 / T18 — papel dedicado do worker de transcrição, e retirada do
-- `EXECUTE` das três funções cross-tenant de `app_role`.
--
-- O QUE ESTAVA ERRADO: a `0136` concedeu `EXECUTE` de `app_asr_reservar`,
-- `app_asr_concluir` e `app_asr_falhar` a `app_role` — o papel de TODA
-- requisição web logada. As três são `SECURITY DEFINER` cross-tenant por
-- desenho, e o que elas entregam a quem as chama não é 1 bit:
--
--  * `app_asr_reservar` DEVOLVE `clinic_id` + `objeto_ref` de linhas de outras
--    clínicas (a chave do objeto no bucket efêmero, que é por onde se baixa o
--    áudio);
--  * `app_asr_concluir(uuid, text)` ESCREVE texto arbitrário em
--    `transcricao_texto` de qualquer clínica e zera o `objeto_ref` dela;
--  * `app_asr_falhar` MUTA estado de clipe de qualquer clínica.
--
-- A régua deste repo (memória `definer-cross-tenant-so-devolve-boolean`) tolera
-- definer cross-tenant PORQUE o retorno é 1 bit. `app_asr_objetos_em_uso`
-- (0138) cumpre — ela só ecoa de volta o subconjunto de chaves que o chamador
-- JÁ tinha. As outras três não cumprem, e por isso saem de `app_role`.
--
-- POR QUE ISSO IMPORTA MESMO SEM CAMINHO ALCANÇÁVEL HOJE: nenhuma Server
-- Action ou rota de produto chama as três. Mas enquanto o `EXECUTE` estiver em
-- `app_role`, essa fronteira é uma invariante de CAMADA DE APLICAÇÃO — vale
-- enquanto ninguém escrever a chamada errada, e nada no banco avisa quando
-- alguém escrever. Movida para papel dedicado, a fronteira volta a ser do
-- banco: `app_role` recebe `42501`, alto e claro.
--
-- POR QUE NOLOGIN: mesmo padrão de `iris_escalonamento` (0049),
-- `iris_arquivamento` (0080), `iris_retencao` (0128) e `iris_alarme` (0129) —
-- a role de LOGIN é provisionamento de ambiente (senha), não objeto versionado.
-- O operador cria `<algo>_login LOGIN PASSWORD '…' IN ROLE iris_asr_worker` e
-- aponta `ASR_WORKER_DATABASE_URL` para ela (ver `.env.example` e
-- `infra/asr/runbook.md`). O sweeper (T15) já modela isso com
-- `ASR_SWEEPER_DATABASE_URL`.
--
-- Role é objeto de CLUSTER, não de banco: o `CREATE ROLE` vai dentro de um
-- guard de existência para o replay em um cluster que já a tem não abortar.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iris_asr_worker') THEN
    CREATE ROLE iris_asr_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO iris_asr_worker;
--> statement-breakpoint

-- As três que saem de `app_role`. `REVOKE` é ESCRITO, não deduzido de um
-- `CREATE OR REPLACE`: replace preserva a ACL da função, então recriar o corpo
-- nunca tira privilégio nenhum (memória `create-or-replace-torna-diff-
-- enganoso`). Sem estas três linhas o débito continuaria aberto com o diff
-- parecendo resolvido.
REVOKE EXECUTE ON FUNCTION public.app_asr_reservar(integer) FROM app_role;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_asr_concluir(uuid, text) FROM app_role;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_asr_falhar(uuid, boolean) FROM app_role;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.app_asr_reservar(integer) TO iris_asr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_concluir(uuid, text) TO iris_asr_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_asr_falhar(uuid, boolean) TO iris_asr_worker;
--> statement-breakpoint

-- `app_asr_objetos_em_uso` CONTINUA em `app_role`: ela cumpre a régua do 1 bit
-- por chave, e quem a chama além do worker é o sweeper (T15), cuja credencial
-- (`ASR_SWEEPER_DATABASE_URL`) é membro de `app_role`. Tirá-la daqui quebraria
-- o sweeper sem ganho de contenção. O worker ganha o `EXECUTE` pelo seu próprio
-- papel para não depender de também ser membro de `app_role`.
GRANT EXECUTE ON FUNCTION public.app_asr_objetos_em_uso(text[]) TO iris_asr_worker;
