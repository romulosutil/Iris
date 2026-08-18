import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/header";
import { LandingHeroSection } from "@/components/landing/hero-section";
import { LandingProtocolShowcase } from "@/components/landing/protocol-showcase";
import { LandingInsuranceReports } from "@/components/landing/insurance-reports";
import { LandingBentoGrid } from "@/components/landing/bento-grid";
import { LandingComparativeMatrix } from "@/components/landing/comparative-matrix";
import { LandingRoiCalculator } from "@/components/landing/roi-calculator";
import { LandingTrustBar } from "@/components/landing/trust-bar";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
  description:
    "Sua equipe escreve o diário da sessão em texto livre; o Iris organiza em evidência ligada às metas do PEI, com a frase de origem anexa. 10 protocolos mapeados (VB-MAPP, ABLLS-R, Denver, PROC, MBGR e outros). Conta grátis, equipe ilimitada, cobrança por ficha ativa.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br",
  ),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
    description:
      "Sua equipe escreve o diário da sessão em texto livre; o Iris organiza em evidência ligada às metas do PEI, com a frase de origem anexa. 10 protocolos mapeados.",
    url: "/",
    siteName: "Iris Governança Clínica",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris Governança Clínica — Prontuário para clínicas de terapia infantil (TEA)",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iris — Prontuário para clínicas de terapia infantil (TEA)",
    description:
      "Transforme diários de sessão em evidências rastreáveis do PEI. Relatórios para convênios e famílias em minutos.",
    images: ["/og-image.png"],
  },
};

export default function InstitutionalLandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-app,#FBF9F5)] text-[var(--text-primary,#1A1A1A)]">
      <LandingHeader />
      <main className="flex-grow">
        <LandingHeroSection />
        <LandingBentoGrid />
        <LandingProtocolShowcase />
        <LandingInsuranceReports />
        <LandingComparativeMatrix />
        <LandingRoiCalculator />
        <LandingTrustBar />
      </main>
      <LandingFooter />
    </div>
  );
}
