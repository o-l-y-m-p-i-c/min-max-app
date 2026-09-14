import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSettings, updateSettings } from "../models/settings.server";
import { deleteRule, listRules, setRuleEnabled } from "../models/rules.server";
import { cleanupShop, syncShop } from "../lib/min-max.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, rules, logs] = await Promise.all([
    getSettings(session.shop),
    listRules(session.shop),
    prisma.syncLog.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return {
    settings,
    rules,
    logs,
    activeRules: rules.filter((rule) => rule.enabled).length,
    coveredVariants: rules.reduce(
      (total, rule) => total + rule._count.compiledVariants,
      0,
    ),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await request.formData();
  const intent = String(data.get("intent") || "");

  try {
    if (intent === "sync") {
      const result = await syncShop(admin as never, session.shop);
      return { ok: true, message: `Synced ${result.variants} variants.` };
    }
    if (intent === "toggleApp") {
      const enabled = data.get("enabled") === "true";
      await updateSettings(session.shop, { enabled });
      const result = await syncShop(admin as never, session.shop);
      return {
        ok: true,
        message: `${enabled ? "Enabled" : "Disabled"}; synced ${result.variants} variants.`,
      };
    }
    if (intent === "toggleRule") {
      await setRuleEnabled(
        session.shop,
        String(data.get("ruleId")),
        data.get("enabled") === "true",
      );
      const result = await syncShop(admin as never, session.shop);
      return { ok: true, message: `Rule updated; synced ${result.variants} variants.` };
    }
    if (intent === "deleteRule") {
      const ruleId = String(data.get("ruleId"));
      await setRuleEnabled(session.shop, ruleId, false);
      const result = await syncShop(admin as never, session.shop);
      await deleteRule(session.shop, ruleId);
      return { ok: true, message: `Rule deleted; synced ${result.variants} variants.` };
    }
    if (intent === "cleanup") {
      await cleanupShop(admin as never, session.shop);
      return { ok: true, message: "Shopify configuration and app data removed." };
    }
    return { ok: false, message: "Unknown action." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

function formatScope(scope: string) {
  return scope
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const busy = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.message) shopify.toast.show(actionData.message);
  }, [actionData, shopify]);

  return (
    <s-page heading="Min Max Order Limits">
      <s-button slot="primary-action" href="/app/rules/new" variant="primary">
        Create rule
      </s-button>
      <Form method="post">
        <input type="hidden" name="intent" value="sync" />
        <s-button slot="secondary-actions" type="submit" loading={busy}>
          Sync now
        </s-button>
      </Form>

      {data.settings.lastSyncError ? (
        <s-banner heading="Synchronization failed" tone="critical">
          {data.settings.lastSyncError}
        </s-banner>
      ) : null}

      <s-section heading="Status">
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Active rules</s-text>
              <s-heading>{data.activeRules}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Covered variants</s-text>
              <s-heading>{data.coveredVariants}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Validation</s-text>
              <s-badge tone={data.settings.validationId ? "success" : "warning"}>
                {data.settings.validationId ? "Installed" : "Needs sync"}
              </s-badge>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Rules">
        {data.rules.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Create a rule to sell products in packs, enforce minimum quantities,
              or cap purchases.
            </s-paragraph>
            <s-button href="/app/rules/new" variant="primary">Create first rule</s-button>
          </s-stack>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header>Scope</s-table-header>
              <s-table-header>Limits</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>
                    <s-link href={`/app/rules/${rule.id}`}>{rule.name}</s-link>
                  </s-table-cell>
                  <s-table-cell>
                    {formatScope(rule.scope)} ({rule.targets.length || "all"})
                  </s-table-cell>
                  <s-table-cell>
                    Min {rule.minQuantity} · Step {rule.increment}
                    {rule.maxQuantity ? ` · Max ${rule.maxQuantity}` : ""}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={rule.enabled ? "success" : "neutral"}>
                      {rule.enabled ? "Active" : "Disabled"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button href={`/app/rules/${rule.id}`} variant="tertiary">Edit</s-button>
                      <Form method="post">
                        <input type="hidden" name="intent" value="toggleRule" />
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <input type="hidden" name="enabled" value={String(!rule.enabled)} />
                        <s-button type="submit" variant="tertiary">
                          {rule.enabled ? "Disable" : "Enable"}
                        </s-button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="deleteRule" />
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <s-button type="submit" variant="tertiary" tone="critical">Delete</s-button>
                      </Form>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="App status">
        <Form method="post">
          <input type="hidden" name="intent" value="toggleApp" />
          <input type="hidden" name="enabled" value={String(!data.settings.enabled)} />
          <s-stack direction="block" gap="base">
            <s-badge tone={data.settings.enabled ? "success" : "neutral"}>
              {data.settings.enabled ? "Enabled" : "Disabled"}
            </s-badge>
            <s-button type="submit">
              {data.settings.enabled ? "Disable app" : "Enable app"}
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Last synchronization">
        <s-paragraph>
          {data.settings.lastSyncedAt
            ? new Date(data.settings.lastSyncedAt).toLocaleString()
            : "Not synchronized yet"}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
