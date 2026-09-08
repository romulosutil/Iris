/**
 * #259 (D10) — DUBLÊ. NÃO PRODUZ ASSINATURA JURIDICAMENTE VÁLIDA.
 *
 * ⚠️ Nada aqui tem valor legal. Este provedor não possui certificado ICP-Brasil,
 * não fala com Autoridade Certificadora nenhuma, não emite carimbo de tempo
 * RFC 3161 e o "CMS" que devolve é um SHA-256 em base64 — não é PKCS#7. Um PDF
 * que passe por ele NÃO atende à Lei 14.063/2020 e não deve ser entregue a
 * paciente, convênio ou conselho profissional como documento assinado.
 *
 * Para que serve: exercitar o contrato de `PkiSignerProvider` em teste e em
 * desenvolvimento local, incluindo os caminhos de ERRO, sem depender de um
 * provedor real (que não existe — ver T2, fora de escopo por bloqueio
 * comercial). O bit `produzAssinaturaJuridicamenteValida = false` é a trava que
 * impede `emitirPdfAssinado` de usar este provedor sem uma declaração explícita
 * do chamador.
 *
 * DETERMINISMO: mesma entrada → mesmos bytes de saída, sempre. Sem `Date.now()`,
 * sem `randomBytes`. É o que permite assertar hash em teste sem congelar relógio
 * (mesmo idioma do `StubPdfRenderer` em `src/lib/report/renderer.ts`).
 */
import { createHash } from "node:crypto";
import {
  ErroAssinaturaIcp,
  PERFIL_PADES,
  type CarimboDeTempo,
  type CertificadoResumo,
  type CodigoErroAssinatura,
  type EmbutidorPades,
  type EnvelopeAssinatura,
  type PkiSignerProvider,
  type ReferenciaCredencial,
  type SolicitacaoAssinatura,
} from "./types";

export const NOME_PROVEDOR_DUBLE = "fake_local";

/** Certificado fictício. O número de série é fixo para asserção em teste. */
export const CERTIFICADO_DUBLE: CertificadoResumo = {
  numeroSerie: "0FAKE0FAKE0FAKE0FAKE0FAKE0FAKE01",
  titular: "CLINICA DE DUBLE LTDA:00000000000191",
  emissor: "AC DUBLE — NAO CREDENCIADA ICP-BRASIL",
  validoDe: new Date("2026-01-01T00:00:00.000Z"),
  validoAte: new Date("2027-01-01T00:00:00.000Z"),
};

function base64De(...partes: string[]): string {
  return createHash("sha256").update(partes.join("|")).digest("base64");
}

export interface OpcoesFakeProvider {
  /**
   * Faz a próxima chamada a `assinarDigest` estourar com este código, para
   * exercitar o tratamento de erro do chamador. Sem isto não haveria como
   * testar `provedor_indisponivel` ou `carimbo_recusado` — o dublê nunca falha
   * sozinho.
   */
  falharCom?: CodigoErroAssinatura;
  /** Sobrescreve o certificado devolvido (ex.: janela de validade vencida). */
  certificado?: CertificadoResumo;
}

export class FakePkiSignerProvider implements PkiSignerProvider {
  readonly nome = NOME_PROVEDOR_DUBLE;
  /** Ver o cabeçalho deste arquivo. Nunca mude para `true`. */
  readonly produzAssinaturaJuridicamenteValida = false;

  /** Chamadas recebidas, para o teste medir o que FOI e o que NÃO FOI chamado. */
  readonly chamadas: SolicitacaoAssinatura[] = [];

  private readonly opcoes: OpcoesFakeProvider;

  constructor(opcoes: OpcoesFakeProvider = {}) {
    this.opcoes = opcoes;
  }

  private get certificado(): CertificadoResumo {
    return this.opcoes.certificado ?? CERTIFICADO_DUBLE;
  }

  async descreverCertificado(
    _credencial: ReferenciaCredencial,
  ): Promise<CertificadoResumo> {
    return this.certificado;
  }

  async assinarDigest(
    solicitacao: SolicitacaoAssinatura,
  ): Promise<EnvelopeAssinatura> {
    this.chamadas.push(solicitacao);

    if (this.opcoes.falharCom) {
      throw new ErroAssinaturaIcp({
        codigo: this.opcoes.falharCom,
        provedor: this.nome,
        mensagem: `dublê de assinatura configurado para recusar com "${this.opcoes.falharCom}"`,
      });
    }

    if (solicitacao.perfil !== PERFIL_PADES) {
      throw new ErroAssinaturaIcp({
        codigo: "perfil_nao_suportado",
        provedor: this.nome,
        mensagem: `perfil "${String(solicitacao.perfil)}" não suportado pelo dublê`,
      });
    }

    const carimbo: CarimboDeTempo = {
      autoridade: "TSA DUBLE — SEM VALOR LEGAL",
      tokenBase64: base64De(
        "tsa",
        solicitacao.digest.valorHex,
        solicitacao.assinadoEm.toISOString(),
      ),
      emitidoEm: solicitacao.assinadoEm,
    };

    return {
      perfil: PERFIL_PADES,
      cmsBase64: base64De(
        "cms",
        solicitacao.digest.valorHex,
        solicitacao.credencial.credencialId,
        this.certificado.numeroSerie,
      ),
      carimbo,
      certificado: this.certificado,
      validacaoLongoPrazo: {
        ocspBase64: [base64De("ocsp", this.certificado.numeroSerie)],
        crlBase64: [base64De("crl", this.certificado.emissor)],
      },
    };
  }
}

/**
 * Embutidor de dublê. NÃO gera `/ByteRange` nem incremental update conforme
 * PAdES — anexa um bloco de texto marcado ao fim dos bytes.
 *
 * O marcador é EXPLÍCITO e legível a olho nu de propósito: se um PDF destes
 * escapar para produção, quem abrir o arquivo num editor de texto lê, em letras
 * garrafais, que não é assinatura válida. Um embutidor silencioso produziria um
 * arquivo indistinguível de um assinado de verdade — que é exatamente o risco.
 */
export const MARCADOR_DUBLE = "%%IRIS-ASSINATURA-DUBLE-SEM-VALOR-JURIDICO";

export class EmbutidorPadesFalso implements EmbutidorPades {
  readonly nome = "duble_local";
  readonly produzPdfConformePades = false;

  async embutir(pdf: Buffer, envelope: EnvelopeAssinatura): Promise<Buffer> {
    const bloco = [
      "",
      MARCADOR_DUBLE,
      `%% perfil=${envelope.perfil}`,
      `%% serie=${envelope.certificado.numeroSerie}`,
      `%% cms=${envelope.cmsBase64}`,
      `%% carimbo=${envelope.carimbo.tokenBase64}`,
      `%% carimbo_em=${envelope.carimbo.emitidoEm.toISOString()}`,
      "",
    ].join("\n");
    return Buffer.concat([pdf, Buffer.from(bloco, "latin1")]);
  }
}
