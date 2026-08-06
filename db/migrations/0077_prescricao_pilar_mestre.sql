-- #203 — Fatia 2: a prescrição vira o PILAR MESTRE e passa a ser escrita pela UI.
--
-- A fatia 1 fechou o lado do CONSUMO (`care_team_membership`): unique parcial
-- contra dupla contagem, CHECK de passo, GRANT de coluna. Esta migração fecha o
-- lado do TETO (`patient_alvo_disciplina`), que até agora era escrito só pelo
-- cadastro de paciente e por isso nunca tinha sido apertado.
--
-- Os três buracos, medidos (não deduzidos do diff):
--
--   1. `idx_patient_alvo_vigente` NÃO é unique. Nada impede DUAS prescrições
--      vigentes para o mesmo (patient_id, disciplina) — e aí o teto da
--      disciplina passa a depender de qual linha a query pegar. É o espelho
--      exato do bug que `ctm_unico_vigente` fecha do lado do consumo, e a
--      fatia 2 é justamente quem passa a escrever prescrição pela tela.
--
--   2. `app_role` tem `UPDATE` de TABELA (0025), sem grant por coluna. Numa
--      tabela SCD2 isso significa que a aplicação pode reescrever
--      `horas_alvo_semana` NO LUGAR, destruindo o histórico que a tabela existe
--      para guardar — "o convênio audita o alvo DA ÉPOCA". Represcrever tem de
--      ser fechar a vigência anterior e abrir linha nova, nunca um UPDATE.
--
--   3. `app_role` tem `DELETE` + policy de DELETE. Apagar prescrição derruba a
--      trilha inteira. Decidido com o Rômulo em 06/08/2026: revogar. A
--      prescrição passa a ser append-only de verdade (INSERT + fechamento de
--      vigência), como já é o vínculo de equipe.
--
-- Padrão de (2) já existe no repo: a 0044 revogou UPDATE de tabela em `patient`
-- e `care_team_membership` e passou a conceder coluna a coluna.

-- ─── Duplicata vigente antes do índice único ─────────────────────────────────
-- Fecha duplicatas que já existam, mantendo a mais recente. Append-only: marca
-- `vigencia_fim`, não deleta — o histórico das duas linhas segue auditável.
-- Sem isto o CREATE UNIQUE INDEX falharia no deploy contra qualquer banco que
-- já tenha a duplicata, que é exatamente o estado que este índice existe para
-- impedir daqui em diante.
--
-- Roda ANTES da revogação do UPDATE de tabela lá embaixo de propósito: aqui
-- quem executa é o dono da tabela na migração, não `app_role`.
WITH ranqueado AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY patient_id, disciplina
           ORDER BY vigencia_inicio DESC, criado_em DESC, id DESC
         ) AS pos
    FROM patient_alvo_disciplina
   WHERE vigencia_fim IS NULL
)
UPDATE patient_alvo_disciplina a
   SET vigencia_fim = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  FROM ranqueado r
 WHERE a.id = r.id AND r.pos > 1;
--> statement-breakpoint

-- Índice PARCIAL (só vigentes) pelo mesmo motivo do `ctm_unico_vigente`:
-- encerrar uma prescrição libera a combinação, então represcrever a mesma
-- disciplina depois continua possível, com as duas passagens no histórico.
-- É o que o SCD2 desta tabela exige — a chave não pode incluir a vigência.
CREATE UNIQUE INDEX patient_alvo_unico_vigente
  ON patient_alvo_disciplina (patient_id, disciplina)
  WHERE vigencia_fim IS NULL;
--> statement-breakpoint

-- O índice antigo vira redundante: o unique parcial tem a mesma chave e o mesmo
-- predicado, e serve as mesmas buscas. Manter os dois pagaria escrita dobrada
-- em toda prescrição sem ganho de leitura nenhum.
DROP INDEX IF EXISTS idx_patient_alvo_vigente;
--> statement-breakpoint

-- ─── SCD2 no nível do privilégio: só a vigência pode ser mexida ──────────────
-- Depois disto, um `UPDATE ... SET horas_alvo_semana` da aplicação falha com
-- permission denied em vez de reescrever prescrição clínica passada em
-- silêncio. `SELECT`/`INSERT`/`DELETE` do grant de 0025 não são tocados aqui —
-- só o UPDATE é revogado e reconcedido coluna a coluna.
REVOKE UPDATE ON patient_alvo_disciplina FROM app_role;
--> statement-breakpoint

GRANT UPDATE (vigencia_fim) ON patient_alvo_disciplina TO app_role;
--> statement-breakpoint

-- ─── Prescrição é append-only: não se apaga ─────────────────────────────────
-- Revogar o privilégio E derrubar a policy. Só o privilégio bastaria hoje, mas
-- policy órfã de DELETE é convite para alguém reconceder o grant no futuro
-- achando que a barreira continua de pé — a policy é a documentação executável
-- de que apagar era permitido.
REVOKE DELETE ON patient_alvo_disciplina FROM app_role;
--> statement-breakpoint

DROP POLICY IF EXISTS patient_alvo_disciplina_delete ON patient_alvo_disciplina;
