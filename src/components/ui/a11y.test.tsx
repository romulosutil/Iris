import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Button } from "./button";
import { Card } from "./card";
import { Pill } from "./primitives/pill";
import { ConfidenceCard } from "./patterns/confidence-card";
import { CompareRow } from "./patterns/compare-row";
import { BatchBar } from "./patterns/batch-bar";
import { CalendarGrid } from "./calendar/calendar-grid";
import {
  ProtocolProgressBarChart,
  ProtocolTrendChart,
} from "./protocol-dashboard-charts";
import { EmptyState } from "./empty-state";
import { MicroConquistaBadge } from "./micro-conquista-badge";
import { CareTeamIllustration } from "./illustrations";
import { Banner } from "./banner";
import { InteractiveCard } from "./interactive-card";
import { Indicator } from "./indicator";
import { Alert } from "./alert";
import { Header } from "./header";
import { Rail } from "./rail";
import { Logo } from "./logo";
import { Input } from "./input";
import { Field } from "./field";
import { Form } from "./form";
import { StatusBadge, StatusDot } from "./patterns/status-badge";
import { Chip, ChipGroup } from "./chip";
import { Stack, Cluster, Split } from "./layout";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./accordion";
import { Checkbox } from "./checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Slider } from "./slider";
import { Progress } from "./progress";
import { Avatar, AvatarFallback, AvatarGroup } from "./avatar";
import { Stat } from "./stat";
import { CopyButton } from "./patterns/copy-button";
import { MarcoStatus } from "./patterns/marco-status";
import { BarraProgressoEpistemica } from "./patterns/barra-progresso-epistemica";

afterEach(cleanup);

/**
 * Gate a11y do design system: cada componente passa pelo axe sem violações
 * WCAG 2.x A/AA. Regras de página (landmark/region/heading únicos) ficam
 * desligadas porque testamos componentes isolados, não páginas.
 * Contraste é verificado à parte (paleta AAA, ver design-system doc §3) — o
 * jsdom não renderiza cores, então axe não computa contraste aqui.
 */
async function semViolacoes(ui: ReactElement) {
  const { container } = render(ui);
  const resultado = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      // jsdom não renderiza cores; contraste é validado à parte (paleta AAA).
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
}

test("Button — sem violações axe", async () => {
  await semViolacoes(<Button>Aprovar sessão</Button>);
});

test("Button desabilitado — sem violações axe", async () => {
  await semViolacoes(<Button disabled>Aprovar sessão</Button>);
});

test("Card conquistado — sem violações axe", async () => {
  await semViolacoes(
    <Card estado="conquistado" titulo="Imita gesto simples">
      Fato consolidado.
    </Card>,
  );
});

test("Card candidato — sem violações axe", async () => {
  await semViolacoes(
    <Card estado="candidato" titulo="Imita gesto simples">
      Sugerido pela IA.
    </Card>,
  );
});

test("Alert erro — sem violações axe", async () => {
  await semViolacoes(
    <Alert severidade="erro" titulo="O áudio não foi enviado">
      Toque para tentar de novo.
    </Alert>,
  );
});

test("Alert info — sem violações axe", async () => {
  await semViolacoes(
    <Alert severidade="info" titulo="Primeira revisão">
      Aprove cada sugestão.
    </Alert>,
  );
});

test("Logo — sem violações axe", async () => {
  await semViolacoes(<Logo variante="completo" />);
});

test("Input — sem violações axe", async () => {
  await semViolacoes(
    <Input aria-label="E-mail" placeholder="nome@clinica.com.br" />,
  );
});

test("Input desabilitado — sem violações axe", async () => {
  await semViolacoes(<Input aria-label="E-mail" disabled />);
});

test("Input — aplica className no container raiz", () => {
  const { container } = render(<Input className="mt-4 w-1/2" leftAddon="R$" />);
  const root = container.firstElementChild;
  expect(root?.classList.contains("mt-4")).toBe(true);
  expect(root?.classList.contains("w-1/2")).toBe(true);
});

test("Button — desabilitado nativamente no estado isLoading", () => {
  const { getByRole } = render(<Button isLoading>Salvar</Button>);
  const button = getByRole("button");
  expect(button.hasAttribute("disabled")).toBe(true);
});

test("Field sem erro — sem violações axe", async () => {
  await semViolacoes(
    <Field label="E-mail" htmlFor="email">
      <Input id="email" type="email" />
    </Field>,
  );
});

test("Field com erro — sem violações axe", async () => {
  await semViolacoes(
    <Field
      label="E-mail"
      htmlFor="email-erro"
      error="Informe um e-mail válido."
    >
      <Input
        id="email-erro"
        type="email"
        aria-invalid
        aria-describedby="email-erro-error"
      />
    </Field>,
  );
});

// Fix round 2 (finding N1 do review): antes destes testes, ligar
// `aria-describedby` era responsabilidade de cada call-site — e a maioria
// dos ~90 usos de `<Field>` no app não ligava, então o erro existia no DOM e
// o leitor de tela não o anunciava ao focar o campo. O `<Field>` passou a
// ligar sozinho; estes testes são a rede que impede a regressão silenciosa.
test("Field — liga aria-describedby do erro no input sem o consumidor pedir", () => {
  const { getByLabelText } = render(
    <Field label="E-mail" htmlFor="auto-erro" error="Informe um e-mail válido.">
      <Input id="auto-erro" type="email" aria-invalid />
    </Field>,
  );
  expect(getByLabelText("E-mail").getAttribute("aria-describedby")).toBe(
    "auto-erro-error",
  );
});

test("Field — liga hint e erro juntos, nessa ordem", () => {
  const { getByLabelText } = render(
    <Field
      label="Senha"
      htmlFor="auto-ambos"
      hint="Mínimo 12 caracteres."
      error="Senha muito curta."
    >
      <Input id="auto-ambos" type="password" />
    </Field>,
  );
  expect(getByLabelText("Senha").getAttribute("aria-describedby")).toBe(
    "auto-ambos-hint auto-ambos-error",
  );
});

test("Field — sem hint nem erro, não inventa aria-describedby", () => {
  const { getByLabelText } = render(
    <Field label="E-mail" htmlFor="auto-vazio">
      <Input id="auto-vazio" type="email" />
    </Field>,
  );
  expect(getByLabelText("E-mail").hasAttribute("aria-describedby")).toBe(false);
});

test("Field — não duplica id quando o consumidor já ligou o mesmo aria-describedby na mão", () => {
  const { getByLabelText } = render(
    <Field label="Senha" htmlFor="auto-manual" hint="Mínimo 12 caracteres.">
      <Input
        id="auto-manual"
        type="password"
        aria-describedby="auto-manual-hint"
      />
    </Field>,
  );
  expect(getByLabelText("Senha").getAttribute("aria-describedby")).toBe(
    "auto-manual-hint",
  );
});

test("Field — preserva aria-describedby externo do consumidor e soma o do campo", () => {
  const { getByLabelText } = render(
    <>
      <p id="nota-externa">Nota fora do campo.</p>
      <Field label="Senha" htmlFor="auto-extra" error="Senha muito curta.">
        <Input
          id="auto-extra"
          type="password"
          aria-describedby="nota-externa"
        />
      </Field>
    </>,
  );
  expect(getByLabelText("Senha").getAttribute("aria-describedby")).toBe(
    "nota-externa auto-extra-error",
  );
});

test("Form — sem violações axe", async () => {
  await semViolacoes(
    <Form onSubmit={(event) => event.preventDefault()}>
      <Field label="E-mail" htmlFor="email-form">
        <Input id="email-form" type="email" />
      </Field>
    </Form>,
  );
});

test("Form com erro — sem violações axe", async () => {
  await semViolacoes(
    <Form error="Sessão expirada, entre novamente.">
      <Field label="E-mail" htmlFor="email-form-erro">
        <Input id="email-form-erro" type="email" />
      </Field>
    </Form>,
  );
});

test.each([
  "sugerida",
  "aprovada",
  "editada",
  "descartada",
  "pendente",
  "reclassificada",
  "devolvida",
] as const)("StatusBadge %s — sem violações axe", async (estado) => {
  await semViolacoes(<StatusBadge estado={estado} />);
});

test("StatusDot — sem violações axe", async () => {
  await semViolacoes(<StatusDot estado="sugerida" />);
});

test("Chip estático — sem violações axe", async () => {
  await semViolacoes(<Chip>ABA</Chip>);
});

test("Chip selecionável — sem violações axe", async () => {
  await semViolacoes(
    <Chip selecionado onSelecionar={() => {}}>
      ABA
    </Chip>,
  );
});

test("Chip removível — sem violações axe", async () => {
  await semViolacoes(
    <Chip onRemover={() => {}} rotuloRemover="Remover ABA">
      ABA
    </Chip>,
  );
});

test("ChipGroup — sem violações axe", async () => {
  await semViolacoes(
    <ChipGroup rotulo="Filtrar por protocolo">
      <Chip selecionado onSelecionar={() => {}}>
        ABA
      </Chip>
      <Chip onSelecionar={() => {}}>Fono</Chip>
    </ChipGroup>,
  );
});

test("Layout (Stack/Cluster/Split composto) — sem violações axe", async () => {
  await semViolacoes(
    <Stack>
      <Split como="section">
        <h3>Sessão</h3>
        <StatusBadge estado="aprovada" />
      </Split>
      <Cluster>
        <Chip>ABA</Chip>
        <Chip>Fono</Chip>
      </Cluster>
    </Stack>,
  );
});

test("Accordion — sem violações axe", async () => {
  await semViolacoes(
    <Accordion type="single" collapsible defaultValue="a">
      <AccordionItem value="a">
        <AccordionTrigger>Dados administrativos</AccordionTrigger>
        <AccordionContent>Nome e responsável.</AccordionContent>
      </AccordionItem>
    </Accordion>,
  );
});

test("Checkbox — sem violações axe", async () => {
  await semViolacoes(<Checkbox label="Consentimento coletado" />);
});

test("Checkbox marcado — sem violações axe", async () => {
  await semViolacoes(<Checkbox label="Reavaliar" defaultChecked />);
});

test("Select (trigger) — sem violações axe", async () => {
  await semViolacoes(
    <Field label="Família do protocolo" htmlFor="protocolo">
      <Select>
        <SelectTrigger id="protocolo">
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="aba">ABA</SelectItem>
        </SelectContent>
      </Select>
    </Field>,
  );
});

test("Tabs — sem violações axe", async () => {
  await semViolacoes(
    <Tabs defaultValue="fila">
      <TabsList>
        <TabsTrigger value="fila">Fila</TabsTrigger>
        <TabsTrigger value="perfil">Perfil</TabsTrigger>
      </TabsList>
      <TabsContent value="fila">12 evidências.</TabsContent>
      <TabsContent value="perfil">Dados.</TabsContent>
    </Tabs>,
  );
});

test("Header — sem violações axe", async () => {
  await semViolacoes(
    <Header
      clinicaAtivaNome="Clínica Iris"
      itemsNav={[
        { href: "#agenda", label: "Agenda", active: true },
        { href: "#pendencias", label: "Pendências", badge: 3 },
      ]}
    />,
  );
});

test("Rail expandido — sem violações axe", async () => {
  await semViolacoes(
    <Rail
      itemsNav={[
        { href: "#validacao", label: "Central de Validação", badge: 3 },
        { href: "#agenda", label: "Agenda", active: true },
      ]}
      signOutSlot={<button type="button">Sair</button>}
    />,
  );
});

test("Rail colapsado — sem violações axe (R-26: badge e alvo de toque seguem íntegros)", async () => {
  localStorage.setItem("iris_rail_colapsado", "1");
  await semViolacoes(
    <Rail
      itemsNav={[
        { href: "#validacao", label: "Central de Validação", badge: 3 },
        { href: "#agenda", label: "Agenda", active: true },
      ]}
      signOutSlot={<button type="button">Sair</button>}
    />,
  );
  localStorage.clear();
});

test("Dialog aberto — sem violações axe", async () => {
  // Conteúdo do Dialog é portaled para document.body; roda o axe nele.
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Reclassificar esta evidência?</DialogTitle>
        <DialogDescription>Cria uma nova versão.</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  const resultado = await axe.run(document.body, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    rules: {
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      "color-contrast": { enabled: false },
    },
  });
  expect(resultado.violations).toEqual([]);
});

test("Slider — sem violações axe", async () => {
  await semViolacoes(
    <Slider defaultValue={[40]} max={100} step={1} aria-label="Confiança" />,
  );
});

test("Progress — sem violações axe", async () => {
  await semViolacoes(<Progress value={60} aria-label="Progresso do dossiê" />);
});

test("Avatar (fallback) — sem violações axe", async () => {
  await semViolacoes(
    <Avatar>
      <AvatarFallback>RS</AvatarFallback>
    </Avatar>,
  );
});

test("AvatarGroup — sem violações axe", async () => {
  await semViolacoes(
    <AvatarGroup rotulo="Equipe de cuidado">
      <Avatar>
        <AvatarFallback>RS</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MC</AvatarFallback>
      </Avatar>
    </AvatarGroup>,
  );
});

test("Stat — sem violações axe", async () => {
  await semViolacoes(
    <Stat rotulo="Aguardando revisão" valor="12" descricao="Fila do dia" />,
  );
});

test("Banner — sem violações axe", async () => {
  await semViolacoes(
    <Banner variant="info" titulo="Aviso importante">
      Mensagem de aviso institucional.
    </Banner>,
  );
});

test("Banner compacto dispensável — sem violações axe", async () => {
  await semViolacoes(
    <Banner
      variant="info"
      formato="compacto"
      dismissible
      titulo="Período de Teste"
      acao={<a href="#pacientes-novo">Cadastrar paciente</a>}
    >
      Seus 7 dias de teste começam quando você cadastrar o primeiro paciente.
    </Banner>,
  );
});

test("InteractiveCard — sem violações axe", async () => {
  await semViolacoes(
    <InteractiveCard titulo="Card Interativo" href="https://example.com">
      Conteúdo do card clicável.
    </InteractiveCard>,
  );
});

test("Indicator — sem violações axe", async () => {
  await semViolacoes(<Indicator variant="conquistado" />);
});

test("CopyButton — sem violações axe", async () => {
  await semViolacoes(
    <CopyButton valor="00020126…6304ABCD" rotulo="Copiar código Pix" />,
  );
});

test("Pill solid — sem violações axe", async () => {
  await semViolacoes(
    <Pill variant="solid" colorScheme="menta">
      Conquistado
    </Pill>,
  );
});

test("Pill inset — sem violações axe", async () => {
  await semViolacoes(
    <Pill variant="inset" colorScheme="violeta">
      Sugerido
    </Pill>,
  );
});

test("Pill outline — sem violações axe", async () => {
  await semViolacoes(
    <Pill variant="outline" colorScheme="ouro">
      Pendente
    </Pill>,
  );
});

test("ConfidenceCard — sem violações axe", async () => {
  await semViolacoes(
    <ConfidenceCard
      titulo="Imita bater palmas"
      protocolo="VB-MAPP"
      trecho="Paciente imitou palmas 4 vezes."
      justificativa="Critério atendido."
      friccao="baixa"
      confianca={95}
      onAprovar={() => {}}
      onEditar={() => {}}
      onDescartar={() => {}}
    />,
  );
});

test("CompareRow — sem violações axe", async () => {
  await semViolacoes(
    <CompareRow
      rotulo="Nível de Ajuda"
      dadoAnterior="Gesto"
      dadoSugerido="Gesto"
      divergente={false}
    />,
  );
});

test("BatchBar — sem violações axe", async () => {
  await semViolacoes(
    <BatchBar
      selecionados={3}
      totalElegiveis={5}
      onAprovarLote={() => {}}
      onLimparSelecao={() => {}}
    />,
  );
});

test("CalendarGrid (escala Dia) — sem violações axe", async () => {
  await semViolacoes(
    <CalendarGrid
      modo="daily-resources"
      recursos={[{ id: "t1", nome: "Dra. Beatriz", subtitulo: "Fono" }]}
      sessoes={[
        {
          id: "s1",
          patientId: "p1",
          pacienteNome: "Arthur",
          terapeutaId: "t1",
          terapeutaNome: "Dra. Beatriz",
          disciplina: "Fono",
          agendadaPara: new Date(2026, 7, 12, 8, 0),
          estado: "realizada",
        },
      ]}
      abertura="08:00"
      fechamento="10:00"
      passoMin={60}
      fuso="America/Sao_Paulo"
    />,
  );
});

test("ProtocolProgressBarChart — sem violações axe", async () => {
  await semViolacoes(
    <ProtocolProgressBarChart
      data={{
        protocoloNome: "VB-MAPP",
        totalMetas: 30,
        metasDominadas: 15,
        metasSugeridasIA: 5,
        tendenciaSemanal: 2,
      }}
    />,
  );
});

test("ProtocolTrendChart — sem violações axe", async () => {
  await semViolacoes(
    <ProtocolTrendChart
      titulo="Trajetória"
      pontos={[
        { sessaoNumero: 1, evidenciasAcumuladas: 5 },
        { sessaoNumero: 2, evidenciasAcumuladas: 12, conquistasNoDia: 2 },
      ]}
    />,
  );
});

test("EmptyState — sem violações axe", async () => {
  await semViolacoes(
    <EmptyState
      illustration={<CareTeamIllustration size={80} />}
      title="Sua equipe de cuidado está pronta"
      description="Prescreva a carga horária para iniciar."
      action={<Button variante="primaria">Prescrever</Button>}
    />,
  );
});

test("MicroConquistaBadge — sem violações axe", async () => {
  await semViolacoes(
    <MicroConquistaBadge icon="sparkle">
      Marco VB-MAPP Conquistado!
    </MicroConquistaBadge>,
  );
});

test("MarcoStatus — 3 estados (glifo nomeado) sem violações axe", async () => {
  await semViolacoes(
    <ul>
      <li>
        <MarcoStatus
          estado="conquistado"
          nome="Pede item preferido"
          nivel="1"
        />
      </li>
      <li>
        <MarcoStatus
          estado="candidato"
          nome="Pede com duas palavras"
          nivel="2"
        />
      </li>
      <li>
        <MarcoStatus estado="nao_atingido" nome="Pede informação" />
      </li>
      <li>
        <MarcoStatus estado="candidato" nome="Imita gesto" rotuloVisivel />
      </li>
    </ul>,
  );
});

test("BarraProgressoEpistemica — sem violações axe", async () => {
  await semViolacoes(
    <BarraProgressoEpistemica
      rotulo="Domínio mando"
      total={6}
      conquistados={3}
      candidatos={1}
    />,
  );
});
