/**
 * Anonimização determinística de PII antes do embedding (D11 / #260, T2).
 *
 * ## Por que este módulo existe
 *
 * O guardrail 3 da #260 é explícito: "antes de gerar embeddings, o pipeline
 * deve sanitizar nomes de pacientes, CPFs, nomes de responsáveis e dados de
 * contato, substituindo-os por marcadores de entidade auditáveis". O vetor
 * gerado a partir do texto é derivado dele — um nome que entra no chunk entra
 * no espaço vetorial e volta na recuperação. Sanitizar DEPOIS do embedding não
 * desfaz nada.
 *
 * ## A regra de projeto: allow-list de identidades, não NER adivinhando
 *
 * O maior risco de um sanitizador não é deixar PII passar: é **apagar conteúdo
 * clínico legítimo**. Um regex que remove toda palavra capitalizada mata
 * "Denver", "Vineland", "ABA"; um regex que remove toda sequência de dígitos
 * mata "3 tentativas independentes", "PEI de 45 min", "score 112".
 *
 * Por isso a substituição de PESSOAS é dirigida por uma allow-list: só saem do
 * texto as strings que o chamador AFIRMA serem a identidade daquele paciente
 * (linha de `patient` + responsáveis), lidas do banco. Não há inferência.
 *
 * O que é reconhecido por PADRÃO — e não por allow-list — é apenas o que tem
 * forma estruturalmente inequívoca e nenhum uso clínico: CPF, e-mail e telefone
 * brasileiro com DDD. Cada um desses padrões está deliberadamente APERTADO (ver
 * os comentários de cada constante) para não canibalizar números clínicos.
 *
 * ## Determinismo e idempotência
 *
 * Determinismo: mesma entrada (texto + identidades) ⇒ mesma saída, byte a byte.
 * Não há aleatoriedade, não há relógio, não há chamada externa.
 *
 * Idempotência: `sanitizarPII(sanitizarPII(t).texto)` == `sanitizarPII(t).texto`.
 * Garantida estruturalmente, não por sorte: o texto é fatiado nos marcadores já
 * presentes (`MARCADOR_EXISTENTE`) e só os pedaços FORA deles são reescritos.
 * Sem isso, um responsável chamado "Ida" reescreveria o próprio
 * `[PACIENTE_ID]` na segunda passada.
 *
 * ## O que este módulo NÃO faz (e por que)
 *
 * - **Não reidentifica.** O marcador é o mesmo para todas as ocorrências da
 *   mesma categoria; não existe tabela reversa. O elo auditável com a pessoa é
 *   a linha do banco (`patient_id` / `session_note_id` gravados junto ao
 *   embedding), não o texto.
 * - **Não cobre terceiros não declarados.** Nome de um colega de grupo, de um
 *   professor ou de um irmão que não esteja em `IdentidadesDoPaciente` passa.
 *   É limitação conhecida da abordagem allow-list; fechá-la exigiria NER, que
 *   é probabilístico e traria de volta o falso-positivo que a allow-list
 *   existe para evitar. O caminho correto é ALIMENTAR a allow-list.
 * - **Não é fronteira de autorização.** Quem decide se o texto pode ser
 *   indexado é o gate de consentimento (`uso_ia_processamento`) + a RLS. Este
 *   módulo é higiene do conteúdo, não controle de acesso.
 */

/** Categorias de PII reconhecidas. Uma categoria ⇒ um marcador. */
export type CategoriaPII =
  "paciente" | "responsavel" | "cpf" | "email" | "telefone";

/**
 * Marcadores de entidade. Os dois primeiros são LITERAIS da #260 (guardrail 3)
 * — não renomear sem mudar a issue: eles aparecem no texto embeddado e num
 * acervo já indexado a renomeação seria uma migração de dados, não um refactor.
 */
export const MARCADORES: Readonly<Record<CategoriaPII, string>> = {
  paciente: "[PACIENTE_ID]",
  responsavel: "[RESPONSAVEL_ID]",
  cpf: "[CPF]",
  email: "[EMAIL]",
  telefone: "[TELEFONE]",
};

/** Identidades conhecidas do paciente, lidas do banco pelo chamador. */
export type IdentidadesDoPaciente = {
  /** Nome completo do paciente (coluna `patient.nome`). */
  nomePaciente?: string | null;
  /**
   * Nomes de responsáveis/signatários (`consent.responsavel_signatario`, e
   * quaisquer nomes extraídos do cadastro). Aceita repetição e vazios.
   */
  nomesResponsaveis?: readonly (string | null | undefined)[];
  /** CPFs conhecidos (`patient.cpf`, `patient.responsavel_cpf`), com ou sem máscara. */
  cpfs?: readonly (string | null | undefined)[];
  /**
   * Contatos livres do cadastro (`patient.responsavel_contato`). Entram como
   * literais: é assim que um telefone fixo de 8 dígitos, que o padrão genérico
   * recusa de propósito, ainda sai do texto.
   */
  contatos?: readonly (string | null | undefined)[];
};

/** Uma categoria substituída e quantas vezes. Material de auditoria. */
export type OcorrenciaPII = {
  categoria: CategoriaPII;
  marcador: string;
  ocorrencias: number;
};

export type ResultadoSanitizacao = {
  /** Texto com os marcadores no lugar da PII. */
  texto: string;
  /** Ocorrências por categoria, em ordem canônica (a de `ORDEM_CATEGORIAS`). */
  ocorrencias: readonly OcorrenciaPII[];
  /** `true` quando nada foi substituído — o texto já estava limpo. */
  limpo: boolean;
};

/**
 * Ordem de aplicação. NÃO é cosmética: um CPF de 11 dígitos e um celular de 11
 * dígitos são a mesma sequência de caracteres, e quem roda primeiro decide o
 * rótulo. Fixar a ordem é o que torna a saída determinística.
 *
 * Pessoas antes de padrões porque a allow-list é a informação mais confiável
 * que temos; padrões genéricos só varrem o que sobrou.
 */
const ORDEM_CATEGORIAS: readonly CategoriaPII[] = [
  "paciente",
  "responsavel",
  "cpf",
  "email",
  "telefone",
];

/**
 * Marcador já presente no texto. Usado para FATIAR antes de sanitizar — ver a
 * nota de idempotência no topo. `[A-Z_]{2,}` cobre os cinco marcadores e não
 * casa com colchetes de conteúdo clínico ("[sic]", "[ver anexo]") por exigir
 * caixa alta.
 */
const MARCADOR_EXISTENTE = /\[[A-Z_]{2,}\]/g;

/**
 * Fronteira de palavra ciente de acento. `\b` do JS é ASCII: em `\bJosé\b` a
 * âncora final exige que "é" seja `\w`, o que ele NÃO é — a regex nunca casa.
 * Lookarounds sobre `\p{L}\p{N}` (com flag `u`) é a forma que funciona para
 * português.
 */
const ANTES = "(?<![\\p{L}\\p{N}])";
const DEPOIS = "(?![\\p{L}\\p{N}])";

/**
 * Partículas de nome que NUNCA viram marcador sozinhas. Substituir "de"/"dos"
 * isolados encheria a nota de marcadores e destruiria a leitura sem remover
 * identidade nenhuma — "de" não identifica ninguém.
 *
 * Note que a lista é de PARTÍCULAS, não de "nomes que também são palavras
 * comuns". A decisão para "Rosa", "Sol", "Vitória" é FAIL-CLOSED: são
 * substituídos. Apagar a flor de uma nota degrada um pouco a recuperação;
 * deixar o primeiro nome da criança entrar no vetor é falha de LGPD. O teste
 * `nome que também é palavra comum` fixa essa escolha para que ela só mude por
 * decisão humana no diff.
 */
const PARTICULAS_DE_NOME = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "del",
  "van",
  "von",
  "y",
]);

/** Comprimento mínimo de um token de nome para virar marcador sozinho. */
const MIN_TOKEN_NOME = 3;

/**
 * CPF MASCARADO — `999.999.999-99`, com pontuação total ou parcial. A máscara é
 * inequívoca: nenhuma medida clínica se escreve assim. Não valida dígito
 * verificador de propósito — um CPF digitado errado continua sendo o CPF de
 * alguém, e recusar redigi-lo seria fail-open.
 */
const CPF_MASCARADO = new RegExp(
  `${ANTES}\\d{3}[.\\s]\\d{3}[.\\s]\\d{3}[-\\s]?\\d{2}${DEPOIS}`,
  "gu",
);

/**
 * CPF CRU — exatamente 11 dígitos isolados. Aqui o dígito verificador É
 * exigido (`ehCpfValido`): sem a máscara, 11 dígitos também podem ser um
 * celular com DDD ou um número de protocolo, e redigir tudo cegamente
 * devolveria `[CPF]` no lugar de dados clínicos. A ordem resolve o resto —
 * o que não passa no Módulo 11 cai no padrão de telefone logo abaixo.
 */
const DIGITOS_11 = new RegExp(`${ANTES}\\d{11}${DEPOIS}`, "gu");

/**
 * E-mail. Deliberadamente simples: `algo@algo.tld`. Não tenta cobrir a RFC —
 * o objetivo é remover contato, não validar caixa postal.
 */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;

/**
 * Telefone brasileiro COM DDD, 10 ou 11 dígitos. O DDD é obrigatório de
 * propósito: sem ele o padrão `\d{4}[-\s]\d{4}` casaria com "2024-2025",
 * "8-12 anos", "1500-2000 ms" — exatamente o falso-positivo que este módulo
 * existe para não cometer. Fixo de 8 dígitos sem DDD só sai do texto se vier
 * na allow-list `contatos`.
 */
const TELEFONE_BR = new RegExp(
  `${ANTES}(?:\\+55[\\s.-]?)?\\(?\\d{2}\\)?[\\s.-]?9?\\d{4}[\\s.-]?\\d{4}${DEPOIS}`,
  "gu",
);

/** Escapa metacaracteres para embutir um literal numa RegExp. */
function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Só os dígitos. */
function digitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Módulo 11 do CPF. Duplicado de propósito em relação a `src/lib/cpf.ts`:
 * aquele módulo é um VALIDADOR de formulário e devolve mensagem de erro em
 * pt-BR para a UI; aqui a pergunta é binária e roda em laço sobre cada corrida
 * de 11 dígitos de um prontuário inteiro. Importar de lá acoplaria o
 * sanitizador ao texto de erro de cadastro — que muda por razões de UX.
 */
function ehCpfValido(onzeDigitos: string): boolean {
  if (!/^\d{11}$/.test(onzeDigitos)) return false;
  if (/^(\d)\1{10}$/.test(onzeDigitos)) return false;

  for (const [ate, peso] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(onzeDigitos[i]) * (peso - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== Number(onzeDigitos[ate])) return false;
  }
  return true;
}

/** Descarta nulos/vazios e normaliza espaços. */
function literaisUteis(
  valores: readonly (string | null | undefined)[] | undefined,
): string[] {
  if (!valores) return [];
  return valores
    .map((v) => (v ?? "").replace(/\s+/g, " ").trim())
    .filter((v) => v.length > 0);
}

/**
 * Padrões para um nome próprio: o nome COMPLETO primeiro (tolerando espaço
 * múltiplo), depois cada token distintivo isolado.
 *
 * O completo vem antes porque "João Pedro Silva" deve virar UM marcador, não
 * três colados. O token isolado é o que pega o uso real do prontuário — a
 * criança é chamada pelo primeiro nome, quase nunca pelo nome de registro.
 */
function padroesDeNome(nome: string): RegExp[] {
  const tokens = nome.split(" ").filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  const padroes: RegExp[] = [];

  if (tokens.length > 1) {
    const completo = tokens.map(escaparRegex).join("\\s+");
    padroes.push(new RegExp(`${ANTES}${completo}${DEPOIS}`, "giu"));
  }

  for (const token of tokens) {
    if (token.length < MIN_TOKEN_NOME) continue;
    if (PARTICULAS_DE_NOME.has(token.toLowerCase())) continue;
    padroes.push(new RegExp(`${ANTES}${escaparRegex(token)}${DEPOIS}`, "giu"));
  }

  // A ordem é a do próprio nome cadastrado (completo → tokens da esquerda para
  // a direita) e é preservada de propósito: ela é função pura da entrada, que
  // é o que "determinístico" exige. Reordenar aqui não tornaria a saída mais
  // estável — só trocaria uma ordem por outra.
  return padroes;
}

/** Padrões literais de CPF conhecido: qualquer formatação dos mesmos dígitos. */
function padroesDeCpfConhecido(cpf: string): RegExp[] {
  const d = digitos(cpf);
  if (d.length !== 11) return [];
  const flexivel = d.split("").map(escaparRegex).join("[.\\s-]?");
  return [new RegExp(`${ANTES}${flexivel}${DEPOIS}`, "gu")];
}

/**
 * O texto em processamento, como lista de segmentos.
 *
 * `fixo: true` = já é marcador (posto agora ou já presente na entrada) e está
 * CONGELADO: nenhum padrão seguinte olha para dentro dele.
 *
 * Por que uma lista e não `String.replace` encadeado — o defeito que este
 * desenho existe para matar: os padrões rodam em sequência sobre o MESMO texto,
 * então um marcador escrito pelo padrão N vira entrada do padrão N+1. Com o
 * paciente "Paciente Souza", o padrão de nome completo produz `[PACIENTE_ID]` e
 * o padrão do token "Paciente" — que roda logo depois — casa o miolo do próprio
 * marcador (fronteira `[` … `_`), devolvendo `[[PACIENTE_ID]_ID]`. Isso quebra
 * a idempotência DENTRO de uma passada, onde nenhuma fatia por marcador
 * pré-existente ajudaria. Congelar o que já virou marcador resolve na origem, e
 * de uma vez para todos os padrões — inclusive os que ainda não existem.
 */
type Segmento = { fixo: boolean; texto: string };

/** Substitui `padrao` só nos segmentos LIVRES, congelando o que trocar. */
function substituirEmLivres(
  segmentos: readonly Segmento[],
  padrao: RegExp,
  marcador: string,
  aceitar: (casado: string) => boolean = () => true,
): { segmentos: Segmento[]; trocas: number } {
  const saida: Segmento[] = [];
  let trocas = 0;

  for (const seg of segmentos) {
    if (seg.fixo) {
      saida.push(seg);
      continue;
    }
    padrao.lastIndex = 0;
    let cursor = 0;
    for (const m of seg.texto.matchAll(padrao)) {
      const inicio = m.index;
      if (!aceitar(m[0])) continue;
      if (inicio > cursor) {
        saida.push({ fixo: false, texto: seg.texto.slice(cursor, inicio) });
      }
      saida.push({ fixo: true, texto: marcador });
      trocas++;
      cursor = inicio + m[0].length;
    }
    if (cursor < seg.texto.length) {
      saida.push({ fixo: false, texto: seg.texto.slice(cursor) });
    }
  }

  return { segmentos: saida, trocas };
}

/** Aplica vários padrões de uma categoria, em ordem. */
function aplicar(
  segmentos: readonly Segmento[],
  padroes: readonly RegExp[],
  marcador: string,
  aceitar?: (casado: string) => boolean,
): { segmentos: Segmento[]; trocas: number } {
  let atuais = [...segmentos];
  let trocas = 0;
  for (const padrao of padroes) {
    const r = substituirEmLivres(atuais, padrao, marcador, aceitar);
    atuais = r.segmentos;
    trocas += r.trocas;
  }
  return { segmentos: atuais, trocas };
}

/** Sanitiza a lista de segmentos, categoria a categoria, na ordem canônica. */
function sanitizarSegmentos(
  entrada: readonly Segmento[],
  identidades: IdentidadesDoPaciente,
): { segmentos: Segmento[]; trocasPorCategoria: Map<CategoriaPII, number> } {
  const trocasPorCategoria = new Map<CategoriaPII, number>();
  let segmentos = [...entrada];

  const registrar = (categoria: CategoriaPII, trocas: number) => {
    if (trocas === 0) return;
    trocasPorCategoria.set(
      categoria,
      (trocasPorCategoria.get(categoria) ?? 0) + trocas,
    );
  };

  const passo = (
    categoria: CategoriaPII,
    padroes: readonly RegExp[],
    marcador: string,
    aceitar?: (casado: string) => boolean,
  ) => {
    const r = aplicar(segmentos, padroes, marcador, aceitar);
    segmentos = r.segmentos;
    registrar(categoria, r.trocas);
  };

  for (const categoria of ORDEM_CATEGORIAS) {
    switch (categoria) {
      case "paciente": {
        const nome = literaisUteis([identidades.nomePaciente])[0];
        if (!nome) break;
        passo("paciente", padroesDeNome(nome), MARCADORES.paciente);
        break;
      }
      case "responsavel": {
        passo(
          "responsavel",
          literaisUteis(identidades.nomesResponsaveis).flatMap(padroesDeNome),
          MARCADORES.responsavel,
        );
        break;
      }
      case "cpf": {
        // 1. CPFs conhecidos, em qualquer formatação.
        passo(
          "cpf",
          literaisUteis(identidades.cpfs).flatMap(padroesDeCpfConhecido),
          MARCADORES.cpf,
        );
        // 2. Qualquer CPF mascarado (inequívoco pela pontuação).
        passo("cpf", [CPF_MASCARADO], MARCADORES.cpf);
        // 3. 11 dígitos crus, só os que passam no Módulo 11. Ver `DIGITOS_11`:
        //    os que não passam ficam para o padrão de telefone decidir.
        passo("cpf", [DIGITOS_11], MARCADORES.cpf, ehCpfValido);
        break;
      }
      case "email": {
        // Contatos conhecidos com "@" saem como e-mail; sem "@", como telefone.
        passo(
          "email",
          literaisUteis(identidades.contatos)
            .filter((c) => c.includes("@"))
            .map((c) => new RegExp(escaparRegex(c), "giu")),
          MARCADORES.email,
        );
        passo("email", [EMAIL], MARCADORES.email);
        break;
      }
      case "telefone": {
        passo(
          "telefone",
          literaisUteis(identidades.contatos)
            .filter((c) => !c.includes("@"))
            .map((c) => new RegExp(escaparRegex(c), "giu")),
          MARCADORES.telefone,
        );
        passo("telefone", [TELEFONE_BR], MARCADORES.telefone);
        break;
      }
    }
  }

  return { segmentos, trocasPorCategoria };
}

/**
 * Substitui a PII conhecida e a estruturalmente inequívoca por marcadores.
 *
 * Determinística e idempotente — ver o cabeçalho do módulo. Nunca lança: texto
 * vazio ou identidades vazias devolvem o texto intacto com `limpo: true`.
 */
export function sanitizarPII(
  texto: string,
  identidades: IdentidadesDoPaciente = {},
): ResultadoSanitizacao {
  // Semente: os marcadores JÁ presentes entram congelados, o resto entra livre.
  // Daí para a frente, todo marcador posto também nasce congelado — as duas
  // metades da idempotência (entre passadas e DENTRO de uma passada).
  const inicial: Segmento[] = [];
  let cursor = 0;
  MARCADOR_EXISTENTE.lastIndex = 0;
  for (
    let m = MARCADOR_EXISTENTE.exec(texto);
    m !== null;
    m = MARCADOR_EXISTENTE.exec(texto)
  ) {
    if (m.index > cursor) {
      inicial.push({ fixo: false, texto: texto.slice(cursor, m.index) });
    }
    inicial.push({ fixo: true, texto: m[0] });
    cursor = m.index + m[0].length;
  }
  if (cursor < texto.length) {
    inicial.push({ fixo: false, texto: texto.slice(cursor) });
  }

  const { segmentos, trocasPorCategoria } = sanitizarSegmentos(
    inicial,
    identidades,
  );

  const ocorrencias = ORDEM_CATEGORIAS.filter(
    (c) => (trocasPorCategoria.get(c) ?? 0) > 0,
  ).map((categoria) => ({
    categoria,
    marcador: MARCADORES[categoria],
    ocorrencias: trocasPorCategoria.get(categoria)!,
  }));

  return {
    texto: segmentos.map((s) => s.texto).join(""),
    ocorrencias,
    limpo: ocorrencias.length === 0,
  };
}

/**
 * Fail-closed do pipeline: `true` quando o texto AINDA contém PII de forma
 * estruturalmente inequívoca (CPF, e-mail, telefone com DDD) depois de
 * sanitizado. É o assert que o chunker roda antes de mandar o texto para o
 * provedor de embedding — não substitui `sanitizarPII`, verifica-o.
 *
 * Não afirma nada sobre NOMES: nome não tem forma verificável, e uma resposta
 * "não há nome" seria uma garantia que este módulo não pode dar.
 */
export function contemPiiEstrutural(texto: string): boolean {
  const semMarcadores = texto.replace(MARCADOR_EXISTENTE, " ");
  if (new RegExp(CPF_MASCARADO.source, "u").test(semMarcadores)) return true;
  if (new RegExp(EMAIL.source, "u").test(semMarcadores)) return true;
  if (new RegExp(TELEFONE_BR.source, "u").test(semMarcadores)) return true;
  for (const m of semMarcadores.matchAll(DIGITOS_11)) {
    if (ehCpfValido(m[0])) return true;
  }
  return false;
}
