import "server-only";
import { sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { codigoPg } from "@/db/pg-error";
import { patient, consent, clinicalModalityEnum } from "@/db/schema";
import {
  avaliarSituacaoConta,
  mensagemDeEstado,
  type EstadoConta,
} from "@/lib/billing/estado-conta";
import type { BloqueioConta } from "@/lib/billing/guard-escrita";
import { validarEMaterializarCPF } from "@/lib/cpf";
import { gerarCpfHash } from "@/lib/security/cpf-hash";

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
const VERSAO_TERMO_MENOR_ATUAL = "v1";
export const VERSAO_TERMO_TITULAR_ADULTO_ATUAL = "adulto-v1";

/**
 * Quem assina o consentimento. É ESCOLHA EXPLÍCITA do operador no formulário,
 * NUNCA derivada de `patient.nascimento`: `nascimento` é nullable, e derivar
 * por idade erra nos dois sentidos (adolescente emancipado assina por si;
 * adulto sob curatela não assina por si). `nascimento` segue desacoplado.
 *
 * Adulto sob curatela está fora de escopo (#100) — não existe terceiro valor.
 */
type TipoConsentimento = "responsavel_legal" | "titular_adulto";

const TIPOS_CONSENTIMENTO: readonly string[] = [
  "responsavel_legal",
  "titular_adulto",
];

type ClinicalModality = (typeof clinicalModalityEnum.enumValues)[number];

const CLINICAL_MODALITIES: readonly string[] = clinicalModalityEnum.enumValues;

/**
 * Espelha `idadeEmAnos` de `novo-paciente-form.tsx` (mesma derivação, mesmo
 * arredondamento) — aqui roda no SERVIDOR, para o gate de consentimento (R3,
 * #387). Defesa em profundidade: o client já bloqueia o submit, mas nunca se
 * confia só nisso. Recebe `nascimentoRaw` já validado pelo regex de formato
 * (linha ~80 abaixo), então só resta checar `Invalid Date`.
 */
function idadeEmAnos(nascimento: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null;
  const nasc = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) anos--;
  if (anos < 0) return null;
  return anos;
}

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

  // #191 — CPF do titular adulto ou do responsável legal do menor, conforme a
  // MESMA escolha explícita acima (nunca `nascimento` — motivo no comentário
  // de `TipoConsentimento`, D1). Exatamente um dos dois campos é exigido.
  // Sem `| undefined`: todos os caminhos que não atribuem retornam antes, então
  // a análise de atribuição definida do TS garante a string no uso abaixo.
  // Declarar como opcional obrigaria a um `!` que esconderia justamente um
  // caminho novo que esquecesse de atribuir.
  let cpfLimpo: string;
  if (tipoConsentimento === "titular_adulto") {
    const cpfRaw = String(formData.get("cpf") ?? "").trim();
    const resultado = validarEMaterializarCPF(cpfRaw);
    if (!resultado.valido) {
      return { error: `CPF do paciente: ${resultado.erro}` };
    }
    cpfLimpo = resultado.cpfLimpo;
  } else {
    const responsavelCpfRaw = String(
      formData.get("responsavelCpf") ?? "",
    ).trim();
    const resultado = validarEMaterializarCPF(responsavelCpfRaw);
    if (!resultado.valido) {
      return { error: `CPF do responsável: ${resultado.erro}` };
    }
    cpfLimpo = resultado.cpfLimpo;
  }
  const cpfHash = gerarCpfHash(cpfLimpo);

  const responsavelSignatario = String(
    formData.get("responsavelSignatario") ?? "",
  ).trim();
  if (tipoConsentimento === "responsavel_legal" && !responsavelSignatario) {
    return {
      error: "Nome do responsável que assina o consentimento é obrigatório.",
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

  // Campo OBRIGATÓRIO e sem default silencioso (#387), mesmo padrão de
  // `tipoConsentimento` acima: um default "protocol_driven" gravaria
  // protocolo estruturado (ABA/TEA) para qualquer paciente sempre que a UI
  // esquecesse de mandar o campo — erro que só apareceria numa auditoria da
  // ficha clínica, não no cadastro.
  const clinicalModalityRaw = String(
    formData.get("clinicalModality") ?? "",
  ).trim();
  if (!CLINICAL_MODALITIES.includes(clinicalModalityRaw)) {
    return {
      error:
        "Selecione a modalidade clínica: protocolo estruturado, Terapia Cognitivo-Comportamental (TCC) ou terapia convencional.",
    };
  }
  const clinicalModality = clinicalModalityRaw as ClinicalModality;

  // R3 (#387) — gate de consentimento por modalidade. TCC e terapia
  // convencional carregam instrumentos próprios do titular (RPD, escalas,
  // resumo de sessão): sem autoconsentimento do paciente adulto, o registro
  // fica sem base LGPD própria para eles. `protocol_driven` fica DE FORA
  // deste bloqueio — mantém só o aviso soft que já existe hoje no formulário
  // (fora do escopo desta issue). Defesa em profundidade: o client já
  // desabilita o submit nesse caso, mas o servidor nunca confia só nisso.
  if (
    (clinicalModality === "cognitive_behavioral" ||
      clinicalModality === "conventional") &&
    tipoConsentimento !== "titular_adulto"
  ) {
    const idade = idadeEmAnos(nascimentoRaw);
    if (idade !== null && idade >= 18) {
      return {
        error:
          "Paciente adulto em TCC ou terapia convencional exige consentimento do próprio titular (titular adulto). Ajuste quem assina o consentimento antes de salvar.",
      };
    }
  }

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

      let novo: { id: string } | undefined;
      try {
        [novo] = await tx
          .insert(patient)
          .values({
            clinicId: ctx.clinicId,
            nome,
            nascimento: nascimentoRaw || undefined,
            responsavelContato,
            escola,
            convenio,
            cpf: tipoConsentimento === "titular_adulto" ? cpfLimpo : undefined,
            responsavelCpf:
              tipoConsentimento === "responsavel_legal" ? cpfLimpo : undefined,
            cpfHash,
            clinicalModality,
          })
          .returning({ id: patient.id });
      } catch (e) {
        // #191 — `uq_patient_clinic_cpf` (23505 = unique_violation). Erro
        // amigável em vez do 500 opaco do banco — mesmo espírito do aviso em
        // `nascimento` acima.
        //
        // `codigoPg` (e não `e.cause.code` cru) porque a posição do SQLSTATE
        // depende da camada: o Drizzle embrulha e joga o original em `.cause`,
        // o driver puro expõe na raiz. Ler só um dos dois faz este `catch`
        // parar de reconhecer a violação numa troca de versão — em silêncio,
        // devolvendo 500 opaco em vez da mensagem.
        if (codigoPg(e) === "23505") {
          throw new Error("Este CPF já está cadastrado nesta clínica.");
        }
        throw e;
      }
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
      // #191 — só faz sentido checar fraude de trial no cadastro que VAI
      // iniciar o relógio (`trial_aguardando` = ainda não tem 1º paciente).
      // Fora disso a clínica já pagou ou já está em trial próprio, e o CPF
      // repetido é só duplicata intra-clínica (já barrada acima pelo 23505).
      if (situacao.estado === "trial_aguardando") {
        const linhas = (await tx.execute<{ usado: boolean }>(sql`
          SELECT app_cpf_hash_usado_em_outro_trial(${cpfHash}) AS usado
        `)) as unknown as ({ usado: boolean } | undefined)[];
        const usado = linhas[0]?.usado;
        // Falha FECHADA. `SELECT f(x)` sempre devolve uma linha; ausência é
        // bug, e tratá-la como "não usou" seria exatamente a falha aberta que
        // a #215 fechou. Erro próprio, não `trial_bloqueado_fraude`: acusar
        // fraude de quem tropeçou num defeito nosso é a mensagem errada.
        if (typeof usado !== "boolean") {
          throw new Error(
            "Não foi possível verificar a elegibilidade do período de teste. Tente novamente.",
          );
        }
        if (usado) {
          throw new BloqueioBillingError("trial_bloqueado_fraude");
        }
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
    return {
      error: e instanceof Error ? e.message : "Falha ao cadastrar paciente.",
    };
  }
}
