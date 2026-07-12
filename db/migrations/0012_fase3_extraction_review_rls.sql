-- Fase 3 Plano 2: revisão humana das extrações.
-- Amplia o GRANT por coluna para o terapeuta gravar a DECISÃO de revisão:
-- estado (aprovada/editada/descartada), conteúdo editado, e quem/quando revisou.
-- A sugestão ORIGINAL da IA (coluna `payload`) permanece imutável — auditoria
-- da Camada 1 (o que a IA sugeriu vs. o que o humano aprovou).
-- A policy de linha `extraction_update` (0006) já restringe ao terapeuta dono
-- da sessão; aqui só liberamos as colunas adicionais (o GRANT é aditivo).
GRANT UPDATE (estado, payload_editado, revisado_por, revisado_em) ON extraction TO app_role;
