ALTER TABLE report ADD CONSTRAINT report_narrativo_com_ia
  CHECK (tipo <> 'convenio_narrativo' OR gerado_por_ia = true) NOT VALID;
ALTER TABLE report VALIDATE CONSTRAINT report_narrativo_com_ia;
