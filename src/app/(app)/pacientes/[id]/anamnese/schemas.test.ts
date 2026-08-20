import { describe, it, expect } from "vitest";
import {
  PROCEDENCIAS,
  EIXOS_ANAMNESE,
  alvoSchema,
  salvarRascunhoSchema,
  validarAnamneseSchema,
} from "./schemas";
import { ORDEM_EIXOS } from "@/lib/evidence/espectro";

describe("anamnese/schemas", () => {
  describe("PROCEDENCIAS", () => {
    it("should contain expected procedencias", () => {
      expect(PROCEDENCIAS).toEqual([
        "relatado_responsavel",
        "observado_avaliador",
        "registro_anterior",
      ]);
    });
  });

  describe("EIXOS_ANAMNESE", () => {
    it("should be identical to ORDEM_EIXOS from espectro", () => {
      expect(EIXOS_ANAMNESE).toEqual(ORDEM_EIXOS);
    });
  });

  describe("alvoSchema", () => {
    it("should accept valid alvo with all fields", () => {
      const validAlvo = {
        eixo: "comunicacao_expressiva",
        descricao: "Capacidade de comunicar de forma clara",
        disciplina: "Fono",
        milestone_id: null,
        nivel_ajuda_inicial: 2,
        procedencia: "observado_avaliador",
        criterio_n: 3,
        criterio_m: 4,
        ciclo_revisao_semanas: 8,
      };
      const result = alvoSchema.safeParse(validAlvo);
      expect(result.success).toBe(true);
    });

    it("should accept null for nivel_ajuda_inicial", () => {
      const alvo = {
        eixo: "comunicacao_expressiva",
        descricao: "Capacidade de comunicar de forma clara",
        procedencia: "observado_avaliador",
      };
      const result = alvoSchema.safeParse(alvo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nivel_ajuda_inicial).toBeNull();
      }
    });

    it("should reject undefined for nivel_ajuda_inicial by not converting it to 0", () => {
      const alvo = {
        eixo: "comunicacao_expressiva",
        descricao: "Capacidade de comunicar de forma clara",
        procedencia: "observado_avaliador",
        nivel_ajuda_inicial: undefined,
      };
      const result = alvoSchema.safeParse(alvo);
      if (result.success) {
        // undefined should not become 0; it should remain null or be rejected
        expect(result.data.nivel_ajuda_inicial).not.toBe(0);
      }
    });

    it("should require procedencia field", () => {
      const alvoWithoutProcedencia = {
        eixo: "comunicacao_expressiva",
        descricao: "Capacidade de comunicar de forma clara",
      };
      const result = alvoSchema.safeParse(alvoWithoutProcedencia);
      expect(result.success).toBe(false);
    });

    it("should validate eixo against EIXOS_ANAMNESE", () => {
      const validAlvo = {
        eixo: "comunicacao_expressiva",
        descricao: "Test",
        procedencia: "observado_avaliador",
      };
      const result = alvoSchema.safeParse(validAlvo);
      expect(result.success).toBe(true);

      const invalidAlvo = {
        eixo: "invalid_eixo",
        descricao: "Test",
        procedencia: "observado_avaliador",
      };
      const invalidResult = alvoSchema.safeParse(invalidAlvo);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("salvarRascunhoSchema", () => {
    it("should accept valid rascunho with 1 alvo", () => {
      const validRascunho = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        alvos: [
          {
            eixo: "comunicacao_expressiva",
            descricao: "Test alvo",
            procedencia: "observado_avaliador",
          },
        ],
      };
      const result = salvarRascunhoSchema.safeParse(validRascunho);
      expect(result.success).toBe(true);
    });

    it("should accept valid rascunho with 24 alvos", () => {
      const alvos = Array.from({ length: 24 }, (_, i) => ({
        eixo: EIXOS_ANAMNESE[i % EIXOS_ANAMNESE.length],
        descricao: `Alvo ${i + 1}`,
        procedencia: "observado_avaliador" as const,
      }));

      const validRascunho = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        alvos,
      };
      const result = salvarRascunhoSchema.safeParse(validRascunho);
      expect(result.success).toBe(true);
    });

    it("should reject rascunho with 25 alvos with named error message", () => {
      const alvos = Array.from({ length: 25 }, (_, i) => ({
        eixo: EIXOS_ANAMNESE[i % EIXOS_ANAMNESE.length],
        descricao: `Alvo ${i + 1}`,
        procedencia: "observado_avaliador" as const,
      }));

      const invalidRascunho = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        alvos,
      };
      const result = salvarRascunhoSchema.safeParse(invalidRascunho);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("24");
      }
    });
  });

  describe("validarAnamneseSchema", () => {
    it("should accept valid validar payload", () => {
      const validPayload = {
        anamneseId: "550e8400-e29b-41d4-a716-446655440000",
      };
      const result = validarAnamneseSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should require anamneseId as UUID", () => {
      const invalidPayload = {
        anamneseId: "not-a-uuid",
      };
      const result = validarAnamneseSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });
});
