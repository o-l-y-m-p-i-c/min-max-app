import type { ActionFunctionArgs } from "react-router";
import { redirect, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { RuleForm, type RuleFormValue } from "../components/rule-form";
import { parseRuleForm } from "../lib/rule-form.server";
import { saveRule } from "../models/rules.server";
import { syncShop } from "../lib/min-max.server";

const initialValue: RuleFormValue = {
  enabled: true,
  scope: "PRODUCTS",
  priority: 0,
  minQuantity: 6,
  maxQuantity: null,
  increment: 6,
  startQuantity: null,
  messageEn: "",
  messageLv: "",
  messageRu: "",
  targets: [],
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const input = parseRuleForm(await request.formData());
    await saveRule(session.shop, null, input);
    await syncShop(admin as never, session.shop);
    throw redirect("/app");
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export default function NewRule() {
  const actionData = useActionData<typeof action>();
  return <RuleForm initialValue={initialValue} error={actionData?.error} />;
}
