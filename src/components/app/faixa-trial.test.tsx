import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FaixaTrial } from "./faixa-trial";
import type { EstadoConta } from "@/lib/billing/estado-conta";

/**
 * Contrato NOVO da faixa: quem decide o que aparece é o **estado da conta**,
 * não mais o relógio de trial sozinho.
 *
 * Antes, a prop era `{diasRestantes, aguardandoPrimeiroPaciente}` — e o
 * componente não tinha como distinguir "assinante pagante" de "trial vencido":
 * os dois chegavam aqui como `diasRestantes < 0`. O resultado era faixa de
 * cobrança na tela de quem já paga. Estes testes travam a nova divisão:
 *
 * - 3 estados **silenciosos** (`isenta`, `ativa`, `pagamento_atrasado`): a faixa
 *   não renderiza nada. `pagamento_atrasado` é silencioso de propósito — a
 *   clínica continua escrevendo durante a carência, então interromper a tela por
 *   causa de uma falha do banco do cliente pune o paciente, não o inadimplente.
 * - 5 estados **falantes**, cada um com uma copy que precisa dizer a coisa certa.
 * - CTA "Ativar assinatura" **só** onde ativar/reativar é de fato a saída
 *   (`trial_expirado`, `cancelada`). Em `pagamento_em_processamento` já existe
 *   cobrança em voo: devolver a pessoa ao checkout gera uma segunda para o mesmo
 *   mês — este é o caso que mais facilmente regride, por isso tem teste próprio.
 */
function textoDaFaixa(): string {
  return screen.getByRole("status").textContent ?? "";
}

function cta() {
  return screen.queryByRole("link", { name: /ativar assinatura/i });
}

describe("FaixaTrial", () => {
  describe("estados silenciosos", () => {
    // Tabela e não três `it` copiados: o conjunto "estados que não comunicam
    // nada" é a regra em si, e um estado novo entrando aqui deve ser uma linha.
    const silenciosos: EstadoConta[] = ["isenta", "ativa", "pagamento_atrasado"];

    it.each(silenciosos)("não renderiza nada em %s", (estado) => {
      const { container } = render(
        <FaixaTrial estado={estado} diasRestantes={5} />,
      );

      // `container.firstChild` em vez de `queryByRole`: o contrato é retornar
      // `null`, não "renderizar algo sem role".
      expect(container.firstChild).toBeNull();
    });

    it("continua silencioso mesmo com dias negativos herdados", () => {
      // Discrimina o código antigo: lá, `diasRestantes < 0` decidia sozinho.
      // Aqui o estado vence o relógio — assinante pagante nunca vê faixa.
      const { container } = render(
        <FaixaTrial estado="ativa" diasRestantes={-30} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("trial_aguardando", () => {
    it("explica quando o relógio começa, sem contagem regressiva", () => {
      render(<FaixaTrial estado="trial_aguardando" diasRestantes={null} />);

      const texto = textoDaFaixa();
      expect(texto).toMatch(/primeiro paciente/i);
      // O que discrimina o fix (#175): o relógio só dispara no 1º paciente, então
      // qualquer "faltam N dias" aqui seria uma contagem falsa.
      expect(texto).not.toMatch(/faltam?\s+\d+\s+dias?/i);
      expect(texto).not.toMatch(/último dia/i);
      expect(texto).not.toMatch(/terminou/i);
    });

    it("ignora dias negativos herdados (nunca anuncia fim antes de começar)", () => {
      render(<FaixaTrial estado="trial_aguardando" diasRestantes={-3} />);

      expect(textoDaFaixa()).toMatch(/primeiro paciente/i);
      expect(textoDaFaixa()).not.toMatch(/terminou/i);
    });
  });

  describe("trial_ativo", () => {
    it("usa plural com N dias restantes", () => {
      render(<FaixaTrial estado="trial_ativo" diasRestantes={5} />);

      expect(textoDaFaixa()).toMatch(/Faltam 5 dias de teste/i);
    });

    it("usa singular com 1 dia restante", () => {
      render(<FaixaTrial estado="trial_ativo" diasRestantes={1} />);

      const texto = textoDaFaixa();
      expect(texto).toMatch(/Falta 1 dia de teste/i);
      // Concordância: "Faltam 1 dia" é o erro clássico de template com plural fixo.
      expect(texto).not.toMatch(/Faltam 1/i);
    });

    it("anuncia o último dia e a consequência de amanhã", () => {
      render(<FaixaTrial estado="trial_ativo" diasRestantes={0} />);

      const texto = textoDaFaixa();
      expect(texto).toMatch(/último dia/i);
      // A copy precisa dizer o que acontece depois — somente-leitura, dados
      // preservados. Sem isso a pessoa acha que vai perder o acesso.
      expect(texto).toMatch(/somente-leitura/i);
      expect(texto).not.toMatch(/terminou/i);
    });

    it("nunca cobra durante o teste (a copy tem que dizer isso)", () => {
      render(<FaixaTrial estado="trial_ativo" diasRestantes={3} />);

      expect(textoDaFaixa()).toMatch(/nada é cobrado agora/i);
    });
  });

  describe("trial_expirado", () => {
    it("anuncia o fim do teste e a somente-leitura", () => {
      render(<FaixaTrial estado="trial_expirado" diasRestantes={-1} />);

      const texto = textoDaFaixa();
      expect(texto).toMatch(/período de teste terminou/i);
      expect(texto).toMatch(/somente-leitura/i);
    });

    it("segue anunciando o fim muito depois do vencimento", () => {
      render(<FaixaTrial estado="trial_expirado" diasRestantes={-45} />);

      expect(textoDaFaixa()).toMatch(/período de teste terminou/i);
    });
  });

  describe("pagamento_em_processamento", () => {
    it("diz que está aguardando o banco, não que a pessoa errou", () => {
      render(
        <FaixaTrial estado="pagamento_em_processamento" diasRestantes={-2} />,
      );

      const texto = textoDaFaixa();
      expect(texto).toMatch(/aguardando a confirmação/i);
      expect(texto).toMatch(/somente-leitura/i);
    });
  });

  describe("cancelada", () => {
    it("garante que os dados continuam acessíveis e exportáveis", () => {
      render(<FaixaTrial estado="cancelada" diasRestantes={null} />);

      const texto = textoDaFaixa();
      expect(texto).toMatch(/cancelada/i);
      // Exportação livre é promessa do produto (e do checklist LGPD): cancelar
      // assinatura nunca sequestra o prontuário.
      expect(texto).toMatch(/export/i);
    });
  });

  describe("CTA 'Ativar assinatura'", () => {
    it.each<EstadoConta>(["trial_expirado", "cancelada"])(
      "aparece em %s, apontando para /assinatura",
      (estado) => {
        render(<FaixaTrial estado={estado} diasRestantes={-1} />);

        const link = cta();
        expect(link).not.toBeNull();
        expect(link?.getAttribute("href")).toBe("/assinatura");
      },
    );

    it.each<EstadoConta>([
      "trial_aguardando",
      "trial_ativo",
      "pagamento_em_processamento",
    ])("NÃO aparece em %s", (estado) => {
      render(<FaixaTrial estado={estado} diasRestantes={1} />);

      expect(cta()).toBeNull();
    });
  });

  it("nunca usa role=alert — cobrança não é risco clínico", () => {
    // `role="alert"` interrompe o leitor de tela e, neste produto, está
    // reservado ao risco clínico. Fim de trial não interrompe ninguém.
    render(<FaixaTrial estado="trial_expirado" diasRestantes={-1} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
