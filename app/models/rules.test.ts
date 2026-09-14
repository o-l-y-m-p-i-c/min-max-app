import { describe, expect, it } from "vitest";
import type { RuleInput } from "./rules.server";
import { validateRuleInput } from "./rules.server";

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    name: "Case pack of six",
    enabled: true,
    scope: "PRODUCTS",
    priority: 0,
    minQuantity: 6,
    maxQuantity: null,
    increment: 6,
    startQuantity: null,
    targets: [{ resourceId: "gid://shopify/Product/1", label: "Water" }],
    ...overrides,
  };
}

describe("validateRuleInput", () => {
  it("accepts minimum six with increment six", () => {
    expect(validateRuleInput(input())).toEqual([]);
  });

  it("rejects maximum below minimum", () => {
    expect(validateRuleInput(input({ maxQuantity: 5 }))).toContain(
      "Maximum quantity must be greater than or equal to minimum",
    );
  });

  it("requires targets for scoped rules", () => {
    expect(validateRuleInput(input({ targets: [] }))).toContain(
      "Select at least one target",
    );
  });

  it("allows all-products rules without targets", () => {
    expect(validateRuleInput(input({ scope: "ALL_PRODUCTS", targets: [] }))).toEqual([]);
  });

  it("rejects a range without a valid increment", () => {
    expect(
      validateRuleInput(input({ minQuantity: 7, maxQuantity: 10, increment: 6 })),
    ).toContain("No valid quantity exists inside the min/max range");
  });

  it("rejects an invalid starting quantity", () => {
    expect(validateRuleInput(input({ startQuantity: 7 }))).toContain(
      "Starting quantity must be a valid increment inside the min/max range",
    );
  });
});
