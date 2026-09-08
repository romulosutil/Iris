/**
 * #259 (D10 / T1) — A PORTA de assinatura digital ICP-Brasil.
 *
 * Este arquivo define o contrato, não a implementação. Não existe provedor PKI
 * contratado para o Iris (ver o PR da #259): T2, o adapter contra uma API real,
 * está fora de escopo por bloqueio comercial. O que existe aqui é a forma do
 * buraco, desenhada para que o adapter real caiba nela sem reescrever o
 * chamador — e um dublê determinístico (`fake-provider.ts`) para teste e
 * desenvolvimento local.
 *
 * ─── POR QUE A ENTRADA É O DIGEST, E NÃO O PDF ──────────────────────────────
 * Em PAdES a chave privada assina o hash das faixas de bytes do documento
 * (`/ByteRange`), nunca o documento inteiro. Modelar a porta com o PDF na
 * entrada convidaria o adapter real a fazer upload do prontuário para um
 * terceiro — transferência de dado clínico de menor sem base legal nem DPA.
 * Com o digest na entrada, o documento NUNCA sai do Iris: o que viaja são 32
 * bytes que não permitem reconstruir nada, e a chave privada nunca sai do
 * custodiante (arquivo A1 decifrado em memória, ou HSM/nuvem no caso A3).
 *
 * ─── PAdES-B-LT ─────────────────────────────────────────────────────────────
 * O perfil exigido pela guardrail #1 da issue: assinatura CAdES-BES embutida no
 * PDF, MAIS carimbo de tempo de AC credenciada ICP-Brasil, MAIS o material de
 * validação de longo prazo (OCSP/CRL) embutido, para que a assinatura continue
 * verificável depois de o certificado expirar. Por isso `EnvelopeAssinatura`
 * carrega os três: sem carimbo é B-T incompleto, sem OCSP/CRL é B-T, não B-LT.
 */

/** Único algoritmo de digest aceito. ICP-Brasil (DOC-ICP-15) não admite SHA-1. */
export const ALGORITMO_DIGEST = "SHA-256" as const;
export type AlgoritmoDigest = typeof ALGORITMO_DIGEST;

/** Único perfil aceito — ver a guardrail #1 da #259. */
export const PERFIL_PADES = "PAdES-B-LT" as const;
export type PerfilPades = typeof PERFIL_PADES;

/** Digest do documento. `valorHex` é minúsculo, 64 caracteres para SHA-256. */
export interface DigestParaAssinar {
  algoritmo: AlgoritmoDigest;
  valorHex: string;
}

/**
 * Ponteiro para a credencial da clínica em `assinatura_credencial` (0157).
 *
 * NÃO carrega `.pfx` nem senha — nem cifrados. Quem materializa o segredo é o
 * adapter real, chamando `app_assinatura_credencial_material()` e decifrando
 * com a KEK do KMS. Enquanto o KMS não existir (lacuna declarada na 0157),
 * nenhum adapter real pode ser escrito, e é por isso que T2 está fora de escopo.
 */
export interface ReferenciaCredencial {
  clinicId: string;
  credencialId: string;
}

/** Metadados públicos do certificado. `numeroSerie` vai para o `audit_log`. */
export interface CertificadoResumo {
  /** Número de série em hexadecimal maiúsculo, sem separadores. */
  numeroSerie: string;
  titular: string;
  emissor: string;
  validoDe: Date;
  validoAte: Date;
}

/** Carimbo de tempo de AC credenciada (RFC 3161). */
export interface CarimboDeTempo {
  autoridade: string;
  /** Token TSA em DER, base64. */
  tokenBase64: string;
  emitidoEm: Date;
}

/** Material de validação de longo prazo — o "LT" do PAdES-B-LT. */
export interface ValidacaoLongoPrazo {
  ocspBase64: string[];
  crlBase64: string[];
}

export interface SolicitacaoAssinatura {
  perfil: PerfilPades;
  digest: DigestParaAssinar;
  credencial: ReferenciaCredencial;
  /** Instante lógico da assinatura, injetado (nunca `new Date()` interno). */
  assinadoEm: Date;
  /** Campos do dicionário de assinatura do PDF; texto, não segredo. */
  motivo?: string;
  localidade?: string;
}

export interface EnvelopeAssinatura {
  perfil: PerfilPades;
  /** CMS/PKCS#7 detached em DER, base64. */
  cmsBase64: string;
  carimbo: CarimboDeTempo;
  certificado: CertificadoResumo;
  validacaoLongoPrazo: ValidacaoLongoPrazo;
}

/**
 * Erros de domínio da assinatura.
 *
 * `retentavel` separa o que adianta tentar de novo (provedor fora do ar,
 * carimbo recusado por indisponibilidade da TSA) do que só muda com ação
 * humana (certificado expirado, senha errada). Quem chama decide fila de
 * retry a partir daqui — não a partir da string da mensagem.
 */
export const ERROS_ASSINATURA = {
  /** A clínica não tem credencial vigente para o modo ICP-Brasil. */
  credencial_ausente: { retentavel: false },
  /** `now()` fora da janela `valido_de..valido_ate` do certificado. */
  certificado_expirado: { retentavel: false },
  /** Certificado revogado pela AC (OCSP/CRL) ou pela própria clínica. */
  certificado_revogado: { retentavel: false },
  /** O custodiante recusou a senha/PIN de destravamento da chave privada. */
  senha_invalida: { retentavel: false },
  /** Digest fora do formato do algoritmo declarado. */
  digest_invalido: { retentavel: false },
  /** O provedor não implementa o perfil pedido. */
  perfil_nao_suportado: { retentavel: false },
  /** Provedor de dublê acionado sem o chamador declarar que aceita um
   *  artefato sem valor jurídico. Erro de configuração, não de assinatura. */
  provedor_sem_validade_juridica: { retentavel: false },
  /** Rede, 5xx, timeout — o provedor não respondeu de forma utilizável. */
  provedor_indisponivel: { retentavel: true },
  /** A AC do tempo recusou ou não respondeu o carimbo. */
  carimbo_recusado: { retentavel: true },
  /** Faltou OCSP/CRL: seria B-T, não B-LT. */
  validacao_longo_prazo_incompleta: { retentavel: true },
} as const;

export type CodigoErroAssinatura = keyof typeof ERROS_ASSINATURA;

/**
 * Erro de assinatura ICP-Brasil.
 *
 * A mensagem descreve o que FOI OBSERVADO, nunca deduz a causa: "o provedor X
 * recusou o destravamento da chave" e não "a senha está errada" — o mesmo
 * `senha_invalida` cobre senha trocada, arquivo `.pfx` corrompido e DEK
 * decifrada com a KEK errada, e afirmar uma delas manda o suporte para o lugar
 * errado (memória `mensagem-de-erro-que-afirma-causa`).
 *
 * `detalhe` é texto do provedor. NUNCA colocar senha, PIN, DEK, bytes do `.pfx`
 * ou trecho do documento aqui: este erro sobe para log e para GlitchTip.
 */
export class ErroAssinaturaIcp extends Error {
  readonly codigo: CodigoErroAssinatura;
  readonly retentavel: boolean;
  readonly provedor: string;
  readonly detalhe?: string;

  constructor(params: {
    codigo: CodigoErroAssinatura;
    provedor: string;
    mensagem: string;
    detalhe?: string;
  }) {
    super(params.mensagem);
    this.name = "ErroAssinaturaIcp";
    this.codigo = params.codigo;
    this.retentavel = ERROS_ASSINATURA[params.codigo].retentavel;
    this.provedor = params.provedor;
    this.detalhe = params.detalhe;
  }
}

/**
 * Provedor PKI. Uma implementação = um custodiante de chave privada.
 *
 * `produzAssinaturaJuridicamenteValida` NÃO é decoração: é o bit que impede o
 * dublê de ser promovido a produção por descuido. `emitirPdfAssinado` recusa
 * assinar quando ele é `false` e o chamador não declarou explicitamente que
 * aceita um artefato sem valor jurídico.
 */
export interface PkiSignerProvider {
  readonly nome: string;
  readonly produzAssinaturaJuridicamenteValida: boolean;
  /** Metadados do certificado, sem assinar nada (uso: tela de validade, T5). */
  descreverCertificado(
    credencial: ReferenciaCredencial,
  ): Promise<CertificadoResumo>;
  assinarDigest(
    solicitacao: SolicitacaoAssinatura,
  ): Promise<EnvelopeAssinatura>;
}

/**
 * Embute o envelope no PDF (T4). Porta separada do provedor DE PROPÓSITO: quem
 * assina o digest e quem escreve o incremental update do PDF são preocupações
 * distintas, e o segundo não precisa de nenhum segredo.
 *
 * `produzPdfConformePades` é o mesmo tipo de trava do provedor: o embutidor de
 * dublê marca o PDF de forma legível e NÃO gera `/ByteRange` conforme.
 */
export interface EmbutidorPades {
  readonly nome: string;
  readonly produzPdfConformePades: boolean;
  embutir(pdf: Buffer, envelope: EnvelopeAssinatura): Promise<Buffer>;
}
