import { describe, expect, it } from "vitest";
import { montarProntidao, type FatosProntidao } from "./prontidao";

const NADA: FatosProntidao = {
  temFichaClinica: false,
  temAnamnese: false,
  temProtocoloAtivo: false,
  temMetaAtiva: false,
  temInstrumentoAplicado: false,
  temSessaoConsolidada: false,
};

const TUDO: FatosProntidao = {
  temFichaClinica: true,
  temAnamnese: true,
  temProtocoloAtivo: true,
  temMetaAtiva: true,
  temInstrumentoAplicado: true,
  temSessaoConsolidada: true,
};

describe("montarProntidao", () => {
  it("bloqueia documentar quando falta protocolo em protocol_driven", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(false);
    expect(p.proximo?.id).toBe("ficha_clinica");
    expect(p.degraus.find((d) => d.id === "protocolo")?.estado).toBe(
      "bloqueante",
    );
  });

  it("NÃO bloqueia por ficha clínica nem anamnese — são recomendados", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: { ...NADA, temProtocoloAtivo: true, temMetaAtiva: true },
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(true);
    expect(p.degraus.find((d) => d.id === "ficha_clinica")?.estado).toBe(
      "pendente",
    );
  });

  it("some (proximo null) quando a escada inteira está concluída", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: TUDO,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.proximo).toBeNull();
    expect(p.podeDocumentar).toBe(true);
    // O `proximo === null` daqui é "escada cumprida" — o ÚNICO que autoriza o
    // cartão a sumir sem mentir.
    expect(p.situacao).toBe("pronto");
  });

  it("terapeuta não recebe rota para um degrau que é do coordenador", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: NADA,
      role: "terapeuta",
      patientId: "p1",
    });
    expect(p.degraus.find((d) => d.id === "protocolo")?.rota).toBeNull();
    expect(p.quemResolve).toBe("Coordenação");
  });

  it("coordenador recebe a rota real do degrau", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.degraus.find((d) => d.id === "protocolo")?.rota).toBe(
      "/pacientes/p1/cadastro-clinico",
    );
    expect(p.quemResolve).toBeNull();
  });

  it("cognitive_behavioral bloqueia por instrumento, não por meta", () => {
    const p = montarProntidao({
      modalidade: "cognitive_behavioral",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(false);
    expect(p.degraus.some((d) => d.id === "meta")).toBe(false);
  });

  it("conventional nunca bloqueia documentar", () => {
    const p = montarProntidao({
      modalidade: "conventional",
      fatos: NADA,
      role: "terapeuta",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(true);
  });

  it("modalidade nula bloqueia e pede a modalidade", () => {
    const p = montarProntidao({
      modalidade: null,
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.podeDocumentar).toBe(false);
    expect(p.proximo?.id).toBe("modalidade");
    // Bloqueado por FALTA DE DADO, com leitura clínica intacta: `pendente`,
    // nunca `fatos_nao_visiveis`. Aqui a escada PODE nomear o degrau.
    expect(p.situacao).toBe("pendente");
  });

  // D-A9: sob a RLS da recepção `goal_select` devolve zero linhas para metas
  // que existem. Ler fatos com esse papel produziria "Falta meta" sobre um
  // prontuário completo — falso E clínico, para quem não pode ver clínico.
  it("admin_recepcao não recebe escada nem degrau clínico nomeado", () => {
    const p = montarProntidao({
      modalidade: "protocol_driven",
      fatos: TUDO,
      role: "admin_recepcao",
      patientId: "p1",
    });
    expect(p.degraus).toEqual([]);
    expect(p.proximo).toBeNull();
    expect(p.podeDocumentar).toBe(false);
    expect(p.quemResolve).toBe("Coordenação");
    // MESMA forma da escada cumprida (`degraus: []`, `proximo: null`) e estado
    // OPOSTO. É o discriminante — não a forma — que impede a tela de tratar
    // "não me deixam ver" como "não há nada a fazer" (§4a).
    expect(p.situacao).toBe("fatos_nao_visiveis");
  });

  it("admissao nasce concluída — o paciente existe", () => {
    const p = montarProntidao({
      modalidade: "conventional",
      fatos: NADA,
      role: "coordenador",
      patientId: "p1",
    });
    expect(p.degraus[0]?.id).toBe("admissao");
    expect(p.degraus[0]?.estado).toBe("concluido");
  });
});
