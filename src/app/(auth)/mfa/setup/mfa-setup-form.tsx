"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/ui/logo";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { QrCode } from "@/components/ui/qr-code";
import { cn } from "@/lib/cn";

/**
 * Ícones auxiliares leves para usabilidade e segurança
 */
function CopyIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckMarkIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function DownloadIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function EyeIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function AlertIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ShieldLockIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <rect x="9" y="11" width="6" height="5" rx="1" />
    </svg>
  );
}

/**
 * Cadastro de MFA (TOTP + códigos de backup) com fluxo vertical sequencial elegante
 */
export function MfaSetupForm() {
  const router = useRouter();
  const [etapa, setEtapa] = React.useState<"senha" | "ativar">("senha");
  const [erro, setErro] = React.useState<string | undefined>();
  const [enviando, setEnviando] = React.useState(false);
  const [segredo, setSegredo] = React.useState("");
  const [totpURI, setTotpURI] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);

  // Estados de usabilidade e segurança
  const [modoEntrada, setModoEntrada] = React.useState<"qr" | "manual">("qr");
  const [mostrarSegredo, setMostrarSegredo] = React.useState(false);
  const [mostrarBackup, setMostrarBackup] = React.useState(false);
  const [confirmouBackup, setConfirmouBackup] = React.useState(false);
  const [copiouSegredo, setCopiouSegredo] = React.useState(false);
  const [copiouBackup, setCopiouBackup] = React.useState(false);
  const [falhaCopiaSegredo, setFalhaCopiaSegredo] = React.useState(false);
  const [falhaCopiaBackup, setFalhaCopiaBackup] = React.useState(false);

  function iniciar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setErro(undefined);
    setEnviando(true);
    void (async () => {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data) {
        setErro("Senha inválida ou não foi possível iniciar o cadastro.");
        setEnviando(false);
        return;
      }
      let secret = "";
      try {
        secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
      } catch {
        secret = "";
      }
      setSegredo(secret);
      setTotpURI(data.totpURI ?? "");
      setBackupCodes(data.backupCodes ?? []);
      setEtapa("ativar");
      setEnviando(false);
    })();
  }

  function ativar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando || !confirmouBackup) return;
    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).replace(/\s+/g, "");
    setErro(undefined);
    setEnviando(true);
    void (async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setErro(
          "Código incorreto ou expirado. Verifique o horário do celular e digite o novo código gerado.",
        );
        setEnviando(false);
        return;
      }
      router.push("/");
    })();
  }

  async function copiarParaTransferencia(
    texto: string,
    tipo: "segredo" | "backup",
  ) {
    try {
      await navigator.clipboard.writeText(texto);
      if (tipo === "segredo") {
        setFalhaCopiaSegredo(false);
        setCopiouSegredo(true);
        setTimeout(() => setCopiouSegredo(false), 2500);
      } else {
        setFalhaCopiaBackup(false);
        setCopiouBackup(true);
        setTimeout(() => setCopiouBackup(false), 2500);
      }
    } catch {
      // Área de transferência indisponível (navegador restrito, sem HTTPS,
      // permissão negada). Sinaliza a falha para o usuário não achar que
      // a cópia funcionou — a chave/códigos seguem visíveis para cópia manual.
      if (tipo === "segredo") {
        setCopiouSegredo(false);
        setFalhaCopiaSegredo(true);
        setTimeout(() => setFalhaCopiaSegredo(false), 4000);
      } else {
        setCopiouBackup(false);
        setFalhaCopiaBackup(true);
        setTimeout(() => setFalhaCopiaBackup(false), 4000);
      }
    }
  }

  function baixarBackupTxt() {
    const conteudo = [
      "==============================================",
      "IRIS CLINICAL - CÓDIGOS DE RECUPERAÇÃO (MFA)",
      "==============================================",
      "Guarde este arquivo em local seguro (ex: Gerenciador de Senhas).",
      "Cada código abaixo só pode ser utilizado UMA ÚNICA VEZ.\n",
      ...backupCodes.map((c, i) => `${i + 1}. ${c}`),
      "\nData de geração: " + new Date().toLocaleDateString("pt-BR"),
      "==============================================",
    ].join("\n");

    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "iris-codigos-de-backup.txt";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 150);
  }

  const segredoFormatado = React.useMemo(() => {
    if (!segredo) return "—";
    return segredo.match(/.{1,4}/g)?.join(" ") ?? segredo;
  }, [segredo]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 transition-all duration-300 ease-in-out",
        etapa === "senha" ? "max-w-md" : "max-w-xl",
      )}
    >
      {/* Cabeçalho */}
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">
          Configurar Verificação em Duas Etapas (MFA)
        </h1>
        <p className="max-w-lg text-sm text-[var(--text-secondary)]">
          {etapa === "senha"
            ? "Para sua segurança clínica, confirme sua senha atual antes de gerar a chave e o QR Code de autenticação."
            : "Siga os 3 passos abaixo para ativar a proteção de segundo fator na sua conta."}
        </p>
      </div>

      {/* Cartão Princpal */}
      <div className="rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)] md:p-8">
        {etapa === "senha" ? (
          /* PASSO INICIAL: Confirmação de Senha */
          <Form onSubmit={iniciar} error={erro} className="w-full">
            <div className="mb-4 flex flex-col gap-3 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border-2 border-[var(--border-brutal)] bg-[var(--surface-muted)]">
                <ShieldLockIcon className="size-6 text-[var(--action-primary-fg)]" />
              </div>
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                Autenticação por Senha
              </h2>
            </div>

            <Field label="Sua senha atual" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                aria-invalid={erro ? true : undefined}
              />
            </Field>

            <Button type="submit" disabled={enviando} className="mt-2 w-full">
              {enviando ? "Verificando senha…" : "Confirmar e Gerar Chave"}
            </Button>
          </Form>
        ) : (
          /* PASSO DE ATIVAÇÃO: Fluxo Vertical Sequencial (1 -> 2 -> 3) */
          <Form
            onSubmit={ativar}
            error={erro}
            className="flex w-full flex-col gap-6"
          >
            {/* PASSO 1: Configurar no Aplicativo */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] font-mono text-sm font-bold text-[var(--action-primary-fg)]">
                  1
                </span>
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                  Configurar no Aplicativo Autenticador
                </h2>
              </div>

              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Abra seu aplicativo de autenticação no celular (
                <strong>Google Authenticator</strong>,{" "}
                <strong>Microsoft Authenticator</strong>, <strong>Authy</strong>{" "}
                ou <strong>1Password</strong>).
              </p>

              {/* Box de Cadastro (Alternador QR / Manual) */}
              <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-muted)] p-4 md:p-5">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border-brutal)] pb-3">
                  <span className="text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
                    Modo de Adição
                  </span>
                  <div className="flex gap-1 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-white p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setModoEntrada("qr")}
                      className={`rounded-[calc(var(--radius-control)-2px)] px-3 py-1 transition-all ${
                        modoEntrada === "qr"
                          ? "bg-[var(--action-primary)] font-bold text-[var(--action-primary-fg)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Escanear QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoEntrada("manual")}
                      className={`rounded-[calc(var(--radius-control)-2px)] px-3 py-1 transition-all ${
                        modoEntrada === "manual"
                          ? "bg-[var(--action-primary)] font-bold text-[var(--action-primary-fg)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Chave Manual
                    </button>
                  </div>
                </div>

                {modoEntrada === "qr" ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-1 text-center">
                    {totpURI ? (
                      <QrCode
                        value={totpURI}
                        size={180}
                        alt="QR Code para escaneamento"
                      />
                    ) : (
                      <div className="text-xs text-[var(--text-secondary)]">
                        Gerando QR Code…
                      </div>
                    )}
                    <p className="max-w-xs text-xs text-[var(--text-secondary)]">
                      No app do celular, toque em <strong>&quot;+&quot;</strong>{" "}
                      e selecione{" "}
                      <strong>&quot;Escanear código QR&quot;</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Copie esta chave e insira manualmente no seu aplicativo
                      autenticador:
                    </p>

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-white p-3 font-mono text-sm break-all">
                        <span
                          className={
                            mostrarSegredo
                              ? "font-bold tracking-wide text-[var(--text-primary)]"
                              : "tracking-widest text-[var(--text-secondary)]"
                          }
                        >
                          {mostrarSegredo
                            ? segredoFormatado
                            : "•••• •••• •••• •••• •••• ••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMostrarSegredo(!mostrarSegredo)}
                          className="shrink-0 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          title={
                            mostrarSegredo ? "Ocultar chave" : "Exibir chave"
                          }
                        >
                          {mostrarSegredo ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>

                      <Button
                        type="button"
                        variante="neutra"
                        onClick={() =>
                          copiarParaTransferencia(segredo, "segredo")
                        }
                        className={cn(
                          "flex w-full items-center justify-center gap-2 text-xs",
                          falhaCopiaSegredo &&
                            "border-[var(--status-error-fg)] text-[var(--status-error-fg)]",
                        )}
                      >
                        {copiouSegredo ? (
                          <CheckMarkIcon className="size-4 text-emerald-600" />
                        ) : falhaCopiaSegredo ? (
                          <AlertIcon className="size-4" />
                        ) : (
                          <CopyIcon className="size-4" />
                        )}
                        {copiouSegredo
                          ? "Chave Copiada para a Área de Transferência!"
                          : falhaCopiaSegredo
                            ? "Falha ao copiar. Selecione e copie manualmente."
                            : "Copiar Chave Manual"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion para Iniciantes */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="duvidas">
                  <AccordionTrigger className="text-xs font-semibold">
                    Primeira vez usando um app autenticador?
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    <p>
                      1. Baixe o <strong>Google Authenticator</strong>{" "}
                      gratuitamente na Google Play ou App Store do seu celular.
                    </p>
                    <p>
                      2. Abra o app, toque no ícone <strong>+</strong> e escolha{" "}
                      <strong>Escanear código QR</strong>.
                    </p>
                    <p>
                      3. Aponte a câmera do celular para a tela. O app exibirá
                      um código de 6 dígitos que muda a cada 30 segundos.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Linha Divisória */}
            <div className="my-1 h-0.5 w-full bg-[var(--border-brutal)]" />

            {/* PASSO 2: Códigos de Recuperação */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] font-mono text-sm font-bold text-[var(--action-primary-fg)]">
                  2
                </span>
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                  Guardar Códigos de Recuperação
                </h2>
              </div>

              <Alert
                severidade="warning"
                titulo="Guarde estes códigos em local seguro"
                destacado
              >
                <p className="mb-3 text-xs leading-relaxed">
                  Estes códigos são exibidos <strong>uma única vez</strong>. Use
                  um deles para acessar a conta caso perca ou troque seu
                  celular.
                </p>

                {/* Alternar Visibilidade dos Códigos */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setMostrarBackup(!mostrarBackup)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] underline hover:opacity-80"
                  >
                    {mostrarBackup ? (
                      <EyeOffIcon className="size-3.5" />
                    ) : (
                      <EyeIcon className="size-3.5" />
                    )}
                    {mostrarBackup
                      ? "Ocultar códigos por segurança"
                      : "Exibir códigos de recuperação"}
                  </button>
                </div>

                {/* Grade de Códigos */}
                <div className="relative mb-3">
                  <ul
                    className={`grid grid-cols-2 gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-brutal)] bg-white p-3 font-mono text-xs transition-all sm:grid-cols-2 ${
                      !mostrarBackup ? "blur-xs select-none" : ""
                    }`}
                  >
                    {backupCodes.map((c) => (
                      <li
                        key={c}
                        className="rounded bg-[var(--surface-muted)] p-1.5 text-center font-bold tracking-wider"
                      >
                        {mostrarBackup ? c : "••••••••"}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Ações: Copiar Todos + Baixar .txt */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variante="neutra"
                    onClick={() =>
                      copiarParaTransferencia(backupCodes.join("\n"), "backup")
                    }
                    className={cn(
                      "flex h-auto items-center justify-center gap-1.5 py-1.5 text-xs",
                      falhaCopiaBackup &&
                        "border-[var(--status-error-fg)] text-[var(--status-error-fg)]",
                    )}
                  >
                    {copiouBackup ? (
                      <CheckMarkIcon className="size-3.5 text-emerald-600" />
                    ) : falhaCopiaBackup ? (
                      <AlertIcon className="size-3.5" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                    {copiouBackup
                      ? "Copiados!"
                      : falhaCopiaBackup
                        ? "Falha ao copiar"
                        : "Copiar Todos"}
                  </Button>

                  <Button
                    type="button"
                    variante="neutra"
                    onClick={baixarBackupTxt}
                    className="flex h-auto items-center justify-center gap-1.5 py-1.5 text-xs"
                  >
                    <DownloadIcon className="size-3.5" />
                    Baixar .txt
                  </Button>
                </div>
              </Alert>

              {/* Checkbox Obrigatório */}
              <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-muted)] p-3">
                <Checkbox
                  id="confirm-backup"
                  checked={confirmouBackup}
                  onCheckedChange={(val) => setConfirmouBackup(Boolean(val))}
                  label={
                    <span className="text-xs leading-tight font-semibold">
                      Confirmo que salvei ou baixei meus códigos de recuperação
                      em um local seguro.
                    </span>
                  }
                />
              </div>
            </div>

            {/* Linha Divisória */}
            <div className="my-1 h-0.5 w-full bg-[var(--border-brutal)]" />

            {/* PASSO 3: Validar e Concluir */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] font-mono text-sm font-bold text-[var(--action-primary-fg)]">
                  3
                </span>
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                  Validar Código do App e Concluir
                </h2>
              </div>

              <Field
                label="Digite o código de 6 dígitos gerado pelo seu app"
                htmlFor="code"
              >
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  placeholder="000 000"
                  maxLength={7}
                  required
                  className="text-center font-mono text-xl font-bold tracking-[0.3em]"
                  aria-invalid={erro ? true : undefined}
                />
              </Field>

              <Button
                type="submit"
                disabled={enviando || !confirmouBackup}
                className="mt-1 w-full"
              >
                {enviando ? "Ativando MFA…" : "Ativar MFA"}
              </Button>

              {!confirmouBackup && (
                <p className="text-center text-[11px] text-[var(--text-secondary)] italic">
                  * Marque a confirmação no Passo 2 para liberar o botão Ativar.
                </p>
              )}
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}
