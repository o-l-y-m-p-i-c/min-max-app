import {useCallback, useEffect, useState} from 'react';
import {
  Banner,
  BlockStack,
  Button,
  Checkbox,
  InlineStack,
  NumberField,
  ProgressIndicator,
  Text,
} from '@shopify/ui-extensions-react/admin';

export const APP_URL = 'https://min-max-app.onrender.com';

async function apiFetch(api, path, options = {}) {
  const token = await api.sessionToken.getSessionToken();
  const res = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toNumber(v) {
  const n = Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

const EMPTY_FORM = {
  enabled: true,
  minQuantity: '',
  maxQuantity: '',
  increment: '',
  startQuantity: '',
};

export function ProductRuleEditor({api, onDone}) {
  const productId = api.data?.selected?.[0]?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [exists, setExists] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (key) => (value) => setForm((f) => ({...f, [key]: value}));

  useEffect(() => {
    if (!productId) return;
    apiFetch(api, `/api/product-rule?productId=${encodeURIComponent(productId)}`)
      .then(({rule}) => {
        if (rule) {
          setExists(true);
          setForm({
            enabled: rule.enabled,
            minQuantity: rule.minQuantity == null ? '' : String(rule.minQuantity),
            maxQuantity: rule.maxQuantity == null ? '' : String(rule.maxQuantity),
            increment: rule.increment == null ? '' : String(rule.increment),
            startQuantity:
              rule.startQuantity == null ? '' : String(rule.startQuantity),
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [productId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(api, '/api/product-rule', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          enabled: !!form.enabled,
          minQuantity: toNumber(form.minQuantity) ?? 1,
          maxQuantity: toNumber(form.maxQuantity),
          increment: toNumber(form.increment) ?? 1,
          startQuantity: toNumber(form.startQuantity),
        }),
      });
      setExists(true);
      try {
        api.showToast?.('Min/Max rule saved');
      } catch (e) {}
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [api, productId, form, onDone]);

  const remove = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(api, '/api/product-rule', {
        method: 'POST',
        body: JSON.stringify({productId, remove: true}),
      });
      setExists(false);
      setForm(EMPTY_FORM);
      try {
        api.showToast?.('Min/Max rule removed');
      } catch (e) {}
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [api, productId, onDone]);

  if (!productId) return <Text>No product selected.</Text>;
  if (loading) return <ProgressIndicator />;

  return (
    <BlockStack gap="base">
      {error ? (
        <Banner tone="critical">
          <Text>{error}</Text>
        </Banner>
      ) : null}
      <Checkbox checked={!!form.enabled} onChange={set('enabled')}>
        Rule enabled
      </Checkbox>
      <InlineStack gap="base">
        <NumberField
          label="Min quantity"
          value={form.minQuantity}
          onChange={set('minQuantity')}
        />
        <NumberField
          label="Max quantity"
          value={form.maxQuantity}
          onChange={set('maxQuantity')}
        />
      </InlineStack>
      <InlineStack gap="base">
        <NumberField
          label="Increment"
          value={form.increment}
          onChange={set('increment')}
        />
        <NumberField
          label="Start quantity"
          value={form.startQuantity}
          onChange={set('startQuantity')}
        />
      </InlineStack>
      <InlineStack gap="base">
        <Button onPress={save} disabled={saving}>
          {saving ? 'Saving…' : exists ? 'Save rule' : 'Create rule'}
        </Button>
        {exists ? (
          <Button onPress={remove} disabled={saving} tone="critical">
            Remove rule
          </Button>
        ) : null}
      </InlineStack>
    </BlockStack>
  );
}
