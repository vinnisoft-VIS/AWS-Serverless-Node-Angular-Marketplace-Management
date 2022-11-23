const { PAYABLE_INVOICE_TAX_TYPE } = require('../../../../invoice/utils/constants');
const { mapTaxRate } = require('../../../../variant/utils/variant_tax_calculation_utility');
const CalculationUtility = require('../../../../utils/calculation_utilities');

module.exports.adjustPriceAndTaxWithVariant = (v, taxConfiguration, coumpoundTaxLines) => {
  if (!v) return v;

  // simple mapping
  if (v.ProductVariantToStockLocations) {
    v.ProductVariantToStockLocations = this.adjustStockLocationPriceWithTax(v.ProductVariantToStockLocations, taxConfiguration, coumpoundTaxLines);
  }

  // composite mapping
  if (v.Product && v.Product.VariantToComposites) {
    v.VariantToComposites = v.Product.VariantToComposites.map((vtc) => ({ ...vtc, ProductVariant: this.adjustPriceAndTaxWithVariant(vtc.ProductVariant, taxConfiguration, coumpoundTaxLines) }));
  }

  // extra mapping
  if (v.VariantExtraLocations) {
    v.VariantExtraLocations = this.adjustExtraStockLocationPriceWithTax(v, taxConfiguration, coumpoundTaxLines);
  }

  return v;
};

module.exports.adjustStockLocationPriceWithTax = (stockLocations, taxConfiguration, coumpoundTaxLines) => stockLocations.map((sl) => {
  sl.Tax = mapTaxRate(sl.Tax, coumpoundTaxLines);
  const { rate } = sl.Tax || {};
  return ({
    ...sl,
    retailPrice: taxConfiguration.sellTaxation === PAYABLE_INVOICE_TAX_TYPE.INCLUSIVE ?
      CalculationUtility.roundTo2Decimals(CalculationUtility.multiply(sl.retailPrice,
        CalculationUtility.add(1,
          CalculationUtility.divide(rate || 0, 100)))) : sl.retailPrice
  });
});

module.exports.adjustExtraStockLocationPriceWithTax = (variant, taxConfiguration, coumpoundTaxLines) => {
  const [stock] = variant.ProductVariantToStockLocations;
  return variant.VariantExtraLocations.map((sl) => {
    if (sl.Extra.ProductVariant) {
      sl.Extra.ProductVariant.ProductVariantToStockLocations = this.adjustStockLocationPriceWithTax(
        sl.Extra.ProductVariant.ProductVariantToStockLocations, taxConfiguration, coumpoundTaxLines
      );
    }

    sl.Tax = mapTaxRate(stock.Tax, coumpoundTaxLines);
    return ({
      ...sl,
      price:
            taxConfiguration.sellTaxation === PAYABLE_INVOICE_TAX_TYPE.INCLUSIVE ?
              CalculationUtility.multiply(sl.price,
                CalculationUtility.add(1,
                  CalculationUtility.divide(sl.Tax.rate, 100))) : sl.price
    });
  });
};
