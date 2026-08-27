import { NextResponse } from "next/server";

/**
 * Digital Asset Links do TWA (#185, Etapa 3).
 *
 * É este arquivo que faz o Android confiar que `irisclinica.ia.br` e o APK
 * assinado com aquele certificado são a mesma entidade. Sem a verificação, a
 * Trusted Web Activity ainda abre — mas com a barra de endereço do Chrome por
 * cima, que é exatamente o que o critério de aceite 3 da spec proíbe.
 *
 * Por que parametrizado por ambiente e não chumbado:
 *
 *  - o fingerprint de release só existe DEPOIS que a conta do Play Console
 *    assina o pacote. Chumbar exigiria um deploy só para publicar na loja;
 *  - com Play App Signing existem DOIS fingerprints válidos ao mesmo tempo (a
 *    chave de upload e a chave do Google). Uma lista fixa de um item derruba a
 *    verificação silenciosamente no dia da troca.
 */
export const dynamic = "force-dynamic";

export interface AssetLink {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * @param pacote `TWA_ANDROID_PACKAGE_NAME` — ex.: `br.ia.irisclinica.twa`.
 * @param fingerprints `TWA_SHA256_FINGERPRINTS` — SHA-256 em hex com dois
 *   pontos, separados por vírgula quando houver mais de um.
 */
export function montarAssetLinks(
  pacote: string | undefined,
  fingerprints: string | undefined,
): AssetLink[] {
  const nome = pacote?.trim();
  if (!nome) return [];

  const lista = (fingerprints ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => f.length > 0);

  if (lista.length === 0) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: nome,
        sha256_cert_fingerprints: lista,
      },
    },
  ];
}

export function GET() {
  const corpo = montarAssetLinks(
    process.env.TWA_ANDROID_PACKAGE_NAME,
    process.env.TWA_SHA256_FINGERPRINTS,
  );

  // O verificador do Android exige `application/json`. Servido como
  // `text/plain` ele falha sem mensagem útil — o sintoma é a barra do Chrome
  // aparecendo, três camadas longe da causa.
  return NextResponse.json(corpo, {
    headers: {
      "Content-Type": "application/json",
      // Curto de propósito: durante a publicação o fingerprint muda e um cache
      // longo prende a verificação quebrada por horas.
      "Cache-Control": "public, max-age=300",
    },
  });
}
