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
  title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
  description:
    "Sua equipe escreve o diário da sessão em texto livre; o Iris organiza em evidência clínica rastreável, com a frase de origem anexa. Para TEA (VB-MAPP, ABLLS-R, Denver, PROC, MBGR), TCC, Fonoaudiologia e Terapia Ocupacional. Conta grátis, equipe ilimitada, cobrança por ficha ativa.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br",
  ),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
    description:
      "Sua equipe escreve o diário da sessão em texto livre; o Iris organiza em evidência clínica rastreável até a frase de origem. Aprovação humana item a item.",
    url: "/",
    siteName: "Iris Governança Clínica",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris Governança Clínica — governança clínica para terapia multidisciplinar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iris — Governança clínica para clínicas de terapia multidisciplinar",
    description:
      "Transforme diários de sessão em evidências clínicas rastreáveis. Relatórios para convênios e famílias em minutos.",
    images: ["/og-image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Iris",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description:
    "Software de governança clínica para clínicas de terapia e saúde mental multidisciplinar: diário de sessão em linguagem natural com extração de evidência clínica rastreável e aprovação humana item a item.",
  offers: {
    "@type": "Offer",
    priceCurrency: "BRL",
    price: "25.00",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      priceCurrency: "BRL",
      price: "25.00",
      unitText: "ficha ativa/mês, faixa marginal regressiva (39/32/25)",
    },
  },
};

export default function InstitutionalLandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-app,#FBF9F5)] text-[var(--text-primary,#1A1A1A)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
