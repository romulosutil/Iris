-- #203 — Fatia 1: a alocação da equipe passa a CONSUMIR a carga prescrita.
--
-- Até aqui `patient_alvo_disciplina.horas_alvo_semana` (o teto prescrito) e a
-- equipe viviam desconectados: dava para alocar 40h de Fono num paciente com 8h
-- prescritas e nada avisava. Esta migração cria o lado do CONSUMO
-- (`care_team_membership.horas_semana`) e, no mesmo ato, fecha as constraints
-- que faltavam no lado do TETO — se só a coluna nova tivesse regra, seria
-- possível prescrever 0,3h e nunca conseguir alocar contra isso.
--
-- Decisões clínicas travadas com o Rômulo em 06/08/2026 (detalhe e o porquê em
-- docs/implementation_plan.md §7):
--
--   D-B  `substituto` CONSOME saldo. Hora entregue é hora entregue: a família
--        recebeu e o convênio conta.
--   D-C  `coordenador_referencia` NÃO consome — é gestão. O PAPEL define o
--        consumo, nunca a pessoa: coordenador que também atende ganha um
--        SEGUNDO vínculo com papel `terapeuta_referencia`. Daí duas coisas
--        aqui: o CHECK que proíbe horas em papel de gestão, e o
--        `papel_na_equipe` dentro da chave do índice único.
--   D-D  Horas obrigatórias em vínculo novo que consome. É validação de
--        APLICAÇÃO, não `NOT NULL` — a coluna precisa aceitar NULL por causa
--        dos vínculos legado e do próprio `coordenador_referencia`.

ALTER TABLE care_team_membership
  ADD COLUMN horas_semana numeric(4,1);
--> statement-breakpoint

-- ─── Guard de diagnóstico antes de apertar o teto ────────────────────────────
-- O CHECK abaixo é aplicado também a `patient_alvo_disciplina`, que tem dado em
-- produção e nunca teve constraint nenhuma. Se houver alvo fora da regra, o
-- erro nu do Postgres diz só o nome da constraint — não diz QUAL linha nem o
-- que fazer, e a migração aborta o deploy inteira sem pista. Este bloco falha
-- antes, nomeando os registros e a saída.
DO $$
DECLARE
  invalidos text;
BEGIN
  SELECT string_agg(
           format('patient_id=%s disciplina=%s horas=%s', patient_id, disciplina, horas_alvo_semana),
           E'\n  '
         )
    INTO invalidos
    FROM patient_alvo_disciplina
   WHERE NOT (horas_alvo_semana > 0
              AND horas_alvo_semana <= 60
              AND (horas_alvo_semana * 10)::int % 5 = 0);

  IF invalidos IS NOT NULL THEN
    RAISE EXCEPTION
      'Há prescrições fora da regra de 30 em 30 minutos (>0, <=60h, múltiplo de 0,5h). Corrija estes registros ANTES de reaplicar a 0076 — arredondar aqui seria reescrever prescrição clínica em silêncio:%s  %s',
      E'\n', invalidos;
  END IF;
END $$;
--> statement-breakpoint

-- ─── Passo de 30 minutos e teto de sanidade, nos DOIS lados da conta ─────────
-- Passo de 0,5h porque a agenda é marcada de 30 em 30 minutos; sem isso entram
-- dízimas como 3.3333h que nunca fecham com a soma da equipe.
--
-- O teto de 60h/semana não é regra clínica — é rede contra erro de digitação:
-- pega o `200` que era `20` antes de virar uma barra de cobertura em 1000%.
--
-- ⚠️ O `IS NULL OR` é explícito de propósito: expressão NULL num CHECK
-- SATISFAZ a constraint. A nulidade aqui é decisão (legado + gestão, ver D-D),
-- não acidente — deixar implícito esconderia isso de quem ler depois.
ALTER TABLE care_team_membership
  ADD CONSTRAINT ctm_horas_semana_passo
  CHECK (
    horas_semana IS NULL
    OR (horas_semana > 0 AND horas_semana <= 60 AND (horas_semana * 10)::int % 5 = 0)
  );
--> statement-breakpoint

ALTER TABLE patient_alvo_disciplina
  ADD CONSTRAINT patient_alvo_horas_passo
  CHECK (
    horas_alvo_semana > 0
    AND horas_alvo_semana <= 60
    AND (horas_alvo_semana * 10)::int % 5 = 0
  );
--> statement-breakpoint

-- ─── D-C no banco: gestão não tem carga ──────────────────────────────────────
-- Não é só higiene de dado. A soma de cobertura filtra por papel na aplicação;
-- se alguém esquecer esse filtro numa query futura, este CHECK garante que o
-- coordenador de referência não tem hora nenhuma para injetar no total. Defesa
-- em profundidade sobre a única conta que a tela de equipe inteira exibe.
ALTER TABLE care_team_membership
  ADD CONSTRAINT ctm_gestao_sem_horas
  CHECK (papel_na_equipe <> 'coordenador_referencia' OR horas_semana IS NULL);
--> statement-breakpoint

-- ─── Duplicata vigente = dupla contagem de carga ─────────────────────────────
-- Antes de criar o índice, encerra duplicatas vigentes que já existam,
-- mantendo a mais recente. É append-only (marca `vigencia_fim`, não deleta),
-- então o histórico das duas linhas continua auditável. Sem isto o CREATE
-- UNIQUE INDEX falharia no deploy contra qualquer banco que já tenha a
-- duplicata — e a duplicata é justamente o que esta migração existe para
-- impedir daqui em diante.
WITH ranqueado AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY patient_id, user_id, disciplina, papel_na_equipe
           ORDER BY vigencia_inicio DESC, id DESC
         ) AS pos
    FROM care_team_membership
   WHERE vigencia_fim IS NULL
)
UPDATE care_team_membership m
   SET vigencia_fim = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  FROM ranqueado r
 WHERE m.id = r.id AND r.pos > 1;
--> statement-breakpoint

-- `papel_na_equipe` FAZ PARTE da chave por causa da D-C: o mesmo coordenador
-- precisa poder ser `coordenador_referencia` (gestão do caso) E
-- `terapeuta_referencia` (atendendo, consumindo saldo) na mesma disciplina.
-- Sem o papel na chave, a modelagem "o papel define o consumo" seria
-- irrepresentável.
--
-- O índice é PARCIAL (só vigentes) de propósito: encerrar um vínculo libera a
-- combinação, então recontratar a mesma pessoa na mesma disciplina depois de
-- uma saída continua possível, com as duas passagens preservadas no histórico.
CREATE UNIQUE INDEX ctm_unico_vigente
  ON care_team_membership (patient_id, user_id, disciplina, papel_na_equipe)
  WHERE vigencia_fim IS NULL;
--> statement-breakpoint

-- ─── GRANT de coluna ─────────────────────────────────────────────────────────
-- A 0044 (PX3b) REVOGOU `UPDATE` de tabela em `care_team_membership` e passou a
-- conceder coluna a coluna. Coluna nova NÃO herda nada: sem este grant, editar
-- as horas de um membro falharia como "permission denied for table
-- care_team_membership" — mensagem que não diz qual coluna e custa caro para
-- diagnosticar. `INSERT` continua coberto pelo grant de tabela (só o UPDATE foi
-- revogado), então só o UPDATE precisa ser reaberto aqui.
GRANT UPDATE (horas_semana) ON care_team_membership TO app_role;
