import type { userRoleTipo } from "@/db/schema";

export type Papel = (typeof userRoleTipo.enumValues)[number];

/** Uma linha de `user_role` × `app_user`, antes de agregar por usuário. */
export interface VinculoMembro {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  mfaAtivo: boolean;
}

export interface MembroClassificado {
  id: string;
  nome: string;
  email: string;
  /** Papéis do membro nesta clínica, em ordem estável. */
  papeis: Papel[];
}

export interface PosturaSeguranca {
  /**
   * `admin_recepcao` sem segundo fator. Este papel NÃO passa pelo gate de MFA
   * de `src/auth/tenant.ts` — aqui a flag em `false` significa mesmo "opera sem
   * segundo fator". É o único risco real que esta tela consegue mostrar.
   */
  semSegundoFator: MembroClassificado[];
  /**
   * Papel clínico sem segundo fator. Não é "não ativou o 2FA": quem é clínico e
   * não ativou é desviado para `/mfa/setup` e não entra no app. A flag em
   * `false` marca convite provisionado que nunca teve primeiro acesso — a senha
   * temporária de `equipe/convidar` continua viva.
   */
  ativacaoPendente: MembroClassificado[];
  /** Contagem apenas: listar quem está em conformidade não serve a nenhuma ação. */
  protegidos: number;
  total: number;
}

const CLINICOS: ReadonlySet<Papel> = new Set<Papel>([
  "terapeuta",
  "coordenador",
]);

/**
 * Agrega os vínculos por `app_user.id` e classifica cada membro em um único
 * grupo.
 *
 * A agregação não é cosmética: `user_role` permite o mesmo usuário com dois
 * papéis na mesma clínica, e sem ela o membro apareceria duas vezes na tela e
 * contaria duas vezes no total que o coordenador entrega a um convênio.
 *
 * Papel duplo cai pelo lado **clínico**: quem também é terapeuta ou coordenador
 * passa pelo gate de MFA, então a flag em `false` só pode significar convite
 * pendente — classificá-lo como "sem segundo fator" afirmaria um risco que o
 * gate já impede.
 */
export function classificarPosturaSeguranca(
  vinculos: VinculoMembro[],
): PosturaSeguranca {
  const porUsuario = new Map<
    string,
    { membro: MembroClassificado; mfaAtivo: boolean }
  >();

  for (const v of vinculos) {
    const existente = porUsuario.get(v.id);
    if (existente) {
      if (!existente.membro.papeis.includes(v.papel)) {
        existente.membro.papeis.push(v.papel);
      }
      continue;
    }
    porUsuario.set(v.id, {
      membro: {
        id: v.id,
        nome: v.nome,
        email: v.email,
        papeis: [v.papel],
      },
      mfaAtivo: v.mfaAtivo,
    });
  }

  const semSegundoFator: MembroClassificado[] = [];
  const ativacaoPendente: MembroClassificado[] = [];
  let protegidos = 0;

  for (const { membro, mfaAtivo } of porUsuario.values()) {
    if (mfaAtivo) {
      protegidos += 1;
      continue;
    }
    if (membro.papeis.some((p) => CLINICOS.has(p))) {
      ativacaoPendente.push(membro);
    } else {
      semSegundoFator.push(membro);
    }
  }

  return {
    semSegundoFator,
    ativacaoPendente,
    protegidos,
    total: porUsuario.size,
  };
}

const ROTULO_PAPEL: Record<Papel, string> = {
  coordenador: "Coordenador",
  terapeuta: "Terapeuta",
  admin_recepcao: "Recepção",
};

export function rotularPapeis(papeis: Papel[]): string {
  return papeis.map((p) => ROTULO_PAPEL[p]).join(" · ");
}
