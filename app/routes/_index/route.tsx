import type { LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Min Max Order Limits</h1>
        <p className={styles.text}>
          Sell products in case packs and enforce minimum, maximum, and quantity
          increment rules across storefront cart and checkout.
        </p>
        {showForm ? (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>example.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">Log in</button>
          </Form>
        ) : null}
        <ul className={styles.list}>
          <li><strong>Pack sizes.</strong> Sell in quantities such as 6, 12, 18, and 24.</li>
          <li><strong>Flexible targeting.</strong> Products, variants, collections, tags, or the full catalog.</li>
          <li><strong>Native enforcement.</strong> Shopify Functions block invalid carts at checkout.</li>
        </ul>
      </div>
    </div>
  );
}
