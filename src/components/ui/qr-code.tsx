"use client";

import * as React from "react";

/**
 * QR Code Component confiável para exibição da URI otpauth:// do TOTP.
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
  const [error, setError] = React.useState(false);

  const qrUrl = React.useMemo(() => {
    if (!value) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  }, [value, size]);

  if (error || !value || !qrUrl) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrUrl}
        width={size}
        height={size}
        alt={alt}
        onError={() => setError(true)}
        className="block size-full"
      />
    </div>
  );
}
