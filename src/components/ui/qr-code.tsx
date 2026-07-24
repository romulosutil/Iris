"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * QR Code Component confiável para exibição da URI otpauth:// do TOTP.
 *
 * Renderização 100% local (client-side, offline) via qrcode.react. A URI
 * otpauth:// contém o segredo do MFA e NUNCA deve ser transmitida a serviços
 * externos de geração de QR Code — a codificação ocorre inteiramente no
 * navegador.
 */

interface QrCodeProps {
  /** Conteúdo a ser codificado (ex: URI otpauth://totp/...) */
  value: string;
  /** Tamanho em pixels (ex: 180) */
  size?: number;
  /** Rótulo acessível */
  alt?: string;
  className?: string;
}

export function QrCode({
  value,
  size = 180,
  alt = "QR Code para configuração de MFA",
  className,
}: QrCodeProps) {
  if (!value) {
    return (
      <div
        className="flex size-44 items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-muted)] p-4 text-center text-xs font-semibold text-[var(--text-secondary)]"
        style={{ width: size, height: size }}
      >
        QR Code indisponível. Use a Chave Manual abaixo.
      </div>
    );
  }

  return (
    <div
      className={`inline-block rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-white p-3 shadow-[var(--ds-shadow-sm)] ${className ?? ""}`}
      style={{ width: size + 24, height: size + 24 }}
    >
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        role="img"
        aria-label={alt}
        className="block size-full"
      />
    </div>
  );
}
