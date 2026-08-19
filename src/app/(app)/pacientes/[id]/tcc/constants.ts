import { z } from "zod";

// #389 — formato Padesky (Mind Over Mood): as 12 opções viram slug (persistido
// em `tcc_rpd_entry.distorcoes_cognitivas` e validado contra
// `clinic.taxonomia_distorcoes`) + rótulo (só exibição, nunca gravado).
export const DISTORCOES_COGNITIVAS_OPCOES = [
  { slug: "catastrofizacao", rotulo: "Catastrofização" },
  { slug: "leitura_mental", rotulo: "Leitura Mental" },
  { slug: "tudo_ou_nada", rotulo: "Tudo-ou-Nada" },
  { slug: "generalizacao_excessiva", rotulo: "Generalização Excessiva" },
  { slug: "desqualificacao_positivo", rotulo: "Desqualificação do Positivo" },
  { slug: "raciocinio_emocional", rotulo: "Raciocínio Emocional" },
  { slug: "afirmacoes_deveria", rotulo: "Afirmações 'Deveria'" },
  { slug: "rotulacao", rotulo: "Rotulação" },
  { slug: "personalizacao", rotulo: "Personalização" },
  { slug: "filtro_mental", rotulo: "Filtro Mental" },
  { slug: "adivinhacao_futuro", rotulo: "Adivinhação do Futuro" },
  { slug: "outra_nao_especificada", rotulo: "Outra / Não Especificada" },
] as const;

export const DISTORCOES_COGNITIVAS_SLUGS = DISTORCOES_COGNITIVAS_OPCOES.map(
  (opcao) => opcao.slug,
);

export const ROTULO_POR_SLUG = new Map<string, string>(
  DISTORCOES_COGNITIVAS_OPCOES.map((opcao) => [opcao.slug, opcao.rotulo]),
);

export function rotuloDistorcao(slug: string): string {
  return ROTULO_POR_SLUG.get(slug) ?? slug;
}

export const salvarRpdSchema = z.object({
  patientId: z.string().uuid("ID do paciente inválido"),
  // Campos 1-3 (formato Padesky): situação, pensamento automático,
  // emoção + intensidade seguem obrigatórios.
  situacao: z.string().min(1, "Situação/gatilho é obrigatória"),
  pensamentoAutomatico: z
    .string()
    .min(1, "Pensamento automático é obrigatório"),
  emocao: z.string().min(1, "Emoção é obrigatória"),
  intensidade: z
    .number({ invalid_type_error: "Informe um número entre 0 e 100" })
    .int("Intensidade deve ser um número inteiro")
    .min(0, "Intensidade deve ser no mínimo 0")
    .max(100, "Intensidade deve ser no máximo 100"),
  credibilidadeInicial: z
    .number({ invalid_type_error: "Informe um número entre 0 e 100" })
    .int("Credibilidade deve ser um número inteiro")
    .min(0, "Credibilidade deve ser no mínimo 0")
    .max(100, "Credibilidade deve ser no máximo 100")
    .nullable()
    .optional(),
  evidenciasFavor: z.string().nullable().optional(),
  evidenciasContra: z.string().nullable().optional(),
  // Era `.min(1, "Resposta racional é obrigatória")` (Burns puro) — no
  // formato Padesky deixa de ser obrigatório, só a completude
  // "reestruturação completa" (derivada em leitura) exige.
  respostaRacional: z.string().nullable().optional(),
  credibilidadeAlternativa: z
    .number({ invalid_type_error: "Informe um número entre 0 e 100" })
    .int("Credibilidade deve ser um número inteiro")
    .min(0, "Credibilidade deve ser no mínimo 0")
    .max(100, "Credibilidade deve ser no máximo 100")
    .nullable()
    .optional(),
  // Só forma aqui — validação contra `clinic.taxonomia_distorcoes` acontece
  // em `logic.ts` (R19: não existe fonte canônica única, não é enum/CHECK).
  distorcoesCognitivas: z.array(z.string()).optional(),
  comportamentoResultante: z.string().nullable().optional(),
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
