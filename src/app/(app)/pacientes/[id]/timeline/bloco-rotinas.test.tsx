import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlocoRotinas } from "./bloco-rotinas";
import type { RotinaDaSessao } from "./queries";
import type { Papel } from "@/auth/papel-ativo";

/**
 * Prova da T5 (#558).
 *
 * O que estes testes existem para impedir, em ordem de gravidade:
 *
 * 1. **Falha de leitura renderizada como estado vazio.** `rotinas === null`
 *    tem que dizer que a leitura falhou; se cair no "Nenhuma rotina
 *    registrada", uma queda de rede vira afirmação clínica.
 * 2. **Cadeia sem âncora exibida como se estivesse na evolução** (US-2).
 * 3. **Nível fora da taxonomia convertido em progresso ou em silêncio**
 *    (G-6 (a)) — tem que aparecer como "não classificado", com o nível cru.
 * 4. **Conteúdo clínico servido a papel sem selo clínico** (D-A9) — o buraco
 *    por onde a #512 passou: régua provada isolada, superfície sem prova.
 */
afterEach(cleanup);

const ETAPAS_OK = [
  {
    ordinal: 0,
    descricao: "Abrir a lancheira",
    nivelAjuda: "independente",
    naoClassificado: false,
  },
  {
    ordinal: 1,
    descricao: "Abrir o pote",
    nivelAjuda: "ajuda física parcial",
    naoClassificado: false,
  },
];

const ANCORADA: RotinaDaSessao = {
  extractionId: "ext_1",
  nome: "Lanche",
  sessionNumero: 7,
  dataSessao: new Date("2026-09-01T13:00:00Z"),
  ancorada: true,
  metaDescricao: "Alimentar-se com autonomia",
  etapas: ETAPAS_OK,
};

const SEM_ANCORA: RotinaDaSessao = {
  extractionId: "ext_2",
  nome: "Lavar as mãos",
  sessionNumero: 6,
  dataSessao: new Date("2026-08-28T13:00:00Z"),
  ancorada: false,
  metaDescricao: null,
  etapas: ETAPAS_OK,
};

const COM_NIVEL_DESCONHECIDO: RotinaDaSessao = {
  ...ANCORADA,
  extractionId: "ext_3",
  etapas: [
    {
      ordinal: 0,
      descricao: "Enxaguar",
      nivelAjuda: "quase sozinho",
      naoClassificado: true,
    },
  ],
};

function montar(
  rotinas: RotinaDaSessao[] | null,
  papel: Papel = "coordenador",
) {
  const onTentarDeNovo = vi.fn();
  const r = render(
    <BlocoRotinas
      rotinas={rotinas}
      papel={papel}
      onTentarDeNovo={onTentarDeNovo}
    />,
  );
  return { ...r, onTentarDeNovo };
}

describe("BlocoRotinas", () => {
  it("mostra a rotina etapa a etapa, na ordem do array", () => {
    montar([ANCORADA]);
    const itens = screen.getAllByRole("listitem");
    const texto = itens.map((li) => li.textContent ?? "").join("|");
    expect(texto).toContain("Abrir a lancheira");
    expect(texto).toContain("Abrir o pote");
    // Ordem: a etapa 1 aparece ANTES da 2 (G-2 (a) — o índice É a ordem).
    expect(texto.indexOf("Abrir a lancheira")).toBeLessThan(
      texto.indexOf("Abrir o pote"),
    );
  });

  it("cadeia ancorada: diz que está na evolução e nomeia a meta", () => {
    montar([ANCORADA]);
    expect(screen.getByText(/na evolução/i)).not.toBeNull();
    expect(
      screen.getByText(/Ancorada em Alimentar-se com autonomia/i),
    ).not.toBeNull();
  });

  // US-2: o coordenador nunca deve supor que aprovou dado que o gráfico ignora.
  it("cadeia sem âncora: diz em texto que fica fora da evolução", () => {
    montar([SEM_ANCORA]);
    expect(screen.getByText(/fora da evolução/i)).not.toBeNull();
    expect(
      screen.getByText(/trilha de auditoria e não entra no gráfico/i),
    ).not.toBeNull();
    expect(screen.queryByText(/^na evolução$/i)).toBeNull();
  });

  // G-6 (a): -1 nunca vira 0. E "não classificado" tem que ser LEGÍVEL, não só
  // contado — registrar sem exibir devolve o silêncio por outra porta.
  it("nível fora da taxonomia aparece como não classificado, com o nível cru", () => {
    montar([COM_NIVEL_DESCONHECIDO]);
    const chip = screen.getByText(/não classificado/i);
    expect(chip.textContent).toContain("quase sozinho");
  });

  it("nível ausente não é anunciado como não classificado", () => {
    montar([
      {
        ...ANCORADA,
        extractionId: "ext_4",
        etapas: [
          {
            ordinal: 0,
            descricao: "Secar as mãos",
            nivelAjuda: null,
            naoClassificado: false,
          },
        ],
      },
    ]);
    expect(screen.queryByText(/não classificado/i)).toBeNull();
  });

  // R4.3 — ausência de dado e ausência de resposta nunca compartilham
  // componente.
  it("falha de leitura renderiza estado de erro, nunca o vazio", () => {
    montar(null);
    expect(screen.queryByText(/nenhuma rotina registrada/i)).toBeNull();
    expect(
      screen.getByText(/não foi possível carregar as rotinas/i),
    ).not.toBeNull();
  });

  it("estado vazio só aparece quando a leitura respondeu vazio", () => {
    montar([]);
    expect(screen.getByText(/nenhuma rotina registrada/i)).not.toBeNull();
    expect(screen.queryByText(/não foi possível carregar/i)).toBeNull();
  });

  describe("por papel (R5.4)", () => {
    it.each(["coordenador", "terapeuta"] as const)(
      "%s vê a rotina",
      (papel) => {
        montar([ANCORADA], papel);
        expect(screen.getByText("Rotinas")).not.toBeNull();
        expect(screen.getByText("Abrir a lancheira")).not.toBeNull();
      },
    );

    // D-A9: a recepção não recebe selo clínico. `requireRole` da rota já
    // recusa antes daqui — esta é a mesma régua dita no componente, para que
    // o bloco não passe a vazar conteúdo clínico se for montado em outra rota.
    it("admin_recepcao não vê nada — nem o título, nem as etapas", () => {
      const { container } = montar([ANCORADA], "admin_recepcao");
      expect(container.firstChild).toBeNull();
    });

    // Terapeuta FORA da equipe não é um papel: é pertencimento, e quem o
    // barra é a RLS — o paciente sequer é legível e a rota devolve 404 antes
    // deste bloco. O que ele NÃO pode virar é um `[]` lido como "não há
    // rotina": por isso a ausência de leitura viaja como `null` (memo R-1).
    it("leitura não realizada não pode ser lida como ausência de rotina", () => {
      montar(null, "terapeuta");
      expect(screen.queryByText(/nenhuma rotina registrada/i)).toBeNull();
    });
  });
});
