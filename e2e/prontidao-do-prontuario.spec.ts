import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * E2E da escada de prontidão do prontuário — §6 da spec da jornada de admissão
 * (`docs/superpowers/specs/2026-09-01-jornada-admissao-paciente-design.md`).
 *
 * UM cenário só, do ponto de vista do operador, porque o que falta cobrir não é
 * a régua (`prontidao.test.ts` já varre a matriz modalidade × fatos × papel,
 * e `bloqueio-documentar.int.test.ts` prova `podeDocumentar` contra o banco) —
 * é a COSTURA entre as três superfícies que a régua alimenta, e que nenhuma
 * delas enxerga sozinha:
 *
 *   1. `CartaoProntidao` no prontuário (`pacientes/[id]/layout.tsx`) — a escada
 *      e o gesto primário (`data-testid="gesto-primario"`);
 *   2. a pill de próximo passo na lista `/pacientes`
 *      (`data-testid="pill-prontidao"`, alimentada por `listarTodosPacientes`);
 *   3. o passo "Documentar" em `/sessoes/[id]` (`passo-em-foco.tsx`), que troca
 *      o formulário pelo MESMO cartão quando `podeDocumentar` é falso.
 *
 * A prova é o movimento: as três precisam mudar juntas, a partir de gestos
 * feitos pela UI, sem nenhuma escrita de teste no banco. Uma régua que
 * respondesse certo e não chegasse a alguma das telas passaria em tudo que já
 * existe e falharia aqui.
 *
 * ## Dois papéis, dois contextos
 *
 * A jornada é de dois operadores por definição — a coordenação prescreve, o
 * terapeuta documenta —, e `montarProntidao` decide a ROTA do gesto pelo papel
 * (`role === def.papelQueResolve`). Trocar de papel na mesma sessão do
 * Playwright exigiria `entrarComMfa` de novo no mesmo `page`, e esse helper
 * ZERA o enrollment de segundo fator da conta antes de recriá-lo: a sessão
 * anterior não sobreviveria à troca. Dois `BrowserContext` (o padrão que
 * `validacao-coordenador.spec.ts` já usa) mantêm as duas pontas vivas ao mesmo
 * tempo — que é o que permite afirmar "o terapeuta estava bloqueado ANTES e
 * passou a documentar DEPOIS", com a mesma sessão, só recarregando.
 *
 * ## Pré-requisitos
 *
 * DB migrado + `pnpm seed:e2e` + app servindo. O seed cria "Paciente Prontidão
 * E2E" (13:00) como o único paciente demo de escada ABERTA: ficha clínica,
 * anamnese e prescrição de ABA prontas, SEM protocolo vigente e SEM meta ativa
 * — exatamente os dois degraus bloqueantes de `protocol_driven`.
 */

const PACIENTE = "Paciente Prontidão E2E";

/** Degraus de `protocol_driven` que bloqueiam o passo Documentar. */
const DEGRAU_PROTOCOLO = "Prescrever um protocolo";
const DEGRAU_META = "Ativar ao menos uma meta";
const DEGRAU_SESSAO = "Documentar a primeira sessão";

test("prontidão: coordenador prescreve protocolo e ativa meta, o cartão e a pill somem, e o terapeuta documenta", async ({
  page,
  browser,
}) => {
  // ── 1. Terapeuta: a sessão de hoje NÃO pode ser documentada ───────────
  // Esta é a ponta que o gate protege, e por isso ela vem primeiro: se o
  // `if (!dados.prontidao.podeDocumentar)` de `passo-em-foco.tsx` deixar de
  // morder, é AQUI que o cenário fica vermelho — o formulário apareceria antes
  // de a coordenação fechar qualquer degrau.
  const terapeuta = page;
  await entrarComMfa(terapeuta, "terapeuta.demo@iris.test", "Senha Demo 123");
  await terapeuta.goto("/agenda");
  // Corte por HORÁRIO, como os demais specs demo: o nome do paciente pode vir
  // mascarado no card da agenda, e cada spec tem a sessão do seu paciente.
  await terapeuta
    .getByRole("button", { name: /^Abrir agendamento de .* às 13:00$/ })
    .locator("visible=true")
    .first()
    .click();
  await expect(terapeuta).toHaveURL(/\/sessoes\/.+/);
  const caminhoSessao = new URL(terapeuta.url()).pathname;

  // Superfície 3, estado bloqueado: o cartão ocupa o lugar do formulário.
  await expect(
    terapeuta.getByRole("heading", {
      name: "Esta sessão ainda não pode ser documentada",
    }),
  ).toBeVisible();
  // O degrau que falta aparece como OBRIGATÓRIO — palavra, não só cor.
  const degrauProtocolo = terapeuta
    .locator("li")
    .filter({ hasText: DEGRAU_PROTOCOLO })
    .first();
  await expect(degrauProtocolo).toHaveAttribute("data-estado", "bloqueante");
  await expect(degrauProtocolo).toContainText("Obrigatório");
  // Terapeuta não é quem resolve: nenhum botão morto para um destino que a
  // `requireRole` do cadastro clínico recusaria.
  await expect(terapeuta.getByTestId("gesto-primario")).toHaveCount(0);
  await expect(
    terapeuta.getByText(`Aguardando Coordenação: ${DEGRAU_PROTOCOLO}.`),
  ).toBeVisible();
  // A prova de que o gate morde de verdade, e não só desenha: o campo do
  // formulário de documentação não existe na página.
  await expect(terapeuta.getByLabel(/Anotação rápida/i)).toHaveCount(0);

  // ── 2. Coordenador: a lista aponta o mesmo degrau ─────────────────────
  const contextoCoordenador = await browser.newContext();
  const coord = await contextoCoordenador.newPage();
  await entrarComMfa(coord, "coordenador.demo@iris.test", "Senha Demo 123");

  // Superfície 2: a pill diz o próximo passo sem abrir o prontuário.
  const linhaNaLista = coord.locator("li").filter({ hasText: PACIENTE });
  await coord.goto("/pacientes");
  await expect(linhaNaLista.getByTestId("pill-prontidao")).toHaveText(
    DEGRAU_PROTOCOLO,
  );

  // ── 3. Coordenador: cartão → prescrever protocolo ─────────────────────
  await linhaNaLista.getByRole("link", { name: /Ver Prontuário/ }).click();
  await expect(coord).toHaveURL(/\/pacientes\/[^/]+$/);
  const idPaciente = new URL(coord.url()).pathname.split("/").pop()!;

  // Superfície 1: o cartão nomeia o gesto seguinte, e o gesto é UM só.
  await expect(
    coord.getByRole("heading", { name: "Para este prontuário gerar dados" }),
  ).toBeVisible();
  // `.first()`: a rota base do paciente é a aba Evolução, e ela monta um
  // SEGUNDO `CartaoProntidao` (`evolucao-vazia.tsx`, título "A evolução ainda
  // não pode ser calculada") com o mesmo gesto. Os dois cartões saem da mesma
  // `montarProntidao`, então afirmar sobre um afirma sobre os dois — e as
  // asserções de AUSÊNCIA abaixo seguem sem `.first()`, de propósito: ali o
  // certo é exigir que NENHUM dos dois ofereça o gesto.
  const gesto = coord.getByTestId("gesto-primario").first();
  await expect(gesto).toHaveText(`${DEGRAU_PROTOCOLO} →`);
  await gesto.click();
  await expect(coord).toHaveURL(
    new RegExp(`/pacientes/${idPaciente}/cadastro-clinico`),
  );

  // Encaixe do VB-MAPP na disciplina ABA prescrita (`protocolos-secao.tsx`).
  // Recorte pelo NOME do protocolo: o catálogo padrão da clínica traz mais de
  // um protocolo de ABA, e todos oferecem o mesmo botão.
  await coord
    .locator("li")
    .filter({ hasText: "VB-MAPP" })
    .getByRole("button", { name: "+ Encaixar protocolo" })
    .click();
  await expect(coord.getByText("Protocolo encaixado")).toBeVisible();
  // Espera o ENCAIXE aparecer na própria página antes de sair dela. O toast
  // nasce do retorno da action; a revalidação de `/cadastro-clinico` chega
  // depois, e navegar entre as duas devolvia o prontuário com a escada AINDA
  // no degrau anterior — flake que aparece como "a régua não atualizou"
  // (mesma armadilha registrada em `cadastro-clinico.spec.ts`, #209).
  await expect(coord.getByText("1 protocolo(s) encaixado(s)")).toBeVisible();

  // ── 4. Coordenador: cartão avança sozinho → ativar meta ───────────────
  // Nada aqui é persistido: a escada é derivada, então o cartão tem de apontar
  // o degrau seguinte só porque o banco mudou.
  await coord.goto(`/pacientes/${idPaciente}`);
  await expect(gesto).toHaveText(`${DEGRAU_META} →`);
  await gesto.click();
  await expect(coord).toHaveURL(new RegExp(`/pacientes/${idPaciente}/metas`));

  await coord
    .getByLabel("Descrição (linguagem simples)")
    .fill("Pedir água sozinho, sem dica");
  await coord.getByRole("button", { name: "Criar meta" }).click();
  await expect(
    coord.getByText("Pedir água sozinho, sem dica").first(),
  ).toBeVisible();

  // ── 5. Fechados os dois bloqueantes, a bola passa ao terapeuta ────────
  // O cartão NÃO some ainda: `primeira_sessao` continua pendente, e some é a
  // palavra certa só quando não há mais nada a fazer. O que muda é de quem é o
  // gesto — e a lista acompanha, na mesma passada.
  await coord.goto(`/pacientes/${idPaciente}`);
  await expect(coord.getByTestId("gesto-primario")).toHaveCount(0);
  await expect(
    coord.getByText(`Aguardando Terapeuta: ${DEGRAU_SESSAO}.`).first(),
  ).toBeVisible();
  await coord.goto("/pacientes");
  await expect(linhaNaLista.getByTestId("pill-prontidao")).toHaveText(
    DEGRAU_SESSAO,
  );

  // ── 6. Terapeuta: a MESMA sessão, só recarregada, já documenta ────────
  await terapeuta.goto(caminhoSessao);
  await expect(
    terapeuta.getByRole("heading", {
      name: "Esta sessão ainda não pode ser documentada",
    }),
  ).toHaveCount(0);

  // UMA frase de propósito: o `DemoStubProvider` gera uma sugestão por frase
  // (>= 8 chars) alternando alta/média/baixa. Com uma só, ela nasce de ALTA
  // confiança — que não entra na fila de `/validacao` (`queries.ts`: só
  // `baixa` ou inconsistente com histórico), e portanto este spec não desloca
  // o badge de 2 itens que `validacao-coordenador.spec.ts` afirma.
  await terapeuta
    .getByLabel(/Anotação rápida/i)
    .fill("Pediu água sozinho durante o lanche.");
  await terapeuta.getByRole("button", { name: /Salvar captura/i }).click();
  await expect(terapeuta.getByText(/Captura salva/i)).toBeVisible();
  await terapeuta
    .getByLabel(/Nota consolidada/i)
    .fill("Pediu água sozinho durante o lanche.");
  await terapeuta.getByRole("button", { name: /Consolidar sessão/i }).click();
  await expect(
    terapeuta.getByRole("heading", { name: "Revisar evidências" }),
  ).toBeVisible();

  // Aprovar exige abrir o cartão (invariante de lastro, §3 da revisão). A
  // aprovação é o que materializa `session_snapshot` — o fato que fecha o
  // degrau `primeira_sessao`.
  const cartao = terapeuta.locator("article").first();
  await cartao.getByRole("button", { name: "Revisar →" }).click();
  await cartao.getByRole("button", { name: "Aprovar" }).click();
  await expect(terapeuta.locator("article")).toHaveCount(0);

  // ── 7. Escada cumprida: cartão some e a pill some ─────────────────────
  // "Nada a fazer" ocupa ZERO pixel — é a regra que `CartaoProntidao` aplica
  // com `if (proximo === null) return null`, e a pill segue a mesma verdade.
  await coord.goto(`/pacientes/${idPaciente}`);
  await expect(
    coord.getByRole("heading", { name: "Para este prontuário gerar dados" }),
  ).toHaveCount(0);
  await coord.goto("/pacientes");
  await expect(linhaNaLista).toBeVisible();
  await expect(linhaNaLista.getByTestId("pill-prontidao")).toHaveCount(0);

  await contextoCoordenador.close();
});
