import "server-only";
import { and, eq } from "drizzle-orm";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { consent } from "@/db/schema";
import { VERSAO_TERMO_TITULAR_ADULTO_ATUAL } from "@/app/(app)/pacientes/novo/logic";
import { traduzirErroDeConsentimento } from "@/lib/consent/erros";

/**
 * Versão do PROCEDIMENTO administrativo de revogação — não de um termo
 * assinado pelo titular (não existe "termo de revogação"). O CHECK
 * `consent_versao_termo_por_tipo` exige o prefixo `revogacao-` justamente
 * nestas linhas, e o proíbe em qualquer outra.
 */
export const VERSAO_PROCEDIMENTO_REVOGACAO_ATUAL = "revogacao-v1";

/**
 * ⚠️ PENDENTE DE RATIFICAÇÃO JURÍDICA: os termos próprios de curatela e de
 * titular emancipado ainda não existem como documento em `docs/legal/`. Estas
 * constantes nomeiam a versão que será gravada quando existirem — o dado já é
 * modelável, mas o uso com titular real depende do termo escrito e ratificado.
 */
export const VERSAO_TERMO_CURATELA_ATUAL = "curatela-v1";
export const VERSAO_TERMO_EMANCIPADO_ATUAL = "emancipado-v1";

export type EventoConsentimento =
  | {
      evento: "revogacao";
      consentIdAlvo: string;
      responsavelSignatario?: string;
    }
  | { evento: "renovacao_maioridade" }
  | {
      evento: "representacao";
      tipo: "curatela" | "emancipado";
      instrumentoRepresentacao: string;
      /** Obrigatório em `curatela` (o curador); proibido em `emancipado`. */
      responsavelSignatario?: string;
    };

export type EventoConsentimentoState = { error?: string };

/**
 * Falha de validação de entrada. Classe própria (e não `Error`) para que o
 * catch distinga "o operador preencheu errado" — mensagem já pronta — de uma
 * falha do banco, que precisa ser traduzida antes de aparecer na tela.
 * Lançada de dentro do `withTenant` para abortar a transação.
 */
class ErroDeValidacao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroDeValidacao";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Traduz falha de constraint/RLS do Postgres em mensagem para o operador.
 *
 * O banco é a fronteira final e é ele que decide — mas um `new row violates
 * check constraint "consent_responsavel_por_tipo"` não diz nada a quem está no
 * balcão. Nunca vaza a mensagem crua do driver (contém nome de constraint,
 * tabela e às vezes o valor recusado).
 *
 * Centralizado em `@/lib/consent/erros` (reusado pelos demais caminhos de
 * escrita clínica que passam pelo gate de somente-leitura/finalidade
 * revogada, migração 0053). Aqui, quando a tradução central não reconhece o
 * erro (`null`), cai para a mensagem genérica de registro de consentimento —
 * este fluxo específico já filtra `RoleError`/`ErroDeValidacao` antes, então
 * "erro desconhecido" aqui é sempre uma falha real do banco, nunca esperada.
 */
function mensagemAmigavel(e: unknown): string {
  return (
    traduzirErroDeConsentimento(e) ??
    "Não foi possível registrar o evento de consentimento. Tente novamente."
  );
}

/**
 * Núcleo testável: grava uma LINHA NOVA em `consent` para paciente JÁ
 * EXISTENTE — revogação (#133), renovação por maioridade (#135) ou
 * representação/emancipação (#134). `consent` é append-only: nenhum dos três
 * eventos edita a linha original.
 *
 * `admin_recepcao`/`coordenador` — mesmo par da policy `consent_insert`:
 * coletar consentimento é ato administrativo, não clínico.
 *
 * Recebe `ctx` como parâmetro (nunca do request). NÃO é exportado por
 * `actions.ts` — só via wrapper que deriva o tenant no servidor.
 */
export async function registrarEventoConsentimento(
  ctx: TenantContext,
  patientId: string,
  input: EventoConsentimento,
): Promise<EventoConsentimentoState & { id?: string }> {
  requireRole(ctx, "admin_recepcao", "coordenador");

  if (!UUID_RE.test(patientId)) {
    return { error: "Paciente inválido." };
  }

  try {
    const id = await withTenant(ctx, async (tx) => {
      switch (input.evento) {
        case "revogacao": {
          if (!UUID_RE.test(input.consentIdAlvo)) {
            throw new ErroDeValidacao(
              "Selecione qual consentimento será revogado.",
            );
          }
          // Validação de leitura antes da escrita: a FK composta e o trigger
          // barrariam de qualquer forma, mas com erro opaco. O `patientId` no
          // WHERE é o que impede revogar consentimento de outro paciente já
          // aqui — e a RLS impede de outra clínica.
          const [alvo] = await tx
            .select({ id: consent.id, tipo: consent.tipo })
            .from(consent)
            .where(
              and(
                eq(consent.id, input.consentIdAlvo),
                eq(consent.patientId, patientId),
              ),
            )
            .limit(1);
          if (!alvo) {
            throw new ErroDeValidacao(
              "Consentimento não encontrado para este paciente.",
            );
          }
          if (alvo.tipo === "revogacao_consentimento") {
            throw new ErroDeValidacao(
              "Não é possível revogar uma revogação. Para restabelecer o consentimento, registre uma nova concessão.",
            );
          }
          const [linha] = await tx
            .insert(consent)
            .values({
              patientId,
              tipo: "revogacao_consentimento" as const,
              // Pode ficar NULL (o titular revoga por si) ou preenchido (o
              // responsável revoga em nome do menor/curatelado). Quem podia
              // assinar já foi decidido na linha original — por isso o CHECK
              // não exige nada aqui.
              responsavelSignatario:
                input.responsavelSignatario?.trim() || null,
              consentRevogadoId: alvo.id,
              versaoTermo: VERSAO_PROCEDIMENTO_REVOGACAO_ATUAL,
            })
            .returning({ id: consent.id });
          return linha!.id;
        }

        case "renovacao_maioridade": {
          // O paciente que completou 18 passa a consentir por si. Não valida
          // idade: o indicador de maioridade é PASSIVO, e bloquear aqui
          // inverteria isso — além de que `nascimento` é nullable.
          const [linha] = await tx
            .insert(consent)
            .values({
              patientId,
              tipo: "autoconsentimento_titular_adulto" as const,
              responsavelSignatario: null,
              versaoTermo: VERSAO_TERMO_TITULAR_ADULTO_ATUAL,
            })
            .returning({ id: consent.id });
          return linha!.id;
        }

        case "representacao": {
          const instrumento = input.instrumentoRepresentacao?.trim() ?? "";
          if (!instrumento) {
            throw new ErroDeValidacao(
              input.tipo === "curatela"
                ? "Informe o instrumento que comprova a curatela (processo ou termo)."
                : "Informe o instrumento que comprova a emancipação (certidão).",
            );
          }
          const signatario = input.responsavelSignatario?.trim() ?? "";
          if (input.tipo === "curatela" && !signatario) {
            throw new ErroDeValidacao(
              "Nome do curador que assina o consentimento é obrigatório.",
            );
          }
          // Rejeita em vez de ignorar: titular emancipado assina por si, e um
          // signatário preenchido aqui é inconsistência de formulário — o
          // operador precisa saber qual das duas informações está errada.
          if (input.tipo === "emancipado" && signatario) {
            throw new ErroDeValidacao(
              "Titular emancipado assina por si — remova o nome do responsável ou troque o tipo para curatela.",
            );
          }
          const [linha] = await tx
            .insert(consent)
            .values(
              input.tipo === "curatela"
                ? {
                    patientId,
                    tipo: "representacao_curador" as const,
                    responsavelSignatario: signatario,
                    instrumentoRepresentacao: instrumento,
                    versaoTermo: VERSAO_TERMO_CURATELA_ATUAL,
                  }
                : {
                    patientId,
                    tipo: "autoconsentimento_titular_emancipado" as const,
                    // null, não "" — o CHECK do banco exige IS NULL.
                    responsavelSignatario: null,
                    instrumentoRepresentacao: instrumento,
                    versaoTermo: VERSAO_TERMO_EMANCIPADO_ATUAL,
                  },
            )
            .returning({ id: consent.id });
          return linha!.id;
        }
      }
    });
    return { id };
  } catch (e) {
    if (e instanceof RoleError) throw e;
    // Validação nossa já vem legível; o resto passa pelo tradutor para não
    // vazar nome de constraint nem stack trace para a tela.
    if (e instanceof ErroDeValidacao) return { error: e.message };
    return { error: mensagemAmigavel(e) };
  }
}
