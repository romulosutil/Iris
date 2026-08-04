import * as React from "react";
import { expect, test, describe } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Input, InputSenha } from "./input";

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
          <>
            <button data-testid="native-btn">Click</button>
            <div role="button" data-testid="custom-btn">
              Click Custom
            </div>
          </>
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

  test("applies inputClassName directly to the input element", () => {
    const { container } = render(
      <Input
        className="w-full"
        inputClassName="text-center text-red-500"
        placeholder="Centered text"
      />,
    );
    const wrapper = container.firstElementChild;
    const input = container.querySelector("input");

    expect(wrapper?.classList.contains("w-full")).toBe(true);
    expect(input?.classList.contains("text-center")).toBe(true);
    expect(input?.classList.contains("text-red-500")).toBe(true);
  });
});

describe("InputSenha component", () => {
  test("alterna o tipo entre password e text ao clicar no botão de visibilidade", () => {
    const { container, getByRole } = render(<InputSenha placeholder="Senha" />);
    const input = container.querySelector("input")!;
    expect(input.type).toBe("password");

    const btn = getByRole("button", { name: "Exibir senha em texto" });
    fireEvent.click(btn);
    expect(input.type).toBe("text");

    const btnOcultar = getByRole("button", { name: "Ocultar senha" });
    fireEvent.click(btnOcultar);
    expect(input.type).toBe("password");
  });

  test("desabilita o botão de alternância quando o input possui a prop disabled", () => {
    const { getByRole } = render(<InputSenha disabled placeholder="Senha" />);
    const btn = getByRole("button", { name: "Exibir senha em texto" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
