import prisma from "../db.server";

export async function getSettings(shop: string) {
  return prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

export async function updateSettings(
  shop: string,
  data: {
    enabled?: boolean;
    blockOnFailure?: boolean;
    storefrontEnabled?: boolean;
    validationId?: string | null;
    lastSyncedAt?: Date | null;
    lastSyncError?: string | null;
    configurationVersion?: number;
  },
) {
  return prisma.shopSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
}
