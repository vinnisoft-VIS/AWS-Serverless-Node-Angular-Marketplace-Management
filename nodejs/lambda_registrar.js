/* eslint-disable camelcase */
const MerchantHandler = require('./merchant/merchant_handler');
const ProductHandler = require('./product/product_handler');
const VariantHandler = require('./variant/variant_handler');
const CountryHandler = require('./lookups/country_handler');
const SupplierHandler = require('./supplier/supplier_handler');
const CategoryHandler = require('./categories/category_handler');
const BrandHandler = require('./brand/brand_handler');
const StockLocationHandler = require('./stock-location/stock_location_handler');
const { HttpUtility } = require('./utils/http_utility');
const FileUploadHandler = require('./file/file_upload_handler');
const AppHandler = require('./app/app_handler');
const AppInstallationHandler = require('./app/installation/app_installation_handler');
const AppSubscriptionHandler = require('./app/subscription/app_subscription_handler');
const ProductListingHandler = require('./app/product-listing/product_listing_handler');
const OrderHandler = require('./order/order_handler');
const OrderSettingsHandler = require('./order/settings/order_settings_handler');
const ErrorLogsHandler = require('./app/error-logs/error_logs_handler');
const PermissionsUtility = require('./merchant/utils/permission_utility');
const { UNAUTHORIZED } = require('./utils/error/constants/ERRORS');
const InvoiceHandler = require('./invoice/invoice_handler');
const { closeCommonDBConnection } = require('./models/common');
const { getClientDB } = require('./models/client');
const CustomerHandler = require('./customers/customers_handler');
const StockCountHandler = require('./invoice/stock-count/stock_count_handler');
const PurchaseOrderHandler = require('./invoice/purchase-order/purchase_order_handler');
const PayPurchaseOrderHandler = require('./invoice/pay-purchase-order/pay_purchase_order_handler');
const ReturnStocksHandler = require('./invoice/return-stocks/return_stocks_handler');
const POSPurchaseOrderHandler = require('./pruchase-order/purchase_order_handler');
const RemoveStockHandler = require('./invoice/remove-stock/remove_stock_handler');
const StockTransferHandler = require('./invoice/stock-transfer/stock_transfer_handler');
const PaymentHandler = require('./payment/payment_handler');
const PaymentMethodHandler = require('./payment-method/payment_method_handler');
const OrderInvoiceHandler = require('./order/invoice/order_invoice_handler');
const TaxHandler = require('./tax/tax_handler');
const AccountSubscriptionHandler = require('./rewaa-account-subscription/chargeBee/subscription/subscription_handler');
const PlanHandler = require('./rewaa-account-subscription/chargeBee/plan/plan_handler');
const BankTransactionHandler = require('./rewaa-account-subscription/send-bank-transaction/bank_transaction_handler');
const invoicesAccountSubscriptionHandler = require('./rewaa-account-subscription/chargeBee/invoice/invoice_handler');
const couponAccountSubscriptionHandler = require('./rewaa-account-subscription/chargeBee/coupon/coupon_handler');
const ReportHandler = require('./reports/reports_handler');
const WeightedProductConfigurationHandler = require('./weighted_product_configuration/weighted_product_configuration_handler');
const ShippingConfigurationHandler = require('./shipping_configuration/shipping_configuration_handler');
const ProductImportExportHandler = require('./product/import-export/product_import_export_handler');
const ProductBulkUpdateHandler = require('./product/import-export/bulk_update/bulk_update_handler');
const RegisterHandler = require('./internal_apps/pos/register/register_handler');
const POSInvoiceHandler = require('./internal_apps/pos/invoices/invoice_handler');
const POSLocationHandler = require('./internal_apps/pos/locations/pos_locations_handler');
const POSCashManagementHandler = require('./internal_apps/pos/cash-managment/cash_management_handler');
const POSSettingsHandler = require('./internal_apps/pos/settings/settings_handler');
const data_authenticator = require('./merchant/data_authenticator');
const QuantityConfigurationHandler = require('./quantity_configuration/quantity_configuration_handler');
const CustomerImportExportHandler = require('./customers/import-export/customer_import_export_handler');
const PaymentProcessorsHandler = require('./internal_apps/pos/payment_processors/payment_processors_handler');
const POSLayoutHandler = require('./internal_apps/pos/layouts/layout_handler');
const PromotionHandler = require('./internal_apps/promotions/promotions_handler');
const ExpenseHandler = require('./expense/expense_handler');
const ExpenseCategoryHandler = require('./expense/expense-categories/expense_category_handler');
const ActionLogHandler = require('./action-logs/action_logs_handler');
const OfflineHandler = require('./offline/offline_handler');
const PromotionImportExportHandler = require('./internal_apps/promotions/import-export/promotion_import_export_handler');

const Method_TYPE = {
  POST: 'POST',
  GET: 'GET',
  PUT: 'PUT',
  DELETE: 'DELETE'
};

const registrar = [];

registrar.push(getLambdaRegistrarObject(InvoiceHandler.getRtnOrPOWithPaymentDetailsByInvoiceNumber, '/invoices/{invoiceNumber}/payments', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getPayReturnStockWithReturnInvoice, '/invoices/pay-return-stock/{invoiceNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getPayPurchaseOrderWithPurchaseOrderInvoice, '/invoices/pay-purchase-order/{invoiceNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getPayCreditInvoiceWithChildPOAndReturnInvoices, '/invoices/pay-credit/{invoiceNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getReceiveDebitInvoiceWithChildReturnInvoices, '/invoices/receive-debit/{invoiceNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PaymentHandler.receiveDebit, '/payments/receive-debit', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PaymentHandler.receiveDebitFromCustomer, '/payments/receive-debit-from-customer', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PaymentHandler.payCredit, '/payments/pay-credit', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PaymentHandler.getLastPaymentNumber, '/payments/last-number', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PaymentMethodHandler.listUserPaymentMethods, '/payment-methods/list', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PaymentMethodHandler.add, '/payment-methods/add', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PaymentMethodHandler.update, '/payment-methods/{id}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getInvoicesForPayCredit, '/invoices/payable-invoices', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getPaymentInvoices, '/invoices/paymentlist', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.exportInvoice, '/invoices/export', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getAll, '/invoices', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(RemoveStockHandler.getremoveStockByInvoiceNumber, '/invoices/remove-stock-by-no/{InvoiceNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(RemoveStockHandler.createRemoveStock, '/invoices/remove-stock/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getAllNonPayableInvoicesByType, '/non-payable-invoices-by-type/{invoiceType}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getAllInvoicesByType, '/invoicesByType/{invoiceType}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(InvoiceHandler.getInvoiceByInvoiceNumber, '/invoices/invoiceByInvoiceNumber/{InvoiceNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PurchaseOrderHandler.createPurchaseOrder, '/invoices/purchase-orders/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PayPurchaseOrderHandler.createPayPurchaseOrder, '/invoices/pay-purchase-orders/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PurchaseOrderHandler.updatePurchaseOrder, '/invoices/purchase-orders/{InvoiceNumber}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(ReturnStocksHandler.createReturnStocks, '/invoices/return-stocks/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(POSPurchaseOrderHandler.getAll, '/purchase-orders', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.get, '/merchants', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductHandler.get, '/products', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductHandler.getProductById, '/products/{productId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductHandler.create, '/products', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductHandler.deleteProducts, '/products', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(ProductHandler.publish, '/products/publish', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(ProductHandler.update, '/products/{productId}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(ProductHandler.saveProductImages, '/products/{productId}/images', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductHandler.getProductImages, '/products/{productId}/images', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductHandler.updateProductCategory, '/products/{productId}/category', Method_TYPE.PUT));

registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.generateProductTemplate, '/products/import/templates', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.import, '/products/import', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.bulkUpdate, '/products/bulk-update', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.getBulkUpdateProgress, '/products/bulk-update/progress', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.getImportProgress, '/products/import/progress', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.cancelImport, '/products/import/cancel', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.exportAllProductTrackInfo, '/products/track/{trackType}/export', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.generateProductTrackTemplate, '/products/track/{trackType}/import/templates', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductImportExportHandler.importTracks, '/products/track/{trackType}/import', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductBulkUpdateHandler.acceptBulkUpdate, '/products/bulk-update/accept', Method_TYPE.POST));

registrar.push(getLambdaRegistrarObject(ProductHandler.unPublish, '/products/unPublish', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(ProductHandler.deleteEcards, '/ecards/{ecardId}', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(ProductHandler.addEcards, '/ecards', Method_TYPE.PUT));

registrar.push(getLambdaRegistrarObject(ProductHandler.addPackToProduct, '/products/{productId}/pack', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductHandler.deletePackFromProduct, '/products/{productId}/pack/{packId}', Method_TYPE.DELETE));

registrar.push(getLambdaRegistrarObject(VariantHandler.getProductVariant, '/products/{productId}/variant/{variantId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.importVariant, '/apps/{appId}/variants', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(VariantHandler.getProductVariantsByProductId, '/products/{productId}/variants', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getProductVariantBySKU, '/variants/variant', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.addOrEdit, '/variants', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(VariantHandler.add, '/add-variants', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(VariantHandler.getActiveSkuCount, '/variants/get-active-sku-count', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getNextSKU, '/variants/nextSKUCode', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getVariantImages, '/variants/{variantId}/images', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getVariantsImages, '/variants/images', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.deleteVariant, '/products/{productId}/variants/{variantId}', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(VariantHandler.deleteVariants, '/variants', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(VariantHandler.unpublishVariant, '/products/{productId}/variants/{variantId}/unpublish', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(VariantHandler.publishVariant, '/products/{productId}/variants/{variantId}/publish', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(VariantHandler.updateVariantStockQty, '/variants/stock-locations', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(VariantHandler.searchVariants, '/variants/search', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.addVariantTrack, '/variant-track', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(VariantHandler.findPackageWithVariantAndVariantStockLocation, '/variants/packages/{packageVariantId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.validateSkuOrBarcode, '/variants/variant/{sku}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getVariantByScannerCode, '/variants/scanner/{scannerCode}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getVariantPacks, '/variants/{variantId}/packages', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(VariantHandler.getVariantByPack, '/packages/{packageId}/variant', Method_TYPE.GET));

registrar.push(getLambdaRegistrarObject(CountryHandler.get, '/lookups/countries', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.get, '/stock-location', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.getActiveLocations, '/stock-location/active', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.create, '/stock-location', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.update, '/stock-location/{locationId}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.updatePosStatusOnStockLocation, '/stock-location/action/{locationId}/pos/{action}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.getProgressOfCopyingStocks, '/stock-location/copyingStocksProgress', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.getLocationByCode, '/stock-location/code/{code}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.getLocationPOSRegisters, '/stock-location/{locationId}/pos/registers', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(SupplierHandler.get, '/suppliers', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(SupplierHandler.create, '/suppliers', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(SupplierHandler.edit, '/suppliers/{id}', Method_TYPE.PUT));

// category
registrar.push(getLambdaRegistrarObject(CategoryHandler.get, '/categories', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CategoryHandler.create, '/categories', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(CategoryHandler.getCategoryProducts, '/categories/{id}/products', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CategoryHandler.getCategoryChildren, '/categories/{id}/children', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CategoryHandler.searchCategoryVariants, '/categories/{id}/variants', Method_TYPE.GET));

registrar.push(getLambdaRegistrarObject(FileUploadHandler.requestImageUploadURL, '/requestImageUploadURL', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(FileUploadHandler.saveUploadFileDetails, '/files', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(FileUploadHandler.deleteFile, '/files', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(FileUploadHandler.getFiles, '/files', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppHandler.get, '/apps', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppHandler.getAppChannelById, '/apps/{appId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppHandler.getAppChannelSubscriptionDetails, '/apps/app-subscription-details/{appChannelId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppHandler.findByAppName, '/apps/{appName}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.getAll, '/subscribed-apps', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.getAllSubscriptions, '/apps/subscriptions', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.addAppSubscription, '/apps/subscriptions', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.updateAppSubscription, '/apps/subscriptions/{subscriptionId}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.getAppSubscriptionById, '/apps/subscriptions/{subscriptionId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.fetchPosExternalLocations, '/apps/subscriptions-pos/external-locations/{locationType}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.fetchLocationsExternalAppReference, '/apps/subscriptions/locations-reference/{appId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppInstallationHandler.getTotalProductsToImport, '/installation/totalProductsToImport', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppInstallationHandler.getAppInstallationProgress, '/installation/progress', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppInstallationHandler.installAppChannel, '/installation/import', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(AppInstallationHandler.uninstallApp, '/installation/cancel', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(AppInstallationHandler.handleImportLaterInstallAction, '/installation/importLater', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.getIntegrationProductListingBySubscriptionId, '/apps/subscriptions/{subscriptionId}/product-listing', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.countProductsInChannel, '/apps/subscriptions/{subscriptionId}/product-listing/count', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.getAppVariantByExternalId, '/apps/subscriptions/{subscriptionId}/product-listing/variant/{externalId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.getOtherLinkedVariants, '/apps/subscriptions/{subscriptionId}/product-listing/variant', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.linkProductVariantAndUpdateAppChannel, '/apps/{appId}/product-listing/{productVariantStatusId}', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.updateAppProductStatus, '/apps/{appId}/product-listing/{productVariantStatusId}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(ProductListingHandler.getAppsByVariants, '/products/{productId}/variants/apps', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ErrorLogsHandler.getErrorLogsByAppId, '/apps/{appId}/error-logs', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderHandler.getById, '/orders/{orderId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderHandler.getAllOrdersDetails, '/orders', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderHandler.createMimsOrder, '/orders', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(OrderHandler.getOrderErrorCount, '/orders/error-count', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderSettingsHandler.set, '/orders/settings', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(OrderSettingsHandler.get, '/orders/settings', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.getAllMerchantUsers, '/settings/users', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.getMerchantUserName, '/users/user-name/{userId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.getUiPolicies, '/settings/users/ui-policies', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.addMerchantUserToCurrentStore, '/settings/users', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(MerchantHandler.updateMerchantUser, '/settings/users/{userId}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(MerchantHandler.getCompanyOverview, '/settings/overview', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.updateCompanyOverview, '/settings/overview', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(MerchantHandler.getRolePermissions, '/settings/roles/{type}/permissions', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(MerchantHandler.getMerchantLocations, '/settings/users/{userId}/locations', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockLocationHandler.getAllLocationStocks, '/all-location-stocks', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(SupplierHandler.getSupplierBySupplierId, '/suppliers/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.validateSubscription, '/apps/subscriptions/validate', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(StockCountHandler.createStockCount, '/invoice/stock-count/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(StockCountHandler.getStockCountById, '/invoice/stock-count/{invoiceId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(SupplierHandler.getSupplierPaymentDetailsBySupplierId, '/suppliers/payments/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(SupplierHandler.delete, '/suppliers/{id}', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(ProductHandler.getProductsImages, '/products/{productId}/images/all', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ProductHandler.getProductReferences, '/products/{productId}/references', Method_TYPE.GET));

// Transfer Stock Endpoints
registrar.push(getLambdaRegistrarObject(StockTransferHandler.createStockTransfer, '/invoice/stock-transfer/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(StockTransferHandler.createMultipleStockTransfers, '/invoice/stock-transfer/create-multiple', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(StockTransferHandler.getAllStockTransfer, '/invoice/stock-transfer', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockTransferHandler.getStockTransferById, '/invoice/stock-transfer/{invoiceId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(StockTransferHandler.acceptStockTransfer, '/invoice/stock-transfer/accept/{invoiceId}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(StockTransferHandler.rejectStockTransfer, '/invoice/stock-transfer/reject/{invoiceId}', Method_TYPE.PUT));

// Customer Endpoints
registrar.push(getLambdaRegistrarObject(CustomerHandler.create, '/customers', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(CustomerHandler.getAllCustomers, '/customers', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerHandler.deleteCustomer, '/customers', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(CustomerHandler.edit, '/customers/{id}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(CustomerHandler.getNextCode, '/customers/nextCode', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerHandler.getCustomerByCode, '/customers/getByCode/{code}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerHandler.getCustomerById, '/customers/getById/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerHandler.getCustomerByMobileNumber, '/customers/getByMobile/{mobileNumber}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerHandler.exportCustomers, '/customers/export', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(CustomerHandler.getUnPaidInvoices, '/customer/unpaid-invoices/{customerId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerImportExportHandler.generateCustomerTemplate, '/customers/import/templates', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerImportExportHandler.import, '/customers/import', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(CustomerImportExportHandler.getImportProgress, '/customers/import/progress', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(CustomerImportExportHandler.cancelImport, '/customers/import/cancel', Method_TYPE.POST));

// Order Invoice Endpoints
registrar.push(getLambdaRegistrarObject(OrderInvoiceHandler.getAllOrderInvoice, '/orders/invoices', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderInvoiceHandler.getOrderInvoiceById, '/orders/invoices/{orderInvoiceId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderHandler.updateStatus, '/orders/status', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(OrderHandler.issueOrderInvoice, '/orders/issueInvoice', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(OrderHandler.returnOrderInvoice, '/orders/returnInvoice/{orderId}', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(OrderHandler.getAllChannelsFromInvoiceAndOrders, '/get-order-invoice-channels', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OrderHandler.retryOrder, '/orders/retry/{orderId}', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(OrderHandler.resolveOrderErrors, '/orders/errors/{orderErrorId}', Method_TYPE.PUT));

registrar.push(getLambdaRegistrarObject(TaxHandler.getAllTaxes, '/taxes', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(TaxHandler.create, '/taxes', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(TaxHandler.update, '/taxes', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(TaxHandler.getTaxByCode, '/taxes/code/{code}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(TaxHandler.getTaxById, '/taxes/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(TaxHandler.getTaxConfiguration, '/taxes/configuration', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(TaxHandler.saveTaxConfiguration, '/taxes/configuration', Method_TYPE.POST));

// Qoyod Endpoints
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.getQoyodAccounts, '/qoyod/accounts', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.getQoyodLocations, '/qoyod/locations', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AppSubscriptionHandler.syncInvoices, '/qoyod/sync', Method_TYPE.POST));

// ============================== Rewaa Account subscription section ===============================

// Subscription
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.getSubscription, '/account-subscription/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PlanHandler.listPlans, '/rewaa-subscription/plans', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.estimate, '/account-subscription/estimate', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(BankTransactionHandler.sendBankTransaction, '/rewaa-subscription/sendBankTransaction', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(BankTransactionHandler.startIntercomChat, '/rewaa-subscription/startIntercomChat', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.estimateForRenewalSubscription, '/account-subscription/estimate-renewal-subscription', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.getTapRenewalUrl, '/account-subscription/get-tap-renewal-url', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.chargeFutureRenewalSubscription, '/account-subscription/charge-future-renewal-subscription', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.subscribe, '/account-subscription/subscribe', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.buildTapChargeUrl, '/account-subscription/build-tap-charge-url', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.sendTapInvoice, '/account-subscription/send-tap-invoice', Method_TYPE.POST));

registrar.push(getLambdaRegistrarObject(AccountSubscriptionHandler.sendSubscriptionRenewalInvoice, '/account-subscription/send-renewal-invoice', Method_TYPE.POST));

// Invoices
registrar.push(getLambdaRegistrarObject(invoicesAccountSubscriptionHandler.getUnpaidInvoice, '/account-subscription/unpaid-invoice', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(invoicesAccountSubscriptionHandler.cancelSubIfHasUnpaidInvoice, '/account-subscription/cancel-unpaid', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(invoicesAccountSubscriptionHandler.getInvoice, '/account-subscription/invoice/{invoiceId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(invoicesAccountSubscriptionHandler.listInvoicesBySubscriptionId, '/account-subscription/invoices/{subscriptionId}', Method_TYPE.GET));

// Coupon
registrar.push(getLambdaRegistrarObject(couponAccountSubscriptionHandler.retrieveCoupon, '/account-subscription/coupons/{id}', Method_TYPE.GET));

// product brand
registrar.push(getLambdaRegistrarObject(BrandHandler.get, '/brands', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(BrandHandler.create, '/brands', Method_TYPE.POST));

// dashboard reports
registrar.push(getLambdaRegistrarObject(ReportHandler.dashboard, '/dashboard', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ReportHandler.getMetabaseDashboardUrl, '/metabase-dashboard-url/{reportId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ReportHandler.fetchDashboardPaymentMethodsReport, '/paymentMethods-report', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ReportHandler.getInventoryValueForSpecificDay, '/inventory-value', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ReportHandler.getAllReports, '/reports', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ReportHandler.getMerchantReports, '/user-reports', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ReportHandler.togglePinMerchantReports, '/reports/pin/{reportId}/{pinned}', Method_TYPE.PUT));

registrar.push(getLambdaRegistrarObject(ShippingConfigurationHandler.getShippingConfiguration, '/configurations/shipping', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ShippingConfigurationHandler.updateShippingConfiguration, '/configurations/shipping', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(WeightedProductConfigurationHandler.getWeightedProductConfiguration, '/configurations/weighted-product', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(WeightedProductConfigurationHandler.updateWeightedProductConfiguration, '/configurations/weighted-product', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(QuantityConfigurationHandler.getQuantityConfiguration, '/configurations/quantity', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(QuantityConfigurationHandler.updateQuantityConfiguration, '/configurations/quantity', Method_TYPE.PUT));

// POS
// register
registrar.push(getLambdaRegistrarObject(RegisterHandler.createRegister, '/pos/registers', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(RegisterHandler.getRegister, '/pos/registers/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(RegisterHandler.deleteRegister, '/pos/registers/{id}', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(RegisterHandler.activateRegister, '/pos/registers/{id}/activate', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.bookRegisterSellingSession, '/pos/registers/{id}/book-selling-session', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.deactivateRegister, '/pos/registers/{id}/deactivate', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.makeRegisterDefault, '/pos/registers/{id}/makeDefault', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.updateRegister, '/pos/registers/{id}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.openRegister, '/pos/registers/{id}/open', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.closeRegister, '/pos/registers/{id}/close', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(RegisterHandler.addOrWithdrawCash, '/pos/registers/{id}/cash', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(RegisterHandler.sell, '/pos/registers/{id}/sell', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(RegisterHandler.park, '/pos/registers/{id}/park', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(RegisterHandler.deletePark, '/pos/registers/park/{invoiceId}', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(RegisterHandler.getParkedSalesInvoices, '/pos/registers/{id}/parkedInvoices', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(RegisterHandler.returnOrder, '/pos/registers/{id}/return', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(POSCashManagementHandler.exportRegistersLogs, '/pos/cash-management/export', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSCashManagementHandler.getRegistersLogsPaginated, '/pos/cash-management', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(RegisterHandler.getRegisterBalance, '/pos/registers/{id}/balance', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSSettingsHandler.getPosSettings, '/pos/settings', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSSettingsHandler.updatePosSettings, '/pos/settings', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(RegisterHandler.hasUserAccessForRegister, '/pos/registers/{id}/auth', Method_TYPE.GET));

// POS invoices
registrar.push(getLambdaRegistrarObject(POSInvoiceHandler.getReturnInvoicesBySaleInvoiceId, '/pos/invoices/return/{saleInvoiceId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSInvoiceHandler.getPosInvoice, '/pos/invoices/{invoiceId}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSInvoiceHandler.getParkedInvoice, '/pos/invoices/{invoiceId}/park', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSInvoiceHandler.getLastInvoiceNumber, '/pos/invoices/lastInvoiceNumber/{type}', Method_TYPE.GET));

// locations
registrar.push(getLambdaRegistrarObject(POSLocationHandler.getPOSLocationsWithRegisters, '/pos/locations', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSLocationHandler.searchVariants, '/pos/locations/{id}/variants', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSLocationHandler.getProductsWithoutPriceInPosLocations, '/pos/locations/products-without-price', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSLocationHandler.getVariantByScannerCode, '/pos/locations/{id}/scanner/{code}', Method_TYPE.GET));

// pos payment processors
registrar.push(getLambdaRegistrarObject(PaymentProcessorsHandler.saveFailedPayment, '/pos/paymentProcessor/failedPayment/{processor}', Method_TYPE.POST));

// pos layouts
registrar.push(getLambdaRegistrarObject(POSLayoutHandler.findAllLayouts, '/pos/layouts', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSLayoutHandler.getLayout, '/pos/layouts/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(POSLayoutHandler.deleteLayout, '/pos/layouts/{id}', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(POSLayoutHandler.addLayout, '/pos/layouts', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(POSLayoutHandler.updateLayout, '/pos/layouts/{id}', Method_TYPE.PUT));

// Promotions
registrar.push(getLambdaRegistrarObject(PromotionHandler.create, '/promotions', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PromotionHandler.getPromotionList, '/promotions', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PromotionHandler.update, '/promotions/{id}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(PromotionHandler.searchProductVariants, '/promotions/variants', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PromotionHandler.searchActiveStockLocations, '/promotions/stock-locations', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PromotionHandler.checkIfIntersectedProductsExists, '/promotions/get_intersected_products_promotion', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PromotionHandler.getPromotionById, '/promotions/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PromotionHandler.deletePromotions, '/promotions', Method_TYPE.DELETE));
registrar.push(getLambdaRegistrarObject(PromotionImportExportHandler.generatePromotionTemplate, '/promotions/import/templates', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PromotionImportExportHandler.getImportProgress, '/promotions/import/progress', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(PromotionImportExportHandler.cancelImport, '/promotions/import/cancel', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(PromotionImportExportHandler.reImport, '/promotions/import', Method_TYPE.POST));

// Expenses
registrar.push(getLambdaRegistrarObject(ExpenseHandler.getAllExpenses, '/expenses', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ExpenseHandler.getExpenseById, '/expenses/{id}', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ExpenseHandler.create, '/expenses/create', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ExpenseHandler.updateExpense, '/expenses/{id}', Method_TYPE.PUT));
registrar.push(getLambdaRegistrarObject(ExpenseHandler.deleteExpense, '/expenses/{id}', Method_TYPE.DELETE));

// Expense category
registrar.push(getLambdaRegistrarObject(ExpenseCategoryHandler.get, '/expense-categories', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ExpenseCategoryHandler.create, '/expense-categories', Method_TYPE.POST));
registrar.push(getLambdaRegistrarObject(ExpenseCategoryHandler.getCategoryExpenses, '/expense-categories/{id}/expenses', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ExpenseCategoryHandler.getCategoryChildren, '/expense-categories/{id}/children', Method_TYPE.GET));

// Action logs
registrar.push(getLambdaRegistrarObject(ActionLogHandler.search, '/action-logs', Method_TYPE.GET));

// offline data
registrar.push(getLambdaRegistrarObject(OfflineHandler.getVariants, '/offline-data/variants', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OfflineHandler.getCustomers, '/offline-data/customers', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(OfflineHandler.logOfflineInvoies, '/offline-data/invoices', Method_TYPE.POST));

function getLambdaRegistrarObject(handler, path, method) {
  return {
    handler,
    path,
    method
  };
}

module.exports.handler = async (event, context, callback) => {
  try {
    // WarmUP first
    if (event.source === 'serverless-plugin-warmup') {
      console.log('WarmUP - Lambda is warm!');
      return callback(null, 'Lambda is warm!');
    }

    const service = registrar
      .find((f) => f.path === event.resource && f.method === event.httpMethod);
    const email = event.requestContext.authorizer.claims['cognito:username'];
    const clientSchemaName = event.requestContext.authorizer.claims['custom:schema_name'];
    await PermissionsUtility.validateUserPermissions(email, event.path);

    const clientDB = await getClientDB(clientSchemaName);
    data_authenticator.setCurrentUserInfo(email, clientSchemaName);
    return await service.handler(event, context, callback, clientDB);
  } catch (e) {
    console.log(e);
    if (e === UNAUTHORIZED) {
      return HttpUtility.respondUnauthorized(e);
    }
    return HttpUtility.respondFailure(e);
  } finally {
    await closeCommonDBConnection();
  }
};
