import * as React from "react";
import { expect, test, describe } from "vitest";
import { render } from "@testing-library/react";
import { Logo } from "./logo";

describe("Logo component custom height and width", () => {
  test("calculates width proportionally when height is a number", () => {
    const { container } = render(<Logo variante="completo" altura={100} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("height")).toBe("100");
    // viewBox completo is "0 0 886 370"
    // Ratio: 886 / 370 = 2.39459
    // Width should be Math.round(2.39459 * 100) = 239
    expect(svg?.getAttribute("width")).toBe("239");
  });

  test("uses CSS string height and omits width attribute", () => {
    const { container } = render(<Logo variante="completo" altura="2rem" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("height")).toBe("2rem");
    expect(svg?.getAttribute("width")).toBeNull();
  });
});
