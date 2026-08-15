import { z } from "zod";

export const DISTORCOES_COGNITIVAS_OPCOES = [
  "Catastrofização",
  "Leitura Mental",
  "Tudo-ou-Nada",
  "Generalização Excessiva",
  "Desqualificação do Positivo",
  "Raciocínio Emocional",
  "Afirmações 'Deveria'",
  "Rotulação",
  "Personalização",
  "Filtro Mental",
  "Adivinhação do Futuro",
  "Outra / Não Especificada",
] as const;

export const salvarRpdSchema = z.object({
  patientId: z.string().uuid("ID do paciente inválido"),
  situacao: z.string().min(1, "Situação/gatilho é obrigatória"),
  pensamentoAutomatico: z.string().min(1, "Pensamento automático é obrigatório"),
  emocao: z.string().min(1, "Emoção é obrigatória"),
  intensidade: z
    .number({ invalid_type_error: "Informe um número entre 0 e 100" })
    .int("Intensidade deve ser um número inteiro")
    .min(0, "Intensidade deve ser no mínimo 0")
    .max(100, "Intensidade deve ser no máximo 100"),
  distorcaoCognitiva: z.enum(DISTORCOES_COGNITIVAS_OPCOES, {
    errorMap: () => ({ message: "Distorção cognitiva inválida" }),
  }),
  respostaRacional: z.string().min(1, "Resposta racional é obrigatória"),
  intensidadePos: z
    .number({ invalid_type_error: "Informe um número entre 0 e 100" })
    .int("Intensidade deve ser um número inteiro")
    .min(0, "Intensidade deve ser no mínimo 0")
    .max(100, "Intensidade deve ser no máximo 100")
    .nullable()
    .optional(),
  sessionId: z.string().uuid("ID de sessão inválido").nullable().optional(),
});

export type SalvarRpdInput = z.input<typeof salvarRpdSchema>;
