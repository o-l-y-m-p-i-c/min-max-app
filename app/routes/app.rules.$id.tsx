import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { RuleForm, type RuleFormValue } from "../components/rule-form";
import { parseRuleForm } from "../lib/rule-form.server";
import { getRule, saveRule } from "../models/rules.server";
import { syncShop } from "../lib/min-max.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rule = await getRule(session.shop, String(params.id));
  if (!rule) throw new Response("Rule not found", { status: 404 });
  return { rule };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const input = parseRuleForm(await request.formData());
    await saveRule(session.shop, String(params.id), input);
    await syncShop(admin as never, session.shop);
    throw redirect("/app");
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export default function EditRule() {
  const { rule } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const initialValue: RuleFormValue = {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    scope: rule.scope,
    priority: rule.priority,
    minQuantity: rule.minQuantity,
    maxQuantity: rule.maxQuantity,
    increment: rule.increment,
    startQuantity: rule.startQuantity,
    messageEn: rule.messageEn || "",
    messageLv: rule.messageLv || "",
    messageRu: rule.messageRu || "",
    targets: rule.targets.map((target) => ({
      resourceId: target.resourceId || undefined,
      value: target.value || undefined,
      label: target.label,
      imageUrl: target.imageUrl || undefined,
    })),
  };
  return <RuleForm initialValue={initialValue} error={actionData?.error} />;
}
