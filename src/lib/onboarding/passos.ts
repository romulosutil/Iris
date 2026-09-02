export type PassoId =
  "clinica" | "equipe" | "agenda" | "paciente" | "primeiroPacientePronto";

export interface DefinicaoPasso {
  id: PassoId;
  titulo: string;
  descricao: string;
  rota: string;
}

/**
 * Os passos do onboarding (#36, bloco D1 — decidido em 29/08/2026; o quinto
 * entrou com o bloco D3 da spec da jornada de admissão, 01/09/2026).
 *
 * A ordem é a do roteiro que o coordenador descobria por tentativa e erro:
 * clínica → equipe → agenda → paciente → paciente PRONTO. Cada passo tem uma
 * consulta que o PROVA (ver `obterProgressoOnboarding`); nenhum tem flag
 * manual, porque flag que ninguém escreve mente.
 *
 * O quinto passo existe porque a lista parava em `paciente EXISTS`: celebrava
 * o cadastro e sumia exatamente onde a jornada endurece — é possível cadastrar,
 * agendar, atender e consolidar uma sessão inteira com o gráfico de evolução
 * continuando vazio.
 */
export const PASSOS_ONBOARDING: readonly DefinicaoPasso[] = [
  {
    id: "clinica",
    titulo: "Complete os dados da clínica",
    descricao:
      "Razão social e endereço. São exigidos na hora de emitir a cobrança — preencher agora evita travar depois.",
    rota: "/clinica/dados",
  },
  {
    id: "equipe",
    titulo: "Convide a equipe",
    descricao:
      "Cadastre pelo menos um terapeuta ou recepção. Cada pessoa entra com o próprio acesso.",
    rota: "/equipe",
  },
  {
    id: "agenda",
    titulo: "Configure a agenda",
    descricao:
      "Defina as janelas de trabalho da equipe. Sem elas, a agenda não tem onde encaixar sessão.",
    rota: "/agenda",
  },
  {
    id: "paciente",
    titulo: "Cadastre o primeiro paciente",
    descricao:
      "É o cadastro que dá início ao período de teste. Configurar tudo antes disso é gratuito.",
    rota: "/pacientes",
  },
  {
    id: "primeiroPacientePronto",
    titulo: "Deixe o primeiro paciente pronto para atender",
    // O que falta NÃO é o mesmo para todo paciente: a escada é por modalidade
    // (`capacidadesDaModalidade`, D-A5/D-A6/D-A7). Nomear aqui "protocolo e
    // meta" seria descrever só o `protocol_driven` e mentir para os outros.
    descricao:
      "O que falta depende da modalidade: protocolo e meta no ABA, instrumento inicial no TCC. Sem isso, a sessão é documentada e a evolução continua vazia.",
    rota: "/pacientes",
  },
] as const;
