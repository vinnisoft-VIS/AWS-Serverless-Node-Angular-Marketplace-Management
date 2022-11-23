const SellInvoiceMapper = require('./utilities/sell_invoice_mapper');
const SellInvoiceHelper = require('./sell_invoice_helper');
const CustomerService = require('../../../customers/customers_service');
const StockLocationDAL = require('../../../stock-location/dal/stock_location_dal');
const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const InvoiceDAL = require('../invoices/dal/invoice_dal');
const InvoiceService = require('../invoices/invoice_service');
const WeightedProductsConfiguration = require('../../../weighted_product_configuration/weighted_product_configuration_service');
const InvoiceHelper = require('./invoice_helper');
const VariantDAL = require('../../../variant/dal/variant_dal');
const { adjustPriceAndTaxWithVariant } = require('../locations/utils/pos_locations.mapper');
const taxConfigurationDAL = require('../../../tax/dal/tax_configuration_dal');
const PromotionService = require('../../promotions/promotions_services');
const PromotionHelper = require('../../promotions/promotion_helper');
const { getCompoundTaxLines } = require('../../../tax/dal/taxline_dal');
const AppSubscriptionService = require('../../../app/subscription/app_subscription_service');
const { APP_NAME } = require('../../../app/constants');

module.exports.parkInvoice = async (register, invoice, clientDB) => {
  const { stockLocationId } = register;
  const skus = invoice.products.map((product) => product.sku);

  let variants = await SellInvoiceHelper.loadAndFormatVariants(skus, stockLocationId, clientDB);
  const locationIds = [];
  const variantsId = [];
  variants.map((v) => {
    v.ProductVariantToStockLocations.map((ProductVariantToStockLocation) => {
      locationIds.push(ProductVariantToStockLocation.stockLocationId);
    });
    variantsId.push(v.id);
  });

  const isSubscribed = await AppSubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.PROMOTIONS, clientDB);
  if (isSubscribed) {
    const promotions = await PromotionService.getVariantPromotion(clientDB, [stockLocationId], invoice.products);
    const excludedVariantIds = await PromotionService.getVariantIdsInActivePromotions(clientDB);
    variants = PromotionHelper.mapPromotionsToVariants(variants, promotions, stockLocationId, excludedVariantIds);
  }
  const taxes = await InvoiceHelper.getTaxesForSale(variants, clientDB);
  const customer = invoice.customerId ? await CustomerService.getCustomerById(invoice.customerId, clientDB) : undefined;
  const stockLocation = await StockLocationDAL.getStockLocationById(stockLocationId, clientDB);
  const mainMerchant = await MerchantDAL.getMainMerchantInfo(clientDB.clientDBName);
  const { unit } = WeightedProductsConfiguration.getWeightedProductConfiguration(clientDB);

  const mappedInvoice = SellInvoiceMapper.mapToPosSellInvoice(
    invoice, taxes, customer, stockLocation, register, variants, mainMerchant, unit, undefined, true
  );
  let parkedInvoice;
  if (invoice.invoiceId) {
    parkedInvoice = await InvoiceDAL.getParkedInvoice(invoice.invoiceId, clientDB);
  }
  let invoiceId;
  return clientDB.sequelize.transaction(async (transaction) => {
    if (parkedInvoice) {
      invoiceId = invoice.invoiceId;
      const createdInvoice = await InvoiceHelper.updatePlatformPOSInvoice(invoiceId, mappedInvoice, clientDB, transaction);
      const deletedInvoicPromotions = await PromotionService.deleteInvoicPromotionsByInvoiceId(invoiceId, clientDB, transaction);
      const createdInvoicePromotion = await PromotionService.createInvoicePromotions(variants, createdInvoice, clientDB, transaction);
    } else {
      const createdInvoice = await InvoiceDAL.createPlatformPOSInvoice(mappedInvoice, clientDB, transaction, true);
      const createdInvoicePromotion = await PromotionService.createInvoicePromotions(variants, createdInvoice, clientDB, transaction);

      invoiceId = createdInvoice.id;
    }
    return InvoiceService.getPOSInvoiceById(invoiceId, clientDB, transaction);
  });
};

module.exports.getParkedInvoicesInRegister = async (registerId, limit = 10, offset = 0, clientDB) => InvoiceDAL.getParkedSaleInvoicesInRegister(registerId, limit, offset, clientDB);

module.exports.getParkedInvoice = async (id, clientDB) => {
  const parkedInvoice = await InvoiceService.getPOSInvoiceById(id, clientDB);

  const skus = InvoiceHelper.getSkusFromInvoice(parkedInvoice);

  let variants = await VariantDAL.getVariantsBySkusForPOSSaleInvoice(skus, parkedInvoice.stockLocationId, clientDB);

  const locationIds = [];
  const variantsId = [];

  const taxConfiguration = await taxConfigurationDAL.getTaxConfiguration(clientDB);

  const coumpoundTaxLines = await getCompoundTaxLines(clientDB);

  variants = variants.map((v) => adjustPriceAndTaxWithVariant(v.toJSON(), taxConfiguration), coumpoundTaxLines);

  variants.map((v) => {
    v.ProductVariantToStockLocations.map((ProductVariantToStockLocation) => {
      locationIds.push(ProductVariantToStockLocation.stockLocationId);
    });
    variantsId.push(v.id);
  });

  const isSubscribed = await AppSubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.PROMOTIONS, clientDB);
  if (isSubscribed) {
    const promotions = await PromotionService.getVariantPromotion(clientDB, [parkedInvoice.stockLocationId]);
    const excludedVariantIds = await PromotionService.getVariantIdsInActivePromotions(clientDB);
    variants = PromotionHelper.mapPromotionsToVariants(variants, promotions, parkedInvoice.stockLocationId, excludedVariantIds);
  }

  parkedInvoice.VariantToInvoices = getExistInventoryProducts(parkedInvoice, variants);

  if (parkedInvoice.VariantToInvoices && parkedInvoice.VariantToInvoices.length === 0) {
    throw new Error('Parked sale can\'t be retrieve');
  }

  return { ...parkedInvoice, variants };
};

function getExistInventoryProducts(invoice, variants) {
  const products = [];

  invoice.VariantToInvoices.forEach((vi) => {
    let nonExistItem = null;
    if (vi.CompositeVariantToInvoiceParts && vi.CompositeVariantToInvoiceParts.length > 0) {
      nonExistItem = vi.CompositeVariantToInvoiceParts.find((c) => !variants.find((v) => v.sku === c.sku));
    } else if (vi.VariantToInvoicePacks && vi.VariantToInvoicePacks.length > 0) {
      nonExistItem = vi.VariantToInvoicePacks.find((p) => !variants.find((v) => v.sku === p.sku));
    } else {
      nonExistItem = !variants.find((v) => v.sku === vi.sku);
    }

    if (nonExistItem && vi.VariantToInvoiceExtras && vi.VariantToInvoiceExtras.length > 0) {
      vi.VariantToInvoiceExtras = vi.VariantToInvoiceExtras.map((e) => variants.find((v) => v.sku === e.sku));
    }

    if (!nonExistItem && vi.VariantToInvoiceTracks && vi.VariantToInvoiceTracks.length > 0) {
      const trackLen = vi.VariantToInvoiceTracks.length;
      vi.VariantToInvoiceTracks = vi.VariantToInvoiceTracks.filter((t) => {
        let matchingVariant;
        if (vi.VariantToInvoicePacks && vi.VariantToInvoicePacks.length > 0) {
          matchingVariant = vi.VariantToInvoicePacks[0];
        } else {
          matchingVariant = vi;
        }

        const variant = variants.find((v) => v.sku === matchingVariant.sku);

        const [stock] = variant.ProductVariantToStockLocations;

        return stock.VariantToTracks.find((vt) => vt.trackNo === t.trackNo && vt.quantity > 0);
      });

      if (trackLen !== vi.VariantToInvoiceTracks.length) {
        nonExistItem = true;
      }
    }

    if (!nonExistItem) {
      products.push(vi);
    }
  });

  return products;
}
