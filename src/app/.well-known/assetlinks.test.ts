import { describe, expect, it } from "vitest";
import { montarAssetLinks } from "./assetlinks.json/route";

const PACOTE = "br.ia.irisclinica.twa";
const FP_A =
  "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const FP_B =
  "A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90";

describe("montarAssetLinks", () => {
  it("monta a declaração no formato do Digital Asset Links", () => {
    const links = montarAssetLinks(PACOTE, FP_A);

    expect(links).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACOTE,
          sha256_cert_fingerprints: [FP_A],
        },
      },
    ]);
  });

  it("aceita múltiplos fingerprints separados por vírgula", () => {
    // Play App Signing troca a chave de upload pela chave do Google: durante a
    // transição as DUAS assinaturas existem em campo. Aceitar só uma faz o app
    // já instalado voltar a mostrar a barra do Chrome, sem erro em lugar nenhum.
    const links = montarAssetLinks(PACOTE, `${FP_A}, ${FP_B}`);
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B]);
  });

  it("ignora entrada vazia e espaço em volta", () => {
    const links = montarAssetLinks(PACOTE, `  ${FP_A} , , ${FP_B}  `);
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B]);
  });

  it("normaliza o fingerprint para maiúsculas", () => {
    // O `keytool` imprime em maiúsculas; um copiar-e-colar de outra ferramenta
    // pode vir em minúsculas. O Android compara byte a byte após normalizar,
    // mas normalizar aqui evita um dia inteiro de "por que não verifica".
    const links = montarAssetLinks(PACOTE, FP_A.toLowerCase());
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual([FP_A]);
  });

  it("devolve lista vazia quando o pacote não está configurado", () => {
    // Ambiente sem TWA (dev local, preview) serve `[]`: JSON válido, semântica
    // explícita de "nenhum app verificado". Inventar um pacote padrão faria a
    // verificação apontar para um app que não é nosso.
    expect(montarAssetLinks(undefined, FP_A)).toEqual([]);
    expect(montarAssetLinks("", FP_A)).toEqual([]);
  });

  it("devolve lista vazia quando não há nenhum fingerprint", () => {
    expect(montarAssetLinks(PACOTE, undefined)).toEqual([]);
    expect(montarAssetLinks(PACOTE, "  ,  ")).toEqual([]);
  });
});
