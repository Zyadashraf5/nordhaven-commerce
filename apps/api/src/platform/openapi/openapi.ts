import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** The single authentication scheme: an opaque bearer session credential. */
const SESSION_SCHEME = 'session';

type JsonRecord = Record<string, unknown>;

interface OperationContract {
  readonly path: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  readonly operationId: string;
  /** True for the operations a caller must be able to reach without a credential. */
  readonly anonymous: boolean;
  /** Every response status the operation declares, so the contract cannot drift silently. */
  readonly statuses: readonly string[];
}

/**
 * The reviewed operation inventory of Milestone 04.
 *
 * The generated document is asserted against this table, so adding or removing a route, renaming an
 * operation, or dropping a documented error status fails the build instead of drifting.
 */
const OPERATIONS: readonly OperationContract[] = [
  {
    path: '/api/v1/health/live',
    method: 'get',
    operationId: 'getLiveness',
    anonymous: true,
    statuses: ['200', '500'],
  },
  {
    path: '/api/v1/health/ready',
    method: 'get',
    operationId: 'getReadiness',
    anonymous: true,
    statuses: ['200', '500', '503'],
  },
  {
    path: '/api/v1/auth/register',
    method: 'post',
    operationId: 'registerAccount',
    anonymous: true,
    statuses: ['201', '400', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/login',
    method: 'post',
    operationId: 'createSession',
    anonymous: true,
    statuses: ['200', '400', '401', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/login/mfa',
    method: 'post',
    operationId: 'completeMfaChallenge',
    anonymous: true,
    statuses: ['201', '400', '401', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/login/mfa/enrollment',
    method: 'post',
    operationId: 'beginMfaEnrollment',
    anonymous: true,
    statuses: ['200', '400', '401', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/login/mfa/enrollment/confirmation',
    method: 'post',
    operationId: 'confirmMfaEnrollment',
    anonymous: true,
    statuses: ['201', '400', '401', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/principal',
    method: 'get',
    operationId: 'getPrincipal',
    anonymous: false,
    statuses: ['200', '401', '500', '503'],
  },
  {
    path: '/api/v1/auth/sessions',
    method: 'get',
    operationId: 'listSessions',
    anonymous: false,
    statuses: ['200', '401', '500', '503'],
  },
  {
    path: '/api/v1/auth/sessions',
    method: 'delete',
    operationId: 'revokeAllSessions',
    anonymous: false,
    statuses: ['204', '401', '500', '503'],
  },
  {
    path: '/api/v1/auth/sessions/current',
    method: 'delete',
    operationId: 'revokeCurrentSession',
    anonymous: false,
    statuses: ['204', '401', '500', '503'],
  },
  {
    path: '/api/v1/auth/sessions/{sessionId}',
    method: 'delete',
    operationId: 'revokeSession',
    anonymous: false,
    statuses: ['204', '400', '401', '404', '500', '503'],
  },
  {
    path: '/api/v1/auth/password',
    method: 'post',
    operationId: 'changePassword',
    anonymous: false,
    statuses: ['204', '400', '401', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/password-reset/requests',
    method: 'post',
    operationId: 'requestPasswordReset',
    anonymous: true,
    statuses: ['202', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/auth/password-reset/confirmations',
    method: 'post',
    operationId: 'completePasswordReset',
    anonymous: true,
    statuses: ['204', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/users',
    method: 'get',
    operationId: 'listAccounts',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/profile',
    method: 'get',
    operationId: 'getCustomerProfile',
    anonymous: false,
    statuses: ['200', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/profile',
    method: 'patch',
    operationId: 'updateCustomerProfile',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/addresses',
    method: 'get',
    operationId: 'listCustomerAddresses',
    anonymous: false,
    statuses: ['200', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/addresses',
    method: 'post',
    operationId: 'createCustomerAddress',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/addresses/{addressId}',
    method: 'get',
    operationId: 'getCustomerAddress',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/addresses/{addressId}',
    method: 'patch',
    operationId: 'updateCustomerAddress',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/addresses/{addressId}',
    method: 'delete',
    operationId: 'deleteCustomerAddress',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/addresses/{addressId}/default',
    method: 'put',
    operationId: 'setDefaultCustomerAddress',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/catalog/categories',
    method: 'get',
    operationId: 'listCatalogCategories',
    anonymous: true,
    statuses: ['200', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/catalog/brands',
    method: 'get',
    operationId: 'listCatalogBrands',
    anonymous: true,
    statuses: ['200', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/catalog/products',
    method: 'get',
    operationId: 'listCatalogProducts',
    anonymous: true,
    statuses: ['200', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/catalog/products/{slug}',
    method: 'get',
    operationId: 'getCatalogProduct',
    anonymous: true,
    statuses: ['200', '400', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/cart',
    method: 'get',
    operationId: 'getCart',
    anonymous: false,
    statuses: ['200', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/cart/items',
    method: 'post',
    operationId: 'addCartItem',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/cart/bundle-items',
    method: 'post',
    operationId: 'addCartBundleItem',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/cart/items/{itemId}',
    method: 'patch',
    operationId: 'setCartItemQuantity',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/cart/items/{itemId}',
    method: 'delete',
    operationId: 'removeCartItem',
    anonymous: false,
    statuses: ['200', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/wishlist',
    method: 'get',
    operationId: 'getCustomerWishlist',
    anonymous: false,
    statuses: ['200', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/wishlist',
    method: 'post',
    operationId: 'saveCustomerWishlistItem',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/customers/me/wishlist/{itemId}',
    method: 'delete',
    operationId: 'removeCustomerWishlistItem',
    anonymous: false,
    statuses: ['200', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/categories',
    method: 'post',
    operationId: 'createAdminCategory',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/categories',
    method: 'get',
    operationId: 'listAdminCategories',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/categories/{categoryId}',
    method: 'patch',
    operationId: 'updateAdminCategory',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/categories/{categoryId}',
    method: 'delete',
    operationId: 'deleteAdminCategory',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/brands',
    method: 'post',
    operationId: 'createAdminBrand',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/brands',
    method: 'get',
    operationId: 'listAdminBrands',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/brands/{brandId}',
    method: 'patch',
    operationId: 'updateAdminBrand',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/brands/{brandId}',
    method: 'delete',
    operationId: 'deleteAdminBrand',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products',
    method: 'post',
    operationId: 'createAdminProduct',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products',
    method: 'get',
    operationId: 'listAdminProducts',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}',
    method: 'get',
    operationId: 'getAdminProduct',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}',
    method: 'patch',
    operationId: 'updateAdminProduct',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}',
    method: 'delete',
    operationId: 'deleteAdminProduct',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}/images',
    method: 'put',
    operationId: 'replaceAdminProductImages',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}/attributes',
    method: 'put',
    operationId: 'replaceAdminProductAttributes',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}/status',
    method: 'put',
    operationId: 'setAdminProductStatus',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}/variants',
    method: 'post',
    operationId: 'createAdminProductVariant',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/products/{productId}/discount',
    method: 'put',
    operationId: 'setAdminProductDiscount',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/variants/{variantId}',
    method: 'patch',
    operationId: 'updateAdminVariant',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/catalog/variants/{variantId}',
    method: 'delete',
    operationId: 'deleteAdminVariant',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/inventory',
    method: 'get',
    operationId: 'listInventory',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/inventory/variants/{variantId}',
    method: 'get',
    operationId: 'getInventoryByVariant',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/inventory/variants/{variantId}',
    method: 'put',
    operationId: 'setInventoryByVariant',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/inventory/{inventoryId}',
    method: 'get',
    operationId: 'getInventory',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/inventory/{inventoryId}/movements',
    method: 'get',
    operationId: 'listInventoryMovements',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles',
    method: 'post',
    operationId: 'createBundle',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles',
    method: 'get',
    operationId: 'listBundles',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles/{bundleId}',
    method: 'get',
    operationId: 'getBundle',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles/{bundleId}',
    method: 'patch',
    operationId: 'updateBundle',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles/{bundleId}',
    method: 'delete',
    operationId: 'deleteBundle',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles/{bundleId}/assemble',
    method: 'post',
    operationId: 'assembleBundle',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/bundles/{bundleId}/disassemble',
    method: 'post',
    operationId: 'disassembleBundle',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reservations',
    method: 'post',
    operationId: 'createReservation',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reservations',
    method: 'get',
    operationId: 'listReservations',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reservations/{reservationId}',
    method: 'get',
    operationId: 'getReservation',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reservations/{reservationId}',
    method: 'patch',
    operationId: 'extendReservation',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reservations/{reservationId}/confirmation',
    method: 'post',
    operationId: 'confirmReservation',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reservations/{reservationId}/release',
    method: 'post',
    operationId: 'releaseReservation',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/checkout/quotes',
    method: 'post',
    operationId: 'quoteCheckout',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/tax/rules',
    method: 'get',
    operationId: 'listTaxRules',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/tax/rules',
    method: 'post',
    operationId: 'createTaxRule',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/tax/rules/{ruleId}',
    method: 'delete',
    operationId: 'deleteTaxRule',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/tax/products/{productId}/classification',
    method: 'put',
    operationId: 'setProductTaxClassification',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/tax/products/{productId}/classification',
    method: 'delete',
    operationId: 'clearProductTaxClassification',
    anonymous: false,
    statuses: ['204', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/checkout/destinations',
    method: 'get',
    operationId: 'listCheckoutDestinations',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/checkout/destinations/{countryCode}',
    method: 'put',
    operationId: 'configureCheckoutDestination',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders',
    method: 'get',
    operationId: 'listOrders',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders',
    method: 'post',
    operationId: 'createOrder',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/{orderId}',
    method: 'get',
    operationId: 'getOrder',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/{orderId}',
    method: 'delete',
    operationId: 'cancelOrder',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/pre-orders',
    method: 'get',
    operationId: 'listPreOrders',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/pre-orders',
    method: 'post',
    operationId: 'createPreOrder',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/pre-orders/{preOrderId}',
    method: 'get',
    operationId: 'getPreOrder',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/pre-orders/{preOrderId}',
    method: 'delete',
    operationId: 'cancelPreOrder',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/orders/pre-orders/{preOrderId}/convert',
    method: 'post',
    operationId: 'convertPreOrder',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/orders',
    method: 'get',
    operationId: 'listAdminOrders',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/orders/pre-orders',
    method: 'get',
    operationId: 'listAdminPreOrders',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/orders/{orderId}',
    method: 'get',
    operationId: 'getAdminOrder',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/payments',
    method: 'get',
    operationId: 'listPayments',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/payments/attempts',
    method: 'post',
    operationId: 'createPaymentAttempt',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/payments/attempts/{paymentAttemptId}/refunds',
    method: 'get',
    operationId: 'listPaymentRefunds',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/payments/webhooks/{provider}',
    method: 'post',
    operationId: 'receiveProviderPaymentEvent',
    anonymous: true,
    statuses: ['200', '400', '401', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/payments',
    method: 'get',
    operationId: 'listAdminPayments',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/payments/events',
    method: 'get',
    operationId: 'listAdminProviderEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/payments/refunds',
    method: 'post',
    operationId: 'createRefund',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/payments/attempts/{paymentAttemptId}/refunds',
    method: 'get',
    operationId: 'listAdminPaymentRefunds',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/payments/reconciliation',
    method: 'get',
    operationId: 'reconcilePayments',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/shipping/options',
    method: 'get',
    operationId: 'listShippingOptions',
    anonymous: true,
    statuses: ['200', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/shipments',
    method: 'get',
    operationId: 'listCustomerShipments',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/shipments/{shipmentId}',
    method: 'get',
    operationId: 'getCustomerShipment',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/shipments/{shipmentId}/events',
    method: 'get',
    operationId: 'listCustomerShipmentEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/returns',
    method: 'get',
    operationId: 'listCustomerReturns',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/returns',
    method: 'post',
    operationId: 'createReturn',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/returns/{returnId}',
    method: 'get',
    operationId: 'getCustomerReturn',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/returns/{returnId}',
    method: 'delete',
    operationId: 'cancelReturn',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/returns/{returnId}/events',
    method: 'get',
    operationId: 'listCustomerReturnEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipping/destinations',
    method: 'get',
    operationId: 'listAdminShippingDestinations',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipping/destinations/{countryCode}',
    method: 'put',
    operationId: 'configureAdminShippingDestination',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipping/methods',
    method: 'get',
    operationId: 'listAdminShippingMethods',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipping/methods/{code}',
    method: 'put',
    operationId: 'configureAdminShippingMethod',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipments',
    method: 'get',
    operationId: 'listAdminShipments',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipments',
    method: 'post',
    operationId: 'createAdminShipment',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipments/{shipmentId}',
    method: 'get',
    operationId: 'getAdminShipment',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipments/{shipmentId}',
    method: 'patch',
    operationId: 'transitionAdminShipment',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipments/{shipmentId}/tracking',
    method: 'put',
    operationId: 'setAdminShipmentTracking',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/shipments/{shipmentId}/events',
    method: 'get',
    operationId: 'listAdminShipmentEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/returns',
    method: 'get',
    operationId: 'listAdminReturns',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/returns/{returnId}',
    method: 'get',
    operationId: 'getAdminReturn',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/returns/{returnId}/decision',
    method: 'post',
    operationId: 'decideAdminReturn',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/returns/{returnId}/receipt',
    method: 'post',
    operationId: 'receiveAdminReturn',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/returns/{returnId}/events',
    method: 'get',
    operationId: 'listAdminReturnEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/products/reviews',
    method: 'get',
    operationId: 'listPublicProductReviews',
    anonymous: true,
    statuses: ['200', '400', '429', '500', '503'],
  },
  {
    path: '/api/v1/reviews',
    method: 'get',
    operationId: 'listCustomerReviews',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/reviews',
    method: 'post',
    operationId: 'createReview',
    anonymous: false,
    statuses: ['201', '400', '401', '403', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/reviews/{reviewId}',
    method: 'get',
    operationId: 'getCustomerReview',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/reviews/{reviewId}',
    method: 'patch',
    operationId: 'editCustomerReview',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/reviews/{reviewId}/events',
    method: 'get',
    operationId: 'listCustomerReviewEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reviews',
    method: 'get',
    operationId: 'listAdminReviews',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reviews/pending',
    method: 'get',
    operationId: 'listAdminPendingReviews',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reviews/{reviewId}',
    method: 'get',
    operationId: 'getAdminReview',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reviews/{reviewId}/decision',
    method: 'post',
    operationId: 'moderateAdminReview',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '409', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/reviews/{reviewId}/events',
    method: 'get',
    operationId: 'listAdminReviewEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/notifications',
    method: 'get',
    operationId: 'listCustomerNotifications',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/notifications/{notificationId}',
    method: 'get',
    operationId: 'getCustomerNotification',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/notifications',
    method: 'get',
    operationId: 'listAdminNotifications',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/notifications/{notificationId}/retry',
    method: 'post',
    operationId: 'retryAdminNotification',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/overview',
    method: 'get',
    operationId: 'getOperationalOverview',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/customers',
    method: 'get',
    operationId: 'listCustomers',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/customers/{customerId}',
    method: 'get',
    operationId: 'getCustomer',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '404', '429', '500', '503'],
  },
  {
    path: '/api/v1/admin/audit',
    method: 'get',
    operationId: 'listAuditEvents',
    anonymous: false,
    statuses: ['200', '400', '401', '403', '429', '500', '503'],
  },
];

const TAG_DESCRIPTIONS: { name: string; description: string }[] = [
  { name: 'Health', description: 'Liveness and readiness probes for the platform instance.' },
  { name: 'Registration', description: 'Self-service account creation.' },
  { name: 'Sessions', description: 'Sign-in, the resolved principal, and the session lifecycle.' },
  {
    name: 'Multi-factor',
    description: 'Second-factor enrollment and verification for privileged accounts.',
  },
  { name: 'Passwords', description: 'Password change and the single-use reset flow.' },
  { name: 'Accounts', description: 'Administrative account listing.' },
  {
    name: 'Customers',
    description:
      "The authenticated customer's own profile, saved shipping addresses, and wishlist.",
  },
  {
    name: 'Cart',
    description:
      "The authenticated customer's cart. A cart is an intent record, not a commitment: it holds no stock, creates no reservation, and performs no checkout.",
  },
  {
    name: 'Catalog',
    description:
      'The manually administered product catalog, its anonymous browsing surface with customer-facing search and filtering, the direct product discount and effective price, and the administrative routes that manage categories, brands, products, images, attributes, and sellable variants.',
  },
  {
    name: 'Inventory',
    description:
      'Administrative per-SKU stock, the append-only stock-movement audit, the reservation lifecycle, and fixed and dynamic bundles. Every route requires the administrator role; no customer-facing cart, checkout, order, payment, or shipping endpoint exists.',
  },
  {
    name: 'Tax',
    description:
      'The configurable tax rules, the product tax classifications, and the administrative routes that manage them. A rate is configuration data scoped to an environment, never a hardcoded universal rate.',
  },
  {
    name: 'Checkout',
    description:
      'The checkout calculation and the approved checkout destinations. A quote is a calculation, not a commitment: it reserves no stock, creates no order, and takes no payment.',
  },
  {
    name: 'Orders',
    description:
      "The authenticated customer's orders and pre-orders, and the administrative visibility of them. An order stores an immutable snapshot of every figure the customer confirmed, holds its stock for a bounded window, and records every transition.",
  },
  {
    name: 'Payments',
    description:
      'The payment attempts, the provider event intake, and the refunds. The only shipped provider is a non-production simulation that refuses to operate in production, so a production request can never collect money.',
  },
  {
    name: 'Administration',
    description:
      "The administrative operations surface: the platform's operational picture, its customers, and its security trail. It is a read over the other capabilities' published contracts, and it owns no business rule.",
  },
  {
    name: 'Reviews',
    description:
      'The customer reviews of a product. A review may only be written by a customer who holds a paid order that contains the product, and every review is held for moderation before it is published.',
  },
  {
    name: 'Notifications',
    description:
      'The customer messages the platform produced and their delivery record. The channel is not approved, so the only shipped providers are the local test transports and the transport that sends nothing.',
  },
  {
    name: 'Shipping',
    description:
      "The shipping destinations, the configurable shipping methods, the shipment lifecycle with its tracking reference, and the returns with their restock and refund coordination. No shipping provider is activated: a method's amount is administrator configuration, a tracking reference is administrator text, and the model holds no delivery estimate.",
  },
];

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : undefined;
}

function operationAt(document: OpenAPIObject, contract: OperationContract): JsonRecord | undefined {
  const paths = asRecord((document as unknown as JsonRecord)['paths']);
  return asRecord(asRecord(paths?.[contract.path])?.[contract.method]);
}

/** Every declared response status, sorted, as a single comparable string. */
function statusesOf(operation: JsonRecord): string {
  return Object.keys(asRecord(operation['responses']) ?? {})
    .sort()
    .join(',');
}

/**
 * Asserts that the generated document matches the reviewed inventory exactly.
 *
 * Fail closed: an unexpected route, an unknown operation identifier, or a changed set of documented
 * statuses aborts startup-wiring of the contract instead of publishing an unreviewed surface.
 */
function assertOperationInventory(document: OpenAPIObject): void {
  const paths = asRecord((document as unknown as JsonRecord)['paths']) ?? {};
  const discovered: string[] = [];
  for (const [route, item] of Object.entries(paths)) {
    const pathItem = asRecord(item) ?? {};
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      if (pathItem[method] !== undefined) discovered.push(`${method.toUpperCase()} ${route}`);
    }
  }
  const expected = OPERATIONS.map(
    (contract) => `${contract.method.toUpperCase()} ${contract.path}`,
  ).sort();
  if (discovered.sort().join('|') !== expected.join('|')) {
    throw new Error(`Unexpected operational route inventory: ${discovered.join(', ')}`);
  }

  for (const contract of OPERATIONS) {
    const operation = operationAt(document, contract);
    const label = `${contract.method.toUpperCase()} ${contract.path}`;
    if (operation === undefined) throw new Error(`Missing operation: ${label}`);
    if (operation['operationId'] !== contract.operationId) {
      throw new Error(
        `Operation identifier drift for ${label}: expected ${contract.operationId}, found ${String(operation['operationId'])}`,
      );
    }
    if (statusesOf(operation) !== [...contract.statuses].sort().join(',')) {
      throw new Error(`Documented status drift for ${label}: ${statusesOf(operation)}`);
    }
  }
}

/**
 * Marks every schema that declares `properties` as closed.
 *
 * Bare object schemas and `oneOf` branches are left alone: nothing is known about their shape, and
 * claiming otherwise would make the contract lie.
 */
function closeObjectShapes(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) closeObjectShapes(item);
    return;
  }
  const record = asRecord(node);
  if (record === undefined) return;
  if (record['properties'] !== undefined && record['additionalProperties'] === undefined) {
    record['additionalProperties'] = false;
  }
  for (const value of Object.values(record)) closeObjectShapes(value);
}

/** Adds the shared error responses and operational header components referenced below. */
function registerSharedComponents(document: OpenAPIObject): void {
  const root = document as unknown as JsonRecord;
  const components = asRecord(root['components']) ?? {};
  root['components'] = components;

  const headers = asRecord(components['headers']) ?? {};
  headers['CorrelationId'] = {
    description: 'Server-accepted or server-generated request correlation UUID.',
    schema: { type: 'string', format: 'uuid' },
  };
  headers['NoStore'] = {
    description: 'Prevents caches from retaining a credential-bearing response.',
    schema: { type: 'string', enum: ['no-store'] },
  };
  headers['RetryAfter'] = {
    description: 'Seconds the caller should wait before retrying.',
    schema: { type: 'integer', minimum: 1 },
  };
  components['headers'] = headers;

  if (asRecord(asRecord(components['schemas'])?.['ErrorResponse']) === undefined) {
    throw new Error('Expected a generated ErrorResponse schema to back the shared error envelope');
  }

  const errorResponse = (description: string): JsonRecord => ({
    description,
    headers: {
      'X-Correlation-ID': { $ref: '#/components/headers/CorrelationId' },
      'Cache-Control': { $ref: '#/components/headers/NoStore' },
    },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  });

  const responses = asRecord(components['responses']) ?? {};
  responses['NotFound'] = errorResponse('No route matches the requested path and version.');
  responses['ServiceUnavailable'] = errorResponse(
    'A critical dependency is unavailable, or shutdown has begun.',
  );
  responses['InternalError'] = errorResponse('An unexpected application failure occurred.');
  components['responses'] = responses;
}

/**
 * Applies the reviewed authorization metadata and the mandatory response headers.
 *
 * Protection is stated explicitly on every operation: `security: []` marks the anonymous flows,
 * everything else names the bearer scheme. A missing entry therefore cannot be mistaken for public.
 */
function applyOperationContracts(document: OpenAPIObject): void {
  const root = document as unknown as JsonRecord;
  root['security'] = [{ [SESSION_SCHEME]: [] }];

  for (const contract of OPERATIONS) {
    const operation = operationAt(document, contract);
    const label = `${contract.method.toUpperCase()} ${contract.path}`;
    if (operation === undefined) throw new Error(`Missing operation: ${label}`);
    operation['security'] = contract.anonymous ? [] : [{ [SESSION_SCHEME]: [] }];

    const responses = asRecord(operation['responses']) ?? {};
    for (const [status, value] of Object.entries(responses)) {
      const response = asRecord(value);
      if (response === undefined || response['$ref'] !== undefined) continue;
      const additions: JsonRecord = {
        'X-Correlation-ID': { $ref: '#/components/headers/CorrelationId' },
        'Cache-Control': { $ref: '#/components/headers/NoStore' },
      };
      if (status === '429' || status === '503') {
        additions['Retry-After'] = { $ref: '#/components/headers/RetryAfter' };
      }
      response['headers'] = { ...additions, ...(asRecord(response['headers']) ?? {}) };
    }
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle('Nordhaven Commerce Backend API')
    .setDescription(
      'Milestone 11 backend contract: identity, sessions, access control, the authenticated customer profile, saved shipping addresses, and wishlist, the product catalog with customer-facing search, filtering, and direct product discounts, per-SKU inventory, the reservation lifecycle, and bundles, the authenticated customer cart, the configurable tax engine, the checkout calculation with the approved checkout destinations, the order and pre-order lifecycle with its immutable price and tax snapshots, the payment attempts, the verified provider event intake, and the refunds, the shipping destinations, the configurable shipping methods, the shipment lifecycle, and the returns, the customer reviews with their moderation, the customer notifications with their delivery record, and the administrative operations surface. Browsing is anonymous; catalog, inventory, tax, checkout, order, payment, shipping, review, notification, and administration require the administrator role.',
    )
    .setVersion('1.3.0')
    .addServer('http://localhost:3000', 'Local development')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque',
        description: 'Opaque 256-bit session credential issued by the sign-in flows.',
      },
      SESSION_SCHEME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, configuration);
  assertOperationInventory(document);
  closeObjectShapes(document);
  registerSharedComponents(document);
  applyOperationContracts(document);
  document.tags = TAG_DESCRIPTIONS;
  return document;
}

export function configureOpenApi(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'Nordhaven Commerce API',
  });
}
