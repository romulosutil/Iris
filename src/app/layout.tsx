import type { Metadata } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";
import { WebMCPProvider } from "@/components/webmcp-provider";
import { Clarity } from "@/components/clarity";
import { GoogleAnalytics } from "@/components/google-analytics";
import { ToastProvider } from "@/components/ui/toast";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Iris",
  description:
    "Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      data-mode="clinico"
      className={`${spaceGrotesk.variable} ${jakarta.variable}`}
    >
      <body>
        <GoogleAnalytics />
        <Clarity />
        <WebMCPProvider />
        <ToastProvider>{children}</ToastProvider>
        {process.env.NODE_ENV === "development" && (
          /* eslint-disable-next-line @next/next/no-sync-scripts */
          <script src="http://localhost:8400/live.js" />
        )}
      </body>
    </html>
  );
}

