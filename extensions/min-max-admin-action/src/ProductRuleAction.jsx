import {useCallback} from 'react';
import {
  render,
  useApi,
  AdminAction,
  Button,
} from '@shopify/ui-extensions-react/admin';
import {ProductRuleEditor} from './ProductRuleEditor.jsx';

const TARGET = 'admin.product-details.action.render';

function ProductRuleAction() {
  const api = useApi(TARGET);
  const close = useCallback(() => api.close(), [api]);
  return (
    <AdminAction
      title="Min/Max quantity rule"
      primaryAction={null}
      secondaryAction={<Button onPress={close}>Close</Button>}
    >
      <ProductRuleEditor api={api} onDone={close} />
    </AdminAction>
  );
}

render(TARGET, () => <ProductRuleAction />);
