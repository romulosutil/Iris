/**
 * Testes do sanitizador de PII (D11 / #260, T2).
 *
 * A régua deste arquivo é a das DUAS falhas simétricas, não só a primeira:
 *
 *   (a) PII que ATRAVESSA — nome, CPF, e-mail ou telefone entrando no vetor;
 *   (b) conteúdo clínico APAGADO — contagem de tentativas, escore de
 *       instrumento, intervalo de latência, ano, nome de instrumento virando
 *       marcador.
 *
 * Um sanitizador que só é testado contra (a) converge para "apague tudo", e
 * passa. Metade dos casos aqui existe para travar (b).
 */
import { describe, expect, it } from "vitest";
import { contemPiiEstrutural, MARCADORES, sanitizarPII } from "./pii-sanitizer";

// CPFs matematicamente válidos (Módulo 11) — os mesmos de `src/lib/cpf.test.ts`,
// já conferidos à mão lá.
const CPF_VALIDO = "52998224725";
const CPF_VALIDO_MASCARADO = "529.982.247-25";
const CPF_VALIDO_2 = "11144477735";

const IDENTIDADES = {
  nomePaciente: "João Pedro Silva",
  nomesResponsaveis: ["Maria Aparecida Silva"],
  cpfs: [CPF_VALIDO, "111.444.777-35"],
  contatos: ["maria.silva@exemplo.com.br", "3333-4444"],
} as const;

describe("sanitizarPII · nome do paciente", () => {
  it("substitui o nome completo por um único [PACIENTE_ID]", () => {
    const r = sanitizarPII("João Pedro Silva chegou agitado.", IDENTIDADES);
    expect(r.texto).toBe("[PACIENTE_ID] chegou agitado.");
  });

  it("substitui o nome PARCIAL — só o primeiro nome, que é o uso real do diário", () => {
    const r = sanitizarPII(
      "João pediu água e depois voltou para a mesa.",
      IDENTIDADES,
    );
    expect(r.texto).toBe(
      "[PACIENTE_ID] pediu água e depois voltou para a mesa.",
    );
  });

  it("substitui o sobrenome isolado", () => {
    const r = sanitizarPII("A família Silva compareceu.", {
      nomePaciente: "João Pedro Silva",
    });
    expect(r.texto).toBe("A família [PACIENTE_ID] compareceu.");
  });

  it("é insensível a caixa e a espaço múltiplo no nome completo", () => {
    const r = sanitizarPII("joão   pedro  silva sentou.", IDENTIDADES);
    expect(r.texto).toBe("[PACIENTE_ID] sentou.");
  });

  it("NÃO substitui nome que é substring de palavra comum (fronteira de palavra)", () => {
    // "Ana" dentro de "anamnese"/"analisou"/"Ananda" não é a paciente.
    const r = sanitizarPII(
      "Na anamnese a terapeuta analisou o repertório; Ananda observou.",
      { nomePaciente: "Ana Lima" },
    );
    expect(r.texto).toBe(
      "Na anamnese a terapeuta analisou o repertório; Ananda observou.",
    );
    expect(r.limpo).toBe(true);
  });

  it("substitui o mesmo nome quando ele aparece isolado, com acento e pontuação colada", () => {
    const r = sanitizarPII("Ana, sentou. (Ana) pediu ajuda — Ana riu.", {
      nomePaciente: "Ana Lima",
    });
    expect(r.texto).toBe(
      "[PACIENTE_ID], sentou. ([PACIENTE_ID]) pediu ajuda — [PACIENTE_ID] riu.",
    );
    expect(r.ocorrencias).toEqual([
      { categoria: "paciente", marcador: MARCADORES.paciente, ocorrencias: 3 },
    ]);
  });

  it("não substitui partículas de nome isoladas ('de', 'da', 'dos')", () => {
    const r = sanitizarPII(
      "A mãe de Pedro trouxe o caderno da escola dos irmãos.",
      { nomePaciente: "Ana de Souza" },
    );
    // "de" fica; nada mais do nome aparece.
    expect(r.texto).toBe(
      "A mãe de Pedro trouxe o caderno da escola dos irmãos.",
    );
  });

  it("nome que também é palavra comum É redigido — decisão fail-closed, fixada aqui", () => {
    // Trade-off deliberado (ver PARTICULAS_DE_NOME em pii-sanitizer.ts): apagar
    // a flor degrada um pouco a recuperação; deixar o primeiro nome da criança
    // entrar no vetor é falha de LGPD. Se alguém inverter a decisão, este teste
    // é quem cobra a justificativa no diff.
    const r = sanitizarPII("Rosa pegou a rosa do vaso.", {
      nomePaciente: "Rosa Martins",
    });
    expect(r.texto).toBe("[PACIENTE_ID] pegou a [PACIENTE_ID] do vaso.");
  });
});

describe("sanitizarPII · responsável", () => {
  it("usa [RESPONSAVEL_ID], marcador distinto do paciente", () => {
    const r = sanitizarPII("Maria Aparecida Silva relatou a crise.", {
      nomesResponsaveis: ["Maria Aparecida Silva"],
    });
    expect(r.texto).toBe("[RESPONSAVEL_ID] relatou a crise.");
  });

  it("com paciente e responsável de mesmo sobrenome, o paciente vence (ordem fixa)", () => {
    // "Silva" pertence aos dois; a ordem canônica (paciente antes de
    // responsável) é o que torna a saída determinística — não a sorte do laço.
    const r = sanitizarPII("Silva chegou com Maria.", IDENTIDADES);
    expect(r.texto).toBe("[PACIENTE_ID] chegou com [RESPONSAVEL_ID].");
  });

  it("aceita mais de um responsável", () => {
    const r = sanitizarPII("Carla e Roberto assinaram.", {
      nomesResponsaveis: ["Carla Nunes", "Roberto Nunes"],
    });
    expect(r.texto).toBe("[RESPONSAVEL_ID] e [RESPONSAVEL_ID] assinaram.");
  });
});

describe("sanitizarPII · CPF", () => {
  it("redige CPF COM máscara", () => {
    const r = sanitizarPII(`CPF ${CPF_VALIDO_MASCARADO} confirmado.`, {});
    expect(r.texto).toBe("CPF [CPF] confirmado.");
  });

  it("redige CPF SEM máscara (11 dígitos que passam no Módulo 11)", () => {
    const r = sanitizarPII(`Documento ${CPF_VALIDO} no cadastro.`, {});
    expect(r.texto).toBe("Documento [CPF] no cadastro.");
  });

  it("redige CPF mascarado mesmo com dígito verificador INVÁLIDO (máscara é inequívoca)", () => {
    // Fail-closed: CPF digitado errado continua sendo o CPF de alguém.
    const r = sanitizarPII("CPF 123.456.789-00 na ficha.", {});
    expect(r.texto).toBe("CPF [CPF] na ficha.");
  });

  it("redige o CPF CONHECIDO do cadastro em qualquer formatação", () => {
    const r = sanitizarPII("529 982 247 25 e 111.444.777-35.", IDENTIDADES);
    expect(r.texto).toBe("[CPF] e [CPF].");
  });

  it("NÃO redige número clínico de 11 dígitos que não passa no Módulo 11 e não tem forma de telefone", () => {
    // 11 dígitos começando com DDD inválido (00) e sem 9 de celular.
    const r = sanitizarPII("Protocolo 00000000123 registrado.", {});
    expect(r.texto).toBe("Protocolo 00000000123 registrado.");
  });

  it("segunda referência ao mesmo CPF vira o MESMO marcador (determinismo)", () => {
    const r = sanitizarPII(`${CPF_VALIDO} … ${CPF_VALIDO_MASCARADO}`, {});
    expect(r.texto).toBe("[CPF] … [CPF]");
    expect(r.ocorrencias).toEqual([
      { categoria: "cpf", marcador: "[CPF]", ocorrencias: 2 },
    ]);
  });
});

describe("sanitizarPII · contato", () => {
  it("redige e-mail", () => {
    const r = sanitizarPII("Escrever para mae.do.joao@gmail.com hoje.", {});
    expect(r.texto).toBe("Escrever para [EMAIL] hoje.");
  });

  it("redige telefone com DDD, com e sem parênteses e com +55", () => {
    const r = sanitizarPII(
      "Ligar (11) 98765-4321, ou 11987654321, ou +55 21 3222 1111.",
      {},
    );
    expect(r.texto).toBe("Ligar [TELEFONE], ou [TELEFONE], ou [TELEFONE].");
  });

  it("redige contato conhecido do cadastro mesmo sem DDD (fixo de 8 dígitos)", () => {
    // O padrão genérico recusa 8 dígitos de propósito; a allow-list é quem
    // fecha esse caso — e é por isso que `contatos` existe.
    const r = sanitizarPII("Recado no 3333-4444.", IDENTIDADES);
    expect(r.texto).toBe("Recado no [TELEFONE].");
  });

  it("NÃO confunde intervalo/ano com telefone (o falso-positivo que o DDD evita)", () => {
    const r = sanitizarPII(
      "Latência de 1500-2000 ms; período 2024-2025; ficou 8-12 min.",
      {},
    );
    expect(r.texto).toBe(
      "Latência de 1500-2000 ms; período 2024-2025; ficou 8-12 min.",
    );
    expect(r.limpo).toBe(true);
  });
});

describe("sanitizarPII · conteúdo clínico preservado", () => {
  it("texto sem PII sai idêntico e com limpo=true", () => {
    const texto =
      "3 tentativas independentes em 5 oportunidades (60%); escore VABS 112; " +
      "latência média 4 s; protocolo Denver aplicado por 45 min.";
    const r = sanitizarPII(texto, IDENTIDADES);
    expect(r.texto).toBe(texto);
    expect(r.limpo).toBe(true);
    expect(r.ocorrencias).toEqual([]);
  });

  it("preserva o restante da frase ao redigir (não engole a vizinhança)", () => {
    const r = sanitizarPII(
      "João apresentou 4/5 acertos após o CPF 529.982.247-25 ser conferido.",
      IDENTIDADES,
    );
    expect(r.texto).toBe(
      "[PACIENTE_ID] apresentou 4/5 acertos após o CPF [CPF] ser conferido.",
    );
  });
});

describe("sanitizarPII · idempotência e bordas", () => {
  it("sanitizar duas vezes dá exatamente o mesmo texto", () => {
    const original =
      "João Pedro Silva, CPF 529.982.247-25, mãe Maria Aparecida Silva, " +
      "tel (11) 98765-4321, e-mail maria.silva@exemplo.com.br.";
    const uma = sanitizarPII(original, IDENTIDADES);
    const duas = sanitizarPII(uma.texto, IDENTIDADES);
    expect(duas.texto).toBe(uma.texto);
  });

  it("a segunda passada não encontra nada (limpo=true) — os marcadores são preservados", () => {
    const uma = sanitizarPII("João ligou de (11) 98765-4321.", IDENTIDADES);
    const duas = sanitizarPII(uma.texto, IDENTIDADES);
    expect(duas.limpo).toBe(true);
    expect(duas.texto).toContain("[PACIENTE_ID]");
    expect(duas.texto).toContain("[TELEFONE]");
  });

  it("a 2ª passada NÃO reescreve o miolo de um marcador já aplicado", () => {
    // Este é o caso que a fatia por MARCADOR_EXISTENTE existe para cobrir, e é
    // SINTÉTICO de propósito: com o vocabulário de marcadores de hoje
    // (`PACIENTE`, `RESPONSAVEL`, `CPF`, `EMAIL`, `TELEFONE`) nenhum sobrenome
    // brasileiro plausível colide. A garantia, porém, não pode depender do
    // vocabulário — acrescentar um marcador `[ESCOLA]` amanhã tornaria o
    // sobrenome "Escola" um gatilho real. A entrada abaixo é legal e força a
    // colisão hoje: sem a fatia, "PACIENTE" dentro de "[PACIENTE_ID]" casa o
    // token do nome (fronteira `[` … `_`) e a segunda passada produz
    // "[[PACIENTE_ID]_ID]".
    const ids = { nomePaciente: "Paciente Souza" };
    const uma = sanitizarPII("Paciente Souza sentou.", ids);
    expect(uma.texto).toBe("[PACIENTE_ID] sentou.");
    expect(sanitizarPII(uma.texto, ids).texto).toBe(uma.texto);
    expect(sanitizarPII(uma.texto, ids).limpo).toBe(true);
  });

  it("texto vazio e identidades vazias não lançam", () => {
    expect(sanitizarPII("").texto).toBe("");
    expect(sanitizarPII("", {}).limpo).toBe(true);
    expect(sanitizarPII("Sem nada aqui.", {}).texto).toBe("Sem nada aqui.");
  });

  it("identidades nulas/vazias são ignoradas sem quebrar", () => {
    const r = sanitizarPII("Texto qualquer.", {
      nomePaciente: null,
      nomesResponsaveis: [null, "", "   ", undefined],
      cpfs: [null, "123"],
      contatos: [undefined],
    });
    expect(r.texto).toBe("Texto qualquer.");
    expect(r.limpo).toBe(true);
  });
});

describe("contemPiiEstrutural · assert fail-closed do pipeline", () => {
  it("acusa CPF, e-mail e telefone remanescentes", () => {
    expect(contemPiiEstrutural(`resto ${CPF_VALIDO_MASCARADO}`)).toBe(true);
    expect(contemPiiEstrutural(`resto ${CPF_VALIDO_2}`)).toBe(true);
    expect(contemPiiEstrutural("resto a@b.com")).toBe(true);
    expect(contemPiiEstrutural("resto (11) 98765-4321")).toBe(true);
  });

  it("não acusa texto já sanitizado nem número clínico", () => {
    const r = sanitizarPII(
      "João Pedro Silva, CPF 529.982.247-25, tel (11) 98765-4321.",
      IDENTIDADES,
    );
    expect(contemPiiEstrutural(r.texto)).toBe(false);
    expect(contemPiiEstrutural("escore 112, 3/5 acertos, 2024-2025")).toBe(
      false,
    );
  });
});
