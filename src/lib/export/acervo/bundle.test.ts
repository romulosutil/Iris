import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { sha256Hex } from "@/lib/report/hash";
import {
  montarBundleZip,
  TETO_BUNDLE_BYTES,
  type ContextoBundle,
} from "./bundle";
import { TABELAS_EXPORTADAS, type TabelaColetada } from "./coletor";

describe("Empacotador ZIP do Acervo (Task T3)", () => {
  function criarColetaMock(): ContextoBundle {
    const tabelas: TabelaColetada[] = TABELAS_EXPORTADAS.map((tabela) => ({
      tabela,
      ndjson: `{"tabela":"${tabela}","id":"123","criado_em":"2026-08-22T20:00:00.000Z"}\n`,
      total: 1,
    }));

    const contagens: Record<string, number> = {};
    for (const t of tabelas) {
      contagens[t.tabela] = t.total;
    }

    return {
      clinicId: "00000000-0000-0000-0000-000000000001",
      clinicNome: "Clínica Teste ABC",
      solicitadoPorId: "00000000-0000-0000-0000-000000000002",
      geradoEm: new Date("2026-08-22T20:00:00.000Z"),
      coleta: {
        tabelas,
        contagens,
        pdfs: [
          {
            reportId: "00000000-0000-0000-0000-000000000003",
            bytes: Buffer.from("%PDF-1.4 mock pdf content"),
          },
        ],
      },
    };
  }

  it("monta o ZIP e valida que cada SHA-256 do manifest bate com os bytes reais", () => {
    const ctx = criarColetaMock();
    const bundle = montarBundleZip(ctx);

    expect(bundle.bytesTamanho).toBeGreaterThan(0);
    expect(bundle.sha256).toBe(sha256Hex(bundle.zipBuffer));

    // Descompacta o ZIP
    const descompactado = unzipSync(new Uint8Array(bundle.zipBuffer));

    // Verifica presença do manifest e README
    expect(descompactado["manifest.json"]).toBeDefined();
    expect(descompactado["README.txt"]).toBeDefined();

    // Lê manifest de dentro do ZIP
    const manifestLido = JSON.parse(strFromU8(descompactado["manifest.json"]!));
    expect(manifestLido.versao).toBe("1.0");
    expect(manifestLido.clinic.nome).toBe("Clínica Teste ABC");

    // Valida cada arquivo listado no manifesto contra os bytes reais descompactados
    for (const item of manifestLido.arquivos) {
      const u8Arquivo = descompactado[item.caminho];
      expect(
        u8Arquivo,
        `Arquivo ${item.caminho} deve existir no ZIP`,
      ).toBeDefined();
      const bufArquivo = Buffer.from(u8Arquivo!);
      expect(bufArquivo.length).toBe(item.bytes);
      expect(sha256Hex(bufArquivo)).toBe(item.sha256);
    }
  });

  it("alterar 1 byte em qualquer arquivo derruba a conferência de SHA-256", () => {
    const ctx = criarColetaMock();
    const bundle = montarBundleZip(ctx);

    const descompactado = unzipSync(new Uint8Array(bundle.zipBuffer));
    const arquivoOriginal = Buffer.from(descompactado["dados/patient.ndjson"]!);

    // Altera 1 byte
    const arquivoCorrompido = Buffer.from(arquivoOriginal);
    arquivoCorrompido[0] = arquivoCorrompido[0]! ^ 0xff;

    const shaOriginal = sha256Hex(arquivoOriginal);
    const shaCorrompido = sha256Hex(arquivoCorrompido);

    expect(shaCorrompido).not.toBe(shaOriginal);
  });

  it("lança erro nomeado 'bundle_excede_limite' se o ZIP ultrapassar o teto configurado", () => {
    const ctx = criarColetaMock();
    // Passa teto minúsculo (100 bytes) para validar que estoura o erro nomeado
    expect(() => montarBundleZip(ctx, 100)).toThrow("bundle_excede_limite");
  });
});
