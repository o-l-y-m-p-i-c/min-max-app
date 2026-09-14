import { describe, expect, test } from "vitest";
import { cartValidationsGenerateRun, testables } from "../src/cart_validations_generate_run.js";

const input = (quantity) => ({
  localization: { language: { isoCode: "EN" } },
  validation: {
    metafield: {
      value: JSON.stringify({
        enabled: true,
        messages: {
          en: {
            minimum: "{{product}} requires at least {{minimum}} items.",
            maximum: "{{product}} allows at most {{maximum}} items.",
            multiple: "{{product}} is sold in multiples of {{increment}}.",
          },
        },
      }),
    },
  },
  cart: {
    lines: [
      {
        id: "gid://shopify/CartLine/1",
        quantity,
        merchandise: {
          __typename: "ProductVariant",
          id: "gid://shopify/ProductVariant/1",
          product: { title: "Water" },
          metafield: {
            value: JSON.stringify({
              minimum: 6,
              maximum: 24,
              increment: 6,
              customMessages: {},
            }),
          },
        },
      },
    ],
  },
});

describe("min/max validation", () => {
  test.each([6, 12, 18, 24])("accepts %i", (quantity) => {
    expect(cartValidationsGenerateRun(input(quantity))).toEqual({ operations: [] });
  });

  test("rejects below minimum", () => {
    expect(cartValidationsGenerateRun(input(5)).operations[0].validationAdd.errors[0].message)
      .toBe("Water requires at least 6 items.");
  });

  test("rejects above maximum", () => {
    expect(cartValidationsGenerateRun(input(30)).operations[0].validationAdd.errors[0].message)
      .toBe("Water allows at most 24 items.");
  });

  test("rejects invalid multiple", () => {
    expect(cartValidationsGenerateRun(input(7)).operations[0].validationAdd.errors[0].message)
      .toBe("Water is sold in multiples of 6.");
  });

  test("renders custom localized message", () => {
    const localized = input(7);
    localized.localization.language.isoCode = "RU";
    localized.validation.metafield.value = JSON.stringify({
      enabled: true,
      messages: { ru: { multiple: "default" } },
    });
    localized.cart.lines[0].merchandise.metafield.value = JSON.stringify({
      minimum: 6,
      maximum: null,
      increment: 6,
      customMessages: { ru: "{{product}}: количество кратно {{increment}}." },
    });
    expect(cartValidationsGenerateRun(localized).operations[0].validationAdd.errors[0].message)
      .toBe("Water: количество кратно 6.");
  });

  test("validates the pure multiple rule", () => {
    expect(testables.violation(13, { minimum: 6, maximum: null, increment: 6 }))
      .toBe("multiple");
  });
});
