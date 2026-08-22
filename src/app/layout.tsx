import type { Metadata } from "next";
import "@/styles/globals.css";
import { fontVariables } from "@/app/fonts";
import { WebMCPProvider } from "@/components/webmcp-provider";
import { Clarity } from "@/components/clarity";
import { GoogleAnalytics } from "@/components/google-analytics";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br",
  ),
  title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
  description:
    "Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.",
  openGraph: {
    title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
    description:
      "Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.",
    url: "/",
    siteName: "Iris Governança Clínica",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
    description:
      "Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-mode="clinico" className={fontVariables}>
      <body>
        <GoogleAnalytics />
        <Clarity />
        <WebMCPProvider />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
