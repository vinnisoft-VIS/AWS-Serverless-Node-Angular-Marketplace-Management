const {
  INVOICE_STATUS, INVOICES_TYPES, PAYMENT_OPTIONS, PAYABLE_INVOICE_PAYMENT_STATUSES, PAYABLE_INVOICE_PAYMENT_METHODS
} = require('../../../../invoice/utils/constants');
const {
  add, multiply, divide, subtract
} = require('../../../../utils/calculation_utilities');
const { VARIANT_TYPES, VARIANT_TRACK_TYPES, PRODUCT_TYPES } = require('../../../../utils/constants/constants');
const { calculateExtrasExclusivePrice, calculateExtrasTotalTaxes } = require('./invoice_mapper_helper');

module.exports.mapToPosReturnInvoice = (returnInvoice, sellInvoice, invoiceProductsVariants, customer, stockLocation, register, weightUnit, posSettings) => {
  const variantsToInvoice = mapVariantToInvoicesForReturnPos(returnInvoice.products, sellInvoice, invoiceProductsVariants, weightUnit);
  let subTotalTaxExclusive = 0;
  let totalTax = 0;
  variantsToInvoice.forEach((variant) => {
    subTotalTaxExclusive = add(subTotalTaxExclusive, variant.totalExclusive);
    totalTax = add(totalTax, variant.taxAmount);
  });
  const extrasExclusiveTotalPrice = calculateExtrasExclusivePrice(variantsToInvoice);
  subTotalTaxExclusive = add(subTotalTaxExclusive, extrasExclusiveTotalPrice);
  totalTax = add(totalTax, calculateExtrasTotalTaxes(variantsToInvoice));
  const totalTaxInclusive = add(subTotalTaxExclusive, totalTax);
  const { payments } = returnInvoice;
  const paidAmount = payments.reduce((amount, payment) => add(amount, payment.amount), 0);
  const paymentMethodsString = payments.map((p) => (p.type === PAYABLE_INVOICE_PAYMENT_METHODS.DEBIT_CARD ? 'Debit' : p.PaymentMethod.name)).join(', ');
  const paymentMethodId = payments.length === 1 && payments[0].PaymentMethod ? payments[0].PaymentMethod.id : undefined;
  const registerJson = JSON.stringify({ name: register.name, StockLocation: stockLocation });

  return {
    saleInvoiceId: sellInvoice.id,
    status: INVOICE_STATUS.COMPLETED,
    type: INVOICES_TYPES.POS_RETURN,
    companyName: sellInvoice.companyName,
    taxNumber: sellInvoice.taxNumber,
    userId: returnInvoice.userId,
    notes: returnInvoice.notes,
    customerName: customer ? customer.name : undefined,
    customerId: customer ? customer.id : undefined,
    subTotalTaxExclusive,
    totalTax,
    totalTaxInclusive,
    registerId: register.id,
    registerJson,
    stockLocationName: stockLocation.name,
    stockLocationId: stockLocation.id,
    supplyDate: returnInvoice.supplyDate,
    settings: JSON.stringify(posSettings.map((s) => s.toJSON())),
    PayableInvoice: {
      taxation: sellInvoice.PayableInvoice.taxation,
      paymentOption: PAYMENT_OPTIONS.PAY_NOW,
      totalBeforePayment: totalTaxInclusive,
      paidAmount,
      discountAmount: sellInvoice.PayableInvoice.discountAmount,
      discountType: sellInvoice.PayableInvoice.discountType,
      restForCustomer: 0,
      paymentStatus: PAYABLE_INVOICE_PAYMENT_STATUSES.PAID,
      paymentMethod: paymentMethodsString,
      paymentMethodId
    },
    VariantToInvoices: variantsToInvoice,
    completeDate: Date.now()
  };
};

function mapVariantToInvoicesForReturnPos(returnInvoiceProducts, sellInvoice, invoiceProdutcsVariants, weightUnit) {
  return returnInvoiceProducts.map((product) => {
    const saleVariantToInvoice = sellInvoice.VariantToInvoices.find((variantToInv) => variantToInv.id === product.sellVariantId);
    const matchingVariant = invoiceProdutcsVariants.find((variant) => variant.id === saleVariantToInvoice.productVariantId);
    const [stock] = matchingVariant ? matchingVariant.ProductVariantToStockLocations : [];
    const discount = multiply(product.quantity, divide(saleVariantToInvoice.discount, saleVariantToInvoice.quantity));
    const totalExclusive = multiply(product.quantity, divide(saleVariantToInvoice.totalExclusive, saleVariantToInvoice.quantity));
    const totalInclusive = multiply(product.quantity, divide(saleVariantToInvoice.totalInclusive, saleVariantToInvoice.quantity));
    const taxAmount = subtract(totalInclusive, totalExclusive);
    const invoiceToVariant = {
      sellVariantId: product.sellVariantId,
      sku: product.sku,
      name: product.name,
      quantity: product.quantity,
      availableLocationQuantity: matchingVariant && matchingVariant.Product.type === PRODUCT_TYPES.ECARD ? matchingVariant.Ecards.length : (stock ? stock.quantity : 0),
      costExclusive: saleVariantToInvoice.costExclusive,
      costInclusive: saleVariantToInvoice.costInclusive,
      oldCost: saleVariantToInvoice.oldCost,
      newCost: saleVariantToInvoice.newCost,
      totalInclusive,
      totalExclusive,
      discount,
      taxAmount,
      productVariantId: saleVariantToInvoice.productVariantId,
      taxId: saleVariantToInvoice.taxId,
      taxJson: saleVariantToInvoice.taxJson,
      type: saleVariantToInvoice.type,
      VariantToInvoiceTracks: [],
      CompositeVariantToInvoiceParts: [],
      VariantToInvoicePacks: [],
      VariantToInvoiceExtras: []
    };

    if (invoiceToVariant.type === VARIANT_TYPES.COMPOSITE) {
      invoiceToVariant.CompositeVariantToInvoiceParts = mapToCompositePartsFromSaleVariant(
        saleVariantToInvoice, invoiceProdutcsVariants
      );
      invoiceToVariant.VariantToInvoicePacks = (invoiceToVariant.VariantToInvoicePacks || []).concat(mapToPacksFromSaleVariant(
        saleVariantToInvoice, invoiceProdutcsVariants
      ));
    }

    if (matchingVariant && matchingVariant.type === VARIANT_TYPES.PACKAGE) {
      invoiceToVariant.VariantToInvoiceTracks = mapPackTracks(product, saleVariantToInvoice, invoiceProdutcsVariants);
      invoiceToVariant.VariantToInvoicePacks = (invoiceToVariant.VariantToInvoicePacks || []).concat(mapToPacksFromSaleVariant(
        saleVariantToInvoice, invoiceProdutcsVariants
      ));
    }

    if (saleVariantToInvoice.VariantToInvoiceExtras.length > 0) {
      invoiceToVariant.VariantToInvoiceExtras = mapToExtraFromSaleVariant(
        product.quantity, saleVariantToInvoice, invoiceProdutcsVariants
      );
    }

    if (matchingVariant && matchingVariant.trackType === VARIANT_TRACK_TYPES.SERIAL) {
      invoiceToVariant.VariantToInvoiceTracks = mapToSerialsFromSaleVariant(
        product.selectedSerials, saleVariantToInvoice, stock
      );
    }

    if (matchingVariant && matchingVariant.trackType === VARIANT_TRACK_TYPES.BATCH) {
      invoiceToVariant.VariantToInvoiceTracks = mapToBatchesFromSaleVariant(
        product.selectedBatches, saleVariantToInvoice, stock
      );
    }

    if (matchingVariant && matchingVariant.isWeightedScale) {
      invoiceToVariant.WeightedVariantToInvoice = { unit: weightUnit };
    }

    if (matchingVariant && matchingVariant.Product.type === PRODUCT_TYPES.ECARD) {
      invoiceToVariant.VariantToInvoiceEcards = mapToEcardsFromSaleVariant(product.ecards, saleVariantToInvoice);
    }

    return invoiceToVariant;
  });
}

function mapToCompositePartsFromSaleVariant(saleVariantToInvoice, invoiceProdutcsVariants) {
  return saleVariantToInvoice.CompositeVariantToInvoiceParts.map((cPart) => {
    const cPartMatchingVariant = invoiceProdutcsVariants
      .find((variant) => variant.id === cPart.productVariantId);
    const [cPartStock] = cPartMatchingVariant.ProductVariantToStockLocations;
    return {
      sku: cPart.sku,
      rate: cPart.rate,
      name: cPart.name,
      productVariantId: cPart.productVariantId,
      availableLocationQuantity: cPartStock ? cPartStock.quantity : 0,
      type: cPart.type,
    };
  });
}

function mapToPacksFromSaleVariant(saleVariantToInvoice, invoiceProdutcsVariants) {
  return (saleVariantToInvoice.VariantToInvoicePacks || []).map((pack) => {
    const packMatchingVariant = invoiceProdutcsVariants.find((variant) => variant.id === saleVariantToInvoice.productVariantId);
    const [packStock] = packMatchingVariant.ProductVariantToStockLocations;
    return {
      sku: pack.sku,
      rate: pack.rate,
      name: pack.name,
      productVariantId: pack.productVariantId,
      availableLocationQuantity: packStock ? packStock.quantity : 0,
      parentSku: pack.parentSku,
    };
  });
}

function mapToSerialsFromSaleVariant(selectedSerials, saleVariantToInvoice, stock) {
  const variantToTracks = stock ? stock.VariantToTracks : [];
  return saleVariantToInvoice.VariantToInvoiceTracks
    .filter((track) => selectedSerials.find((trackNo) => trackNo === track.trackNo))
    .map((track) => {
      const matchingTrackingSerial = variantToTracks
        .find((vTrack) => vTrack.trackNo === track.trackNo);
      const { id: variantToTrackId } = matchingTrackingSerial || {};
      return {
        trackNo: track.trackNo,
        quantity: -1,
        variantToTrackId,
        issueDate: track.issueDate,
        expiryDate: track.expiryDate,
        trackType: VARIANT_TRACK_TYPES.SERIAL
      };
    });
}

function mapToBatchesFromSaleVariant(selectedBatches, saleVariantToInvoice, stock) {
  const variantToTracks = stock ? stock.VariantToTracks : [];
  return saleVariantToInvoice.VariantToInvoiceTracks
    .map((track) => {
      const selectedBatch = selectedBatches.find((batch) => batch.trackNo === track.trackNo);
      if (selectedBatch) {
        const matchingTrackingBatch = variantToTracks
          .find((vTrack) => vTrack.trackNo === track.trackNo);
        const { id: variantToTrackId } = matchingTrackingBatch || {};
        return {
          trackNo: track.trackNo,
          quantity: selectedBatch.quantity,
          variantToTrackId,
          issueDate: track.issueDate,
          expiryDate: track.expiryDate,
          trackType: VARIANT_TRACK_TYPES.BATCH
        };
      }
    }).filter((b) => !!b);
}

function mapToExtraFromSaleVariant(returnedQuantity, saleVariantToInvoice, invoiceProdutcsVariants) {
  return saleVariantToInvoice.VariantToInvoiceExtras
    .map((extra) => {
      const extraMatchingVariant = invoiceProdutcsVariants.find((variant) => variant.id === saleVariantToInvoice.productVariantId);
      const [extraStock] = extraMatchingVariant ? extraMatchingVariant.ProductVariantToStockLocations : [];
      return {
        sku: extra.sku,
        cost: extra.cost,
        rate: extra.rate,
        name: extra.name,
        extraId: extra.extraId,
        quantity: returnedQuantity * extra.quantity,
        price: extra.price,
        taxAmount: extra.taxAmount,
        taxJson: extra.taxJson,
        productVariantId: extra.productVariantId,
        availableLocationQuantity: extraStock ? extraStock.quantity : 0
      };
    });
}

module.exports.mapToInvoicePayments = (payments, customer, payableInvoiceId) => payments.map((payment) => ({
  paidAmount: payment.amount,
  paymentMethodId: payment.PaymentMethod ? payment.PaymentMethod.id : undefined,
  paymentMethod: payment.PaymentMethod ? payment.PaymentMethod.name : undefined,
  customerId: customer ? customer.id : undefined,
  customerName: customer ? customer.name : undefined,
  PaymentToPayableInvoices: { payableInvoiceId }
}));

function mapPackTracks(product, matchingVariant, variants) {
  let variantToInvoiceTracks = [];

  if ((product.selectedBatches && product.selectedBatches.length > 0) || (product.selectedSerials && product.selectedSerials.length > 0)) {
    matchingVariant.VariantToInvoicePacks.forEach((child) => {
      const childVariant = variants.find((v) => v.sku === child.sku);

      if (childVariant.trackType) {
        const [stock] = childVariant.ProductVariantToStockLocations;
        const selectedList = product[childVariant.trackType === VARIANT_TRACK_TYPES.BATCH ? 'selectedBatches' : 'selectedSerials'].filter((b) => stock.VariantToTracks.find((bt) => bt.trackNo === b.trackNo || b));

        if (childVariant.trackType === VARIANT_TRACK_TYPES.BATCH) {
          variantToInvoiceTracks = variantToInvoiceTracks.concat(mapToBatchesFromSaleVariant(selectedList, matchingVariant, stock));
        } else if (childVariant.trackType === VARIANT_TRACK_TYPES.SERIAL) {
          variantToInvoiceTracks = variantToInvoiceTracks.concat(mapToSerialsFromSaleVariant(selectedList, matchingVariant, stock));
        }
      }
    });
  }

  return variantToInvoiceTracks;
}

const mapToEcardsFromSaleVariant = (ecards, invoiceVariant) => {
  const variantToInvoiceEcards = [];

  ecards.forEach((e) => {
    const matchedEcard = invoiceVariant.VariantToInvoiceEcards.find((ec) => ec.code === e);
    variantToInvoiceEcards.push({ code: matchedEcard.code, ecardId: matchedEcard.ecardId });
  });

  return variantToInvoiceEcards;
};
