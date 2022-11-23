const { PRODUCT_TYPES } = require('../../../../utils/constants/constants');
const { PAYABLE_INVOICE_PAYMENT_METHODS } = require('../../../../invoice/utils/constants');
const PosInvoiceValidation = require('./pos_invoice_validation');
const { add, subtract } = require('../../../../utils/calculation_utilities');

module.exports.validateReturnPosInvoice = (
  clientReturnInvoice, sellInvoice, mappedRtnInvoice,
  variants, register, stockLocation,
  user, customer, schemaName
) => {
  PosInvoiceValidation.validatePosInvoice(register, clientReturnInvoice, variants, stockLocation, user, customer, schemaName, sellInvoice.id);
  clientReturnInvoice.products.forEach((product) => {
    // const matchingVariant = variants.find((variant) => variant.sku === product.sku);
    const invoiceVariant = sellInvoice.VariantToInvoices.find((sv) => sv.sku === product.sku);
    if (product.ecards && invoiceVariant.VariantToInvoiceEcards && invoiceVariant.VariantToInvoiceEcards.length > 0) {
      const notValidEcard = product.ecards.find((e) => !invoiceVariant.VariantToInvoiceEcards.find((ec) => ec.code === e));

      if (notValidEcard) {
        throw new Error(`product with sku: ${product.sku} has invalid ecard to return`);
      }
    }
    // if (!matchingVariant) {
    //   throw new Error(`product with sku: ${product.sku} is not found`);
    // }
  });

  const debitPayment = clientReturnInvoice.payments.find((p) => p.type === PAYABLE_INVOICE_PAYMENT_METHODS.DEBIT_CARD);
  if (debitPayment && Math.abs(debitPayment.amount) > customer.debitAmount) {
    throw new Error(`You can only return in Debit amount <= customer debit value.`);
  }

  let totalPaid = 0;
  clientReturnInvoice.payments.forEach((payment) => {
    totalPaid = add(totalPaid, payment.amount);
  });

  // EX: inv.total = -10 &&  paid = -11, so customer takes more than real value
  if (subtract(mappedRtnInvoice.totalTaxInclusive, totalPaid) >= 0.01) {
    throw new Error(`you are required to return the invoice total only.`);
  }

  // EX: inv.total = -10 &&  paid = -9, so customer still need 1
  if (!mappedRtnInvoice.customerId && subtract(totalPaid, mappedRtnInvoice.totalTaxInclusive) >= 0.01) {
    throw new Error(`you are required to return the full value to the customer.`);
  }

  mappedRtnInvoice.VariantToInvoices.forEach((rvToInvoice) => {
    const svToInvoice = sellInvoice.VariantToInvoices.find((sToInvoice) => sToInvoice.id === rvToInvoice.sellVariantId);
    const variant = variants.find((v) => v.sku === rvToInvoice.sku);
    if (!svToInvoice) {
      throw new Error(`Product ${rvToInvoice.name} isn't in sell invoice to return it`);
    }

    if (variant && variant.trackType && rvToInvoice.VariantToInvoiceTracks.length === 0 && add(svToInvoice.quantity, rvToInvoice.quantity) < 0) {
      throw new Error(`product '${rvToInvoice.name}' with sku: '${rvToInvoice.sku}' is more than the sold quantity.`);
    }

    if (variant && variant.Product.type === PRODUCT_TYPES.ECARD && rvToInvoice.VariantToInvoiceTracks.length === 0 && add(svToInvoice.quantity, rvToInvoice.quantity) < 0) {
      throw new Error(`product '${rvToInvoice.name}' with sku: '${rvToInvoice.sku}' is more than the sold quantity.`);
    }

    validateTrackedVariant(rvToInvoice, svToInvoice);
  });
};

function validateTrackedVariant(returnVariantToInvoice, soldVariantToInvoice) {
  returnVariantToInvoice.VariantToInvoiceTracks.forEach((rVariantToInvTrack) => {
    const soldTrack = soldVariantToInvoice.VariantToInvoiceTracks.find(
      (sVariantToInvTrack) => rVariantToInvTrack.trackNo === sVariantToInvTrack.trackNo
    );
    if (!soldTrack) {
      throw new Error(`Product ${returnVariantToInvoice.name} with track number ${rVariantToInvTrack.trackNo} isn't in sell invoice to return it`);
    }

    if (add(soldTrack.quantity, rVariantToInvTrack.quantity) < 0) {
      throw new Error(`Product ${returnVariantToInvoice.name} with track number ${rVariantToInvTrack.trackNo} is more than the sold quantity.`);
    }

    if (rVariantToInvTrack.quantity > 0) {
      throw new Error(`Product ${returnVariantToInvoice.name} with track number ${rVariantToInvTrack.trackNo} has wrong returned quantity.`);
    }
  });
}
