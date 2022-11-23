const PosInvoiceValidation = require('./pos_invoice_validation');
const {
  add, subtract,
  divide
} = require('../../../../utils/calculation_utilities');
const { VARIANT_TRACK_TYPES, PRODUCT_TYPES } = require('../../../../utils/constants/constants');
const { getVariantQuantity } = require('../../../../variant/utils/variant_calculation');
const { calculateVariantPrice, calculateExclusivePrice, calculateExclusive } = require('../utilities/invoice_mapper_helper');
const { PriceLessThanCost } = require('../../errors/price_less_than_cost');
const MerchantDAL = require('../../../../merchant/dal/merchant_dal');
const { ExceedAllowedDiscountPercentage } = require('../../errors/exceed_allowed_discount_percentage');

module.exports.validateAllowedMaxDiscount = async (mappedInvoice, user, schemaName, clientDB) => {
  const maxDiscountPercent = await MerchantDAL.getMaxDiscountPercentage(user.id, clientDB);
  const maxDiscount = divide(maxDiscountPercent, 100) || 0;
  mappedInvoice.VariantToInvoices.forEach((product) => {
    const discountRate = product.discountRate || 0;
    if (discountRate > maxDiscount) {
      const message = `discount percentage should not exceed the allowed user discount, that's is ${maxDiscount}`;
      throw new ExceedAllowedDiscountPercentage(message, schemaName);
    }
  });
};

module.exports.validateSalePosInvoice = (
  register, invoice, variants,
  stockLocation, internalPosSettings, user,
  customer, mappedInvoice, schemaName,
  saleVariants, taxConfiguration
) => {
  PosInvoiceValidation.validatePosInvoice(register, invoice, variants, stockLocation, user, customer, schemaName);

  invoice.products.forEach((product) => {
    const matchingVariant = variants.find((variant) => variant.sku === product.sku);
    if (!matchingVariant) {
      throw new Error(`product with sku: ${product.sku} is not found`);
    } else if (matchingVariant) {
      const costExclusive = calculateExclusivePrice(matchingVariant, taxConfiguration, 'cost');
      const priceExlusive = calculateExclusive(product.price, matchingVariant, taxConfiguration);
      if (getPOSSettingValue(internalPosSettings, 'sell.on.price.lt.cost') === '0' && priceExlusive < costExclusive) {
        const message = `You can’t sell '${matchingVariant.name || matchingVariant.Product.name}'. it has cost > price in the location.`;
        throw new PriceLessThanCost(message, schemaName);
      }
    }
  });

  if (
    mappedInvoice.PayableInvoice
    && mappedInvoice.PayableInvoice.discountAmount > 0
    && getPOSSettingValue(internalPosSettings, 'sell.on.price.lt.cost') === '0'
  ) {
    (mappedInvoice.VariantToInvoices || []).forEach((mappedVariant) => {
      const matchingVariant = variants.find((variant) => variant.sku === mappedVariant.sku);
      const [stock] = (matchingVariant.ProductVariantToStockLocations || []);
      const { cost = 0 } = stock || {};
      if (mappedVariant.costExclusive < cost) {
        const message = `You can’t sell '${matchingVariant.name || matchingVariant.Product.name}'. it has cost > price in the location.`;
        throw new PriceLessThanCost(message, schemaName);
      }
    });
  }

  saleVariants.forEach((product) => {
    let availableLocationQuantity;
    if (product.Product && product.Product.type === PRODUCT_TYPES.ECARD) {
      const matchedInvoice = mappedInvoice.VariantToInvoices.find((variant) => (variant.sku === product.sku));
      availableLocationQuantity = matchedInvoice.availableLocationQuantity;
    } else {
      availableLocationQuantity = getVariantQuantity(product);
    }

    if (product.manageStockLevel && product.requiredQuantity > availableLocationQuantity && getPOSSettingValue(internalPosSettings, 'sell.on.quantity.lt.zero') === '0') {
      throw {
        message: `product '${product.name}' with sku: '${product.sku}' doesn't have enough quantity.`,
        status: 409
      };
    }
  });

  // if (stockLocation && !stockLocation.isActive) {
  //   throw new Error('Stock location is not active');
  // }

  let totalPaid = 0;
  invoice.payments.forEach((payment) => {
    totalPaid = add(totalPaid, payment.amount);
  });
  // TODO removed because it is causing issues for clients.
  // if (subtract(totalPaid, mappedInvoice.totalTaxInclusive) >= 0.01) {
  //   // throw new Error(`you can't pay more than the invoice total.`);
  // }

  if (!mappedInvoice.customerId && subtract(mappedInvoice.totalTaxInclusive, totalPaid) >= 0.01) {
    throw new Error(`you require to pay the invoice total.`);
  }

  mappedInvoice.VariantToInvoices.forEach((variantToInvoice) => {
    const matchingVariant = variants.find((variant) => variant.sku === variantToInvoice.sku);
    const [stock] = matchingVariant.ProductVariantToStockLocations;
    validateTrackedVariant(variantToInvoice, stock.VariantToTracks);
    validateExtras(variantToInvoice, matchingVariant.VariantExtraLocations, variantToInvoice.quantity);

    if (matchingVariant.Product.type === PRODUCT_TYPES.ECARD) {
      if (!(
        variantToInvoice.quantity > 0 &&
        variantToInvoice.VariantToInvoiceEcards &&
        variantToInvoice.quantity === variantToInvoice.VariantToInvoiceEcards.length
      )) {
        throw {
          message: `product '${matchingVariant.name}' with sku: '${matchingVariant.sku}' doesn't have enough quantity.`,
          status: 409
        };
      }
    }
  });
};
function getPOSSettingValue(internalPosSettings, settingName) {
  let value;
  const existSetting = internalPosSettings.find((s) => s.settingName === settingName);
  if (existSetting) {
    value = existSetting.settingValue;
  }
  return value;
}
function validateTrackedVariant(variantToInvoice, variantToTracks) {
  if (variantToInvoice.trackType) {
    // insuring no duplicates
    const variantToInvoiceTracks = [...variantToInvoice.VariantToInvoiceTracks];
    const trackNumbers = Array.from(new Set(
      variantToInvoiceTracks.map((invoiceVariantTrack) => invoiceVariantTrack.trackNo)
    ));
    const filteredVariantToInvoiceTracks = [];
    trackNumbers.forEach((trackNumber) => {
      filteredVariantToInvoiceTracks
        .push(variantToInvoiceTracks.find((batch) => batch.trackNo === trackNumber));
    });
    if (variantToInvoice.trackType === VARIANT_TRACK_TYPES.SERIAL) {
      if (filteredVariantToInvoiceTracks.length !== variantToInvoice.quantity) {
        throw new Error(`entered serials don't match the number of sold products.`);
      }
      const nonSavedSerials = filteredVariantToInvoiceTracks
        .filter((track) => !track.variantToTrackId);
      if (nonSavedSerials.length > 0) {
        const serials = nonSavedSerials.map((serial) => serial.trackNo);
        throw new Error(`serials [${serials}] are not associated with sku '${variantToInvoice.sku}'.`);
      }
    } else if (variantToInvoice.trackType === VARIANT_TRACK_TYPES.BATCH) {
      const notFoundTracks = [];
      let totalQuantity = 0;
      filteredVariantToInvoiceTracks.forEach((track) => {
        if (!track.variantToTrackId) {
          notFoundTracks.push(track.trackNo);
        }
        totalQuantity = add(totalQuantity, track.quantity);
      });
      if (notFoundTracks.length > 0) {
        throw new Error(`batch numbers [${notFoundTracks}] are not found for product '${variantToInvoice.sku}'.`);
      }
    }
  }
}

function validateExtras(variantToInvoice, variantExtraLocations = [], productQuantity) {
  const { VariantToInvoiceExtras: variantToInvoiceExtras = [] } = variantToInvoice;

  variantToInvoiceExtras.forEach((invoiceExtra) => {
    const matchingExtra = variantExtraLocations
      .find(({ extraId }) => extraId === invoiceExtra.extraId);
    if (!matchingExtra) {
      throw new Error(`extra with id '${invoiceExtra.id} doesn't belong to product '${variantToInvoice.name}'.`);
    }
    const { Extra: { ProductVariant: variant, rate } } = matchingExtra;
    if (variant) {
      if (variant.isWeightedScale) {
        throw new Error(`extra ${matchingExtra.name} is weighted product. cannot sell weighted extra.`);
      }
      if (variant.trackType) {
        throw new Error(`extra ${matchingExtra.name} is tracked by ${variant.trackType}. cannot sell a tracked extra.`);
      }
    }
  });
}
