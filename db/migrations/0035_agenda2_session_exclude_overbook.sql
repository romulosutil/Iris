-- Agenda 2.0 (Etapa A) — anti duplo-book garantido no banco (não só app-check):
-- dois coordenadores alocando o mesmo slot em paralelo é TOCTOU. EXCLUDE gist
-- (requer btree_gist, 0021) só vale p/ estado='agendada' — sessão cancelada/
-- falta libera o horário. Range meia-aberto [inicio, fim): 11:00 encosta em
-- 10:00–11:00 sem sobrepor.
--
-- Fim da sessão via helper session_fim() marcado IMMUTABLE: o operador nativo
-- `timestamptz + interval` é apenas STABLE (ambíguo em DST para intervalos de
-- dia/mês), e o Postgres recusa expressão não-IMMUTABLE em índice. Somar N
-- MINUTOS a um instante absoluto é determinístico (DST não afeta), então o
-- wrapper IMMUTABLE é correto e seguro para este uso.
CREATE OR REPLACE FUNCTION session_fim(p_inicio timestamptz, p_duracao_min integer)
  RETURNS timestamptz LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT p_inicio + make_interval(mins => p_duracao_min);
  $$;
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_no_overbook_terapeuta"
  EXCLUDE USING gist (
    terapeuta_id WITH =,
    tstzrange(agendada_para, session_fim(agendada_para, duracao_min)) WITH &&
  ) WHERE (estado = 'agendada');
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_no_overbook_paciente"
  EXCLUDE USING gist (
    patient_id WITH =,
    tstzrange(agendada_para, session_fim(agendada_para, duracao_min)) WITH &&
  ) WHERE (estado = 'agendada');
