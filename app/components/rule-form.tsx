import { useMemo, useState } from "react";
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
  name: string;
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
  const [value, setValue] = useState(initialValue);
  const [tagInput, setTagInput] = useState(
    initialValue.scope === "PRODUCT_TAGS"
      ? initialValue.targets.map((target) => target.value).filter(Boolean).join(", ")
      : "",
  );
  const busy = navigation.state !== "idle";

  const startQuantity = useMemo(
    () =>
      value.startQuantity ||
      Math.ceil(value.minQuantity / value.increment) * value.increment,
    [value.increment, value.minQuantity, value.startQuantity],
  );
  const examples = Array.from({ length: 4 }, (_, index) =>
    startQuantity + index * value.increment,
  ).filter((quantity) => value.maxQuantity === null || quantity <= value.maxQuantity);

  const chooseTargets = async () => {
    const type =
      value.scope === "COLLECTIONS"
        ? "collection"
        : value.scope === "VARIANTS"
          ? "variant"
          : "product";
    const selected = (await shopify.resourcePicker({
      type,
      multiple: true,
      action: "select",
      filter: type === "product" ? { variants: false } : undefined,
      selectionIds: value.targets.flatMap((target) =>
        target.resourceId ? [{ id: target.resourceId }] : [],
      ),
    })) as PickerSelection[] | undefined;
    if (!selected) return;
    setValue((current) => ({
      ...current,
      targets: selected.map((item) => ({
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
    }));
  };

  const normalizedTargets =
    value.scope === "PRODUCT_TAGS"
      ? tagInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => ({ value: tag, label: tag }))
      : value.targets;

  return (
    <s-page heading={value.id ? "Edit quantity rule" : "Create quantity rule"}>
      <s-button slot="secondary-actions" href="/app">Cancel</s-button>
      {error ? <s-banner heading="Unable to save rule" tone="critical">{error}</s-banner> : null}

      <Form method="post">
        <input type="hidden" name="targets" value={JSON.stringify(normalizedTargets)} />
        <input type="hidden" name="enabled" value={String(value.enabled)} />
        <s-stack direction="block" gap="base">
          <s-section heading="Rule details">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="name"
                label="Rule name"
                value={value.name}
                onChange={(event) =>
                  setValue((current) => ({ ...current, name: event.currentTarget.value }))
                }
                required
              ></s-text-field>
              <s-switch
                label="Rule enabled"
                name="enabledSwitch"
                checked={value.enabled}
                onChange={(event) =>
                  setValue((current) => ({ ...current, enabled: event.currentTarget.checked }))
                }
              ></s-switch>
              <s-number-field
                name="priority"
                label="Priority"
                details="Higher priority wins between rules with the same scope."
                value={String(value.priority)}
                min={0}
                step={1}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    priority: Number(event.currentTarget.value) || 0,
                  }))
                }
              ></s-number-field>
            </s-stack>
          </s-section>

          <s-section heading="Applies to">
            <s-stack direction="block" gap="base">
              <s-select
                name="scope"
                label="Scope"
                value={value.scope}
                onChange={(event) => {
                  const scope = event.currentTarget.value as RuleFormValue["scope"];
                  setValue((current) => ({ ...current, scope, targets: [] }));
                  setTagInput("");
                }}
              >
                <s-option value="PRODUCTS">Specific products</s-option>
                <s-option value="VARIANTS">Specific variants</s-option>
                <s-option value="COLLECTIONS">Collections</s-option>
                <s-option value="PRODUCT_TAGS">Product tags</s-option>
                <s-option value="ALL_PRODUCTS">All products</s-option>
              </s-select>

              {value.scope === "PRODUCT_TAGS" ? (
                <s-text-field
                  label="Product tags"
                  details="Separate multiple tags with commas."
                  value={tagInput}
                  onChange={(event) => setTagInput(event.currentTarget.value)}
                  required
                ></s-text-field>
              ) : value.scope !== "ALL_PRODUCTS" ? (
                <s-stack direction="block" gap="base">
                  <s-button onClick={chooseTargets}>Select resources</s-button>
                  {value.targets.length ? (
                    <s-stack direction="inline" gap="small-200">
                      {value.targets.map((target) => (
                        <s-clickable-chip
                          key={target.resourceId || target.value}
                          removable
                          accessibilityLabel={`Remove ${target.label}`}
                          onRemove={() =>
                            setValue((current) => ({
                              ...current,
                              targets: current.targets.filter(
                                (item) => item.resourceId !== target.resourceId,
                              ),
                            }))
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
                value={String(value.minQuantity)}
                min={1}
                step={1}
                required
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    minQuantity: Math.max(1, Number(event.currentTarget.value) || 1),
                  }))
                }
              ></s-number-field>
              <s-number-field
                name="maxQuantity"
                label="Maximum quantity"
                details="Leave empty for no maximum."
                value={value.maxQuantity === null ? "" : String(value.maxQuantity)}
                min={1}
                step={1}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    maxQuantity: event.currentTarget.value
                      ? Number(event.currentTarget.value)
                      : null,
                  }))
                }
              ></s-number-field>
              <s-number-field
                name="increment"
                label="Quantity increment / pack size"
                value={String(value.increment)}
                min={1}
                step={1}
                required
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    increment: Math.max(1, Number(event.currentTarget.value) || 1),
                  }))
                }
              ></s-number-field>
              <s-number-field
                name="startQuantity"
                label="Starting quantity"
                details="Optional storefront default; normally calculated automatically."
                value={value.startQuantity === null ? "" : String(value.startQuantity)}
                min={1}
                step={1}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    startQuantity: event.currentTarget.value
                      ? Number(event.currentTarget.value)
                      : null,
                  }))
                }
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
                value={value.messageEn}
                placeholder="Optional custom message"
                onChange={(event) =>
                  setValue((current) => ({ ...current, messageEn: event.currentTarget.value }))
                }
              ></s-text-field>
              <s-text-field
                name="messageLv"
                label="Latvian"
                value={value.messageLv}
                placeholder="Optional custom message"
                onChange={(event) =>
                  setValue((current) => ({ ...current, messageLv: event.currentTarget.value }))
                }
              ></s-text-field>
              <s-text-field
                name="messageRu"
                label="Russian"
                value={value.messageRu}
                placeholder="Optional custom message"
                onChange={(event) =>
                  setValue((current) => ({ ...current, messageRu: event.currentTarget.value }))
                }
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
