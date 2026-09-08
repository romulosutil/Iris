/**
 * #259 (D10 / T4) — orquestração da emissão de PDF com ou sem assinatura
 * ICP-Brasil, e o registro atômico da assinatura no `audit_log`.
 *
 * ─── QUAL PDF ESTE MÓDULO ASSINA ────────────────────────────────────────────
 * O repositório tem DOIS caminhos de PDF e a issue não diz qual assina:
 *
 *   1. `src/lib/report/playwright-renderer.ts` (HTML → PDF) congelado por
 *      `src/lib/report/export.ts` — relatórios de evolução, à família e de
 *      convênio. É ATO PROFISSIONAL: sai da clínica assinado por um terapeuta
 *      ou pelo RT, endereçado a família, convênio ou conselho.
 *   2. `src/lib/export/pdf-generator.ts` (pdfkit) — a cópia integral de
 *      prontuário da LGPD Art. 18. É DIREITO DE ACESSO do titular: o que ela
 *      precisa provar é integridade e rastreabilidade da entrega, o que a
 *      marca d'água nominal + SHA-256 na trilha já fazem. Assinar com o
 *      certificado do profissional uma cópia pedida pelo responsável
 *      confundiria "entreguei o que existe" com "atesto profissionalmente
 *      este conteúdo".
 *
 * DECISÃO: o caminho (1) é o alvo do ICP-Brasil; o (2) permanece no modelo
 * padrão. Este módulo recebe BYTES, não `report`, então o dia em que a decisão
 * mudar basta ligar o outro chamador — nada aqui muda.
 *
 * A spec da #259 cita `@react-pdf/renderer`; essa biblioteca NÃO existe neste
 * repositório (nem em `package.json`, nem em import algum). Registrado no PR.
 *
 * ─── O QUE É FALLBACK E O QUE É FALHA ───────────────────────────────────────
 * Guardrail #4: relatório que não pede ICP-Brasil segue no modelo padrão, e
 * nesse caminho o provedor NÃO É CHAMADO — nem para descrever certificado.
 * Mas o inverso não é simétrico: quando o ICP-Brasil FOI pedido e não pode ser
 * cumprido (sem credencial vigente, certificado fora da validade, provedor
 * fora do ar), a emissão FALHA. Degradar em silêncio para o modo padrão
 * devolveria ao usuário um PDF que ele pediu assinado e não está — uma
 * afirmação falsa sobre um documento clínico. Fail-closed.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "../../db/rls";
import {
  ALGORITMO_DIGEST,
  ErroAssinaturaIcp,
  PERFIL_PADES,
  type CarimboDeTempo,
  type CertificadoResumo,
  type DigestParaAssinar,
  type EmbutidorPades,
  type PkiSignerProvider,
  type ReferenciaCredencial,
} from "./signer/types";

/** Ação registrada na trilha — nome fixado pela guardrail #3 da #259. */
export const ACAO_AUDITORIA_ASSINATURA = "relatorio_assinado_icp";

const HEX_SHA256 = /^[a-f0-9]{64}$/;

/**
 * Digest do documento, entrada da assinatura. É este valor — e não o PDF — que
 * viaja para o custodiante da chave privada.
 */
export function calcularDigestParaAssinatura(pdf: Buffer): DigestParaAssinar {
  return {
    algoritmo: ALGORITMO_DIGEST,
    valorHex: createHash("sha256").update(pdf).digest("hex"),
  };
}

export type ResultadoEmissao =
  | {
      modo: "padrao";
      pdf: Buffer;
      /** SHA-256 dos bytes entregues. */
      hashSha256: string;
    }
  | {
      modo: "icp_brasil";
      pdf: Buffer;
      /** SHA-256 dos bytes ASSINADOS — é o que a guardrail #3 manda auditar. */
      hashSha256: string;
      /** SHA-256 do documento antes do envelope; é o digest que foi assinado. */
      hashDocumentoOriginal: string;
      provedor: string;
      certificado: CertificadoResumo;
      carimbo: CarimboDeTempo;
      /** `false` quando o artefato veio de dublê — nunca some do resultado. */
      juridicamenteValido: boolean;
    };

export interface OpcoesEmissao {
  pdf: Buffer;
  /** Decidido pelo chamador (tipo de relatório × exigência do destinatário). */
  exigeIcpBrasil: boolean;
  /** Relógio injetado: a janela de validade do certificado é medida contra ele. */
  agora: Date;
  credencial?: ReferenciaCredencial;
  provider?: PkiSignerProvider;
  embutidor?: EmbutidorPades;
  /**
   * Trava anti-descuido: usar um provedor cujo
   * `produzAssinaturaJuridicamenteValida` é `false` exige dizer, no ponto de
   * chamada, que se aceita um artefato sem valor legal. Teste e ambiente local
   * passam `true`; caminho de produção, nunca.
   */
  aceitarProvedorSemValidadeJuridica?: boolean;
  motivo?: string;
  localidade?: string;
}

export async function emitirPdfAssinado(
  opcoes: OpcoesEmissao,
): Promise<ResultadoEmissao> {
  const { pdf, exigeIcpBrasil, agora } = opcoes;

  // ── Fallback transparente (guardrail #4) ────────────────────────────────
  // Retorno ANTES de tocar em credencial, provedor ou certificado: um
  // relatório do fluxo padrão não pode falhar, nem ficar mais lento, por causa
  // de uma feature que ele não pediu.
  if (!exigeIcpBrasil) {
    return {
      modo: "padrao",
      pdf,
      hashSha256: createHash("sha256").update(pdf).digest("hex"),
    };
  }

  const { credencial, provider, embutidor } = opcoes;

  // Provedor/embutidor ausentes são erro de fiação (o chamador esqueceu de
  // injetar), não erro de domínio — por isso `Error`, não `ErroAssinaturaIcp`:
  // não existe retry nem mensagem de usuário que resolva um bug de wiring.
  if (!provider || !embutidor) {
    throw new Error(
      "emitirPdfAssinado: modo ICP-Brasil exige `provider` e `embutidor` injetados",
    );
  }

  // Já a ausência de credencial É erro de domínio: a clínica simplesmente não
  // cadastrou (ou revogou) o certificado. Fail-closed, sem degradar.
  if (!credencial) {
    throw new ErroAssinaturaIcp({
      codigo: "credencial_ausente",
      provedor: provider.nome,
      mensagem:
        "assinatura ICP-Brasil pedida, mas a clínica não tem credencial vigente",
    });
  }

  if (
    !provider.produzAssinaturaJuridicamenteValida &&
    !opcoes.aceitarProvedorSemValidadeJuridica
  ) {
    throw new ErroAssinaturaIcp({
      codigo: "provedor_sem_validade_juridica",
      provedor: provider.nome,
      mensagem: `provedor "${provider.nome}" não produz assinatura juridicamente válida e o chamador não declarou aceitá-lo`,
    });
  }

  // Validade do certificado ANTES de assinar. Deixar o provedor recusar
  // custaria uma ida à rede para descobrir algo que o Iris já sabe, e em
  // muitos provedores a recusa vem como 4xx genérico — indistinguível de
  // credencial errada.
  const certificado = await provider.descreverCertificado(credencial);
  if (agora < certificado.validoDe || agora > certificado.validoAte) {
    throw new ErroAssinaturaIcp({
      codigo: "certificado_expirado",
      provedor: provider.nome,
      mensagem: `certificado ${certificado.numeroSerie} fora da janela de validade em ${agora.toISOString()}`,
      detalhe: `validade ${certificado.validoDe.toISOString()}..${certificado.validoAte.toISOString()}`,
    });
  }

  const digest = calcularDigestParaAssinatura(pdf);
  if (!HEX_SHA256.test(digest.valorHex)) {
    throw new ErroAssinaturaIcp({
      codigo: "digest_invalido",
      provedor: provider.nome,
      mensagem: "digest calculado fora do formato hex de 64 caracteres",
    });
  }

  const envelope = await provider.assinarDigest({
    perfil: PERFIL_PADES,
    digest,
    credencial,
    assinadoEm: agora,
    motivo: opcoes.motivo,
    localidade: opcoes.localidade,
  });

  // O "LT" do PAdES-B-LT não é opcional: sem carimbo de tempo e sem material
  // de revogação embutido, a assinatura deixa de ser verificável quando o
  // certificado expira. Aceitar um envelope incompleto aqui produziria um PDF
  // que parece assinado hoje e não se sustenta em auditoria daqui a dois anos.
  if (envelope.perfil !== PERFIL_PADES) {
    throw new ErroAssinaturaIcp({
      codigo: "perfil_nao_suportado",
      provedor: provider.nome,
      mensagem: `envelope devolvido no perfil "${String(envelope.perfil)}", esperado ${PERFIL_PADES}`,
    });
  }
  if (!envelope.carimbo.tokenBase64) {
    throw new ErroAssinaturaIcp({
      codigo: "carimbo_recusado",
      provedor: provider.nome,
      mensagem: "envelope sem token de carimbo de tempo",
    });
  }
  if (
    envelope.validacaoLongoPrazo.ocspBase64.length === 0 &&
    envelope.validacaoLongoPrazo.crlBase64.length === 0
  ) {
    throw new ErroAssinaturaIcp({
      codigo: "validacao_longo_prazo_incompleta",
      provedor: provider.nome,
      mensagem: "envelope sem OCSP nem CRL: seria B-T, não B-LT",
    });
  }

  const assinado = await embutidor.embutir(pdf, envelope);

  return {
    modo: "icp_brasil",
    pdf: assinado,
    hashSha256: createHash("sha256").update(assinado).digest("hex"),
    hashDocumentoOriginal: digest.valorHex,
    provedor: provider.nome,
    certificado: envelope.certificado,
    carimbo: envelope.carimbo,
    juridicamenteValido:
      provider.produzAssinaturaJuridicamenteValida &&
      embutidor.produzPdfConformePades,
  };
}

/**
 * Detalhe JSONB do evento `relatorio_assinado_icp` (guardrail #3): hash
 * SHA-256 do PDF **assinado** e número de série do certificado.
 *
 * `hash_documento_original` entra junto de propósito — é o valor que foi de
 * fato assinado. Sem ele, uma verificação futura teria o hash do arquivo final
 * e nenhuma forma de recalcular o que o certificado cobriu.
 *
 * Mesmo formato de `montarDetalheAuditoriaExportacao` (pdf-generator.ts), para
 * que a tela de trilha leia os dois eventos com o mesmo shape.
 */
export function montarDetalheAuditoriaAssinaturaIcp(params: {
  hashPdfAssinado: string;
  hashDocumentoOriginal: string;
  numeroSerieCertificado: string;
  provedor: string;
  carimboEm: Date;
  juridicamenteValido: boolean;
}) {
  return {
    acao: ACAO_AUDITORIA_ASSINATURA,
    hash_sha256: params.hashPdfAssinado,
    hash_documento_original: params.hashDocumentoOriginal,
    certificado_numero_serie: params.numeroSerieCertificado,
    provedor: params.provedor,
    carimbo_em: params.carimboEm.toISOString(),
    perfil: PERFIL_PADES,
    fundamento_legal: "Lei 14.063/2020 (assinatura eletrônica qualificada)",
    // Explícito na trilha: um artefato de dublê fica marcado como tal PARA
    // SEMPRE, em vez de virar indistinguível de assinatura real seis meses
    // depois, quando ninguém lembrar qual ambiente gerou aquela linha.
    juridicamente_valido: params.juridicamenteValido,
  };
}

/** Só o `execute` da transação — mantém o módulo testável sem abrir banco. */
type ExecutorSql = Pick<Tx, "execute">;

/**
 * Grava a assinatura na trilha imutável.
 *
 * INSERT direto, e não função `SECURITY DEFINER`: `audit_log` tem
 * `GRANT SELECT, INSERT ... TO app_role` e `REVOKE UPDATE, DELETE` (0039). A
 * imutabilidade proíbe MUTAR a trilha, não alimentá-la — quem precisa de
 * definer é o expurgo/pseudonimização (0070/0145), não este caminho. Mesmo
 * idioma de `src/lib/report/export.ts`.
 *
 * `ator_id` NÃO vem de parâmetro por acaso: a policy `audit_insert` exige
 * `ator_id = app_user_id_exigido()`, então quem passar outro usuário toma
 * violação de RLS em vez de gravar uma trilha mentirosa.
 */
export async function registrarAssinaturaIcpNaTrilha(
  tx: ExecutorSql,
  params: {
    clinicId: string;
    atorId: string;
    reportId: string;
    patientId: string;
    detalhe: ReturnType<typeof montarDetalheAuditoriaAssinaturaIcp>;
  },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
    VALUES (${params.clinicId}, ${params.atorId}, ${ACAO_AUDITORIA_ASSINATURA},
            'report', ${params.reportId}, ${params.patientId},
            ${JSON.stringify(params.detalhe)}::jsonb)`);
}
