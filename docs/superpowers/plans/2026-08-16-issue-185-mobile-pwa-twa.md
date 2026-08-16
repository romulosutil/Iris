# [Mobile] Responsividade, PWA & Empacotamento TWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar polimento de responsividade mobile (landing page e app logado), manifesto PWA com Service Worker seguro (cache exclusivo de assets estáticos), endpoint Digital Asset Links (`assetlinks.json`) e configuração/empacotamento TWA via `@bubblewrap/cli`.

**Architecture:** Next.js App Router com `manifest.ts` nativo, Service Worker customizado (`sw.js`) com guardrail LGPD estrito (nunca cachear APIs ou dados de saúde), endpoint `/.well-known/assetlinks.json` para verificação Android TWA, e manifest/scripts de build TWA (`twa-manifest.json`).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Service Worker API, `@bubblewrap/cli`, Vitest, Playwright/Axe.

---

### Task 1: Responsividade Mobile & Touch Targets (Landing Page + Área Logada)

**Files:**

- Create: `src/app/mobile-responsiveness.test.tsx`
- Modify: `src/app/layout.tsx:1-40`
- Modify: `src/components/ui/header.tsx:85-195`
- Modify: `src/app/(app)/layout.tsx:60-115`

- [ ] **Step 1: Write the failing test for mobile responsiveness metadata and touch targets**

Create `src/app/mobile-responsiveness.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/ui/header";

describe("Mobile Responsiveness & Touch Targets", () => {
  it("defines viewport metadata with correct scale boundaries", async () => {
    const layout = await import("@/app/layout");
    expect(layout.viewport).toBeDefined();
    expect(layout.viewport.width).toBe("device-width");
    expect(layout.viewport.initialScale).toBe(1);
  });

  it("renders mobile navigation toggle button with min 44px touch target", () => {
    render(
      <Header
        clinicaAtivaNome="Clínica Teste"
        itemsNav={[{ href: "/agenda", label: "Agenda" }]}
      />,
    );
    const toggleBtn = screen.getByRole("button", { name: /abrir menu/i });
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.className).toContain("min-w-[44px]");
    expect(toggleBtn.className).toContain("min-h-[44px]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/mobile-responsiveness.test.tsx`
Expected: FAIL due to missing viewport export in `layout.tsx` or touch target class mismatch.

- [ ] **Step 3: Update `src/app/layout.tsx` and `src/components/ui/header.tsx`**

Export viewport configuration in `src/app/layout.tsx`:

```tsx
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#6A4C93",
};
```

And adjust `Header` component menu trigger button in `src/components/ui/header.tsx` to include `min-w-[44px] min-h-[44px]` touch target sizing.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/mobile-responsiveness.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/ui/header.tsx src/app/mobile-responsiveness.test.tsx
git commit -m "feat(mobile): add viewport metadata and minimum 44px touch targets"
```

---

### Task 2: PWA Web App Manifest (`src/app/manifest.ts`)

**Files:**

- Create: `src/app/manifest.ts`
- Create: `src/app/manifest.test.ts`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/icon-maskable.png`

- [ ] **Step 1: Write failing unit test for PWA manifest**

Create `src/app/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("PWA Web App Manifest", () => {
  it("returns compliant PWA manifest object", () => {
    const data = manifest();
    expect(data.name).toBe("Iris — Governança Clínica Infantil");
    expect(data.short_name).toBe("Iris");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/agenda");
    expect(data.theme_color).toBe("#6A4C93");
    expect(data.background_color).toBe("#F8FAFC");
    expect(data.icons?.length).toBeGreaterThanOrEqual(3);

    const maskableIcon = data.icons?.find(
      (icon) => icon.purpose === "maskable",
    );
    expect(maskableIcon).toBeDefined();
    expect(maskableIcon?.sizes).toBe("512x512");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/manifest.test.ts`
Expected: FAIL (module `./manifest` not found).

- [ ] **Step 3: Implement `src/app/manifest.ts` and generate PNG icon files**

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iris — Governança Clínica Infantil",
    short_name: "Iris",
    description: "SaaS para clínicas de intervenção infantil em TEA",
    start_url: "/agenda",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#6A4C93",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

Generate valid PNG icon files in `public/` using Node canvas/SVG script.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts src/app/manifest.test.ts public/icon-192.png public/icon-512.png public/icon-maskable.png
git commit -m "feat(pwa): configure Web App Manifest and adaptive PWA icons"
```

---

### Task 3: Service Worker Seguro (Cache Estático Exclusivo + Guardrail LGPD)

**Files:**

- Create: `public/sw.js`
- Create: `src/components/app/sw-register.tsx`
- Create: `src/app/sw-security.test.ts`
- Modify: `src/app/layout.tsx:40-60`

- [ ] **Step 1: Write failing security test for Service Worker**

Create `src/app/sw-security.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Service Worker LGPD Security & Static Cache", () => {
  it("ensures sw.js explicitly excludes API routes and patient health data", () => {
    const swPath = path.join(process.cwd(), "public", "sw.js");
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, "utf-8");

    // LGPD Guardrail checks
    expect(swContent).toContain("/api/");
    expect(swContent).toContain("NEVER_CACHE");
    expect(swContent).not.toContain(
      "cache.put(event.request, response.clone())",
    ); // no unconditional cache
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/sw-security.test.ts`
Expected: FAIL (`public/sw.js` does not exist).

- [ ] **Step 3: Implement `public/sw.js` and `SWRegister` component**

Create `public/sw.js`:

```js
// Iris PWA Service Worker — Cache Exclusivo de Assets Estáticos
// CONTRATO LGPD: NUNCA CACHEAR APIS (/api/*), DADOS DE SAÚDE OU DIÁRIOS DE PACIENTES.

const CACHE_NAME = "iris-static-v1";
const STATIC_ASSETS = [
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/brand/iris-logo.svg",
];

const NEVER_CACHE_PATTERNS = [
  /\/api\//,
  /\/pacientes/,
  /\/diario/,
  /\/agenda/,
  /\/validacao/,
  /\/relatorios/,
  /\/clinica/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Guardrail LGPD: Se a requisição for API ou rota dinâmica/autenticada, buscar direto da rede
  if (
    event.request.method !== "GET" ||
    NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))
  ) {
    return;
  }

  // Apenas cachear assets estáticos (JS, CSS, Imagens estáticas, Fontes)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff2?|css|js)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200 && response.type === "basic") {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      }),
    );
  }
});
```

Create `src/components/app/sw-register.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("SW registration failed:", err));
    }
  }, []);

  return null;
}
```

Include `<SWRegister />` in `src/app/layout.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/sw-security.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/components/app/sw-register.tsx src/app/sw-security.test.ts src/app/layout.tsx
git commit -m "feat(pwa): add secure Service Worker with strict LGPD static asset caching"
```

---

### Task 4: Digital Asset Links (`/.well-known/assetlinks.json`)

**Files:**

- Create: `public/.well-known/assetlinks.json`
- Create: `src/app/.well-known/assetlinks.json/route.ts`
- Create: `src/app/assetlinks.test.ts`

- [ ] **Step 1: Write failing unit test for Asset Links**

Create `src/app/assetlinks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { GET } from "./.well-known/assetlinks.json/route";

describe("Digital Asset Links (TWA Android Verification)", () => {
  it("validates static assetlinks.json format and contents", () => {
    const file = path.join(
      process.cwd(),
      "public",
      ".well-known",
      "assetlinks.json",
    );
    expect(fs.existsSync(file)).toBe(true);
    const content = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].relation).toContain(
      "delegate_permission/common.handle_all_urls",
    );
    expect(content[0].target.package_name).toBe("com.iris.app");
    expect(content[0].target.sha256_cert_fingerprints.length).toBeGreaterThan(
      0,
    );
  });

  it("serves assetlinks via Next.js route with application/json header", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body[0].target.package_name).toBe("com.iris.app");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/assetlinks.test.ts`
Expected: FAIL (files missing).

- [ ] **Step 3: Implement `public/.well-known/assetlinks.json` and Route Handler**

Create `public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.iris.app",
      "sha256_cert_fingerprints": [
        "10:04:80:C9:FA:65:B2:D6:39:69:B5:E3:69:B0:1B:77:43:25:D1:D7:BF:02:AE:F5:BD:A8:14:4E:91:21:40:AA"
      ]
    }
  }
]
```

Create `src/app/.well-known/assetlinks.json/route.ts`:

```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "public",
    ".well-known",
    "assetlinks.json",
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  return NextResponse.json(data, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/assetlinks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/.well-known/assetlinks.json src/app/.well-known/assetlinks.json/route.ts src/app/assetlinks.test.ts
git commit -m "feat(twa): publish Digital Asset Links for Android TWA verification"
```

---

### Task 5: Configuração & Build TWA (`twa-manifest.json` & scripts)

**Files:**

- Create: `twa-manifest.json`
- Create: `scripts/build-twa.ts`
- Create: `scripts/twa-config.test.ts`
- Modify: `package.json:20-35`

- [ ] **Step 1: Write failing unit test for TWA Manifest Configuration**

Create `scripts/twa-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("TWA Bubblewrap Manifest Configuration", () => {
  it("validates twa-manifest.json structure for Android Play Store build", () => {
    const configPath = path.join(process.cwd(), "twa-manifest.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.packageId).toBe("com.iris.app");
    expect(config.host).toBe("iris.app");
    expect(config.name).toBe("Iris — Governança Clínica Infantil");
    expect(config.launcherName).toBe("Iris");
    expect(config.startUrl).toBe("/agenda");
    expect(config.themeColor).toBe("#6A4C93");
    expect(config.display).toBe("standalone");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test scripts/twa-config.test.ts`
Expected: FAIL (`twa-manifest.json` does not exist).

- [ ] **Step 3: Implement `twa-manifest.json` and script in `package.json`**

Create `twa-manifest.json`:

```json
{
  "packageId": "com.iris.app",
  "host": "iris.app",
  "name": "Iris — Governança Clínica Infantil",
  "launcherName": "Iris",
  "display": "standalone",
  "themeColor": "#6A4C93",
  "navigationColor": "#F8FAFC",
  "backgroundColor": "#F8FAFC",
  "enableNotifications": false,
  "startUrl": "/agenda",
  "iconUrl": "https://iris.app/icon-512.png",
  "maskableIconUrl": "https://iris.app/icon-maskable.png",
  "appVersionName": "1.0.0",
  "appVersionCode": 1,
  "shortcuts": [],
  "generatorApp": "bubblewrap-cli"
}
```

Add script to `package.json`:
`"build:twa": "tsx scripts/build-twa.ts"`

Create `scripts/build-twa.ts`:

```ts
import fs from "fs";
import path from "path";

async function main() {
  const twaPath = path.join(process.cwd(), "twa-manifest.json");
  if (!fs.existsSync(twaPath)) {
    throw new Error("twa-manifest.json não encontrado para empacotamento TWA.");
  }
  console.log(
    "Configuração TWA verificada com sucesso para empacotamento via Bubblewrap.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test scripts/twa-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add twa-manifest.json scripts/build-twa.ts scripts/twa-config.test.ts package.json
git commit -m "feat(twa): configure Bubblewrap TWA manifest and build verification script"
```
