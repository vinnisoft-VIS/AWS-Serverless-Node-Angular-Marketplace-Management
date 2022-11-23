const sizeOf = require('object-sizeof');

const { VARIANT_TYPES, PRODUCT_TYPES } = require('../../../utils/constants/constants');
const StockLocationDAL = require('../../../stock-location/dal/stock_location_dal');
const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const ReturnInvoiceMapper = require('./utilities/return_invoice_mapper');
const ReturnInvoiceVariantsStocks = require('./return_invoice_variants_stock_helper');
const InvoiceDAL = require('../invoices/dal/invoice_dal');
const PaymentDAL = require('../../../payment/dal/payment_dal');
const PaymentService = require('../../../payment/payment_service');
const VariantToTrackDAL = require('../../../variant/dal/variant_to_track_dal');
const VariantToStockLocationDAL = require('../../../variant/dal/variant_to_stock_location_dal');
const { validateReturnPosInvoice } = require('./validation/return_pos_invoice_validation');
const { multiply, add } = require('../../../utils/calculation_utilities');
const { STREAM: { STOCK_NOTIFICATIONS } } = require('../../../utils/constants/kinesis');
const KinesisUtility = require('../../../utils/kinesis_utility');
const WeightedProductsConfiguration = require('../../../weighted_product_configuration/weighted_product_configuration_service');
const InvoiceHelper = require('./invoice_helper');
const CustomerService = require('../../../customers/customers_service');
const { dbDataToJSON } = require('../../../utils/database_utils');
const {
  OPERATION_FAILURE_MESSAGE: {
    PRODUCT_NOT_SOLD_TO_RETURN
  }
} = require('../../../utils/application_messages');
const InvoiceService = require('../invoices/invoice_service');
const SettingsService = require('../settings/settings_service');
const EcardDAL = require('../../../product/dal/ecards_dal');
const VariantMapper = require('../../../variant/mapper/nosql/dynamodb/variant_mapper');
const LambdaUtility = require('../../../utils/lambda_utility');
const { LAMBDA_EVENT_PAYLOAD_LIMIT } = require('../../../integration/common_constants');

module.exports.createPosReturnInvoice = async (register, returnInvoice, clientDB, transaction) => {
  const schemaName = clientDB.clientDBName;
  const { stockLocationId } = register;
  const stockLocation = await StockLocationDAL.getStockLocationById(stockLocationId, clientDB, transaction);
  const { unit } = await WeightedProductsConfiguration.getWeightedProductConfiguration(clientDB, transaction);
  const sellInvoice = await InvoiceDAL.getPOSInvoiceById(returnInvoice.saleInvoiceId, clientDB, transaction);
  const previousReturnInvoices = await InvoiceDAL.getPosReturnInvoices(returnInvoice.saleInvoiceId, clientDB, transaction);
  mergeSellInvoiceAndOldReturnedInvoices(sellInvoice, previousReturnInvoices);
  const customer = dbDataToJSON(await CustomerService.getCustomerById(returnInvoice.customerId, clientDB, transaction));
  const user = !returnInvoice.userId ? null : await MerchantDAL.getMerchantByUserId(returnInvoice.userId);
  const invoiceProductsVariants = await ReturnInvoiceVariantsStocks.loadAndInitEmptyStocks(returnInvoice, sellInvoice, stockLocationId, clientDB, transaction);
  const internalPosSettings = await SettingsService.loadPosSettings(clientDB, transaction);

  let stocks = [];
  invoiceProductsVariants.forEach((variant) => {
    stocks = stocks.concat(...variant.ProductVariantToStockLocations);
  });

  const mappedRtnInvoice = ReturnInvoiceMapper.mapToPosReturnInvoice(
    returnInvoice, sellInvoice, invoiceProductsVariants, customer, stockLocation, register, unit, internalPosSettings
  );
  validateReturnPosInvoice(
    returnInvoice, sellInvoice, mappedRtnInvoice,
    invoiceProductsVariants, register, stockLocation,
    user, customer, schemaName
  );

  const createdInvoice = await InvoiceDAL.createPlatformPOSInvoice(mappedRtnInvoice, clientDB, transaction);

  // creating payments
  const { PayableInvoice: { id: payableInvoiceId } } = createdInvoice;
  const { payments = [] } = returnInvoice;
  const mappedPayments = ReturnInvoiceMapper.mapToInvoicePayments(payments, customer, payableInvoiceId);
  const debitPayment = mappedPayments.find((p) => !p.paymentMethodId);
  const paidPayments = mappedPayments.filter((p) => !!p.paymentMethodId);

  await PaymentDAL.bulkCreateWithPaymentToPayableInvoices(paidPayments, clientDB, transaction);
  if (debitPayment && debitPayment.paidAmount !== 0) {
    await PaymentService.addPaymentDetailsForPosReturnDebit(
      -1 * debitPayment.paidAmount, { name: 'Debit' }, customer.id,
      [payableInvoiceId], sellInvoice, clientDB, transaction
    );
  }

  // handling quantities and sending updates
  await handleReturnedStocks(createdInvoice, invoiceProductsVariants, stockLocation, clientDB, transaction);
  await InvoiceHelper.sendInvoiceNotification(createdInvoice, customer, stockLocation, paidPayments, schemaName);
  const debitAmount = debitPayment ? debitPayment.paidAmount : 0;
  const paidAmount = paidPayments.reduce((amount, payment) => add(amount, payment.paidAmount), 0);
  await InvoiceHelper.updateCustomerPayment(customer, { paidAmount, debitAmount }, clientDB, transaction);

  const resultInvoice = await InvoiceService.getCreatedPOSInvoiceById(createdInvoice.id, clientDB, transaction);
  const variantHistoryLogs = VariantMapper.mapPOSSaleToDynamoDbProduct(resultInvoice, clientDB.clientDBName);
  if (sizeOf(JSON.stringify(variantHistoryLogs)) <= LAMBDA_EVENT_PAYLOAD_LIMIT) {
    await LambdaUtility.invokeLambdaAsyncPromisified('DynamoDb', variantHistoryLogs);
  }
  return resultInvoice;
};

function mergeSellInvoiceAndOldReturnedInvoices(sellInvoice, previouseReturnInvoices) {
  rebaseVariantToInvoiceExtras(sellInvoice);
  previouseReturnInvoices.forEach((oldReturnInvoice) => {
    rebaseVariantToInvoiceExtras(oldReturnInvoice);
    oldReturnInvoice.VariantToInvoices.forEach((rVariantToInvoice) => {
      const sVariantToInvoice = sellInvoice.VariantToInvoices.find(
        (variantToInv) => isVariantToInvoiceMatching(variantToInv, rVariantToInvoice)
      );
      if (!sVariantToInvoice) {
        throw new Error(PRODUCT_NOT_SOLD_TO_RETURN);
      }
      sVariantToInvoice.quantity = add(sVariantToInvoice.quantity, rVariantToInvoice.quantity);
      sVariantToInvoice.totalExclusive = add(sVariantToInvoice.totalExclusive, rVariantToInvoice.totalExclusive);
      sVariantToInvoice.totalInclusive = add(sVariantToInvoice.totalInclusive, rVariantToInvoice.totalInclusive);
      sVariantToInvoice.discount = add(sVariantToInvoice.discount, rVariantToInvoice.discount);
    });
  });
  sellInvoice.VariantToInvoices = sellInvoice.VariantToInvoices.filter((sVariantToInvoice) => sVariantToInvoice.quantity > 0);
}

function rebaseVariantToInvoiceExtras(invoice) {
  invoice.VariantToInvoices
    .filter((vToI) => vToI.VariantToInvoiceExtras.length > 0)
    .forEach((vToI) => {
      vToI.VariantToInvoiceExtras.forEach((ex) => ex.quantity /= vToI.quantity);
    });
}

function isVariantToInvoiceMatching(sVariantToInvoice, rVariantToInvoice) {
  const sExtras = sVariantToInvoice.VariantToInvoiceExtras;
  const rExtras = rVariantToInvoice.VariantToInvoiceExtras;
  const sameSku = sVariantToInvoice.sku === rVariantToInvoice.sku;
  const sameExtraLength = sExtras.length === rExtras.length;
  const sameItemPrice = sVariantToInvoice.costInclusive === rVariantToInvoice.costInclusive;
  const matchedExtras = sExtras.filter(
    (sExtra) => rExtras.find((rExtra) => rExtra.name === sExtra.name &&
    rExtra.quantity === sExtra.quantity &&
    rExtra.price === sExtra.price));
  return sameSku && sameExtraLength && sameItemPrice && matchedExtras.length === sExtras.length;
}

async function handleReturnedStocks(
  returnInvoice, relatedVariants, stockLocation, clientDB, transaction
) {
  let variantsToQuantities = [];
  const tracksToQuantities = [];
  let ecardIds = [];
  returnInvoice.VariantToInvoices.forEach((invoiceVariant) => {
    const matchingVariant = InvoiceHelper.findVariantInArray(
      invoiceVariant.productVariantId, relatedVariants
    );

    if (matchingVariant) {
      if (matchingVariant.Product.type === PRODUCT_TYPES.ECARD) {
        ecardIds = [...ecardIds, ...invoiceVariant.VariantToInvoiceEcards.map(e => e.ecardId) ];
      } else {
        const { quantity: quantityReduction } = invoiceVariant;
        if (invoiceVariant.type !== VARIANT_TYPES.COMPOSITE) {
          if (InvoiceHelper.shouldManageStockLevel(matchingVariant)) {
            variantsToQuantities.push({
              productVariantId: invoiceVariant.productVariantId, quantityReduction
            });
          }
        }

        if (invoiceVariant.type === VARIANT_TYPES.COMPOSITE) {
          const compositePartsVariantsToQuantities = mapCompositePartsQuantities(
            invoiceVariant, relatedVariants
          );

          if (invoiceVariant.VariantToInvoicePacks) {
            const packVariantsToQuantities = invoiceVariant.VariantToInvoicePacks.map((pack) => {
              const compositeChild = invoiceVariant.CompositeVariantToInvoiceParts.find((cv) => cv.sku === pack.parentSku);
              return {
                productVariantId: pack.productVariantId,
                quantityReduction: multiply(invoiceVariant.quantity, multiply(compositeChild.rate, pack.rate))
              };
            });

            variantsToQuantities = [...variantsToQuantities, ...packVariantsToQuantities];
          }

          variantsToQuantities = [...variantsToQuantities, ...compositePartsVariantsToQuantities];
        }

        if (invoiceVariant.type === VARIANT_TYPES.PACKAGE) {
          const packVariantsToQuantities = mapPackQuantities(
            invoiceVariant, relatedVariants
          );
          variantsToQuantities = [...variantsToQuantities, ...packVariantsToQuantities];
        }

        if (invoiceVariant.VariantToInvoiceExtras.length > 0) {
          const extraVariantsToQuantities = mapExtraQuantities(
            invoiceVariant, relatedVariants
          );
          variantsToQuantities = [...variantsToQuantities, ...extraVariantsToQuantities];
        }

        if (invoiceVariant.VariantToInvoiceTracks.length > 0) {
          const { VariantToInvoiceTracks: variantToInvoiceTracks = [] } = invoiceVariant;
          variantToInvoiceTracks
            .forEach((variantToInvoiceTrack) => {
              const { variantToTrackId, quantity } = variantToInvoiceTrack;
              tracksToQuantities.push({ variantToTrackId, quantityReduction: quantity });
            });
        }
      }
    }
  });
  await returnVariantsQuantities(variantsToQuantities, stockLocation.id, clientDB, transaction);
  await returnTracksQuantities(tracksToQuantities, clientDB, transaction);
  await EcardDAL.updateEcardSoldStatus(ecardIds, false, clientDB, transaction);
  const schemaName = clientDB.clientDBName;
  const stockNotificationEvent = InvoiceHelper.getStockNotificationEvent(returnInvoice, stockLocation, schemaName);
  await KinesisUtility.sendMessage(STOCK_NOTIFICATIONS, schemaName, stockNotificationEvent);
}

function mapCompositePartsQuantities(invoiceVariant, relatedVariants = []) {
  return invoiceVariant.CompositeVariantToInvoiceParts
    .filter((cPart) => InvoiceHelper.shouldManageStockLevel(InvoiceHelper.findVariantInArray(cPart.productVariantId, relatedVariants)))
    .map((cPart) => ({
      productVariantId: cPart.productVariantId,
      quantityReduction: multiply(invoiceVariant.quantity, cPart.rate)
    }));
}

function mapPackQuantities(invoiceVariant, relatedVariants = []) {
  return invoiceVariant.VariantToInvoicePacks
    .filter((pack) => InvoiceHelper.shouldManageStockLevel(InvoiceHelper.findVariantInArray(pack.productVariantId, relatedVariants)))
    .map((pack) => ({
      productVariantId: pack.productVariantId,
      quantityReduction: multiply(invoiceVariant.quantity, pack.rate)
    }));
}

function mapExtraQuantities(invoiceVariant, relatedVariants = []) {
  return invoiceVariant.VariantToInvoiceExtras
    .filter((extra) => extra.productVariantId && InvoiceHelper.shouldManageStockLevel(InvoiceHelper.findVariantInArray(extra.productVariantId, relatedVariants)))
    .map((extra) => ({
      productVariantId: extra.productVariantId,
      quantityReduction: extra.quantity * extra.rate
    }));
}

async function returnVariantsQuantities(variantsToQuantities, stockLocationId, clientDB, transaction) {
  const groupedVariantsToQuantities = [];
  variantsToQuantities.reduce((res, value) => {
    if (!res[value.productVariantId]) {
      res[value.productVariantId] = {
        quantityReduction: 0,
        productVariantId: value.productVariantId
      };
      groupedVariantsToQuantities.push(res[value.productVariantId]);
    }
    res[value.productVariantId].quantityReduction += value.quantityReduction;
    return res;
  }, {});
  const promises = groupedVariantsToQuantities.map(async (variantToQuantity) => {
    await VariantToStockLocationDAL.reduceQuantityByVariantIdAndStockLocationId(
      variantToQuantity.productVariantId, stockLocationId, variantToQuantity.quantityReduction, clientDB, transaction
    );
  });
  return Promise.all(promises);
}

async function returnTracksQuantities(tracksToQuantities, clientDB, transaction) {
  const groupedTracksToQuantities = [];
  tracksToQuantities.reduce((res, value) => {
    if (!res[value.variantToTrackId]) {
      res[value.variantToTrackId] = {
        quantityReduction: 0,
        variantToTrackId: value.variantToTrackId
      };
      groupedTracksToQuantities.push(res[value.variantToTrackId]);
    }
    res[value.variantToTrackId].quantityReduction += value.quantityReduction;
    return res;
  }, {});
  const promises = groupedTracksToQuantities.map(async (trackToQuantity) => {
    await VariantToTrackDAL.reduceQuantityInVariantToTrack(
      trackToQuantity.variantToTrackId, trackToQuantity.quantityReduction, clientDB, transaction
    );
  });
  return Promise.all(promises);
}
