import type { Rule, RuleScope, RuleTarget } from "@prisma/client";
import prisma from "../db.server";
import { getSettings, updateSettings } from "../models/settings.server";

const NAMESPACE = "$app:min-max";
const EFFECTIVE_RULE_KEY = "effective-rule";
const CONFIGURATION_KEY = "configuration";
const STOREFRONT_CONFIGURATION_KEY = "storefront-configuration";
const FUNCTION_HANDLE = "min-max-validation";
const VALIDATION_TITLE = "Min Max Order Limits";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type RuleWithTargets = Rule & { targets: RuleTarget[] };

type VariantRecord = {
  id: string;
  title: string;
  productId: string;
  productTitle: string;
};

type EffectiveRule = {
  version: 1;
  ruleId: string;
  minimum: number;
  maximum: number | null;
  increment: number;
  start: number;
  customMessages: Record<string, string>;
};

const DEFAULT_MESSAGES = {
  en: {
    minimum: "{{product}} requires at least {{minimum}} items.",
    maximum: "{{product}} allows at most {{maximum}} items.",
    multiple: "{{product}} is sold in multiples of {{increment}}.",
  },
  lv: {
    minimum: "Produktam {{product}} nepieciešamas vismaz {{minimum}} vienības.",
    maximum: "Produktam {{product}} atļautas ne vairāk kā {{maximum}} vienības.",
    multiple: "Produkts {{product}} tiek pārdots pa {{increment}} vienībām.",
  },
  ru: {
    minimum: "Для товара {{product}} требуется минимум {{minimum}} шт.",
    maximum: "Для товара {{product}} разрешено максимум {{maximum}} шт.",
    multiple: "Товар {{product}} продаётся кратно {{increment}} шт.",
  },
};

async function graphql<T>(
  admin: AdminClient,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(". "));
  }
  if (!payload.data) throw new Error("Shopify returned no data");
  return payload.data;
}

function assertNoUserErrors(errors: Array<{ message: string }> | undefined) {
  if (errors?.length) throw new Error(errors.map((error) => error.message).join(". "));
}

export async function ensureEffectiveRuleDefinition(admin: AdminClient) {
  const data = await graphql<{
    metafieldDefinitionCreate: {
      createdDefinition: { id: string } | null;
      userErrors: Array<{ message: string; code?: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation CreateEffectiveRuleDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { code message }
        }
      }
    `,
    {
      definition: {
        namespace: NAMESPACE,
        key: EFFECTIVE_RULE_KEY,
        name: "Effective quantity rule",
        description: "Compiled min/max/increment rule managed by Min Max Order Limits.",
        type: "json",
        ownerType: "PRODUCTVARIANT",
        access: { storefront: "PUBLIC_READ" },
      },
    },
  );

  const errors = data.metafieldDefinitionCreate.userErrors;
  const onlyAlreadyExists =
    errors.length > 0 &&
    errors.every((error) =>
      /already exists|taken|in use/i.test(`${error.code || ""} ${error.message}`),
    );
  if (errors.length && !onlyAlreadyExists) assertNoUserErrors(errors);
}

export async function ensureStorefrontConfigDefinition() {
  // App-installation metafields are read by the theme extension via Liquid's
  // `app.metafields`, not the Storefront API, so no PUBLIC_READ definition is
  // needed. The `APP` owner type is not a valid MetafieldDefinitionInput
  // ownerType, so we intentionally do not create a definition here.
}

export async function ensureValidation(
  admin: AdminClient,
  shop: string,
  configuration: Record<string, unknown>,
) {
  const settings = await getSettings(shop);

  if (settings.validationId) {
    const updated = await graphql<{
      validationUpdate: {
        validation: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      admin,
      `#graphql
        mutation UpdateMinMaxValidation($id: ID!, $validation: ValidationUpdateInput!) {
          validationUpdate(id: $id, validation: $validation) {
            validation { id }
            userErrors { field message }
          }
        }
      `,
      {
        id: settings.validationId,
        validation: {
          title: VALIDATION_TITLE,
          enable: settings.enabled,
          blockOnFailure: settings.blockOnFailure,
          metafields: [
            {
              namespace: NAMESPACE,
              key: CONFIGURATION_KEY,
              type: "json",
              value: JSON.stringify(configuration),
            },
          ],
        },
      },
    );
    const missingValidation = updated.validationUpdate.userErrors.some((error) =>
      /not found|does not exist|invalid id/i.test(error.message),
    );
    if (!missingValidation) {
      assertNoUserErrors(updated.validationUpdate.userErrors);
      if (updated.validationUpdate.validation) return settings.validationId;
    }
    await updateSettings(shop, { validationId: null });
  }

  const existing = await graphql<{
    validations: {
      nodes: Array<{
        id: string;
        title: string;
        shopifyFunction: { handle: string };
      }>;
    };
  }>(
    admin,
    `#graphql
      query FindMinMaxValidation {
        validations(first: 100) {
          nodes {
            id
            title
            shopifyFunction { handle }
          }
        }
      }
    `,
  );
  const reusable = existing.validations.nodes.find(
    (validation) =>
      validation.shopifyFunction.handle === FUNCTION_HANDLE ||
      validation.title === VALIDATION_TITLE,
  );
  if (reusable) {
    await updateSettings(shop, { validationId: reusable.id });
    return ensureValidation(admin, shop, configuration);
  }

  const created = await graphql<{
    validationCreate: {
      validation: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    admin,
    `#graphql
      mutation CreateMinMaxValidation($validation: ValidationCreateInput!) {
        validationCreate(validation: $validation) {
          validation { id }
          userErrors { field message }
        }
      }
    `,
    {
      validation: {
        title: VALIDATION_TITLE,
        functionHandle: FUNCTION_HANDLE,
        enable: settings.enabled,
        blockOnFailure: settings.blockOnFailure,
        metafields: [
          {
            namespace: NAMESPACE,
            key: CONFIGURATION_KEY,
            type: "json",
            value: JSON.stringify(configuration),
          },
        ],
      },
    },
  );
  assertNoUserErrors(created.validationCreate.userErrors);
  const validationId = created.validationCreate.validation?.id;
  if (!validationId) throw new Error("Shopify did not create the validation");
  await updateSettings(shop, { validationId });
  return validationId;
}

function scopeRank(scope: RuleScope) {
  return {
    VARIANTS: 5,
    PRODUCTS: 4,
    COLLECTIONS: 3,
    PRODUCT_TAGS: 2,
    ALL_PRODUCTS: 1,
  }[scope];
}

function sortRules(rules: RuleWithTargets[]) {
  return [...rules].sort((a, b) => {
    return (
      scopeRank(b.scope) - scopeRank(a.scope) ||
      b.priority - a.priority ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      a.id.localeCompare(b.id)
    );
  });
}

function productVariants(product: {
  id: string;
  title: string;
  variants: { nodes: Array<{ id: string; title: string }> };
}) {
  return product.variants.nodes.map((variant) => ({
    id: variant.id,
    title: variant.title,
    productId: product.id,
    productTitle: product.title,
  }));
}

async function fetchProducts(
  admin: AdminClient,
  query: string | null = null,
): Promise<VariantRecord[]> {
  const variants: VariantRecord[] = [];
  let after: string | null = null;
  do {
    const data: {
      products: {
        nodes: Array<{
          id: string;
          title: string;
          variants: { nodes: Array<{ id: string; title: string }> };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await graphql(
      admin,
      `#graphql
        query ProductsForMinMax($after: String, $query: String) {
          products(first: 100, after: $after, query: $query) {
            nodes {
              id
              title
              variants(first: 250) { nodes { id title } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { after, query },
    );
    variants.push(...data.products.nodes.flatMap(productVariants));
    after = data.products.pageInfo.hasNextPage
      ? data.products.pageInfo.endCursor
      : null;
  } while (after);
  return variants;
}

async function variantsForRule(admin: AdminClient, rule: RuleWithTargets) {
  if (rule.scope === "ALL_PRODUCTS") return fetchProducts(admin);

  if (rule.scope === "PRODUCT_TAGS") {
    const output = new Map<string, VariantRecord>();
    for (const target of rule.targets) {
      if (!target.value) continue;
      const variants = await fetchProducts(
        admin,
        `tag:'${target.value.replaceAll("'", "\\'")}'`,
      );
      variants.forEach((variant) => output.set(variant.id, variant));
    }
    return [...output.values()];
  }

  const ids = rule.targets.flatMap((target) =>
    target.resourceId ? [target.resourceId] : [],
  );
  if (!ids.length) return [];

  if (rule.scope === "COLLECTIONS") {
    const output = new Map<string, VariantRecord>();
    for (const id of ids) {
      let after: string | null = null;
      do {
        const data: {
          collection: {
            products: {
              nodes: Array<{
                id: string;
                title: string;
                variants: { nodes: Array<{ id: string; title: string }> };
              }>;
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
          } | null;
        } = await graphql(
          admin,
          `#graphql
            query CollectionProductsForMinMax($id: ID!, $after: String) {
              collection(id: $id) {
                products(first: 100, after: $after) {
                  nodes {
                    id
                    title
                    variants(first: 250) { nodes { id title } }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          `,
          { id, after },
        );
        if (!data.collection) break;
        data.collection.products.nodes
          .flatMap(productVariants)
          .forEach((variant) => output.set(variant.id, variant));
        after = data.collection.products.pageInfo.hasNextPage
          ? data.collection.products.pageInfo.endCursor
          : null;
      } while (after);
    }
    return [...output.values()];
  }

  const output: VariantRecord[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const data = await graphql<{
      nodes: Array<
        | {
          __typename: "Product";
          id: string;
          title: string;
          variants: { nodes: Array<{ id: string; title: string }> };
        }
        | {
          __typename: "ProductVariant";
          id: string;
          title: string;
          product: { id: string; title: string };
        }
        | null
      >;
    }>(
      admin,
      `#graphql
        query NodesForMinMax($ids: [ID!]!) {
          nodes(ids: $ids) {
            __typename
            ... on Product {
              id
              title
              variants(first: 250) { nodes { id title } }
            }
            ... on ProductVariant {
              id
              title
              product { id title }
            }
          }
        }
      `,
      { ids: ids.slice(offset, offset + 100) },
    );
    for (const node of data.nodes) {
      if (!node) continue;
      if (node.__typename === "Product") output.push(...productVariants(node));
      if (node.__typename === "ProductVariant") {
        output.push({
          id: node.id,
          title: node.title,
          productId: node.product.id,
          productTitle: node.product.title,
        });
      }
    }
  }
  return output;
}

function effectiveRule(rule: RuleWithTargets): EffectiveRule {
  const start =
    rule.startQuantity || Math.ceil(rule.minQuantity / rule.increment) * rule.increment;
  return {
    version: 1,
    ruleId: rule.id,
    minimum: rule.minQuantity,
    maximum: rule.maxQuantity,
    increment: rule.increment,
    start,
    customMessages: {
      ...(rule.messageEn ? { en: rule.messageEn } : {}),
      ...(rule.messageLv ? { lv: rule.messageLv } : {}),
      ...(rule.messageRu ? { ru: rule.messageRu } : {}),
    },
  };
}

async function setVariantMetafields(
  admin: AdminClient,
  assignments: Array<{ variant: VariantRecord; rule: RuleWithTargets }>,
) {
  for (let offset = 0; offset < assignments.length; offset += 25) {
    const metafields = assignments.slice(offset, offset + 25).map(({ variant, rule }) => ({
      ownerId: variant.id,
      namespace: NAMESPACE,
      key: EFFECTIVE_RULE_KEY,
      type: "json",
      value: JSON.stringify(effectiveRule(rule)),
    }));
    const data = await graphql<{
      metafieldsSet: { userErrors: Array<{ message: string }> };
    }>(
      admin,
      `#graphql
        mutation SetEffectiveRules($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { field message }
          }
        }
      `,
      { metafields },
    );
    assertNoUserErrors(data.metafieldsSet.userErrors);
  }
}

async function clearVariantMetafields(admin: AdminClient, variantIds: string[]) {
  for (let offset = 0; offset < variantIds.length; offset += 25) {
    const data = await graphql<{
      metafieldsDelete: { userErrors: Array<{ message: string }> };
    }>(
      admin,
      `#graphql
        mutation ClearEffectiveRules($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields { ownerId }
            userErrors { field message }
          }
        }
      `,
      {
        metafields: variantIds.slice(offset, offset + 25).map((ownerId) => ({
          ownerId,
          namespace: NAMESPACE,
          key: EFFECTIVE_RULE_KEY,
        })),
      },
    );
    assertNoUserErrors(
      data.metafieldsDelete.userErrors.filter(
        (error) => !/owner.*(not found|does not exist)/i.test(error.message),
      ),
    );
  }
}

async function setStorefrontConfiguration(
  admin: AdminClient,
  enabled: boolean,
  assignments: Array<{ variant: VariantRecord; rule: RuleWithTargets }>,
) {
  const installation = await graphql<{
    currentAppInstallation: { id: string };
  }>(
    admin,
    `#graphql
      query CurrentAppInstallationForMinMax {
        currentAppInstallation { id }
      }
    `,
  );
  const rules = Object.fromEntries(
    assignments.map(({ variant, rule }) => [
      variant.id.split("/").pop(),
      effectiveRule(rule),
    ]),
  );
  const data = await graphql<{
    metafieldsSet: { userErrors: Array<{ message: string }> };
  }>(
    admin,
    `#graphql
      mutation SetMinMaxStorefrontConfiguration($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: installation.currentAppInstallation.id,
          namespace: NAMESPACE,
          key: STOREFRONT_CONFIGURATION_KEY,
          type: "json",
          value: JSON.stringify({ version: 1, enabled, rules }),
        },
      ],
    },
  );
  assertNoUserErrors(data.metafieldsSet.userErrors);
}

export async function syncShop(admin: AdminClient, shop: string) {
  const settings = await getSettings(shop);
  const log = await prisma.syncLog.create({
    data: { shop, status: "RUNNING", operation: "FULL_SYNC", message: "Sync started" },
  });

  try {
    await ensureEffectiveRuleDefinition(admin);
    await ensureStorefrontConfigDefinition(admin);
    const rules = await prisma.rule.findMany({
      where: { shop, enabled: true },
      include: { targets: true },
    });
    const assignments = new Map<
      string,
      { variant: VariantRecord; rule: RuleWithTargets }
    >();

    if (settings.enabled) {
      for (const rule of sortRules(rules)) {
        const variants = await variantsForRule(admin, rule);
        for (const variant of variants) {
          if (!assignments.has(variant.id)) assignments.set(variant.id, { variant, rule });
        }
      }
    }

    const previous = await prisma.compiledVariant.findMany({ where: { shop } });
    const staleIds = previous
      .map((item) => item.variantId)
      .filter((id) => !assignments.has(id));
    if (staleIds.length) await clearVariantMetafields(admin, staleIds);
    await setVariantMetafields(admin, [...assignments.values()]);

    const configuration = {
      version: 1,
      enabled: settings.enabled,
      messages: DEFAULT_MESSAGES,
    };
    await ensureValidation(admin, shop, configuration);
    await setStorefrontConfiguration(
      admin,
      settings.enabled && settings.storefrontEnabled,
      [...assignments.values()],
    );

    const revision = settings.configurationVersion + 1;
    await prisma.$transaction([
      prisma.compiledVariant.deleteMany({ where: { shop } }),
      prisma.compiledVariant.createMany({
        data: [...assignments.values()].map(({ variant, rule }) => ({
          shop,
          variantId: variant.id,
          productId: variant.productId,
          productTitle: variant.productTitle,
          variantTitle: variant.title,
          ruleId: rule.id,
          revision,
        })),
      }),
      prisma.shopSettings.update({
        where: { shop },
        data: {
          lastSyncedAt: new Date(),
          lastSyncError: null,
          configurationVersion: revision,
        },
      }),
      prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "SUCCESS",
          message: `Synchronized ${assignments.size} variants`,
          details: { rules: rules.length, variants: assignments.size },
        },
      }),
    ]);

    return { rules: rules.length, variants: assignments.size };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction([
      prisma.shopSettings.update({ where: { shop }, data: { lastSyncError: message } }),
      prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "ERROR", message },
      }),
    ]);
    throw error;
  }
}

export async function cleanupShop(admin: AdminClient, shop: string) {
  const settings = await getSettings(shop);
  const compiled = await prisma.compiledVariant.findMany({ where: { shop } });
  if (compiled.length) {
    await clearVariantMetafields(
      admin,
      compiled.map((item) => item.variantId),
    );
  }
  if (settings.validationId) {
    const data = await graphql<{
      validationDelete: { deletedId: string | null; userErrors: Array<{ message: string }> };
    }>(
      admin,
      `#graphql
        mutation DeleteMinMaxValidation($id: ID!) {
          validationDelete(id: $id) {
            deletedId
            userErrors { field message }
          }
        }
      `,
      { id: settings.validationId },
    );
    assertNoUserErrors(data.validationDelete.userErrors);
  }
  await prisma.shopSettings.delete({ where: { shop } });
}
