import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getSettings, updateSettings } from "../models/settings.server";
import { cleanupShop, syncShop } from "../lib/min-max.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { settings: await getSettings(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await request.formData();
  const intent = String(data.get("intent") || "save");
  try {
    if (intent === "cleanup") {
      await cleanupShop(admin as never, session.shop);
      return { ok: true, message: "App configuration removed from Shopify." };
    }
    await updateSettings(session.shop, {
      enabled: data.get("enabled") === "true",
      storefrontEnabled: data.get("storefrontEnabled") === "true",
      blockOnFailure: data.get("blockOnFailure") === "true",
    });
    const result = await syncShop(admin as never, session.shop);
    return { ok: true, message: `Settings saved; synced ${result.variants} variants.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  useEffect(() => {
    if (actionData?.message) shopify.toast.show(actionData.message);
  }, [actionData, shopify]);

  return (
    <s-page heading="Settings">
      <Form method="post">
        <input type="hidden" name="intent" value="save" />
        <s-stack direction="block" gap="base">
          <s-section heading="Enforcement">
            <s-stack direction="block" gap="base">
              <s-switch
                name="enabled"
                value="true"
                label="Enable quantity validation"
                defaultChecked={settings.enabled}
              ></s-switch>
              <s-switch
                name="storefrontEnabled"
                value="true"
                label="Enable storefront quantity guidance"
                defaultChecked={settings.storefrontEnabled}
              ></s-switch>
              <s-switch
                name="blockOnFailure"
                value="true"
                label="Block checkout if the Function has a runtime failure"
                details="Ordinary rule violations always block checkout. This controls unexpected Function errors and timeouts."
                defaultChecked={settings.blockOnFailure}
              ></s-switch>
            </s-stack>
          </s-section>
          <s-button type="submit" variant="primary" loading={navigation.state !== "idle"}>
            Save and sync
          </s-button>
        </s-stack>
      </Form>

      <s-section heading="Theme integration">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Enable the “Min Max Quantity Controls” app embed in the Theme Editor.
            Dawn is the reference theme; checkout remains protected even when a
            theme cannot adjust its quantity buttons.
          </s-paragraph>
          <s-link href="shopify://admin/themes/current/editor?context=apps" target="_top">
            Open Theme Editor
          </s-link>
        </s-stack>
      </s-section>

      <s-section heading="Cleanup">
        <s-banner tone="warning">
          Cleanup deletes the Shopify validation, compiled variant metafields,
          and this shop’s app data. Use it immediately before uninstalling.
        </s-banner>
        <Form method="post">
          <input type="hidden" name="intent" value="cleanup" />
          <s-button type="submit" tone="critical">Clean up before uninstall</s-button>
        </Form>
      </s-section>
    </s-page>
  );
}
