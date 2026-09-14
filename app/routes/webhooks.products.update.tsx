import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { syncShop } from "../lib/min-max.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  try {
    const { admin } = await unauthenticated.admin(shop);
    await syncShop(admin as never, shop);
  } catch (error) {
    console.error("Product update synchronization failed", error);
  }
  return new Response();
};
