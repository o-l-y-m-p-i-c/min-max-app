import {
  render,
  useApi,
  AdminBlock,
} from '@shopify/ui-extensions-react/admin';
import {ProductRuleEditor} from './ProductRuleEditor.jsx';

const TARGET = 'admin.product-details.block.render';

function ProductRuleBlock() {
  const api = useApi(TARGET);
  return (
    <AdminBlock title="Min/Max quantity rule" summary="Limits for this product">
      <ProductRuleEditor api={api} />
    </AdminBlock>
  );
}

render(TARGET, () => <ProductRuleBlock />);
