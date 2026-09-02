import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListaPacientes } from "./lista-pacientes";
import type { PacienteListItem } from "./queries";
import { montarProntidao } from "@/lib/patient/prontidao";

const BASE: PacienteListItem = {
  id: "p1",
  nome: "Ana",
  nascimento: null,
  responsavelContato: null,
  escola: null,
  convenio: null,
  criadoEm: new Date("2026-01-01"),
  arquivadoEm: null,
  temPrescricao: true,
  proximoPasso: null,
};

describe("ListaPacientes — estado de prontidão", () => {
  it("mostra o próximo passo do paciente que ainda não gera dados", () => {
    render(
      <ListaPacientes
        pacientes={[{ ...BASE, proximoPasso: "Ativar ao menos uma meta" }]}
      />,
    );
    expect(screen.queryByText(/ativar ao menos uma meta/i)).not.toBeNull();
  });

  it("não polui a linha do paciente que já está pronto", () => {
    render(<ListaPacientes pacientes={[BASE]} />);
    expect(screen.queryByTestId("pill-prontidao")).toBeNull();
  });
});

// A recepção não pode ver estado clínico. `montarProntidao` já devolve
// `proximo: null` para ela, então `proximoPasso` chega nulo e o selo some.
// Este teste trava esse encadeamento: sem ele, alguém "conserta" o pill
// lendo os fatos direto e reintroduz a afirmação falsa.
describe("prontidão na lista — recepção", () => {
  it("nunca produz proximoPasso, mesmo com prontuário incompleto", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: {
        temFichaClinica: false,
        temAnamnese: false,
        temProtocoloAtivo: false,
        temMetaAtiva: false,
        temInstrumentoAplicado: false,
        temSessaoConsolidada: false,
      },
      role: "admin_recepcao",
      patientId: "p1",
    });
    expect(p.proximo?.rotulo ?? null).toBeNull();
  });
});
