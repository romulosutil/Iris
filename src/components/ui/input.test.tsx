import * as React from "react";
import { expect, test, describe } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Input } from "./input";

describe("Input component click focus handler", () => {
  test("focuses input when wrapper is clicked", () => {
    const { container } = render(<Input placeholder="Test focus" />);
    const wrapper = container.querySelector(".flex-1");
    const input = container.querySelector("input");
    expect(wrapper).not.toBeNull();
    expect(input).not.toBeNull();

    // Focus input by clicking wrapper
    fireEvent.click(wrapper!);
    expect(document.activeElement).toBe(input);
  });

  test("does not focus input when native button or role='button' element is clicked inside wrapper", () => {
    const { container } = render(
      <Input
        placeholder="Test focus"
        suffixIcon={
          <div className="pointer-events-auto">
            <button data-testid="native-btn">Click</button>
            <div role="button" data-testid="custom-btn">
              Click Custom
            </div>
          </div>
        }
      />,
    );
    const wrapper = container.querySelector(".flex-1");
    const input = container.querySelector("input");
    const nativeBtn = container.querySelector("[data-testid='native-btn']");
    const customBtn = container.querySelector("[data-testid='custom-btn']");

    expect(wrapper).not.toBeNull();
    expect(input).not.toBeNull();
    expect(nativeBtn).not.toBeNull();
    expect(customBtn).not.toBeNull();

    // Click native button inside wrapper should not focus input
    input?.blur();
    fireEvent.click(nativeBtn!);
    expect(document.activeElement).not.toBe(input);

    // Click custom role="button" element inside wrapper should not focus input
    input?.blur();
    fireEvent.click(customBtn!);
    expect(document.activeElement).not.toBe(input);
  });
});
