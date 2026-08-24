-- Políticas RLS para barreira de leitura sob sigilo por disciplina (#119 T3).
-- Atualiza session_note_select, extraction_select e audio_select adicionando app_session_conteudo_visivel(session_id).

ALTER POLICY session_note_select ON session_note
  USING (((clinic_id = app_clinic_id_exigido()) AND app_session_clinica_visivel(session_id) AND app_session_conteudo_visivel(session_id)));
--> statement-breakpoint

ALTER POLICY extraction_select ON extraction
  USING (((clinic_id = app_clinic_id_exigido()) AND app_session_clinica_visivel(session_id) AND app_session_conteudo_visivel(session_id)));
--> statement-breakpoint

ALTER POLICY audio_select ON audio_capture
  USING (((clinic_id = app_clinic_id_exigido()) AND app_session_clinica_visivel(session_id) AND app_session_conteudo_visivel(session_id)));
