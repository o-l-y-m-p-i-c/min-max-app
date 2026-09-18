import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { saveRule } from "../models/rules.server";
import { syncShop } from "../lib/min-max.server";

function findProductRule(shop: string, resourceId: string) {
  return prisma.rule.findFirst({
    where: { shop, targets: { some: { resourceId } } },
    include: { targets: true },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, cors } = await authenticate.admin(request);
  const productId = new URL(request.url).searchParams.get("productId") || "";
  const rule = productId ? await findProductRule(session.shop, productId) : null;
  return cors(Response.json({ rule }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  try {
    const body = (await request.json()) as {
      productId?: string;
      enabled?: boolean;
      minQuantity?: number;
      maxQuantity?: number | null;
      increment?: number;
      startQuantity?: number | null;
      remove?: boolean;
    };
    const productId = body.productId || "";
    if (!productId) {
      return cors(Response.json({ error: "Missing productId" }, { status: 400 }));
    }

    const existing = await findProductRule(session.shop, productId);

    if (body.remove) {
      if (existing) {
        await prisma.rule.delete({ where: { id: existing.id } });
        await syncShop(admin as never, session.shop);
      }
      return cors(Response.json({ ok: true }));
    }

    // Resolve product title server-side for the target label/rule name
    const resp = await admin!.graphql(
      `query ($id: ID!) { product(id: $id) { title } }`,
      { variables: { id: productId } },
    );
    const pdata = (await resp.json()) as {
      data?: { product?: { title?: string } };
    };
    const title = pdata.data?.product?.title || productId;

    const rule = await saveRule(session.shop, existing?.id ?? null, {
      name: existing?.name || `Product limit: ${title}`,
      enabled: body.enabled ?? true,
      scope: "PRODUCTS",
      priority: existing?.priority ?? 0,
      minQuantity: body.minQuantity ?? 1,
      maxQuantity: body.maxQuantity ?? null,
      increment: body.increment ?? 1,
      startQuantity: body.startQuantity ?? null,
      targets: [{ resourceId: productId, label: title }],
    });
    await syncShop(admin as never, session.shop);
    return cors(Response.json({ ok: true, rule }));
  } catch (error) {
    return cors(
      Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      ),
    );
  }
};
