const StockLocationDAL = require('../../../stock-location/dal/stock_location_dal');
const AppSubscriptionToStockLocationDAL = require('../../../app/dal/merchant_app_subscription_to_stock_location_dal');
const SubscriptionService = require('../../../app/subscription/app_subscription_service');
const { APP_NAME } = require('../../../app/constants');
const VariantDAL = require('../../../variant/dal/variant_dal');
const taxConfigurationDAL = require('../../../tax/dal/tax_configuration_dal');
const { adjustPriceAndTaxWithVariant } = require('./utils/pos_locations.mapper');
const WeightedProductConfigurationService = require('../../../weighted_product_configuration/weighted_product_configuration_service');
const { getSkuFromScannerCode } = require('./utils/calculation-util');
const MerchantService = require('../../../merchant/merchant_service');
const { DATA_PERMISSION_TYPES, VARIANT_TYPES } = require('../../../utils/constants/constants');
const PromotionService = require('../../promotions/promotions_services');
const PromotionHelper = require('../../promotions/promotion_helper');
const { getCompoundTaxLines } = require('../../../tax/dal/taxline_dal');
const AppSubscriptionService = require('../../../app/subscription/app_subscription_service');
const VariantToStockLocationDAL = require('../../../variant/dal/variant_to_stock_location_dal');

const getPOSLocationSubscriptions = async (clientDB) => {
  const posSubscription = await SubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.INTERNAL_POS, clientDB);
  if (posSubscription) {
    const { id: subscriptionId } = posSubscription;
    return AppSubscriptionToStockLocationDAL
      .getMerchantSubscriptionToStockLocationsBySubscriptionId(subscriptionId, clientDB);
  }
  return [];
};

module.exports.getPOSLocationsWithRegisters = async (clientDB, includeInactive = false) => {
  const posLocationSubscriptions = await getPOSLocationSubscriptions(clientDB);
  if (posLocationSubscriptions.length > 0) {
    let posStockLocationIds = posLocationSubscriptions
      .map((subToLocation) => subToLocation.stockLocationId);
    const userLocations = await MerchantService
      .getDataPermissions(DATA_PERMISSION_TYPES.LOCATION, clientDB);
    posStockLocationIds = posStockLocationIds.filter((l) => userLocations.includes(l));

    if (includeInactive) {
      return StockLocationDAL
        .getStockLocationsWithRegistersByIds(posStockLocationIds, clientDB);
    }
    return StockLocationDAL
      .getActiveStockLocationsWithRegistersByIds(posStockLocationIds, clientDB);
  }
  return [];
};

const checkVariantsStockLocation = async (variants, stockLocationId, taxConfiguration, clientDB) => {
  await Promise.all(variants.map(async (v) => {
    v.ProductVariantToStockLocations = v.ProductVariantToStockLocations
      .filter((stock) => stock.stockLocationId === +stockLocationId);

    if (!v.ProductVariantToStockLocations.length) {
      const { cost, initialCost } = await VariantToStockLocationDAL
        .getVariantToStockLocationByVariantIdAndLocationId(
          v.id, 1, clientDB
        );
      v.ProductVariantToStockLocations = [{
        price: 0,
        retailPrice: 0,
        cost,
        initialCost,
        stockLocationId: +stockLocationId,
        Tax: taxConfiguration.Tax,
        taxId: taxConfiguration.taxId
      }];
    }
    return v;
  }));
  return variants;
};

module.exports.searchVariants = async (stockLocationId, query, clientDB, limit, offset) => {
  let variants = await VariantDAL.searchVariantsNameAndSkuAndBarCodeForLocationWithPriceQuantity(
    stockLocationId, query, clientDB, limit, offset
  );
  const childVariantIds = variants.reduce((ids, v) => {
    if (v.type === VARIANT_TYPES.COMPOSITE) {
      ids = ids.concat(v.Product.VariantToComposites.map((c) => c.productVariantId));
    } else if (v.type === VARIANT_TYPES.PACKAGE) {
      ids = ids.concat(v.VariantToPackages.map((p) => p.productVariantId));
    }

    return ids;
  }, []);

  let childVariants = await VariantDAL.getVariantsWithStockLocationByIds(childVariantIds, stockLocationId, clientDB);

  variants = variants.map((v) => v.toJSON());
  childVariants = childVariants.map((v) => v.toJSON());

  const taxConfiguration = await taxConfigurationDAL.getTaxConfiguration(clientDB);

  variants = await checkVariantsStockLocation(variants, stockLocationId,
    taxConfiguration, clientDB);

  childVariants = await checkVariantsStockLocation(childVariants, stockLocationId,
    taxConfiguration, clientDB);

  const isSubscribed = await AppSubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.PROMOTIONS, clientDB);
  let promotions = [];
  if (isSubscribed) {
    promotions = await PromotionService.getAllActivePromotion(clientDB, [stockLocationId]);
  }

  variants.forEach((v) => {
    v.promotion = PromotionHelper.mapPromotionsToVariant(v, promotions, stockLocationId);
    if (v.type === VARIANT_TYPES.COMPOSITE) {
      v.Product.VariantToComposites.forEach((c) => {
        c.ProductVariant = childVariants.find((cv) => cv.id === c.productVariantId);
      });
    } else if (v.type === VARIANT_TYPES.PACKAGE) {
      v.VariantToPackages.forEach((p) => {
        p.ProductVariant = childVariants.find((cv) => cv.id === p.productVariantId);
      });
    }
  });

  const coumpoundTaxLines = await getCompoundTaxLines(clientDB);
  variants = variants.map((v) => adjustPriceAndTaxWithVariant(v, taxConfiguration, coumpoundTaxLines));
  return variants;
};

module.exports.getAllVariantsByLocationId = async (stockLocationId, clientDB) => {
  let locvariants = await VariantDAL.getAllVariantsNameAndSkuAndBarCodeForLocationWithPriceQuantity(
    stockLocationId, clientDB
  );
  let variants = locvariants.map((lv) => lv.ProductVariant);
  const childVariantIds = variants.reduce((ids, v) => {
    if(v.type === VARIANT_TYPES.COMPOSITE) {
      ids = ids.concat(v.Product.VariantToComposites.map(c => c.productVariantId));
    }
    else if(v.type === VARIANT_TYPES.PACKAGE) {
      ids = ids.concat(v.VariantToPackages.map(p => p.productVariantId));
    }

    return ids;
  }, []);

  let childVariants = await VariantDAL.getVariantsWithStockLocationByIds(childVariantIds, stockLocationId, clientDB);

  variants = variants.map(v => v.toJSON());
  childVariants = childVariants.map(v => v.toJSON());

  const taxConfiguration = await taxConfigurationDAL.getTaxConfiguration(clientDB);

  variants = await checkVariantsStockLocation(variants, stockLocationId,
    taxConfiguration, clientDB);

  childVariants = await checkVariantsStockLocation(childVariants, stockLocationId,
    taxConfiguration, clientDB);

  const isSubscribed = await AppSubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.PROMOTIONS, clientDB);
  let promotions = [];
  if (isSubscribed) {
    promotions = await PromotionService.getAllActivePromotion(clientDB, [stockLocationId]);
  }

  variants.forEach((v) => {
    v.promotion = PromotionHelper.mapPromotionsToVariant(v, promotions, stockLocationId);
    if (v.type === VARIANT_TYPES.COMPOSITE) {
      v.Product.VariantToComposites.forEach((c) => {
        c.ProductVariant = childVariants.find((cv) => cv.id === c.productVariantId);
      });
    } else if (v.type === VARIANT_TYPES.PACKAGE) {
      v.VariantToPackages.forEach((p) => {
        p.ProductVariant = childVariants.find((cv) => cv.id === p.productVariantId);
      });
    }
  });

  const coumpoundTaxLines = await getCompoundTaxLines(clientDB);
  variants = variants.map(v => adjustPriceAndTaxWithVariant(v, taxConfiguration, coumpoundTaxLines));
  return variants;
}

module.exports.getProductsWithoutPriceInPosLocations = async (clientDB) => {
  const posLocationSubscriptions = await getPOSLocationSubscriptions(clientDB);
  if (posLocationSubscriptions.length > 0) {
    const posStockLocationIds = posLocationSubscriptions.map((subToLocation) => subToLocation.stockLocationId);
    const activeLocations = await StockLocationDAL.getActiveStockLocationsByIds(posStockLocationIds, clientDB);
    const variants = await VariantDAL.getAllVariants(clientDB);

    const mappedValues = variants.map((v) => ({
      variantId: v.id,
      productId: v.productId,
      uri: `/inventory/products/${v.productId}`,
      viewProduct: 'View Product >',
      name: v.name,
      locsWithoutPrice: activeLocations.map((aLoc) => {
        const pvToS = v.ProductVariantToStockLocations.find((vToS) => vToS.stockLocationId === aLoc.id);
        return (!pvToS || pvToS.retailPrice === 0) ? aLoc.name : null;
      }).filter((n) => !!n)
    })).filter((mv) => mv.locsWithoutPrice.length > 0);

    mappedValues.forEach((mv) => {
      let locationsWithoutPrice = 'All Locations';
      mv.count = null;
      if (mv.locsWithoutPrice.length !== activeLocations.length) {
        locationsWithoutPrice = mv.locsWithoutPrice.join(', ');
        mv.count = mv.locsWithoutPrice.length;
      }
      delete mv.locWithZeroPrices;
      mv.locationsWithoutPrice = locationsWithoutPrice;
    });
    return mappedValues;
  }
  return [];
};

module.exports.getVariantbyScannerCode = async (scannerCode, stockLocationId, clientDB) => {
  const weightedProductConfiguration = await WeightedProductConfigurationService
    .getWeightedProductConfiguration(clientDB);

  const sku = getSkuFromScannerCode(weightedProductConfiguration, scannerCode);
  let variant = await VariantDAL.getVariantBySkuOrBarcodeAndLocation(stockLocationId, sku, scannerCode, clientDB);

  if (!variant) {
    throw new Error(`You can’t sell ${scannerCode} product is not exist in the inventory.`);
  } else if (!variant.isSellable) {
    throw new Error(`You can’t sell ${scannerCode} product is not sellable.`);
  }
  const taxConfiguration = await taxConfigurationDAL.getTaxConfiguration(clientDB);

  variant = variant.toJSON();
  variant = await checkVariantsStockLocation([variant], stockLocationId,
    taxConfiguration, clientDB);
  variant = variant[0];

  if (variant.type === VARIANT_TYPES.PACKAGE) {
    const childId = variant.VariantToPackages.map((p) => p.productVariantId);
    const childVariant = await getChildVariants(childId, stockLocationId, taxConfiguration, clientDB);
    variant.VariantToPackages[0].ProductVariant = childVariant[0];
  }
  if (variant.type === VARIANT_TYPES.COMPOSITE) {
    const childId = variant.Product.VariantToComposites.map((p) => p.productVariantId);
    const childVariant = await getChildVariants(childId, stockLocationId, taxConfiguration, clientDB);
    variant.Product.VariantToComposites[0].ProductVariant = childVariant[0];
  }
  const isSubscribed = await AppSubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.PROMOTIONS, clientDB);
  if (isSubscribed) {
    variant.promotion = await PromotionService
      .getVariantActivePromotion(variant.id, stockLocationId, clientDB);
  }

  const coumpoundTaxLines = await getCompoundTaxLines(clientDB);
  return adjustPriceAndTaxWithVariant(variant, taxConfiguration, coumpoundTaxLines);
};

const getChildVariants = async (childId, stockLocationId, taxConfiguration, clientDB) => {
  let childVariant = await VariantDAL.getVariantsWithStockLocationByIds([childId], stockLocationId, clientDB);
  childVariant = childVariant.map((v) => v.toJSON());
  return childVariant = await checkVariantsStockLocation(childVariant, stockLocationId,
    taxConfiguration, clientDB);
};
