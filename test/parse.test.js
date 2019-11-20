import { parse } from "../src/parse";

describe("parse", () => {
  it("can parse an integer", () => {
    const fn = parse("42");
    expect(fn).toBeDefined();
    expect(fn()).toBe(42);
  });
});
