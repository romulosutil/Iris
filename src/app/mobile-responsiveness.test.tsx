import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({
    className: "font-space",
    variable: "--font-space-grotesk",
  }),
  Plus_Jakarta_Sans: () => ({
    className: "font-jakarta",
    variable: "--font-jakarta",
  }),
}));

import { Header } from "@/components/ui/header";

describe("Mobile Responsiveness & Touch Targets", () => {
  it("defines viewport metadata with correct scale boundaries in app layout", async () => {
    const layout = await import("@/app/layout");
    expect(layout.viewport).toBeDefined();
    expect(layout.viewport.width).toBe("device-width");
    expect(layout.viewport.initialScale).toBe(1);
    expect(layout.viewport.themeColor).toBe("#6A4C93");
  });

  it("renders mobile navigation toggle button with minimum 44px touch target (min-h-11 min-w-11)", () => {
    render(
      <Header
        clinicaAtivaNome="Clínica Teste"
        itemsNav={[{ href: "/agenda", label: "Agenda" }]}
      />,
    );
    const toggleBtn = screen.getByRole("button", { name: /abrir menu/i });
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.className).toContain("min-w-11");
    expect(toggleBtn.className).toContain("min-h-11");
  });
});
