import "server-only";
import { sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { patient, consent, patientAlvoDisciplina } from "@/db/schema";

export type CadastroAdminState = { error?: string };

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

  // Alvo de carga por disciplina (Agenda 2.0). Pares posicionais do form.
  const disciplinas = formData.getAll("alvoDisciplina").map(String);
  const horas = formData.getAll("alvoHorasSemana").map(String);
  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const id = await withTenant(ctx, async (tx) => {
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
      // 0..N alvos, na MESMA transação (rollback junto do paciente/consent se
      // algum par for inválido). vigenciaInicio = hoje; campos vazios ignorados.
      for (let i = 0; i < disciplinas.length; i++) {
        const disc = disciplinas[i]?.trim();
        if (!disc) continue;
        const h = horas[i]?.trim();
        const num = Number(h);
        if (!h || Number.isNaN(num) || num <= 0) {
          throw new Error(`Alvo de horas inválido para "${disc}".`);
        }
        await tx.insert(patientAlvoDisciplina).values({
          clinicId: ctx.clinicId,
          patientId: novo!.id,
          disciplina: disc,
          horasAlvoSemana: num.toFixed(1),
          vigenciaInicio: hoje,
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
    return { error: e instanceof Error ? e.message : "Falha ao cadastrar paciente." };
  }
}
