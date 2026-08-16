import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { fontVariables } from "@/app/fonts";
import { WebMCPProvider } from "@/components/webmcp-provider";
import { Clarity } from "@/components/clarity";
import { GoogleAnalytics } from "@/components/google-analytics";
import { ToastProvider } from "@/components/ui/toast";
import { SWRegister } from "@/components/app/sw-register";

export const metadata: Metadata = {
  title: "Iris — Governança Clínica Infantil",
  description:
    "Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#6A4C93",
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
        <SWRegister />
        {process.env.NODE_ENV === "development" && (
          /* eslint-disable-next-line @next/next/no-sync-scripts */
          <script src="http://localhost:8400/live.js" />
        )}
      </body>
    </html>
  );
}
