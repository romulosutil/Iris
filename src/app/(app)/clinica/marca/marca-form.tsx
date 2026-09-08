"use client";

import { useActionState, useEffect, useState } from "react";
import { Stack } from "@/components/ui/layout";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONTRASTE_MINIMO_AA,
  FUNDO_PDF,
  normalizarCorHex,
  razaoDeContraste,
  SELO_IRIS,
  TAMANHO_MAX_LOGO_BYTES,
} from "@/lib/branding/marca";
import { salvarMarcaAction, type MarcaState } from "./actions";
import type { MarcaView } from "./logic";

const COR_NEUTRA = "#1a1a1a";

/** Assinatura de 8 bytes do PNG (RFC 2083 §3.1) — cópia client-side de
 * `ASSINATURA_PNG` (marca.ts): aquela usa `Buffer`, que não roda no browser. */
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * #258 (D9) — configuração da marca institucional, com pré-visualização do
 * topo do PDF (T5).
 *
 * O preview mostra TAMBÉM o selo de integridade do Iris, em cinza travado com
 * um cadeado: o coordenador precisa ver, antes de salvar, que a marca dele
 * ocupa o cabeçalho e que o selo continua no rodapé — a alternativa (preview
 * só do cabeçalho) venderia a ideia de um documento inteiramente branco.
 */
export function MarcaForm({ marca }: { marca: MarcaView }) {
  const [state, formAction] = useActionState<MarcaState, FormData>(
    salvarMarcaAction,
    {},
  );

  const [cor, setCor] = useState(marca.corPrimaria ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(
    marca.logoDataUri,
  );
  const [removerLogo, setRemoverLogo] = useState(false);
  const [avisoArquivo, setAvisoArquivo] = useState<string | null>(null);

  // Revoga a object URL do arquivo escolhido quando ela deixa de ser usada —
  // sem isso cada troca de arquivo vaza um blob na aba até o reload.
  useEffect(() => {
    if (logoPreview?.startsWith("blob:")) {
      const url = logoPreview;
      return () => URL.revokeObjectURL(url);
    }
    return undefined;
  }, [logoPreview]);

  const corNormalizada = cor.trim() === "" ? null : normalizarCorHex(cor);
  const contraste = corNormalizada
    ? razaoDeContraste(corNormalizada, FUNDO_PDF)
    : null;
  const contrasteInsuficiente =
    contraste !== null && contraste < CONTRASTE_MINIMO_AA;
  const corDoPreview =
    corNormalizada && !contrasteInsuficiente ? corNormalizada : COR_NEUTRA;

  const erroCor =
    cor.trim() !== "" && !corNormalizada
      ? "Use o formato hexadecimal, por exemplo #1F4E79."
      : contrasteInsuficiente
        ? `Contraste ${contraste!.toFixed(2)}:1 sobre o papel branco do PDF — abaixo do mínimo de ${CONTRASTE_MINIMO_AA}:1 (WCAG 2.1 AA). Escolha um tom mais escuro.`
        : undefined;

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) {
      setLogoPreview(marca.logoDataUri);
      setAvisoArquivo(null);
      return;
    }
    if (arquivo.size > TAMANHO_MAX_LOGO_BYTES) {
      setAvisoArquivo(
        `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(2)} MB e o limite é 2 MB.`,
      );
      setLogoPreview(marca.logoDataUri);
      return;
    }
    // Mesma régua do servidor (`validarLogoPng`, marca.ts): magic bytes, não
    // extensão nem `arquivo.type` — os dois são texto livre do cliente. Sem
    // esta checagem, um arquivo renomeado para `.png` viraria um blob: URL
    // (`URL.createObjectURL`) exibido cru num `<img src>` — o preview
    // reinterpretaria bytes escolhidos pelo usuário sem validar o formato.
    const assinatura = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer());
    const ehPng = ASSINATURA_PNG.every((byte, i) => assinatura[i] === byte);
    if (!ehPng) {
      setAvisoArquivo(
        "O arquivo não é um PNG válido. Envie o logotipo em PNG (SVG não é aceito por segurança).",
      );
      setLogoPreview(marca.logoDataUri);
      return;
    }
    setAvisoArquivo(null);
    setRemoverLogo(false);
    setLogoPreview(URL.createObjectURL(arquivo));
  }

  const logoExibido = removerLogo ? null : logoPreview;

  return (
    <Stack gap="lg">
      <Alert
        severidade="info"
        titulo="O que a marca da clínica alcança — e o que ela nunca alcança"
      >
        <Stack gap="sm">
          <p>
            O logotipo e a cor entram no <strong>cabeçalho</strong> dos
            relatórios de família e de convênio e da cópia de prontuário
            exportada.
          </p>
          <p>
            O selo de integridade do Iris no rodapé e a marca d’água nominal com
            o nome e o CPF de quem pediu a cópia do prontuário{" "}
            <strong>não podem ser removidos nem alterados</strong> por nenhuma
            configuração desta tela. São eles que permitem a um convênio ou a um
            juiz distinguir um documento emitido pelo Iris de um PDF montado à
            mão com o mesmo logotipo.
          </p>
        </Stack>
      </Alert>

      <Form action={formAction} error={state.error}>
        {state.ok ? <Alert severidade="sucesso">Marca salva.</Alert> : null}

        <Field
          label="Cor institucional"
          htmlFor="corPrimaria"
          error={erroCor}
          hint="Hexadecimal, como #1F4E79. Deixe em branco para usar o grafite neutro do Iris. A cor é medida contra o papel branco do PDF, não contra o fundo desta tela."
        >
          <Input
            id="corPrimaria"
            name="corPrimaria"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            placeholder="#1F4E79"
            spellCheck={false}
            aria-invalid={erroCor ? true : undefined}
          />
        </Field>

        <Field
          label="Logotipo"
          htmlFor="logo"
          error={avisoArquivo ?? undefined}
          hint="PNG de até 2 MB. SVG não é aceito: é markup executável e não há como garantir que um arquivo enviado não carregue script."
        >
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png"
            onChange={aoEscolherArquivo}
          />
        </Field>

        {marca.logoDataUri ? (
          <Checkbox
            id="removerLogo"
            name="removerLogo"
            checked={removerLogo}
            onCheckedChange={(v) => setRemoverLogo(v === true)}
            label="Remover o logotipo atual e voltar ao cabeçalho sem imagem."
          />
        ) : null}

        <fieldset className="border-2 border-[var(--border-brutal)] p-4">
          <legend className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Pré-visualização do PDF
          </legend>
          <div
            className="bg-[var(--surface-card)] p-4"
            data-testid="preview-marca"
          >
            <div
              className="flex items-center gap-3 border-b-[3px] pb-2"
              style={{ borderBottomColor: corDoPreview }}
            >
              {logoExibido ? (
                /* Pré-visualização local de um data:/blob: URI escolhido pelo
                   próprio usuário nesta tela. `next/image` otimiza recurso
                   remoto por URL — não há URL aqui, e o pipeline de otimização
                   nem alcança `blob:`. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoExibido}
                  alt="Pré-visualização do logotipo da clínica"
                  className="max-h-14 max-w-[180px] object-contain"
                />
              ) : null}
              <span
                className="font-display text-base font-bold"
                style={{ color: corDoPreview }}
              >
                {marca.nomeClinica}
              </span>
            </div>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Relatório de acompanhamento — corpo do documento
            </p>
            <p
              className="mt-6 border-t border-[var(--border-muted)] pt-2 text-xs text-[var(--text-secondary)]"
              data-testid="preview-selo-iris"
            >
              🔒 {SELO_IRIS}
            </p>
          </div>
        </fieldset>

        <Button
          type="submit"
          variante="primaria"
          disabled={Boolean(erroCor) || Boolean(avisoArquivo)}
        >
          Salvar marca
        </Button>
      </Form>
    </Stack>
  );
}
