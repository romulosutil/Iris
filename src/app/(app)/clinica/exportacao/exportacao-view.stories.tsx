import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ExportacaoView } from "./exportacao-view";

const meta: Meta<typeof ExportacaoView> = {
  title: "App/Clinica/ExportacaoView",
  component: ExportacaoView,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ExportacaoView>;

export const SemExportacaoAnterior: Story = {
  args: {
    clinicNome: "Clínica Terapêutica Horizonte",
    initialAtivo: null,
    initialHistorico: [],
  },
};

export const Processando: Story = {
  args: {
    clinicNome: "Clínica Terapêutica Horizonte",
    initialAtivo: {
      id: "bnd-12345",
      status: "processando",
      solicitadoEm: new Date(),
      iniciadoEm: new Date(),
      concluidoEm: null,
      expiraEm: null,
      bytesTamanho: null,
      sha256: null,
      erro: null,
      podeBaixar: false,
    },
    initialHistorico: [
      {
        id: "bnd-12345",
        status: "processando",
        solicitadoEm: new Date(),
        iniciadoEm: new Date(),
        concluidoEm: null,
        expiraEm: null,
        bytesTamanho: null,
        sha256: null,
        erro: null,
        podeBaixar: false,
      },
    ],
  },
};

export const ProntoParaDownload: Story = {
  args: {
    clinicNome: "Clínica Terapêutica Horizonte",
    initialAtivo: null,
    initialHistorico: [
      {
        id: "bnd-67890",
        status: "pronto",
        solicitadoEm: new Date("2026-08-22T19:00:00Z"),
        iniciadoEm: new Date("2026-08-22T19:00:02Z"),
        concluidoEm: new Date("2026-08-22T19:00:45Z"),
        expiraEm: new Date(Date.now() + 70 * 3600 * 1000), // expira em 70h
        bytesTamanho: "15485760", // ~15.4 MB
        sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        erro: null,
        podeBaixar: true,
      },
      {
        id: "bnd-antigo",
        status: "expirado",
        solicitadoEm: new Date("2026-08-01T10:00:00Z"),
        iniciadoEm: new Date("2026-08-01T10:00:02Z"),
        concluidoEm: new Date("2026-08-01T10:00:30Z"),
        expiraEm: new Date("2026-08-04T10:00:30Z"),
        bytesTamanho: "12300000",
        sha256:
          "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        erro: null,
        podeBaixar: false,
      },
    ],
  },
};
