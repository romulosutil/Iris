import "server-only";
import { sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { motivoExpurgoSchema, pacienteIdSchema } from "./schemas";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

/**
 * #352 — fila de retenção e expurgo de prontuário expirado.
 *
 * A paginação é o molde literal de `clinica/auditoria/logic.ts`, com uma
 * diferença de número e uma de racional:
 *
 * - **25 por página**, não 50. Cada linha desta fila é um convite a apagar um
 *   prontuário inteiro e em definitivo. Página curta é atrito deliberado: o
 *   coordenador vê uma tela de decisões, não um extrato.
 * - o total encolhe entre a renderização de um link e o clique nele — lá porque
 *   a trilha expira aos 180 dias, aqui porque o coordenador acabou de purgar
 *   alguém. O grampeamento vale pelos dois motivos.
 */

/** Itens por página. Não é "limite fixo": a página N existe e é alcançável. */
export const ITENS_POR_PAGINA = 25;

/**
 * `?pagina=` vem da URL — ou seja, do usuário. Qualquer coisa que não seja
 * inteiro >= 1 vira 1. Sem isto, `pagina=-3` vira OFFSET negativo (erro de
 * sintaxe no Postgres) e `pagina=1e9` vira uma varredura inútil.
 */
export function normalizarPagina(bruto: string | string[] | undefined): number {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== "string") return 1;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

/**
 * Total de páginas para `total` registros. Zero registros = 1 página (a página
 * vazia existe e é renderizável — e aqui ela é o estado NORMAL de uma clínica
 * nova), e não 0: `Pagination` com `totalPaginas = 0` mostraria "Página 1 de 0".
 */
export function totalDePaginas(total: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / ITENS_POR_PAGINA);
}

/**
 * A página pedida pode não existir mais: purgar um paciente o tira da fila, e
 * quem estava na última página com um item só cai numa página que deixou de
 * existir. Grampeia na última página válida em vez de devolver lista vazia —
 * lista vazia numa página alta se lê como "não há prontuários vencidos", que é
 * afirmação falsa sobre uma obrigação legal.
 */
export function grampearPagina(pagina: number, total: number): number {
  return Math.min(Math.max(pagina, 1), totalDePaginas(total));
}

export function offsetDaPagina(pagina: number): number {
  return (pagina - 1) * ITENS_POR_PAGINA;
}

export type ExpurgoState = {
  error?: string;
  ok?: boolean;
};

export type ExpurgoInput = {
  pacienteId: string;
  motivo: string;
  confirmacao: string;
};

/**
 * #352 — expurgo definitivo do prontuário de um paciente cujo prazo legal de
 * guarda venceu.
 *
 * ⚠️ **Este core NÃO usa `comEscrita()`, e a ausência é deliberada.** É a única
 * escrita do repositório fora do guard de conta em somente-leitura.
 *
 * Eliminar dado pessoal cujo prazo de guarda venceu é obrigação da clínica
 * **como controladora** (LGPD Art. 16), e ela continua controladora quando está
 * inadimplente conosco. Bloquear o expurgo por dívida converteria nossa
 * cobrança em retenção ilegal de dado pessoal de terceiro — o titular do
 * prontuário não é parte do contrato comercial e não pode ser refém dele.
 *
 * O oposto vale para `registrarAlta` (`pacientes/[id]/logic.ts`), que É
 * `comEscrita`: dar alta é operação corrente do produto. Se alguém, daqui a
 * três meses, "corrigir o esquecimento" adicionando o wrapper aqui, o caso 6 de
 * `logic.int.test.ts` cai — é ele que trava esta decisão.
 *
 * **Autorização em três camadas**, nenhuma delas redundante:
 * 1. `requireRole` aqui — recusa explícita em vez de erro cru do Postgres;
 * 2. o guard de `app_purgar_paciente` (`0128`), que é a fronteira real: sendo
 *    `SECURITY DEFINER`, é o único lugar em que o RLS não vale;
 * 3. o gate de elegibilidade dentro da mesma função, que recusa prontuário cujo
 *    prazo ainda não venceu — e chega até aqui como erro opaco.
 */
export async function purgarPacienteCore(
  ctx: TenantContext,
  input: ExpurgoInput,
): Promise<ExpurgoState> {
  requireRole(ctx, "coordenador");

  // Validação DENTRO do core: este caminho é chamado direto pelos testes de
  // integração e por qualquer futuro que não passe por `FormData`. O
  // `minLength` do campo é conveniência de UX — um POST direto na action chega
  // aqui sem passar por HTML nenhum.
  const idValidado = pacienteIdSchema.safeParse(input.pacienteId);
  if (!idValidado.success) {
    return {
      error: idValidado.error.issues[0]?.message ?? "Paciente inválido.",
    };
  }

  const motivoValidado = motivoExpurgoSchema.safeParse(input.motivo);
  if (!motivoValidado.success) {
    return {
      error: motivoValidado.error.issues[0]?.message ?? "Motivo inválido.",
    };
  }

  try {
    return await withTenant(ctx, async (tx) => {
      // O confirmador é conferido contra o nome lido DO BANCO, nunca contra um
      // nome que veio junto no `FormData`. Comparar o que o cliente mandou com
      // o que o cliente mandou não confirma nada: quem forja o POST manda os
      // dois campos iguais e a barreira desaparece.
      const linhas = (await tx.execute<{ nome: string }>(
        sql`SELECT nome FROM patient WHERE id = ${idValidado.data}`,
      )) as unknown as { nome: string }[];

      const nome = linhas[0]?.nome;
      if (typeof nome !== "string") {
        // Três causas indistinguíveis daqui, todas resolvidas pela mesma
        // mensagem: o paciente não existe, o RLS não deixa este usuário vê-lo,
        // ou ele JÁ foi purgado (o expurgo apaga a linha de `patient`).
        // Distinguir viraria oráculo de existência entre clínicas.
        return { error: "Paciente indisponível para expurgo." };
      }

      // Match EXATO, sem normalizar caixa nem acento (R352.C6). Normalizar
      // reduziria o atrito exatamente onde o atrito é o produto: o confirmador
      // não protege contra clique acidental — protege contra purgar o paciente
      // ERRADO, que é o modo de falha provável numa fila de vários nomes
      // parecidos.
      if (input.confirmacao !== nome) {
        return {
          error: "A confirmação não confere com o nome do paciente.",
        };
      }

      // O gate de elegibilidade mora aqui dentro (`0128`, seção 4). Prontuário
      // cujo prazo ainda não venceu faz esta chamada estourar, e a exceção cai
      // no `catch` abaixo como erro opaco — o usuário não recebe o texto do
      // `RAISE`, que nomeia função e papel.
      await tx.execute(
        sql`SELECT app_purgar_paciente(${idValidado.data}, ${motivoValidado.data})`,
      );

      return { ok: true };
    });
  } catch (err) {
    logarErroSemPII("purgarPaciente:", err);
    return {
      error:
        "Não foi possível expurgar este prontuário. Verifique se o prazo de guarda já venceu.",
    };
  }
}
