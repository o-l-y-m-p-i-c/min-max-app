import { useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

export type RuleFormTarget = {
  resourceId?: string;
  value?: string;
  label: string;
  imageUrl?: string;
};

export type RuleFormValue = {
  id?: string;
  enabled: boolean;
  scope: "ALL_PRODUCTS" | "PRODUCTS" | "VARIANTS" | "COLLECTIONS" | "PRODUCT_TAGS";
  priority: number;
  minQuantity: number;
  maxQuantity: number | null;
  increment: number;
  startQuantity: number | null;
  messageEn: string;
  messageLv: string;
  messageRu: string;
  targets: RuleFormTarget[];
};

type PickerSelection = {
  id: string;
  title?: string;
  displayName?: string;
  image?: { originalSrc?: string; url?: string } | null;
  images?: Array<{ originalSrc?: string; url?: string }>;
  product?: { title?: string };
};

export function RuleForm({
  initialValue,
  error,
}: {
  initialValue: RuleFormValue;
  error?: string;
}) {
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const [scope, setScope] = useState(initialValue.scope);
  const [enabled, setEnabled] = useState(initialValue.enabled);
  const [targets, setTargets] = useState(initialValue.targets);
  const [tagInput, setTagInput] = useState(
    initialValue.scope === "PRODUCT_TAGS"
      ? initialValue.targets.map((target) => target.value).filter(Boolean).join(", ")
      : "",
  );
  const [examples, setExamples] = useState(() => {
    const start =
      initialValue.startQuantity ||
      Math.ceil(initialValue.minQuantity / initialValue.increment) * initialValue.increment;
    return Array.from({ length: 4 }, (_, index) => start + index * initialValue.increment).filter(
      (quantity) =>
        initialValue.maxQuantity === null || quantity <= initialValue.maxQuantity,
    );
  });
  const busy = navigation.state !== "idle";

  const updateExamples = () => {
    const form = formRef.current;
    if (!form) return;
    const min = Number(form.querySelector('[name="minQuantity"]')?.getAttribute("value") || 6);
    const max = form.querySelector('[name="maxQuantity"]')?.getAttribute("value");
    const step = Number(form.querySelector('[name="increment"]')?.getAttribute("value") || 1);
    const start = form.querySelector('[name="startQuantity"]')?.getAttribute("value");
    const maxNum = max ? Number(max) : null;
    const startNum = start
      ? Number(start)
      : Math.ceil(min / step) * step;
    const next = Array.from({ length: 4 }, (_, index) => startNum + index * step).filter(
      (quantity) => maxNum === null || quantity <= maxNum,
    );
    setExamples(next);
  };

  const chooseTargets = async () => {
    const type =
      scope === "COLLECTIONS"
        ? "collection"
        : scope === "VARIANTS"
          ? "variant"
          : "product";
    const selected = (await shopify.resourcePicker({
      type,
      multiple: true,
      action: "select",
      filter: type === "product" ? { variants: false } : undefined,
      selectionIds: targets.flatMap((target) =>
        target.resourceId ? [{ id: target.resourceId }] : [],
      ),
    })) as PickerSelection[] | undefined;
    if (!selected) return;
    setTargets(
      selected.map((item) => ({
        resourceId: item.id,
        label:
          item.displayName ||
          [item.product?.title, item.title].filter(Boolean).join(" — ") ||
          item.id,
        imageUrl:
          item.image?.originalSrc ||
          item.image?.url ||
          item.images?.[0]?.originalSrc ||
          item.images?.[0]?.url,
      })),
    );
  };

  const normalizedTargets =
    scope === "PRODUCT_TAGS"
      ? tagInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => ({ value: tag, label: tag }))
      : targets;

  return (
    <s-page heading={initialValue.id ? "Edit quantity rule" : "Create quantity rule"}>
      <s-button slot="secondary-actions" href="/app">Cancel</s-button>
      {error ? <s-banner heading="Unable to save rule" tone="critical">{error}</s-banner> : null}

      <Form method="post" ref={formRef}>
        <input type="hidden" name="targets" value={JSON.stringify(normalizedTargets)} />
        <input type="hidden" name="enabled" value={String(enabled)} />
        <s-stack direction="block" gap="base">
          <s-section heading="Rule details">
            <s-stack direction="block" gap="base">
              <s-switch
                label="Rule enabled"
                name="enabledSwitch"
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              ></s-switch>
              <s-number-field
                name="priority"
                label="Priority"
                details="Higher priority wins between rules with the same scope."
                defaultValue={String(initialValue.priority)}
                min={0}
                step={1}
              ></s-number-field>
            </s-stack>
          </s-section>

          <s-section heading="Applies to">
            <s-stack direction="block" gap="base">
              <s-select
                name="scope"
                label="Scope"
                value={scope}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setScope(value as typeof scope);
                  setTargets([]);
                  setTagInput("");
                }}
              >
                <s-option value="PRODUCTS">Specific products</s-option>
                <s-option value="VARIANTS">Specific variants</s-option>
                <s-option value="COLLECTIONS">Collections</s-option>
                <s-option value="PRODUCT_TAGS">Product tags</s-option>
                <s-option value="ALL_PRODUCTS">All products</s-option>
              </s-select>

              {scope === "PRODUCT_TAGS" ? (
                <s-text-field
                  label="Product tags"
                  details="Separate multiple tags with commas."
                  defaultValue={tagInput}
                  onInput={(event) => setTagInput(event.currentTarget.value)}
                  required
                ></s-text-field>
              ) : scope !== "ALL_PRODUCTS" ? (
                <s-stack direction="block" gap="base">
                  <s-button onClick={chooseTargets}>Select resources</s-button>
                  {targets.length ? (
                    <s-stack direction="inline" gap="small-200">
                      {targets.map((target) => (
                        <s-clickable-chip
                          key={target.resourceId || target.value}
                          removable
                          accessibilityLabel={`Remove ${target.label}`}
                          onRemove={() =>
                            setTargets((current) =>
                              current.filter(
                                (item) => item.resourceId !== target.resourceId,
                              ),
                            )
                          }
                        >
                          {target.label}
                        </s-clickable-chip>
                      ))}
                    </s-stack>
                  ) : (
                    <s-paragraph color="subdued">No resources selected.</s-paragraph>
                  )}
                </s-stack>
              ) : (
                <s-banner tone="warning">
                  This rule applies to every product unless a more specific rule wins.
                </s-banner>
              )}
            </s-stack>
          </s-section>

          <s-section heading="Quantity limits">
            <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
              <s-number-field
                name="minQuantity"
                label="Minimum quantity"
                defaultValue={String(initialValue.minQuantity)}
                min={1}
                step={1}
                required
                onInput={updateExamples}
              ></s-number-field>
              <s-number-field
                name="maxQuantity"
                label="Maximum quantity"
                details="Leave empty for no maximum."
                defaultValue={initialValue.maxQuantity === null ? "" : String(initialValue.maxQuantity)}
                min={1}
                step={1}
                onInput={updateExamples}
              ></s-number-field>
              <s-number-field
                name="increment"
                label="Quantity increment / pack size"
                defaultValue={String(initialValue.increment)}
                min={1}
                step={1}
                required
                onInput={updateExamples}
              ></s-number-field>
              <s-number-field
                name="startQuantity"
                label="Starting quantity"
                details="Optional storefront default; normally calculated automatically."
                defaultValue={initialValue.startQuantity === null ? "" : String(initialValue.startQuantity)}
                min={1}
                step={1}
                onInput={updateExamples}
              ></s-number-field>
            </s-grid>
            <s-paragraph>
              Valid examples: {examples.length ? examples.join(", ") : "No valid quantity in range"}
            </s-paragraph>
          </s-section>

          <s-section heading="Custom messages">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="messageEn"
                label="English"
                defaultValue={initialValue.messageEn}
                placeholder="Optional custom message"
              ></s-text-field>
              <s-text-field
                name="messageLv"
                label="Latvian"
                defaultValue={initialValue.messageLv}
                placeholder="Optional custom message"
              ></s-text-field>
              <s-text-field
                name="messageRu"
                label="Russian"
                defaultValue={initialValue.messageRu}
                placeholder="Optional custom message"
              ></s-text-field>
            </s-stack>
          </s-section>

          <s-stack direction="inline" gap="base">
            <s-button type="submit" variant="primary" loading={busy}>Save and sync</s-button>
            <s-button href="/app">Cancel</s-button>
          </s-stack>
        </s-stack>
      </Form>
    </s-page>
  );
}
