const CustomerService = require('../../../customers/customers_service');
const InvoiceKinesisMapper = require('../../../invoice/utils/invoice_kinesis_mapper');
const { BaseModel } = require('../../../utils/base-model');
const {
  subtract, multiply, add, roundTo2Decimals
} = require('../../../utils/calculation_utilities');
const { VARIANT_TYPES } = require('../../../utils/constants/constants');
const { STREAM: { INVOICES_NOTIFICATIONS } } = require('../../../utils/constants/kinesis');
const KinesisUtility = require('../../../utils/kinesis_utility');
const InvoiceDAL = require('../invoices/dal/invoice_dal');
const { calculateVariantPrice, calculateExclusivePrice } = require('./utilities/invoice_mapper_helper');
const TaxService = require('../../../tax/tax_service');

module.exports.updateCustomerPayment = async (customer, payableInvoice, clientDB, transaction) => {
  if (customer) {
    const { paidAmount } = payableInvoice || {};
    let { debitAmount } = payableInvoice || {};
    debitAmount = roundTo2Decimals(debitAmount);
    const updatedCustomer = {
      totalPaid: add(customer.totalPaid, paidAmount)
    };
    if (debitAmount >= 0.01 || debitAmount <= 0.01) {
      updatedCustomer.debitAmount = add(customer.debitAmount, debitAmount);
    }
    await CustomerService.editCustomer(customer.id, updatedCustomer, clientDB, transaction);
  }
};

module.exports.sendInvoiceNotification = async (createdInvoice, customer, stockLocation, payments, schemaName) => {
  const invoiceEvent = InvoiceKinesisMapper.mapToKinesisPlatformPOSSalesInvoice(
    createdInvoice, customer, stockLocation, payments, schemaName
  );
  console.log(`POS invoice to be sent --- ${JSON.stringify(invoiceEvent)}`);
  await KinesisUtility.sendMessage(INVOICES_NOTIFICATIONS, schemaName, invoiceEvent);
};

module.exports.getStockNotificationEvent = (mappedInvoice, stockLocation, schemaName) => {
  const stockUpdates = [];
  mappedInvoice.VariantToInvoices
    .filter((invoiceVariant) => !(invoiceVariant.VariantToInvoiceEcards && invoiceVariant.VariantToInvoiceEcards.length > 0))
    .forEach((invoiceVariant) => {
      const { productVariantId: id, sku } = invoiceVariant;
      const quantity = subtract(invoiceVariant.availableLocationQuantity, invoiceVariant.quantity);
      stockUpdates.push({ id, sku, availableStock: quantity });
      if (!!invoiceVariant.type && invoiceVariant.type !== VARIANT_TYPES.CHILD) {
        if (invoiceVariant.type === VARIANT_TYPES.PACKAGE || invoiceVariant.type === VARIANT_TYPES.COMPOSITE) {
          const { VariantToInvoicePacks: children, CompositeVariantToInvoiceParts: compositeChildren } = invoiceVariant;
          children.forEach((packageInvoiceChild) => {
            const compositeChild = packageInvoiceChild.parentSku ? compositeChildren.find((cc) => cc.sku === packageInvoiceChild.parentSku) : undefined;
            const { productVariantId: childId, sku: childSku } = packageInvoiceChild;
            const quantityReduction = multiply(invoiceVariant.quantity, multiply(packageInvoiceChild.rate, compositeChild ? compositeChild.rate : 1));
            const childQuantity = subtract(packageInvoiceChild.availableLocationQuantity, quantityReduction);
            stockUpdates.push({ id: childId, sku: childSku, availableStock: childQuantity });
          });
        }
        if (invoiceVariant.type === VARIANT_TYPES.COMPOSITE) {
          const { CompositeVariantToInvoiceParts: children } = invoiceVariant;
          children.forEach((compositeInvoiceChild) => {
            if (compositeInvoiceChild.type === VARIANT_TYPES.CHILD) {
              const { productVariantId: childId, sku: childSku } = compositeInvoiceChild;
              const quantityReduction = multiply(invoiceVariant.quantity, compositeInvoiceChild.rate);
              const childQuantity = subtract(compositeInvoiceChild.availableLocationQuantity, quantityReduction);
              stockUpdates.push({ id: childId, sku: childSku, availableStock: childQuantity });
            }
          });
        }
      }
      const { VariantToInvoiceExtras: variantToInvoiceExtras = [] } = invoiceVariant;
      if (variantToInvoiceExtras.length > 0) {
        variantToInvoiceExtras.forEach((invoiceExtra) => {
          if (invoiceExtra.productVariantId) {
            const {
              productVariantId,
              sku: extraSku,
              availableLocationQuantity,
              quantity: extraOrderedQuantity,
              rate
            } = invoiceExtra;
            const quantityReduction = multiply(extraOrderedQuantity, rate);
            const extraQuantity = subtract(availableLocationQuantity, quantityReduction);
            stockUpdates.push({ id: productVariantId, sku: extraSku, availableStock: extraQuantity });
          }
        });
      }
    });
  return {
    stockUpdates,
    stockLocation,
    schemaName
  };
};

module.exports.findVariantInArray = (variantId, variants) => variants.find((v) => v.id === variantId);

module.exports.shouldManageStockLevel = (variant) => variant && variant.manageStockLevel !== false;

module.exports.deleteInvoiceProducts = async (invoiceId, clientDB, transaction) => {
  const {
    VariantToInvoiceExtra, VariantToInvoicePack, CompositeVariantToInvoicePart, VariantToInvoiceTrack, WeightedVariantToInvoice
  } = clientDB || {};
  const variantToInvoices = await InvoiceDAL.getInvoiceProducts(invoiceId, clientDB, transaction);

  const models = [VariantToInvoicePack, VariantToInvoiceExtra, CompositeVariantToInvoicePart, VariantToInvoiceTrack, WeightedVariantToInvoice];

  variantToInvoices.forEach((variant) => {
    // delete all tracked related records
    models.forEach(async (model) => {
      await InvoiceDAL.deleteChildProducts(model, variant.id, transaction);
    });
  });
};

module.exports.updatePlatformPOSInvoice = async (invoiceId, mappedInvoice, clientDB, transaction) => {
  await this.deleteInvoiceProducts(invoiceId, clientDB, transaction);
  await BaseModel.delete(clientDB.VariantToInvoice, { invoiceId }, transaction);
  await BaseModel.delete(clientDB.PayableInvoice, { invoiceId }, transaction);
  return InvoiceDAL.updatePlatformPOSInvoice(invoiceId, mappedInvoice, clientDB, transaction);
};

module.exports.getSkusFromInvoice = (invoice) => {
  let skus = [];

  invoice.VariantToInvoices.forEach((v) => {
    skus.push(v.sku);

    if (v.VariantToInvoicePacks) {
      skus = skus.concat(v.VariantToInvoicePacks.map((p) => p.sku));
    }

    if (v.VariantToInvoiceExtras) {
      skus = skus.concat(v.VariantToInvoiceExtras.map((e) => e.sku));
    }

    if (v.CompositeVariantToInvoiceParts) {
      skus = skus.concat(v.CompositeVariantToInvoiceParts.map((e) => e.sku));
    }
  });

  return [...new Set(skus.filter((s) => s))];
};

module.exports.addCostsToVariantToInvoices = (variantToInvoices = [], variants = [], taxConfiguration) => {
  const mappedVariantToInvoices = variantToInvoices.map((variantToInvoice) => {
    const { productVariantId } = variantToInvoice;
    const variant = variants.find((v) => v.id === productVariantId);
    let cost;
    if (variantToInvoice.packCost) {
      cost = variantToInvoice.packCost;
    } else {
      cost = calculateVariantPrice(variant, 'cost');
    }

    if (variantToInvoice.VariantToInvoiceExtras) {
      variantToInvoice.VariantToInvoiceExtras.forEach((ex) => {
        const exLocation = ex.productVariantId ? variant.VariantExtraLocations.find((v) => v.Extra.productVariantId === ex.productVariantId) : null;
        ex.cost = exLocation && exLocation.Extra.hasOtherProduct ? calculateExclusivePrice(exLocation.Extra.ProductVariant, taxConfiguration, 'cost') : 0;
      });
    }

    return { ...variantToInvoice, oldCost: cost, newCost: cost };
  });

  return mappedVariantToInvoices;
};

module.exports.getTaxesForSale = async (variants, clientDB, transaction) => {
  const taxIds = this.getAllTaxIdsFromVariants(variants);
  return TaxService.getTaxesByIds(taxIds, clientDB, transaction);
};

module.exports.getAllTaxIdsFromVariants = (variants) => {
  const taxIds = [];

  variants.forEach((v) => {
    const [stock] = v.ProductVariantToStockLocations;
    taxIds.push(stock.taxId);

    if (v.VariantExtraLocations) {
      v.VariantExtraLocations.forEach((el) => {
        if (el.Extra.hasOtherProduct && el.Extra.ProductVariant) {
          const [extraStock] = el.Extra.ProductVariant.ProductVariantToStockLocations;
          taxIds.push(extraStock.taxId);
        }
      });
    }
  });

  return [...new Set(taxIds)];
};
