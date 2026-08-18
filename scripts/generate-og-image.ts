import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Iris Open Graph Image</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 1200px;
      height: 630px;
      background-color: #F8F9FA;
      background-image: 
        radial-gradient(#09090B 0.75px, transparent 0.75px),
        radial-gradient(#09090B 0.75px, #F8F9FA 0.75px);
      background-size: 30px 30px;
      background-position: 0 0, 15px 15px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      color: #09090B;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 48px;
      position: relative;
      overflow: hidden;
    }

    /* Outer brutalist frame border inside canvas */
    .outer-border {
      position: absolute;
      inset: 16px;
      border: 3.5px solid #09090B;
      pointer-events: none;
      box-shadow: inset 0 0 0 2px #FFFFFF;
    }

    /* Top Bar Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 2;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 38px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #09090B;
    }

    .badge-pill {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: #F2B705;
      color: #09090B;
      padding: 8px 16px;
      border: 2.5px solid #09090B;
      border-radius: 6px;
      box-shadow: 3px 3px 0px #09090B;
    }

    /* Main Headline Section */
    .main-content {
      margin-top: 10px;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tag-ia {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #6A4C93;
      background: #F1E9F6;
      border: 1.5px dashed #6A4C93;
      padding: 5px 12px;
      border-radius: 4px;
    }

    .tag-ia-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #6A4C93;
    }

    .headline {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 42px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #09090B;
      max-width: 1050px;
    }

    .headline-highlight {
      background: linear-gradient(120deg, #FFF6DB 0%, #F2B705 100%);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid #09090B;
      display: inline-block;
    }

    .subheadline {
      font-size: 20px;
      font-weight: 500;
      color: #4A4A52;
      line-height: 1.4;
      max-width: 980px;
    }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      z-index: 2;
      margin-top: 10px;
    }

    .card {
      background: #FFFFFF;
      border: 2.5px solid #09090B;
      border-radius: 8px;
      padding: 18px 20px;
      box-shadow: 4px 4px 0px #09090B;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .card-tag {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 3px;
      width: fit-content;
      text-transform: uppercase;
    }

    .tag-green {
      background: #ECFDF5;
      color: #059669;
      border: 1px solid #059669;
    }

    .tag-yellow {
      background: #FFF6DB;
      color: #947100;
      border: 1px solid #F2B705;
    }

    .tag-blue {
      background: #EFF6FF;
      color: #1D4ED8;
      border: 1px solid #2563EB;
    }

    .card-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: #09090B;
    }

    .card-desc {
      font-size: 13.5px;
      color: #52525B;
      line-height: 1.35;
    }

    /* Footer Bar */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 2;
      padding-top: 12px;
      border-top: 1.5px solid #E4E4E7;
    }

    .domain-badge {
      font-family: 'Space Mono', monospace;
      font-size: 18px;
      font-weight: 700;
      background: #09090B;
      color: #F2B705;
      padding: 6px 16px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .domain-dot {
      width: 8px;
      height: 8px;
      background: #F2B705;
      border-radius: 50%;
    }

    .footer-bullets {
      display: flex;
      align-items: center;
      gap: 24px;
      font-size: 14px;
      font-weight: 600;
      color: #71717A;
    }

    .bullet-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .bullet-check {
      color: #059669;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="outer-border"></div>

  <!-- Header -->
  <div class="header">
    <div class="brand-logo">
      <!-- Hex Icon -->
      <svg width="48" height="48" viewBox="0 0 311 370" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M310.575 89.6553V96.2715L317.748 100.414V279.725L162.461 369.381L7.17285 279.725V273.108L155.285 358.622L155.286 358.621L0 268.966V89.6553L155.287 0L310.575 89.6553ZM3 91.3867V267.233L155.287 355.158L307.575 267.233V91.3867L155.287 3.46289L3 91.3867ZM156.787 33.2646L281.018 104.989L282.518 105.854V252.768L281.018 253.633L156.787 325.357L155.287 326.224L153.787 325.357L29.5576 253.633L28.0576 252.768V105.854L29.5576 104.989L153.787 33.2646L155.287 32.3984L156.787 33.2646ZM155.286 35.8623L279.516 107.587V114.202L162.461 46.6211L38.2305 118.346V255.176L155.287 322.76L279.518 251.035V107.587L155.287 35.8623H155.286Z" fill="#F2B705"/>
        <path d="M269.059 180.716L267.022 184.245L269.571 188.664L214.351 284.308L103.91 284.308L48.6896 188.663L50.7267 185.135L103.395 276.36L103.398 276.359L48.1779 180.716L103.398 85.0716L213.839 85.0713L269.059 180.716ZM104.842 87.5707L51.0646 180.716L104.842 273.86L212.396 273.86L266.173 180.715L212.396 87.5713L104.842 87.5707ZM204.96 102.95L249.136 179.466L249.858 180.716L204.238 259.731L202.795 259.731L114.442 259.732L112.999 259.732L112.277 258.482L68.1001 181.965L67.3784 180.715L112.998 101.7L114.441 101.7L202.795 101.7L204.238 101.7L204.96 102.95ZM202.792 104.199L246.967 180.715L244.931 184.242L203.307 112.148L114.953 112.147L72.8154 185.132L114.442 257.232L202.795 257.232L246.971 180.716L202.795 104.2L202.792 104.199Z" fill="#B2DFDB"/>
        <path d="M160.679 234.696L159.077 233.772L157.072 234.929L113.663 209.867L113.663 159.743L157.071 134.681L158.674 135.607L160.679 134.449L204.087 159.511L204.087 209.634L160.679 234.696ZM202.088 160.666L160.679 136.759L119.272 160.666L119.271 208.48L160.679 232.387L202.087 208.48L202.088 160.666ZM196.406 206.355L161.679 226.404L160.678 226.981L123.953 205.777L123.952 204.622L123.952 164.523L123.953 163.369L124.952 162.791L159.679 142.742L160.679 142.165L197.405 163.368L197.406 164.523L197.406 204.622L197.406 205.777L196.406 206.355ZM195.406 187.674L195.405 204.621L160.679 224.671L159.078 223.746L191.798 204.855L191.798 164.756L158.673 145.632L125.953 164.524L125.952 204.622L160.679 224.671L195.406 204.622L195.406 187.674Z" fill="#90CAF9"/>
      </svg>
      <span class="brand-title">Iris</span>
    </div>
    <div class="badge-pill">GOVERNANÇA CLÍNICA TEA</div>
  </div>

  <!-- Main Headline -->
  <div class="main-content">
    <div class="tag-ia">
      <span class="tag-ia-dot"></span>
      DIÁRIO DE SESSÃO COM IA & DECISÃO HUMANA
    </div>
    <h1 class="headline">
      Troque a planilha por diário em texto livre + <span class="headline-highlight">IA que organiza evidências</span>
    </h1>
    <p class="subheadline">
      Sua equipe escreve a evolução naturalmente. O Iris extrai e vincula evidências diretamente às metas do PEI com rastreabilidade frase-a-frase.
    </p>
  </div>

  <!-- Feature Cards -->
  <div class="cards-grid">
    <div class="card">
      <span class="card-tag tag-green">✓ Fato Aprovado</span>
      <h3 class="card-title">Texto Livre Sem Fricção</h3>
      <p class="card-desc">Sem clicar em 50 checkboxes. A equipe digita o diário em 2 minutos.</p>
    </div>
    <div class="card">
      <span class="card-tag tag-yellow">🎯 Evidência PEI</span>
      <h3 class="card-title">Rastreabilidade Total</h3>
      <p class="card-desc">Toda meta tem frases do diário anexadas como prova clínica auditável.</p>
    </div>
    <div class="card">
      <span class="card-tag tag-blue">📊 10 Protocolos</span>
      <h3 class="card-title">VB-MAPP, Denver & Mais</h3>
      <p class="card-desc">ABLLS-R, PROC, MBGR e relatórios prontos para convênios e famílias.</p>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="domain-badge">
      <span class="domain-dot"></span>
      irisclinica.ia.br
    </div>
    <div class="footer-bullets">
      <span class="bullet-item"><span class="bullet-check">✓</span> Equipe Ilimitada</span>
      <span class="bullet-item"><span class="bullet-check">✓</span> Conforme LGPD</span>
      <span class="bullet-item"><span class="bullet-check">✓</span> 3 Camadas de Governança</span>
    </div>
  </div>
</body>
</html>`;

async function generate() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2, // Retinal crisp rendering
  });

  await page.setContent(htmlContent, { waitUntil: "networkidle" });
  // Wait for Google Fonts to load
  await page.evaluate(() => document.fonts.ready);

  const publicOgPath = path.join(process.cwd(), "public", "og-image.png");
  const appOgPath = path.join(
    process.cwd(),
    "src",
    "app",
    "opengraph-image.png",
  );

  await page.screenshot({ path: publicOgPath, type: "png" });
  await page.screenshot({ path: appOgPath, type: "png" });

  console.log("OG Images successfully generated at:");
  console.log(" - " + publicOgPath);
  console.log(" - " + appOgPath);

  await browser.close();
}

generate().catch(console.error);
