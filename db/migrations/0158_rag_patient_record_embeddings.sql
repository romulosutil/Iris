-- D11 / #260 — infraestrutura de RAG sobre prontuários: extensão `vector`,
-- tabela `patient_record_embeddings`, RLS, e os dois definers que são a única
-- porta de escrita e de busca.
--
-- ⚠️ DEPENDÊNCIA DE DEPLOY (leia antes de aplicar em qualquer ambiente):
-- esta migração exige a extensão `pgvector`. A imagem `postgres:17-alpine`
-- (a que o `infra/docker-compose.yml` usava até este PR, e a que roda no
-- Easypanel/VPS hoje) NÃO a contém — `CREATE EXTENSION vector` falha com
-- `could not open extension control file`. Trocar a imagem do Postgres de
-- PRODUÇÃO para `pgvector/pgvector:pg17` é decisão do Rômulo e precisa
-- acontecer ANTES do `pnpm db:migrate` do deploy. Ver `infra/README.md`,
-- seção "pgvector: dependência de imagem do Postgres".
--
-- Escrita À MÃO, fora do `db:generate` e sem tocar o snapshot do Drizzle:
--   * o tipo `vector` vem de uma extensão — o `schema.ts` não o modela sem
--     acoplar o snapshot a um tipo que só existe se a extensão existir;
--   * extensão, policy, GRANT por coluna e função `SECURITY DEFINER` são,
--     todos, coisas que o Drizzle não modela (CLAUDE.md §Migrações, item 1);
--   * tabela ausente do `schema.ts` E do snapshot é INVISÍVEL ao
--     `drizzle-kit generate` — ele não emite `DROP` para o que nunca conheceu.
--     Mesmo regime da `0154` (schema do pg-boss). Quem for ler a tabela no app
--     usa SQL cru (e, na prática, os definers abaixo).

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

-- ─── Tabela ──────────────────────────────────────────────────────────────────
--
-- `trecho` guarda o texto JÁ SANITIZADO (`src/lib/ai/pii-sanitizer.ts`), nunca
-- o diário cru: é ele que volta na recuperação e é ele que foi embeddado. O
-- diário original continua onde sempre esteve (`session_note.texto`), sob a
-- RLS dele.
--
-- `sessao_em` é cópia denormalizada de `session.agendada_para`. Existe porque a
-- rastreabilidade frase-a-frase da #260 (guardrail 4) exige devolver o
-- timestamp ORIGINAL da sessão junto do trecho, e o definer de busca não pode
-- depender de que quem chama enxergue `session` — o `SourceAttributionBadge`
-- renderiza com o que o definer devolveu. Denormalização assumida: reagendar
-- uma sessão já indexada não reescreve esta coluna. Não é bug silencioso, é
-- o preço de não acoplar a leitura do RAG à RLS de `session`; quem reindexar
-- a nota atualiza a linha.
--
-- `modelo` NÃO é decoração: um embedding só é comparável com outro do MESMO
-- modelo e da MESMA dimensão. Trocar de modelo sem reindexar produz distâncias
-- sem significado — e sem esta coluna a troca seria invisível.
CREATE TABLE patient_record_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  session_note_id uuid NOT NULL,
  sessao_em timestamptz NOT NULL,
  chunk_indice integer NOT NULL,
  trecho text NOT NULL,
  -- 768: dimensão da família de embeddings do Gemini (único provedor de IA do
  -- projeto) e folgadamente abaixo do teto de 2000 do índice HNSW do pgvector.
  -- Mudar a dimensão é migração de dados, não `ALTER COLUMN`.
  embedding vector(768) NOT NULL,
  modelo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),

  -- Constraints NOMEADAS no padrão Drizzle (`_pk`/`_fk`/`_unique`), não no
  -- padrão do Postgres (`_pkey`/`_fkey`/`_key`) — a `0078` renomeou o repo
  -- inteiro para esta convenção (CLAUDE.md §Migrações, item 1). `PRIMARY KEY`
  -- inline geraria `patient_record_embeddings_pkey`; daí a forma explícita.
  CONSTRAINT patient_record_embeddings_pk PRIMARY KEY (id),
  -- FK COMPOSTA (patient_id, clinic_id), não `patient_id` sozinho: é o padrão
  -- anti-IDOR em nível de banco que a Agenda 2.0 já usa (alvo
  -- `uq_patient_id_clinic`). Sem ela, uma linha poderia declarar o paciente de
  -- uma clínica e o `clinic_id` de outra, e a policy — que checa as duas —
  -- ficaria contraditória com o dado.
  CONSTRAINT patient_record_embeddings_patient_clinic_fk
    FOREIGN KEY (patient_id, clinic_id) REFERENCES patient (id, clinic_id)
    ON DELETE RESTRICT,
  -- `CASCADE`: apagar o diário apaga o que dele foi derivado. É requisito de
  -- LGPD, não conveniência — um embedding órfão de nota é dado derivado sem
  -- fonte auditável, exatamente o que a rastreabilidade frase-a-frase proíbe.
  CONSTRAINT patient_record_embeddings_session_note_fk
    FOREIGN KEY (session_note_id) REFERENCES session_note (id)
    ON DELETE CASCADE,
  -- Reindexar a mesma nota com o mesmo modelo é UPSERT, não linha nova.
  CONSTRAINT patient_record_embeddings_nota_chunk_modelo_unique
    UNIQUE (session_note_id, chunk_indice, modelo),
  CONSTRAINT patient_record_embeddings_chunk_indice_check
    CHECK (chunk_indice >= 0),
  CONSTRAINT patient_record_embeddings_trecho_check
    CHECK (btrim(trecho) <> '')
);
--> statement-breakpoint

-- Filtro ANTES do vetor: toda busca é de UM paciente, dentro de UMA clínica.
CREATE INDEX idx_patient_record_embeddings_paciente
  ON patient_record_embeddings (clinic_id, patient_id);
--> statement-breakpoint

CREATE INDEX idx_patient_record_embeddings_nota
  ON patient_record_embeddings (session_note_id);
--> statement-breakpoint

-- ÍNDICE VETORIAL: HNSW, não IVFFlat. Três razões, nesta ordem:
--
--  1. IVFFlat precisa de DADOS para ser construído: o `lists` é calibrado sobre
--     a distribuição existente, e um IVFFlat criado numa tabela vazia (que é
--     exatamente o estado desta aqui na hora da migração) tem recall péssimo
--     até ser recriado. HNSW é incremental — nasce vazio e vai bem.
--  2. O volume por tenant aqui é de milhares de chunks, não de milhões. O custo
--     de construção do HNSW, que é o argumento clássico a favor do IVFFlat, não
--     se materializa nessa ordem de grandeza.
--  3. Recall: HNSW entrega recall alto com parâmetros default; IVFFlat exige
--     `probes` afinado por carga, e afinar às cegas é como se perde recall sem
--     ninguém notar.
--
-- `vector_cosine_ops`: os embeddings do Gemini são comparados por cosseno.
--
-- ⚠️ PÓS-FILTRO: o HNSW do pgvector percorre o grafo e SÓ DEPOIS aplica o
-- `WHERE`. Num tenant que é uma fatia pequena do índice global, isso pode
-- devolver menos linhas que o `LIMIT` pedido. Por isso `app_rag_search_patient_history`
-- (abaixo) NÃO depende do HNSW para estar correta: com o recorte de um único
-- paciente o planejador prefere o índice B-tree acima + varredura exata, que
-- tem recall 1.0. O HNSW é aceleração para quando o acervo de um paciente
-- crescer, não a fronteira de correção.
CREATE INDEX idx_patient_record_embeddings_hnsw
  ON patient_record_embeddings
  USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint

-- ─── Privilégios ─────────────────────────────────────────────────────────────
--
-- GRANT por COLUNA, de propósito: `embedding` fica FORA. O vetor é uma
-- representação do texto clínico — devolvê-lo cru para a aplicação daria a
-- qualquer código do app um artefato derivado de PHI sem finalidade de uso.
-- Quem precisa comparar vetores é o definer de busca, que roda com os direitos
-- do dono.
--
-- ⚠️ Consequência conhecida (memória `postgres-column-grant-denies-table`):
-- `SELECT *` sob `app_role` falha com "permission denied for table
-- patient_record_embeddings". É intencional. Toda leitura lista colunas.
--
-- Sem INSERT/UPDATE/DELETE para `app_role`: a escrita passa obrigatoriamente
-- por `app_rag_indexar_chunk`, que é onde mora o gate de consentimento. Mesmo
-- regime de `session_snapshot` (0016).
REVOKE ALL ON patient_record_embeddings FROM PUBLIC;
--> statement-breakpoint

GRANT SELECT (
  id, clinic_id, patient_id, session_note_id, sessao_em,
  chunk_indice, trecho, modelo, criado_em
) ON patient_record_embeddings TO app_role;
--> statement-breakpoint

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--
-- `FORCE` além de `ENABLE`: sem ele o DONO da tabela ignoraria as policies, e
-- o dono é justamente quem roda migração e job.
ALTER TABLE patient_record_embeddings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patient_record_embeddings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Predicado exato mandado pela #260 (guardrail 1), com as duas metades:
--
--   * `clinic_id = app_clinic_id_exigido()` — o helper, NUNCA
--     `current_setting('app.clinic_id')` cru (42704/22P02 dentro da policy, sem
--     nomear o tenant) e NUNCA `app_clinic_id_atual()` (devolve NULL e o
--     `=` vira NULL: a linha some em silêncio). D16/#229.
--   * `app_patient_in_clinic(patient_id)` — a coluna `clinic_id` é dado, e dado
--     pode estar errado; esta metade vai à tabela `patient` conferir. A FK
--     composta acima torna as duas metades redundantes por construção, e é
--     assim que se quer: defesa em profundidade, não uma checagem só.
--
-- GRANT sem policy nega tudo em silêncio (`FORCE RLS` + policy só `TO app_role`
-- = zero linhas, sem erro). Por isso o par GRANT+POLICY está junto aqui.
CREATE POLICY patient_record_embeddings_select ON patient_record_embeddings
  FOR SELECT TO app_role
  USING (
    clinic_id = app_clinic_id_exigido()
    AND app_patient_in_clinic(patient_id)
  );
--> statement-breakpoint

-- ─── T4 — busca vetorial segura ──────────────────────────────────────────────
--
-- DEFINER porque `app_role` não tem SELECT em `embedding` (ver o GRANT acima):
-- sem os direitos do dono não há como calcular distância nenhuma. Sendo DEFINER,
-- ela IGNORA a RLS — o guard interno é a fronteira, e ele copia o predicado
-- EXATO de `patient_record_embeddings_select`, mais o gate de consentimento.
--
-- CONSENTIMENTO NA LEITURA, na forma AFIRMATIVA (`app_finalidade_consentida`),
-- e não na forma negativa (`app_finalidade_revogada`) que as policies de
-- prontuário usam: a forma negativa existe lá porque o acervo é ANTERIOR à
-- #133 e exigir consentimento afirmativo esconderia todo paciente legado. Aqui
-- não há acervo legado — a tabela nasce nesta migração e `app_rag_indexar_chunk`
-- só grava com consentimento vigente. Logo o afirmativo é estritamente mais
-- forte e não esconde nada: revogar a finalidade de IA cessa a recuperação na
-- mesma transação seguinte.
--
-- ⚠️ Revogação CESSA a leitura mas NÃO apaga a linha. O expurgo físico dos
-- embeddings ao revogar `uso_ia_processamento` está fora desta migração e
-- registrado no PR como pendência.
--
-- `p_limite` é saneado aqui, não confiado ao chamador: LIMIT vindo de fora sem
-- teto é como se pede a tabela inteira.
CREATE FUNCTION app_rag_search_patient_history(
  p_patient uuid,
  p_consulta vector(768),
  p_limite integer
)
RETURNS TABLE (
  id uuid,
  session_note_id uuid,
  sessao_em timestamptz,
  chunk_indice integer,
  trecho text,
  distancia double precision
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limite integer := LEAST(GREATEST(COALESCE(p_limite, 5), 1), 50);
BEGIN
  -- 1. Isolamento multi-tenant. INEGOCIÁVEL e primeiro.
  IF NOT app_patient_in_clinic(p_patient) THEN
    RAISE EXCEPTION 'app_rag_search_patient_history: paciente % fora da clínica do chamador (isolamento multi-tenant)', p_patient
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Finalidade consentida (LGPD, guardrail 2 da #260).
  IF NOT app_finalidade_consentida(p_patient, 'uso_ia_processamento') THEN
    RAISE EXCEPTION 'app_rag_search_patient_history: paciente % sem consentimento vigente para uso de IA', p_patient
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT e.id,
         e.session_note_id,
         e.sessao_em,
         e.chunk_indice,
         e.trecho,
         (e.embedding <=> p_consulta)::double precision
    FROM patient_record_embeddings e
   WHERE e.patient_id = p_patient
     -- Segunda metade do predicado da policy, escrita à mão porque o DEFINER
     -- não passa pela policy. Redundante com o guard 1 + FK composta, e é para
     -- ser: é o que impede que uma linha com `clinic_id` divergente vaze se a
     -- FK algum dia for afrouxada.
     AND e.clinic_id = app_clinic_id_exigido()
   ORDER BY e.embedding <=> p_consulta, e.session_note_id, e.chunk_indice
   LIMIT v_limite;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_rag_search_patient_history(uuid, vector, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_rag_search_patient_history(uuid, vector, integer) TO app_role;
--> statement-breakpoint

-- ─── T3 (metade SQL) — única porta de ESCRITA ────────────────────────────────
--
-- O gate de consentimento da #260 (guardrail 2) mora AQUI, não no TypeScript.
-- No TS ele seria uma verificação que um caminho de escrita novo esquece; no
-- banco ele é a única forma de a linha existir, porque `app_role` não tem
-- INSERT na tabela.
--
-- `clinic_id`, `patient_id` e `sessao_em` são DERIVADOS da nota, nunca aceitos
-- do chamador: aceitar `clinic_id` como argumento seria dar ao chamador a
-- chance de gravar no tenant errado.
CREATE FUNCTION app_rag_indexar_chunk(
  p_session_note uuid,
  p_chunk_indice integer,
  p_trecho text,
  p_embedding vector(768),
  p_modelo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient uuid;
  v_clinic uuid;
  v_sessao_em timestamptz;
  v_id uuid;
BEGIN
  SELECT s.patient_id, sn.clinic_id, s.agendada_para
    INTO v_patient, v_clinic, v_sessao_em
    FROM session_note sn
    JOIN session s ON s.id = sn.session_id
   WHERE sn.id = p_session_note;

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'app_rag_indexar_chunk: nota % inexistente', p_session_note
      USING ERRCODE = 'P0001';
  END IF;

  -- 1. Isolamento multi-tenant, nas duas metades do predicado da policy.
  IF NOT app_patient_in_clinic(v_patient) OR v_clinic <> app_clinic_id_exigido() THEN
    RAISE EXCEPTION 'app_rag_indexar_chunk: nota % fora da clínica do chamador (isolamento multi-tenant)', p_session_note
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Consentimento de IA VIGENTE — sem ele o diário não entra no pipeline
  --    vetorial, ponto. Forma afirmativa: fail-closed.
  IF NOT app_finalidade_consentida(v_patient, 'uso_ia_processamento') THEN
    RAISE EXCEPTION 'app_rag_indexar_chunk: paciente % sem consentimento vigente para uso de IA', v_patient
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO patient_record_embeddings
    (clinic_id, patient_id, session_note_id, sessao_em, chunk_indice, trecho, embedding, modelo)
  VALUES
    (v_clinic, v_patient, p_session_note, v_sessao_em, p_chunk_indice, p_trecho, p_embedding, p_modelo)
  ON CONFLICT ON CONSTRAINT patient_record_embeddings_nota_chunk_modelo_unique
  DO UPDATE SET trecho = EXCLUDED.trecho,
                embedding = EXCLUDED.embedding,
                sessao_em = EXCLUDED.sessao_em,
                criado_em = now()
  RETURNING patient_record_embeddings.id INTO v_id;

  RETURN v_id;
END; $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_rag_indexar_chunk(uuid, integer, text, vector, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_rag_indexar_chunk(uuid, integer, text, vector, text) TO app_role;
