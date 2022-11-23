const {
  INVOICE_STATUS, INVOICES_TYPES, PAYMENT_OPTIONS,
  PAYABLE_INVOICE_TAX_TYPE, PAYABLE_INVOICE_PAYMENT_STATUSES,
  PAYMENTS_TYPES
} = require('../../../../invoice/utils/constants');
const {
  add, multiply, divide, subtract, roundTo2Decimals
} = require('../../../../utils/calculation_utilities');
const { VARIANT_TYPES, VARIANT_TRACK_TYPES, PRODUCT_TYPES } = require('../../../../utils/constants/constants');
const { getAvailableLocationQuantity } = require('../../../../variant/utils/variant_calculation');
const { calculateExtrasExclusivePrice, calculateExtrasTotalTaxes } = require('./invoice_mapper_helper');
const { PAYMENT_PROCESSOR } = require('../../payment_processors/constants');
const { DISCOUNT_TYPES } = require('../../../promotions/constants');

module.exports.mapToPosSellInvoice = (invoice, taxes, customer, stockLocation, register, variants, mainMerchant, weightUnit, posSettings, isParked = false) => {
  const { generalDiscountType, generalDiscountAmount } = invoice;
  const variantsToInvoice = mapVariantToInvoicesForSellPos(
    invoice.products, variants, taxes,
    invoice.taxation, weightUnit, generalDiscountAmount,
    generalDiscountType, isParked
  );
  const subTotalTaxExclusive = calculateSubtotalTaxExclusive(variantsToInvoice);
  const totalTax = calculateTotalTax(variantsToInvoice);

  const registerJson = JSON.stringify({ name: register.name, StockLocation: stockLocation });
  const totalTaxInclusive = add(subTotalTaxExclusive, totalTax);
  const paidAmount = (!isParked && invoice.payments) ? invoice.payments.reduce((amount, payment) => add(amount, payment.amount), 0) : 0;
  const hasPostPay = customer && subtract(totalTaxInclusive, paidAmount) >= 0.01;
  const totalAfterPayment = subtract(totalTaxInclusive, paidAmount);
  let paymentMethodsString = invoice.payments.map((p) => p.PaymentMethod.name).join(', ');
  const paymentMethodId = invoice.payments.length === 1 ? invoice.payments[0].PaymentMethod.id : undefined;
  if (hasPostPay) {
    paymentMethodsString = paymentMethodsString.length > 0 ? `${paymentMethodsString}, PostPay` : 'PostPay';
  }

  const status = isParked ? INVOICE_STATUS.OPEN : INVOICE_STATUS.COMPLETED;
  return {
    status,
    registerJson,
    companyName: mainMerchant.companyName,
    taxNumber: mainMerchant.taxNumber,
    userId: invoice.userId,
    notes: invoice.notes,
    customerName: customer ? customer.name : undefined,
    customerId: customer ? customer.id : undefined,
    type: INVOICES_TYPES.POS_SALE,
    registerId: register.id,
    stockLocationName: stockLocation.name,
    stockLocationId: stockLocation.id,
    ...(!isParked ? {
      subTotalTaxExclusive: roundTo2Decimals(subTotalTaxExclusive),
      totalTax: roundTo2Decimals(totalTax),
      totalTaxInclusive: roundTo2Decimals(totalTaxInclusive),
      supplyDate: invoice.supplyDate,
      settings: JSON.stringify(posSettings.map((s) => s.toJSON())),
      PayableInvoice: {
        discountAmount: generalDiscountAmount,
        discountType: generalDiscountType,
        taxation: invoice.taxation,
        restForCustomer: invoice.restForCustomer,
        paymentOption: hasPostPay ? PAYMENT_OPTIONS.PAY_LATER : PAYMENT_OPTIONS.PAY_NOW,
        totalBeforePayment: roundTo2Decimals(totalTaxInclusive),
        totalAfterPayment: roundTo2Decimals(totalAfterPayment),
        paidAmount,
        debitAmount: roundTo2Decimals(totalAfterPayment),
        paymentStatus: getPaymentStatus(paidAmount, totalAfterPayment),
        paymentMethod: paymentMethodsString,
        paymentMethodId,
        paymentDueDate: Date.now()
      }
    } : {
      PayableInvoice: {
        discountAmount: generalDiscountAmount,
        discountType: generalDiscountType,
      }
    }),
    VariantToInvoices: variantsToInvoice,
    completeDate: isParked ? undefined : Date.now(),
  };
};

function getPaymentStatus(paidAmount, debitAmount) {
  let status = null;
  if (paidAmount > 0 && debitAmount < 0.01) {
    status = PAYABLE_INVOICE_PAYMENT_STATUSES.PAID;
  } else if (paidAmount === 0 && debitAmount >= 0.01) {
    status = PAYABLE_INVOICE_PAYMENT_STATUSES.NOT_PAID_DEPTOR;
  } else if (paidAmount > 0 && debitAmount >= 0.01) {
    status = PAYABLE_INVOICE_PAYMENT_STATUSES.PARTIALLY_PAID_DEPTOR;
  }
  return status;
}

function mapVariantToInvoicesForSellPos(
  invoiceProducts, variants, taxes, taxation, weightUnit, invoiceDiscountAmount = 0, invoiceDiscountType = '', isParked = false
) {
  const variantsToInvoice = invoiceProducts.map((product) => {
    const matchingVariant = variants.find((variant) => variant.sku === product.sku);
    const { children = [] } = matchingVariant;
    const [stock] = matchingVariant.ProductVariantToStockLocations;
    let packCost;
    if (children) {
      // const childVariant = children.filter((childVariant) => childVariant.type === "child");
      const baseVariant = children.find((childVariant) => childVariant.packSku === product.sku &&
        childVariant.type === 'child');
      if (baseVariant) {
        const { VariantToPackages } = baseVariant;
        const pack = VariantToPackages.find((p) => p.packageVariantId === baseVariant.packId);
        if (pack) {
          const packRate = pack.rate;
          const baseVariantCost = baseVariant.ProductVariantToStockLocations.find(
            (baseStock) => baseStock.stockLocationId === stock.stockLocationId
          ).cost;
          packCost = +(baseVariantCost * packRate);
        }
      }
    }

    const matchingTax = taxes.find((tax) => tax.id === stock.taxId);
    const taxRate = divide(matchingTax.rate, 100);
    const discountRate = divide(product.discountPercentage, 100) || 0;
    const originalPriceEx = calculateProductCostExclusive(taxation, product, taxRate);

    const { promotion: promo } = matchingVariant;
    if (promo && product.promotionId && +promo.id === +product.promotionId) {
      if (promo.discountType === DISCOUNT_TYPES.FIXED) {
        product.price = subtract(product.price, promo.amount);
      } else if (promo.discountType === DISCOUNT_TYPES.PERCENTAGE) {
        const promoRate = divide(promo.amount, 100) || 0;
        product.price = multiply(product.price, subtract(1, promoRate));
      }
    }
    if (discountRate) {
      product.price = multiply(product.price, subtract(1, discountRate));
    }
    const costExclusive = calculateProductCostExclusive(taxation, product, taxRate);
    const costInclusive = calculateProductCostInclusive(taxation, product, taxRate);
    const totalExclusive = calculateProductTotalExclusive(taxation, product, taxRate);
    const totalInclusive = calculateProductTotalInclusive(taxation, product, taxRate);
    const taxAmount = subtract(totalInclusive, totalExclusive);
    const discount = multiply(discountRate, multiply(product.quantity, originalPriceEx));

    const invoiceToVariant = {
      sku: product.sku,
      name: product.name,
      quantity: product.quantity,
      availableLocationQuantity: matchingVariant.Product.type === PRODUCT_TYPES.ECARD ? matchingVariant.Ecards.length : stock.quantity,
      costExclusive,
      // passed only for validation
      discountRate,
      costInclusive,
      totalExclusive,
      totalInclusive,
      packCost,
      discount,
      taxAmount,
      productVariantId: matchingVariant.id,
      productType: matchingVariant.Product.type,
      taxId: matchingTax.id,
      taxJson: JSON.stringify(matchingTax),
      type: matchingVariant.type
    };
    const { extras } = product;
    if (extras) {
      invoiceToVariant.VariantToInvoiceExtras = mapExtrasToVariantToInvoiceExtras(
        extras, matchingVariant.VariantExtraLocations, taxation, stock.taxId, taxes,
        product.quantity
      );
    }
    if (matchingVariant.type === VARIANT_TYPES.COMPOSITE) {
      invoiceToVariant.CompositeVariantToInvoiceParts = mapToCompositeVariantToInvoiceParts(children);

      const childVariants = children.filter((c) => c.type === VARIANT_TYPES.PACKAGE);

      const isAnyChildhaveTrack = childVariants.find((cv) => {
        const [childPack] = cv.VariantToPackages;
        childPack.ProductVariant.trackType === VARIANT_TRACK_TYPES.SERIAL || childPack.ProductVariant.trackType === VARIANT_TRACK_TYPES.BATCH;
      });

      if (isAnyChildhaveTrack) throw new Error('UnSupported type of product tries to sell');

      if (childVariants.length > 0) {
        childVariants.forEach((cv) => {
          const [childPack] = cv.VariantToPackages;
          invoiceToVariant.VariantToInvoicePacks = (invoiceToVariant.VariantToInvoicePacks || []).concat(mapToVariantToInvoicePacks([{
            ...childPack.ProductVariant, VariantToPackages: [{ ...childPack, parentSku: cv.sku }]
          }]));
        });
      }
    }
    if (matchingVariant.type === VARIANT_TYPES.PACKAGE) {
      invoiceToVariant.VariantToInvoiceTracks = mapPackTracks(product, matchingVariant);

      invoiceToVariant.VariantToInvoicePacks = mapToVariantToInvoicePacks(children);
    }
    if (matchingVariant.trackType === VARIANT_TRACK_TYPES.SERIAL) {
      const { serials = [] } = product;
      invoiceToVariant.VariantToInvoiceTracks = (invoiceToVariant.VariantToInvoiceTracks || []).concat(mapToVariantToInvoiceTrackingSerials(stock.VariantToTracks, serials, stock));
    }
    if (matchingVariant.trackType === VARIANT_TRACK_TYPES.BATCH) {
      const { batches = [] } = product;
      invoiceToVariant.VariantToInvoiceTracks = (invoiceToVariant.VariantToInvoiceTracks || []).concat(mapToVariantToInvoiceTrackingBatches(stock.VariantToTracks, batches, stock));
    }
    if (matchingVariant.isWeightedScale) {
      invoiceToVariant.WeightedVariantToInvoice = mapToWeightedVariantToInvoice(weightUnit);
    }
    if (matchingVariant.Product.type === PRODUCT_TYPES.ECARD) {
      invoiceToVariant.VariantToInvoiceEcards = mapEcardsToInvoiceEcards(product, matchingVariant);
    }

    return invoiceToVariant;
  });
  if (isParked) return variantsToInvoice;

  const subtotal = calculateSubtotalTaxExclusive(variantsToInvoice);
  const totalTax = calculateTotalTax(variantsToInvoice);
  return variantsToInvoice.map((invoiceVariant) => {
    const generalDiscountRate = calculateDiscountRateForProduct(
      invoiceVariant, subtotal, totalTax, taxation, invoiceDiscountAmount, invoiceDiscountType
    );
    if (generalDiscountRate > 0) {
      const { quantity = 1 } = invoiceVariant;
      const costExclusive = multiply(
        invoiceVariant.costExclusive,
        subtract(1, generalDiscountRate)
      );
      const discount = multiply(
        invoiceVariant.totalExclusive,
        generalDiscountRate
      );
      const totalExclusive = multiply(
        costExclusive,
        invoiceVariant.quantity
      );
      const taxAmount = multiply(
        invoiceVariant.taxAmount,
        subtract(1, generalDiscountRate)
      );
      const costInclusive = add(costExclusive, divide(taxAmount, quantity));
      const totalInclusive = multiply(
        costInclusive,
        invoiceVariant.quantity
      );
      return {
        ...invoiceVariant,
        taxAmount,
        discount,
        discountRate: generalDiscountRate,
        costExclusive,
        costInclusive,
        totalExclusive,
        totalInclusive
      };
    }
    return invoiceVariant;
  });
}

function calculateDiscountRateForProduct(
  variantToInvoice = {}, subtotal = 0, totalTax = 0, taxation = '', invoiceDiscountAmount = 0, invoiceDiscountType = ''
) {
  if (invoiceDiscountAmount > 0) {
    if (taxation === PAYABLE_INVOICE_TAX_TYPE.EXCLUSIVE) {
      if (invoiceDiscountType === DISCOUNT_TYPES.PERCENTAGE) {
        return divide(invoiceDiscountAmount, 100);
      }
      if (invoiceDiscountType === DISCOUNT_TYPES.FIXED) {
        const rate = divide(invoiceDiscountAmount, subtotal);
        return rate;
      }
    } else if (taxation === PAYABLE_INVOICE_TAX_TYPE.INCLUSIVE) {
      if (invoiceDiscountType === DISCOUNT_TYPES.PERCENTAGE) {
        return divide(invoiceDiscountAmount, 100);
      }
      if (invoiceDiscountType === DISCOUNT_TYPES.FIXED) {
        const rate = divide(
          invoiceDiscountAmount,
          add(subtotal, totalTax)
        );
        return rate;
      }
    }
  }
  return 0;
}

function calculateProductCostExclusive(taxation, product, taxRate) {
  return taxation === PAYABLE_INVOICE_TAX_TYPE.EXCLUSIVE ?
    product.price : divide(product.price, add(1 + taxRate));
}

function calculateProductCostInclusive(taxation, product, taxRate) {
  return taxation === PAYABLE_INVOICE_TAX_TYPE.EXCLUSIVE ?
    multiply(product.price, add(1, taxRate)) : product.price;
}

function calculateProductTotalExclusive(taxation, product, taxRate, discountRate = 0) {
  const costExclusive = calculateProductCostExclusive(taxation, product, taxRate);
  return multiply(subtract(1, discountRate), multiply(product.quantity, costExclusive));
}

function calculateProductTotalInclusive(taxation, product, taxRate, discountRate) {
  const costInclusive = calculateProductCostInclusive(taxation, product, taxRate);
  return multiply(subtract(1, discountRate), multiply(product.quantity, costInclusive));
}

module.exports.mapToSalePosInvoicePayments = (payments, customer, payableInvoiceId) => payments.map((payment) => {
  let paymentProcess;
  if (payment.PaymentMethod.type === PAYMENTS_TYPES.CARD) {
    paymentProcess = mapToPaymentProcess(payment);
  }
  return {
    PaymentProcess: paymentProcess,
    paidAmount: payment.amount,
    paymentMethod: payment.PaymentMethod.name,
    paymentMethodId: payment.PaymentMethod.id,
    customerId: customer ? customer.id : undefined,
    customerName: customer ? customer.name : undefined,
    PaymentToPayableInvoices: { payableInvoiceId },
    ...(payment.paymentNumber ? { paymentNumber: payment.paymentNumber } : {}),
    ...(payment.displayPaymentNumber ? { displayPaymentNumber: payment.displayPaymentNumber } : {})
  };
});

function mapToPaymentProcess(cardPayment) {
  if (cardPayment.surePayResponse) {
    const success = cardPayment.surePayResponse.charAt(1) === '0';
    const [,,,,,, reference] = cardPayment.surePayResponse.split('|');
    const processorResponse = cardPayment.surePayResponse;
    const processor = PAYMENT_PROCESSOR.SURE_PAY;
    return {
      reference,
      response: processorResponse,
      processor,
      success
    };
  }
  return undefined;
}

module.exports.mapToPaymentProcess = mapToPaymentProcess;

function mapToCompositeVariantToInvoiceParts(children = []) {
  const result = [];
  children.forEach((child) => {
    child.VariantToComposites.forEach((variantToComposite) => {
      result.push({
        sku: child.sku,
        rate: variantToComposite.rate,
        name: child.name,
        productVariantId: child.id,
        type: child.type,
        availableLocationQuantity: getAvailableLocationQuantity(child),
      });
    });
  });
  return result;
}

function mapToVariantToInvoicePacks(children = []) {
  const result = [];
  children.forEach((child) => {
    child.VariantToPackages.forEach((variantToPackage) => {
      result.push({
        rate: variantToPackage.rate,
        sku: child.sku,
        name: child.name,
        productVariantId: child.id,
        availableLocationQuantity: getAvailableLocationQuantity(child),
        parentSku: variantToPackage.parentSku || null,
      });
    });
  });
  return result;
}

function mapToVariantToInvoiceTrackingSerials(variantToTracks = [], invoiceProductSerials = [], stock) {
  return invoiceProductSerials.map((productSerial) => {
    const matchingTrackingSerial = variantToTracks
      .find((tracks) => tracks.trackNo === productSerial);
    const {
      id: variantToTrackId, issueDate, expiryDate
    } = matchingTrackingSerial || {};
    return {
      trackNo: productSerial,
      quantity: 1,
      variantToTrackId,
      issueDate,
      expiryDate,
      trackType: VARIANT_TRACK_TYPES.SERIAL,
      productVariantToStockLocationId: stock.id // only user in create.
    };
  });
}

function mapToVariantToInvoiceTrackingBatches(variantToTracks = [], invoiceProductBatches = [], stock) {
  return invoiceProductBatches.map(({ trackNo, quantity }) => {
    const matchingTrackingBatch = variantToTracks
      .find((track) => track.trackNo === `${trackNo}`);
    const {
      id: variantToTrackId, issueDate, expiryDate
    } = matchingTrackingBatch || {};
    return {
      trackNo,
      quantity,
      variantToTrackId,
      issueDate,
      expiryDate,
      trackType: VARIANT_TRACK_TYPES.BATCH,
      productVariantToStockLocationId: stock.id
    };
  });
}

function mapToWeightedVariantToInvoice(unit) {
  return { unit };
}

function mapExtrasToVariantToInvoiceExtras(extras = [], variantExtraLocations = [], taxation, parentTaxId, taxes = [], quantity) {
  return extras.map((extra) => {
    const matchingVariantExtraLocation = variantExtraLocations
      .find((extraLocation) => extraLocation.extraId === extra.id);
    const {
      Extra: {
        rate, productVariantId, name, ProductVariant: extraVariant
      }
    } = matchingVariantExtraLocation;
    const taxId = parentTaxId;
    let availableLocationQuantity;
    let sku;
    if (extraVariant) {
      sku = extraVariant.sku;
      const [extraStock] = extraVariant.ProductVariantToStockLocations;
      availableLocationQuantity = extraStock.quantity;
    }
    const tax = taxes.find((t) => t.id === taxId);
    const taxRate = divide(tax.rate, 100);
    const { price } = extra;
    const exclusivePrice = getExclusiveExtraPrice(taxation, price, taxRate);
    const taxAmount = multiply(exclusivePrice, taxRate);
    return {
      sku,
      price: exclusivePrice,
      extraId: extra.id,
      availableLocationQuantity,
      quantity: multiply(quantity, extra.quantity),
      taxAmount,
      taxJson: JSON.stringify(tax),
      rate,
      name,
      productVariantId
    };
  });
}

function getExclusiveExtraPrice(taxation, price, taxRate) {
  if (taxation === PAYABLE_INVOICE_TAX_TYPE.EXCLUSIVE) {
    return price;
  }
  return divide(price, add(1, taxRate));
}

function mapPackTracks(product, matchingVariant) {
  let variantToInvoiceTracks = null;
  if (product.childrens) {
    product.childrens = product.childrens.filter((c) => c.batches || c.serials);

    variantToInvoiceTracks = [];

    product.childrens.forEach((c) => {
      const matchingChildVariant = matchingVariant.children.find((v) => v.sku === c.sku);
      const [matchingChildStock] = matchingChildVariant.ProductVariantToStockLocations;

      const [pack] = matchingChildVariant.VariantToPackages;

      if (matchingChildVariant.trackType === VARIANT_TRACK_TYPES.BATCH) {
        let quantity = multiply(product.quantity, pack.rate);

        c.batches.forEach((b) => {
          const trackInfo = matchingChildStock.VariantToTracks.find((d) => d.trackNo === b.trackNo);
          b.quantity = trackInfo.quantity > quantity ? quantity : trackInfo.quantity;
          quantity = subtract(quantity, b.quantity);
        });

        variantToInvoiceTracks = variantToInvoiceTracks.concat(mapToVariantToInvoiceTrackingBatches(matchingChildStock.VariantToTracks, c.batches, matchingChildStock));
      } else if (matchingChildVariant.trackType === VARIANT_TRACK_TYPES.SERIAL) variantToInvoiceTracks = variantToInvoiceTracks.concat(mapToVariantToInvoiceTrackingSerials(matchingChildStock.VariantToTracks, c.serials, matchingChildStock));
    });
  }

  return variantToInvoiceTracks;
}

const mapEcardsToInvoiceEcards = (invoiceVariant, variant) => {
  const ecards = [];

  invoiceVariant.ecards.forEach((e) => {
    const matchedEcard = variant.Ecards.find((ec) => ec.code === e);
    ecards.push({ code: matchedEcard.code, ecardId: matchedEcard.id });
  });

  return ecards;
};

const calculatePromotionDiscounts = (matchingVariant, product, originalPriceEx) => {
  let percentagePromotionDiscount = 0;
  let fixedPromotionDiscount = 0;
  if (matchingVariant) {
    matchingVariant.PromotionVariants.map((promotionVariant) => {
      if (promotionVariant.Promotion) {
        if (promotionVariant.Promotion.discountType === 'percentage') {
          const discountRate = divide(promotionVariant.Promotion.amount, 100) || 0;
          percentagePromotionDiscount += multiply(discountRate, multiply(product.quantity, originalPriceEx));
        }
        if (promotionVariant.Promotion.discountType === 'fixed') {
          fixedPromotionDiscount += multiply(product.quantity, promotionVariant.Promotion.amount);
        }
      }
    });
  }
  return add(percentagePromotionDiscount, fixedPromotionDiscount);
};

function calculateSubtotalTaxExclusive(variantToInvoices = []) {
  const subtotalWithoutExtras = variantToInvoices
    .reduce((tax, variant) => add(tax, variant.totalExclusive), 0);
  return add(subtotalWithoutExtras, calculateExtrasExclusivePrice(variantToInvoices));
}

function calculateTotalTax(variantToInvoices = []) {
  const totalTaxWithoutExtras = variantToInvoices
    .reduce((tax, variant) => add(tax, variant.taxAmount), 0);
  return add(totalTaxWithoutExtras, calculateExtrasTotalTaxes(variantToInvoices));
}
