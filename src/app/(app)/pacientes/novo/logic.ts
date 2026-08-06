import "server-only";
import { sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { patient, consent } from "@/db/schema";
import {
  avaliarSituacaoConta,
  mensagemDeEstado,
  type EstadoConta,
} from "@/lib/billing/estado-conta";
import type { BloqueioConta } from "@/lib/billing/guard-escrita";

/**
 * Sinaliza conta em somente-leitura de dentro da transação. Precisa ser um
 * throw, e não um `return`, porque a decisão acontece dentro do callback do
 * `withTenant`: um return ali devolveria o valor mas deixaria a transação
 * seguir seu curso normal. Lançar garante o ROLLBACK — o cadastro bloqueado
 * não pode deixar rastro parcial.
 */
class BloqueioBillingError extends Error {
  constructor(readonly estado: EstadoConta) {
    super(mensagemDeEstado(estado));
    this.name = "BloqueioBillingError";
  }
}

/**
 * `bloqueioConta` existe separado de `error` porque o formulário reage de
 * forma diferente: `error` é texto de validação, enquanto conta em
 * somente-leitura (#163) abre o fluxo de ativação da assinatura. Um único campo
 * de string obrigaria a UI a inferir a intenção pelo texto da mensagem.
 */
export type CadastroAdminState = {
  error?: string;
  bloqueioConta?: BloqueioConta;
};

// Versões de termo vigentes, uma por tipo de titular. Fixas por ora; viram
// config quando houver versionamento de termo (docs/legal). O valor "v1" do
// termo do menor NÃO muda — há dado gravado com ele em produção.
export const VERSAO_TERMO_MENOR_ATUAL = "v1";
export const VERSAO_TERMO_TITULAR_ADULTO_ATUAL = "adulto-v1";

/**
 * Quem assina o consentimento. É ESCOLHA EXPLÍCITA do operador no formulário,
 * NUNCA derivada de `patient.nascimento`: `nascimento` é nullable, e derivar
 * por idade erra nos dois sentidos (adolescente emancipado assina por si;
 * adulto sob curatela não assina por si). `nascimento` segue desacoplado.
 *
 * Adulto sob curatela está fora de escopo (#100) — não existe terceiro valor.
 */
export type TipoConsentimento = "responsavel_legal" | "titular_adulto";

const TIPOS_CONSENTIMENTO: readonly string[] = [
  "responsavel_legal",
  "titular_adulto",
];

/**
 * Núcleo testável: cria paciente + Consent LGPD na MESMA transação. Consent
 * antes de qualquer dado clínico é regra inegociável (CLAUDE.md §6). Recepção
 * e coordenação podem fazer o cadastro administrativo.
 *
 * Recebe `ctx` como parâmetro (nunca do request). NÃO é exportado por
 * `actions.ts` — só via wrapper que deriva o tenant do servidor.
 */
export async function criarPacienteEConsent(
  ctx: TenantContext,
  formData: FormData,
): Promise<CadastroAdminState & { id?: string }> {
  requireRole(ctx, "admin_recepcao", "coordenador");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Nome é obrigatório." };

  const nascimentoRaw = String(formData.get("nascimento") ?? "").trim();
  if (nascimentoRaw && !/^\d{4}-\d{2}-\d{2}$/.test(nascimentoRaw)) {
    return { error: "Data de nascimento inválida." };
  }

  // Campo OBRIGATÓRIO e sem default silencioso: um default "responsavel_legal"
  // gravaria consentimento de menor para um adulto sempre que a UI esquecesse
  // de mandar o campo — erro que só apareceria numa auditoria LGPD.
  const tipoConsentimentoRaw = String(
    formData.get("tipoConsentimento") ?? "",
  ).trim();
  if (!TIPOS_CONSENTIMENTO.includes(tipoConsentimentoRaw)) {
    return {
      error:
        "Selecione quem assina o consentimento: o próprio paciente (titular adulto) ou o responsável legal.",
    };
  }
  const tipoConsentimento = tipoConsentimentoRaw as TipoConsentimento;

  const responsavelSignatario = String(
    formData.get("responsavelSignatario") ?? "",
  ).trim();
  if (tipoConsentimento === "responsavel_legal" && !responsavelSignatario) {
    return {
      error:
        "Nome do responsável que assina o consentimento é obrigatório.",
    };
  }
  // Rejeita em vez de ignorar: o CHECK do banco barraria de qualquer forma,
  // com erro 500 opaco. Responsável preenchido junto de "titular adulto" é
  // inconsistência de formulário — o operador precisa saber qual das duas
  // informações está errada.
  if (tipoConsentimento === "titular_adulto" && responsavelSignatario) {
    return {
      error:
        "Consentimento de titular adulto não deve informar responsável — remova o nome do responsável ou troque para responsável legal.",
    };
  }

  const responsavelContato =
    String(formData.get("responsavelContato") ?? "").trim() || undefined;
  const escola = String(formData.get("escola") ?? "").trim() || undefined;
  const convenio = String(formData.get("convenio") ?? "").trim() || undefined;

  // #203 (fatia 2): o cadastro NÃO prescreve mais. Disciplina e carga horária
  // migraram para a ficha clínica, onde nascem com vigência própria (SCD2) e
  // são o teto que a equipe consome. Campos `alvoDisciplina`/`alvoHorasSemana`
  // que ainda cheguem por um formulário em cache são IGNORADOS de propósito —
  // aceitá-los criaria prescrição pelo caminho antigo, sem histórico, e a
  // divergência só apareceria na barra de cobertura semanas depois.

  try {
    const id = await withTenant(ctx, async (tx) => {
      // Situação da conta ANTES do primeiro INSERT, e dentro da MESMA
      // transação: avaliada fora dela, a decisão poderia enxergar um estado de
      // assinatura diferente do que o INSERT enxerga, e um rollback do cadastro
      // não reverteria a decisão junto.
      //
      // No 1º cadastro a clínica está em `free_tier` com `trial_comeco_em
      // IS NULL` e dentro do teto de 14 dias → `trial_aguardando` → passa. Não
      // há chicken-and-egg com `app_iniciar_trial()` lá embaixo.
      const situacao = await avaliarSituacaoConta(tx, ctx.clinicId);
      if (!situacao.podeCadastrarPaciente) {
        throw new BloqueioBillingError(situacao.estado);
      }

      const [novo] = await tx
        .insert(patient)
        .values({
          clinicId: ctx.clinicId,
          nome,
          nascimento: nascimentoRaw || undefined,
          responsavelContato,
          escola,
          convenio,
        })
        .returning({ id: patient.id });
      const signatario =
        tipoConsentimento === "titular_adulto" ? null : responsavelSignatario;
      const versaoTermo =
        tipoConsentimento === "titular_adulto"
          ? VERSAO_TERMO_TITULAR_ADULTO_ATUAL
          : VERSAO_TERMO_MENOR_ATUAL;

      await tx.insert(consent).values(
        tipoConsentimento === "titular_adulto"
          ? {
              patientId: novo!.id,
              tipo: "autoconsentimento_titular_adulto" as const,
              // null, não "" — o CHECK do banco exige IS NULL.
              responsavelSignatario: null,
              versaoTermo,
            }
          : {
              patientId: novo!.id,
              tipo: "tratamento_dados_menor" as const,
              responsavelSignatario: signatario!,
              versaoTermo,
            },
      );

      // Finalidades específicas LGPD (#140): registros próprios de Consent
      // se marcados no formulário pelo operador/titular.
      const consentimentoIaRaw = String(formData.get("consentimentoIa") ?? "");
      if (
        consentimentoIaRaw === "on" ||
        consentimentoIaRaw === "sim" ||
        consentimentoIaRaw === "true"
      ) {
        await tx.insert(consent).values({
          patientId: novo!.id,
          tipo: "uso_ia_processamento" as const,
          responsavelSignatario: signatario,
          versaoTermo,
        });
      }

      const consentimentoExportacaoRaw = String(
        formData.get("consentimentoExportacao") ?? "",
      );
      if (
        consentimentoExportacaoRaw === "on" ||
        consentimentoExportacaoRaw === "sim" ||
        consentimentoExportacaoRaw === "true"
      ) {
        await tx.insert(consent).values({
          patientId: novo!.id,
          tipo: "exportacao_relatorios" as const,
          responsavelSignatario: signatario,
          versaoTermo,
        });
      }
      // #175: o relógio do trial começa no 1º paciente, na MESMA transação —
      // se o cadastro reverter, o trial não começou. A função é idempotente
      // (só escreve com `trial_comeco_em IS NULL AND isento_trial = false`),
      // então não há SELECT antes para saber se é o primeiro: um
      // SELECT-then-UPDATE reintroduziria a corrida entre dois cadastros
      // simultâneos. É também o único caminho de escrita — `app_role` não tem
      // policy de UPDATE em `clinic`.
      await tx.execute(sql`SELECT app_iniciar_trial()`);

      return novo!.id;
    });
    return { id };
  } catch (e) {
    // A exceção dentro do withTenant já reverteu a transação (paciente/consent/
    // alvos). Vira erro amigável para o formulário.
    if (e instanceof BloqueioBillingError) {
      return {
        error: e.message,
        bloqueioConta: { estado: e.estado, mensagem: e.message },
      };
    }
    return { error: e instanceof Error ? e.message : "Falha ao cadastrar paciente." };
  }
}
