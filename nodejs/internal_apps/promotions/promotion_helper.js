const locationQuery = (p, locationId) => (p.isAllLocations
  || p.PromotionStockLocations.find((psl) => psl.stockLocationId === +locationId));

module.exports.mapPromotionsToVariants = (variants, promotions, locationId) => variants.map((v) => {
  v.promotion = module.exports.mapPromotionsToVariant(v, promotions, locationId);
  return v;
});

module.exports.mapPromotionsToVariantsAllLocations = (variants = [], promotions = []) => variants.map((v) => {
  const stocks = v.ProductVariantToStockLocations || [];
  const stockLocationsIds = stocks.map((stock) => stock.stockLocationId);
  const promos = [];
  stockLocationsIds.forEach((stockLocationsId) => {
    const promotion = module.exports.mapPromotionsToVariant(v, promotions, stockLocationsId);
    if (promotion && !promos.find((p) => p.id === promotion.id)) {
      promos.push(promotion);
    }
  });
  v.promotions = promos;
  return v;
});

module.exports.mapPromotionsToVariant = (variant, promotions = [], locationId) => {
  const locationPromotions = promotions.filter((p) => locationQuery(p, locationId));
  const matchingPromotion = locationPromotions.find((p) => p.PromotionVariants
    .find((pv) => pv.productVariantId === variant.id));
  if (matchingPromotion) {
    return matchingPromotion;
  }
  return locationPromotions.find((p) => p.isAllProducts);
};
