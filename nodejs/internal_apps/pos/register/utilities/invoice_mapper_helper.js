const { PAYABLE_INVOICE_TAX_TYPE } = require('../../../../invoice/utils/constants');
const { add, multiply, divide } = require('../../../../utils/calculation_utilities');
const { VARIANT_TYPES } = require('../../../../utils/constants/constants');

module.exports.calculateExtrasExclusivePrice = (variantsToInvoice = []) => {
  let totalExtraPrice = 0;
  variantsToInvoice.forEach((variantToInvoice) => {
    const { VariantToInvoiceExtras: variantToInvoiceExtras = [] } = variantToInvoice;
    variantToInvoiceExtras.forEach((invoiceExtra) => {
      totalExtraPrice = add(totalExtraPrice, multiply(invoiceExtra.quantity, invoiceExtra.price));
    });
  });
  return totalExtraPrice;
};

module.exports.calculateExtrasTotalTaxes = (variantsToInvoice = []) => {
  let totalExtrasTaxes = 0;
  variantsToInvoice.forEach((variantToInvoice) => {
    const { VariantToInvoiceExtras: variantToInvoiceExtras = [] } = variantToInvoice;
    variantToInvoiceExtras.forEach((invoiceExtra) => {
      totalExtrasTaxes = add(totalExtrasTaxes, multiply(invoiceExtra.quantity, invoiceExtra.taxAmount));
    });
  });
  return totalExtrasTaxes;
};

module.exports.calculateCompositePrice = (variant, prop = 'retailPrice') => variant.children.reduce((price, c) => {
  const [child] = c.VariantToComposites;
  return add(price, multiply(
    child.rate || 1, this.calculateVariantPrice(c, prop)
  ));
}, 0);

// module.exports.calculatePackagePrice = (variant, prop = 'retailPrice') => {
//   return variant.children.reduce((price, c) => {
//     const [child] = c.VariantToPackages;
//     return add(price, multiply(
//          child.rate || 1, this.calculateVariantPrice(c, prop)
//         ));
//   }, 0);
// }

module.exports.calculateVariantPrice = (variant, prop = 'retailPrice') => {
  if (variant.type === VARIANT_TYPES.COMPOSITE) return this.calculateCompositePrice(variant, prop);

  // if(variant.type === VARIANT_TYPES.PACKAGE)
  //   return this.calculatePackagePrice(variant, prop);

  const [stock] = variant.ProductVariantToStockLocations;
  return stock[prop];
};

module.exports.getTaxConfig = (priceConfiguration, prop = 'retailPrice') => (prop === 'cost' ? (priceConfiguration.costTaxation || priceConfiguration.costTaxStatus) : (priceConfiguration.sellTaxation || priceConfiguration.sellTaxStatus));

module.exports.calculateExclusivePrice = (variant, priceConfiguration, prop = 'retailPrice') => {
  const price = this.calculateVariantPrice(variant, prop);

  return this.calculateExclusive(price, variant, priceConfiguration, prop);
};

module.exports.calculateExclusive = (price, variant, priceConfiguration, prop = 'retailPrice') => {
  const [stock] = variant.ProductVariantToStockLocations;
  return this.getTaxConfig(priceConfiguration, prop) === PAYABLE_INVOICE_TAX_TYPE.INCLUSIVE ? divide(price, add(1, divide(stock.Tax.rate, 100))) : price;
};
