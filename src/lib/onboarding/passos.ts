export type PassoId = "clinica" | "equipe" | "agenda" | "paciente";

export interface DefinicaoPasso {
  id: PassoId;
  titulo: string;
  descricao: string;
  rota: string;
}

/**
 * Os quatro passos do onboarding (#36, bloco D1 — decidido em 29/08/2026).
 *
 * A ordem é a do roteiro que o coordenador descobria por tentativa e erro:
 * clínica → equipe → agenda → paciente. Cada passo tem uma consulta que o
 * PROVA (ver `obterProgressoOnboarding`); nenhum tem flag manual, porque flag
 * que ninguém escreve mente.
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
] as const;
