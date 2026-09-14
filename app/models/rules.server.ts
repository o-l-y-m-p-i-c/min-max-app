import type { RuleScope } from "@prisma/client";
import prisma from "../db.server";
import { getSettings } from "./settings.server";

export type RuleTargetInput = {
  resourceId?: string;
  value?: string;
  label: string;
  imageUrl?: string;
};

export type RuleInput = {
  name: string;
  enabled: boolean;
  scope: RuleScope;
  priority: number;
  minQuantity: number;
  maxQuantity: number | null;
  increment: number;
  startQuantity: number | null;
  messageEn?: string | null;
  messageLv?: string | null;
  messageRu?: string | null;
  targets: RuleTargetInput[];
};

export function validateRuleInput(input: RuleInput) {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Rule name is required");
  if (!Number.isInteger(input.minQuantity) || input.minQuantity < 1) {
    errors.push("Minimum quantity must be a positive integer");
  }
  if (!Number.isInteger(input.increment) || input.increment < 1) {
    errors.push("Increment must be a positive integer");
  }
  if (
    input.maxQuantity !== null &&
    (!Number.isInteger(input.maxQuantity) || input.maxQuantity < input.minQuantity)
  ) {
    errors.push("Maximum quantity must be greater than or equal to minimum");
  }
  if (
    input.startQuantity !== null &&
    (!Number.isInteger(input.startQuantity) ||
      input.startQuantity < input.minQuantity ||
      input.startQuantity % input.increment !== 0 ||
      (input.maxQuantity !== null && input.startQuantity > input.maxQuantity))
  ) {
    errors.push("Starting quantity must be a valid increment inside the min/max range");
  }
  const firstValid = Math.ceil(input.minQuantity / input.increment) * input.increment;
  if (input.maxQuantity !== null && firstValid > input.maxQuantity) {
    errors.push("No valid quantity exists inside the min/max range");
  }
  if (input.scope !== "ALL_PRODUCTS" && input.targets.length === 0) {
    errors.push("Select at least one target");
  }
  return errors;
}

export async function listRules(shop: string) {
  return prisma.rule.findMany({
    where: { shop },
    include: { targets: true, _count: { select: { compiledVariants: true } } },
    orderBy: [{ enabled: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getRule(shop: string, id: string) {
  return prisma.rule.findFirst({
    where: { id, shop },
    include: { targets: true },
  });
}

export async function saveRule(shop: string, id: string | null, input: RuleInput) {
  const errors = validateRuleInput(input);
  if (errors.length) throw new Error(errors.join(". "));
  await getSettings(shop);

  return prisma.$transaction(async (tx) => {
    const data = {
      name: input.name.trim(),
      enabled: input.enabled,
      scope: input.scope,
      priority: input.priority,
      minQuantity: input.minQuantity,
      maxQuantity: input.maxQuantity,
      increment: input.increment,
      startQuantity: input.startQuantity,
      messageEn: input.messageEn || null,
      messageLv: input.messageLv || null,
      messageRu: input.messageRu || null,
    };

    const rule = id
      ? await tx.rule.update({ where: { id, shop }, data })
      : await tx.rule.create({ data: { shop, ...data } });

    await tx.ruleTarget.deleteMany({ where: { ruleId: rule.id } });
    if (input.targets.length) {
      await tx.ruleTarget.createMany({
        data: input.targets.map((target) => ({
          ruleId: rule.id,
          resourceId: target.resourceId || null,
          value: target.value || null,
          label: target.label,
          imageUrl: target.imageUrl || null,
        })),
      });
    }

    return tx.rule.findUniqueOrThrow({
      where: { id: rule.id },
      include: { targets: true },
    });
  });
}

export async function deleteRule(shop: string, id: string) {
  return prisma.rule.delete({ where: { id, shop } });
}

export async function setRuleEnabled(shop: string, id: string, enabled: boolean) {
  return prisma.rule.update({ where: { id, shop }, data: { enabled } });
}
