import type { RuleScope } from "@prisma/client";
import type { RuleInput, RuleTargetInput } from "../models/rules.server";

const scopes = new Set<RuleScope>([
  "ALL_PRODUCTS",
  "PRODUCTS",
  "VARIANTS",
  "COLLECTIONS",
  "PRODUCT_TAGS",
]);

function integer(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function optionalInteger(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

const scopeLabels: Record<RuleScope, string> = {
  ALL_PRODUCTS: "All products",
  PRODUCTS: "Products",
  VARIANTS: "Variants",
  COLLECTIONS: "Collections",
  PRODUCT_TAGS: "Product tags",
};

function generateRuleName(scope: RuleScope, minQuantity: number, increment: number, maxQuantity: number | null): string {
  const parts = [`Pack of ${increment}`, scopeLabels[scope]];
  const limits = [`min ${minQuantity}`];
  if (maxQuantity !== null) limits.push(`max ${maxQuantity}`);
  if (increment !== 1) limits.push(`step ${increment}`);
  return `${parts.join(" · ")} (${limits.join(", ")})`;
}

export function parseRuleForm(data: FormData): RuleInput {
  const scopeValue = String(data.get("scope") || "PRODUCTS") as RuleScope;
  if (!scopes.has(scopeValue)) throw new Error("Invalid rule scope");

  let targets: RuleTargetInput[] = [];
  try {
    const parsed = JSON.parse(String(data.get("targets") || "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    targets = parsed
      .filter((target) => target && typeof target.label === "string")
      .map((target) => ({
        resourceId:
          typeof target.resourceId === "string" ? target.resourceId : undefined,
        value: typeof target.value === "string" ? target.value : undefined,
        label: target.label.slice(0, 255),
        imageUrl: typeof target.imageUrl === "string" ? target.imageUrl : undefined,
      }));
  } catch {
    throw new Error("Invalid rule targets");
  }

  const minQuantity = integer(data.get("minQuantity"), 1);
  const maxQuantity = optionalInteger(data.get("maxQuantity"));
  const increment = integer(data.get("increment"), 1);

  return {
    name: generateRuleName(scopeValue, minQuantity, increment, maxQuantity),
    enabled: data.get("enabled") === "true",
    scope: scopeValue,
    priority: integer(data.get("priority"), 0),
    minQuantity,
    maxQuantity,
    increment,
    startQuantity: optionalInteger(data.get("startQuantity")),
    messageEn: String(data.get("messageEn") || "").slice(0, 500) || null,
    messageLv: String(data.get("messageLv") || "").slice(0, 500) || null,
    messageRu: String(data.get("messageRu") || "").slice(0, 500) || null,
    targets,
  };
}
