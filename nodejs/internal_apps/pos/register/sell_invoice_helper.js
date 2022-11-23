const sizeOf = require('object-sizeof');

const VariantDAL = require('../../../variant/dal/variant_dal');
const { VARIANT_TYPES, DATA_PERMISSION_TYPES, PRODUCT_TYPES } = require('../../../utils/constants/constants');
const StockLocationDAL = require('../../../stock-location/dal/stock_location_dal');
const SellInvoiceMapper = require('./utilities/sell_invoice_mapper');
const TaxService = require('../../../tax/tax_service');
const InvoiceDAL = require('../invoices/dal/invoice_dal');
const PaymentDAL = require('../../../payment/dal/payment_dal');
const VariantToTrackDAL = require('../../../variant/dal/variant_to_track_dal');
const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const VariantToStockLocationDAL = require('../../../variant/dal/variant_to_stock_location_dal');
const { validateSalePosInvoice, validateAllowedMaxDiscount } = require('./validation/sale_pos_invoice_validation');
const SettingsService = require('../settings/settings_service');
const { multiply, add, subtract } = require('../../../utils/calculation_utilities');
const { STREAM: { STOCK_NOTIFICATIONS } } = require('../../../utils/constants/kinesis');
const KinesisUtility = require('../../../utils/kinesis_utility');
const WeightedProductsConfiguration = require('../../../weighted_product_configuration/weighted_product_configuration_service');
const InvoiceHelper = require('./invoice_helper');
const { calculateMaxToSell } = require('../../../variant/utils/variant_calculation');
const CustomerService = require('../../../customers/customers_service');
const { dbDataToJSON } = require('../../../utils/database_utils');
const InvoiceService = require('../invoices/invoice_service');
const { UNAUTHORIZED } = require('../../../utils/error/constants/ERRORS');
const data_authenticator = require('../../../merchant/data_authenticator');
const EcardDAL = require('../../../product/dal/ecards_dal');
const PromotionService = require('../../promotions/promotions_services');
const PromotionHelper = require('../../promotions/promotion_helper');
const AppSubscriptionService = require('../../../app/subscription/app_subscription_service');
const { APP_NAME } = require('../../../app/constants');
const VariantMapper = require('../../../variant/mapper/nosql/dynamodb/variant_mapper');
const LambdaUtility = require('../../../utils/lambda_utility');
const OfflineObserver = require('../../../offline/observable/observer');
const { OFFLINE_ACTION_NOTIFIER_TYPES } = require('../../../offline/constants');
const { LAMBDA_EVENT_PAYLOAD_LIMIT } = require('../../../integration/common_constants');

module.exports.createPosSellInvoice = async (register, invoice, clientDB, transaction) => {
  const { stockLocationId } = register;
  const schemaName = clientDB.clientDBName;

  console.log('started prepare pos sell invoice');

  const isAutherizedUser = await data_authenticator.validateDataPermission(DATA_PERMISSION_TYPES.LOCATION, [stockLocationId], clientDB);

  if (!isAutherizedUser) {
    throw new Error(UNAUTHORIZED.NAME);
  }

  const skus = invoice.products.map((product) => product.sku);
  let variants = await loadAndFormatVariants(skus, stockLocationId, clientDB, transaction);
  const locationIds = [];
  const variantsId = [];
  variants.forEach((v) => {
    v.ProductVariantToStockLocations.forEach((ProductVariantToStockLocation) => {
      locationIds.push(ProductVariantToStockLocation.stockLocationId);
    });
    variantsId.push(v.id);
  });

  const isSubscribed = await AppSubscriptionService.getMerchantSubscriptionByAppName(APP_NAME.PROMOTIONS, clientDB, transaction);
  if (isSubscribed) {
    const promotions = await PromotionService.getVariantPromotion(clientDB, [stockLocationId], invoice.products, transaction);
    const excludedVariantIds = await PromotionService.getVariantIdsInActivePromotions(clientDB, transaction);
    variants = PromotionHelper.mapPromotionsToVariants(variants, promotions, stockLocationId, excludedVariantIds);
  }
  const stockLocation = await StockLocationDAL.getStockLocationById(stockLocationId, clientDB, transaction);

  const taxConfiguration = await TaxService.getTaxConfiguration(clientDB, transaction);

  variants = await checkVariantsStockLocation(variants, stockLocationId,
    taxConfiguration, clientDB, transaction);

  const taxes = await InvoiceHelper.getTaxesForSale(variants, clientDB, transaction);

  variants.forEach((v) => {
    const [stock] = v.ProductVariantToStockLocations;
    stock.Tax = taxes.find((t) => t.id === stock.taxId);
    if (v.VariantExtraLocations) {
      v.VariantExtraLocations.forEach((el) => {
        if (el.Extra.hasOtherProduct) {
          const [extraStock] = el.Extra.ProductVariant.ProductVariantToStockLocations;
          extraStock.Tax = taxes.find((t) => t.id === stock.taxId);
        }
      });
    }
  });

  // const stocks = getStockRecordsFromVariants(variants);
  const internalPosSettings = await SettingsService.loadPosSettings(clientDB, transaction);
  const customer = !invoice.customerId ? null : dbDataToJSON(await CustomerService.getCustomerById(invoice.customerId, clientDB, transaction));
  const user = !invoice.userId ? null : await MerchantDAL.getMerchantByUserId(invoice.userId);
  const mainMerchant = await MerchantDAL.getMainMerchantInfo(clientDB.clientDBName);
  const { unit } = await WeightedProductsConfiguration.getWeightedProductConfiguration(clientDB, transaction);

  const mappedInvoice = SellInvoiceMapper.mapToPosSellInvoice(
    invoice, taxes, customer, stockLocation, register, variants, mainMerchant, unit, internalPosSettings
  );

  console.log('completed prepare pos sell invoice');

  const saleVariants = getAllUsedVariants(variants, mappedInvoice.VariantToInvoices);

  console.log('validate the pos sell');
  await validateAllowedMaxDiscount(mappedInvoice, user, schemaName, clientDB);
  validateSalePosInvoice(
    register, invoice, variants,
    stockLocation, internalPosSettings, user,
    customer, mappedInvoice, schemaName,
    saleVariants, taxConfiguration
  );

  mappedInvoice.VariantToInvoices = InvoiceHelper.addCostsToVariantToInvoices(
    mappedInvoice.VariantToInvoices, variants, taxConfiguration
  );

  let createdInvoice;
  // sell product from parked invoice
  console.log('start creating pos invoice');
  if (invoice.invoiceId) {
    const invoiceStatus = await InvoiceDAL.getInvoiceStatus(invoice.invoiceId, clientDB, transaction);

    if (invoiceStatus === 'Completed') {
      throw new Error('This order cannot be procced');
    }
    createdInvoice = await InvoiceHelper.updatePlatformPOSInvoice(invoice.invoiceId, mappedInvoice, clientDB, transaction);
    await PromotionService.deleteInvoicPromotionsByInvoiceId(invoice.invoiceId, clientDB, transaction);
    await PromotionService.createInvoicePromotions(variants, createdInvoice, clientDB, transaction);
  } else {
    createdInvoice = await InvoiceDAL.createPlatformPOSInvoice(mappedInvoice, clientDB, transaction);
    await PromotionService.createInvoicePromotions(variants, createdInvoice, clientDB, transaction);
  }

  console.log('completed creating pos invoice');
  // creating payments
  const { PayableInvoice: { id: payableInvoiceId } } = createdInvoice;
  const { payments = [] } = invoice;
  const mappedPayments = SellInvoiceMapper
    .mapToSalePosInvoicePayments(payments, customer, payableInvoiceId);
  await PaymentDAL.bulkCreateWithPaymentToPayableInvoices(mappedPayments, clientDB, transaction);

  console.log('started notifying pos invoice');

  // handling quantities and sending updates
  await handleStockReduction(createdInvoice, variants, stockLocation, clientDB, transaction);
  await InvoiceHelper.sendInvoiceNotification(createdInvoice, customer, stockLocation, mappedPayments, schemaName);
  await InvoiceHelper.updateCustomerPayment(customer, mappedInvoice.PayableInvoice, clientDB, transaction);

  const resultInvoice = await InvoiceService.getCreatedPOSInvoiceById(createdInvoice.id, clientDB, transaction);
  await OfflineObserver.notify(
    OFFLINE_ACTION_NOTIFIER_TYPES.UPDATE_PRODUCTS,
    { skus: saleVariants.map((v) => v.sku) }, clientDB, transaction
  );
  const variantHistoryLogs = VariantMapper.mapPOSSaleToDynamoDbProduct(resultInvoice, clientDB.clientDBName);
  if (sizeOf(JSON.stringify(variantHistoryLogs)) <= LAMBDA_EVENT_PAYLOAD_LIMIT) {
    await LambdaUtility.invokeLambdaAsyncPromisified('DynamoDb', variantHistoryLogs);
  }
  console.log('completed notifying pos invoice');

  return InvoiceService.getCreatedPOSInvoiceById(createdInvoice.id, clientDB, transaction);
};

const checkVariantsStockLocation = async (variants, stockLocationId, taxConfiguration, clientDB, transaction) => {
  await Promise.all(variants.map(async (v) => {
    v.ProductVariantToStockLocations = v.ProductVariantToStockLocations
      .filter((stock) => stock.stockLocationId === +stockLocationId);

    if (!v.ProductVariantToStockLocations.length) {
      const { cost, initialCost } = await VariantToStockLocationDAL
        .getVariantToStockLocationByVariantIdAndLocationId(
          v.id, 1, clientDB, { transaction }
        );
      const stock = {
        price: 0,
        retailPrice: 0,
        quantity: 0,
        initialQuantity: 0,
        wholeSalePrice: 0,
        buyPrice: 0,
        productVariantId: v.id,
        stockLocationId: +stockLocationId,
        cost,
        initialCost,
        Tax: taxConfiguration.Tax,
        taxId: taxConfiguration.taxId
      };
      const newStock = await VariantToStockLocationDAL
        .createVariantToStockLocation(stock, clientDB, transaction);
      v.ProductVariantToStockLocations = [newStock];
    }
    return v;
  }));
  return variants;
};

async function loadAndFormatVariants(skus, stockLocationId, clientDB, transaction) {
  return VariantDAL
    .getVariantsBySkusForPOSSaleInvoice(skus, stockLocationId, clientDB, false, transaction)
    .then((vars) => Promise.all(
      vars.map(async (variant) => {
        const rawVariant = variant.toJSON();
        if (rawVariant.type === VARIANT_TYPES.PACKAGE) {
          const children = await VariantDAL
            .getChildrenOfPackageVariantInStockLocation(rawVariant.id, stockLocationId, clientDB, transaction)
            .then((childVariants) => childVariants.map((child) => {
              const childObj = child.toJSON();
              childObj.packSku = variant.sku;
              childObj.packId = rawVariant.id;
              return childObj;
            }));
          return { ...rawVariant, children };
        }
        if (rawVariant.type === VARIANT_TYPES.COMPOSITE) {
          const { productId } = rawVariant;
          const [stock] = rawVariant.ProductVariantToStockLocations;
          const children = await VariantDAL
            .getChildrenOfCompositeProductInStockLocation(productId, stockLocationId, clientDB, transaction)
            .then((childVariants) => {
              const childs = childVariants.map((child) => child.toJSON());
              stock.quantity = calculateMaxToSell(childs);
              return childs;
            });
          return { ...rawVariant, children };
        }
        return rawVariant;
      })
    ));
}

module.exports.loadAndFormatVariants = loadAndFormatVariants;

async function handleStockReduction(createdInvoice, variants, stockLocation, clientDB, transaction) {
  let promises = [];
  createdInvoice.VariantToInvoices.forEach(async (invoiceVariant) => {
    const matchingVariant = InvoiceHelper.findVariantInArray(invoiceVariant.productVariantId, variants);
    const [stock] = matchingVariant.ProductVariantToStockLocations;
    const { quantity: quantityReduction } = invoiceVariant;

    if (matchingVariant.Product.type === PRODUCT_TYPES.ECARD) {
      if (InvoiceHelper.shouldManageStockLevel(matchingVariant)) {
        // mark ecards as sold
        const { VariantToInvoiceEcards = [] } = invoiceVariant;
        if (VariantToInvoiceEcards.length > 0) {
          const ecardIds = VariantToInvoiceEcards.map((card) => card.ecardId);
          promises.push(EcardDAL.updateEcardSoldStatus(ecardIds, true, clientDB, transaction));
        }
      }
    } else {
      if (invoiceVariant.type !== VARIANT_TYPES.COMPOSITE) {
        if (InvoiceHelper.shouldManageStockLevel(matchingVariant)) {
          promises.push(
            VariantToStockLocationDAL.reduceQuantityForVariantInStockLocationByStockId(
              stock.id, quantityReduction, clientDB, transaction
            )
          );
        }
      }
      if (!!invoiceVariant.type && invoiceVariant.type !== VARIANT_TYPES.CHILD) {
        const { children = [] } = matchingVariant;
        const childrenDBPromises = handleQuantityReductionForChildren(
          invoiceVariant, children, clientDB, transaction
        );
        promises = [...promises, ...childrenDBPromises];
      }

      // reducing extras with that are linked with a variant.
      const { VariantToInvoiceExtras: variantToInvoiceExtras = [] } = invoiceVariant;
      if (variantToInvoiceExtras.length > 0) {
        const allExtraVariants = matchingVariant.VariantExtraLocations
          .filter((exLoc) => !!exLoc.Extra.ProductVariant)
          .map((exLoc) => exLoc.Extra.ProductVariant);
        variantToInvoiceExtras
          .filter((invoiceExtra) => InvoiceHelper.shouldManageStockLevel(InvoiceHelper.findVariantInArray(invoiceExtra.productVariantId, allExtraVariants)))
          .forEach((invoiceExtra) => {
            const extraReduction = multiply(invoiceExtra.quantity, invoiceExtra.rate);
            promises.push(
              VariantToStockLocationDAL
                .reduceQuantityByVariantIdAndStockLocationId(
                  invoiceExtra.productVariantId, stockLocation.id, extraReduction, clientDB, transaction
                )
            );
          });
      }
    }

    // reducing quantity in VariantToTrack table.
    const trackpromises = await handleQuantityReductionForTrack(invoiceVariant, clientDB, transaction);
    promises = [...promises, ...trackpromises];
  });
  await Promise.all(promises);
  const schemaName = clientDB.clientDBName;
  const stockNotificationEvent = InvoiceHelper.getStockNotificationEvent(createdInvoice, stockLocation, schemaName);
  await KinesisUtility.sendMessage(STOCK_NOTIFICATIONS, schemaName, stockNotificationEvent);
}

async function handleQuantityReductionForTrack(invoiceVariant, clientDB, transaction) {
  const promises = [];
  const { VariantToInvoiceTracks: variantToInvoiceTracks = [] } = invoiceVariant;
  if (variantToInvoiceTracks.length > 0) {
    variantToInvoiceTracks
      .forEach((variantToInvoiceTrack) => {
        const { variantToTrackId, quantity } = variantToInvoiceTrack;
        promises.push(VariantToTrackDAL.reduceQuantityInVariantToTrack(variantToTrackId, quantity, clientDB, transaction));
      });
  }

  return promises;
}

function handleQuantityReductionForChildren(invoiceVariant, childrenVariants = [], clientDB, transaction) {
  const promises = [];
  if (invoiceVariant.type === VARIANT_TYPES.PACKAGE || invoiceVariant.type === VARIANT_TYPES.COMPOSITE) {
    childrenVariants
      .filter((childVariant) => InvoiceHelper.shouldManageStockLevel(childVariant))
      .filter((childVariant) => (invoiceVariant.type === VARIANT_TYPES.COMPOSITE && childVariant.type === VARIANT_TYPES.PACKAGE) || invoiceVariant.type === VARIANT_TYPES.PACKAGE)
      .forEach(async (childVariant) => {
        const matchingInvoicePackChild = invoiceVariant.VariantToInvoicePacks
          .find((packChild) => (packChild.parentSku || packChild.sku) === childVariant.sku);

        let actualMatchingPackRate = matchingInvoicePackChild.rate;
        let actualVariantStockLocations = childVariant.ProductVariantToStockLocations;

        if (matchingInvoicePackChild.parentSku) {
          const compositeChild = invoiceVariant.CompositeVariantToInvoiceParts.find((ic) => ic.sku === matchingInvoicePackChild.parentSku);
          actualMatchingPackRate = multiply(compositeChild.rate, actualMatchingPackRate);
          const [childPack] = childVariant.VariantToPackages;
          actualVariantStockLocations = childPack.ProductVariant.ProductVariantToStockLocations;
        }

        const [childStock] = actualVariantStockLocations;

        const quantityReduction = multiply(invoiceVariant.quantity, actualMatchingPackRate);
        const { id: stockId } = childStock;
        promises.push(
          VariantToStockLocationDAL.reduceQuantityForVariantInStockLocationByStockId(stockId, quantityReduction, clientDB, transaction)
        );
      });
  }
  if (invoiceVariant.type === VARIANT_TYPES.COMPOSITE) {
    childrenVariants
      .filter((childVariant) => InvoiceHelper.shouldManageStockLevel(childVariant))
      .forEach((childVariant) => {
        if (childVariant.type === VARIANT_TYPES.CHILD) {
          const matchingInvoiceCompositePart = invoiceVariant.CompositeVariantToInvoiceParts
            .find((compositeChild) => compositeChild.sku === childVariant.sku);
          const quantityReduction = multiply(invoiceVariant.quantity, matchingInvoiceCompositePart.rate);
          const [childStock] = childVariant.ProductVariantToStockLocations;
          const { id: stockId } = childStock;
          promises.push(
            VariantToStockLocationDAL.reduceQuantityForVariantInStockLocationByStockId(stockId, quantityReduction, clientDB, transaction)
          );
        }
      });
  }
  return promises;
}

// function getStockRecordsFromVariants(variants) {
//   const stocks = [];
//   variants.forEach((variant) => {
//     const [stock] = variant.ProductVariantToStockLocations;
//     if (stock) {
//       stocks.push(stock);
//     }
//   });
//   return stocks;
// }

function getAllUsedVariants(variants, invoiceVariants) {
  const variantArr = [];

  invoiceVariants.forEach((matchingVariant) => {
    const variant = variants.find((i) => i.sku === matchingVariant.sku);
    pushUsedVariantForSell(variantArr, variant, matchingVariant.quantity);

    if (variant.type === VARIANT_TYPES.COMPOSITE) {
      variant.children.forEach((c) => {
        const [child] = c.VariantToComposites;
        const compositeQuantity = multiply(child.rate || 1, matchingVariant.quantity);

        if (c.type === VARIANT_TYPES.PACKAGE) {
          const [childPack] = c.VariantToPackages;
          const packQuantity = multiply(childPack.rate, compositeQuantity);
          pushUsedVariantForSell(variantArr, childPack.ProductVariant, packQuantity);
        }

        pushUsedVariantForSell(variantArr, c, compositeQuantity);
      });
    } else if (variant.type === VARIANT_TYPES.PACKAGE) {
      variant.children.forEach((p) => {
        const [child] = p.VariantToPackages;
        const packQuantity = multiply(child.rate, matchingVariant.quantity);
        pushUsedVariantForSell(variantArr, p, packQuantity);
      });
    } else if (variant.VariantExtraLocations && variant.VariantExtraLocations.length > 0) {
      matchingVariant.VariantToInvoiceExtras.forEach((extra) => {
        const matchingExtra = variant.VariantExtraLocations.find((v) => v.extraId === extra.extraId);
        if (matchingExtra.Extra.hasOtherProduct) {
          const { ProductVariant } = matchingExtra.Extra;
          pushUsedVariantForSell(variantArr, ProductVariant, multiply(extra.quantity, extra.rate || 1));
        }
      });
    }
  });

  return variantArr;
}

function pushUsedVariantForSell(variantArr, variant, quantity) {
  const exist = variantArr.find((s) => s.sku === variant.sku);

  if (!exist) variantArr.push({ ...variant, requiredQuantity: quantity });
  else exist.requiredQuantity = add(exist.requiredQuantity || 0, quantity);
}

module.exports.handleStockReduction = handleStockReduction;
