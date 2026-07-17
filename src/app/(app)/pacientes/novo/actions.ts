"use server";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { patient, consent, patientAlvoDisciplina } from "@/db/schema";

export type CadastroAdminState = { error?: string };

// Versão do termo de consentimento vigente. Fixo por ora; vira config quando
// houver versionamento de termo (docs/legal).
const VERSAO_TERMO_CONSENTIMENTO_ATUAL = "v1";

/**
 * Núcleo testável: cria paciente + Consent LGPD na MESMA transação. Consent
 * antes de qualquer dado clínico é regra inegociável (CLAUDE.md §6). Recepção
 * e coordenação podem fazer o cadastro administrativo.
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

  const responsavelSignatario = String(
    formData.get("responsavelSignatario") ?? "",
  ).trim();
  if (!responsavelSignatario) {
    return {
      error:
        "Nome do responsável que assina o consentimento é obrigatório.",
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
      await tx.insert(consent).values({
        patientId: novo!.id,
        tipo: "tratamento_dados_menor",
        responsavelSignatario,
        versaoTermo: VERSAO_TERMO_CONSENTIMENTO_ATUAL,
      });
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
      return novo!.id;
    });
    return { id };
  } catch (e) {
    // A exceção dentro do withTenant já reverteu a transação (paciente/consent/
    // alvos). Vira erro amigável para o formulário.
    return { error: e instanceof Error ? e.message : "Falha ao cadastrar paciente." };
  }
}

/** Wrapper para `useActionState`: resolve tenant e redireciona ao cadastro clínico. */
export async function cadastrarPacienteAdministrativo(
  _prev: CadastroAdminState,
  formData: FormData,
): Promise<CadastroAdminState> {
  const ctx = await getTenantContext();
  const resultado = await criarPacienteEConsent(ctx, formData);
  if (resultado.error) return { error: resultado.error };
  redirect(`/pacientes/${resultado.id}/cadastro-clinico`);
}
