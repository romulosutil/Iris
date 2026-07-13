import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Button } from "./button";
import { Card } from "./card";
import { Banner } from "./banner";
import { InteractiveCard } from "./interactive-card";
import { Indicator } from "./indicator";
import { Alert } from "./alert";
import { Logo } from "./logo";
import { Input } from "./input";
import { Field } from "./field";
import { Form } from "./form";
import { StatusBadge, StatusDot } from "./status-badge";
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
] as const)(
  "StatusBadge %s — sem violações axe",
  async (estado) => {
    await semViolacoes(<StatusBadge estado={estado} />);
  },
);

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
