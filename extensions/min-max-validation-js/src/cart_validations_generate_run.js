// @ts-check

/**
 * @typedef {import("../generated/api").CartValidationsGenerateRunInput} CartValidationsGenerateRunInput
 * @typedef {import("../generated/api").CartValidationsGenerateRunResult} CartValidationsGenerateRunResult
 */

/** @typedef {{ minimum: number, maximum: number | null, increment: number, customMessages?: Record<string, string> }} Rule */
/** @typedef {{ version: number, enabled: boolean, messages?: Record<string, Record<string, string>> }} Configuration */
/** @typedef {"minimum" | "maximum" | "multiple" | null} ViolationKind */

const FALLBACK = "The selected quantity is not allowed.";

/**
 * @param {string | null | undefined} value
 * @returns {any | null}
 */
const parse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * @param {string} template
 * @param {string} product
 * @param {Rule} rule
 * @returns {string}
 */
const render = (template, product, rule) =>
  template
    .replaceAll("{{product}}", product)
    .replaceAll("{{minimum}}", String(rule.minimum))
    .replaceAll("{{maximum}}", String(rule.maximum ?? ""))
    .replaceAll("{{increment}}", String(rule.increment));

/**
 * @param {number} quantity
 * @param {Rule} rule
 * @returns {ViolationKind}
 */
const violation = (quantity, rule) => {
  if (quantity < rule.minimum) return "minimum";
  if (rule.maximum != null && quantity > rule.maximum) return "maximum";
  if (quantity % rule.increment !== 0) return "multiple";
  return null;
};

/**
 * @param {CartValidationsGenerateRunInput} input
 * @returns {CartValidationsGenerateRunResult}
 */
export function cartValidationsGenerateRun(input) {
  const configuration = parse(input.validation?.metafield?.value);
  if (!configuration?.enabled) return { operations: [] };

  const requestedLocale = String(input.localization?.language?.isoCode || "en").toLowerCase();
  const locale = configuration.messages?.[requestedLocale] ? requestedLocale : "en";
  const defaults = configuration.messages?.[locale] || {};
  const errors = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;
    const rule = parse(line.merchandise.metafield?.value);
    if (!rule || rule.minimum < 1 || rule.increment < 1) continue;
    const kind = violation(line.quantity, rule);
    if (!kind) continue;
    const template = rule.customMessages?.[locale] || defaults[kind] || FALLBACK;
    errors.push({
      message: render(template, line.merchandise.product.title, rule),
      target: "$.cart",
    });
  }

  if (!errors.length) return { operations: [] };
  return { operations: [{ validationAdd: { errors } }] };
}

export const testables = { parse, render, violation };
