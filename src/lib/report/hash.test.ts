import { describe, expect, test } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  test("hash conhecido de 'abc'", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
