import path from 'node:path';

const importPattern = /from\s+['"]([^'"]+)['"]/g;

function normalizedTarget(sourceRelativePath, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  return path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelativePath), specifier));
}

export function findModuleBoundaryViolations(sourceRelativePath, content) {
  const sourceModule = sourceRelativePath.match(/^modules\/([^/]+)\//)?.[1];
  if (sourceModule === undefined) return [];
  const violations = [];
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const targetRelative = normalizedTarget(sourceRelativePath, specifier);
    const targetModule = targetRelative?.match(/^modules\/([^/]+)(?:\/|$)/)?.[1];
    if (targetModule === undefined || targetModule === sourceModule) continue;
    const publicTargets = new Set([`modules/${targetModule}`, `modules/${targetModule}/index`]);
    if (!publicTargets.has(targetRelative.replace(/\.(?:js|ts)$/, ''))) {
      violations.push(`${sourceRelativePath}: private import into modules/${targetModule}`);
    }
  }
  // Declared relation projections remain owned by the referring module; foreign root queries
  // must instead use the owner's published read contract. This complements import boundaries.
  if (!sourceRelativePath.endsWith('.spec.ts')) {
    const owners = {
      product: 'catalog',
      productVariant: 'catalog',
      productImage: 'catalog',
      productAttribute: 'catalog',
      category: 'catalog',
      brand: 'catalog',
      cart: 'cart',
      cartItem: 'cart',
      customerProfile: 'customers',
      customerAddress: 'customers',
      customerWishlistItem: 'customers',
      inventoryItem: 'inventory',
      stockMovement: 'inventory',
      reservation: 'inventory',
      reservationLine: 'inventory',
      bundle: 'inventory',
      bundleComponent: 'inventory',
      taxRule: 'tax',
      taxConfigurationEvent: 'tax',
      checkoutConfigurationEvent: 'checkout',
      taxClassification: 'tax',
      checkoutDestination: 'checkout',
      shippingDestination: 'shipping',
      shippingConfigurationEvent: 'shipping',
      shippingMethod: 'shipping',
      shipment: 'shipping',
      shipmentLine: 'shipping',
      shipmentEvent: 'shipping',
      returnRequest: 'shipping',
      returnLine: 'shipping',
      returnEvent: 'shipping',
      review: 'review',
      reviewEvent: 'review',
      notification: 'notification',
      notificationDelivery: 'notification',
      order: 'order',
      orderLine: 'order',
      orderEvent: 'order',
      preOrder: 'order',
      preOrderEvent: 'order',
      paymentAttempt: 'payments',
      providerEvent: 'payments',
      refund: 'payments',
      refundEvent: 'payments',
      user: 'identity',
      session: 'identity',
      identityToken: 'identity',
      adminMfaCredential: 'identity',
      adminMfaRecoveryCode: 'identity',
      securityEvent: 'identity',
    };
    for (const match of content.matchAll(/\b(?:prisma|transaction|tx)\.([a-zA-Z]+)\s*\./g)) {
      const owner = owners[match[1]];
      if (owner !== undefined && owner !== sourceModule)
        violations.push(
          `${sourceRelativePath}: foreign persistence root ${match[1]} belongs to modules/${owner}`,
        );
    }
  }
  return violations;
}

export function fixtureSourcePath(content) {
  return content.match(/^\/\/\s*source:\s*(\S+)\s*$/m)?.[1];
}
