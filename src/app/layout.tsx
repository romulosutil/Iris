import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { fontVariables } from "@/app/fonts";
import { WebMCPProvider } from "@/components/webmcp-provider";
import { Clarity } from "@/components/clarity";
import { GoogleAnalytics } from "@/components/google-analytics";
import { ToastProvider } from "@/components/ui/toast";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br",
  ),
  title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
  description:
    "Diário de sessão em linguagem natural, evidência clínica rastreável e aprovação humana item a item. Para TEA, TCC, Fonoaudiologia e Terapia Ocupacional.",
  openGraph: {
    title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
    description:
      "Diário de sessão em linguagem natural, evidência clínica rastreável e aprovação humana item a item. Para TEA, TCC, Fonoaudiologia e Terapia Ocupacional.",
    url: "/",
    siteName: "Iris Governança Clínica",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
    description:
      "Diário de sessão em linguagem natural, evidência clínica rastreável e aprovação humana item a item. Para TEA, TCC, Fonoaudiologia e Terapia Ocupacional.",
    images: ["/og-image.png"],
  },
};

/**
 * `viewport-fit=cover` é pré-requisito de `env(safe-area-inset-*)` (#185).
 * Sem ele, a Bottom Navigation Bar do app logado fica por baixo da barra de
 * gestos no Android e do indicador de home no iOS.
 *
 * `themeColor` pinta a barra de status quando o app roda instalado (PWA/TWA).
 * O valor tem de ser idêntico ao `theme_color` do `manifest.ts`.
 *
 * `maximumScale`/`userScalable` ficam de fora de propósito: travar zoom reprova
 * o WCAG 1.4.4 e é o atalho errado para esconder estouro horizontal.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2b705",
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
        <RegistrarServiceWorker />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
